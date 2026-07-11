import "server-only";

import type { ClerkOrgId, OrganisationId, Result } from "@repo/core";
import { database, scopedQuery } from "@repo/database";
import type {
  availability_approval_status,
  availability_contactability,
  availability_privacy_mode,
  availability_record_type,
  availability_source_type,
  person_type,
} from "@repo/database/generated/enums";
import { z } from "zod";
import { listForOrganisation } from "../holidays/holiday-service";
import {
  type RecordTypeCategory,
  sourceTypesForCategory,
  USER_CREATABLE_RECORD_TYPES,
} from "../records/record-type-categories";
import { getSettings } from "../settings/organisation-settings-service";
import { hasActiveXeroConnection } from "../xero-connection-state";

export type CalendarRole = "admin" | "manager" | "owner" | "viewer";
export type CalendarView = "day" | "month" | "week";
export type CalendarScope =
  | { type: "all_teams"; value?: string }
  | { type: "my_self"; value?: string }
  | { type: "my_team"; value?: string }
  | { type: "person"; value: string }
  | { type: "team"; value: string };
export type CalendarRecordType = availability_record_type | "private";
export type RenderTreatment = "draft" | "dashed" | "failed" | "solid";

export type CalendarServiceError =
  | { code: "cross_org_leak"; message: string }
  | { code: "invalid_scope"; message: string }
  | { code: "not_authorised"; message: string }
  | { code: "unknown_error"; message: string }
  | { code: "validation_error"; message: string };

export interface CalendarPerson {
  avatarUrl: string | null;
  displayName: string;
  firstName: string;
  id: string;
  lastName: string;
  locationName: string | null;
  locationTimezone: string | null;
  personType: person_type | "contractor" | "employee";
  teamName: string | null;
  xeroSyncFailedCountInRange: number;
}

export interface PublicHolidayCell {
  appliesToAllLocationsInView: boolean;
  isSuppressed: boolean;
  locationNames: readonly string[];
  name: string;
}

export interface CalendarEvent {
  allDay: boolean;
  approvalStatus: availability_approval_status;
  avatarUrl: string | null;
  contactabilityStatus: availability_contactability | null;
  displayName: string;
  endsAt: Date;
  id: string;
  isEditableByActor: boolean;
  notesInternal: string | null;
  personId: string;
  privacyMode: availability_privacy_mode;
  recordType: CalendarRecordType;
  recordTypeCategory: Exclude<RecordTypeCategory, "all">;
  renderTreatment: RenderTreatment;
  sourceType: availability_source_type;
  startsAt: Date;
  xeroWriteError: string | null;
}

export interface CalendarDay {
  date: Date;
  dayOfWeek: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  events: readonly CalendarEvent[];
  isToday: boolean;
  publicHolidays: readonly PublicHolidayCell[];
}

export interface CalendarRange {
  days: readonly CalendarDay[];
  hasActiveXeroConnection: boolean;
  people: readonly CalendarPerson[];
  range: { end: Date; start: Date; timezone: string };
  totalPeopleInScope: number;
  truncated: boolean;
  view: CalendarView;
  xeroSyncFailedCount: number;
}

export interface CalendarEventDetail extends CalendarEvent {
  approvalNote: string | null;
  submittedAt: Date | null;
  title: string | null;
}

const MAX_VISIBLE_PEOPLE = 200;

const RoleSchema = z.enum(["admin", "manager", "owner", "viewer"]);
const ViewSchema = z.enum(["day", "week", "month"]);
const ScopeSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("my_self"), value: z.string().optional() }),
  z.object({ type: z.literal("my_team"), value: z.string().optional() }),
  z.object({ type: z.literal("all_teams"), value: z.string().optional() }),
  z.object({ type: z.literal("team"), value: z.string().uuid() }),
  z.object({ type: z.literal("person"), value: z.string().uuid() }),
]);
const ApprovalStatusSchema = z.enum([
  "draft",
  "submitted",
  "approved",
  "declined",
  "cancelled",
  "withdrawn",
  "xero_sync_failed",
]);
const PersonTypeSchema = z.enum(["contractor", "employee"]);
const RecordTypeSchema = z.enum(USER_CREATABLE_RECORD_TYPES);

