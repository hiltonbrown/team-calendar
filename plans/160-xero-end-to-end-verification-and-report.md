# Plan 160: Verify the complete Xero integration and publish an evidence report

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
  observer foundations are implemented. Operational campaign wiring and a newly identified
  recovery correction remain TODO. Live application/browser/provider verification is
  **NOT VERIFIED**.
- **Priority:** P1. **Effort:** L. **Risk:** HIGH for execution/cleanup; LOW for plan edits.
- **Category:** tests, correctness verification, operational reporting.
- **Planned at:** originally `246ba27`, 20 September 2026.
- **Reviewed and reconciled at:** `92d67c5`, 27 September 2026.
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

### Evidence ledger

| Evidence | Result and boundary |
| --- | --- |
| Current source identity | PASS: `git diff --name-only 5d2e57b..92d67c5 -- . ':!plans' ':!tasks' ':!reports'` is empty. Current runtime, tests, tooling and lockfile match the historically verified source. This is not a fresh gate or deployment run. |
| Historical full source gates | Recorded PASS at `b211d87` / `5d2e57b`: 2,810 repository tests, 395 release-tool tests, lint, build, types and boundaries. Details: `plans/160-161-reconciliation.md:54-56`. Preserve the original candidate and date. |
| Historical protected Neon/Redis inventory | Recorded PASS at `5d2e57b`: 27 files / 246 tests, 21 migrations applied, 39 residue selectors zero and outside-owned content unchanged. Details: `plans/160-161-reconciliation.md:79-85`. No database/provider operation was repeated during this review. |
| Current bounded tests | PASS: 48 report/oracle/import-observer tests; four report-writing tests deliberately excluded from this read-only review. These are harness units, not LIVE or CONTROLLED campaign observations. Exact command is below. |
| Current inventory discovery | PASS: dedicated `--list` returned 97 tests in 3 files; 92 registered suffixes plus five intent guards. No browser or scenario ran. |
| Current release-tool types | FAIL: `bun --no-env-file run typecheck:release-tools` reports TS2307 for `jose` at `packages/xero/src/oauth/identity.ts:7`. `packages/xero/package.json` and `bun.lock` already declare `jose` 6.2.12. Repair dependency installation in the executor checkout, then rerun; no source workaround or dependency upgrade is indicated. |
| Published diagnostic report | [JSON](../reports/xero-e2e/2026-09-26-3c9912d5-3785-4276-8a13-8aa05b14e710.json) and [Markdown](../reports/xero-e2e/2026-09-26-3c9912d5-3785-4276-8a13-8aa05b14e710.md): 26 scenarios / 92 subcases / 40 charter cases accounted for; 0 LIVE and 0 CONTROLLED executions, all NOT VERIFIED; verified execution identity null. Source and successful database-run metadata do not promote per-case results. |
| Historical early-failure CLI | [Missing-manifest diagnostic](../reports/xero-e2e/2026-09-26-c58df8ac-b0e4-4f2a-bb88-cb38db335af9.json) records incomplete setup, null candidate/harness and exit 2 in the execution record. Report files were inspected, not regenerated here. |
| Current provider/deployment/browser state | NOT VERIFIED. The 27 September inventory in `plans/160-161-reconciliation.md:75-77` is a prior observation of an older production revision, missing lifecycle configuration and unregistered workers. Refresh before execution; do not present it as a live observation from this review. |

The review does not recertify every Plan 161 implementation, audit NZ/UK, run all CI gates,
or inspect live credentials, provider state, infrastructure, browser sessions or customer data.

## Drift check and repository conventions

Run before implementation:

```bash
git rev-parse HEAD
git status --short
git diff --stat 92d67c5..HEAD -- tooling/release packages/xero packages/jobs packages/availability packages/database apps/app apps/api package.json bun.lock .github/workflows/ci.yml .gitignore
```

Changes require comparison with the symbols/excerpts below, not blind rejection because the
old implementation landed. If the recovery or execution contracts differ materially, update
this plan before touching them. Record concurrent edits and preserve them. During this review,
`plans/go-live.md` acquired an unrelated concurrent edit; it is outside this task's edits.

