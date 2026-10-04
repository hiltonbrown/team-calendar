// biome-ignore-all lint/style/useFilenamingConvention: Co-located integration test convention.

import { randomUUID } from "node:crypto";
import { executeRedisRestCommand } from "@repo/core";
import {
  initialiseLiveCampaignFixture,
  isProtectedLiveRun,
} from "@repo/database/live-campaign-fixture";
import {
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
const applications: string[] = [];

describe.skipIf(!isProtectedLiveRun())("protected campaign integration", () => {
  if (!isProtectedLiveRun()) {
    it.skip("requires the protected live runner", () => {
      /* Collection does not allocate fixtures outside protected runs. */
    });
    return;
  }

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
      credentialDomainId: fixture.id("credential-domain"),
      epoch,
      limits: config,
      token,
      url,
    });
  }
  async function application(config = limits) {
    const appId = `fixture-${epoch}-${appSequence}`;
    appSequence += 1;
    applications.push(appId);
    const first = store(config);
    await first.initialiseNamespace(appId, false);
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
    await deleteSharedStoreFixtureKeys({
      globalKeys: [
        `shared_store_namespace:${fixture.globalKey("shared_store_namespace")}`,
      ],
      token,
      url,
    });
  });

  describe("owned Redis REST atomic admission", () => {
    it("shares minute exhaustion between two instances without consuming denied app budget", async () => {
      const { appId, first, second } = await application({
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
      const { appId, first, second } = await application(config);
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
      const { appId, first, second } = await application({
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
      const { appId, first, second } = await application();
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
      const { appId, first, second } = await application({
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
      const { appId, first, second } = await application();
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
      const { appId, first, second } = await application();
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
      const { appId } = await application();
      const unavailable = new RedisSharedXeroRateStore({
        epoch,
        fetchImpl: () =>
          Promise.reject(new Error("Synthetic transport outage")),
        limits,
        token,
        url,
      });
      expect(await reserve(unavailable, tenant(appId))).toMatchObject({
        error: { reason: "infrastructure" },
        ok: false,
      });
    });
    it("never admits without namespace sentinel", async () => {
      const appId = `fixture-${epoch}-closed`;
      applications.push(appId);
      expect(await reserve(store(), tenant(appId))).toMatchObject({
        error: { reason: "infrastructure" },
        ok: false,
      });
    });
    it("conservatively closes newly seen tenant daily windows", async () => {
      const appId = `fixture-${epoch}-conservative`;
      applications.push(appId);
      const first = store();
      await first.initialiseNamespace(appId, true);
      expect(await reserve(first, tenant(appId, "unseen"))).toMatchObject({
        error: { reason: "daily" },
        ok: false,
      });
      expect(
        (await reserve(first, { kind: "token", providerAppId: appId })).ok
      ).toBe(true);
    });
  });

  describe("owned Redis credential domain fence", () => {
    it("initialisation is immutable and idempotent without resetting allowance", async () => {
      const { appId, first } = await application({
        ...limits,
        callsPerDayPerOrg: 1,
      });
      const rateClass = tenant(appId);
      const replay = { leaseMs: 1000, rateClass, reservationId: randomUUID() };
      expect((await first.reserve(replay)).ok).toBe(true);
      expect(await first.initialiseNamespace(appId, true)).toBe(false);
      const foreign = new RedisSharedXeroRateStore({
        credentialDomainId: fixture.id("foreign-domain"),
        epoch,
        limits,
        token,
        url,
      });
      await expect(foreign.initialiseNamespace(appId, false)).rejects.toThrow(
        "credential domain mismatch"
      );
      for (const kind of [
        "tenant",
        "token",
        "user_inventory",
        "app_management",
      ] as const) {
        const scoped: XeroRateClass =
          kind === "tenant" ? rateClass : { kind, providerAppId: appId };
        expect(
          await foreign.reserve({ ...replay, rateClass: scoped })
        ).toMatchObject({
          error: { reason: "credential_domain_mismatch" },
          ok: false,
        });
      }
      expect((await first.reserve(replay)).ok).toBe(true);
      expect(await reserve(first, rateClass)).toMatchObject({
        error: { reason: "daily" },
        ok: false,
      });
    });
  });

  describe("owned Redis sentinel integrity", () => {
    async function command(values: readonly (string | number)[]) {
      const result = await executeRedisRestCommand({
        command: values,
        token,
        url,
      });
      if (!result.ok) {
        throw new Error("Owned Redis fixture command failed");
      }
      return result.value;
    }
    function snapshot(rateClass: XeroRateClass) {
      const keys = xeroRateKeys(rateClass, epoch);
      return Promise.all(
        keys.map((key, index) =>
          command([
            index === 0 || index === 5 || index === 6 ? "GET" : "ZCARD",
            key,
          ])
        )
      );
    }
    it("mismatch leaves sentinel, counters and conservative allowance unchanged", async () => {
      const appId = `fixture-${epoch}-immutable`;
      applications.push(appId);
      const first = store();
      await first.initialiseNamespace(appId, true);
      const rateClass = tenant(appId);
      const before = await snapshot(rateClass);
      const foreign = new RedisSharedXeroRateStore({
        credentialDomainId: fixture.id("foreign-domain"),
        epoch,
        limits,
        token,
        url,
      });
      await expect(foreign.initialiseNamespace(appId, false)).rejects.toThrow(
        "credential domain mismatch"
      );
      await reserve(foreign, rateClass);
      expect(await snapshot(rateClass)).toEqual(before);
    });
    it.each(["1", "malformed"])(
      "legacy/malformed sentinel %s denies all classes and cannot be rewritten",
      async (value) => {
        const appId = `fixture-${epoch}-sentinel-${value}`;
        applications.push(appId);
        const rateClass = tenant(appId);
        await command(["SET", xeroRateKeys(rateClass, epoch)[0] ?? "", value]);
        const before = await snapshot(rateClass);
        const first = store();
        await expect(first.initialiseNamespace(appId, false)).rejects.toThrow(
          "credential domain mismatch"
        );
        for (const kind of [
          "tenant",
          "token",
          "user_inventory",
          "app_management",
        ] as const) {
          const scoped: XeroRateClass =
            kind === "tenant" ? rateClass : { kind, providerAppId: appId };
          expect(await reserve(first, scoped)).toMatchObject({
            error: { reason: "credential_domain_mismatch" },
            ok: false,
          });
        }
        expect(await snapshot(rateClass)).toEqual(before);
      }
    );
    it("missing deployment domain fails closed even in test mode", async () => {
      const { appId } = await application();
      const missing = new RedisSharedXeroRateStore({
        epoch,
        limits,
        token,
        url,
      });
      expect(await reserve(missing, tenant(appId))).toMatchObject({
        error: { reason: "credential_domain_mismatch" },
        ok: false,
      });
    });
  });

  // The protected runner owns this real isolated campaign control namespace.
  beforeAll(() => initialiseLiveCampaignFixture(fixture));
});
