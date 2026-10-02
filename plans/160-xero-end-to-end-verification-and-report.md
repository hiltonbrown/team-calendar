# Plan 160: Verify the complete Xero integration and publish an evidence report

## Completion continuation, 29 September 2026

User instruction: complete execution and read all lessons. Current baseline is main
`42bb840`; all of `tasks/lessons.md` has been read. Existing Steps 1-2 fixes are
preservation gates. Implementation runs in `/tmp/tc-plan160-complete-20260929`, branch
`codex/xero-e2e-completion`, with independent review and candidate-specific verification.
The existing protected online Neon target is authorised; no local or new database fallback.

- [x] Read lessons, current plan, prior execution and runtime prerequisite handoff.
- [ ] Refresh real deployment/configuration, worker, fixture and database prerequisites.
- [ ] Implement remaining operational receipt producers and admission/lease contracts.
- [ ] Resolve the concrete application worker-fencing prerequisite with tests, preserving ordinary isolation.
- [ ] Verify the frozen candidate through source gates and the protected online inventory.
- [ ] Execute all admitted scenarios, reconcile effects and publish both reports.
- [ ] Independently review source/evidence and reconcile completion status honestly.

Scoped prerequisite work needed by this execution must be made concrete before coding.
The initial independent source unit is `tooling/release/xero-observation-producers.ts`
and its co-located tests, plus existing observer/collector files only where integration
requires them. It must produce causal observations from actual queries/handler outcomes,
never fill missing proof with labels. Source review identified a prerequisite runtime slice:
`packages/xero/src/campaign/**`, the database campaign advisory-lock helper, both
Inngest dispatchers, the four Xero handlers and their binding-access helper, scheduler
and credential maintenance, plus affected downstream guards. The observer slice owns
`tooling/release/xero-observer-authority.ts`, the three observer/scope CLIs and awaited
provider-oracle authority. These changes must preserve existing binding controls, deny
reserved resources without exact campaign admission, and retain unavailable capability
until browser actions, drain and recovery are enforced. No new database is authorised.
The AU transition decision is pending an asynchronous user question; no payroll
policy is selected by this continuation. Existing provider fixture authority will be
verified from protected records; customer identities are not borrowed for tests.


### Fresh prerequisite observations, 29 September 2026

Read-only Vercel metadata confirms app/API/web production deployments are READY at
`42bb8405dc3b84049080a50fb580fa3bc576fcbe`. All nine environment pulls succeeded.
All six app/API database URLs have the same private fingerprint; environment names
therefore do not establish isolation. No `TC_XERO*` campaign configuration was found.
App/API metadata and pulls still lack `XERO_APP_TIER`, `XERO_RATE_NAMESPACE_EPOCH`
and `XERO_CREDENTIAL_DOMAIN_ID`. Sensitive download blanks were not treated as
absence evidence.

Read-only SQL confirms the existing authorised Neon project `soft-dream-28768887`,
branch `br-frosty-union-a7sc6dl7`, endpoint `ep-cold-pond-a7ar2epd`, database `neondb`,
role `neondb_owner`, and 22 applied migrations. The `release:active-run` key is empty.
There is one pre-existing non-release-prefixed scheduled `leave_balances` SyncRun
with status `running`, started and last updated at 27 September 2026 00:04 UTC.
It has not been altered or adopted as a campaign fixture. Fresh production Inngest
reads return HTTP 200, one environment, and app/run envelopes with no data collection;
this establishes neither candidate registration nor a terminal result for that SQL row.
No live integration mutation or Xero operation has been performed by this continuation.

The generic campaign infrastructure belongs in `packages/database/src/xero-campaign-*`
to avoid an availability-to-Xero dependency cycle; provider request enforcement stays in
`packages/xero`. A provider-neutral `packages/database/src/write-guard.ts` gives each
mutation/interactive transaction fresh authority and a shared advisory lock. It preserves
separate provider calls and durable local transitions rather than spanning an entire
remote operation with a database transaction. Application action ticket targets and
intentional connect/disconnect generation changes remain to be resolved before browser
mutation admission is enabled.


## Follow-up verification and authorised integration, 27 September 2026

The user requested another error and oversight pass, fixes, then commit and merge to
main. All nine vetted defect groups are corrected at runtime/test candidate
`5d5889c65a1caf545cfde8cc8198392b8ddd6e7f`: recovery closure, durable observation races,
lingering browser processes, failure-preserving duplicate/correlation collection,
phase provenance and retention, exact report candidate identity and absent-evidence
wording. Shared assertion validation also prevents semantically foreign duplicates
from displacing valid failures. The reviewed source is merged into main at
`f3dd965f717fd10bb9d8d0025e087549e53f3541`. Post-merge lint, release types, all 505
release-tool tests and boundaries PASS; the complete runtime/test tree matches the
verified candidate. No push or deployment was performed.

All fresh gates PASS: lint, four uncached builds, 19 uncached type tasks, 2,810
repository tests, 505 release-tool tests, release types and boundaries. Exact-runtime
protected online run `b207173c-ec6b-4bef-ba68-3937ad8227df` passes 27 files/246 tests/six
uncached tasks, with zero owned residue, unchanged outside-owned content and schema,
21 matching migrations/zero pending and a released fence. Independent reproductions
and complete evidence are in the [execution review](160-execution-review.md).

The [latest actual diagnostic](../reports/xero-e2e/2026-09-27-ab5dbf95-8931-489b-a53f-45ee1dceda50.md)
and matching JSON reproduce byte-for-byte offline with exit 2: all 26 scenarios,
92 suffixes, 40 charter cases and 93 levels accounted for, zero LIVE/CONTROLLED
execution and no malformed diagnosis for absent evidence. Full Plan 160 remains
IN PROGRESS. Operational producers/admission, sanctioned fixtures/sessions, the AU
transition decision and actual browser/provider observations remain required. Current
PITR retention/restore exercise remains NOT VERIFIED. Initial records below retain
their original source and dates; this follow-up supersedes their source verdict.
The executable baseline, Steps 1-2 and completion ledger below are reconciled to
merged runtime `5d5889c`; continue with Step 3 and the remaining work in Steps 4-8.

## Initial execution reconciliation, 27 September 2026

User instruction: execute this plan, reconcile stop conditions and continue. Baseline
`d6da4e8` has no source drift from `92d67c5` in the scoped runtime files. Execution is
assigned to the managed worktree
`/home/hilton/.codex/worktrees/xero-e2e-verification/teamcalendar`, branch
`codex/xero-e2e-verification`. The improve advisor reviews; the separate executor owns
source edits and commits. Main is not merged, committed, pushed or deployed by this run.

- [x] Read the complete plan, closing-the-loop workflow and lessons; check source drift.
- [x] Create isolated executor checkout and dispatch scoped implementation.
- [x] Correct R1/R5/R6, implement strict R7 ingestion and scenario/lifecycle collection contracts.
- [x] Refresh read-only deployment/configuration/worker prerequisites while source work runs.
- [x] Run fresh source gates and the authorised protected online integration inventory.
- [x] Review every source hunk and regression; publish both sanitised reports and verdict.
- [ ] Complete actual operational lease, case drivers, causal producer and live campaign prerequisites.

Stops apply only to dependent unsafe actions. Continue independent source, read-only and
report work, retaining unavailable observations as NOT VERIFIED. The lessons' online Neon
policy supersedes any local database instruction: use the existing protected live runner,
never provision localhost/Docker or set `ALLOW_LOCAL_DATABASE_TESTS=1` against Neon.
Operational prerequisites do not grant payroll, deployment or worker-activation authority.
The executor may update `tasks/todo.md` in its isolated checkout to satisfy AGENTS.md;
the advisor edits only plans. A committed, identical full plan is present in that checkout,
so dispatch uses that tracked file plus an explicit reconciled handoff instead of depending
on uncommitted plan text.

