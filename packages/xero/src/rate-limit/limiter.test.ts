import { describe, expect, it, vi } from "vitest";
import { MemorySharedXeroRateStore } from "./memory-store";
import type { XeroRateClass } from "./shared-store";

const tenant = (xeroTenantId: string): XeroRateClass => ({
  kind: "tenant",
  providerAppId: "test-app",
  xeroTenantId,
});

import { XeroRateLimiter } from "./limiter";

// Deterministic clock: now() reads a mutable cursor and sleep() advances it, so
// token refills happen exactly as much as the awaited wait.
function createTestClock(start = 0) {
  let current = start;
  const sleepCalls: number[] = [];
  return {
    advance: (ms: number) => {
      current += ms;
    },
    now: () => current,
    sleep: (ms: number) => {
      sleepCalls.push(ms);
      current += ms;
      return Promise.resolve();
    },
    sleepCalls,
  };
}

function testLimiter(
  config: ConstructorParameters<typeof XeroRateLimiter>[0],
  deps: Partial<ConstructorParameters<typeof XeroRateLimiter>[1]> = {}
) {
  return new XeroRateLimiter(config, {
    ...deps,
    store: new MemorySharedXeroRateStore({
      limits: {
        appCallsPerMinute: 10_000,
        callsPerDayPerOrg: 1000,
        callsPerMinutePerOrg: 60,
        concurrentRequestsPerOrg: 5,
        ...config,
      },
      now: deps?.now,
    }),
  });
}

describe("XeroRateLimiter", () => {
  it("enforces the per-minute cap per org", async () => {
    const clock = createTestClock();
    const limiter = testLimiter(
      {
        appCallsPerMinute: 1000,
        callsPerDayPerOrg: 1000,
        callsPerMinutePerOrg: 3,
        concurrentRequestsPerOrg: 100,
        maxWaitMs: 0,
      },
      clock
    );

    for (let i = 0; i < 3; i += 1) {
      const result = await limiter.acquire(tenant("org-a"));
      expect(result.ok).toBe(true);
    }

    const denied = await limiter.acquire(tenant("org-a"));
    expect(denied.ok).toBe(false);
    if (!denied.ok) {
      expect(denied.reason).toBe("minute");
    }
  });

  it("admits after the strict minute window expires", async () => {
    const clock = createTestClock();
    const limiter = testLimiter(
      {
        appCallsPerMinute: 1000,
        callsPerDayPerOrg: 1000,
        callsPerMinutePerOrg: 2,
        concurrentRequestsPerOrg: 100,
        maxWaitMs: 65_000,
      },
      clock
    );

    await limiter.acquire(tenant("org-a"));
    await limiter.acquire(tenant("org-a"));

    // Strict rolling windows free the oldest admitted call after the full minute.
    const third = await limiter.acquire(tenant("org-a"));
    expect(third.ok).toBe(true);
    expect(clock.sleepCalls.length).toBeGreaterThan(0);
  });

  it("enforces the daily cap without waiting", async () => {
    const clock = createTestClock();
    const limiter = testLimiter(
      {
        appCallsPerMinute: 1000,
        callsPerDayPerOrg: 2,
        callsPerMinutePerOrg: 1000,
        concurrentRequestsPerOrg: 100,
        maxWaitMs: 65_000,
      },
      clock
    );

    await limiter.acquire(tenant("org-a"));
    await limiter.acquire(tenant("org-a"));

    const denied = await limiter.acquire(tenant("org-a"));
    expect(denied.ok).toBe(false);
    if (!denied.ok) {
      expect(denied.reason).toBe("daily");
    }
    // The daily budget is genuinely spent, so it must fail fast, not wait.
    expect(clock.sleepCalls).toEqual([]);
  });

  it("fails fast on a spent daily budget without taking a concurrency slot", async () => {
    const clock = createTestClock();
    const limiter = testLimiter(
      {
        appCallsPerMinute: 1000,
        callsPerDayPerOrg: 1,
        callsPerMinutePerOrg: 1000,
        concurrentRequestsPerOrg: 1,
        maxWaitMs: 65_000,
      },
      clock
    );

    // Spend the only daily token and hold the only concurrency slot.
    const held = await limiter.acquire(tenant("org-a"));
    expect(held.ok).toBe(true);

    // Daily is checked before concurrency, so this returns "daily" immediately
    // rather than blocking behind the in-flight request.
    const denied = await limiter.acquire(tenant("org-a"));
    expect(denied.ok).toBe(false);
    if (!denied.ok) {
      expect(denied.reason).toBe("daily");
    }
    expect(clock.sleepCalls).toEqual([]);
  });

  it("enforces the app-wide per-minute ceiling across orgs", async () => {
    const clock = createTestClock();
    const limiter = testLimiter(
      {
        appCallsPerMinute: 2,
        callsPerDayPerOrg: 100_000,
        callsPerMinutePerOrg: 1000,
        concurrentRequestsPerOrg: 100,
        maxWaitMs: 0,
      },
      clock
    );

    expect((await limiter.acquire(tenant("org-a"))).ok).toBe(true);
    expect((await limiter.acquire(tenant("org-b"))).ok).toBe(true);

    const denied = await limiter.acquire(tenant("org-c"));
    expect(denied.ok).toBe(false);
    if (!denied.ok) {
      expect(denied.reason).toBe("minute");
    }
  });

  it("retries a concurrency denial and admits after release", async () => {
    let held: Awaited<ReturnType<XeroRateLimiter["acquire"]>>;
    const clock = createTestClock();
    const limiter = testLimiter(
      { concurrentRequestsPerOrg: 1 },
      {
        ...clock,
        sleep: async (ms) => {
          clock.advance(ms);
          if (held.ok) {
            await held.release();
          }
        },
      }
    );
    held = await limiter.acquire(tenant("org-a"));
    expect((await limiter.acquire(tenant("org-a"))).ok).toBe(true);
  });

  it("denies a concurrency slot once the wait budget is exhausted", async () => {
    const clock = createTestClock();
    const limiter = testLimiter(
      {
        appCallsPerMinute: 1000,
        callsPerDayPerOrg: 1000,
        callsPerMinutePerOrg: 1000,
        concurrentRequestsPerOrg: 1,
        maxWaitMs: 0,
      },
      clock
    );

    const first = await limiter.acquire(tenant("org-a"));
    expect(first.ok).toBe(true);

    // The single slot is held and maxWaitMs is 0, so this must fail fast.
    const denied = await limiter.acquire(tenant("org-a"));
    expect(denied.ok).toBe(false);
    if (!denied.ok) {
      expect(denied.reason).toBe("concurrency");
    }

    // Releasing the slot must not leak it: a fresh acquire then succeeds.
    if (first.ok) {
      await first.release();
    }
    const reacquired = await limiter.acquire(tenant("org-a"));
    expect(reacquired.ok).toBe(true);
  });

  it("keeps budgets separate per org", async () => {
    const clock = createTestClock();
    const limiter = testLimiter(
      {
        appCallsPerMinute: 1000,
        callsPerDayPerOrg: 1000,
        callsPerMinutePerOrg: 2,
        concurrentRequestsPerOrg: 100,
        maxWaitMs: 0,
      },
      clock
    );

    await limiter.acquire(tenant("org-a"));
    await limiter.acquire(tenant("org-a"));
    const aDenied = await limiter.acquire(tenant("org-a"));
    expect(aDenied.ok).toBe(false);

    // org-b is untouched, so it still has its full per-minute budget.
    const bResult = await limiter.acquire(tenant("org-b"));
    expect(bResult.ok).toBe(true);
  });
});

