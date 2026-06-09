// Xero's published rate limits, per PRODUCT.md:240-247. These are the ceilings
// the limiter enforces per connected organisation, plus the app-wide cap.

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
