import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Contract pinned from reconcile-xero-approval-state.ts:
 * input requires clerkOrgId, organisationId, xeroTenantId, optional triggerType
 * scheduled/manual/webhook defaulting to manual, and optional nullable
 * triggeredByUserId. @repo/xero imports are ensureFreshXeroConnection,
 * fetchLeaveApplicationStatusForRegion, toPlainLanguageMessage, and the
 * XeroLeaveApplicationStatus/XeroWriteError types. Xero APPROVED moves a
 * submitted record to approved; REJECTED moves submitted to declined; WITHDRAWN
 * or DELETED moves any non-withdrawn active record to withdrawn; not_found_error
 * records a per-record failure and archives the record by setting archived_at
 * and publish_status archived. auth_error and rate_limit_error are blanket
 * failures that fail the run immediately.
 */

vi.mock("server-only", () => ({}));

const mockEnsureFreshXeroConnection = vi.fn();
const mockFetchLeaveApplicationStatusForRegion = vi.fn();
const mockInngestSend = vi.fn(async () => ({ ids: ["event_1"] }));

vi.mock("../client", () => ({
  inngest: {
    createFunction: vi.fn(() => ({
      id: "reconcile-xero-approval-state",
    })),
    send: mockInngestSend,
  },
}));

vi.mock("@repo/xero", async (importOriginal) => {
  const original = await importOriginal<typeof import("@repo/xero")>();
  return {
    ...original,
    ensureFreshXeroConnection: (...args: unknown[]) =>
      mockEnsureFreshXeroConnection(...args),
    fetchLeaveApplicationStatusForRegion: (...args: unknown[]) =>
      mockFetchLeaveApplicationStatusForRegion(...args),
  };
});

await import("./setup-env");

let database: typeof import("@repo/database")["database"];
let reconcileXeroApprovalState: typeof import("./reconcile-xero-approval-state")["reconcileXeroApprovalState"];
const describeWithDatabase = process.env.DATABASE_URL
  ? describe
  : describe.skip;

if (process.env.DATABASE_URL) {
  ({ database } = await import("@repo/database"));
  ({ reconcileXeroApprovalState } = await import(
    "./reconcile-xero-approval-state"
  ));
}

const tenantA = {
  clerkOrgId: "org_test_reconcile_a",
  organisationId: "70000000-0000-4000-8000-000000000001",
  personId: "70000000-0000-4000-8000-000000000004",
  xeroConnectionId: "70000000-0000-4000-8000-000000000002",
  xeroEmployeeId: "70000000-0000-4000-8000-000000000005",
  xeroTenantId: "70000000-0000-4000-8000-000000000003",
} as const;

const tenantB = {
  clerkOrgId: "org_test_reconcile_b",
  organisationId: "80000000-0000-4000-8000-000000000001",
  personId: "80000000-0000-4000-8000-000000000004",
  xeroConnectionId: "80000000-0000-4000-8000-000000000002",
  xeroEmployeeId: "80000000-0000-4000-8000-000000000005",
  xeroTenantId: "80000000-0000-4000-8000-000000000003",
} as const;

const testClerkOrgIds = [tenantA.clerkOrgId, tenantB.clerkOrgId] as const;

