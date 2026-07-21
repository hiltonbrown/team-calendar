# Plan: Audit `apps/app` accessibility, responsiveness, and component states

## Tasks

- [x] Load the product design context and audit criteria.
- [x] Inspect shared UI primitives and app surfaces for accessibility, responsive rules, and state coverage.
- [x] Run static checks and browser verification at mobile, tablet, and desktop widths (static and test verification completed; rendered browser verification was unavailable because `agent-browser` is not installed).
- [x] Document prioritised, reproducible findings and audit score.

## Review

- Confirmed `bun --cwd apps/app test` passes: 163 tests across 50 files.
- Confirmed `bun --cwd apps/app typecheck` passes.
- Audited the token system, shared primitives, calendar, notifications, member management, and alternative-contact flows, plus an app-wide detector scan.
- Browser automation was not available in this workspace, so responsive findings are source-verified and marked as such in the hand-off report.

# Plan: Consolidate active worktrees into preview

# Plan: Polish revised calendar manager workflow

## Tasks

- [x] Compare the revised calendar against the shared component system and critique backlog.
- [x] Replace the semantic mismatch in the view switch with the shared button group.
- [x] Verify the full app test suite, focused linting, type safety, and diff integrity.

## Review

- Read the latest `apps-app` critique snapshot and checked the calendar against
  the documented shared button, select, sheet, spacing, and focus conventions.
- Replaced the custom tab-like control with the shared ButtonGroup and
  `aria-pressed` state, matching its actual URL-backed view-switch behaviour.
- Verified 163 app tests across 50 files, app type-checking, focused Ultracite,
  `git diff --check`, and a clean calendar-scoped detector run. Browser visual
  inspection remains unavailable because `agent-browser` is not installed.

---

# Plan: Clarify calendar controls for managers

## Tasks

- [x] Label the selected calendar view, range, people, and record scope clearly.
- [x] Explain the filter defaults and make applied filters visible at a glance.
- [x] Rename and contextualise coverage states for a manager's scanning task.
- [x] Update focused tests and verify the calendar surfaces.

## Review

- View, range, people, and record scope are labelled in the toolbar summary;
  the controls now have precise accessible names.
- The filter sheet explains each filter and its default state, while the trigger
  surfaces the number of active refinements.
- Coverage is titled and described for the manager's task, with direct states
  for an empty range, Xero attention, and compacted people lanes.
- Verified with targeted Ultracite checks, app type-checking, and 8 focused
  calendar tests.

---

# Plan: Refocus the calendar for manager scanning

## Tasks

- [x] Assess the current calendar hierarchy and run the scoped layout pre-scan.
- [x] Make the calendar grid the default dominant surface, with compact scan context.
- [x] Move the coverage timeline behind an explicit, accessible view switch.
- [x] Update focused tests and verify layout, type safety, and formatting.

## Review

- Calendar is now the default primary surface. The contextual Today in view
  summary is capped at three people and sits beside the calendar on wide
  screens, below it on narrower screens.
- Coverage has a dedicated, URL-backed Calendar/Coverage view switch and no
  longer competes with the default calendar canvas.
- Two independent layout assessments ran: the structural review identified the
  stacked-panel hierarchy issue; the scoped detector and arbitrary-spacing scan
  found no unresolved layout findings.
- Verified with app type-checking, focused calendar tests (8 passed), a scoped
  Ultracite check, `git diff --check`, and the scoped layout detector. The
  repository-wide `bun run fix` remains blocked by pre-existing filename
  diagnostics in `.design-sync/previews`.

---

# Plan: Recover failed Xero authorisation connection migration

## Tasks

- [x] Inspect the failed Prisma migration record and live schema.
- [x] Confirm the intended column already exists in the target database.
- [x] Mark the failed no-op migrations as applied in Prisma migration history.
- [x] Re-run production migration deployment and verify no pending migrations.

## Review

