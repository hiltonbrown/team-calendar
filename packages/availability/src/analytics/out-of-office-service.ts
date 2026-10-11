import "server-only";

import {
  type ClerkOrgId,
  getAvailabilityRecordLabel,
  type OrganisationId,
  type Result,
} from "@repo/core";
import { scopedQuery, tenantDatabase } from "@repo/database";
import type { Prisma } from "@repo/database/generated/client";
import type { availability_record_type } from "@repo/database/generated/enums";
import { z } from "zod";
import {
  isLocalOnlyType,
  LOCAL_ONLY_TYPES,
} from "../records/record-type-categories";
import { managerScopePersonIds } from "../settings/manager-scope";
import {
  type ExpandedRecordDay,
  expandRecordAcrossDays,
  groupByDayOfWeek,
  groupByMonth,
  groupByPerson,
  groupByRecordType,
} from "./aggregation-primitives";
import { analyticsRecordSelect } from "./analytics-record-select";
import type { ResolvedDateRange } from "./date-range";
import type {
  AnalyticsRecordListItem,
  AnalyticsRole,
  AnalyticsServiceError,
  RecordListPage,
} from "./leave-reports-service";
import { type AggregationCache, aggregationFingerprint } from "./request-cache";

export interface OutOfOfficeFilters {
  includeArchivedPeople: boolean;
  locationId?: string[];
  personId?: string[];
  personType: "all" | "contractor" | "employee";
  recordType?: LocalOnlyRecordType[];
  teamId?: string[];
}

export type LocalOnlyRecordType = (typeof LOCAL_ONLY_TYPES)[number];

export interface OutOfOfficeData {
  appliedFilters: OutOfOfficeFilters;
  dataFreshness: { generatedAt: Date; recordCount: number };
  oooDaysByTypeMonthly: {
    months: string[];
    series: Array<{ recordType: LocalOnlyRecordType; values: number[] }>;
  };
  oooTypeDonut: Array<{
    days: number;
    label: string;
    percentage: number;
    recordType: availability_record_type;
  }>;
  range: ResolvedDateRange;
  summaryStats: {
    averageDaysPerPersonWithOoo: number;
    mostCommonOooType: LocalOnlyRecordType | null;
    mostCommonOooTypeDays: number;
    peopleInScope: number;
    peopleWithOooInPeriod: number;
    totalOooDays: number;
    totalRecords: number;
  };
  topWfhPeople: Array<{
    firstName: string;
    lastName: string;
    personId: string;
    teamName: string | null;
    totalWorkingDays: number;
    wfhDays: number;
    wfhRatio: number;
  }>;
  travelFrequencyByPerson: Array<{
    days: number;
    firstName: string;
    lastName: string;
    personId: string;
    records: number;
    teamName: string | null;
  }>;
  wfhPatternByDayOfWeek: Array<{
    dayLabel: string;
    dayOfWeek: 0 | 1 | 2 | 3 | 4 | 5 | 6;
    days: number;
    peopleCount: number;
  }>;
}

const DEFAULT_OOO_TYPES: LocalOnlyRecordType[] = [
  "wfh",
  "travelling",
  "training",
  "client_site",
  "another_office",
  "offsite_meeting",
];

const DAY_LABELS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

const RoleSchema = z.enum(["admin", "manager", "owner", "viewer"]);
const PersonTypeSchema = z.enum(["all", "contractor", "employee"]);
const RecordTypeSchema = z.enum(LOCAL_ONLY_TYPES);
const DateRangeSchema = z.object({
  end: z.coerce.date(),
  label: z.string().min(1),
  start: z.coerce.date(),
});
const FiltersSchema = z
  .object({
    includeArchivedPeople: z.boolean().default(false),
    locationId: z.array(z.string().uuid()).optional(),
    personId: z.array(z.string().uuid()).optional(),
    personType: PersonTypeSchema.default("all"),
    recordType: z.array(RecordTypeSchema).optional(),
    teamId: z.array(z.string().uuid()).optional(),
  })
  .default({ includeArchivedPeople: false, personType: "all" });

