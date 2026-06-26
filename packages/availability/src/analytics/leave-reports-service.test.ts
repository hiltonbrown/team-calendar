import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  availabilityFindMany: vi.fn(),
  holidayList: vi.fn(),
  personFindFirst: vi.fn(),
  personFindMany: vi.fn(),
  scopedQuery: vi.fn((clerkOrgId: string, organisationId: string) => ({
    clerk_org_id: clerkOrgId,
    organisation_id: organisationId,
  })),
}));

vi.mock("server-only", () => ({}));
vi.mock("@repo/database", () => ({
  database: {
    availabilityRecord: { findMany: mocks.availabilityFindMany },
    person: {
      findFirst: mocks.personFindFirst,
      findMany: mocks.personFindMany,
    },
  },
  scopedQuery: mocks.scopedQuery,
}));
vi.mock("../holidays/holiday-service", () => ({
  listForOrganisation: mocks.holidayList,
}));

const { aggregateLeaveReports } = await import("./leave-reports-service");

const person = {
  archived_at: null,
  clerk_user_id: "user_1",
  employment_type: "employee",
  first_name: "Amelia",
  id: "00000000-0000-4000-8000-000000000011",
  last_name: "Nguyen",
  location: {
    country_code: "AU",
    id: "00000000-0000-4000-8000-000000000201",
    name: "Brisbane",
    region_code: "QLD",
    timezone: "Australia/Brisbane",
  },
  location_id: "00000000-0000-4000-8000-000000000201",
  person_type: "employee",
  team: {
    id: "00000000-0000-4000-8000-000000000101",
    name: "Operations",
  },
  team_id: "00000000-0000-4000-8000-000000000101",
};

const record = {
  all_day: true,
  approved_at: new Date("2026-05-01T00:00:00.000Z"),
  approved_by: null,
  archived_at: null,
  ends_at: new Date("2026-05-08T23:00:00.000Z"),
  id: "00000000-0000-4000-8000-000000000301",
  person,
  person_id: person.id,
  record_type: "annual_leave",
  source_type: "team_calendar_leave",
  starts_at: new Date("2026-05-04T00:00:00.000Z"),
  submitted_at: null,
};

describe("aggregateLeaveReports", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.personFindMany.mockResolvedValue([person]);
    mocks.availabilityFindMany.mockResolvedValue([record]);
    mocks.holidayList.mockResolvedValue({ ok: true, value: [] });
  });

  it("aggregates approved Team Calendar and Xero leave records only", async () => {
    const result = await aggregateLeaveReports({
      actingUserId: "user_1",
      clerkOrgId: "org_1",
      dateRange: {
        end: new Date("2026-05-09T00:00:00.000Z"),
        label: "May",
        start: new Date("2026-05-04T00:00:00.000Z"),
      },
      filters: { includeArchivedPeople: false, personType: "all" },
      includePublicHolidays: false,
      organisationId: "00000000-0000-4000-8000-000000000001",
      role: "admin",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.summaryStats.totalLeaveDays).toBe(5);
      expect(result.value.summaryStats.totalLeaveRecords).toBe(1);
    }
    expect(mocks.availabilityFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          approval_status: "approved",
          archived_at: null,
          clerk_org_id: "org_1",
          organisation_id: "00000000-0000-4000-8000-000000000001",
          source_type: { in: ["xero_leave", "team_calendar_leave"] },
        }),
      })
    );
  });
});
