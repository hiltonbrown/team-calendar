# Plan 036: Enable withdraw of approved leave and admin-withdraw-any (Resolved Decision 3)

> **Executor instructions**: This is a **spike-first** plan. Phase A is
> investigation that produces a short design note; Phase B implements only after
> Phase A's open questions are resolved. Run every verification command and
> confirm the expected result before moving on. If anything in the "STOP
> conditions" section occurs, stop and report, do not improvise. When done,
> update the status row for this plan in `plans/README.md` unless a reviewer
> dispatched you and told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat dabb529..HEAD -- packages/availability/src/plans/submit-service.ts packages/xero/src/au/write.ts packages/xero/src/adapter/xero-write-adapter.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S-M (reduced at reconcile: authorisation already permits admins)
- **Risk**: MED (widens a Xero write path; approved-leave reversal semantics)
- **Depends on**: none. Plan 032 has landed, so withdraw's notification dispatch
  is already outside the state transaction; preserve that shape.
- **Category**: direction (binding product decision)
- **Planned at**: commit `123bbd8`, 2026-07-12
- **Refreshed at**: commit `dabb529` (`preview`), 2026-07-14 — excerpts below
  re-read against live code after plan 032 landed. Two corrections: withdraw's
  notification is now post-commit best-effort, and `loadAndAuthorise` already
  grants admin/owner access in every mode, so Step B2 is a verification step,
  not a code change.

## Why this matters

`ScreenCatalogue-v4.1.md` Resolved Decision 3 is marked **binding for all design
and implementation work**:

> Employees can withdraw own `submitted` **or `approved`** leave; **admins can
> withdraw any**. Synchronous Xero write, `failed_action = withdraw` on failure.
> Withdraw modal specified in S-10.

The code under-delivers this: `withdrawSubmission` only allows `submitted` leave,
and only `team_calendar_leave`-sourced records. So an employee whose leave is
approved and then needs cancelling has no path. The Xero write-back for withdraw
already exists; the real gap is the **state guard** and (critically) the **Xero
reversal semantics for already-approved leave**, which is why this is a spike
first.

**Corrected at reconcile (2026-07-14)**: the "admins cannot withdraw on someone's
behalf" half of the original diagnosis was **wrong**. `loadAndAuthorise` already
short-circuits on admin/owner in *every* mode (see excerpt below), so an admin can
already withdraw any person's `submitted` leave today. The only thing blocking
admin-withdraw-any on *approved* leave is the same status guard that blocks the
employee. Do not add an admin branch; there is already one.

## Current state

- The withdraw guard (`submit-service.ts:157-179`), verified at `dabb529`:

```ts
// packages/availability/src/plans/submit-service.ts:157-179 (abridged)
export async function withdrawSubmission(input, externalWritePort) {
  const authorised = await loadAndAuthorise(parsed.data, "owner_only");
  if (!authorised.ok) return authorised;
  const record = authorised.value;

  if (
    record.approval_status !== "submitted" ||   // <-- the actual blocker
    !record.source_remote_id ||
    record.source_type !== "team_calendar_leave"
  ) {
    return invalidState("invalid_state_for_withdraw");
  }
  const prepared = await prepareXeroWrite(parsed.data, record, externalWritePort);
  // ...
  const response = await externalWritePort.withdrawLeaveApplication({ employeeId, remoteId, clerkOrgId, organisationId });
  // on failure -> persistXeroFailure({ failedAction: "withdraw", ... })
  // on success -> $transaction: updateMany { approval_status: "withdrawn", withdrawn_at } + audit
  //               then notifyManagerBestEffort(...) AFTER the transaction (plan 032)
}
```

- `loadAndAuthorise` (`submit-service.ts:564-591`) takes a
  `mode: "manager_allowed" | "owner_only"`, but the mode only gates the *manager*
  case. Admin/owner is allowed unconditionally:

