# Plan 160 execution prerequisites

Status: IN PROGRESS. This handoff records concrete runtime contracts absent from the reviewed candidate. It grants no deployment, worker activation, provider deletion or payroll operation.

## Current source merge boundary, 2 October 2026

The AU policy is approved and implemented: submission stays locally pending;
manager approval creates scheduled leave synchronously in Xero. The user approved
the bounded demo-company and development-role fixtures, which remain unexecuted.
The fixed 24-hour hold is removed through the explicit immediate namespace operator.
The live additive migration passed; protected integration found 12 test failures
and restored all owned state. Reviewed test repairs await protected replay.

The user authorised merging the reviewed source and evidence records. Unfinished
campaign tooling is excluded. Synchronous AU verification can use a candidate
development app with the existing binding, runtime and rate-limit controls.
Deployment and registered workers are prerequisites for the corresponding deployed
and scheduled claims. Actual browser/provider execution, final live regression,
broader campaign and restore evidence remain outstanding. Dated observations below
retain their original evidence boundaries.

Current plan-verification baseline: main `514efb5`, 27 September 2026. Corrected harness/source candidate `5d5889c65a1caf545cfde8cc8198392b8ddd6e7f` is merged at `f3dd965`; the entire tree outside plans, tasks and reports is unchanged from that verified candidate. The application-source review began at `d6da4e8`, with initial harness candidate `76a5dfb`; those dated results are retained below as history. Operational metadata in [execution review](160-execution-review.md) is dated evidence and must be refreshed before dependent admission.

## Resumed continuation, 30 September 2026

The source candidate `3b7c511d0c96b26de067e8b36b78f6d45e427c70`
adds atomic pre-dispatch ordinary provider-attempt registration and guarded
pause/resume writes. It passed the fresh source gates listed in the completion
review. Accepted provider responses can still precede later local persistence,
and uncertain attempts lack adjudication, so this is partial prior-writer
accounting, not a complete campaign lease. The protected online integration
suite and operational browser/provider campaign remain pending. The missing AU
policy, private fixtures/sessions, deployment/configuration and PITR prerequisites
below still apply.

## Continuation, 29 September 2026

The isolated `codex/xero-e2e-completion` branch now implements shared campaign control,
worker dispatch/execution admission, persistence fencing and provider effect accounting.
Observer coexistence and three real causal producer functions are implemented with
regressions. This supersedes the corresponding source-absence observations below only
for that isolated candidate. Full final verification is recorded in
[the continuation review](160-completion-review.md).

The default campaign remains unavailable. A later isolated source slice records ordinary provider attempts before dispatch and keeps uncertain outcomes durable, so a reservation cannot overtake a provider request while its response is still being consumed. It does not cover the caller's subsequent local persistence after an accepted provider response. Direct pause/resume writes now use a guarded transaction; other synchronous action/OAuth entrypoints, intentional binding-generation changes, exact mutation targets, real registered-worker evidence, partial acquisition, independent writer closure/drain/restoration and complete scenario drivers remain unresolved. The AU policy and sanctioned fixture/session questions remain pending.
Production app/API/web are still at `42bb840`, not the continuation source; app/API
metadata confirms missing tier/namespace/domain configuration. Full browser/provider
execution and current PITR proof remain NOT VERIFIED. Historical evidence below retains
its original source/date and must not be presented as this candidate's result.

## Initialisation timing correction, 2 October 2026

The user removed the fixed 24-hour namespace initialisation waiting period from
Plan 160. Namespace configuration, authority verification and actual Xero quota
admission remain required; initialisation introduces no fixed scheduling delay.
Earlier referenced conservative waiting instructions are superseded for this
campaign.

## Enforced execution lease

`packages/jobs/src/handlers/xero-sync-access.ts` validates Clerk/payroll organisation and binding generation. `packages/jobs/src/events.ts` carries a sync operation run identifier, not an independently admitted E2E campaign authority. `SyncXeroPeopleInputSchema` and the registered handlers do not consult the E2E execution manifest, active-run ownership or an allowed function inventory. Consequently an E2E manifest cannot enable current workers safely. `currentXeroWorkerCapability().available` remains false.

