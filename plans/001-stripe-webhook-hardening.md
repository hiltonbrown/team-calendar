# Plan 001: Make the Stripe webhook fail loudly, drop the placeholder organisation id, and cover it with tests

> **Reconciliation status**: DONE, verified at commit `e3423da` on
> 2026-07-11. Do not execute this historical plan again. The original
> implementation landed in `6a22002`; follow-up `99ece27` superseded the
> optional `organisationId` approach with the stronger implementation recorded
> under "Reconciliation outcome" below.

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report, do not improvise. When done, update the status row for this plan
> in `plans/README.md` unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 8790bdb..HEAD -- apps/api/app/webhooks/payments/route.ts packages/jobs/src/handlers/recount-usage.ts packages/jobs/src/events.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `8790bdb`, 2026-07-02
- **Reconciled at**: commit `e3423da`, 2026-07-11

## Reconciliation outcome

The finding is fixed and the relevant targeted tests pass. The final code keeps
`organisationId` required on `recount-usage`, resolves the first active
Organisation for the Clerk Organisation, and sends that real ID with the job.
This is preferable to the plan's original instruction to make the field
optional because it preserves the repository invariant that jobs carry both
`clerk_org_id` and `organisation_id`.

Current evidence:

- `apps/api/app/webhooks/payments/route.ts:46-61` logs missing metadata and
  unknown prices at error level without logging full Stripe payloads.
- `apps/api/app/webhooks/payments/route.ts:73-90` resolves and sends a real
  active Organisation ID; the placeholder UUID is gone from this sender.
- `apps/api/app/webhooks/payments/route.ts:109-162` logs validation failures,
  expected unexpanded invoice subscriptions, and unhandled event types.
- `apps/api/app/webhooks/payments/route.ts:165-189` still records an event only
  after processing succeeds, preserving Stripe retry behaviour.
- `packages/jobs/src/handlers/recount-usage.ts:6-14` requires and validates the
  Organisation ID.
- `apps/api/__tests__/webhooks-payments.test.ts:76-225` covers the seven cases
  specified by this plan, adjusted to assert the resolved Organisation ID.
- `apps/api/app/webhooks/payments/route.test.ts:73-170` adds co-located coverage
  of the core ordering and dispatch behaviour.
- `packages/jobs/src/handlers/recount-usage.test.ts:47-81` covers recount input
  validation and tenant-scoped counts.

Verification run during reconciliation:

```text
NODE_ENV=test bunx vitest run apps/api/__tests__/webhooks-payments.test.ts apps/api/app/webhooks/payments/route.test.ts packages/jobs/src/handlers/recount-usage.test.ts
Test Files  3 passed (3)
Tests       16 passed (16)
```

The historical Step 2, test case 3, broad placeholder grep, scope list, and
maintenance note below describe the first implementation and are superseded by
this outcome. They are retained as an audit record, not as current instructions.

## Why this matters

The Stripe webhook at `apps/api/app/webhooks/payments/route.ts` is the only path by which subscription state enters the database. Today, if a subscription event fails Zod parsing, or arrives without `clerk_org_id` metadata, the event is silently skipped and then still recorded as processed, so Stripe never redelivers it and the billing mirror drifts permanently with no error logged. The route also sends a hardcoded placeholder UUID as `organisationId` to the `recount-usage` job, which works only because the handler happens to ignore that field. The route has zero tests despite being the money path.

## Current state

Relevant files:

- `apps/api/app/webhooks/payments/route.ts` - the Stripe webhook POST handler (whole file, 127 lines).
- `packages/jobs/src/handlers/recount-usage.ts` - the `recount-usage` Inngest handler. Its `RecountUsageSchema` (lines 6-9) requires `organisationId: z.string().uuid()` but the handler body only ever uses `parsed.clerkOrgId`.
- `packages/jobs/src/events.ts` - Inngest event payload schemas (check for a `recount-usage` entry; adjust it in step 2 if one exists).
- `packages/database/src/queries/billing.ts` - `isStripeEventProcessed` (lines 94-101), `recordStripeEvent` (lines 103-112, `ON CONFLICT DO NOTHING`), `upsertSubscriptionFromWebhook` (lines 73-92, idempotent upsert on `clerk_org_id`).
- `packages/billing/src/stripe.ts` - `constructEvent` (lines 116-146) returns `Result<Stripe.Event>`; `resolvePlanKey` (line 27).

The problem code, as it exists today (`apps/api/app/webhooks/payments/route.ts`):

```ts
// lines 45-74: mirrorSubscription
async function mirrorSubscription(data: z.infer<typeof SubscriptionSchema>) {
  const clerkOrgId = data.metadata?.clerk_org_id;
  if (!clerkOrgId) {
    log.warn("Stripe subscription event missing clerk_org_id metadata.");
    return;
  }
  const priceId = data.items.data[0]?.price.id;
  const plan = resolvePlanKey(priceId);
  if (!plan.ok) {
    log.warn("Stripe subscription event used an unknown price.");
    return;
  }
  await upsertSubscriptionFromWebhook({ /* ... */ });
  await inngest.send({
    name: "recount-usage",
    data: {
      clerkOrgId,
      organisationId: "00000000-0000-4000-8000-000000000000",
    },
  });
}

// lines 104-125: silent-swallow paths
  if (
    [
      "customer.subscription.created",
      "customer.subscription.updated",
      "customer.subscription.deleted",
    ].includes(event.type)
  ) {
    const parsed = SubscriptionSchema.safeParse(event.data.object);
    if (parsed.success) {
      await mirrorSubscription(parsed.data);
    }
  }

  if (["invoice.payment_failed", "invoice.paid"].includes(event.type)) {
    const parsed = InvoiceSchema.safeParse(event.data.object);
    const subscription = parsed.success ? parsed.data.subscription : null;
    if (subscription && typeof subscription !== "string") {
      await mirrorSubscription(subscription);
    }
  }

  await recordStripeEvent(event.id, event.type);
```

Note the failure semantics that are already correct and must be preserved:

- `recordStripeEvent` runs only after processing succeeds; if `upsertSubscriptionFromWebhook` throws, the route errors, Stripe gets a non-2xx and retries, and the event is reprocessed. Keep that.
- Parse failures and missing metadata are deterministic: retrying will not fix them, so returning 200 and recording the event is the right call. The bug is that nothing is logged at error level, so nobody ever finds out.

Repo conventions that apply:

- No `console.log`; use `import { log } from "@repo/observability/log"` (already imported in this file).
- Service errors use the Result pattern; route handlers map to HTTP. This route already follows it.
- Australian English in copy and comments. No em dashes anywhere.
- Test style: co-located Vitest. For module mocking style, see `packages/billing/src/stripe.test.ts` (uses `vi.mock` before a dynamic `await import`). For route-handler test style, see `apps/api/__tests__/health.test.ts` (imports the route export directly and calls it).

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `bun install` | exit 0 |
| Typecheck | `bun run typecheck` | exit 0 |
| Lint | `bun run check` | exit 0 |
| Run one test file | `cd apps/api && NODE_ENV=test bunx vitest run __tests__/webhooks-payments.test.ts` | all pass |
| Jobs package tests | `cd packages/jobs && NODE_ENV=test bunx vitest run src/handlers/recount-usage.test.ts` | all pass |
| Full unit tests | `bun run test` | exit 0 |

## Scope

**In scope** (the only files you should modify or create):

- `apps/api/app/webhooks/payments/route.ts`
- `apps/api/__tests__/webhooks-payments.test.ts` (create)
- `packages/jobs/src/handlers/recount-usage.ts` (make `organisationId` optional)
- `packages/jobs/src/handlers/recount-usage.test.ts` (extend if it exists; create otherwise)
- `packages/jobs/src/events.ts` (only if it declares a `recount-usage` payload schema)
- `plans/README.md` (status row)

