import { describe, expect, it } from "vitest";
import { MemorySharedXeroRateStore } from "./memory-store";

const limits = {
  appCallsPerMinute: 1,
  callsPerDayPerOrg: 1,
  callsPerMinutePerOrg: 1,
  concurrentRequestsPerOrg: 1,
};
describe("explicit memory credential-domain fence", () => {
  it("rejects replay before budgets and keeps the original spent allowance", async () => {
    const options = {
      expectedCredentialDomainId: "expected",
      limits,
      observedCredentialDomainId: "expected",
    };
    const store = new MemorySharedXeroRateStore(options);
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
    options.observedCredentialDomainId = "foreign";
    expect(await store.reserve(input)).toMatchObject({
      error: { reason: "credential_domain_mismatch" },
      ok: false,
    });
    options.observedCredentialDomainId = "expected";
    expect((await store.reserve(input)).ok).toBe(true);
    expect(
      await store.reserve({ ...input, reservationId: "second" })
    ).toMatchObject({ error: { reason: "daily" }, ok: false });
  });
  it("preserves ordinary test behaviour when no domain was configured", async () => {
    const store = new MemorySharedXeroRateStore({ limits });
    expect(
      (
        await store.reserve({
          leaseMs: 1000,
          rateClass: { kind: "token", providerAppId: "app" },
          reservationId: "first",
        })
      ).ok
    ).toBe(true);
  });
});
