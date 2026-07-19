# Plan 005: Spike — decide how scheduled Xero syncs should run, then wire the first one

> **Executor instructions**: This is a **design spike**, not a build-everything
> plan. Its primary deliverable is a written recommendation; only the final step
> writes production code, and only if the earlier steps support it. Follow the
> steps in order, run every verification command, and honour the STOP
> conditions. When done, update the status row for this plan in
> `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 960c07b..HEAD -- packages/jobs apps/api/vercel.json packages/availability/src/sync`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M (spike) / L (full implementation, out of scope here)
- **Risk**: MED
- **Depends on**: `plans/001-restore-verification-baseline.md`
- **Category**: direction
- **Planned at**: commit `960c07b`, 2026-07-19

## Why this matters

`PRODUCT.md:579-584` specifies a sync cadence:

> ### Sync scheduling
>
> - Incremental inbound syncs: every 15 minutes during business hours, every 60 minutes outside.
> - Leave balance sync: every 60 minutes.
> - Nightly reconciliation: full re-sync and stale record detection.
> - Manual re-sync: available from the UI for admin users.

Only the last of those four exists. **Nothing schedules any Xero sync.** Every
sync handler is event-triggered, and the only cron in the entire repository
belongs to the notification-email queue. So Xero data is only as fresh as the
last time a human clicked "Run sync now", and `reconcile-xero-approval-state` —
the job whose whole purpose is detecting approval drift between Team Calendar
and Xero — runs only when somebody asks it to.

For a product whose stated identity is "a canonical availability publisher",
this is the worst failure mode available: subscribers see an ICS feed that looks
current and is not. There is no error, no banner and no signal. The feed is
simply stale.

The handlers already exist and work. This is a scheduling and fan-out decision,
not a feature build — which is exactly why it needs a spike first rather than a
cron slapped onto three functions.

## Current state

### Every sync handler is event-triggered

Verified with `grep -rn "triggers:" packages/jobs/src/handlers/*.ts`:

```
rebuild-feed-cache.ts:40:            triggers: { event: "rebuild-feed-cache" },
recount-usage.ts:55:                 triggers: { event: "recount-usage" },
reconcile-xero-approval-state.ts:105:triggers: { event: "reconcile-xero-approval-state" },
sync-xero-leave-records.ts:115:      triggers: { event: "sync-xero-leave-records" },
sync-xero-people.ts:56:              triggers: { event: "sync-xero-people" },
send-notification-emails.ts:10:      triggers: { cron: "*/2 * * * *" },
reconcile-feed-publications.ts:45:   triggers: { event: "reconcile-feed-publications" },
sync-xero-leave-balances.ts:83:      triggers: { event: "sync-xero-leave-balances" },
```

One cron, and it is not a sync.

### `apps/api/vercel.json` has one cron, also not a sync

```json
"crons": [
  {
    "path": "/cron/keep-alive",
    "schedule": "0 1 * * *"
  }
]
```

### The `"scheduled"` trigger type has no emitter

`packages/availability/src/sync/sync-events.ts:32`:

```ts
triggerType: z.enum(["scheduled", "manual", "webhook"]).default("manual"),
```

A repo-wide grep for a call site passing `triggerType: "scheduled"` returns
**zero results**. The enum branch is dead because nothing schedules anything.

### The fan-out problem — why a cron cannot simply be added to the handlers

Sync events are **per-tenant**. `packages/availability/src/sync/sync-events.ts:83-93`:

```ts
    const sent = await inngest.send({
      data: {
        clerkOrgId: parsed.data.clerkOrgId,
        organisationId: parsed.data.organisationId,
        personId: parsed.data.personId,
        triggerType: parsed.data.triggerType,
        triggeredByUserId: parsed.data.triggeredByUserId ?? null,
        xeroTenantId: parsed.data.xeroTenantId,
      },
      name: eventName,
    });
```

The payload requires `clerkOrgId`, `organisationId` and `xeroTenantId`. A cron
has none of these. So adding `triggers: { cron: ... }` to
`sync-xero-people` would fire it once with an empty payload, not once per
tenant. **This is the core design question the spike must answer.**

