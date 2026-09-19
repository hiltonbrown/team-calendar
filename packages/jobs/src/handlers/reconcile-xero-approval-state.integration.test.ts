import { allocateLiveTestFixture } from "@repo/database/live-test-fixture";
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

const fixture = allocateLiveTestFixture(
  "packages/jobs/src/handlers/reconcile-xero-approval-state.integration.test.ts"
);
const { database } = await import("@repo/database");
const { reconcileXeroApprovalState } = await import(
  "./reconcile-xero-approval-state"
);

const tenantA = {
  clerkOrgId: fixture.tenants[0]?.clerkOrgId as string,
  organisationId: fixture.tenants[0]?.organisationId as string,
  personId: fixture.id("person", 0),
  xeroConnectionId: fixture.id("connection", 0),
  xeroEmployeeId: fixture.id("employee", 0),
  xeroTenantId: fixture.id("tenant", 0),
} as const;

const tenantB = {
  clerkOrgId: fixture.tenants[1]?.clerkOrgId as string,
  organisationId: fixture.tenants[1]?.organisationId as string,
  personId: fixture.id("person", 1),
  xeroConnectionId: fixture.id("connection", 1),
  xeroEmployeeId: fixture.id("employee", 1),
  xeroTenantId: fixture.id("tenant", 1),
} as const;

const testClerkOrgIds = [tenantA.clerkOrgId, tenantB.clerkOrgId] as const;