Review verdict: APPROVE the isolated harness corrections and honest diagnostics. Final
branch HEAD `eb604d02dfc93ccd4d628a013298d9098badc4b9`; runtime `76a5dfb`, test-only clock
correction `c52c5fa`, final documentation/reports `eb604d0`. Runtime bytes are unchanged
after the online run's exact candidate. Independent source gates pass: lint, build, both
type checks, 2,810 repository tests, 457 release-tool tests and boundaries. Fresh protected
Neon/Redis inventory passes 27 files / 246 tests with independent cleanup, content, schema,
migration and fence read-back. Details and initial failed reruns are preserved in
[execution review](160-execution-review.md).

The actual new [diagnostic report](../reports/xero-e2e/2026-09-27-0663c396-8a8c-432e-ba06-173a914b2513.md)
and JSON account for 26/92/40/93, remain NOT VERIFIED and reproduce byte-for-byte offline
with exit 2. No LIVE or CONTROLLED case was executed. The source slice is reviewable on
`codex/xero-e2e-verification`; it is not merged into this checkout. Full Plan 160 remains
IN PROGRESS. Actual runtime admission, operational receipt producers, complete drivers,
sanctioned fixtures/sessions and the approved AU transition decision remain required,
as specified in [execution prerequisites](160-execution-prerequisites.md). Current
restore retention/availability and restore exercise are also NOT VERIFIED.

The historical review and evidence below retain their original dates and are not promoted
to current campaign proof. Current execution results supersede its installation and
remaining-source-work observations only for the reviewed isolated branch.

Discovery prerequisite reconciled during execution: all-five-spec discovery imports
`tooling/release/e2e/fixture.ts`, whose top-level `releaseEnvironment()` requires live
journey inputs before any test is enumerated. Scope is widened only for moving that
validation into the existing `useRole()` before `browser.newContext()`. This preserves
runtime validation, error capture and role ownership checks, and permits mutation-free
discovery. No ordinary release journey or database authority is changed. Add a focused
regression proving import does not need credentials and role execution still validates.

> Follow the remaining steps below. Preserve the implemented guard/report foundation;
> do not recreate it. This plan measures application behaviour. Application, schema and
> payroll-policy changes belong to Plan 159, the relevant Plan 161 sub-plan or a separately
> scoped prerequisite. Produce an honest report even when a campaign cannot execute.
>
> This revision supersedes the old worktree assignments, baseline excerpts and blanket
> harness-completion wording. Historical execution records remain in
> [160-161 reconciliation](160-161-reconciliation.md) and git history. They are evidence,
> not current-session authority or instructions to resume an old worktree.

## Status and review baseline

- **Status: IN PROGRESS.** Diagnostic reporting, guarded interfaces, catalogue and
  observer foundations are implemented. Scoped recovery/collection corrections are approved
  at follow-up runtime `5d5889c`, merged into main at `f3dd965`. Operational campaign wiring
  and prerequisites remain TODO. Live application/browser/provider verification is
  **NOT VERIFIED**.
- **Priority:** P1. **Effort:** L. **Risk:** HIGH for execution/cleanup; LOW for plan edits.
- **Category:** tests, correctness verification, operational reporting.
- **Planned at:** originally `246ba27`, 20 September 2026.
- **Initial review:** `92d67c5`, 27 September 2026.
- **Current plan verification:** main `514efb5`, 27 September 2026; source/test baseline
  `5d5889c65a1caf545cfde8cc8198392b8ddd6e7f`, integrated at `f3dd965`.
- **Depends on:** Plan 159's approved AU transition contract and remaining import, identity,
  onboarding and calendar behaviour; the runtime fencing contract in Step 3; a compatible
  deployed candidate; owned fixtures and applicable provider-operation authority.
- **Related:** Plan 161 sub-plans are recorded source-complete; its charter Section 8.3 owns
  40 cases at 93 evidence levels and Section 9.3 owns production sign-off. Plan 160 must
  collect those assertions without deriving them from aggregate test totals. `plans/go-live.md`
  owns release-wide deployment and target controls. No production sign-off is implied here.

Review checklist for this revision:

- [x] Inspect current code, plan dependencies, report schema and published diagnostics.
- [x] Verify historical source identity and perform bounded read-only checks.
- [x] Replace stale instructions with current excerpts, scoped remaining steps and gates.
- [x] Finish independent plan review and plan-only diff validation.

### Evidence ledger at merged runtime `5d5889c`

| Evidence | Result and boundary |
| --- | --- |
| Merged source identity | PASS: candidate `5d5889c` and executor `d27b0f1` are ancestors of main `514efb5`; the entire tree outside `plans`, `tasks` and `reports` is byte-identical to `5d5889c`. Merge `f3dd965` is local integration, not deployment. |
| Follow-up full source gates | PASS at `5d5889c`: lint, four uncached builds, 19 uncached type tasks, 2,810 repository tests, 505 release-tool tests, release types and boundaries. Initial failed attempts are retained in [execution review](160-execution-review.md). |
| Protected online domain inventory | PASS at `5d5889c`, run `b207173c-ec6b-4bef-ba68-3937ad8227df`: 27 files/246 tests/six uncached tasks; 39 zero owned selectors; unchanged 38-table content/schema across 204 existing rows; 21 matching migrations/zero pending; released fence. This is domain regression proof, not case-level provider/browser proof or a PITR exercise. |
| Main post-merge checks | PASS: lint 1,156 files, release types, original release-tool command 505 tests/32 files, boundaries 1,072 files/21 packages and whitespace. No source difference from the fully tested candidate. |
| Dependency installation | Repaired by frozen install without source/lockfile edits; main release types PASS. The initial missing-`jose` error is historical, not remaining work. |
| Discovery inventory | Five specs, 110 listed tests: 92 registered suffixes and 18 auxiliary guards. Discovery does not execute a browser scenario or certify any case. |
| Latest actual diagnostic | [JSON](../reports/xero-e2e/2026-09-27-ab5dbf95-8931-489b-a53f-45ee1dceda50.json) and [Markdown](../reports/xero-e2e/2026-09-27-ab5dbf95-8931-489b-a53f-45ee1dceda50.md): 26/92/40/93 accounted for, zero LIVE/CONTROLLED, NOT VERIFIED, null admitted candidate/harness/run identity. Actual CLI and byte-identical offline rendering exit 2. |
| Initial diagnostic and gate history | Preserved in [execution review](160-execution-review.md) and [160-161 reconciliation](160-161-reconciliation.md), with their original candidates and dates. The older reports remain unchanged. |
| Application/provider/deployment/PITR | NOT VERIFIED for the merged campaign candidate. Dated metadata, aggregate suite exits and local integration cannot certify current registered workers, provider cases, deployment readiness or a restore exercise. |

This plan verification checks documentation against source and retained evidence. It does not
recertify every Plan 161 implementation, audit NZ/UK or refresh external provider/configuration
state. The actual operational prerequisites remain in [the handoff](160-execution-prerequisites.md).

## Drift check and repository conventions

Run before implementation:

```bash
git rev-parse HEAD
git status --short
git diff --stat 5d5889c65a1caf545cfde8cc8198392b8ddd6e7f..HEAD -- tooling/release packages/xero packages/jobs packages/availability packages/database apps/app apps/api package.json bun.lock .github/workflows/ci.yml .gitignore
```

