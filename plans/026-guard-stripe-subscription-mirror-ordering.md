# Plan 026: Guard the Stripe subscription mirror against out-of-order webhook delivery

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report, do not improvise. When done, update the status row for this plan in
> `plans/README.md` unless a reviewer dispatched you and told you they maintain
> the index.
>
> **Drift check (run first)**: `git diff --stat 123bbd8..HEAD -- packages/database/src/queries/billing.ts packages/database/prisma/schema.prisma apps/api/app/webhooks/payments/route.ts apps/api/app/webhooks/payments/route.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug / migration
- **Planned at**: commit `123bbd8`, 2026-07-12

## Why this matters

Stripe does not guarantee webhook ordering, and retries interleave with fresh
deliveries. The subscription mirror upsert applies whatever event arrives last,
with no ordering predicate. The existing `stripe_events` table only dedupes
*replays of the same event id* — it does nothing about ordering between
*different* event ids. So a delayed retry of an older `customer.subscription.*`
event can overwrite `plan_key`/`status` with stale values: a customer is silently
downgraded, or a cancelled subscription is resurrected to `active`, until the
next Stripe event happens to correct it. Billing is the tenant entitlement gate,
so this directly affects what the org can do. Stripe events carry a `created`
timestamp; recording it on the mirror row and making the update conditional on it
makes the mirror last-writer-by-event-time instead of last-writer-by-arrival.

## Current state

- The unguarded upsert (raw SQL):

```ts
// packages/database/src/queries/billing.ts:88-105 (abridged)
// INSERT INTO clerk_org_subscriptions (... created_at, updated_at) VALUES (... NOW(), NOW())
ON CONFLICT (clerk_org_id) DO UPDATE SET
  plan_key = EXCLUDED.plan_key,
  status = EXCLUDED.status,
  current_period_end = EXCLUDED.current_period_end,
  stripe_customer_id = EXCLUDED.stripe_customer_id,
  stripe_subscription_id = EXCLUDED.stripe_subscription_id,
  cancel_at_period_end = EXCLUDED.cancel_at_period_end,
  ended_at = EXCLUDED.ended_at,
  updated_at = NOW()
