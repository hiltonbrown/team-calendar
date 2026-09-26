import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ list: vi.fn(), record: vi.fn() }));
vi.mock("@repo/database/queries/xero-inactivity-signals", () => ({
  listXeroInactivitySignals: mocks.list,
  recordXeroInactivityClassification: mocks.record,
}));

import { buildXeroInactivityReport } from "./inactivity-report";

const input = {
  clerkOrgId: "org",
  now: new Date("2026-09-26"),
  organisationId: "entity",
};
describe("manually scoped inactivity report", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.record.mockResolvedValue({});
  });
  it("stores only versioned classification with both scope IDs", async () => {
    mocks.list.mockResolvedValue([
      {
        ...input,
        bindingReserved: true,
        feedLastUsedAt: null,
        lastHumanActivityAt: null,
        onboardingComplete: "unknown",
        organisationArchived: false,
        subscriptionActive: false,
        syncPaused: false,
        xeroTenantId: "tenant",
      },
    ]);
    expect(await buildXeroInactivityReport(input)).toEqual({
      ok: true,
      value: { active: 0, candidate: 1, unknown: 0 },
    });
    expect(mocks.list).toHaveBeenCalledWith(input);
    expect(mocks.record).toHaveBeenCalledWith({
      ...input,
      kind: "candidate",
      policyVersion: 1,
      reason: expect.any(String),
      xeroTenantId: "tenant",
    });
  });
  it("empty reserved scope writes nothing", async () => {
    mocks.list.mockResolvedValue([]);
    expect(await buildXeroInactivityReport(input)).toMatchObject({ ok: true });
    expect(mocks.record).not.toHaveBeenCalled();
  });
  it("returns a safe failure without exposing query errors", async () => {
    mocks.list.mockRejectedValue(new Error("secret"));
    expect(await buildXeroInactivityReport(input)).toEqual({
      error: {
        code: "inactivity_report_failed",
        message: "Xero inactivity report could not be recorded.",
      },
      ok: false,
    });
  });
});
