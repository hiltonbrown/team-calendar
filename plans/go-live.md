# Ship Team Calendar's Australian release

## 1. Execution contract

- **Status**: READY FOR EXECUTION. This is not a production-readiness certificate.
- **Reviewed at**: `80ac9f7`, 19 September 2026, including the supplied working-tree plan consolidation.
- **Priority**: P0 release programme. All work below is required unless a row explicitly says paid-mode only.
- **Result**: app, API and public web run the same reviewed commit; admitted Australian customers can complete onboarding, leave approval, Xero write-back and calendar subscription; every release gate has fresh passing evidence.
- **Default**: Australian, invitation-only `early_access`. This is the existing plan's default and matches `packages/next-config/launch-mode.ts:40`. Configure it explicitly. Do not wait for another mode-selection meeting. Paid mode requires the additional billing journey in Section 9.
- **Database constraint**: retain this plan's live-Neon-only policy. No disposable database, reset, seed replacement, `db push`, rebaseline or `migrate dev`. Source-only verification never connects to any database.
- **Scope**: finish the confirmed correctness, security, performance, acquisition and operational work in this file now. NZ/UK activation and new connectors remain outside the Australian product scope.

Start implementation with D1 and C6, then take the independent work in parallel.
Provider discovery and configuration preparation start at the same time. Do not
replace a fix with another audit, a backlog entry, a signature, a revised target
date or a statement that somebody should investigate it. Each item closes only
when its specified behaviour and tests pass. A discovered defect in these flows
is fixed and regression-tested in this release, including P2 items.

Use existing session authorisation. This plan review does not itself authorise
production mutations, provider messages or payroll writes. Prepare the exact
change and verification first; obtain missing authority only for that concrete
action. Missing access pauses that action, not independent implementation.
Never simulate permission or mark unperformed work PASS.

### Working rules and bounded scope

1. Read `PRODUCT.md`, `DESIGN.md`, `.impeccable.md` and relevant tests. Keep Clerk
   Organisation plus payroll Organisation isolation; Xero owns balances and
   accruals; outbound writes are synchronous; feed URLs remain complete for
   authorised viewers. No new membership tables, payroll calculations or queued
   outbound writes.
2. Edit the paths named in each item, their direct callers, co-located tests,
   required package exports/manifests and generated additive migrations only.
   No framework overhaul, unrelated visual redesign or broad dependency update.
3. Use Zod at boundaries, `Result` for expected service failures, named exports,
   strict TypeScript and existing `@repo/*` package boundaries. New database
   queries belong in `packages/database`; provider operations in `packages/xero`.
   Follow the scoped query exemplar at `packages/database/src/tenant-query.ts:16`:
   `where: { ...scopedQuery(clerkOrgId, organisationId), id: recordId }`.
4. UI changes reuse the design system: Plus Jakarta Sans, semantic surface
   tokens, 20px containers, 16px floating surfaces, 14px controls, labelled
   statuses, keyboard focus, light/dark and recovery states. Use Australian
   English and no em dashes.
5. Preserve the existing plan deletions and unrelated changes. Use isolated
   `codex/` worktrees for concurrent source work, with coherent ownership (for
   example correctness, verification, performance and acquisition). One branch
   per checklist row is not required. Commit logical fixes conventionally,
   review focused diffs and integrate sequentially. Do not push, merge into a
   shared branch or deploy without the applicable existing authorisation.
6. At execution start compare `git diff --stat 80ac9f7..HEAD -- apps packages
   scripts tooling .github package.json bun.lock turbo.json` and the uncommitted
   diff with this plan's excerpts. Resolve ordinary drift by reading the new
   implementation and updating the affected step. Do not restart the entire
   audit or reopen independently completed fixes.
7. Track item status and evidence in Section 11. Reconcile the active execution
   section of `tasks/todo.md` without erasing history; capture user corrections
   in `tasks/lessons.md`. These executor updates are not prerequisites to fixing
   source. This review edits only `plans/` under the improve skill.

### What this review actually established

Local source was inspected at `80ac9f7`. The focused preflight/launch-mode suite
passed **23 tests in 2 files** with
`bun run --cwd packages/next-config test preflight.test.ts launch-mode.test.ts`.
Those tests currently omit the regressions specified below. The shell has Bun
1.3.14 and Node 24.21.0; the repository declares Bun 1.4.0 and a Node 22 runtime
floor. The executor must use the declared Bun version for candidate evidence.

The earlier report, `tasks/go-live-readiness-report.md`, records observations
from 18 September against older source: 12 applied migrations, zero configured
Neon drift, broken app/web builds, incomplete environment configuration and
unverified external journeys. The supplied plan also reported remote builds at
`ef0fae0`. **These are historical leads, not current provider facts.** Refresh
provider state once in O1 and immediately repair anything still wrong. This
review did not contact production, run database tests, build applications,
rotate credentials or exercise real customer journeys.

## 2. Queue, priorities and dependencies

All source findings below have HIGH confidence from direct reads. Sizes include
implementation and tests: S is hours, M about a day, L multiple days. They are
estimates, not reasons to postpone work. Risk describes the change, not permission
to leave a defect open. O1 is an execution/evidence requirement, not a claim that
production was freshly inspected.

| ID | Required result | Category | Priority | Size / risk | Dependency for completion |
| --- | --- | --- | --- | --- | --- |
| D1 | Unit runs cannot touch Neon; live suites mutate only owned fixtures | Security/tests | P0 | L / HIGH | None for implementation |
| C6 | Empty or missing manager scope cannot reveal other people's records | Security | P1 | S / LOW | D1's unit isolation before broad app test runs |
| C1 | Uncertain Xero creates cannot duplicate leave and have a usable recovery path | Correctness | P0 | L / HIGH | D1 for database proof |
| C2 | Partial Clerk provisioning retries and activation capture deduplicates | Correctness | P1 | M / MED | None; D1 if receipt persistence changes |
| C3 | Failed consumed Stripe deliveries remain visible and replayable | Correctness | P1 | L / HIGH | D1 for database proof |
| C4 | Missing email transport fails the job visibly; backlog recovers | Correctness | P1 | S / LOW | R2 for deployed configuration |
| C5 | Malformed availability JSON returns 400 without domain queries | Correctness | P2 | S / LOW | None |
| R1 | Preflight checks actual launch mode, never a substitute CLI value | Release | P1 | S / LOW | None |
| R2 | Preflight matches runtime email, monitoring and status requirements | Release | P1 | S / LOW | None |
| R3 | Sentry configuration uses its supported import | Dependencies | P2 | S / LOW | None |
| P1 | Plans returns bounded pages with batched balances/durations | Performance | P2 | M / MED | C6; coordinate edits with C1 |
| P2 | People filters and counts remain exact without loading all people | Performance | P2 | L / MED | C6 |
| P3 | Sync overview/detail returns bounded summaries; raw detail is authorised on demand | Performance/security | P2 | M / MED | None |
| P4 | Public provider import graph excludes Clerk | Performance | P2 | S / LOW | None |
| P5 | Unconfigured analytics loads no PostHog; configured first-page capture is correct | Performance | P2 | S / LOW | Coordinate event contract with G1 |
| G1 | Application, first-owner admission and activation measurement work end to end | Product | P1 | L / MED | C2, R2; O1 for provider configuration |
| G2 | Support and launch operations are exercised using current evidence | Operations | P1 | M / LOW | O1 and deployed candidate |
| G3 | Public trust pages contain no provisional identity material or obsolete launch claims | Docs/product | P2 | S / LOW | None |
| T1 | Maintained browser release suite proves roles and critical journeys | Tests | P1 | L / MED | D1; run after affected fixes |
| T2 | CI checks docs links and actual email rendering | Tooling | P2 | S / LOW | None |
| T3 | First-party Node types and actual runtime support agree | Dependencies | P2 | S / LOW | None |
| O1 | Configured providers, migrations, deployments and live journeys pass for one candidate | Release | P1 | L / HIGH | Relevant source fixes and gates |

Execution order:

