# Plan 156: Rate-limit support issue creation

## Status

- Priority: P2
- Effort: S
- Risk: LOW
- Confidence: HIGH
- Category: security, operations
- Depends on: production KV requirement
- Planned at: `39f98ea`, 2026-09-18
- Status: DONE

Implemented in `e7d6e12` and locally integrated as `2d0e04b`. Sixteen focused
tests, the full 185-test API suite, API typecheck, scoped Ultracite and diff
checks passed.

## Why this matters

Any authenticated organisation member can create a real GitHub issue through
the support route, with no user or tenant throttle. A compromised or abusive
session can flood the repository, consume GitHub API quota and generate
operational noise. API production preflight already requires the durable KV
pair used by the existing Redis REST transport.

## Scope

- A focused support rate-limit helper under `apps/api/lib/rate-limit`
- `apps/api/app/api/support/github-issue/route.ts`
- Co-located tests

Do not change support payloads, labels, GitHub permissions, roles or audit
semantics.

## Implementation

1. Add durable fixed-window Redis limits before GitHub calls: five accepted
   attempts per user per 15 minutes and twenty per Clerk Organisation per hour.
   Hash identifiers before placing them in keys.
2. Reuse the shared Redis REST transport and API KV schema. Fail open on a KV
   outage so support remains reachable, but log a safe warning without raw user
   or organisation identifiers.
3. Return HTTP 429 with the existing safe JSON envelope and `Retry-After` when
   either limit is exceeded. Do not call GitHub or write a success audit.
4. Add tests for both dimensions, headers, boundary allowance, fail-open
   behaviour and absence of downstream calls on rejection.

## Verification

- Focused support route and rate-limit tests
- API typecheck and scoped check
- Final candidate gates

## STOP conditions

Stop if production support intentionally bypasses KV or if the shared transport
cannot provide atomic increment/expiry. Do not use an in-memory limiter in a
serverless route.