const RangeInputSchema = z.object({
  actingPersonId: z.string().uuid().nullable().optional(),
  actingUserId: z.string().min(1),
  anchorDate: z.coerce.date(),
  clerkOrgId: z.string().min(1),
  filters: z
    .object({
      approvalStatus: z.array(ApprovalStatusSchema).optional(),
      includeDrafts: z.boolean().default(false).optional(),
      locationId: z.array(z.string().uuid()).optional(),
      personType: z.array(PersonTypeSchema).optional(),
      recordType: z.array(RecordTypeSchema).optional(),
      recordTypeCategory: z
        .enum(["all", "local_only", "xero_leave"])
        .default("all")
        .optional(),
    })
    .default({}),
  organisationId: z.string().uuid(),
  role: RoleSchema,
  scope: ScopeSchema,
  view: ViewSchema,
});

const DetailInputSchema = z.object({
  actingPersonId: z.string().uuid().nullable().optional(),
  actingUserId: z.string().min(1),
  clerkOrgId: z.string().min(1),
  organisationId: z.string().uuid(),
  recordId: z.string().uuid(),
  role: RoleSchema,
});

type ParsedRangeInput = z.infer<typeof RangeInputSchema>;
type ParsedDetailInput = z.infer<typeof DetailInputSchema>;

interface ScopedPerson {
  archived_at: Date | null;
  avatar_url: string | null;
  email: string;
  employment_type: string;
  first_name: string;
  id: string;
  last_name: string;
  location: {
    country_code: string | null;
    id: string;
    name: string;
    region_code: string | null;
    timezone: string | null;
  } | null;
  location_id: string | null;
  manager_person_id: string | null;
  person_type: person_type | null;
  team: { id: string; name: string } | null;
  team_id: string | null;
}

interface ScopedRecord {
  all_day: boolean;
  approval_note: string | null;
  approval_status: availability_approval_status;
  archived_at: Date | null;
  contactability: availability_contactability;
  ends_at: Date;
  id: string;
  notes_internal: string | null;
  person: ScopedPerson;
  person_id: string;
  privacy_mode: availability_privacy_mode;
  record_type: availability_record_type;
  source_type: availability_source_type;
  starts_at: Date;
  submitted_at: Date | null;
  title: string | null;
  xero_write_error: string | null;
}

interface HolidayForCalendar {
  archived_at: Date | null;
  assignments: Array<{
    archived_at: Date | null;
    day_classification: "non_working" | "working";
    scope_type: string;
    scope_value: string;
  }>;
  country_code: string;
  default_classification: "non_working" | "working";
  holiday_date: Date;
  name: string;
  region_code: string | null;
}