Bun 1.4.0, TypeScript, Next.js App Router/Turborepo, Vitest and Playwright are already declared.
Use strict types, Zod input validation, named exports, co-located tests and Australian English.
`PRODUCT.md` establishes `AvailabilityRecord` as canonical, Xero as the balance/payroll source,
scheduled inbound sync and synchronous user-triggered outbound writes. Do not change these
contracts while measuring them. Tenant reads require both Clerk and payroll organisation IDs.
Credential infrastructure without a Clerk ID remains accessible only through scoped bindings.
UI verification follows `DESIGN.md` and `.impeccable.md`: existing tokens, both themes,
keyboard focus and status announcements. This is not a redesign.

## Current implementation and vetted findings

All source locations below were read at `92d67c5`; line numbers are navigation aids.

| Component | Current behaviour |
| --- | --- |
| `tooling/release/run-xero-e2e.ts:149-325` | Bootstraps diagnostic reporting before CLI/manifest parsing; enforces source identity, private output, guarded browser startup and cleanup/report paths. Default acquisition always rejects. |
| `tooling/release/xero-execution-guard.ts:37-129` | Strict version 2 `xero-e2e` manifest embeds a distinct version 1 database manifest and validates scope, revisions, dates and independent recovery aliases. The ordinary database guard still rejects the foreign mode. |
| `tooling/release/xero-execution-manifest-store.ts:154-178` | Durable manifest persistence/read-back exists. Equality proves manifest identity, not actual worker isolation or run ownership. |
| `tooling/release/xero-scenarios.ts` | All 26 IDs and 92 suffixes are registered with evidence modes/layers. Four scenarios, X03/X05/X14/X22, are CONTROLLED; the other 22 are LIVE. |
| `tooling/release/xero-report.ts:165-229,572-610` | Strict report schema and offline renderer include lifecycle input. All 40 lifecycle cases and matching identity/time are required for PASS. The runner has no lifecycle collector assignment yet. |
| `tooling/release/xero-ledger.ts:152-169,225-295,319-417` | Atomically persisted intent/outcome/recovery ledger and injected cleanup hooks exist; browser and parent currently hold separate snapshots. |
| `tooling/release/e2e/xero-provider-oracle.ts:47-152` | Independent raw AU assertions and authorised reads through the existing resolver/deadline/`xeroFetch` path exist. No production status mapper is used as the oracle. |
| `tooling/release/e2e/xero-independent-snapshot-cli.ts:94-125` | Scoped, action-aware observation supports imported records. The ordinary `provider-snapshot-cli.ts` still has its legacy submit join; it is not the dedicated lane's proof path. |
| `tooling/release/e2e/xero-import-observer.ts` and `xero-publication-probe.ts` | Exact initial-import identities and actual publication before/after checks exist with units. Their existence does not prove a real campaign ran. |
| `tooling/release/e2e/global.teardown.ts` | Uses `reconcileReleaseTeardown` instead of asserting reconciliation before attempting cleanup. The old excerpt was superseded. |
| `tooling/release/xero-e2e.config.ts:5-74` | Runner context required; one worker, zero retries, 15-minute test timeout; OAuth capture disabled. Discovery is intentionally narrower than execution's controlled browser projects. |

