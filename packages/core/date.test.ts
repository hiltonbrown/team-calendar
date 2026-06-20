import { describe, expect, it } from "vitest";
import {
  endOfUtcDay,
  formatDateRangeLabel,
  startOfUtcDay,
  toDateOnly,
} from "./index";

describe("date helpers", () => {
  it("formats dates using the UTC calendar day", () => {
    expect(toDateOnly(new Date("2026-05-07T23:59:59.999Z"))).toBe("2026-05-07");
    expect(toDateOnly(new Date("2026-05-08T00:00:00.000Z"))).toBe("2026-05-08");
  });

  it("builds inclusive UTC day boundaries for date-only values", () => {
    const start = startOfUtcDay("2026-05-07");
    const end = endOfUtcDay("2026-05-07");

    expect(start.toISOString()).toBe("2026-05-07T00:00:00.000Z");
    expect(end.toISOString()).toBe("2026-05-07T23:59:59.999Z");
    expect(toDateOnly(start)).toBe("2026-05-07");
    expect(toDateOnly(end)).toBe("2026-05-07");
    expect(toDateOnly(startOfUtcDay("2026-05-08"))).toBe("2026-05-08");
  });

  it("formats Australian date range labels", () => {
    expect(
      formatDateRangeLabel(
        new Date("2026-05-07T12:00:00.000Z"),
        new Date("2026-05-07T12:00:00.000Z")
      )
    ).toBe("7 May 2026");
    expect(
      formatDateRangeLabel(
        new Date("2026-05-07T12:00:00.000Z"),
        new Date("2026-05-08T12:00:00.000Z")
      )
    ).toBe("7 May 2026 to 8 May 2026");
  });
});
