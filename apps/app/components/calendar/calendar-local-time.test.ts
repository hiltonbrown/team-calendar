import { describe, expect, it } from "vitest";
import {
  formatCalendarEventDateRange,
  hourInTimeZone,
} from "./calendar-local-time";

describe("hourInTimeZone", () => {
  it("resolves Brisbane wall-clock time across a UTC date boundary", () => {
    expect(
      hourInTimeZone(new Date("2026-04-14T23:30:00.000Z"), "Australia/Brisbane")
    ).toBe(9);
  });

  it("supports a non-UTC western timezone", () => {
    expect(
      hourInTimeZone(new Date("2026-04-15T13:30:00.000Z"), "America/New_York")
    ).toBe(9);
  });
});

describe("formatCalendarEventDateRange", () => {
  it("uses the organisation timezone and includes overnight end dates", () => {
    expect(
      formatCalendarEventDateRange(
        {
          allDay: false,
          endsAt: new Date("2026-04-15T16:00:00Z"),
          startsAt: new Date("2026-04-15T13:00:00Z"),
        },
        "Australia/Brisbane"
      )
    ).toBe("15 April 2026, 23:00 to 16 April 2026, 02:00");
  });
  it("preserves date-only all-day semantics in a western timezone", () => {
    expect(
      formatCalendarEventDateRange(
        {
          allDay: true,
          endsAt: new Date("2026-04-15T23:59:59Z"),
          startsAt: new Date("2026-04-15T00:00:00Z"),
        },
        "America/New_York"
      )
    ).toBe("15 April 2026");
  });
});
