# Team Calendar implementation plans

[Ship Team Calendar's Australian release](go-live.md) is the active release programme.
Reviewed against `80ac9f7` and the supplied working tree on 19 September 2026.
**Plan status: IN PROGRESS. Production readiness is not yet verified.**

| Plan | Priority | Status | Completion evidence |
| --- | --- | --- | --- |
| [Australian go-live](go-live.md) | P0 release programme | IN PROGRESS | Executor branch `codex/go-live-candidate`; Section 11 records current execution and verification |
| [159: Xero sync and onboarding](159-xero-sync-and-onboarding.md) | P1 correctness and shared onboarding | TODO | Planned at `246ba27`, 20 September 2026; source implementation and live round trips remain NOT VERIFIED |
| [160: Xero end-to-end verification and report](160-xero-end-to-end-verification-and-report.md) | P1 integration proof | TODO | Follow-up to 159; 26 scenarios, live/provider evidence, cleanup and report contract; live tests NOT VERIFIED |
| [161: Xero connection lifecycle hardening](161-harden-xero-connection-lifecycle.md) | P1 production connection safety | TODO | Planned at `585f6cb`, 21 September 2026; supersedes 159 Step 3 and its unconditional shared-grant prescription; source and live verification NOT VERIFIED |

Plan 161 owns tenant binding, authorisation provenance, remote reconciliation,
distributed rate enforcement, permission recovery, token deadlines and report-only
inactivity assessment. Execute its binding guard first, then durable cleanup,
shared limits and recovery. It selects one active binding per Xero app/external
tenant across accounts, with historical mappings retained and a duplicate-data
migration gate. A shared-grant schema is conditional on provider evidence.

**Partially superseded:** Plan 159 Step 3, X6 and their corresponding verification
criteria are stale; use Plan 161 for that work. Plan 159's independent import,
identity, AU semantics and onboarding work remains TODO. Do not implement both
lifecycle prescriptions. Plan 160 can prepare its harness alongside both plans;
its final connection sign-off depends on Plan 161's regression and live evidence
matrix as well as Plan 159's remaining integration work. Production readiness
cannot be inferred from writing these plans.

Considered and rejected for connection hardening: replacing server-side OAuth,
deleting every unselected connection, treating invalid credentials as verified
remote absence, login-only inactivity and an unconditional shared-grant redesign.
Detailed reasons and provider evidence limits are in Plan 161.

Plan 159 is the focused follow-up to the Xero audit. It covers import completeness,
retry-safe jobs, employee reconciliation, AU approval semantics,
guided onboarding and calendar freshness. It does not recreate the retired backlog
or supersede unrelated release work. Execute its dependency table: reliability,
connection and identity work can proceed independently; durable import precedes
the final onboarding/calendar integration. The AU submission contract requires
an explicit product decision before that behaviour changes. Reuse the release
programme's existing recovery and owned-fixture infrastructure. Plan 159 records
the current CI/local versus live-release verification distinction and rejected
approaches; preserve all completed release evidence below.

Plan 160 prepares the test harness alongside Plan 159, then verifies its deployed
candidate and produces Markdown/JSON reports even when tests fail or prerequisites
are missing. It does not repeat the implementation work. Full PASS depends on
Plan 159's approved AU contract, live Xero/browser/job/data evidence, tenant
isolation and verified cleanup. Executing the test/report task is distinct from
passing the integration; source mocks and queued events cannot certify it.

Execution began on 19 September 2026 in the isolated worktree
`/home/hilton/.codex/worktrees/australian-go-live/teamcalendar`.
The source drift check against `80ac9f7` was empty. The user's consolidation
commit `54f8df5` changes plans only and is preserved.
The user explicitly authorised live database tests during execution. Use the
configured live Neon database with owned fixtures and cleanup; do not request
that permission again or treat independent source work as blocked.

Start D1's test isolation and C6's manager-scope fix immediately. Progress
payroll recovery, webhooks, email, preflight and independent UI/performance work
alongside provider discovery. The plan defines the full dependency order, exact
source/test paths, regression cases and measurable results. It does not require
another planning or mode-selection stage before implementation.

Use the existing Australian invitation-only early-access default, configured
explicitly. Finish all confirmed source issues, including billing replay and
P2 performance work. Actual production mutations still require the applicable
authority and concrete safety evidence. A missing provider action pauses that
action only; complete the independent work and record the precise remaining
requirement in the execution ledger. Never substitute a waiver for a passing
product/security gate.

Database work retains the live-Neon-only constraint. Ordinary checks must not
connect to a database. Guard all live tests, including the app integration suite;
never run development seeding, reset, rebaseline, `db push` or `migrate dev`
against live Neon. Apply reviewed additive migrations before their live tests.

Preserve the existing removed-plan consolidation. Completed, superseded and
regional plans remain recoverable from Git history; do not recreate them as an
execution queue. NZ and UK remain disabled and outside this Australian release.
Future activation needs a separate current-source plan and live provider proof.

The review corrected stale production claims, the Sentry edit path, email
preflight/runtime mismatch, unsafe test entry points, first-owner admission and
missing submit-recovery details. It added the confirmed manager empty/missing
scope disclosure and expanded sync performance work to include the overview.
Rejected findings and maintenance rules are recorded at the end of the plan.

Final candidate `816b181` is clean. Fresh Node 24 source gates passed all three
app builds, checks, types, 2,231 unit tests and 29 release-tool tests. Independent
affected Node 22 checks passed 433 availability and 29 release-tool tests.
Live read-only verification found and confirmed the fix for a holiday filter
defect; all 13 status filters now match actual displayed status, with constant
query counts at requested page sizes 1/50/200. These checks do not substitute for
the guarded full integration run or deployed browser/provider proof.

Section 11 of the plan records provider changes already applied, verification
evidence and the remaining external inputs and exact workflow approval. The
candidate has not been deployed; production readiness remains unverified.