```

- The mirror row model has no event-time column:

```prisma
// packages/database/prisma/schema.prisma:1076-1095 (ClerkOrgSubscription)
model ClerkOrgSubscription {
  id String @id @default(uuid()) @db.Uuid
  clerk_org_id String @unique
  plan_key String
  status String
  current_period_end DateTime?
  seats_purchased Int @default(1)
  stripe_customer_id String?
  stripe_subscription_id String?
  cancel_at_period_end Boolean @default(false)
  ended_at DateTime?
  created_at DateTime @default(now())
  updated_at DateTime @updatedAt
  plan Plan @relation(fields: [plan_key], references: [key])
  @@index([clerk_org_id])
  @@map("clerk_org_subscriptions")
}
```

- The webhook route parses events; the Stripe `Event` object has a top-level
  `created` (Unix seconds), but the local `StripeEventLike` interface and the
  `mirrorSubscription` call chain do not thread it through:

```ts
// apps/api/app/webhooks/payments/route.ts:103-108
interface StripeEventLike {
  data: { object: unknown };
  id: string;
  type: string;
}
// mirrorSubscription(data) -> upsertSubscriptionFromWebhook({...})  // no event timestamp
```

- The event returned by `constructEvent` is the Stripe SDK `Event`, which
  includes `created: number`. Confirm the field is available:
  `grep -n "created" packages/billing/src/stripe.ts` and inspect what
  `constructEvent` returns.

- Migration convention: `packages/database/prisma/migrations/<timestamp>_<name>/migration.sql`;
  CI runs a drift check (see plan 025's notes). `dateFromSeconds` already exists
  in `route.ts:43` for converting Stripe Unix seconds to `Date`.
- Existing webhook tests: `apps/api/app/webhooks/payments/route.test.ts` and
  `apps/api/__tests__/webhooks-payments.test.ts`.

## Commands you will need

| Purpose          | Command                                                                 | Expected on success |
|------------------|-------------------------------------------------------------------------|---------------------|
| Format+generate  | `cd packages/database && bunx prisma format && bunx prisma generate`     | exit 0              |
| Create migration | `bun run migrate` (needs dev `DATABASE_URL`)                            | new migration dir   |
| Drift check      | `cd packages/database && bunx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` | "This is an empty migration" |
| Typecheck        | `bun run typecheck`                                                      | exit 0              |
| Tests            | `bunx vitest run apps/api/app/webhooks/payments/route.test.ts apps/api/__tests__/webhooks-payments.test.ts packages/database` | all pass |

## Scope

**In scope**:
- `packages/database/prisma/schema.prisma` — add `stripe_event_created_at DateTime?` to `ClerkOrgSubscription`.
- `packages/database/prisma/migrations/<new>/migration.sql` — add the nullable column.
- `packages/database/src/queries/billing.ts` — add the column to INSERT and a guard to the `DO UPDATE`; extend the `upsertSubscriptionFromWebhook` input type.
- `apps/api/app/webhooks/payments/route.ts` — thread `event.created` through `StripeEventLike`, `handleSubscriptionEvent`/`handleInvoiceEvent`, and `mirrorSubscription`.
- Tests: `apps/api/app/webhooks/payments/route.test.ts` (and/or `apps/api/__tests__/webhooks-payments.test.ts`).

**Out of scope**:
- The signature verification / 400-on-bad-signature behaviour (correct as-is).
- The `stripe_events` dedupe table (it handles a different concern — replays).
- `recount-usage` dispatch.

## Git workflow

- Branch: `improve/026-stripe-ordering-guard`
- Conventional commits (e.g. `fix(billing): make subscription mirror last-writer-by-event-time`).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add the nullable column to the schema + migration

Add to `ClerkOrgSubscription`:

```prisma
  stripe_event_created_at DateTime?
```

Generate the migration (`bun run migrate`, or hand-author per plan 025's Step 2
fallback). The DDL is an additive nullable column:

```sql
ALTER TABLE "clerk_org_subscriptions" ADD COLUMN "stripe_event_created_at" TIMESTAMP(3);
```

**Verify**: drift check → "This is an empty migration"; `bunx prisma generate` → exit 0.

### Step 2: Thread `event.created` through the route

- Add `created: number;` to `StripeEventLike` (`route.ts:103`).
- Change `mirrorSubscription` to accept an `eventCreatedAt: Date` argument and
  pass `stripeEventCreatedAt: eventCreatedAt` into `upsertSubscriptionFromWebhook`.
- In `handleSubscriptionEvent`, compute `dateFromSeconds(event.created)` and pass
  it to `mirrorSubscription`.
- In `handleInvoiceEvent`, likewise pass `dateFromSeconds(event.created)` when it
  calls `mirrorSubscription` for an expanded subscription. (The invoice's
  `created` is a reasonable ordering key for the subscription snapshot it carries.)
- Confirm `constructEvent`'s result actually exposes `created`; if the local type
  narrows it away, widen the type at the `event` binding so `event.created` is
  available. Do not import the full Stripe SDK type into the route if the existing
  code deliberately avoids it — add `created: number` to `StripeEventLike` and
  cast the constructed event to it the same way the existing code already treats
  it as `StripeEventLike` (find where `event` is passed to `processStripeEvent`).

**Verify**: `bun run typecheck` → exit 0.

### Step 3: Add the guard to the upsert

Extend `upsertSubscriptionFromWebhook`'s input type with
`stripeEventCreatedAt: Date | null`, add the column to the INSERT
(`stripe_event_created_at` = `${input.stripeEventCreatedAt}`), and make the
`DO UPDATE` conditional so a stale event is ignored:

```sql
ON CONFLICT (clerk_org_id) DO UPDATE SET
  plan_key = EXCLUDED.plan_key,
  status = EXCLUDED.status,
  current_period_end = EXCLUDED.current_period_end,
  stripe_customer_id = EXCLUDED.stripe_customer_id,
  stripe_subscription_id = EXCLUDED.stripe_subscription_id,
  cancel_at_period_end = EXCLUDED.cancel_at_period_end,
  ended_at = EXCLUDED.ended_at,
  stripe_event_created_at = EXCLUDED.stripe_event_created_at,
  updated_at = NOW()
