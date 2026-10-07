import type { Result } from "@repo/core";
import { remainingMs } from "./deadline";
import {
  parseRateCooldown,
  parseRateRemainingHeader,
  type RateObservationInput,
  type RateReleaseInput,
  type RateReservationInput,
  type SharedRateDeniedReason,
  type SharedRateLimits,
  type SharedXeroRateStore,
  xeroRateKeys,
} from "./shared-store";

interface MemoryStoreOptions {
  limits: SharedRateLimits;
  namespace?: string;
  now?: () => number;
}
export class MemorySharedXeroRateStore implements SharedXeroRateStore {
  private readonly options: MemoryStoreOptions;
  private readonly windows = new Map<string, Map<string, number>>();
  private readonly cooldowns = new Map<string, number>();
  private readonly now: () => number;
  private readonly namespace: string;
  constructor(options: MemoryStoreOptions) {
    this.options = options;
    this.now = options.now ?? Date.now;
    this.namespace = options.namespace ?? "v1";
  }
  private window(key: string, cutoff: number): Map<string, number> {
    const values = this.windows.get(key) ?? new Map<string, number>();
    for (const [id, timestamp] of values) {
      if (timestamp <= cutoff) {
        values.delete(id);
      }
    }
    this.windows.set(key, values);
    return values;
  }
  // biome-ignore lint/suspicious/useAwait: Memory implementation preserves the asynchronous store interface.
  async reserve(
    input: RateReservationInput
  ): Promise<
    Result<{ reservationId: string }, { reason: SharedRateDeniedReason }>
  > {
    if (input.deadline && remainingMs(input.deadline) <= 0) {
      return { error: { reason: "infrastructure" }, ok: false };
    }
    const now = this.now();
    const [appKey, minuteKey, dayKey, concurrentKey, cooldownKey] =
      xeroRateKeys(input.rateClass, this.namespace);
    const app = this.window(appKey, now - 60_000);
    const minute = this.window(minuteKey, now - 60_000);
    const day = this.window(dayKey, now - 86_400_000);
    const concurrent = this.window(concurrentKey, now);
    if (app.has(input.reservationId)) {
      return { ok: true, value: { reservationId: input.reservationId } };
    }
    const tenant = input.rateClass.kind === "tenant";
    const { limits } = this.options;
    let reason: SharedRateDeniedReason | undefined;
    if ((this.cooldowns.get(cooldownKey) ?? 0) > now) {
      reason = "cooldown";
    } else if (tenant && day.size >= limits.callsPerDayPerOrg) {
      reason = "daily";
    } else if (
      app.size >= limits.appCallsPerMinute ||
      minute.size >= (tenant ? limits.callsPerMinutePerOrg : 60)
    ) {
      reason = "minute";
    } else if (tenant && concurrent.size >= limits.concurrentRequestsPerOrg) {
      reason = "concurrency";
    }
    if (reason) {
      return { error: { reason }, ok: false };
    }
    app.set(input.reservationId, now);
    minute.set(input.reservationId, now);
    if (tenant) {
      day.set(input.reservationId, now);
      concurrent.set(input.reservationId, now + Math.max(1, input.leaseMs));
    }
    return { ok: true, value: { reservationId: input.reservationId } };
  }
  // biome-ignore lint/suspicious/useAwait: Memory implementation preserves the asynchronous store interface.
  async release(input: RateReleaseInput): Promise<void> {
    this.windows
      .get(xeroRateKeys(input.rateClass, this.namespace)[3])
      ?.delete(input.reservationId);
  }
  // biome-ignore lint/suspicious/useAwait: Memory implementation preserves the asynchronous store interface.
  async observe(input: RateObservationInput): Promise<void> {
    const now = this.now();
    const [appKey, minuteKey, dayKey, , cooldownKey] = xeroRateKeys(
      input.rateClass,
      this.namespace
    );
    const tenant = input.rateClass.kind === "tenant";
    const entries = [
      {
        cap: tenant ? this.options.limits.callsPerMinutePerOrg : 60,
        duration: 60_000,
        header: "X-MinLimit-Remaining",
        key: minuteKey,
      },
      {
        cap: this.options.limits.appCallsPerMinute,
        duration: 60_000,
        header: "X-AppMinLimit-Remaining",
        key: appKey,
      },
      ...(tenant
        ? [
            {
              cap: this.options.limits.callsPerDayPerOrg,
              duration: 86_400_000,
              header: "X-DayLimit-Remaining",
              key: dayKey,
            },
          ]
        : []),
    ];
    for (const entry of entries) {
      const remaining = parseRateRemainingHeader(
        input.headers.get(entry.header)
      );
      if (remaining === undefined) {
        continue;
      }
      const window = this.window(entry.key, now - entry.duration);
      const required = entry.cap - Math.min(entry.cap, remaining);
      while (window.size < required) {
        window.set(crypto.randomUUID(), now);
      }
    }
    const cooldown = parseRateCooldown(input.headers.get("Retry-After"), now);
    if (cooldown !== undefined) {
      this.cooldowns.set(
        cooldownKey,
        Math.max(this.cooldowns.get(cooldownKey) ?? 0, now + cooldown)
      );
    }
  }
}
