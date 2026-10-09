import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WizardInputs } from "./wizard-rules";

const mocks = vi.hoisted(() => ({
  advanceOnboardingStep: vi.fn(),
  completeOnboarding: vi.fn(),
  completeWelcome: vi.fn(),
  getWelcomeState: vi.fn(),
  loadWizardInputs: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@repo/database/queries/onboarding", () => ({
  advanceOnboardingStep: mocks.advanceOnboardingStep,
  completeOnboarding: mocks.completeOnboarding,
  completeWelcome: mocks.completeWelcome,
  getWelcomeState: mocks.getWelcomeState,
}));
vi.mock("./wizard-state", () => ({ loadWizardInputs: mocks.loadWizardInputs }));

const { advanceWizard, finishWizard, loadWizardSnapshot } = await import(
  "./wizard-service"
);
const { completeMemberWelcome, loadWelcomeEligibility } = await import(
  "./welcome-service"
);

const done = new Date("2026-10-09T00:00:00.000Z");
const admin = {
  actingRole: "org:admin",
  clerkOrgId: "org_1",
  organisationId: "00000000-0000-4000-8000-000000000001",
  userId: "user_admin",
};

function inputs(overrides: Partial<WizardInputs> = {}): WizardInputs {
  return {
    actingUserLinked: true,
    completedAt: null,
    connection: null,
    organisationTimezone: "Australia/Brisbane",
    pendingMatches: 0,
    step: "details",
    xeroSkippedAt: null,
    ...overrides,
  };
}

describe("wizard service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.advanceOnboardingStep.mockResolvedValue({
      ok: true,
      value: { advanced: true },
    });
    mocks.completeOnboarding.mockResolvedValue({
      ok: true,
      value: { completedAt: done },
    });
  });

  it("refuses members", async () => {
    await expect(
      loadWizardSnapshot({ ...admin, actingRole: "org:viewer" })
    ).resolves.toMatchObject({ error: { code: "not_authorised" }, ok: false });
    expect(mocks.loadWizardInputs).not.toHaveBeenCalled();
  });

  it("advances from the stored step when its rule holds", async () => {
    mocks.loadWizardInputs
      .mockResolvedValueOnce({ ok: true, value: inputs() })
      .mockResolvedValueOnce({ ok: true, value: inputs({ step: "xero" }) });
    const result = await advanceWizard(admin, "details");
    expect(mocks.advanceOnboardingStep).toHaveBeenCalledWith(
      admin.clerkOrgId,
      admin.organisationId,
      "details",
      "xero"
    );
    expect(result).toMatchObject({ ok: true, value: { step: "xero" } });
  });

  it("returns the current snapshot to a stale tab without advancing", async () => {
    mocks.loadWizardInputs.mockResolvedValue({
      ok: true,
      value: inputs({ step: "people" }),
    });
    const result = await advanceWizard(admin, "details");
    expect(result).toMatchObject({ ok: true, value: { step: "people" } });
    expect(mocks.advanceOnboardingStep).not.toHaveBeenCalled();
  });

  it("rejects skipping ahead and incomplete steps", async () => {
    mocks.loadWizardInputs.mockResolvedValue({
      ok: true,
      value: inputs({ step: "xero" }),
    });
    await expect(advanceWizard(admin, "people")).resolves.toMatchObject({
      error: { code: "stale_step" },
      ok: false,
    });
    await expect(advanceWizard(admin, "xero")).resolves.toMatchObject({
      error: { code: "step_incomplete" },
      ok: false,
    });
    expect(mocks.advanceOnboardingStep).not.toHaveBeenCalled();
  });

  it("finishes in manual mode without waiting for an import", async () => {
    mocks.loadWizardInputs.mockResolvedValue({
      ok: true,
      value: inputs({ step: "finish", xeroSkippedAt: done }),
    });
    await expect(finishWizard(admin, { force: false })).resolves.toMatchObject({
      ok: true,
      value: { redirectTo: "/calendar" },
    });
    expect(mocks.completeOnboarding).toHaveBeenCalledOnce();
  });

  it("waits for leave unless forced, and never completes before the finish step", async () => {
    const running = inputs({
      connection: {
        balances: { completedAt: null, latestRunStatus: null },
        importRequestedAt: done,
        leave: { completedAt: null, latestRunStatus: "running" },
        people: { completedAt: done, latestRunStatus: "succeeded" },
      },
      step: "finish",
    });
    mocks.loadWizardInputs.mockResolvedValue({ ok: true, value: running });
    await expect(finishWizard(admin, { force: false })).resolves.toMatchObject({
      error: { code: "step_incomplete" },
      ok: false,
    });
    await expect(finishWizard(admin, { force: true })).resolves.toMatchObject({
      ok: true,
    });
    mocks.completeOnboarding.mockClear();
    mocks.loadWizardInputs.mockResolvedValue({
      ok: true,
      value: { ...running, step: "invites" },
    });
    await expect(finishWizard(admin, { force: true })).resolves.toMatchObject({
      error: { code: "stale_step" },
      ok: false,
    });
    expect(mocks.completeOnboarding).not.toHaveBeenCalled();
  });

  it("treats an already completed wizard as finished", async () => {
    mocks.loadWizardInputs.mockResolvedValue({
      ok: true,
      value: inputs({ completedAt: done, step: "finish" }),
    });
    await expect(finishWizard(admin, { force: false })).resolves.toMatchObject({
      ok: true,
    });
    expect(mocks.completeOnboarding).not.toHaveBeenCalled();
  });
});

describe("welcome service", () => {
  beforeEach(() => vi.clearAllMocks());

  it("is never eligible for owners and admins", async () => {
    await expect(loadWelcomeEligibility(admin)).resolves.toEqual({
      ok: true,
      value: { eligible: false, personId: null },
    });
    expect(mocks.getWelcomeState).not.toHaveBeenCalled();
  });

  it("is eligible only for a linked member who has not finished it", async () => {
    const member = { ...admin, actingRole: "org:viewer", userId: "user_m" };
    mocks.getWelcomeState.mockResolvedValueOnce({
      ok: true,
      value: { completedAt: null, personId: "p1" },
    });
    await expect(loadWelcomeEligibility(member)).resolves.toEqual({
      ok: true,
      value: { eligible: true, personId: "p1" },
    });
    mocks.getWelcomeState.mockResolvedValueOnce({ ok: true, value: null });
    await expect(loadWelcomeEligibility(member)).resolves.toEqual({
      ok: true,
      value: { eligible: false, personId: null },
    });
    mocks.getWelcomeState.mockResolvedValueOnce({
      ok: true,
      value: { completedAt: done, personId: "p1" },
    });
    await expect(loadWelcomeEligibility(member)).resolves.toMatchObject({
      value: { eligible: false },
    });
  });

  it("completes the welcome for the member's own person only", async () => {
    const member = { ...admin, actingRole: "org:viewer", userId: "user_m" };
    mocks.getWelcomeState.mockResolvedValueOnce({
      ok: true,
      value: { completedAt: null, personId: "p1" },
    });
    mocks.completeWelcome.mockResolvedValueOnce({ ok: true, value: undefined });
    await expect(completeMemberWelcome(member)).resolves.toEqual({
      ok: true,
      value: undefined,
    });
    expect(mocks.completeWelcome).toHaveBeenCalledWith(
      member.clerkOrgId,
      member.organisationId,
      "p1",
      "user_m"
    );
  });
});
