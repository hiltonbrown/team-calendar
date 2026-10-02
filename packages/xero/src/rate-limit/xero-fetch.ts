import { createHash } from "node:crypto";
import { withXeroCampaignProviderEffect } from "@repo/database/xero-campaign-access";
import { XeroCampaignDeniedError } from "@repo/database/xero-campaign-contract";
import { keys } from "../../keys";
import { emitXeroMetric } from "../metrics";
import { createXeroDeadline, remainingMs, type XeroDeadline } from "./deadline";
import { XeroRateLimiter } from "./limiter";
import {
  DEFAULT_MAX_WAIT_MS,
  XERO_DEFAULT_OPERATION_BUDGET_MS,
  XERO_MAX_RESPONSE_BYTES,
} from "./limits";
import type { XeroRateClass } from "./shared-store";

// Default reactive-retry budget for transient failures (429 and 5xx). The first
// attempt is the real call; the rest are backed-off retries.
const RETRY_SECONDS_REGEX = /^\d+(\.\d+)?$/;
const RETRY_DATE_REGEX =
  /^[A-Za-z]{3}, \d{2} [A-Za-z]{3} \d{4} \d{2}:\d{2}:\d{2} GMT$/;
const DEFAULT_MAX_ATTEMPTS = 4;
const BACKOFF_BASE_MS = 500;
const BACKOFF_CAP_MS = 8000;

export interface XeroFetchDeps {
  fetchImpl: typeof fetch;
  limiter: XeroRateLimiter;
  sleep: (ms: number) => Promise<void>;
}

export interface XeroFetchInput {
  deadline?: XeroDeadline;
  init?: RequestInit;
  // Reactive-retry attempts including the first call. Defaults to
  // DEFAULT_MAX_ATTEMPTS. Pass 1 to disable inline retry (used where the caller
  // owns retry semantics, e.g. the per-employee balance loop).
  maxAttempts?: number;
  maxBodyBytes?: number;
  // Identity the limiter buckets are keyed by. Built from the connected
  // organisation so one org cannot starve another.
  rateClass: XeroRateClass;
  // Set false for requests that create something in Xero. A 429 is still
  // retried because Xero rejected the request before processing it, but a 5xx
  // or a dropped connection is ambiguous: Xero may have completed the write and
  // only the response was lost. Retrying then creates a duplicate leave
  // application in the customer's payroll file, which cannot be repaired from
  // this side.
  retryOnAmbiguousFailure?: boolean;
  url: string;
}

// Process-wide limiter shared by every Xero call that does not inject its own.
// Lazily created so tests that never touch it pay nothing.
let sharedLimiter: XeroRateLimiter | null = null;

function getSharedLimiter(): XeroRateLimiter {
  if (!sharedLimiter) {
    sharedLimiter = new XeroRateLimiter();
  }
  return sharedLimiter;
}

