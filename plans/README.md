# Team Calendar implementation plan

[Ship Team Calendar's Australian release](go-live.md) is the only active plan.
Reviewed against `80ac9f7` and the supplied working tree on 19 September 2026.
**Plan status: READY FOR EXECUTION. Production readiness is not yet verified.**

| Plan | Priority | Status | Completion evidence |
| --- | --- | --- | --- |
| [Australian go-live](go-live.md) | P0 release programme | READY FOR EXECUTION | Its Section 11 ledger records fixes, checks and final deployed candidate |

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

Review validation: 23 focused preflight/launch-mode tests passed. Source paths,
commands, plan links and whitespace were checked. This review changed only the
two plan documents; it did not implement source fixes, run live database tests,
inspect current provider state or certify deployment/browser readiness.
