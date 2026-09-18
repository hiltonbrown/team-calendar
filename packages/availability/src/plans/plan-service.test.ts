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
    availabilityCreate,
    availabilityDeleteMany: vi.fn(),
    availabilityFindFirst,
    availabilityFindMany: vi.fn(),
    availabilityUpdateMany: vi.fn(),
    hasActiveXeroConnection: vi.fn(),
    leaveBalanceFindFirst: vi.fn(),
    managerScopePersonIds: vi.fn(),
    materialiseAvailabilityPublication: vi.fn(() =>
      Promise.resolve({ ok: true, value: undefined })
    ),
    personFindFirst: vi.fn(),
    scopedQuery: vi.fn((clerkOrgId: string, organisationId: string) => ({
      clerk_org_id: clerkOrgId,
      organisation_id: organisationId,
    })),
    scopedTo: vi.fn(
      (input: { clerkOrgId: string; organisationId: string }) => ({
        clerk_org_id: input.clerkOrgId,
        organisation_id: input.organisationId,
      })
    ),
  };
});

vi.mock("server-only", () => ({}));
vi.mock("@repo/database", () => ({
  database: {
    $transaction: (callback: (tx: unknown) => unknown) =>
      callback({
        auditEvent: { create: mocks.auditCreate },
        availabilityRecord: {
          create: mocks.availabilityCreate,
          deleteMany: mocks.availabilityDeleteMany,
          updateMany: mocks.availabilityUpdateMany,
        },
      }),
    availabilityRecord: {
      findFirst: mocks.availabilityFindFirst,
      findMany: mocks.availabilityFindMany,
    },
    leaveBalance: { findFirst: mocks.leaveBalanceFindFirst },
    person: { findFirst: mocks.personFindFirst },
  },
  scopedQuery: mocks.scopedQuery,
  scopedTo: mocks.scopedTo,
}));
vi.mock("../xero-connection-state", () => ({
  hasActiveXeroConnection: mocks.hasActiveXeroConnection,
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
  updateRecord,
} = await import("./plan-service");

const baseInput = {
  actingOrgRole: "org:viewer",
  allDay: true,
  clerkOrgId: "org_1",
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
  actingUserId: "user_1",
  clerkOrgId: baseInput.clerkOrgId,
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
    mocks.availabilityDeleteMany.mockResolvedValue({ count: 1 });
    mocks.availabilityUpdateMany.mockResolvedValue({ count: 1 });
    mocks.hasActiveXeroConnection.mockResolvedValue(false);
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

  it("returns no team records without querying when a manager has no reports", async () => {
    mocks.managerScopePersonIds.mockResolvedValue([]);

    const result = await listTeamRecords({
      actingOrgRole: "org:manager",
      clerkOrgId: baseInput.clerkOrgId,
      managerPersonId: "00000000-0000-4000-8000-000000000031",
      organisationId: baseInput.organisationId,
    });

    expect(result).toEqual({ ok: true, value: [] });
    expect(mocks.availabilityFindMany).not.toHaveBeenCalled();
    expect(mocks.hasActiveXeroConnection).not.toHaveBeenCalled();
  });

  it("returns no team records when requested people are outside manager scope", async () => {
    const result = await listTeamRecords({
      actingOrgRole: "org:manager",
      clerkOrgId: baseInput.clerkOrgId,
      filters: {
        personId: ["00000000-0000-4000-8000-000000000099"],
      },
      managerPersonId: "00000000-0000-4000-8000-000000000031",
      organisationId: baseInput.organisationId,
    });

    expect(result).toEqual({ ok: true, value: [] });
    expect(mocks.availabilityFindMany).not.toHaveBeenCalled();
  });

  it("intersects requested people with manager scope", async () => {
    await listTeamRecords({
      actingOrgRole: "org:manager",
      clerkOrgId: baseInput.clerkOrgId,
      filters: {
        personId: [baseInput.personId, "00000000-0000-4000-8000-000000000099"],
      },
      managerPersonId: "00000000-0000-4000-8000-000000000031",
      organisationId: baseInput.organisationId,
    });

    expect(mocks.availabilityFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          clerk_org_id: baseInput.clerkOrgId,
          organisation_id: baseInput.organisationId,
          person_id: { in: [baseInput.personId] },
        }),
      })
    );
    expect(mocks.managerScopePersonIds).toHaveBeenCalledWith({
      actingPersonId: "00000000-0000-4000-8000-000000000031",
      clerkOrgId: baseInput.clerkOrgId,
      excludeSelf: true,
      organisationId: baseInput.organisationId,
    });
  });

  it("denies a manager without a linked acting person", async () => {
    const result = await listTeamRecords({
      actingOrgRole: "org:manager",
      clerkOrgId: baseInput.clerkOrgId,
      managerPersonId: null,
      organisationId: baseInput.organisationId,
    });

    expect(result).toMatchObject({
      error: { code: "not_authorised" },
      ok: false,
    });
    expect(mocks.managerScopePersonIds).not.toHaveBeenCalled();
    expect(mocks.availabilityFindMany).not.toHaveBeenCalled();
  });

  it.each(["org:admin", "org:owner"])(
    "allows %s to query the scoped organisation without a manager person",
    async (actingOrgRole) => {
      await listTeamRecords({
        actingOrgRole,
        clerkOrgId: baseInput.clerkOrgId,
        managerPersonId: null,
        organisationId: baseInput.organisationId,
      });

      expect(mocks.availabilityFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            clerk_org_id: baseInput.clerkOrgId,
            organisation_id: baseInput.organisationId,
          }),
        })
      );
    }
  );

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
      mocks.hasActiveXeroConnection.mockResolvedValue(hasXero);

      const result = await createRecord({ ...baseInput, recordType });

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

    const result = await updateRecord({
      ...actionInput,
      actingOrgRole: "org:viewer",
      patch: {},
    });

    expect(result).toMatchObject({
      error: { code: "not_authorised" },
      ok: false,
    });
  });

  it("denies archiving when a viewer has no linked person and the target has no manager", async () => {
    mocks.personFindFirst.mockResolvedValue(null);

    const result = await archiveRecord({
      ...actionInput,
      actingOrgRole: "org:viewer",
    });

    expect(result).toMatchObject({
      error: { code: "not_authorised" },
      ok: false,
    });
  });

  it("allows an admin without a linked person to archive a record", async () => {
    mocks.personFindFirst.mockResolvedValue(null);

    const result = await archiveRecord({
      ...actionInput,
      actingOrgRole: "org:admin",
    });

    expect(result).toMatchObject({ ok: true });
  });

  it("allows a linked manager to archive their report's record", async () => {
    const managerPersonId = "00000000-0000-4000-8000-000000000031";
    mocks.availabilityFindFirst.mockResolvedValue(
      scopedRecordFixture({ managerPersonId })
    );
    mocks.personFindFirst.mockResolvedValue({ id: managerPersonId });

    const result = await archiveRecord({
      ...actionInput,
      actingOrgRole: "org:viewer",
    });

    expect(result).toMatchObject({ ok: true });
  });

  it("allows a linked person to archive their own record", async () => {
    mocks.personFindFirst.mockResolvedValue({ id: baseInput.personId });

    const result = await archiveRecord({
      ...actionInput,
      actingOrgRole: "org:viewer",
    });

    expect(result).toMatchObject({ ok: true });
  });

  it("does not edit a record while an outbound Xero claim is active", async () => {
    mocks.availabilityUpdateMany.mockResolvedValueOnce({ count: 0 });

    const result = await updateRecord({
      ...actionInput,
      actingOrgRole: "org:viewer",
      patch: { notesInternal: "Changed" },
    });

    expect(result).toMatchObject({
      error: { code: "not_editable_after_submission" },
      ok: false,
    });
  });

  it("does not archive a record while an outbound Xero claim is active", async () => {
    mocks.availabilityUpdateMany.mockResolvedValueOnce({ count: 0 });

    const result = await archiveRecord({
      ...actionInput,
      actingOrgRole: "org:viewer",
    });

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

    const result = await deleteDraftRecord({
      ...actionInput,
      actingOrgRole: "org:viewer",
    });

    expect(result).toMatchObject({
      error: { code: "invalid_state_for_delete" },
      ok: false,
    });
  });

  it("projects unit, currencyCode, and balance amount on balanceChip", async () => {
    mocks.hasActiveXeroConnection.mockResolvedValue(true);
    mocks.availabilityFindFirst.mockResolvedValue({
      ...scopedRecordFixture({ managerPersonId: null }),
      all_day: true,
      approval_note: null,
      approval_status: "draft",
      approved_at: null,
      archived_at: null,
      clerk_org_id: baseInput.clerkOrgId,
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

    const result = await getRecord({
      ...actionInput,
      actingOrgRole: "org:admin",
    });

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
