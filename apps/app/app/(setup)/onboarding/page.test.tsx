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
    typeof import("../../../../../packages/database/src/queries/account-companies")
  >("../../../../../packages/database/src/queries/account-companies")),

  ...(await vi.importActual<typeof import("@repo/database/tenant-db")>(
    "@repo/database/tenant-db"
  )),
  ...(await vi.importActual<
    typeof import("../../../../../packages/database/src/queries/organisations")
  >("../../../../../packages/database/src/queries/organisations")),
}));

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ensureDefaultOrganisation: vi.fn(),
  getCurrentUser: vi.fn(),
  getOrganisationById: vi.fn(),
  getSession: vi.fn(),
  loadOnboardingPeople: vi.fn(),
  loadWizardSnapshot: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
  requireActiveOrgPageContext: vi.fn(),
  resolveAccountCompanies: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@repo/auth/server", () => ({
  getCurrentUser: mocks.getCurrentUser,
  getSession: mocks.getSession,
}));
vi.mock("@repo/availability", () => ({
  isOnboardingAdmin: (role: string | null) =>
    role === "admin" || role === "owner",
  loadWizardSnapshot: mocks.loadWizardSnapshot,
}));
vi.mock("@repo/database/queries/organisations", () => ({
  getOrganisationById: mocks.getOrganisationById,
}));
vi.mock("@repo/database/queries/account-companies", () => ({
  resolveAccountCompanies: mocks.resolveAccountCompanies,
}));
vi.mock("@/lib/server/ensure-default-organisation", () => ({
  ensureDefaultOrganisation: mocks.ensureDefaultOrganisation,
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/server/require-active-org-page-context", () => ({
  requireActiveOrgPageContext: mocks.requireActiveOrgPageContext,
  resolveActiveOrgPageContext: mocks.requireActiveOrgPageContext,
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

async function renderPage(
  params: Record<string, string | string[] | undefined> = {}
) {
  render(await Page({ searchParams: Promise.resolve(params) }));
}

describe("OnboardingPage", () => {
  beforeEach(() => {
    mocks.getSession.mockResolvedValue({ accountId: "org_1", role: "owner" });
    mocks.resolveAccountCompanies.mockResolvedValue([
      { id: organisationId, name: "Acme" },
    ]);
    mocks.ensureDefaultOrganisation.mockResolvedValue({
      accountId: "org_1",
      organisationId,
    });
    mocks.getCurrentUser.mockResolvedValue({ id: "user_owner" });
    mocks.requireActiveOrgPageContext.mockResolvedValue({
      accountId: "org_1",
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

  it("explicitly creates the initial company only during first-run onboarding", async () => {
    mocks.resolveAccountCompanies.mockResolvedValue([]);
    await renderPage();
    expect(mocks.ensureDefaultOrganisation).toHaveBeenCalledWith("org_1");
    expect(mocks.requireActiveOrgPageContext).toHaveBeenCalledWith(
      "org_1",
      organisationId,
      expect.any(Object)
    );
  });
  it("does not create a company while revisiting an existing company URL", async () => {
    await renderPage({ org: organisationId });
    expect(mocks.ensureDefaultOrganisation).not.toHaveBeenCalled();
    expect(mocks.resolveAccountCompanies).not.toHaveBeenCalled();
  });
  it("sends members back to the app", async () => {
    mocks.getSession.mockResolvedValue({ accountId: "org_1", role: "viewer" });
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

  it("renders callback errors without invoking a client export on the server", async () => {
    mocks.loadWizardSnapshot.mockResolvedValue(snapshot({ step: "xero" }));
    await renderPage({ xero_error: "expired" });
    expect(
      screen.getByText(
        "Xero step false The Xero sign-in took too long or was interrupted. Try connecting again."
      )
    ).toBeTruthy();
  });

  it.each([
    {
      message:
        "You cancelled the Xero connection. Connect again, or set up without Xero.",
      params: { xero: "cancelled" },
    },
    {
      message:
        "Xero could not be connected. Try again, or set up without Xero for now.",
      params: { xero_error: "<script>" },
    },
  ])(
    "renders a safe Xero return message for $params",
    async ({ params, message }) => {
      mocks.loadWizardSnapshot.mockResolvedValue(snapshot({ step: "xero" }));
      await renderPage(params);
      expect(screen.getByText(`Xero step false ${message}`)).toBeTruthy();
    }
  );

  it("shows a load error instead of a broken step", async () => {
    mocks.loadWizardSnapshot.mockResolvedValue({
      error: { code: "unknown_error", message: "down" },
      ok: false,
    });
    await renderPage();
    expect(screen.queryByText(ANY_STEP)).toBeNull();
  });
});
