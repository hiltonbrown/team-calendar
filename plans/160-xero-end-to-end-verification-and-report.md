# Plan 160: Verify the complete Xero integration and publish an evidence report

> Executor: this is a test-and-report follow-up, not a production feature rewrite.
> Prepare the harness, then exercise the approved candidate using owned fixtures
> and real provider evidence. Produce the report even if setup, testing or cleanup
> fails. Never describe this planning document or a mocked test as a live test result.
> Preserve existing applicable authorisation; obtain missing authority only for
> concrete external actions. This planning request does not itself authorise real
> employee payroll changes, customer disconnection or production deployment.

## Status

- Status: TODO. No live Xero tests run for this plan.
- Priority: P1, required before declaring Xero end-to-end verified.
- Effort: L, harness completion plus provider/browser execution and reporting.
- Risk: HIGH for live payroll/credential changes; LOW for offline harness tests.
- Category: tests, correctness verification, operational reporting.
- Planned at: `246ba27`, 20 September 2026, including uncommitted Plan 159.
- Depends on: `plans/159-xero-sync-and-onboarding.md` for expected behaviour and
  the approved AU submission/approval contract. Harness preparation and baseline
  diagnostics can proceed before its implementation; a full PASS cannot.
- Related: `plans/go-live.md` owns release-wide deployment and fixture controls.
  Reuse its tools; this plan owns Xero scenario results and the final Xero report.

## Outcome and boundaries

Prove the complete chain: browser connection and Xero consent, correct shared
organisation mapping, durable jobs, employee reconciliation, leave/balance storage,
calendar and feed visibility, synchronous outbound actions, ongoing inbound
changes, token renewal, reconnect/disconnect, tenant isolation and cleanup.

Scope is Australian Payroll and the implementation selected under Plan 159.
Report NZ/UK as outside this Australian certification, not tested or implicitly
supported. Billing, email delivery, general marketing performance and non-Xero
release journeys are outside this report. Notification routing and ICS are in
scope only where they prove Xero-derived availability and isolation.

Do not silently fix application defects while measuring them. Record failures
with minimal reproducible evidence, refer fixes to Plan 159 or a separately
approved implementation task, then rerun affected cases and dependencies against
the new candidate. A new commit invalidates the previous candidate's full verdict.

## Current evidence and harness gaps

Read these files before implementation; excerpts identify the observed baseline.

| Evidence | Existing behaviour | Required improvement in test proof |
| --- | --- | --- |
| `tooling/release/e2e/admin-and-roles.spec.ts:10` | Accepts `/Sync (queued\|succeeded\|completed)/i` after clicking people sync | Require exact dispatched run, terminal job result, persisted source IDs and UI contents |
| `tooling/release/e2e/provider-snapshot-cli.ts:39` | Joins outbound operations with `op.action = 'submit'` | Support approved create-on-approval semantics and inbound-only records without assuming a submit operation |
| `tooling/release/e2e/provider-snapshot.ts:35` | Requires local and normalised remote status to be identical | Compare documented remote state to action-aware local intent; Xero rejection can represent local withdrawal |
| `tooling/release/e2e/environment.ts:71` | Compares supplied candidate SHA, manifest and local HEAD | Verify deployed revisions independently; an environment-variable assertion is insufficient |
| `tooling/release/e2e/journey-ledger.ts` | Tracks intended/returned/reconciled local create IDs | Track remote identity, uncertain outcomes and provider cleanup separately |
| `tooling/release/e2e/global.teardown.ts:7` | Asserts ledger reconciliation before attempting cleanup | Always attempt independently safe reconciliation/cleanup, then report remaining failures |
| `tooling/release/cleanup.ts:187` | Deletes scoped local rows after checking active runs | Reconcile remote leave/connections before deleting local evidence/credentials |
| `tooling/release/database-guard.ts:95` | Requires every inventoried consumer to be paused | Live E2E needs a separately verified execution mode allowing the owned jobs to run |
| `tooling/release/playwright.config.ts` | Single worker, zero retries, role setup, 90-second test timeout, retained traces/videos | Preserve mutation serialisation; allow bounded job waits and avoid recording OAuth credentials |

These are HIGH-confidence observations, not claims that production was tested.
The live manifestation remains NOT VERIFIED. Their fix effort is M/L and MED/HIGH
risk because a false positive or unsafe cleanup would undermine the whole report.

