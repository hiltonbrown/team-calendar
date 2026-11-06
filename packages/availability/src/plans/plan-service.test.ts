import { withTenantResult as withTestTenantResult } from "@repo/database/tenant-db";
import { tenantTestAccount } from "@repo/database/test-fixtures/tenant-scope";
import { icsUidSuffix } from "@repo/seo/branding";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const auditCreate = vi.fn();
  const availabilityCreate = vi.fn(async ({ data }) => ({
    ...data,
    approval_note: null,
    archived_at: null,
    created_at: new Date("2026-01-01T00:00:00.000Z"),
    person: personFixture,
    source_remote_id: null,
    submitted_at: null,
    updated_at: new Date("2026-01-01T00:00:00.000Z"),
    xero_write_error: null,
  }));
  const availabilityFindFirst = vi.fn();
  const personFixture = {
    email: "person@example.com",
    first_name: "Test",
    id: "00000000-0000-4000-8000-000000000011",
    last_name: "Person",
    location_id: null,
    manager_person_id: null,
  };
  return {
    auditCreate,
    availabilityCount: vi.fn(),
    availabilityCreate,
    availabilityDeleteMany: vi.fn(),
    availabilityFindFirst,
    availabilityFindMany: vi.fn(),
    availabilityUpdateMany: vi.fn(),
    getXeroConnectionStateForScope: vi.fn(),
    hasUnresolvedSubmitOperation: vi.fn(),
    leaveBalanceFindFirst: vi.fn(),
    leaveBalanceFindMany: vi.fn(),
    managerScopePersonIds: vi.fn(),
    materialiseAvailabilityPublication: vi.fn(() =>
      Promise.resolve({ ok: true, value: undefined })
    ),
    personFindFirst: vi.fn(),
    scopedQuery: vi.fn((accountId: string, organisationId: string) => ({
      account_id: accountId,
      organisation_id: organisationId,
    })),
    scopedTo: vi.fn((input: { accountId: string; organisationId: string }) => ({
      account_id: input.accountId,
      organisation_id: input.organisationId,
    })),
  };
});
vi.mock("server-only", () => ({}));
vi.mock("@repo/database/tenant-client", () => ({
  referenceDatabase: {
    $transaction: async (run: (db: unknown) => Promise<unknown>) =>
      run(buildTestDatabase()),
  },
}));
vi.mock("@repo/database", async () => ({
  ...(await vi.importActual<typeof import("@repo/database/tenant-db")>(
    "@repo/database/tenant-db"
  )),

  hasUnresolvedSubmitOperation: mocks.hasUnresolvedSubmitOperation,
  lockPlanLimitMutations: vi.fn(async () => undefined),
  resolveAccountCompanies: async () => [
    {
      country_code: "AU",
      id: baseInput.organisationId,
      name: "Acme Org",
      timezone: "Australia/Brisbane",
    },
  ],
  scopedQuery: mocks.scopedQuery,
  scopedTo: mocks.scopedTo,
}));
function buildTestDatabase() {
  // Selected delegates are fakes; scope ownership and commit effects use the real wrapper.
  return {
    $executeRaw: vi.fn(async () => 1),
    $queryRaw: vi.fn(async () => []),
    ...{
      $transaction: (callback: (tx: unknown) => unknown) =>
        callback({
          auditEvent: { create: mocks.auditCreate },
          availabilityRecord: {
            create: mocks.availabilityCreate,
            deleteMany: mocks.availabilityDeleteMany,
            updateMany: mocks.availabilityUpdateMany,
          },
        }),
      auditEvent: { create: mocks.auditCreate },
      availabilityRecord: {
        count: mocks.availabilityCount,
        create: mocks.availabilityCreate,
        deleteMany: mocks.availabilityDeleteMany,
        findFirst: mocks.availabilityFindFirst,
        findMany: mocks.availabilityFindMany,
        updateMany: mocks.availabilityUpdateMany,
      },
      leaveBalance: {
        findFirst: mocks.leaveBalanceFindFirst,
        findMany: mocks.leaveBalanceFindMany,
      },
      person: { findFirst: mocks.personFindFirst },
    },
  };
}
vi.mock("../settings/organisation-settings-service", () => ({
  getSettings: vi.fn(async () => ({
    ok: true,
    value: { defaultPrivacyMode: "named" },
  })),
}));
vi.mock("../xero-connection-state", () => ({
  getXeroConnectionStateForScope: mocks.getXeroConnectionStateForScope,
}));
vi.mock("../settings/manager-scope", () => ({
  managerScopePersonIds: mocks.managerScopePersonIds,
}));
vi.mock("@repo/feeds", () => ({
  materialiseAvailabilityPublication: mocks.materialiseAvailabilityPublication,
}));
const {
  archiveRecord,
  createRecord,
  deleteDraftRecord,
  getRecord,
  listTeamRecords,
  listTeamRecordsPage,
  updateRecord,
} = await import("./plan-service");
const baseInput = {
  accountId: "org_1",
  actingRole: "viewer",
  allDay: true,
  contactabilityStatus: "contactable",
  createdByUserId: "user_1",
  endsAt: new Date("2026-05-05T00:00:00.000Z"),
  notesInternal: "Test note",
  organisationId: "00000000-0000-4000-8000-000000000001",
  personId: "00000000-0000-4000-8000-000000000011",
  privacyMode: "named",
  startsAt: new Date("2026-05-04T00:00:00.000Z"),
} as const;
const actionInput = {
  accountId: baseInput.accountId,
  actingUserId: "user_1",
  organisationId: baseInput.organisationId,
  recordId: "00000000-0000-4000-8000-000000000021",
} as const;
function scopedRecordFixture({
  managerPersonId,
  personId = baseInput.personId,
}: {
  managerPersonId: string | null;
  personId?: string;
}) {
  return {
    account_id: baseInput.accountId,
    all_day: true,
    approval_note: null,
    approval_status: "approved",
    approved_at: new Date("2026-01-01T00:00:00.000Z"),
    archived_at: null,
    contactability: "contactable",
    created_at: new Date("2026-01-01T00:00:00.000Z"),
    created_by_user_id: "user_1",
    derived_sequence: 2,
    derived_uid_key: "uid-key",
    ends_at: baseInput.endsAt,
    failed_action: null,
    id: actionInput.recordId,
    notes_internal: null,
    organisation_id: baseInput.organisationId,
    person: {
      email: "person@example.com",
      first_name: "Test",
      id: personId,
      last_name: "Person",
      location_id: null,
      manager_person_id: managerPersonId,
    },
    person_id: personId,
    privacy_mode: "named",
    record_type: "wfh",
    source_remote_id: null,
    source_type: "manual",
    starts_at: baseInput.startsAt,
    submitted_at: null,
    updated_at: new Date("2026-01-01T00:00:00.000Z"),
    xero_write_error: null,
  };
}
describe("plan-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.availabilityFindFirst.mockResolvedValue(
      scopedRecordFixture({ managerPersonId: null })
    );
    mocks.availabilityFindMany.mockResolvedValue([]);
    mocks.availabilityCount.mockResolvedValue(0);
    mocks.leaveBalanceFindMany.mockResolvedValue([]);
    mocks.availabilityDeleteMany.mockResolvedValue({ count: 1 });
    mocks.availabilityUpdateMany.mockResolvedValue({ count: 1 });
    mocks.getXeroConnectionStateForScope.mockResolvedValue({
      ok: true,
      value: { state: "not_connected" },
    });
    mocks.managerScopePersonIds.mockResolvedValue([baseInput.personId]);
    mocks.personFindFirst.mockResolvedValue({
      email: "person@example.com",
      first_name: "Test",
      id: baseInput.personId,
      last_name: "Person",
      location_id: null,
      manager_person_id: null,
    });
  });
  it("pages plans with one exact count and a bounded stable query", async () => {
    mocks.availabilityCount.mockResolvedValue(241);
    const result = await withTestTenantResult(
      tenantTestAccount({
        accountId: baseInput.accountId,
        actingRole: "admin",
        filters: {
          approvalStatus: ["approved"],
          sourceType: ["manual"],
        },
        organisationId: baseInput.organisationId,
        pageSize: 50,
      }),
      (db) =>
        listTeamRecordsPage(
          {
            accountId: baseInput.accountId,
            actingRole: "admin",
            filters: {
              approvalStatus: ["approved"],
              sourceType: ["manual"],
            },
            organisationId: baseInput.organisationId,
            pageSize: 50,
          },
          db
        )
    );
    expect(result).toMatchObject({
      ok: true,
      value: { nextCursor: null, totalCount: 241 },
    });
    expect(mocks.availabilityFindMany).toHaveBeenCalledTimes(1);
    expect(mocks.availabilityCount).toHaveBeenCalledTimes(1);
    const pageQuery = mocks.availabilityFindMany.mock.calls[0]?.[0];
    const countQuery = mocks.availabilityCount.mock.calls[0]?.[0];
    expect(pageQuery).toMatchObject({
      orderBy: [{ starts_at: "asc" }, { created_at: "asc" }, { id: "asc" }],
      take: 51,
      where: {
        account_id: baseInput.accountId,
        approval_status: { in: ["approved"] },
        organisation_id: baseInput.organisationId,
        source_type: { in: ["manual"] },
      },
    });
    expect(countQuery?.where).toEqual(pageQuery?.where);
    expect(mocks.leaveBalanceFindMany).not.toHaveBeenCalled();
  });
  it.each([
    [1, 2],
    [50, 51],
    [200, 201],
  ])(
    "keeps page size %i to one bounded query with take %i",
    async (pageSize, take) => {
      await withTestTenantResult(
        tenantTestAccount({
          accountId: baseInput.accountId,
          actingRole: "admin",
          organisationId: baseInput.organisationId,
          pageSize,
        }),
        (db) =>
          listTeamRecordsPage(
            {
              accountId: baseInput.accountId,
              actingRole: "admin",
              organisationId: baseInput.organisationId,
              pageSize,
            },
            db
          )
      );
      expect(mocks.availabilityFindMany).toHaveBeenCalledTimes(1);
      expect(mocks.availabilityCount).toHaveBeenCalledTimes(1);
      expect(mocks.availabilityFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ take })
      );
    }
  );
  it("removes the overlap window only when all history is requested", async () => {
    await withTestTenantResult(
      tenantTestAccount({
        accountId: baseInput.accountId,
        actingRole: "admin",
        allHistory: true,
        organisationId: baseInput.organisationId,
      }),
      (db) =>
        listTeamRecordsPage(
          {
            accountId: baseInput.accountId,
            actingRole: "admin",
            allHistory: true,
            organisationId: baseInput.organisationId,
          },
          db
        )
    );
    const where = mocks.availabilityFindMany.mock.calls[0]?.[0]?.where;
    expect(where).not.toHaveProperty("ends_at");
    expect(where).not.toHaveProperty("starts_at");
  });
  it("returns no team records without querying when a manager has no reports", async () => {
    mocks.managerScopePersonIds.mockResolvedValue([]);
    const result = await withTestTenantResult(
      tenantTestAccount({
        accountId: baseInput.accountId,
        actingRole: "manager",
        managerPersonId: "00000000-0000-4000-8000-000000000031",
        organisationId: baseInput.organisationId,
      }),
      (db) =>
        listTeamRecords(
          {
            accountId: baseInput.accountId,
            actingRole: "manager",
            managerPersonId: "00000000-0000-4000-8000-000000000031",
            organisationId: baseInput.organisationId,
          },
          db
        )
    );
    expect(result).toEqual({ ok: true, value: [] });
    expect(mocks.availabilityFindMany).not.toHaveBeenCalled();
    expect(mocks.getXeroConnectionStateForScope).not.toHaveBeenCalled();
  });
  it("returns no team records when requested people are outside manager scope", async () => {
    const result = await withTestTenantResult(
      tenantTestAccount({
        accountId: baseInput.accountId,
        actingRole: "manager",
        filters: {
          personId: ["00000000-0000-4000-8000-000000000099"],
        },
        managerPersonId: "00000000-0000-4000-8000-000000000031",
        organisationId: baseInput.organisationId,
      }),
      (db) =>
        listTeamRecords(
          {
            accountId: baseInput.accountId,
            actingRole: "manager",
            filters: {
              personId: ["00000000-0000-4000-8000-000000000099"],
            },
            managerPersonId: "00000000-0000-4000-8000-000000000031",
            organisationId: baseInput.organisationId,
          },
          db
        )
    );
    expect(result).toEqual({ ok: true, value: [] });
    expect(mocks.availabilityFindMany).not.toHaveBeenCalled();
  });
  it("intersects requested people with manager scope", async () => {
    await withTestTenantResult(
      tenantTestAccount({
        accountId: baseInput.accountId,
        actingRole: "manager",
        filters: {
          personId: [
            baseInput.personId,
            "00000000-0000-4000-8000-000000000099",
          ],
        },
        managerPersonId: "00000000-0000-4000-8000-000000000031",
        organisationId: baseInput.organisationId,
      }),
      (db) =>
        listTeamRecords(
          {
            accountId: baseInput.accountId,
            actingRole: "manager",
            filters: {
              personId: [
                baseInput.personId,
                "00000000-0000-4000-8000-000000000099",
              ],
            },
            managerPersonId: "00000000-0000-4000-8000-000000000031",
            organisationId: baseInput.organisationId,
          },
          db
        )
    );
    expect(mocks.availabilityFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          account_id: baseInput.accountId,
          organisation_id: baseInput.organisationId,
          person_id: { in: [baseInput.personId] },
        }),
      })
    );
    expect(mocks.managerScopePersonIds).toHaveBeenCalledWith(
      {
        accountId: baseInput.accountId,
        actingPersonId: "00000000-0000-4000-8000-000000000031",
        excludeSelf: true,
      },
      expect.any(Object)
    );
  });
  it("denies a manager without a linked acting person", async () => {
    const result = await withTestTenantResult(
      tenantTestAccount({
        accountId: baseInput.accountId,
        actingRole: "manager",
        managerPersonId: null,
        organisationId: baseInput.organisationId,
      }),
      (db) =>
        listTeamRecords(
          {
            accountId: baseInput.accountId,
            actingRole: "manager",
            managerPersonId: null,
            organisationId: baseInput.organisationId,
          },
          db
        )
    );
    expect(result).toMatchObject({
      error: { code: "not_authorised" },
      ok: false,
    });
    expect(mocks.managerScopePersonIds).not.toHaveBeenCalled();
    expect(mocks.availabilityFindMany).not.toHaveBeenCalled();
  });
  it.each(["admin", "owner"])(
    "allows %s to query the scoped organisation without a manager person",
    async (actingRole) => {
      await withTestTenantResult(
        tenantTestAccount({
          accountId: baseInput.accountId,
          actingRole,
          managerPersonId: null,
          organisationId: baseInput.organisationId,
        }),
        (db) =>
          listTeamRecords(
            {
              accountId: baseInput.accountId,
              actingRole,
              managerPersonId: null,
              organisationId: baseInput.organisationId,
            },
            db
          )
      );
      expect(mocks.availabilityFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            account_id: baseInput.accountId,
            organisation_id: baseInput.organisationId,
          }),
        })
      );
    }
  );
  it("keeps records visible but exposes only view during an unavailable Xero check", async () => {
    mocks.availabilityFindFirst.mockResolvedValue({
      ...scopedRecordFixture({ managerPersonId: null }),
      record_type: "annual_leave",
      source_type: "team_calendar_leave",
    });
    mocks.getXeroConnectionStateForScope.mockResolvedValue({
      error: { code: "state_unavailable" },
      ok: false,
    });
    const result = await withTestTenantResult(
      tenantTestAccount({
        accountId: baseInput.accountId,
        actingRole: "admin",
        actingUserId: baseInput.createdByUserId,
        organisationId: baseInput.organisationId,
        recordId: "00000000-0000-4000-8000-000000000021",
      }),
      (db) =>
        getRecord(
          {
            accountId: baseInput.accountId,
            actingRole: "admin",
            actingUserId: baseInput.createdByUserId,
            organisationId: baseInput.organisationId,
            recordId: "00000000-0000-4000-8000-000000000021",
          },
          db
        )
    );
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.editableActions).toEqual(["view"]);
  });
  it("allows local-only availability when the Xero state cannot be checked", async () => {
    mocks.getXeroConnectionStateForScope.mockResolvedValue({
      error: { code: "state_unavailable" },
      ok: false,
    });
    const result = await withTestTenantResult(
      tenantTestAccount({ ...baseInput, recordType: "wfh" }),
      (db) => createRecord({ ...baseInput, recordType: "wfh" }, db)
    );
    expect(result).toMatchObject({
      ok: true,
      value: { approvalStatus: "approved", sourceType: "manual" },
    });
  });
  it("blocks leave creation when the connection state cannot be checked", async () => {
    mocks.getXeroConnectionStateForScope.mockResolvedValue({
      error: { code: "state_unavailable" },
      ok: false,
    });
    const result = await withTestTenantResult(
      tenantTestAccount({
        ...baseInput,
        recordType: "annual_leave",
      }),
      (db) =>
        createRecord(
          {
            ...baseInput,
            recordType: "annual_leave",
          },
          db
        )
    );
    expect(result).toMatchObject({
      error: {
        message:
          "We cannot reach Xero right now. Try again later or contact support.",
      },
      ok: false,
    });
    expect(mocks.availabilityCreate).not.toHaveBeenCalled();
  });
  it.each([
    ["wfh", true, "manual", "approved"],
    ["wfh", false, "manual", "approved"],
    ["training", true, "manual", "approved"],
    ["annual_leave", true, "team_calendar_leave", "draft"],
    ["annual_leave", false, "team_calendar_leave", "approved"],
    ["sick_leave", true, "team_calendar_leave", "draft"],
  ] as const)(
    "routes %s with Xero %s to %s and %s",
    async (recordType, hasXero, sourceType, approvalStatus) => {
      mocks.getXeroConnectionStateForScope.mockResolvedValue({
        ok: true,
        value: {
          state: hasXero ? "connected" : "not_connected",
        },
      });
      const result = await withTestTenantResult(
        tenantTestAccount({ ...baseInput, recordType }),
        (db) => createRecord({ ...baseInput, recordType }, db)
      );
      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }
      expect(result.value).toMatchObject({
        approvalStatus,
        derivedSequence: 0,
        personId: baseInput.personId,
        recordType,
        sourceType,
      });
      expect(result.value.derivedUidKey).toContain(icsUidSuffix);
      expect(mocks.auditCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: "availability_records.created",
            payload: expect.objectContaining({
              approvalStatus,
              sourceType,
            }),
          }),
        })
      );
    }
  );
  it("denies updates when a viewer has no linked person and the target has no manager", async () => {
    mocks.personFindFirst.mockResolvedValue(null);
    const result = await withTestTenantResult(
      tenantTestAccount({
        ...actionInput,
        actingRole: "viewer",
        patch: {},
      }),
      (db) =>
        updateRecord(
          {
            ...actionInput,
            actingRole: "viewer",
            patch: {},
          },
          db
        )
    );
    expect(result).toMatchObject({
      error: { code: "not_authorised" },
      ok: false,
    });
  });
  it("denies archiving when a viewer has no linked person and the target has no manager", async () => {
    mocks.personFindFirst.mockResolvedValue(null);
    const result = await withTestTenantResult(
      tenantTestAccount({
        ...actionInput,
        actingRole: "viewer",
      }),
      (db) =>
        archiveRecord(
          {
            ...actionInput,
            actingRole: "viewer",
          },
          db
        )
    );
    expect(result).toMatchObject({
      error: { code: "not_authorised" },
      ok: false,
    });
  });
  it("allows an admin without a linked person to archive a record", async () => {
    mocks.personFindFirst.mockResolvedValue(null);
    const result = await withTestTenantResult(
      tenantTestAccount({
        ...actionInput,
        actingRole: "admin",
      }),
      (db) =>
        archiveRecord(
          {
            ...actionInput,
            actingRole: "admin",
          },
          db
        )
    );
    expect(result).toMatchObject({ ok: true });
  });
  it("allows a linked manager to archive their report's record", async () => {
    const managerPersonId = "00000000-0000-4000-8000-000000000031";
    mocks.availabilityFindFirst.mockResolvedValue(
      scopedRecordFixture({ managerPersonId })
    );
    mocks.personFindFirst.mockResolvedValue({ id: managerPersonId });
    const result = await withTestTenantResult(
      tenantTestAccount({
        ...actionInput,
        actingRole: "manager",
      }),
      (db) =>
        archiveRecord(
          {
            ...actionInput,
            actingRole: "manager",
          },
          db
        )
    );
    expect(result).toMatchObject({ ok: true });
  });
  it("denies a linked viewer direct manager from archiving their report's record", async () => {
    const managerPersonId = "00000000-0000-4000-8000-000000000031";
    mocks.availabilityFindFirst.mockResolvedValue(
      scopedRecordFixture({ managerPersonId })
    );
    mocks.personFindFirst.mockResolvedValue({ id: managerPersonId });
    const result = await withTestTenantResult(
      tenantTestAccount({
        ...actionInput,
        actingRole: "viewer",
      }),
      (db) =>
        archiveRecord(
          {
            ...actionInput,
            actingRole: "viewer",
          },
          db
        )
    );
    expect(result).toMatchObject({
      error: { code: "not_authorised" },
      ok: false,
    });
  });
  it("allows a linked person to archive their own record", async () => {
    mocks.personFindFirst.mockResolvedValue({ id: baseInput.personId });
    const result = await withTestTenantResult(
      tenantTestAccount({
        ...actionInput,
        actingRole: "viewer",
      }),
      (db) =>
        archiveRecord(
          {
            ...actionInput,
            actingRole: "viewer",
          },
          db
        )
    );
    expect(result).toMatchObject({ ok: true });
  });
  it("does not edit a record while an outbound Xero claim is active", async () => {
    mocks.availabilityUpdateMany.mockResolvedValueOnce({ count: 0 });
    const result = await withTestTenantResult(
      tenantTestAccount({
        ...actionInput,
        actingRole: "viewer",
        patch: { notesInternal: "Changed" },
      }),
      (db) =>
        updateRecord(
          {
            ...actionInput,
            actingRole: "viewer",
            patch: { notesInternal: "Changed" },
          },
          db
        )
    );
    expect(result).toMatchObject({
      error: { code: "not_editable_after_submission" },
      ok: false,
    });
  });
  it("does not archive a record while an outbound Xero claim is active", async () => {
    mocks.availabilityUpdateMany.mockResolvedValueOnce({ count: 0 });
    const result = await withTestTenantResult(
      tenantTestAccount({
        ...actionInput,
        actingRole: "viewer",
      }),
      (db) =>
        archiveRecord(
          {
            ...actionInput,
            actingRole: "viewer",
          },
          db
        )
    );
    expect(result).toMatchObject({
      error: { code: "invalid_state_for_archive" },
      ok: false,
    });
  });
  it("does not delete a draft while an outbound Xero claim is active", async () => {
    mocks.availabilityFindFirst.mockResolvedValue({
      ...scopedRecordFixture({ managerPersonId: null }),
      approval_status: "draft",
      source_type: "team_calendar_leave",
    });
    mocks.availabilityDeleteMany.mockResolvedValueOnce({ count: 0 });
    const result = await withTestTenantResult(
      tenantTestAccount({
        ...actionInput,
        actingRole: "viewer",
      }),
      (db) =>
        deleteDraftRecord(
          {
            ...actionInput,
            actingRole: "viewer",
          },
          db
        )
    );
    expect(result).toMatchObject({
      error: { code: "invalid_state_for_delete" },
      ok: false,
    });
  });
  it.each([
    ["submit", ["edit", "retry_submission", "revert_to_draft"]],
    ["withdraw", ["view", "withdraw"]],
    ["approve", ["view"]],
    ["decline", ["view"]],
    [null, ["view"]],
  ])(
    "exposes correct employee actions for a failed %s action",
    async (failed_action, editableActions) => {
      mocks.getXeroConnectionStateForScope.mockResolvedValue({
        ok: true,
        value: { state: "connected" },
      });
      mocks.availabilityFindFirst.mockResolvedValue({
        ...scopedRecordFixture({ managerPersonId: null }),
        approval_status: "xero_sync_failed",
        failed_action,
        source_type: "team_calendar_leave",
      });
      expect(
        await withTestTenantResult(
          tenantTestAccount({ ...actionInput, actingRole: "admin" }),
          (db) => getRecord({ ...actionInput, actingRole: "admin" }, db)
        )
      ).toMatchObject({ ok: true, value: { editableActions } });
    }
  );
  it("offers withdrawal for approved payroll leave without making it editable", async () => {
    mocks.getXeroConnectionStateForScope.mockResolvedValue({
      ok: true,
      value: { state: "connected" },
    });
    mocks.availabilityFindFirst.mockResolvedValue({
      ...scopedRecordFixture({ managerPersonId: null }),
      approval_status: "approved",
      source_remote_id: "remote_leave",
      source_type: "team_calendar_leave",
    });
    expect(
      await withTestTenantResult(
        tenantTestAccount({ ...actionInput, actingRole: "admin" }),
        (db) => getRecord({ ...actionInput, actingRole: "admin" }, db)
      )
    ).toMatchObject({
      ok: true,
      value: { editableActions: ["view", "withdraw", "archive"] },
    });
  });
  it("projects unit, currencyCode, and balance amount on balanceChip", async () => {
    mocks.getXeroConnectionStateForScope.mockResolvedValue({
      ok: true,
      value: { state: "connected" },
    });
    mocks.hasUnresolvedSubmitOperation.mockResolvedValue(false);
    mocks.availabilityFindFirst.mockResolvedValue({
      ...scopedRecordFixture({ managerPersonId: null }),
      account_id: baseInput.accountId,
      all_day: true,
      approval_note: null,
      approval_status: "draft",
      approved_at: null,
      archived_at: null,
      contactability: "contactable",
      created_at: new Date("2026-01-01T00:00:00.000Z"),
      created_by_user_id: "user_1",
      derived_sequence: 0,
      derived_uid_key: "uid-key",
      ends_at: baseInput.endsAt,
      failed_action: null,
      id: actionInput.recordId,
      notes_internal: null,
      organisation_id: baseInput.organisationId,
      person_id: baseInput.personId,
      privacy_mode: "named",
      record_type: "annual_leave",
      source_remote_id: null,
      source_type: "team_calendar_leave",
      starts_at: baseInput.startsAt,
      submitted_at: null,
      updated_at: new Date("2026-01-01T00:00:00.000Z"),
      xero_write_error: null,
    });
    mocks.leaveBalanceFindFirst.mockResolvedValue({
      balance: 1200.5,
      balance_unit: "currency",
      currency_code: "NZD",
      updated_at: new Date("2026-04-01T00:00:00.000Z"),
    });
    const result = await withTestTenantResult(
      tenantTestAccount({
        ...actionInput,
        actingRole: "admin",
      }),
      (db) =>
        getRecord(
          {
            ...actionInput,
            actingRole: "admin",
          },
          db
        )
    );
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.balanceChip).toEqual({
      balanceAvailable: 1200.5,
      balanceUnavailableReason: "not_synced",
      currencyCode: "NZD",
      leaveBalanceUpdatedAt: new Date("2026-04-01T00:00:00.000Z"),
      unit: "currency",
    });
  });
});
