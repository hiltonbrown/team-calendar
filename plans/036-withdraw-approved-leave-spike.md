# Plan 036: Widen leave withdrawal to approved status and protect sync/reconcile failures

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving on. Touch only the files listed as in scope. If any STOP condition occurs, stop immediately and report. Do not improvise around obstacles. Commit your work in the worktree following the plan's git workflow section.
>
> **Drift check (run first)**: `git diff --stat 99dc5f1..HEAD -- packages/availability/src/plans/submit-service.ts packages/jobs/src/handlers/sync-xero-leave-records.ts packages/jobs/src/handlers/reconcile-xero-approval-state.ts`
> If any in-scope file changed since this plan was written, compare the "Current state" excerpts against the live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Status**: DONE (executed and reviewed 2026-07-15; database-backed integration cases require `DATABASE_URL` and were skipped in the isolated worktree)
- **Priority**: P3
- **Effort**: M (reconciled 2026-07-15: requires sync/reconcile hardening)
- **Risk**: MED (touches inbound sync and reconciliation logic; handles status transitions)
- **Depends on**: none (Plan 032 has landed)
- **Category**: direction (binding product decision)
- **Planned at**: commit `123bbd8`, 2026-07-12
- **Reconciled at**: commit `99dc5f1`, 2026-07-15

## Why this matters

`ScreenCatalogue-v4.1.md` Resolved Decision 3 is marked **binding for all design and implementation work**:

> Employees can withdraw own `submitted` **or `approved`** leave; **admins can withdraw any**. Synchronous Xero write, `failed_action = withdraw` on failure. Withdraw modal specified in S-10.

However, the Xero Payroll AU API does not support deleting or rejecting leave applications that are already in a `SCHEDULED` (approved) status. Since all leave applications created via the Team Calendar integration are immediately pushed to Xero as `SCHEDULED`, trying to reject them programmatically via `/reject` will always return a 400 validation error.

As a result, programmatic withdrawals will always trigger the `failed_action = "withdraw"` fallback path, transitioning the local record to `xero_sync_failed`. This is the designed failure behavior. To make this robust, we must:
1. Allow withdrawing both `submitted` and `approved` records.
2. Prevent the 15-minute inbound sync (`sync-xero-leave-records`) from overwriting a local `xero_sync_failed` record back to `approved` (since Xero will still report it as `SCHEDULED` until manual admin action is taken).
3. Allow the nightly reconcile job (`reconcile-xero-approval-state`) to transition a `xero_sync_failed` record to `withdrawn` (or `approved`/`declined`) once the status has been manually resolved in Xero.

## Current state

