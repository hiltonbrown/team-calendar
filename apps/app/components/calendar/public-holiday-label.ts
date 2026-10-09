import type { PublicHolidayCell } from "@repo/availability";

/** Holiday name, with the start time for part-day holidays. */
export function publicHolidayLabel(
  holiday: Pick<PublicHolidayCell, "name" | "startsAt">
): string {
  return holiday.startsAt
    ? `${holiday.name} (from ${holiday.startsAt})`
    : holiday.name;
}
