# Plan 027 Implementation Checklist: Paginate Xero Reads & Guard Stale Archive

- [ ] Step 1: Confirm Xero pagination contract (query param `page`, 1-based, page size 100, array keys `LeaveApplications` and `Employees`).
- [ ] Step 2: Implement pagination loop in `packages/xero/src/au/read.ts` for `fetchLeaveRecords` and return `complete: boolean`.
- [ ] Step 3: Implement pagination loop in `packages/xero/src/au/read.ts` for `fetchEmployees` (no `complete` needed, just paginated).
- [ ] Step 4: Propagate `complete: boolean` in `packages/xero/src/read/dispatch.ts`.
- [ ] Step 5: Update the leave sync handler `packages/jobs/src/handlers/sync-xero-leave-records.ts` to skip `archiveStaleRecords` if `complete === false`.
- [ ] Step 6: Add unit tests in `packages/xero/src/au/read.test.ts` for multi-page behavior and the `complete` flag.
- [ ] Step 7: Add unit tests in `packages/jobs/src/handlers/sync-xero-leave-records.test.ts` for skipping archiving when `complete === false`.
- [ ] Step 8: Verify build/test/lint with commands (`bun run check`, `bun run typecheck`, and unit tests).