describeWithDatabase("reconcile-xero-approval-state database flow", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockEnsureFreshXeroConnection.mockResolvedValue({
      ok: true,
      value: { refreshed: false },
    });
    await cleanTestData();
  });

  afterAll(async () => {
    await cleanTestData();
    await database.$disconnect();
  });

  it("transitions a submitted record to approved when Xero reports approved", async () => {
    await setupTenant(tenantA);
    await setupPerson(tenantA);
    const record = await createAvailabilityRecord(tenantA, {
      id: recordId("001"),
      sourceRemoteId: leaveApplicationId("approved"),
    });

    mockFetchLeaveApplicationStatusForRegion.mockResolvedValue(
      xeroStatus("APPROVED")
    );

    const result = await reconcileXeroApprovalState(reconcileInput(tenantA));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toMatchObject({
        approved: 1,
        failed: 0,
        status: "succeeded",
      });
    }

    const updated = await findRecord(record.id);
    expect(updated).toMatchObject({
      approval_status: "approved",
      derived_sequence: 1,
      xero_write_error: null,
    });
    expect(updated?.approved_at).toEqual(new Date("2026-06-10T00:00:00.000Z"));

    const auditEvents = await database.auditEvent.findMany({
      where: {
        clerk_org_id: tenantA.clerkOrgId,
        organisation_id: tenantA.organisationId,
        resource_id: record.id,
      },
    });
    expect(auditEvents).toHaveLength(1);
    expect(auditEvents[0]?.action).toBe(
      "availability_records.reconciled_to_approved"
    );

    const ownerNotification = await database.notification.findFirst({
      where: {
        clerk_org_id: tenantA.clerkOrgId,
        object_id: record.id,
        organisation_id: tenantA.organisationId,
        type: "leave_approved",
      },
    });
    expect(ownerNotification).toMatchObject({
      recipient_person_id: tenantA.personId,
      recipient_user_id: ownerUserId(tenantA),
      title: "Leave approved",
    });
  });

  it("transitions a submitted record to declined when Xero reports rejected", async () => {
    await setupTenant(tenantA);
    await setupPerson(tenantA);
    const record = await createAvailabilityRecord(tenantA, {
      id: recordId("002"),
      sourceRemoteId: leaveApplicationId("declined"),
    });

    mockFetchLeaveApplicationStatusForRegion.mockResolvedValue(
      xeroStatus("REJECTED")
    );

    const result = await reconcileXeroApprovalState(reconcileInput(tenantA));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toMatchObject({
        declined: 1,
        failed: 0,
        status: "succeeded",
      });
    }

    const updated = await findRecord(record.id);
    expect(updated).toMatchObject({
      approval_note: "Declined in Xero Payroll",
      approval_status: "declined",
      derived_sequence: 1,
    });

    const auditEvent = await database.auditEvent.findFirst({
      where: {
        clerk_org_id: tenantA.clerkOrgId,
        organisation_id: tenantA.organisationId,
        resource_id: record.id,
      },
    });
    expect(auditEvent?.action).toBe(
      "availability_records.reconciled_to_declined"
    );

    const ownerNotification = await database.notification.findFirst({
      where: {
        clerk_org_id: tenantA.clerkOrgId,
        object_id: record.id,
        organisation_id: tenantA.organisationId,
        type: "leave_declined",
      },
    });
    expect(ownerNotification).toMatchObject({
      recipient_person_id: tenantA.personId,
      recipient_user_id: ownerUserId(tenantA),
      title: "Leave declined",
    });
  });

  it("archives a submitted record when Xero reports it missing", async () => {
    await setupTenant(tenantA);
    await setupPerson(tenantA);
    const record = await createAvailabilityRecord(tenantA, {
      id: recordId("003"),
      sourceRemoteId: leaveApplicationId("missing"),
    });

    mockFetchLeaveApplicationStatusForRegion.mockResolvedValue(
      xeroError("not_found_error")
    );

    const result = await reconcileXeroApprovalState(reconcileInput(tenantA));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toMatchObject({
        archivedMissing: 1,
        failed: 1,
        status: "partial_success",
      });
    }

    const updated = await findRecord(record.id);
    expect(updated).toMatchObject({
      approval_status: "submitted",
      publish_status: "archived",
    });
    expect(updated?.archived_at).toBeInstanceOf(Date);

    const failedRecord = await database.failedRecord.findFirst({
      where: {
        clerk_org_id: tenantA.clerkOrgId,
        organisation_id: tenantA.organisationId,
        source_remote_id: leaveApplicationId("missing"),
      },
    });
    expect(failedRecord).toMatchObject({
      entity_type: "leave_records",
      error_code: "xero_application_missing",
      record_type: "annual_leave",
    });

    const auditEvent = await database.auditEvent.findFirst({
      where: {
        clerk_org_id: tenantA.clerkOrgId,
        organisation_id: tenantA.organisationId,
        resource_id: record.id,
      },
    });
    expect(auditEvent?.action).toBe(
      "availability_records.reconciled_to_archived_missing"
    );
  });

  it("keeps reconciling after a non-blanket per-record failure", async () => {
    await setupTenant(tenantA);
    await setupPerson(tenantA);
    const failed = await createAvailabilityRecord(tenantA, {
      id: recordId("004"),
      sourceRemoteId: leaveApplicationId("network"),
    });
    const approved = await createAvailabilityRecord(tenantA, {
      id: recordId("005"),
      sourceRemoteId: leaveApplicationId("after-failure"),
      startsAt: new Date("2026-07-03T00:00:00.000Z"),
      endsAt: new Date("2026-07-04T00:00:00.000Z"),
    });

    mockFetchLeaveApplicationStatusForRegion
      .mockResolvedValueOnce(xeroError("network_error"))
      .mockResolvedValueOnce(xeroStatus("APPROVED"));

    const result = await reconcileXeroApprovalState(reconcileInput(tenantA));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toMatchObject({
        approved: 1,
        failed: 1,
        status: "partial_success",
      });
    }

    expect(await findRecord(failed.id)).toMatchObject({
      approval_status: "submitted",
      derived_sequence: 0,
    });
    expect(await findRecord(approved.id)).toMatchObject({
      approval_status: "approved",
      derived_sequence: 1,
    });

    const failedRecords = await database.failedRecord.findMany({
      where: {
        clerk_org_id: tenantA.clerkOrgId,
        organisation_id: tenantA.organisationId,
      },
    });
    expect(failedRecords).toHaveLength(1);
    expect(failedRecords[0]).toMatchObject({
      error_code: "network_error",
      source_remote_id: leaveApplicationId("network"),
    });

    const run = await latestRun(tenantA);
    expect(run).toMatchObject({
      records_failed: 1,
      records_synced: 1,
      status: "partial_success",
    });
  });

  it("fails the run immediately on a blanket Xero error", async () => {
    await setupTenant(tenantA);
    await setupPerson(tenantA);
    const first = await createAvailabilityRecord(tenantA, {
      id: recordId("006"),
      sourceRemoteId: leaveApplicationId("auth"),
    });
    const second = await createAvailabilityRecord(tenantA, {
      id: recordId("007"),
      sourceRemoteId: leaveApplicationId("after-auth"),
      startsAt: new Date("2026-07-05T00:00:00.000Z"),
      endsAt: new Date("2026-07-06T00:00:00.000Z"),
    });

    mockFetchLeaveApplicationStatusForRegion.mockResolvedValue(
      xeroError("auth_error")
    );

    const result = await reconcileXeroApprovalState(reconcileInput(tenantA));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toMatchObject({
        approved: 0,
        failed: 0,
        status: "failed",
      });
    }

    expect(mockFetchLeaveApplicationStatusForRegion).toHaveBeenCalledTimes(1);
    expect(await findRecord(first.id)).toMatchObject({
      approval_status: "submitted",
      derived_sequence: 0,
    });
    expect(await findRecord(second.id)).toMatchObject({
      approval_status: "submitted",
      derived_sequence: 0,
    });
    expect(
      await database.failedRecord.count({
        where: {
          clerk_org_id: tenantA.clerkOrgId,
          organisation_id: tenantA.organisationId,
        },
      })
    ).toBe(0);

    const run = await latestRun(tenantA);
    expect(run).toMatchObject({
      error_summary:
        "Your Xero connection needs to be reauthorised. Ask an administrator to reconnect Xero in Settings > Integrations.",
      records_failed: 0,
      records_synced: 0,
      status: "failed",
    });
  });

  it("scopes reconciliation to the requested tenant", async () => {
    await setupTenant(tenantA);
    await setupPerson(tenantA);
    await setupTenant(tenantB);
    await setupPerson(tenantB);
    const tenantARecord = await createAvailabilityRecord(tenantA, {
      id: recordId("008"),
      sourceRemoteId: sharedLeaveApplicationId(),
    });
    const tenantBRecord = await createAvailabilityRecord(tenantB, {
      id: recordId("009"),
      sourceRemoteId: sharedLeaveApplicationId(),
    });
    const tenantBBefore = await findRecord(tenantBRecord.id);

    mockFetchLeaveApplicationStatusForRegion.mockResolvedValue(
      xeroStatus("APPROVED")
    );

    const result = await reconcileXeroApprovalState(reconcileInput(tenantA));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toMatchObject({
        approved: 1,
        status: "succeeded",
      });
    }

    expect(await findRecord(tenantARecord.id)).toMatchObject({
      approval_status: "approved",
      derived_sequence: 1,
    });
    const tenantBAfter = await findRecord(tenantBRecord.id);
    expect(tenantBAfter).toMatchObject({
      approval_status: "submitted",
      derived_sequence: 0,
      updated_at: tenantBBefore?.updated_at,
    });
  });

  it("returns a validation error for invalid input", async () => {
    const result = await reconcileXeroApprovalState({});

    expect(result).toMatchObject({
      error: { code: "validation_error" },
      ok: false,
    });
    expect(mockEnsureFreshXeroConnection).not.toHaveBeenCalled();
    expect(mockFetchLeaveApplicationStatusForRegion).not.toHaveBeenCalled();
  });
});

