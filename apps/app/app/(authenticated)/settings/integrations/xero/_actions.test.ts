import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  CampaignDeniedError: class extends Error {
    constructor() {
      super("xero_campaign_admission_denied");
    }
  },
  coreKeys: vi.fn(),
  currentUser: vi.fn(),
  database: {
    $transaction: vi.fn(),
    auditEvent: { create: vi.fn() },
    organisation: { findFirst: vi.fn() },
    xeroTenant: { updateMany: vi.fn() },
  },
  disconnectXeroOAuthConnection: vi.fn(),
  getActiveOrgContext: vi.fn(),
  headers: vi.fn(),
  refreshXeroOAuthConnection: vi.fn(),
  revalidatePath: vi.fn(),
  transaction: {
    auditEvent: { create: vi.fn() },
    xeroTenant: { updateMany: vi.fn() },
  },
  withXeroCampaignScopedInvocation: vi.fn(),
}));

vi.mock("@repo/auth/server", () => ({
  auth: mocks.auth,
  currentUser: mocks.currentUser,
}));
vi.mock("@repo/database", () => ({
  database: mocks.database,
}));
vi.mock("@repo/database/xero-campaign-access", () => ({
  withXeroCampaignScopedInvocation: mocks.withXeroCampaignScopedInvocation,
}));
vi.mock("@repo/database/xero-campaign-contract", () => ({
  XeroCampaignDeniedError: mocks.CampaignDeniedError,
}));
vi.mock("@repo/next-config/keys", () => ({
  keys: mocks.coreKeys,
}));
vi.mock("@repo/xero", () => ({
  disconnectXeroOAuthConnection: mocks.disconnectXeroOAuthConnection,
  refreshXeroOAuthConnection: mocks.refreshXeroOAuthConnection,
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

const {
  connectXeroAction,
  disconnectXeroAction,
  pauseTenantSyncAction,
  refreshXeroConnectionAction,
  resumeTenantSyncAction,
} = await import("./_actions");

const organisationId = "00000000-0000-4000-8000-000000000001";
const connectionId = "00000000-0000-4000-8000-000000000002";
const xeroTenantId = "00000000-0000-4000-8000-000000000003";
const clerkOrgId = "org_123";
const userId = "user_456";
const orgName = "Acme Corp";

describe("xero settings integration server actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    mocks.database.auditEvent.create.mockResolvedValue({});
    mocks.transaction.auditEvent.create.mockResolvedValue({});
    mocks.transaction.xeroTenant.updateMany.mockResolvedValue({ count: 1 });
    mocks.database.$transaction.mockImplementation((operation) =>
      operation(mocks.transaction)
    );
    mocks.withXeroCampaignScopedInvocation.mockImplementation(
      (_functionId, _scope, operation) => operation()
    );
    mocks.refreshXeroOAuthConnection.mockResolvedValue({
      ok: true,
      value: { refreshedAt: new Date("2026-01-01T00:00:00Z") },
    });
    mocks.disconnectXeroOAuthConnection.mockResolvedValue({
      ok: true,
      value: {
        cleanupRequestId: "00000000-0000-4000-8000-000000000004",
        dataActionStatus: "not_requested",
        localDisabled: true,
        remoteStatus: "left_in_place",
      },
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

    it("rejects non-admin roles (manager, viewer) and asserts no service call was made", async () => {
      mocks.auth.mockResolvedValue({ orgRole: "org:manager" });

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

      const resRefresh = await refreshXeroConnectionAction({
        connectionId,
        organisationId,
      });
      expect(resRefresh.ok).toBe(false);
      expect(mocks.refreshXeroOAuthConnection).not.toHaveBeenCalled();
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

    it("returns only the receipt DTO and audits the truthful remote status", async () => {
      mocks.disconnectXeroOAuthConnection.mockResolvedValue({
        ok: true,
        value: {
          cleanupRequestId: null,
          dataActionStatus: "not_requested",
          localDisabled: true,
          providerErrorCode: "private-provider-code",
          remoteConnectionId: "private-target",
          remoteStatus: "unknown",
        },
      });
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
          receipt: {
            cleanupRequestId: null,
            dataActionStatus: "not_requested",
            localDisabled: true,
            remoteStatus: "unknown",
          },
        },
      });
      expect(mocks.database.auditEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          metadata: { mode: "soft", remoteStatus: "unknown" },
        }),
      });
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

    it("pauseTenantSyncAction and resumeTenantSyncAction update xeroTenant sync status", async () => {
      const resPause = await pauseTenantSyncAction({
        organisationId,
        xeroTenantId,
      });
      expect(resPause.ok).toBe(true);
      expect(mocks.transaction.xeroTenant.updateMany).toHaveBeenCalledWith({
        data: { sync_paused_at: expect.any(Date) },
        where: {
          clerk_org_id: clerkOrgId,
          id: xeroTenantId,
          organisation_id: organisationId,
        },
      });

      const resResume = await resumeTenantSyncAction({
        organisationId,
        xeroTenantId,
      });
      expect(resResume.ok).toBe(true);
      expect(mocks.transaction.xeroTenant.updateMany).toHaveBeenCalledWith({
        data: { sync_paused_at: null },
        where: {
          clerk_org_id: clerkOrgId,
          id: xeroTenantId,
          organisation_id: organisationId,
        },
      });
      expect(mocks.database.$transaction).toHaveBeenCalledTimes(2);
      expect(mocks.transaction.auditEvent.create).toHaveBeenCalledTimes(2);
      expect(mocks.database.xeroTenant.updateMany).not.toHaveBeenCalled();
      expect(mocks.withXeroCampaignScopedInvocation).toHaveBeenCalledWith(
        "xero.settings.tenant-sync-state",
        { clerkOrgId, organisationId, xeroTenantId },
        expect.any(Function)
      );
    });

    it.each([
      ["pause", pauseTenantSyncAction],
      ["resume", resumeTenantSyncAction],
    ])(
      "denies %s during a reserved campaign without changing tenant or audit",
      async (_name, action) => {
        mocks.withXeroCampaignScopedInvocation.mockRejectedValue(
          new mocks.CampaignDeniedError()
        );

        const result = await action({ organisationId, xeroTenantId });

        expect(result).toEqual({
          error: {
            code: "unknown_error",
            message:
              "Xero settings are temporarily unavailable. Please try again later.",
          },
          ok: false,
        });
        expect(mocks.database.$transaction).not.toHaveBeenCalled();
        expect(mocks.database.xeroTenant.updateMany).not.toHaveBeenCalled();
        expect(mocks.transaction.auditEvent.create).not.toHaveBeenCalled();
        expect(mocks.database.auditEvent.create).not.toHaveBeenCalled();
        expect(mocks.revalidatePath).not.toHaveBeenCalled();
      }
    );

    it.each([
      ["pause", pauseTenantSyncAction],
      ["resume", resumeTenantSyncAction],
    ])(
      "does not audit or claim success when %s targets another tenant",
      async (_name, action) => {
        mocks.transaction.xeroTenant.updateMany.mockResolvedValue({ count: 0 });

        const result = await action({ organisationId, xeroTenantId });

        expect(result).toEqual({
          error: {
            code: "validation_error",
            message: "Xero tenant was not found in this organisation.",
          },
          ok: false,
        });
        expect(mocks.transaction.xeroTenant.updateMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: {
              clerk_org_id: clerkOrgId,
              id: xeroTenantId,
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
