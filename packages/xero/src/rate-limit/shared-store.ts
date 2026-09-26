import { executeRedisRestCommand, type Result } from "@repo/core";
import { log } from "@repo/observability/log";
import { z } from "zod";
import { keys, resolveXeroDailyAllowance } from "../../keys";
import { XERO_ADMISSION_SCRIPT } from "./admission.lua";
import { remainingMs, type XeroDeadline } from "./deadline";
import { MemorySharedXeroRateStore } from "./memory-store";

export type XeroRateClass =
  | { kind: "tenant"; providerAppId: string; xeroTenantId: string }
  | {
      kind: "token" | "user_inventory" | "app_management";
      providerAppId: string;
    };
export interface SharedRateLimits {
  appCallsPerMinute: number;
  callsPerDayPerOrg: number;
  callsPerMinutePerOrg: number;
  concurrentRequestsPerOrg: number;
}
export type SharedRateDeniedReason =
  | "minute"
  | "daily"
  | "concurrency"
  | "cooldown"
  | "infrastructure"
  | "credential_domain_mismatch";
export interface RateReservationInput {
  deadline?: XeroDeadline;
  leaseMs: number;
  rateClass: XeroRateClass;
  reservationId: string;
}
export interface RateReleaseInput {
  deadline?: XeroDeadline;
  rateClass: XeroRateClass;
  reservationId: string;
}
export interface RateObservationInput {
  deadline?: XeroDeadline;
  headers: Headers;
  rateClass: XeroRateClass;
}
export interface SharedXeroRateStore {
  observe: (input: RateObservationInput) => Promise<void>;
  release: (input: RateReleaseInput) => Promise<void>;
  reserve: (
    input: RateReservationInput
  ) => Promise<
    Result<{ reservationId: string }, { reason: SharedRateDeniedReason }>
  >;
}
export function xeroRateKeys(
  rateClass: XeroRateClass,
  epoch: string
): string[] {
  const prefix = `xero:{${encodeURIComponent(rateClass.providerAppId)}}:${epoch}:`;
  const scope =
    rateClass.kind === "tenant"
      ? `tenant:${encodeURIComponent(rateClass.xeroTenantId)}`
      : rateClass.kind;
  return [
    `${prefix}initialised`,
    `${prefix}app:minute`,
    `${prefix}${scope}:minute`,
    `${prefix}${scope}:day`,
    `${prefix}${scope}:concurrency`,
    `${prefix}${scope}:cooldown`,
    `${prefix}conservative-daily`,
  ];
}
const cooldownSecondsPattern = /^\d+(\.\d+)?$/;
const epochPattern = /^[a-z0-9-]{1,32}$/;
const httpDatePattern =
  /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4} \d{2}:\d{2}:\d{2} GMT$/;
const integerHeader = z
  .string()
  .regex(/^\d+$/)
  .transform(Number)
  .pipe(z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER));