export async function getCalendarRange(
  input: unknown
): Promise<Result<CalendarRange, CalendarServiceError>> {
  const parsed = RangeInputSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error);
  }

  try {
    const [organisation, settingsResult] = await Promise.all([
      database.organisation.findFirst({
        where: {
          archived_at: null,
          clerk_org_id: parsed.data.clerkOrgId,
          id: parsed.data.organisationId,
        },
        select: { timezone: true },
      }),
      getSettings({
        clerkOrgId: parsed.data.clerkOrgId,
        organisationId: parsed.data.organisationId,
      }),
    ]);
    const timezone = organisation?.timezone ?? "UTC";
    const localRange = resolveLocalRange(
      parsed.data.view,
      parsed.data.anchorDate,
      timezone
    );
    const range = {
      end: zonedStartOfDayToUtc(localRange.endDateOnly, timezone),
      start: zonedStartOfDayToUtc(localRange.startDateOnly, timezone),
      timezone,
    };

    const allPeople = await loadPeople(parsed.data);
    const managerReportIds =
      parsed.data.role === "manager" && parsed.data.actingPersonId
        ? transitiveReportIds(allPeople, parsed.data.actingPersonId)
        : new Set<string>();
    const scopedPeopleResult = resolvePeopleForScope(parsed.data, allPeople, {
      includeIndirectReports:
        settingsResult.ok &&
        settingsResult.value.managerVisibilityScope === "all_team_leave",
      managerReportIds,
    });
    if (!scopedPeopleResult.ok) {
      return scopedPeopleResult;
    }

    const filteredPeople = applyPeopleFilters(
      scopedPeopleResult.value,
      parsed.data.filters
    );
    const totalPeopleInScope = filteredPeople.length;
    const visiblePeople = filteredPeople.slice(0, MAX_VISIBLE_PEOPLE);
    const visiblePersonIds = new Set(visiblePeople.map((person) => person.id));
    const records = await loadRecords(
      parsed.data,
      range,
      [...visiblePersonIds],
      {
        showPendingOnCalendar: settingsResult.ok
          ? settingsResult.value.showPendingOnCalendar
          : true,
      }
    );
    const events = records
      .filter((record) => visiblePersonIds.has(record.person_id))
      .map((record) =>
        toCalendarEvent(record, {
          actingPersonId: parsed.data.actingPersonId ?? null,
          managerReportIds,
          role: parsed.data.role,
        })
      );
    const dayDateOnly = localRange.dateOnlyValues;
    const holidays = await loadPublicHolidayCells({
      clerkOrgId: parsed.data.clerkOrgId,
      dateOnlyValues: dayDateOnly,
      organisationId: parsed.data.organisationId,
      people: visiblePeople,
      range,
      timezone,
    });
    const failedCounts = countFailedByPerson(events);
    const days = dayDateOnly.map((dateOnly) => ({
      date: dateOnlyToUtcDate(dateOnly),
      dayOfWeek: dateOnlyToUtcDate(
        dateOnly
      ).getUTCDay() as CalendarDay["dayOfWeek"],
      events: events.filter((event) =>
        eventOverlapsDate(event, dateOnly, timezone)
      ),
      isToday: dateOnly === dateOnlyInTimeZone(new Date(), timezone),
      publicHolidays: holidays.get(dateOnly) ?? [],
    }));
    const hasXero = await hasActiveXeroConnection({
      clerkOrgId: parsed.data.clerkOrgId,
      organisationId: parsed.data.organisationId,
    });

    return {
      ok: true,
      value: {
        days,
        hasActiveXeroConnection: hasXero,
        people: visiblePeople.map((person) =>
          toCalendarPerson(person, failedCounts.get(person.id) ?? 0)
        ),
        range,
        totalPeopleInScope,
        truncated: totalPeopleInScope > MAX_VISIBLE_PEOPLE,
        view: parsed.data.view,
        xeroSyncFailedCount: events.filter(
          (event) => event.approvalStatus === "xero_sync_failed"
        ).length,
      },
    };
  } catch {
    return unknownError("Failed to load calendar.");
  }
}

export async function getEventDetail(
  input: unknown
): Promise<Result<CalendarEventDetail, CalendarServiceError>> {
  const parsed = DetailInputSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error);
  }

  try {
    const settingsResult = await getSettings({
      clerkOrgId: parsed.data.clerkOrgId,
      organisationId: parsed.data.organisationId,
    });
    const record = await database.availabilityRecord.findFirst({
      where: {
        ...scoped(parsed.data.clerkOrgId, parsed.data.organisationId),
        archived_at: null,
        id: parsed.data.recordId,
      },
      select: recordSelect,
    });
    if (!record) {
      return await recordNotFoundOrLeak(parsed.data);
    }
    const includeIndirectReports =
      settingsResult.ok &&
      settingsResult.value.managerVisibilityScope === "all_team_leave";
    const allPeople =
      parsed.data.role === "manager" && parsed.data.actingPersonId
        ? await loadPeople({
            actingPersonId: parsed.data.actingPersonId ?? null,
            actingUserId: parsed.data.actingUserId,
            anchorDate: new Date(),
            clerkOrgId: parsed.data.clerkOrgId,
            filters: {},
            organisationId: parsed.data.organisationId,
            role: parsed.data.role,
            scope: { type: "all_teams" },
            view: "month",
          })
        : [];
    let managerReportIds = new Set<string>();
    if (parsed.data.role === "manager" && parsed.data.actingPersonId) {
      managerReportIds = includeIndirectReports
        ? transitiveReportIds(allPeople, parsed.data.actingPersonId)
        : new Set(
            allPeople
              .filter(
                (person) =>
                  person.manager_person_id === parsed.data.actingPersonId
              )
              .map((person) => person.id)
          );
    }
    if (
      !canViewRecord({
        actingPersonId: parsed.data.actingPersonId ?? null,
        managerReportIds,
        role: parsed.data.role,
        targetPerson: record.person,
      })
    ) {
      return notAuthorised();
    }
    const event = toCalendarEvent(record, {
      actingPersonId: parsed.data.actingPersonId ?? null,
      managerReportIds,
      role: parsed.data.role,
    });
    return {
      ok: true,
      value: {
        ...event,
        approvalNote: record.approval_note,
        submittedAt: record.submitted_at,
        title: record.title,
      },
    };
  } catch {
    return unknownError("Failed to load calendar event.");
  }
}