The baseline already contains the reviewed fixes. On main `514efb5`, this scoped source diff
is empty. Compare any future drift with the current symbols/excerpts below before changing
contracts; record and preserve concurrent edits. The unrelated go-live review remains outside
this task's scope. A future source change requires new candidate provenance and applicable gates.

Bun 1.4.0, TypeScript, Next.js App Router/Turborepo, Vitest and Playwright are already declared.
Use strict types, Zod input validation, named exports, co-located tests and Australian English.
`PRODUCT.md` establishes `AvailabilityRecord` as canonical, Xero as the balance/payroll source,
scheduled inbound sync and synchronous user-triggered outbound writes. Do not change these
contracts while measuring them. Tenant reads require both Clerk and payroll organisation IDs.
Credential infrastructure without a Clerk ID remains accessible only through scoped bindings.
UI verification follows `DESIGN.md` and `.impeccable.md`: existing tokens, both themes,
keyboard focus and status announcements. This is not a redesign.

## Current implementation and vetted findings

All source locations below were checked against main `514efb5`, whose source is identical
to `5d5889c`. Line numbers are navigation aids; named symbols are the drift-check anchors.

| Component | Current behaviour |
| --- | --- |
| `tooling/release/run-xero-e2e.ts`, `runXeroE2e` and `defaultDependencies` | Bootstraps diagnostics before CLI/manifest parsing; guards source/output/browser startup. Acquired leases collect action and terminal evidence. Default acquisition still rejects unavailable operational worker capability. |
| `tooling/release/xero-execution-guard.ts`, `parseXeroExecutionManifest` | Strict version 2 E2E manifest embeds distinct version 1 database authority. Manifest identity alone does not prove actual worker isolation; ordinary database authority still rejects a foreign mode. |
| `tooling/release/xero-execution-manifest-store.ts`, `persistXeroExecutionManifest` and `assertDurableXeroExecutionManifestReadBack` | Durable manifest persistence/read-back exists; operational admission must enforce the runtime contract separately. |
| `tooling/release/xero-scenarios.ts` | All 26 IDs and 92 suffixes are registered: X03/X05/X14/X22 CONTROLLED, the other 22 LIVE. Registration is not execution. |
| `tooling/release/xero-campaign-collector.ts`, `collectXeroCampaign` | Strict scenario/lifecycle receipts, same-run action/terminal collection, hash/provenance checks and shared assertion semantics. Preserves verified failures and invalid-evidence limitations across sibling conflicts and phases. Actual receipt producers remain absent. |
| `tooling/release/xero-report.ts`, `buildXeroReport` and `reportCli` | Requires exact candidate/harness identity and complete scenario/charter proof for PASS. Distinguishes absent lifecycle input from malformed input. Output failures remain nonzero with sanitised fallback. |
| `tooling/release/xero-ledger.ts`, `observeXeroNoEffect` and `reconcileXeroLedger` | Re-reads durable state after asynchronous observation and worker drain, rejects changed authority/targets and preserves child/sibling intents. Only independently proven dispositions permit cleanup/release. |
| `tooling/release/run-xero-e2e.ts`, `spawnXeroBrowser` and recovery branch | Bounded graceful shutdown and descendant termination; forced/unknown closure stays fenced. Same-run recovery needs fresh exact-run/candidate prior-writer proof even when fixture setup fails. |
| `tooling/release/e2e/xero-browser-mutation-scope.ts`, `assertXeroBrowserMutationRequest` | Strict action-specific leave/connect/disconnect payload admission. Actual deployed Next.js request serialisation remains to be verified. |
| `tooling/release/e2e/xero-provider-oracle.ts`, `readIndependentAuLeave` | Independent raw AU assertions and authorised reads through resolver/deadline/`xeroFetch`, without using the production status mapper as oracle. |
| `tooling/release/e2e/xero-independent-snapshot-cli.ts`, `xero-import-observer.ts` and `xero-publication-probe.ts` | Scoped action-aware observations, exact initial-import identities and actual publication before/after helpers exist. Their units do not certify a campaign. The ordinary legacy provider observer remains outside this lane. |
| `tooling/release/e2e/global.teardown.ts` | Uses `reconcileReleaseTeardown`; do not restore the obsolete pre-cleanup assertion path. |
| `tooling/release/xero-e2e.config.ts` and `e2e/fixture.ts` | Execution needs runner context; one worker, no retries, 15-minute test timeout and no OAuth capture. Discovery includes all five specs; role environment validation runs inside `useRole` before creating a context. |

| Finding | Current disposition | Remaining boundary |
| --- | --- | --- |
| R1, durable child state/recovery | Fixed and regression-tested, merged runtime `5d5889c` | Real lease must independently establish prior writer closure and owned worker drain. |
| R2, operational campaign adapters | TODO | Actual worker admission, fixture/cleanup adapters, producers and scheduled X08 execution. |
| R3, runner lifecycle collection | Contract implemented and tested | Wire the existing action/terminal collector to actual per-case producers. |
| R4, overstated completion/discovery/preflight wording | Reconciled to the merged source in this plan verification | No discovery/preflight or aggregate suite becomes campaign PASS. |
| R5, report delivery success after write failure | Fixed and regression-tested | Retain nonzero delivery failure semantics in future changes. |
| R6, connection payload validation | Fixed and regression-tested | Obtain actual deployed request serialisation proof under scoped authority. |
| R7, no-effect disposition | Strict causal ingestion/ledger contract implemented and tested | Actual dispatch-audit producer and approved no-call cases remain unverified. |
| Follow-up nine defect groups | Fixed and independently reviewed at `5d5889c` | Preserve conservative recovery, exact identity, receipt validation and terminal failure retention. |

Current load-bearing excerpts:

```typescript
// tooling/release/run-xero-e2e.ts:265-269
const defaultDependencies: XeroRunnerDependencies = {
  acquire: () =>
    Promise.reject(new Error(currentXeroWorkerCapability().reason)),
  browser: spawnXeroBrowser,
```

```typescript
// tooling/release/xero-ledger.ts:502-503
// The browser and worker writers are now closed. Never persist the parent's stale snapshot.
const ledger = readXeroLedger(path, authority);
```

`reconcileXeroLedger` validates authority and drains owned workers before this durable read.
The runner separately requires proven browser-writer closure. Preserve both checks; neither
an old parent snapshot nor a drained worker alone proves safe cleanup.

## Scope and execution ownership

This verification edits only this plan, its prerequisite/review records and `plans/README.md`.

A later Plan 160 executor may modify these existing harness files and their co-located tests:

- `tooling/release/{run-xero-e2e,xero-ledger,xero-observations,xero-report,xero-evidence,xero-execution-guard,xero-execution-manifest-store,xero-source-integrity,xero-scenarios,xero-e2e.config}.ts`.
- `tooling/release/e2e/{xero-browser-case,xero-browser-fixtures,xero-browser-mutation-scope,xero-provider-oracle,xero-import-observer,xero-publication-probe,xero-readonly-assertions}.ts`.
- `tooling/release/e2e/{xero-independent-snapshot-cli,xero-import-observer-cli,xero-browser-scope-cli}.ts` and the five existing `xero-*.spec.ts` files matched by the dedicated config.
- New `tooling/release/xero-execution-adapter.ts` and `.test.ts` for the lease implementation;
  extend the existing `xero-campaign-collector.ts` and `.test.ts` only where actual producers
  require it. Do not recreate the collector.
- Additive changes to `tooling/release/{consumer-isolation,active-run-registry,database-guard}.ts`
  and tests only where the reviewed runtime contract requires them. Preserve version 1's
  all-consumers-paused/strict-empty behaviour and foreign-mode rejection.
- This plan, its README entry and sanitised `reports/xero-e2e/<date>-<run-id>.{md,json}`.

