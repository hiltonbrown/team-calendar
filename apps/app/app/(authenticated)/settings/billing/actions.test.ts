import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createCheckoutSession: vi.fn(),
  createPortalSession: vi.fn(),
  redirect: vi.fn(),
  requireActiveOrgPageContext: vi.fn(),
  requirePageRole: vi.fn(),
}));

vi.mock("@/lib/auth/require-page-role", () => ({
  requirePageRole: mocks.requirePageRole,
}));
vi.mock("@/lib/server/require-active-org-page-context", () => ({
  requireActiveOrgPageContext: mocks.requireActiveOrgPageContext,
}));
vi.mock("@repo/billing", () => ({
  createCheckoutSession: mocks.createCheckoutSession,
  createPortalSession: mocks.createPortalSession,
}));
vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}));

const { startCheckout, startPortal } = await import("./actions");

const clerkOrgId = "org_1";
const redirectUrl = "https://stripe.example/session";

describe("billing actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requirePageRole.mockResolvedValue(undefined);
    mocks.requireActiveOrgPageContext.mockResolvedValue({ clerkOrgId });
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

  describe("startCheckout", () => {
    it("does not create a checkout session or redirect when unauthorised", async () => {
      mocks.requirePageRole.mockRejectedValue(new Error("Permission denied"));

      await expect(startCheckout("basic")).rejects.toThrow("Permission denied");

      expect(mocks.createCheckoutSession).not.toHaveBeenCalled();
      expect(mocks.redirect).not.toHaveBeenCalled();
    });

    it("does not resolve organisation context when the role gate rejects", async () => {
      mocks.requirePageRole.mockRejectedValue(new Error("Permission denied"));

      await expect(startCheckout("basic")).rejects.toThrow("Permission denied");

      expect(mocks.requireActiveOrgPageContext).not.toHaveBeenCalled();
    });

    it("redirects to Stripe after the role gate permits checkout", async () => {
      await expect(startCheckout("premium")).rejects.toThrow("NEXT_REDIRECT");

      expect(mocks.requirePageRole).toHaveBeenCalledWith("org:admin");
      expect(mocks.createCheckoutSession).toHaveBeenCalledWith(
        clerkOrgId,
        "premium"
      );
      expect(mocks.redirect).toHaveBeenCalledWith(redirectUrl);
    });

    it("throws the billing error without redirecting when checkout fails", async () => {
      mocks.createCheckoutSession.mockResolvedValue({
        ok: false,
        error: { message: "Checkout unavailable" },
      });

      await expect(startCheckout("basic")).rejects.toThrow(
        "Checkout unavailable"
      );

      expect(mocks.redirect).not.toHaveBeenCalled();
    });
  });

  describe("startPortal", () => {
    it("does not create a portal session or redirect when unauthorised", async () => {
      mocks.requirePageRole.mockRejectedValue(new Error("Permission denied"));

      await expect(startPortal()).rejects.toThrow("Permission denied");

      expect(mocks.createPortalSession).not.toHaveBeenCalled();
      expect(mocks.redirect).not.toHaveBeenCalled();
    });

    it("does not resolve organisation context when the role gate rejects", async () => {
      mocks.requirePageRole.mockRejectedValue(new Error("Permission denied"));

      await expect(startPortal()).rejects.toThrow("Permission denied");

      expect(mocks.requireActiveOrgPageContext).not.toHaveBeenCalled();
    });

    it("redirects to Stripe after the role gate permits portal access", async () => {
      await expect(startPortal()).rejects.toThrow("NEXT_REDIRECT");

      expect(mocks.requirePageRole).toHaveBeenCalledWith("org:admin");
      expect(mocks.createPortalSession).toHaveBeenCalledWith(clerkOrgId);
      expect(mocks.redirect).toHaveBeenCalledWith(redirectUrl);
    });

    it("throws the billing error without redirecting when portal creation fails", async () => {
      mocks.createPortalSession.mockResolvedValue({
        ok: false,
        error: { message: "Portal unavailable" },
      });

      await expect(startPortal()).rejects.toThrow("Portal unavailable");

      expect(mocks.redirect).not.toHaveBeenCalled();
    });
  });
});