| ID | Finding | Category | Impact | Effort | Fix risk | Confidence | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| R1 | Parent cleanup can overwrite child-written mutation intents | Correctness/security | Once execution is enabled, the parent can reconcile an empty/stale ledger and delete local recovery state or release the fence without observing child mutations | M | HIGH: cleanup ownership | HIGH | `run-xero-e2e.ts:228-234,278-285`; `e2e/xero-browser-case.ts:346-373`; `xero-ledger.ts:330-334` |
| R2 | Operational campaign adapters are absent | Tests/architecture | Valid manifests and credentials cannot activate the CLI; worker admission, real fixture/cleanup adapters, non-UI receipt production and scheduled X08 execution still need implementation | L | HIGH: provider/worker isolation | HIGH | `run-xero-e2e.ts:82-104`; `xero-execution-guard.ts:216-224`; `e2e/xero-browser-case.ts:104-117,211-214,498-545`; `e2e/xero-browser-fixtures.ts:102-110` |
| R3 | Lifecycle proof cannot reach the runner report | Tests | `collect()` returns only scenarios; even otherwise complete execution cannot satisfy the 40-case lifecycle gate through the production runner | M | MED: false-positive reporting | HIGH | `run-xero-e2e.ts:82-89,270`; `xero-report.ts:572-581` |
| R5 | Offline renderer can exit 0 when neither report was written | Correctness/DX | An all-PASS input retains exit 0 after both output attempts fail, violating the required report-delivery contract | S | LOW | HIGH | `xero-report.ts:760-776`; compare runner fallback `run-xero-e2e.ts:315-320` |
| R6 | Connection requests use the leave-action payload validator | Correctness/tests | Connect and disconnect calls are rejected because the harness requires a `recordId` and rejects actual connection fields | M | MED: protected request admission | HIGH | `e2e/xero-browser-mutation-scope.ts:67-80`; `apps/app/app/(authenticated)/settings/integrations/xero/xero-client.tsx:51-84` |
| R7 | Dispatched no-effect actions have no verified cleanup disposition | Correctness/tests | Cancelled, denied or approved local-only actions remain unresolved because the observer must return exactly one remote effect | M | MED: proving absence | HIGH | `e2e/xero-browser-case.ts:365-373`; `xero-ledger.ts:283-286,343-357`; existing test sets `definite-non-attempt` directly rather than exercising a producer |
| R4 | Completion, preflight and discovery wording overstated the implemented capability | Docs/DX | Executors could repeat completed work, treat local preflight as deployment validation, or count 97 discovered tests as campaign execution | S | LOW | HIGH | `run-xero-e2e.ts:208-223`; `xero-e2e.config.ts:37-62`; historical reconciliation `:89-91` |

R1 is dormant behind default execution refusal. Keep that refusal until the correction and
runtime prerequisite are proven. R4 is corrected in this revision; R1-R3 and R5-R7 remain implementation
work. This review makes no source fix.

Load-bearing current excerpts:

```typescript
// tooling/release/run-xero-e2e.ts:102-104
const defaultDependencies: XeroRunnerDependencies = {
  acquire: () =>
    Promise.reject(new Error(currentXeroWorkerCapability().reason)),
```

```typescript
// tooling/release/run-xero-e2e.ts:278-285
if (lease && ledger && ledgerPath && authority) {
  try {
    const cleanup = await reconcileXeroLedger(
      ledgerPath,
      ledger,
      lease.cleanup,
      authority
    );
```

The browser separately calls `readXeroLedger`, `recordXeroIntent` and `dispatchXeroIntent`.
`reconcileXeroLedger` subsequently persists the parent's supplied object immediately after
drain. Reloading durable child state after all writers stop is therefore a safety requirement.

## Scope and execution ownership

This review edits only this plan and its row/notes in `plans/README.md`.

A later Plan 160 executor may modify these existing harness files and their co-located tests:

- `tooling/release/{run-xero-e2e,xero-ledger,xero-observations,xero-report,xero-evidence,xero-execution-guard,xero-execution-manifest-store,xero-source-integrity,xero-scenarios,xero-e2e.config}.ts`.
- `tooling/release/e2e/{xero-browser-case,xero-browser-fixtures,xero-browser-mutation-scope,xero-provider-oracle,xero-import-observer,xero-publication-probe,xero-readonly-assertions}.ts`.
- `tooling/release/e2e/{xero-independent-snapshot-cli,xero-import-observer-cli,xero-browser-scope-cli}.ts` and the five existing `xero-*.spec.ts` files matched by the dedicated config.
- New `tooling/release/xero-execution-adapter.ts` and `.test.ts` for the lease implementation,
  plus `xero-campaign-collector.ts` and `.test.ts` for receipts/lifecycle collection.
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

For a fresh executor checkout, `bun install --frozen-lockfile` should resolve declared
packages, including `jose`, without a lockfile edit. This review does not install packages.
If resolution still fails after a correct install, capture the specific error and reconcile
the environment before continuing dependent checks.