```typescript
// admin-and-roles.spec.ts, existing assertion is insufficient
await expect(page.getByRole("status")).toContainText(
  /Sync (queued|succeeded|completed)/i
);

// global.teardown.ts, current ordering blocks cleanup on ledger failure
assertJourneyLedgerReconciled();
const cleanup = spawnSync("bun", [/* cleanup.ts, manifest, --apply */]);
```

The preceding audit passed 74 existing focused unit/component tests. Do not
copy those results into this plan's final candidate report as fresh evidence.
Plan 159 is TODO at planning time; no repaired behaviour is assumed to exist.

## Scope and repository conventions

Permitted edits during later execution:

- `tooling/release/e2e/`: Xero scenarios, fixtures, provider observers, ledger,
  setup/teardown and related unit tests; reuse files created under Plan 159.
- New `tooling/release/{xero-e2e.config.ts,run-xero-e2e.ts,xero-report.ts,xero-scenarios.ts}`
  and co-located tests; exact proposed interfaces are below.
- Existing `tooling/release/{database-guard,active-run-registry,write-protected-manifest,cleanup,verify-live-target,verify-live-target-logic}`
  files/tests only for explicitly scoped Xero execution/cleanup modes.
- `packages/database/src/live-test-guard.ts` and fixture helpers only if necessary
  to consume the reviewed mode contract, with matching regression tests.
- Release tooling config/tsconfig, package scripts only if needed; no dependency
  upgrades. Existing Playwright/Vitest/Clerk tooling is already declared.
- `plans/160-xero-end-to-end-verification-and-report.md`, `plans/README.md`,
  `reports/xero-e2e/` for sanitised final reports and evidence indexes.

No application/service/schema behaviour changes belong to this plan. If actual
tenant fencing or grant-safe cleanup requires application work not yet supplied
by Plan 159, block the dependent live scenario and specify the missing contract.
Do not weaken production guards to make tests run. The advisor writes only plans/.

Use strict TypeScript, Zod, named exports, co-located Vitest tests and Australian
English. Resolve credentials server-side; tenant data reads use both Clerk and
payroll organisation IDs. The existing `created-record.ts` ownership validation
and `fixture.ts` isolated role contexts are exemplars, not substitutes for additional
foreign-account and second-entity contexts. No secrets in JSON reports or commits.

Run first:

```bash
git rev-parse HEAD
git status --short
git diff --stat 246ba27..HEAD -- tooling/release packages/xero packages/jobs packages/availability packages/database apps/app apps/api
```

Compare changed code and Plan 159's selected contract. Preserve concurrent marketing,
task and plan changes. Use an isolated `codex/xero-e2e-verification` worktree for
harness implementation. Conventional commits, no implied push/merge/deploy authority.

## Step 1: Pin the candidate, contract and fixture manifest

1. Record the exact source commit, dirty-tree status, app/API deployment IDs and
   independently observed revisions, Inngest application/environment and registered
   function revisions, database target identity and migration status. The source
   used for observers/harness must correspond to the tested implementation.
   Test definitions can be a separate recorded harness SHA when approved; record
   both and remove any accidental assumption that supplying a SHA proves deployment.
2. Confirm Plan 159's AU contract decision. Record expected local/remote state
   transitions for submit, approve, decline, withdraw and imported requested leave.
   If unresolved, report outbound cases NOT VERIFIED rather than choosing a policy.
3. Use an explicitly designated AU payroll test company, test employees, leave
   types and dates outside posted/locked pay runs. Do not assume an arbitrary
   Xero demo company supports the required payroll API. Read-only capability
   discovery must confirm the intended tenant and scopes first.
4. Extend the protected run manifest with Xero app/tenant/connection identities,
   permitted operations, maximum fixture counts, date range, source IDs, ownership
   evidence and cleanup dispositions. Record identifiers privately or by stable
   aliases in the shareable report. Credentials and refresh tokens stay in their
   existing secret stores. Never use an employee name as the ownership guard.
5. Allocate separate owned scenarios: fresh empty app entity for real initial
   OAuth/import; existing manual profile; ambiguous identity; second member;
   second payroll entity; separate Clerk account; leave actions and a feed.
   Bind every role to its expected Clerk account, person, role and entity.
   Do not preload the first-connect entity with imported people/leave and call
   the resulting journey first-use verification.