- **Start now**: D1 and C6; C1/C2/C3/C4/C5, R1/R2/R3, T2/T3, G3 and provider
  discovery can progress independently. Source and mocked tests do not wait for
  live credentials, a launch date or a business sign-off.
- **Integrate behaviour**: P1/P2 after C6, P3/P4/P5, G1 and T1. Coordinate shared
  files rather than allowing parallel agents to overwrite one another.
- **Prove candidate**: database-free gates, reviewed migrations, guarded live
  integration, project preflights, exact-SHA deployment, deployed journeys,
  external security and operational closure. Apply new schema before tests that
  require it. Never run the live integration gate merely to establish a baseline
  before D1 is complete.

## 3. Make verification safe and executable

### D1: Separate unit tests from guarded live fixture tests

**Evidence**: `apps/app/package.json:10` uses unrestricted `vitest run`;
`apps/app/app/(authenticated)/people/new/_actions.integration.test.ts:26` enables
writes whenever `DATABASE_URL` exists. `packages/database/billing.integration.test.ts:40`
runs the production catalogue synchroniser. `packages/database/src/seed/seed.integration.test.ts:62`
runs fixed-ID development seeding. An acknowledgement alone cannot make these safe.
`packages/database/prisma.config.ts:6` reloads `.env`, and
`packages/database/keys.ts:10` requires a URL, so simply unsetting the URL is
neither sufficient isolation nor a working build procedure.

**Scope**: workspace test scripts/configs, existing `*.integration.test.ts`,
`packages/database/src/client.ts`, fixture and seed helpers, `.github/workflows/ci.yml`,
`turbo.json`. Create `tooling/release/` with `database-guard.ts`,
`database-guard.test.ts`, `run-live-integration.ts`, `cleanup.ts`,
`migration-check.ts`, `run-source-gates.ts` and focused tests; create
`.github/workflows/release.yml`. These are small explicit tools, not a new release platform.
Add `tooling/release/tsconfig.json` and `tooling/release/vitest.config.ts`.
Define root `test:release-tools` as
`vitest run --config tooling/release/vitest.config.ts` and
`typecheck:release-tools` as `tsc -p tooling/release/tsconfig.json --noEmit`.
These cover tooling explicitly because it is not a Turbo workspace. Exclude
browser/live suites from unit discovery and fail on zero discovered tests.

1. Exclude `*.integration.test.ts` from every unit entry point, including app.
   Give app a `test:integration` script. Inventory all six database-backed
   workspaces: app, availability, database, feeds, jobs and Xero. Assert that
   discovered integration files equal the allowlisted inventory; no silent skips.
2. Guard before a real database adapter is constructed, including direct
   `vitest path/to/integration.test.ts` invocations. Require a unique run ID,
   `ALLOW_LIVE_DATABASE_TESTS=I_ACKNOWLEDGE_LIVE_MUTATION`, a protected target
   manifest and a proven live identity. Environment presence is not permission.
   A unit-mode guard denies actual database connection attempts. Preserve lazy
   client construction needed by builds and mocked tests; test adapter/network
   denial without breaking harmless imports.
3. Obtain non-secret Neon project/branch/endpoint/database/role identifiers from
   provider metadata. Compare the endpoint and expected database/role with the
   configured connection privately, then confirm them read-only from SQL.
   Do not invent a stable server-IP fingerprint for serverless Neon. Report
   identifiers and PASS/FAIL only. Obtain current restore-point evidence before
   the first mutation. A URL alone does not prove the production branch.
4. Persist a private run manifest **before any fixture write** containing exact
   generated tenant/organisation IDs and global fixture keys. Use a dedicated
   server-only KV namespace, `release:run:<runId>`, plus an active-run registry;
   confirm a read-back before allowing mutation. Keep credentials out of the
   manifest and do not expire an unfinished run. Mirror it locally for the
   process, but never make the runner filesystem its only copy. Completed
   manifests retain an audit reference according to the private release-log
   retention policy. Prove fixture keys are absent; cleanup may never adopt or
   delete a pre-existing namespace. Apply both tenancy keys to tenant operations.
   Record intended external creates before dispatch and returned IDs immediately
   afterwards so interrupted creates can be reconciled by their correlation ID.
5. Refactor billing/seed tests explicitly: do not invoke the current
   `syncPlansFromCatalogue` or fixed-ID `seedDevelopmentData` against production.
   Test their production catalogue semantics with mocks; retain database
   constraint/idempotency coverage using injected per-run IDs and catalogue
   keys. Snapshot a non-secret digest of existing production plan/limit values
   and require it unchanged after tests. Include Stripe receipts and other
   global rows in the exact-key manifest.
   Keep synthetic fixtures invisible to deployed workers: use transaction-bound
   injected clients and rollback for suites that can operate in one transaction.
   Multi-connection/concurrency suites that need committed fixtures run in a
   bounded, authorised live-test window with all affected production consumers
   paused and in-flight work drained first. Inventory the actual registry in
   `packages/jobs/src/functions.ts`, including scheduler/token maintenance,
   notification drain, feed and usage consumers. Persist their original pause
   states in the durable manifest and restore exactly those states after cleanup.
   The runner fails before writes unless isolation or the verified pause window
   is established; local provider mocks do not isolate production processes.
   Test global scheduling queries with a fixture-scoped injected client so they
   cannot update or dispatch events for customer tenants. No synthetic database
   integration test may pause arbitrary customer Xero connections or issue real
   payroll/email calls.
   On interruption, alert the release owner, recover the durable manifest,
   clean/reconcile fixtures, then resume only the consumers paused by this run.
   Deployed worker journeys use sanctioned real test resources after synthetic
   suites are cleaned and consumers resumed. Prove zero production events or
   deliveries originated from synthetic fixtures.
6. Implement cleanup in FK order using only manifest-owned IDs. The tool defaults
   to dry-run counts; `--apply` requires the same guard and identity proof.
   Repeated cleanup is harmless; a foreign ID, missing manifest, active run or
   unexpected count fails before deletion. Run cleanup in hooks and a CI
   `always()` step, and detect interrupted runs at next startup. A killed host
   may execute neither hooks nor `finally`, so retain the manifest for recovery.
   Quarantine the affected run until its exact resources are reconciled; never
   use a broad age-based deletion across tenants.
7. Ordinary PR CI uses a clean checkout without `.env*` secrets and supplies
   schema-valid **non-secret build placeholders** where env validation requires
   them. Deny database network access, including TCP and Neon WebSocket/HTTP.
   Do not weaken production validation or copy live secrets into PR jobs.
   Add `run-source-gates.ts` to enforce this environment and catch accidental
   env-file loading. Remove the disposable Postgres service under the retained
   live-only constraint. Placeholder values never identify an actual test database.
8. Run live integration only from a protected workflow for a reviewed candidate
   SHA, with trusted workflow code, scoped secrets and one active run at a time.
   Use GitHub environment controls where available. Exclude untrusted PR code.
   Do not create a second approval if the same action is already authorised.
9. Migration-file checks compare immutable existing migration bytes against the
   trusted base commit, ordered new directories and the schema diff. Check live
   applied checksums separately against `_prisma_migrations`. Neither regex
   checks nor `prisma validate` prove SQL execution, lock safety or fresh-chain
   construction. Review those explicitly in Section 8.

**Tool interfaces to implement and test** (paths above are new, not existing commands):

```bash
bun run tooling/release/run-source-gates.ts
bun run tooling/release/migration-check.ts --base 80ac9f7
bun run tooling/release/run-live-integration.ts --manifest "$TC_RELEASE_MANIFEST"
bun run tooling/release/cleanup.ts --manifest "$TC_RELEASE_MANIFEST" --dry-run
bun run tooling/release/cleanup.ts --manifest "$TC_RELEASE_MANIFEST" --apply
bun run tooling/release/cleanup.ts --manifest "$TC_RELEASE_MANIFEST" --assert-clean
```