The application/orchestration owner must supply a versioned contract that checks exact Clerk organisation, payroll organisation, campaign run, binding generation and allowed function before dispatch and before persistence. Ordinary cron/bootstrap/retry work must be denied for owned fixtures during the campaign; wrong tenant, wrong campaign, stale generation, expired authority and revoked ownership must fail closed. Retain and independently read back prior worker settings, registered candidate revision, terminal drains (including queued/retrying work) and restoration. Provide regressions and real registered-handler evidence, not manifest labels or queue acknowledgements.

A future lease adapter must durably record partial acquisition before it can mutate controls. Acquisition failure must safely roll back or leave a recovery entry under the same run authority. Resolve database authority and E2E authority separately. The version 1 database guard permits all-consumers-paused ownership and strict empty cleanup; observer CLIs require durable and active-run database read-back. An observer while owned workers execute requires a reviewed new coexistence protocol. Never relabel version 1 or bypass these checks.

## Campaign producers

The collector accepts strict scenario receipts and the existing 40-case/93-level charter schema. Lifecycle assertion artefacts bind the original validated observation to run, candidate, case, evidence level, target and time. Ownership artefacts additionally bind the exact private fixture alias, Clerk organisation, payroll organisation and generation. Cleanup artefacts must be produced in the terminal phase after its actual start. Action collection strips predicted owned cleanup; missing terminal evidence cannot certify PASS. Unknown, duplicate, mismatched or corrupt proof remains incomplete, while independently validated failures are retained.

Actual producer drivers remain required. Generic heading visibility and a UI hash compared with itself do not establish full scenario assertions. Implement real scoped operation/database/provider observers for each suffix, persisted controlled handler faults for X03/X05/X14/X22, and receipt production for exact charter assertions. Controlled fixture SQL/status labels are not handler execution. X08 requires the actual scheduled tick and registered handler, with a precomputed cadence/deadline and two-tick processing budget; manual sync cannot substitute.

The causal no-effect ingestion contract requires a private dispatch-audit receipt with exact action/intent/run/candidate/scope/time, zero provider dispatches and matching cancellation, application rejection or approved local-only provenance. Empty provider queries, expired credentials and timeouts cannot produce it. The operational audit producer is absent; no real denial/cancellation/local-only case is certified by its injected regressions. Older version 1 ledgers labelled definite-non-attempt without causal proof intentionally refuse safe recovery. Preserve them and obtain independent proof; do not auto-upgrade their label or delete recovery data.

## Browser closure and recovery

Playwright launches browser subprocesses in detached process groups on Unix. Parent process-group disappearance after error/SIGINT/SIGTERM is insufficient to establish all mutation writer closure. The supervisor waits for the actual child close with bounded termination/escalation, and treats non-graceful closure as unknown. Independent worker drain and outside-owned checks may continue; provider/local deletion and fence release remain denied. Recovery requires an acquired lease to independently verify all prior mutation writers and return a strict fresh closure proof for this exact run and candidate, with a hashed evidence reference. Missing, rejected, stale or foreign proof retains the fence and permits only independent drain/outside-owned observation. The adapter must observe every prior browser mutation writer, not infer closure from PID or process-group absence. Default capability remains unavailable.

A graceful successful CLI close, empty tracked process group and normal Playwright context teardown permit ledger reconciliation. The durable ledger is read only after worker drain, and the parent pre-browser snapshot is never persisted over child entries. Missing, corrupt or foreign ledger state preserves the fence. Recovery retains prior action evidence, observes uncertain creates without replay and collects terminal receipts after cleanup.

## Application, deployment and fixture handoffs

Plan 159 must provide the approved versioned AU transition decision and its implementation regressions, plus remaining import completeness, identity/onboarding and calendar freshness work. `au-contract-v1` syntax is not an approved transition decision. Do not select payroll policy inside the harness.

The operator must supply exact sanctioned fixture scopes, mutation dates/budgets, cohorts A/B/C/D, independent recovery authority, verified role sessions and app/API/web/worker revisions matching the frozen candidate. Production configuration must satisfy the required Xero tier/namespace/credential-domain/keyring/callback contracts. Fresh ready deployment metadata does not prove the missing runtime contracts. Sensitive values omitted by environment downloads are not evidence of absence.

The authorised online Neon domain regression runs independently through the existing protected live runner. No localhost, Docker, new database or ALLOW_LOCAL_DATABASE_TESTS=1 against Neon is an allowed fallback. Its inventory PASS, source unit PASS and synthetic receipt validation never become case-level LIVE or CONTROLLED campaign evidence.