const AggregateSchema = z.object({
  actingUserId: z.string().min(1),
  clerkOrgId: z.string().min(1),
  dateRange: DateRangeSchema,
  filters: FiltersSchema.optional(),
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

export async function aggregateOutOfOffice(
  input: z.input<typeof AggregateSchema> & { cache?: AggregationCache }
): Promise<Result<OutOfOfficeData, AnalyticsServiceError>> {
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
    const totalOooDays = round(
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
        oooDaysByTypeMonthly: monthlyByType(
          data.entries,
          parsed.data.dateRange,
          filters
        ),
        oooTypeDonut: donut(daysByType, totalOooDays),
        range: parsed.data.dateRange,
        summaryStats: {
          averageDaysPerPersonWithOoo:
            personDayValues.length === 0
              ? 0
              : round(totalOooDays / personDayValues.length),
          mostCommonOooType: mostCommon.recordType,
          mostCommonOooTypeDays: mostCommon.days,
          peopleInScope: data.people.length,
          peopleWithOooInPeriod: personDayValues.length,
          totalOooDays,
          totalRecords: data.records.length,
        },
        topWfhPeople: topWfhPeople(
          data.people,
          data.entries,
          parsed.data.dateRange
        ),
        travelFrequencyByPerson: travelFrequency(
          data.people,
          data.records,
          data.entries
        ),
        wfhPatternByDayOfWeek: wfhPattern(data.entries),
      },
    };
  } catch {
    return unknownError("Failed to aggregate out of office reports.");
  }
}

export async function listOutOfOfficeRecordsForDrilldown(
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
    const workingDays = workingDaysByRecord(pageRows, parsed.data);

    return {
      ok: true,
      value: {
        nextCursor: hasNext ? (pageRows.at(-1)?.id ?? null) : null,
        records: pageRows.map((record) => recordListItem(record, workingDays)),
      },
    };
  } catch {
    return unknownError("Failed to list out of office records.");
  }
}

function normaliseFilters(
  filters: OutOfOfficeFilters | undefined,
  role: AnalyticsRole
): OutOfOfficeFilters {
  return {
    includeArchivedPeople:
      role === "admin" || role === "owner"
        ? (filters?.includeArchivedPeople ?? false)
        : false,
    locationId: filters?.locationId,
    personId: filters?.personId,
    personType: filters?.personType ?? "all",
    recordType:
      filters?.recordType?.filter(isLocalOnlyRecordType) ?? DEFAULT_OOO_TYPES,
    teamId: filters?.teamId,
  };
}

async function loadDataset(
  input: AggregateInput,
  filters: OutOfOfficeFilters,
  cache?: AggregationCache
): Promise<Result<Dataset, AnalyticsServiceError>> {
  const key = aggregationFingerprint({
    clerkOrgId: input.clerkOrgId,
    dateRangeKey: `${input.dateRange.start.toISOString()}:${input.dateRange.end.toISOString()}`,
    filterKey: { filters, role: input.role },
    organisationId: input.organisationId,
    serviceMethod: "out-of-office:dataset",
  });
  const load = () => loadDatasetUncached(input, filters);
  return cache ? await cache.getOrLoad(key, load) : await load();
}

