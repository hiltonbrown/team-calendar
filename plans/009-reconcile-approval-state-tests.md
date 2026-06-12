# Plan 009: Characterisation tests for the reconcile-xero-approval-state job

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat d9da765..HEAD -- packages/jobs/src/handlers/reconcile-xero-approval-state.ts`
> If the handler changed since this plan was written, compare the "Current
> state" structure map against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: LOW (tests only — no production code changes permitted)
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `d9da765`, 2026-06-12
- **Issue**: https://github.com/hiltonbrown/leavesync/issues/65

## Why this matters

`reconcile-xero-approval-state.ts` is a 780-line background job that **mutates approval state across every tenant**: it reads leave-application status from Xero and transitions LeaveSync records between `submitted`/`approved`/`declined`/`withdrawn`, archives records missing in Xero, writes audit events, and sends notifications. It is the only one of the six Inngest handlers with **zero** test coverage — the other five all have co-located tests (`sync-xero-leave-records.integration.test.ts` etc.). A regression here silently corrupts approval state org-wide. This plan adds characterisation tests only: it pins current behaviour so future changes (and the other plans touching `packages/xero`) have a safety net. If a test reveals a real bug, report it — do not fix it here.

## Current state

- `packages/jobs/src/handlers/reconcile-xero-approval-state.ts` — structure map (line numbers at planning time):
  - `ReconcileInputSchema` (line 23) — Zod schema; `reconcileXeroApprovalState(input: unknown)` (line 106) is the testable entry point (the Inngest wrapper at line 87 just calls it via `step.run`).
  - `ACTIVE_STATUSES = ["submitted", "approved", "declined"]` (line 45), `BATCH_SIZE = 50` (line 46).
  - Per-record pipeline: `reconcileRecord` (341) → `transitionRecord` (402) / `archiveMissing` (431); failures → `recordFailure` (540); notifications via `notifyRecordOwner` (459) and `notifyCompletion` (486); run lifecycle via `completeRun` (579) and `publishRunStatusChanged` (647); tenant resolution `loadXeroTenant` (620); scoping helper `scoped` (709) applies `clerk_org_id` + `organisation_id`.
  - `isBlanketFailure` (643) decides which Xero errors abort the whole run vs. one record.
- The exemplar to model after — `packages/jobs/src/handlers/sync-xero-leave-records.integration.test.ts` (read it fully before writing anything). Its pattern:
  - `vi.mock("server-only", () => ({}))`; mock `../client` (Inngest) with a `createFunction` stub and a `mockInngestSend`.
  - Partial-mock `@repo/xero` via `importOriginal`, replacing only the region fetch function.
  - `await import("./setup-env")` before importing the handler.
  - `describeWithDatabase = process.env.DATABASE_URL ? describe : describe.skip` — tests run against the real Postgres in CI (service container) and skip locally without `DATABASE_URL`.
  - Two fixture tenants (`tenantA`, `tenantB`) with fixed UUIDs and `clerk_org_id`s like `org_test_leave_sync_a` for cross-tenant isolation assertions; cleanup keyed on those IDs in `beforeEach`/`afterAll`.
- The Xero status-read function the handler calls: find it with `grep -n "ForRegion\|@repo/xero" packages/jobs/src/handlers/reconcile-xero-approval-state.ts | head` — mock exactly that symbol, the way the exemplar mocks `fetchLeaveRecordsForRegion`.
- Test DB: CI provides `DATABASE_URL` (Postgres 16 service container, migrations applied). `turbo test:integration` runs `*.integration.test.ts` files (check `packages/jobs/package.json` for the exact script pattern and match the filename convention).

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| New test file (needs DATABASE_URL) | `bunx vitest run packages/jobs/src/handlers/reconcile-xero-approval-state.integration.test.ts` | all pass (skip without DATABASE_URL) |
| Jobs package tests | `bunx vitest run packages/jobs` | all pass |
| Integration suite | `bun run test:integration` | all pass |
| Lint | `bun run check` | exit 0 |

## Scope

**In scope**:
- `packages/jobs/src/handlers/reconcile-xero-approval-state.integration.test.ts` (create — the only new file)

**Out of scope** (do NOT touch):
- `reconcile-xero-approval-state.ts` itself — **zero production changes**, even if a test exposes a bug (report it instead).
- The other handlers and their tests.
- Test fixtures shared across packages (`packages/database/src/test-fixtures`) — build local fixtures in the test file like the exemplar does, unless an existing fixture already fits.

## Git workflow

- Branch: `advisor/009-reconcile-approval-state-tests`
- Conventional commit, e.g. `test(jobs): add characterisation tests for reconcile-xero-approval-state`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Read the handler end to end

Read `reconcile-xero-approval-state.ts` fully. Record (in the test file's header comment): the exact event/input shape `ReconcileInputSchema` requires, which `@repo/xero` symbols it imports, what status values from Xero map to which transitions, and what `isBlanketFailure` treats as run-fatal. This is the contract the tests pin.

**Verify**: you can state, from code, what happens to a `submitted` record when Xero reports it approved / declined / missing — these become tests 1–3.

### Step 2: Scaffold the integration test file

Create `reconcile-xero-approval-state.integration.test.ts` next to the handler, copying the exemplar's scaffolding: `server-only` mock, Inngest client mock, partial `@repo/xero` mock (replace the status-read function identified in Step 1), `setup-env` import, `describeWithDatabase` guard, two-tenant fixtures with unique `clerk_org_id`s (use a fresh prefix like `org_test_reconcile_a/b` to avoid colliding with other suites), and `beforeEach` cleanup that deletes rows for those org IDs across the tables the handler writes (availability records, sync runs, audit events, notifications — discover the exact tables from the handler's writes).

**Verify**: `bunx vitest run packages/jobs/src/handlers/reconcile-xero-approval-state.integration.test.ts` with a single placeholder test → runs (or cleanly skips without `DATABASE_URL`).

### Step 3: Write the characterisation cases

Minimum set (one `it` each; seed records via the database client, invoke `reconcileXeroApprovalState` directly with a valid input payload, then assert on database state):

1. **Approve transition**: tenant A record in `submitted`; mocked Xero says approved → record becomes `approved`; an audit event is written; owner notification created.
2. **Decline transition**: as above with declined → `declined`.
3. **Archive on missing**: mocked Xero reports the leave application not found → record transitions to the handler's archived/missing state (use the exact status value from Step 1).
4. **Per-record failure does not halt the run**: two records; the mock fails for the first (non-blanket error) and succeeds for the second → second record still transitions; a failure row/audit entry exists for the first; run completes.
5. **Blanket failure aborts**: mock returns an error `isBlanketFailure` classifies as fatal (e.g. auth_error — confirm from code) → run marked failed; no partial transitions beyond what the handler defines.
6. **Tenant isolation**: identical records in tenant A and tenant B; run reconciliation for tenant A only → tenant B records untouched (`updated_at` and status unchanged).
7. **Input validation**: `reconcileXeroApprovalState({})` returns/throws the validation error shape (assert on the Result/throw per the function's actual contract from Step 1).

If the handler's behaviour surprises you in a way that looks like a bug (e.g. an audit event missing, isolation violated), capture the behaviour in a `it.fails`/`todo` with a comment and report it — do not change the handler.

**Verify**: `bunx vitest run packages/jobs/src/handlers/reconcile-xero-approval-state.integration.test.ts` → 7+ tests pass (with `DATABASE_URL` set; CI will exercise them otherwise).

### Step 4: Run the full integration suite

Confirm no cross-suite interference (fixture ID collisions are the usual cause — your unique `clerk_org_id` prefix prevents it).

**Verify**: `bun run test:integration` → all pass. `bun run check` → exit 0.

## Test plan

This plan **is** the test plan — steps 2–4. Pattern source: `sync-xero-leave-records.integration.test.ts`.

## Done criteria

ALL must hold:

- [ ] `packages/jobs/src/handlers/reconcile-xero-approval-state.integration.test.ts` exists with ≥7 passing tests covering: approve, decline, archive-missing, per-record failure isolation, blanket failure, tenant isolation, input validation
- [ ] `git diff --stat -- packages/jobs/src/handlers/reconcile-xero-approval-state.ts` shows zero changes to the handler
- [ ] `bun run test:integration` exits 0 (or the suite cleanly skips without `DATABASE_URL` and passes in CI)
- [ ] `bun run check` exits 0
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` status row updated (note any bugs found in the status line)

## STOP conditions

Stop and report back (do not improvise) if:

- The handler's entry point cannot be invoked without the Inngest runtime (i.e. `reconcileXeroApprovalState` is not independently callable the way `syncXeroLeaveRecords` is in the exemplar).
- Seeding the required fixture graph (organisation → connection → tenant → person → records) needs tables/columns whose required values you cannot determine from the exemplar test or `packages/database/src/test-fixtures` — list what is missing.
- A test reveals cross-tenant writes (test 6 fails). That is a security incident, not a test problem — report immediately with the evidence.
- You need to modify the handler to make it testable.

## Maintenance notes

- These are characterisation tests: they pin today's behaviour, including any quirks. When the handler's behaviour is deliberately changed later, updating these tests is expected — the value is that the change becomes visible.
- Any `it.fails`/`todo` entries left behind are open bug reports; the reviewer should turn them into issues.
- Plans 003 and 008 touch `packages/xero` paths this job depends on; running this suite after those land is the intended payoff.
