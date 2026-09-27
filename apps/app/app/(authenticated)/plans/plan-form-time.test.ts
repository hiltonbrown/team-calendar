import { describe, expect, it } from "vitest";
import {
  buildFormDate,
  PlanRecordFormSchema,
  UpdatePlanRecordFormSchema,
} from "./_schemas";
import { formatPlanDateTime, wallClockToInstant } from "./plan-form-time";

describe("plan form time", () => {
  it.each([
    ["Australia/Brisbane", "2026-04-15", "09:00", "2026-04-14T23:00:00.000Z"],
    ["America/New_York", "2026-04-15", "09:00", "2026-04-15T13:00:00.000Z"],
    ["Australia/Sydney", "2026-10-04", "03:30", "2026-10-03T16:30:00.000Z"],
    ["Australia/Sydney", "2026-04-05", "02:30", "2026-04-04T15:30:00.000Z"],
    ["Asia/Kathmandu", "2026-04-15", "09:00", "2026-04-15T03:15:00.000Z"],
  ])("round-trips wall clocks in %s", (timezone, date, time, instant) => {
    const result = wallClockToInstant(date, time, timezone);
    expect(result.toISOString()).toBe(instant);
    expect(formatPlanDateTime(result, timezone)).toEqual({ date, time });
  });
  it("rejects a daylight-saving gap", () => {
    expect(
      Number.isNaN(
        wallClockToInstant("2026-10-04", "02:30", "Australia/Sydney").getTime()
      )
    ).toBe(true);
  });
  it("keeps all-day dates independent of organisation timezone", () => {
    expect(
      buildFormDate(
        "2026-04-15",
        "",
        true,
        false,
        "America/New_York"
      ).toISOString()
    ).toBe("2026-04-15T00:00:00.000Z");
    expect(
      buildFormDate(
        "2026-04-15",
        "",
        true,
        true,
        "Australia/Brisbane"
      ).toISOString()
    ).toBe("2026-04-15T23:59:59.999Z");
  });
  it("validates cross-fold form fields without inferring instant ordering in UTC", () => {
    const start = formatPlanDateTime(
      new Date("2026-04-04T15:50:00Z"),
      "Australia/Sydney"
    );
    const end = formatPlanDateTime(
      new Date("2026-04-04T16:10:00Z"),
      "Australia/Sydney"
    );
    expect(start).toEqual({ date: "2026-04-05", time: "02:50" });
    expect(end).toEqual({ date: "2026-04-05", time: "02:10" });
    const input = {
      allDay: false,
      endsAt: end.date,
      endTime: end.time,
      organisationId: "00000000-0000-4000-8000-000000000001",
      personId: "00000000-0000-4000-8000-000000000002",
      recordType: "wfh",
      startsAt: start.date,
      startTime: start.time,
    };
    expect(PlanRecordFormSchema.safeParse(input).success).toBe(true);
    expect(
      UpdatePlanRecordFormSchema.safeParse({
        ...input,
        recordId: "00000000-0000-4000-8000-000000000099",
      }).success
    ).toBe(true);
  });
  it("rejects invalid dates and time values before conversion", () => {
    const input = {
      allDay: false,
      endsAt: "2026-03-01",
      endTime: "09:00",
      organisationId: "00000000-0000-4000-8000-000000000001",
      personId: "00000000-0000-4000-8000-000000000002",
      recordType: "wfh",
      startsAt: "2026-02-30",
      startTime: "25:00",
    };
    expect(PlanRecordFormSchema.safeParse(input).success).toBe(false);
  });
});
