# Plan 021: Isolate reconciliation integration fixture IDs

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report, do not improvise. When done, update the status row for this plan in
> `plans/README.md` unless a reviewer dispatched you and told you they maintain
> the index.
>
> **Drift check (run first)**: `git diff --stat e5faec8..HEAD -- packages/jobs/src/handlers/reconcile-xero-approval-state.integration.test.ts`
> If the in-scope file changed since this plan was written, compare the current
> state below with the live code. Stop on an unexplained mismatch.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `e5faec8`, 2026-07-11
- **Execution status**: IN PROGRESS on 2026-07-11, approved but not landed
- **Implementation**: commit `040848a` on branch
  `improve/plan-021-reconcile-fixtures`, worktree
  `/tmp/teamcalendar-plan-021`
- **Review**: APPROVE. Scope is limited to the reconciliation integration test;
  the targeted suite passed twice (7/7 each), the full integration suite passed
  53/53 tests, typecheck passed 18/18 tasks, and lint checked 690 files with no
  fixes required.

## Why this matters

The reconciliation integration suite reuses organisation, connection, tenant,
person, and record UUIDs used by other jobs suites. Each suite cleans by its own
`clerk_org_id`, so rows left by another suite can retain the shared primary key
and make reconciliation setup fail before the behaviour under test runs. Give
this suite a distinct deterministic UUID namespace so repeated and full-suite
runs are isolated without deleting data belonging to another test scope.

## Current state

`packages/jobs/src/handlers/reconcile-xero-approval-state.integration.test.ts`
defines tenant A with UUIDs beginning `70000000`, tenant B with UUIDs beginning
`80000000`, and availability record IDs beginning `90000000`. The
`sync-xero-leave-balances.integration.test.ts` suite independently uses the same
`70000000` and `80000000` organisation IDs but different Clerk organisation
IDs. Reconciliation cleanup correctly scopes deletes to
`org_test_reconcile_a` and `org_test_reconcile_b`, so it cannot remove rows
owned by the balance suite even when their primary keys collide.

The reconciliation suite's intended cleanup pattern must remain:

```typescript
const scope = { clerk_org_id: { in: [...testClerkOrgIds] } };
// dependent rows are deleted before organisation rows
```

Do not broaden cleanup to delete by another suite's Clerk organisation IDs.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Targeted test | `bunx vitest run packages/jobs/src/handlers/reconcile-xero-approval-state.integration.test.ts` | 7 tests pass |
| Full integration | `bun run test:integration` | exit 0 |
| Typecheck | `bun run typecheck` | exit 0 |
| Lint | `bun run check` | exit 0 |

## Scope

**In scope**:

- `packages/jobs/src/handlers/reconcile-xero-approval-state.integration.test.ts`
- `plans/README.md` (reviewer-maintained during dispatched execution)

**Out of scope**:

- Production reconciliation code.
- Other integration test files.
- Database schema or migration files.
- Broad or cross-suite cleanup that deletes data outside the reconciliation
  suite's Clerk organisation IDs.
- Random UUID generation or changes to behavioural assertions.

## Git workflow

- Use an isolated worktree and branch `improve/plan-021-reconcile-fixtures`.
- Commit message: `test(jobs): isolate reconciliation fixtures`.
- Do not push or open a pull request.

## Steps

### Step 1: Assign a suite-specific deterministic UUID namespace

In the in-scope test file only, replace the fixed UUID prefixes used by
`tenantA`, `tenantB`, and `recordId()` with prefixes not used by any other
integration test. Keep valid UUID syntax, preserve the final per-entity suffixes,
and keep every Clerk organisation ID and Xero-facing identifier unchanged.

Use three distinct prefixes, one each for tenant A, tenant B, and availability
records. Search all `*.integration.test.ts` files first and confirm the chosen
full UUID values do not occur elsewhere.

**Verify**: `rg -n '<each chosen prefix>' --glob '*.integration.test.ts'` shows
matches only in the reconciliation test.

### Step 2: Prove repeatability and full-suite isolation

Run the targeted test twice consecutively against the authorised development
database configuration. Both runs must pass, proving cleanup handles this
suite's own previous data. Then run the full integration suite.

**Verify**:

- Targeted command run 1: 7 tests pass.
- Targeted command run 2: 7 tests pass.
- `bun run test:integration`: exit 0 with no primary-key collision.

### Step 3: Run repository quality gates

Run `bun run typecheck` and `bun run check`.

**Verify**: both commands exit 0.

## Test plan

No new test case is required. The regression proof is running the existing
reconciliation suite twice and then within the full integration suite. Existing
behavioural assertions must remain unchanged.

## Done criteria

- [ ] Reconciliation fixture UUIDs are unique across integration test files.
- [ ] The targeted reconciliation suite passes twice consecutively.
- [ ] `bun run test:integration` exits 0.
- [ ] `bun run typecheck` and `bun run check` exit 0.
- [ ] Only the in-scope test file changed outside reviewer-owned plan files.
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report if:

- The collision is not caused by fixed UUID reuse across test suites.
- A unique namespace requires changing production code or another test file.
- Any targeted behavioural assertion fails after setup succeeds.
- The full integration suite fails for a reason unrelated to fixture ID
  isolation.

## Maintenance notes

Deterministic IDs remain useful for debugging, but every integration test suite
sharing a database must own a distinct UUID namespace. Review future jobs suites
for cross-file primary-key reuse while retaining Clerk-org-scoped cleanup.
