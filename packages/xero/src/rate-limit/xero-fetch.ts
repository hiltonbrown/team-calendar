import { XeroRateLimiter } from "./limiter";

// Default reactive-retry budget for transient failures (429 and 5xx). The first
// attempt is the real call; the rest are backed-off retries.
const DEFAULT_MAX_ATTEMPTS = 4;
const BACKOFF_BASE_MS = 500;
const BACKOFF_CAP_MS = 8000;

export interface XeroFetchDeps {
  fetchImpl: typeof fetch;
  limiter: XeroRateLimiter;
  sleep: (ms: number) => Promise<void>;
}

export interface XeroFetchInput {
  init?: RequestInit;
  // Reactive-retry attempts including the first call. Defaults to
  // DEFAULT_MAX_ATTEMPTS. Pass 1 to disable inline retry (used where the caller
  // owns retry semantics, e.g. the per-employee balance loop).
  maxAttempts?: number;
  // Identity the limiter buckets are keyed by. Built from the connected
  // organisation so one org cannot starve another.
  orgKey: string;
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

// Build the org-scoped limiter key from the tenant identity already threaded
// through every Xero call. Falls back to the clerk org id alone for OAuth
// bootstrap calls made before an Organisation row exists.
export function orgRateLimitKey(input: {
  clerkOrgId: string;
  organisationId?: null | string;
}): string {
  return input.organisationId
    ? `${input.clerkOrgId}:${input.organisationId}`
    : input.clerkOrgId;
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

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const gate = await limiter.acquire(input.orgKey);
    if (!gate.ok) {
      return rateLimitedResponse(gate.reason);
    }

    let response: Response;
    try {
      response = await fetchImpl(input.url, input.init);
    } catch (error) {
      gate.release();
      if (attempt < maxAttempts) {
        await sleep(backoffMs(attempt));
        continue;
      }
      throw error;
    }
    gate.release();

    if (attempt < maxAttempts && isTransientStatus(response.status)) {
      const retryAfterMs =
        response.status === 429
          ? parseRetryAfter(response.headers.get("Retry-After"))
          : null;
      await sleep(retryAfterMs ?? backoffMs(attempt));
      continue;
    }

    return response;
  }

  // Unreachable: the loop returns on the final attempt. Present for exhaustive
  // typing only.
  return rateLimitedResponse("minute");
}

function isTransientStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status < 600);
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
  if (Number.isFinite(seconds)) {
    return Math.max(0, seconds * 1000);
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
