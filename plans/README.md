# Team Calendar implementation plans

Index reconciled on 4 October 2026 against `b35ea15`. The five supporting plans
and contracts retain their source-review baseline of `604d754`; the intervening
commit changes only planning documents, so their scoped source drift checks are
empty. This directory
contains remaining work and the contracts it relies on. Production readiness,
authenticated Xero journeys and lifecycle sign-off remain **NOT VERIFIED**.

## Execution order and status

| Plan | Remaining outcome | Priority | Status |
| --- | --- | --- | --- |
| [160: Prove the AU leave flow](160-xero-end-to-end-verification-and-report.md) | Repair the CI integration gate, replay protected live integration once, prove the bounded AU flow through the real UI, clean up and report | P1 | Steps 1 and 2 TODO; Steps 3 to 6 BLOCKED on campaign-store policy and operator/safety prerequisites |
| [000: Australian go-live](go-live.md) | Finish release correctness, export, admission and CI work; collect candidate/deployed evidence; deploy and complete wider journeys and rollout | P0 programme | IN PROGRESS; see its queue for per-gate dependencies |
| [161: Xero lifecycle sign-off](161-harden-xero-connection-lifecycle.md) | Collect all required unit, database, Redis, browser and provider evidence for Section 8.3 and production sign-off in Section 9.3 | P1 sign-off | IN PROGRESS; implementation delivered, current 40-case evidence and rollout NOT VERIFIED |

Plan 160 is the next bounded deliverable. Independent go-live source work may
proceed alongside it. The wider release campaign belongs to go-live; Plan 160's
single AU flow cannot close the lifecycle matrix or certify production readiness.

### Work that can proceed now

The existing plans own these tasks; this index creates no new implementation scope.

| Order | Owner | Next outcome | Dependency or limit |
| --- | --- | --- | --- |
| 1 | Plan 160 Steps 1 and 2; go-live D1 | Route the protected-only suites explicitly, prove ordinary local CI, then replay the repaired jobs tests through the protected runner | Step 2 follows Step 1 at its exact candidate; fresh live-run prerequisites still apply |
| In parallel | go-live D1, C1 and X1 | Harden source isolation/protected routing and add only missing registered database concurrency, recovery and import/identity coverage | Protected execution follows owned fixture registration and current consumer/restore evidence |
| In parallel | go-live P3 | Finish complete CSV export with bounded queries and buffering | D1 supplies owned database proof |
| In parallel | go-live G1/T1 | Correct contact/admission assertions, separate browser inventories and observe terminal sync outcomes | Deployed journeys follow O1; worker-dependent actions also require X2 |
| Before AU UI proof or deployment | go-live X2; Plan 160 blocking dependency | Resolve ordinary-action campaign-sentinel policy in a separately reviewed scope | Plan 163 source reviewed and verified; protected live replay pending |
| After those prerequisites | Plan 160 Steps 3 to 6 | Verify operator inputs, execute nine bounded AU rows, clean up and publish the sanitised report | Existing provider authority, run ownership and applicable safety gates must all hold |
| Before deployment, then after deployment | go-live X3/O1; Plan 161 | Prepare lifecycle settings/preflights, deploy the verified candidate, then collect wider journey and lifecycle sign-off evidence | Broad X2 tooling remains frozen pending a separate scope review; deployed worker enforcement precedes dependent execution |

For the complete queue, including correctness, performance, runtime, support,
security and rollback gates, use [go-live Section 2](go-live.md#2-current-queue-priorities-and-dependencies).
Blocked external work does not block independent source preparation.

## Supporting contracts

| Document | Purpose |
| --- | --- |
| [AU transition contract v1](160-au-transition-contract-v1.md) | Approved local submission and synchronous Xero creation on manager approval, including uncertainty recovery. Referenced by `AGENTS.md` and `PRODUCT.md`. |
| [Xero provider contract ledger](161-xero-provider-contract.md) | Endpoint, scope, pagination, deadline and rate contracts. Repository observations, dated provider documentation and live observations are distinct. |

These are active specifications, not completed implementation plans to delete.

## Dependencies and verification rules

1. Verify Plan 163's ordinary-invocation admission against the live target before
   Plan 160's provider/UI steps and production deployment. The reviewed source
   accepts confirmed absence without weakening active campaign isolation. Keep
   database, binding, credential-domain, shared quota and fixture controls intact.
2. Make the existing CI integration gate pass in its configured local PostgreSQL
   and Redis environment. Local CI evidence is separate from operator release
   evidence; `ALLOW_LOCAL_DATABASE_TESTS=1` never authorises a remote target.
3. Use the authorised Neon target only through
   `tooling/release/run-live-integration.ts` with fresh protected ownership, target,
   restore, consumer-isolation and cleanup evidence. Reuse existing authority;
   a historical run does not verify a changed candidate.
   Do not run the root integration command directly from the local checkout
   against its live Neon configuration. Its direct use belongs to configured
   localhost CI; the protected runner supplies the authorised live context.
4. Require the exact candidate's source gates before deployment, then deployed
   role, browser, provider and scheduled-worker proof before release sign-off.
   Preparation, deployment and final sign-off are separate phases, not circular
   dependencies.
5. Preserve `au-contract-v1`: submission stays local; approval creates scheduled
   leave synchronously; uncertain creation requires administrator recovery. NZ
   and UK remain unavailable. Remote cleanup remains `report_only` until reviewed
   provider evidence and the staffed operator procedure permit enablement.

The ordinary-action campaign sentinel and the shared rate-limit namespace
sentinel are separate prerequisites. Resolving the former does not initialise
the latter or waive worker/consumer isolation. Provider configuration observations
in the plans are dated leads and must be refreshed before dependent execution.

The root gates are `bun run check`, `bun run typecheck`, `bun run test` and
`bun run test:integration`. Build before final types to generate Next route
validators. Boundary checks, release-tool checks and protected/deployed proof
are additional requirements where the retained plans specify them. No source
or database gate was rerun during this planning-only reconciliation.

## Completed and outdated material removed

- Plan 159 implementation was recorded complete at candidate `4bb6fca`, merged at
  `604d754`. Its source tree under `apps`, `packages`, `tooling` and `PRODUCT.md`
  matches that candidate according to the prior reconciliation. That review
  confirmed completeness-aware leave sync,
  retry/run lifecycle, person reconciliation, durable initial dispatch,
  entity-specific onboarding and calendar updates. Its recorded source gates
  remain historical; production round trips are still unverified. The completed
  plan was removed, and remaining deployed proof is owned by go-live.
- Plans 1 through 158, the nine Plan 161 implementation slices, Plan 162 and
  superseded execution diaries are absent at `b35ea15`. Their
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

- [x] Read all six documents currently present under `plans/`.
- [x] Compare `604d754..b35ea15` and retain the unchanged source-review baseline.
- [x] Align index statuses, next actions and dependencies with the retained plans.
- [x] Preserve prior retirement decisions and all unverified external gates.
- [x] Limit this reconciliation's edits to `plans/README.md`.
- [x] Validate final references, document inventory and whitespace after the edit.

This checklist replaces a `tasks/todo.md` update because the explicitly invoked
improve skill limits this task's writes to `plans/`.

Validation passed: six documents, relative file targets, balanced code fences,
no em dashes, unchanged scoped source baseline, valid Plan 159 recovery target,
README-only edit scope and `git diff --check`.

This index review reruns documentation and scope checks only. The previous
reconciliation's source spot-checks, case-preservation checks and candidate
equivalence remain recorded history. Application tests, remote CI, database,
browser, provider and deployment gates are not rerun by this index update.
