import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  analyticsCapture: vi.fn(),
  analyticsFlush: vi.fn(),
  analyticsShutdown: vi.fn(),
  auditEventCreate: vi.fn(),
  auth: vi.fn(),
  completeXeroTenantSelection: vi.fn(),
  createActivationEvent: vi.fn((input: { name: string }) => ({
    distinctId: "subject",
    event: input.name,
    properties: { event_version: 1 },
    timestamp: "2026-09-19T00:00:00.000Z",
    uuid: `uuid-${input.name}`,
  })),
  currentUser: vi.fn(),
  dispatchManualSync: vi.fn(),
  revalidatePath: vi.fn(),
  syncXeroLeaveBalances: vi.fn(),
  syncXeroLeaveRecords: vi.fn(),
  syncXeroPeople: vi.fn(),
  xeroConnectionFindFirst: vi.fn(),
}));

vi.mock("@repo/analytics/activation-events", () => ({
  createActivationEvent: mocks.createActivationEvent,
}));
vi.mock("@repo/analytics/server", () => ({
  analytics: {
    capture: mocks.analyticsCapture,
    flush: mocks.analyticsFlush,
    shutdown: mocks.analyticsShutdown,
  },
}));
vi.mock("@repo/auth/server", () => ({
  auth: mocks.auth,
  currentUser: mocks.currentUser,
}));
vi.mock("@repo/availability", () => ({
  dispatchManualSync: mocks.dispatchManualSync,
}));
vi.mock("@repo/jobs", () => ({
  syncXeroLeaveBalances: mocks.syncXeroLeaveBalances,
  syncXeroLeaveRecords: mocks.syncXeroLeaveRecords,
  syncXeroPeople: mocks.syncXeroPeople,
}));
vi.mock("@repo/xero", () => ({
  completeXeroTenantSelection: mocks.completeXeroTenantSelection,
}));
vi.mock("@repo/database", () => ({
  database: {
    auditEvent: { create: mocks.auditEventCreate },
    xeroConnection: { findFirst: mocks.xeroConnectionFindFirst },
  },
}));
vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));

const { completeTenantSelectionAction } = await import("./_actions");

const validInput = {
  sessionId: "11111111-1111-4111-8111-111111111111",
  tenantId: "xero-tenant-abc",
};

describe("completeTenantSelectionAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.analyticsShutdown.mockResolvedValue(undefined);
    mocks.analyticsFlush.mockResolvedValue(undefined);
    mocks.auth.mockResolvedValue({ orgId: "org_1", orgRole: "org:admin" });
    mocks.currentUser.mockResolvedValue({
      emailAddresses: [{ emailAddress: "admin@example.com" }],
      firstName: "Admin",
      id: "user_1",
      lastName: "User",
    });
    mocks.completeXeroTenantSelection.mockResolvedValue({
      ok: true,
      value: {
        connectionId: "22222222-2222-4222-8222-222222222222",
        organisationId: "33333333-3333-4333-8333-333333333333",
        returnTo: "/settings/integrations/xero",
        xeroTenantId: "44444444-4444-4444-8444-444444444444",
      },
    });
    mocks.auditEventCreate.mockResolvedValue({});
    mocks.xeroConnectionFindFirst.mockResolvedValue({
      created_at: new Date("2026-09-19T00:00:00.000Z"),
    });
    mocks.dispatchManualSync.mockResolvedValue({
      ok: true,
      value: { eventName: "sync-xero-people", queued: true },
    });
  });

  it("enqueues complete initial sync (people, leave-records, leave-balances) after a successful connection", async () => {
    const result = await completeTenantSelectionAction(validInput);

    expect(result.ok).toBe(true);
    expect(mocks.syncXeroPeople).toHaveBeenCalledWith(
      expect.objectContaining({
        clerkOrgId: "org_1",
        organisationId: "33333333-3333-4333-8333-333333333333",
        triggeredByUserId: "user_1",
        triggerType: "manual",
        xeroTenantId: "44444444-4444-4444-8444-444444444444",
      })
    );
    expect(mocks.syncXeroLeaveRecords).toHaveBeenCalledWith(
      expect.objectContaining({
        clerkOrgId: "org_1",
        organisationId: "33333333-3333-4333-8333-333333333333",
        xeroTenantId: "44444444-4444-4444-8444-444444444444",
      })
    );
    expect(mocks.syncXeroLeaveBalances).toHaveBeenCalledWith(
      expect.objectContaining({
        clerkOrgId: "org_1",
        organisationId: "33333333-3333-4333-8333-333333333333",
        xeroTenantId: "44444444-4444-4444-8444-444444444444",
      })
    );
    expect(mocks.dispatchManualSync).toHaveBeenCalledTimes(3);
    expect(mocks.completeXeroTenantSelection).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user_1" })
    );
    for (const runType of ["people", "leave_records", "leave_balances"]) {
      expect(mocks.dispatchManualSync).toHaveBeenCalledWith(
        expect.objectContaining({
          actingRole: "admin",
          actingUserId: "user_1",
          clerkOrgId: "org_1",
          organisationId: "33333333-3333-4333-8333-333333333333",
          runType,
          xeroTenantId: "44444444-4444-4444-8444-444444444444",
        })
      );
    }
  });

  it("maps the owner role when dispatching the initial sync", async () => {
    mocks.auth.mockResolvedValue({ orgId: "org_1", orgRole: "org:owner" });

    await completeTenantSelectionAction(validInput);

    expect(mocks.dispatchManualSync).toHaveBeenCalledWith(
      expect.objectContaining({ actingRole: "owner", runType: "people" })
    );
  });

  it("does not dispatch a sync for unauthorised roles", async () => {
    mocks.auth.mockResolvedValue({ orgId: "org_1", orgRole: "org:member" });

    const result = await completeTenantSelectionAction(validInput);

    expect(result.ok).toBe(false);
    expect(mocks.completeXeroTenantSelection).not.toHaveBeenCalled();
    expect(mocks.dispatchManualSync).not.toHaveBeenCalled();
  });

  it("does not dispatch a sync when the connection fails", async () => {
    mocks.completeXeroTenantSelection.mockResolvedValue({
      error: { code: "unknown_error", message: "boom" },
      ok: false,
    });

    const result = await completeTenantSelectionAction(validInput);

    expect(result.ok).toBe(false);
    expect(mocks.dispatchManualSync).not.toHaveBeenCalled();
  });

  it("keeps a durable connection successful when analytics flush fails", async () => {
    mocks.analyticsFlush.mockRejectedValue(new Error("analytics unavailable"));

    const result = await completeTenantSelectionAction(validInput);

    expect(result.ok).toBe(true);
    expect(mocks.dispatchManualSync).toHaveBeenCalledTimes(3);
  });

  it("uses the durable connection creation time for the activation event", async () => {
    const createdAt = new Date("2026-09-18T03:04:05.000Z");
    mocks.xeroConnectionFindFirst
      .mockResolvedValueOnce({ id: "existing-connection" })
      .mockResolvedValueOnce({ created_at: createdAt });

    await completeTenantSelectionAction({
      ...validInput,
      organisationId: "33333333-3333-4333-8333-333333333333",
    });

    expect(mocks.createActivationEvent).toHaveBeenCalledWith(
      expect.objectContaining({ occurredAt: createdAt })
    );
  });
});
