import { describe, expect, it } from "vitest";
import { publicHolidayLabel } from "./public-holiday-label";

describe("publicHolidayLabel", () => {
  it("shows the start time for part-day holidays", () => {
    expect(
      publicHolidayLabel({ name: "Christmas Eve", startsAt: "18:00" })
    ).toBe("Christmas Eve (from 18:00)");
  });

  it("shows the name alone for full-day holidays", () => {
    expect(publicHolidayLabel({ name: "Christmas Day", startsAt: null })).toBe(
      "Christmas Day"
    );
  });
});
