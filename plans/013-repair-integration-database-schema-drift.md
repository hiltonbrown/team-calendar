# Plan 013: Repair integration database schema drift before relying on integration tests

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report, do not improvise. When done, update the status row for this plan
> in `plans/README.md` unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat e04f37d..HEAD -- package.json packages/database/package.json packages/database/prisma/schema.prisma packages/database/prisma/migrations packages/database/plan_limits.integration.test.ts packages/database/src/seed/plan-sync.ts .github/workflows/ci.yml`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.
>
> **Preview branch note**: earlier-numbered plans land on `preview` before
> this one, so this diff will legitimately include their changes. Treat a
> mismatch as a STOP condition only when it is not explained by an earlier
> plan's documented scope; excerpt line numbers may have shifted accordingly.

## Status

- **Priority**: P1
- **Effort**: S-M
- **Risk**: MED
- **Depends on**: none
- **Category**: migration
- **Planned at**: commit `e04f37d`, 2026-07-02
- **Execution status**: DONE on 2026-07-11
- **Implementation result**: No migration change was required. Prisma reported
  all three checked-in migrations applied and the database schema up to date.
- **Landed verification**: Plan 021 isolated the unrelated reconciliation
  fixture UUID collisions and landed through merge commit `d75357a`. The merged
  `preview` branch passed all 53 integration tests, all 18 typecheck tasks, and
  lint across 690 files.
- **Reconciled at**: commit `d4e79a6`, 2026-07-11. A fresh migration-status
  check reports the schema up to date; no code, schema, migration, or test file
  changed after the merged-branch verification.

## Why this matters

The integration test database is behind the current Prisma schema. During the
audit, `bun run test:integration` reached the configured database and failed
because `plans.plan_key` did not exist. Integration tests cannot be trusted
until the test database and migration history agree with the checked-in schema.

## Current state

- Root scripts provide the commands to deploy migrations:

```json
// package.json:17-18
"migrate": "cd packages/database && bunx prisma format && bunx prisma generate && bunx prisma migrate dev",
"migrate:deploy": "cd packages/database && bunx prisma generate && bunx prisma migrate deploy",
```

- Database package integration script:

```json
// packages/database/package.json:11-13
"test": "NODE_ENV=test vitest run --exclude '**/*.integration.test.ts'",
"test:integration": "NODE_ENV=test vitest run .integration.test.ts",
"typecheck": "tsc --noEmit --emitDeclarationOnly false"
```

- Current Prisma model requires `plan_key`:

```prisma
// packages/database/prisma/schema.prisma:1043-1047
model Plan {
  id              String   @id @default(uuid()) @db.Uuid
  key             String   @unique // legacy key, mirrored from plan_key
  plan_key        String   @unique
  name            String
```

- The checked-in migration that introduces it exists:

```sql
-- packages/database/prisma/migrations/20260627000000_stripe_billing/migration.sql:4-9
ALTER TABLE "plans" ADD COLUMN IF NOT EXISTS "plan_key" TEXT;
UPDATE "plans" SET "plan_key" = "key" WHERE "plan_key" IS NULL;
ALTER TABLE "plans" ALTER COLUMN "plan_key" SET NOT NULL;
ALTER TABLE "plans" ADD COLUMN IF NOT EXISTS "is_custom" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "plans" ADD COLUMN IF NOT EXISTS "stripe_price_id" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "plans_plan_key_key" ON "plans"("plan_key");
```

- Audit result: `bun run test:integration` failed after network access reached
  the configured Neon test database. Three tests failed with Prisma error text:
  `The column 'plan_key' does not exist in the current database.` The failing
  paths were `packages/database/plan_limits.integration.test.ts:35` and
  `packages/database/src/seed/plan-sync.ts:14`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Migration status | `cd packages/database && bunx prisma migrate status --schema ./prisma/schema.prisma` | reports database is up to date, or lists unapplied migrations |
| Deploy migrations | `bun run migrate:deploy` | exit 0; applies only checked-in migrations |
| Integration tests | `bun run test:integration` | exit 0 |
| Typecheck | `bun run typecheck` | exit 0 |
| Lint | `bun run check` | exit 0 |

## Scope

**In scope**:

- `packages/database/prisma/migrations/` (create a new forward-only repair
  migration only if migration history is already marked applied but columns are
  absent)
- `packages/database/prisma/schema.prisma` (only if Prisma format changes it
  as part of a legitimate migration repair)
- `.github/workflows/ci.yml` (optional preflight only if the root cause is CI
  not deploying migrations before integration tests)
- `plans/README.md` (status row)

**Out of scope**:

- Editing or deleting the existing `20260627000000_stripe_billing` migration.
- Running `db push` as a repair for a shared test database.
- Seeding production data.
- Changing plan-limit business logic to work around missing columns.

## Git workflow

- Branch: `preview` (shared branch for all plans; implement sequentially in plan-number order on top of the previous plan's commits)
- Commit message: `fix(database): repair integration schema drift`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Confirm the database target is safe

Inspect the environment you are about to use. Confirm `DATABASE_URL` or the
project's Prisma environment points to the integration/test database, not
production. Do not print secrets in logs or commit env files.

**Verify**: `cd packages/database && bunx prisma migrate status --schema ./prisma/schema.prisma` -> command exits successfully and shows the target database name or migration status without exposing secrets.

### Step 2: Apply unapplied checked-in migrations if that is the root cause

If migrate status reports `20260627000000_stripe_billing` or later migrations
as unapplied against the test database, run:

`bun run migrate:deploy`

**Verify**: rerun `cd packages/database && bunx prisma migrate status --schema ./prisma/schema.prisma` -> database is up to date.

### Step 3: If migration history says applied but `plan_key` is absent, add a repair migration

Only do this if step 1 shows migration history is inconsistent with the real
schema. Create a new timestamped migration under
`packages/database/prisma/migrations/` with a forward-only SQL repair modelled
on lines 4-9 of `20260627000000_stripe_billing/migration.sql`:

```sql
ALTER TABLE "plans" ADD COLUMN IF NOT EXISTS "plan_key" TEXT;
UPDATE "plans" SET "plan_key" = "key" WHERE "plan_key" IS NULL;
ALTER TABLE "plans" ALTER COLUMN "plan_key" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "plans_plan_key_key" ON "plans"("plan_key");
```

If `is_custom`, `stripe_price_id`, or other columns from the same migration are
also missing, include the same `ADD COLUMN IF NOT EXISTS` repair statements.
Do not edit old migration files.

**Verify**: `bun run migrate:deploy` -> exit 0. Then migrate status reports up
to date.

### Step 4: Re-run integration tests and quality gates

Run the integration suite and normal repo checks.

**Verify**:

- `bun run test:integration` -> exit 0
- `bun run typecheck` -> exit 0
- `bun run check` -> exit 0

## Test plan

The integration suite is the primary test. If it still fails after migration
repair, only fix failures that are directly caused by schema drift. Do not
expand into unrelated integration failures in this plan.

## Done criteria

- [x] Migration status reports the integration/test database is up to date.
- [x] The database has `plans.plan_key`, `plans.is_custom`, and
      `plans.stripe_price_id` if those columns are required by the live schema.
- [x] `bun run test:integration` exits 0.
- [x] `bun run typecheck` and `bun run check` exit 0.
- [x] No old migration file was edited.
- [x] `plans/README.md` status row updated.

## STOP conditions

Stop and report back if:

- The configured database is production or cannot be identified as test/safe.
- `migrate status` reports migration history conflicts, failed migrations, or
  divergence that affects more than the `plans` table.
- Applying migrations would require destructive SQL.
- Integration tests still fail for reasons unrelated to the missing `plan_key`
  column after the schema is repaired.

## Maintenance notes

- This plan should land before any plan that relies on `bun run
  test:integration` as a final gate.
- If CI already runs migrations correctly but the shared test DB drifted
  manually, document that in the PR rather than adding CI churn.
- Plans 010-012 execute earlier on `preview` and use integration tests as
  verification gates. If one of them hits the `plan_key` drift, this plan may
  be pulled forward and executed ahead of sequence; record the deviation in
  the `plans/README.md` status table.
