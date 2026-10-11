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
  resolveAccountCompanies: vi.fn(),
  scopedQuery: vi.fn((clerkOrgId: string, organisationId: string) => ({
    clerk_org_id: clerkOrgId,
    organisation_id: organisationId,
  })),
  teamFindMany: vi.fn(),
  xeroTenantFindFirst: vi.fn(),
}));
const XERO_NOT_CONNECTED_COPY = /Xero is not connected/;
const LEAVE_SYNCED_REGEX = /Leave synced/;
const UNLINKED_PERSON_COPY =
  /Your account is not linked to a person in this organisation/;
vi.mock("@repo/auth/helpers", () => ({
  requireOrg: vi.fn(async () => "org_1"),
}));
vi.mock("@repo/auth/server", () => ({
  auth: mocks.auth,
  currentUser: mocks.currentUser,
}));
vi.mock("@repo/availability", () => ({
  getCalendarRange: mocks.getCalendarRange,
}));
vi.mock("@repo/database", () => ({
  resolveAccountCompanies: mocks.resolveAccountCompanies,
  scopedQuery: mocks.scopedQuery,
  tenantDatabase: vi.fn(() => ({
    location: { findMany: mocks.locationFindMany },
    organisation: { findFirst: mocks.organisationFindFirst },
    person: { findFirst: mocks.personFindFirst },
    team: { findMany: mocks.teamFindMany },
    xeroConnection: { findFirst: mocks.xeroTenantFindFirst },
  })),
  tenantTransaction: vi.fn((_clerkOrgId, operation) =>
    operation({
      location: { findMany: mocks.locationFindMany },
      organisation: { findFirst: mocks.organisationFindFirst },
      team: { findMany: mocks.teamFindMany },
      xeroConnection: { findFirst: mocks.xeroTenantFindFirst },
    })
  ),
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
vi.mock("@/components/calendar/calendar-live-updates", () => ({
  CalendarLiveUpdates: () => <div data-testid="calendar-live-updates" />,
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
    mocks.resolveAccountCompanies.mockResolvedValue([
      {
        id: "00000000-0000-4000-8000-000000000001",
        name: "Acme",
        timezone: "Australia/Brisbane",
      },
    ]);
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
    mocks.xeroTenantFindFirst.mockResolvedValue(null);
    mocks.getCalendarRange.mockResolvedValue({
      ok: true,
      value: calendarRange(),
    });
  });
  it("loads all account companies without selecting the oldest by default", async () => {
    render(await Page({ searchParams: Promise.resolve({}) }));
    expect(mocks.getCalendarRange).toHaveBeenCalledWith(
      expect.objectContaining({
        actingUserId: "user_1",
        clerkOrgId: "org_1",
        companyIds: undefined,
      })
    );
    expect(mocks.getCalendarRange.mock.calls[0]?.[0]).not.toHaveProperty(
      "organisationId"
    );
  });
  it("passes the validated company filter to the account calendar", async () => {
    const companyId = "00000000-0000-4000-8000-000000000001";
    render(
      await Page({ searchParams: Promise.resolve({ companyIds: companyId }) })
    );
    expect(mocks.getCalendarRange).toHaveBeenCalledWith(
      expect.objectContaining({ companyIds: [companyId] })
    );
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
  it("renders connected Xero sync status when connected", async () => {
    mocks.getCalendarRange.mockResolvedValue({
      ok: true,
      value: { ...calendarRange(), xeroConnectionState: "connected" },
    });
    mocks.xeroTenantFindFirst.mockResolvedValue({
      last_leave_records_sync_at: new Date(),
      last_sync_error_message: null,
      leave_records_stale_since: null,
      sync_paused_at: null,
      tenant_name: "Acme Payroll AU",
    });
    render(await Page({ searchParams: Promise.resolve({}) }));
    expect(screen.queryByText(XERO_NOT_CONNECTED_COPY)).toBeNull();
    expect(screen.getByText("Acme Payroll AU")).toBeDefined();
    expect(screen.getByText(LEAVE_SYNCED_REGEX)).toBeDefined();
  });
  it("renders unlinked person notice when current user is not linked to an employee", async () => {
    mocks.getCalendarRange.mockResolvedValue({
      ok: true,
      value: { ...calendarRange(), xeroConnectionState: "connected" },
    });
    mocks.personFindFirst.mockResolvedValue(null);
    mocks.xeroTenantFindFirst.mockResolvedValue({
      last_leave_records_sync_at: new Date(),
      last_sync_error_message: null,
      leave_records_stale_since: null,
      sync_paused_at: null,
      tenant_name: "Acme Payroll AU",
    });
    render(await Page({ searchParams: Promise.resolve({}) }));
    expect(screen.getByText(UNLINKED_PERSON_COPY)).toBeDefined();
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
    people: [],
    range: {
      end: new Date("2026-04-16T00:00:00.000Z"),
      start: new Date("2026-04-15T00:00:00.000Z"),
      timezone: "Australia/Brisbane",
    },
    totalPeopleInScope: 0,
    truncated: false,
    view: "week",
    xeroConnectionState: "not_connected",
    xeroSyncFailedCount: 0,
  };
}
