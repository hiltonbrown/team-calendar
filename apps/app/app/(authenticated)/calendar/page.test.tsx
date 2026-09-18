import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  currentUser: vi.fn(),
  getCalendarRange: vi.fn(),
  locationFindMany: vi.fn(),
  organisationFindFirst: vi.fn(),
  personFindFirst: vi.fn(),
  requireActiveOrgPageContext: vi.fn(),
  requirePageRole: vi.fn(),
  scopedQuery: vi.fn((clerkOrgId: string, organisationId: string) => ({
    clerk_org_id: clerkOrgId,
    organisation_id: organisationId,
  })),
  teamFindMany: vi.fn(),
}));

const XERO_NOT_CONNECTED_COPY = /Xero is not connected/;

vi.mock("@repo/auth/server", () => ({
  auth: mocks.auth,
  currentUser: mocks.currentUser,
}));
vi.mock("@repo/availability", () => ({
  getCalendarRange: mocks.getCalendarRange,
}));
vi.mock("@repo/database", () => ({
  database: {
    location: { findMany: mocks.locationFindMany },
    organisation: { findFirst: mocks.organisationFindFirst },
    person: { findFirst: mocks.personFindFirst },
    team: { findMany: mocks.teamFindMany },
  },
  scopedQuery: mocks.scopedQuery,
}));
vi.mock("@/lib/auth/require-page-role", () => ({
  requirePageRole: mocks.requirePageRole,
}));
vi.mock("@/lib/server/require-active-org-page-context", () => ({
  requireActiveOrgPageContext: mocks.requireActiveOrgPageContext,
}));
vi.mock("next/navigation", () => ({
  redirect: (href: string) => {
    throw new Error(`redirect:${href}`);
  },
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("../components/header", () => ({
  Header: ({ page }: { page: string }) => <header>{page}</header>,
}));
vi.mock("@/components/calendar/calendar-toolbar", () => ({
  CalendarToolbar: () => <div>Toolbar</div>,
}));
vi.mock("@/components/calendar/calendar-scan-panel", () => ({
  CalendarScanPanel: () => <div>Today in view</div>,
}));
vi.mock("@/components/calendar/calendar-timeline", () => ({
  CalendarTimeline: () => (
    <section aria-label="Calendar">Calendar surface</section>
  ),
}));
vi.mock("@/components/calendar/calendar-day-view", () => ({
  CalendarDayView: () => <div>Day view</div>,
}));
vi.mock("@/components/calendar/calendar-week-view", () => ({
  CalendarWeekView: () => <div>Week view</div>,
}));
vi.mock("@/components/calendar/calendar-month-view", () => ({
  CalendarMonthView: () => <div>Month view</div>,
}));

const Page = (await import("./page")).default;

describe("CalendarPage", () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ orgRole: "org:viewer" });
    mocks.currentUser.mockResolvedValue({ id: "user_1" });
    mocks.requireActiveOrgPageContext.mockResolvedValue({
      clerkOrgId: "org_1",
      organisationId: "00000000-0000-4000-8000-000000000001",
      orgQueryValue: null,
    });
    mocks.personFindFirst.mockResolvedValue({
      id: "00000000-0000-4000-8000-000000000011",
    });
    mocks.organisationFindFirst.mockResolvedValue({
      timezone: "Australia/Brisbane",
    });
    mocks.teamFindMany.mockResolvedValue([]);
    mocks.locationFindMany.mockResolvedValue([]);
    mocks.getCalendarRange.mockResolvedValue({
      ok: true,
      value: calendarRange(),
    });
  });

  it("uses viewer default scope my_self", async () => {
    render(await Page({ searchParams: Promise.resolve({}) }));

    expect(mocks.getCalendarRange).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: { type: "my_self" },
      })
    );
    expect(screen.getByRole("region", { name: "Calendar" })).toBeDefined();
    expect(screen.queryByText("Today in view")).toBeNull();
  });

  it("uses admin default scope all_teams", async () => {
    mocks.auth.mockResolvedValue({ orgRole: "org:admin" });

    render(await Page({ searchParams: Promise.resolve({}) }));

    expect(mocks.getCalendarRange).toHaveBeenCalledWith(
      expect.objectContaining({
        role: "admin",
        scope: { type: "all_teams" },
      })
    );
  });

  it("renders the disconnected Xero banner", async () => {
    render(await Page({ searchParams: Promise.resolve({}) }));

    expect(screen.getByText(XERO_NOT_CONNECTED_COPY)).toBeDefined();
  });

  it("normalises the legacy coverage URL to the integrated runway", async () => {
    render(
      await Page({ searchParams: Promise.resolve({ surface: "coverage" }) })
    );

    expect(screen.getByRole("region", { name: "Calendar" })).toBeDefined();
    expect(screen.queryByText("Week view")).toBeNull();
  });

  it("preserves the focused day view with scan context", async () => {
    mocks.getCalendarRange.mockResolvedValue({
      ok: true,
      value: { ...calendarRange(), view: "day" },
    });

    render(await Page({ searchParams: Promise.resolve({ view: "day" }) }));

    expect(screen.getByText("Day view")).toBeDefined();
    expect(screen.getByText("Today in view")).toBeDefined();
    expect(screen.queryByRole("region", { name: "Calendar" })).toBeNull();
  });

  it("renders FetchErrorState on loader failure", async () => {
    mocks.getCalendarRange.mockResolvedValue({
      error: { code: "unknown_error", message: "Nope" },
      ok: false,
    });

    render(await Page({ searchParams: Promise.resolve({}) }));

    expect(screen.getByText("Unable to load calendar")).toBeDefined();
    expect(screen.getByRole("button", { name: "Try again" })).toBeDefined();
  });
});

function calendarRange() {
  return {
    days: [
      {
        date: new Date("2026-04-15T00:00:00.000Z"),
        dayOfWeek: 3,
        events: [],
        isToday: true,
        publicHolidays: [],
      },
    ],
    hasActiveXeroConnection: false,
    people: [],
    range: {
      end: new Date("2026-04-16T00:00:00.000Z"),
      start: new Date("2026-04-15T00:00:00.000Z"),
      timezone: "Australia/Brisbane",
    },
    totalPeopleInScope: 0,
    truncated: false,
    view: "week",
    xeroSyncFailedCount: 0,
  };
}
