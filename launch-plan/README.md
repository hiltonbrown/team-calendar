# LeaveSync launch plan

This directory holds the final pre-launch review and the sequenced prompt series that
finalises the remaining work for a first AU-only deploy.

- `REVIEW.md`: the full read-only audit (executive summary, build-order status, critical
  findings, standards violations, test and lint results, schema and migration gaps,
  deployment blockers, prioritised to-do list, open decisions).
- `prompts/NN-<slug>.md`: self-contained Claude Code prompts, one per vertical slice, in
  execution order. Each is independently runnable by a coding agent without follow-up
  questions.

## Launch scope

AU-only, English-only, the core loop: connect Xero and inbound sync; leave submit, approve,
decline and withdraw with synchronous write-back; manual availability; one feed type with
privacy modes; the calendar and person read views. NZ and UK write-back, analytics, sync run
detail, audit-log UI, public-holiday import, workspaces, webhooks, danger zone, support and
search are deferred per `cleanup/DEFERRED.md`.

## Prompt index

| # | Slice | Build step | Severity | Depends on |
|---|---|---|---|---|
| 01 | Schema parity migration | schema | critical | none |
| 02 | CI and build integrity | deploy/CI | critical | none |
| 03 | Coding-standards hygiene | standards | medium | none |
| 04 | Inbound Xero leave sync | step 4 | critical | 01 |
| 05 | Leave balance sync and manual balances | step 5 | high | 01 |
| 06 | Duplicate manual-record guard | step 8 | medium | none |
| 07 | ICS UID and SEQUENCE correctness | step 12 | critical | none (pairs with 04) |
| 08 | Feed publication jobs and cache invalidation | steps 11, 16 | high | 07 |
| 09 | Xero rate limiting | Xero rules | high | none |
| 10 | Seed data for development | step 1 | low | 01 (recommended) |
| 11 | Deployment configuration | deploy | high | 02 |

## Dependency graph

```text
01 schema parity ──┬─> 04 inbound leave sync ──┐
                   ├─> 05 balance sync          │
                   └─> 10 seed data             │
                                                ├─ (04 sets the Xero UID that 07 consumes)
07 ICS UID/SEQUENCE ───> 08 feed publication jobs

02 CI/build integrity ───> 11 deployment config

03 standards hygiene   (independent)
06 duplicate guard     (independent)
09 Xero rate limiting  (independent)
```

## Recommended run order

The series is ordered by build-order step then severity, with schema and CI parity first,
the security-adjacent hygiene next, then the core-loop completion slices, then deployment
last. Within that, 04 and 05 require 01; 08 requires 07; 11 requires 02.

1. **01 Schema parity migration** (unblocks 04, 05, 10; aligns the schema with PRODUCT).
2. **02 CI and build integrity** (green build and boundaries for everything after).
3. **03 Coding-standards hygiene** (clean baseline; hardens the webhook boundary).
4. **04 Inbound Xero leave sync** (the missing inbound half of the core loop).
5. **05 Leave balance sync and manual balances**.
6. **06 Duplicate manual-record guard** (PRODUCT non-negotiable).
7. **07 ICS UID and SEQUENCE correctness** (the publishing-layer correctness fix).
8. **08 Feed publication jobs and cache invalidation** (completes the six Inngest jobs).
9. **09 Xero rate limiting**.
10. **10 Seed data for development**.
11. **11 Deployment configuration for Vercel Hobby**.

03, 06 and 09 are independent and can be run in parallel with the core-loop slices if
capacity allows. 07 can start immediately but should reconcile its UID helper with 04 once
both are in flight (see the note in prompt 07, step 1).

## Definition of launch-ready

All eleven prompts merged, `bun run build` / `bun run check` / `bun run boundaries` /
`bun run test` (unit) green without a database, the DB-integration suite green against a real
Neon instance in CI, and the three deployment blockers in `REVIEW.md` cleared. At that point
the conditional no-go in the executive summary becomes a go for a first AU-only deploy.
