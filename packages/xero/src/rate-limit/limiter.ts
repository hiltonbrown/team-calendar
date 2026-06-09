import {
  DAY_MS,
  DEFAULT_MAX_WAIT_MS,
  MINUTE_MS,
  XERO_CALLS_PER_DAY_PER_ORG,
  XERO_CALLS_PER_MINUTE_APP_WIDE,
  XERO_CALLS_PER_MINUTE_PER_ORG,
  XERO_CONCURRENT_REQUESTS_PER_ORG,
} from "./limits";

export interface RateLimiterConfig {
  appCallsPerMinute: number;
  callsPerDayPerOrg: number;
  callsPerMinutePerOrg: number;
  concurrentRequestsPerOrg: number;
  maxWaitMs: number;
}

export interface RateLimiterDeps {
  // Wall clock in milliseconds. Injectable so tests stay deterministic.
  now: () => number;
  // Resolves after the given delay. Injectable so tests can run without real
  // timers; the default uses setTimeout.
  sleep: (ms: number) => Promise<void>;
}

// Reason a request could not be admitted. "daily" means the per-day budget is
// genuinely spent (no point waiting); "minute" means the per-minute or app-wide
// budget could not free a token within maxWaitMs; "concurrency" means the
// in-flight gate stayed full for the whole wait window.
export type RateLimitDeniedReason = "concurrency" | "daily" | "minute";

export type RateLimitAcquireResult =
  | { ok: false; reason: RateLimitDeniedReason }
  | { ok: true; release: () => void };

interface TokenBucket {
  capacity: number;
  lastRefillMs: number;
  refillPerMs: number;
  tokens: number;
}

interface OrgState {
  day: TokenBucket;
  minute: TokenBucket;
}

interface ConcurrencyWaiter {
  resolve: (granted: boolean) => void;
  settled: boolean;
}

interface ConcurrencyState {
  inFlight: number;
  waiters: ConcurrencyWaiter[];
}

const DEFAULT_CONFIG: RateLimiterConfig = {
  appCallsPerMinute: XERO_CALLS_PER_MINUTE_APP_WIDE,
  callsPerDayPerOrg: XERO_CALLS_PER_DAY_PER_ORG,
  callsPerMinutePerOrg: XERO_CALLS_PER_MINUTE_PER_ORG,
  concurrentRequestsPerOrg: XERO_CONCURRENT_REQUESTS_PER_ORG,
  maxWaitMs: DEFAULT_MAX_WAIT_MS,
};

