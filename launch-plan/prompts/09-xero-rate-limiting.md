# Prompt 09: Xero rate limiting

## Role and context

You are a senior engineer on LeaveSync. The Xero adapter rules require per-org rate limiting
inside `packages/xero`: 60 API calls per minute, 5,000 per day, and five concurrent requests
per connected organisation (plus a 10,000/min app-wide ceiling). The audit found none of this
implemented: only the `rate_limit_error` variant exists as a 429 passthrough
(`packages/xero/src/au/write.ts:231`). Without a limiter, a busy sync or a burst of writes can
trip Xero's limits and cause cascading failures. This slice adds the limiter and backoff.

## Hard rules

- Branch first off the latest `main`: `git checkout main && git pull origin main && git
  checkout -b launch/09-xero-rate-limiting`.
- Australian English. No em dashes.
- This slice owns `packages/xero`. The limiter must live entirely inside `packages/xero`; no
  rate-limiting logic leaks into `packages/availability`, `packages/feeds`, or the apps. Do not
  reintroduce the forbidden `@repo/rate-limit` package. Do not change `schema.prisma`,
  migrations, tenancy keys, or the Clerk integration.
- Limits are per connected organisation; key the limiter by the org/tenant identity already
  threaded through Xero calls. Honour Xero `Retry-After` on 429 responses.
- Do not use `as any` or suppression. Preserve and add tests.
- If a durable, cross-instance limiter (for example backed by Vercel KV) is needed rather than
  an in-process one for the daily cap to be correct across serverless invocations, stop and
  record the design choice in `BLOCKED.md` before building.

## Authoritative references

- `PRODUCT.md:240-247` (rate limits), `CLAUDE.md` "Xero adapter rules".
- Apply at the call sites: `packages/xero/src/au/read.ts`, `packages/xero/src/au/write.ts`,
  the read/write dispatch (`packages/xero/src/read/dispatch.ts`,
  `packages/xero/src/write/dispatch.ts`), and the OAuth token calls in
  `packages/xero/src/oauth/service.ts`.
- `launch-plan/REVIEW.md` "Critical findings" C5.

## Phased steps

1. **Limiter module** in `packages/xero` (for example `src/rate-limit/`): a per-org token
   bucket enforcing 60/min and 5,000/day, plus a concurrency gate of five in-flight requests
   per org, and an app-wide 10,000/min ceiling. Decide in-process vs KV-backed per the hard
   rule above.
2. **Backoff and Retry-After**: on a 429, respect `Retry-After`; apply exponential backoff for
   transient failures, returning `rate_limit_error` only when the budget is genuinely
   exhausted.
3. **Wire it** through the central Xero HTTP path so every read, write, and token call passes
   through the limiter. Avoid sprinkling it per call site if a single choke point exists.
4. **Tests**: per-minute cap enforced; concurrency cap enforced; daily cap enforced;
   `Retry-After` honoured; budget keyed per org so one org cannot starve another.

## Verification gate

`bun install`, `bun run build`, `bun run check`, `bun run boundaries`, `bun run test` must
pass.

## Commits and PR

Conventional commits, for example: `feat: per-org Xero rate limiter and concurrency gate`,
`feat: honour Retry-After with exponential backoff`, `test: Xero rate limiting`. Push and open
a PR titled "Xero rate limiting".

## Acceptance criteria

- [ ] Per-org 60/min, 5,000/day, and five-concurrent limits enforced inside `packages/xero`.
- [ ] App-wide 10,000/min ceiling enforced.
- [ ] 429 `Retry-After` honoured; exponential backoff on transient failures.
- [ ] No rate-limiting logic outside `packages/xero`; forbidden `@repo/rate-limit` not reintroduced.
- [ ] Tests cover per-minute, concurrency, daily caps, and per-org isolation.
