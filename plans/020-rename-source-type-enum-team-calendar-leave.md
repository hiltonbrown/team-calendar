# Plan 020: Migrate the `availability_source_type` enum value `leavesync_leave` → `team_calendar_leave` so the data pages load

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 6b14003..HEAD -- packages/database/prisma/schema.prisma packages/availability/src/plans/plan-service.ts packages/availability/src/approvals/approval-service.ts packages/availability/src/analytics/leave-reports-service.ts packages/availability/src/records/record-type-categories.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: migration (root cause of a correctness bug)
- **Planned at**: commit `6b14003`, 2026-06-26

## Why this matters

Four authenticated pages — `/plans`, `/calendar`, `/leave-reports`,
`/leave-approvals` — render an "Unable to load …" error state and show no data.
The cause is **schema/database drift introduced by the LeaveSync → Team Calendar
rebrand** (commit `6b14003 "final rebrand steps"`). That commit renamed the
Postgres enum value `availability_source_type.leavesync_leave` to
`team_calendar_leave` in `schema.prisma`, in the generated Prisma client, in the
`00000000000000_init` migration file, and in all service code — **but it never
created a migration to rename the value on the already-provisioned database.**

The live Neon database still holds the old enum label:

```
availability_source_type => ['xero', 'xero_leave', 'leavesync_leave', 'manual']
```

while every record-listing query now filters on the new label, e.g.
`source_type: { in: ["manual", "team_calendar_leave"] }`. Postgres rejects the
unknown enum label at bind time (`invalid input value for enum
availability_source_type: "team_calendar_leave"`), the service `catch` blocks
turn the thrown error into a failed `Result`, and the page renders
`FetchErrorState`. After this plan lands, the enum value is renamed in place and
all four pages load.

`prisma migrate status` reports "Database schema is up to date" because it only
checks which migration *files* are recorded as applied — it does not detect that
the `init` migration file was hand-edited after it was applied, nor that the live
enum disagrees with `schema.prisma`. That is why the drift went unnoticed.

## Current state

### The drift (verified during recon)

- **Live DB enum** `availability_source_type` = `xero, xero_leave, leavesync_leave, manual`
- **`schema.prisma` enum** `availability_source_type` = `xero, xero_leave, team_calendar_leave, manual`
- **`availability_records` table is empty (0 rows)** — so the rename touches no
  data and cannot fail on existing rows. Confirmed via `SELECT count(*)`.
- Every other enum in the database matches `schema.prisma` exactly. This is the
  **only** drifted enum.
- No remaining `leavesync` references exist in `packages/` or `apps/` source
  (outside the generated client). The code is fully on `team_calendar_leave`;
  only the database is behind.

### Files that prove all four pages hit the same enum

The error is reached through these queries (you do **not** edit these — they are
already correct; they are listed as evidence that one enum rename fixes all four
pages):

- `packages/availability/src/plans/plan-service.ts:805`
  ```ts
  source_type: { in: ["manual", "team_calendar_leave"] },
  ```
  (drives `/plans` via `listMyRecords` / `listTeamRecords` → `listRecordsForScope`)
- `packages/availability/src/approvals/approval-service.ts:259` and `:365`
  ```ts
  source_type: { in: ["team_calendar_leave", "xero_leave"] },
  ```
  (drives `/leave-approvals` via `listForApprover` / `getApprovalSummaryCounts`)
- `packages/availability/src/analytics/leave-reports-service.ts:461`
  ```ts
  source_type: { in: ["xero_leave", "team_calendar_leave"] },
  ```
  (drives `/leave-reports` via `aggregateLeaveReports`)
- `packages/availability/src/records/record-type-categories.ts:60` and `:65`
  ```ts
  return ["xero_leave", "team_calendar_leave"];
  ...
  return ["xero_leave", "team_calendar_leave", "manual"];
  ```
  (the source-type filter helper used by the calendar query → drives `/calendar`
  via `getCalendarRange`)

### Enum definition in the schema (already correct — do NOT change)

`packages/database/prisma/schema.prisma:134`:

```prisma
enum availability_source_type {
  xero
  xero_leave
  team_calendar_leave
  manual
}
```

### Migration layout & conventions

- Migrations live in `packages/database/prisma/migrations/`. There is currently
  exactly one: `00000000000000_init/` (a squashed baseline) plus
  `migration_lock.toml`.
- A migration is a directory named `<14-digit-timestamp>_<slug>/` containing a
  single `migration.sql` file. Prisma applies any migration whose directory name
  is not yet recorded as applied in the `_prisma_migrations` table.
- Repo rule (from `CLAUDE.md`): "One migration per schema change. Never hand-edit
  generated migrations." You are adding **one new** migration; you do not touch
  the existing `init` migration.
- Apply pending migrations with **`migrate deploy`** (non-destructive: it applies
  only un-applied migrations, never resets, never needs a shadow database). Do
  **not** use `migrate dev` here — it would attempt drift detection against the
  hand-edited `init` migration and may prompt a destructive database reset.

## Commands you will need

