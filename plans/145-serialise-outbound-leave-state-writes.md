# Plan 145: Claim every outbound leave transition before mutating Xero

## Status

- Priority: P1
- Effort: M
- Risk: MED, contention and ambiguous remote success require careful handling
- Confidence: HIGH
- Category: correctness
- Depends on: none
- Planned at: `ee8c410`, 2026-09-18
- Status: TODO

## Why this matters

`performApproval` and `performDecline` call their external write ports before the local compare-and-swap transition. `withdrawSubmission` does the same. Two competing transitions can both change Xero, but only one persists locally. The remote and local terminal states can then differ. Submission already claims `xero_write_claimed_at` before its external write; extend that existing synchronisation boundary to every outbound operation while retaining synchronous, user-triggered writes.

## Current state and drift

Run `git diff --stat ee8c410..HEAD -- packages/availability/src/approvals packages/availability/src/plans packages/availability/src/sync packages/jobs/src/handlers/reconcile-xero-approval-state.ts` and inspect changed code before implementing.

- `packages/availability/src/approvals/approval-service.ts:890`: external approval precedes the transaction at line 910. `prepareApprovalWrite` only loads/authorises, checks state/connection and resolves employee ID. Decline has the same order at line 999.
- `packages/availability/src/plans/submit-service.ts:198`: withdrawal calls the provider before transaction at line 216.
- `packages/availability/src/plans/submit-service.ts:318,586`: submission atomically claims the row using tenant, status, sequence and null/stale claim predicates before calling Xero. Its release helper currently clears by tenant/ID only.
- `xero_write_claimed_at` already exists. No migration is required for a claim identified by its exact timestamp. Do not introduce background outbound writes.

Follow Result-based expected errors, Zod input validation, dual-tenant query predicates, separate provider errors from employee-facing messages and materialise publication after successful state change. Existing approval-service and submit-service tests provide external-port fakes and transaction mocks.

## Scope

- `packages/availability/src/approvals/approval-service.ts` and its tests
- `packages/availability/src/plans/submit-service.ts` and its tests
- New internal shared claim helper and tests under `packages/availability/src/`
- `packages/availability/src/plans/plan-service.ts` and its tests only to prevent editing/reverting an actively claimed row
- `packages/jobs/src/handlers/reconcile-xero-approval-state.ts` and tests only to exclude active claims from background reconciliation
- `packages/availability/src/sync/inbound-leave-normaliser.ts` and tests only if needed to preserve an active outbound claim
- `plans/README.md`

No UI, billing, migration, provider API changes, NZ/UK activation or queueing writes. Do not change published SEQUENCE merely to acquire a lock.

## Git workflow

Create isolated local worktree/branch `fix/145-xero-write-claims`, preserve unrelated changes, use a conventional `fix:` commit. Coordinator already has local merge authority after verification. Never push.

## Steps

1. Add deterministic tests controlling deferred provider promises: overlap approve/decline, approve/withdraw and duplicate withdrawals against the same scoped row. Demonstrate that the existing implementation reaches two external ports before either transaction, then require only the claim winner to call its external port.
   Verify: `bun run --cwd packages/availability test src/approvals/approval-service.test.ts src/plans/submit-service.test.ts` identifies the new failing race assertion.
2. Extract or generalise the existing atomic claim primitive. Return ownership (exact claim timestamp or equivalent existing-row token), use both tenant keys, record ID, expected state/sequence and active/not-archived predicates. Match ownership on release and completion so a delayed request cannot clear a successor's claim. Include expected failed-action where a retry requires it. Do not hold a database transaction across the network request.
   Verify the helper tests cover success, contention, tenant separation, expiration and old-owner release refusal.
3. Acquire the shared claim after successful validation/authorisation and immediately before each submit/approve/decline/withdraw provider mutation. On contention, return the existing appropriate conflict/invalid-state Result with no provider call. Release or consume the owned claim for success, provider-declared failure and exceptions. Retain the existing audit/notification/privacy semantics. Audit retry and revert paths as well as background reconciliation: an active claim must not be edited or reconciled underneath an outbound transition.
   Verify targeted availability suites above pass, including remote failure, local persistence failure, retry and existing notification-isolation tests. If reconciliation changed, run its focused jobs suite.
4. Run repository gates, review complete diff and arrange advisor review. Document ambiguous provider-timeout/local-persistence recovery honestly rather than claiming exactly-once delivery over an external network.

## Test plan

Use the existing injected ExternalWritePort; do not call live Xero. Test approve vs decline, approve vs withdrawal, duplicate withdrawal, owner-scoped release, expired-claim takeover, cross-tenant rejection, provider exception, declared error, local transaction failure, successful claim clearing, no sequence increment just for a claim and no active-claim overwrite by edit/reconcile. Include at least one real database concurrency assertion where the existing integration harness supports it.

## Done criteria

- Focused availability claim/approval/submit suites pass.
- Changed jobs/reconciliation suites pass if touched.
- `bun run check`, `bun run typecheck`, `bun run test`, `bun run test:integration` pass on the merged release candidate.
- No external state-changing write port is reachable before its claim succeeds.
- No stale owner can release another request's claim.
- Diff stays in scope and advisor review passes.

## STOP conditions

Report if Xero adapter retries can exceed the existing claim lifetime without a bounded timeout, if a claim requires schema changes, or if enforcing the guard requires unlisted state writers. Expand the reviewed scope through the coordinator rather than silently adding an unrelated refactor. An expired lease is not proof that a remote call failed; preserve reconciliation diagnostics.

## Maintenance

Every new outbound transition must share this claim boundary. CAS after remote success protects local data but does not serialise remote operations. Claims must remain tenant-scoped and owner-specific; do not turn this into queued payroll writes.