| Purpose | Command | Expected result |
| --- | --- | --- |
| Harness units | `bun --no-env-file run test:release-tools` | Exit 0; required tests executed, no invented campaign PASS |
| Harness types | `bun --no-env-file run typecheck:release-tools` | Exit 0 after dependency repair |
| Lint | `bun --no-env-file run check` | Exit 0 |
| Build before repository types | `bun --no-env-file run build -- --force`, then `bun --no-env-file run typecheck -- --force` | All uncached tasks exit 0 |
| Repository units/boundaries | `bun --no-env-file run test -- --force`, then `bun --no-env-file run boundaries` | Exit 0 |
| CI integration gate | `bun run test:integration` | All registered suites pass on CI's isolated localhost PostgreSQL/Redis setup; never run this directly against Neon |
| Protected configured-database verification | `TURBO_CONCURRENCY=1 bun --env-file=<private-run-env> ./tooling/release/run-live-integration.ts --manifest <fresh-private-db-manifest> --evidence-dir <private-evidence-dir>` | Exact owned target, full current inventory, cleanup and fence read-back PASS; historically 27 files / 246 tests, not a fixed future count |
| Read-only discovery | `TC_XERO_DISCOVERY=1 bun --no-env-file ./node_modules/@playwright/test/cli.js test --config tooling/release/xero-e2e.config.ts --list` | Current inventory: 97 tests in 3 files, comprising 92 suffixes and 5 intent guards; no scenario executed |
| Local manifest/source preflight | `bun --no-env-file ./tooling/release/run-xero-e2e.ts --manifest <private-xero-manifest> --preflight` | Exit 2, both reports; validates local manifest/source/config import only. Does not read durable authority, verify deployments, acquire workers or prove fixture readiness |
| Full campaign, after Steps 1-5 | `bun --no-env-file ./tooling/release/run-xero-e2e.ts --manifest <private-xero-manifest> --output tooling/release/test-results/<run-id>` | Exit 0 only all required proof PASS; 1 FAIL; 2 incomplete/NOT VERIFIED. Current default adapter refuses execution |
| Recovery, after Steps 1-5 | `bun --no-env-file ./tooling/release/run-xero-e2e.ts --manifest <same-private-xero-manifest> --recover --output tooling/release/test-results/<same-run-id>` | Cleanup/report only, no create replay; current default adapter also refuses recovery |
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

This review's bounded test command, with file-writing tests deliberately excluded:

```bash
bun --no-env-file ./node_modules/vitest/vitest.mjs run --config tooling/release/vitest.config.ts tooling/release/xero-report.test.ts tooling/release/e2e/xero-provider-oracle.test.ts tooling/release/e2e/xero-import-observer.test.ts --testNamePattern '^(?!.*(?:saved JSON|offline rerender|standalone renderer)).*$'
```

## Step 1: Preserve durable child intents through teardown and recovery

Independent source work; do this before enabling a real execution lease.

1. In `run-xero-e2e.ts` and `xero-ledger.ts`, make the persisted ledger authoritative
   after browser execution. Quiesce the child and its mutation writers, drain/fence owned
   workers, then read and validate the latest ledger before any persist/reconciliation.
   Do not overwrite durable intent with the pre-browser snapshot. Preserve entry identity,
   authority hash, mutation budgets and uncertain outcome state.
2. Handle child error/nonzero exit and SIGINT/SIGTERM without entering cleanup while the
   child can still mutate. Await actual child closure or record unresolved shutdown; a
   spawn error/abort notification alone is not proof of closure. Bound the wait. If closure
   or durable read cannot be verified, retain the fence and recovery evidence.
3. Preserve safe independent observation/outside-owned checks on failure. Missing, corrupt
   or mismatched ledgers must never become a new empty ledger. New runs refuse an existing
   ledger; recovery must use the same run/candidate/authority without replaying creates.