All commands run from the **repo root** unless stated. `.env.local` at the repo
root holds `DATABASE_URL`; plain scripts do not auto-load it, so a script step
sources it explicitly.

| Purpose | Command | Expected on success |
|---|---|---|
| Apply migrations | `bun run migrate:deploy` | exit 0; reports 1 migration applied |
| Inspect DB enum (script) | `bun <verify script>` (provided in Step 3) | prints `team_calendar_leave`, no `leavesync_leave` |
| Migration status | `cd packages/database && bunx prisma migrate status` | "Database schema is up to date!" |
| Typecheck | `bun run typecheck` | exit 0 |
| Lint | `bun run check` | exit 0 |

`bun run migrate:deploy` resolves to (from the root `package.json`):
`cd packages/database && bunx prisma generate && bunx prisma migrate deploy`.

## Scope

**In scope** (the only files you create/modify):

- `packages/database/prisma/migrations/20260626120000_rename_source_type_leavesync_to_team_calendar/migration.sql` (create)
- `plans/README.md` (status row update only)

**Out of scope** (do NOT touch, even though they look related):

- `packages/database/prisma/migrations/00000000000000_init/migration.sql` — the
  baseline migration. It already defines the enum with `team_calendar_leave`,
  which is correct for fresh databases. Editing an applied migration is forbidden
  by repo policy and will not fix the existing database.
- `packages/database/prisma/schema.prisma` — already correct; no change needed.
- Any `packages/availability/**` service file — already on the new label; the
  enum rename makes their existing queries valid. Do not "fix" them.
- The generated client under `packages/database/generated/**` —
  `prisma generate` (run by `migrate:deploy`) regenerates it; do not hand-edit.
- Do not seed data, create teams/locations, or connect Xero. The pages load with
  zero records; an empty result is the correct, expected post-fix state (they
  show "No plans found" / empty calendars, not "Unable to load").

## Git workflow

- Branch: `advisor/020-rename-source-type-enum` (create from `main`; do not work
  directly on `main`).
- Conventional commits (repo style — see `git log`: `feat:`, `fix:`, `chore:`).
  Suggested message:
  `fix(database): rename availability_source_type leavesync_leave to team_calendar_leave`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Create the migration directory and SQL

Create the file
`packages/database/prisma/migrations/20260626120000_rename_source_type_leavesync_to_team_calendar/migration.sql`
with **exactly** this content:

```sql
-- Complete the LeaveSync -> Team Calendar rebrand at the database level.
-- The `00000000000000_init` migration was edited to define
-- availability_source_type with the value 'team_calendar_leave', but databases
-- provisioned before the rebrand still carry the old label 'leavesync_leave'.
-- Every record-listing query now filters on 'team_calendar_leave', so the old
-- databases reject those queries ("invalid input value for enum
-- availability_source_type"). Rename the value in place.
--
-- Guarded with an existence check so this migration is a no-op on a freshly
-- migrated database (where init already created the value as
-- 'team_calendar_leave'). RENAME VALUE preserves any existing rows.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'availability_source_type'
      AND e.enumlabel = 'leavesync_leave'
  ) THEN
    ALTER TYPE "availability_source_type"
      RENAME VALUE 'leavesync_leave' TO 'team_calendar_leave';
  END IF;
END
$$;
```

**Verify**: `ls packages/database/prisma/migrations/` →
lists both `00000000000000_init` and
`20260626120000_rename_source_type_leavesync_to_team_calendar`.

### Step 2: Apply the migration

From the repo root, with `DATABASE_URL` available (it is in the root
`.env.local`, which the Prisma config loads):

```
bun run migrate:deploy
```

**Verify**: command exits 0 and the output contains a line indicating **one**
migration was applied, naming
`20260626120000_rename_source_type_leavesync_to_team_calendar`
(e.g. "Applying migration `20260626120000_rename_source_type_leavesync_to_team_calendar`"
and "1 migration applied"). If it reports applying **more than one** migration,
or reports applying the `init` migration, that is a STOP condition (see below).

Then confirm Prisma considers the schema settled:

```
cd packages/database && bunx prisma migrate status
```

**Verify**: prints "Database schema is up to date!".

### Step 3: Verify the enum changed and the failing query now succeeds

Create a throwaway verification script (delete it after — it is not part of the
deliverable). Put it at the repo root as `verify-enum.ts`:

```ts
import { neonConfig } from "@neondatabase/serverless";
import { PrismaNeon } from "@prisma/adapter-neon";
import ws from "ws";
import { PrismaClient } from "./packages/database/generated/client";

neonConfig.webSocketConstructor = ws;
const db = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL! }),
});

const enumRows = await db.$queryRawUnsafe<{ value: string }[]>(`
  select e.enumlabel::text as value
  from pg_type t join pg_enum e on e.enumtypid = t.oid
  where t.typname = 'availability_source_type'
  order by e.enumsortorder;
