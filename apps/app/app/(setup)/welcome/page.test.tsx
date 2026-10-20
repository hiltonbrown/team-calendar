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
vi.mock("../../../../../packages/database/src/tenant-client", () => ({
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

  ...(await vi.importActual<
    typeof import("../../../../../packages/database/src/tenant-db")
  >("../../../../../packages/database/src/tenant-db")),
  ...(await vi.importActual<
    typeof import("../../../../../packages/database/src/queries/organisations")
  >("../../../../../packages/database/src/queries/organisations")),
}));
vi.mock("@repo/auth/helpers", () => ({
  requireOrg: () => Promise.resolve("org_1"),
}));

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  currentUser: vi.fn(),
  getPersonProfile: vi.fn(),
  listFeeds: vi.fn(),
  loadWelcomeEligibility: vi.fn(),
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
  getPersonProfile: mocks.getPersonProfile,
  loadWelcomeEligibility: mocks.loadWelcomeEligibility,
}));
vi.mock("@repo/feeds", () => ({
  listFeeds: mocks.listFeeds,
  normaliseRole: (role: string) => role,
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/server/require-active-org-page-context", () => ({
  requireActiveOrgPageContext: mocks.requireActiveOrgPageContext,
  resolveActiveOrgPageContext: mocks.requireActiveOrgPageContext,
}));
vi.mock("./steps/welcome-controls", () => ({
  SkipToDashboard: () => <button type="button">Skip to dashboard</button>,
}));
vi.mock("./steps/calendar-step", () => ({
  CalendarStep: (props: {
    fallbackFeed: { name: string } | null;
    personalFeed: { name: string } | null;
  }) => (
    <div>
      Calendar step {props.personalFeed?.name ?? "no personal"}{" "}
      {props.fallbackFeed?.name ?? "no fallback"}
    </div>
  ),
}));

const Page = (await import("./page")).default;
const organisationId = "00000000-0000-4000-8000-000000000001";
const STARTS_WITH_ZERO = /^0/;

function profile(rows: unknown[] = [], xeroLinked = true) {
  return {
    ok: true,
    value: {
      balances: { rows, xeroLinked },
      header: {
        email: "mia@example.test",
        firstName: "Mia",
        lastName: "Chen",
        manager: { firstName: "Dan", id: "m1", lastName: "Ray" },
        team: { id: "t1", name: "Sales" },
      },
    },
  };
}

function feed(overrides: Record<string, unknown>) {
  return {
    createdAt: new Date("2026-01-01"),
    id: "f",
    isOwnedByActor: false,
    kind: "organisation",
    name: "All staff",
    status: "active",
    subscribeUrl: "https://api.test/ical/org.ics",
    ...overrides,
  };
}

async function renderPage(params: Record<string, string> = {}) {
  render(await Page({ searchParams: Promise.resolve(params) }));
}

describe("WelcomePage", () => {
  beforeEach(() => {
    mocks.auth.mockResolvedValue({ orgId: "org_1", orgRole: "org:viewer" });
    mocks.currentUser.mockResolvedValue({ id: "user_m" });
    mocks.requireActiveOrgPageContext.mockResolvedValue({
      clerkOrgId: "org_1",
      organisationId,
      orgQueryValue: null,
    });
    mocks.loadWelcomeEligibility.mockResolvedValue({
      ok: true,
      value: { eligible: true, personId: "p1" },
    });
    mocks.getPersonProfile.mockResolvedValue(profile());
    mocks.listFeeds.mockResolvedValue({ ok: true, value: [feed({})] });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("sends ineligible users to the dashboard", async () => {
    mocks.loadWelcomeEligibility.mockResolvedValue({
      ok: true,
      value: { eligible: false, personId: "p1" },
    });
    await expect(renderPage()).rejects.toThrow("redirect:/");
  });

  it("shows who the member is with team and manager", async () => {
    await renderPage();
    expect(screen.getByRole("heading", { name: "This is you" })).toBeTruthy();
    expect(screen.getByText("Mia Chen")).toBeTruthy();
    expect(screen.getByText("Sales")).toBeTruthy();
    expect(screen.getByText("Dan Ray")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Continue" }).getAttribute("href")
    ).toBe("/welcome?step=balances");
    expect(
      screen.getByRole("button", { name: "Skip to dashboard" })
    ).toBeTruthy();
    expect(mocks.getPersonProfile).toHaveBeenCalledWith(
      expect.objectContaining({ personId: "p1", role: "viewer" }),
      expect.any(Object)
    );
  });

  it("shows balances from Xero", async () => {
    mocks.getPersonProfile.mockResolvedValue(
      profile([
        {
          balanceUnits: 7.6,
          currencyCode: null,
          id: "b1",
          leaveTypeName: "Annual leave",
          unitType: "hours",
        },
      ])
    );
    await renderPage({ step: "balances" });
    expect(screen.getByText("Annual leave")).toBeTruthy();
    expect(screen.getByText("7.6 hours")).toBeTruthy();
  });

  it("explains missing balances instead of inventing zeros", async () => {
    mocks.getPersonProfile.mockResolvedValue(profile([], false));
    await renderPage({ step: "balances" });
    expect(
      screen.getByText(
        "Your leave balances will appear here once your organisation connects Xero Payroll."
      )
    ).toBeTruthy();
    expect(screen.queryByText(STARTS_WITH_ZERO)).toBeNull();
  });

  it("offers the member's own feed, or the organisation feed as a fallback", async () => {
    mocks.listFeeds.mockResolvedValue({
      ok: true,
      value: [
        feed({}),
        feed({
          id: "own",
          isOwnedByActor: true,
          kind: "personal",
          name: "Mia's calendar",
          subscribeUrl: "https://api.test/ical/own.ics",
        }),
      ],
    });
    await renderPage({ step: "calendar" });
    expect(
      screen.getByText("Calendar step Mia's calendar no fallback")
    ).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Continue" })).toBeNull();
    cleanup();
    mocks.listFeeds.mockResolvedValue({ ok: true, value: [feed({})] });
    await renderPage({ step: "calendar" });
    expect(
      screen.getByText("Calendar step no personal All staff")
    ).toBeTruthy();
  });
});
