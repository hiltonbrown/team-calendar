# Team Calendar implementation plans

Index reconciled on 7 October 2026 with the approved Xero simplification. Production readiness and every live Xero journey remain **NOT VERIFIED**. Live Xero credentials are unavailable in this session; documentary contracts and source tests do not prove runtime entitlement, consent or provider outcomes.

## Execution order and status

| Plan | Remaining outcome | Status |
| --- | --- | --- |
| [Xero simplification implementation](../docs/superpowers/plans/2026-10-07-xero-simplification.md) | Complete the approved four-entity model and Tasks 12/13 documentation and verification | Current-candidate outcomes are recorded in `tasks/todo.md`; no gate PASS is asserted by this index |
| [160: Prove the AU leave flow](160-xero-end-to-end-verification-and-report.md) | Prove the bounded nine-row AU flow through the real UI, independent provider reads, owned cleanup and a sanitised report | All live UI/provider rows NOT VERIFIED |
| [000: Australian go-live](go-live.md) | Source, schema, release-tool, privacy, billing, deployed journey and rollback gates for one candidate | IN PROGRESS; production readiness NOT VERIFIED |

Source and local integration verification can proceed independently of unavailable live credentials. Run exact-candidate gates before deployment, then collect deployed browser/provider and scheduled-job evidence under the applicable authority. The bounded AU flow does not certify the wider release.

## Supporting contracts

| Document | Purpose |
| --- | --- |
| [AU transition contract v1](160-au-transition-contract-v1.md) | Local AU submission; synchronous approval creation, remote decision/withdrawal, idempotency and administrator recovery |
| [Approved Xero simplification design](../docs/superpowers/specs/2026-10-07-xero-simplification-design.md) | Dated official provider sources; canonical authorisation, scoped selected connections, OAuth sessions and provider cursors |

## Verification rules

- Ordinary CI and local integration use disposable PostgreSQL/Redis and localhost-only guards. `ALLOW_LOCAL_DATABASE_TESTS=1` never authorises Neon access.
- Authorised live database evidence uses `tooling/release/run-live-integration.ts` with fresh protected manifest, target identity, restore capability, consumer isolation, fixture ownership and cleanup evidence. Never run root integration directly against live Neon.
- Compare actual discovered suites with `tooling/release/integration-inventory.ts`; register new suites, allocation and cleanup together. Historical suite counts are not a current acceptance criterion.
- Preserve both tenancy keys, synchronous writes, fail-closed ordinary shared quotas, scoped fixtures and independent provider assertions. Quota keys initialise atomically on first use.
- AU submission stays local. Remote approve/decline/withdraw share the existing operation journal and immutable UUID keys with a five-minute replay cutoff. Expired uncertainty requires provider inspection and administrator recovery.
- Disconnect deletes the exact selected remote connection before local teardown/audit and preserves sibling connections. Do not delete unselected provider files.
- Root verification includes lint, build, types, boundaries, unit, integration and release-tool gates plus fresh migration-chain/schema equality checks. Record exact commands, exits, counts/skips and evidence boundaries in `tasks/todo.md`; deployment/provider results remain separate.

## Retired material and historical evidence

Obsolete lifecycle/provider-ledger, ordinary-action admission and protected-spy plans were removed. Their superseded architecture and historical results remain in Git history. The approved design and implementation plan are retained planning artefacts. Do not recreate deleted plans, scripts or compatibility layers to satisfy their old checklists.

The 4 October protected run at candidate `7b8e34729a8d2cdaddcd31c4ca6e893033d57c2b` recorded integration FAIL (one database fencing assertion), partial package completion, cleanup PASS and no verified browser/provider rows. That historical failure does not describe the simplified candidate or establish release sign-off. No tracked report exists for that old run in this checkout; no report link or current proof is invented here.

This reconciliation changes documentation only. Current source/database verification is owned by the task review; live journeys remain NOT VERIFIED until observed.
