# Plan 160 execution prerequisites

Status: IN PROGRESS. This handoff records concrete runtime contracts absent from the reviewed candidate. It grants no deployment, worker activation, provider deletion or payroll operation.

Reviewed source: d6da4e8fbab70e3135e3a7a33fd49cb0c24a91a2, 27 September 2026. The isolated harness corrections require their own frozen candidate and fresh gates. Fresh operational metadata is maintained by the advisor in plans/160-execution-review.md.

## Enforced execution lease

`packages/jobs/src/handlers/xero-sync-access.ts` validates Clerk/payroll organisation and binding generation. `packages/jobs/src/events.ts` carries a sync operation run identifier, not an independently admitted E2E campaign authority. `SyncXeroPeopleInputSchema` and the registered handlers do not consult the E2E execution manifest, active-run ownership or an allowed function inventory. Consequently an E2E manifest cannot enable current workers safely. `currentXeroWorkerCapability().available` remains false.

The application/orchestration owner must supply a versioned contract that checks exact Clerk organisation, payroll organisation, campaign run, binding generation and allowed function before dispatch and before persistence. Ordinary cron/bootstrap/retry work must be denied for owned fixtures during the campaign; wrong tenant, wrong campaign, stale generation, expired authority and revoked ownership must fail closed. Retain and independently read back prior worker settings, registered candidate revision, terminal drains (including queued/retrying work) and restoration. Provide regressions and real registered-handler evidence, not manifest labels or queue acknowledgements.

A future lease adapter must durably record partial acquisition before it can mutate controls. Acquisition failure must safely roll back or leave a recovery entry under the same run authority. Resolve database authority and E2E authority separately. The version 1 database guard permits all-consumers-paused ownership and strict empty cleanup; observer CLIs require durable and active-run database read-back. An observer while owned workers execute requires a reviewed new coexistence protocol. Never relabel version 1 or bypass these checks.

## Campaign producers

The collector accepts strict scenario receipts and the existing 40-case/93-level charter schema. Lifecycle assertion artefacts bind the original validated observation to run, candidate, case, evidence level, target and time. Ownership artefacts additionally bind the exact private fixture alias, Clerk organisation, payroll organisation and generation. Cleanup artefacts must be produced in the terminal phase after its actual start. Action collection strips predicted owned cleanup; missing terminal evidence cannot certify PASS. Unknown, duplicate, mismatched or corrupt proof remains incomplete, while independently validated failures are retained.

Actual producer drivers remain required. Generic heading visibility and a UI hash compared with itself do not establish full scenario assertions. Implement real scoped operation/database/provider observers for each suffix, persisted controlled handler faults for X03/X05/X14/X22, and receipt production for exact charter assertions. Controlled fixture SQL/status labels are not handler execution. X08 requires the actual scheduled tick and registered handler, with a precomputed cadence/deadline and two-tick processing budget; manual sync cannot substitute.

The causal no-effect ingestion contract requires a private dispatch-audit receipt with exact action/intent/run/candidate/scope/time, zero provider dispatches and matching cancellation, application rejection or approved local-only provenance. Empty provider queries, expired credentials and timeouts cannot produce it. The operational audit producer is absent; no real denial/cancellation/local-only case is certified by its injected regressions. Older version 1 ledgers labelled definite-non-attempt without causal proof intentionally refuse safe recovery. Preserve them and obtain independent proof; do not auto-upgrade their label or delete recovery data.

## Browser closure and recovery

Playwright launches browser subprocesses in detached process groups on Unix. Parent process-group disappearance after error/SIGINT/SIGTERM is insufficient to establish all mutation writer closure. The supervisor waits for the actual child close with bounded termination/escalation, and treats non-graceful closure as unknown. Independent worker drain and outside-owned checks may continue; provider/local deletion and fence release remain denied. A production adapter needs a separately verified browser-writer closure receipt or an operator closure procedure for the same run before recovery can safely reconcile effects.

A graceful successful CLI close, empty tracked process group and normal Playwright context teardown permit ledger reconciliation. The durable ledger is read only after worker drain, and the parent pre-browser snapshot is never persisted over child entries. Missing, corrupt or foreign ledger state preserves the fence. Recovery retains prior action evidence, observes uncertain creates without replay and collects terminal receipts after cleanup.

## Application, deployment and fixture handoffs

Plan 159 must provide the approved versioned AU transition decision and its implementation regressions, plus remaining import completeness, identity/onboarding and calendar freshness work. `au-contract-v1` syntax is not an approved transition decision. Do not select payroll policy inside the harness.

The operator must supply exact sanctioned fixture scopes, mutation dates/budgets, cohorts A/B/C/D, independent recovery authority, verified role sessions and app/API/web/worker revisions matching the frozen candidate. Production configuration must satisfy the required Xero tier/namespace/credential-domain/keyring/callback contracts. Fresh ready deployment metadata does not prove the missing runtime contracts. Sensitive values omitted by environment downloads are not evidence of absence.

The authorised online Neon domain regression runs independently through the existing protected live runner. No localhost, Docker, new database or ALLOW_LOCAL_DATABASE_TESTS=1 against Neon is an allowed fallback. Its inventory PASS, source unit PASS and synthetic receipt validation never become case-level LIVE or CONTROLLED campaign evidence.

## Frozen harness and actual diagnostic

Harness runtime candidate: `76a5dfb2b8c87faf27d6313e31c114b053be1f4c`. Source checks and protected online domain regressions are recorded separately in the task review and advisor execution review. They do not admit an execution lease or certify provider/browser cases.

The actual runner invocation without an available manifest produced `reports/xero-e2e/2026-09-27-0663c396-8a8c-432e-ba06-173a914b2513.json` and `.md`, exit 2, manifest-unavailable. The catalogue is complete: 26 scenarios, 92 suffixes, 40 charter cases and 93 required evidence levels, all NOT VERIFIED. LIVE and CONTROLLED execution counts are zero; candidate, harness and verified execution identity remain unknown because admission did not occur. Actual offline rendering preserves both report files byte-for-byte. No synthetic passing report is published.

Independent source checks PASS: frozen install, release tools 457 tests / 32 files, release types, lint, four uncached builds, then 19 uncached type tasks, 2,810 repository tests / 18 uncached tasks and package boundaries. The test-only Date clock commit preserves the actual runtime candidate. Earlier overloaded deadline and synthetic ordering failures are retained in the task review; assertions were not weakened.

Protected online domain run `f782ad54-69b6-4bf3-ada0-08a535215c19` PASS at that exact runtime: 27 files, 246 tests, six uncached tasks, 39 empty owned selectors, unchanged 38-table catalogue and 204 existing rows, 21 migrations with none pending, 12 integrity checks, unchanged legacy binding, enabled immutable trigger and released fence with verified durable authority/strict consumers. This proves the protected domain regression and cleanup. Actual provider/browser campaign and per-case charter levels remain NOT VERIFIED, as does current PITR retention/restore exercise. No runtime worker or controlled-case admission is supplied by these results.