WHERE clerk_org_subscriptions.stripe_event_created_at IS NULL
   OR EXCLUDED.stripe_event_created_at IS NULL
   OR clerk_org_subscriptions.stripe_event_created_at <= EXCLUDED.stripe_event_created_at
```

The `IS NULL` arms preserve current behaviour for rows/events without a timestamp
(back-compat for any pre-existing row). The `<=` means an event with the same
`created` second as the stored one still applies (Stripe timestamps are
second-granularity; two events in the same second apply in arrival order, which
is the best available tiebreak). A rejected stale event makes `$executeRaw`
report 0 affected rows; no caller checks that count today and none should start
to — silently dropping the stale write is the intended behaviour. Match the
existing raw-SQL style in `billing.ts` (it uses tagged-template `${input.x}`
parameters — keep parameterisation).

**Verify**: `bun run typecheck` → exit 0.

### Step 4: Tests

Add tests proving:
1. A newer event (larger `created`) applied after an older event wins.
2. An older event delivered **after** a newer one does **not** overwrite the
   newer `plan_key`/`status` (the regression this plan fixes).
3. Back-compat: an event applied to a row with `stripe_event_created_at = NULL`
   still applies.

Prefer a `packages/database` integration test if one already exercises
`upsertSubscriptionFromWebhook` against Postgres (check
`packages/database/*.integration.test.ts`); otherwise assert the route threads
`created` through by mocking `upsertSubscriptionFromWebhook` in the route test
and checking it receives the expected `stripeEventCreatedAt`.

**Verify**: `bunx vitest run apps/api/app/webhooks/payments/route.test.ts packages/database` → all pass.

## Test plan

- New cases listed in Step 4 (newer-wins, older-does-not-clobber, null back-compat).
- Structural pattern: existing `route.test.ts` webhook tests and any
  `billing`/`packages/database` integration test.
- Verification: the vitest command in Step 4 → all pass.

## Done criteria

ALL must hold:

- [ ] `ClerkOrgSubscription` has `stripe_event_created_at DateTime?` and a matching additive migration
- [ ] Drift check reports "This is an empty migration"
- [ ] `billing.ts` `DO UPDATE` has the `stripe_event_created_at` ordering `WHERE` guard
- [ ] `route.ts` passes `event.created` (as a `Date`) into the mirror
- [ ] `bun run typecheck` exits 0
- [ ] Tests from Step 4 pass, including the older-does-not-clobber case
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `constructEvent`'s returned event does not expose `created` (then report — a
  different ordering key such as `current_period_end` may be needed).
- Any excerpt in "Current state" does not match live code (drift).
- The drift check will not report an empty migration.

## Maintenance notes

- Reviewer: verify the `WHERE` guard's null arms so a first-ever event (row
  absent → INSERT path) and legacy rows still apply. The guard only affects the
  `DO UPDATE` branch.
- `invoice.*` events use the invoice `created` as the subscription snapshot's
  ordering key, which is an approximation; if Stripe ever delivers an invoice
  carrying a subscription state older than its own `created`, revisit. Acceptable
  for now because invoices are downstream of subscription changes.
- Deferred: a periodic reconciliation job that re-fetches the live subscription
  from Stripe would fully close ordering gaps, but is out of scope here.