async function loadPeople(input: ParsedRangeInput): Promise<ScopedPerson[]> {
  return await database.person.findMany({
    where: {
      ...scoped(input.clerkOrgId, input.organisationId),
      archived_at: null,
      is_active: true,
    },
    orderBy: [{ last_name: "asc" }, { first_name: "asc" }, { id: "asc" }],
    select: personSelect,
  });
}

function resolvePeopleForScope(
  input: ParsedRangeInput,
  people: ScopedPerson[],
  options: {
    includeIndirectReports: boolean;
    managerReportIds: ReadonlySet<string>;
  }
): Result<ScopedPerson[], CalendarServiceError> {
  const actingPersonId = input.actingPersonId ?? null;
  if (!(actingPersonId || isAdminOrOwner(input.role))) {
    return notAuthorised();
  }

  if (input.scope.type === "my_self") {
    const self = people.find((person) => person.id === actingPersonId);
    return self ? { ok: true, value: [self] } : notAuthorised();
  }

  if (input.scope.type === "my_team") {
    const scopedPeople = people.filter(
      (person) =>
        person.id === actingPersonId ||
        person.manager_person_id === actingPersonId ||
        (options.includeIndirectReports &&
          options.managerReportIds.has(person.id))
    );
    return { ok: true, value: scopedPeople };
  }

  if (input.scope.type === "all_teams") {
    if (isAdminOrOwner(input.role)) {
      return { ok: true, value: people };
    }
    if (input.role !== "manager" || !actingPersonId) {
      return notAuthorised();
    }
    return {
      ok: true,
      value: people.filter(
        (person) =>
          person.id === actingPersonId ||
          options.managerReportIds.has(person.id)
      ),
    };
  }

  if (input.scope.type === "team") {
    const teamPeople = people.filter(
      (person) => person.team_id === input.scope.value
    );
    if (isAdminOrOwner(input.role)) {
      return { ok: true, value: teamPeople };
    }
    const hasDirectReportOnTeam = teamPeople.some(
      (person) =>
        person.manager_person_id === actingPersonId ||
        (options.includeIndirectReports &&
          options.managerReportIds.has(person.id))
    );
    return hasDirectReportOnTeam
      ? { ok: true, value: teamPeople }
      : invalidScope();
  }

  const person = people.find((candidate) => candidate.id === input.scope.value);
  if (!person) {
    return invalidScope();
  }
  if (
    canViewRecord({
      actingPersonId,
      managerReportIds: options.managerReportIds,
      role: input.role,
      targetPerson: person,
    })
  ) {
    return { ok: true, value: [person] };
  }
  return invalidScope();
}

function applyPeopleFilters(
  people: ScopedPerson[],
  filters: ParsedRangeInput["filters"]
): ScopedPerson[] {
  return people.filter((person) => {
    if (
      filters.personType?.length &&
      !filters.personType.includes(effectivePersonType(person))
    ) {
      return false;
    }
    if (filters.locationId?.length) {
      return Boolean(
        person.location_id && filters.locationId.includes(person.location_id)
      );
    }
    return true;
  });
}

