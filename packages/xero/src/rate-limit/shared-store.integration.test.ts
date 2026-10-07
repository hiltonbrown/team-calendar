// biome-ignore-all lint/style/useFilenamingConvention: Co-located integration test convention.
import { randomUUID } from "node:crypto";
import {
  countSharedStoreFixtureKeys,
  deleteSharedStoreFixtureKeys,
  sharedStoreFixtureEpoch,
} from "@repo/database/live-shared-store-fixture";
import { allocateLiveTestFixture } from "@repo/database/live-test-fixture";
import { assertTestDatabaseConnectionAllowed } from "@repo/database/live-test-guard";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  RedisSharedXeroRateStore,
  type SharedRateLimits,
  type XeroRateClass,
  xeroRateKeys,
} from "./shared-store";

vi.mock("server-only", () => ({}));
describe("guarded shared-store integration", () => {
  const fixture = allocateLiveTestFixture(
    "packages/xero/src/rate-limit/shared-store.integration.test.ts"
  );
  const epoch = sharedStoreFixtureEpoch(
    fixture.globalKey("shared_store_namespace")
  );
  const limits: SharedRateLimits = {
    appCallsPerMinute: 50,
    callsPerDayPerOrg: 10,
    callsPerMinutePerOrg: 10,
    concurrentRequestsPerOrg: 5,
  };
  let url: string;
  let token: string;
  let appSequence = 0;
  let authorised = false;
  function tenant(
    providerAppId: string,
    xeroTenantId = "tenant"
  ): XeroRateClass {
    return { kind: "tenant", providerAppId, xeroTenantId };
  }
  function store(config = limits) {
    return new RedisSharedXeroRateStore({
      limits: config,
      namespace: epoch,
      token,
      url,
    });
  }
  function application(config = limits) {
    const appId = `fixture-${epoch}-${appSequence}`;
    appSequence += 1;
    const first = store(config);
    return { appId, first, second: store(config) };
  }
  const reserve = (
    instance: RedisSharedXeroRateStore,
    rateClass: XeroRateClass,
    leaseMs = 10_000
  ) =>
    instance.reserve({
      deadline: { expiresAtMs: Date.now() + 5000 },
      leaseMs,
      rateClass,
      reservationId: randomUUID(),
    });
  beforeAll(() => {
    const { TC_TEST_KV_REST_API_URL, TC_TEST_KV_REST_API_TOKEN } = process.env;
    url = TC_TEST_KV_REST_API_URL ?? "";
    token = TC_TEST_KV_REST_API_TOKEN ?? "";
    if (!(url && token)) {
      throw new Error(
        "TC_TEST_KV_REST_API_URL and TC_TEST_KV_REST_API_TOKEN are required"
      );
    }
    const { hostname } = new URL(url);
    if (hostname !== "localhost" && hostname !== "127.0.0.1") {
      if (
        process.env.ALLOW_LIVE_DATABASE_TESTS !== "I_ACKNOWLEDGE_LIVE_MUTATION"
      ) {
        throw new Error("Remote shared store requires protected live manifest");
      }
      assertTestDatabaseConnectionAllowed();
    }
    authorised = true;
  });
  afterAll(async () => {
    if (!authorised) {
      return;
    }
    const ownedStore = {
      globalKeys: [
        `shared_store_namespace:${fixture.globalKey("shared_store_namespace")}`,
      ],
      token,
      url,
    };
    await deleteSharedStoreFixtureKeys(ownedStore);
    expect(await countSharedStoreFixtureKeys(ownedStore)).toBe(0);
  });
  describe("owned Redis REST atomic admission", () => {
    it("allocates only owned quota keys and isolates application budgets", async () => {
      const config = { ...limits, callsPerMinutePerOrg: 1 };
      const firstApp = application(config);
      const secondApp = application(config);
      const rateClass = tenant(firstApp.appId);
      expect(
        xeroRateKeys(rateClass, epoch).every((key) =>
          key.startsWith(
            `xero:{${encodeURIComponent(firstApp.appId)}}:${epoch}:`
          )
        )
      ).toBe(true);
      expect((await reserve(firstApp.first, rateClass)).ok).toBe(true);
      expect(await reserve(firstApp.second, rateClass)).toMatchObject({
        error: { reason: "minute" },
        ok: false,
      });
      expect((await reserve(secondApp.first, tenant(secondApp.appId))).ok).toBe(
        true
      );
      expect(
        await countSharedStoreFixtureKeys({
          globalKeys: [
            `shared_store_namespace:${fixture.globalKey("shared_store_namespace")}`,
          ],
          token,
          url,
        })
      ).toBeGreaterThan(0);
    });

    it("shares minute exhaustion between two instances without consuming denied app budget", async () => {
      const { appId, first, second } = application({
        ...limits,
        appCallsPerMinute: 3,
        callsPerMinutePerOrg: 2,
      });
      expect((await reserve(first, tenant(appId))).ok).toBe(true);
      expect((await reserve(second, tenant(appId))).ok).toBe(true);
      expect(await reserve(first, tenant(appId))).toMatchObject({
        error: { reason: "minute" },
        ok: false,
      });
      expect((await reserve(second, tenant(appId, "other"))).ok).toBe(true);
    });
    it("shares daily exhaustion across instances and simulated restart", async () => {
      const config = { ...limits, callsPerDayPerOrg: 2 };
      const { appId, first, second } = application(config);
      await reserve(first, tenant(appId));
      await reserve(second, tenant(appId));
      expect(await reserve(store(config), tenant(appId))).toMatchObject({
        error: { reason: "daily" },
        ok: false,
      });
      expect(
        (await reserve(second, { kind: "token", providerAppId: appId })).ok
      ).toBe(true);
    });
    it("aggregates app-wide minute windows across external tenants", async () => {
      const { appId, first, second } = application({
        ...limits,
        appCallsPerMinute: 2,
      });
      await reserve(first, tenant(appId, "first"));
      await reserve(second, tenant(appId, "second"));
      expect(await reserve(first, tenant(appId, "third"))).toMatchObject({
        error: { reason: "minute" },
        ok: false,
      });
    });
    it("enforces five concurrent leases with idempotent release and expiry", async () => {
      const { appId, first, second } = application();
      const rateClass = tenant(appId);
      const admissions = await Promise.all(
        Array.from({ length: 5 }, () => reserve(first, rateClass, 2000))
      );
      expect(admissions.every((result) => result.ok)).toBe(true);
      expect(await reserve(second, rateClass)).toMatchObject({
        error: { reason: "concurrency" },
        ok: false,
      });
      const [held] = admissions;
      if (!held?.ok) {
        throw new Error("Expected reservation");
      }
      await first.release({
        rateClass,
        reservationId: held.value.reservationId,
      });
      await first.release({
        rateClass,
        reservationId: held.value.reservationId,
      });
      expect((await reserve(second, rateClass, 2000)).ok).toBe(true);
      await new Promise((resolve) => {
        setTimeout(resolve, 2100);
      });
      expect((await reserve(second, rateClass)).ok).toBe(true);
    });
    it("replays reservations atomically across two store instances", async () => {
      const { appId, first, second } = application({
        ...limits,
        callsPerMinutePerOrg: 1,
      });
      const input = {
        leaseMs: 10_000,
        rateClass: tenant(appId),
        reservationId: randomUUID(),
      };
      expect((await first.reserve(input)).ok).toBe(true);
      expect((await second.reserve(input)).ok).toBe(true);
      expect(await reserve(second, input.rateClass)).toMatchObject({
        error: { reason: "minute" },
        ok: false,
      });
    });
    it("clamps tenant and app headers downward without replenishment", async () => {
      const { appId, first, second } = application();
      const rateClass = tenant(appId);
      await first.observe({
        headers: new Headers({
          "X-AppMinLimit-Remaining": "1",
          "X-DayLimit-Remaining": "1",
          "X-MinLimit-Remaining": "1",
        }),
        rateClass,
      });
      await second.observe({
        headers: new Headers({
          "X-AppMinLimit-Remaining": "50",
          "X-DayLimit-Remaining": "10",
          "X-MinLimit-Remaining": "10",
        }),
        rateClass,
      });
      expect((await reserve(second, rateClass)).ok).toBe(true);
      expect(await reserve(first, rateClass)).toMatchObject({
        error: { reason: "daily" },
        ok: false,
      });
      expect(await reserve(second, tenant(appId, "other"))).toMatchObject({
        error: { reason: "minute" },
        ok: false,
      });
    });
    it("keeps cooldown monotonic and accepts fractional seconds", async () => {
      const { appId, first, second } = application();
      const rateClass = tenant(appId);
      await first.observe({
        headers: new Headers({ "Retry-After": "2" }),
        rateClass,
      });
      await second.observe({
        headers: new Headers({ "Retry-After": "0.0015" }),
        rateClass,
      });
      expect(await reserve(first, rateClass)).toMatchObject({
        error: { reason: "cooldown" },
        ok: false,
      });
    });
    it("fails closed when transport is unavailable", async () => {
      const { appId } = application();
      const unavailable = new RedisSharedXeroRateStore({
        fetchImpl: () =>
          Promise.reject(new Error("Synthetic transport outage")),
        limits,
        namespace: epoch,
        token,
        url,
      });
      expect(await reserve(unavailable, tenant(appId))).toMatchObject({
        error: { reason: "infrastructure" },
        ok: false,
      });
    });
    it("initialises first-use quota keys atomically across concurrent clients", async () => {
      const { appId, first, second } = application({
        ...limits,
        callsPerMinutePerOrg: 1,
      });
      const results = await Promise.all([
        reserve(first, tenant(appId)),
        reserve(second, tenant(appId)),
      ]);
      expect(results.filter((result) => result.ok)).toHaveLength(1);
      expect(results.filter((result) => !result.ok)).toEqual([
        { error: { reason: "minute" }, ok: false },
      ]);
    });
  });
});