Out of scope: application/service/schema code, AU policy selection, customer backfills,
production configuration/deployment, dependencies, real `.env*`, existing unrelated plans,
ordinary release journeys and the legacy provider observer. A new database mode or fixture
helper change requires an explicit prerequisite design before widening this scope.

Implementation uses an isolated branch such as `codex/xero-e2e-verification`, not a presumed
surviving `/tmp` worktree. Use scoped conventional commits. Do not merge, push or deploy by
inference from this plan. In an improve execution, the separate executor owns code and the
advisor owns review/index updates.

## Commands and verification policy

For a fresh executor checkout, `bun --no-env-file install --frozen-lockfile` should resolve declared
packages, including `jose`, without a lockfile edit. This review does not install packages.
If resolution still fails after a correct install, capture the specific error and reconcile
the environment before continuing dependent checks.

| Purpose | Command | Expected result |
| --- | --- | --- |
| Harness units | `bun --no-env-file run test:release-tools` | Exit 0; required tests executed, no invented campaign PASS |
| Harness types | `bun --no-env-file run typecheck:release-tools` | Exit 0; merged checkout already passes |
| Lint | `bun --no-env-file run check` | Exit 0 |
| Build before repository types | `bun --no-env-file run build -- --force`, then `bun --no-env-file run typecheck -- --force` | All uncached tasks exit 0 |
| Repository units/boundaries | `bun --no-env-file run test -- --force --concurrency=1 -- --maxWorkers=1`, then `bun --no-env-file run boundaries` | Exit 0 |
| CI integration gate | `bun run test:integration` | All registered suites pass on CI's isolated localhost PostgreSQL/Redis setup; never run this directly against Neon |
| Protected configured-database verification | `TURBO_CONCURRENCY=1 bun --env-file=<private-run-env> ./tooling/release/run-live-integration.ts --manifest <fresh-private-db-manifest> --evidence-dir <private-evidence-dir>` | Exact owned target, full current inventory, cleanup and fence read-back PASS; historically 27 files / 246 tests, not a fixed future count |
| Read-only discovery | `TC_XERO_DISCOVERY=1 bun --no-env-file ./node_modules/@playwright/test/cli.js test --config tooling/release/xero-e2e.config.ts --list` | Merged inventory: 110 tests in 5 files, comprising 92 suffixes and 18 auxiliary guards; no scenario executed |
| Local manifest/source preflight | `bun --no-env-file ./tooling/release/run-xero-e2e.ts --manifest <private-xero-manifest> --preflight` | Exit 2, both reports; validates local manifest/source/config import only. Does not read durable authority, verify deployments, acquire workers or prove fixture readiness |
| Full campaign, after remaining Steps 3-5 | `bun --no-env-file ./tooling/release/run-xero-e2e.ts --manifest <private-xero-manifest> --output tooling/release/test-results/<run-id>` | Exit 0 only all required proof PASS; 1 FAIL; 2 incomplete/NOT VERIFIED. Current default adapter refuses execution |
| Recovery, after remaining Steps 3-5 | `bun --no-env-file ./tooling/release/run-xero-e2e.ts --manifest <same-private-xero-manifest> --recover --output tooling/release/test-results/<same-run-id>` | Cleanup/report only, no create replay; current default adapter also refuses recovery |
| Offline renderer | `bun --no-env-file ./tooling/release/xero-report.ts --input <saved-sanitised-json> --output reports/xero-e2e` | Reproduces evidence verdict and exit code; no credentials required. Use a copy in an isolated checkout when preserving original reports |
| Private output / whitespace | `git check-ignore -v tooling/release/test-results/probe.json` and `git diff --check` | Matching ignore rule and exit 0 |

`--no-env-file` does not clear inherited shell variables. Source checks must use an environment
without real service credentials. Build uses only synthetic valid `DATABASE_URL`, a 32-byte
base64 `XERO_TOKEN_ENCRYPTION_KEY`, and nonempty synthetic `XERO_CLIENT_ID`/`XERO_CLIENT_SECRET`.
Do not weaken required-key validation. The exact four repository gates remain check, typecheck,
test and test:integration; protected online execution uses the existing guarded runner instead
of overriding the localhost-only flag. No new database/environment is provisioned by this plan.

Runner artefacts belong under ignored `tooling/release/test-results/<run-id>/` with 0700
folders/0600 files; sessions remain private under `tooling/release/.auth/`. OAuth capture is
disabled. The renderer's `--output reports/xero-e2e` deliberately contains only sanitised
reports and is not the private runner output. Never commit tokens, raw payroll, cookies,
storage state, headers or capability URLs.

## Step 1: Verify and preserve the completed durable recovery contract

Implemented, tested and merged at `5d5889c`. This is a preservation gate before integrating
new operational adapters, not an instruction to repeat the fixes.

Preserve authoritative durable reads after browser closure/worker drain, strict no-effect
proofs, changed-target rejection and sibling retention after asynchronous observation.
Unknown or forced writer closure retains the fence. Same-run recovery requires fresh
independent proof with exact candidate/run, `closed: true`, observation time within the
current invocation and a hashed reference. Missing proof or a fixture-verification failure
cannot permit local deletion or release. Legacy unproven no-effect labels remain unsafe.

Existing regressions in `run-xero-e2e.test.ts` and `xero-ledger.test.ts` cover separate
child-written state, normal/error/interrupted teardown, uncertain outcomes, changed durable
state, missing/corrupt/foreign authority and recovery closure. Add adapter-specific regressions
in Step 4 without replacing this contract or replaying creates.

**Verify:** `bun --no-env-file run test:release-tools -- tooling/release/run-xero-e2e.test.ts tooling/release/xero-ledger.test.ts`
and `bun --no-env-file run typecheck:release-tools` exit 0 in a credential-free environment.
Current default live admission stays denied until the concrete operational contract is proved.

## Step 2: Verify and reuse the completed collection/report contracts

Implemented, tested and merged at `5d5889c`. `collectXeroCampaign` already validates scenario
and lifecycle observations using the existing charter schema and shared assertion validator.
`XeroExecutionLease.collect` accepts `actions` or `terminal`, prior collection and the actual
terminal start. The runner collects action evidence while mappings exist, reconciles cleanup,
then collects/merges terminal X26 and lifecycle cleanup evidence. Recovery retains earlier
action proof and never turns terminal cleanup into a replayed scenario run.

Preserve exact scope/run/candidate/time/hash/mode/phase checks, independent per-receipt
validation, monotonic cleanup failures and retained invalid-evidence limitations. A valid
failure survives malformed, foreign or duplicate siblings. Missing required proof remains
NOT VERIFIED. Lifecycle status uses `NOT_VERIFIED`, scenario status uses `NOT VERIFIED`.
Synthetic complete-catalogue tests validate this plumbing, not actual producer execution.

`reportCli` already returns nonzero when required report output fails, and emits sanitised
fallback. `buildXeroReport` requires harness/candidate equality and reports absent lifecycle
input as unavailable. Keep these behaviours when wiring real producers in Steps 4-5.
Actual expected/observed details, alias-based reproduction and remediation references must
remain bounded, validated and private where appropriate.

**Verify:** `bun --no-env-file run test:release-tools` and
`bun --no-env-file run typecheck:release-tools` exit 0 without service credentials. Existing
runner/collector/report tests cover full synthetic 26/92/40/93 accounting, terminal ordering,
wrong identity/target/time/phase, incomplete evidence and unwritable output. New producer
work needs meaningful causal execution tests in addition to these existing contract tests.

## Step 3: Establish application and operational prerequisites

