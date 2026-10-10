import { afterEach, describe, expect, it, vi } from "vitest";
import { createXeroDeadline } from "./deadline";
import { MemorySharedXeroRateStore } from "./memory-store";
import {
  getSharedXeroRateStore,
  parseRateCooldown,
  RedisSharedXeroRateStore,
  type SharedRateLimits,
  type XeroRateClass,
  xeroRateKeys,
} from "./shared-store";

const limits: SharedRateLimits = {
  appCallsPerMinute: 10,
  callsPerDayPerOrg: 3,
  callsPerMinutePerOrg: 2,
  concurrentRequestsPerOrg: 2,
};
const tenant: XeroRateClass = {
  kind: "tenant",
  providerAppId: "app",
  xeroTenantId: "tenant",
};
function reservation(rateClass: XeroRateClass = tenant) {
  return { leaseMs: 1000, rateClass, reservationId: crypto.randomUUID() };
}
describe("shared Xero rate budgets", () => {
  it.each(["token", "user_inventory"] as const)(
    "%s has no invented tenant minute quota",
    async (kind) => {
      const store = new MemorySharedXeroRateStore({
        limits: { ...limits, appCallsPerMinute: 100 },
      });
      const rateClass = { kind, providerAppId: "app" };
      await store.observe({
        headers: new Headers({ "X-MinLimit-Remaining": "0" }),
        rateClass,
      });
      for (let index = 0; index < 61; index += 1) {
        expect((await store.reserve(reservation(rateClass))).ok).toBe(true);
      }
    }
  );

  it("uses external tenant identity and prevents hash-tag injection", () => {
    expect(xeroRateKeys(tenant, "dev")).toEqual(
      xeroRateKeys({ ...tenant }, "dev")
    );
    expect(
      xeroRateKeys(
        { kind: "tenant", providerAppId: "app", xeroTenantId: "other" },
        "dev"
      )
    ).not.toEqual(xeroRateKeys(tenant, "dev"));
    expect(
      xeroRateKeys({ kind: "token", providerAppId: "a}b{" }, "dev").every(
        (key) => key.startsWith("xero:{a%7Db%7B}:dev:")
      )
    ).toBe(true);
  });
  it("does not consume an app reservation when concurrency denies a tenant", async () => {
    const store = new MemorySharedXeroRateStore({
      limits: { ...limits, appCallsPerMinute: 2, concurrentRequestsPerOrg: 1 },
    });
    expect((await store.reserve(reservation())).ok).toBe(true);
    expect(await store.reserve(reservation())).toMatchObject({
      error: { reason: "concurrency" },
      ok: false,
    });
    expect(
      (
        await store.reserve(
          reservation({ kind: "token", providerAppId: "app" })
        )
      ).ok
    ).toBe(true);
  });
  it("enforces a strict rolling minute across a clock boundary", async () => {
    let now = 59_999;
    const store = new MemorySharedXeroRateStore({ limits, now: () => now });
    const first = reservation();
    const second = reservation();
    await store.reserve(first);
    await store.release(first);
    await store.reserve(second);
    await store.release(second);
    now = 60_001;
    expect(await store.reserve(reservation())).toMatchObject({
      error: { reason: "minute" },
      ok: false,
    });
    now = 119_999;
    expect((await store.reserve(reservation())).ok).toBe(true);
  });
  it("replays a reservation without spending again, and releases idempotently", async () => {
    const store = new MemorySharedXeroRateStore({ limits });
    const input = reservation();
    await store.reserve(input);
    await store.reserve(input);
    await store.release(input);
    await store.release(input);
    expect((await store.reserve(reservation())).ok).toBe(true);
    expect(await store.reserve(reservation())).toMatchObject({
      error: { reason: "minute" },
      ok: false,
    });
  });
  it("expires crashed concurrency leases without restoring consumed windows", async () => {
    let now = 0;
    const store = new MemorySharedXeroRateStore({
      limits: { ...limits, concurrentRequestsPerOrg: 1 },
      now: () => now,
    });
    await store.reserve(reservation());
    expect(await store.reserve(reservation())).toMatchObject({
      error: { reason: "concurrency" },
      ok: false,
    });
    now = 1000;
    expect((await store.reserve(reservation())).ok).toBe(true);
  });
  it("only lowers header ceilings and ignores malformed headers", async () => {
    const store = new MemorySharedXeroRateStore({ limits });
    await store.observe({
      headers: new Headers({ "X-MinLimit-Remaining": "0" }),
      rateClass: tenant,
    });
    await store.observe({
      headers: new Headers({
        "Retry-After": "garbage",
        "X-DayLimit-Remaining": "NaN",
        "X-MinLimit-Remaining": "2",
      }),
      rateClass: tenant,
    });
    expect(await store.reserve(reservation())).toMatchObject({
      error: { reason: "minute" },
      ok: false,
    });
  });
  it("keeps token acquisition independent of a spent tenant daily budget", async () => {
    const store = new MemorySharedXeroRateStore({ limits });
    await store.observe({
      headers: new Headers({ "X-DayLimit-Remaining": "0" }),
      rateClass: tenant,
    });
    expect(await store.reserve(reservation())).toMatchObject({
      error: { reason: "daily" },
      ok: false,
    });
    expect(
      (
        await store.reserve(
          reservation({ kind: "token", providerAppId: "app" })
        )
      ).ok
    ).toBe(true);
  });
  it("never shortens a provider cooldown", async () => {
    let now = 0;
    const store = new MemorySharedXeroRateStore({ limits, now: () => now });
    await store.observe({
      headers: new Headers({ "Retry-After": "10" }),
      rateClass: tenant,
    });
    await store.observe({
      headers: new Headers({ "Retry-After": "1" }),
      rateClass: tenant,
    });
    now = 2000;
    expect(await store.reserve(reservation())).toMatchObject({
      error: { reason: "cooldown" },
      ok: false,
    });
    expect(parseRateCooldown("invalid", now)).toBeUndefined();
  });
  it("bounds reserve, observation and release even when fetch ignores abort", async () => {
    const fetchImpl = vi.fn<typeof fetch>(
      () =>
        new Promise(() => {
          /* Simulate a transport which never resolves or honours abort. */
        })
    );
    const store = new RedisSharedXeroRateStore({
      fetchImpl,
      limits,
      namespace: "owned",
      token: "test",
      url: "https://invalid.example",
    });
    const input = reservation();
    // Long enough that a slow runner still reaches fetch before expiry.
    const budgetMs = 100;
    expect(
      await store.reserve({ ...input, deadline: createXeroDeadline(budgetMs) })
    ).toMatchObject({ error: { reason: "infrastructure" }, ok: false });
    await store.observe({
      deadline: createXeroDeadline(budgetMs),
      headers: new Headers(),
      rateClass: tenant,
    });
    await store.release({ ...input, deadline: createXeroDeadline(budgetMs) });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    await store.release({ ...input, deadline: createXeroDeadline(0) });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
  it("fails closed on malformed Redis replies without fallback", async () => {
    const store = new RedisSharedXeroRateStore({
      fetchImpl: async () => Response.json({ result: ["admitted", "extra"] }),
      limits,
      namespace: "owned",
      token: "test",
      url: "https://invalid.example",
    });
    expect(await store.reserve(reservation())).toMatchObject({
      error: { reason: "infrastructure" },
      ok: false,
    });
  });
});

describe("production shared-store selection", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
  for (const missing of [
    "XERO_APP_TIER",
    "XERO_CLIENT_ID",
    "KV_REST_API_URL",
    "KV_REST_API_TOKEN",
  ]) {
    it(`fails closed without ${missing}`, async () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("XERO_APP_TIER", "starter");
      vi.stubEnv("XERO_CLIENT_ID", "app");
      vi.stubEnv("KV_REST_API_URL", "https://invalid.example");
      vi.stubEnv("KV_REST_API_TOKEN", "test-token");
      vi.stubEnv(missing, undefined);
      expect(
        await getSharedXeroRateStore().reserve(reservation())
      ).toMatchObject({ error: { reason: "infrastructure" }, ok: false });
    });
  }
  it("uses the shared store in production without bootstrap configuration", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("XERO_APP_TIER", "starter");
    vi.stubEnv("XERO_CLIENT_ID", "app");
    vi.stubEnv("KV_REST_API_URL", "https://invalid.example");
    vi.stubEnv("KV_REST_API_TOKEN", "test-token");
    vi.stubGlobal("fetch", async () => Response.json({ result: ["admitted"] }));
    expect((await getSharedXeroRateStore().reserve(reservation())).ok).toBe(
      true
    );
  });
  it("keeps configured KV outage closed rather than selecting memory", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("XERO_APP_TIER", "starter");
    vi.stubEnv("XERO_CLIENT_ID", "app");
    vi.stubEnv("KV_REST_API_URL", "https://invalid.example");
    vi.stubEnv("KV_REST_API_TOKEN", "test-token");
    const unavailable = vi.fn(() =>
      Promise.reject(new Error("Synthetic unavailable"))
    );
    vi.stubGlobal("fetch", unavailable);
    expect(await getSharedXeroRateStore().reserve(reservation())).toMatchObject(
      { error: { reason: "infrastructure" }, ok: false }
    );
    expect(unavailable).toHaveBeenCalledTimes(1);
  });
});
