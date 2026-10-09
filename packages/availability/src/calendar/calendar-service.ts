import { log } from "@repo/observability/log";
import "server-only";
import type { ClerkOrgId, OrganisationId, Result } from "@repo/core";
import { recordFallsOnDay, recordQueryWindow } from "@repo/core";
import { database, scopedTo } from "@repo/database";
import type {
  availability_approval_status,
  availability_contactability,
  availability_privacy_mode,
  availability_record_type,
  availability_source_type,
  person_type,
} from "@repo/database/generated/enums";
import { z } from "zod";
import { resolvePublicHolidays } from "../holidays/resolve-public-holidays";
import {
  type RecordTypeCategory,
  sourceTypesForCategory,
  USER_CREATABLE_RECORD_TYPES,
} from "../records/record-type-categories";
import { getSettings } from "../settings/organisation-settings-service";
import { getXeroConnectionStateForScope } from "../xero-connection-state";
export type CalendarRole = "admin" | "manager" | "owner" | "viewer";
export type CalendarView = "day" | "month" | "week";
export type CalendarScope =
  | {
      type: "all_teams";
      value?: string;
    }
  | {
      type: "my_self";
      value?: string;
    }
  | {
      type: "my_team";
      value?: string;
    }
  | {
      type: "person";
      value: string;
    }
  | {
      type: "team";
      value: string;
    };
export type CalendarRecordType = availability_record_type | "private";
export type RenderTreatment = "draft" | "dashed" | "failed" | "solid";
export type CalendarServiceError =
  | {
      code: "invalid_scope";
      message: string;
    }
  | {
      code: "not_authorised";
      message: string;
    }
  | {
      code: "unknown_error";
      message: string;
    }
  | {
      code: "validation_error";
      message: string;
    };
