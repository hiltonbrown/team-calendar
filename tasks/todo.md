# Stripe billing slice plan

## Discovery
- [x] Confirm current Prisma billing models, package wiring, webhook stub, seed tooling, auth/env helpers, and S-22 placeholder.

## Implementation
- [x] Add additive Prisma schema and migration for Stripe billing mirror, plan keys, limits and events.
- [x] Add typed plan catalogue and idempotent seed sync.
- [x] Add `@repo/billing` package with Stripe client, Checkout, Portal, webhook verification and price resolver.
- [x] Add database billing queries and event idempotency helpers.
- [x] Replace payments webhook stub with raw-body Stripe handler.
- [x] Add generic entitlement helpers in `@repo/auth`.
- [x] Add usage recount job and enforcement call sites.
- [x] Update S-22 billing page with live data and hosted Stripe actions.
- [ ] Add co-located Vitest coverage. (Not completed, environment lacked installed dependencies and registry access.)

## Verification
- [ ] Run targeted tests. (Blocked by missing dependencies.)
- [ ] Run `bun run check` and `bun run test` if feasible. (`bun run check` blocked because `node_modules` is absent.)
- [x] Verify `packages/payments` untouched and no hardcoded plan limits or price ids outside catalogue.
- [ ] Commit changes and create PR.

## Review
- Implemented the Stripe billing slice scaffold and core flow. Verification is limited because dependencies are not installed and registry access returned 403.