`CLAUDE.md` states the tenancy invariant that constrains any answer: jobs carry
both `clerk_org_id` and `organisation_id` in their event payload and must never
rely on session context. Resolve the Xero tenant via the `organisation_id` FK,
never by a bare `clerk_org_id` lookup.

### The cron exemplar

`packages/jobs/src/handlers/send-notification-emails.ts` in full — the only
existing cron, and the structural model for whatever you add:

```ts
import { sendQueuedNotificationEmails } from "@repo/notifications";
import type { InngestFunction } from "inngest";
import { inngest } from "../client";

export const sendNotificationEmailsFunction: InngestFunction.Any =
  inngest.createFunction(
    {
      concurrency: 1,
      id: "send-notification-emails",
      triggers: { cron: "*/2 * * * *" },
    },
    async ({ step }) =>
      await step.run("send-notification-emails", async () =>
        sendQueuedNotificationEmails()
      )
  );
```

Note it takes no per-tenant payload because it drains a global queue. The sync
handlers cannot follow that shape directly.

### Functions are registered in one place

`packages/jobs/src/functions.ts` exports a single `functions` array; anything
new must be added there or it will not be served.

### A duplication you will notice — do not fix it here

`packages/jobs/src/events.ts:7-9` and
`packages/availability/src/sync/sync-events.ts:9-11` both define the same
`syncEventNames` map, and `sync-events.ts:5` constructs its own
`new Inngest({ id: "team-calendar" })` rather than importing the shared client
from `packages/jobs/src/client.ts`. This is real duplication and it is **out of
scope** — note it in your report.

### Rate-limit context

`CLAUDE.md` records the Xero limits enforced in `packages/xero`: 60 requests per
minute per org, 5,000 per day per org, five concurrent per org. The limiter
exists (`packages/xero/src/rate-limit/limiter.ts`) and is unit-tested, but it has
never been exercised under continuous scheduled load across all tenants at once.
That is the main risk this spike must size.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `bun run typecheck --force` | exit 0, no `error TS` lines |
| Jobs suite | `cd packages/jobs && bun run test` | `Test Files  8 passed (8)` |
| Full test | `bun run test --force` | exit 0, no `Failed:` line |
| Lint | `bun run check` | exit 0 |

## Scope

**In scope**:
- `plans/005-findings.md` (create) — the spike's written deliverable
- `packages/jobs/src/handlers/` — **one** new fan-out handler, only if Step 4 is reached
- `packages/jobs/src/functions.ts` — registering that one handler
- A co-located test for the new handler

**Out of scope** (do NOT touch):
- The four existing sync handlers' internals. This plan schedules them; it does
  not modify how they work.
- `packages/availability/src/sync/sync-events.ts` and
  `packages/jobs/src/events.ts` — including the duplication noted above.
- `packages/xero/src/rate-limit/*` — measure it, do not change it.
- `apps/api/vercel.json` — Inngest crons are declared on the function, not in
  Vercel's cron config. Do not add entries here.
- Turning on schedules for **all four** job types. This plan wires at most one,
  deliberately. See "Why one".
- Any change to the manual "Run sync now" path in the UI.

## Git workflow

- Branch: `advisor/005-schedule-xero-sync-spike`
- Conventional commits. Example from `git log`:
  `feat(analytics): add out-of-office analytics route`.
- Suggested commits: `docs(plans): record sync scheduling spike findings`, then
  `feat(jobs): add scheduled sync fan-out for approval reconciliation`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Establish the fan-out shape

Read `packages/jobs/src/handlers/sync-xero-people.ts` and
`packages/availability/src/sync/sync-events.ts` in full, plus the
`XeroConnection` and `XeroTenant` models in
`packages/database/prisma/schema.prisma`.

Answer, in writing, in `plans/005-findings.md`:

1. What query enumerates every organisation eligible for a scheduled sync?
   Eligibility must account for: an active (not disconnected, not stale) Xero
   connection, and `sync_paused_at` if such a field exists. State the exact
   Prisma query shape.