6. Record real mutation authority for the selected provider fixtures. If absent,
   finish harness/source checks and read-only diagnostics, prepare the exact
   fixture actions, and report live mutations NOT VERIFIED until authorised.
   Reuse existing authority where it actually covers the target and operations.

**Verify:** extend `environment`/manifest/ownership tests and run
`bun run test:release-tools` and `bun run typecheck:release-tools`, both exit 0.
Reject mismatched deployments, foreign IDs, missing AU contract and undisclosed
payroll targets before the first mutation. Unit fixture validation is not live proof.

## Step 2: Make the harness capable of honest live evidence

1. Add a distinct manifest mode for Xero E2E. Retain the existing all-consumers-
   paused database-fixture mode unchanged. The E2E mode lists allowed worker
   functions, owned tenant IDs, generation/run identity, prior consumer state
   and terminal drain/restore obligations. Update local/durable manifest schemas
   and equality checks together; default existing manifests to the existing mode.
   A truthful live run must allow its actual Inngest functions to execute.
2. Use a dedicated candidate/worker environment or verified tenant fencing from
   Plan 159 to confine those executions. Do not enable shared workers while
   merely labelling all consumers paused. If safe isolation is unavailable, keep
   live worker-dependent cases NOT VERIFIED and report the precise missing setup.
   Verify newly registered bootstrap/recovery functions are in the inventory.
3. Add `run-xero-e2e.ts` to acquire ownership, validate target/manifest, run setup,
   execute the scenario catalogue, reconcile cleanup, restore worker settings,
   and generate both reports in a `finally` path. Handle setup failures, child
   exit, SIGINT and recovery after process death. Store a durable run ledger so
   a killed process can resume cleanup and report rather than replay mutations.
   Bootstrap reporting before parsing the manifest, importing Playwright config
   or calling `releaseEnvironment()`: allocate a diagnostic run ID, choose a
   protected output directory and initialise all 26 scenarios/subcases as
   NOT VERIFIED. Parse CLI inside that outer failure boundary. If a verified run
   ID later becomes available, bind it explicitly without discarding diagnostics.
   Unknown candidate/environment/deployment fields remain null with reasons.
   If no writable destination exists, emit a sanitised diagnostic report to stderr
   and exit nonzero. SIGKILL cannot run finally: report generation then happens
   on recovery from durable evidence, never by inventing unobserved completion.
4. Add `xero-e2e.config.ts` with dedicated setup and Xero scenario matching. Reuse
   Plan 159's Xero specs; exclude unrelated release suites. One mutation worker,
   zero automatic retries, no `--no-deps`, and explicit per-scenario timeouts.
   A whole-test rerun must reconcile uncertain remote effects before attempting
   a second create. Browser/HTTP automatic assertions may poll read-only state.
5. Require four evidence links per live data mutation: provider identity/state,
   job or synchronous-operation outcome, scoped database rows, rendered authorised
   UI state. Capture event ID, logical import/run ID and terminal Inngest outcome
   separately. `queued`, HTTP 200 or a success toast alone never passes.
6. Replace the submit-only snapshot assumption. Observe imported records by their
   exact remote ID and expected employee/type/dates. Observe app-created records
   through the actual create operation selected by Plan 159, including uncertain
   outcomes and fingerprint-based disambiguation. Require an independent read-only
   provider observer with raw status/date/unit assertions so the same production
   mapper bug cannot make both app and oracle agree incorrectly. Reuse encryption
   and refresh safely, but keep expected state mapping independent and fixture-tested.
   If this independent observer is unavailable, affected LIVE cases are
   NOT VERIFIED; production-adapter self-validation cannot replace it.
   The LIVE lane must reject mock/local Xero base URLs, response interception and
   fabricated provider receipts. Record allowlisted endpoint origin and retrieval
   timestamp with each sanitised observation; use the actual Xero host. Do not
   include raw credentials or a full response merely to prove origin.
7. Track local intent separately from provider representation. For example, a
   successful app withdrawal may yield Xero REJECTED while local state stays
   withdrawn; prove the causal action and dates/employee instead of demanding
   string equality. Scheduled/processed/requested distinctions must be explicit.
8. Disable OAuth traces/videos and screenshots containing tokens, authorisation
   codes, cookies or connection URLs with state. Store raw browser outputs only
   in protected ignored directories, then attach sanitised evidence. Never include
   `.auth`, storageState, `.env`, raw headers or payroll payload dumps in reports.

