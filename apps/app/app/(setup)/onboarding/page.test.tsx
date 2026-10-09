import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  currentUser: vi.fn(),
  getOrganisationById: vi.fn(),
  loadOnboardingPeople: vi.fn(),
  loadWizardSnapshot: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
  requireActiveOrgPageContext: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@repo/auth/server", () => ({
  auth: mocks.auth,
  currentUser: mocks.currentUser,
}));
vi.mock("@repo/availability", () => ({
  isOnboardingAdmin: (role: string | null) =>
    role === "org:admin" || role === "org:owner",
  loadWizardSnapshot: mocks.loadWizardSnapshot,
}));
vi.mock("@repo/database/queries/organisations", () => ({
  getOrganisationById: mocks.getOrganisationById,
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/server/require-active-org-page-context", () => ({
  requireActiveOrgPageContext: mocks.requireActiveOrgPageContext,
}));
vi.mock("@/lib/server/load-onboarding-people", () => ({
  loadOnboardingPeople: mocks.loadOnboardingPeople,
}));
vi.mock("./steps/details-step", () => ({
  DetailsStep: (props: { name: string; timezone: string | null }) => (
    <div>
      Details step {props.name} {props.timezone}
    </div>
  ),
}));
vi.mock("./steps/xero-step", () => ({
  XeroStep: (props: { connected: boolean; returnMessage: string | null }) => (
    <div>
      Xero step {String(props.connected)} {props.returnMessage}
    </div>
  ),
  xeroReturnMessage: (input: {
    cancelled: boolean;
    errorCode: string | null;
  }) => (input.errorCode ? `error:${input.errorCode}` : null),
}));
vi.mock("./steps/people-step", () => ({
  PeopleStep: () => <div>People step</div>,
}));
vi.mock("./steps/invite-step", () => ({
  InviteStep: () => <div>Invite step</div>,
}));
vi.mock("./steps/finish-step", () => ({
  FinishStep: () => <div>Finish step</div>,
}));

const Page = (await import("./page")).default;
const organisationId = "00000000-0000-4000-8000-000000000001";
const ANY_STEP = /step/;

function snapshot(overrides: Record<string, unknown> = {}) {
  return {
    ok: true,
    value: {
      actingUserLinked: true,
      completed: false,
      import: {
        balances: "not_started",
        leave: "not_started",
        people: "not_started",
      },
      mode: "undecided",
      pendingMatches: 0,
      step: "details",
      timezoneConfirmed: false,
      ...overrides,
    },
  };
}

async function renderPage(params: Record<string, string> = {}) {
  render(await Page({ searchParams: Promise.resolve(params) }));
}

describe("OnboardingPage", () => {
  beforeEach(() => {
    mocks.auth.mockResolvedValue({ orgRole: "org:owner" });
    mocks.currentUser.mockResolvedValue({ id: "user_owner" });
    mocks.requireActiveOrgPageContext.mockResolvedValue({
      clerkOrgId: "org_1",
      organisationId,
      orgQueryValue: null,
    });
    mocks.getOrganisationById.mockResolvedValue({
      ok: true,
      value: { name: "Acme", timezone: "UTC" },
    });
    mocks.loadOnboardingPeople.mockResolvedValue({
      actingPerson: null,
      inviteRoster: [],
      matches: [],
      peopleCount: 0,
      selfCandidates: [],
    });
    mocks.loadWizardSnapshot.mockResolvedValue(snapshot());
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("sends members back to the app", async () => {
    mocks.auth.mockResolvedValue({ orgRole: "org:viewer" });
    await expect(renderPage()).rejects.toThrow("redirect:/");
    expect(mocks.loadWizardSnapshot).not.toHaveBeenCalled();
  });

  it("sends a completed organisation to the calendar", async () => {
    mocks.loadWizardSnapshot.mockResolvedValue(snapshot({ completed: true }));
    await expect(renderPage()).rejects.toThrow("redirect:/calendar");
  });

  it("starts at organisation details with no Back link", async () => {
    await renderPage();
    expect(screen.getByText("Details step Acme UTC")).toBeTruthy();
    expect(screen.getByText("Step 1 of 5")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Back" })).toBeNull();
  });

  it("shows the stored step with a Back link to the previous step", async () => {
    mocks.loadWizardSnapshot.mockResolvedValue(snapshot({ step: "people" }));
    await renderPage();
    expect(screen.getByText("People step")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Back" }).getAttribute("href")
    ).toBe("/onboarding?step=xero");
  });

  it("lets an admin review an earlier step but never skip ahead", async () => {
    mocks.loadWizardSnapshot.mockResolvedValue(snapshot({ step: "invites" }));
    await renderPage({ step: "xero" });
    expect(screen.getByText("Xero step false")).toBeTruthy();
    cleanup();
    mocks.loadWizardSnapshot.mockResolvedValue(snapshot({ step: "xero" }));
    await renderPage({ step: "finish" });
    expect(screen.queryByText("Finish step")).toBeNull();
    expect(screen.getByText("Xero step false")).toBeTruthy();
  });

  it("passes the Xero return code to the Xero step", async () => {
    mocks.loadWizardSnapshot.mockResolvedValue(snapshot({ step: "xero" }));
    await renderPage({ xero_error: "expired" });
    expect(screen.getByText("Xero step false error:expired")).toBeTruthy();
  });

  it("shows a load error instead of a broken step", async () => {
    mocks.loadWizardSnapshot.mockResolvedValue({
      error: { code: "unknown_error", message: "down" },
      ok: false,
    });
    await renderPage();
    expect(screen.queryByText(ANY_STEP)).toBeNull();
  });
});
