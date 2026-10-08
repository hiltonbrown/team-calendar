import { describe, expect, it } from "vitest";
import { getXeroCorrelationId } from "./response-diagnostics";

describe("safe Xero correlation diagnostics", () => {
  it.each([
    [{ "xero-correlation-id": "provider-1" }, "provider-1"],
    [{ "x-correlation-id": "alternate_1" }, "alternate_1"],
    [
      { "x-correlation-id": "alternate", "xero-correlation-id": "provider-1" },
      "provider-1",
    ],
    [
      { "x-correlation-id": "alternate", "xero-correlation-id": "<unsafe>" },
      "alternate",
    ],
    [{ "xero-correlation-id": "payroll details" }, undefined],
    [{ "xero-correlation-id": "x".repeat(129) }, undefined],
    [{ "xero-correlation-id": "" }, undefined],
    [{}, undefined],
  ])("extracts only a bounded safe identifier from %j", (headers, expected) => {
    expect(getXeroCorrelationId(new Headers(headers))).toBe(expected);
  });
});
