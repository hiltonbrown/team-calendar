# Prompt 09: Xero rate limiting

## Plan

- [x] Add a per-org token-bucket limiter in `packages/xero/src/rate-limit` enforcing
      60/min, 5,000/day, five concurrent per org, plus a 10,000/min app-wide ceiling.
- [x] Add a single Xero HTTP choke point (`xeroFetch`) that honours `Retry-After` on 429
      and applies exponential backoff to transient failures, returning a synthetic 429
      (mapped to `rate_limit_error`) only when the budget is genuinely exhausted.
- [x] Route every read, write, and OAuth/token call through `xeroFetch`, keyed per org.
- [x] Tests: per-minute, daily, concurrency and app-wide caps; per-org isolation;
      Retry-After honoured; backoff; budget-exhausted passthrough.
- [x] Record the in-process vs KV daily-cap design choice in `BLOCKED.md` (item D).

## Review

- Limiter lives entirely in `packages/xero`; no rate-limiting logic leaks into
  `availability`, `feeds`, or the apps. The forbidden `@repo/rate-limit` package is not
  reintroduced.
- Call sites wired: `au/read.ts` (employees, leave records, per-employee balances,
  leave-application status), `au/write.ts` (submit/approve/decline/withdraw), and
  `oauth/service.ts` (token exchange, connections, organisation region probe). NZ/UK
  read/write are scaffolds that make no HTTP calls, so nothing to wire there.
- The per-employee balance loop passes `maxAttempts: 1` to preserve its existing
  abort-on-rate-limit behaviour (the Inngest job retries the run); single reads, writes
  and token calls use the default inline retry with Retry-After.
- Daily cap is in-process per the recorded BLOCKED.md decision; a durable KV-backed
  counter is deferred pending a human call on adding KV to `packages/xero`.

## Verification

- `bun install`: ok.
- `bun run check`: 0 errors (pre-existing warnings only).
- `bun run boundaries`: no issues.
- `bun run test`: all suites pass (xero: 76 tests including the new rate-limit suites).
- `bun run build`: blocked by missing env vars (`XERO_TOKEN_ENCRYPTION_KEY`,
  `DATABASE_URL`, ...) in the sandbox; pre-existing and unrelated to this change.
  `tsc --noEmit` for `packages/xero` passes, confirming the code compiles.
