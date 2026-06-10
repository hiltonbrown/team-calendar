# Slice 1 — Migration repair (DRAFT for review)

Repairs blocker **B1** from `tasks/finalisation-audit.md`: the Prisma migration history
does not build the current `schema.prisma`, so a production `bun run migrate:deploy` fails.
This directory contains a ready-to-adopt **baseline (squash) migration** plus the adoption
steps. Nothing here is wired into `packages/database/prisma/migrations` yet — adopt it
deliberately (see "How to adopt").

## The problem (proven, not assumed)

The dev/integration database was built with `db push` (schema-direct), which masks a broken
migration history. Eight tables declared in `schema.prisma` have **no `CREATE TABLE` in any
migration**: `audit_events`, `failed_records`, `public_holidays`,
`public_holiday_jurisdictions`, `public_holiday_assignments`, `sync_runs`,
`xero_oauth_sessions`, `xero_person_matches`. Several `xero_connections` / `xero_tenants`
columns (`status`, `access_token_iv`, `access_token_auth_tag`, `refresh_token_iv`,
`refresh_token_auth_tag`, `token_key_version`, `token_encrypted_at`, `last_connected_at`,
`last_disconnected_at`, `last_error_code`, `last_error_message`, `stale_since`,
`disconnected_at`, `disconnected_by_user_id`, plus newer `xero_tenants` columns) are also
absent from the history.

Verified empirically by applying the existing migrations in order to an empty PostgreSQL 16
database:

```
FAILED at migration: 20260418005000_notifications_slice_09
ERROR:  relation "sync_runs" does not exist
```

`20260418005000` and `20260418006000` read/alter `sync_runs`, but no earlier migration
creates it. Because the failure is *mid-history*, it **cannot** be fixed by appending new
migrations at the end — the broken migrations run first. The history must be rebuilt.

## The fix: a single baseline (squash) migration

`proposed-migrations/00000000000000_init/migration.sql` is the full schema as one migration.
It was generated from the canonical schema and then has the two raw-SQL partial unique
indexes appended (Prisma `@@unique` cannot express a `WHERE` clause):

```
prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script
# + leave_balances_person_id_leave_type_xero_id_manual_key  (WHERE xero_tenant_id IS NULL)
# + availability_records_manual_identity_key                (WHERE source_type='manual' ...)
```

Contents: 30 tables, 30 enums, 49 foreign keys, 116 indexes, 2 partial unique indexes —
a 1:1 match with `schema.prisma`.

### Why squash rather than incremental forward migrations

The first failing migration is in the *middle* of the history, so a forward-only fix would
have to insert `CREATE TABLE`s *before* already-recorded migrations, which Prisma cannot do
without a reset anyway. A baseline is the standard Prisma remedy for a broken pre-production
history with no production data to preserve, and it is guaranteed correct (one file == the
schema).

## Verification performed

Against a throwaway PostgreSQL 16 instance:

1. **Applies cleanly** — `psql -f migration.sql` on an empty database: 0 errors, 30 tables.
2. **Zero drift** — `prisma migrate diff --from-config-datasource --to-schema
   prisma/schema.prisma --script` against the baseline-built DB returns
   `-- This is an empty migration.` (the database exactly matches `schema.prisma`).
3. **Reproduces the blocker** — applying the current `prisma/migrations/*` in order fails at
   `20260418005000` as shown above.

## How to adopt (run by a human, after review)

> Do not run these blindly. Confirm there is no production data to preserve first; this is a
> pre-launch repair.

1. Replace the migration history with the baseline:

   ```bash
   cd packages/database/prisma
   rm -rf migrations
   mkdir -p migrations/00000000000000_init
   cp ../../../tasks/slice-1-migration-repair/proposed-migrations/00000000000000_init/migration.sql \
      migrations/00000000000000_init/migration.sql
   cp ../../../tasks/slice-1-migration-repair/proposed-migrations/migration_lock.toml \
      migrations/migration_lock.toml
   ```

2. Bring each environment in line:

   - **Fresh environment (e.g. production):** `bun run migrate:deploy` applies the baseline
     cleanly. Nothing else needed.
   - **Existing shared dev/integration DB (recommended, pre-launch):** reset and reseed —
     `bunx prisma migrate reset` then your seed. Data is regenerated; no manual baselining.
   - **Any environment whose data must be preserved** and that already matches the schema
     (built via `db push`): clear its `_prisma_migrations` table, then mark the baseline as
     already applied without re-running it:
     `bunx prisma migrate resolve --applied 00000000000000_init`.

3. **Add a migrate step to CI** (currently absent — see `BLOCKED.md` items A/B). Run
   `migrate deploy` against an ephemeral PostgreSQL service before the integration suites so
   this drift cannot recur silently. The verification commands above are a good CI gate.

## Follow-ups this unblocks

- Integration suites (`*.integration.test.ts`) can run against a migrate-deployed DB in CI,
  exercising the partial unique indexes and uniqueness invariants.
- `BLOCKED.md` items A and B can be closed once CI runs `migrate deploy`.

## Notes / risks

- Historical SQL (data-transform `UPDATE`s in the old migrations) is discarded. That is
  expected for a squash and has no value pre-launch with no production data.
- If a production database already exists with real data, do **not** reset — use the
  `migrate resolve --applied` path in step 2 and validate with the zero-drift diff first.
- Keep the two partial unique indexes in sync with the comments on `LeaveBalance` and
  `AvailabilityRecord` in `schema.prisma` if the schema changes.
