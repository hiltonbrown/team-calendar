# Blocked items needing a human decision

## Open

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
