import "server-only";

import {
  type ClerkOrgId,
  getAvailabilityRecordLabel,
  type OrganisationId,
  type Result,
  startOfUtcDay,
  toDateOnly,
} from "@repo/core";
import { scopedQuery, tenantDatabase } from "@repo/database";
import type { Prisma } from "@repo/database/generated/client";
import type {
  availability_record_type,
  availability_source_type,
} from "@repo/database/generated/enums";
import { z } from "zod";
import {
  nonWorkingHolidayDates,
  type ResolvedPublicHoliday,
  resolvePublicHolidays,
} from "../holidays/resolve-public-holidays";
import {
  isXeroLeaveType,
  XERO_LEAVE_TYPES,
} from "../records/record-type-categories";
import { managerScopePersonIds } from "../settings/manager-scope";
import {
  type AnalyticsHoliday,
  buildHeatmapMatrix,
  buildPeopleIndex,
  type ExpandedRecordDay,
  expandRecordAcrossDays,
  groupByMonth,
  groupByPerson,
  groupByRecordType,
  groupByTeam,
  percentileRank,
} from "./aggregation-primitives";
import { analyticsRecordSelect } from "./analytics-record-select";
import type { ResolvedDateRange } from "./date-range";
import { type AggregationCache, aggregationFingerprint } from "./request-cache";

export type AnalyticsRole = "admin" | "manager" | "owner" | "viewer";
export type XeroLeaveRecordType = (typeof XERO_LEAVE_TYPES)[number];

export type AnalyticsServiceError =
  | { code: "date_range_too_wide"; message: string }
  | { code: "invalid_date_range"; message: string }
  | { code: "not_authorised"; message: string }
  | { code: "unknown_error"; message: string }
  | { code: "validation_error"; message: string };

export interface LeaveReportsFilters {
  includeArchivedPeople: boolean;
  leaveType?: XeroLeaveRecordType[];
  locationId?: string[];
  personId?: string[];
  personType: "all" | "contractor" | "employee";
  teamId?: string[];
}

export interface LeaveReportsData {
  appliedFilters: LeaveReportsFilters;
  dataFreshness: { generatedAt: Date; recordCount: number };
  leaveDaysByPerson: Array<{
    days: number;
    firstName: string;
    lastName: string;
    locationName: string | null;
    personId: string;
    records: number;
    teamName: string | null;
  }>;
  leaveDaysByTeam: Array<{
    days: number;
    peopleCount: number;
    teamId: string;
    teamName: string;
  }>;
  leaveDaysByTypeMonthly: {
    months: string[];
    series: Array<{ recordType: XeroLeaveRecordType; values: number[] }>;
  };
  leaveTypeDonut: Array<{
    days: number;
    label: string;
    percentage: number;
    recordType: availability_record_type;
  }>;
  peakAbsenceHeatmap: {
    days: number[][];
    maxValue: number;
    weeks: string[];
  };
  range: ResolvedDateRange;
  summaryStats: {
    averageDaysPerPersonWithLeave: number;
    mostCommonLeaveType: XeroLeaveRecordType | null;
    mostCommonLeaveTypeDays: number;
    p80DaysPerPersonWithLeave: number;
    peopleInScope: number;
    peopleWithLeaveInPeriod: number;
    totalLeaveDays: number;
    totalLeaveRecords: number;
  };
}

export interface RecordListPage {
  nextCursor: string | null;
  records: AnalyticsRecordListItem[];
}

export interface AnalyticsRecordListItem {
  approvedAt: Date | null;
  approvedByFirstName: string | null;
  approvedByLastName: string | null;
  endsAt: Date;
  id: string;
  locationName: string | null;
  personFirstName: string;
  personId: string;
  personLastName: string;
  recordType: availability_record_type;
  sourceType: availability_source_type;
  startsAt: Date;
  submittedAt: Date | null;
  teamName: string | null;
  workingDays: number;
}

const RoleSchema = z.enum(["admin", "manager", "owner", "viewer"]);
const PersonTypeSchema = z.enum(["all", "contractor", "employee"]);
const LeaveTypeSchema = z.enum(XERO_LEAVE_TYPES);
const DateRangeSchema = z.object({
  end: z.coerce.date(),
  label: z.string().min(1),
  start: z.coerce.date(),
});
const FiltersSchema = z
  .object({
    includeArchivedPeople: z.boolean().default(false),
    leaveType: z.array(LeaveTypeSchema).optional(),
    locationId: z.array(z.string().uuid()).optional(),
    personId: z.array(z.string().uuid()).optional(),
    personType: PersonTypeSchema.default("all"),
    teamId: z.array(z.string().uuid()).optional(),
  })
  .default({ includeArchivedPeople: false, personType: "all" });