**Verify:** `bun run test:release-tools` and `bun run typecheck:release-tools`
exit 0. Add tests for false queued success, stale candidate, missing worker run,
wrong provider ID, mapper disagreement, multiple candidates, state-intent mapping,
setup abort, report-on-failure, OAuth redaction and dead-run recovery. Existing
ordinary release guard tests must still pass without accepting unsafe targets.
Include invalid CLI, unreadable/malformed manifest, missing environment and
configuration-import failure before browser startup. Each produces a diagnostic
report with every required case accounted for and no live mutation.

## Step 3: Execute the complete scenario catalogue

Define the following stable IDs in `xero-scenarios.ts`, with required evidence
mode and prerequisites before execution. Do not delete or downgrade failing IDs.
All are mandatory for the overall contract; LIVE cases require real Xero calls
and UI, CONTROLLED cases require explicit deterministic failure/concurrency tests
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
| A: primary import/leave | X01, X04, X06–X16, X23–X25 | Keep authorised until all remote leave effects and feed evidence are reconciled |
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
  At this baseline the scheduler ticks every 15 minutes; people/leave are due
  after 15 minutes during business hours and 60 minutes outside. Derive the next
  due time from deployed configuration, tenant timezone and last success, then
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

## Step 4: Reconcile remote effects and clean up safely

1. Extend the protected ledger to persist intent before each external mutation,
   operation fingerprint, exact local/remote IDs when returned, uncertain outcome,
   verified remote state and cleanup status. Sync it durably before moving to the
   next mutation. A returned local ID is not proof that the remote action completed.
2. After normal completion or failure, stop new owned work and drain/fence queued,
   retrying and running workers, not only database rows marked running. Reconcile
   unknown outcomes by exact IDs or a unique fingerprint; never
   repeat a create merely because its response was lost. Ambiguous matches stay
   unresolved for review, with enough private evidence to recover safely.
3. Read provider final state while credentials/mappings still exist. Reverse owned
   test leave only using supported provider operations and approved fixture dates.
   Some provider/audit history may remain; record its ID alias, final non-active
   disposition and reason. Do not edit posted payroll or delete real employees.
4. Restore fixture settings and connection references without breaking other
   mappings. Never restore consumed refresh tokens. Delete only proven run-owned
   transient local resources, after remote reconciliation. Retain minimum evidence
   needed for unresolved effects; do not erase the mapping required for recovery.
5. Attempt safe independent cleanup even if another ledger entry is unresolved.
   Aggregate errors; never allow an early assertion to skip the entire teardown.
   Verify outside-owned invariants through bounded pre/post counts/digests or
   fixture-neighbour checks without exporting unrelated payroll data.
6. Restore worker state to its verified prior settings and release the active-run
   lock only after terminal disposition is durable. A failed cleanup remains
   recoverable by the same run ID and blocks a clean PASS. Emit the report anyway.

**Verify:** add teardown/ledger tests for provider success, provider rejection,
uncertain create, missing response, wrong-scope ID, partial cleanup, crash recovery
and unchanged outside-owned rows. `bun run test:release-tools` passes. Live X26
requires direct provider and local final-state evidence, not only `--assert-clean`.

## Step 5: Produce the report on every run

Implement `xero-report.ts` as a pure renderer/validator over collected evidence.
It must never execute mutations or require live credentials to render a report.
Create both:

- `reports/xero-e2e/<UTC-date>-<run-id>.md`, concise human-readable findings.
- `reports/xero-e2e/<UTC-date>-<run-id>.json`, machine-readable scenario evidence.

Private raw artefacts remain under a protected ignored run directory. The report
contains only sanitised links/hashes and stable fixture aliases. Include candidate
and harness SHAs, deployed revisions/IDs, AU contract version, target environment,
start/end times (UTC plus Brisbane), tool versions and authorised fixture scope.

### Required JSON contract

Top level: `schemaVersion`, `runId`, `candidateSha`, `harnessSha`, `deployments`,
`environment`, `contractDecision`, `startedAt`, `endedAt`, `overall`, `counts`,
`scenarios`, `defects`, `cleanup`, `limitations`, `nextActions`.
Include `diagnosticRunId` and `verifiedRunId` separately when bootstrap fails;
unverified identities are nullable with explicit reasons. Early failure must not
require a valid protected manifest merely to write a diagnostic report.