async function loadRecords(
  input: ParsedRangeInput,
  range: CalendarRange["range"],
  personIds: string[],
  options: { showPendingOnCalendar: boolean }
): Promise<ScopedRecord[]> {
  if (personIds.length === 0) {
    return [];
  }

  const filteredApprovalStatuses = approvalStatusesForFilter(
    input.filters,
    options
  );
  const category = input.filters.recordTypeCategory ?? "all";
  const approvalOr = [
    { approval_status: { in: filteredApprovalStatuses } },
    ...(input.filters.includeDrafts && input.actingPersonId
      ? [
          {
            approval_status: "draft" as const,
            person_id: input.actingPersonId,
          },
        ]
      : []),
  ];

  return await database.availabilityRecord.findMany({
    where: {
      ...scoped(input.clerkOrgId, input.organisationId),
      OR: approvalOr,
      archived_at: null,
      ends_at: { gt: range.start },
      person_id: { in: personIds },
      record_type: input.filters.recordType?.length
        ? { in: input.filters.recordType }
        : undefined,
      source_type: { in: sourceTypesForCategory(category) },
      starts_at: { lt: range.end },
    },
    orderBy: [{ starts_at: "asc" }, { person_id: "asc" }, { id: "asc" }],
    select: recordSelect,
  });
}

function approvalStatusesForFilter(
  filters: ParsedRangeInput["filters"],
  options: { showPendingOnCalendar: boolean }
): availability_approval_status[] {
  const statuses = filters.approvalStatus?.length
    ? filters.approvalStatus
    : ([
        "approved",
        ...(options.showPendingOnCalendar ? (["submitted"] as const) : []),
        "xero_sync_failed",
      ] as const);
  return statuses.filter(
    (status) =>
      status !== "declined" &&
      status !== "withdrawn" &&
      status !== "cancelled" &&
      status !== "draft"
  );
}

async function loadPublicHolidayCells(input: {
  clerkOrgId: string;
  dateOnlyValues: string[];
  organisationId: string;
  people: ScopedPerson[];
  range: CalendarRange["range"];
  timezone: string;
}): Promise<Map<string, PublicHolidayCell[]>> {
  const years = new Set(
    input.dateOnlyValues.map((dateOnly) => Number(dateOnly.slice(0, 4)))
  );
  const holidayResults = await Promise.all(
    [...years].map((year) =>
      listForOrganisation(
        input.clerkOrgId as ClerkOrgId,
        input.organisationId as OrganisationId,
        { year }
      )
    )
  );
  const locations = new Map(
    input.people
      .filter((person) => person.location)
      .map((person) => [person.location?.id ?? "", person.location])
  );
  const cells = new Map<string, PublicHolidayCell[]>();
  for (const result of holidayResults) {
    if (!result.ok) {
      continue;
    }
    for (const holiday of result.value) {
      if (holiday.archived_at) {
        continue;
      }
      const dateOnly = dateOnlyInTimeZone(holiday.holiday_date, input.timezone);
      if (!input.dateOnlyValues.includes(dateOnly)) {
        continue;
      }
      const locationNames = [...locations.values()]
        .filter((location): location is NonNullable<typeof location> =>
          Boolean(location)
        )
        .filter((location) => holidayAppliesToLocation(holiday, location))
        .map((location) => location.name)
        .sort((first, second) => first.localeCompare(second));
      if (locationNames.length === 0) {
        continue;
      }
      const dateCells = cells.get(dateOnly) ?? [];
      const existing = dateCells.find((cell) => cell.name === holiday.name);
      if (existing) {
        existing.locationNames = uniqueSorted([
          ...existing.locationNames,
          ...locationNames,
        ]);
        existing.appliesToAllLocationsInView =
          existing.locationNames.length === locations.size;
      } else {
        dateCells.push({
          appliesToAllLocationsInView: locationNames.length === locations.size,
          isSuppressed: false,
          locationNames,
          name: holiday.name,
        });
      }
      cells.set(dateOnly, dateCells);
    }
  }
  return cells;
}