These are dependencies, not permissions this document grants and not application edits within
Plan 160. Preserve Steps 1-2 and continue safe source/report work while dependent
operational actions are unavailable.

| Owner | Required handoff before dependent execution | Acceptance evidence |
| --- | --- | --- |
| Plan 159, AU decision and implementation | Approved versioned transition table for draft, submit, approve, decline, withdraw, imported requested leave and legacy already-scheduled rows | Recorded decision plus adapter/service regressions. `au-contract-v1` syntax alone is not a decision. Do not select create-on-approval in the harness. |
| Plan 159, import/identity/UI work | Reconcile remaining completeness, retry ownership, initial import, identity resolution and calendar freshness work | Candidate-specific implementation and meaningful tests. Lifecycle source completion does not close these items. |
| Plan 159 worker orchestration owner, coordinated with go-live | Enforced owned Clerk/payroll tenant, run and binding-generation fence; registered revision; permitted functions; prior worker state; terminal drain/restoration protocol | Tests denying wrong tenant/run/generation and stale workers, plus real registration and read-back. The manifest cannot supply enforcement. Expand the prerequisite plan explicitly if its implementation contract is absent. |
| Go-live / Plan 161h operator | Compatible app/API/web and worker revisions, applied schema, required tier/domain/namespace/keyring/callback configuration | Fresh read-only metadata and registered function evidence for the frozen candidate. READY, local HEAD and an operator-supplied SHA are insufficient. |
| Fixture operator | Sanctioned AU payroll company, employee/type/date bounds, distinct cohorts/accounts/entities and Clerk role sessions | Exact private IDs, ownership, existing applicable operation authority and independent recovery path; no borrowed customer identity. |
| Controlled-test owner with Plan 159/161 handlers | Real controlled handler execution and persistence read-back without provider transport | Recipe/provenance for X03/X05/X14/X22 and recovery/receipt browser fixtures. `currentControlledBrowserFixtureCapability()` is currently false. SQL status labels alone are insufficient. |

Refresh dated production observations before acting. Preserve existing applicable authority;
obtain only missing authority for a concrete target/operation. Deployments, provider deletes,
customer payroll mutations, backfills and activation of shared workers are not authorised by
this review. Ordinary Preview has OAuth disabled; use the authorised OAuth-capable candidate
without weakening that restriction. Never call `ALLOW_LOCAL_DATABASE_TESTS=1` against Neon.

**Verify:** record one accepted or missing result per row, with candidate/target and private
references. Until enforcement exists, `currentXeroWorkerCapability().available` remains false
and default CLI execution stays non-PASS. A missing prerequisite blocks dependent actions,
not independent source/report work.

## Step 4: Implement the real guarded execution lease

Start only after the application/worker contract in Step 3 is concrete. Implement
`xero-execution-adapter.ts`; keep orchestration in `run-xero-e2e.ts`.

1. Acquire exclusive owned run authority, independently read deployed/registered revisions,
   verify the runtime fence and retain prior worker settings. Reuse the existing active-run
   and consumer inventory modules. A boolean, environment switch or manifest hash is not
   worker isolation. Partial acquisition must roll back safely or retain durable recovery
   ownership even if acquisition throws before returning a lease.
2. Bind the version 2 execution manifest to its distinct database ownership manifest and
   durable copy. Define how observers retain database authority while owned workers run.
   The existing version 1 all-consumers-paused runner cannot be enabled and relabelled as
   E2E. If the reviewed runtime contract cannot coexist with current observer guards, stop
   dependent work and specify the missing prerequisite instead of bypassing either guard.
3. Implement every lease member: fixture verification, fresh deployment observations,
   guarded runner context, the existing action/terminal collector from Step 2, remote/local
   cleanup hooks, terminal cleanup evidence and `verifyRecoveryBrowserClosure`. The latter
   is optional in the interface but required to admit recovery; implement strict independent
   prior-writer proof and retain the fence when proof is unavailable. Bind exact private fixture and role-session files; never
   assume supplying `TC_XERO_CASE_FIXTURES` proves they were produced safely.
4. Integrate `persistXeroExecutionManifest` / read-back at the correct ownership boundary;
   add read-only live admission diagnostics separately from current local `--preflight`.
   Local preflight remains mutation-free and honestly incomplete.
5. Context currently expires after one hour and each test after 15 minutes. Derive a bounded
   campaign/test budget from scheduled due times before execution. Long campaigns need a
   verified renewal or safe checkpoint/resume contract. Do not just extend expiry, restart
   payroll creates, backdate timestamps or ignore the fence when the budget expires.

**Verify:** `bun --no-env-file run test:release-tools` and harness types exit 0. Add adapter
contract tests for stale deployment/worker, wrong target, lost authority, partial acquisition,
fixture mismatch, expired context and drain/restore failure. Real admission additionally needs
fresh read-back evidence; injected adapters are not sufficient to remove the default refusal.

## Step 5: Wire actual case drivers and receipt producers

1. Connect the independent provider/operation/database/worker/controlled observers to
   actual scenario execution. `xero-browser-case.ts` currently writes a UI receipt and
   consumes the other layers as fixture-supplied paths. Produce those receipts during the
   same subcase window, after the causal action; never prefill success or reuse an old run.
2. Implement each multi-step case from the catalogue, including consent/cancel/retry,
   transitions, multiple sessions/entities and independent provider-side changes. A fixture
   locator click plus visible heading is not the complete assertion. Verify provider raw
   ID, employee/type/dates/units/status independently of production mapping and preserve
   local intent such as withdrawal separately from remote representation.
   Preserve the already implemented action-specific strict payload schemas in
   `xero-browser-mutation-scope.ts` and its tests. Current production connect arguments are `{ organisationId }`; disconnect
   arguments are `{ confirmationText, connectionId, mode, organisationId }`, as observed in
   `xero-client.tsx:51-84`. Carry approved connection ID/mode/confirmation and candidate action
   identity in private scope metadata; reject wrong entity/connection/mode and unknown fields.
   Do not require a leave record for a connection action. Verify actual browser request
   serialisation for the frozen candidate instead of assuming all Next.js actions share the
   one-object JSON-array envelope. Keep opaque or unrecognised requests denied until a
   reviewed decoder can prove their exact scope. Extend the existing mutation-scope tests.
3. Implement X08's scheduled worker observer using actual registered scheduled executions,
   exact remote/local IDs and terminal run proof. Remove its unconditional skip and throw
   only when the fenced implementation is present. Manual sync remains diagnostic only.
4. Execute controlled faults through the actual handlers and owned persistence. Wire the
   controlled fixture store where available; aggregate units and stored labels cannot fill
   CONTROLLED rows. Keep four controlled scenario modes distinct from LIVE observations.
5. Retain X04 exact import IDs/fresh start, X24 actual before-read and X25 read-only layout
   assertions. Add tests for causal receipt timing and failure propagation. Keep denied
   requests and no-call transitions explicitly verified rather than inventing remote IDs.
6. Preserve all-five-spec discovery, already implemented and verified as 110 tests
   (92 registered suffixes plus 18 auxiliary guards). Reconcile inventory if producer work
   changes it; preserve every suffix and label auxiliary tests separately. Listing tests
   never proves they executed.

**Verify:** harness units/types exit 0; discovery accounts for all 26 scenarios / 92 suffixes
and names all runtime spec files after the change. Each scenario has an implemented driver,
required receipt producers and explicit prerequisite handling. Missing runtime capability
remains NOT VERIFIED, never an unconditional skip relabelled PASS.

## Step 6: Execute the complete scenario catalogue

