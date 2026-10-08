import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  coreKeys: vi.fn(),
  currentUser: vi.fn(),
  database: {
    $transaction: vi.fn(),
    auditEvent: { create: vi.fn() },
    organisation: { findFirst: vi.fn() },
    xeroConnection: { findFirst: vi.fn(), updateMany: vi.fn() },
  },
  disconnectXeroOAuthConnection: vi.fn(),
  getActiveOrgContext: vi.fn(),
  headers: vi.fn(),
  revalidatePath: vi.fn(),
  transaction: {
    auditEvent: { create: vi.fn() },
    xeroConnection: { updateMany: vi.fn() },
  },
}));
vi.mock("@repo/auth/server", () => ({
  auth: mocks.auth,
  currentUser: mocks.currentUser,
}));
vi.mock("@repo/database", () => ({
  database: mocks.database,
}));
vi.mock("@repo/next-config/keys", () => ({
  keys: mocks.coreKeys,
}));
vi.mock("@repo/xero", () => ({
  disconnectXeroOAuthConnection: mocks.disconnectXeroOAuthConnection,
}));
vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));
vi.mock("next/headers", () => ({
  headers: mocks.headers,
}));
vi.mock("@/lib/server/get-active-org-context", () => ({
  getActiveOrgContext: mocks.getActiveOrgContext,
}));
const actions = await import("./_actions");
const {
  connectXeroAction,
  disconnectXeroAction,
  pauseTenantSyncAction,
  resumeTenantSyncAction,
} = actions;
const organisationId = "00000000-0000-4000-8000-000000000001";
const connectionId = "00000000-0000-4000-8000-000000000002";
const clerkOrgId = "org_123";
const userId = "user_456";
const orgName = "Acme Corp";
describe("xero settings integration server actions", () => {
  it("does not expose a manual token refresh server action", () => {
    expect("refreshXeroConnectionAction" in actions).toBe(false);
  });
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.auth.mockResolvedValue({ orgRole: "org:admin" });
    mocks.currentUser.mockResolvedValue({
      emailAddresses: [{ emailAddress: "admin@example.com" }],
      firstName: "Admin",
      id: userId,
      lastName: "User",
    });
    mocks.getActiveOrgContext.mockResolvedValue({
      ok: true,
      value: { clerkOrgId, organisationId },
    });
    mocks.headers.mockResolvedValue(new Headers());
    mocks.coreKeys.mockReturnValue({
      NEXT_PUBLIC_API_URL: "https://api.example.com",
    });
    mocks.database.organisation.findFirst.mockResolvedValue({ name: orgName });
    mocks.database.xeroConnection.findFirst.mockResolvedValue({
      id: connectionId,
    });
    mocks.database.auditEvent.create.mockResolvedValue({});
    mocks.transaction.auditEvent.create.mockResolvedValue({});
    mocks.transaction.xeroConnection.updateMany.mockResolvedValue({ count: 1 });
    mocks.database.$transaction.mockImplementation((operation) =>
      operation(mocks.transaction)
    );
    mocks.disconnectXeroOAuthConnection.mockResolvedValue({
      ok: true,
      value: { connectionId, state: "disconnected" },
    });
  });

  describe("baseline authorization and scoping tests", () => {
    it("rejects unauthenticated callers for all actions", async () => {
      mocks.currentUser.mockResolvedValue(null);
      const resConnect = await connectXeroAction({ organisationId });
      expect(resConnect).toEqual({
        error: {
          code: "not_authorised",
          message: "Only admins and owners can manage Xero settings.",
        },
        ok: false,
      });
      const resDisconnect = await disconnectXeroAction({
        confirmationText: orgName,
        connectionId,
        mode: "destructive",
        organisationId,
      });
      expect(resDisconnect.ok).toBe(false);
      expect(mocks.disconnectXeroOAuthConnection).not.toHaveBeenCalled();
    });
    it.each(["org:manager", "org:viewer", "org:member", null])(
      "rejects role %s without calling the disconnect service",
      async (orgRole) => {
        mocks.auth.mockResolvedValue({ orgRole });
        const resDisconnect = await disconnectXeroAction({
          confirmationText: orgName,
          connectionId,
          mode: "destructive",
          organisationId,
        });
        expect(resDisconnect).toEqual({
          error: {
            code: "not_authorised",
            message: "Only admins and owners can manage Xero settings.",
          },
          ok: false,
        });
        expect(mocks.disconnectXeroOAuthConnection).not.toHaveBeenCalled();
      }
    );
    it("rejects an organisation outside the active Clerk account without calling the service", async () => {
      mocks.getActiveOrgContext.mockResolvedValue({
        error: { code: "not_found" },
        ok: false,
      });
      const result = await disconnectXeroAction({
        confirmationText: orgName,
        connectionId,
        mode: "soft",
        organisationId,
      });
      expect(result.ok).toBe(false);
      expect(mocks.database.organisation.findFirst).not.toHaveBeenCalled();
      expect(mocks.disconnectXeroOAuthConnection).not.toHaveBeenCalled();
    });
    it("rejects malformed inputs for actions", async () => {
      const resConnect = await connectXeroAction({
        organisationId: "invalid-uuid",
      });
      expect(resConnect.ok).toBe(false);
      if (!resConnect.ok) {
        expect(resConnect.error.code).toBe("validation_error");
      }
      const resDisconnect = await disconnectXeroAction({
        confirmationText: orgName,
        connectionId: "invalid-uuid",
        mode: "destructive",
        organisationId,
      });
      expect(resDisconnect.ok).toBe(false);
      expect(mocks.disconnectXeroOAuthConnection).not.toHaveBeenCalled();
    });
    it("scopes disconnect lookup to clerk_org_id and organisation_id", async () => {
      await disconnectXeroAction({
        confirmationText: orgName,
        connectionId,
        mode: "soft",
        organisationId,
      });
      expect(mocks.database.organisation.findFirst).toHaveBeenCalledWith({
        select: { name: true },
        where: {
          clerk_org_id: clerkOrgId,
          id: organisationId,
        },
      });
      expect(mocks.disconnectXeroOAuthConnection).toHaveBeenCalledWith({
        clerkOrgId,
        connectionId,
        destructive: false,
        organisationId,
        performedByUserId: "user_456",
      });
      expect(mocks.database.xeroConnection.findFirst).toHaveBeenCalledWith({
        select: { id: true },
        where: {
          clerk_org_id: clerkOrgId,
          id: connectionId,
          organisation_id: organisationId,
        },
      });
    });
    it("rejects a connection outside the scoped organisation before delegating disconnect", async () => {
      mocks.database.xeroConnection.findFirst.mockResolvedValue(null);
      const result = await disconnectXeroAction({
        confirmationText: orgName,
        connectionId,
        mode: "soft",
        organisationId,
      });
      expect(result).toEqual({
        error: {
          code: "validation_error",
          message: "Xero connection was not found in this organisation.",
        },
        ok: false,
      });
      expect(mocks.disconnectXeroOAuthConnection).not.toHaveBeenCalled();
      expect(mocks.database.auditEvent.create).not.toHaveBeenCalled();
      expect(mocks.revalidatePath).not.toHaveBeenCalled();
    });
  });
  describe("action specific functionality", () => {
    it("refuses disconnect if confirmation text does not match organisation name", async () => {
      const result = await disconnectXeroAction({
        confirmationText: "Wrong Name",
        connectionId,
        mode: "destructive",
        organisationId,
      });
      expect(result).toEqual({
        error: {
          code: "validation_error",
          message: "Type the organisation name to confirm disconnect.",
        },
        ok: false,
      });
      expect(mocks.disconnectXeroOAuthConnection).not.toHaveBeenCalled();
    });
    it("returns the committed disconnect result without a second fallible audit write", async () => {
      mocks.database.auditEvent.create.mockRejectedValue(
        new Error("Audit unavailable")
      );
      const result = await disconnectXeroAction({
        confirmationText: orgName,
        connectionId,
        mode: "soft",
        organisationId,
      });
      expect(result).toEqual({
        ok: true,
        value: {
          disconnected: true,
          result: { connectionId, state: "disconnected" },
        },
      });
      expect(mocks.database.auditEvent.create).not.toHaveBeenCalled();
      expect(mocks.revalidatePath).toHaveBeenCalledWith(
        "/settings/integrations/xero"
      );
    });
    it.each(["org:owner", "org:admin"])(
      "allows %s to confirm disconnect using the existing trimmed organisation name",
      async (orgRole) => {
        mocks.auth.mockResolvedValue({ orgRole });
        const result = await disconnectXeroAction({
          confirmationText: ` ${orgName} `,
          connectionId,
          mode: "soft",
          organisationId,
        });
        expect(result.ok).toBe(true);
        expect(mocks.disconnectXeroOAuthConnection).toHaveBeenCalledWith({
          clerkOrgId,
          connectionId,
          destructive: false,
          organisationId,
          performedByUserId: userId,
        });
      }
    );
    it.each(["acme corp", "Acme", "", "Wrong Name"])(
      "rejects nonmatching confirmation %s before disconnect",
      async (confirmationText) => {
        const result = await disconnectXeroAction({
          confirmationText,
          connectionId,
          mode: "soft",
          organisationId,
        });
        expect(result.ok).toBe(false);
        expect(mocks.disconnectXeroOAuthConnection).not.toHaveBeenCalled();
      }
    );
    it("does not audit, revalidate, or return success when the provider DELETE fails", async () => {
      const message = "Xero could not be disconnected. Try again.";
      mocks.disconnectXeroOAuthConnection.mockResolvedValue({
        error: { message },
        ok: false,
      });
      const result = await disconnectXeroAction({
        confirmationText: orgName,
        connectionId,
        mode: "soft",
        organisationId,
      });
      expect(result).toEqual({
        error: { code: "unknown_error", message },
        ok: false,
      });
      expect(mocks.database.auditEvent.create).not.toHaveBeenCalled();
      expect(mocks.revalidatePath).not.toHaveBeenCalled();
    });
    it("passes destructive flag correctly to disconnect service", async () => {
      const resDestructive = await disconnectXeroAction({
        confirmationText: orgName,
        connectionId,
        mode: "destructive",
        organisationId,
      });
      expect(resDestructive.ok).toBe(true);
      expect(mocks.disconnectXeroOAuthConnection).toHaveBeenCalledWith({
        clerkOrgId,
        connectionId,
        destructive: true,
        organisationId,
        performedByUserId: "user_456",
      });
      const resSoft = await disconnectXeroAction({
        confirmationText: orgName,
        connectionId,
        mode: "soft",
        organisationId,
      });
      expect(resSoft.ok).toBe(true);
      expect(mocks.disconnectXeroOAuthConnection).toHaveBeenCalledWith({
        clerkOrgId,
        connectionId,
        destructive: false,
        organisationId,
        performedByUserId: "user_456",
      });
    });
    it("connectXeroAction generates OAuth start URL with correct org params", async () => {
      const result = await connectXeroAction({ organisationId });
      expect(result.ok).toBe(true);
      if (result.ok) {
        const url = new URL(result.value.redirectUrl);
        expect(url.pathname).toBe("/api/xero/oauth/start");
        expect(url.searchParams.get("clerkOrgId")).toBe(clerkOrgId);
        expect(url.searchParams.get("organisationId")).toBe(organisationId);
        expect(url.searchParams.get("userId")).toBe(userId);
      }
    });
    it("pauseTenantSyncAction and resumeTenantSyncAction update xeroConnection sync status", async () => {
      const resPause = await pauseTenantSyncAction({
        connectionId,
        organisationId,
      });
      expect(resPause.ok).toBe(true);
      expect(mocks.transaction.xeroConnection.updateMany).toHaveBeenCalledWith({
        data: { sync_paused_at: expect.any(Date) },
        where: {
          clerk_org_id: clerkOrgId,
          id: connectionId,
          organisation_id: organisationId,
        },
      });
      const resResume = await resumeTenantSyncAction({
        connectionId,
        organisationId,
      });
      expect(resResume.ok).toBe(true);
      expect(mocks.transaction.xeroConnection.updateMany).toHaveBeenCalledWith({
        data: { sync_paused_at: null },
        where: {
          clerk_org_id: clerkOrgId,
          id: connectionId,
          organisation_id: organisationId,
        },
      });
      expect(mocks.database.$transaction).toHaveBeenCalledTimes(2);
      expect(mocks.transaction.auditEvent.create).toHaveBeenCalledTimes(2);
      expect(mocks.database.xeroConnection.updateMany).not.toHaveBeenCalled();
    });
    it.each([
      ["pause", pauseTenantSyncAction],
      ["resume", resumeTenantSyncAction],
    ])(
      "does not audit or claim success when %s targets another tenant",
      async (_name, action) => {
        mocks.transaction.xeroConnection.updateMany.mockResolvedValue({
          count: 0,
        });
        const result = await action({ connectionId, organisationId });
        expect(result).toEqual({
          error: {
            code: "validation_error",
            message: "Xero tenant was not found in this organisation.",
          },
          ok: false,
        });
        expect(
          mocks.transaction.xeroConnection.updateMany
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            where: {
              clerk_org_id: clerkOrgId,
              id: connectionId,
              organisation_id: organisationId,
            },
          })
        );
        expect(mocks.transaction.auditEvent.create).not.toHaveBeenCalled();
        expect(mocks.database.auditEvent.create).not.toHaveBeenCalled();
        expect(mocks.revalidatePath).not.toHaveBeenCalled();
      }
    );
  });
});
vi.mock("server-only", () => ({}));