4. Add a runner-level regression in `run-xero-e2e.test.ts`: the injected browser loads a
   separate ledger object, durably writes and dispatches an intent, then succeeds, fails or
   is interrupted. Teardown must observe that intent and keep unresolved outcomes; neither
   local deletion nor fence release may run while the effect is uncertain. Test malformed
   child state, delayed child closure and repeated recovery. Use `xero-ledger.test.ts`'s
   authority fixtures and cleanup-hook spies; do not test only a shared in-memory object.

5. Address R7 with a typed, independently verified no-effect outcome in the observer/ledger
   contract. Include exact action, scope, observation time and causal non-dispatch/rejection
   evidence. An empty query, expired credentials or a timed-out create cannot prove absence.
   Distinguish definite non-attempt from a dispatched but proven no-effect action and preserve
   mutation-budget semantics. Test valid cancellation/denial/local-only disposition separately
   from uncertain accepted-create refusal; do not patch the ledger to a safe label by hand.

**Verify:** `bun --no-env-file run test:release-tools -- tooling/release/run-xero-e2e.test.ts tooling/release/xero-ledger.test.ts`
and `bun --no-env-file run typecheck:release-tools` exit 0. The new cross-process-state
regression must fail on the old implementation and pass on the correction. Default live
admission remains denied, including when all local manifest fields are valid.

## Step 2: Complete scenario and lifecycle evidence collection contracts

This source work can proceed with controlled test doubles before live infrastructure exists.

1. Add `xero-campaign-collector.ts`. Collect fresh per-subcase observation files through
   the existing strict schemas and `ingestXeroLayerReceipt` / `validateXeroCollectedObservations`.
   Missing files produce explicit NOT VERIFIED rows. Reject unknown/duplicate IDs, stale
   run/candidate/scope, wrong mode, queued-only outcomes and mismatched artefact hashes.
2. Extend `XeroExecutionLease.collect` and runner assignment to carry scenarios plus
   `lifecycleInput` and `lifecycleRunId`, with a typed validated result. Integrate existing
   `buildXeroEvidence`; do not invent a second charter schema. Capture all 40 cases and
   required levels, target fingerprints, assertion timestamps, ownership and cleanup refs.
   Its status spelling is `NOT_VERIFIED`; scenario/report status is `NOT VERIFIED`.
   Split collection into pre-cleanup action evidence and post-cleanup terminal evidence.
   The current runner collects at `run-xero-e2e.ts:270`, before reconciliation at `:280`
   and terminal cleanup at `:286`. Persist provider/operation/database/UI observations while
   their mappings still exist; then collect actual cleanup receipts at each teardown stage
   and merge X26 plus lifecycle cleanup references after teardown, before final rendering.
   Move X26's five suffixes out of the generic pre-cleanup browser loop into this terminal
   phase while preserving their IDs, required layers and discovery/accounting. Recovery
   follows the same sequence, retaining original action evidence without replaying it.
   Never reread deleted fixtures to manufacture earlier state or predict cleanup success.
3. Preserve FAIL evidence when collection is partially unavailable. A failed required
   assertion must not disappear into a generic missing-prerequisite diagnostic. Retain
   usable prior observations on recovery without presenting cleanup as a new scenario run.
4. Extend report tests with runner-to-collector integration: complete synthetic 26/92/40
   proof reaches PASS; omitting or swapping one lifecycle run, target or candidate produces
   non-PASS. Add an ordering regression whose cleanup writes fresh terminal receipts only
   after action collection: X26 and lifecycle cleanup evidence must appear in the final
   report, and a cleanup failure must override earlier passing action evidence. Assert
   collection never needs deleted fixtures and recovery does not repeat scenario mutations.
   Synthetic fixtures test validation only and never enter a published live report.
5. Keep the human report actionable: sanitised expected/observed assertions, failure
   reproduction using fixture aliases, fix owner and evidence references. Current enum-only
   `actual`/`reason` fields remain a safe baseline; add bounded validated detail/reference
   fields where needed. Verify referenced evidence bytes before export and preserve privacy.

6. Correct R5 in `reportCli`: track delivery failure independently of the evidence verdict.
   If required output cannot be written, preserve FAIL=1 and otherwise return incomplete=2,
   even when the evidence itself is PASS. Preserve the report and emit sanitised stderr.
   Add an all-PASS/unwritable-output regression alongside the existing FAIL writer test;
   verify neither required file was delivered and the CLI does not return 0.