Preserve the following stable IDs already registered in `xero-scenarios.ts`, with
required evidence mode and prerequisites. Discovery is inventory, not execution. Do not delete or downgrade failing IDs.
All are mandatory for the overall contract; LIVE cases require actual observations at their
declared layers, CONTROLLED cases require explicit deterministic failure/concurrency tests
and are never described as live provider behaviour.

| ID | Mode | Scenario and required assertions |
| --- | --- | --- |
| X01 | LIVE | Fresh connection through actual browser consent/callback; correct business mapping, active shared connection, one durable import intent; credentials remain server-only |
| X02 | LIVE | Cancelled consent and safe retry leave no falsely active connection or successful import; retry creates one intended mapping |
| X03 | CONTROLLED | Expired/mismatched OAuth state, callback replay, wrong account and unsafe return destination rejected with no tenant mutation |
| X04 | LIVE | Initial import completes actual employee/leave pages and balances; exact source IDs/counts reconcile with independent provider enumeration, zero unexplained omissions/duplicates |
| X05 | CONTROLLED | Empty valid response succeeds; >100 rows, malformed first/middle page, malformed row and pagination cap produce truthful outcomes and no unconfirmed archival |
| X06 | LIVE | Pre-existing manual member reconciles to the payroll person; personal calendar shows imported leave; existing manual plans/team/feed identity preserved |
| X07 | LIVE | Ambiguous identity stays unmerged until administrator review; authorised explicit resolution works; member picker requires no raw Clerk ID |
| X08 | LIVE | Confirm local absence, create eligible leave directly in Xero using its UI or an authorised independent API client, persist its remote ID; ordinary scheduled discovery imports exactly one record into an already-open calendar |
| X09 | LIVE | Change dates/state in Xero; next pull updates the existing canonical record and calendar, without duplicate records or changed stable feed UID |
| X10 | LIVE | App draft/submit follows the approved contract; no premature remote approval; remote creation, if applicable, resolves to exactly one matching application |
| X11 | LIVE | Manager approval creates/approves exactly as specified; remote final state, local state, audit and calendar agree; unauthorised manager denied |
| X12 | LIVE | Decline requires a reason, uses the approved local/remote operation, and remains correct after another inbound pull |
| X13 | LIVE | Withdraw before and after approval where supported; remote disposition and local intent stay consistent after another pull; processed leave rejects safely when provider disallows change |
| X14 | CONTROLLED | Timeout after accepted create, duplicate click, lost acknowledgement and retry produce one remote association through recovery, no blind second create |
| X15 | LIVE | Read Xero balances for the fixture people/types and compare units/values to authorised UI; app does not invent accruals |
| X16 | LIVE | Second member uses the shared connection without personal OAuth; manager/viewer scopes and protected admin actions enforced |
| X17 | LIVE | Two payroll entities with same Xero authoriser retain correct mappings and functioning reads after refresh/reauthorisation; selector preserves chosen entity |
| X18 | LIVE | Separate Clerk account and foreign record/entity IDs denied; scoped events do not expose other account data; use a real distinct authenticated account context |
| X19 | LIVE | Same-file reconnect succeeds; wrong-file selection rejected without changing original mapping or data; old import generation cannot resume into new connection state |
| X20 | LIVE | Observe real token refresh and continued reads/jobs; coordinated refresh succeeds across mappings; inspect metadata only, never token values |
| X21 | LIVE | Disconnect owned mapping, confirm polling/writes stop and history remains; other entity continues; reconnect safely; verify last-reference semantics where provider connection is shared |
| X22 | CONTROLLED | 401 refresh/reconnect, 403 missing payroll permission, 429/5xx, interrupted pages, lease expiry, stale worker, cancellation and concurrent scheduler/bootstrap exercise real application/job handlers under controlled faults |
| X23 | LIVE | Background import result reaches permitted open calendar without manual reload; selected range/filters remain; UI distinguishes partial/stale/empty states |
| X24 | LIVE | Authorised ICS includes eligible leave with correct dates/privacy, stable UID and material-change SEQUENCE; withdrawal/removal is reflected; use complete URL in UI but redact capability URL from report |
| X25 | LIVE | Onboarding/progress/recovery at 390/768/1440px in both themes, keyboard focus and live announcements; read-only reuse avoids replaying payroll writes per viewport |
| X26 | LIVE | Provider/local/worker cleanup reconciled, outside-owned data unchanged, any retained audit history explicitly listed with safe final disposition |

LIVE X04 proves the pages actually present in the sanctioned tenant. It must not
claim live multi-page coverage if the tenant has fewer than one page. X05 proves
large-volume cases separately without manufacturing hundreds of payroll records.
For a legitimate absence of a capability, such as processed fixture leave or a
second sanctioned payroll company, mark that subcase NOT VERIFIED and disclose
the coverage limit. Do not silently turn mandatory coverage into optional coverage.

### Required subcase catalogue

Register these exact suffixes under each scenario, for example
`X13.before-approval`. Each carries the parent's mode, explicit fixture/contract
prerequisites, expected result and required evidence layers. Rows not listed here
have exactly one required `primary` subcase. The renderer rejects missing/unknown
subcases; a parent PASS requires all its registered subcases to pass.

| Scenario | Required suffixes | Additional prerequisites/evidence |
| --- | --- | --- |
| X03 | expired-state, wrong-state, replay, foreign-account, unsafe-return | Controlled callback fixtures, persisted no-mutation assertions |
| X04 | employees, leave-records, balances, completion | Independent provider enumeration, same-operation stage/run evidence, canonical IDs/counts, UI receipt |
| X05 | valid-empty, multiple-pages, bad-first-page, bad-middle-page, bad-row, page-cap | Controlled adapter/job fixtures; raw-page counts, persisted outcomes, no false archival |
| X06 | retain-person, retain-manual-records, retain-team-feed, personal-calendar | Existing owned manual profile and related records with pre/post identity evidence |
| X07 | review-required, explicit-resolution | Owned ambiguous candidates and administrator decision audit |
| X09 | dates, status, repeat-import, stable-uid | Exact remote/local IDs, successive provider states, canonical/UI/ICS comparison |
| X10 | draft, submit, unique-remote-association | Approved AU contract; if submit is local-only, require independent remote absence rather than fabricate a remote ID |
| X11 | authorised-approval, out-of-scope-manager | Separate approved/denied fixtures and manager identities; provider no-mutation evidence on denial |
| X13 | before-approval, after-approval, processed-denial | Approved contract; already-owned processed fixture for read/denial only, never create a pay run to manufacture this case |
| X14 | accepted-timeout, duplicate-click, lost-acknowledgement, recovery | Controlled provider acceptance receipts and persisted recovery/uniqueness assertions |
| X16 | member-no-oauth, manager-scope, viewer-scope, admin-denial | Verified isolated role sessions and exact permitted/denied record sets |
| X17 | entity-selection, shared-authoriser-refresh, shared-authoriser-reauthorisation | Two sanctioned provider tenants/entities and verified same provider authoriser |
| X18 | foreign-account, foreign-entity-id, foreign-record-id, scoped-events | Distinct owned Clerk account/session; response/UI/event evidence without exposing foreign payroll payloads |
| X19 | same-file, wrong-file, old-generation | Dedicated reconnect fixture; independent remote mapping and generation/run evidence |
| X20 | refresh-observed, read-after-refresh, other-mapping-readable | Legitimate owned refresh, metadata version, independent provider reads, no exposed tokens |
| X21 | stop-owned-sync, preserve-history, preserve-other-entity, reconnect, shared-reference-detach, last-reference-disconnect | Dedicated connection cohort and surviving recovery authority; exact reference and provider-connection evidence |
| X22 | auth-refresh, permission-denied, rate-limit, server-error, interrupted-pages, expired-lease, stale-worker, cancellation, cron-bootstrap-race | Controlled fault cases with real handler persistence/ownership assertions; no provider overload |
| X24 | eligible-content, privacy, uid-stability, sequence, withdrawal | Complete authorised feed retrieval and parsed ICS assertions; raw capability URLs remain private |
| X25 | 390-light, 390-dark, 768-light, 768-dark, 1440-light, 1440-dark, keyboard-status | Read-only browser contexts; sanitised screenshot/layout/focus/live-region evidence |
| X26 | remote-effects, local-residue, queued-retries-drained, settings-restored, outside-owned-unchanged | Remote/local ledger, worker evidence and restoration comparisons |