2. Does an existing helper already do this enumeration? Search before writing a
   new one.
3. Confirm the tenant is resolved via the `organisation_id` FK, per `CLAUDE.md`,
   and not by a bare `clerk_org_id` lookup.

**Verify**: `plans/005-findings.md` contains a section "Fan-out query" with a
concrete Prisma query and a statement of the eligibility predicate.

### Step 2: Size the rate-limit blast radius

Using the limits in "Current state" (60/min, 5,000/day, 5 concurrent per org),
work out and record:

1. How many Xero API calls one full run of each sync type costs for an
   organisation of ~50, ~500 and ~2,000 people. Derive this by reading the
   handlers' call patterns, not by guessing.
2. Whether the per-org daily budget of 5,000 is threatened by the
   `PRODUCT.md` cadence (15-minute incremental syncs during business hours).
   Show the arithmetic.
3. Whether the limiter's scope is genuinely per-org, so that a fan-out across N
   tenants cannot cause one tenant to exhaust another's budget. Cite the code.

Two known inefficiencies will inflate any number you calculate. Record them as
prerequisites if they change the answer, but do **not** fix them here:

- `reconcile-xero-approval-state.ts:274` issues one Xero call **per record**,
  sequentially, with no date bound on the candidate set — so its cost grows
  monotonically with the org's history.
- `sync-xero-leave-records.ts:588` computes a `changed` flag and never branches
  on it, so every record is rewritten and republished on every run.

**Verify**: `plans/005-findings.md` contains a section "Rate-limit budget" with
per-org-size call estimates and an explicit yes/no on whether the `PRODUCT.md`
cadence fits inside the daily budget.

### Step 3: Recommend a cadence and a fan-out mechanism

Record a recommendation covering:

1. **Fan-out mechanism**: one scheduled function that enumerates organisations
   and emits per-tenant events, versus per-tenant Inngest crons. State which and
   why, including how each behaves as tenant count grows.
2. **Cadence**: whether to implement the `PRODUCT.md` business-hours/off-hours
   split immediately or start with a single flat interval. Note that
   "business hours" is timezone-dependent and the product is multi-tenant across
   AU, NZ and UK, so a single UTC cron cannot express it per tenant. Say how you
   would resolve that, or recommend deferring it.
3. **Rollout**: how to turn this on without exposing every tenant at once.
4. **Observability**: how an operator would know a scheduled sync has been
   failing. `sync_runs` records exist; state whether anything alerts on them.

**Verify**: `plans/005-findings.md` contains a section "Recommendation" with a
single named preferred option for each of the four points above.

### Step 4: Wire exactly one scheduled job

Only if Steps 1-3 produced a clear recommendation and Step 2 showed the budget
is safe.

Implement the fan-out for **`reconcile-xero-approval-state` only**. Add one new
handler in `packages/jobs/src/handlers/` that:

