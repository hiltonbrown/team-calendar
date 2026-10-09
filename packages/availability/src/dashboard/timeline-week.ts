import type {
  CalendarDay,
  CalendarEvent,
  CalendarPerson,
  CalendarRange,
} from "../calendar/calendar-service";
import {
  addDaysToDateKey,
  dateKeyInTimeZone,
  dateKeyOfUtcDate,
  zonedStartOfDay,
} from "./date-keys";

const DAYS_IN_WEEK = 7;

export type TimelineProvenance = "leave_request" | "manual" | "xero";

export interface TimelineWeekDay {
  /** Start of the day in the range timezone. */
  date: Date;
  dateKey: string;
  /** Full-day public holiday that applies to every location in view. */
  holidayName: string | null;
  isToday: boolean;
}

export interface TimelineWeekEntry {
  /** Days visible inside this week (1 to 7). */
  dayCount: number;
  endIndex: number;
  endsAt: Date;
  id: string;
  isPrivate: boolean;
  note: string | null;
  provenance: TimelineProvenance;
  /** "private" whenever `isPrivate`, so the true type never leaves. */
  recordType: string;
  startIndex: number;
  startsAt: Date;
}

export interface TimelineWeekRow {
  entries: TimelineWeekEntry[];
  firstName: string;
  isSelf: boolean;
  jobTitle: string | null;
  lastName: string;
  locationName: string | null;
  personId: string;
  teamName: string | null;
}

export interface TimelineWeek {
  /** Always seven days, Monday first. */
  days: TimelineWeekDay[];
  isCurrentWeek: boolean;
  nextWeekStart: string;
  previousWeekStart: string;
  rows: TimelineWeekRow[];
  timezone: string;
  /** Everyone in scope, or only people with entries when filtered. */
  totalPeopleInScope: number;
  weekStart: string;
}

export interface BuildTimelineWeekInput {
  actingPersonId: string | null;
  onlyPeopleWithEntries: boolean;
  /** A week view range from `getCalendarRange`. */
  range: CalendarRange;
  rowLimit: number;
  today: Date;
}

export function buildTimelineWeek(input: BuildTimelineWeekInput): TimelineWeek {
  const { timezone } = input.range.range;
  const weekDays = input.range.days.slice(0, DAYS_IN_WEEK);
  const weekStart = weekDays[0]
    ? dateKeyOfUtcDate(weekDays[0].date)
    : dateKeyInTimeZone(input.range.range.start, timezone);
  const nextWeekStart = addDaysToDateKey(weekStart, DAYS_IN_WEEK);
  const todayKey = dateKeyInTimeZone(input.today, timezone);
  const entriesByPerson = collectEntries(weekDays);
  const candidates = input.range.people
    .map((person) =>
      toRow(person, entriesByPerson.get(person.id) ?? [], input.actingPersonId)
    )
    .filter((row) => !input.onlyPeopleWithEntries || row.entries.length > 0)
    .sort(compareRows);
  return {
    days: weekDays.map((day) => toWeekDay(day, timezone)),
    isCurrentWeek: weekStart <= todayKey && todayKey < nextWeekStart,
    nextWeekStart,
    previousWeekStart: addDaysToDateKey(weekStart, -DAYS_IN_WEEK),
    rows: candidates.slice(0, Math.max(0, input.rowLimit)),
    timezone,
    totalPeopleInScope: input.onlyPeopleWithEntries
      ? candidates.length
      : input.range.totalPeopleInScope,
    weekStart,
  };
}

export function timelineProvenance(
  sourceType: CalendarEvent["sourceType"]
): TimelineProvenance {
  if (sourceType === "xero" || sourceType === "xero_leave") {
    return "xero";
  }
  return sourceType === "team_calendar_leave" ? "leave_request" : "manual";
}

function toWeekDay(day: CalendarDay, timezone: string): TimelineWeekDay {
  const dateKey = dateKeyOfUtcDate(day.date);
  const holiday = day.publicHolidays.find(
    (cell) => cell.startsAt === null && cell.appliesToAllLocationsInView
  );
  return {
    date: zonedStartOfDay(dateKey, timezone),
    dateKey,
    holidayName: holiday?.name ?? null,
    isToday: day.isToday,
  };
}

/** Groups each event once per person, spanning the days it appears on. */
function collectEntries(
  days: readonly CalendarDay[]
): Map<string, TimelineWeekEntry[]> {
  const spans = new Map<
    string,
    { endIndex: number; event: CalendarEvent; startIndex: number }
  >();
  for (const [dayIndex, day] of days.entries()) {
    for (const event of day.events) {
      const span = spans.get(event.id);
      if (span) {
        span.startIndex = Math.min(span.startIndex, dayIndex);
        span.endIndex = Math.max(span.endIndex, dayIndex);
      } else {
        spans.set(event.id, {
          endIndex: dayIndex,
          event,
          startIndex: dayIndex,
        });
      }
    }
  }
  const byPerson = new Map<string, TimelineWeekEntry[]>();
  for (const { endIndex, event, startIndex } of spans.values()) {
    const entries = byPerson.get(event.personId) ?? [];
    entries.push(toEntry(event, startIndex, endIndex));
    byPerson.set(event.personId, entries);
  }
  for (const entries of byPerson.values()) {
    entries.sort(
      (first, second) =>
        first.startsAt.getTime() - second.startsAt.getTime() ||
        first.id.localeCompare(second.id)
    );
  }
  return byPerson;
}

function toEntry(
  event: CalendarEvent,
  startIndex: number,
  endIndex: number
): TimelineWeekEntry {
  const isPrivate = isPrivateToViewer(event);
  return {
    dayCount: endIndex - startIndex + 1,
    endIndex,
    endsAt: event.endsAt,
    id: event.id,
    isPrivate,
    note: isPrivate ? null : event.notesInternal,
    provenance: timelineProvenance(event.sourceType),
    recordType: isPrivate ? "private" : event.recordType,
    startIndex,
    startsAt: event.startsAt,
  };
}

/**
 * A private peer record arrives as "private"; a masked peer record keeps its
 * type but carries the "Team member" placeholder name. Both show as private.
 */
function isPrivateToViewer(event: CalendarEvent): boolean {
  return (
    event.recordType === "private" ||
    (event.privacyMode === "masked" && event.displayName === "Team member")
  );
}

function toRow(
  person: CalendarPerson,
  entries: TimelineWeekEntry[],
  actingPersonId: string | null
): TimelineWeekRow {
  return {
    entries,
    firstName: person.firstName,
    isSelf: person.id === actingPersonId,
    jobTitle: person.jobTitle,
    lastName: person.lastName,
    locationName: person.locationName,
    personId: person.id,
    teamName: person.teamName,
  };
}

/** Self first, then people by their first entry, then by name. */
function compareRows(first: TimelineWeekRow, second: TimelineWeekRow): number {
  if (first.isSelf !== second.isSelf) {
    return first.isSelf ? -1 : 1;
  }
  const firstStart = first.entries[0]?.startsAt.getTime();
  const secondStart = second.entries[0]?.startsAt.getTime();
  if (firstStart !== secondStart) {
    if (firstStart === undefined) {
      return 1;
    }
    if (secondStart === undefined) {
      return -1;
    }
    return firstStart - secondStart;
  }
  return (
    `${first.firstName} ${first.lastName}`.localeCompare(
      `${second.firstName} ${second.lastName}`
    ) || first.personId.localeCompare(second.personId)
  );
}
