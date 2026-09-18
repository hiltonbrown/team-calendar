import { describe, expect, it } from "vitest";
import { hourInTimeZone } from "./calendar-local-time";

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