export interface CalendarPerson {
  avatarUrl: string | null;
  displayName: string;
  firstName: string;
  id: string;
  jobTitle: string | null;
  lastName: string;
  locationName: string | null;
  locationTimezone: string | null;
  personType: person_type | "contractor" | "employee";
  teamId: string | null;
  teamName: string | null;
  xeroSyncFailedCountInRange: number;
}
export interface PublicHolidayCell {
  appliesToAllLocationsInView: boolean;
  isSuppressed: boolean;
  locationNames: readonly string[];
  name: string;
  /** "HH:mm" for part-day holidays, otherwise null. */
  startsAt: string | null;
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
  people: readonly CalendarPerson[];
  range: {
    end: Date;
    start: Date;
    timezone: string;
  };
  totalPeopleInScope: number;
  truncated: boolean;
  view: CalendarView;
  xeroConnectionState: import("@repo/core").XeroConnectionDisplayState;
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
  job_title: string | null;
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
  team: {
    id: string;
    name: string;
  } | null;
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
        select: { timezone: true },
        where: {
          archived_at: null,
          clerk_org_id: parsed.data.clerkOrgId,
          id: parsed.data.organisationId,
        },
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
    const managerReportIds = authorisedReportIds(
      parsed.data,
      allPeople,
      settingsResult
    );
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
      recordQueryWindow(
        localRange.startDateOnly,
        addDays(localRange.endDateOnly, -1),
        timezone
      ),
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
    const dayBoundaries = dayDateOnly.map((dateOnly) => ({
      dateKey: dateOnly,
      dateOnly,
      end: zonedStartOfDayToUtc(addDays(dateOnly, 1), timezone),
      start: zonedStartOfDayToUtc(dateOnly, timezone),
    }));
    const eventsInView = events.filter((event) =>
      dayBoundaries.some((day) => recordFallsOnDay(event, day))
    );
    const failedCounts = countFailedByPerson(eventsInView);
    const today = dateOnlyInTimeZone(new Date(), timezone);
    const days = dayBoundaries.map((day) => ({
      date: dateOnlyToUtcDate(day.dateOnly),
      dayOfWeek: dateOnlyToUtcDate(
        day.dateOnly
      ).getUTCDay() as CalendarDay["dayOfWeek"],
      events: eventsInView.filter((event) => recordFallsOnDay(event, day)),
      isToday: day.dateOnly === today,
      publicHolidays: holidays.get(day.dateOnly) ?? [],
    }));
    const xeroStateResult = await getXeroConnectionStateForScope({
      clerkOrgId: parsed.data.clerkOrgId,
      organisationId: parsed.data.organisationId,
    });
    const xeroConnectionState = xeroStateResult.ok
      ? xeroStateResult.value.state
      : "unavailable";
    return {
      ok: true,
      value: {
        days,
        people: visiblePeople.map((person) =>
          toCalendarPerson(person, failedCounts.get(person.id) ?? 0)
        ),
        range,
        totalPeopleInScope,
        truncated: totalPeopleInScope > MAX_VISIBLE_PEOPLE,
        view: parsed.data.view,
        xeroConnectionState,
        xeroSyncFailedCount: eventsInView.filter(
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
      select: recordSelect,
      where: {
        ...scopedTo({
          clerkOrgId: parsed.data.clerkOrgId,
          organisationId: parsed.data.organisationId,
        }),
        archived_at: null,
        id: parsed.data.recordId,
      },
    });
    if (!record) {
      return await recordNotFound(parsed.data);
    }
    const allPeople = await loadPeople({
      actingPersonId: parsed.data.actingPersonId ?? null,
      actingUserId: parsed.data.actingUserId,
      anchorDate: new Date(),
      clerkOrgId: parsed.data.clerkOrgId,
      filters: {},
      organisationId: parsed.data.organisationId,
      role: parsed.data.role,
      scope: { type: "all_teams" },
      view: "month",
    });
    if (!allPeople.some((person) => person.id === record.person_id)) {
      return notAuthorised();
    }
    const managerReportIds = authorisedReportIds(
      parsed.data,
      allPeople,
      settingsResult
    );
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
    orderBy: [{ last_name: "asc" }, { first_name: "asc" }, { id: "asc" }],
    select: personSelect,
    where: {
      ...scopedTo({
        clerkOrgId: input.clerkOrgId,
        organisationId: input.organisationId,
      }),
      archived_at: null,
      is_active: true,
    },
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
  if (
    !(
      isAdminOrOwner(input.role) ||
      people.some((candidate) => candidate.id === actingPersonId)
    )
  ) {
    return notAuthorised();
  }
  if (input.scope.type === "my_self") {
    const self = people.find((candidate) => candidate.id === actingPersonId);
    return self ? { ok: true, value: [self] } : notAuthorised();
  }
  if (input.scope.type === "my_team") {
    const scopedPeople = people.filter(
      (candidate) =>
        candidate.id === actingPersonId ||
        options.managerReportIds.has(candidate.id)
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
        (candidate) =>
          candidate.id === actingPersonId ||
          options.managerReportIds.has(candidate.id)
      ),
    };
  }
  if (input.scope.type === "team") {
    return resolveTeamPeople(input, people, options);
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
function resolveTeamPeople(
  input: ParsedRangeInput,
  people: ScopedPerson[],
  options: {
    includeIndirectReports: boolean;
    managerReportIds: ReadonlySet<string>;
  }
): Result<ScopedPerson[], CalendarServiceError> {
  const teamPeople = people.filter(
    (candidate) => candidate.team_id === input.scope.value
  );
  if (isAdminOrOwner(input.role)) {
    return { ok: true, value: teamPeople };
  }
  if (
    !teamPeople.some((candidate) => options.managerReportIds.has(candidate.id))
  ) {
    return invalidScope();
  }
  return {
    ok: true,
    value: options.includeIndirectReports
      ? teamPeople
      : teamPeople.filter(
          (candidate) =>
            candidate.id === input.actingPersonId ||
            options.managerReportIds.has(candidate.id)
        ),
  };
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
  range: { end: Date; start: Date },
  personIds: string[],
  options: {
    showPendingOnCalendar: boolean;
  }
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
    orderBy: [{ starts_at: "asc" }, { person_id: "asc" }, { id: "asc" }],
    select: recordSelect,
    where: {
      ...scopedTo({
        clerkOrgId: input.clerkOrgId,
        organisationId: input.organisationId,
      }),
      archived_at: null,
      ends_at: { gte: range.start },
      OR: approvalOr,
      person_id: { in: personIds },
      record_type: input.filters.recordType?.length
        ? { in: input.filters.recordType }
        : undefined,
      source_type: { in: sourceTypesForCategory(category) },
      starts_at: { lt: range.end },
    },
  });
}
function approvalStatusesForFilter(
  filters: ParsedRangeInput["filters"],
  options: {
    showPendingOnCalendar: boolean;
  }
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
  const sortedDates = [...input.dateOnlyValues].sort();
  const [from] = sortedDates;
  const to = sortedDates.at(-1);
  const cells = new Map<string, PublicHolidayCell[]>();
  if (!(from && to)) {
    return cells;
  }
  const locations = new Map(
    input.people
      .filter((person) => person.location)
      .map((person) => [person.location?.id ?? "", person.location])
  );
  const result = await resolvePublicHolidays({
    clerkOrgId: input.clerkOrgId as ClerkOrgId,
    from,
    organisationId: input.organisationId as OrganisationId,
    to,
  });
  if (!result.ok) {
    return cells;
  }
  for (const holiday of result.value) {
    const location = holiday.locationId
      ? locations.get(holiday.locationId)
      : null;
    // Part days stay working days but still show, with their start time.
    const visible =
      holiday.classification === "non_working" || holiday.kind === "part_day";
    if (!(location && visible)) {
      continue;
    }
    const dateCells = cells.get(holiday.date) ?? [];
    const existing = dateCells.find((cell) => cell.name === holiday.name);
    if (existing) {
      existing.locationNames = uniqueSorted([
        ...existing.locationNames,
        location.name,
      ]);
      existing.appliesToAllLocationsInView =
        existing.locationNames.length === locations.size;
    } else {
      dateCells.push({
        appliesToAllLocationsInView: locations.size === 1,
        isSuppressed: false,
        locationNames: [location.name],
        name: holiday.name,
        startsAt: holiday.startsAt,
      });
    }
    cells.set(holiday.date, dateCells);
  }
  return cells;
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
    // Xero error text can disclose leave type and payroll context, so it is
    // withheld from peers alongside notes and the true record type.
    xeroWriteError:
      canSeeSensitive && record.approval_status === "xero_sync_failed"
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
    jobTitle: person.job_title,
    lastName: person.last_name,
    locationName: person.location?.name ?? null,
    locationTimezone: person.location?.timezone ?? null,
    personType: effectivePersonType(person),
    teamId: person.team?.id ?? null,
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
): {
  dateOnlyValues: string[];
  endDateOnly: string;
  startDateOnly: string;
} {
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
  const end = addDays(startOfWeekMonday(monthEnd), 7);
  return {
    dateOnlyValues: dateRange(start, addDays(end, -1)),
    endDateOnly: end,
    startDateOnly: start,
  };
}
function authorisedReportIds(
  actor: {
    actingPersonId?: string | null;
    role: CalendarRole;
  },
  people: ScopedPerson[],
  settings: Awaited<ReturnType<typeof getSettings>>
): Set<string> {
  if (
    actor.role !== "manager" ||
    !actor.actingPersonId ||
    !settings.ok ||
    !people.some((person) => person.id === actor.actingPersonId)
  ) {
    return new Set<string>();
  }
  return settings.value.managerVisibilityScope === "all_team_leave"
    ? transitiveReportIds(people, actor.actingPersonId)
    : new Set(
        people
          .filter((person) => person.manager_person_id === actor.actingPersonId)
          .map((person) => person.id)
      );
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
async function recordNotFound(
  input: ParsedDetailInput
): Promise<Result<never, CalendarServiceError>> {
  const exists = await database.availabilityRecord.findFirst({
    select: { clerk_org_id: true, organisation_id: true },
    where: { id: input.recordId },
  });
  if (
    exists &&
    (exists.clerk_org_id !== input.clerkOrgId ||
      exists.organisation_id !== input.organisationId)
  ) {
    log.error("Cross-tenant resource access attempt", {
      actingClerkOrgId: input.clerkOrgId,
      actingOrganisationId: input.organisationId,
      resourceId: input.recordId,
      resourceType: "availability_record",
    });
  }
  return {
    error: { code: "invalid_scope", message: "Record not found." },
    ok: false,
  };
}
function validationError(
  error: z.ZodError
): Result<never, CalendarServiceError> {
  return {
    error: {
      code: "validation_error",
      message: error.issues[0]?.message ?? "Invalid calendar request.",
    },
    ok: false,
  };
}
function notAuthorised(): Result<never, CalendarServiceError> {
  return {
    error: {
      code: "not_authorised",
      message: "You do not have permission to view this calendar.",
    },
    ok: false,
  };
}
function invalidScope(): Result<never, CalendarServiceError> {
  return {
    error: {
      code: "invalid_scope",
      message: "Calendar scope is not available.",
    },
    ok: false,
  };
}
function unknownError(message: string): Result<never, CalendarServiceError> {
  return {
    error: { code: "unknown_error", message },
    ok: false,
  };
}
const personSelect = {
  archived_at: true,
  avatar_url: true,
  email: true,
  employment_type: true,
  first_name: true,
  id: true,
  job_title: true,
  last_name: true,
  location: {
    select: {
      country_code: true,
      id: true,
      name: true,
      region_code: true,
      timezone: true,
    },
  },
  location_id: true,
  manager_person_id: true,
  person_type: true,
  team: {
    select: {
      id: true,
      name: true,
    },
  },
  team_id: true,
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
  person: {
    select: personSelect,
  },
  person_id: true,
  privacy_mode: true,
  record_type: true,
  source_type: true,
  starts_at: true,
  submitted_at: true,
  title: true,
  xero_write_error: true,
} as const;
