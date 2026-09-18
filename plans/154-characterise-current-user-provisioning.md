# Plan 154: Characterise current-user provisioning

## Status

- Priority: P1 test coverage
- Effort: M
- Risk: LOW
- Confidence: HIGH
- Category: tests, tenancy, identity
- Depends on: Plan 152 for final seat-limit assertions
- Planned at: `4849878`, 2026-09-18
- Status: DONE

## Why this matters

`current-user-service.ts` creates or updates the Clerk Organisation projection,
provisions the default feed and holidays, links a Clerk user to an unclaimed
person by case-insensitive email, handles duplicate candidates and falls back
to creating a person. These launch-critical identity and tenancy paths have no
direct characterisation tests.

## Scope

- `packages/availability/src/people/current-user-service.test.ts`
- A co-located PostgreSQL integration test only where mocks cannot prove a race
  or uniqueness invariant
- Production source only for a defect demonstrated by a failing test

## Implementation

1. Cover idempotent Organisation creation/update, default-feed and holiday
   provisioning success/failure, and partial-provisioning recovery.
2. Cover case-insensitive unique email linking, duplicate candidates,
   pre-linked users, fallback person creation and tenant isolation.
3. Cover exact seat-limit acceptance/rejection using Plan 152's authoritative
   contract, plus unique-constraint/race recovery where applicable.
4. Assert expected `Result` errors and that failed branches do not mutate a
   different Clerk Organisation or Organisation.

## Verification

- Focused availability unit suite
- Focused PostgreSQL integration suite if added
- Package typecheck
- Final candidate unit and integration gates

## STOP conditions

Stop and create a separate defect plan if a test exposes a production behaviour
change beyond a narrow, clearly intended correction. Do not rewrite the service
solely to match mock shapes.

## Outcome

Completed on 18 September 2026 in `822a7c6`. The direct suite now covers every
provisioning branch, authoritative seat limits, tenant isolation, partial
recovery and database contention. A failing contention test exposed one narrow
defect: concurrent fallback creation could lose the unique-key race and return
an internal error. The service now handles Prisma `P2002` by re-reading the
tenant-scoped winning Clerk-user record.

Focused verification passed 16 unit tests and three PostgreSQL integration
tests. The final candidate also passed the 398-test availability unit suite,
package typecheck, repository check and the full integration gate.
