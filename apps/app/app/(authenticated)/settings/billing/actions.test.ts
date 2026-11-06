import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createCheckoutSession: vi.fn(),
  createPortalSession: vi.fn(),
  hasPermission: vi.fn(),
  redirect: vi.fn(),
  requireAccountResult: vi.fn(),
  requireActiveOrgPageContext: vi.fn(),
}));

vi.mock("@repo/auth/server", () => ({
  hasPermission: mocks.hasPermission,
  requireAccountResult: mocks.requireAccountResult,
}));
vi.mock("@/lib/server/require-active-org-page-context", () => ({
  requireActiveOrgPageContext: mocks.requireActiveOrgPageContext,
  resolveActiveOrgPageContext: mocks.requireActiveOrgPageContext,
}));
vi.mock("@repo/billing", () => ({
  createCheckoutSession: mocks.createCheckoutSession,
  createPortalSession: mocks.createPortalSession,
}));
vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}));

const { startCheckout, startPortal } = await import("./actions");

const accountId = "org_1";
const redirectUrl = "https://stripe.example/session";

describe("billing actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NEXT_PUBLIC_LAUNCH_MODE", "paid");
    mocks.requireAccountResult.mockResolvedValue({
      ok: true,
      value: accountId,
    });
    mocks.hasPermission.mockResolvedValue(true);
    mocks.requireActiveOrgPageContext.mockResolvedValue({ accountId });
    mocks.createCheckoutSession.mockResolvedValue({
      ok: true,
      value: redirectUrl,
    });
    mocks.createPortalSession.mockResolvedValue({
      ok: true,
      value: redirectUrl,
    });
    mocks.redirect.mockImplementation(() => {
      throw new Error("NEXT_REDIRECT");
    });
  });

  describe("early access mode gating", () => {
    it("rejects checkout in early access mode", async () => {
      vi.stubEnv("NEXT_PUBLIC_LAUNCH_MODE", "early_access");
      const result = await startCheckout("basic");
      expect(result).toEqual({
        error: expect.objectContaining({
          code: "bad_request",
          message: "Paid billing operations are disabled during early access.",
        }),
        ok: false,
      });
      expect(mocks.createCheckoutSession).not.toHaveBeenCalled();
      expect(mocks.requireActiveOrgPageContext).not.toHaveBeenCalled();
    });

    it("rejects portal in early access mode", async () => {
      vi.stubEnv("NEXT_PUBLIC_LAUNCH_MODE", "early_access");
      const result = await startPortal();
      expect(result).toEqual({
        error: expect.objectContaining({
          code: "bad_request",
          message: "Paid billing operations are disabled during early access.",
        }),
        ok: false,
      });
      expect(mocks.createPortalSession).not.toHaveBeenCalled();
      expect(mocks.requireActiveOrgPageContext).not.toHaveBeenCalled();
    });
  });

  describe("startCheckout", () => {
    it("returns unauthorised Result when signed out", async () => {
      mocks.requireAccountResult.mockResolvedValue({
        error: {
          code: "unauthorised",
          message: "Not authenticated or no account selected",
        },
        ok: false,
      });

      const result = await startCheckout("basic");
      expect(result).toEqual({
        error: expect.objectContaining({
          code: "unauthorised",
          message: "Not authenticated or no account selected",
        }),
        ok: false,
      });

      expect(mocks.hasPermission).not.toHaveBeenCalled();
      expect(mocks.requireActiveOrgPageContext).not.toHaveBeenCalled();
      expect(mocks.createCheckoutSession).not.toHaveBeenCalled();
      expect(mocks.redirect).not.toHaveBeenCalled();
    });

    it("returns forbidden Result when role does not have checkout permission", async () => {
      mocks.hasPermission.mockResolvedValue(false);

      const result = await startCheckout("basic");
      expect(result).toEqual({
        error: expect.objectContaining({
          code: "forbidden",
          message: "Permission denied",
        }),
        ok: false,
      });

      expect(mocks.hasPermission).toHaveBeenCalledWith({
        billing: ["checkout"],
      });
      expect(mocks.requireActiveOrgPageContext).not.toHaveBeenCalled();
      expect(mocks.createCheckoutSession).not.toHaveBeenCalled();
      expect(mocks.redirect).not.toHaveBeenCalled();
    });

    it("redirects to Stripe after the role gate permits checkout", async () => {
      await expect(startCheckout("premium")).rejects.toThrow("NEXT_REDIRECT");

      expect(mocks.hasPermission).toHaveBeenCalledWith({
        billing: ["checkout"],
      });
      expect(mocks.createCheckoutSession).toHaveBeenCalledWith(
        accountId,
        "premium"
      );
      expect(mocks.redirect).toHaveBeenCalledWith(redirectUrl);
    });

    it("returns billing Result failure without redirecting when checkout fails", async () => {
      mocks.createCheckoutSession.mockResolvedValue({
        error: { code: "internal", message: "Checkout unavailable" },
        ok: false,
      });

      const result = await startCheckout("basic");
      expect(result).toEqual({
        error: { code: "internal", message: "Checkout unavailable" },
        ok: false,
      });

      expect(mocks.redirect).not.toHaveBeenCalled();
    });
  });

  describe("startPortal", () => {
    it("returns unauthorised Result when signed out", async () => {
      mocks.requireAccountResult.mockResolvedValue({
        error: {
          code: "unauthorised",
          message: "Not authenticated or no account selected",
        },
        ok: false,
      });

      const result = await startPortal();
      expect(result).toEqual({
        error: expect.objectContaining({
          code: "unauthorised",
          message: "Not authenticated or no account selected",
        }),
        ok: false,
      });

      expect(mocks.hasPermission).not.toHaveBeenCalled();
      expect(mocks.requireActiveOrgPageContext).not.toHaveBeenCalled();
      expect(mocks.createPortalSession).not.toHaveBeenCalled();
      expect(mocks.redirect).not.toHaveBeenCalled();
    });

    it("returns forbidden Result when role does not have portal permission", async () => {
      mocks.hasPermission.mockResolvedValue(false);

      const result = await startPortal();
      expect(result).toEqual({
        error: expect.objectContaining({
          code: "forbidden",
          message: "Permission denied",
        }),
        ok: false,
      });

      expect(mocks.hasPermission).toHaveBeenCalledWith({
        billing: ["portal"],
      });
      expect(mocks.requireActiveOrgPageContext).not.toHaveBeenCalled();
      expect(mocks.createPortalSession).not.toHaveBeenCalled();
      expect(mocks.redirect).not.toHaveBeenCalled();
    });

    it("redirects to Stripe after the role gate permits portal access", async () => {
      await expect(startPortal()).rejects.toThrow("NEXT_REDIRECT");

      expect(mocks.hasPermission).toHaveBeenCalledWith({
        billing: ["portal"],
      });
      expect(mocks.createPortalSession).toHaveBeenCalledWith(accountId);
      expect(mocks.redirect).toHaveBeenCalledWith(redirectUrl);
    });

    it("returns billing Result failure without redirecting when portal creation fails", async () => {
      mocks.createPortalSession.mockResolvedValue({
        error: { code: "internal", message: "Portal unavailable" },
        ok: false,
      });

      const result = await startPortal();
      expect(result).toEqual({
        error: { code: "internal", message: "Portal unavailable" },
        ok: false,
      });

      expect(mocks.redirect).not.toHaveBeenCalled();
    });
  });
});
