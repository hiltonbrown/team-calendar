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
vi.mock("@repo/database/tenant-client", () => ({
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

  ...(await vi.importActual<typeof import("@repo/database/tenant-db")>(
    "@repo/database/tenant-db"
  )),
  ...(await vi.importActual<
    typeof import("../../../../../../packages/database/src/queries/organisations")
  >("../../../../../../packages/database/src/queries/organisations")),
}));

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  defaultOrganisationSettingsPatch: vi.fn(),
  getActiveOrgContext: vi.fn(),
  getCurrentUser: vi.fn(),
  getSession: vi.fn(),
  revalidatePath: vi.fn(),
  updateAccountApprovalSettings: vi.fn(),
  updateSettings: vi.fn(),
}));

vi.mock("@repo/auth/server", () => ({
  getCurrentUser: mocks.getCurrentUser,
  getSession: mocks.getSession,
}));
vi.mock("@repo/availability", () => ({
  defaultOrganisationSettingsPatch: mocks.defaultOrganisationSettingsPatch,
  updateAccountApprovalSettings: mocks.updateAccountApprovalSettings,
  updateSettings: mocks.updateSettings,
}));
vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));
vi.mock("@/lib/server/get-active-org-context", () => ({
  getActiveOrgContext: mocks.getActiveOrgContext,
}));

const {
  updateAccountManagerVisibilityAction,
  restoreLeaveApprovalDefaultsAction,
  updateLeaveApprovalSettingsAction,
} = await import("./_actions");

const organisationId = "00000000-0000-4000-8000-000000000001";
const accountId = "org_123";
const userId = "user_456";

describe("settings/leave-approval server actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ accountId: "org_123", role: "admin" });
    mocks.getCurrentUser.mockResolvedValue({ id: userId });
    mocks.getActiveOrgContext.mockResolvedValue({
      ok: true,
      value: { accountId, organisationId },
    });
    mocks.defaultOrganisationSettingsPatch.mockReturnValue({
      requireDeclineReason: true,
    });
    mocks.updateSettings.mockResolvedValue({
      ok: true,
      value: { updated: true },
    });
  });

  describe("baseline authorization and scoping tests", () => {
    it("rejects unauthenticated callers", async () => {
      mocks.getCurrentUser.mockResolvedValue(null);

      const result = await updateLeaveApprovalSettingsAction({
        organisationId,
        patch: { requireDeclineReason: true },
      });

      expect(result).toEqual({
        error: {
          code: "not_authorised",
          message:
            "You do not have permission to manage leave approval settings.",
        },
        ok: false,
      });
      expect(mocks.updateSettings).not.toHaveBeenCalled();
    });

    it("rejects non-admin roles (manager, viewer)", async () => {
      mocks.getSession.mockResolvedValue({
        accountId: "org_123",
        role: "manager",
      });

      const result = await updateLeaveApprovalSettingsAction({
        organisationId,
        patch: { requireDeclineReason: true },
      });

      expect(result).toEqual({
        error: {
          code: "not_authorised",
          message:
            "You do not have permission to manage leave approval settings.",
        },
        ok: false,
      });
      expect(mocks.updateSettings).not.toHaveBeenCalled();
    });

    it("rejects malformed inputs (invalid patch field)", async () => {
      const result = await updateLeaveApprovalSettingsAction({
        organisationId,
        // Test-only type escape: exercise runtime rejection of an unknown patch key.
        patch: {
          invalidKey: true,
        } as never,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("validation_error");
      }
      expect(mocks.updateSettings).not.toHaveBeenCalled();
    });

    it("scopes settings update to accountId and organisationId", async () => {
      await updateLeaveApprovalSettingsAction({
        organisationId,
        patch: { requireDeclineReason: true },
      });

      expect(mocks.updateSettings).toHaveBeenCalledWith(
        {
          accountId,
          actingRole: "admin",
          actingUserId: userId,
          organisationId,
          patch: { requireDeclineReason: true },
        },
        expect.any(Object)
      );
    });
  });

  describe("action specific functionality", () => {
    it("accepts the required decline-reason policy", async () => {
      const resultOn = await updateLeaveApprovalSettingsAction({
        organisationId,
        patch: { requireDeclineReason: true },
      });
      expect(resultOn).toEqual({ ok: true, value: { updated: true } });
      expect(mocks.updateSettings).toHaveBeenCalledWith(
        expect.objectContaining({ patch: { requireDeclineReason: true } }),
        expect.any(Object)
      );
    });

    it("rejects attempts to make decline reasons optional", async () => {
      const resultOff = await updateLeaveApprovalSettingsAction({
        organisationId,
        // Test-only type escape: exercise runtime rejection of the legacy false value.
        patch: { requireDeclineReason: false } as never,
      });

      expect(resultOff).toMatchObject({
        error: { code: "validation_error" },
        ok: false,
      });
      expect(mocks.updateSettings).not.toHaveBeenCalled();
    });

    it("surfaces updateSettings error when settings read/update fails", async () => {
      mocks.updateSettings.mockResolvedValue({
        error: {
          code: "not_authorised",
          message: "Permission denied in domain service",
        },
        ok: false,
      });

      const result = await updateLeaveApprovalSettingsAction({
        organisationId,
        patch: { requireDeclineReason: true },
      });

      expect(result).toEqual({
        error: {
          code: "not_authorised",
          message: "Permission denied in domain service",
        },
        ok: false,
      });
    });

    it("restoreLeaveApprovalDefaultsAction applies default patch and revalidates paths", async () => {
      const result = await restoreLeaveApprovalDefaultsAction({
        organisationId,
      });

      expect(result).toEqual({ ok: true, value: { updated: true } });
      expect(mocks.defaultOrganisationSettingsPatch).toHaveBeenCalled();
      expect(mocks.revalidatePath).toHaveBeenCalledWith(
        "/settings/leave-approval"
      );
      expect(mocks.revalidatePath).toHaveBeenCalledWith("/calendar");
      expect(mocks.revalidatePath).toHaveBeenCalledWith("/leave-approvals");
      expect(mocks.revalidatePath).toHaveBeenCalledWith("/people");
      expect(mocks.revalidatePath).toHaveBeenCalledWith("/plans");
    });
  });
});

it("account manager visibility uses the authenticated account and admin role", async () => {
  mocks.getSession.mockResolvedValue({
    accountId,
    role: "admin",
    userId,
  });
  mocks.updateAccountApprovalSettings.mockResolvedValue({
    ok: true,
    value: { managerVisibilityScope: "all_team_leave" },
  });
  expect(
    await updateAccountManagerVisibilityAction({
      managerVisibilityScope: "all_team_leave",
    })
  ).toMatchObject({ ok: true });
  expect(mocks.updateAccountApprovalSettings).toHaveBeenCalledWith(
    expect.objectContaining({
      accountId,
      actingRole: "admin",
      actingUserId: userId,
      managerVisibilityScope: "all_team_leave",
    }),
    expect.any(Object)
  );
});
it("managers cannot change account visibility", async () => {
  mocks.getSession.mockResolvedValue({
    accountId,
    role: "manager",
    userId,
  });
  expect(
    await updateAccountManagerVisibilityAction({
      managerVisibilityScope: "all_team_leave",
    })
  ).toMatchObject({ error: { code: "not_authorised" }, ok: false });
});
