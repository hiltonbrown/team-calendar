# Team Calendar implementation plans

**Status: IN PROGRESS. Production readiness is not verified by any plan in this directory.**
Writing a plan proves nothing; only its recorded evidence does.

Index last reviewed at `8652c31`, 22 September 2026. All eleven Xero plans were checked
together for consistency on that date: every gate command was verified to exist and to be
runnable where a plan claims it, every cross-plan link resolves, and all drift-check baselines
were normalised to `8652c31`.

## Active plans

| Plan | Scope | Priority | Status |
| --- | --- | --- | --- |
| [Australian go-live](go-live.md) | Release-wide readiness, deployment gates and rollout | P0 programme | IN PROGRESS |
| [159: Xero sync and onboarding](159-xero-sync-and-onboarding.md) | Import completeness, retry-safe jobs, person reconciliation, AU approval semantics, onboarding, calendar freshness | P1 | TODO |
| [160: Xero end-to-end verification and report](160-xero-end-to-end-verification-and-report.md) | 26-scenario live campaign and the evidence report contract | P1 | TODO |
| [161: Xero connection lifecycle hardening](161-harden-xero-connection-lifecycle.md) | Charter only: shared boundaries, architecture, 40-case evidence matrix, references | P1 | IN PROGRESS |

Plan 161 is a charter plus nine executable sub-plans. It deliberately contains no unit
bodies; the implementable work is in the table below.

### Plan 161 sub-plans

Execute in order. Each is self-contained and written for an executor with no other
context: read the plan fully, honour its STOP conditions, update your row when done.

| Plan | Title | Priority | Effort | Risk | Depends on | Status |
| --- | --- | --- | --- | --- | --- | --- |
| [161-pre](161-pre-executor-gate-corrections.md) | Record the verification baseline, mark the two mandatory env variables, confirm the preflight gate | P1 | S | LOW | - | DONE: approved at `c0c11f7`; all gates passed after selecting Turbopack's worker-thread plugin transport |
| [161a](161a-xero-baseline-and-fixture-ownership.md) | Baseline, provider contract ledger, protected fixture ownership | P1 | M | LOW | 161-pre | DONE: approved at `6dc882b`; all local gates passed, 26 protected fixture suites registered |
| [161b](161b-xero-immutable-tenant-binding.md) | Immutable, database-enforced payroll-to-Xero-tenant binding | P1 | L | HIGH | 161a | IN PROGRESS: implementation merged to main at `e69ce4f`; development migrations A-C applied; protected integration suites NOT VERIFIED |
| [161c](161c-xero-deadlines-and-key-versioning.md) | Absolute deadlines through response bodies; key-version-aware encryption | P1 | M | MED | 161a, 161b | TODO |
| [161d](161d-xero-canonical-credentials.md) | Canonical credential owner and safe OAuth adoption | P1 | L | HIGH | 161b, 161c | TODO |
| [161e](161e-xero-shared-rate-limits.md) | Shared, fail-closed, tier-aware distributed rate budgets | P1 | L | HIGH | 161a, 161c | TODO |
| [161f](161f-xero-management-cleanup.md) | Durable, narrowly authorised disconnect with a truthful receipt | P1 | L | HIGH | 161b, 161c, 161d, 161e | TODO |
| [161g](161g-xero-permission-recovery.md) | Distinct recovery reasons; full caller migration onto the resolver | P1 | L | MED | 161d, 161e, 161f | TODO |
| [161h](161h-xero-rollout-and-inactivity.md) | Report-only inactivity, monitoring, preflight, documented rollout | P2 code, P1 rollout | M | MED | 161b-161g | TODO |

Status values: `TODO`, `IN PROGRESS`, `DONE`, `BLOCKED` (with a one-line reason),
`REJECTED` (with a one-line rationale).