function defaultSleep(ms: number): Promise<void> {
  // Keep the test suite fast and deterministic: real timers only outside tests.
  if (ms <= 0 || process.env.NODE_ENV === "test") {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

// Single choke point for every Xero HTTP call. Acquires per-org budget through
// the limiter, performs the fetch, honours Retry-After on 429, and applies
// exponential backoff to transient failures. When the budget is genuinely
// exhausted it returns a synthetic 429 so existing error mapping surfaces a
// rate_limit_error to the caller.
export async function xeroFetch(
  input: XeroFetchInput,
  deps: Partial<XeroFetchDeps> = {}
): Promise<Response> {
  const limiter = deps.limiter ?? getSharedLimiter();
  const fetchImpl = deps.fetchImpl ?? fetch;
  const sleep = deps.sleep ?? defaultSleep;
  const maxAttempts = input.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const retryOnAmbiguousFailure = input.retryOnAmbiguousFailure ?? true;

  const deadline =
    input.deadline ?? createXeroDeadline(XERO_DEFAULT_OPERATION_BUDGET_MS);
  assertOrigin(input.url);
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let response: Response;
    try {
      response = await performAttempt(input, deadline, limiter, fetchImpl);
    } catch (error) {
      if (
        !canRetryError(
          error,
          input,
          attempt,
          maxAttempts,
          retryOnAmbiguousFailure
        )
      ) {
        throw error;
      }
      const waitMs = backoffMs(attempt);
      if (remainingMs(deadline) < waitMs) {
        // biome-ignore lint/style/useErrorCause: Exclude provider response values from policy errors.
        throw new XeroFetchError("deadline_exceeded", true);
      }
      await sleep(waitMs);
      continue;
    }
    if (
      attempt >= maxAttempts ||
      !isRetryableStatus(response.status, retryOnAmbiguousFailure)
    ) {
      return response;
    }
    const waitMs = retryDelayMs(response, attempt);
    if (remainingMs(deadline) < waitMs) {
      return response;
    }
    await sleep(waitMs);
  }
  return rateLimitedResponse("minute");
}

function retryDelayMs(response: Response, attempt: number): number {
  return (
    (response.status === 429
      ? parseRetryAfter(response.headers.get("Retry-After"))
      : null) ?? backoffMs(attempt)
  );
}

function canRetryError(
  error: unknown,
  input: XeroFetchInput,
  attempt: number,
  maxAttempts: number,
  retryOnAmbiguousFailure: boolean
): boolean {
  return (
    !(
      error instanceof XeroFetchError ||
      error instanceof XeroCampaignDeniedError ||
      input.init?.signal?.aborted
    ) && shouldRetryAfterThrow(attempt, maxAttempts, retryOnAmbiguousFailure)
  );
}

async function performAttempt(
  input: XeroFetchInput,
  deadline: XeroDeadline,
  limiter: XeroRateLimiter,
  fetchImpl: typeof fetch
): Promise<Response> {
  const request = {
    init: {
      ...input.init,
      body:
        input.init?.body instanceof URLSearchParams
          ? new URLSearchParams(input.init.body)
          : input.init?.body,
      headers: new Headers(input.init?.headers),
    },
    url: input.url,
  };
  if (remainingMs(deadline) === 0) {
    throw new XeroFetchError("deadline_exceeded", false);
  }
  if (request.init.signal?.aborted) {
    throw new XeroFetchError("deadline_exceeded", false);
  }
  const gate = await limiter.acquire(input.rateClass, {
    deadline,
    leaseMs: remainingMs(deadline) + 5000,
    maxWaitMs: Math.min(DEFAULT_MAX_WAIT_MS, remainingMs(deadline)),
  });
  if (!gate.ok) {
    if (remainingMs(deadline) === 0) {
      throw new XeroFetchError("deadline_exceeded", false);
    }
    if (
      gate.reason === "infrastructure" ||
      gate.reason === "credential_domain_mismatch"
    ) {
      throw new XeroFetchError("admission_unavailable", false);
    }
    return rateLimitedResponse(gate.reason);
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), remainingMs(deadline));
  const signal = request.init.signal
    ? AbortSignal.any([controller.signal, request.init.signal])
    : controller.signal;
  let dispatched = false;
  try {
    if (remainingMs(deadline) === 0) {
      throw new XeroFetchError("deadline_exceeded", false);
    }
    signal.throwIfAborted();
    dispatched = true;
    return await withXeroCampaignProviderEffect(
      {
        ...input.rateClass,
        bodyHash: campaignRequestBodyHash(request.init.body),
        method: request.init.method ?? "GET",
        tenantHeader: new Headers(request.init.headers).get("Xero-Tenant-Id"),
        tokenGrantType:
          request.init.body instanceof URLSearchParams
            ? request.init.body.get("grant_type")
            : null,
        url: request.url,
      },
      async () => {
        const fetched = await raceAbort(
          fetchImpl(request.url, {
            ...request.init,
            redirect: "manual",
            signal,
          }),
          signal
        );
        if (fetched.status >= 300 && fetched.status < 400) {
          fetched.body?.cancel().catch(() => {
            /* The body may already be closed. */
          });
          throw new XeroFetchError("redirect_rejected", true);
        }
        const buffered = await bufferWithRejectionEvidence(
          fetched,
          signal,
          input.maxBodyBytes ?? XERO_MAX_RESPONSE_BYTES
        );
        const headers = new Headers(buffered.headers);
        if (buffered.status !== 429) {
          headers.delete("Retry-After");
        }
        if (remainingMs(deadline) > 0) {
          await limiter.observe(input.rateClass, headers, deadline);
        }
        return buffered;
      }
    );
  } catch (error) {
    if (signal.aborted) {
      // biome-ignore lint/style/useErrorCause: Exclude provider response values from policy errors.
      throw new XeroFetchError("deadline_exceeded", dispatched);
    }
    throw error;
  } finally {
    await gate.release();
    clearTimeout(timeout);
  }
}

async function bufferWithRejectionEvidence(
  fetched: Response,
  signal: AbortSignal,
  maxBodyBytes: number
): Promise<Response> {
  try {
    return await bufferResponse(fetched, signal, maxBodyBytes);
  } catch (error) {
    if (fetched.status !== 401 && fetched.status !== 403) {
      throw error;
    }
    // An authoritative rejection survives an unreadable bounded body. The raw
    // payload remains available for normal responses, with no unbounded fallback.
    return new Response(null, {
      headers: fetched.headers,
      status: fetched.status,
      statusText: fetched.statusText,
    });
  }
}

