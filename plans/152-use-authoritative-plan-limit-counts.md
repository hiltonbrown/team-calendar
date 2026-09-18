# Plan 152: Use authoritative plan-limit counts

## Status

- Priority: P1
- Effort: L
- Risk: MED
- Confidence: HIGH
- Category: correctness, billing
- Depends on: none
- Planned at: `4849878`, 2026-09-18
- Status: DONE

Implemented and rebased as `73aeef6`, then locally integrated as `fb516c1`.
Repository check, relevant package typechecks, 33 focused tests and the complete
126-test feed unit suite passed in isolation. Against the configured database,
the integrated authoritative-count/feed contention suites passed 16/16 and the
manual-person exact-limit/contention suite passed 2/2 with its database env
loaded explicitly.

## Why this matters

Limit checks read asynchronous `usage_counters`, treat a missing counter as
zero, and refresh counters only after Stripe events. The configured database
currently has no usage-counter rows despite 24 active people, three active
feeds and three active organisations. Feed and staff limits can therefore be
bypassed indefinitely, and manual-person creation does not check the seat limit.

## Scope

- `packages/database/src/queries/billing.ts`
- `packages/auth/entitlements.ts` and focused tests
- Manual-person creation and tests
- Feed creation/default-feed enforcement and focused integration tests where
  required for atomicity
- Usage recount remains available for reporting compatibility

Do not change approved Starter/Premium limits, count Clerk memberships as
staff, or activate paid launch mode.

## Implementation

1. Define authoritative counts by existing product policy: active, unarchived
   people for `seats`; active, unarchived feeds for `feeds`; active,
   unarchived Organisations for `payroll_entities`/`organisations`; and active
   Xero connections where the `connections` limit is requested.
2. Make `withinLimit` read the authoritative count, never default a missing
   projection to zero, while retaining `usage_counters` as a reporting cache.
3. Enforce the seat limit before manual-person creation and preserve the
   existing current-user provisioning checks. Return a truthful validation
   error at the mutation boundary.
4. Serialise database-backed check-and-create flows per Clerk Organisation in
   their transaction, using a PostgreSQL transaction advisory lock or an
   equivalent scoped mechanism. Recheck the authoritative count inside that
   transaction for feed and manual-person mutations so concurrent calls cannot
   overshoot.
5. Add tests for absent/stale counters, every supported count type, archived
   rows, exact-limit rejection and concurrent database mutations.

## Verification

- Focused auth entitlement, manual-person and feed suites
- PostgreSQL integration tests for exact limits and contention
- Final candidate check, build, typecheck, unit and integration gates

## STOP conditions

Stop if current product records define staff or payroll-entity usage
differently from this plan, or if an advisory-lock key cannot be derived without
cross-tenant collision handling. Do not substitute an in-process mutex.
