import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  coreKeys: vi.fn(),
  database: {
    $transaction: vi.fn(),
    auditEvent: { create: vi.fn() },
    organisation: { findFirst: vi.fn() },
    xeroConnection: { findFirst: vi.fn(), updateMany: vi.fn() },
  },
  disconnectXeroOAuthConnection: vi.fn(),
  getActiveOrgContext: vi.fn(),
  getCurrentUser: vi.fn(),
  getSession: vi.fn(),
  headers: vi.fn(),
  removeXeroCompany: vi.fn(),
  revalidatePath: vi.fn(),
  transaction: {
    auditEvent: { create: vi.fn() },
    xeroConnection: { updateMany: vi.fn() },
  },
}));
vi.mock("@repo/auth/server", () => ({
  getCurrentUser: mocks.getCurrentUser,
  getSession: mocks.getSession,
}));
vi.mock("@repo/database/tenant-client", () => ({
  referenceDatabase: {
    $transaction: vi.fn(
      async (executeTransaction: (client: unknown) => Promise<unknown>) =>
        executeTransaction({
          $executeRaw: vi.fn(async () => 1),
          $queryRaw: vi.fn(async () => []),
          ...buildTenantTestDatabase(),
        })
    ),
  },
}));
vi.mock("@repo/database", async () => ({
  ...(await vi.importActual<typeof import("@repo/database/tenant-db")>(
    "@repo/database/tenant-db"
  )),
}));
function buildTenantTestDatabase() {
  return mocks.database;
}
vi.mock("@repo/next-config/keys", () => ({
  keys: mocks.coreKeys,
}));
vi.mock("@repo/xero", () => ({
  disconnectXeroOAuthConnection: mocks.disconnectXeroOAuthConnection,
  removeXeroCompany: mocks.removeXeroCompany,
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
vi.mock("@repo/auth/helpers", () => ({
  hasPermission: async (
    request: import("@repo/auth/permissions").PermissionRequest
  ) =>
    (await import("@repo/auth/permissions")).hasPermission(
      (await mocks.getSession())?.role,
      request
    ),
}));
const actions = await import("./_actions");
const {
  connectXeroAction,
  disconnectXeroAction,
  pauseTenantSyncAction,
  resumeTenantSyncAction,
  removeCompanyAction,
} = actions;
const organisationId = "00000000-0000-4000-8000-000000000001";
const connectionId = "00000000-0000-4000-8000-000000000002";
const accountId = "org_123";
const userId = "user_456";
const orgName = "Acme Corp";
describe("xero settings integration server actions", () => {
  it("does not expose a manual token refresh server action", () => {
    expect("refreshXeroConnectionAction" in actions).toBe(false);
  });
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getSession.mockResolvedValue({ accountId: "org_123", role: "admin" });
    mocks.getCurrentUser.mockResolvedValue({
      email: "admin@example.com",
      id: userId,
      name: "Admin",
    });
    mocks.getActiveOrgContext.mockResolvedValue({
      ok: true,
      value: { accountId, organisationId },
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
    mocks.database.auditEvent.create.mockResolvedValue({});
    mocks.database.xeroConnection.updateMany.mockResolvedValue({ count: 1 });
    mocks.database.$transaction.mockImplementation((operation) =>
      operation(mocks.transaction)
    );
    mocks.disconnectXeroOAuthConnection.mockResolvedValue({
      ok: true,
      value: { connectionId, state: "disconnected" },
    });
  });

  it.each(["admin", "owner"])(
    "permits %s to connect, reconnect, disconnect, pause and resume scoped companies",
    async (role) => {
      mocks.getSession.mockResolvedValue({ accountId, role });
      expect((await connectXeroAction({ organisationId })).ok).toBe(true);
      expect(
        (
          await disconnectXeroAction({
            confirmationText: orgName,
            connectionId,
            mode: "soft",
            organisationId,
          })
        ).ok
      ).toBe(true);
      expect(
        (await pauseTenantSyncAction({ connectionId, organisationId })).ok
      ).toBe(true);
      expect(
        (await resumeTenantSyncAction({ connectionId, organisationId })).ok
      ).toBe(true);
    }
  );
  it("refuses company removal if the owner is downgraded during the request", async () => {
    mocks.getSession
      .mockResolvedValueOnce({ accountId: "org_123", role: "owner" })
      .mockResolvedValueOnce({ accountId: "org_123", role: "admin" });
    const result = await removeCompanyAction({
      confirmationText: orgName,
      connectionId,
      organisationId,
    });
    expect(result).toMatchObject({
      error: { code: "not_authorised" },
      ok: false,
    });
    expect(mocks.removeXeroCompany).not.toHaveBeenCalled();
  });
  it("starts Add company with the authenticated account and no preset company", async () => {
    mocks.getSession.mockResolvedValue({ accountId, role: "admin" });
    const result = await connectXeroAction({});
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(
        new URL(result.value.redirectUrl).searchParams.has("organisationId")
      ).toBe(false);
    }
    expect(mocks.getActiveOrgContext).not.toHaveBeenCalled();
  });
  it("delegates confirmed company removal only for an owner", async () => {
    mocks.getSession.mockResolvedValue({ accountId: "org_123", role: "owner" });
    mocks.removeXeroCompany.mockResolvedValue({
      ok: true,
      value: { connectionId, organisationId, state: "removed" },
    });
    const result = await removeCompanyAction({
      confirmationText: orgName,
      connectionId,
      organisationId,
    });
    expect(result).toEqual({ ok: true, value: { removed: true } });
    expect(mocks.removeXeroCompany).toHaveBeenCalledWith({
      accountId,
      connectionId,
      organisationId,
      performedByUserId: userId,
      role: "owner",
    });
    expect(mocks.disconnectXeroOAuthConnection).not.toHaveBeenCalled();
  });
  describe("baseline authorization and scoping tests", () => {
    it("rejects unauthenticated callers for all actions", async () => {
      mocks.getCurrentUser.mockResolvedValue(null);
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
    it.each(["manager", "viewer", "member", null])(
      "rejects role %s without calling the disconnect service",
      async (role) => {
        mocks.getSession.mockResolvedValue({ accountId, role });
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
    it("rejects an organisation outside the active Account without calling the service", async () => {
      mocks.database.organisation.findFirst.mockResolvedValue(null);
      const result = await disconnectXeroAction({
        confirmationText: orgName,
        connectionId,
        mode: "soft",
        organisationId,
      });
      expect(result.ok).toBe(false);
      expect(mocks.database.organisation.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { account_id: accountId, id: organisationId },
        })
      );
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
    it("scopes disconnect lookup to account_id and organisation_id", async () => {
      await disconnectXeroAction({
        confirmationText: orgName,
        connectionId,
        mode: "soft",
        organisationId,
      });
      expect(mocks.database.organisation.findFirst).toHaveBeenCalledWith({
        select: { name: true },
        where: {
          account_id: accountId,
          id: organisationId,
        },
      });
      expect(mocks.disconnectXeroOAuthConnection).toHaveBeenCalledWith({
        accountId,
        connectionId,
        destructive: false,
        organisationId,
        performedByUserId: "user_456",
      });
      expect(mocks.database.xeroConnection.findFirst).toHaveBeenCalledWith({
        select: { id: true },
        where: {
          account_id: accountId,
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
        mode: "soft",
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
    it.each(["owner", "admin"])(
      "allows %s to confirm disconnect using the existing trimmed organisation name",
      async (role) => {
        mocks.getSession.mockResolvedValue({ accountId, role });
        const result = await disconnectXeroAction({
          confirmationText: ` ${orgName} `,
          connectionId,
          mode: "soft",
          organisationId,
        });
        expect(result.ok).toBe(true);
        expect(mocks.disconnectXeroOAuthConnection).toHaveBeenCalledWith({
          accountId,
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
    it("rejects legacy destructive disconnect and keeps ordinary disconnect soft", async () => {
      const legacy = await disconnectXeroAction({
        confirmationText: orgName,
        connectionId,
        mode: "destructive",
        organisationId,
      });
      expect(legacy).toMatchObject({
        error: { code: "validation_error" },
        ok: false,
      });
      expect(mocks.disconnectXeroOAuthConnection).not.toHaveBeenCalled();
      const result = await disconnectXeroAction({
        confirmationText: orgName,
        connectionId,
        mode: "soft",
        organisationId,
      });
      expect(result.ok).toBe(true);
      expect(mocks.disconnectXeroOAuthConnection).toHaveBeenCalledWith(
        expect.objectContaining({ destructive: false })
      );
    });
    it("connectXeroAction generates OAuth start URL with correct org params", async () => {
      const result = await connectXeroAction({ organisationId });
      expect(result.ok).toBe(true);
      if (result.ok) {
        const url = new URL(result.value.redirectUrl);
        expect(url.pathname).toBe("/api/xero/oauth/start");
        expect(url.searchParams.get("accountId")).toBe(accountId);
        expect(url.searchParams.get("organisationId")).toBe(organisationId);
        expect(url.searchParams.get("userId")).toBe(userId);
        expect(url.searchParams.get("returnTo")).toBe(
          "/settings/integrations/xero"
        );
      }
    });
    it("connectXeroAction returns to the setup wizard when asked", async () => {
      const result = await connectXeroAction({
        organisationId,
        returnTo: "/onboarding",
      });
      expect(
        result.ok &&
          new URL(result.value.redirectUrl).searchParams.get("returnTo")
      ).toBe("/onboarding");
    });
    it("connectXeroAction rejects an unlisted return path", async () => {
      const result = await connectXeroAction({
        organisationId,
        returnTo: "/settings/billing" as "/onboarding",
      });
      expect(result).toMatchObject({
        error: { code: "validation_error" },
        ok: false,
      });
    });
    it("pauseTenantSyncAction and resumeTenantSyncAction update xeroConnection sync status", async () => {
      const resPause = await pauseTenantSyncAction({
        connectionId,
        organisationId,
      });
      expect(resPause.ok).toBe(true);
      expect(mocks.database.xeroConnection.updateMany).toHaveBeenCalledWith({
        data: { sync_paused_at: expect.any(Date) },
        where: {
          account_id: accountId,
          id: connectionId,
          organisation_id: organisationId,
        },
      });
      const resResume = await resumeTenantSyncAction({
        connectionId,
        organisationId,
      });
      expect(resResume.ok).toBe(true);
      expect(mocks.database.xeroConnection.updateMany).toHaveBeenCalledWith({
        data: { sync_paused_at: null },
        where: {
          account_id: accountId,
          id: connectionId,
          organisation_id: organisationId,
        },
      });
      const { referenceDatabase } = await import(
        "@repo/database/tenant-client"
      );
      expect(referenceDatabase.$transaction).toHaveBeenCalledTimes(2);
      expect(mocks.database.auditEvent.create).toHaveBeenCalledTimes(2);
    });
    it.each([
      ["pause", pauseTenantSyncAction],
      ["resume", resumeTenantSyncAction],
    ])(
      "does not audit or claim success when %s targets another tenant",
      async (_name, action) => {
        mocks.database.xeroConnection.updateMany.mockResolvedValue({
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
        expect(mocks.database.xeroConnection.updateMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: {
              account_id: accountId,
              id: connectionId,
              organisation_id: organisationId,
            },
          })
        );
        expect(mocks.database.auditEvent.create).not.toHaveBeenCalled();
        expect(mocks.database.auditEvent.create).not.toHaveBeenCalled();
        expect(mocks.revalidatePath).not.toHaveBeenCalled();
      }
    );
  });
});
vi.mock("server-only", () => ({}));

describe("Xero mutation role ordering", () => {
  it.each(["manager", "viewer"])(
    "rejects %s before validating input or resolving companies",
    async (role) => {
      mocks.getSession.mockResolvedValue({ accountId, role });
      mocks.getActiveOrgContext.mockClear();
      for (const action of [
        connectXeroAction,
        pauseTenantSyncAction,
        resumeTenantSyncAction,
      ]) {
        const result = await action({
          connectionId: "invalid",
          organisationId: "invalid",
        });
        expect(result).toMatchObject({
          error: { code: "not_authorised" },
          ok: false,
        });
      }
      expect(mocks.getActiveOrgContext).not.toHaveBeenCalled();
    }
  );
  it("refuses company removal to admins before reading input", async () => {
    mocks.getSession.mockResolvedValue({ accountId: "org_123", role: "admin" });
    const result = await removeCompanyAction({
      confirmationText: "",
      connectionId: "invalid",
      organisationId: "invalid",
    });
    expect(result).toMatchObject({
      error: { code: "not_authorised" },
      ok: false,
    });
    expect(mocks.removeXeroCompany).not.toHaveBeenCalled();
  });
});
