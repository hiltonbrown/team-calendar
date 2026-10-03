# Team Calendar implementation plans

**Status: IN PROGRESS. Production readiness is not verified by any plan in this directory.**
Writing a plan proves nothing; only its recorded evidence does.

User instruction, 27 September 2026: refer to `tasks/lessons.md` and use the
authorised live database for all plans. This applies to subsequent execution as
well as Plan 162 and supersedes stale localhost, Docker or disposable-database
instructions. Refresh candidate-specific protected ownership, target, consumer
isolation and cleanup evidence; missing safeguards are implementation work.
Historical live results never establish a new candidate's pass.

Plan 160 continuation on 29 September uses isolated branch `codex/xero-e2e-completion`
from `42bb840`. It adds worker/provider and database admission, observer authority,
causal receipt producers and protected campaign fixtures. Full Plan 160 remains
IN PROGRESS: browser/OAuth admission, full drivers, real lease/drain, sanctioned
fixtures/sessions, AU policy and deployment prerequisites are still missing.
The [continuation review](160-completion-review.md) owns fresh exact-candidate evidence.
No provider campaign result is inferred from the protected domain regression suite.

Plan 162 is merged to main at `142d128` under the user's subsequent commit
and merge instruction. Fresh feed review found no blocker; the valid timed edit
crossing Sydney's repeated hour and inclusive same-day all-day edit are corrected
at `f95c8c3`. All fresh source gates pass, including 2,906 unit and 509 release
tests. Exact-candidate protected live campaign `a7c995f0` passes all 254 tests,
preserves 39 tables/386 existing rows and confirms schema, cleanup, released
ownership and restoration of the original workers. Main post-merge lint, types,
boundaries, all 2,906 units and 509 release tests pass; source/tests equal the
exact verified candidate. No push or deployment was performed. Prior
`4c603ded` and `146a74d` results remain historical candidate-specific evidence.

Plan 160 follow-up review corrected nine vetted defect groups at `5d5889c` and is
merged into main at `f3dd965`. Fresh checks PASS: 2,810
repository tests, 505 harness tests, lint, build, types and boundaries; protected online
run `b207173c-ec6b-4bef-ba68-3937ad8227df` passes 246 tests with zero owned residue,
unchanged existing content/schema and released ownership. Main post-merge lint,
release types, all 505 release tests and boundaries PASS; tested runtime bytes are unchanged.
Full Plan 160 and the real provider/browser campaign remain IN PROGRESS/NOT VERIFIED.
The current execution steps and completion ledger were verified against main `514efb5`;
completed safety contracts are preservation checks, and remaining execution starts with
Plan 160 Step 3. Discovery is 110 tests/five specs, with no scenario execution implied.
See the [follow-up review](160-execution-review.md) and
[latest diagnostic](../reports/xero-e2e/2026-09-27-ab5dbf95-8931-489b-a53f-45ee1dceda50.md).

Initial Plan 160 execution reviewed on 27 September 2026 from baseline `d6da4e8` in managed worktree
`/home/hilton/.codex/worktrees/xero-e2e-verification/teamcalendar`, branch
`codex/xero-e2e-verification`, final HEAD `eb604d0`. The isolated source slice is APPROVED:
runtime `76a5dfb`, test-only clock correction `c52c5fa`; no merge or deployment. Fresh
independent gates pass lint, build, both types, 2,810 repository tests, 457 harness tests
and boundaries. Protected online run `f782ad54-69b6-4bf3-ada0-08a535215c19` passes 27 files /
246 tests at exact runtime `76a5dfb`, with zero residue, unchanged existing content/schema
and released fence. Both fresh diagnostic formats remain NOT VERIFIED and rerender
byte-identically. See [execution review](160-execution-review.md) and
[runtime prerequisites](160-execution-prerequisites.md). Full Plan 160 stays IN PROGRESS:
the actual lease, case/controlled/causal producers, AU decision, fixture/session and
deployed-candidate handoffs remain missing. No live campaign PASS or production sign-off.

Plan 160 was reviewed and reconciled against source candidate `5d2e57b`: 2,810 repository tests, 395 tooling tests and protected Neon/Redis 27 files / 246 tests, with migration and cleanup evidence. These are historical results, not fresh runs. The [published diagnostic report](../reports/xero-e2e/2026-09-26-3c9912d5-3785-4276-8a13-8aa05b14e710.md) remains NOT VERIFIED for the real campaign and charter sign-off. Plan 160 now distinguishes implemented guard/report foundations from remaining recovery and operational execution wiring.

Plan 162 (ICS and calendar corrections) is completed and merged to main at `142d128` (see Completed and retired plans below). Plan 159 retains calendar freshness/import ownership. Plan 160 and go-live retain the live publication and calendar-client campaign.

## Active plans

