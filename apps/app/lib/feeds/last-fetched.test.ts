import { describe, expect, it } from "vitest";
import { describeLastFetched } from "./last-fetched";

const now = new Date("2026-10-09T10:00:00.000Z");
const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000);

describe("describeLastFetched", () => {
  it("flags active feeds that have never been fetched", () => {
    expect(
      describeLastFetched({ lastFetchedAt: null, now, status: "active" })
    ).toEqual({ flag: "never", relative: "Never fetched" });
  });

  it("flags active feeds not fetched in 30 days", () => {
    expect(
      describeLastFetched({
        lastFetchedAt: daysAgo(31),
        now,
        status: "active",
      })
    ).toEqual({ flag: "stale", relative: "last month" });
  });

  it("does not flag a feed fetched within 30 days", () => {
    expect(
      describeLastFetched({ lastFetchedAt: daysAgo(29), now, status: "active" })
    ).toEqual({ flag: null, relative: "4 weeks ago" });
    expect(
      describeLastFetched({
        lastFetchedAt: new Date(now.getTime() - 3 * 3_600_000),
        now,
        status: "active",
      })
    ).toEqual({ flag: null, relative: "3 hours ago" });
  });

  it("never flags paused or archived feeds", () => {
    for (const status of ["paused", "archived"] as const) {
      expect(
        describeLastFetched({ lastFetchedAt: null, now, status }).flag
      ).toBeNull();
      expect(
        describeLastFetched({ lastFetchedAt: daysAgo(90), now, status }).flag
      ).toBeNull();
    }
  });
});
