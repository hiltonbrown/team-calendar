# Plan 003: Finalise crashed sync runs and self-heal stuck "running" rows

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If any
> STOP condition occurs, stop and report. Update `plans/README.md` when done
> unless a reviewer maintains the index.
>
> **Drift check (run first)**: `git diff --stat e1b06a3..HEAD -- packages/jobs/src/handlers`
> If any in-scope handler changed, compare the "Current state" excerpts against
> the live code first; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `e1b06a3`, 2026-06-18
- **Issue**: <!-- filled when published via --issues -->

## Why this matters

Each Xero sync/reconcile handler creates a `sync_runs` row with `status:"running"`,
then runs its work. If an unhandled exception is thrown after the row is created
(a DB hiccup mid-batch, a Clerk call in completion recipients, a throw in record
transition), the handler's outer `catch` returns an error **without finalising the
run** — the row stays `status:"running"` forever.

Every handler also guards against concurrent runs by querying for an existing
`status:"running"` row with **no age cutoff** and cancelling the new dispatch if
one exists. So a single crashed run leaves a permanent `running` row that
auto-cancels every future dispatch of that run type for that org — sync silently
stops until someone manually edits the database.

Separately, `reconcileXeroApprovalState`'s outer catch is a bare `catch {}` with
**no logging** (every sibling handler logs), so when it fails there is no
diagnostic trail in observability.

This plan makes a crashed run finalise to `failed`, gives the duplicate-run guard
a staleness window so already-stuck rows self-heal, and restores the missing log.

## Current state

Four handlers, same shape (`packages/jobs/src/handlers/`):
`sync-xero-people.ts`, `sync-xero-leave-records.ts`, `sync-xero-leave-balances.ts`,
`reconcile-xero-approval-state.ts`.

Each has:
- A duplicate-run guard, e.g. `reconcile-xero-approval-state.ts:130-138`:
  ```ts
  const existingRun = await database.syncRun.findFirst({
    where: {
      ...scoped(context),
      run_type: "approval_state_reconciliation",
      status: "running",
      xero_tenant_id: context.xeroTenantId,
    },
    select: { id: true },
  });
  ```
  No `started_at` floor — a stale `running` row matches forever.
- A `const run = await database.syncRun.create({ ... status: "running" ... })`
  inside the `try` (e.g. `reconcile-...:161`, `sync-xero-people.ts:113`). Because
  it is a `const` inside the `try`, it is **not in scope** in the `catch`.
- An outer catch that returns without finalising the created run:
  - `reconcile-xero-approval-state.ts:330` — `} catch {` (no binding, **no log**):
    ```ts
    } catch {
      return { ok: false, error: { code: "unknown_error", message: "Failed to reconcile Xero approval state." } };
    }
    ```
  - `sync-xero-people.ts:218`, `sync-xero-leave-records.ts:252`,
    `sync-xero-leave-balances.ts:194` — these `log.error(...)` but still return
    without finalising the run.

Each handler defines its own `completeRun(context, runId, { status, ... })` that
does `syncRun.updateMany({ where: { ...scoped(context), id: runId }, data: { status, completed_at, ... } })` and supports `status: "failed"`
(e.g. `reconcile-...:579`, `sync-xero-people.ts:368`).

## Commands you will need

| Purpose   | Command                                              | Expected on success |
|-----------|------------------------------------------------------|---------------------|
| Install   | `bun install`                                         | exit 0              |
| Typecheck | `bunx tsc --noEmit -p packages/jobs/tsconfig.json`    | exit 0              |
| Unit test | `bunx vitest run packages/jobs`                       | all pass            |

(The handlers also have `*.integration.test.ts` needing `DATABASE_URL`; run those
only if a disposable test DB is available: `bun run test:integration`.)

## Scope

**In scope**:
- `packages/jobs/src/handlers/sync-xero-people.ts`
- `packages/jobs/src/handlers/sync-xero-leave-records.ts`
- `packages/jobs/src/handlers/sync-xero-leave-balances.ts`
- `packages/jobs/src/handlers/reconcile-xero-approval-state.ts`
- New/extended unit tests in `packages/jobs/src/handlers/`

**Out of scope**:
- The check-then-act race itself (two dispatches both passing the guard — a
  separate finding, BUG-06; the staleness window here narrows but does not close
  it). Do not add advisory locks or unique indexes in this plan.
- `rebuild-feed-cache.ts` / `reconcile-feed-publications.ts` — they do not create
  `xero_tenant`-scoped sync runs in the same pattern; leave them.

## Git workflow

- Branch: `advisor/003-sync-run-lifecycle`
- Conventional commits, e.g. `fix(jobs): finalise crashed sync runs and self-heal stuck running rows`.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Add a staleness window to each duplicate-run guard