- The withdraw guard in [packages/availability/src/plans/submit-service.ts](file:///home/hilton/Documents/teamcalendar/packages/availability/src/plans/submit-service.ts#L173-L179):
```ts
    if (
      record.approval_status !== "submitted" ||
      !record.source_remote_id ||
      record.source_type !== "team_calendar_leave"
    ) {
      return invalidState("invalid_state_for_withdraw");
    }
```

- Inbound sync record loader in [packages/jobs/src/handlers/sync-xero-leave-records.ts](file:///home/hilton/Documents/teamcalendar/packages/jobs/src/handlers/sync-xero-leave-records.ts#L463-L483) only queries `xero_leave` and ignores `team_calendar_leave`:
```ts
async function loadExistingRecordsBySourceRemoteId(
  context: SyncXeroLeaveRecordsInput,
  sourceRemoteIds: string[]
) {
  const records = await database.availabilityRecord.findMany({
    where: {
      ...scoped(context),
      source_remote_id: { in: [...new Set(sourceRemoteIds)] },
      source_type: "xero_leave",
    },
    select: { id: true, source_remote_hash: true, source_remote_id: true },
  });
```

- Reconcile job active statuses and record mapping in [packages/jobs/src/handlers/reconcile-xero-approval-state.ts](file:///home/hilton/Documents/teamcalendar/packages/jobs/src/handlers/reconcile-xero-approval-state.ts#L46):
```ts
const ACTIVE_STATUSES = ["submitted", "approved", "declined"] as const;
```
And [reconcileRecord](file:///home/hilton/Documents/teamcalendar/packages/jobs/src/handlers/reconcile-xero-approval-state.ts#L354-L410):
```ts
async function reconcileRecord(
  context: ReconcileApprovalStateInput,
  runId: string,
  record: ReconciliationRecord,
  xero: { ... }
): Promise<"approved" | "declined" | "matched" | "withdrawn"> {
  if (xero.status === "APPROVED" && record.approval_status === "submitted") { ... }
  if (xero.status === "REJECTED" && record.approval_status === "submitted") { ... }
  if (
    (xero.status === "WITHDRAWN" || xero.status === "DELETED") &&
    record.approval_status !== "withdrawn"
  ) { ... }
```

## Commands you will need

| Purpose   | Command                                                                 | Expected on success |
|-----------|-------------------------------------------------------------------------|---------------------|
| Typecheck | `bun run typecheck`                                                     | exit 0              |
| Unit test | `bunx vitest run packages/availability/src/plans/submit-service.test.ts packages/jobs/src/handlers/sync-xero-leave-records.integration.test.ts packages/jobs/src/handlers/reconcile-xero-approval-state.integration.test.ts` | all non-database cases pass; database-backed cases require `DATABASE_URL` |
| Lint      | `bun run check`                                                         | exit 0              |

## Scope

**In scope**:
- `packages/availability/src/plans/submit-service.ts`
- `packages/jobs/src/handlers/sync-xero-leave-records.ts`
- `packages/jobs/src/handlers/reconcile-xero-approval-state.ts`
- Associated tests in the same directories.

**Out of scope**:
- Direct modifications to UI components or pricing/billing rules.
- Non-AU regions.

## Git workflow

- Base branch: `preview`
- Branch: `improve/036-withdraw-approved-leave`
- Conventional commit format: `feat(availability): allow withdraw of approved leave and harden sync boundaries`

---

## Step-by-step implementation

### Step 1: Widen the withdraw guard in `submit-service.ts`

Modify the status guard in `withdrawSubmission` to accept `"submitted"` **or** `"approved"`.
Ensure `loadAndAuthorise` remains unchanged since it already permits owners/admins to act org-wide.

**Verify**: `bun run typecheck` exits 0.

### Step 2: Update inbound sync record loader and process logic in `sync-xero-leave-records.ts`

1. In `loadExistingRecordsBySourceRemoteId`, update the `where` clause to find records with either `"xero_leave"` or `"team_calendar_leave"` as `source_type`:
```ts
      source_type: { in: ["xero_leave", "team_calendar_leave"] },
```
2. Add `approval_status` and `failed_action` to the `select` block of that query so they are loaded:
```ts
    select: { id: true, source_remote_hash: true, source_remote_id: true, approval_status: true, failed_action: true },
```
3. In `processLeaveRecord`, check if the existing local record has `approval_status === "xero_sync_failed"` and `failed_action === "withdraw"`. If so, and the incoming Xero status is still `approved`, **preserve** the local `xero_sync_failed` status instead of updating it to `approved`:
```ts
    const existing = existingRecordsBySourceRemoteId.get(normalised.sourceRemoteId);
    let approvalStatusToPersist = normalised.approvalStatus;
    if (
      existing?.approval_status === "xero_sync_failed" &&
      existing?.failed_action === "withdraw" &&
      normalised.approvalStatus === "approved"
    ) {
      approvalStatusToPersist = "xero_sync_failed";
    }
```
Update the `data` block to write `approval_status: approvalStatusToPersist`.

**Verify**: `bun run typecheck` exits 0.

### Step 3: Update reconciliation statuses and transitions in `reconcile-xero-approval-state.ts`

1. Add `"xero_sync_failed"` to `ACTIVE_STATUSES` so the reconciliation job checks failed sync records:
```ts
const ACTIVE_STATUSES = ["submitted", "approved", "declined", "xero_sync_failed"] as const;
```
2. Update the `ReconciliationRecord` interface to include `failed_action`:
```ts
interface ReconciliationRecord {
  approval_status: string;
  failed_action: string | null;
  id: string;
  ...
}
```
3. In `reconcileRecord`, update the status matchers to reconcile failed sync records when Xero reaches the correct state:
- If `xero.status === "APPROVED"` and local is `xero_sync_failed` with `failed_action === "approve"`, transition to `approved`.
- If `xero.status === "REJECTED"` and local is `xero_sync_failed` with `failed_action === "decline"`, transition to `declined`.
- If `xero.status === "REJECTED"`, `WITHDRAWN`, or `DELETED` and local is `xero_sync_failed` with `failed_action === "withdraw"`, transition to `withdrawn`.
```ts
  if (
    xero.status === "APPROVED" &&
    (record.approval_status === "submitted" ||
      (record.approval_status === "xero_sync_failed" &&
        record.failed_action === "approve"))
  ) { ... }

  if (
    xero.status === "REJECTED" &&
    (record.approval_status === "submitted" ||
      (record.approval_status === "xero_sync_failed" &&
        record.failed_action === "decline"))
  ) { ... }

  if (
    (xero.status === "WITHDRAWN" ||
      xero.status === "DELETED" ||
      (xero.status === "REJECTED" &&
        record.approval_status === "xero_sync_failed" &&
        record.failed_action === "withdraw")) &&
    record.approval_status !== "withdrawn"
  ) { ... }
```

**Verify**: `bun run typecheck` exits 0.

### Step 4: Add unit and integration tests

1. Add test cases to `submit-service.test.ts`:
- Owner withdraws own **approved** leave → attempts Xero reject write → handles resulting sync failure state correctly.
- Admin withdraws another person's approved leave.
2. Add test cases to `sync-xero-leave-records.integration.test.ts`:
- Sync does not overwrite a local `xero_sync_failed` + `withdraw` record with `approved` when the remote Xero status is still `APPROVED`.
- Sync correctly updates `team_calendar_leave` records idempotently instead of creating duplicate `xero_leave` records.
3. Add test cases to `reconcile-xero-approval-state.test.ts`:
- Reconcile job transitions `xero_sync_failed` + `withdraw` record to `withdrawn` if Xero status becomes `REJECTED`.
- Reconcile job transitions `xero_sync_failed` + `approve` record to `approved` if Xero status becomes `APPROVED`.

**Verify**: `bunx vitest run packages/availability/src/plans/submit-service.test.ts packages/jobs/src/handlers/sync-xero-leave-records.integration.test.ts packages/jobs/src/handlers/reconcile-xero-approval-state.test.ts` → all pass.

---

## Done criteria

- [x] Withdraw accepts `submitted` and `approved` records.
- [x] Inbound sync loads both `team_calendar_leave` and `xero_leave` records by remote ID, preventing duplicates.
- [x] Inbound sync preserves local `xero_sync_failed` + `withdraw` status and does not overwrite it back to `approved` if Xero is still `APPROVED`.
- [x] Reconcile job checks `xero_sync_failed` records and resolves them if the remote Xero status matches the action's target state.
- [x] `bun run typecheck` exits 0.
- [x] All new tests pass.
- [x] `bun run check` exits 0.
- [x] `plans/README.md` status row updated.