async function loadDatasetUncached(
  input: AggregateInput,
  filters: OutOfOfficeFilters
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
  const entries = records.flatMap((record) =>
    expandRecordAcrossDays({
      locationHolidays: [],
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
  filters: OutOfOfficeFilters
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
  filters: OutOfOfficeFilters,
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
      in: filters.recordType?.length ? filters.recordType : DEFAULT_OOO_TYPES,
    },
    source_type: "manual",
    starts_at: { lt: input.dateRange.end },
  };
}

function monthlyByType(
  entries: readonly ExpandedRecordDay[],
  range: ResolvedDateRange,
  filters: OutOfOfficeFilters
): OutOfOfficeData["oooDaysByTypeMonthly"] {
  const months = monthKeys(range.start, range.end);
  const types = filters.recordType?.length
    ? filters.recordType
    : DEFAULT_OOO_TYPES;
  return {
    months,
    series: types.map((recordType) => {
      const byMonth = groupByMonth(
        entries.filter((entry) => entry.recordType === recordType),
        "UTC"
      );
      return {
        recordType,
        values: months.map((month) => byMonth.get(month) ?? 0),
      };
    }),
  };
}

function wfhPattern(
  entries: readonly ExpandedRecordDay[]
): OutOfOfficeData["wfhPatternByDayOfWeek"] {
  const wfhEntries = entries.filter((entry) => entry.recordType === "wfh");
  const days = groupByDayOfWeek(wfhEntries, "UTC");
  return DAY_LABELS.map((label, dayOfWeek) => {
    const typedDay = toDayOfWeek(dayOfWeek);
    const people = new Set(
      wfhEntries
        .filter(
          (entry) => toDayOfWeek(dayOfWeek) === toDayOfWeekIndex(entry.date)
        )
        .map((entry) => entry.personId)
    );
    return {
      dayLabel: label,
      dayOfWeek: typedDay,
      days: days.get(typedDay) ?? 0,
      peopleCount: people.size,
    };
  });
}

function travelFrequency(
  people: readonly PersonRow[],
  records: readonly RecordRow[],
  entries: readonly ExpandedRecordDay[]
): OutOfOfficeData["travelFrequencyByPerson"] {
  const travelEntries = entries.filter(
    (entry) => entry.recordType === "travelling"
  );
  const daysByPerson = groupByPerson(travelEntries);
  const travelRecordCounts = countRecordsByPerson(
    records.filter((record) => record.record_type === "travelling")
  );
  return people
    .map((person) => ({
      days: daysByPerson.get(person.id) ?? 0,
      firstName: person.first_name,
      lastName: person.last_name,
      personId: person.id,
      records: travelRecordCounts.get(person.id) ?? 0,
      teamName: person.team?.name ?? null,
    }))
    .filter((person) => person.days > 0)
    .sort((left, right) => right.days - left.days)
    .slice(0, 20);
}

function topWfhPeople(
  people: readonly PersonRow[],
  entries: readonly ExpandedRecordDay[],
  range: ResolvedDateRange
): OutOfOfficeData["topWfhPeople"] {
  const wfhEntries = entries.filter((entry) => entry.recordType === "wfh");
  const daysByPerson = groupByPerson(wfhEntries);
  const totalWorkingDays = countWeekdays(range.start, range.end);
  return people
    .map((person) => {
      const wfhDays = daysByPerson.get(person.id) ?? 0;
      return {
        firstName: person.first_name,
        lastName: person.last_name,
        personId: person.id,
        teamName: person.team?.name ?? null,
        totalWorkingDays,
        wfhDays,
        wfhRatio:
          totalWorkingDays === 0 ? 0 : round(wfhDays / totalWorkingDays),
      };
    })
    .filter((person) => person.wfhDays > 0)
    .sort((left, right) => right.wfhDays - left.wfhDays)
    .slice(0, 20);
}

function donut(
  daysByType: ReadonlyMap<availability_record_type, number>,
  totalDays: number
): OutOfOfficeData["oooTypeDonut"] {
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
): { days: number; recordType: LocalOnlyRecordType | null } {
  const sorted = [...daysByType.entries()].sort(
    (left, right) => right[1] - left[1]
  );
  for (const [recordType, days] of sorted) {
    if (isLocalOnlyRecordType(recordType)) {
      return { days, recordType };
    }
  }
  return { days: 0, recordType: null };
}

function isLocalOnlyRecordType(
  recordType: availability_record_type
): recordType is LocalOnlyRecordType {
  return isLocalOnlyType(recordType);
}

function workingDaysByRecord(
  records: readonly RecordRow[],
  input: DrilldownInput
): Map<string, number> {
  return new Map(
    records.map((record) => [
      record.id,
      sum(
        expandRecordAcrossDays({
          locationHolidays: [],
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

function countWeekdays(start: Date, end: Date): number {
  let cursor = new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate())
  );
  const limit = new Date(
    Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate())
  );
  let total = 0;
  while (cursor < limit) {
    const day = cursor.getUTCDay();
    if (day >= 1 && day <= 5) {
      total += 1;
    }
    cursor = new Date(cursor.getTime() + 86_400_000);
  }
  return total;
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

function toDayOfWeek(value: number): 0 | 1 | 2 | 3 | 4 | 5 | 6 {
  return value === 0 ||
    value === 1 ||
    value === 2 ||
    value === 3 ||
    value === 4 ||
    value === 5
    ? value
    : 6;
}

function toDayOfWeekIndex(date: Date): 0 | 1 | 2 | 3 | 4 | 5 | 6 {
  const day = date.getUTCDay();
  return toDayOfWeek((day + 6) % 7);
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
