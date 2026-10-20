const tenantPoolMocks = vi.hoisted(() => ({
  organisationFindFirst: vi.fn((query: { where: { id?: string } }) =>
    Promise.resolve(
      query.where.id === "00000000-0000-4000-8000-000000000001"
        ? {
            country_code: "AU",
            id: "00000000-0000-4000-8000-000000000001",
            name: "Company A",
            timezone: "Australia/Brisbane",
          }
        : null
    )
  ),
}));
vi.mock("../../../../../../packages/database/src/tenant-client", () => ({
  referenceDatabase: {
    $transaction: (run: (client: unknown) => Promise<unknown>) =>
      run({
        $executeRaw: vi.fn(() => Promise.resolve(1)),
        $queryRaw: vi.fn(() => Promise.resolve([])),
        organisation: {
          findFirst: tenantPoolMocks.organisationFindFirst,
          findMany: vi.fn(() =>
            Promise.resolve([
              {
                country_code: "AU",
                id: "00000000-0000-4000-8000-000000000001",
                name: "Company A",
                timezone: "Australia/Brisbane",
              },
            ])
          ),
        },
        person: {
          findFirst: vi.fn(() =>
            Promise.resolve({
              id: "person-1",
              organisation_id: "00000000-0000-4000-8000-000000000001",
            })
          ),
        },
      }),
  },
}));
vi.mock("@repo/database", async () => ({
  ...(await vi.importActual<
    typeof import("../../../../../../packages/database/src/queries/account-companies")
  >("../../../../../../packages/database/src/queries/account-companies")),

  ...(await vi.importActual<
    typeof import("../../../../../../packages/database/src/tenant-db")
  >("../../../../../../packages/database/src/tenant-db")),
  ...(await vi.importActual<
    typeof import("../../../../../../packages/database/src/queries/organisations")
  >("../../../../../../packages/database/src/queries/organisations")),
}));

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  currentUser: vi.fn(),
  getActiveOrgContext: vi.fn(),
  revalidatePath: vi.fn(),
  updateSettings: vi.fn(),
}));

vi.mock("@repo/auth/server", () => ({
  auth: mocks.auth,
  currentUser: mocks.currentUser,
}));
vi.mock("@repo/availability", () => ({
  updateSettings: mocks.updateSettings,
}));
vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));
vi.mock("@/lib/server/get-active-org-context", () => ({
  getActiveOrgContext: mocks.getActiveOrgContext,
}));

const { updateFeedDefaultsAction } = await import("./_actions");

const organisationId = "00000000-0000-4000-8000-000000000001";
const clerkOrgId = "org_123";
const userId = "user_456";

describe("settings feeds server actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ orgId: "org_123", orgRole: "org:admin" });
    mocks.currentUser.mockResolvedValue({ id: userId });
    mocks.getActiveOrgContext.mockResolvedValue({
      ok: true,
      value: { clerkOrgId, organisationId },
    });
    mocks.updateSettings.mockResolvedValue({
      ok: true,
      value: { updated: true },
    });
  });

  describe("baseline authorization and scoping tests", () => {
    it("rejects unauthenticated callers", async () => {
      mocks.currentUser.mockResolvedValue(null);

      const result = await updateFeedDefaultsAction({
        organisationId,
        patch: { defaultFeedPrivacyMode: "masked" },
      });

      expect(result).toEqual({
        error: {
          code: "not_authorised",
          message: "You do not have permission to manage feed defaults.",
        },
        ok: false,
      });
      expect(mocks.updateSettings).not.toHaveBeenCalled();
    });

    it("rejects non-admin roles (manager, viewer)", async () => {
      mocks.auth.mockResolvedValue({
        orgId: "org_123",
        orgRole: "org:manager",
      });

      const result = await updateFeedDefaultsAction({
        organisationId,
        patch: { defaultFeedPrivacyMode: "named" },
      });

      expect(result).toEqual({
        error: {
          code: "not_authorised",
          message: "You do not have permission to manage feed defaults.",
        },
        ok: false,
      });
      expect(mocks.updateSettings).not.toHaveBeenCalled();
    });

    it("rejects malformed inputs", async () => {
      const result = await updateFeedDefaultsAction({
        organisationId: "invalid-uuid",
        patch: { defaultFeedPrivacyMode: "masked" },
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("validation_error");
      }
      expect(mocks.updateSettings).not.toHaveBeenCalled();
    });

    it("scopes updateSettings call to clerkOrgId and organisationId", async () => {
      await updateFeedDefaultsAction({
        organisationId,
        patch: { defaultFeedPrivacyMode: "masked" },
      });

      expect(mocks.updateSettings).toHaveBeenCalledWith(
        {
          actingRole: "admin",
          actingUserId: userId,
          clerkOrgId,
          organisationId,
          patch: { defaultFeedPrivacyMode: "masked" },
        },
        expect.any(Object)
      );
    });
  });

  describe("action specific functionality", () => {
    it("updates feed defaults and revalidates feed settings paths", async () => {
      const result = await updateFeedDefaultsAction({
        organisationId,
        patch: {
          defaultFeedPrivacyMode: "masked",
          feedsIncludePublicHolidaysDefault: true,
        },
      });

      expect(result).toEqual({ ok: true, value: { updated: true } });
      expect(mocks.revalidatePath).toHaveBeenCalledWith("/settings/feeds");
      expect(mocks.revalidatePath).toHaveBeenCalledWith("/feeds");
    });
  });
});