`);
const values = enumRows.map((r) => r.value);
console.log("ENUM:", values.join(","));
if (!values.includes("team_calendar_leave")) {
  throw new Error("FAIL: team_calendar_leave still missing");
}
if (values.includes("leavesync_leave")) {
  throw new Error("FAIL: leavesync_leave still present");
}

// The exact filter that was throwing before — must now run without error.
const rows = await db.availabilityRecord.findMany({
  where: { source_type: { in: ["manual", "team_calendar_leave"] } },
  take: 1,
});
console.log("QUERY OK, rows:", rows.length);
console.log("PASS");
process.exit(0);
```

Run it (sourcing the env first so `DATABASE_URL` is set):

```
set -a; source .env.local; set +a
bun verify-enum.ts
```

**Verify**: output ends with `PASS`, the `ENUM:` line is
`xero,xero_leave,team_calendar_leave,manual`, and `QUERY OK, rows: 0` appears
(0 rows is expected — the table is empty; the point is that the query no longer
throws).

Then delete the script:

```
rm verify-enum.ts
```

**Verify**: `git status --porcelain verify-enum.ts` → no output.

### Step 4: Confirm no source code regressions

```
bun run typecheck
bun run check
```

**Verify**: both exit 0. (No source files changed, so these should be unaffected;
this is a guard that the new migration directory did not confuse any tooling.)

## Test plan

This change is a data-layer migration with no application-code change, so there is
no new unit test to add (the repo has no migration-execution test harness, and
the existing service tests already assert on the `team_calendar_leave` value).

The verification in **Step 3** is the regression check: it asserts (a) the enum
now contains `team_calendar_leave` and not `leavesync_leave`, and (b) the precise
`findMany` filter that previously threw now executes. Treat Step 3 passing as the
test gate.

Optional manual end-to-end confirmation (not required for done, useful if a dev
server is already running and you can authenticate): visit `/plans`, `/calendar`,
`/leave-reports`, and `/leave-approvals`; each should render its normal empty/data
state instead of "Unable to load …".

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `packages/database/prisma/migrations/20260626120000_rename_source_type_leavesync_to_team_calendar/migration.sql` exists with the SQL from Step 1.
- [ ] `bun run migrate:deploy` exited 0 and applied exactly that one migration.
- [ ] `cd packages/database && bunx prisma migrate status` prints "Database schema is up to date!".
- [ ] Step 3 verification printed `PASS` with `ENUM: xero,xero_leave,team_calendar_leave,manual`, and the throwaway `verify-enum.ts` was deleted.
- [ ] `bun run typecheck` exits 0 and `bun run check` exits 0.
- [ ] `git status` shows only the new migration directory (and the `plans/README.md` row update) modified — no other files.
- [ ] `plans/README.md` status row for plan 020 updated to DONE.

## STOP conditions

Stop and report back (do not improvise) if:

- The drift check shows `schema.prisma`'s `availability_source_type` enum no
  longer contains `team_calendar_leave`, or the service excerpts in "Current
  state" no longer match the live code (the codebase has drifted since this plan
  was written).
- Step 2 reports applying **more than one** migration, reports applying the
  `00000000000000_init` migration, or errors with a message about a migration
  having been "modified after it was applied" / a failed or pending init
  migration (P3009 or similar). This means `_prisma_migrations` is in an
  unexpected state; do not force it.
- Step 3 reports the enum still contains `leavesync_leave` after a successful
  deploy, or the `findMany` still throws.
- `DATABASE_URL` is missing/empty at runtime (the migration and verification
  cannot run). Report that the environment is not configured rather than guessing
  a value.
- You find evidence that `availability_records` is **not** empty after all (Step 3
  prints a non-zero row count) **and** any row uses `leavesync_leave` — the
  guarded `RENAME VALUE` still handles this correctly, but report it so the
  maintainer is aware data existed.

## Maintenance notes

For the human/agent who owns this code after the change lands:

- **What a reviewer should scrutinise**: that the migration only *renames* the
  enum value (no `DROP`/`ADD` that would lose data), and that the `init`
  migration was left untouched. The guarded `DO $$ … $$` block is what keeps the
  migration safe to run against both legacy databases (renames) and fresh ones
  (no-op).
- **Latent secondary bug, deliberately out of scope**: in
  `packages/availability/src/plans/plan-service.ts`, `listMyRecords` and
  `listTeamRecords` do `return listRecordsForScope(...)` *inside* their
  `try { … } catch { return unknownError(); }` block. Because the returned
  promise is not `await`ed inside the `try`, a rejection from
  `listRecordsForScope` escapes the `catch` and propagates as an unhandled error
  (this is why `/plans` surfaced the raw enum error rather than the caught
  "Unable to load" state, while the other three pages showed the caught state).
  Once this enum migration lands the query no longer throws, so the symptom
  disappears — but the swallow-vs-escape inconsistency remains. Consider a
  follow-up plan to `await` these returns (or remove the redundant try/catch) so
  genuine future DB errors are handled uniformly. Do **not** fix it in this plan;
  it would widen the diff beyond the migration.
- **Prevention**: future enum/value renames must ship a paired migration, not
  just a `schema.prisma` edit plus a hand-edit of the baseline `init` migration.
  A `prisma migrate diff`-based CI check between `schema.prisma` and the migrated
  database would have caught this drift.
