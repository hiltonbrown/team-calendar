// Xero published limits apply per external tenant and provider app.
// Starter daily allowance is 1,000; other commercial tiers allow 5,000.

export const XERO_CALLS_PER_MINUTE_PER_ORG = 60;
export const XERO_CALLS_PER_DAY_PER_ORG = 5000;
export const XERO_CONCURRENT_REQUESTS_PER_ORG = 5;
export const XERO_CALLS_PER_MINUTE_APP_WIDE = 10_000;

export const MINUTE_MS = 60_000;
export const DAY_MS = 86_400_000;

// How long a single acquire will wait for a per-minute or concurrency slot to
// free up before treating the budget as exhausted. The per-minute bucket refills
// one token roughly every second, so a short ceiling is enough to ride out a
// transient burst without holding a synchronous write open indefinitely.
export const DEFAULT_MAX_WAIT_MS = 65_000;

// Our engineering budgets, not Xero limits. Token operations must fit inside 15-second transactions.
export const XERO_TOKEN_OPERATION_BUDGET_MS = 10_000;
// Preserve up to 65 seconds of admission waiting for background syncs.
export const XERO_DEFAULT_OPERATION_BUDGET_MS = 90_000;
// Application policy for fully buffered responses.
export const XERO_MAX_RESPONSE_BYTES = 5 * 1024 * 1024;

// Application policy for each non-tenant endpoint class, per provider app.
export const XERO_CLASS_CALLS_PER_MINUTE = 60;
