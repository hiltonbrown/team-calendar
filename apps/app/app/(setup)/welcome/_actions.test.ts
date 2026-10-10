import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  captureOnboardingEvent: vi.fn(),
  completeMemberWelcome: vi.fn(),
  currentUser: vi.fn(),
  getActiveOrgContext: vi.fn(),
  revalidatePath: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@repo/auth/server", () => ({
  auth: mocks.auth,
  currentUser: mocks.currentUser,
}));
vi.mock("@repo/availability", () => ({
  completeMemberWelcome: mocks.completeMemberWelcome,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/server/get-active-org-context", () => ({
  getActiveOrgContext: mocks.getActiveOrgContext,
}));
vi.mock("@/lib/server/onboarding-analytics", () => ({
  captureOnboardingEvent: mocks.captureOnboardingEvent,
}));

const { completeWelcomeAction } = await import("./_actions");
const organisationId = "00000000-0000-4000-8000-000000000001";

describe("completeWelcomeAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ orgRole: "org:viewer" });
    mocks.currentUser.mockResolvedValue({ id: "user_m" });
    mocks.getActiveOrgContext.mockResolvedValue({
      ok: true,
      value: { clerkOrgId: "org_1", organisationId },
    });
    mocks.completeMemberWelcome.mockResolvedValue({
      ok: true,
      value: undefined,
    });
  });

  it("marks the welcome as seen for the member and records it", async () => {
    expect(
      await completeWelcomeAction({ organisationId, skipped: true })
    ).toEqual({ ok: true, value: { redirectTo: "/" } });
    expect(mocks.completeMemberWelcome).toHaveBeenCalledWith({
      actingRole: "org:viewer",
      clerkOrgId: "org_1",
      organisationId,
      userId: "user_m",
    });
    expect(mocks.captureOnboardingEvent).toHaveBeenCalledWith({
      distinctId: "user_m",
      event: "Member Welcome Completed",
      properties: { skipped: true },
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("refuses requests outside the active organisation", async () => {
    mocks.getActiveOrgContext.mockResolvedValue({
      error: { code: "not_found", message: "No" },
      ok: false,
    });
    expect(
      await completeWelcomeAction({ organisationId, skipped: false })
    ).toMatchObject({ error: { code: "not_authorised" }, ok: false });
    expect(mocks.completeMemberWelcome).not.toHaveBeenCalled();
  });

  it("reports a save failure without recording analytics", async () => {
    mocks.completeMemberWelcome.mockResolvedValue({
      error: { code: "not_found", message: "Person not found." },
      ok: false,
    });
    expect(
      await completeWelcomeAction({ organisationId, skipped: false })
    ).toMatchObject({ error: { code: "unknown_error" }, ok: false });
    expect(mocks.captureOnboardingEvent).not.toHaveBeenCalled();
  });
});
