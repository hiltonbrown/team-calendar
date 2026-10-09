import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  advanceWizard: vi.fn(),
  auth: vi.fn(),
  captureOnboardingEvent: vi.fn(),
  connectXeroAction: vi.fn(),
  currentUser: vi.fn(),
  finishWizard: vi.fn(),
  getActiveOrgContext: vi.fn(),
  revalidatePath: vi.fn(),
  setXeroSetupSkipped: vi.fn(),
  updateOrganisationAction: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@repo/auth/server", () => ({
  auth: mocks.auth,
  currentUser: mocks.currentUser,
}));
vi.mock("@repo/availability", () => ({
  advanceWizard: mocks.advanceWizard,
  finishWizard: mocks.finishWizard,
  isOnboardingAdmin: (role: string | null) =>
    role === "org:admin" || role === "org:owner",
}));
vi.mock("@repo/database/queries/onboarding", () => ({
  setXeroSetupSkipped: mocks.setXeroSetupSkipped,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/app/(authenticated)/settings/general/_actions", () => ({
  updateOrganisationAction: mocks.updateOrganisationAction,
}));
vi.mock("@/app/(authenticated)/settings/integrations/xero/_actions", () => ({
  connectXeroAction: mocks.connectXeroAction,
}));
vi.mock("@/lib/server/get-active-org-context", () => ({
  getActiveOrgContext: mocks.getActiveOrgContext,
}));
vi.mock("@/lib/server/onboarding-analytics", () => ({
  captureOnboardingEvent: mocks.captureOnboardingEvent,
}));

const {
  advanceStepAction,
  finishAction,
  saveDetailsAction,
  skipXeroAction,
  startXeroFromOnboardingAction,
} = await import("./_actions");

const organisationId = "00000000-0000-4000-8000-000000000001";
const snapshot = { mode: "undecided", step: "xero" };
const actor = {
  actingRole: "org:admin",
  clerkOrgId: "org_1",
  organisationId,
  userId: "user_admin",
};

describe("onboarding actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ orgRole: "org:admin" });
    mocks.currentUser.mockResolvedValue({ id: "user_admin" });
    mocks.getActiveOrgContext.mockResolvedValue({
      ok: true,
      value: { clerkOrgId: "org_1", organisationId },
    });
    mocks.updateOrganisationAction.mockResolvedValue({ ok: true, value: {} });
    mocks.advanceWizard.mockResolvedValue({ ok: true, value: snapshot });
    mocks.setXeroSetupSkipped.mockResolvedValue({ ok: true, value: undefined });
  });

  it.each([
    [
      { name: "", timezone: "Australia/Sydney" },
      "Enter your organisation name.",
    ],
    [{ name: "Acme", timezone: "UTC" }, "Choose an Australian timezone."],
  ])("rejects invalid details %j", async (details, message) => {
    expect(
      await saveDetailsAction({ ...details, organisationId } as never)
    ).toEqual({ error: { code: "validation_error", message }, ok: false });
    expect(mocks.updateOrganisationAction).not.toHaveBeenCalled();
  });

  it.each(["org:viewer", "org:manager", null])(
    "refuses %s",
    async (orgRole) => {
      mocks.auth.mockResolvedValue({ orgRole });
      expect(
        await saveDetailsAction({
          name: "Acme",
          organisationId,
          timezone: "Australia/Brisbane",
        })
      ).toMatchObject({ error: { code: "not_authorised" }, ok: false });
      expect(mocks.updateOrganisationAction).not.toHaveBeenCalled();
    }
  );

  it("saves details through General settings and advances", async () => {
    const result = await saveDetailsAction({
      name: " Acme Pty Ltd ",
      organisationId,
      timezone: "Australia/Brisbane",
    });
    expect(mocks.updateOrganisationAction).toHaveBeenCalledWith({
      name: "Acme Pty Ltd",
      organisationId,
      timezone: "Australia/Brisbane",
    });
    expect(mocks.advanceWizard).toHaveBeenCalledWith(actor, "details");
    expect(mocks.captureOnboardingEvent).toHaveBeenCalledWith({
      distinctId: "user_admin",
      event: "Onboarding Step Completed",
      properties: { mode: "undecided", step: "details" },
    });
    expect(result).toEqual({ ok: true, value: snapshot });
  });

  it("does not advance when saving the details fails", async () => {
    mocks.updateOrganisationAction.mockResolvedValue({
      error: { code: "unknown_error", message: "Failed to update." },
      ok: false,
    });
    expect(
      await saveDetailsAction({
        name: "Acme",
        organisationId,
        timezone: "Australia/Sydney",
      })
    ).toMatchObject({ ok: false });
    expect(mocks.advanceWizard).not.toHaveBeenCalled();
  });

  it("starts Xero OAuth that returns to the wizard", async () => {
    mocks.connectXeroAction.mockResolvedValue({
      ok: true,
      value: { redirectUrl: "https://api.test/start" },
    });
    expect(await startXeroFromOnboardingAction({ organisationId })).toEqual({
      ok: true,
      value: { redirectUrl: "https://api.test/start" },
    });
    expect(mocks.connectXeroAction).toHaveBeenCalledWith({
      organisationId,
      returnTo: "/onboarding",
    });
  });

  it("records the manual choice and advances past Xero", async () => {
    await skipXeroAction({ organisationId });
    expect(mocks.setXeroSetupSkipped).toHaveBeenCalledWith(
      "org_1",
      organisationId,
      true
    );
    expect(mocks.advanceWizard).toHaveBeenCalledWith(actor, "xero");
  });

  it("passes service refusals through without recording a step", async () => {
    mocks.advanceWizard.mockResolvedValue({
      error: { code: "step_incomplete", message: "Not yet." },
      ok: false,
    });
    expect(await advanceStepAction({ from: "people", organisationId })).toEqual(
      {
        error: { code: "step_incomplete", message: "Not yet." },
        ok: false,
      }
    );
    expect(mocks.captureOnboardingEvent).not.toHaveBeenCalled();
  });

  it("finishes into the calendar and records completion", async () => {
    mocks.finishWizard.mockResolvedValue({
      ok: true,
      value: { redirectTo: "/calendar", snapshot: { mode: "xero" } },
    });
    expect(await finishAction({ force: true, organisationId })).toEqual({
      ok: true,
      value: { redirectTo: "/calendar" },
    });
    expect(mocks.finishWizard).toHaveBeenCalledWith(actor, { force: true });
    expect(mocks.captureOnboardingEvent).toHaveBeenCalledWith({
      distinctId: "user_admin",
      event: "Onboarding Completed",
      properties: { forced: true, mode: "xero" },
    });
  });
});