function holidayAppliesToLocation(
  holiday: HolidayForCalendar,
  location: NonNullable<ScopedPerson["location"]>
): boolean {
  const locationAssignment = holiday.assignments.find(
    (assignment) =>
      assignment.archived_at === null &&
      assignment.scope_type === "location" &&
      assignment.scope_value === location.id
  );
  if (locationAssignment) {
    return locationAssignment.day_classification === "non_working";
  }
  if (holiday.default_classification !== "non_working") {
    return false;
  }
  if (
    holiday.country_code !== "CUSTOM" &&
    location.country_code !== holiday.country_code
  ) {
    return false;
  }
  if (holiday.region_code && holiday.region_code !== location.region_code) {
    return false;
  }
  return true;
}

function toCalendarEvent(
  record: ScopedRecord,
  actor: {
    actingPersonId: string | null;
    managerReportIds: ReadonlySet<string>;
    role: CalendarRole;
  }
): CalendarEvent {
  const relationship = relationshipToOwner(actor, record.person);
  const canSeeSensitive = relationship !== "peer";
  const isPrivatePeer =
    relationship === "peer" && record.privacy_mode === "private";
  const isMaskedPeer =
    relationship === "peer" && record.privacy_mode === "masked";
  let displayName = `${record.person.first_name} ${record.person.last_name}`;
  if (isPrivatePeer) {
    displayName = "Unavailable";
  } else if (isMaskedPeer) {
    displayName = "Team member";
  }
  const recordType = isPrivatePeer ? "private" : record.record_type;

  return {
    allDay: record.all_day,
    approvalStatus: record.approval_status,
    avatarUrl: record.person.avatar_url,
    contactabilityStatus: record.contactability,
    displayName,
    endsAt: record.ends_at,
    id: record.id,
    isEditableByActor:
      canSeeSensitive &&
      record.source_type !== "xero" &&
      record.source_type !== "xero_leave",
    notesInternal: canSeeSensitive ? record.notes_internal : null,
    personId: record.person_id,
    privacyMode: record.privacy_mode,
    recordType,
    recordTypeCategory:
      record.source_type === "manual" ? "local_only" : "xero_leave",
    renderTreatment: renderTreatment(record.approval_status),
    sourceType: record.source_type,
    startsAt: record.starts_at,
    xeroWriteError:
      record.approval_status === "xero_sync_failed"
        ? record.xero_write_error
        : null,
  };
}

function toCalendarPerson(
  person: ScopedPerson,
  xeroSyncFailedCountInRange: number
): CalendarPerson {
  return {
    avatarUrl: person.avatar_url,
    displayName: `${person.first_name} ${person.last_name}`,
    firstName: person.first_name,
    id: person.id,
    lastName: person.last_name,
    locationName: person.location?.name ?? null,
    locationTimezone: person.location?.timezone ?? null,
    personType: effectivePersonType(person),
    teamName: person.team?.name ?? null,
    xeroSyncFailedCountInRange,
  };
}

function renderTreatment(
  approvalStatus: availability_approval_status
): RenderTreatment {
  if (approvalStatus === "submitted") {
    return "dashed";
  }
  if (approvalStatus === "draft") {
    return "draft";
  }
  if (approvalStatus === "xero_sync_failed") {
    return "failed";
  }
  return "solid";
}

function relationshipToOwner(
  actor: {
    actingPersonId: string | null;
    managerReportIds: ReadonlySet<string>;
    role: CalendarRole;
  },
  targetPerson: Pick<ScopedPerson, "id" | "manager_person_id">
): "admin" | "manager" | "peer" | "self" {
  if (targetPerson.id === actor.actingPersonId) {
    return "self";
  }
  if (targetPerson.manager_person_id === actor.actingPersonId) {
    return "manager";
  }
  if (actor.role === "manager" && actor.managerReportIds.has(targetPerson.id)) {
    return "manager";
  }
  if (isAdminOrOwner(actor.role)) {
    return "admin";
  }
  return "peer";
}