Define a shared constant (top of each handler, or a small shared module if you
prefer — but a const per file is fine and in scope):
```ts
const STALE_RUN_WINDOW_MS = 30 * 60 * 1000; // 30 min — longer than any expected run
```
Add a `started_at` floor to each guard's `findFirst` where clause:
```ts
status: "running",
started_at: { gte: new Date(Date.now() - STALE_RUN_WINDOW_MS) },
```
A `running` row older than the window no longer blocks a new dispatch.

**Verify**: `bunx tsc --noEmit -p packages/jobs/tsconfig.json` → exit 0.

### Step 2: Finalise the created run to `failed` in each outer catch

Hoist the run id so the catch can see it. In each handler, before the `try`,
declare `let runId: string | null = null;`. After the `create`, assign
`runId = run.id;` (keep the existing `run` const too). In the outer catch,
finalise the run if it was created:
```ts
} catch (error) {
  log.error("Unhandled exception in <handlerName>:", { error });
  if (runId) {
    await completeRun(context, runId, {
      status: "failed",
      errorSummary: error instanceof Error ? error.message : "Unhandled exception",
    });
  }
  return { ok: false, error: { code: "unknown_error", message: "<existing message>" } };
}
```
Use each handler's own `completeRun` signature (some take `counts`/`recordsFetched`
as optional — omit them; `status` + `errorSummary` is enough). Keep each handler's
existing error `message` string.

**Verify**: `bunx tsc --noEmit -p packages/jobs/tsconfig.json` → exit 0.

### Step 3: Restore logging in the reconcile catch (BUG-03)

`reconcile-xero-approval-state.ts:330` — bind the error and log it, matching the
siblings (`log` is already imported in that file; confirm with
`grep -n "import.*log" packages/jobs/src/handlers/reconcile-xero-approval-state.ts`).
This is covered by the Step 2 rewrite of its catch — just ensure the
`log.error(...)` line is present there.

**Verify**: `grep -n "catch {" packages/jobs/src/handlers/reconcile-xero-approval-state.ts`
returns no matches (the bare catch is gone).

### Step 4: Test the crash-finalises-run and stale-row-self-heals behaviour

Add/extend a unit test (model after the existing
`reconcile-xero-approval-state` characterisation tests — find them with
`ls packages/jobs/src/handlers/*reconcile*test*`). Cover, with the database mocked:
- When the work throws after `create`, `completeRun` is called with
  `status: "failed"` for the created run id (assert the `updateMany` mock receives
  `status: "failed"`).
- When an existing `running` row is older than `STALE_RUN_WINDOW_MS`, the guard
  does **not** cancel the new run (assert the new run is created, not the cancelled
  branch). The cleanest way is to assert the `findFirst` where clause includes a
  `started_at: { gte: ... }` filter, or to drive the mock so the stale row is not
  returned and confirm the run proceeds.

**Verify**: `bunx vitest run packages/jobs` → all pass, new assertions included.

## Test plan

- New/extended unit tests in `packages/jobs/src/handlers/`:
  - throw-after-create → run finalised to `failed`;
  - guard ignores a `running` row older than the staleness window.
- Pattern to follow: the existing reconcile characterisation test in the same dir.
- Verification: `bunx vitest run packages/jobs` → all pass.

## Done criteria

ALL must hold:

- [ ] `bunx tsc --noEmit -p packages/jobs/tsconfig.json` exits 0
- [ ] `bunx vitest run packages/jobs` passes, including the new assertions
- [ ] `grep -rn "catch {" packages/jobs/src/handlers/reconcile-xero-approval-state.ts`
      returns no matches
- [ ] All four handlers' guards include a `started_at: { gte:` floor
      (`grep -rn "started_at: { gte:" packages/jobs/src/handlers/*.ts` shows 4+)
- [ ] All four handlers finalise the run to `failed` in their outer catch
- [ ] `bun run check` exits 0
- [ ] No files outside the in-scope list are modified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back if:

- A handler's `completeRun` does not accept `status: "failed"` (signature drifted).
- The `sync_runs` schema has no `started_at` column (check
  `packages/database/prisma/schema.prisma` model `SyncRun`) — the staleness window
  needs it.
- Hoisting `runId` would require restructuring more than the run-creation block
  (e.g. `run` is used in a way that breaks when made nullable) — report what you
  found.

## Maintenance notes

- The 30-minute window assumes no legitimate run exceeds it. If a sync run can
  legitimately run longer (very large tenants), raise the constant.
- BUG-06 (the check-then-act race) is still open: two dispatches inside the window
  can both pass the guard. A durable fix is a `pg_advisory_xact_lock` keyed on
  `(tenant, run_type)` (the codebase already uses advisory locks for token
  refresh in `oauth/service.ts`) or a partial unique index on
  `(xero_tenant_id, run_type) WHERE status='running'`. Tracked in `plans/README.md`.
- BUG-04 (reconciled declines have null `approved_at`, undercounting the monthly
  count) is adjacent and could be fixed here by setting a timestamp on the
  reconcile decline path; deferred per scope.
