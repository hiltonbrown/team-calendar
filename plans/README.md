# Team Calendar implementation plans

Reconciled and reviewed on 4 October 2026 against `604d754`. This directory
contains remaining work and the contracts it relies on. Production readiness,
authenticated Xero journeys and lifecycle sign-off remain **NOT VERIFIED**.

## Execution order and status

| Plan | Remaining outcome | Priority | Status |
| --- | --- | --- | --- |
| [160: Prove the AU leave flow](160-xero-end-to-end-verification-and-report.md) | Repair the CI integration gate, replay protected live integration once, prove the bounded AU flow through the real UI, clean up and report | P1 | TODO from Step 1; provider/UI steps BLOCKED on campaign-store admission policy |
| [000: Australian go-live](go-live.md) | Finish release correctness, export, admission and CI work; collect candidate/deployed evidence; deploy and complete wider journeys and rollout | P0 programme | IN PROGRESS; see its queue for per-gate dependencies |
| [161: Xero lifecycle sign-off](161-harden-xero-connection-lifecycle.md) | Collect case-specific evidence for Section 8.3 and production sign-off in Section 9.3 | P1 sign-off | Implementation merged; remaining live matrix and rollout NOT VERIFIED |

Plan 160 is the next bounded deliverable. Independent go-live source work may
proceed alongside it. The wider release campaign belongs to go-live; Plan 160's
single AU flow cannot close the lifecycle matrix or certify production readiness.

## Supporting contracts

| Document | Purpose |
| --- | --- |
| [AU transition contract v1](160-au-transition-contract-v1.md) | Approved local submission and synchronous Xero creation on manager approval, including uncertainty recovery. Referenced by `AGENTS.md` and `PRODUCT.md`. |
| [Xero provider contract ledger](161-xero-provider-contract.md) | Endpoint, scope, pagination, deadline and rate contracts. Repository observations, dated provider documentation and live observations are distinct. |

These are active specifications, not completed implementation plans to delete.

## Dependencies and verification rules

1. Resolve the ordinary-invocation campaign-store sentinel policy before Plan
   160's provider/UI steps and production deployment. Current callers fail closed
   when the sentinel is absent. Keep the database, binding, credential-domain,
   shared quota and fixture controls intact. A written plan does not approve a
   change to that policy.
2. Make the existing CI integration gate pass in its configured local PostgreSQL
   and Redis environment. Local CI evidence is separate from operator release
   evidence; `ALLOW_LOCAL_DATABASE_TESTS=1` never authorises a remote target.
3. Use the authorised Neon target only through
   `tooling/release/run-live-integration.ts` with fresh protected ownership, target,
   restore, consumer-isolation and cleanup evidence. Reuse existing authority;
   a historical run does not verify a changed candidate.
4. Require the exact candidate's source gates before deployment, then deployed
   role, browser, provider and scheduled-worker proof before release sign-off.
   Preparation, deployment and final sign-off are separate phases, not circular
   dependencies.
5. Preserve `au-contract-v1`: submission stays local; approval creates scheduled
   leave synchronously; uncertain creation requires administrator recovery. NZ
   and UK remain unavailable. Remote cleanup remains `report_only` until reviewed
   provider evidence and the staffed operator procedure permit enablement.

The root gates are `bun run check`, `bun run typecheck`, `bun run test` and
`bun run test:integration`. Build before final types to generate Next route
validators. Boundary checks, release-tool checks and protected/deployed proof
are additional requirements where the retained plans specify them. No source
or database gate was rerun during this planning-only reconciliation.

## Completed and outdated material removed

- Plan 159 is complete at candidate `4bb6fca`, merged into current main at
  `604d754`. Its source tree under `apps`, `packages`, `tooling` and `PRODUCT.md`
  matches that candidate. Spot-checks confirmed completeness-aware leave sync,
  retry/run lifecycle, person reconciliation, durable initial dispatch,
  entity-specific onboarding and calendar updates. Its recorded source gates
  remain historical; production round trips are still unverified. The completed
  plan was removed, and remaining deployed proof is owned by go-live.
- Plans 1 through 158, the nine Plan 161 implementation slices, Plan 162 and
  superseded execution diaries were already absent at the reviewed HEAD. Their
  specifications and evidence remain in Git history. Do not recreate them as a
  queue or treat their past results as current-candidate evidence.
- Completed implementation instructions and obsolete source anchors in the
  retained plans are replaced by current state and outstanding verification.

Recover the removed Plan 159 with
`git show 604d754:plans/159-xero-sync-and-onboarding.md`. Numbering remains
monotonic; the next new numbered plan is 163. This review creates no new plan.

## Decisions retained

- Server-side OAuth, canonical credential ownership, immutable payroll binding,
  synchronous outbound writes and fail-closed shared admission are intentional.
- Inventory visibility does not authorise deleting unselected payroll files;
  invalid credentials do not prove remote absence. A targeted disconnect must
  preserve other bindings sharing an authoriser.
- Feed use without login is legitimate activity. Inactivity remains manually
  scoped and report-only; no automated notice, disable or deletion follows it.
- The broader 26-scenario harness is frozen under the approved Plan 160 rescope.
  Do not extend it to complete the bounded AU proof.

## Review checklist

- [x] Read every file present under `plans/` at `604d754`.
- [x] Reconcile statuses with current source, merge history and recorded evidence.
- [x] Remove the completed Plan 159 and refresh remaining plans and contracts.
- [x] Keep all edits within `plans/` and preserve unverified external gates.
- [x] Validate final references, retained case inventory and whitespace after review.

This checklist replaces a `tasks/todo.md` update because the explicitly invoked
improve skill limits this task's writes to `plans/`.

Review validation passed: six retained documents, no missing relative Markdown
targets, balanced code fences, no em dashes, all 40 lifecycle case assertions and
evidence requirements unchanged, completed Plan 159 candidate ancestry/source
equivalence, and `git diff --check`. Only files under `plans/` changed. Application
tests, live gates and deployment were outside this planning review.
