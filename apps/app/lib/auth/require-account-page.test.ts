import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireAccountPage } from "./require-account-page";

const mocks = vi.hoisted(() => ({ session: vi.fn(), user: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@repo/auth/server", () => ({
  getCurrentUser: mocks.user,
  getSession: mocks.session,
}));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));

describe("server account page authorisation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.session.mockResolvedValue({
      accountId: "account",
      role: "viewer",
      sessionId: "session",
      userId: "user",
    });
    mocks.user.mockResolvedValue({ emailVerified: true, id: "user" });
  });
  it("returns the validated current account and role", async () => {
    expect(await requireAccountPage()).toMatchObject({
      accountId: "account",
      session: { role: "viewer" },
    });
  });
  it("rejects cookie-only routing when no real session exists", async () => {
    mocks.session.mockResolvedValue(null);
    await expect(requireAccountPage()).rejects.toThrow("redirect:/sign-in");
  });
  it("requires verified email and an active account", async () => {
    mocks.user.mockResolvedValue({ emailVerified: false, id: "user" });
    await expect(requireAccountPage()).rejects.toThrow(
      "redirect:/verify-email"
    );
    mocks.user.mockResolvedValue({ emailVerified: true, id: "user" });
    mocks.session.mockResolvedValue({
      accountId: null,
      role: null,
      userId: "user",
    });
    await expect(requireAccountPage()).rejects.toThrow(
      "redirect:/select-account"
    );
  });
  it("preserves auth store outages rather than turning them into signed-out redirects", async () => {
    const error = new Error("auth store unavailable");
    mocks.session.mockRejectedValue(error);
    await expect(requireAccountPage()).rejects.toBe(error);
  });
});