| Plan | Scope | Priority | Status |
| --- | --- | --- | --- |
| [000: Australian go-live](go-live.md) | Release-wide readiness, deployment gates and rollout | P0 programme | IN PROGRESS: reviewed at `6005a5a` on 2 October; source/fixture evidence reconciled; C1 database proof, P3 export, D1 CI, admission/browser fixes and Xero execution/rollout remain open |
| [159: Xero sync and onboarding](159-xero-sync-and-onboarding.md) | Import completeness, retry-safe jobs, person reconciliation, AU approval semantics, onboarding, calendar freshness | P1 | IN PROGRESS: AU local submission and create-on-approval decision approved on 2 October; implementation and verification in the Plan 160 continuation. Remaining import, identity, onboarding and calendar work stays open |
| [160: Xero end-to-end verification and report](160-xero-end-to-end-verification-and-report.md) | 26-scenario live campaign and the evidence report contract | P1 | IN PROGRESS: AU workflow and runtime corrections reviewed; live additive migration verified. Protected regression observed 137 passed and 12 failed tests, with clean restoration; scoped test repairs underway. Fixed 24-hour wait removed. Provider/browser campaign remains NOT VERIFIED |
| [161: Xero connection lifecycle hardening](161-harden-xero-connection-lifecycle.md) | Charter only: shared boundaries, architecture, 40-case evidence matrix, Section 9.3 production sign-off | P1 charter | IN PROGRESS: all nine implementation sub-plans (161-pre through 161h) are DONE and merged in main; charter Section 9.3 sign-off and 40-case matrix remain open for the live campaign |

## Supporting specifications and review ledgers

The following canonical documents support the active plans above:

| Document | Purpose | Status |
| --- | --- | --- |
| [160-au-transition-contract-v1.md](160-au-transition-contract-v1.md) | Authoritative AU transition contract v1 (cited in `AGENTS.md`) | ACTIVE: normative specification for AU leave submission and create-on-approval |
| [160-completion-review.md](160-completion-review.md) | Plan 160 completion continuation review, updated 2 October 2026 | ACTIVE: records merge scope through `7431c27` and remaining campaign requirements |
| [160-execution-prerequisites.md](160-execution-prerequisites.md) | Plan 160 execution prerequisites | ACTIVE: records concrete runtime, worker, fixture and database prerequisites |
| [160-execution-review.md](160-execution-review.md) | Plan 160 detailed execution review | ACTIVE: comprehensive verification record, candidate comparisons and test evidence |
| [161-xero-provider-contract.md](161-xero-provider-contract.md) | Xero provider contract ledger | REFERENCE: authoritative ledger of Xero HTTP calls, scopes, pagination, deadlines and rate buckets |

## Completed and retired plans

To keep the active planning surface focused and actionable, completed plans and superseded historical artifacts have been retired from the active directory. Their full specifications, reviews and evidence remain permanently recoverable from Git history:

- **Plan 162: ICS and calendar corrections (DONE, merged to main at `142d128`)**:
  Corrected all twelve confirmed feed/calendar defects (F1-F12) and Sydney repeated-hour date edits at tested source `f95c8c3`. Verified with 2,906 unit tests, 509 release tests, and 254 protected live tests with full database preservation. Retired files: `162-execution-design.md`, `162-execution-plan.md`, `162-execution-review.md`, `162-executor-evidence.md`, and `162-ics-calendar-review.md`.
- **Plan 161 implementation sub-plans (DONE, merged to main)**:
  All nine implementation sub-plans are complete and integrated into main:
  - `161-pre`: Verification baseline, mandatory env variables, worker-thread plugin transport (approved at `c0c11f7`).
  - `161a`: Provider contract ledger, protected fixture ownership (approved at `6dc882b`).
  - `161b`: Immutable payroll-to-Xero-tenant binding and database trigger (passed at `bade686`).
  - `161c`: Absolute deadlines, key-version-aware encryption (approved source `caa98406`).
  - `161d`: Canonical credential owner and safe OAuth adoption (merged at `128cc66`).
  - `161e`: Shared fail-closed distributed rate budgets across deployments (merged at `bebd7e6`).
  - `161f`: Durable disconnect with truthful receipts and fenced cleanup (merged at `bebd7e6`).
  - `161g`: Actionable recovery reasons and scoped credential resolver (merged at `2a24395`).
  - `161h`: Report-only inactivity assessment, preflight, metrics and rollout runbook (merged at `2a24395`).
  All 23 database migrations are applied. Individual sub-plan files (`161-pre`, `161a`–`161h`) and execution report (`161-xero-execution-report.md`) are retired to Git history. The charter `161-harden-xero-connection-lifecycle.md` remains active for release sign-off.
- **Historical reconciliations and scratch artifacts (RETIRED)**:
  - `160-161-reconciliation.md`: 27 September reconciliation, superseded by 2 October continuation and main merges.
  - `credential-purge-request.md`: 19 September scratch support request, retired to Git history.
  - `proposed-release-workflow.patch`: 19 September unapplied CI workflow patch, retired to Git history.
- **Historical numbered plans 1 through 158**:
  Retired to Git history. Do not recreate them as an execution queue.

## Who owns what: read this before implementing anything

The active Xero plans have distinct ownership:

| Work | Owner | Status |
| --- | --- | --- |
| Wrong-file reconnect guard | **161b** | Implemented in main (enforced by DB constraint and trigger) |
| Credential owner, token and lock lifecycle | **161d** | Implemented in main (canonical owner model) |
| Import completeness, retry-safe runs, person reconciliation, AU semantics, onboarding, calendar freshness | **159** | Active in `plans/159-xero-sync-and-onboarding.md` |
| AU transition contract (`au-contract-v1`) | **160 / 159** | Approved and implemented in `plans/160-au-transition-contract-v1.md` |
| Live campaign execution and evidence report | **160** | Active in `plans/160-xero-end-to-end-verification-and-report.md` |
| Release-wide deployment gates and rollout | **go-live.md** | Active in `plans/go-live.md` |

**Plan 159's Step 3 and findings X5 and X6 are superseded in full** by the completed Plan 161 implementation. Do not reimplement them. Everything else in 159 remains active.

Plan 160's reviewed source now supplies durable recovery, report delivery, connection-action scope, strict causal ingestion and scenario/lifecycle collection contracts. The follow-up candidate `5d5889c` is integrated into main at `f3dd965`, with AU workflow and runtime admission integrated at `bf01911`. Remaining execution requires actual browser/provider campaign verification against sanctioned fixtures.

## Dependency notes

All unrunnable gate blockers have been addressed. Plan 161 implementation sub-plans (161-pre through 161h) and Plan 162 are completely executed and integrated. The remaining execution dependencies are:

1. **AU Leave Flow Proof (Plan 160 & 159)**: AU submission remains local pending manager approval, which creates scheduled leave synchronously in Xero (`au-contract-v1`). Synchronous verification can execute against candidate development servers with guarded live fixtures.
2. **Campaign Admission & Quota (Plan 160 & 161)**: Immediate namespace operator removes the fixed 24-hour hold. Quota admission and real role sessions are required before live provider calls.
3. **Australian Release Readiness (go-live.md)**: Governs overall release gates, deployment readiness, and production rollout sign-off (including Plan 161 charter Section 9.3).

**Fixture registration is shared state.** Current live integration suites are registered in `tooling/release/integration-inventory.ts` and `packages/database/src/live-test-fixture.ts`. Do not loosen or delete fixture assertions; the exact suite count prevents unregistered suites from allocating unprotected slots.

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

Plan 160 review at `92d67c5`: rejected recreating the existing guard/report/oracle foundation,
using discovery or aggregate test totals as scenario proof, and treating local `--preflight`
as live admission. That initial remaining-work assessment is superseded by merged runtime
`5d5889c`: R1/R3/R5/R6 and R7 ingestion contracts are implemented and verified. Actual
operational admission, causal/layer producers, complete case drivers and campaign proof
remain open; default live refusal stays intentional until runtime enforcement is verified.

Recorded so they are not re-audited. Detailed reasons and provider evidence limits are in the
Plan 161 charter and in Plan 159's own rejected list.

- **Replacing server-side OAuth** (PKCE rewrite, browser-held secret): the authorisation-code
  flow is correct. The defects are in lifecycle, not in the flow.
- **Deleting every unselected connection**: app-wide inventory visibility is not deletion
  authority, and a customer's other payroll files appear in the same inventory.
- **Treating invalid credentials as verified remote absence**: an invalid refresh grant says
  nothing about whether the remote connection still exists.
- **Login-only inactivity**: an actively consumed calendar feed with no login is the product
  working as designed. See Plan 161 charter and git history.
- **An unconditional shared-grant redesign**: credential coordination is required (Plan 161 charter), but
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

## Local development environment record, 2 October 2026

Verified at `bf01911`: `bun run typecheck` and six consecutive `bun run build` runs pass, and
`bun run dev` serves app, API, web, email and Inngest without route errors. One earlier `app`
build failure (PostCSS parsing `instrumentation.ts`, `next/font` transform crash) did not
reproduce after `.next` was removed; treat a recurrence as stale `.next` state first.

Two scheduled functions fail closed in local development by design. Both stay NOT VERIFIED:

- **`schedule-xero-syncs` and all local Xero admission.** `XERO_CREDENTIAL_DOMAIN_ID`,
  `XERO_RATE_NAMESPACE_EPOCH` and `XERO_APP_TIER` are absent from every Vercel environment,
  including Production, so Production Xero admission is probably denied too. Local
  `.env.local` uses the Neon `main` branch and the KV store shared with Production. An
  isolated `local-dev` namespace (fresh local-only domain UUID, `starter` tier, initialised
  with `bun run rate:initialise-namespace` in `packages/xero`) was prepared but blocked by the
  agent host's permission classifier as a shared-resource change. The operator must apply it,
  or set canonical values in Vercel first.
- **`send-notification-emails`.** `RESEND_FROM` exists only in Production. The agent host
  blocked downloading Production values. Setting it locally drains the real queue against the
  shared database.

## Go-live programme record

Current release queue and reviewed evidence boundaries are in [go-live.md Sections 1–2 and 11](go-live.md). Its 27 September review supersedes the pending-work descriptions below; it does not certify production readiness.

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