function canViewRecord(input: {
  actingPersonId: string | null;
  managerReportIds: ReadonlySet<string>;
  role: CalendarRole;
  targetPerson: Pick<ScopedPerson, "id" | "manager_person_id">;
}): boolean {
  const relationship = relationshipToOwner(
    {
      actingPersonId: input.actingPersonId,
      managerReportIds: input.managerReportIds,
      role: input.role,
    },
    input.targetPerson
  );
  return relationship !== "peer";
}

function resolveLocalRange(
  view: CalendarView,
  anchorDate: Date,
  timezone: string
): { dateOnlyValues: string[]; endDateOnly: string; startDateOnly: string } {
  const anchor = dateOnlyInTimeZone(anchorDate, timezone);
  if (view === "day") {
    const end = addDays(anchor, 1);
    return {
      dateOnlyValues: [anchor],
      endDateOnly: end,
      startDateOnly: anchor,
    };
  }
  if (view === "week") {
    const start = startOfWeekMonday(anchor);
    const end = addDays(start, 7);
    return {
      dateOnlyValues: dateRange(start, addDays(end, -1)),
      endDateOnly: end,
      startDateOnly: start,
    };
  }
  const monthStart = `${anchor.slice(0, 8)}01`;
  const start = startOfWeekMonday(monthStart);
  const monthEnd = lastDayOfMonth(anchor);
  const end = addDays(startOfWeekMonday(addDays(monthEnd, 6)), 7);
  return {
    dateOnlyValues: dateRange(start, addDays(end, -1)),
    endDateOnly: end,
    startDateOnly: start,
  };
}

function transitiveReportIds(
  people: ScopedPerson[],
  actingPersonId: string
): Set<string> {
  const byManager = new Map<string, ScopedPerson[]>();
  for (const person of people) {
    if (!person.manager_person_id) {
      continue;
    }
    byManager.set(person.manager_person_id, [
      ...(byManager.get(person.manager_person_id) ?? []),
      person,
    ]);
  }
  const visited = new Set<string>();
  const queue = [...(byManager.get(actingPersonId) ?? [])];
  while (queue.length > 0) {
    const person = queue.shift();
    if (!person || visited.has(person.id) || person.id === actingPersonId) {
      continue;
    }
    visited.add(person.id);
    queue.push(...(byManager.get(person.id) ?? []));
  }
  return visited;
}

function countFailedByPerson(events: CalendarEvent[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const event of events) {
    if (event.approvalStatus === "xero_sync_failed") {
      counts.set(event.personId, (counts.get(event.personId) ?? 0) + 1);
    }
  }
  return counts;
}

function eventOverlapsDate(
  event: Pick<CalendarEvent, "endsAt" | "startsAt">,
  dateOnly: string,
  timezone: string
): boolean {
  const start = zonedStartOfDayToUtc(dateOnly, timezone);
  const end = zonedStartOfDayToUtc(addDays(dateOnly, 1), timezone);
  return event.startsAt < end && event.endsAt > start;
}

function effectivePersonType(
  person: Pick<ScopedPerson, "employment_type" | "person_type">
): "contractor" | "employee" {
  if (person.person_type === "contractor") {
    return "contractor";
  }
  return person.employment_type === "contractor" ? "contractor" : "employee";
}

function isAdminOrOwner(role: CalendarRole): boolean {
  return role === "admin" || role === "owner";
}

function dateOnlyInTimeZone(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: timezone,
    year: "numeric",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function localPartsInTimeZone(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-AU", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "2-digit",
    second: "2-digit",
    timeZone: timezone,
    year: "numeric",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");
  return {
    day: value("day"),
    hour: value("hour") % 24,
    minute: value("minute"),
    month: value("month"),
    second: value("second"),
    year: value("year"),
  };
}

function zonedStartOfDayToUtc(dateOnly: string, timezone: string): Date {
  const [year = 1970, month = 1, day = 1] = dateOnly
    .split("-")
    .map((part) => Number(part));
  let guess = Date.UTC(year, month - 1, day, 0, 0, 0, 0);
  for (let index = 0; index < 2; index += 1) {
    const actual = localPartsInTimeZone(new Date(guess), timezone);
    const actualAsUtc = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
      actual.second
    );
    const targetAsUtc = Date.UTC(year, month - 1, day, 0, 0, 0, 0);
    guess += targetAsUtc - actualAsUtc;
  }
  return new Date(guess);
}

