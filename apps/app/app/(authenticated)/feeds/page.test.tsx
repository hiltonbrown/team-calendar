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
vi.mock("@repo/auth/helpers", () => ({
  requireAccount: () => Promise.resolve("org_1"),
}));

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getOwnFeedEligibility: vi.fn(),
  getSession: vi.fn(),
  listFeeds: vi.fn(),
  requireActiveOrgPageContext: vi.fn(),
  requirePagePermission: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@repo/auth/server", () => ({
  getCurrentUser: mocks.getCurrentUser,
  getSession: mocks.getSession,
}));
vi.mock("@repo/feeds", () => ({
  getOwnFeedEligibility: mocks.getOwnFeedEligibility,
  listFeeds: mocks.listFeeds,
  normaliseRole: (role: string | null) => role,
}));
vi.mock("@/lib/auth/require-page-permission", () => ({
  requirePagePermission: mocks.requirePagePermission,
}));
vi.mock("@/lib/server/require-active-org-page-context", () => ({
  requireActiveOrgPageContext: mocks.requireActiveOrgPageContext,
  resolveActiveOrgPageContext: mocks.requireActiveOrgPageContext,
}));
vi.mock("../components/header", () => ({
  Header: ({ page }: { page: string }) => <header>{page}</header>,
}));
vi.mock("./_actions", () => ({ createOwnFeedAction: vi.fn() }));

const Page = (await import("./page")).default;
const organisationId = "00000000-0000-4000-8000-000000000001";
const MANAGE_ALL = "Manage all feeds";
const CREATE_PERSONAL = "Create my calendar feed";
const CREATE_TEAM = "Create my team feed";
const ANY_MANAGE = /Manage /;
const NOT_LINKED = /not linked to a person yet/;
const PAUSED = /is paused and not updating/;

function feed(overrides: Record<string, unknown> = {}) {
  return {
    activeTokenHint: null,
    createdAt: new Date("2026-01-01"),
    createdByName: null,
    createdByUserId: "user_admin",
    description: null,
    id: "00000000-0000-4000-8000-000000000101",
    includesPublicHolidays: false,
    isOwnedByActor: false,
    kind: "organisation",
    lastFetchedAt: null,
    lastRenderedAt: null,
    name: "All staff",
    privacyMode: "named",
    scopeCount: 1,
    scopeSummary: "All organisation",
    status: "active",
    subscribeUrl: "https://api.example.test/ical/tc1.org.sig.ics",
    ...overrides,
  };
}

function eligibility(overrides: Record<string, unknown> = {}) {
  return {
    ok: true,
    value: {
      hasDirectReports: false,
      personalFeedId: null,
      personId: "00000000-0000-4000-8000-000000000201",
      teamFeedId: null,
      ...overrides,
    },
  };
}

async function renderPage() {
  render(
    await Page({ searchParams: Promise.resolve({ org: organisationId }) })
  );
}

