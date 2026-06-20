# Plan: Fix Local Build and Runtime Environment Variables

## Plan

- [ ] Copy valid `DATABASE_URL` and Clerk keys from `apps/api/.env.local` to `apps/app/.env.local`
- [ ] Set public URL environment variables to their localhost ports (`NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_WEB_URL`, `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_DOCS_URL`) in both `apps/app/.env.local` and `apps/web/.env.local`
- [ ] Comment out any optional environment variables that are set to `""` in `apps/app/.env.local` and `apps/web/.env.local` to prevent validation failures
- [ ] Run `bun run check` to verify linting and typechecking
- [ ] Run `bun run build` to verify the build succeeds for all workspace apps
- [ ] Document the verification and results in `tasks/todo.md`
- [ ] Capture any lessons in `tasks/lessons.md`

## Review
- Verification results and lesson summaries will be recorded here upon completion.

# Plan: Repair Branch and Worktree State

## Plan

- [x] Inspect all local branches, worktrees, branch containment, and git object health.
- [x] Commit any uncommitted edits in every worktree.
- [x] Rebase local worktree branches onto `main` where they are not already contained.
- [x] Merge all local branches into `main`.
- [x] Remove or prune stale/corrupt worktree metadata only if git reports it as stale.
- [x] Run verification commands from `main`.
- [x] Document the final branch/worktree state and verification results here.
- [x] Capture any lesson learned in `tasks/lessons.md`.

## Review

- `git fsck --full` reports dangling objects only, not missing or corrupt objects.
- `git worktree prune --dry-run --verbose` reports no stale worktree metadata.
- All local branches are already contained in `main`; `advisor/016-analytics-spike`
  remains checked out in `/tmp/leavesync-016` at its branch tip.
- Committed the repair plan and lesson in `4eca137`.
- Rebased `advisor/015-broadcast-date-holiday-tests`,
  `advisor/016-analytics-spike`, and `advisor/017-html-calendar-spike` onto
  `main`.
- Merged all three advisor branches back into `main`; each reported "Already up
  to date" after the rebase.
- Final `git branch --no-merged main` produced no output.
- Final `git worktree prune --dry-run --verbose` produced no output.
- Final `bun run check` exits 0.
- Final `bunx vitest run packages/feeds` exits 0 with 10 files and 53 tests
  passing.

# Plan: Execute Plan 007 Batch Xero Sync Handler Lookups

## Plan

- [x] Refresh `plans/007-batch-sync-handler-lookups.md` against current HEAD `d99740f`.
- [x] Dispatch the implementation to a worker with source scope limited to the two sync handlers and matching handler tests.
- [x] Review the worker diff for scope, batching semantics, and meaningful tests.
- [x] Run `bunx tsc --noEmit -p packages/jobs/tsconfig.json`.
- [ ] Run `bunx vitest run packages/jobs`.
- [x] Run `bun run check`.
- [ ] Mark `plans/README.md` plan 007 as DONE if review and verification pass.

## Review

- Implemented batched person lookups for leave balances, batched person and existing-record lookups for leave records, and batched feed rebuild events.
- `bunx tsc --noEmit -p packages/jobs/tsconfig.json` exits 0.
- Targeted handler tests pass: `bunx vitest run packages/jobs/src/handlers/sync-xero-leave-balances.test.ts packages/jobs/src/handlers/sync-xero-leave-records.test.ts` exits 0 with 9 tests passing.
- `bun run check` exits 0.
- `bunx vitest run packages/jobs` exits 1 before Plan 007 assertions fail because `packages/jobs/src/handlers/sync-xero-people.integration.test.ts` imports database config without `DATABASE_URL` set. This is outside Plan 007 scope, so `plans/README.md` was not marked DONE.

# Plan: Execute Plan 008 Batch People And Approvals N+1 Queries

## Plan

- [x] Refresh `plans/008-batch-people-approvals-n-plus-one.md` against current HEAD `d99740f`.
- [x] Dispatch the implementation to a worker with source scope limited to availability people, approvals, duration, and matching tests.
- [x] Review the worker diff for scope, batching semantics, and behavioural equivalence.
- [x] Run `bunx tsc --noEmit -p packages/availability/tsconfig.json`.
- [x] Run `bunx vitest run packages/availability`.
- [x] Run `bun run check`.
- [x] Mark `plans/README.md` plan 008 as DONE if review and verification pass.

## Review

- Worker implemented Plan 008 in commits `52d0706` and `8198ce0` on branch `advisor/008-people-approvals-batching`.
- `computeCurrentStatusForPeople` batches people-list current status lookups; `listPeople` now calls it once per result set. No dashboard edit was required because `dashboard-service.ts` reaches this path through `listPeople`.
- `listForApprover` now preloads working-day reference data and leave balances for the list, while detail/action paths retain their existing single-record fallback helpers.
- `bunx tsc --noEmit -p packages/availability/tsconfig.json` exits 0.
- `bunx vitest run packages/availability` exits 0 with 31 files and 183 tests passing.
- `bun run check` exits 0.
- `plans/README.md` now marks plan 008 as DONE.

# Plan: Execute Plan 009 Scope Feed Render People Fetch

## Plan

- [x] Refresh `plans/009-scope-feed-render-people-fetch.md` against current HEAD `b224ab0`.
- [x] Dispatch the implementation to a worker with source scope limited to feed scope resolution and tests.
- [x] Review the worker diff for scope safety and unchanged manager/dynamic-scope behaviour.
- [x] Run `bunx tsc --noEmit -p packages/feeds/tsconfig.json`.
- [x] Run `bunx vitest run packages/feeds`.
- [x] Run `bun run check`.
- [x] Mark `plans/README.md` plan 009 as DONE if review and verification pass.

## Review

- Worker implemented scope-aware non-preloaded people fetches in `resolvePeopleForFeed`.
- Person and team scopes now narrow the Prisma `where`; org, self, and manager-team scopes keep the broad active-org fetch.
- Added query-shape and output-equivalence tests for person, team, mixed person/team, org, self, and manager-team scopes.
- `bunx tsc --noEmit -p packages/feeds/tsconfig.json` exits 0.
- `bunx vitest run packages/feeds` exits 0 with 9 files and 50 tests passing.
- `bun run check` exits 0.
- `plans/README.md` now marks plan 009 as DONE.

# Plan: Restore Package Typecheck Gate

## Plan

- [x] Delegate plan 006 execution and inspect the STOP condition.
- [x] Keep the safe config edits from plan 006: root `typecheck` runs `turbo typecheck`, and `@repo/typescript-config` has no empty typecheck task.
- [x] Fix only type/config errors surfaced by the widened gate, without runtime behaviour changes.
- [x] Run `bunx turbo typecheck --dry-run=json` to confirm package coverage.
- [x] Run `bun run typecheck`.
- [x] Run `bun run check`.
- [x] Update `plans/README.md` and this review section with the result.

## Review

- Worker stopped because widened typecheck surfaced latent package errors. Continuing with scoped type/config-only fixes.
- `bunx turbo typecheck --dry-run=json` exits 0 and lists `@repo/*` package typecheck tasks.
- `bun run typecheck` exits 0 with the widened `turbo typecheck` gate.
- `bun run check` exits 0.
- `plans/README.md` now marks plan 006 as DONE.