- Confirmed three prior schema-direct changes were already present in Neon and
  resolved their failed migration records after verifying the live objects:
  `20260712000000_add_xero_authorisation_connection_id`,
  `20260714091900_add_approval_status_index`, and
  `20260714200000_add_published_dates`. The latter had no publication rows, so
  its backfill was not required.
- `20260714210000_add_stripe_event_created_at` applied successfully. `bun run
  migrate:deploy` and `bunx prisma migrate status` both completed successfully
  on 2026-07-15.

---

## Tasks

- [x] Inventory active branches, worktrees, and uncommitted changes.
- [x] Confirm which feature commits are already represented by `preview`.
- [x] Commit each remaining worktree change as a separate, scoped commit.
- [x] Merge all active feature and documentation branches into `preview`.
- [x] Verify the merged branch, worktree status, and ancestry.

## Review

- Merged `improve/033-xero-refresh-boundary`,
  `improve/034-out-of-office-analytics`,
  `improve/035-analytics-csv-export`, and
  `improve/036-withdraw-approved-leave` into `preview` on 2026-07-15.
- `improve/036-withdraw-approved-leave-executor` and all `subagent-*` branches
  were already ancestors of `preview`.
- Confirmed every local branch is merged into `preview` and all worktrees are
  clean. `bun run check` could not run in the `/tmp` preview worktree because
  it has no installed dependency tree, so Ultracite cannot resolve its package.

# Plan: Prune old worktrees

## Tasks

- [x] Inventory registered git worktrees and local branch merge state.
- [x] Check `/tmp` for leftover Team Calendar worktree directories not tracked by git.
- [x] Prune stale git worktree metadata and remove safe leftover directories.
- [x] Verify the remaining worktree state after cleanup.

## Review

- Ran `git worktree prune --verbose`; git reported no additional registered
  worktrees beyond the active `preview` checkout.
- Removed the empty orphaned directory `/tmp/teamcalendar-preview-merge-036`.
- Verified `git worktree list --porcelain` still shows only
  `/home/hilton/Documents/teamcalendar`, and the `/tmp` directory no longer
  exists.

# Plan 028: Increment feed SEQUENCE when leave dates change

## Tasks
- [x] Create branch `improve/028-sequence-on-date-change` from base branch `preview` (Done: checked out `improve/028-sequence-on-date-change`)
- [x] Drift check: verify no unexpected modifications to in-scope files
- [x] Step 1: Add `published_starts_at` and `published_ends_at` to the `AvailabilityPublication` model in `packages/database/prisma/schema.prisma`
- [x] Verify Step 1: Run `cd packages/database && bunx prisma format` and `bunx prisma generate`
- [x] Step 2: Create a Prisma migration with `--create-only` and append the SQL backfill logic
- [x] Verify Step 2: Run `bunx prisma migrate dev` to apply migration, and check drift with `bunx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` (Done: created manual migration file, executed it via `prisma db execute`, and ran `db:push`; drift check confirmed empty migration)
- [x] Step 3: Project starts_at/ends_at in `projectPublishedRecord`, add them to `materiallyChanged` comparison, and include them in `select` inside `packages/feeds/src/publication/publication-service.ts`
- [x] Verify Step 3: Run `bun run typecheck` (Done: successfully compiled typecheck)
- [x] Step 4: Persist `published_starts_at` / `published_ends_at` in both create and update paths in `packages/feeds/src/publication/publication-service.ts`
- [x] Verify Step 4: Run `bun run typecheck` (Done: successfully compiled typecheck)
- [x] Step 5: Write unit tests in `packages/feeds/src/publication/publication-service.test.ts` to test date-only change increments SEQUENCE, no-op doesn't, and create persists dates
- [x] Verify Step 5: Run tests using `bunx vitest run packages/feeds/src/publication/publication-service.test.ts` (Done: 7 tests passed successfully)
- [x] Final verification: Run `bun run check` (Done: ultracite check passed successfully)