The Plan 161 charter moves to DONE only when every sub-plan is DONE **and** the charter's
Section 9.3 production-hardening sign-off criteria pass. A sub-plan reaching DONE certifies
its own unit and nothing else.

## Who owns what: read this before implementing anything

The three Xero plans overlap. Implementing the same guard twice is worse than implementing
it once, because each copy looks correct in isolation.

| Work | Owner | Explicitly NOT |
| --- | --- | --- |
| Wrong-file reconnect guard (159 finding X5) | **161b** | 159 Step 3.1, which is dead text |
| Credential owner, token and lock lifecycle (159 finding X6) | **161d** | 159 Step 3.3, which is dead text |
| Import completeness, retry-safe runs, person reconciliation, AU semantics, onboarding, calendar freshness (159 findings X1-X4, X7-X11) | **159** | not superseded; still active |
| Live campaign execution and the evidence report | **160** | 159 and 161 write assertions; 160 runs them |
| Release-wide deployment gates and rollout | **go-live.md** | no Xero plan certifies release readiness |

**Plan 159's Step 3 and findings X5 and X6 are superseded in full.** Do not implement them.
Everything else in 159 remains active. Plan 159's header carries the same warning, including
one reversed instruction: its Step 3.2 says not to assume global tenant uniqueness across
accounts, whereas Plan 161 has since **selected** exactly that policy and enforces it with a
database constraint. Follow 161.

Plan 160 can prepare its harness alongside both. Its final connection sign-off depends on
161's 40-case evidence matrix (charter Section 8.3) and on 159's remaining integration work.

## Dependency notes

**The unrunnable gates are already fixed.** Three commands cannot exit 0 in an executor's
environment: `bun run preflight` needs a positional argument and production-only configuration;
`bun run test:release` needs a deployed candidate plus Firefox and WebKit, which are not
installed; `bun run build` needs two gitignored variables absent from any fresh worktree. All
three have been removed from every Commands table and Done criteria checklist in 161a-161h and
replaced with runnable equivalents, and all eight sub-plans now carry a "Fresh worktree setup"
block. The preflight and browser requirements were relocated, not deleted: they remain sign-off
criteria in the charter's Section 9.3, executed during the 161h rollout and the Plan 160
campaign.

**161-pre completed at `c0c11f7`.** It recorded the verified-green baseline, marked
`DATABASE_URL` and `XERO_TOKEN_ENCRYPTION_KEY` as mandatory in the two `.env.example` files,
confirmed the preflight gate that 161e and 161h depend on, and selected Next.js's worker-thread
Turbopack plugin transport so the exact production build runs without local socket binding.
Plan 161a completed at `6dc882b`; Plans 161b and 161c are now unblocked.

With 161-pre done:

- **161a** is complete. It registered the protected fixtures every later integration suite
  allocates from; 161b and 161c may now proceed against those reserved ownership slots.
- **161b then 161c, sequentially.** Both edit `completeXeroTenantSelection`,
  `loadPendingSession` and `service.integration.test.ts`, and share the local test database.
- **161e** needs only 161a and 161c (its rate keys use `XERO_CLIENT_ID` directly); it may run
  before or after 161d.
- **161g** reads 161f's cleanup records for the `disconnect_pending` state, so it follows 161f.
- **161d** needs 161b's binding generation and 161c's keyring before it moves a single token.
- **161e** needs 161c's corrected transport, or it inherits the unbounded-body defect.
- **161f** needs all four: it fences deletion on binding generation, uses the owner coordinator
  for its fallback credential, and consumes shared admission.
- **161g** finishes 161d's cutover. Leaving it undone means the new owner model coexists with
  legacy readers that refresh independently, which is the exact failure 161d exists to prevent.
- **161h** documents the rollout for 161b-161g and produces false readiness signals if run early.

