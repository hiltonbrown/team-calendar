# Blocked items needing a human decision

## Open

### D. Xero daily rate-limit cap is per-instance, not cross-instance (design choice)

Recorded while implementing slice 09 (Xero rate limiting). The limiter in
`packages/xero/src/rate-limit` enforces the per-org 60/min, 5,000/day, five-concurrent
and app-wide 10,000/min ceilings with an in-process token bucket plus concurrency gate.
This is correct within a single warm runtime, but `apps/api` runs on Vercel serverless,
where each invocation can land on a fresh instance with its own process memory. The
per-minute and concurrency gates degrade gracefully (each instance simply stays well
under the ceiling), but the 5,000/day cap cannot be enforced exactly across instances
without shared, durable state.

Strictly, a cross-instance daily cap needs a durable store (for example Vercel KV, which
`packages/feeds` already uses) holding a per-org rolling daily counter. Per the slice's
hard rule, that design decision is recorded here before building a KV-backed limiter
rather than silently shipping an in-process daily cap as if it were authoritative.

Decision shipped for now: the limiter is built with a clean separation between its
bucket/concurrency logic and the runtime it runs in, so a durable counter can be slotted
in without touching the call sites. The in-process limiter is the per-instance enforcement
layer and the inbound sync jobs run single-flight per org, so the practical daily exposure
is bounded. The KV-backed daily counter is deferred pending a human decision on whether to
add `@repo/feeds`-style KV access into `packages/xero` (currently KV is not an `@repo/xero`
dependency).

Decision needed: add a durable KV-backed per-org daily counter to make the 5,000/day cap
exact across serverless invocations, or accept the in-process per-instance cap as
sufficient given single-flight sync scheduling.

### A. Pre-existing xero_connections / xero_tenants migration drift

Discovered while adding the slice 01 schema-parity work and the slice 02 integration
tests. `packages/database/prisma/schema.prisma` declares many columns on
`xero_connections` that no migration creates, for example `status`, `access_token_iv`,
`access_token_auth_tag`, `refresh_token_iv`, `refresh_token_auth_tag`,
`token_key_version`, `token_encrypted_at`, `last_connected_at`, `last_disconnected_at`,
`last_error_code`, `last_error_message`, `stale_since`, `disconnected_at`,
`disconnected_by_user_id`. A database built purely from migrations (`migrate deploy`)
therefore lacks them, and creating a `xero_connections` row through the Prisma client
fails with "column status does not exist". This was never exercised before because no
test created a `xero_connection`. It was not listed in `launch-plan/REVIEW.md` and is
outside slice 01's enumerated scope, so it is flagged rather than guessed.

Decision needed: generate a migration that captures these schema-only columns
(recommended; brings the migration history back in line with the schema), or remove the
columns from the schema if they are not wanted. Until this is resolved, integration tests
cannot create `xero_connections` or `xero_tenants` against a migrate-deployed database;
the slice 01 `leave_balances` suite was written to avoid that dependency.

### B. Integration test database must be migrated out of band

There is no `migrate` step in CI. The shared Neon database that the `*.integration.test.ts`
suites hit is migrated manually. The new slice 01 migrations
(`add_plans_and_plan_limits`, `leave_balances_nullable_tenant`) must be applied with
`bun run migrate:deploy` before the new integration suites will pass. The suites assume a
migrate-deployed schema (the partial unique index only exists under `migrate deploy`, not
`db push`).

### C. email dev-preview app build failure (pre-existing)

`apps/email` (React Email preview, not deployed to production, no `vercel.json`) fails
`next build` while prerendering `/preview/*` because of a network call made during the
build. It is excluded from the root `build` script. A separate fix is needed if the email
build is ever required in CI.

## Resolved

### A. Pre-existing xero_connections / xero_tenants migration drift (RESOLVED)

Resolved by the Slice 1 baseline squash migration (`00000000000000_init`). The migration
history was replaced with a single baseline that builds the full schema from empty,
including all `xero_connections`/`xero_tenants` columns and the eight tables that were
previously absent from the history. `prisma migrate deploy` against a clean database
succeeds; `prisma migrate diff --from-config-datasource` confirms zero drift.

Note: this is a pre-production squash migration. Historical data-transform SQL in the old
incremental migrations was intentionally discarded; there is no production data to preserve.

### B. Integration test database must be migrated out of band (RESOLVED)

Resolved by `.github/workflows/ci.yml`, which spins up an ephemeral PostgreSQL 16 service,
runs `bun run migrate:deploy` before any test suite, then runs both unit and integration
tests against the migrate-deployed schema. The drift-check step confirms schema.prisma
matches the deployed migrations on every CI run.

## 1. "Workspace" vs "Organisation" labelling in `settings/general` (RESOLVED)

This was the one item left for a human decision during the pre-launch cleanup
(Phase 4): the General settings screen rendered a "Workspace" card (the Clerk
Organisation) next to an "Organisation" card (the payroll entity), and renaming
"workspace" naively would have conflated the two tenancy levels.

**Decision (applied in this PR):**
- The top-level tenant (Clerk Organisation, read from Clerk) is labelled
  **"Account"**.
- The payroll-entity `Organisation` row is labelled **"Payroll entity"**.
- The word "workspace" is removed from the product entirely, in UI copy and code
  identifiers.

Applied: Card 1 is "Account" (name/slug, "No active account selected"); Card 2 is
"Payroll entity" with its fields and behaviour unchanged; the `GeneralClient`
`workspace` prop is `account`, `updateWorkspaceNameAction` is
`updateAccountNameAction`, `WorkspaceNameSchema` is `AccountNameSchema`, and the
audit action string is `account.name_changed`. The related billing copy in
`packages/availability/src/settings/billing-service.ts` and the dashboard/billing
UI now use "account owner" / "this account".
