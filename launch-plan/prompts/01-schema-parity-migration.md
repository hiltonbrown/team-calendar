# Prompt 01: Schema parity migration

## Role and context

You are a senior engineer on LeaveSync, a multi-tenant leave management and availability
publishing platform on next-forge (Turborepo, Bun, Prisma 7, Neon). This slice brings the
Prisma schema and migrations into parity with `PRODUCT.md`, which is the authoritative
source of truth. It is the first slice in the launch series because later slices (inbound
balance sync, manual balance editing) depend on the `leave_balances.xero_tenant_id` column
becoming nullable. This is the only slice in the series permitted to touch `schema.prisma`
and migrations.

## Hard rules

- Branch first off the latest `main`: `git checkout main && git pull origin main && git
  checkout -b launch/01-schema-parity`.
- Australian English in all copy and comments. No em dashes; use commas, colons, semicolons
  or parentheses.
- This slice owns `packages/database/prisma/schema.prisma` and migrations. Do not change
  domain packages or app code beyond what a generated client type change forces.
- One migration per logical schema change. Never hand-edit a generated migration after the
  fact; if it is wrong, roll it back and regenerate.
- Do not use `as any` or lint suppression to force compilation.
- Preserve and update tests. The DB-integration tests in `packages/database` assert
  constraints and indexes; update them to match the new schema.
- If anything materially affects architecture, schema intent, or user-visible behaviour
  beyond this brief (for example, whether to align PRODUCT prose to the schema or vice versa
  for the three drifted constraints), stop and write the question to `BLOCKED.md` rather than
  guessing.

## Authoritative references

- `PRODUCT.md` sections "Database schema", "Indexes and constraints summary",
  entities list (lines ~282-428), and `:366` (leave balances nullable).
- `packages/database/prisma/schema.prisma` (canonical), `packages/database/prisma.config.ts`.
- `launch-plan/REVIEW.md` "Schema and migration gaps".

## Phased steps

1. **Delete the stale root schema.** Remove `/schema.prisma` (the 918-line repo-root
   duplicate). Confirm nothing references it: `prisma.config.ts:13` and
   `packages/database/package.json:7-8` both point at `prisma/schema.prisma`.
2. **Add `Plan` and `PlanLimit` models** to `packages/database/prisma/schema.prisma`,
   matching the PRODUCT billing-tables description: `plan_limits` unique on
   `(plan_id, limit_type)`; both carry `id`, `created_at`, `updated_at`. Relate
   `clerk_org_subscriptions` to `plans` as PRODUCT implies. Generate a migration
   `bunx prisma migrate dev --name add_plans_and_plan_limits` (run from `packages/database`).
3. **Make `leave_balances.xero_tenant_id` nullable, with null-safe uniqueness.** Change
   `xero_tenant_id String @db.Uuid` to optional (`String? @db.Uuid`) on the `LeaveBalance`
   model (~schema:635), keeping the existing unique `(person_id, xero_tenant_id,
   leave_type_xero_id)` for Xero-sourced rows. Because PostgreSQL treats `NULL` as distinct
   in a normal unique constraint (the same trap PRODUCT calls out for `availability_records`),
   that key will NOT prevent duplicate manual balances once `xero_tenant_id` is null. Add a
   partial unique index for the manual case so prompt 05's create-or-update can target a
   single row: a unique index on `(person_id, leave_type_xero_id) WHERE xero_tenant_id IS
   NULL`. Prisma's `@@unique` cannot express a `WHERE` clause, so add this partial index with
   raw SQL inside the migration (`CREATE UNIQUE INDEX ... WHERE xero_tenant_id IS NULL`) and
   document it with a schema-reference comment on the model. Generate a migration
   `--name leave_balances_nullable_tenant` (edit the generated SQL to append the partial
   index in the same migration, since it is part of the same logical change).
4. **Reconcile constraint-drift prose.** For the three constraints where the live schema and
   PRODUCT prose disagree (`notification_preferences` unique on `organisation_id` not
   `clerk_org_id`; `usage_counters` on `metric_key/period_*` not `counter_type`;
   `public_holidays` on `(organisation_id, source, source_remote_id)` not
   `(organisation_id, location_id, date, source)`), update `PRODUCT.md` prose to match the
   live schema (recommended default; the schema choices are more defensible). Do not change
   the schema for these unless `BLOCKED.md` resolution says otherwise.
5. **Refresh stale "pending migration" prose** in `PRODUCT.md` (lines ~318, 346, 362, 386,
   390): the `clerk_org_id` columns on `feed_tokens`/`feed_scopes`/`availability_publications`
   and the `xero_tenants` to `organisations` relation are already applied; reword them as
   done.
6. **Update `packages/database` tests** that assert constraints/indexes to reflect the new
   tables and the nullable column.

## Verification gate

From the repo root, all must pass: `bun install`, `bun run build`, `bun run check`,
`bun run boundaries`, `bun run test` (DB-integration tests require a reachable database; if
none is available in this environment, run `bunx prisma validate` from `packages/database`
and the unit suites, and note the integration tests as environment-gated in the PR).

## Commits and PR

Conventional commits, one logical change each, for example: `chore: remove stale root
schema.prisma`, `feat: add plans and plan_limits tables`,
`feat: make leave_balances.xero_tenant_id nullable`, `docs: align PRODUCT schema prose to
live schema`. Push the branch and open a PR titled "Schema parity migration".

## Acceptance criteria

- [ ] Root `/schema.prisma` deleted; build still resolves the canonical schema.
- [ ] `Plan` and `PlanLimit` models present with the `(plan_id, limit_type)` unique, backed by a migration.
- [ ] `leave_balances.xero_tenant_id` nullable, backed by a migration, with a partial unique
      index on `(person_id, leave_type_xero_id) WHERE xero_tenant_id IS NULL` so manual
      balances cannot duplicate.
- [ ] PRODUCT prose matches the live schema for the three drifted constraints and the formerly-pending items.
- [ ] `bunx prisma validate` passes; `packages/database` constraint tests updated.
- [ ] One migration per change; no hand-edited migrations.
