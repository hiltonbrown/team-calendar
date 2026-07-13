# Plan 025: Add a composite index for `approval_status` on availability records

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report, do not improvise. When done, update the status row for this plan in
> `plans/README.md` unless a reviewer dispatched you and told you they maintain
> the index.
>
> **Drift check (run first)**: `git diff --stat 123bbd8..HEAD -- packages/database/prisma/schema.prisma packages/database/prisma/migrations`
> If the `AvailabilityRecord` model or the migrations changed since this plan was
> written, compare the "Current state" excerpts against the live code before
> proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: perf / migration
- **Planned at**: commit `123bbd8`, 2026-07-12

## Why this matters

The hottest availability-record queries filter by `organisation_id +
approval_status`: the approvals queue (`listForApprover`), the approval summary
counts, the per-page failed-count `groupBy` in the people list, and current-status
computation. `AvailabilityRecord` has no index that leads with `approval_status`,
so Postgres falls back to the broad `organisation_id` index and filters the
status in-heap. For orgs with large record histories, the small
`submitted`/`xero_sync_failed` subset that these queries actually want cannot be
reached selectively. A single composite index removes the scan with no code
change.

## Current state

- `packages/database/prisma/schema.prisma` — the `AvailabilityRecord` indexes.
  `approval_status` (a scalar of enum `availability_approval_status`) appears in
  **none** of them:

```prisma
// packages/database/prisma/schema.prisma (AvailabilityRecord model, index block ~615-621)
  @@index([clerk_org_id])
  @@index([organisation_id])
  @@index([person_id, starts_at, ends_at])
  @@index([approved_by_person_id])
  @@index([source_type, source_remote_id])
  @@index([organisation_id, publish_status, include_in_feed])
  @@index([source_type, source_last_modified_at])
```

- Representative consumers (read-only context, do NOT modify them):
  - `packages/availability/src/approvals/approval-service.ts:255` — `listForApprover`
    `findMany` on `organisation_id` + `approval_status IN (...)`, ordered by `submitted_at`.
  - `packages/availability/src/approvals/approval-service.ts:370` — summary counts by status.
  - `packages/availability/src/people/people-service.ts:289` — `groupBy` for `xero_sync_failed`.

- Migration convention in this repo: migrations live in
  `packages/database/prisma/migrations/<timestamp>_<name>/migration.sql`. Recent
  examples: `20260712000000_add_xero_authorisation_connection_id`,
  `20260627000000_stripe_billing`. CI runs `migrate:deploy` then a **drift check**
  (`prisma migrate diff` must report "empty migration"), so the migration SQL must
  exactly match the schema change.

- `bun run migrate` = `prisma format && prisma generate && prisma migrate dev`
  (run from `packages/database`); it generates the migration automatically when a
  dev `DATABASE_URL` is reachable.

## Commands you will need

| Purpose             | Command                                                                 | Expected on success |
|---------------------|-------------------------------------------------------------------------|---------------------|
| Format+generate     | `cd packages/database && bunx prisma format && bunx prisma generate`     | exit 0              |
| Create migration    | `bun run migrate` (needs a dev `DATABASE_URL`)                           | new migration dir created, applied |
| Drift check         | `cd packages/database && bunx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` | prints "This is an empty migration" |
| Typecheck           | `bun run typecheck`                                                      | exit 0              |

## Scope

**In scope**:
- `packages/database/prisma/schema.prisma` — add one `@@index` to `AvailabilityRecord`.
- `packages/database/prisma/migrations/<new>/migration.sql` — the generated (or
  hand-authored) migration adding the index.

**Out of scope**:
- Any service/query code — this is index-only; do not change query shapes.
- Any other model's indexes.
- Existing migration files — never edit them.

## Git workflow

- Branch: `improve/025-approval-status-index`
- Conventional commits (e.g. `perf(db): add composite index on availability_records.approval_status`).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add the index to the schema

In the `AvailabilityRecord` model index block, add:

```prisma
  @@index([organisation_id, approval_status, submitted_at])
```

Rationale for the column order: `organisation_id` is the tenant filter every
query applies, `approval_status` is the selective predicate, and `submitted_at`
is the sort key `listForApprover` orders by, so this index can also serve the
sort. Keep all existing indexes.

**Verify**: `cd packages/database && bunx prisma format` → exit 0 and the block
is well-formed.

### Step 2: Generate the migration

Preferred: run `bun run migrate` from the repo root (needs a reachable dev
`DATABASE_URL`). Give the migration a name like `add_approval_status_index` when
prompted. This creates `packages/database/prisma/migrations/<timestamp>_add_approval_status_index/migration.sql`
containing roughly:

```sql
CREATE INDEX "availability_records_organisation_id_approval_status_submitte_idx"
  ON "availability_records" ("organisation_id", "approval_status", "submitted_at");
```

If **no dev database is available**, do NOT invent state: create the migration
directory by hand following the dated convention
(`<YYYYMMDDHHMMSS>_add_approval_status_index/migration.sql`) with the `CREATE
INDEX` statement above, using the exact index name Prisma would generate (run
`bunx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script`
to see the precise DDL Prisma expects, and copy it verbatim).

**Verify**: `cd packages/database && bunx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script`
→ prints "This is an empty migration" (schema and migrations now agree).

### Step 3: Regenerate client and typecheck

**Verify**:
- `cd packages/database && bunx prisma generate` → exit 0.
- `bun run typecheck` → exit 0 (no code changed, but confirm the generated
  client still builds).

## Test plan

- No new unit tests (index-only, no behaviour change).
- The meaningful verification is the **drift check** in Step 2 passing (schema ==
  migrations), which is exactly what CI enforces.
- Optional (only if a seeded dev DB is available): run `EXPLAIN` on a
  representative `listForApprover` query before and after to confirm the planner
  uses the new index; record the result in the PR description. Not required for
  done.

## Done criteria

ALL must hold:

- [ ] `schema.prisma` `AvailabilityRecord` has `@@index([organisation_id, approval_status, submitted_at])`
- [ ] A new migration dir exists under `packages/database/prisma/migrations/` adding that index
- [ ] `bunx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` reports "This is an empty migration"
- [ ] `bun run typecheck` exits 0
- [ ] No existing migration file was edited (`git status` shows only a new migration dir)
- [ ] No files outside the in-scope list are modified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The `AvailabilityRecord` index block does not match the excerpt (drift).
- `submitted_at` is not a column on `AvailabilityRecord` (verify with
  `grep -n "submitted_at" packages/database/prisma/schema.prisma`); if absent,
  drop it from the index and use `@@index([organisation_id, approval_status])`,
  then report the deviation.
- The drift check will not report "empty migration" and you cannot reconcile the
  SQL with the schema.

## Maintenance notes

- Reviewer: confirm the migration is additive `CREATE INDEX` only — no table
  rewrite, no data change. On large tables consider `CREATE INDEX CONCURRENTLY`
  in a follow-up if lock duration is a concern in production (Prisma migrations
  run in a transaction and cannot use `CONCURRENTLY` directly; note this as a
  deferred ops consideration, not part of this plan).
- If a future query needs a different `approval_status` predicate ordering (e.g.
  status without `organisation_id` leading), evaluate whether this index serves
  it before adding another.
