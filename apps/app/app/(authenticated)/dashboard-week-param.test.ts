import { describe, expect, it } from "vitest";
import { parseDashboardWeekParam } from "./dashboard-week-param";

describe("parseDashboardWeekParam", () => {
  it("accepts a calendar date", () => {
    expect(parseDashboardWeekParam("2026-10-12")).toBe("2026-10-12");
  });

  it.each([
    [undefined],
    [""],
    ["2026-10-1"],
    ["12-10-2026"],
    ["2026-02-30"],
    ["2026-13-01"],
    [["2026-10-12", "2026-10-19"]],
  ])("ignores %s", (value) => {
    expect(parseDashboardWeekParam(value)).toBeUndefined();
  });
});