describe("FeedPage", () => {
  beforeEach(() => {
    mocks.getSession.mockResolvedValue({ role: "viewer" });
    mocks.getCurrentUser.mockResolvedValue({ id: "user_1" });
    mocks.requireActiveOrgPageContext.mockResolvedValue({
      accountId: "org_1",
      organisationId,
      orgQueryValue: organisationId,
    });
    mocks.listFeeds.mockResolvedValue({ ok: true, value: [feed()] });
    mocks.getOwnFeedEligibility.mockResolvedValue(eligibility());
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("leads with the recommended feed and has no management controls", async () => {
    await renderPage();
    expect(
      screen.getByRole("heading", { name: "Calendar feeds" })
    ).toBeTruthy();
    expect(screen.getByText("All staff")).toBeTruthy();
    expect(screen.queryByText(MANAGE_ALL)).toBeNull();
    expect(screen.queryByRole("link", { name: "New feed" })).toBeNull();
    expect(screen.queryByRole("button", { name: ANY_MANAGE })).toBeNull();
    expect(screen.getByRole("button", { name: CREATE_PERSONAL })).toBeTruthy();
    expect(screen.queryByRole("button", { name: CREATE_TEAM })).toBeNull();
    expect(mocks.listFeeds).toHaveBeenCalledWith(
      expect.objectContaining({ filters: { status: ["active", "paused"] } }),
      expect.any(Object)
    );
  });

  it("gives admins a link to manage all feeds", async () => {
    mocks.getSession.mockResolvedValue({ role: "admin" });
    await renderPage();
    expect(
      screen.getByRole("link", { name: MANAGE_ALL }).getAttribute("href")
    ).toBe(`/settings/feeds?org=${organisationId}`);
  });

  it("offers a team feed to managers and hides create actions once feeds exist", async () => {
    mocks.getOwnFeedEligibility.mockResolvedValue(
      eligibility({ hasDirectReports: true })
    );
    await renderPage();
    expect(screen.getByRole("button", { name: CREATE_TEAM })).toBeTruthy();
    cleanup();

    mocks.getOwnFeedEligibility.mockResolvedValue(
      eligibility({
        hasDirectReports: true,
        personalFeedId: "p",
        teamFeedId: "t",
      })
    );
    await renderPage();
    expect(screen.queryByRole("button", { name: CREATE_PERSONAL })).toBeNull();
    expect(screen.queryByRole("button", { name: CREATE_TEAM })).toBeNull();
  });

  it("explains why an unlinked account cannot create a feed", async () => {
    mocks.getOwnFeedEligibility.mockResolvedValue(
      eligibility({ hasDirectReports: true, personId: null })
    );
    await renderPage();
    expect(screen.getByText(NOT_LINKED)).toBeTruthy();
    expect(screen.queryByRole("button", { name: CREATE_PERSONAL })).toBeNull();
    expect(screen.queryByRole("button", { name: CREATE_TEAM })).toBeNull();
  });

  it("recommends the person's own feed and lists the rest compactly", async () => {
    mocks.listFeeds.mockResolvedValue({
      ok: true,
      value: [
        feed(),
        feed({
          id: "00000000-0000-4000-8000-000000000102",
          isOwnedByActor: true,
          kind: "personal",
          name: "Ava's calendar",
          subscribeUrl: "https://api.example.test/ical/tc1.own.sig.ics",
        }),
      ],
    });
    await renderPage();
    expect(
      (
        screen.getByLabelText(
          "Subscribe URL for Ava's calendar"
        ) as HTMLInputElement
      ).value
    ).toBe("https://api.example.test/ical/tc1.own.sig.ics");
    expect(screen.getByRole("link", { name: "All staff" })).toBeTruthy();
  });

  it("flags the person's own paused feed", async () => {
    mocks.listFeeds.mockResolvedValue({
      ok: true,
      value: [
        feed(),
        feed({
          id: "00000000-0000-4000-8000-000000000103",
          isOwnedByActor: true,
          kind: "personal",
          name: "Ava's calendar",
          status: "paused",
        }),
      ],
    });
    await renderPage();
    expect(screen.getByText(PAUSED)).toBeTruthy();
  });

  it("asks for an administrator when nothing is available or creatable", async () => {
    mocks.listFeeds.mockResolvedValue({ ok: true, value: [] });
    mocks.getOwnFeedEligibility.mockResolvedValue(
      eligibility({ personId: null })
    );
    await renderPage();
    expect(screen.getByText("No calendar feed is available yet.")).toBeTruthy();
    expect(
      screen.getByText("Ask an administrator to set one up.")
    ).toBeTruthy();
  });

  it("shows a recoverable error when feeds fail to load", async () => {
    mocks.listFeeds.mockResolvedValue({
      error: { code: "unknown_error", message: "x" },
      ok: false,
    });
    await renderPage();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: CREATE_PERSONAL })).toBeNull();
  });
});