```ts
// packages/availability/src/plans/submit-service.ts:584-591
const isOwner = record.person.clerk_user_id === input.actingUserId;
const isManager =
  Boolean(actingPerson) &&
  record.person.manager_person_id === actingPerson?.id;
const isAllowed =
  isAdminOrOwner(input.actingOrgRole) ||        // <-- admin/owner: any record, any mode
  isOwner ||
  (mode === "manager_allowed" && isManager);
```

- Plan 032 has landed: withdraw's `notifyManagerBestEffort(...)` call now sits
  **after** the state-transition transaction and swallows failures
  (`submit-service.ts:239`, helper at `:644`). Keep that shape; do not move
  notification back inside the transaction.
- The Xero withdraw write is `withdrawLeaveApplication` on the external write
  port; the AU implementation is in `packages/xero/src/au/write.ts` and the
  adapter in `packages/xero/src/adapter/xero-write-adapter.ts`. **Whether
  Xero's withdraw operation is valid on an already-APPROVED leave application (vs
  only a pending one) is the key unknown.**
- `failed_action` already models `"withdraw"`; the failure path
  (`persistXeroFailure`) is in place.
- Conventions: outbound writes are synchronous, user-triggered, return
  `Result<T, XeroWriteError>`; never queue them; failures surface inline. Tests
  co-located (`submit-service.test.ts`, `packages/xero/src/au/write.test.ts`).

## Commands you will need

| Purpose   | Command                                                                 | Expected on success |
|-----------|-------------------------------------------------------------------------|---------------------|
| Typecheck | `bun run typecheck`                                                      | exit 0              |
| Unit test | `bunx vitest run packages/availability/src/plans/submit-service.test.ts packages/xero/src/au/write.test.ts` | all pass |
| Lint      | `bun run check`                                                          | exit 0              |

## Suggested executor toolkit

- Use Context7 for the Xero Payroll AU `LeaveApplications` state model — confirm
  which operation reverses/removes an **approved** leave application and whether
  it differs from withdrawing a pending one.

## Scope

**In scope**:
- `packages/availability/src/plans/submit-service.ts` — widen the state guard and
  authorisation for withdraw.
- Possibly `packages/xero/src/au/write.ts` /
  `packages/xero/src/adapter/xero-write-adapter.ts` — only if approved-leave
  reversal needs a different Xero call than the current `withdrawLeaveApplication`.
- Tests in the affected packages.
- A short design note appended to this plan file (Phase A output) or to the PR
  description.

**Out of scope**:
- The S-10 withdraw modal UI redesign (surface the capability; a dedicated UI
  polish pass is separate).
- NZ/UK (AU-only launch).
- Reworking the submit/approve flows (plan 032 covers their transaction boundary).

## Git workflow

- Base branch: `preview` — all development lands on `preview`, not `main`. Create this branch from `preview` and, if you merge, merge back into `preview`. Earlier-numbered plans in this batch also land on `preview` first, so the drift-check diff may legitimately include their changes; treat a mismatch as a STOP condition only when it is not explained by an earlier plan's documented scope.
- Branch: `improve/036-withdraw-approved-leave`
- Conventional commits (e.g. `feat(availability): allow withdraw of approved leave and admin-withdraw-any`).
- Do NOT push or open a PR unless the operator instructed it.

## Phase A — Spike (produce a design note, do not change behaviour yet)

### Step A1: Determine the Xero reversal semantics for approved leave

Using Context7 and `packages/xero/src/au/write.ts`, answer:
- Does `withdrawLeaveApplication` (the existing call) succeed on an **approved**
  Xero leave application, or does approved leave require a different operation
  (e.g. reject/delete/reverse)?
- What Xero state does the leave end in after the reversal, and does inbound sync
  then map it correctly (so the record does not get re-materialised)?

Write a 5-10 line design note capturing: the operation to use for approved-leave
withdrawal, the resulting local `approval_status`, the authorisation matrix
(owner: own submitted+approved; admin/owner: any), and any open question. **If
Xero cannot cleanly reverse an approved leave application via an available
operation, STOP and report** — the product decision may need Xero-specific
handling the maintainer must approve.

## Phase B — Implement (only after Phase A resolves)

### Step B1: Widen the state guard