**Review of 161b-161h at `6b934be` (23 September 2026).** All seven plans were re-verified
against the code and rewritten where they had drifted or conflicted. Programme-wide decisions now
recorded in the plans: the binding lives on the existing `XeroTenant` row (no
`XeroTenantBinding` table); provider app ID is `XERO_CLIENT_ID`; every plan that adds an
integration suite also adds it to `tooling/release/integration-inventory.ts`; integration and
migration gates run only against a local Postgres (and, from 161e, a local Redis REST store), and
are recorded `NOT_VERIFIED` with status `BLOCKED`, never `DONE`, when those are unavailable;
161d keeps legacy readers working by mirror-writing owner tokens until 161g; `@repo/availability`
never imports `@repo/xero`; remote cleanup defaults to `report_only` via
`XERO_REMOTE_CLEANUP_MODE`, which **stops today's inline remote revoke until an operator enables
it**.

**A single owner must hold the schema and credential contract across 161b, 161d and 161f.**
Two agents implementing ownership models concurrently in the same service will produce
incompatible results that each pass their own tests.

**Fixture registration is shared state.** 161a registers five new integration suites and 159
registers four more. Both bump the same two hard-coded count assertions in
`packages/database/src/live-test-fixture.test.ts` (lines 92 and 224). Neither plan states a
literal answer, because the correct number depends on which lands first: both instruct the
executor to derive it from
`grep -c "integration.test.ts" packages/database/src/live-test-fixture.ts` and confirm with
`bun run --cwd packages/database test`. Do not loosen or delete those assertions; the exact
count is what stops an unregistered suite from allocating an unprotected fixture slot.

## Verified baseline at `8652c31`

Every gate that can pass locally was run against a clean tree on 22 September 2026. Any
failure an executor sees from here is attributable to its own work, not inherited.

| Gate | Result |
| --- | --- |
| `bun run check` | exit 0, 1033 files |
| `bun run typecheck` | exit 0, 19/19 turbo tasks |
| `bun run boundaries` | exit 0, 994 files in 21 packages |
| `bun run test` | exit 0, 18/18 turbo tasks |
| `bun run build` | exit 0, 4/4 turbo tasks |
| `bun run test:release-tools` | exit 0, 11 files, 47 tests |
| `bun run typecheck:release-tools` | exit 0 |
| `bun run --cwd apps/app test 'app/(authenticated)/settings/integrations/xero'` | exit 0, 6 files, 43 tests |

Two gates are **not** local and appear in no plan's Done criteria:
`bun run preflight <app\|api\|web>` requires production configuration, and
`bun run test:release` requires a deployed candidate plus Firefox and WebKit. They belong to the
161h rollout and the 160 campaign respectively. The local substitutes are
`bun run --cwd packages/next-config test` (37 tests at this baseline, including a
secret-redaction case) and
`bun run --cwd apps/app test 'app/(authenticated)/settings/integrations/xero'` (6 files, 43
tests). Browser assertions are written as a deliverable and recorded NOT_VERIFIED until the 160
campaign runs them.

Plan 159's regression tripwire, also measured here: `packages/jobs` sync/schedule tests
reported **57 passed**, and the three `apps/app` Xero tests reported **17 passed**. A drop in
either count means a regression test was deleted rather than fixed.

## Findings considered and rejected

Recorded so they are not re-audited. Detailed reasons and provider evidence limits are in the
Plan 161 charter and in Plan 159's own rejected list.

- **Replacing server-side OAuth** (PKCE rewrite, browser-held secret): the authorisation-code
  flow is correct. The defects are in lifecycle, not in the flow.
- **Deleting every unselected connection**: app-wide inventory visibility is not deletion
  authority, and a customer's other payroll files appear in the same inventory.
- **Treating invalid credentials as verified remote absence**: an invalid refresh grant says
  nothing about whether the remote connection still exists.
- **Login-only inactivity**: an actively consumed calendar feed with no login is the product
  working as designed. See 161h test 1.
- **An unconditional shared-grant redesign**: credential coordination is required (161d), but
  conditional on verified authoriser identity, never on unverified claims or token-string
  equality.
