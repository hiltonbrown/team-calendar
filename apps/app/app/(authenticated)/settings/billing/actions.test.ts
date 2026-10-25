import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createCheckoutSession: vi.fn(),
  createPortalSession: vi.fn(),
  redirect: vi.fn(),
  requireActiveOrgPageContext: vi.fn(),
  requirePagePermission: vi.fn(),
}));

vi.mock("@/lib/auth/require-page-permission", () => ({
  requirePagePermission: mocks.requirePagePermission,
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
    mocks.requirePagePermission.mockResolvedValue(undefined);
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
      await expect(startCheckout("basic")).rejects.toThrow(
        "Paid billing operations are disabled during early access."
      );
      expect(mocks.createCheckoutSession).not.toHaveBeenCalled();
    });

    it("rejects portal in early access mode", async () => {
      vi.stubEnv("NEXT_PUBLIC_LAUNCH_MODE", "early_access");
      await expect(startPortal()).rejects.toThrow(
        "Paid billing operations are disabled during early access."
      );
      expect(mocks.createPortalSession).not.toHaveBeenCalled();
    });
  });

  describe("startCheckout", () => {
    it("does not create a checkout session or redirect when unauthorised", async () => {
      mocks.requirePagePermission.mockRejectedValue(
        new Error("Permission denied")
      );

      await expect(startCheckout("basic")).rejects.toThrow("Permission denied");

      expect(mocks.createCheckoutSession).not.toHaveBeenCalled();
      expect(mocks.redirect).not.toHaveBeenCalled();
    });

    it("does not resolve organisation context when the role gate rejects", async () => {
      mocks.requirePagePermission.mockRejectedValue(
        new Error("Permission denied")
      );

      await expect(startCheckout("basic")).rejects.toThrow("Permission denied");

      expect(mocks.requireActiveOrgPageContext).not.toHaveBeenCalled();
    });

    it("redirects to Stripe after the role gate permits checkout", async () => {
      await expect(startCheckout("premium")).rejects.toThrow("NEXT_REDIRECT");

      expect(mocks.requirePagePermission).toHaveBeenCalledWith({
        billing: ["checkout"],
      });
      expect(mocks.createCheckoutSession).toHaveBeenCalledWith(
        accountId,
        "premium"
      );
      expect(mocks.redirect).toHaveBeenCalledWith(redirectUrl);
    });

    it("throws the billing error without redirecting when checkout fails", async () => {
      mocks.createCheckoutSession.mockResolvedValue({
        error: { message: "Checkout unavailable" },
        ok: false,
      });

      await expect(startCheckout("basic")).rejects.toThrow(
        "Checkout unavailable"
      );

      expect(mocks.redirect).not.toHaveBeenCalled();
    });
  });

  describe("startPortal", () => {
    it("does not create a portal session or redirect when unauthorised", async () => {
      mocks.requirePagePermission.mockRejectedValue(
        new Error("Permission denied")
      );

      await expect(startPortal()).rejects.toThrow("Permission denied");

      expect(mocks.createPortalSession).not.toHaveBeenCalled();
      expect(mocks.redirect).not.toHaveBeenCalled();
    });

    it("does not resolve organisation context when the role gate rejects", async () => {
      mocks.requirePagePermission.mockRejectedValue(
        new Error("Permission denied")
      );

      await expect(startPortal()).rejects.toThrow("Permission denied");

      expect(mocks.requireActiveOrgPageContext).not.toHaveBeenCalled();
    });

    it("redirects to Stripe after the role gate permits portal access", async () => {
      await expect(startPortal()).rejects.toThrow("NEXT_REDIRECT");

      expect(mocks.requirePagePermission).toHaveBeenCalledWith({
        billing: ["portal"],
      });
      expect(mocks.createPortalSession).toHaveBeenCalledWith(accountId);
      expect(mocks.redirect).toHaveBeenCalledWith(redirectUrl);
    });

    it("throws the billing error without redirecting when portal creation fails", async () => {
      mocks.createPortalSession.mockResolvedValue({
        error: { message: "Portal unavailable" },
        ok: false,
      });

      await expect(startPortal()).rejects.toThrow("Portal unavailable");

      expect(mocks.redirect).not.toHaveBeenCalled();
    });
  });
});
