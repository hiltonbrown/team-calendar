import { randomUUID } from "node:crypto";
import { remainingMs, type XeroDeadline } from "./deadline";
import { DEFAULT_MAX_WAIT_MS } from "./limits";
import {
  getSharedXeroRateStore,
  type SharedRateDeniedReason,
  type SharedRateLimits,
  type SharedXeroRateStore,
  type XeroRateClass,
} from "./shared-store";

export interface RateLimiterConfig extends SharedRateLimits {
  maxWaitMs: number;
}
export interface RateLimiterDeps {
  now: () => number;
  random: () => number;
  sleep: (ms: number) => Promise<void>;
  store: SharedXeroRateStore;
}
export type RateLimitDeniedReason = SharedRateDeniedReason;
export type RateLimitAcquireResult =
  | { ok: false; reason: RateLimitDeniedReason }
  | { ok: true; release: () => Promise<void> };

// Plan 161e: atomic admission shared by deployments, per external Xero tenant.
export class XeroRateLimiter {
  private readonly store: SharedXeroRateStore;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly random: () => number;
  private readonly maxWaitMs: number;
  constructor(
    config: Partial<RateLimiterConfig> = {},
    deps: Partial<RateLimiterDeps> = {}
  ) {
    this.now = deps.now ?? Date.now;
    this.sleep =
      deps.sleep ??
      ((ms) =>
        new Promise((resolve) => {
          setTimeout(resolve, ms);
        }));
    this.random = deps.random ?? Math.random;
    this.maxWaitMs = config.maxWaitMs ?? DEFAULT_MAX_WAIT_MS;
    this.store = deps.store ?? getSharedXeroRateStore(config);
  }
  async acquire(
    rateClass: XeroRateClass,
    options: {
      maxWaitMs?: number;
      leaseMs?: number;
      deadline?: XeroDeadline;
    } = {}
  ): Promise<RateLimitAcquireResult> {
    const maxWait = options.maxWaitMs ?? this.maxWaitMs;
    const until = this.now() + maxWait;
    const admissionDeadline =
      maxWait > 0
        ? {
            expiresAtMs: Math.min(
              Date.now() + maxWait,
              options.deadline?.expiresAtMs ?? Number.POSITIVE_INFINITY
            ),
          }
        : options.deadline;
    const reservationId = randomUUID();
    let backoff = 250;
    let lastDenial: RateLimitDeniedReason | undefined;
    // biome-ignore lint/suspicious/noUnnecessaryConditions: Atomic admission retries until an explicit result or budget expiry.
    while (true) {
      if (
        lastDenial &&
        (this.now() >= until ||
          (admissionDeadline && remainingMs(admissionDeadline) === 0))
      ) {
        return { ok: false, reason: lastDenial };
      }
      const result = await this.store.reserve({
        deadline: admissionDeadline,
        leaseMs: options.deadline
          ? remainingMs(options.deadline) + 5000
          : (options.leaseMs ?? 95_000),
        rateClass,
        reservationId,
      });
      if (result.ok) {
        return {
          ok: true,
          release: async () => {
            try {
              await this.store.release({
                deadline: options.deadline,
                rateClass,
                reservationId,
              });
            } catch {
              /* Expiring lease recovers transport failure without masking provider outcome. */
            }
          },
        };
      }
      const { reason } = result.error;
      lastDenial = reason;
      const left = Math.min(
        until - this.now(),
        options.deadline
          ? remainingMs(options.deadline)
          : Number.POSITIVE_INFINITY
      );
      if (reason === "daily" || reason === "infrastructure" || left <= 0) {
        return { ok: false, reason };
      }
      await this.sleep(Math.min(left, backoff * (0.75 + this.random() / 2)));
      backoff = Math.min(2000, backoff * 2);
    }
  }
  async observe(
    rateClass: XeroRateClass,
    headers: Headers,
    deadline: XeroDeadline
  ): Promise<void> {
    await this.store.observe({ deadline, headers, rateClass });
  }
}