export class XeroFetchError extends Error {
  readonly code:
    | "admission_unavailable"
    | "body_too_large"
    | "deadline_exceeded"
    | "origin_rejected"
    | "redirect_rejected";
  readonly dispatched: boolean;
  constructor(code: XeroFetchError["code"], dispatched: boolean) {
    super(`Xero transport failed: ${code}`);
    this.name = "XeroFetchError";
    this.code = code;
    this.dispatched = dispatched;
    if (code === "deadline_exceeded") {
      emitXeroMetric("xero.fetch.deadline_exceeded", 1);
    }
  }
}

function assertOrigin(url: string): void {
  let origin: string;
  try {
    ({ origin } = new URL(url));
  } catch {
    // biome-ignore lint/style/useErrorCause: Rejected URL values must not enter error causes.
    throw new XeroFetchError("origin_rejected", false);
  }
  if (
    origin === "https://api.xero.com" ||
    origin === "https://identity.xero.com"
  ) {
    return;
  }
  const override =
    process.env.NODE_ENV === "production"
      ? undefined
      : keys().XERO_API_BASE_URL;
  if (override && origin === new URL(override).origin) {
    return;
  }
  throw new XeroFetchError("origin_rejected", false);
}

async function raceAbort<T>(
  operation: Promise<T>,
  signal: AbortSignal
): Promise<T> {
  let onAbort: () => void = () => {
    /* Assigned inside the promise executor. */
  };
  const aborted = new Promise<never>((_, reject) => {
    onAbort = () => reject(signal.reason);
    if (signal.aborted) {
      onAbort();
    } else {
      signal.addEventListener("abort", onAbort);
    }
  });
  try {
    return await Promise.race([operation, aborted]);
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}

async function bufferResponse(
  response: Response,
  signal: AbortSignal,
  maxBytes: number
): Promise<Response> {
  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = response.body?.getReader();
  try {
    if (reader) {
      let complete = false;
      while (!complete) {
        const chunk = await raceAbort(reader.read(), signal);
        if (chunk.done) {
          complete = true;
          continue;
        }
        total += chunk.value.byteLength;
        if (total > maxBytes) {
          throw new XeroFetchError("body_too_large", true);
        }
        chunks.push(chunk.value);
      }
    }
  } catch (error) {
    reader?.cancel().catch(() => {
      /* Cancellation can race stream closure. */
    });
    throw error;
  } finally {
    reader?.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const nullBody = [101, 103, 204, 205, 304].includes(response.status);
  return new Response(nullBody ? null : bytes, {
    headers: response.headers,
    status: response.status,
    statusText: response.statusText,
  });
}

function isTransientStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status < 600);
}

// A 429 is always safe to retry: Xero rejected the request before processing
// it. Any other transient status is only retried when the caller has not
// opted out, because a 5xx is ambiguous about whether the write completed.
function isRetryableStatus(
  status: number,
  retryOnAmbiguousFailure: boolean
): boolean {
  return retryOnAmbiguousFailure ? isTransientStatus(status) : status === 429;
}

// A thrown network error is always ambiguous (was the request received?), so
// it is only retried when attempts remain and the caller has not opted out.
function shouldRetryAfterThrow(
  attempt: number,
  maxAttempts: number,
  retryOnAmbiguousFailure: boolean
): boolean {
  return attempt < maxAttempts && retryOnAmbiguousFailure;
}

function backoffMs(attempt: number): number {
  return Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * 2 ** (attempt - 1));
}

// Retry-After is either delta-seconds or an HTTP date. Returns milliseconds, or
// null when the header is absent or unparseable.
export function parseRetryAfter(headerValue: null | string): null | number {
  if (!headerValue) {
    return null;
  }
  const seconds = Number(headerValue);
  if (RETRY_SECONDS_REGEX.test(headerValue) && Number.isFinite(seconds)) {
    return Math.max(0, seconds * 1000);
  }
  if (!RETRY_DATE_REGEX.test(headerValue)) {
    return null;
  }
  const dateMs = Date.parse(headerValue);
  if (Number.isNaN(dateMs)) {
    return null;
  }
  return Math.max(0, dateMs - Date.now());
}

function rateLimitedResponse(reason: string): Response {
  return new Response(
    JSON.stringify({
      Message: "Xero rate limit reached for this organisation.",
      ReasonCode: reason,
    }),
    {
      headers: { "Content-Type": "application/json" },
      status: 429,
      statusText: "Too Many Requests",
    }
  );
}

function campaignRequestBodyHash(
  body: BodyInit | null | undefined
): string | null | undefined {
  if (body === null || body === undefined) {
    return null;
  }
  if (typeof body !== "string" && !(body instanceof URLSearchParams)) {
    return undefined;
  }
  return `sha256:${createHash("sha256").update(String(body)).digest("hex")}`;
}
