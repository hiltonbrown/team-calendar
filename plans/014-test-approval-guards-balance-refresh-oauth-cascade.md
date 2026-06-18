# Plan 014: Test approval guards, balance-refresh authorisation, and OAuth disconnect cascade

> **Executor instructions**: Follow step by step, running every verification
> command. If a STOP condition occurs, stop and report. Update `plans/README.md`
> when done unless a reviewer maintains the index.
>
> **Drift check (run first)**: `git diff --stat e1b06a3..HEAD -- packages/availability/src/approvals packages/availability/src/people/balance-refresh.ts packages/xero/src/oauth/service.ts`
> Compare against live code; on a mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW (test-only)
- **Depends on**: none (ideally before plan 008 which touches approvals)
- **Category**: tests
- **Planned at**: commit `e1b06a3`, 2026-06-18
- **Issue**: <!-- filled when published via --issues -->

## Why this matters

Three high-stakes domain paths have untested guards:

1. **Approval state-machine guards** — `prepareApprovalWrite`
   (`approval-service.ts:872-878`) rejects transitions from wrong states
   (`invalid_state_for_{approve,decline,retry}`), and several sites throw
   `OptimisticConflictError` when an optimistic `updateMany` returns
   `count !== 1`. The existing test hardcodes `availabilityUpdateMany` to
   `{ count: 1 }` and asserts no `invalid_state_*` or conflict outcome. The repo
   rules explicitly require approval-transition coverage.
2. **Balance-refresh authorisation + cross-org leak** —
   `packages/availability/src/people/balance-refresh.ts` enforces admin/owner-only
   and distinguishes `cross_org_leak` from `person_not_found` (a tenant-isolation
   guard). Untested.
3. **OAuth disconnect cascade** —
   `disconnectXeroOAuthConnection` (`oauth/service.ts:680-789`) runs a tenant-scoped
   multi-table transaction; the `destructive` branch deletes/archives across six
   tables. A regression could clear the wrong tenant's data or leave encrypted
   tokens live after a disconnect. Untested.

## Current state

- `packages/availability/src/approvals/approval-service.ts:872-878` (state guards),
  conflict throws around `:711`, `:560`, `:811`, `:938`. Existing mocked suite:
  `approval-service.test.ts` (sets `availabilityUpdateMany` → `{ count: 1 }`).
- `packages/availability/src/people/balance-refresh.ts:63-67` (role guard),
  `:178-204` (`personNotFoundOrLeak` → `cross_org_leak` vs `person_not_found`),
  `:88-127` (reason branches). A dispatcher seam exists:
  `setBalanceRefreshDispatcher`.
- `packages/xero/src/oauth/service.ts:680-789` (`disconnectXeroOAuthConnection`).
  These touch the DB → use `*.integration.test.ts` (needs `DATABASE_URL`).

## Commands you will need

| Purpose          | Command                                                       | Expected on success |
|------------------|---------------------------------------------------------------|---------------------|
| Install          | `bun install`                                                 | exit 0              |
| Unit tests       | `bunx vitest run packages/availability packages/xero`         | all pass            |
| Integration test | `bun run test:integration` (needs a disposable `DATABASE_URL`)| all pass            |

## Scope

**In scope** (new/extended test files only):
- `packages/availability/src/approvals/approval-service.test.ts` (extend)
- `packages/availability/src/people/balance-refresh.test.ts` (create)
- `packages/xero/src/oauth/disconnect.integration.test.ts` (create, or extend an
  existing oauth integration test)

**Out of scope**:
- Any non-test source. If a test reveals a bug, STOP and report.

## Git workflow

- Branch: `advisor/014-domain-guard-tests`
- Conventional commits, e.g. `test(availability): cover approval guards and balance-refresh auth`.
- Do NOT push/PR unless instructed.

## Steps

### Step 1: Approval guards + optimistic conflict

Extend the mocked approval suite. Parametrise over invalid `approval_status` /
`failed_action` combinations and assert each `invalid_state_*` code for
`approve`/`decline`/`retryDecline`/`requestMoreInfo`/`revertApprovalAttempt`. Add a
case where `availabilityUpdateMany` returns `{ count: 0 }` and assert the
`OptimisticConflictError` surfaces as `conflict_error`.

**Verify**: `bunx vitest run packages/availability` → all pass.

### Step 2: Balance-refresh authorisation + cross-org leak

Create `balance-refresh.test.ts`. Inject a fake dispatcher via
`setBalanceRefreshDispatcher`. Mock `database.person`/`xeroTenant`/`auditEvent`.
Assert: `manager`/`viewer` → `not_authorised`; a person belonging to another org →
`cross_org_leak` (not `person_not_found`); each no-op reason
(`not_xero_linked`, `xero_not_connected`, `job_not_registered`, `dispatch_failed`);
and the queued happy path for admin/owner.

**Verify**: `bunx vitest run packages/availability` → all pass.

### Step 3: OAuth disconnect cascade (integration)

If a disposable test database is available, create an integration test seeding
**two** tenants. Run `disconnectXeroOAuthConnection` with `destructive: false` then
`true` for one tenant, asserting: token columns cleared (`access_token_encrypted: ""`,
`status: "disconnected"`); the correct rows archived/deleted within scope; and the
**second tenant's rows are untouched**. If no test DB is available, write the test
but mark it skipped with a clear note, and say so in your report.

**Verify**: `bun run test:integration` → all pass (or documented-skipped).

## Test plan

- Approval: invalid-state and `count:0` conflict cases added to the mocked suite.
- Balance-refresh: role rejection, cross-org-leak vs not-found, each reason, happy
  path.
- Disconnect: non-destructive vs destructive scope, token zeroing, cross-tenant
  isolation.
- Verification: `bunx vitest run packages/availability packages/xero` (+ integration
  if DB available).

## Done criteria

ALL must hold:

- [ ] Approval suite asserts at least one `invalid_state_*` per operation and one
      `conflict_error` from `count: 0`
- [ ] `balance-refresh.test.ts` asserts role rejection and `cross_org_leak`
      distinct from `person_not_found`
- [ ] Disconnect cascade test exists (passing, or skipped-with-reason if no DB)
- [ ] `bunx vitest run packages/availability packages/xero` passes
- [ ] `bun run check` exits 0
- [ ] No non-test source modified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back if:

- A guard test reveals a real bug (e.g. an invalid transition is **not** rejected,
  or disconnect leaves tokens populated, or `cross_org_leak` is misclassified) —
  report it as a finding; do not fix source here.
- `setBalanceRefreshDispatcher` or the approval mock harness no longer exists as
  described (the code drifted) — report.

## Maintenance notes

- These tests pin tenant-isolation and state-machine invariants the security and
  correctness baselines depend on. Keep them green on any approval/disconnect change.
- Reviewer: verify the disconnect test actually asserts the **other** tenant is
  untouched (the whole point), not just that the target tenant was cleared.
