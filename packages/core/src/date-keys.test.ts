import { describe, expect, it } from "vitest";
import {
  addDaysToDateKey,
  dateKeyInTimeZone,
  dateKeyOfUtcDate,
  dateKeysBetween,
  dayOfWeekOfDateKey,
  recordFallsOnDay,
  recordQueryWindow,
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

  it("lists every date key in an inclusive range, across months", () => {
    expect(dateKeysBetween("2026-09-29", "2026-10-02")).toEqual([
      "2026-09-29",
      "2026-09-30",
      "2026-10-01",
      "2026-10-02",
    ]);
    expect(dateKeysBetween("2026-10-02", "2026-10-01")).toEqual([]);
  });

  describe("recordFallsOnDay", () => {
    const brisbaneDay = (dateKey: string) => ({
      dateKey,
      end: zonedStartOfDay(addDaysToDateKey(dateKey, 1), "Australia/Brisbane"),
      start: zonedStartOfDay(dateKey, "Australia/Brisbane"),
    });
    const record = (allDay: boolean, startsAt: string, endsAt: string) => ({
      allDay,
      endsAt: new Date(endsAt),
      startsAt: new Date(startsAt),
    });

    it("matches a form-entered all-day record on its stored date only", () => {
      const leave = record(
        true,
        "2026-05-04T00:00:00.000Z",
        "2026-05-04T23:59:59.999Z"
      );
      expect(recordFallsOnDay(leave, brisbaneDay("2026-05-03"))).toBe(false);
      expect(recordFallsOnDay(leave, brisbaneDay("2026-05-04"))).toBe(true);
      expect(recordFallsOnDay(leave, brisbaneDay("2026-05-05"))).toBe(false);
    });

    it("matches a Xero midnight-to-midnight all-day record on its date", () => {
      const leave = record(
        true,
        "2026-05-04T00:00:00.000Z",
        "2026-05-04T00:00:00.000Z"
      );
      expect(recordFallsOnDay(leave, brisbaneDay("2026-05-04"))).toBe(true);
      expect(recordFallsOnDay(leave, brisbaneDay("2026-05-05"))).toBe(false);
    });

    it("matches timed records by overlap with local day boundaries", () => {
      // 09:00 to 11:00 on 5 May in Brisbane.
      const meeting = record(
        false,
        "2026-05-04T23:00:00.000Z",
        "2026-05-05T01:00:00.000Z"
      );
      expect(recordFallsOnDay(meeting, brisbaneDay("2026-05-04"))).toBe(false);
      expect(recordFallsOnDay(meeting, brisbaneDay("2026-05-05"))).toBe(true);
    });
  });

  it("widens the query window to cover all-day UTC dates", () => {
    expect(
      recordQueryWindow("2026-05-04", "2026-05-10", "Australia/Brisbane")
    ).toEqual({
      end: new Date("2026-05-11T00:00:00.000Z"),
      start: new Date("2026-05-03T14:00:00.000Z"),
    });
    expect(recordQueryWindow("2026-01-05", "2026-01-11", "UTC")).toEqual({
      end: new Date("2026-01-12T00:00:00.000Z"),
      start: new Date("2026-01-05T00:00:00.000Z"),
    });
  });
});
