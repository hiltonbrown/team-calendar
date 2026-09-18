# Plan 151: Enforce one active token per feed

## Status

- Priority: P1
- Effort: M
- Risk: MED
- Confidence: HIGH
- Category: security, database integrity
- Depends on: none
- Planned at: `4849878`, 2026-09-18
- Status: DONE

Implemented in `c01f08f` and locally integrated as `b7716b1`. The configured
database had zero duplicate active-token groups; migration
`20260918213000_enforce_one_active_feed_token` deployed successfully. Migration
status is current, drift is zero, and the integrated token unit/database
integration run passed 25/25 tests.

## Why this matters

Feed-token initialisation and rotation use read-then-write transactions without
a database invariant limiting each feed to one active token. Concurrent
rotations can leave multiple valid bearer URLs while the management UI returns
only one, so an undisclosed token may remain valid after an apparent rotation.
The configured database currently has zero duplicate active-token groups, so a
constraint can be added without data repair.

## Scope

- `packages/database/prisma/schema.prisma`
- One generated Prisma migration
- Generated Prisma client output
- `packages/feeds/src/tokens/token-service.ts`
- Focused unit and PostgreSQL integration tests

Do not change the signed token format, persist plaintext tokens, or remove the
intentional ability for authorised viewers to retrieve the full active URL.

## Implementation

1. Add a partial unique PostgreSQL index on `feed_tokens(feed_id)` where status
   is `active`. Document the database-enforced invariant in the schema.
2. Preserve atomic revoke-and-create rotation. Map a unique-conflict race to a
   stable conflict result instead of an unknown failure, leaving the winner's
   token active and the losing transaction rolled back.
3. Add database integration coverage for concurrent initialisation and
   rotation, asserting at most one active row and that revoked tokens do not
   regain validity.
4. Generate the client, deploy the migration to the configured database only
   after duplicate inspection is still zero, then verify migration status and
   drift.

## Verification

- Focused feed token unit and integration suites
- Database client generation
- Configured migration deployment, status and zero drift
- Final candidate check, build, typecheck, unit and integration gates

## STOP conditions

Stop if any configured database contains duplicate active tokens, or if the
partial index cannot be represented safely without editing an applied
migration. Reconcile or rotate duplicates under an explicit data plan first.
