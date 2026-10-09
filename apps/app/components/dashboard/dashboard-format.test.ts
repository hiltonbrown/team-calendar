import { describe, expect, it } from "vitest";
import {
  formatDateKeyRange,
  formatFullDate,
  formatLongDateKey,
  formatRecordDates,
  formatShortDateKey,
  provenanceForSourceType,
} from "./dashboard-format";

describe("dashboard date formatting", () => {
  it("formats date keys", () => {
    expect(formatShortDateKey("2026-09-28")).toBe("Mon 28 Sep");
    expect(formatLongDateKey("2026-10-12")).toBe("Monday 12 October");
    expect(
      formatFullDate(new Date("2026-10-08T15:00:00.000Z"), "Australia/Brisbane")
    ).toBe("Friday 9 October 2026");
  });

  it.each([
    ["2026-10-05", "2026-10-05", "Mon 5 Oct"],
    ["2026-10-05", "2026-10-07", "Mon 5 to Wed 7 Oct"],
    ["2026-09-28", "2026-10-02", "Mon 28 Sep to Fri 2 Oct"],
  ])("formats %s to %s as %s", (start, end, label) => {
    expect(formatDateKeyRange(start, end)).toBe(label);
  });

  it("reads all-day records in UTC and timed records in the timezone", () => {
    expect(
      formatRecordDates(
        {
          allDay: true,
          endsAt: new Date("2026-10-06T23:59:59.999Z"),
          startsAt: new Date("2026-10-06T00:00:00.000Z"),
        },
        "Australia/Brisbane"
      )
    ).toBe("Tue 6 Oct");
    expect(
      formatRecordDates(
        {
          allDay: false,
          endsAt: new Date("2026-10-06T07:00:00.000Z"),
          startsAt: new Date("2026-10-05T23:00:00.000Z"),
        },
        "Australia/Brisbane"
      )
    ).toBe("Tue 6 Oct");
  });

  it.each([
    ["xero", "xero"],
    ["xero_leave", "xero"],
    ["team_calendar_leave", "leave_request"],
    ["manual", "manual"],
  ])("maps %s to %s provenance", (sourceType, provenance) => {
    expect(provenanceForSourceType(sourceType)).toBe(provenance);
  });
});