const AggregateSchema = z.object({
  actingUserId: z.string().min(1),
  clerkOrgId: z.string().min(1),
  dateRange: DateRangeSchema,
  filters: FiltersSchema.optional(),
  includePublicHolidays: z.boolean().default(false),
  organisationId: z.string().uuid(),
  role: RoleSchema,
});

const DrilldownSchema = AggregateSchema.extend({
  cursor: z.string().uuid().nullable().optional(),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

type AggregateInput = z.infer<typeof AggregateSchema>;
type DrilldownInput = z.infer<typeof DrilldownSchema>;

type PersonRow = Prisma.PersonGetPayload<{
  include: {
    location: true;
    team: true;
  };
}>;

type RecordRow = Prisma.AvailabilityRecordGetPayload<{
  select: typeof analyticsRecordSelect;
}>;

interface Dataset {
  entries: ExpandedRecordDay[];
  people: PersonRow[];
  records: RecordRow[];
}

export async function aggregateLeaveReports(
  input: z.input<typeof AggregateSchema> & { cache?: AggregationCache }
): Promise<Result<LeaveReportsData, AnalyticsServiceError>> {
  const parsed = AggregateSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error);
  }

  try {
    const filters = normaliseFilters(parsed.data.filters, parsed.data.role);
    const dataset = await loadDataset(parsed.data, filters, input.cache);
    if (!dataset.ok) {
      return dataset;
    }

    const data = dataset.value;
    const daysByPerson = groupByPerson(data.entries);
    const daysByType = groupByRecordType(data.entries);
    const daysByTeam = groupByTeam(data.entries, peopleIndex(data.people));
    const totalLeaveDays = round(
      sum(data.entries.map((entry) => entry.workingDayFraction))
    );
    const personDayValues = [...daysByPerson.values()].filter(
      (value) => value > 0
    );
    const mostCommon = mostCommonRecordType(daysByType);

    return {
      ok: true,
      value: {
        appliedFilters: filters,
        dataFreshness: {
          generatedAt: new Date(),
          recordCount: data.records.length,
        },
        leaveDaysByPerson: topPeople(data.people, data.records, daysByPerson),
        leaveDaysByTeam: teams(data.people, daysByTeam),
        leaveDaysByTypeMonthly: monthlyByType(
          data.entries,
          parsed.data.dateRange
        ),
        leaveTypeDonut: donut(daysByType, totalLeaveDays),
        peakAbsenceHeatmap: buildHeatmapMatrix({
          entries: data.entries,
          timezone: "UTC",
        }),
        range: parsed.data.dateRange,
        summaryStats: {
          averageDaysPerPersonWithLeave:
            personDayValues.length === 0
              ? 0
              : round(totalLeaveDays / personDayValues.length),
          mostCommonLeaveType: mostCommon.recordType,
          mostCommonLeaveTypeDays: mostCommon.days,
          p80DaysPerPersonWithLeave: percentileRank(personDayValues, 80),
          peopleInScope: data.people.length,
          peopleWithLeaveInPeriod: personDayValues.length,
          totalLeaveDays,
          totalLeaveRecords: data.records.length,
        },
      },
    };
  } catch {
    return unknownError("Failed to aggregate leave reports.");
  }
}

export async function listLeaveReportRecordsForDrilldown(
  input: z.input<typeof DrilldownSchema> & { cache?: AggregationCache }
): Promise<Result<RecordListPage, AnalyticsServiceError>> {
  const parsed = DrilldownSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error);
  }

  try {
    const filters = normaliseFilters(parsed.data.filters, parsed.data.role);
    const peopleResult = await loadPeople(parsed.data, filters);
    if (!peopleResult.ok) {
      return peopleResult;
    }
    const personIds = peopleResult.value.map((person) => person.id);
    if (personIds.length === 0) {
      return { ok: true, value: { nextCursor: null, records: [] } };
    }

    const records = await tenantDatabase(
      input.clerkOrgId
    ).availabilityRecord.findMany({
      cursor: parsed.data.cursor ? { id: parsed.data.cursor } : undefined,
      orderBy: [{ starts_at: "desc" }, { id: "desc" }],
      select: analyticsRecordSelect,
      skip: parsed.data.cursor ? 1 : 0,
      take: parsed.data.pageSize + 1,
      where: recordWhere(parsed.data, filters, personIds),
    });
    const hasNext = records.length > parsed.data.pageSize;
    const pageRows = records.slice(0, parsed.data.pageSize);
    const workingDays = await workingDaysByRecord(
      pageRows,
      parsed.data,
      parsed.data.includePublicHolidays
    );

    return {
      ok: true,
      value: {
        nextCursor: hasNext ? (pageRows.at(-1)?.id ?? null) : null,
        records: pageRows.map((record) => recordListItem(record, workingDays)),
      },
    };
  } catch {
    return unknownError("Failed to list leave report records.");
  }
}

