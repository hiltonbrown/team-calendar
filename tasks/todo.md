# Duplicate Manual-Record Guard

- [x] Branch from latest available local ref into `launch/06-duplicate-manual-guard` (environment has no `main` or `origin`).
- [x] Read authoritative references in `PRODUCT.md`, `launch-plan/REVIEW.md`, and the manual availability callers.
- [x] Locate the canonical manual availability create function in `packages/availability/index.ts` used by the manual callers.
- [x] Add an application-layer duplicate guard for manual records using `clerk_org_id`, `organisation_id`, `person_id`, `record_type`, identical `starts_at`, identical `ends_at`, and `source_remote_id IS NULL`.
- [x] Return a typed expected-failure `Result` error for duplicates, not a thrown error.
- [x] Surface duplicate failures cleanly through the app server action and API route.
- [x] Add co-located tests for duplicate rejection, non-duplicate acceptance, and different-organisation allowance.
- [x] Run verification: `bun install`, `bun run build`, `bun run check`, `bun run boundaries`, `bun run test`.
- [x] Review elegance and document outcomes.
- [x] Commit and create PR.

## Review

- Branch setup: requested `git checkout main && git pull origin main` could not run because this checkout has no local `main` ref and no configured `origin`; created `launch/06-duplicate-manual-guard` from the current local `work` ref.
- Duplicate definition used for this slice: same `clerk_org_id`, `organisation_id`, `person_id`, `record_type`, identical `starts_at`, identical `ends_at`, `source_type = "manual"`, and `source_remote_id IS NULL`.
- `packages/availability/index.ts`: `createManualAvailability` now checks for an existing matching manual record before insert and returns a `conflict` `Result` with a user-facing message.
- `apps/api/app/api/availability/route.ts`: create failures now map `bad_request`, `not_found`, and `conflict` to 400, 404, and 409 respectively instead of returning 500 for expected service failures.
- `packages/availability/index.test.ts`: added co-located unit coverage for duplicate rejection before insert, non-duplicate acceptance for different person/type/window, and allowance for identical records in a different organisation scope.
- Elegance review: the guard lives in the shared canonical service used by both app and API entry points, keeping the behaviour central and avoiding schema or migration changes.
- Verification:
  - `git diff --check`: passed.
  - `bun install`: blocked by registry 403 responses for package downloads.
  - `bun run --cwd packages/availability test`: blocked because `vitest` is not installed in `node_modules/.bin` after the failed install.
  - `bun run build`: blocked because `turbo` is not installed in `node_modules/.bin` after the failed install.
  - `bun run check`: blocked because `ultracite` is not installed in `node_modules/.bin` after the failed install.
  - `bun run boundaries`: blocked because `turbo` is not installed in `node_modules/.bin` after the failed install.
  - `bun run test`: blocked because `turbo` is not installed in `node_modules/.bin` after the failed install.

## PR #47 Review Fixes

Reviewing PR #47 in an environment where dependencies could be installed, so the verification the original task could not run was completed here.

- [x] (Bug) Duplicate guard ignored soft deletes: the pre-insert check omitted `archived_at: null`, so an archived (deleted) manual record would wrongly block re-creating an identical one, even though archived records never reach the feed. Added `archived_at: null` to the duplicate query, matching every other scoped query in `packages/availability/index.ts`.
- [x] (Regression test) Added `ignores archived manual records when guarding duplicates` to `packages/availability/index.test.ts`, which fails without the fix.
- [x] (Lint) Resolved `lint/suspicious/useAwait` errors in the new test mocks by dropping the unnecessary `async` modifier (the helpers never `await`), aligning with the existing non-async `vi.fn` mock style in the package.

### Verification (run in this environment)

- `bunx ultracite check` on the three changed files: passed.
- `bun run --cwd packages/availability test` (excludes integration tests per the package script): 27 files, 129 tests passed.
- `bun run --cwd packages/availability typecheck` (`tsc --noEmit`): passed.
- `apps/api` `tsc --noEmit`: `app/api/availability/route.ts` is clean; the only errors are pre-existing in the unrelated `lib/support/persist-support-submission-audit.test.ts` and are not introduced by this PR.
- `packages/availability/index.integration.test.ts` fails to load because `DATABASE_URL` is unset; this is environmental and reproduces on the base commit. It is excluded from the package `test` script.

### Follow-up recommendation (not changed here)

- The guard is a check-then-insert, so two concurrent identical submissions can still race past it. A partial unique index (`... WHERE source_type = 'manual' AND source_remote_id IS NULL`) would close that window at the database level, but that needs a migration and was deliberately out of scope for this PR.

## PR #47 Conversation Resolution

Addressed the open review threads from codex and copilot.

- [x] (Update path) Applied the same duplicate guard to `updateManualAvailability`, excluding the record being edited (`id: { not: recordId }`) and scoping to the record's own person, so a record can no longer be edited to collide with another active manual record.
- [x] (Atomicity) Added the partial unique index `availability_records_manual_identity_key` via raw-SQL migration `20260606000000_manual_availability_partial_unique` (mirrors the existing `availability_records_xero_remote_unique_idx` and the leave-balance precedent), documented it on `AvailabilityRecord` in `schema.prisma`, and added a `Prisma` P2002 guard in create/update that returns `conflict`. The pre-insert checks remain as friendly fast paths; the index is the atomic backstop for races.
- [x] (Archived records) Confirmed archived rows are excluded from both the create and update guards and from the index predicate, so a record can be recreated after soft delete.

### Verification

- `bunx ultracite check` on the changed TS files: passed.
- `packages/availability` tests: 27 files, 133 tests passed (4 new: update-duplicate rejection, update to a free window, update ignores archived, and P2002 mapped to conflict).
- `packages/availability` typecheck (`tsc --noEmit`): passed.
- `bunx prisma validate`: schema valid. The migration mirrors the existing partial-index SQL; it could not be executed here (no `DATABASE_URL`), and note that `CREATE UNIQUE INDEX` fails at deploy if active duplicate manual rows already exist.