export function parseRateRemainingHeader(
  value: string | null
): number | undefined {
  const result = integerHeader.safeParse(value);
  return result.success ? result.data : undefined;
}
export function parseRateCooldown(
  value: string | null,
  now: number
): number | undefined {
  if (!value) {
    return undefined;
  }
  const numeric = z.string().regex(cooldownSecondsPattern).safeParse(value);
  if (numeric.success) {
    const milliseconds = Number(value) * 1000;
    return Number.isFinite(milliseconds) ? Math.ceil(milliseconds) : undefined;
  }
  if (!httpDatePattern.test(value)) {
    return undefined;
  }
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - now) : undefined;
}
const replySchema = z.tuple([
  z.enum([
    "admitted",
    "minute",
    "daily",
    "concurrency",
    "cooldown",
    "infrastructure",
    "credential_domain_mismatch",
    "released",
    "observed",
    "initialised",
    "existing",
  ]),
]);
export interface RedisSharedStoreOptions {
  credentialDomainId?: string;
  epoch: string;
  fetchImpl?: typeof fetch;
  limits: SharedRateLimits;
  token: string;
  url: string;
}
export class RedisSharedXeroRateStore implements SharedXeroRateStore {
  private readonly options: RedisSharedStoreOptions;
  constructor(options: RedisSharedStoreOptions) {
    this.options = options;
  }
  private async command(
    operation: string,
    input: RateReleaseInput,
    extra: readonly unknown[] = []
  ): Promise<string> {
    const timeoutMs = input.deadline ? remainingMs(input.deadline) : 3000;
    if (timeoutMs <= 0) {
      return "infrastructure";
    }
    const { limits } = this.options;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const operationPromise = executeRedisRestCommand({
      command: [
        "EVAL",
        XERO_ADMISSION_SCRIPT,
        7,
        ...xeroRateKeys(input.rateClass, this.options.epoch),
        operation,
        input.rateClass.kind,
        input.rateClass.kind === "tenant" ? limits.callsPerMinutePerOrg : 60,
        limits.callsPerDayPerOrg,
        limits.appCallsPerMinute,
        limits.concurrentRequestsPerOrg,
        input.reservationId,
        this.options.credentialDomainId ?? "",
        ...extra,
      ],
      fetch: this.options.fetchImpl,
      timeoutMs,
      token: this.options.token,
      url: this.options.url,
    });
    const timeout = new Promise<undefined>((resolve) => {
      timer = setTimeout(() => resolve(undefined), timeoutMs);
    });
    let result: Awaited<typeof operationPromise> | undefined;
    try {
      result = await Promise.race([operationPromise, timeout]);
    } finally {
      clearTimeout(timer);
    }
    if (!result?.ok) {
      return "infrastructure";
    }
    const parsed = replySchema.safeParse(result.value);
    return parsed.success ? parsed.data[0] : "infrastructure";
  }
  async reserve(
    input: RateReservationInput
  ): Promise<
    Result<{ reservationId: string }, { reason: SharedRateDeniedReason }>
  > {
    const result = await this.command("reserve", input, [
      Math.max(1, Math.ceil(input.leaseMs)),
    ]);
    if (result === "admitted") {
      return { ok: true, value: { reservationId: input.reservationId } };
    }
    const reason = z
      .enum([
        "minute",
        "daily",
        "concurrency",
        "cooldown",
        "infrastructure",
        "credential_domain_mismatch",
      ])
      .safeParse(result);
    return {
      error: { reason: reason.success ? reason.data : "infrastructure" },
      ok: false,
    };
  }
  async release(input: RateReleaseInput): Promise<void> {
    await this.command("release", input);
  }
  async observe(input: RateObservationInput): Promise<void> {
    await this.command(
      "observe",
      { ...input, reservationId: crypto.randomUUID() },
      [
        parseRateRemainingHeader(input.headers.get("X-MinLimit-Remaining")) ??
          "",
        parseRateRemainingHeader(input.headers.get("X-DayLimit-Remaining")) ??
          "",
        parseRateRemainingHeader(
          input.headers.get("X-AppMinLimit-Remaining")
        ) ?? "",
        parseRateCooldown(input.headers.get("Retry-After"), Date.now()) ?? "",
      ]
    );
  }
  async initialiseNamespace(
    providerAppId: string,
    assumeSpentDaily: boolean
  ): Promise<boolean> {
    const result = await this.command(
      "initialise",
      {
        rateClass: { kind: "token", providerAppId },
        reservationId: crypto.randomUUID(),
      },
      [String(assumeSpentDaily)]
    );
    if (result !== "initialised" && result !== "existing") {
      throw new Error(
        result === "credential_domain_mismatch"
          ? "Xero rate namespace credential domain mismatch"
          : "Xero rate namespace store is unavailable"
      );
    }
    return result === "initialised";
  }
}
const unavailableStore: SharedXeroRateStore = {
  observe: () => Promise.resolve(),
  release: () => Promise.resolve(),
  reserve: () =>
    Promise.resolve({ error: { reason: "infrastructure" }, ok: false }),
};
let warnedDevelopment = false;
export function getSharedXeroRateStore(
  overrides?: Partial<SharedRateLimits>
): SharedXeroRateStore {
  try {
    const environment = keys();
    const limits = {
      appCallsPerMinute: 10_000,
      callsPerDayPerOrg: resolveXeroDailyAllowance(),
      callsPerMinutePerOrg: 60,
      concurrentRequestsPerOrg: 5,
      ...overrides,
    };
    if (!environment.XERO_CLIENT_ID) {
      return unavailableStore;
    }
    const epoch =
      environment.XERO_RATE_NAMESPACE_EPOCH ??
      (process.env.NODE_ENV === "production" ? undefined : "dev");
    if (!epoch) {
      return unavailableStore;
    }
    if (environment.KV_REST_API_URL && environment.KV_REST_API_TOKEN) {
      return new RedisSharedXeroRateStore({
        credentialDomainId: environment.XERO_CREDENTIAL_DOMAIN_ID,
        epoch,
        limits,
        token: environment.KV_REST_API_TOKEN,
        url: environment.KV_REST_API_URL,
      });
    }
    if (
      process.env.NODE_ENV !== "test" &&
      process.env.NODE_ENV !== "development"
    ) {
      return unavailableStore;
    }
    if (process.env.NODE_ENV === "development" && !warnedDevelopment) {
      warnedDevelopment = true;
      log.warn("Xero development admission uses a memory store");
    }
    return new MemorySharedXeroRateStore({
      epoch,
      expectedCredentialDomainId: environment.XERO_CREDENTIAL_DOMAIN_ID,
      limits,
      observedCredentialDomainId: environment.XERO_CREDENTIAL_DOMAIN_ID,
    });
  } catch {
    return unavailableStore;
  }
}
export async function initialiseXeroRateNamespace(input: {
  epoch: string;
  assumeSpentDaily: boolean;
  credentialDomainId: string;
}): Promise<{ initialised: number }> {
  const environment = keys();
  if (
    !(
      environment.XERO_CLIENT_ID &&
      environment.KV_REST_API_URL &&
      environment.KV_REST_API_TOKEN &&
      epochPattern.test(input.epoch) &&
      z.string().uuid().safeParse(input.credentialDomainId).success
    )
  ) {
    throw new Error("Xero rate namespace configuration is incomplete");
  }
  const store = new RedisSharedXeroRateStore({
    credentialDomainId: input.credentialDomainId,
    epoch: input.epoch,
    limits: {
      appCallsPerMinute: 10_000,
      callsPerDayPerOrg: resolveXeroDailyAllowance(),
      callsPerMinutePerOrg: 60,
      concurrentRequestsPerOrg: 5,
    },
    token: environment.KV_REST_API_TOKEN,
    url: environment.KV_REST_API_URL,
  });
  const initialised = await store.initialiseNamespace(
    environment.XERO_CLIENT_ID,
    input.assumeSpentDaily
  );
  return { initialised: initialised ? 1 : 0 };
}