function normaliseFilters(
  filters: LeaveReportsFilters | undefined,
  role: AnalyticsRole
): LeaveReportsFilters {
  return {
    includeArchivedPeople:
      role === "admin" || role === "owner"
        ? (filters?.includeArchivedPeople ?? false)
        : false,
    leaveType: filters?.leaveType?.filter(isXeroLeaveRecordType),
    locationId: filters?.locationId,
    personId: filters?.personId,
    personType: filters?.personType ?? "all",
    teamId: filters?.teamId,
  };
}

async function loadDataset(
  input: AggregateInput,
  filters: LeaveReportsFilters,
  cache?: AggregationCache
): Promise<Result<Dataset, AnalyticsServiceError>> {
  const key = aggregationFingerprint({
    clerkOrgId: input.clerkOrgId,
    dateRangeKey: `${input.dateRange.start.toISOString()}:${input.dateRange.end.toISOString()}`,
    filterKey: {
      filters,
      includePublicHolidays: input.includePublicHolidays,
      role: input.role,
    },
    organisationId: input.organisationId,
    serviceMethod: "leave-reports:dataset",
  });
  const load = () => loadDatasetUncached(input, filters);
  return cache ? await cache.getOrLoad(key, load) : await load();
}

async function loadDatasetUncached(
  input: AggregateInput,
  filters: LeaveReportsFilters
): Promise<Result<Dataset, AnalyticsServiceError>> {
  const peopleResult = await loadPeople(input, filters);
  if (!peopleResult.ok) {
    return peopleResult;
  }
  const people = peopleResult.value;
  const personIds = people.map((person) => person.id);
  if (personIds.length === 0) {
    return { ok: true, value: { entries: [], people, records: [] } };
  }

  const records = await tenantDatabase(
    input.clerkOrgId
  ).availabilityRecord.findMany({
    orderBy: [{ starts_at: "asc" }, { id: "asc" }],
    select: analyticsRecordSelect,
    where: recordWhere(input, filters, personIds),
  });
  const holidayRows = input.includePublicHolidays
    ? await loadHolidays(input)
    : { ok: true as const, value: [] };
  if (!holidayRows.ok) {
    return unknownError(holidayRows.error.message);
  }
  const holidaysByLocation = buildHolidayMap(holidayRows.value, people);

  const entries = records.flatMap((record) =>
    expandRecordAcrossDays({
      locationHolidays:
        holidaysByLocation.get(record.person.location_id ?? "") ?? [],
      rangeEnd: input.dateRange.end,
      rangeStart: input.dateRange.start,
      record: {
        allDay: record.all_day,
        endsAt: record.ends_at,
        id: record.id,
        locationId: record.person.location_id,
        personId: record.person_id,
        recordType: record.record_type,
        startsAt: record.starts_at,
      },
    })
  );

  return { ok: true, value: { entries, people, records } };
}

async function loadPeople(
  input: Pick<
    AggregateInput,
    "actingUserId" | "clerkOrgId" | "organisationId" | "role"
  >,
  filters: LeaveReportsFilters
): Promise<Result<PersonRow[], AnalyticsServiceError>> {
  const scoped = scopedQuery(
    input.clerkOrgId as ClerkOrgId,
    input.organisationId as OrganisationId
  );
  const where: Prisma.PersonWhereInput = {
    ...scoped,
    ...(filters.includeArchivedPeople ? {} : { archived_at: null }),
    ...(filters.locationId?.length
      ? { location_id: { in: filters.locationId } }
      : {}),
    ...(filters.personId?.length ? { id: { in: filters.personId } } : {}),
    ...(filters.teamId?.length ? { team_id: { in: filters.teamId } } : {}),
    ...(filters.personType === "all"
      ? {}
      : { person_type: filters.personType }),
  };

  if (input.role === "viewer") {
    where.clerk_user_id = input.actingUserId;
  } else if (input.role === "manager") {
    const actingPerson = await tenantDatabase(
      input.clerkOrgId
    ).person.findFirst({
      select: { id: true },
      where: {
        ...scoped,
        archived_at: null,
        clerk_user_id: input.actingUserId,
      },
    });
    if (!actingPerson) {
      return { ok: true, value: [] };
    }
    where.id = {
      in: await managerScopePersonIds({
        actingPersonId: actingPerson.id,
        clerkOrgId: input.clerkOrgId,
        organisationId: input.organisationId,
      }),
    };
  }

  const people = await tenantDatabase(input.clerkOrgId).person.findMany({
    include: { location: true, team: true },
    orderBy: [{ last_name: "asc" }, { first_name: "asc" }],
    where,
  });
  return { ok: true, value: people };
}

