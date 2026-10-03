# Plan 160: Verify the complete Xero integration and publish an evidence report

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**:
> ```bash
> git rev-parse --short HEAD
> git diff --stat 6005a5a..HEAD -- tooling/release packages/xero packages/jobs packages/availability packages/database apps/app apps/api package.json bun.lock .github/workflows/ci.yml .gitignore
> ```
> Confirm this diff is empty against `6005a5a` before proceeding.

## Status

- **Status**: IN PROGRESS
- **Priority**: P1
- **Effort**: L
- **Risk**: HIGH for live provider operations, LOW for source tooling
- **Category**: tests, correctness verification, operational reporting
- **Planned at**: commit `6005a5a`, 2 October 2026
- **Depends on**: Approved AU transition contract `au-contract-v1` (implemented in main at `bf01911`), Plan 161 connection lifecycle controls (all 23 migrations applied), and authorised live runner manifests for live provider execution.

## Why this matters

Team Calendar connects directly to external customer payroll in Xero. Corrupted payroll sync or unverified leave actions risk real employee pay, leave balances, and confidential availability data. This plan provides an end-to-end verification campaign across all 26 lifecycle scenarios (92 subcases) and publishes an unforgeable, cryptographic evidence report proving correctness across the live UI, API, Inngest jobs, and Xero before general Australian release.

## Current state and baseline

- **AU Workflow**: `au-contract-v1` approved 2 October 2026 and integrated at `bf01911`. Employee AU submission remains local pending manager approval; manager approval creates scheduled leave synchronously in Xero.
- **Harness & Recovery**: Steps 1 and 2 (durable recovery contract, collection/report contracts) are implemented and merged at `5d5889c` / `f3dd965`.
- **Receipt Producers & Observers**: `tooling/release/xero-observation-producers.ts` and `tooling/release/xero-observer-authority.ts` are implemented and passing 69 release-tool tests.
- **Database & Migrations**: All 23 database migrations are applied (including `20261002000000_approval_create_operation`).
- **Rate Limit Namespace**: Fixed 24-hour waiting period removed (`a4cab6b`); immediate admission allowed when quota checks pass.
- **Open Deliverables**: Executing the live verification campaign (Step 3 operational prerequisites, Step 4 lease adapter, Step 5 case driver wiring, Step 6 catalogue execution, Step 7 effect reconciliation, and Step 8 report publication).
- **Historical Execution Diary**: Preserved in [`plans/160-execution-review.md`](160-execution-review.md) and [`plans/160-completion-review.md`](160-completion-review.md).

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
| Plan 159, AU decision and implementation | Approved versioned transition table (`au-contract-v1`) | RESOLVED: `au-contract-v1` approved on 2 October 2026 and integrated at `bf01911`. AU submission is local; creation is on manager approval. |
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
- [x] Approved AU decision (`au-contract-v1`) and implementation dependencies integrated in main at `bf01911`.
- [ ] Fixture scopes, role sessions and exact deployed/registered revisions are evidenced before dependent execution.
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
| Plan verification | Reconciled against main `6005a5a`, 2 October 2026 |
| Guard/report/catalogue/observer foundation | Implemented in main; passes release-tool tests |
| Source and protected domain verification | PASS at `6005a5a`; release tests and unit suites pass with cleanup evidence |
| Main dependency/types and post-merge checks | PASS, frozen install without dependency/lockfile change |
| R1/R5/R6, R7 ingestion and follow-up recovery/evidence corrections | Merged in main; actual producer/deployed serialisation proof remain open |
| Scenario/lifecycle collection contracts | Implemented and tested in main; real producer execution remains TODO |
| Operational execution/evidence adapters | TODO, exact admission, full case drivers and receipt producers follow Step 3 handoff |
| Actual diagnostic delivery | COMPLETE for recorded attempts; latest actual missing-manifest pair rerenders byte-identically, exit 2 |
| Live Xero application/browser campaign | NOT VERIFIED; no campaign observations supplied by these gates |
| PITR retention/restore exercise | NOT VERIFIED; fresh target reference does not establish a successful restore |

A diagnostic report can have FAIL or NOT VERIFIED and satisfy its reporting obligation.
It does not complete this plan's full verification objective. Keep Plan 160 IN PROGRESS
until required operational implementation and campaign evidence are complete. Plan 161
charter sign-off and whole-product readiness remain separate decisions.

## STOP conditions

Stop only dependent mutations on:
1. Unknown target or fixture ownership.
2. Ineffective worker fencing or lost run authority.
3. Unresolved remote effect or uncertain child closure.
4. Unsafe cleanup or missing restoration readback.
5. Attempting to alter the approved `au-contract-v1` workflow inside the harness.

Continue independent source, read-only and report work. An application/schema change,
new observer database mode or unapproved payroll operation requires a concrete prerequisite
handoff; do not improvise it inside this test plan.

## Maintenance notes

Keep raw-provider expectations, approved AU contract, scenario catalogue and report schema
aligned. Recheck installed SDK signatures and official provider contracts before changing an
observer. Provider contract claims belong in [`plans/161-xero-provider-contract.md`](161-xero-provider-contract.md)
with documented/observed distinctions.

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

Historical review verifications and detailed execution notes are preserved in
[`plans/160-execution-review.md`](160-execution-review.md).
