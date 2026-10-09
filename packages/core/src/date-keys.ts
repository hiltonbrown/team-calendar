/** Calendar date helpers keyed by "YYYY-MM-DD" strings in a named timezone. */

/** The calendar date of `date` in `timezone`, as "2026-10-09". */
export function dateKeyInTimeZone(date: Date, timezone: string): string {
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

/** The date key of a date stored as UTC midnight (as `CalendarDay.date` is). */
export function dateKeyOfUtcDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDaysToDateKey(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return dateKeyOfUtcDate(date);
}

/** Every date key from `from` to `to`, inclusive. */
export function dateKeysBetween(from: string, to: string): string[] {
  const keys: string[] = [];
  for (let key = from; key <= to; key = addDaysToDateKey(key, 1)) {
    keys.push(key);
  }
  return keys;
}

/** 0 for Sunday to 6 for Saturday. */
export function dayOfWeekOfDateKey(dateKey: string): number {
  return new Date(`${dateKey}T00:00:00.000Z`).getUTCDay();
}

/** UTC instant of local midnight on `dateKey` in `timezone`. */
export function zonedStartOfDay(dateKey: string, timezone: string): Date {
  const target = Date.parse(`${dateKey}T00:00:00.000Z`);
  let guess = target;
  // Two passes settle the offset, including across daylight saving changes.
  for (let pass = 0; pass < 2; pass += 1) {
    guess += target - localWallClockAsUtc(new Date(guess), timezone);
  }
  return new Date(guess);
}

function localWallClockAsUtc(date: Date, timezone: string): number {
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
  return Date.UTC(
    value("year"),
    value("month") - 1,
    value("day"),
    value("hour") % 24,
    value("minute"),
    value("second")
  );
}