The live runner validates authority/identity, starts the inventory, then invokes
`bun run test:integration`. It propagates failure, captures counts per workspace
and attempts cleanup on success or failure. The manifest path is supplied by the
protected workflow and is never committed. Missing acknowledgement, mismatched
identity, missing restore evidence, reused namespace, tampered manifest, direct
unguarded invocation and unowned cleanup all exit nonzero **before a write**.
Mock these denial cases in `database-guard.test.ts`; never test wrong-target
protection by connecting to a different database.

**Verify**: `bun run test:release-tools` and `bun run typecheck:release-tools`
pass the new unit tests/types and are required in ordinary CI and the source
wrapper. Test crash recovery from a fresh process using only the durable KV
manifest, including exact cleanup and worker-state restoration;
`bun run tooling/release/run-source-gates.ts` passes with zero database connections;
the first authorised focused live suite and then the full six-workspace suite
pass with zero removable fixture residue and unchanged production catalogue.
Historical test counts are not a substitute for the current discovered inventory.

### T2/T3: Finish ordinary CI and runtime alignment

**Scope/evidence**: `.github/workflows/ci.yml` omits docs/email gates;
`package.json:7` excludes email from root build; `apps/docs/package.json:6`
already provides `mint broken-links`; `apps/email/package.json` provides build
and export. Node 26 types occur in the three apps and several shared packages,
while root `package.json` declares Node 22 support.

- Add docs lint, email build and an email export/render assertion to CI. Assert
  nonempty rendered notification markup, working links and no unresolved template
  values. Do not label a preview-server build as email delivery proof.
- Align **every first-party** `@types/node` declaration with the Node 22 floor,
  update `bun.lock`, and pin/use Bun 1.4.0. Run source gates on Node 22 and the
  selected production Node version if different. Record Vercel's actual runtime;
  do not raise the minimum engine as a shortcut around a type error.
- Keep build before typecheck so `.next/types` route validators are generated.
  Keep lint, types and boundaries separate. Root `check` is lint only.

**Verify**: `bun run --cwd apps/docs lint`,
`bun run --cwd apps/email build`, `bun run --cwd apps/email export` and the
render assertion all exit 0. Inventory with
`rg -n '"@types/node"' package.json apps/*/package.json packages/*/package.json`:
all first-party versions target the supported floor. Final source gate commands
are in Section 8; no blanket dependency upgrade belongs here.

## 4. Close security and correctness defects

### C6: Fail closed on empty manager scope

**Evidence/excerpts**: `packages/availability/src/plans/plan-service.ts:276`
computes `scopedPersonIds` and passes it as `personId`; at `:895` the predicate is
`filters.personId?.length ? { person_id: { in: filters.personId } } : {}`.
An empty allowed set becomes no restriction. The manager Team tab calls this
service at `apps/app/app/(authenticated)/plans/page.tsx:116`.
`packages/availability/src/people/people-service.ts:285` similarly uses
`role === "manager" && actingPersonId ? ... : null`; the People page passes an
optional linked person ID, allowing a missing manager identity to lose scope.

**Scope**: these two services, `packages/availability/src/settings/manager-scope.ts`,
their tests, and Plans/People page tests.

1. Keep authorisation scope separate from user filters: `null` may represent an
   authorised unrestricted administrator; `[]` means zero authorised people.
   Return an empty page before record loading for an empty allowed intersection.
   Never let search filters broaden the permitted person set.
2. A manager with no linked acting person receives the existing not-authorised
   result or an explicit empty state, never an organisation-wide query. Preserve
   current self/team membership semantics for valid managers.
3. Add regressions for no reports, only unrelated requested IDs, mixed allowed
   and forbidden IDs, missing acting person, normal manager access, owner/admin
   access, and both Clerk and payroll Organisation isolation.

**Verify**:
`bun run --cwd packages/availability test src/plans/plan-service.test.ts src/people/people-service.test.ts src/settings/manager-scope.test.ts`
and `bun run --cwd apps/app test 'app/(authenticated)/plans' 'app/(authenticated)/people'`
pass, including assertions that denied/empty scopes make no unrestricted record
query. Run the broad app command only after D1 excludes integration files and
denies database access; C6 source work and mocked service tests can start now.
Add this scenario to the deployed manager test in T1.

### C1: Persist uncertainty and complete Xero recovery

**Evidence/excerpt**: `packages/availability/src/plans/submit-service.ts:362`
releases `claimedAt` after a thrown submit, and `:430` does so after local commit
failure. `packages/availability/src/xero-write-claim.ts:9` defines a five-minute
lease. Neither proves the remote create failed. `packages/xero/src/au/write.ts:65`
can return an error after a response with no ID. The approval reconciler at
`packages/jobs/src/handlers/reconcile-xero-approval-state.ts:271` excludes records
without `source_remote_id`.

**Scope**: those files, `packages/xero/src/write/types.ts`, the write adapter,
`packages/core/src/ports/external-write-port.ts`,
`packages/availability/src/plans/plan-service.ts`,
`packages/availability/src/approvals/approval-service.ts`,
`packages/jobs/src/handlers/sync-xero-leave-records.ts`,
Prisma schema/migration, a new scoped repository
`packages/database/src/queries/outbound-operations.ts` and its tests, a new
`packages/availability/src/plans/submit-recovery-service.ts`, and protected Plans
recovery actions/UI. Keep provider-neutral certainty types in the core port.

1. Persist a submit operation and immutable request fingerprint **before** the
   network call. Store both tenancy IDs, record ID, actor, timestamps, safe
   status/error code and known remote ID. Choose a database-enforced single
   nonterminal operation per record/action. A simple one-row-per-record/action
   current-operation table with conditional state transitions is sufficient;
   retain history in existing audit events. Do not build a general workflow engine.
2. Distinguish `prepared`, `outcome_unknown`, `provider_accepted`, `completed`
   and `definitive_failure`. Mark the potentially sent state durably before
   network dispatch so process death remains safe. Only proven pre-send failure
   or definitive rejection unlocks another create. Timeout, connection loss,
   provider 5xx, malformed success and local persistence failure remain unresolved.
   Preserve the underlying Xero error taxonomy and add certainty separately.
3. A lease releases a worker, not the unresolved operation. Retry, revert, edit,
   archive/delete, approval and inbound mutation paths must respect the durable
   guard after five minutes and after process restart. Replace the old tests
   that expect thrown calls or lease expiry alone to permit another submit.
4. Persist a returned remote ID before finalisation where possible. Finalise the
   record/operation/audit atomically; publication and notification recovery must
   be idempotent. A persistence failure retains uncertainty, not a new create.
5. Deliver recovery, including records without a remote ID. Known provider-returned
   IDs can be verified and finalised without re-creating leave. Unknown outcomes
   show an admin/owner a bounded candidate lookup and an audited attach action:
   verify tenant, employee, dates and leave type; record actor and reason. A
   candidate found by matching fields or set difference is not proof of origin.
   Never auto-attach a pre-existing match or infer absence from an incomplete
   read. AU reads can report `ok:true, complete:false`; do not put an unbounded
   whole-payroll scan before every synchronous submit.
6. Keep unknown submissions blocked until the remote outcome is established.
   Provide a definitive-not-created resolution only with independently verified
   provider evidence and an audit reason. An age threshold or empty search is
   insufficient. Employees see a clear pending-resolution message and existing
   data remains visible; only authorised staff see investigation detail.
7. Handle inbound sync arriving first. Its current create branch can make a
   second canonical record for the same remote leave. Resolution must reconcile
   that imported row without losing local privacy, stable UID or publication
   sequence, leaving one active canonical representation and no duplicate event.
   Do not delete audit history or silently attach ambiguous records.

**Tests**: concurrent double submit produces one create; timeout then retry past
lease expiry produces none; process death/local commit failure is recoverable;
definitive rejection permits retry; incomplete/old/multiple matches never
silently attach; inbound sync racing resolution yields one event; foreign tenant
and non-admin recovery fail. Add recovery service and guarded database tests.

**Verify**:

```bash
bun run --cwd packages/availability test src/plans/submit-service.test.ts src/plans/submit-recovery-service.test.ts src/plans/plan-service.test.ts src/xero-write-claim.test.ts
bun run --cwd packages/xero test src/au/write.test.ts src/au/read.test.ts src/adapter/xero-write-adapter.test.ts
bun run --cwd packages/jobs test src/handlers/sync-xero-leave-records.test.ts src/handlers/reconcile-xero-approval-state.test.ts
```