Where an approved transition makes a provider call intentionally unnecessary,
the subcase still executes and verifies no remote mutation. That is PASS for
the approved no-call behaviour, not a skipped provider test. A genuinely missing
fixture/capability remains NOT VERIFIED. Test the roll-up rules in report unit tests.

### Fixture connection dependency table

Do not use mere disjoint leave IDs as isolation for connection lifecycle tests.
Define these separate roles in the protected fixture manifest before execution:

| Cohort | Scenarios | Connection lifecycle rule |
| --- | --- | --- |
| A: primary import/leave | X01, X04, X06-X16, X23-X25 | Keep authorised until all remote leave effects and feed evidence are reconciled |
| B: multi-entity grant | X17, X18, X20 | Two sanctioned entities and authorisation mapping; freeze leave writes while reauthorising; reconcile B effects before release |
| C: reconnect/disconnect | X19, X21 | Dedicated owned connection/tenant resources; cannot be the sole recovery path for outstanding A/B mutations |
| D: consent cancellation | X02 | Unconnected owned app entity, no pending recovery dependence |

Where testing shared-grant behaviour deliberately overlaps provider resources,
record the exact shared grant/connection references and a surviving independently
authorised recovery path before destructive transitions. Reauthorisation can
affect other mappings on the grant: verify their post-action reads and preserve
their access. Last-reference disconnection runs only after all remote effects
depending on that reference are reconciled. If a safe independent recovery path
or dedicated cohort cannot be provided, block that destructive subcase and report
NOT VERIFIED; do not discover the missing recovery access after disconnection.

### Scenario execution rules

- X01 uses a genuinely unconnected owned app entity. User-assisted Xero login/MFA
  is acceptable; record assistance and subsequent observed callback evidence.
  Do not bypass MFA or substitute seeded tokens and claim OAuth was tested.
- X08 must observe the actual scheduled trigger and registered handler. Manual
  sync is a separate diagnostic; it cannot substitute for scheduled-sync PASS.
  Read the deployed scheduler configuration and
  `packages/jobs/src/handlers/schedule-xero-syncs.ts`. Derive the next due time
  from that configuration, tenant timezone and last success, then
  allow two scheduler ticks plus a recorded processing budget. Record timestamps
  and latency. Never silently change cadence, backdate live timestamps or wait
  forever. Use 20-second read-only polling with a precomputed deadline and progress
  updates; for long overnight reconciliation use an explicit scheduled test window.
- For initial import, use a recorded 15-minute budget for the bounded fixture,
  revising it before execution if fixture size and provider limits require more.
  A deadline expiry is FAIL if a valid run fails its agreed criterion; unavailable
  access/setup is NOT VERIFIED. Preserve logs for diagnosis.
- X20 may use a legitimate refresh of owned credentials or wait for expiry;
  it must not corrupt stored tokens or mutate system clocks. Confirm refresh
  version/timestamp changed and a subsequent real read succeeded. Forced-expiry
  concurrency remains CONTROLLED coverage, not proof of a natural expiry event.
- Fault cases do not deliberately overload Xero or revoke customer credentials.
  Run deterministic application/job/database tests with explicit injected provider
  faults in the controlled environment; label their evidence mode. Do not claim
  they prove provider outages were observed live. Use Plan 159 regression tests
  and add only missing test-harness coverage here.
- Mutation cases have disjoint owned fixtures and preconditions; ordering is
  explicit: connect/import, identity, inbound/outbound, sharing/refresh, disconnect,
  then cleanup. Dependent cases become NOT VERIFIED if setup fails; independent
  read-only/controlled cases continue. Never falsify later PASS from partial setup.

**Verify:** each catalogue entry produces a schema-valid result with timestamps,
actual/expected outcome, evidence mode and links. The expected 26 IDs and named
subcases must be accounted for even when Playwright skips dependent tests.

## Step 7: Reconcile remote effects and close the owned run

Use the corrected durable ledger and the real lease, not injected cleanup success.

1. Stop new owned work; establish child closure and worker drain/fencing, including queued
   and retrying work. Reload current durable intent. Observe uncertain effects by exact IDs
   or unique fingerprints without replaying creates; ambiguous outcomes retain the fence.
2. Read provider final state while recovery credentials and mappings still exist. Undo only
   owned actions through supported operations within the authorised dates. Never alter posted
   payroll, real employees or another mapping. Retained inactive audit history needs an alias,
   owner, disposition and reason; unresolved effects are not safe retention.
3. Attempt safe independent cleanup despite another entry's failure. Delete transient local
   evidence only after remote reconciliation. Never restore consumed refresh tokens. Verify
   outside-owned invariants with bounded counts/digests without exporting customer data.
4. Restore verified worker settings and release ownership only after durable terminal
   disposition. On corruption or uncertain effects, preserve evidence and provide recovery
   instructions for the same run ID. A killed process is reconciled from durable evidence;
   it has no successful finally result to infer.
5. Persist terminal cleanup evidence as it occurs, then perform Step 2's final collection
   and merge before reporting. Never infer X26 PASS from the browser exit or earlier checks.

**Verify:** runner/ledger/adapter regressions cover partial cleanup, crash after dispatch,
missing outcome, ambiguous/wrong-scope provider matches and restored-worker failure. Live
X26 needs direct provider/local/worker/outside-owned proof. `--assert-clean` is meaningful only
under its required active ownership; do not reacquire a fence just to force that command green.

## Step 8: Emit, validate and publish both sanitised reports

Use `xero-report.ts`; preserve schema validation and bootstrap before manifest/config work.
Current report fields include run/diagnostic/verified IDs, candidate/harness, deployments,
contract, environment, UTC/Brisbane times, tool versions, authorised fixture aliases, scenarios,
defects, cleanup, limitations, next actions, lifecycle input/results and derived counts.

Each scenario/subcase retains mode, status, reason, expectation/observation, attempt, timing,
prerequisites, correlation and hashed evidence references. Unknown identities and unexecuted
timings remain null. Include scoped reproduction and remediation references for failures.

- FAIL if a required assertion, cleanup or unresolved critical/high defect fails.
- Otherwise NOT VERIFIED if required identity, scenario/subcase, evidence level or cleanup
  is unavailable. All required skipped cases remain represented.
- PASS only when every required scenario and charter case satisfies the contract with
  matching candidate/run/target/time and cleanup. No aggregate test exit can supply proof.
- CLI exit: 0 PASS, 1 FAIL, 2 incomplete/invalid/NOT VERIFIED. Validate-only preflight cannot
  certify execution. Generate JSON/Markdown on setup, child, collection and cleanup failures;
  unwritable output falls back to sanitised stderr with nonzero exit.

Write `reports/xero-e2e/<UTC-date>-<run-id>.json` and `.md`. Private raw evidence stays ignored;
sanitised references must resolve within the protected evidence bundle and match their hashes.
Preserve original historical reports instead of overwriting them to look current.