## Initial frozen harness and actual diagnostic

Harness runtime candidate: `76a5dfb2b8c87faf27d6313e31c114b053be1f4c`. Source checks and protected online domain regressions are recorded separately in the task review and advisor execution review. They do not admit an execution lease or certify provider/browser cases.

The actual runner invocation without an available manifest produced `reports/xero-e2e/2026-09-27-0663c396-8a8c-432e-ba06-173a914b2513.json` and `.md`, exit 2, manifest-unavailable. The catalogue is complete: 26 scenarios, 92 suffixes, 40 charter cases and 93 required evidence levels, all NOT VERIFIED. LIVE and CONTROLLED execution counts are zero; candidate, harness and verified execution identity remain unknown because admission did not occur. Actual offline rendering preserves both report files byte-for-byte. No synthetic passing report is published.

Independent source checks PASS: frozen install, release tools 457 tests / 32 files, release types, lint, four uncached builds, then 19 uncached type tasks, 2,810 repository tests / 18 uncached tasks and package boundaries. The test-only Date clock commit preserves the actual runtime candidate. Earlier overloaded deadline and synthetic ordering failures are retained in the task review; assertions were not weakened.

Protected online domain run `f782ad54-69b6-4bf3-ada0-08a535215c19` PASS at that exact runtime: 27 files, 246 tests, six uncached tasks, 39 empty owned selectors, unchanged 38-table catalogue and 204 existing rows, 21 migrations with none pending, 12 integrity checks, unchanged legacy binding, enabled immutable trigger and released fence with verified durable authority/strict consumers. This proves the protected domain regression and cleanup. Actual provider/browser campaign and per-case charter levels remain NOT VERIFIED, as does current PITR retention/restore exercise. No runtime worker or controlled-case admission is supplied by these results.

## Follow-up error and oversight review

Corrected harness runtime candidate: `5d5889c65a1caf545cfde8cc8198392b8ddd6e7f`. Independent review confirmed report identity, asynchronous no-effect observation, prior-writer recovery and duplicate evidence failure-isolation omissions. Corrections enforce the same strict candidate, scope, execution, time and phase authority before selecting evidence. Valid failures survive invalid or duplicate siblings; collection limitations remain monotonic through terminal merge. Missing lifecycle evidence is reported as unavailable, while malformed non-null input retains the sanitised validation error. No operational driver capability has been added.

Fresh actual missing-manifest diagnostics: `reports/xero-e2e/2026-09-27-ab5dbf95-8931-489b-a53f-45ee1dceda50.json` and `.md`. Both remain catalogue-complete and NOT VERIFIED, with zero LIVE/CONTROLLED executions and null verified identity. Actual offline rendering is byte-identical. Earlier report and gate evidence remain historical. All required source gates PASS: 505 release-tool tests in 32 files, release types, lint, four forced build tasks, 19 forced repository type tasks, 2,810 repository tests in 18 forced tasks and boundaries. The actual report CLI exits 2; JSON SHA-256 `8a0bfb93d6f54ad479d52220056bba6e3900b49a9b5f320ed6ffff3b3fddf5e1`, Markdown SHA-256 `597b50832b56bf9c04e656ce8132b0492c5133915fd7a51f4d781e294ec641a1`.

Protected exact-source follow-up run `b207173c-ec6b-4bef-ba68-3937ad8227df` PASS at the corrected runtime, 03:26:45.886 to 03:34:15.360 UTC on 27 September 2026: 27 files, 246 tests and six uncached tasks. All 39 owned selectors are empty; the 38-table catalogue and 204 existing rows are unchanged. All 21 migration checksums match, zero are pending, 12 integrity checks pass and pre/post schema comparisons report no difference. Immutable trigger and legacy binding are unchanged; fence released, durable authority and strict consumer isolation verified. Source review APPROVE. Main merge `f3dd965` and final documentation `514efb5` preserve that exact runtime. Current plan verification confirms the completed harness contracts and leaves operational admission/producers as the remaining source work. These source and protected domain results do not certify the actual browser/provider campaign, per-case charter levels or current PITR retention/restore exercise; overall Plan 160 remains IN PROGRESS.
