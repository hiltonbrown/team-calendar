import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  availabilityFindMany: vi.fn(),
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

const { aggregateOutOfOffice, listOutOfOfficeRecordsForDrilldown } =
  await import("./out-of-office-service");
const { analyticsRecordSelect } = await import("./analytics-record-select");

const person = {
  archived_at: null,
  clerk_user_id: "user_1",
  employment_type: "employee",
  first_name: "Priya",
  id: "00000000-0000-4000-8000-000000000013",
  last_name: "Shah",
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
  approved_at: null,
  approved_by: null,
  archived_at: null,
  ends_at: new Date("2026-05-08T23:00:00.000Z"),
  id: "00000000-0000-4000-8000-000000000401",
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
  record_type: "wfh",
  source_type: "manual",
  starts_at: new Date("2026-05-04T00:00:00.000Z"),
  submitted_at: null,
};

describe("out of office service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.personFindMany.mockResolvedValue([person]);
    mocks.availabilityFindMany.mockResolvedValue([record]);
  });

  describe("aggregateOutOfOffice", () => {
    it("aggregates approved manual records only with fixed maths", async () => {
      const result = await aggregateOutOfOffice({
        actingUserId: "user_1",
        clerkOrgId: "org_1",
        dateRange: {
          end: new Date("2026-05-09T00:00:00.000Z"),
          label: "May",
          start: new Date("2026-05-04T00:00:00.000Z"),
        },
        filters: { includeArchivedPeople: false, personType: "all" },
        organisationId: "00000000-0000-4000-8000-000000000001",
        role: "admin",
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.summaryStats.totalOooDays).toBe(5);
        expect(result.value.summaryStats.totalRecords).toBe(1);
        expect(result.value.summaryStats.peopleInScope).toBe(1);
        expect(result.value.summaryStats.peopleWithOooInPeriod).toBe(1);
        expect(result.value.summaryStats.mostCommonOooType).toBe("wfh");
        expect(result.value.summaryStats.mostCommonOooTypeDays).toBe(5);
        expect(result.value.wfhPatternByDayOfWeek[0]?.days).toBe(1);
        expect(result.value.oooTypeDonut).toEqual([
          {
            days: 5,
            label: "Working from home",
            percentage: 100,
            recordType: "wfh",
          },
        ]);
        expect(result.value.topWfhPeople).toEqual([
          {
            firstName: "Priya",
            lastName: "Shah",
            personId: person.id,
            teamName: "Operations",
            totalWorkingDays: 5,
            wfhDays: 5,
            wfhRatio: 1,
          },
        ]);
        const wfhMonthly = result.value.oooDaysByTypeMonthly.series.find(
          (series) => series.recordType === "wfh"
        );
        expect(result.value.oooDaysByTypeMonthly.months).toEqual([]);
        expect(wfhMonthly?.values).toEqual([]);
      }
      expect(mocks.availabilityFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            approval_status: "approved",
            archived_at: null,
            clerk_org_id: "org_1",
            organisation_id: "00000000-0000-4000-8000-000000000001",
            source_type: "manual",
          }),
        })
      );
    });

    it("issues aggregate query with select rather than include and omits audit columns", async () => {
      const result = await aggregateOutOfOffice({
        actingUserId: "user_1",
        clerkOrgId: "org_1",
        dateRange: {
          end: new Date("2026-05-09T00:00:00.000Z"),
          label: "May",
          start: new Date("2026-05-04T00:00:00.000Z"),
        },
        filters: { includeArchivedPeople: false, personType: "all" },
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
  });

  describe("listOutOfOfficeRecordsForDrilldown", () => {
    it("issues drilldown query with take and the same projection omitting audit columns", async () => {
      const result = await listOutOfOfficeRecordsForDrilldown({
        actingUserId: "user_1",
        clerkOrgId: "org_1",
        dateRange: {
          end: new Date("2026-05-09T00:00:00.000Z"),
          label: "May",
          start: new Date("2026-05-04T00:00:00.000Z"),
        },
        filters: { includeArchivedPeople: false, personType: "all" },
        organisationId: "00000000-0000-4000-8000-000000000001",
        pageSize: 50,
        role: "admin",
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.nextCursor).toBeNull();
        expect(result.value.records).toEqual([
          {
            approvedAt: null,
            approvedByFirstName: null,
            approvedByLastName: null,
            endsAt: new Date("2026-05-08T23:00:00.000Z"),
            id: record.id,
            locationName: "Brisbane",
            personFirstName: "Priya",
            personId: person.id,
            personLastName: "Shah",
            recordType: "wfh",
            sourceType: "manual",
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