**Verify:** full harness units/types and `git diff --check` exit 0. Re-render a saved report in
an isolated checkout with no credentials and confirm the same identity, evidence and verdict.
Check exact catalogue counts, IDs, modes, null unexecuted timings and 40 charter cases at their
required levels. Review exported bytes for secrets and payroll identifiers; a regex alone is
not sufficient. Update the Plan 160 index row with observed results and remaining limits.

## Completion criteria and execution ledger

Source foundation completion and campaign completion are separate deliverables. Checked
items below certify the merged source slice and its recorded gates only. A future source
change must repeat applicable checks at its new candidate; campaign prerequisites remain open.

- [x] Frozen dependency installation repaired; main release types pass without a source workaround.
- [x] R1 and follow-up recovery regressions preserve durable child/sibling intents and retain
      uncertain effects or writer closure without deleting local recovery data/releasing ownership.
- [x] R5 output failure remains nonzero; R6 strict action-specific connection validation and
      R7 conservative causal ingestion are implemented and tested.
- [x] Scenario/lifecycle action and terminal collection contracts are implemented and tested;
      verified failures and invalid-evidence limitations survive duplicate/phase conflicts.
- [x] Merged runtime `5d5889c` passes source gates and exact-source protected domain inventory;
      post-merge checks confirm unchanged source/test bytes.
- [x] Both actual diagnostic formats exist for the recorded attempts, with matching verdict,
      catalogue, null unadmitted identity and byte-identical offline rendering.
- [x] Scoped merge/review/index records distinguish source, domain, campaign and production proof.
- [ ] Actual execution lease, partial-acquisition recovery, independent prior-writer proof and
      worker/runtime fencing are implemented and verified under the concrete prerequisite contract.
- [ ] Real per-layer and causal no-effect receipt producers execute every required assertion.
- [ ] All 26 scenarios/92 suffixes have complete actual drivers; X08 and controlled handlers
      execute with registered candidate-specific terminal proof.
- [ ] Approved AU decision, implementation dependencies, fixture scopes, role sessions and exact
      deployed/registered revisions are evidenced before dependent execution.
- [ ] The campaign candidate passes applicable fresh gates after operational source changes.
- [ ] Real campaign accounts for every required case/level and all live/controlled assertions pass,
      with no queued-only, stale, mocked-live or aggregate substitution.
- [ ] Actual provider/local/worker cleanup and outside-owned invariants are verified; retention
      is explicitly safe and unknown outcomes remain recoverable, preventing PASS.
- [ ] Current restore prerequisites are evidenced; a timeline/LSN reference alone is not PITR proof.
- [ ] Both sanitised reports are produced for every subsequent attempt, including incomplete setup,
      with truthful source/evidence provenance and derived verdict/count/exit consistency.

| Deliverable | Current status |
| --- | --- |
| Plan verification | Reconciled against main `514efb5` and tested runtime `5d5889c`, 27 September 2026 |
| Guard/report/catalogue/observer foundation | Implemented; preserved through merge `f3dd965` |
| Source and protected domain verification | PASS at `5d5889c`; 505 release tests, 2,810 repository tests and 246 protected online tests, with cleanup evidence |
| Main dependency/types and post-merge checks | PASS, frozen install without dependency/lockfile change |
| R1/R5/R6, R7 ingestion and follow-up recovery/evidence corrections | Merged and independently approved; actual producer/deployed serialisation proof remain open |
| Scenario/lifecycle collection contracts | Implemented and tested; real producer execution remains TODO |
| Operational execution/evidence adapters | TODO, exact admission, full case drivers and receipt producers follow Step 3 handoff |
| Actual diagnostic delivery | COMPLETE for recorded attempts; latest actual missing-manifest pair rerenders byte-identically, exit 2 |
| Live Xero application/browser campaign | NOT VERIFIED; no campaign observations supplied by these gates |
| PITR retention/restore exercise | NOT VERIFIED; fresh target reference does not establish a successful restore |

A diagnostic report can have FAIL or NOT VERIFIED and satisfy its reporting obligation.
It does not complete this plan's full verification objective. Keep Plan 160 IN PROGRESS
until required operational implementation and campaign evidence are complete. Plan 161
charter sign-off and whole-product readiness remain separate decisions.

## Stop conditions and maintenance

Stop only dependent mutations on unknown target/ownership, missing AU decision, ineffective
worker fencing, lost run authority, unresolved remote effect, uncertain child closure or unsafe
cleanup. Continue independent source/read-only/report work. An application/schema change,
new observer database mode or unapproved payroll operation requires a concrete prerequisite
handoff; do not improvise it inside this test plan.

If corrected source fails its meaningful verification twice, reconcile the failed assumption
and update the handoff. Preserve failure evidence; do not shrink the catalogue or weaken a
validator to clear a gate. A source change requires new candidate provenance and applicable
fresh gates; tree equivalence can explain historical source evidence but cannot prove a new
provider/deployment state.

Keep raw-provider expectations, approved AU contract, scenario catalogue and report schema
aligned. Recheck installed SDK signatures and official provider contracts before changing an
observer. Use Context7 for library/API documentation during implementation; provider contract
claims belong in `plans/161-xero-provider-contract.md` with documented/observed distinctions.
No external contract was refreshed in this plan-only review.

Maintain one writer/ownership model for ledger recovery; scrutinise child shutdown and any
adapter that can mutate before returning a lease. Changes to fixture ownership, worker
registration, cadence, context renewal or key rotation require recovery and provenance tests.

Considered and rejected:

- Rebuilding the existing manifest/report/oracle foundation or restoring the obsolete teardown
  excerpt. The implementation already exists; extend it only for the named remaining work.
- Marking all harness work complete because default admission safely refuses execution.
- Treating historical integration totals or Playwright discovery as scenario/charter PASS.
- Treating local `--preflight` as a live deployment/worker/fixture readiness check.
- Enabling shared workers by a manifest flag, replaying uncertain creates, or deleting local
  recovery evidence before remote reconciliation.
- Choosing Plan 159's AU write policy or modifying ordinary release journeys during verification.

## Initial review result, historical

Review complete at `92d67c5`. Two bounded source/evidence reviews and a fresh-context handoff
review informed this revision. The cold review's terminal-collection ordering concern was
incorporated in Steps 2 and 7, then independently confirmed resolved. R1-R3 and R5-R7 remain
source work; this session changed no implementation.

Validation: 48 bounded tests PASS, four file-writing tests deliberately excluded; discovery
PASS with 97 listed tests; source catalogue confirms 26 scenarios / 92 subcases / 40 charter
cases / 93 required levels. All scenario and subcase table rows match the previous plan
exactly. Local Markdown links resolve and scoped `git diff --check` passes. Release-tool
typecheck FAIL remains explicitly recorded for unresolved declared `jose`. Full CI gates,
database, provider, authenticated browser and production configuration were not rerun.

This review's edits are this plan and its README record. Concurrent go-live plan/index edits
are preserved. The immediate executable work is dependency repair and Steps 1-2; operational
admission and dependent campaign work follow the concrete prerequisites in Step 3.


## Current plan verification result

Reviewed against main `514efb5`, whose entire source/test tree matches merged and verified
`5d5889c`. The current implementation, drift baseline, Steps 1-2, discovery command and
completion ledger now reflect those fixes. The prerequisite/review/index records distinguish
initial history from the merged source. The remaining execution starts with Step 3;
Steps 4-8 require real worker admission, receipt/case producers and the existing operational
prerequisites. No missing authority or observation is inferred from source/domain PASS.

Validation and independent review results are recorded in
[execution review](160-execution-review.md#updated-plan-verification-27-september-2026).
This verification changes plans only and does not repeat a database/provider campaign.