describe("reconcile-xero-approval-state database flow", () => {
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

  it("transitions a failed withdrawal to withdrawn when Xero reports rejected", async () => {
    await setupTenant(tenantA);
    await setupPerson(tenantA);
    const record = await createAvailabilityRecord(tenantA, {
      approvalStatus: "xero_sync_failed",
      failedAction: "withdraw",
      id: recordId("010"),
      sourceRemoteId: leaveApplicationId("withdrawn"),
    });
    mockFetchLeaveApplicationStatusForRegion.mockResolvedValue(
      xeroStatus("REJECTED")
    );

    const result = await reconcileXeroApprovalState(reconcileInput(tenantA));

    expect(result).toMatchObject({
      ok: true,
      value: { withdrawn: 1 },
    });
    expect(await findRecord(record.id)).toMatchObject({
      approval_status: "withdrawn",
      failed_action: null,
    });
  });

  it("transitions a failed approval to approved when Xero reports approved", async () => {
    await setupTenant(tenantA);
    await setupPerson(tenantA);
    const record = await createAvailabilityRecord(tenantA, {
      approvalStatus: "xero_sync_failed",
      failedAction: "approve",
      id: recordId("011"),
      sourceRemoteId: leaveApplicationId("approved-after-failure"),
    });
    mockFetchLeaveApplicationStatusForRegion.mockResolvedValue(
      xeroStatus("APPROVED")
    );

    const result = await reconcileXeroApprovalState(reconcileInput(tenantA));

    expect(result).toMatchObject({
      ok: true,
      value: { approved: 1 },
    });
    expect(await findRecord(record.id)).toMatchObject({
      approval_status: "approved",
      failed_action: null,
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
        failed: 0,
        status: "succeeded",
      });
    }

    const updated = await findRecord(record.id);
    expect(updated).toMatchObject({
      approval_status: "submitted",
      publish_status: "archived",
    });
    expect(updated?.archived_at).toBeInstanceOf(Date);
    expect(updated?.xero_approval_checked_at).toBeInstanceOf(Date);

    const failedRecord = await database.failedRecord.findFirst({
      where: {
        clerk_org_id: tenantA.clerkOrgId,
        organisation_id: tenantA.organisationId,
        source_remote_id: leaveApplicationId("missing"),
      },
    });
    expect(failedRecord).toBeNull();

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
      endsAt: new Date("2026-07-04T00:00:00.000Z"),
      id: recordId("005"),
      sourceRemoteId: leaveApplicationId("after-failure"),
      startsAt: new Date("2026-07-03T00:00:00.000Z"),
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
      endsAt: new Date("2026-07-06T00:00:00.000Z"),
      id: recordId("007"),
      sourceRemoteId: leaveApplicationId("after-auth"),
      startsAt: new Date("2026-07-05T00:00:00.000Z"),
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

    // Records within a batch (BATCH_SIZE) reconcile concurrently, so both
    // records here are fetched before the blanket error halts the run.
    expect(mockFetchLeaveApplicationStatusForRegion).toHaveBeenCalledTimes(2);
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

  it("orders null markers first and advances beyond the first 500 rows across runs without starving remaining candidates", async () => {
    await setupTenant(tenantA);
    await setupPerson(tenantA);

    const now = new Date();
    const count = 505;
    const recordsData = Array.from({ length: count }, (_, i) => ({
      all_day: true,
      approval_status: "submitted" as const,
      clerk_org_id: tenantA.clerkOrgId,
      contactability: "unavailable" as const,
      derived_uid_key: `${tenantA.clerkOrgId}-leave-fairness-${i}`,
      ends_at: new Date(now.getTime() + 86_400_000),
      id: `bb100000-0000-4000-8000-${String(i).padStart(12, "0")}`,
      organisation_id: tenantA.organisationId,
      person_id: tenantA.personId,
      privacy_mode: "named" as const,
      publish_status: "eligible" as const,
      record_type: "annual_leave" as const,
      source_remote_id: `xero-leave-fairness-${i}`,
      source_type: "xero_leave" as const,
      starts_at: now,
      xero_approval_checked_at: null,
    }));

    await database.availabilityRecord.createMany({
      data: recordsData,
    });

    mockFetchLeaveApplicationStatusForRegion.mockResolvedValue(
      xeroStatus("APPROVED")
    );

    // Run 1
    const run1 = await reconcileXeroApprovalState(reconcileInput(tenantA));
    expect(run1).toMatchObject({
      ok: true,
      value: {
        approved: 500,
        partial: true,
        status: "partial_success",
      },
    });

    // Run 1 processed 500 records; 5 records remain with xero_approval_checked_at: null
    const uncheckedAfterRun1 = await database.availabilityRecord.count({
      where: {
        clerk_org_id: tenantA.clerkOrgId,
        organisation_id: tenantA.organisationId,
        xero_approval_checked_at: null,
      },
    });
    expect(uncheckedAfterRun1).toBe(5);

    // Run 2: starts by picking the 5 null-checked records first
    const run2 = await reconcileXeroApprovalState(reconcileInput(tenantA));
    expect(run2).toMatchObject({
      ok: true,
      value: {
        partial: true,
        status: "partial_success",
      },
    });

    // After run 2, all 505 records have been checked at least once
    const uncheckedAfterRun2 = await database.availabilityRecord.count({
      where: {
        clerk_org_id: tenantA.clerkOrgId,
        organisation_id: tenantA.organisationId,
        xero_approval_checked_at: null,
      },
    });
    expect(uncheckedAfterRun2).toBe(0);
  }, 120_000);

  it("fails the run immediately on a blanket permission_error (403)", async () => {
    await setupTenant(tenantA);
    await setupPerson(tenantA);
    const first = await createAvailabilityRecord(tenantA, {
      id: recordId("012"),
      sourceRemoteId: leaveApplicationId("perm-first"),
    });
    const second = await createAvailabilityRecord(tenantA, {
      endsAt: new Date("2026-07-06T00:00:00.000Z"),
      id: recordId("013"),
      sourceRemoteId: leaveApplicationId("perm-second"),
      startsAt: new Date("2026-07-05T00:00:00.000Z"),
    });

    mockFetchLeaveApplicationStatusForRegion.mockResolvedValue(
      xeroError("permission_error")
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
        "Your Xero organisation does not have permission to access this payroll feature. Check your Xero subscription and permissions.",
      records_failed: 0,
      records_synced: 0,
      status: "failed",
    });
  });

  it("passes employee and leave IDs to regional reader and reconciles NZ leave", async () => {
    await setupTenant(tenantA, "NZ");
    await setupPerson(tenantA);
    const record = await createAvailabilityRecord(tenantA, {
      id: recordId("014"),
      sourceRemoteId: leaveApplicationId("nz-leave"),
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

    expect(mockFetchLeaveApplicationStatusForRegion).toHaveBeenCalledWith(
      "NZ",
      expect.objectContaining({
        xeroEmployeeId: tenantA.xeroEmployeeId,
        xeroLeaveApplicationId: leaveApplicationId("nz-leave"),
        xeroTenant: expect.objectContaining({
          id: tenantA.xeroTenantId,
          payroll_region: "NZ",
        }),
      })
    );

    const updated = await findRecord(record.id);
    expect(updated).toMatchObject({
      approval_status: "approved",
      derived_sequence: 1,
    });
  });

  it("treats missing employee ID on regional leave as a record failure and advances fairly", async () => {
    await setupTenant(tenantA, "NZ");
    await database.person.upsert({
      create: {
        clerk_org_id: tenantA.clerkOrgId,
        clerk_user_id: ownerUserId(tenantA),
        email: `${tenantA.personId}@example.com`,
        employment_type: "employee",
        first_name: "Pat",
        id: tenantA.personId,
        last_name: "Taylor",
        organisation_id: tenantA.organisationId,
        source_person_key: "manual-key",
        source_system: "MANUAL",
        xero_employee_id: null,
      },
      update: {
        clerk_org_id: tenantA.clerkOrgId,
        clerk_user_id: ownerUserId(tenantA),
        email: `${tenantA.personId}@example.com`,
        employment_type: "employee",
        first_name: "Pat",
        last_name: "Taylor",
        organisation_id: tenantA.organisationId,
        source_person_key: "manual-key",
        source_system: "MANUAL",
        xero_employee_id: null,
      },
      where: { id: tenantA.personId },
    });

    const failed = await createAvailabilityRecord(tenantA, {
      id: recordId("015"),
      sourceRemoteId: leaveApplicationId("missing-emp"),
    });

    mockFetchLeaveApplicationStatusForRegion.mockResolvedValue({
      error: {
        code: "validation_error",
        message: "NZ payroll approval-state read requires xeroEmployeeId.",
        rawPayload: null,
      },
      ok: false,
    });

    const result = await reconcileXeroApprovalState(reconcileInput(tenantA));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toMatchObject({
        failed: 1,
        status: "partial_success",
      });
    }

    expect(mockFetchLeaveApplicationStatusForRegion).toHaveBeenCalledWith(
      "NZ",
      expect.objectContaining({
        xeroEmployeeId: undefined,
        xeroLeaveApplicationId: leaveApplicationId("missing-emp"),
      })
    );

    const updated = await findRecord(failed.id);
    expect(updated?.xero_approval_checked_at).toBeInstanceOf(Date);

    const failedRecord = await database.failedRecord.findFirst({
      where: {
        clerk_org_id: tenantA.clerkOrgId,
        organisation_id: tenantA.organisationId,
        source_remote_id: leaveApplicationId("missing-emp"),
      },
    });
    expect(failedRecord).toMatchObject({
      error_code: "validation_error",
      source_remote_id: leaveApplicationId("missing-emp"),
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

async function setupTenant(
  tenant: TestTenant,
  region: "AU" | "NZ" | "UK" = "AU"
) {
  await database.organisation.upsert({
    create: {
      clerk_org_id: tenant.clerkOrgId,
      country_code: region,
      id: tenant.organisationId,
      name: `Test Org ${tenant.clerkOrgId}`,
    },
    update: {
      clerk_org_id: tenant.clerkOrgId,
      country_code: region,
      name: `Test Org ${tenant.clerkOrgId}`,
    },
    where: { id: tenant.organisationId },
  });

  await database.xeroConnection.upsert({
    create: {
      access_token_encrypted: "encrypted-token",
      clerk_org_id: tenant.clerkOrgId,
      expires_at: new Date(Date.now() + 3_600_000),
      id: tenant.xeroConnectionId,
      organisation_id: tenant.organisationId,
      status: "active",
    },
    update: {
      access_token_encrypted: "encrypted-token",
      clerk_org_id: tenant.clerkOrgId,
      expires_at: new Date(Date.now() + 3_600_000),
      organisation_id: tenant.organisationId,
      status: "active",
    },
    where: { id: tenant.xeroConnectionId },
  });

  await database.xeroTenant.upsert({
    create: {
      clerk_org_id: tenant.clerkOrgId,
      id: tenant.xeroTenantId,
      organisation_id: tenant.organisationId,
      payroll_region: region,
      tenant_name: "Xero Tenant",
      xero_connection_id: tenant.xeroConnectionId,
      xero_tenant_id: `xero-${tenant.xeroTenantId}`,
    },
    update: {
      clerk_org_id: tenant.clerkOrgId,
      organisation_id: tenant.organisationId,
      payroll_region: region,
      tenant_name: "Xero Tenant",
      xero_connection_id: tenant.xeroConnectionId,
      xero_tenant_id: `xero-${tenant.xeroTenantId}`,
    },
    where: { id: tenant.xeroTenantId },
  });
}

async function setupPerson(tenant: TestTenant) {
  await database.person.upsert({
    create: {
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
    update: {
      clerk_org_id: tenant.clerkOrgId,
      clerk_user_id: ownerUserId(tenant),
      email: `${tenant.personId}@example.com`,
      employment_type: "employee",
      first_name: "Pat",
      last_name: "Taylor",
      organisation_id: tenant.organisationId,
      source_person_key: tenant.xeroEmployeeId,
      source_system: "XERO",
      xero_employee_id: tenant.xeroEmployeeId,
    },
    where: { id: tenant.personId },
  });
}

async function createAvailabilityRecord(
  tenant: TestTenant,
  input: {
    approvalStatus?: "submitted" | "xero_sync_failed";
    endsAt?: Date;
    failedAction?: "approve" | "withdraw";
    id: string;
    sourceRemoteId: string;
    startsAt?: Date;
  }
) {
  return await database.availabilityRecord.create({
    data: {
      all_day: true,
      approval_status: input.approvalStatus ?? "submitted",
      clerk_org_id: tenant.clerkOrgId,
      contactability: "unavailable",
      derived_uid_key: `${tenant.clerkOrgId}-${input.sourceRemoteId}`,
      ends_at: input.endsAt ?? new Date("2026-07-02T00:00:00.000Z"),
      failed_action: input.failedAction ?? null,
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
  | "permission_error"
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
  return `a3000000-0000-4000-8000-000000000${suffix}`;
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
