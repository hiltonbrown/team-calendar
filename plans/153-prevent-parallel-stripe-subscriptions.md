# Plan 153: Prevent parallel Stripe subscriptions

## Status

- Priority: P1 when launch mode is `paid`; P2 during `early_access`
- Effort: M
- Risk: MED
- Confidence: HIGH
- Category: billing, correctness
- Depends on: operator authorisation for paid-mode hardening, granted 18 September 2026
- Planned at: `4849878`, 2026-09-18
- Status: DONE

## Why this matters

Every checkout action creates a subscription-mode Stripe Checkout Session.
Repeated or concurrent starts can create multiple chargeable subscriptions,
while the database mirrors only one subscription per Clerk Organisation. The
actual production launch mode is currently missing, so paid billing is disabled
by source fallback but the release contract is not configured or verified.

## Scope

- `packages/billing/src/stripe.ts` and focused tests
- Billing server action tests where required
- No webhook schema or catalogue change

## Implementation

1. Resolve the current subscription before creating Checkout. Route an
   existing non-terminal subscription to the Customer Portal or reject the
   initial-purchase action with a clear conflict result.
2. Supply a stable Stripe idempotency key for the same organisation, requested
   plan and subscription transition so concurrent requests reuse one Checkout
   Session.
3. Preserve a distinct path for a genuinely terminal subscription and test
   active, trialling, incomplete, past-due, cancelled and absent states.
4. Verify webhook mirroring still rejects cross-organisation customer reuse.

## Verification

- Focused billing and action suites
- Paid-mode preflight with configured Stripe values
- Final candidate check, build, typecheck, unit and integration gates

## STOP conditions

Do not implement until the operator confirms `paid` is the release mode or
authorises paid-mode hardening during early access. Do not invent upgrade,
downgrade or duplicate-subscription recovery policy.

## Outcome

Completed on 18 September 2026 in `0af2573`. Existing non-terminal mirrored
subscriptions now return a conflict directing the organisation to the billing
portal. Absent, cancelled and incomplete-expired subscriptions retain a fresh
Checkout path, and identical organisation, plan and subscription transitions
share a deterministic SHA-256 Stripe idempotency key.

Verification passed 14 billing tests, 26 billing action and payment webhook
tests, billing and app typechecks, scoped Ultracite and `git diff --check`. The
merged candidate also passed repository check, 19 typecheck tasks, boundaries,
app/API/web builds, 17 unit-test tasks and all five integration-test packages.
Paid-mode production preflight remains a deployment gate because production
launch mode and Stripe configuration were not changed by this source plan.