function defaultSleep(ms: number): Promise<void> {
  if (ms <= 0) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

// Per-org token-bucket and concurrency limiter for Xero API calls. State is held
// in process; see BLOCKED.md item D for the cross-instance (KV) design choice
// recorded for the daily cap under serverless invocations.
export class XeroRateLimiter {
  private readonly config: RateLimiterConfig;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly orgStates = new Map<string, OrgState>();
  private readonly concurrency = new Map<string, ConcurrencyState>();
  private readonly appMinute: TokenBucket;

  constructor(
    config: Partial<RateLimiterConfig> = {},
    deps: Partial<RateLimiterDeps> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.now = deps.now ?? Date.now;
    this.sleep = deps.sleep ?? defaultSleep;
    this.appMinute = this.makeBucket(this.config.appCallsPerMinute, MINUTE_MS);
  }

  // Reserve one unit of budget for orgKey. Resolves with a release() to call once
  // the request finishes (it frees the concurrency slot), or with a denial reason
  // when the budget is genuinely exhausted.
  async acquire(orgKey: string): Promise<RateLimitAcquireResult> {
    const deadline = this.now() + this.config.maxWaitMs;
    const org = this.orgStateFor(orgKey);

    // Fail fast when the daily budget is already spent: it is not worth taking a
    // concurrency slot or waiting on one for a request that cannot succeed today.
    this.refill(org.day, this.now());
    if (org.day.tokens < 1) {
      return { ok: false, reason: "daily" };
    }

    const gotSlot = await this.acquireConcurrencySlot(orgKey, deadline);
    if (!gotSlot) {
      return { ok: false, reason: "concurrency" };
    }

    // The loop only ever sleeps for a wait that fits inside the deadline, so it
    // exits by returning; the condition keeps it lint-safe and bounded.
    while (this.now() <= deadline) {
      const now = this.now();
      this.refill(org.minute, now);
      this.refill(org.day, now);
      this.refill(this.appMinute, now);

      if (org.day.tokens < 1) {
        this.releaseConcurrencySlot(orgKey);
        return { ok: false, reason: "daily" };
      }

      if (org.minute.tokens >= 1 && this.appMinute.tokens >= 1) {
        org.minute.tokens -= 1;
        org.day.tokens -= 1;
        this.appMinute.tokens -= 1;
        return { ok: true, release: () => this.releaseConcurrencySlot(orgKey) };
      }

      const waitMs = Math.max(
        tokensWaitMs(org.minute),
        tokensWaitMs(this.appMinute)
      );
      if (now + waitMs > deadline) {
        this.releaseConcurrencySlot(orgKey);
        return { ok: false, reason: "minute" };
      }
      await this.sleep(waitMs);
    }

    this.releaseConcurrencySlot(orgKey);
    return { ok: false, reason: "minute" };
  }

  // Resolves true once a concurrency slot is held, or false when no slot frees
  // up before the deadline. A timed-out waiter never consumes a slot, so a stuck
  // request cannot make later acquires hang forever.
  private acquireConcurrencySlot(
    orgKey: string,
    deadline: number
  ): Promise<boolean> {
    const state = this.concurrencyStateFor(orgKey);
    if (state.inFlight < this.config.concurrentRequestsPerOrg) {
      state.inFlight += 1;
      return Promise.resolve(true);
    }

    const remaining = deadline - this.now();
    if (remaining <= 0) {
      return Promise.resolve(false);
    }

    const waiter: ConcurrencyWaiter = {
      resolve: () => {
        // Replaced synchronously below; this placeholder keeps the type honest.
      },
      settled: false,
    };
    const granted = new Promise<boolean>((resolve) => {
      waiter.resolve = resolve;
    });
    state.waiters.push(waiter);

    const timedOut = this.sleep(remaining).then(() => {
      if (!waiter.settled) {
        waiter.settled = true;
        const index = state.waiters.indexOf(waiter);
        if (index >= 0) {
          state.waiters.splice(index, 1);
        }
      }
      return false;
    });

    return Promise.race([granted, timedOut]);
  }

  private releaseConcurrencySlot(orgKey: string): void {
    const state = this.concurrencyStateFor(orgKey);
    // Hand the slot to the first waiter still waiting; skip any that already
    // timed out so the slot is not lost to them.
    while (state.waiters.length > 0) {
      const next = state.waiters.shift();
      if (next && !next.settled) {
        next.settled = true;
        // Transfer the slot directly; inFlight stays level.
        next.resolve(true);
        return;
      }
    }
    state.inFlight = Math.max(0, state.inFlight - 1);
  }

  private refill(bucket: TokenBucket, now: number): void {
    const elapsed = now - bucket.lastRefillMs;
    if (elapsed <= 0) {
      return;
    }
    bucket.tokens = Math.min(
      bucket.capacity,
      bucket.tokens + elapsed * bucket.refillPerMs
    );
    bucket.lastRefillMs = now;
  }

  private makeBucket(capacity: number, windowMs: number): TokenBucket {
    return {
      capacity,
      lastRefillMs: this.now(),
      refillPerMs: capacity / windowMs,
      tokens: capacity,
    };
  }

  private orgStateFor(orgKey: string): OrgState {
    const existing = this.orgStates.get(orgKey);
    if (existing) {
      return existing;
    }
    const state: OrgState = {
      day: this.makeBucket(this.config.callsPerDayPerOrg, DAY_MS),
      minute: this.makeBucket(this.config.callsPerMinutePerOrg, MINUTE_MS),
    };
    this.orgStates.set(orgKey, state);
    return state;
  }

  private concurrencyStateFor(orgKey: string): ConcurrencyState {
    const existing = this.concurrency.get(orgKey);
    if (existing) {
      return existing;
    }
    const state: ConcurrencyState = { inFlight: 0, waiters: [] };
    this.concurrency.set(orgKey, state);
    return state;
  }
}

function tokensWaitMs(bucket: TokenBucket): number {
  if (bucket.tokens >= 1) {
    return 0;
  }
  return Math.ceil((1 - bucket.tokens) / bucket.refillPerMs);
}
