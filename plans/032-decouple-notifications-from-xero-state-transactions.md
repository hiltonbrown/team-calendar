# Plan 032: Stop notification failures from rolling back Xero-confirmed state transitions

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report, do not improvise. When done, update the status row for this plan in
> `plans/README.md` unless a reviewer dispatched you and told you they maintain
> the index.
>
> **Drift check (run first)**: `git diff --stat 123bbd8..HEAD -- packages/availability/src/plans/submit-service.ts packages/availability/src/approvals/approval-service.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED (payroll write path; needs careful test coverage)
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `123bbd8`, 2026-07-12

## Why this matters

For submit and approve/decline, the Xero write happens **before** a local Prisma
transaction persists the state change, and notification dispatch happens
**inside** that transaction and **throws on failure**. So when a notification
insert fails (or any optimistic conflict occurs), the whole transaction rolls
back — discarding a state change that Xero has already accepted. Two concrete
divergences result, both leaving Xero (the payroll source of truth) ahead of
Team Calendar with no write-path reconciliation:

1. **Submit**: the leave application exists in Xero, but `source_remote_id` and
   the `submitted` transition are rolled back. The user retries and a **second**
   Xero leave application is created — duplicate payroll leave.
2. **Approve/decline**: Xero has approved, but a notification failure rolls the
   local record back to `submitted`. The manager re-approves and Xero returns a
   conflict; the record lands in `xero_sync_failed` for a write that in fact
   succeeded.

The fix: notifications are best-effort side effects and must not be able to roll
back a persisted, Xero-confirmed state change. Move them out of the
state-transition transaction, mirroring the pattern the code already uses for
`materialiseApprovalPublication` (which is deliberately outside the transaction).

## Current state

- **Submit** — Xero write, then a transaction that both persists the transition
  and calls `notifyManager` inside it; `notifyManager` failure throws and rolls
  back:

```ts
// packages/availability/src/plans/submit-service.ts:305-360 (abridged)
const submission = await externalWritePort.submitLeaveApplication({...}); // Xero write
if (!submission.ok) { return await persistXeroFailure({...}); }
await database.$transaction(async (tx) => {
  const update = await tx.availabilityRecord.updateMany({
    data: { approval_status: "submitted", source_remote_id: submission.value.remoteId, ... },
    where: { ...scoped, approval_status: options.validStatus, derived_sequence: record.derived_sequence, id: record.id },
  });
  if (update.count !== 1) { throw new OptimisticConflictError(); }
  await notifyManager(tx, parsed.data, record, "leave_submitted", {...});   // <-- inside txn
  await tx.auditEvent.create({ data: auditData(...) });
});
```

- **Approve** (and `performDecline`, same shape) — Xero write, then a transaction
  that persists the transition and calls `notifyUser` / `notifyManagersIfEnabled`
  inside it:

```ts
// packages/availability/src/approvals/approval-service.ts:699-748 (abridged)
const response = await externalWritePort.approveLeaveApplication({...}); // Xero write
if (!response.ok) { return await persistApprovalFailure({...}); }
await database.$transaction(async (tx) => {
  const update = await tx.availabilityRecord.updateMany({ data: { approval_status: "approved", ... }, where: transitionWhere(...) });
  if (update.count !== 1) { throw new OptimisticConflictError(); }
  await notifyUser(tx, parsed.data, record, {...});                 // <-- inside txn
  await notifyManagersIfEnabled(tx, parsed.data, record, {...});    // <-- inside txn
  await tx.auditEvent.create({ data: auditData(...) });
});
// materialiseApprovalPublication(parsed.data);  // already OUTSIDE the txn — the pattern to follow
```

- `notifyUser` throws `NotificationCreateError` on failure
  (`approval-service.ts:1402`), which propagates out of the transaction.

- The existing best-effort pattern to imitate: `materialiseApprovalPublication`
  is called after the transaction commits and its failure does not roll the
  transition back (see the call right after the approve transaction).
  `persistXeroFailure` / `persistApprovalFailure` are the failure paths for a
  failed Xero write (leave those unchanged).

- Conventions: service functions return `Result`; `OptimisticConflictError` is
  caught and mapped to an `invalid_state_*` error; tests co-located
  (`submit-service.test.ts`, `approval-service.test.ts`) and the approval suite
  already asserts query-count invariants.

## Commands you will need

| Purpose   | Command                                                                 | Expected on success |
|-----------|-------------------------------------------------------------------------|---------------------|
| Typecheck | `bun run typecheck`                                                      | exit 0              |
| Unit test | `bunx vitest run packages/availability/src/plans/submit-service.test.ts packages/availability/src/approvals/approval-service.test.ts` | all pass |
| Lint      | `bun run check`                                                          | exit 0              |

## Scope

**In scope**:
- `packages/availability/src/plans/submit-service.ts` — move `notifyManager` out
  of the submit transaction.
- `packages/availability/src/approvals/approval-service.ts` — move `notifyUser` /
  `notifyManagersIfEnabled` out of the approve and decline transactions.
- Tests in the two co-located files.

**Out of scope** (do NOT touch):
- The Xero write ordering (write-then-persist stays — the concern here is the
  transaction boundary, not moving the Xero call).
- `persistXeroFailure` / `persistApprovalFailure` — the failed-Xero-write paths.
- The `OptimisticConflictError` mapping to `invalid_state_*` (keep it; see
  Maintenance notes for the deferred refinement).
- `materialiseApprovalPublication` — already correctly outside the transaction.
- The withdraw path (separate; plan 036 touches it).

## Git workflow

- Branch: `improve/032-notify-outside-state-txn`
- Conventional commits (e.g. `fix(availability): keep notification failures from reverting Xero-confirmed transitions`).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Move notification dispatch out of the approve transaction

Keep inside the transaction only what must be atomic with the state change: the
`updateMany` transition (+ its `update.count !== 1` conflict guard) and the audit
event. After the transaction commits, dispatch notifications **best-effort**: call
the notification helpers with the non-transactional `database` client (not `tx`),
wrapped so a failure is logged (`log.error`) and does **not** propagate — exactly
how `materialiseApprovalPublication` is treated right below.

Two sub-parts:
- `notifyUser` / `notifyManagersIfEnabled` currently take a `tx` client. Change
  the post-commit calls to pass the module `database` client, and wrap in
  try/catch that logs and swallows (`NotificationCreateError` must no longer be
  able to revert the approval).
- Ensure `auditEvent.create` stays inside the transaction (audit must be atomic
  with the transition).

Repeat the identical change for `performDecline`.

**Verify**: `bun run typecheck` → exit 0.

### Step 2: Move notification dispatch out of the submit transaction

Same treatment in `submit-service.ts`: the transaction keeps the `updateMany`
(persisting `source_remote_id` + `submitted` + the conflict guard) and the audit
event; `notifyManager` moves to a best-effort post-commit call using the
`database` client, logged-and-swallowed on failure.

**Verify**: `bun run typecheck` → exit 0.

### Step 3: Tests

For each of submit / approve / decline, add a test proving:
1. When notification dispatch fails, the state transition (and `source_remote_id`
   for submit) is **still persisted** and the operation returns `ok: true` (the
   regression this plan fixes).
2. The happy path still notifies and still commits.
3. An `OptimisticConflictError` (update.count !== 1) still rolls back the
   transition and maps to the existing `invalid_state_*` error (unchanged
   behaviour — this must remain true).

Follow the existing mock style in the two suites (they inject the external write
port and a DB mock; the approval suite already asserts query counts).

**Verify**: `bunx vitest run packages/availability/src/plans/submit-service.test.ts packages/availability/src/approvals/approval-service.test.ts` → all pass.

## Test plan

- New cases in Step 3 (notification-failure-does-not-revert for submit/approve/
  decline; happy path; conflict still reverts).
- Structural pattern: existing submit/approve tests with injected write port + DB
  mock.
- Verification: the vitest command in Step 3 → all pass; `bun run check`.

## Done criteria

ALL must hold:

- [ ] Notification dispatch for submit, approve, and decline runs **after** the state-transition transaction commits, best-effort (logged, swallowed)
- [ ] Audit events remain inside the transaction
- [ ] `grep -n "notifyUser\|notifyManager\|notifyManagersIfEnabled" packages/availability/src/approvals/approval-service.ts packages/availability/src/plans/submit-service.ts` shows no notify call receiving a `tx` transaction client inside the state-transition `$transaction`
- [ ] `bun run typecheck` exits 0
- [ ] Tests prove a notification failure does not revert the transition (submit + approve + decline)
- [ ] `bunx vitest run` (the two suites) passes
- [ ] `bun run check` exits 0
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Any excerpt in "Current state" does not match live code (drift).
- `notifyUser`/`notifyManager` cannot run against the non-transactional
  `database` client without a signature change beyond the in-scope files.
- Moving notifications out of the transaction breaks an existing query-count
  assertion in a way that indicates a deeper coupling — report it.

## Maintenance notes

- **Deferred, related, NOT in this plan**: after a successful Xero write, an
  `OptimisticConflictError` still surfaces as a generic `invalid_state_*` error.
  A follow-up could surface a distinct "already written to Xero; local state
  reconciles on next sync" message and rely on `reconcile-xero-approval-state` to
  converge. That is a UX/error-taxonomy change; scope it separately.
- The duplicate-submit window (Xero write succeeds, local persist fails for a
  reason other than notifications, user retries) is narrowed but not fully closed
  by this plan; the durable fix is idempotent submit keyed on the record, also a
  separate follow-up. Note it in the PR.
- Reviewer: confirm audit events remain atomic with the transition and that no
  notification path can still throw out of the transaction.
