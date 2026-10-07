import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  alternativeContactUpdateMany: vi.fn(),
  auditEventCreate: vi.fn(),
  availabilityRecordUpdateMany: vi.fn(),
  feedScopeDelete: vi.fn(),
  feedScopeFindFirst: vi.fn(),
  feedScopeFindMany: vi.fn(),
  feedScopeUpdate: vi.fn(),
  invalidateFeedCachesForPerson: vi.fn(),
  leaveBalanceDelete: vi.fn(),
  leaveBalanceFindMany: vi.fn(),
  leaveBalanceUpdate: vi.fn(),
  notificationUpdateMany: vi.fn(),
  personCreate: vi.fn(),
  personFindFirst: vi.fn(),
  personFindMany: vi.fn(),
  personUpdate: vi.fn(),
  personUpdateMany: vi.fn(),
  personUpsert: vi.fn(),
  xeroPersonMatchFindFirst: vi.fn(),
  xeroPersonMatchUpdate: vi.fn(),
  xeroPersonMatchUpsert: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@repo/feeds", () => ({
  invalidateFeedCachesForPerson: mocks.invalidateFeedCachesForPerson,
}));
vi.mock("@repo/observability/log", () => ({
  log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

vi.mock("@repo/database", () => {
  const db = {
    $transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) =>
      cb(db)
    ),
    alternativeContact: {
      updateMany: mocks.alternativeContactUpdateMany,
    },
    auditEvent: {
      create: mocks.auditEventCreate,
    },
    availabilityRecord: {
      updateMany: mocks.availabilityRecordUpdateMany,
    },
    feedScope: {
      delete: mocks.feedScopeDelete,
      findFirst: mocks.feedScopeFindFirst,
      findMany: mocks.feedScopeFindMany,
      update: mocks.feedScopeUpdate,
    },
    leaveBalance: {
      delete: mocks.leaveBalanceDelete,
      findMany: mocks.leaveBalanceFindMany,
      update: mocks.leaveBalanceUpdate,
    },
    notification: {
      updateMany: mocks.notificationUpdateMany,
    },
    person: {
      create: mocks.personCreate,
      findFirst: mocks.personFindFirst,
      findMany: mocks.personFindMany,
      update: mocks.personUpdate,
      updateMany: mocks.personUpdateMany,
      upsert: mocks.personUpsert,
    },
    xeroPersonMatch: {
      findFirst: mocks.xeroPersonMatchFindFirst,
      update: mocks.xeroPersonMatchUpdate,
      upsert: mocks.xeroPersonMatchUpsert,
    },
  };
  return {
    database: db,
    scopedTo: vi.fn(
      (context: { clerkOrgId: string; organisationId: string }) => ({
        clerk_org_id: context.clerkOrgId,
        organisation_id: context.organisationId,
      })
    ),
  };
});

const { reconcileXeroPerson, mergeCandidateIntoXeroPerson, ignorePersonMatch } =
  await import("./xero-person-reconciliation");

describe("xero-person-reconciliation", () => {
  const clerkOrgId = "org_reconcile_test";
  const organisationId = "10000000-0000-4000-8000-000000000001";
  const context = { clerkOrgId, organisationId };
  const employeeId = "20000000-0000-4000-8000-000000000002";
  const xeroPersonId = "30000000-0000-4000-8000-000000000003";
  const candidatePersonId = "40000000-0000-4000-8000-000000000004";
  const matchId = "50000000-0000-4000-8000-000000000005";

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.personFindFirst.mockResolvedValue(null);
    mocks.personFindMany.mockResolvedValue([]);
    mocks.personUpdate.mockImplementation(async (args) => ({
      id: args.where.id,
      ...args.data,
    }));
    mocks.personUpsert.mockImplementation(async (args) => ({
      id: xeroPersonId,
      ...args.create,
    }));
    mocks.personCreate.mockImplementation(async (args) => ({
      id: xeroPersonId,
      ...args.data,
    }));
    mocks.xeroPersonMatchUpsert.mockResolvedValue({ id: matchId });
    mocks.xeroPersonMatchUpdate.mockResolvedValue({ id: matchId });
    mocks.xeroPersonMatchFindFirst.mockResolvedValue({ id: matchId });
    mocks.leaveBalanceFindMany.mockResolvedValue([]);
    mocks.feedScopeFindMany.mockResolvedValue([]);
  });

  describe("reconcileXeroPerson", () => {
    it("matches exact xero_employee_id and updates profile", async () => {
      mocks.personFindFirst.mockResolvedValueOnce({
        id: xeroPersonId,
        job_title: "Old Title",
        start_date: new Date("2025-01-01"),
        xero_employee_id: employeeId,
      });

      const result = await reconcileXeroPerson(context, {
        email: "alice@example.com",
        employeeId,
        firstName: "Alice",
        jobTitle: "Senior Engineer",
        lastName: "Smith",
      });

      expect(result).toEqual({
        outcome: "exact_matched",
        personId: xeroPersonId,
      });
      expect(mocks.personUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            job_title: "Senior Engineer",
            xero_employee_id: employeeId,
            xero_missing_since: null,
          }),
          where: { id: xeroPersonId },
        })
      );
    });

    it("upgrades single unambiguous manual person in place when verified email matches", async () => {
      mocks.personFindFirst.mockResolvedValue(null); // No exact xero_employee_id
      const manualPerson = {
        clerk_user_id: "user_manual_1",
        email: "alice@example.com",
        first_name: "Alice",
        id: candidatePersonId,
        job_title: "Staff",
        last_name: "Smith",
        location_id: "loc-1",
        team_id: "team-1",
        xero_employee_id: null,
      };

      // manualCandidates returns manualPerson
      mocks.personFindMany
        .mockResolvedValueOnce([manualPerson]) // manualCandidates
        .mockResolvedValueOnce([
          { id: candidatePersonId, xero_employee_id: null },
        ]); // allOrgPeopleWithEmail

      const result = await reconcileXeroPerson(context, {
        email: "alice@example.com",
        employeeId,
        firstName: "Alice",
        jobTitle: "Senior Staff",
        lastName: "Smith",
      });

      expect(result).toEqual({
        outcome: "upgraded_in_place",
        personId: candidatePersonId,
      });
      expect(mocks.personUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            display_name: "Alice Smith",
            source_person_key: employeeId,
            source_system: "XERO",
            xero_employee_id: employeeId,
          }),
          where: { id: candidatePersonId },
        })
      );
      expect(mocks.xeroPersonMatchUpsert).not.toHaveBeenCalled();
    });

    it("proposes match when multiple manual people share the email (duplicate email conflict)", async () => {
      mocks.personFindFirst.mockResolvedValue(null);
      const person1 = {
        email: "alice@example.com",
        first_name: "Alice",
        id: "p1",
        last_name: "One",
        xero_employee_id: null,
      };
      const person2 = {
        email: "alice@example.com",
        first_name: "Alice",
        id: "p2",
        last_name: "Two",
        xero_employee_id: null,
      };

      mocks.personFindMany
        .mockResolvedValueOnce([person1, person2]) // manualCandidates
        .mockResolvedValueOnce([person1, person2]); // allOrgPeopleWithEmail

      const result = await reconcileXeroPerson(context, {
        email: "alice@example.com",
        employeeId,
        firstName: "Alice",
        lastName: "One",
      });

      expect(result.outcome).toBe("created_with_pending_match");
      expect(mocks.personUpsert).toHaveBeenCalled();
      expect(mocks.xeroPersonMatchUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            candidate_person_id: "p1",
            detected_reason: "duplicate_email",
            status: "pending",
          }),
        })
      );
    });

    it("proposes match when candidate matches by name only without verified email", async () => {
      mocks.personFindFirst.mockResolvedValue(null);
      const manualPerson = {
        email: "alice.personal@other.com",
        first_name: "Alice",
        id: candidatePersonId,
        last_name: "Smith",
        xero_employee_id: null,
      };

      // Email is missing/synthetic fallback
      mocks.personFindMany.mockResolvedValueOnce([manualPerson]);

      const result = await reconcileXeroPerson(context, {
        email: null,
        employeeId,
        firstName: "Alice",
        lastName: "Smith",
      });

      expect(result.outcome).toBe("created_with_pending_match");
      expect(mocks.personUpsert).toHaveBeenCalled();
      expect(mocks.xeroPersonMatchUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            candidate_person_id: candidatePersonId,
            detected_reason: "name_match",
            status: "pending",
          }),
        })
      );
    });

    it("creates new Xero person directly when no candidates match", async () => {
      mocks.personFindFirst.mockResolvedValue(null);
      mocks.personFindMany.mockResolvedValue([]);

      const result = await reconcileXeroPerson(context, {
        email: "stranger@example.com",
        employeeId,
        firstName: "Bob",
        lastName: "Taylor",
      });

      expect(result).toEqual({ outcome: "created", personId: xeroPersonId });
      expect(mocks.xeroPersonMatchUpsert).not.toHaveBeenCalled();
    });
  });

  describe("mergeCandidateIntoXeroPerson", () => {
    const xeroPerson = {
      archived_at: null,
      clerk_org_id: clerkOrgId,
      clerk_user_id: null,
      id: xeroPersonId,
      location_id: null,
      manager_person_id: null,
      organisation_id: organisationId,
      team_id: null,
    };

    const candidatePerson = {
      archived_at: null,
      clerk_org_id: clerkOrgId,
      clerk_user_id: "user_cand_1",
      id: candidatePersonId,
      location_id: "loc_cand",
      manager_person_id: "mgr_cand",
      organisation_id: organisationId,
      team_id: "team_cand",
    };

    it("returns not_found error if Xero person does not exist", async () => {
      mocks.personFindFirst.mockResolvedValueOnce(null);

      const result = await mergeCandidateIntoXeroPerson(context, {
        actorUserId: "user_admin",
        candidatePersonId,
        clerkOrgId,
        organisationId,
        xeroPersonId,
      });

      expect(result).toEqual({
        error: { code: "not_found", message: "Xero person not found." },
        ok: false,
      });
    });

    it("returns conflict error if candidate person is already archived", async () => {
      mocks.personFindFirst
        .mockResolvedValueOnce(xeroPerson)
        .mockResolvedValueOnce({ ...candidatePerson, archived_at: new Date() });

      const result = await mergeCandidateIntoXeroPerson(context, {
        actorUserId: "user_admin",
        candidatePersonId,
        clerkOrgId,
        organisationId,
        xeroPersonId,
      });

      expect(result).toEqual({
        error: {
          code: "conflict",
          message: "Candidate person is already archived.",
        },
        ok: false,
      });
    });

    it("rejects if resolved Clerk user ID is already linked to a third person in the organization", async () => {
      mocks.personFindFirst
        .mockResolvedValueOnce(xeroPerson)
        .mockResolvedValueOnce(candidatePerson)
        .mockResolvedValueOnce({ id: "third_person_id" }); // alreadyLinked check

      const result = await mergeCandidateIntoXeroPerson(context, {
        actorUserId: "user_admin",
        candidatePersonId,
        clerkOrgId,
        clerkUserId: "user_cand_1",
        organisationId,
        xeroPersonId,
      });

      expect(result).toEqual({
        error: {
          code: "validation_error",
          message:
            "That user is already linked to another person in this organisation.",
        },
        ok: false,
      });
    });

    it("successfully merges candidate into Xero person, transferring relations and archiving candidate", async () => {
      mocks.personFindFirst
        .mockResolvedValueOnce(xeroPerson)
        .mockResolvedValueOnce(candidatePerson)
        .mockResolvedValueOnce(null); // alreadyLinked check passes

      // Duplicate balance check setup:
      // Xero person has balance for (tenant1, leaveTypeA)
      // Candidate person has balance for (tenant1, leaveTypeA) [conflict -> delete] and (tenant1, leaveTypeB) [transfer]
      mocks.leaveBalanceFindMany
        .mockResolvedValueOnce([
          { id: "xb1", leave_type_xero_id: "ltA", xero_connection_id: "t1" },
        ])
        .mockResolvedValueOnce([
          { id: "cb1", leave_type_xero_id: "ltA", xero_connection_id: "t1" },
          { id: "cb2", leave_type_xero_id: "ltB", xero_connection_id: "t1" },
        ]);

      // Feed scopes setup:
      // Candidate has scope for feed1 (which xeroPerson already has -> delete)
      // and feed2 (which xeroPerson does not have -> transfer)
      mocks.feedScopeFindMany.mockResolvedValueOnce([
        {
          feed_id: "feed1",
          id: "fs1",
          scope_type: "person",
          scope_value: candidatePersonId,
        },
        {
          feed_id: "feed2",
          id: "fs2",
          scope_type: "person",
          scope_value: candidatePersonId,
        },
      ]);
      mocks.feedScopeFindFirst
        .mockResolvedValueOnce({ id: "target_fs1" }) // feed1 exists on target
        .mockResolvedValueOnce(null); // feed2 does not exist on target

      const result = await mergeCandidateIntoXeroPerson(context, {
        actorDisplay: "Admin User",
        actorUserId: "user_admin",
        candidatePersonId,
        clerkOrgId,
        clerkUserId: "user_cand_1",
        matchId,
        organisationId,
        xeroPersonId,
      });

      expect(result).toEqual({
        ok: true,
        value: { merged: true, xeroPersonId },
      });

      // Assert direct reports transfer
      expect(mocks.personUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { manager_person_id: xeroPersonId },
          where: expect.objectContaining({
            manager_person_id: candidatePersonId,
          }),
        })
      );

      // Assert manager, team and location inherited
      expect(mocks.personUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { manager_person_id: "mgr_cand" },
          where: { id: xeroPersonId },
        })
      );
      expect(mocks.personUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            location: { connect: { id: "loc_cand" } },
            team: { connect: { id: "team_cand" } },
          }),
          where: { id: xeroPersonId },
        })
      );

      // Assert availability records transferred
      expect(mocks.availabilityRecordUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { person_id: xeroPersonId },
          where: expect.objectContaining({ person_id: candidatePersonId }),
        })
      );
      expect(mocks.availabilityRecordUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { approved_by_person_id: xeroPersonId },
          where: expect.objectContaining({
            approved_by_person_id: candidatePersonId,
          }),
        })
      );

      // Assert leave balance conflict deleted and non-conflict transferred
      expect(mocks.leaveBalanceDelete).toHaveBeenCalledWith({
        where: { id: "cb1" },
      });
      expect(mocks.leaveBalanceUpdate).toHaveBeenCalledWith({
        data: { person_id: xeroPersonId },
        where: { id: "cb2" },
      });

      // Assert candidate feed scopes handled
      expect(mocks.feedScopeDelete).toHaveBeenCalledWith({
        where: { id: "fs1" },
      });
      expect(mocks.feedScopeUpdate).toHaveBeenCalledWith({
        data: { scope_value: xeroPersonId },
        where: { id: "fs2" },
      });

      // Assert candidate person archived and clerk_user_id cleared
      expect(mocks.personUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            archived_at: expect.any(Date),
            clerk_user_id: null,
          }),
          where: { id: candidatePersonId },
        })
      );

      // Assert Xero person linked to Clerk user ID
      expect(mocks.personUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ clerk_user_id: "user_cand_1" }),
          where: { id: xeroPersonId },
        })
      );

      // Assert match resolved
      expect(mocks.xeroPersonMatchUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            resolved_clerk_user_id: "user_cand_1",
            resolved_person_id: xeroPersonId,
            status: "matched",
          }),
          where: { id: matchId },
        })
      );

      // Assert audit log
      expect(mocks.auditEventCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: "xero.person_match_resolved",
            actor_user_id: "user_admin",
            entity_id: matchId,
          }),
        })
      );

      // Assert feed cache invalidation
      expect(mocks.invalidateFeedCachesForPerson).toHaveBeenCalledWith(
        expect.objectContaining({ personId: candidatePersonId })
      );
      expect(mocks.invalidateFeedCachesForPerson).toHaveBeenCalledWith(
        expect.objectContaining({ personId: xeroPersonId })
      );
    });
  });

  describe("ignorePersonMatch", () => {
    it("returns not_found if match does not exist", async () => {
      mocks.xeroPersonMatchFindFirst.mockResolvedValueOnce(null);

      const result = await ignorePersonMatch(context, {
        actorUserId: "user_admin",
        matchId,
      });

      expect(result).toEqual({
        error: { code: "not_found", message: "Match not found." },
        ok: false,
      });
    });

    it("marks match as ignored and records audit log", async () => {
      mocks.xeroPersonMatchFindFirst.mockResolvedValueOnce({
        candidate_person_id: candidatePersonId,
        id: matchId,
        xero_person_id: xeroPersonId,
      });

      const result = await ignorePersonMatch(context, {
        actorDisplay: "Admin User",
        actorUserId: "user_admin",
        matchId,
      });

      expect(result).toEqual({ ok: true, value: { ignored: true } });
      expect(mocks.xeroPersonMatchUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            resolution_note: "Marked as separate records by admin.",
            resolved_by_user_id: "user_admin",
            status: "ignored",
          }),
          where: { id: matchId },
        })
      );
      expect(mocks.auditEventCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: "xero.person_match_ignored",
            actor_user_id: "user_admin",
            entity_id: matchId,
          }),
        })
      );
    });
  });
});
