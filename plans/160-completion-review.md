# Plan 160 completion continuation, 29 September 2026

Status: IN PROGRESS. The user requested completion and all lessons were read. Work is isolated on `codex/xero-e2e-completion` in `/tmp/tc-plan160-complete-20260929`, based on main `42bb8405dc3b84049080a50fb580fa3bc576fcbe`. No deployment or customer payroll operation is authorised by this source slice.

## Implemented scope

- Durable shared campaign sentinel, immutable resources and exact run/candidate/tenant/binding/function tickets; guarded dispatch, worker, scheduler and maintenance paths; provider effect accounting through complete response consumption.
- Provider-neutral database write guard with advisory locking, fresh pre/post authority, transaction rollback and invocation lifetime enforcement. Guarded array and nested transactions are rejected. Started writes drain before wrapper closure; a transaction already committing may finish while draining.
- Read-only repeatable-read observer coexistence with fresh authority checks, and GET-only provider observations. Version 1 protected domain-runner isolation remains unchanged.
- Causal provider/canonical leave, persisted submit-operation and scheduled worker observation producers. The scheduled producer correlates authenticated actual worker/scheduler API results with runtime tickets and scoped SQL; it does not replace missing live execution with a label.
- Manifest-owned campaign domains, 13 real sentinel fixture setups and narrow shared-store cleanup. The inventory grows from 27 to 28 suites. Six new online integration assertions cover real campaign admission/revocation and guarded database rollback/lifetime.

The protected test children use dedicated `TC_TEST_KV_*` credentials with existing manifest authority. The ordinary limiter keeps its existing test configuration; three provider stubs delegate only the exact real campaign-store endpoint. Real Clerk/Xero/email/billing credentials are excluded from the integration child environment.

## Verification

Final source gates PASS: 2,989 repository tests across 18 uncached tasks, 594 release-tool tests across 35 files, four uncached builds, 19 uncached repository type tasks, release types, lint and package boundaries across 1,094 files. Protected online results are pending. Earlier full source gates passed before a final review found the protected child KV credential mismatch; that mismatch is corrected, independently reviewed and covered by 36 focused tests. It is not promoted to a live result. Development iterations also found stale mocks, fixture counts, one inventory count and a test-only cross-package import; these were corrected before the final gates.

## Remaining full-campaign prerequisites

The campaign capability remains unavailable. Remaining source work includes synchronous browser/action/OAuth ticket admission and exact mutation targets, intentional binding-generation changes, ordinary work already in flight before acquisition, independent prior-writer/drain/restoration proof, the real default execution lease, complete multi-step scenario drivers and controlled handler recipes. The X08 spec remains unexecuted; producing scheduled receipts is only a foundation.

The AU transition decision and sanctioned private fixture/session handoff are still missing. No campaign variables were found in nine fresh Vercel pulls. App/API metadata confirms missing tier, namespace epoch and credential-domain settings, and all six app/API environment database URLs share one target. READY deployments are at the older main candidate, not this branch. Full case-level browser/provider execution, current PITR retention/availability and actual restore exercise remain NOT VERIFIED.

A historical non-fixture scheduled leave-balances SyncRun remains `running` since 27 September 00:04 UTC. Its entire row and all public table content must be preserved. It is not treated as proof of a currently executing worker or a terminal successful job. Fresh authenticated cloud, host and SQL inventories are required before and throughout the protected domain run. No worker is paused or resumed when those inventories prove current absence.

Domain integration results and aggregate unit results never certify the 26 scenarios, 92 suffixes, 40 charter cases or 93 evidence levels. Both honest diagnostic reports will be generated after final verification.