- **Whole-user token revocation to remove one binding**: would break that authoriser's other
  payroll files.
- **A cleanup credential escrow by default**: any unavoidable retention exception needs its own
  bounded, documented security contract first.
- **Requiring every member to connect Xero**: credentials already belong to the payroll entity.
  Retain shared use and restricted administration.
- **Automatically merging matching names**: unsafe for real employee and payroll identity.
- **Marking scheduled leave pending**: falsifies Xero state and leaves payroll effects.
- **Moving outbound writes to jobs**: conflicts with synchronous, user-triggered writes.
- **"Just refresh the calendar"**: fixes stale presentation only, not failed imports or
  mismatched people.

## Supporting documents

| Document | Purpose |
| --- | --- |
| [credential-purge-request.md](credential-purge-request.md) | Prepared, **not submitted**. GitHub Support request to remove retained pull-request references exposing a credential previously committed in `.mcp.json`. Submit only after confirming revocation; never attach credentials or unredacted scanner output. |
| [proposed-release-workflow.patch](proposed-release-workflow.patch) | Proposed CI restructure splitting `.github/workflows/ci.yml` into source gates and release stages. Not applied. |

## Scope boundaries that apply to every plan here

- **Database**: live-Neon-only policy retained. Ordinary checks must not connect to a database.
  Guard all live tests, including the app integration suite. Never run seeding, reset,
  rebaseline, `db push` or `migrate dev` against live Neon. Apply reviewed additive migrations
  before their live tests. Generate migrations with Prisma's schema-diff tooling and never
  hand-edit a generated migration.
- **Regions**: AU only. NZ and UK remain disabled and outside this release. Activation needs a
  separate current-source plan and live provider proof.
- **Retired plans**: historical numbered plans end at 158. Completed, superseded and regional
  plans remain recoverable from Git history. Do not recreate them as an execution queue.
- **Authority**: a missing provider action pauses that action only. Complete the independent
  work and record the precise remaining requirement. Never substitute a waiver for a passing
  product or security gate.

## Go-live programme record

Historical execution evidence for [go-live.md](go-live.md), preserved. This section records
what happened; the plan itself holds current instructions.

Execution began 19 September 2026 in the isolated worktree
`/home/hilton/.codex/worktrees/australian-go-live/teamcalendar`, reviewed against `80ac9f7`
with an empty source drift check. The consolidation commit `54f8df5` changes plans only and is
preserved. The user explicitly authorised live database tests during execution: use the
configured live Neon database with owned fixtures and cleanup, and do not request that
permission again or treat independent source work as blocked.

Current execution guidance lives in the plan. Start D1's test isolation and C6's manager-scope
fix first, then progress payroll recovery, webhooks, email, preflight and independent UI and
performance work alongside provider discovery. Use the existing Australian invitation-only
`early_access` default, configured explicitly. Finish all confirmed source issues, including
billing replay and P2 performance work. Production mutations still require applicable authority
and concrete safety evidence.

The programme review corrected stale production claims, the Sentry edit path, the email
preflight and runtime mismatch, unsafe test entry points and first-owner admission, and added
missing submit-recovery detail, the confirmed manager empty and missing scope disclosure, and
expanded sync performance work to include the overview.

Candidate `816b181` was clean. Fresh Node 24 source gates passed all three app builds, checks,
types, 2,231 unit tests and 29 release-tool tests. Independent Node 22 checks passed 433
availability and 29 release-tool tests. Live read-only verification found and confirmed the fix
for a holiday filter defect: all 13 status filters now match actual displayed status, with
constant query counts at page sizes 1, 50 and 200. **These checks do not substitute for the
guarded full integration run or deployed browser and provider proof.** Section 11 of the plan
records provider changes already applied, verification evidence, and the remaining external
inputs and exact workflow approval. The candidate has not been deployed; production readiness
remains unverified.