type TestTenant = typeof tenantA | typeof tenantB;

async function setupTenant(tenant: TestTenant) {
  await database.organisation.create({
    data: {
      clerk_org_id: tenant.clerkOrgId,
      country_code: "AU",
      id: tenant.organisationId,
      name: `Test Org ${tenant.clerkOrgId}`,
    },
  });

  await database.xeroConnection.create({
    data: {
      access_token_encrypted: "encrypted-token",
      clerk_org_id: tenant.clerkOrgId,
      expires_at: new Date(Date.now() + 3_600_000),
      id: tenant.xeroConnectionId,
      organisation_id: tenant.organisationId,
      status: "active",
    },
  });

  await database.xeroTenant.create({
    data: {
      clerk_org_id: tenant.clerkOrgId,
      id: tenant.xeroTenantId,
      organisation_id: tenant.organisationId,
      payroll_region: "AU",
      tenant_name: "Xero Tenant",
      xero_connection_id: tenant.xeroConnectionId,
      xero_tenant_id: `xero-${tenant.xeroTenantId}`,
    },
  });
}

async function setupPerson(tenant: TestTenant) {
  await database.person.create({
    data: {
      clerk_org_id: tenant.clerkOrgId,
      clerk_user_id: ownerUserId(tenant),
      email: `${tenant.personId}@example.com`,
      employment_type: "employee",
      first_name: "Pat",
      id: tenant.personId,
      last_name: "Taylor",
      organisation_id: tenant.organisationId,
      source_person_key: tenant.xeroEmployeeId,
      source_system: "XERO",
      xero_employee_id: tenant.xeroEmployeeId,
    },
  });
}

