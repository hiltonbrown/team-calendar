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
  scopedQuery: mocks.scopedQuery,
  tenantDatabase: vi.fn((accountId: string) => {
    if (!accountId) {
      throw new Error("Missing tenant context");
    }
    return {
      availabilityRecord: { findMany: mocks.availabilityFindMany },
      person: {
        findFirst: mocks.personFindFirst,
        findMany: mocks.personFindMany,
      },
    };
  }),
  tenantTransaction: vi.fn(
    (accountId: string, transactionCallback: unknown, options?: unknown) => {
      if (!accountId) {
        throw new Error("Missing tenant context");
      }
      return {
        availabilityRecord: { findMany: mocks.availabilityFindMany },
        person: {
          findFirst: mocks.personFindFirst,
          findMany: mocks.personFindMany,
        },
      }.$transaction(transactionCallback, options);
    }
  ),
}));
vi.mock("../holidays/resolve-public-holidays", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../holidays/resolve-public-holidays")
  >()),
  resolvePublicHolidays: mocks.holidayList,
}));

const { aggregateLeaveReports, listLeaveReportRecordsForDrilldown } =
  await import("./leave-reports-service");
const { analyticsRecordSelect } = await import("./analytics-record-select");

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
  person: {
    first_name: person.first_name,
    id: person.id,
    last_name: person.last_name,
    location: {
      country_code: person.location.country_code,
      id: person.location.id,
      name: person.location.name,
      region_code: person.location.region_code,
    },
    location_id: person.location_id,
    team: {
      name: person.team.name,
    },
  },
  person_id: person.id,
  record_type: "annual_leave",
  source_type: "team_calendar_leave",
  starts_at: new Date("2026-05-04T00:00:00.000Z"),
  submitted_at: null,
};

describe("leave reports service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.personFindMany.mockResolvedValue([person]);
    mocks.availabilityFindMany.mockResolvedValue([record]);
    mocks.holidayList.mockResolvedValue({ ok: true, value: [] });
  });

  describe("aggregateLeaveReports", () => {
    it("aggregates approved Team Calendar and Xero leave records only with fixed maths", async () => {
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
        expect(result.value.summaryStats.peopleInScope).toBe(1);
        expect(result.value.summaryStats.peopleWithLeaveInPeriod).toBe(1);
        expect(result.value.leaveTypeDonut).toEqual([
          {
            days: 5,
            label: "Annual leave",
            percentage: 100,
            recordType: "annual_leave",
          },
        ]);
        expect(result.value.leaveDaysByPerson).toEqual([
          {
            days: 5,
            firstName: "Amelia",
            lastName: "Nguyen",
            locationName: "Brisbane",
            personId: person.id,
            records: 1,
            teamName: "Operations",
          },
        ]);
        const annualLeaveMonthly =
          result.value.leaveDaysByTypeMonthly.series.find(
            (series) => series.recordType === "annual_leave"
          );
        expect(result.value.leaveDaysByTypeMonthly.months).toEqual([]);
        expect(annualLeaveMonthly?.values).toEqual([]);
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

    it("issues aggregate query with select rather than include and omits audit columns", async () => {
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
      expect(mocks.availabilityFindMany).toHaveBeenCalledTimes(1);
      const [[queryCall]] = mocks.availabilityFindMany.mock.calls;
      expect(queryCall.include).toBeUndefined();
      expect(queryCall.select).toEqual(analyticsRecordSelect);
      expect("source_payload_json" in queryCall.select).toBe(false);
      expect("xero_write_error_raw" in queryCall.select).toBe(false);
    });

    it("deducts non-working holidays resolved for each person's location", async () => {
      const resolved = (
        date: string,
        overrides: Record<string, unknown> = {}
      ) => ({
        area: null,
        classification: "non_working",
        date,
        hidden: false,
        key: `au-nsw-${date}-holiday`,
        kind: "public",
        locationId: "00000000-0000-4000-8000-000000000201",
        name: "Holiday",
        origin: "official",
        startsAt: null,
        ...overrides,
      });
      mocks.holidayList.mockResolvedValue({
        ok: true,
        value: [
          resolved("2026-05-05"),
          resolved("2026-05-06", { kind: "custom", origin: "custom" }),
          resolved("2026-05-07", {
            locationId: "00000000-0000-4000-8000-000000000999",
          }),
          resolved("2026-05-08", { classification: "working" }),
        ],
      });

      const result = await aggregateLeaveReports({
        actingUserId: "user_1",
        clerkOrgId: "org_1",
        dateRange: {
          end: new Date("2026-05-09T00:00:00.000Z"),
          label: "May",
          start: new Date("2026-05-04T00:00:00.000Z"),
        },
        filters: { includeArchivedPeople: false, personType: "all" },
        includePublicHolidays: true,
        organisationId: "00000000-0000-4000-8000-000000000001",
        role: "admin",
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        // 5 days minus the two non-working holidays for this location = 3 days
        expect(result.value.summaryStats.totalLeaveDays).toBe(3);
      }
    });
  });

  describe("listLeaveReportRecordsForDrilldown", () => {
    it("issues drilldown query with take and the same projection omitting audit columns", async () => {
      const result = await listLeaveReportRecordsForDrilldown({
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
        pageSize: 50,
        role: "admin",
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.nextCursor).toBeNull();
        expect(result.value.records).toEqual([
          {
            approvedAt: new Date("2026-05-01T00:00:00.000Z"),
            approvedByFirstName: null,
            approvedByLastName: null,
            endsAt: new Date("2026-05-08T23:00:00.000Z"),
            id: record.id,
            locationName: "Brisbane",
            personFirstName: "Amelia",
            personId: person.id,
            personLastName: "Nguyen",
            recordType: "annual_leave",
            sourceType: "team_calendar_leave",
            startsAt: new Date("2026-05-04T00:00:00.000Z"),
            submittedAt: null,
            teamName: "Operations",
            workingDays: 5,
          },
        ]);
      }
      expect(mocks.availabilityFindMany).toHaveBeenCalledTimes(1);
      const [[queryCall]] = mocks.availabilityFindMany.mock.calls;
      expect(queryCall.include).toBeUndefined();
      expect(queryCall.take).toBe(51);
      expect(queryCall.select).toEqual(analyticsRecordSelect);
      expect("source_payload_json" in queryCall.select).toBe(false);
      expect("xero_write_error_raw" in queryCall.select).toBe(false);
    });
  });
});