Each scenario: `id`, `name`, `requiredMode`, `observedMode`, `status`, `reason`,
`expected`, `actual`, `startedAt`, `endedAt`, `durationMs`, `attempt`, `prerequisites`,
`evidence[]` (relative sanitised artefact path, SHA-256, layer and observedAt),
`correlation` (safe run/operation/fixture aliases), `subcases[]`.

Status is exactly `PASS`, `FAIL` or `NOT VERIFIED`. A non-executed scenario has
null timing where appropriate and an explicit reason; never invent timestamps.
Required subcase statuses roll up conservatively to their parent.

- Overall FAIL if any required case or cleanup fails.
- Otherwise overall NOT VERIFIED if any required case/subcase, independent
  deployment identity, evidence layer or cleanup check is missing/unexecuted.
- PASS only if all required scenarios satisfy their declared evidence mode,
  required subcases pass, cleanup is verified, and no unresolved critical/high
  defect remains. CONTROLLED PASS is labelled separately from LIVE PASS.
- A skipped test is NOT VERIFIED, not PASS. Missing, duplicated or unknown
  scenario/subcase IDs make report validation fail while still emitting a diagnostic report.
- Do not turn a missing report into a passing process exit. Runner exits 0 only
  on overall PASS, 1 for FAIL, 2 for NOT VERIFIED or invalid/incomplete evidence.

### Human-readable report structure

```markdown
# Xero end-to-end test report

Verdict: PASS | FAIL | NOT VERIFIED
Candidate / harness / deployed revisions:
Environment, AU contract and test window:
Executed: N LIVE, N CONTROLLED; N passed, N failed, N not verified.

## Scenario results
| ID | Scenario | Evidence mode | Result | Expected versus observed | Evidence |

## Defects
| ID | Severity | Reproduction using fixture aliases | Impact | Evidence | Fix owner/plan |

## Cleanup and retained records
Provider dispositions, owned local cleanup, worker restoration, outside-owned invariants.

## Coverage limits and next actions
Unexecuted cases, missing prerequisites, targeted reruns and explicit release implication.
```

For failures provide precise reproduction, expected/observed state, affected role
and entity, impact, sanitised source/log references and whether reproducible. Do
not paste full payroll payloads, people emails, bearer URLs or authentication state.
Distinguish a test defect from an application defect and infrastructure unavailability.

**Verify:** `bun run test:release-tools` passes renderer tests for all-pass, failed,
blocked setup, missing evidence, missing scenario, duplicate ID, wrong evidence
mode, retained unsafe provider records and cleanup failure. Counts and verdict
must be reproducible from JSON. The report remains readable without earlier chat.

## Commands and ordered runbook

Existing commands below were verified from manifests/source during planning;
new runner/report commands are interfaces to implement, not already available.
Use Bun 1.4.0 and the repository-supported Node version for candidate evidence.

| Stage | Command | Success criterion |
| --- | --- | --- |
| Harness units | `bun run test:release-tools` | Exit 0, no required test skipped |
| Harness types | `bun run typecheck:release-tools` | Exit 0 |
| Repository lint | `bun run check` | Exit 0 |
| Candidate build/types | `bun run build`, then `bun run typecheck` | Both exit 0 |
| Candidate tests/boundaries | `bun run test` and `bun run boundaries` | Both exit 0 |
| CI integration | `bun run test:integration` | Exit 0 in CI's supported local guarded environment |
| Authorised live database integration | `bun run tooling/release/run-live-integration.ts --manifest <protected-db-fixture-manifest>` | Existing ownership/cleanup gates pass; not a substitute for Xero E2E |
| Xero preflight, new | `bun run tooling/release/run-xero-e2e.ts --manifest <protected-xero-manifest> --preflight` | Validate-only report; no fixture/payroll mutation; records missing prerequisites |
| Xero full run, new | `bun run tooling/release/run-xero-e2e.ts --manifest <protected-xero-manifest> --output <protected-run-directory>` | Every scenario accounted for; provider/UI evidence and cleanup; reports emitted |
| Interrupted-run recovery, new | `bun run tooling/release/run-xero-e2e.ts --manifest <protected-xero-manifest> --recover --output <same-protected-run-directory>` | Reconcile/cleanup/report only; no replay of uncertain mutations |
| Re-render, new | `bun run tooling/release/xero-report.ts --input <sanitised-run-json> --output reports/xero-e2e` | Offline validation and Markdown/JSON output; original evidence retained |
| Whitespace | `git diff --check` | Exit 0 |