All pass; D1's live runner then proves the database concurrency invariant after
migration. T1/O1 must resolve every controlled remote operation to a known final
state. Synchronous user-triggered outbound writes remain the product contract.

### C2: Retry incomplete Clerk membership provisioning

**Scope/evidence**: `apps/api/app/webhooks/auth/route.ts:197-213` captures before
provisioning and returns 201; `:251-280` logs unsuccessful Results and discards
them. Use its verified Svix delivery identity at `:297`, existing
`route.test.ts` fixtures and `packages/availability/src/people/current-user-service.ts`.

- Aggregate provisioning outcomes across all active payroll Organisations.
  Return sanitised 503 for any failure; replay leaves successful links intact
  and repairs remaining links. Keep signature validation and org scoping.
- Capture successful membership activation only after all links succeed and
  deduplicate by verified delivery identity, using a durable receipt or the
  analytics provider's supported idempotency identifier. Moving capture after
  success alone does not deduplicate successful replays. Do not persist raw
  webhook bodies. A receipt must not mark partially completed work successful.
- Test all-success, all-failure, partial-failure and failure -> success -> success
  replay: one link per person and one delivered activation event. Keep invalid
  signatures rejected before any provisioning or analytics.

**Verify**: `bun run --cwd apps/api test app/webhooks/auth/route.test.ts` and
`bun run --cwd packages/availability test src/people/current-user-service.test.ts`
pass. If a receipt table is added, include its guarded isolation/idempotency test
in D1. Test analytics dedup at the delivered event boundary, not just mock calls.

### C3: Make billing repairable without swallowing events

**Evidence**: `apps/api/app/webhooks/payments/route.ts:58-72,160-200` returns
`{ ok: true }` for invalid consumed data. `:259` records it. The predicate at
`packages/database/src/queries/billing.ts:210` treats **any** receipt as processed;
`StripeEvent` at `packages/database/prisma/schema.prisma:1144` lacks failure state.

**Scope**: payment route/tests, `packages/billing/src/stripe.ts`, database billing
queries/schema, `packages/auth/entitlements.ts` and tests, billing settings status,
and new protected replay tooling `tooling/release/replay-stripe-event.ts`.

1. Add delivery state (`failed`, `processed`, `ignored`), attempt count, safe
   error category and timestamps; completion time is nullable until completed.
   Preserve completed meaning of existing receipts through an additive migration.
   Change `isStripeEventProcessed` to exclude failed receipts.
2. Use an explicit decision table: subscription created/updated/deleted require
   valid shape, matching tenant/customer and mapped catalogue price. Applied or
   explicitly stale mirrors may complete. Unsupported event types are `ignored`.
   Invoice/checkout events carrying a subscription ID retrieve its authoritative
   snapshot through `@repo/billing`; valid one-off invoices with no subscription
   are intentionally ignored. Verify the configured Stripe API-version shape
   before changing schemas; do not treat valid unexpanded IDs as corrupt events.
3. Missing configuration, failed provider fetch or invalid consumed data records
   a failed receipt and returns a sanitised retryable 5xx. Surface failed/unmatched
   IDs and safe categories in the operator view/alert, without raw payloads.
   Throttle repeated alerts by event ID; never silently declare poison events
   processed just to stop retries.
4. Implement replay by exact event ID through authenticated server-side provider
   retrieval, then the same processing function. The tool requires operator
   credentials and validates current customer/tenant binding. No public replay
   endpoint or unsigned caller-supplied event body. Repairs followed by replay
   must finish the mirror and receipt once.
5. Choose a concrete entitlement policy: in paid mode, a known tenant with a
   newer unresolved consumed billing event uses the existing Basic fallback in
   `activePlanKey` until repaired, denying paid-only authorisation from stale
   mirror data. Keep existing data readable and show a billing-sync
   recovery state. No automatic destructive cancellation. Early access retains
   its existing access rules. Clear unhealthy state only after authoritative
   recovery covers the newest unresolved event; stale replay cannot clear it.
   Put the health state/query and entitlement tests in this change, not a future plan.
6. Preserve newer-wins ordering, duplicate idempotency and foreign-customer
   rejection. Replace existing tests that expect unknown price/missing metadata
   to return 200 and create a completed receipt.

**Verify**: `bun run --cwd apps/api test app/webhooks/payments/route.test.ts`,
`bun run --cwd packages/billing test`, `bun run --cwd packages/auth test entitlements.test.ts`
and new replay/receipt tests pass. Guarded integration proves failed -> repaired
-> processed -> duplicate no-op and older-event rejection. Source repair is
mandatory in early access too; real paid checkout is only required for paid mode.

### C4: Make email failure retry and recovery real

**Scope/evidence**: `packages/notifications/src/email-queue-service.ts:123-128`
leaves the oldest selected rows unchanged when transport is absent.
`packages/jobs/src/handlers/send-notification-emails.ts:12-15` returns a failed
Result without rejecting the Inngest step. `packages/email/index.ts:39` requires
both token and sender.

- Validate token and sender availability before selecting any queue row; return
  one sanitised configuration failure. Have the Inngest wrapper throw a safe
  error on failed Result so the job actually fails and retries.
- Keep queued messages intact during configuration failure. Preserve row-ID
  provider idempotency, per-message attempt increments and the existing fifth
  failure terminal state. Test recovery processes the backlog and later rows.
- Add `packages/jobs/src/handlers/send-notification-emails.test.ts`, using the
  existing handler-test patterns, and extend queue service tests. Preserve
  recipient preferences and avoid recipient/body data in logs.

**Verify**: `bun run --cwd packages/notifications test src/email-queue-service.test.ts`
and `bun run --cwd packages/jobs test src/handlers/send-notification-emails.test.ts`
pass. Missing transport makes zero queue queries; the handler rejects; restored
transport delivers the controlled message in O1. R2 fixes the configuration gate.

### C5: Return client errors for invalid JSON

**Scope/evidence**: `apps/api/app/api/availability/route.ts:52` (POST) and
`apps/api/app/api/availability/[recordId]/route.ts:231` (DELETE) parse inside a
broad 500 handler. Reuse PATCH's local parse catch at `:79-90`:
`{ ok: false, error: { code: "invalid", message: "Malformed JSON request body" } }`.

Add tests in `apps/api/__tests__/availability-routes.test.ts`: authenticated
malformed POST/DELETE return 400 with zero organisation/person queries or domain
mutations; unauthenticated malformed requests still return 401; valid behaviour
is unchanged. **Verify**:
`bun run --cwd apps/api test __tests__/availability-routes.test.ts` passes.

## 5. Make preflight reflect production reality

### R1/R2/R3: Correct mode, email and monitoring checks

**Scope/evidence**: `packages/next-config/preflight.ts:39` uses
`explicitMode || envVars.NEXT_PUBLIC_LAUNCH_MODE?.trim()`; its API email gate at
`:143` accepts `RESEND_API_KEY`, which `packages/email/keys.ts:9` never reads,
and does not require `RESEND_FROM`. Update `preflight.ts`, `preflight.test.ts`,
`bin/preflight.ts`, README environment commands and relevant env examples.
The Sentry import is in **`packages/observability/next-config.ts:2`**, not
`packages/next-config/index.ts`. Better Stack validation already exists in
`packages/observability/keys.ts:36`; reuse its contract.

1. Require actual `NEXT_PUBLIC_LAUNCH_MODE` from the inspected project
   environment. Keep an optional CLI mode only as an assertion. Absent, invalid
   or conflicting actual values fail even if the CLI says `early_access`.
2. Require API `RESEND_TOKEN` with the runtime format and valid `RESEND_FROM`.
   Reject API_KEY-only configuration unless the same alias is deliberately
   added to runtime and tests. Prefer the existing documented token name.