- is cron-triggered, at a **nightly** schedule (matching `PRODUCT.md`'s "nightly
  reconciliation" line — the least aggressive of the four cadences)
- enumerates eligible organisations using the Step 1 query
- emits one `reconcile-xero-approval-state` event per tenant, with
  `triggerType: "scheduled"`
- carries both `clerkOrgId` and `organisationId` in every event payload
- is registered in `packages/jobs/src/functions.ts`

Follow the structure of `send-notification-emails.ts` for the function shape and
`step.run` usage.

**Why one, and why this one**: it is the job whose absence is least visible
(nothing surfaces approval drift today), it runs nightly rather than every 15
minutes so the rate-limit exposure is smallest, and it exercises the whole
fan-out path end to end. Once it is proven in production, the remaining three
are a mechanical repeat. Wiring all four at once would change Xero API pressure
across every tenant simultaneously, against a limiter that has never run under
that load.

**Verify**: `cd packages/jobs && bun run test` → all pass, including new tests.
**Verify**: `bun run typecheck --force` → exit 0.

### Step 5: Confirm nothing else regressed

**Verify**: `bun run test --force` → exit 0, no `Failed:` line.
**Verify**: `bun run check` → exit 0.

## Test plan

For the new fan-out handler, co-located as
`packages/jobs/src/handlers/<name>.test.ts`, following the mocking style of
`packages/jobs/src/handlers/sync-xero-leave-records.test.ts`:

- emits one event per eligible organisation
- emits **zero** events when no organisation is eligible
- excludes organisations whose Xero connection is disconnected or stale
- every emitted payload carries both `clerkOrgId` and `organisationId`
- every emitted payload carries `triggerType: "scheduled"`
- a failure enumerating one organisation does not prevent the others being
  emitted (per `CLAUDE.md`: record-level inbound failures must not fail the
  whole run)

The tenant-scoping assertions are the load-bearing ones: they are what stops a
fan-out bug from sending a tenant's sync event with another tenant's ids.

## Done criteria

- [ ] `plans/005-findings.md` exists with sections "Fan-out query",
      "Rate-limit budget" and "Recommendation"
- [ ] The recommendation names one preferred option per question, not a list of
      considerations
- [ ] If Step 4 was reached: `cd packages/jobs && bun run test` passes with the
      new handler's tests
- [ ] If Step 4 was reached: the new function appears in
      `packages/jobs/src/functions.ts`
- [ ] `bun run typecheck --force` exits 0
- [ ] `bun run test --force` exits 0 with no `Failed:` line
- [ ] `bun run check` exits 0
- [ ] `git diff --stat` shows no changes to the four existing sync handlers'
      logic, to `sync-events.ts`, to `events.ts`, or to `apps/api/vercel.json`
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Step 2 shows the `PRODUCT.md` cadence does **not** fit inside the 5,000/day
  per-org budget. That makes this a prerequisite-ordering question — the
  reconcile and sync inefficiencies noted in Step 2 would have to be fixed
  first — and the maintainer must decide. Do not wire a schedule that will
  exhaust a tenant's Xero budget.
- There is no reliable way to determine which organisations are eligible (for
  example, no field distinguishes a paused connection from an active one).
  Report what is missing.
- The fan-out would require changing `sync-events.ts` or `events.ts`. Both are
  out of scope; needing them means an assumption here is wrong.
- You find yourself wiring more than one scheduled job, or adding a cron to an
  existing sync handler directly.
- Implementing the business-hours/off-hours split turns out to need per-tenant
  timezone-aware scheduling. Recommend and defer; do not build it.
- `bun run test` was already failing before your change — that means
  `plans/001-restore-verification-baseline.md` has not landed. Stop and say so.

## Maintenance notes

- **For the reviewer**: the question to ask is not "does the cron fire?" but
  "what happens to Xero API pressure across all tenants when it does?" Step 2's
  arithmetic is the part worth checking carefully.
- **Deliberately deferred to follow-up plans**, in the order they should be
  considered:
  1. The `reconcile-xero-approval-state` per-record polling loop
     (`:274`) — should use the bulk `LeaveApplications` read that
     `packages/xero/src/au/read.ts:158` already implements, and should bound its
     candidate set by date. This is the single biggest driver of scheduled-sync
     cost.
  2. The unused `changed` flag in `sync-xero-leave-records.ts:588`. Note the
     constraint: the `data` object written there folds in person-derived fields
     (`include_in_feed` from `person.include_in_feeds_by_default`,
     `privacy_mode` from `person.default_privacy_mode`) that are **not** part of
     `sourceRemoteHash`, so a naive early-return on an unchanged hash would stop
     person-setting changes propagating.
  3. Scheduling the remaining three sync types.
  4. The `syncEventNames` duplication between `packages/jobs/src/events.ts` and
     `packages/availability/src/sync/sync-events.ts`.
- Once scheduled syncs are live, the `"scheduled"` value of `triggerType`
  becomes reachable for the first time. Any UI or reporting that filters sync
  runs by trigger type should be checked, since it has only ever seen
  `"manual"`.