The new runner internally invokes
`bunx playwright test --config tooling/release/xero-e2e.config.ts` only after
mode/target/ownership validation, then invokes reporting regardless of test exit.
Do not run that Playwright config directly to bypass the guard. Enforce its runner
context in configuration/setup, not merely in this prose. Add a discovery-only
test that validates the intended scenario inventory without live credentials.

Before the live run, consume fresh source gate evidence for the exact candidate;
rerun missing/stale gates. Database fixture and Xero E2E phases use separate
manifests/run ownership because they have different consumer-state requirements.
Do not reuse a manifest whose fixtures were deleted by the integration cleanup.
If database policy/target authority is unresolved, report that prerequisite and
continue independent source/harness verification, never bypass the guard.

Production deployments are not made by this runbook. Plan 159 implementation,
approved schema and real callback URLs must already be deployed to the sanctioned
target. Xero OAuth is disabled on ordinary Preview in this repository; prove that
restriction separately and use the authorised OAuth-capable target for X01.

## Done criteria and execution ledger

- [ ] Plan 159 contract, implementation and exact deployed candidate identified.
- [ ] Harness rejects false queued success and independently verifies all evidence layers.
- [ ] Protected mode permits only owned jobs and cleanup safely restores prior state.
- [ ] All 26 scenario IDs/subcases have an honest result with supporting evidence.
- [ ] LIVE/CONTROLLED evidence and multi-page/expiry limitations are explicit.
- [ ] Unknown external outcomes are reconciled without duplicate writes.
- [ ] Provider/local cleanup and outside-owned invariants are verified or reported failed.
- [ ] Human-readable and JSON reports generated even on setup/test/cleanup failure.
- [ ] Final response links the report and states verdict, counts and material limits.
- [ ] Index records execution complete separately from integration PASS.

The test campaign can finish with FAIL or NOT VERIFIED: reporting that result is
a completed test/report task, not a passed integration. Plan 159 fixes remain
open until their own criteria pass. Never describe this scoped report as whole-
product production readiness.

| Item | Status | Evidence |
| --- | --- | --- |
| Planning | COMPLETE | Source/harness inspected at `246ba27`; plan only |
| Independent plan review | COMPLETE | Incorporated independent provider oracle, early-failure reports, explicit subcases and protected connection/recovery cohorts |
| Harness implementation | TODO | New interfaces not yet implemented |
| Live Xero campaign | NOT VERIFIED | Not run in this planning task |
| Final execution report | PENDING | Generated by Steps 3 through 5, including failures |

## Stop conditions and maintenance

Pause only the affected live scenario on wrong target, unknown fixture ownership,
unapproved payroll operation, unresolved AU contract, missing worker isolation,
ambiguous remote create or impossible safe cleanup. Stop new mutations when a
shared-grant/tenant isolation failure is observed. Preserve evidence, perform
safe reconciliation, continue independent read-only checks and write the report.
Never increase permissions, disable guards, fake consent or mark unavailable
cases passed to meet the deadline.

When provider contracts or Plan 159 change, update the independent oracle,
scenario catalogue and report schema together. A scheduled-sync test needs a
real scheduled execution; an expiry simulation and read mock must remain labelled.
Maintain full scenario accounting when new Playwright projects or fixtures are
added, and keep all retained auth/browser material private.

## Considered and rejected

- Reusing the current queued-sync browser assertion as end-to-end success.
- Using the app's status mapper as the only oracle for Xero status correctness.
- Replaying payroll mutations automatically on flaky browser failures.
- Deleting local credentials before remote reconciliation is complete.
- Leaving all workers paused while claiming an actual background sync was tested.
- Writing a successful test report before tests have executed.

References: local Plan 159, release tooling and `plans/go-live.md`; Context7
Playwright documentation for setup dependencies, isolated storage state, retries
and reporters; [Xero AU leave contract](https://developer.xero.com/documentation/api/payrollau/leaveapplications),
[token lifecycle](https://developer.xero.com/documentation/guides/oauth2/token-types)
and [connection management](https://developer.xero.com/documentation/best-practices/managing-connections/connections).
Recheck installed SDK signatures and provider contracts when executing.