3. Validate Better Stack's key/page-ID/public-URL group as all absent or all
   complete; configured URL must be HTTPS. All absent is an explicit disabled
   status integration, not a healthy public status claim. Complete the real
   service configuration in O1 where status is advertised.
4. Check Sentry release upload configuration by variable names for each project's
   build environment; require its organisation/project and upload credentials
   or verified provider-managed equivalent. A DSN or token-presence check alone
   is not source-map evidence. Keep DSN, KV, Clerk webhook, Inngest and mode-based
   Stripe checks. For G1 include the API's private application-mail recipient.
5. Switch `withSentryConfig` to `@sentry/nextjs/config` in observability and retain
   current tunnel, source-map, transpilation and monitoring options. Confirm the
   installed SDK export before editing; do not upgrade the SDK merely for this.
6. Extend tests for absent/empty/mismatched mode, API_KEY-only transport, absent
   sender, invalid formats, partial Better Stack, incomplete upload configuration
   and secret-free errors. Refresh the README to run against pulled project
   environments without overriding actual launch mode.

**Verify**: `bun run --cwd packages/next-config test preflight.test.ts launch-mode.test.ts`
and `bun run --cwd packages/observability test keys.test.ts` pass. After loading
one project's production environment securely, run `bun run preflight app`,
`bun run preflight api` or `bun run preflight web` for that project: exit 0 with
mode `early_access` and variable names/status only. Do not run all three against
one merged environment. Production builds emit no deprecated Sentry-config import
warning; O1 proves an uploaded, correctly symbolicated controlled event.

## 6. Bound the product's data and browser work

### P1: Page Plans and batch page hydration

**Scope/evidence**: `packages/availability/src/plans/plan-service.ts:885` fetches
all IDs without `take`, `:921` re-reads every record and `:961` fetches a balance
per record. `apps/app/app/(authenticated)/plans/page.tsx:146` calculates durations
per item. Edit those files, Plans `_schemas.ts`/client/actions/tests, and scoped
batch queries in `packages/database`. Reuse
`packages/availability/src/duration/working-days.ts` reference-data helpers.

- Return `{ items, nextCursor, totalCount, window }`, default 50/max 200 items,
  with stable `(starts_at, created_at, id)` keyset order. Use a displayed default
  window of the previous 90 days through the next 365 days; provide date controls
  and explicit all-history pagination. Include overlapping records. Counts and
  empty-state copy describe the selected window; historical records remain reachable.
- Load the page with its required person fields once; batch latest balances for
  the page's person/type pairs. Load organisation, locations and applicable
  holiday reference data once per distinct year and compute durations with
  `computeWorkingDaysFromReferenceData`. Preserve per-record duration failures.
- Apply the same C6 authorisation predicate to page and count queries. Keep
  editable actions, filters, deep-linked records and modal navigation working.
- Test equal timestamps, deleted cursor row, page changes, all-history access,
  overlapping dates, manager scope and missing balance/holiday data. At 1, 50
  and 200 rows for the same reference years, data-query count must be constant
  apart from explicitly documented fixed reference queries, never per record.

**Verify**: `bun run --cwd packages/availability test src/plans/plan-service.test.ts src/duration/working-days.test.ts`
and `bun run --cwd apps/app test 'app/(authenticated)/plans'` pass. Guarded fixture
measurement records query count, rows and duration on the same input before/after;
page payload is at most the requested size and all pages reproduce expected IDs.

### P2: Filter People in the database without changing status meaning

**Scope/evidence**: `packages/availability/src/people/people-service.ts:299-311`
omits pagination for derived filters, then maps/slices every person. Use this
service, `current-status.ts` and tests, People `_schemas.ts`/client/tests, and a
new scoped query helper in `packages/database/src/queries/people.ts` if required.

- Push `xeroSyncFailedOnly` into a scoped relation predicate. For derived status,
  compile scoped `some`/`none` record predicates from one fixed `at` instant and
  the current precedence: approved leave, submitted leave, applicable public
  holiday, `LOCAL_PRIORITY`, available. Every lower priority excludes higher ones.
- Compute holiday applicability once per scoped location plus null/default
  location using the existing local-date and `holidayIsNonWorking` rules.
  Preserve CUSTOM overrides, working-day overrides and organisation fallback.
  Use location predicates for holiday membership; do not fetch all people to
  decide whether they match.
- Use identical predicates for exact count and page, stable value-based
  `(last_name, first_name, id)` cursors, default 50/max 200. Hydrate current status
  only for the bounded page. C6 governs missing manager identity and empty scope.
- Test every status key and precedence collision against `current-status.ts` as
  the oracle, local midnight/DST, null location, archives, holiday overrides,
  equal names, deleted cursor, concurrent inserts and manager visibility.
  No background status projection job or capped-candidate approximation is needed.

**Verify**: `bun run --cwd packages/availability test src/people/people-service.test.ts src/people/current-status.test.ts`
and `bun run --cwd apps/app test 'app/(authenticated)/people'` pass. Tests assert
`take <= pageSize + 1`, exact filtered totals and no application-wide candidate
scan. Guarded integration compares returned IDs/counts against the fixture oracle.

### P3: Bound both sync detail and its overview

**Scope/evidence**: `packages/availability/src/sync/sync-monitor-service.ts:421-460`
loads all failures and timeline payloads into detail. Its overview at `:225-251`
also loads 30 days of runs/failures, including raw rows. One tenant per
Organisation bounds tenant count, not run or failure count. Edit that service,
scoped database queries, and `apps/app/app/(authenticated)/sync/` actions, overview,
run-detail client and tests.

- Detail returns failure summaries and timeline pages (50 default/200 max) using
  `(created_at,id)` cursors and selected safe fields, with explicit next cursors.
  No `rawPayload` or arbitrary audit payload in initial props or ordinary pages.
- Load a single redacted raw failure only on explicit admin/owner expansion,
  verifying both tenancy IDs and run/failure relationship server-side, and audit
  that access. Reuse existing secret scrubbers; apply them before serialisation.
- Replace overview full-row loading with aggregate counts and bounded latest
  runs per registered type. Preserve pending-failure-since-latest-success
  semantics. CSV uses explicit bounded pages/streaming and safe columns rather
  than silently exporting only the displayed page.
- Test foreign IDs, viewer/manager denial, raw detail redaction, stable paging,
  large histories and overview counts after a later successful run.

**Verify**: `bun run --cwd packages/availability test src/sync/sync-monitor-service.test.ts`
and `bun run --cwd apps/app test 'app/(authenticated)/sync'` pass. Large mocked
histories yield bounded queries/payloads; guarded fixtures prove aggregate parity.

### P4/P5: Remove unnecessary public client code

**Evidence/scope**: `packages/design-system/index.tsx:1` statically imports
`AuthProvider` even when `apps/web/app/layout.tsx:24` passes `auth={false}`.
`packages/analytics/instrumentation-client.ts:1` statically imports PostHog before
checking keys. Edit these entry points, their direct consumers, package exports,
`apps/web/package.json` and add provider/analytics tests.

- Create `packages/design-system/providers/public.tsx` containing shared
  theme/tooltip/toast composition with no auth import. Compose it with auth in
  the existing authenticated provider. Point web directly to the public entry.
  Remove web's Clerk dependency only after confirming no remaining runtime use.
- Check the public analytics configuration before dynamic PostHog import; use a
  single initialisation promise. Schedule after hydration/idle with a fallback.
  Preserve initial URL/referrer even if navigation happens before load, emit the
  initial page view once, then track subsequent navigation once. Avoid default
  autocapture plus manual duplicate pageviews. A rejected import must not break UI.
- Test no-config means no import/network, repeat initialisation, fast navigation,
  identity/group association and load failure. Capture public route chunk reports
  before/after using `bun run --cwd apps/web analyze`; compare identical build
  settings. Clerk must be absent from the public reachable client graph and
  PostHog from the initial unconfigured graph. Verify initial compressed route
  JS does not increase from these changes; investigate any increase, do not
  invent a percentage saving without a measured baseline.

**Verify**: focused new provider/analytics tests, `bun run --cwd apps/web test`,
the analyser output and public T1 smoke pass; authenticated sign-in, theme and
toasts still work. Source grep alone is not bundle evidence.

