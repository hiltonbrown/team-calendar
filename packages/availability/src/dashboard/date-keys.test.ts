import { describe, expect, it } from "vitest";
import {
  addDaysToDateKey,
  dateKeyInTimeZone,
  dateKeyOfUtcDate,
  dayOfWeekOfDateKey,
  zonedStartOfDay,
} from "./date-keys";

describe("date keys", () => {
  it("reads the calendar date in the given timezone", () => {
    const instant = new Date("2026-10-09T15:00:00.000Z");
    expect(dateKeyInTimeZone(instant, "Australia/Brisbane")).toBe("2026-10-10");
    expect(dateKeyInTimeZone(instant, "UTC")).toBe("2026-10-09");
  });

  it("reads UTC midnight dates and adds days across months", () => {
    expect(dateKeyOfUtcDate(new Date("2026-10-09T00:00:00.000Z"))).toBe(
      "2026-10-09"
    );
    expect(addDaysToDateKey("2026-09-28", 7)).toBe("2026-10-05");
    expect(addDaysToDateKey("2026-10-05", -7)).toBe("2026-09-28");
  });

  it("reports the day of the week", () => {
    expect(dayOfWeekOfDateKey("2026-10-09")).toBe(5);
    expect(dayOfWeekOfDateKey("2026-10-11")).toBe(0);
  });

  it("finds local midnight, including across daylight saving", () => {
    expect(
      zonedStartOfDay("2026-10-09", "Australia/Brisbane").toISOString()
    ).toBe("2026-10-08T14:00:00.000Z");
    // Sydney moves to daylight time on Sunday 4 October 2026.
    expect(
      zonedStartOfDay("2026-10-03", "Australia/Sydney").toISOString()
    ).toBe("2026-10-02T14:00:00.000Z");
    expect(
      zonedStartOfDay("2026-10-05", "Australia/Sydney").toISOString()
    ).toBe("2026-10-04T13:00:00.000Z");
  });
});