function recordWhere(
  input: Pick<AggregateInput, "clerkOrgId" | "dateRange" | "organisationId">,
  filters: LeaveReportsFilters,
  personIds: string[]
): Prisma.AvailabilityRecordWhereInput {
  return {
    ...scopedQuery(
      input.clerkOrgId as ClerkOrgId,
      input.organisationId as OrganisationId
    ),
    approval_status: "approved",
    archived_at: null,
    ends_at: { gt: input.dateRange.start },
    person_id: { in: personIds },
    record_type: {
      in: filters.leaveType?.length ? filters.leaveType : [...XERO_LEAVE_TYPES],
    },
    source_type: { in: ["xero_leave", "team_calendar_leave"] },
    starts_at: { lt: input.dateRange.end },
  };
}

function loadHolidays(input: AggregateInput) {
  return resolvePublicHolidays({
    clerkOrgId: input.clerkOrgId as ClerkOrgId,
    from: toDateOnly(input.dateRange.start),
    organisationId: input.organisationId as OrganisationId,
    to: toDateOnly(input.dateRange.end),
  });
}

interface PersonForHolidayMap {
  location_id?: string | null;
}

function buildHolidayMap(
  holidays: readonly ResolvedPublicHoliday[],
  people: readonly PersonForHolidayMap[]
): Map<string, AnalyticsHoliday[]> {
  const map = new Map<string, AnalyticsHoliday[]>();
  for (const person of people) {
    const locationKey = person.location_id ?? "";
    if (map.has(locationKey)) {
      continue;
    }
    map.set(
      locationKey,
      [...nonWorkingHolidayDates(holidays, person.location_id ?? null)].map(
        (dateOnly) => ({ date: startOfUtcDay(dateOnly), isSuppressed: false })
      )
    );
  }
  return map;
}

async function workingDaysByRecord(
  records: readonly RecordRow[],
  input: DrilldownInput,
  includePublicHolidays: boolean
): Promise<Map<string, number>> {
  const holidayRows = includePublicHolidays
    ? await loadHolidays(input)
    : { ok: true as const, value: [] };
  const holidaysByLocation = holidayRows.ok
    ? buildHolidayMap(
        holidayRows.value,
        records.map((record) => record.person)
      )
    : new Map<string, AnalyticsHoliday[]>();

  return new Map(
    records.map((record) => [
      record.id,
      sum(
        expandRecordAcrossDays({
          locationHolidays:
            holidaysByLocation.get(record.person.location_id ?? "") ?? [],
          rangeEnd: input.dateRange.end,
          rangeStart: input.dateRange.start,
          record: {
            allDay: record.all_day,
            endsAt: record.ends_at,
            id: record.id,
            locationId: record.person.location_id,
            personId: record.person_id,
            recordType: record.record_type,
            startsAt: record.starts_at,
          },
        }).map((entry) => entry.workingDayFraction)
      ),
    ])
  );
}

function peopleIndex(people: readonly PersonRow[]) {
  return buildPeopleIndex(
    people.map((person) => ({
      archivedAt: person.archived_at,
      employmentType: person.employment_type,
      firstName: person.first_name,
      id: person.id,
      lastName: person.last_name,
      locationId: person.location_id,
      personType: person.person_type,
      teamId: person.team_id,
    }))
  );
}

function monthlyByType(
  entries: readonly ExpandedRecordDay[],
  range: ResolvedDateRange
): LeaveReportsData["leaveDaysByTypeMonthly"] {
  const months = monthKeys(range.start, range.end);
  return {
    months,
    series: XERO_LEAVE_TYPES.map((recordType) => {
      const typedEntries = entries.filter(
        (entry) => entry.recordType === recordType
      );
      const byMonth = groupByMonth(typedEntries, "UTC");
      return {
        recordType,
        values: months.map((month) => byMonth.get(month) ?? 0),
      };
    }),
  };
}