## 7. Complete access, activation and customer-facing truth

### G1: Deliver application through first-owner admission

**Evidence**: early-access default is already defined in launch-mode config;
`apps/web/src/data/support.ts:5` is a mailto enquiry. The unrestricted source
sign-up page is `apps/app/app/(unauthenticated)/(auth)/sign-up/[[...sign-up]]/page.tsx`.
`apps/app/app/actions/settings/invite-member.ts:36` invites into the caller's
**existing** Clerk Organisation, so it cannot admit the owner of a new customer.

**Scope**: web contact form and primary CTA data/components, API application
route and tests (create `apps/api/app/api/early-access/route.ts`), API/web env
contracts, shared email sender and a private application email template,
`packages/auth/components/choose-organization-task.tsx`,
`apps/app/app/(unauthenticated)/(auth)/session-tasks/choose-organization/page.tsx`,
existing sign-up/onboarding,
analytics catalogue and success capture points, and relevant docs. No new CRM,
custom membership table, public GitHub issue or Neon applicant store.

1. Add a validated AU application form on `/contact`. Collect email, company
   size, country, Xero Payroll use, calendar client, current process and acquisition
   source; constrain free-text length and reject payroll/leave attachments.
   Primary acquisition CTAs lead here; admitted-user sign-in remains accessible.
2. POST to the API using explicit web-origin CORS/Origin handling, JSON content
   checks, Zod and KV-backed IP/email limits. Use bounded HMAC-derived keys, not
   raw email/IP in KV logs. Origin is not a replacement for abuse controls.
   Use an idempotency key and short-lived delivery receipt to suppress retries.
   Send to an explicit private admission mailbox through Resend, returning a
   reference only after accepted delivery. No secrets or applicant details in
   logs/analytics. Show a useful retry state on failure.
3. State purpose and retention before submission. Default to removing rejected
   or inactive application correspondence after 90 days, and record the actual
   mailbox retention rule/access list. Admission staff use the existing support
   hours (Monday-Friday, 9 am-5 pm AEST) and acknowledge within two business days.
   Do not block source work on a new SLA meeting.