**Out of scope** (do NOT touch, even though they look related):

- `packages/database/src/queries/billing.ts` - the idempotency helpers are correct as-is.
- `packages/billing/src/stripe.ts` - signature verification is correct; 400 on bad signature is fine (Stripe retries on any non-2xx).
- Adding handlers for new Stripe event types (charge.*, etc.). Log unhandled types; do not process them.
- Any change to the Prisma schema.

## Git workflow

- Branch: `preview` (shared branch for all plans; implement sequentially in plan-number order on top of the previous plan's commits)
- Conventional commits, e.g. `fix(api): log dropped Stripe webhook events before recording them`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Log every dropped event at error level

In `apps/api/app/webhooks/payments/route.ts`:

1. In `mirrorSubscription`, upgrade the two `log.warn` calls to `log.error` and include identifying context (no full payloads): for missing metadata log `{ stripeSubscriptionId: data.id }`; for unknown price log `{ priceId, stripeSubscriptionId: data.id }`.
2. In the subscription-events block, add an `else` branch on `parsed.success` that logs at error level with `{ eventId: event.id, eventType: event.type, issues: parsed.error.issues }` and a message like `"Stripe subscription event failed validation and was skipped."`.
3. In the invoice-events block, log at error level when `parsed.success` is false (same shape). When `subscription` is a plain string (unexpanded), log at info level that the invoice event carried no expanded subscription and was skipped; that is an expected shape, not an error.
4. At the end of the handler, before `recordStripeEvent`, log unhandled event types at info level: if `event.type` is not one of the six handled types, `log.info("Stripe event type not handled.", { eventId: event.id, eventType: event.type })`.

Do not change the response codes or the position of `recordStripeEvent`.

**Verify**: `bun run typecheck` → exit 0. `bun run check` → exit 0.

### Step 2: Remove the placeholder organisationId

1. In `packages/jobs/src/handlers/recount-usage.ts`, change `RecountUsageSchema` so `organisationId` is `z.string().uuid().optional()`. The handler body does not use it; no other handler change is needed.
2. In `packages/jobs/src/events.ts`, if a `recount-usage` event payload schema exists, make `organisationId` optional there in the same way. If the schemas there are structured differently (for example a shared "every job carries organisationId" helper), STOP and report instead of restructuring.
3. Search for other senders: `grep -rn "recount-usage" apps packages --include="*.ts" | grep -v test | grep -v node_modules`. Senders that pass a real `organisationId` may keep doing so; only the webhook's placeholder goes away.
4. In `apps/api/app/webhooks/payments/route.ts`, delete the `organisationId: "00000000-0000-4000-8000-000000000000"` line from the `inngest.send` payload.

Context for why this is safe: the repo convention (CLAUDE.md) says jobs carry both `clerk_org_id` and `organisation_id`, but `recount-usage` is a Clerk-Organisation-level job; all three of its queries filter by `clerk_org_id` only. Making the field optional records that honestly instead of faking a UUID.

**Verify**: `bun run typecheck` → exit 0. `grep -rn "00000000-0000-4000-8000" apps packages --include="*.ts" | grep -v node_modules` → no matches.

### Step 3: Add tests for the webhook route

Create `apps/api/__tests__/webhooks-payments.test.ts`. Mock the collaborators with `vi.mock` before a dynamic `await import("../app/webhooks/payments/route")`, following the mocking style of `packages/billing/src/stripe.test.ts`:

- `@repo/billing`: `constructEvent` returns `{ ok: true, value: <fixture event> }` (or an error Result for the signature-failure case), `resolvePlanKey` returns `{ ok: true, value: "premium" }` for a known price id.
- `@repo/database`: `isStripeEventProcessed`, `recordStripeEvent`, `upsertSubscriptionFromWebhook` as `vi.fn()`.
- `@repo/jobs`: `inngest: { send: vi.fn() }`.
- `@repo/observability/log`: `log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() }`.
- `@/env`: `env: { STRIPE_WEBHOOK_SECRET: "whsec_test" }` (placeholder string only; never a real secret).

Build minimal event fixtures as plain objects, e.g. a `customer.subscription.updated` event whose `data.object` matches `SubscriptionSchema` (id, customer, status, items.data[0].price.id, metadata.clerk_org_id, cancel_at_period_end).

Cases to cover (see Test plan for the full list). Invoke as `await POST(new Request("http://localhost/webhooks/payments", { method: "POST", body: "raw" }))`.

**Verify**: `cd apps/api && NODE_ENV=test bunx vitest run __tests__/webhooks-payments.test.ts` → all pass.

### Step 4: Cover the schema change in packages/jobs

Extend `packages/jobs/src/handlers/recount-usage.test.ts` (create it if absent, modelled on `packages/jobs/src/handlers/rebuild-feed-cache.test.ts` for mocking style): assert `RecountUsageSchema`-driven parsing accepts a payload without `organisationId` and still accepts one with it. If the schema is not exported, test through the exported `recountUsage` function with a mocked `@repo/database`.

**Verify**: `cd packages/jobs && NODE_ENV=test bunx vitest run src/handlers/recount-usage.test.ts` → all pass.

## Test plan

New tests in `apps/api/__tests__/webhooks-payments.test.ts`:

1. Bad signature: `constructEvent` returns an error Result → response 400, nothing recorded.
2. Duplicate event: `isStripeEventProcessed` resolves true → 200, `upsertSubscriptionFromWebhook` not called, `recordStripeEvent` not called again.
3. Happy path `customer.subscription.updated` → `upsertSubscriptionFromWebhook` called with mapped fields, `inngest.send` called with `{ clerkOrgId }` and NO `organisationId` key, `recordStripeEvent` called with the event id.
4. Subscription event failing `SubscriptionSchema` → 200, `log.error` called, `upsertSubscriptionFromWebhook` NOT called, `recordStripeEvent` still called (deterministic failure is not retried).
5. Subscription event missing `metadata.clerk_org_id` → 200, `log.error` called, no upsert.
6. Unhandled event type (e.g. `charge.succeeded`) → 200, `log.info` called with the event type, `recordStripeEvent` called.
7. `upsertSubscriptionFromWebhook` rejects → the route throws (or returns 5xx), and `recordStripeEvent` is NOT called, preserving Stripe retry.

## Done criteria

- [ ] `bun run typecheck` exits 0
- [ ] `bun run check` exits 0
- [ ] `cd apps/api && NODE_ENV=test bunx vitest run __tests__/webhooks-payments.test.ts` passes with the 7 cases above
- [ ] `grep -rn "00000000-0000-4000-8000" apps packages --include="*.ts" | grep -v node_modules` returns nothing
- [ ] `bun run test` exits 0
- [ ] `git status` shows no modified files outside the Scope list
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The excerpts above no longer match `apps/api/app/webhooks/payments/route.ts` (drift since `8790bdb`).
- `packages/jobs/src/events.ts` couples `organisationId` into a shared schema used by all jobs, so making it optional would loosen other handlers.
- You find another sender of `recount-usage` that relies on `organisationId` being present in the handler (it should not; the handler ignores it, but verify).
- Route tests cannot import the route module without pulling in real env validation that fails; report what `@/env` requires rather than weakening env validation.

## Maintenance notes

- If a future change makes `recount-usage` genuinely organisation-scoped, reinstate the required `organisationId` and thread the real value from subscription metadata, which will need to be added to Stripe checkout metadata first.
- Reviewers should confirm no full Stripe payloads are logged, only ids, types, and Zod issue lists.
- Deferred intentionally: handling additional Stripe event types, and alerting/metrics on the new error logs (observability wiring is a separate concern).