function topPeople(
  people: readonly PersonRow[],
  records: readonly RecordRow[],
  daysByPerson: ReadonlyMap<string, number>
): LeaveReportsData["leaveDaysByPerson"] {
  const recordCounts = countRecordsByPerson(records);
  const rows = people
    .map((person) => ({
      days: daysByPerson.get(person.id) ?? 0,
      firstName: person.first_name,
      lastName: person.last_name,
      locationName: person.location?.name ?? null,
      personId: person.id,
      records: recordCounts.get(person.id) ?? 0,
      teamName: person.team?.name ?? null,
    }))
    .filter((person) => person.days > 0)
    .sort((left, right) => right.days - left.days);
  if (rows.length <= 20) {
    return rows;
  }
  const top = rows.slice(0, 20);
  const others = rows.slice(20);
  return [
    ...top,
    {
      days: round(sum(others.map((person) => person.days))),
      firstName: "Others",
      lastName: "",
      locationName: null,
      personId: "others",
      records: sum(others.map((person) => person.records)),
      teamName: null,
    },
  ];
}

function teams(
  people: readonly PersonRow[],
  daysByTeam: ReadonlyMap<string, number>
): LeaveReportsData["leaveDaysByTeam"] {
  const peopleByTeam = new Map<string, { name: string; peopleCount: number }>();
  for (const person of people) {
    if (!person.team_id) {
      continue;
    }
    const existing = peopleByTeam.get(person.team_id);
    peopleByTeam.set(person.team_id, {
      name: person.team?.name ?? "Unassigned",
      peopleCount: (existing?.peopleCount ?? 0) + 1,
    });
  }
  return [...daysByTeam.entries()]
    .map(([teamId, days]) => ({
      days,
      peopleCount: peopleByTeam.get(teamId)?.peopleCount ?? 0,
      teamId,
      teamName: peopleByTeam.get(teamId)?.name ?? "Unassigned",
    }))
    .sort((left, right) => right.days - left.days);
}

function donut(
  daysByType: ReadonlyMap<availability_record_type, number>,
  totalDays: number
): LeaveReportsData["leaveTypeDonut"] {
  return [...daysByType.entries()]
    .map(([recordType, days]) => ({
      days,
      label: getAvailabilityRecordLabel(recordType),
      percentage: totalDays === 0 ? 0 : round((days / totalDays) * 100),
      recordType,
    }))
    .sort((left, right) => right.days - left.days);
}

function mostCommonRecordType(
  daysByType: ReadonlyMap<availability_record_type, number>
): { days: number; recordType: XeroLeaveRecordType | null } {
  const sorted = [...daysByType.entries()].sort(
    (left, right) => right[1] - left[1]
  );
  for (const [recordType, days] of sorted) {
    if (isXeroLeaveRecordType(recordType)) {
      return { days, recordType };
    }
  }
  return { days: 0, recordType: null };
}

function isXeroLeaveRecordType(
  recordType: availability_record_type
): recordType is XeroLeaveRecordType {
  return isXeroLeaveType(recordType);
}

function recordListItem(
  record: RecordRow,
  workingDays: ReadonlyMap<string, number>
): AnalyticsRecordListItem {
  return {
    approvedAt: record.approved_at,
    approvedByFirstName: record.approved_by?.first_name ?? null,
    approvedByLastName: record.approved_by?.last_name ?? null,
    endsAt: record.ends_at,
    id: record.id,
    locationName: record.person.location?.name ?? null,
    personFirstName: record.person.first_name,
    personId: record.person_id,
    personLastName: record.person.last_name,
    recordType: record.record_type,
    sourceType: record.source_type,
    startsAt: record.starts_at,
    submittedAt: record.submitted_at,
    teamName: record.person.team?.name ?? null,
    workingDays: round(workingDays.get(record.id) ?? 0),
  };
}

function countRecordsByPerson(
  records: readonly RecordRow[]
): Map<string, number> {
  const result = new Map<string, number>();
  for (const record of records) {
    result.set(record.person_id, (result.get(record.person_id) ?? 0) + 1);
  }
  return result;
}

function monthKeys(start: Date, end: Date): string[] {
  const months: string[] = [];
  let cursor = new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1)
  );
  const limit = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));
  while (cursor < limit) {
    months.push(cursor.toISOString().slice(0, 7));
    cursor = new Date(
      Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1)
    );
  }
  return months;
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function validationError(
  error: z.ZodError
): Result<never, AnalyticsServiceError> {
  return {
    error: {
      code: "validation_error",
      message: error.issues[0]?.message ?? "Invalid analytics input.",
    },
    ok: false,
  };
}

function unknownError(message: string): Result<never, AnalyticsServiceError> {
  return { error: { code: "unknown_error", message }, ok: false };
}