4. Configure Clerk invitation-only access and verify direct sign-up cannot
   bypass admission. A platform-authorised operator issues an **application/user
   invitation** to the new owner; that user follows the existing organisation
   creation flow and provisions their own customer account. Verify the configured
   creator role is `org:owner`. Subsequent team members use `inviteMember` in that
   customer Organisation. Never invite a new customer into the operator's account.
   Verify expired/revoked invitations, existing-user sign-in and direct
   `/session-tasks/choose-organization` access. Use current Clerk Context7 docs
   before configuration: [access modes](https://clerk.com/docs/guides/secure/restricting-access#invite-only)
   and [application invitations](https://clerk.com/docs/guides/users/inviting).
5. Implement a small versioned event catalogue in `packages/analytics` for
   accepted application, successful sign-up/admission, organisation provisioning,
   Xero connection, initial successful sync, first active feed access and first
   successful submit/approval. Define event IDs and capture after the actual
   durable result, not button click or queue acceptance. Deduplicate provider
   retries; use tenant-safe pseudonymous identifiers, no leave data or feed URLs.
   Create `packages/analytics/activation-events.ts` and its test with explicit
   names: `Application Accepted`, `Customer Admitted`, `Organisation Provisioned`,
   `Xero Connected`, `Initial Sync Completed`, `First Feed Accessed`,
   `First Leave Submitted`, `First Leave Approved`. Keep version 1 and a property
   allowlist in that module. Receipt reference, verified delivery ID, connection
   ID or tenant-scoped milestone ID supplies the stable dedup key as appropriate;
   a retry never generates a new event identity.
   Connect the dashboard to these events and failed sync/write/delivery counts.
   Match any existing privacy/consent requirements; P5 must preserve attribution.

**Tests/verify**: API route tests for accepted/invalid/duplicate/rate-limited/
wrong-origin/provider-failed submissions; contact keyboard/error/success tests;
analytics event schema/idempotency tests; T1 uninvited denial and admitted-owner
onboarding. Run `bun run --cwd apps/api test app/api/early-access/route.test.ts`,
`bun run --cwd apps/web test app/contact`, and `bun run --cwd packages/analytics test`.
Production proof is one controlled application
received privately, one separately admitted owner in their own Organisation,
provisioned people and exactly one event at each successful activation milestone.

### G2/G3: Remove artificial launch prerequisites and provisional trust content

**Scope/evidence**: support hours already exist at `apps/web/src/data/support.ts:25`;
`apps/web/app/about/page.tsx:122-183` has illustrative identity and preview labels;
`PRODUCT.md:26` retains the deprecated Register section. Edit these public
surfaces and directly affected tests/docs, not the wider brand design.

- Remove the anonymous illustrative founder/cat identity sections and preview
  biography/profile labels unless authentic approved assets are already available.
  Keep factual product/founder statements supported by existing material; do not
  wait for a photo shoot or invent testimonials. Test absence of provisional copy.
- Remove obsolete registration/launch claims and reconcile Australian scope,
  invitation-led access, payroll operations and calendar refresh limitations
  across public CTAs, pricing, security/help pages and product docs.
- Replace the obsolete 14 September launch date with **the date the verified
  candidate is actually released**. A promised date or signature does not make
  the product ready and is not a prerequisite to implementation.
- Supersede the three-reference-customer marketing gate for this controlled
  early-access release with the complete controlled customer journey in T1/O1.
  No customer-count claim is published without evidence. This removes a sales
  dependency; it does not waive a product, security or payroll test.
- Exercise the configured support channel with a controlled issue, confirm
  delivery and owner response inside the published target, and run the rollback
  procedure in Section 9. Assign the executing operator until a named handover
  is accepted; do not wait for a committee or invent additional staff.

**Verify**: `bun run --cwd apps/web test app/about app/contact app/pricing app/integrations`
passes; public browser checks find no preview identity or obsolete date/region
claim. Record support receipt/response timestamps and actual rollback evidence.

## 8. Verify and deploy one candidate

### A. Run database-free candidate gates

Use D1's clean environment wrapper and the declared Bun version. These commands
already exist except the wrapper/new tests explicitly identified above. Run from
repository root; record SHA, exit status, count, duration and whether a result
was executed or restored from cache. Set `TURBO_FORCE=true` for the final fresh
run. Source checks must not have live provider credentials or database access.

```bash
bun install --frozen-lockfile
bun run --cwd packages/database build
bun run check
bun run build
bun run typecheck
bun run boundaries
bun run test
bun run test:release-tools
bun run typecheck:release-tools
bun run --cwd apps/docs lint
bun run --cwd apps/email build
bun run --cwd apps/email export
git diff --check
```

Expected: every command exits 0, no source/lockfile drift from frozen install,
route types are checked, all discovered unit tests run, all render assertions
pass and no database connection occurs. After source edits the executor may use
`bun run fix` for relevant formatting, review its diff and rerun affected checks.
This advisor review did not run a formatter or these broad application gates.

### B. Generate and apply additive migrations without an empty database

1. Generate each schema change from the prior reviewed schema and new schema
   using **schema-to-schema** `prisma migrate diff --from-schema ... --to-schema
   ... --script`. Save the generated output as the next migration directory;
   do not hand-edit generated/applied migration files. This uses no shadow
   database. If the required constraint cannot be represented/generated under
   this policy, choose an equivalent representable constraint, not a reset.
2. Prisma generation recipe, from `packages/database`, after setting
   `TC_SCHEMA_BASE` to the commit immediately preceding this logical schema change
   and `TC_MIGRATION_NAME` to its reviewed unique timestamp/slug:

   ```bash
   mkdir -p .tmp/release
   git show "${TC_SCHEMA_BASE}:packages/database/prisma/schema.prisma" > .tmp/release/previous.prisma
   mkdir -p "prisma/migrations/${TC_MIGRATION_NAME}"
   bunx prisma migrate diff --from-schema .tmp/release/previous.prisma --to-schema prisma/schema.prisma --script > "prisma/migrations/${TC_MIGRATION_NAME}/migration.sql"
   ```

   Run with the source-only configuration so no live `.env` is loaded. Verify
   generated SQL is nonempty for a real schema change and review the complete
   diff. Keep temporary schema files ignored. Do not point a shadow URL at Neon.
3. Before deployment, match provider/SQL identity and restore evidence, compare
   applied migration names/checksums with committed bytes, and inspect pending
   SQL for table rewrites, lock duration and compatibility with the current app.
   Set bounded lock/statement timeouts for the reviewed migration operation;
   use a maintenance window only if the actual lock behaviour requires one.
4. Baseline drift compares live schema with the **previous applied** source
   schema. A diff against the new schema is expected before pending migrations.
   Record its exact expected changes; unexpected drift/checksum mismatch pauses
   only the migration until reconciled. Do not call intended pending changes an
   unexplained blocker.
5. Present the exact migration checksums/diff and restore/lock evidence for any
   still-required live authority, then apply `bun run migrate:deploy` once.
   Afterwards, from `packages/database`, run:

   ```bash
   bunx prisma migrate status
   bunx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code
   ```

   Status must report current; diff exits 0 (2 means differences; 1 means error).
   Verify new constraints, scoped row invariants and production catalogue digest.
   Run the guarded six-workspace `bun run test:integration` through D1's runner,
   then cleanup and residue assertions. Never run development seeding.
6. Record honestly that live status, checksum and drift proof do not establish
   fresh empty-database construction. That test is intentionally excluded by the
   retained live-only policy, not relabelled PASS.

CLI reference: [Prisma Migrate diff documentation](https://www.prisma.io/docs/orm/reference/prisma-cli-reference#migrate-diff).
Check installed Prisma 7 CLI help and Context7 if the flags drift; never substitute
Prisma 8 workflows or a command that creates/resets a database.

### C. O1: Complete provider configuration and deploy

Run discovery while source work proceeds. Keep values in provider secret stores;
evidence contains only names, status, timestamps and non-secret resource IDs.

| Provider | Complete now | Passing evidence |
| --- | --- | --- |
| Vercel | Identify app/API/web project roots, domains and actual runtime; configure explicit early access and common URLs | Three corrected preflights against separate actual production environments |
| Neon | Confirm project/branch, role, restore capability and scoped tests | Applied checksums, zero post-deploy drift, safe fixture cleanup and intact data invariants |
| Clerk | Production instance, custom roles, personal accounts disabled, restricted admission, origins and webhook signing | New owner admitted to own account, member provisioning replay and four-role checks |
| Xero | Correct AU connection, encrypted credentials, registered production callback, authorised test organisation/people | Initial sync and four synchronous writes with remote final-state reconciliation |
| Inngest | Event/signing keys, API registration and all functions in `packages/jobs/index.ts` / `apps/api/app/api/inngest/route.ts` | Accepted event reaches registered execution and successful terminal state; failure retries visible |
| Resend | Runtime token, verified sender/domain and private application recipient | Controlled application and notification accepted and received; failure alert delivered |
| KV | Required app/API pairs, feed cache and application abuse controls | Cache miss/rebuild/hit/ETag and rate-limit checks using owned fixtures |
| Sentry | DSN, upload credentials/integration and distinct projects | Candidate release/source maps and symbolicated safe server/client test events plus alert receipt |
| Better Stack | Complete advertised status integration or explicitly disable absent group; configure actual resources and monitors | Status reflects a real check, alert delivered, no partial config or fabricated healthy state |
| Stripe | Always ship C3; configure catalogue/webhook/return URLs only for paid mode | Early access denies checkout server-side; paid mode additionally passes Section 9 |
| DNS/support | Correct TLS/domains, support mailbox and escalation destination | Public routes resolve, mail received and support simulation completed |

Prepare one candidate SHA/tree after integration. Run source gates, then make
the authorised push of a reviewed candidate branch so the protected release
workflow can check out that exact SHA. Candidate publication does not authorise
production deployment. Run reviewed migrations, guarded integration and project
preflights before production promotion. Fast-forward the release branch to the
tested SHA where authorised; if integration changes the SHA, rerun affected
gates against the new candidate rather than claiming the old evidence applies.
Deploy all three apps from that exact SHA; inspect build logs and verify actual deployment
source metadata, Ready state and domain assignment. Do not promote an older build.
Docs and email development apps are not extra production deployments.

Xero OAuth is intentionally disabled on Vercel Preview, so prove that preview
restriction separately and perform the authorised live callback/write journey
on the configured production domain under closed admission. Do not bypass the
restriction with a fake environment flag. A health endpoint returning `OK` is
only liveness, not proof of database, payroll, jobs or email readiness.

## 9. T1: Prove complete deployed journeys and recovery

**Create** `tooling/release/playwright.config.ts`, `tooling/release/e2e/`, fixture
setup/cleanup helpers and a root `test:release` script. Use `@playwright/test` and
current Clerk testing guidance via Context7; check manifests before adding the
dependency. Run against explicit app/API/web candidate URLs, with serial mutation
fixtures, protected role credentials and per-role isolated storage state. Persist
the D1 manifest before creating live resources. Reject a mismatched deployed SHA
or a URL outside the configured candidate set.

`bun run test:release` is the **new command to implement**. It must exit nonzero
for failed/missing mandatory scenarios, report each named journey and browser
project, and attempt deterministic cleanup. Do not mock auth or provider success
in this release suite. Mocked fault cases stay in source tests; controlled fault
injection in live tests must be disabled by default, narrowly authenticated and
absent from public product routes.

Use two controlled Clerk Organisations, two AU payroll Organisations inside one
where supported, and actual `org:owner`, `org:admin`, `org:manager`, `org:viewer`
accounts. “Employee” is the viewer/self-service journey, not an invented fifth
Clerk role. Existing product has no shipped OrganisationSwitcher; use controlled
sessions for account isolation, not an unplanned switcher implementation.

| Journey | Observable result required |
| --- | --- |
| Public acquisition | Contact validation, abuse/error/retry states and delivery work; uninvited direct sign-up fails; admitted owner creates their own customer Organisation |
| Authentication | Sign-in/out, recovery, invite/revocation, personal-account exclusion, membership partial failure/replay and owner protection pass |
| Tenancy/roles | Direct IDs from the other Clerk/payroll Organisation disclose nothing; manager empty/missing scope reveals nothing; viewer cannot approve or administer |
| Employee/manual entries | Create/edit/archive manual availability; draft/edit/submit/withdraw leave; provider failure gives a safe actionable state; balances display Xero values without recalculation |
| Manager | Only visible team requests/calendar; approve and decline with required reason; state and audit agree with provider |
| Admin/owner | Xero connect, initial people/leave/balance sync, matching, holidays, invites, settings, sync detail/raw access and billing mode complete |
| Payroll | Separate controlled records cover submit->approve->withdraw and submit->decline; each remote ID/status is reconciled. Ambiguous submit cannot issue another create; resolution completes without duplicate canonical publication |
| Feeds | Create, display/copy the exact URL, named/masked/private projection, all-day/DST boundaries, stable UID and material-change SEQUENCE, cache/ETag, revoke/rotate and old-token rejection pass |
| Calendar clients | Subscribe and parse events in Outlook, Google Calendar and Apple Calendar; record initial event and subsequent fetch/update evidence. Do not promise immediate client refresh or wait idly for an unspecified polling interval |
| Jobs | Enumerate actual registered functions, including email/usage/supporting jobs; every relevant handler has terminal-state, retry and per-record isolation evidence. Queue acknowledgement alone fails |
| Notifications | In-app and SSE reconnect delivery, per-user/per-tenant isolation, email receipt, preferences/unsubscribe and recovered email backlog pass |
| Holidays | AU source import, location assignment, manual working/non-working override and calendar/feed projections agree |
| Billing | Early access refuses direct checkout/portal operations and hides payment CTAs. If paid: repeated/concurrent checkout creates one subscription, mirror/replay, entitlements, portal and cancellation pass |
| Analytics/privacy | Successful milestones appear once with correct association; no application content, leave data, tokens or raw provider material in events/logs/traces |
| Recovery/support | Failed job/webhook/email alerts reach the owner; support issue is received/responded to; rollback to the named compatible build restores healthy service |

Browser matrix: run core journeys in Chromium, Firefox and WebKit; public/app
shell checks at 390, 768 and 1440 CSS pixels in light/dark. On representative
forms, dialogs, tables and calendar views verify keyboard/focus, screen-reader
names/announcements, 200% zoom/reflow, reduced motion and no unexpected
console/network errors. Test each role's authorisation at least once end to end;
do not multiply payroll mutations across every viewport. Reuse read-only fixture
views for the visual matrix. If one automation tool stalls, use the maintained
Playwright runner or an available manual browser and attach concrete evidence;
a tooling stall is not a reason to abandon implementation or claim coverage.

Clean up exact run-owned resources in Neon, Clerk, KV and the sanctioned Xero
organisation. For payroll, withdraw/reconcile controlled requests through the
supported API; provider audit history may legitimately remain. **Zero residue**
means no unintended active test leave, invitations, feeds or removable fixture
rows, with every retained audit/provider record listed by ID and final state.
It does not mean erasing payroll audit history. A host crash leaves a recoverable
manifest; rerun cleanup and prove the same invariants before the next live run.

Rollback triggers: wrong SHA, health failure, tenant disclosure, duplicate/unknown
payroll outcome, migration anomaly or missing critical telemetry. Stop the
specific dangerous mutation/admission path, restore the named compatible app
build and verify health. Additive database changes remain and are forward-fixed
unless a reviewed safe rollback exists. Record deployment ID, command/action,
start/end timestamps and post-rollback probes. Rehearse against the controlled
candidate without disrupting existing customers; a tabletop alone is not proof
that the deployment can be recovered.

## 10. Close external security and finish the release

Historical credential remediation at `tasks/todo.md:56-58` and
`tasks/archive.md:994` is not proven by zero GitHub alerts. Verify the credential
formerly exposed in `.mcp.json` is revoked/rotated through its provider, without
retrieving or reproducing the old value. Complete any required GitHub retained-ref
and cached-view purge through the authorised account. Scan a fresh remote mirror
with redacted findings and generated-artifact exclusions reviewed explicitly.
Record provider case/result and scanner version/exit status. Do not rewrite
shared Git history, send provider messages or revoke unrelated credentials merely
because an old checklist mentioned cleanup; prepare and perform the concrete
required action under existing authority.

If a provider must act, submit the fully prepared request when authorised and
finish every independent code/configuration/test item while it is pending. Record
one exact remaining action, responsible account and evidence needed; do not
create another general planning task or repeatedly request the same approval.
Pending required security remediation stays visibly incomplete.

Run the package-manager's read-only dependency audit on the final lockfile; triage
reachable high/critical runtime/build advisories, fix them and rerun affected
checks. Do not use speculative upgrades or dependency counts as readiness proof.

Create a new `tasks/go-live-readiness-report.md` for the exact deployed candidate
only after running the gates. Preserve historical evidence in Git; do not copy
old PASS rows into the new report. Include candidate SHA/tree, deployment IDs,
actual runtime, launch mode, migration/checksum set, restore/rollback target,
per-gate counts/skips/duration, controlled provider IDs/final states and evidence
locations. Store screenshots, traces and logs privately with sensitive fields
scrubbed; auth state and `.env` files are never report attachments.

### Definition of done

- [ ] Every C, D, R, P, G and T item is implemented and its named regression checks pass. No confirmed bug is closed by relabelling it P2 or deferred.
- [ ] All source gates, all guarded integration workspaces and all mandatory deployed journeys pass for the final candidate; skips have explicit scenario disposition and no required coverage is skipped.
- [ ] App/API/web are healthy at the same candidate SHA; corrected preflights reflect each actual production environment.
- [ ] Migration history/checksums, post-deploy drift and scoped data invariants pass; no unowned fixture writes or unintended active remote test artefacts remain.
- [ ] C1 recovery and C6 manager isolation pass in source tests and controlled deployed journeys.
- [ ] AU is the only enabled payroll region; complete authorised feed URLs remain usable; Xero remains authoritative for balances.
- [ ] Application, first-owner admission, support delivery, observability/alerts, credential remediation and rollback work in practice.
- [ ] Any paid-only gate is PASS if paid, or explicitly NOT APPLICABLE because actual mode is early access. C3 source fixes are never waived.
- [ ] Readiness report states READY with links to evidence, no mandatory UNKNOWN/NOT VERIFIED and no unresolved P0/P1 defect. The intentional exclusion of fresh-database construction is disclosed separately.
- [ ] Implementation diffs are reviewed, authorised integrations completed, unrelated changes preserved and temporary development processes/worktrees cleaned up appropriately.

An unavailable credential or unresolved dangerous live outcome can prevent a
truthful READY decision. It must not prevent completing the other work. Report
the precise uncompleted action and continue it when authority/access exists;
never replace missing proof with a waiver or a fabricated result.

## 11. Execution ledger and review

Update this single ledger during implementation. A row is DONE only when its
behaviour, regression checks and applicable live proof pass. Allowed status:
TODO, IN PROGRESS, DONE, or WAITING ON EXTERNAL ACTION with the exact action.
Keep secrets, applicant information and customer data out of this file.

| Work | Status | Commit / command result / evidence |
| --- | --- | --- |
| D1 | TODO | Guard, inventory, source isolation and live cleanup proof |
| C6 | TODO | Empty/missing manager-scope regressions and deployed denial |
| C1 | TODO | Durable submit recovery, races and reconciled AU records |
| C2 | TODO | Partial retry and delivered activation dedup |
| C3 | TODO | Failed receipt, replay, ordering and entitlement-health tests |
| C4/C5 | TODO | Email handler retry and malformed-JSON tests |
| R1/R2/R3 | TODO | Preflight regressions, three project results, Sentry build/event |
| P1/P2/P3 | TODO | Query bounds, exact counts, scope and payload proof |
| P4/P5 | TODO | Chunk graph/sizes and first-page event tests |
| G1 | TODO | Delivered application and separately admitted first owner |
| G2/G3 | TODO | Support/rollback exercise and truthful public surfaces |
| T1/T2/T3 | TODO | Browser report, CI gates and runtime/type inventory |
| O1 | TODO | Provider identities, migration set and deployed SHA/IDs |
| External security | TODO | Rotation/revocation, retained-ref remediation and mirror scan |
| Final release | TODO | Candidate SHA/tree, launch date and READY report |

### Review decisions and rejected findings

- Plan 153's parallel-subscription fix is already present at `0af2573`; do not
  rebuild it. Its regression and paid live evidence remain required.
- Full authorised feed URLs and token-based public feed lookup are intentional.
  Privacy masking affects event contents, not subscription URLs.
- NZ/UK activation, new connectors and an OrganisationSwitcher are outside this
  controlled Australian launch, not unresolved tasks to hide with a waiver.
- Rejected the old assertion that one tenant makes sync summaries bounded:
  run/failure history is unbounded within the period and is included in P3.
- Rejected a proposed missing People status-enum finding: current
  `people-service.ts:150-163` already contains `alternative_contact` and
  `another_office`. Preserve parity tests; no speculative enum repair is needed.
- Database-free gates, mutation safety, wrong Sentry path, Resend alias/sender,
  first-owner admission and manager empty-scope gaps were confirmed by direct
  source reads and incorporated above. Source-only reviewer checks do not certify
  production. No source files or provider settings were modified in this review.

### Maintenance notes

Future changes to submit retries must preserve durable uncertainty across every
writer and inbound sync. Billing changes must update delivery-state predicates
and entitlement-health tests together. Status precedence or holiday rules must
update P2 query parity tests. A new integration suite must join D1's inventory
before it can run. New launch modes, provider variables, public CTAs and analytics
events must update runtime validation, preflight and deployed release checks in
the same change. Recheck these invariants when reviewing the final diff.
