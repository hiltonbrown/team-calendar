import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  currentUser: vi.fn(),
  completeXeroTenantSelection: vi.fn(),
  dispatchManualSync: vi.fn(),
  auditEventCreate: vi.fn(),
  xeroConnectionFindFirst: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@repo/auth/server", () => ({
  auth: mocks.auth,
  currentUser: mocks.currentUser,
}));
vi.mock("@repo/availability", () => ({
  dispatchManualSync: mocks.dispatchManualSync,
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
    mocks.dispatchManualSync.mockResolvedValue({
      ok: true,
      value: { eventName: "sync-xero-people", queued: true },
    });
  });

  it("enqueues an initial people sync after a successful connection", async () => {
    const result = await completeTenantSelectionAction(validInput);

    expect(result.ok).toBe(true);
    expect(mocks.dispatchManualSync).toHaveBeenCalledTimes(1);
    expect(mocks.dispatchManualSync).toHaveBeenCalledWith(
      expect.objectContaining({
        actingRole: "admin",
        actingUserId: "user_1",
        clerkOrgId: "org_1",
        organisationId: "33333333-3333-4333-8333-333333333333",
        runType: "people",
        xeroTenantId: "44444444-4444-4444-8444-444444444444",
      })
    );
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
      ok: false,
      error: { code: "unknown_error", message: "boom" },
    });

    const result = await completeTenantSelectionAction(validInput);

    expect(result.ok).toBe(false);
    expect(mocks.dispatchManualSync).not.toHaveBeenCalled();
  });
});