function dateRange(startDateOnly: string, endDateOnly: string): string[] {
  const dates: string[] = [];
  let cursor = dateOnlyToUtcDate(startDateOnly);
  const end = dateOnlyToUtcDate(endDateOnly);
  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor = new Date(cursor.getTime() + 86_400_000);
  }
  return dates;
}

function dateOnlyToUtcDate(dateOnly: string): Date {
  return new Date(`${dateOnly}T00:00:00.000Z`);
}

function addDays(dateOnly: string, days: number): string {
  const date = dateOnlyToUtcDate(dateOnly);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function startOfWeekMonday(dateOnly: string): string {
  const date = dateOnlyToUtcDate(dateOnly);
  const day = date.getUTCDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + mondayOffset);
  return date.toISOString().slice(0, 10);
}

function lastDayOfMonth(dateOnly: string): string {
  const [year = 1970, month = 1] = dateOnly
    .split("-")
    .map((part) => Number(part));
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort((first, second) =>
    first.localeCompare(second)
  );
}

function scoped(clerkOrgId: string, organisationId: string) {
  return scopedQuery(
    clerkOrgId as ClerkOrgId,
    organisationId as OrganisationId
  );
}

async function recordNotFoundOrLeak(
  input: ParsedDetailInput
): Promise<Result<never, CalendarServiceError>> {
  const exists = await database.availabilityRecord.findFirst({
    where: { id: input.recordId },
    select: { clerk_org_id: true, organisation_id: true },
  });
  if (
    exists &&
    (exists.clerk_org_id !== input.clerkOrgId ||
      exists.organisation_id !== input.organisationId)
  ) {
    return {
      ok: false,
      error: {
        code: "cross_org_leak",
        message: "Record is outside this organisation.",
      },
    };
  }
  return {
    ok: false,
    error: { code: "invalid_scope", message: "Record not found." },
  };
}

function validationError(
  error: z.ZodError
): Result<never, CalendarServiceError> {
  return {
    ok: false,
    error: {
      code: "validation_error",
      message: error.issues[0]?.message ?? "Invalid calendar request.",
    },
  };
}

function notAuthorised(): Result<never, CalendarServiceError> {
  return {
    ok: false,
    error: {
      code: "not_authorised",
      message: "You do not have permission to view this calendar.",
    },
  };
}

function invalidScope(): Result<never, CalendarServiceError> {
  return {
    ok: false,
    error: {
      code: "invalid_scope",
      message: "Calendar scope is not available.",
    },
  };
}

function unknownError(message: string): Result<never, CalendarServiceError> {
  return {
    ok: false,
    error: { code: "unknown_error", message },
  };
}

const personSelect = {
  archived_at: true,
  avatar_url: true,
  email: true,
  employment_type: true,
  first_name: true,
  id: true,
  last_name: true,
  location_id: true,
  manager_person_id: true,
  person_type: true,
  team_id: true,
  location: {
    select: {
      country_code: true,
      id: true,
      name: true,
      region_code: true,
      timezone: true,
    },
  },
  team: {
    select: {
      id: true,
      name: true,
    },
  },
} as const;

const recordSelect = {
  all_day: true,
  approval_note: true,
  approval_status: true,
  archived_at: true,
  contactability: true,
  ends_at: true,
  id: true,
  notes_internal: true,
  person_id: true,
  privacy_mode: true,
  record_type: true,
  source_type: true,
  starts_at: true,
  submitted_at: true,
  title: true,
  xero_write_error: true,
  person: {
    select: personSelect,
  },
} as const;