Allow `approval_status` `"submitted"` **or** `"approved"` in the withdraw guard.
Keep the `source_remote_id` and `source_type` checks. If approved leave needs a
different Xero operation (per A1), branch on the current status to choose the
correct external write call.

**Verify**: `bun run typecheck` → exit 0.

### Step B2: Verify admin-withdraw-any (expect NO code change)

Admin-withdraw-any is **already implemented** by `loadAndAuthorise`'s
`isAdminOrOwner(input.actingOrgRole)` short-circuit (see "Current state"). Do not
add a new mode, branch, or role check.

This step is therefore a *verification* step: add the test from B4 case 2 (admin
withdraws another person's leave) and confirm it passes against the **unchanged**
authorisation helper. If it fails, the "Current state" reading was wrong — STOP
and report rather than widening the helper.

**Verify**: B4 case 2 passes with no diff to `loadAndAuthorise`.

### Step B3: Preserve failure + audit + notification semantics

On Xero write failure, keep the existing `persistXeroFailure({ failedAction:
"withdraw" })` path. On success, keep the `withdrawn` transition + audit event
inside the transaction, and keep `notifyManagerBestEffort(...)` **after** the
transaction (plan 032 has landed; that is the current shape — preserve it, do not
reintroduce a notify call inside the transaction). Add an audit action
distinguishing an admin-initiated withdrawal of another person's leave from a
self-withdrawal if the audit taxonomy supports it.

**Verify**: `bun run typecheck` → exit 0.

### Step B4: Tests

Add cases to `submit-service.test.ts` (and `write.test.ts` if a new Xero op was
introduced):
1. Owner withdraws own **approved** leave → Xero reversal called, record →
   `withdrawn`.
2. Admin withdraws **another** person's submitted/approved leave → succeeds.
3. A non-owner non-admin cannot withdraw someone else's leave → authorisation
   error.
4. Xero write failure → record carries `failed_action = "withdraw"` and the
   failure surfaces (unchanged path).

**Verify**: `bunx vitest run packages/availability/src/plans/submit-service.test.ts packages/xero/src/au/write.test.ts` → all pass.

## Test plan

- Cases in Step B4 (approved-withdraw, admin-any, unauthorised, Xero-failure).
- Structural pattern: existing withdraw/submit tests with injected external write
  port + DB mock.
- Verification: the vitest command in Step B4 → all pass; `bun run check`.

## Done criteria

ALL must hold:

- [ ] Phase A design note exists (in the PR or appended here), including the Xero operation for approved-leave reversal
- [ ] Withdraw accepts `submitted` and `approved` records
- [ ] Owner can withdraw own; admin/owner can withdraw any; others cannot
- [ ] `loadAndAuthorise` is **unchanged** (admin-any already works; a diff here means the plan's reading was wrong — report it)
- [ ] Withdraw's notification dispatch remains post-commit best-effort (plan 032's shape preserved)
- [ ] Xero write failure still sets `failed_action = "withdraw"` and surfaces inline
- [ ] `bun run typecheck` exits 0
- [ ] Tests from Step B4 pass (approved-withdraw + admin-any + unauthorised + failure)
- [ ] `bun run check` exits 0
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Phase A finds no clean Xero operation to reverse an approved leave application
  (maintainer decision needed on semantics).
- Widening authorisation would require a role model change beyond the existing
  helpers.
- Any excerpt in "Current state" does not match live code (drift).
- Inbound sync would re-materialise a withdrawn-approved record (the reversal must
  map to a Xero state that inbound sync treats as gone/withdrawn).

## Maintenance notes

- Reviewer must scrutinise the authorisation matrix (owner vs admin-any) and the
  Xero reversal path for approved leave specifically — approving then withdrawing
  touches payroll and must reconcile with `reconcile-xero-approval-state`.
- Plan 032 covers withdraw's notification transaction boundary; keep dispatch
  best-effort (outside the state transaction) either way.
- The S-10 withdraw modal is the intended UI surface; a follow-up should wire the
  approved-withdraw affordance into it with clear confirmation copy.
