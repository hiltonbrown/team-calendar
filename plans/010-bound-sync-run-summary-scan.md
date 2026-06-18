# Plan 010: Bound the `syncRun` summary scan to its 30-day window

> **Executor instructions**: Follow step by step, running every verification
> command. If a STOP condition occurs, stop and report. Update `plans/README.md`
> when done unless a reviewer maintains the index.
>
> **Drift check (run first)**: `git diff --stat e1b06a3..HEAD -- packages/availability/src/sync/sync-monitor-service.ts`
> Compare the excerpt to live code; on a mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: perf
- **Planned at**: commit `e1b06a3`, 2026-06-18
- **Issue**: <!-- filled when published via --issues -->

## Why this matters

`listTenantSummaries` loads **every** sync run (with its failed records) and every
failed record for the tenant, then applies the 30-day window in memory. `sync_runs`
grows on every scheduled job (people/leave-records/balances/reconciliation), so
this query and its payload degrade continuously, and it is pulled into the admin
dashboard. A supporting composite index already exists on `sync_runs`
(`[clerk_org_id, organisation_id, xero_tenant_id, run_type, status, started_at]`),
so a `started_at` predicate is index-served.

## Current state

`packages/availability/src/sync/sync-monitor-service.ts:223-248`:
```ts
const since = daysAgo(30);
const [runs, failedRecords] = await Promise.all([
  database.syncRun.findMany({
    where: { ...scoped(parsed.data), xero_tenant_id: { in: tenantIds } },
    orderBy: [{ started_at: "desc" }, { id: "desc" }],
    include: { failed_records: { select: { id: true } } },
  }),
  database.failedRecord.findMany({
    where: { ...scoped(parsed.data), sync_run: { xero_tenant_id: { in: tenantIds } } },
    include: { sync_run: { select: { run_type: true, started_at: true, xero_tenant_id: true } } },
  }),
]);
```
`since` is only used later in memory (e.g. `runsLast30Days = tenantRuns.filter((run) => run.started_at >= since)` at line ~270).

## Commands you will need

| Purpose   | Command                                                       | Expected on success |
|-----------|---------------------------------------------------------------|---------------------|
| Install   | `bun install`                                                 | exit 0              |
| Typecheck | `bunx tsc --noEmit -p packages/availability/tsconfig.json`    | exit 0              |
| Tests     | `bunx vitest run packages/availability`                       | all pass            |

## Scope

**In scope**:
- `packages/availability/src/sync/sync-monitor-service.ts` (the `listTenantSummaries`
  query block)
- Tests in `packages/availability/src/sync/`

**Out of scope**:
- The in-memory aggregation logic below the queries — it already filters by `since`
  and stays correct once the query is bounded.

## Git workflow

- Branch: `advisor/010-bound-sync-run-scan`
- Conventional commits, e.g. `perf(availability): bound sync-run summary query to window`.
- Do NOT push/PR unless instructed.

## Steps

### Step 1: Push the window into the query

Add `started_at: { gte: since }` to the `syncRun.findMany` where clause. Scope the
`failedRecord.findMany` to the same window via its `sync_run` relation
(`sync_run: { xero_tenant_id: { in: tenantIds }, started_at: { gte: since } }`).

**Before/after check**: the in-memory `runsLast30Days` filter becomes redundant but
harmless; you may leave it or remove it. Do not change any other in-memory logic.

**Verify**: `bunx tsc --noEmit -p packages/availability/tsconfig.json` → exit 0.

### Step 2: Confirm summaries unchanged

The summary needs the "latest successful run per tenant/type" and recent failed
records. Both fall within 30 days for any live tenant; confirm the existing tests
still pass. If a test asserts behaviour for a run older than 30 days that must
still surface (e.g. "last successful run" could be >30 days ago for a broken
tenant), see the STOP condition.

**Verify**: `bunx vitest run packages/availability` → all pass.

## Test plan

- A test asserting the `syncRun.findMany` where clause includes `started_at: { gte }`
  and that summaries for in-window runs are unchanged.
- Pattern: existing `sync-monitor-service` tests.
- Verification: `bunx vitest run packages/availability` → all pass.

## Done criteria

ALL must hold:

- [ ] `syncRun.findMany` and `failedRecord.findMany` both filter by the 30-day
      `started_at` window in the query (not only in memory)
- [ ] `bunx tsc --noEmit -p packages/availability/tsconfig.json` exits 0
- [ ] `bunx vitest run packages/availability` passes
- [ ] `bun run check` exits 0
- [ ] No files outside the in-scope list are modified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back if:

- The summary needs to surface the "last successful run" even when it is **older**
  than 30 days (e.g. a tenant that has not synced in over a month). If so, the
  bounded query would hide it — fetch the single latest successful run per
  tenant/type separately (a small extra query) rather than widening the window, and
  note the change.

## Maintenance notes

- If the dashboard ever needs a longer history window, make `since` a parameter
  rather than removing the bound.
- Reviewer: confirm no summary field silently changes for tenants with sparse
  recent activity (the "last successful run older than 30 days" case).
