import { describe, expect, it } from "vitest";
import { MemorySharedXeroRateStore } from "./memory-store";

const limits = {
  appCallsPerMinute: 1,
  callsPerDayPerOrg: 1,
  callsPerMinutePerOrg: 1,
  concurrentRequestsPerOrg: 1,
};
describe("ordinary memory quota store", () => {
  it("shares the spent allowance with idempotent reservation replay", async () => {
    const store = new MemorySharedXeroRateStore({ limits });
    const input = {
      leaseMs: 1000,
      rateClass: {
        kind: "tenant" as const,
        providerAppId: "app",
        xeroTenantId: "tenant",
      },
      reservationId: "first",
    };
    expect((await store.reserve(input)).ok).toBe(true);
    expect((await store.reserve(input)).ok).toBe(true);
    expect(
      await store.reserve({ ...input, reservationId: "second" })
    ).toMatchObject({ error: { reason: "daily" }, ok: false });
  });
});