it("bounds a hanging Redis reservation by the admission wait budget", async () => {
  const { RedisSharedXeroRateStore } = await import("./shared-store");
  const store = new RedisSharedXeroRateStore({
    epoch: "test",
    fetchImpl: () =>
      new Promise(() => {
        /* Ignoring AbortSignal deliberately. */
      }),
    limits: {
      appCallsPerMinute: 10,
      callsPerDayPerOrg: 10,
      callsPerMinutePerOrg: 10,
      concurrentRequestsPerOrg: 5,
    },
    token: "test",
    url: "https://invalid.example",
  });
  const limiter = new XeroRateLimiter({}, { store });
  const started = Date.now();
  expect(await limiter.acquire(tenant("one"), { maxWaitMs: 10 })).toEqual({
    ok: false,
    reason: "infrastructure",
  });
  expect(Date.now() - started).toBeLessThan(500);
});

it("refreshes remaining operation lease with exactly one margin after waiting", async () => {
  let now = 1000;
  const clock = vi.spyOn(Date, "now").mockImplementation(() => now);
  const leases: number[] = [];
  const limiter = new XeroRateLimiter(
    {},
    {
      now: () => now,
      random: () => 0.5,
      sleep: (ms) => {
        now += ms;
        return Promise.resolve();
      },
      store: {
        observe: async () => undefined,
        release: async () => undefined,
        reserve: (input) => {
          leases.push(input.leaseMs);
          return Promise.resolve(
            leases.length === 1
              ? { error: { reason: "minute" }, ok: false }
              : { ok: true, value: { reservationId: input.reservationId } }
          );
        },
      },
    }
  );
  try {
    expect(
      (
        await limiter.acquire(tenant("one"), {
          deadline: { expiresAtMs: 10_000 },
          leaseMs: 14_000,
          maxWaitMs: 5000,
        })
      ).ok
    ).toBe(true);
    expect(leases).toEqual([14_000, 13_750]);
  } finally {
    clock.mockRestore();
  }
});

it("preserves the last denial when the wait expires before another reserve", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(1000);
  const { RedisSharedXeroRateStore } = await import("./shared-store");
  const fetchImpl = vi.fn<typeof fetch>(async () =>
    Response.json({ result: ["minute"] })
  );
  const store = new RedisSharedXeroRateStore({
    epoch: "test",
    fetchImpl,
    limits: {
      appCallsPerMinute: 10,
      callsPerDayPerOrg: 10,
      callsPerMinutePerOrg: 10,
      concurrentRequestsPerOrg: 5,
    },
    token: "test",
    url: "https://invalid.example",
  });
  try {
    const pending = new XeroRateLimiter({}, { store }).acquire(tenant("one"), {
      maxWaitMs: 100,
    });
    await vi.advanceTimersByTimeAsync(100);
    expect(await pending).toEqual({ ok: false, reason: "minute" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  } finally {
    vi.useRealTimers();
  }
});
