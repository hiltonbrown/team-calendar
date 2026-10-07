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
  dispatchInitialXeroSync: vi.fn(),
  getXeroConnectionState: vi.fn(),
  revalidatePath: vi.fn(),
  sessionFind: vi.fn().mockResolvedValue(null),
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
vi.mock("@repo/jobs", () => ({
  dispatchInitialXeroSync: mocks.dispatchInitialXeroSync,
}));
vi.mock("@repo/xero", () => ({
  completeXeroTenantSelection: mocks.completeXeroTenantSelection,
}));
vi.mock("@repo/database/queries/xero-connection-state", () => ({
  getXeroConnectionState: mocks.getXeroConnectionState,
}));
vi.mock("@repo/database", () => ({
  database: {
    auditEvent: { create: mocks.auditEventCreate },
    xeroConnection: { findFirst: mocks.xeroConnectionFindFirst },
    xeroOAuthSession: { findFirst: mocks.sessionFind },
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
    vi.resetAllMocks();
    mocks.getXeroConnectionState.mockResolvedValue({
      ok: true,
      value: { state: "connected" },
    });
    mocks.xeroConnectionFindFirst.mockResolvedValue({
      id: "44444444-4444-4444-8444-444444444444",
    });
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
        connectionId: "44444444-4444-4444-8444-444444444444",
        organisationId: "33333333-3333-4333-8333-333333333333",
        returnTo: "/settings/integrations/xero",
      },
    });
    mocks.auditEventCreate.mockResolvedValue({});
    mocks.xeroConnectionFindFirst.mockResolvedValue({
      created_at: new Date("2026-09-19T00:00:00.000Z"),
    });
    mocks.dispatchInitialXeroSync.mockResolvedValue({
      ok: true,
      value: {
        eventName: "initial-xero-sync",
        ids: ["event_1"],
        queued: true,
      },
    });
  });
  it("dispatches durable initial sync after a successful connection", async () => {
    const result = await completeTenantSelectionAction(validInput);
    expect(result.ok).toBe(true);
    expect(mocks.dispatchInitialXeroSync).toHaveBeenCalledWith(
      expect.objectContaining({
        clerkOrgId: "org_1",
        connectionId: "44444444-4444-4444-8444-444444444444",
        organisationId: "33333333-3333-4333-8333-333333333333",
        triggeredByUserId: "user_1",
        triggerType: "manual",
      })
    );
    expect(mocks.completeXeroTenantSelection).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user_1" })
    );
    if (result.ok) {
      expect(result.value.redirectTo).toContain("/settings/integrations/xero");
    }
  });
  it("dispatches the selected canonical connection when status display is unavailable", async () => {
    mocks.getXeroConnectionState.mockResolvedValue({
      error: { code: "state_unavailable" },
      ok: false,
    });
    const result = await completeTenantSelectionAction(validInput);
    expect(result.ok).toBe(true);
    expect(mocks.dispatchInitialXeroSync).toHaveBeenCalledWith(
      expect.objectContaining({
        connectionId: "44444444-4444-4444-8444-444444444444",
      })
    );
  });
  it("does not dispatch a sync for unauthorised roles", async () => {
    mocks.auth.mockResolvedValue({ orgId: "org_1", orgRole: "org:member" });
    const result = await completeTenantSelectionAction(validInput);
    expect(result.ok).toBe(false);
    expect(mocks.completeXeroTenantSelection).not.toHaveBeenCalled();
    expect(mocks.dispatchInitialXeroSync).not.toHaveBeenCalled();
  });
  it("does not dispatch a sync when the connection fails", async () => {
    mocks.completeXeroTenantSelection.mockResolvedValue({
      error: { code: "unknown_error", message: "boom" },
      ok: false,
    });
    const result = await completeTenantSelectionAction(validInput);
    expect(result.ok).toBe(false);
    expect(mocks.dispatchInitialXeroSync).not.toHaveBeenCalled();
  });
  it("keeps a durable connection successful when initial sync dispatch throws", async () => {
    mocks.dispatchInitialXeroSync.mockRejectedValue(
      new Error("Inngest unavailable")
    );
    const result = await completeTenantSelectionAction(validInput);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.redirectTo).toContain("/settings/integrations/xero");
    }
  });
  it("keeps a durable connection successful when analytics flush fails", async () => {
    mocks.analyticsFlush.mockRejectedValue(new Error("analytics unavailable"));
    const result = await completeTenantSelectionAction(validInput);
    expect(result.ok).toBe(true);
    expect(mocks.dispatchInitialXeroSync).toHaveBeenCalledTimes(1);
  });
  it("uses the durable connection creation time for the activation event", async () => {
    const createdAt = new Date("2026-09-18T03:04:05.000Z");
    mocks.xeroConnectionFindFirst
      .mockResolvedValueOnce(null)
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
