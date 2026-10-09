import type { TimelineProvenance } from "@repo/availability";
import {
  dateKeyInTimeZone,
  dateKeyOfUtcDate,
  dayOfWeekOfDateKey,
} from "@repo/core";

export function formatDate(value: Date): string {
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(value);
}

export function formatDateTime(value: Date): string {
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
  }).format(value);
}

export function formatDaysUntil(daysUntil: number | null): string {
  if (daysUntil === null) {
    return "No upcoming holiday";
  }
  if (daysUntil === 0) {
    return "Today";
  }
  if (daysUntil === 1) {
    return "Tomorrow";
  }
  return `In ${daysUntil} days`;
}

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

interface DateKeyParts {
  day: number;
  month: string;
  monthShort: string;
  weekday: string;
  weekdayShort: string;
  year: number;
}

/** Display parts of a "2026-10-09" date key. Short names are three letters. */
export function dateKeyParts(dateKey: string): DateKeyParts {
  const [year = 0, month = 1, day = 1] = dateKey.split("-").map(Number);
  const monthName = MONTHS[month - 1] ?? "";
  const weekday = WEEKDAYS[dayOfWeekOfDateKey(dateKey)] ?? "";
  return {
    day,
    month: monthName,
    monthShort: monthName.slice(0, 3),
    weekday,
    weekdayShort: weekday.slice(0, 3),
    year,
  };
}

/** "Mon 5 Oct". */
export function formatShortDateKey(dateKey: string): string {
  const parts = dateKeyParts(dateKey);
  return `${parts.weekdayShort} ${parts.day} ${parts.monthShort}`;
}

/** "Monday 12 October". */
export function formatLongDateKey(dateKey: string): string {
  const parts = dateKeyParts(dateKey);
  return `${parts.weekday} ${parts.day} ${parts.month}`;
}

/** "Friday 9 October 2026" for the date of `date` in `timezone`. */
export function formatFullDate(date: Date, timezone: string): string {
  const dateKey = dateKeyInTimeZone(date, timezone);
  return `${formatLongDateKey(dateKey)} ${dateKeyParts(dateKey).year}`;
}

/** "Mon 5 Oct", "Mon 5 to Wed 7 Oct" or "Mon 28 Sep to Fri 2 Oct". */
export function formatDateKeyRange(startKey: string, endKey: string): string {
  if (endKey <= startKey) {
    return formatShortDateKey(startKey);
  }
  const start = dateKeyParts(startKey);
  const end = dateKeyParts(endKey);
  if (start.monthShort === end.monthShort && start.year === end.year) {
    return `${start.weekdayShort} ${start.day} to ${formatShortDateKey(endKey)}`;
  }
  return `${formatShortDateKey(startKey)} to ${formatShortDateKey(endKey)}`;
}

/** "1 working day", "2.5 working days". */
export function formatWorkingDays(days: number): string {
  return days === 1 ? "1 working day" : `${days} working days`;
}

/** "1 day", "2.5 days". */
export function formatDayCount(days: number): string {
  return days === 1 ? "1 day" : `${days} days`;
}

/**
 * First and last calendar dates of a record. All-day records store UTC
 * calendar dates; timed records are instants read in `timezone`. A record
 * ending at midnight ends on the previous day.
 */
export function recordDateKeys(
  record: { allDay: boolean; endsAt: Date; startsAt: Date },
  timezone: string
): { endKey: string; startKey: string } {
  const lastInstant = new Date(
    Math.max(record.startsAt.getTime(), record.endsAt.getTime() - 1)
  );
  if (record.allDay) {
    return {
      endKey: dateKeyOfUtcDate(lastInstant),
      startKey: dateKeyOfUtcDate(record.startsAt),
    };
  }
  return {
    endKey: dateKeyInTimeZone(lastInstant, timezone),
    startKey: dateKeyInTimeZone(record.startsAt, timezone),
  };
}

/** "Mon 5 to Wed 7 Oct" for a record's dates. */
export function formatRecordDates(
  record: { allDay: boolean; endsAt: Date; startsAt: Date },
  timezone: string
): string {
  const { endKey, startKey } = recordDateKeys(record, timezone);
  return formatDateKeyRange(startKey, endKey);
}

export const PROVENANCE_LABELS: Record<TimelineProvenance, string> = {
  leave_request: "Leave request",
  manual: "Manual entry",
  xero: "Synced from Xero",
};

/** Where a record came from, by its source type. */
export function provenanceForSourceType(
  sourceType: string
): TimelineProvenance {
  if (sourceType === "xero" || sourceType === "xero_leave") {
    return "xero";
  }
  return sourceType === "team_calendar_leave" ? "leave_request" : "manual";
}
