# Plan 024: Remove the orphaned, unauthorised approval-write action and service function

## Tasks
- [x] Drift check and git verification
- [x] Step 1: Confirm the code is dead
- [x] Step 2: Delete the orphaned action file `apps/app/app/actions/availability/approval.ts`
- [x] Step 3: Delete the orphaned service function and its export
- [x] Step 4: Full verification (`bun run typecheck`, `bun run test`, `bun run check`)
- [x] Commit work on branch `improve/024-remove-orphaned-approval-action`

## Review
- Drift check completed successfully: 0 changes between `123bbd8` and `HEAD` for in-scope files.
- Confirmed code is dead: ran grep for `updateAvailabilityApprovalAction` and `updateAvailabilityApprovalStatus`, confirming no live callers in the codebase.
- Deleted `apps/app/app/actions/availability/approval.ts`.
- Removed `updateAvailabilityApprovalStatus` from `manual-records-service.ts` and its re-export from `packages/availability/index.ts`.
- Successfully ran typecheck (`bun run typecheck`), lint/format checks (`bun run check`), and unit tests (`bun run test`). All checks passed.
- Staged and committed changes on branch `improve/024-remove-orphaned-approval-action` under commit `7220fb2`.
