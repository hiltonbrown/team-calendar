import { describe, expect, it } from "vitest";
import { XeroRateLimiter } from "./limiter";

// Deterministic clock: now() reads a mutable cursor and sleep() advances it, so
// token refills happen exactly as much as the awaited wait.
function createTestClock(start = 0) {
  let current = start;
  const sleepCalls: number[] = [];
  return {
    now: () => current,
    sleep: (ms: number) => {
      sleepCalls.push(ms);
      current += ms;
      return Promise.resolve();
    },
    advance: (ms: number) => {
      current += ms;
    },
    sleepCalls,
  };
}

describe("XeroRateLimiter", () => {
  it("enforces the per-minute cap per org", async () => {
    const clock = createTestClock();
    const limiter = new XeroRateLimiter(
      {
        callsPerMinutePerOrg: 3,
        callsPerDayPerOrg: 1000,
        appCallsPerMinute: 1000,
        concurrentRequestsPerOrg: 100,
        maxWaitMs: 0,
      },
      clock
    );

    for (let i = 0; i < 3; i += 1) {
      const result = await limiter.acquire("org-a");
      expect(result.ok).toBe(true);
    }

    const denied = await limiter.acquire("org-a");
    expect(denied.ok).toBe(false);
    if (!denied.ok) {
      expect(denied.reason).toBe("minute");
    }
  });

  it("refills per-minute tokens as time passes", async () => {
    const clock = createTestClock();
    const limiter = new XeroRateLimiter(
      {
        callsPerMinutePerOrg: 2,
        callsPerDayPerOrg: 1000,
        appCallsPerMinute: 1000,
        concurrentRequestsPerOrg: 100,
        maxWaitMs: 65_000,
      },
      clock
    );

    await limiter.acquire("org-a");
    await limiter.acquire("org-a");

    // Third call must wait for a token to refill (2 tokens / 60s => 30s/token).
    const third = await limiter.acquire("org-a");
    expect(third.ok).toBe(true);
    expect(clock.sleepCalls.length).toBeGreaterThan(0);
  });

  it("enforces the daily cap without waiting", async () => {
    const clock = createTestClock();
    const limiter = new XeroRateLimiter(
      {
        callsPerMinutePerOrg: 1000,
        callsPerDayPerOrg: 2,
        appCallsPerMinute: 1000,
        concurrentRequestsPerOrg: 100,
        maxWaitMs: 65_000,
      },
      clock
    );

    await limiter.acquire("org-a");
    await limiter.acquire("org-a");

    const denied = await limiter.acquire("org-a");
    expect(denied.ok).toBe(false);
    if (!denied.ok) {
      expect(denied.reason).toBe("daily");
    }
    // The daily budget is genuinely spent, so it must fail fast, not wait.
    expect(clock.sleepCalls).toEqual([]);
  });

  it("fails fast on a spent daily budget without taking a concurrency slot", async () => {
    const clock = createTestClock();
    const limiter = new XeroRateLimiter(
      {
        callsPerMinutePerOrg: 1000,
        callsPerDayPerOrg: 1,
        appCallsPerMinute: 1000,
        concurrentRequestsPerOrg: 1,
        maxWaitMs: 65_000,
      },
      clock
    );

    // Spend the only daily token and hold the only concurrency slot.
    const held = await limiter.acquire("org-a");
    expect(held.ok).toBe(true);

    // Daily is checked before concurrency, so this returns "daily" immediately
    // rather than blocking behind the in-flight request.
    const denied = await limiter.acquire("org-a");
    expect(denied.ok).toBe(false);
    if (!denied.ok) {
      expect(denied.reason).toBe("daily");
    }
    expect(clock.sleepCalls).toEqual([]);
  });

  it("enforces the app-wide per-minute ceiling across orgs", async () => {
    const clock = createTestClock();
    const limiter = new XeroRateLimiter(
      {
        callsPerMinutePerOrg: 1000,
        callsPerDayPerOrg: 100_000,
        appCallsPerMinute: 2,
        concurrentRequestsPerOrg: 100,
        maxWaitMs: 0,
      },
      clock
    );

    expect((await limiter.acquire("org-a")).ok).toBe(true);
    expect((await limiter.acquire("org-b")).ok).toBe(true);

    const denied = await limiter.acquire("org-c");
    expect(denied.ok).toBe(false);
    if (!denied.ok) {
      expect(denied.reason).toBe("minute");
    }
  });

  it("transfers a freed concurrency slot to a waiting acquire", async () => {
    // A sleep that never resolves keeps the waiter's deadline timer pending, so
    // the only way it resolves is via a released slot.
    const limiter = new XeroRateLimiter(
      {
        callsPerMinutePerOrg: 1000,
        callsPerDayPerOrg: 1000,
        appCallsPerMinute: 1000,
        concurrentRequestsPerOrg: 2,
        maxWaitMs: 65_000,
      },
      { now: () => 0, sleep: () => new Promise<void>(() => undefined) }
    );

    const first = await limiter.acquire("org-a");
    const second = await limiter.acquire("org-a");
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);

    let thirdResolved = false;
    const third = limiter.acquire("org-a").then((result) => {
      thirdResolved = true;
      return result;
    });

    // Both slots are held, so the third acquire must block.
    await Promise.resolve();
    expect(thirdResolved).toBe(false);

    if (first.ok) {
      first.release();
    }

    const thirdResult = await third;
    expect(thirdResult.ok).toBe(true);
  });

  it("denies a concurrency slot once the wait budget is exhausted", async () => {
    const clock = createTestClock();
    const limiter = new XeroRateLimiter(
      {
        callsPerMinutePerOrg: 1000,
        callsPerDayPerOrg: 1000,
        appCallsPerMinute: 1000,
        concurrentRequestsPerOrg: 1,
        maxWaitMs: 0,
      },
      clock
    );

    const first = await limiter.acquire("org-a");
    expect(first.ok).toBe(true);

    // The single slot is held and maxWaitMs is 0, so this must fail fast.
    const denied = await limiter.acquire("org-a");
    expect(denied.ok).toBe(false);
    if (!denied.ok) {
      expect(denied.reason).toBe("concurrency");
    }

    // Releasing the slot must not leak it: a fresh acquire then succeeds.
    if (first.ok) {
      first.release();
    }
    const reacquired = await limiter.acquire("org-a");
    expect(reacquired.ok).toBe(true);
  });

  it("keeps budgets separate per org", async () => {
    const clock = createTestClock();
    const limiter = new XeroRateLimiter(
      {
        callsPerMinutePerOrg: 2,
        callsPerDayPerOrg: 1000,
        appCallsPerMinute: 1000,
        concurrentRequestsPerOrg: 100,
        maxWaitMs: 0,
      },
      clock
    );

    await limiter.acquire("org-a");
    await limiter.acquire("org-a");
    const aDenied = await limiter.acquire("org-a");
    expect(aDenied.ok).toBe(false);

    // org-b is untouched, so it still has its full per-minute budget.
    const bResult = await limiter.acquire("org-b");
    expect(bResult.ok).toBe(true);
  });
});