async function createAvailabilityRecord(
  tenant: TestTenant,
  input: {
    endsAt?: Date;
    id: string;
    sourceRemoteId: string;
    startsAt?: Date;
  }
) {
  return await database.availabilityRecord.create({
    data: {
      all_day: true,
      approval_status: "submitted",
      clerk_org_id: tenant.clerkOrgId,
      contactability: "unavailable",
      derived_uid_key: `${tenant.clerkOrgId}-${input.sourceRemoteId}`,
      ends_at: input.endsAt ?? new Date("2026-07-02T00:00:00.000Z"),
      id: input.id,
      organisation_id: tenant.organisationId,
      person_id: tenant.personId,
      privacy_mode: "named",
      publish_status: "eligible",
      record_type: "annual_leave",
      source_remote_id: input.sourceRemoteId,
      source_type: "xero_leave",
      starts_at: input.startsAt ?? new Date("2026-07-01T00:00:00.000Z"),
    },
  });
}

async function findRecord(id: string) {
  return await database.availabilityRecord.findUnique({
    where: { id },
  });
}

async function latestRun(tenant: TestTenant) {
  return await database.syncRun.findFirst({
    orderBy: { started_at: "desc" },
    where: {
      clerk_org_id: tenant.clerkOrgId,
      organisation_id: tenant.organisationId,
      run_type: "approval_state_reconciliation",
    },
  });
}

function reconcileInput(tenant: TestTenant) {
  return {
    clerkOrgId: tenant.clerkOrgId,
    organisationId: tenant.organisationId,
    triggeredByUserId: triggerUserId(tenant),
    triggerType: "manual",
    xeroTenantId: tenant.xeroTenantId,
  };
}

function xeroStatus(status: XeroStatus) {
  return {
    ok: true,
    value: {
      approvedAt:
        status === "APPROVED" ? new Date("2026-06-10T00:00:00.000Z") : null,
      rawResponse: { Status: status },
      status,
    },
  };
}

function xeroError(code: XeroErrorCode) {
  return {
    error: {
      code,
      message: `${code} from Xero`,
      rawPayload: { code },
    },
    ok: false,
  };
}

type XeroStatus =
  | "APPROVED"
  | "DELETED"
  | "REJECTED"
  | "SUBMITTED"
  | "UNKNOWN"
  | "WITHDRAWN";

type XeroErrorCode =
  | "auth_error"
  | "conflict_error"
  | "network_error"
  | "not_found_error"
  | "rate_limit_error"
  | "unknown_error"
  | "validation_error";

function ownerUserId(tenant: TestTenant) {
  return `user_${tenant.clerkOrgId}_owner`;
}

function triggerUserId(tenant: TestTenant) {
  return `user_${tenant.clerkOrgId}_trigger`;
}

function recordId(suffix: string) {
  return `90000000-0000-4000-8000-000000000${suffix}`;
}

function leaveApplicationId(suffix: string) {
  return `xero-leave-${suffix}`;
}

function sharedLeaveApplicationId() {
  return "xero-leave-shared";
}

async function cleanTestData() {
  const scope = { clerk_org_id: { in: [...testClerkOrgIds] } };
  await database.notificationEmailQueue.deleteMany({ where: scope });
  await database.notification.deleteMany({ where: scope });
  await database.failedRecord.deleteMany({ where: scope });
  await database.syncRun.deleteMany({ where: scope });
  await database.auditEvent.deleteMany({ where: scope });
  await database.availabilityRecord.deleteMany({ where: scope });
  await database.person.deleteMany({ where: scope });
  await database.xeroTenant.deleteMany({ where: scope });
  await database.xeroConnection.deleteMany({ where: scope });
  await database.organisation.deleteMany({ where: scope });
}