**Verify:** `bun --no-env-file run test:release-tools` and
`bun --no-env-file run typecheck:release-tools` exit 0. Explicitly test no parent PASS from a
process exit, missing layer, mock LIVE receipt, aggregate database success or absent lifecycle
input. Report-write failure preserves FAIL/nonzero and emits sanitised fallback output.

## Step 3: Establish application and operational prerequisites

These are dependencies, not permissions this document grants and not application edits within
Plan 160. Continue Steps 1-2 while the dependent work is unavailable.

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
   guarded runner context, the collector from Step 2, remote/local cleanup hooks and
   terminal cleanup evidence. Bind exact private fixture and role-session files; never
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
   Address R6 in `xero-browser-mutation-scope.ts` and its tests with action-specific strict
   payload schemas. Current production connect arguments are `{ organisationId }`; disconnect
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
6. Reconcile discovery with all runtime projects, including recovery/receipt specs that the
   current discovery branch omits. Preserve every registered suffix; label auxiliary guard
   tests separately. Inventory accounting must never claim the tests executed.

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

Source foundation completion and campaign completion are separate deliverables. The following
are pending for the remaining implementation; historical gate checkboxes do not carry forward.

- [ ] Dependency installation repaired; current release-tool types pass without a source workaround.
- [ ] R1 regression proves child-written durable intents survive normal/error/interrupted teardown;
      unresolved effects cannot delete local recovery data or release ownership.
- [ ] R5 report-output failure stays nonzero even with PASS evidence; R6 connection payloads
      match the frozen candidate with strict scope checks; R7 no-effect proof is conservative.
- [ ] Actual execution lease, partial-acquisition recovery and worker/runtime fencing are verified.
- [ ] Fresh per-layer receipt producers and runner lifecycle collection are implemented and tested.
- [ ] All 26 scenarios / 92 suffixes have executable assertions; X08 and controlled-handler work
      are complete, with every auxiliary runtime browser spec represented in inventory.
- [ ] Final candidate passes check, build then typecheck, test, boundaries, full release-tool
      tests/types and the required integration gate through the appropriate protected target.
- [ ] Applicable AU decision, implementation dependencies, fixture scope, role sessions and exact
      deployed/registered revisions are evidenced before dependent execution.
- [ ] Real campaign accounts for every case and level; all required live and controlled assertions
      pass for an overall PASS, with no queued-only, stale, mocked-live or aggregate proof.
- [ ] Provider/local/worker cleanup and outside-owned invariants verified; any retained history is
      explicitly safe. Unknown outcomes remain recoverable and prevent PASS.
- [ ] Both sanitised reports exist for every attempted run, including failure and incomplete setup;
      verdict/counts/exit codes agree and source/report provenance is recorded.
- [ ] Only scoped changes are present and README status distinguishes foundation, campaign and
      production sign-off. Plan 161 charter and whole-product readiness remain separate decisions.

| Deliverable | Current status |
| --- | --- |
| Plan review/reconciliation | Updated at `92d67c5`; scoped validation recorded below |
| Guard/report/catalogue/observer foundation | Implemented at `5d2e57b`; current source identity confirmed |
| Historical source and protected database verification | Recorded PASS, source-matching; not freshly rerun |
| Current release-tool typecheck | FAIL, declared `jose` dependency unresolved in this installation |
| R1/R5-R7 harness correctness corrections | TODO, independent regression work before live admission |
| Operational execution and evidence adapters | TODO, scoped above; actual admission depends on runtime fencing |
| Diagnostic report delivery | COMPLETE, existing reports inspected; all required cases honestly NOT VERIFIED |
| Live Xero application/browser campaign | NOT VERIFIED; no live execution performed by this review |

A completed diagnostic report can have FAIL or NOT VERIFIED. That completes its reporting
obligation, not this plan's full verification objective. Keep Plan 160 IN PROGRESS while its
required implementation or campaign evidence is outstanding. Do not call the integration
verified until all applicable PASS requirements hold.

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

## Review result

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
