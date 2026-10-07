import { beforeEach, describe, expect, it, vi } from "vitest";

const info = vi.hoisted(() => vi.fn());
vi.mock("@repo/observability/log", () => ({ log: { info } }));

import { emitXeroMetric } from "./metrics";

describe("closed lifecycle metric labels", () => {
  beforeEach(() => {
    info.mockReset();
  });
  it("projects only allowlisted runtime labels and keys", () => {
    const extra = {
      class: "tenant" as const,
      outcome: "failed" as const,
      payload: { token: "secret" },
      reason: "daily" as const,
      tenantId: "secret",
    };
    emitXeroMetric("xero.admission.denied", 1, extra);
    expect(info).toHaveBeenCalledWith("Xero lifecycle metric", {
      class: "tenant",
      metric: "xero.admission.denied",
      reason: "daily",
      value: 1,
    });
  });
  it("ignores retired cleanup measurements", () => {
    // @ts-expect-error Retired metrics are not part of the current API.
    emitXeroMetric("xero.cleanup.unknown_oldest_age_hours", 1);
    expect(info).not.toHaveBeenCalled();
  });
  it("rejects UUID labels statically and drops them at runtime", () => {
    emitXeroMetric("xero.admission.denied", 1, {
      // @ts-expect-error A UUID is not a closed reason label.
      reason: "11111111-1111-4111-8111-111111111111",
    });
    expect(info).toHaveBeenCalledWith("Xero lifecycle metric", {
      metric: "xero.admission.denied",
      value: 1,
    });
  });
  it("does not emit invalid measurements or change outcomes when logging throws", () => {
    for (const value of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      emitXeroMetric("xero.store.unavailable", value);
    }
    expect(info).not.toHaveBeenCalled();
    info.mockImplementation(() => {
      throw new Error("transport");
    });
    expect(() => emitXeroMetric("xero.store.unavailable", 1)).not.toThrow();
  });
});

describe("every current recovery reason is an allowed closed label", () => {
  it.each([
    "update_permissions",
    "reauthorise",
    "access_denied",
    "operational_incident",
    "retry_later",
    "outcome_unknown",
    "not_connected",
  ] as const)("records %s", (reason) => {
    emitXeroMetric("xero.binding.permission_required", 1, { reason });
    expect(info).toHaveBeenLastCalledWith("Xero lifecycle metric", {
      metric: "xero.binding.permission_required",
      reason,
      value: 1,
    });
  });
});
