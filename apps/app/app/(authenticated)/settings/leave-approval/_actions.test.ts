import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  currentUser: vi.fn(),
  defaultOrganisationSettingsPatch: vi.fn(),
  getActiveOrgContext: vi.fn(),
  revalidatePath: vi.fn(),
  updateSettings: vi.fn(),
}));

vi.mock("@repo/auth/server", () => ({
  auth: mocks.auth,
  currentUser: mocks.currentUser,
}));
vi.mock("@repo/availability", () => ({
  defaultOrganisationSettingsPatch: mocks.defaultOrganisationSettingsPatch,
  updateSettings: mocks.updateSettings,
}));
vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));
vi.mock("@/lib/server/get-active-org-context", () => ({
  getActiveOrgContext: mocks.getActiveOrgContext,
}));

const {
  restoreLeaveApprovalDefaultsAction,
  updateLeaveApprovalSettingsAction,
} = await import("./_actions");

const organisationId = "00000000-0000-4000-8000-000000000001";
const clerkOrgId = "org_123";
const userId = "user_456";

describe("settings/leave-approval server actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ orgRole: "org:admin" });
    mocks.currentUser.mockResolvedValue({ id: userId });
    mocks.getActiveOrgContext.mockResolvedValue({
      ok: true,
      value: { clerkOrgId, organisationId },
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
      mocks.currentUser.mockResolvedValue(null);

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
      mocks.auth.mockResolvedValue({ orgRole: "org:manager" });

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

    it("scopes settings update to clerkOrgId and organisationId", async () => {
      await updateLeaveApprovalSettingsAction({
        organisationId,
        patch: { requireDeclineReason: true },
      });

      expect(mocks.updateSettings).toHaveBeenCalledWith({
        actingRole: "admin",
        actingUserId: userId,
        clerkOrgId,
        organisationId,
        patch: { requireDeclineReason: true },
      });
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
        expect.objectContaining({ patch: { requireDeclineReason: true } })
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
