# Plan 000: Ship Team Calendar's Australian release

> **Executor instructions**: Read this document completely before starting. Use `codex/` branches or worktrees. Follow the exact step sequence. Run every verification command. Never skip assertions or leave unresolved questions. Maintain this document as execution progresses.

## Drift check

Baseline commit: `6005a5a`
Command to verify tree is clean of unexpected changes:

```bash
git diff --stat 6005a5a..HEAD -- apps packages scripts tooling .github package.json bun.lock turbo.json PRODUCT.md
```

If scoped diff is non-empty, STOP and reconcile before proceeding.

## Status

- **Status**: IN PROGRESS. Production readiness remains NOT VERIFIED.
- **Reviewed at**: `6005a5a`, 2 October 2026, clean working tree before this plan review.
- **Priority / effort / risk**: P0 release programme, L, HIGH for payroll and live operations.
- **Default**: Australian, invitation-only `early_access`, configured explicitly in each deployed project. Paid mode adds the billing journey; NZ/UK activation and new connectors are out of scope.
- **Result**: app, API and web serve one reviewed candidate; admitted customers complete onboarding, leave decisions, Xero reconciliation and calendar subscription; every mandatory gate has attributable passing evidence.
- **Database policy**: authorised online Neon only through the protected runner. No localhost/Docker database, reset, development seed, `db push`, rebaseline or `migrate dev`. Synthetic build URLs are validation inputs, never test databases.
- **Plan ownership**: this file owns release closure; [Plan 159](159-xero-sync-and-onboarding.md) owns remaining Xero import/onboarding/AU semantics; [Plan 160](160-xero-end-to-end-verification-and-report.md) owns the provider/browser campaign; [Plan 161](161-harden-xero-connection-lifecycle.md) owns lifecycle contracts and rollout sign-off. Do not reimplement completed 161 sub-plans or Plan 159's superseded Step 3.

## Why this matters

Team Calendar's Australian release programme coordinates the final verification, hardening, and deployment gates required to ship the Australian edition safely into production. It orchestrates across seven distinct workstreams: source isolation and protected runner governance (D1-D3), concurrency control and durable write recovery (C1-C6), performance and query bounding (P1-P5), customer onboarding and public truth (G1-G3), browser journey suites (T1-T3), bidirectional Xero payroll sync and lifecycle enforcement (X1-X3), and production deployment verification (O1).

Rigorous gate enforcement ensures payroll safety, Clerk organisation isolation, reliable ICS calendar feeds, and zero-residue test fixtures, ensuring that customer data and live payroll state in Xero remain strictly protected.

## 1. Execution contract

This review updates planning files only. It does not authorise deployment, payroll writes, customer backfills, provider messages, destructive remote cleanup or permanent production CI access. Reuse applicable existing authority during execution; prepare any still-unauthorised action completely before requesting its specific approval. Continue independent work while an external action is unavailable.

### Working rules, scope and drift

Read `PRODUCT.md`, `DESIGN.md`, `.impeccable.md` and relevant tests. Preserve Clerk Organisation and payroll Organisation isolation, Xero-owned balances, synchronous user-triggered writes, full feed URLs for authorised viewers, immutable Xero binding and fail-closed shared rate limits. A null canonical credential owner preserves the supported legacy path. Remote cleanup and inactivity remain report-only unless their separate enablement criteria are met.

Use Zod at boundaries, `Result` for expected failures, named exports, strict TypeScript and existing package boundaries. New database access belongs in `packages/database`; provider logic belongs in `packages/xero`. Match `packages/database/src/tenant-query.ts:36`:

```typescript
export const scopedTo = (input: {
  clerkOrgId: string;
  organisationId: string;
}) => ({
  clerk_org_id: input.clerkOrgId,
  organisation_id: input.organisationId,
});
```

UI fixes reuse Plus Jakarta Sans, semantic surfaces, 20px containers, 16px floating surfaces, 14px controls, labelled statuses, keyboard focus and light/dark support. Use Australian English and no em dashes. Preserve the four-reason Contact studio, Clerk-rendered sign-up and the existing calendar design.

**Edit scope during execution**: paths explicitly named in each item, their direct callers, co-located tests, required package exports/manifests, protected fixture registration and additive generated migrations where necessary. Each source slice records its exact file allowlist before editing. Out of scope: unrelated redesign, framework upgrades, new connectors, OrganisationSwitcher, membership tables, payroll calculations, queued outbound writes and changing guards to make tests pass. This advisor review edits only `plans/go-live.md` and its index entry.

Run first:

```bash
git rev-parse HEAD
git status --short
git diff --stat 6005a5a..HEAD -- apps packages scripts tooling .github package.json bun.lock turbo.json PRODUCT.md
git diff --stat -- apps packages scripts tooling .github package.json bun.lock turbo.json PRODUCT.md
```

Compare affected excerpts and test contracts if these paths changed. Resolve ordinary drift locally; stop only the affected step if its safety or product contract changed. Use scoped `codex/` branches/worktrees, conventional commits and sequential integration. Do not push, merge or deploy without applicable authority. Executors track progress in the ledger below and `tasks/todo.md`, preserving history; this review does not edit task files.

### Evidence established by this review

This was a source and plan review, not a fresh release test run. The implementation paths named below were inspected. The command `git diff --stat 6005a5a..HEAD -- apps packages scripts tooling .github package.json bun.lock turbo.json PRODUCT.md` returned no changes, confirming those inputs still match the latest recorded candidate. This is evidence reuse with a checked boundary, not a new PASS.

The historical 160–161 reconciliation record (preserved in git history; see `plans/README.md`) reports source candidate `5d2e57b`: 2,810 repository tests, 395 release-tool tests, build/type/lint/boundary gates, and protected online Neon/Redis run `21e2bdb1-ea5b-4acd-ac8f-f484130731ce` with 27 files / 246 tests. It records all 23 migrations applied, zero drift, 39 zero-residue selectors, released fence and unchanged outside-owned row content. Do not recreate or reapply historical migrations.

That same record reports production app/API/web READY at older commit `11ce7e7`, missing lifecycle configuration names, and zero registered Inngest apps at its last read. These are dated provider observations, not live facts refreshed by this review. The [published Xero diagnostic](../reports/xero-e2e/2026-09-26-3c9912d5-3785-4276-8a13-8aa05b14e710.md) explicitly records zero LIVE/CONTROLLED execution, 26 scenarios / 92 subcases NOT VERIFIED and 40 lifecycle cases / 93 required evidence levels NOT VERIFIED. No production or provider PASS is inferred from the database inventory.

### Review findings and disposition

All entries below have HIGH confidence from current source reads. Effort includes tests; risk describes the required change.

| Finding | Impact | Effort / risk | Evidence and disposition |
| --- | --- | --- | --- |
| Historical defects and pending migrations read as current work | Repeats completed changes and obscures remaining gates | S / LOW | Current implementations in Sections 4–7 and reconciled plans; replace defect claims with preservation and closure criteria |
| C1 lacks a registered real-database uncertainty/concurrency regression | Aggregate integration PASS cannot prove no duplicate submit after expiry/crash | M / HIGH | `packages/database/src/queries/outbound-operations.test.ts:11` mocks transactions; current integration inventory has no durable-submit scenario; add owned coverage under C1 |
| Ordinary CI still mutates disposable Postgres; protected workflow is absent | Release's online-only verification policy remains unenforced in CI | M / HIGH | `.github/workflows/ci.yml:28,79,119`; finish D1 CI separation, retain existing local-runner evidence |
| CSV export still caps/materialises 50,000 rows and points to no full-export API | P3's complete bounded export criterion is not implemented | M / MED | `packages/availability/src/sync/sync-monitor-service.ts:913-945`; complete P3, do not close it as deployed-proof-only |
| Acquisition and browser assertions target obsolete behaviour | Tests miss the actual public form and expect a removed sign-up redirect | M / MED | Contact client posts `/api/contact` at `apps/web/app/contact/components/contact-page-content.tsx:116`; `tooling/release/e2e/admission.spec.ts:8` expects redirect; fix G1/T1 |
| Generic browser suite also discovers dedicated Xero specs and accepts queued sync | Wrong runner context and false terminal-success evidence | M / MED | `tooling/release/playwright.config.ts:18-21`, `tooling/release/e2e/admin-and-roles.spec.ts:24`; separate inventory and observe terminal runs |
| Worker execution and campaign admission remain pending dependencies | Credentials alone cannot make the provider campaign executable; AU contract resolved in main (`bf01911`, `au-contract-v1`) | L / HIGH | `tooling/release/xero-execution-guard.ts:216`, `tooling/release/run-xero-e2e.ts:102`; complete X2 worker enforcement before dependent live cases |

## 2. Current queue, priorities and dependencies

`SOURCE PRESENT` means the implementation was located, not that every acceptance test or deployed journey passed. `RECORDED PASS` refers only to the named historical evidence. No row closes without its remaining evidence. Dependencies are phase-specific: a prerequisite for deployment is preparation/source verification, not another row's final production sign-off. C2/G1 and O1/X3 share later campaign evidence without blocking each other's preparation.

| ID | Current state | Remaining work | Dependency |
| --- | --- | --- | --- |
| D1 | Guarded runner/ownership/inventory SOURCE PRESENT; online run RECORDED PASS | Source-only CI, protected release workflow, fresh candidate-specific owned run and recovery evidence | None for CI preparation |
| C6 | Fail-closed manager scope SOURCE PRESENT | Current regressions and deployed empty/missing-scope denial | D1 for database-backed proof |
| C1 | Durable uncertainty/recovery SOURCE PRESENT | Add real-database concurrency/expiry/recovery/inbound-merge coverage; provider/browser proof | D1; X1 AU contract before outbound expectations |
| C2 | Partial membership retry and stable analytics UUID SOURCE PRESENT | Deployed retry and delivered-event cardinality | Source tests independent; closure uses G1 campaign after O1 deployment |
| C3 | Failed receipts, repair tooling and billing database regressions SOURCE PRESENT | Candidate regressions and authorised provider replay; paid checkout only in paid mode | D1/O1 |
| C4/C5 | Email failure propagation and malformed-JSON handling SOURCE PRESENT | Current regressions and deployed email recovery | R2/O1 |
| R1/R2/R3 | Mode/runtime/preflight/Sentry import SOURCE PRESENT | Separate actual project preflights and symbolicated candidate events | O1 |
| P1/P2 | Bounded pages, hydration and predicates SOURCE PRESENT | Candidate parity/query-count and deployed payload proof | C6/D1 |
| P3 | Bounded overview/detail SOURCE PRESENT; CSV incomplete | Implement complete bounded export and verify access, counts and payloads | D1 for fixture proof |
| P4/P5 | Public provider split/lazy sanitised analytics SOURCE PRESENT | Candidate bundle/network and event-delivery proof | G1 |
| G1 | Contact studio, protected API and activation SOURCE PRESENT | Verify `/api/contact`, Clerk admission, first-owner creation and delivered milestones | C2/R2 source checks and X1 sync contract; closure after O1 deployment |
| G2/G3 | Trust-copy cleanup SOURCE PRESENT | Current public copy, support receipt/response and rollback | O1/T1 |
| T1 | Browser harness SOURCE PRESENT, incomplete/stale assertions | Correct inventory/admission/terminal assertions and complete journey matrix | X2 before live worker cases; O1 |
| T2/T3 | Docs/email CI gates and Node 22 types SOURCE PRESENT | Preserve gates, actual runtime/remote CI and email render evidence | D1 |
| X1 | Plan 159 remaining scope TODO | Import completeness, retry safety, identity reconciliation, onboarding/freshness; AU contract approved in au-contract-v1 | Preserve completed 161 controls |
| X2 | Guard/report foundation SOURCE PRESENT; acquisition refused and Plan 160 corrections remain | Enforce worker fence; complete Plan 160 ledger, driver, receipt/lifecycle collector and execution/cleanup adapters | X1 for campaign expectations; D1 safety primitives; Plan 160 harness corrections before admission |
| X3 | 161 sub-plans DONE at source/fixture level | Lifecycle configuration, safe namespace rollout, case-level and charter sign-off | Prepare config/namespace before O1 deployment; sign-off after O1 deployment and X2/Plan 160 execution |
| O1 | Production proof NOT VERIFIED | Refresh metadata, configure, migrate only if pending, deploy one SHA, execute/reconcile journeys | Deployment: source/candidate gates, X1 contract, X2 source enforcement and X3 preparation; closure: subsequent campaign |

Execution order:

1. Reconcile drift and current evidence. Start D1 CI work, C1 database regressions, P3 export, G1/T1 fixes and X1/X2 source work. Refresh read-only provider metadata in parallel when authorised.
2. Preserve the approved AU transition contract (`au-contract-v1`, local submit, manager approve creates in Xero). Complete worker isolation before any worker-dependent provider/browser action. Keep routine source and protected database testing independent of unavailable provider fixtures.
3. Freeze one candidate, run uncached source gates, compare applied schema, apply only genuinely pending reviewed migrations, then run the complete registered online inventory with fresh ownership and cleanup proof.
4. Prepare lifecycle settings/namespace and project preflights, deploy the exact candidate under closed admission, verify registered worker revisions, then run distinct owned browser/provider campaigns. Finish support, telemetry, security and rollback evidence.

## 3. Finish verification infrastructure without rebuilding it

### D1: Preserve the protected runner and close CI policy gaps

**Current source**: `tooling/release/integration-inventory.ts:4-40` enumerates six workspaces and 27 integration files. `run-live-integration.ts` validates manifest/identity, durable ownership, consumer isolation, inventory, cleanup and fence state. `packages/database/src/live-test-guard.ts` protects direct construction. `cleanup.ts:43` requires an active owner for `--apply` and `--assert-clean`; `--dry-run` remains the read-back path after fence release. Root `test:integration` sets `ALLOW_LOCAL_DATABASE_TESTS=1`, which is localhost-only and never Neon authorisation.

**Remaining scope**: `.github/workflows/ci.yml`, new `.github/workflows/release.yml`, `tooling/release/run-source-gates.ts`, `deny-network.mjs` and tests, `tooling/release/consumer-isolation.ts` and tests, existing runner/manifest/cleanup/inventory modules only where required. Update registry, allocator and cleanup alongside any new C1/X2 integration files.

1. Convert ordinary CI to database-free source checks; remove its disposable Postgres service, migrate/deploy/drift/integration steps. Preserve docs/email, package-boundary and tooling checks. Ordinary PR code receives no live secrets or database access. Keep database verification as a separate required protected candidate check, never silently drop it.
2. Harden the existing source wrapper's environment before relying on that claim. It currently filters database/Neon/release variables but retains other inherited provider values (`run-source-gates.ts:17-30`). Run from a clean checkout without live `.env*`, use an allowlisted synthetic environment including build-valid Xero client ID/secret and encryption material, and deny TCP plus Neon HTTP/WebSocket connections. Preserve only documented compiler IPC. Test secret inheritance/env-file loading/network denial; do not weaken production env validation.
3. Reconcile proposed CI restructuring (archived in git history) against current CI and inventory; do not apply old hunks blindly. Prepare a protected exact-SHA workflow using trusted workflow code, reviewed candidate checkout, private manifest, scoped secrets and one active run. A prior persistent-workflow approval rejection is recorded in Section 11; it is not proof of approval now. Finish the concrete workflow and tests first, then obtain any still-required authority for persistent production access. Local protected runs can continue under applicable authority while publication is pending.
4. Keep the existing manifest/allocator: reserve exact tenant IDs and kind-qualified global keys before writes, verify durable read-back, prevent adoption of existing keys, preserve outside-owned catalogue/content baselines, and resume only consumer states paused by that run. Ordinary database-fixture mode remains all-consumers-paused/drained or verified strict-empty. The current provider read-back in `consumer-isolation.ts:36-98` implements only the never-registered, strict-empty case; a `pausedConsumers` map alone is not observed pause/drain proof. Before a database campaign after worker registration, implement and test fresh provider-backed pause/drain and exact restoration read-back for all affected consumers, using current Context7/provider contracts. Reject stale/missing evidence, active/queued/retrying work and unverified restoration. Do not unregister workers to manufacture the old empty-environment condition. If the provider cannot enforce the window, keep that campaign unavailable while completing independent work. X2's E2E mode is separate and must be rejected by this runner.
5. On interruption use the protected runner's recovery mode, not a new run ID. Cleanup uses only manifest-owned resources in dependency order. An unresolved provider effect or stale consumer proof keeps the fence held and evidence incomplete. After normal release, do not reacquire a fence just to run `--assert-clean`: use `--dry-run` plus independent zero-residue, unchanged-content and released-fence checks.

**Commands**, after a fresh protected environment/manifest is prepared privately:

```bash
bun --no-env-file tooling/release/migration-check.ts --base 92d67c5
TURBO_CONCURRENCY=1 bun --env-file="$TC_RELEASE_ENV_FILE" tooling/release/run-live-integration.ts --manifest "$TC_RELEASE_MANIFEST" --evidence-dir "$TC_RELEASE_EVIDENCE_DIR"
bun --env-file="$TC_RELEASE_ENV_FILE" tooling/release/run-live-integration.ts --manifest "$TC_RELEASE_MANIFEST" --recover --evidence-dir "$TC_RELEASE_EVIDENCE_DIR"
bun --env-file="$TC_RELEASE_ENV_FILE" tooling/release/cleanup.ts --manifest "$TC_RELEASE_MANIFEST" --dry-run
```

Run recovery only for an interrupted owned run, not after a successful run. These variable values are private paths, not secret contents to print. The runner invokes `bun run test:integration` with validated live context; do not run the root command directly against Neon. Current expected inventory is 27 files, increased explicitly if new registered tests land; assert discovered inventory equals registration instead of freezing old counts.

**Verify**: `bun run test:release-tools` and `bun run typecheck:release-tools` exit 0. Denial cases fail before writes: missing acknowledgement/identity/restore/ownership, stale consumers, reused namespace, wrong mode, unguarded direct invocation, unowned cleanup. Crash recovery from a fresh process uses the durable manifest. Final protected run records `phase=complete`, inventory PASS, cleanup PASS, exit 0 and released fence; independent read-back proves zero removable residue and unchanged outside-owned data. Workflow YAML alone is not remote execution evidence.

### T2/T3: Preserve existing CI gates and verify the actual runtime

`.github/workflows/ci.yml:110-117` already runs docs links, email build/export and render assertions. `apps/docs/package.json` uses `mint broken-links`; `apps/email/package.json` defines `assert-render`. Root/package Node types are aligned to 22; root `engines` supports `22 || >=24.0.0`, and Bun is pinned to 1.4.0. Do not repeat a type migration or replace the working Mint command.

**Scope**: those workflow/package files only if a real drift is found, `apps/email/scripts/assert-render.tsx` and tests when templates change. Preserve `bun run --cwd apps/docs lint`, `bun run --cwd apps/email build`, `bun run --cwd apps/email export`, `bun run --cwd apps/email assert-render` in the final gate set. Root build excludes email, and the source wrapper currently omits these gates, so neither substitutes for them.

**Verify**: all four commands exit 0 with nonempty rendered notification markup, working links and no unresolved values; record actual Vercel runtime per app, CI runtime and the compatibility run for the supported floor. Source declarations are not evidence of remote runtime configuration.

## 4. Preserve correctness controls and finish their proof

The original C1–C6 runtime changes are present. Repair regressions if discovered; do not recreate tables/services merely because the September 19 ledger describes their original implementation. Remaining tests and deployed acceptance below still block closure.

### C6: Prove fail-closed manager scope

**Current state**: `packages/availability/src/plans/plan-service.ts:288` returns `notAuthorised()` for missing manager identity; `:1048-1070` intersects authorised and requested IDs and returns an empty page before loading records. `packages/availability/src/people/people-service.ts:286-301` rejects missing identity and returns zero results for empty scope.

**Scope**: those services/tests, `packages/availability/src/settings/manager-scope.ts` and tests, Plans/People page tests, `tooling/release/e2e/admin-and-roles.spec.ts` and `manager.spec.ts`.

**Preserve and prove**: `null` is unrestricted only for authorised admin/owner; `[]` never broadens a query. Cover no reports, missing linked person, unrelated/mixed filters, valid team/self access, and foreign Clerk/payroll Organisation IDs. Denied/empty scope must not issue an unrestricted record query. Add controlled deployed empty/missing-scope cases, not only viewer denial.

**Verify**: `bun run --cwd packages/availability test src/plans/plan-service.test.ts src/people/people-service.test.ts src/settings/manager-scope.test.ts` and `bun run --cwd apps/app test 'app/(authenticated)/plans' 'app/(authenticated)/people'` exit 0 under source-only isolation; T1 demonstrates actual manager denial and unchanged owner/admin access.

### C1: Prove durable uncertainty against the real database

**Current state**: `packages/database/src/queries/outbound-operations.ts:51` implements transactional, generation-fenced preparation. `packages/availability/src/plans/submit-service.ts:366-435` persists request fingerprints, marks dispatch before calling Xero and retains unknown outcomes after throws. `submit-recovery-service.ts` and protected Plans actions already exist. The database repository unit at `packages/database/src/queries/outbound-operations.test.ts:11-27` mocks the transaction; no current registered integration file exercises durable outbound operations directly.

**Scope**: those files/tests; `packages/availability/src/plans/submit-side-effects.ts` for shared finalisation side effects; Plans actions/recovery UI; `packages/availability/src/xero-write-claim.ts`; existing inbound sync/publication callers. Add `packages/database/outbound-operations.integration.test.ts` and register it in `tooling/release/integration-inventory.ts`, allocator/global-key/cleanup contracts. Extend `packages/availability/index.integration.test.ts` or a separately registered recovery suite for service-level merge coverage. No schema change is assumed.

1. Preserve immutable snapshots and `prepared`, `outcome_unknown`, `provider_accepted`, `completed`, `definitive_failure` transitions. A worker lease releases execution ownership, not an unresolved operation. Timeout, malformed success, 5xx, process loss or local commit failure never authorise a second create. Retry/edit/archive/approval and inbound writers respect the durable guard. Only proven pre-send failure or definitive rejection permits retry.
2. Add guarded tests with independent database clients contending for the same owned record. Assert exactly one claim and one counted mocked provider create, persisted unknown status before dispatch, unchanged denial after lease expiry and client/process restart, stale-generation finalisation rejection, and safe retry after definitive failure. Use real repository transactions; provider transport stays mocked in synthetic database suites.
3. Prove verified known-ID recovery, admin/owner-only attach and definitive-not-created resolution. Empty, incomplete, old or ambiguous provider matches never establish absence/origin. Recovery must preserve both scopes, stable UID, privacy, publication sequence and idempotent notifications. Test inbound import racing recovery leaves one canonical publication, retaining audit history and cancelling the duplicate publication safely.
4. Allocate all resources before writes and extend owned cleanup before running. Model fixture setup/teardown on `packages/database/billing.integration.test.ts` and the existing availability integration suite. Do not use unrelated customers, unregistered global keys or real Xero calls to manufacture a concurrency test.
5. After X1's AU decision, Plan 160 proves the actual approved remote sequence and recovery against sanctioned fixtures. Keep provider verification separate from mocked transport plus real-database proof.

**Verify**:

```bash
bun run --cwd packages/database test src/queries/outbound-operations.test.ts
bun run --cwd packages/availability test src/plans/submit-service.test.ts src/plans/submit-recovery-service.test.ts src/plans/plan-service.test.ts src/xero-write-claim.test.ts
bun run --cwd packages/xero test src/au/write.test.ts src/au/read.test.ts src/adapter/xero-write-adapter.test.ts
bun run --cwd packages/jobs test src/handlers/sync-xero-leave-records.test.ts src/handlers/reconcile-xero-approval-state.test.ts
```

All exit 0; D1's protected runner discovers the new suite(s), passes the named database cases and cleans exact owned resources. Until then real-database C1 proof is NOT VERIFIED even though the previous 27-file inventory passed.

### C2: Verify replay repairs membership and deduplicates delivery

**Current state/scope**: `apps/api/app/webhooks/auth/route.ts:222-257` provisions before capture, returns sanitised 503 on failure and uses stable delivery UUIDs. Outcomes across payroll Organisations are aggregated at `:301-343`. Preserve signature checks and `packages/availability/src/people/current-user-service.ts` idempotence; no new receipt table is assumed.

**Verify**: `bun run --cwd apps/api test app/webhooks/auth/route.test.ts` and `bun run --cwd packages/availability test src/people/current-user-service.test.ts` exit 0. Cover all-success/failure/partial and failure -> success -> success replay with one link per person. Current unit UUID equality does not prove analytics delivery deduplication. O1 must observe one delivered activation event after replay using controlled identities, with invalid signatures rejected before provisioning/capture.

### C3: Verify repairable Stripe deliveries

**Current state/scope**: `apps/api/app/webhooks/payments/route.ts:18` delegates to `apps/api/lib/stripe-event-delivery.ts`; `packages/database/src/queries/billing.ts`, `packages/auth/entitlements.ts`, protected `tooling/release/replay-stripe-event.ts` and `list-failed-stripe-events.ts` implement receipt state, health fallback and replay. `packages/database/billing.integration.test.ts:312-364` includes failed -> processed and duplicate-preservation regressions.

**Preserve**: failed consumed events stay retryable and visible, unsupported events are ignored deliberately, replay fetches exact IDs server-side, foreign customer binding is rejected, and a stale/equal-time race cannot complete an unsuccessful mirror repair. Paid-mode unhealthy billing falls back to Basic without destructive cancellation; early-access access rules remain unchanged. Never expose raw provider bodies in operator errors.

**Verify**: `bun run --cwd apps/api test app/webhooks/payments/route.test.ts`, `bun run --cwd packages/billing test`, `bun run --cwd packages/auth test entitlements.test.ts` and release-tool replay tests exit 0; D1 covers existing receipt regressions. O1 records authorised failed-event repair/replay against the actual provider configuration. Real paid checkout is conditional on paid mode; C3 source/receipt verification is mandatory in early access too.

### C4/C5: Verify email recovery and malformed input

**Current state/scope**: `packages/notifications/src/email-queue-service.ts:92` checks transport before querying; `packages/jobs/src/handlers/send-notification-emails.ts:23` throws on failed Result. Availability POST and DELETE already catch malformed JSON at `apps/api/app/api/availability/route.ts:52` and `apps/api/app/api/availability/[recordId]/route.ts:231`.

Preserve queued messages during missing transport, row-ID provider idempotency, recipient preferences, per-message attempts and fifth-failure terminal state. Restored transport must drain the controlled backlog and later rows. Authenticated malformed POST/DELETE returns 400 without domain queries/mutation; unauthenticated input remains 401.

**Verify**: `bun run --cwd packages/notifications test src/email-queue-service.test.ts`, `bun run --cwd packages/jobs test src/handlers/send-notification-emails.test.ts` and `bun run --cwd apps/api test __tests__/availability-routes.test.ts` exit 0. O1 proves a visible failed/retried job and actual controlled message receipt without recipient/body data in logs.

## 5. Run current preflight against actual project environments

### R1/R2/R3: Preserve validated mode, lifecycle, email and monitoring checks

**Current state/scope**: `packages/next-config/preflight.ts:141-155` validates actual `NEXT_PUBLIC_LAUNCH_MODE`; CLI mode is only an assertion. `:222-238` covers Sentry upload and Better Stack's complete-or-absent group; `:249-294` validates Xero encryption/keyring/version, credential domain UUID, HTTPS callback, tier/epoch and KV; `:301-315` requires runtime Resend names, sender and private application configuration. `packages/observability/next-config.ts:2` already uses `@sentry/nextjs/config`.

Preserve `preflight.ts`, `preflight.test.ts`, `bin/preflight.ts`, observability env/tests and matching README/env examples. Do not replace actual environment mode with `--mode`, accept an unsupported Resend alias, remove upload requirements, weaken keyring semantics, or rotate keys merely to make a check pass. Retain keys referenced by stored envelopes and the supported version-1 fallback. Namespace presence alone is not initialisation evidence.

**Verify**: `bun run --cwd packages/next-config test preflight.test.ts launch-mode.test.ts` and `bun run --cwd packages/observability test keys.test.ts` exit 0. With each actual production build/runtime environment loaded privately and separately, run `bun run preflight app`, `bun run preflight api`, `bun run preflight web` respectively; each exits 0 with actual `early_access` and secret-free diagnostics. A combined environment is invalid evidence. Sentry source-map upload and symbolication, advertised status monitors and Xero namespace read-back are separate O1/X3 observations.

## 6. Finish bounded data and browser verification

### P1/P2: Preserve bounded Plans and People queries

**Current state**: `packages/availability/src/plans/plan-service.ts:1092-1159` clamps pages to 50/default, 200/max and batches balances; the Plans page batches duration references. `packages/availability/src/people/people-service.ts:303-372` compiles status predicates, pages/counts with the same scope and hydrates only page rows. These are implemented, not proposed new APIs.

**Scope**: those services/tests, `packages/availability/src/people/current-status.ts`, `packages/availability/src/duration/working-days.ts`, their scoped database helpers and existing Plans/People UI tests. Preserve value-based keyset cursors, equal-timestamp/name and deleted-cursor behaviour, overlapping dates, previous-90/next-365-day default Plans window, explicit all-history access and accurate window/empty-state copy.

People status keeps one fixed `at` instant, existing precedence and holiday/location/fallback/working-day semantics. Test every status key against `current-status.ts`, including local midnight/DST, null location, archives and empty holiday sets. No whole-organisation candidate scan or approximate counts. C6 governs page/count queries.

**Verify**: `bun run --cwd packages/availability test src/plans/plan-service.test.ts src/duration/working-days.test.ts src/people/people-service.test.ts src/people/current-status.test.ts` and `bun run --cwd apps/app test 'app/(authenticated)/plans' 'app/(authenticated)/people'` exit 0. D1-owned fixtures prove complete ID/count parity, stable paging and bounded hydration. Measure emitted SQL count/rows/duration at sizes 1, 50, 200 for the same reference years; query count must not grow per record. Record candidate-specific payload sizes and limits. Retain earlier measurements as historical comparisons, not a new baseline run.

### P3: Complete bounded CSV export and verify monitor privacy

**Current state**: `packages/availability/src/sync/sync-monitor-service.ts:285` uses per-type summaries/aggregates; initial detail and cursor pages are bounded at `:526-550`; raw detail is authorised, scoped, scrubbed and audited at `:700`. However, `exportFailedRecordsCsv` at `:913-945` fetches up to 50,001 rows, materialises one CSV and advertises a nonexistent full-export API after truncation.

**Scope**: this service/tests, `packages/database/src/queries/` for the scoped export page query, `packages/availability/index.ts`, `apps/app/app/(authenticated)/sync/_actions.ts`, `[runId]/sync-run-detail-client.tsx` and their tests. Add an authenticated streaming download route under `apps/app/app/(authenticated)/sync/[runId]/export/route.ts` and its route test if using the preferred stream path. No raw provider payloads in exported data.

1. Add a server-side page reader ordered by `(created_at,id)` with at most 200 rows per query and both tenancy keys plus run ID. Authorise admin/owner and verify run ownership before emitting headers. Fix the export upper bound at request start so concurrent new failures do not make traversal endless. Keep existing safe CSV columns/escaping and audited access.
2. Stream page chunks through the authenticated download route, applying backpressure and abort handling; have the UI download from that route instead of serialising a whole export through a server action. Preserve foreign-ID denial and CSV injection protection. If platform response limits prevent a complete export, fail clearly or provide an explicitly scoped resumable continuation; never silently truncate or claim another API exists.
3. Add tests with multiple bounded pages, equal timestamps, empty/foreign runs, cancellation, partial query failure and more than 50,000 fixture rows generated in memory. Assert exactly-once ordered output, no raw detail and `take <= 200`. Use small owned live fixtures to verify real cursor/tenancy parity; do not insert 50,000 rows into production merely for this test.

**Verify**: `bun run --cwd packages/availability test src/sync/sync-monitor-service.test.ts` and `bun run --cwd apps/app test 'app/(authenticated)/sync'` exit 0; new database helper unit and streaming-route tests pass. The obsolete truncation/full-export-API message is absent. Candidate export covers all eligible IDs while server query/page buffering remains bounded. Keep overview/count, raw-detail redaction and manager/viewer denial regressions passing.

### P4/P5: Verify the implemented public-provider and analytics split

**Current state/scope**: `packages/design-system/providers/public.tsx:1` has theme/tooltip/toast composition without auth, consumed by web layout. `packages/analytics/instrumentation-client.ts:234-255` checks configuration before importing PostHog, with URL-envelope sanitisation at `:50-110`. Preserve these files/tests, authenticated provider composition and web consumers; do not rebuild the split or alter unrelated design.

**Verify**: `bun run --cwd packages/analytics test`, `bun run --cwd apps/web test`, `bun run test:release-analytics-privacy` and the candidate web analyser exit 0 in their required isolated environments. Use installed Playwright browsers; the analytics privacy probe intercepts transport and is not production analytics proof. Assert no configured analytics means no PostHog import/network, one initial pageview and one per navigation, safe fast-navigation attribution/identity, and harmless import failure. Candidate `bun run --cwd apps/web analyze` plus actual network capture proves no Clerk in public reachable client code and no unconfigured PostHog in initial transfer. Compare identical build settings; do not call analyser module bytes actual browser transfer. Authenticated sign-in, theme and toasts still work.

## 7. Complete acquisition and release dependencies

### G1: Verify the actual Contact studio and Clerk admission journey

**Current state**: `apps/web/app/contact/page.tsx:19` renders `ContactPageContent`; its client posts `/api/contact` at `components/contact-page-content.tsx:116`. `apps/api/app/api/contact/route.ts` validates the AU request, private recipient/HMAC, shared abuse controls, Resend acceptance, optional confirmation and activation. `/api/early-access` remains an existing legacy route, not the public studio endpoint. `apps/app/app/(unauthenticated)/(auth)/sign-up/[[...sign-up]]/page.tsx:15` intentionally renders Clerk SignUp; keep Clerk as admission authority.

**Scope**: those routes/components/tests, `packages/email/contact.ts` and tests, API/web env contracts, shared rate-limit helpers, `packages/analytics/activation-events.ts` and existing capture points, Clerk choose-organisation/session-task and onboarding flows, `tooling/release/e2e/admission.spec.ts` and fixture contracts. Preserve enquiry, early-access, support and bug reasons; no new CRM, applicant database, membership table or public recipient address.

1. Verify actual contact validation, draft preservation on failure, per-payload idempotency, wrong-origin/content-type rejection, HMAC-derived abuse keys, rate limiting and private accepted delivery. Cover confirmation success/failure separately from team delivery so a failed optional receipt cannot duplicate the application. Keep legacy route regressions while that route is supported.
2. Verify the published purpose/90-day retention text against the actual mailbox retention/access rule; source copy alone is not provider configuration. Use existing support hours and acknowledgement target, not a new SLA meeting.
3. In Clerk's actual restricted mode, prove an uninvited visitor sees a rendered denial/admission state and cannot acquire an unauthorised session. Correct T1's obsolete redirect assertion; do not restore the removed app redirect. Test expired/revoked invitation, existing-user sign-in, required organisation task, and CSP loading of the configured Clerk frontend origin.
4. Redeem a sanctioned application/user invitation for a genuinely new owner, create that customer's own Clerk Organisation, verify `org:owner` creator role and provisioned People. An existing-owner settings visit is insufficient. Subsequent member invitations target that customer's Organisation, never the operator's account. Use current Clerk Context7 guidance before provider configuration; record missing role capability without inventing roles locally.
5. Preserve the versioned activation catalogue: Application Accepted, Customer Admitted, Organisation Provisioned, Xero Connected, Initial Sync Completed, First Feed Accessed, First Leave Submitted and First Leave Approved. Check actual durable outcomes and stable dedup identities; no applicant content, leave details or feed URLs in analytics. X1 must resolve initial-sync truth before its milestone can pass.

**Verify**:

```bash
bun run --cwd apps/api test app/api/contact/route.test.ts app/api/early-access/route.test.ts
bun run --cwd apps/web test app/contact
bun run --cwd packages/email test contact.test.ts
bun run --cwd packages/analytics test
```

All exit 0; T1/O1 records one privately received controlled application through `/api/contact`, one separately admitted owner in their own Organisation and delivered once-only activation milestones. Mocked analytics UUID checks are not delivery proof.

### G2/G3: Verify current public truth, support and rollback

**Current state/scope**: `apps/web/app/about/page.tsx` and `about.test.tsx` already removed illustrative identity copy; `PRODUCT.md:26` is now Users, not the obsolete Register section. Preserve factual founder/product content, current Australian scope and future-region labels. Scope edits only to demonstrated stale public claims and their tests, not a redesign.

**Verify**: `bun run --cwd apps/web test app/about app/contact app/pricing app/integrations` exits 0. Candidate browser checks confirm no provisional identity, obsolete release date or unsupported region/refresh claim. Record actual support receipt/response times within the published target, and the Section 9 rollback rehearsal. Release date is the actual verified release, not a prerequisite. The controlled T1/O1 customer journey replaces the old three-reference-customer marketing gate; product/security/payroll tests remain mandatory.

### X1: Complete Plan 159's remaining import and AU contract work

**Owner**: [159: Xero sync and onboarding](159-xero-sync-and-onboarding.md), all active steps except superseded Step 3/X5/X6. Preserve Plan 161's immutable global binding and canonical credential controls.

**Current evidence**: `packages/jobs/src/handlers/sync-xero-leave-records.ts:304-329` detects an incomplete fetch but still clears staleness; connection actions at `apps/app/app/(authenticated)/settings/integrations/xero/connect/_actions.ts:128` still begin immediate best-effort sync. The AU transition contract (`au-contract-v1`) was approved on 2 October 2026 and integrated at `bf01911`: employee submission remains local (`submitted`), and manager approval synchronously creates scheduled leave in Xero via an additive `approve` operation before transitioning to `approved`. Remote-created submissions remain read-only for review.

Finish import completeness, retry-safe job ownership, initial people-before-leave orchestration, person/account reconciliation, truthful onboarding and calendar refresh using Plan 159's exact paths and regressions. Preserve the approved `au-contract-v1` synchronous user-triggered contract and C1 uncertainty controls.

**Verify**: run Plan 159's named unit/type gates under Section 8 source isolation, register new integration coverage through D1, and require Plan 160's exact scenario/subcase evidence for the approved contract. Remaining import, identity, onboarding, and calendar work blocks dependent write cases and READY, not independent source fixes.

### X2: Implement enforced worker isolation and production campaign acquisition

**Current evidence**: `tooling/release/xero-execution-guard.ts:216-224` states `available: false` and requires a registered candidate revision plus an enforced owned tenant/run/generation fence, terminal drain and restoration read-back. `tooling/release/run-xero-e2e.ts:102-104` has a production `acquire` dependency that always rejects. The guard/ledger/report foundation exists; actual execution admission and campaign completion are not implemented. The concurrently reviewed Plan 160 additionally owns remaining harness correctness, driver and receipt/lifecycle collection work. Source inspection confirms `run-xero-e2e.ts:228-282` retains its pre-browser ledger object through cleanup and collects only scenarios, `xero-report.ts:760-776` can preserve exit 0 after report writes fail, and `e2e/xero-browser-mutation-scope.ts:72` applies a leave-record payload to connection actions. These Plan 160 corrections must pass before admission is enabled; an adapter alone is insufficient.

**Scope**: those modules/tests, `tooling/release/consumer-isolation.ts`, protected Xero manifest/store/ledger/cleanup modules and tests, `packages/jobs/src/functions.ts`, `packages/jobs/src/client.ts`, `packages/jobs/src/handlers/xero-sync-access.ts`, and its ten registered handler modules (`schedule-xero-syncs`, `sync-xero-people`, `sync-xero-leave-records`, `sync-xero-leave-balances`, `reconcile-xero-connections`, `reconcile-xero-approval-state`, `reconcile-feed-publications`, `rebuild-feed-cache`, `recount-usage`, `send-notification-emails`) with co-located tests; `apps/api/app/api/inngest/route.ts` only where the verified revision/admission boundary requires it. Audit direct app/API dispatch callers before fixing the final allowlist. New scoped database helpers belong in `packages/database`. No production worker is enabled merely by changing the capability boolean.

1. Reuse existing manifest and binding-generation contracts. Specify a bounded E2E capability containing the exact run, both tenancy IDs, binding generation, allowed handlers/operations, expiry and candidate/worker revision. Keep database-fixture mode and its all-paused/strict-empty semantics unchanged; ordinary runner rejects E2E manifests.
2. Enforce the capability at every affected dispatch and execution boundary, including cron fan-out, queued retries and publication/notification consumers. Reject foreign, expired or stale-generation work before mutations/provider calls. Enumerate actual registered consumers, not only the seven main job names. A JSON assertion or a paused-process label is not enforcement.
3. Under Plan 160's adapter ownership, implement the runner's real acquisition adapter: verify durable manifest and exact deployed/registered revisions, acquire ownership, verify fixtures, then supply the existing lease's independent observations, provider reconciliation, terminal cleanup and restoration hooks. Extend the existing `XeroExecutionLease` contract with Plan 160's typed lifecycle collector rather than freezing its current scenario-only shape; do not create a parallel runner. Plan 160 owns child-ledger handoff, action-specific request validation, independently verified no-effect outcomes, fresh receipt producers and report-delivery correctness; this release row owns ensuring those prerequisites and runtime enforcement land together. Missing fence proof still refuses before browser/provider work.
4. Test expiry, wrong tenant/run/generation, stale deployment, queued retry after cancellation, host crash, partial cleanup and recovery without replaying creates. Drain/fence outstanding owned work before cleanup; unresolved remote effects retain recovery evidence/fence. Restore precisely the previous worker settings and independently read them back. Use existing runner/ledger fault tests as the pattern and add guarded database assertions only with registered ownership.

**Verify**: `bun run test:release-tools`, `bun run typecheck:release-tools`, affected jobs/API unit tests and the protected full inventory exit 0. The dedicated runner refuses every invalid capability and only acquires with observed enforcement. Before this work lands, expected campaign outcome is exit 2 / NOT VERIFIED, not PASS. Plan 160 owns the ensuing real campaign; supplying fixtures or credentials alone cannot close X2.

### X3: Finish lifecycle rollout with existing mandatory controls

Use the [161 charter](161-harden-xero-connection-lifecycle.md) Sections 8.3/9.3 for case-level/sign-off evidence and rollout contracts (sub-plan 161h implemented in main, archived in git history). Sub-plan DONE does not close this release row.

Refresh app/API environment inventories privately. Configure the verified commercial `XERO_APP_TIER`, immutable `XERO_CREDENTIAL_DOMAIN_ID`, matching `XERO_RATE_NAMESPACE_EPOCH`, KV pair, encryption key/version ring and registered callback before candidate admission. Preserve referenced legacy keys. Privately review namespace state and initialise conservatively using the existing `packages/xero/scripts/initialise-xero-rate-namespace.ts` only under applicable authority; never reset allowance or rotate an epoch to hide a domain conflict. The fixed 24-hour rate limit namespace waiting period was abolished on 2 October 2026 (`a4cab6b`), allowing immediate quota admission upon valid sentinel initialisation. Missing/mismatched sentinel must still deny admission. Drain every deployment still using the previous limiter before cutover.

Migrations are already recorded applied; apply only new pending reviewed migrations. Canonical owner cutover is per binding: prepare current snapshot-bound verified identity artefacts and dry-run any genuinely required backfill before an authorised apply; leave supported null-owner legacy bindings intact unless a reviewed cutover requires changing them. Do not bulk-backfill customers just to close a checklist. Keep `XERO_REMOTE_CLEANUP_MODE=report_only` and inactivity report-only; enabling destructive cleanup requires reviewed provider deletion/recovery evidence and a staffed operator procedure.

**Verify**: each actual app/API preflight passes; independent namespace/key-reference/registered-worker read-backs agree with the candidate; all 40 charter cases at their required evidence levels and Section 9.3 have explicit outcomes. Report-only configuration does not waive required controlled cleanup-contract tests or authorise production deletion. Missing production rollout/provider/browser evidence remains NOT VERIFIED.

## 8. Verify and deploy one candidate

### A. Run database-free candidate gates

Dependency installation in the verification checkout has been verified (`jose` resolves cleanly in `@repo/xero`). Run the actual type gate; do not treat the historical PASS as current or add a source workaround.

Use Bun 1.4.0, a recorded supported Node runtime, a clean verification checkout without live `.env*`, and D1's allowlisted synthetic environment. Install with `bun install --frozen-lockfile` before the network-denied phase; verify no manifest/lockfile drift. Do not borrow provider credentials to satisfy a source build. Record actual SHA/tree, command, exit, test counts/skips, runtime, duration and cache disposition.

The existing wrapper runs Prisma generation, lint, app builds, types, boundaries, unit tests and release-tool tests/types, forcing uncached Turbo tasks:

```bash
bun --no-env-file tooling/release/run-source-gates.ts
```

Expected: exit 0, no database/provider connection and no live credential inheritance. Until D1's wrapper hardening lands, the clean checkout and sanitised inherited environment are separately required; `--no-env-file` alone does not block Prisma's explicit loader. The underlying required gates remain `bun run check`, `bun run build`, `bun run typecheck`, `bun run boundaries`, `bun run test`, `bun run test:release-tools` and `bun run typecheck:release-tools`, with build preceding route-aware typechecking.

Run the following separately in that same clean synthetic environment, using the network-denial preload for code execution where compatible. If Mint needs documentation-network access, isolate that command with no provider secrets or database access and record the exception rather than disabling the database guard:

```bash
bun run --cwd apps/docs lint
bun run --cwd apps/email build
bun run --cwd apps/email export
bun run --cwd apps/email assert-render
git diff --check
```

All exit 0; email assertions inspect rendered content, not just the preview build. Review any generated-file drift. Executors may run scoped formatter fixes after source edits and rerun affected gates. This advisor review runs only plan/path/diff validation, not these application gates.

### B. Compare applied schema, then apply only pending additive migrations

The latest checked-in campaign records 23/23 migrations applied and no drift. Refresh this read-only evidence against the chosen candidate and target; do not generate replacements or reapply historical migrations. The generation steps below apply only if new source changes genuinely require a migration. Preserve existing custom SQL trigger/constraint behaviour and verify it independently because Prisma schema diff does not prove unsupported database objects.

1. Generate each schema change from the prior reviewed schema and new schema
   using **schema-to-schema** `prisma migrate diff --from-schema ... --to-schema
   ... --script`. Save the generated output as the next migration directory;
   do not hand-edit generated/applied migration files. This uses no shadow
   database. If the required constraint cannot be represented/generated under
   this policy, stop that schema step and specify the required invariant and migration approach for review. Never silently substitute a weaker constraint or reset a database.
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
evidence contains only names, status, timestamps and non-secret resource IDs. Check provider metadata before treating values omitted from sensitive environment downloads as absent. Compare Production/Preview/Development database and KV identities privately; do not assume a preview is isolated. Refresh the exact target, restore point and consumer state before any authorised write.

| Provider | Complete now | Passing evidence |
| --- | --- | --- |
| Vercel | Identify app/API/web project roots, domains and actual runtime; configure explicit early access and common URLs | Three corrected preflights against separate actual production environments |
| Neon | Confirm project/branch, role, restore capability and scoped tests | Applied checksums, zero post-deploy drift, safe fixture cleanup and intact data invariants |
| Clerk | Production instance, custom roles, personal accounts disabled, restricted admission, origins and webhook signing | New owner admitted to own account, member provisioning replay and four-role checks |
| Xero | X1 approved AU transition contract; X3 tier/domain/epoch, initialised sentinel, compatible keyring and callback; sanctioned AU fixture companies/people | Initial sync and approved synchronous write/recovery journeys with independent remote final-state evidence; report-only production cleanup preserved |
| Inngest | Event/signing keys, signed registration and actual `packages/jobs/src/functions.ts` registry served by `apps/api/app/api/inngest/route.ts`; X2 enforced E2E isolation | Signed introspection, matching candidate/worker revision, visible functions and exact owned terminal executions/retries; strict-empty synthetic isolation is not job readiness |
| Resend | Runtime token, verified sender/domain and private application recipient | Controlled application and notification accepted and received; failure alert delivered |
| KV | Required app/API pairs, feed cache and application abuse controls | Cache miss/rebuild/hit/ETag and rate-limit checks using owned fixtures |
| Sentry | DSN, upload credentials/integration and distinct projects | Candidate release/source maps and symbolicated safe server/client test events plus alert receipt |
| Better Stack | Complete advertised status integration or explicitly disable absent group; configure actual resources and monitors | Status reflects a real check, alert delivered, no partial config or fabricated healthy state |
| Stripe | Always ship C3; configure catalogue/webhook/return URLs only for paid mode | Early access denies checkout server-side; paid mode additionally passes Section 9 |
| DNS/support | Correct TLS/domains, support mailbox and escalation destination | Public routes resolve, mail received and support simulation completed |

Prepare one candidate SHA/tree after integration. Run source gates, then make
the authorised push of a reviewed candidate branch so the protected release
workflow can check out that exact SHA. Candidate publication does not authorise
production deployment. Compare schema, apply only pending reviewed migrations, run guarded integration and project
preflights before production promotion. Refresh consumer isolation at each stage; the earlier strict-empty proof expires when workers are registered. Use X2 enforcement for E2E, not the completed database-fixture manifest. Fast-forward the release branch to the
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

**Current source**: `tooling/release/playwright.config.ts`, `tooling/release/e2e/`, fixture/cleanup helpers and root `test:release` already exist. They are incomplete release coverage. `chromium-core` currently discovers dedicated `xero-*.spec.ts` files, Firefox/WebKit run only one read-only shell test, admission expects a removed redirect, and the admin sync test accepts queue acknowledgement.

**Remaining scope**: both Playwright configs and relevant existing specs; `e2e/environment.ts`, `fixture.ts`, `global.setup.ts`, `global.teardown.ts`, ownership/ledger/provider-observer helpers and tests. Reuse installed `@playwright/test` and `@clerk/testing`; use current Context7 guidance if their API contract changes.

1. Make generic and dedicated Xero inventories explicit and disjoint. Generic `test:release` must not accidentally discover dedicated Xero specs. Move/consolidate old generic payroll mutation assertions into the corresponding Plan 160 scenarios rather than execute the same payroll action twice or bypass its guard. Add discovery/config regression tests; no mandatory skipped case can yield a programme PASS.
2. Replace `admission.spec.ts`'s redirect assertion with G1's rendered Clerk restriction and real first-owner invitation/Organisation-creation journey. Keep separate isolated contexts per role, exact owned record selection and verified session/Organisation identity before mutations.
3. Replace `admin-and-roles.spec.ts`'s `/Sync (queued|succeeded|completed)/` success test with an exact owned run observer. Require the requested run to start after campaign start, reach successful terminal status, persist expected rows and update the UI. A prior successful run or queue acknowledgement fails this criterion. Use Plan 160's existing observer, not an unscoped latest-run query.
4. Enumerate every row of the journey matrix below against an actual test or reproducible manual evidence step. Add missing tests, including feed rotation/privacy/cache, notifications/SSE, holiday overrides, first-owner provisioning and rollback observations. Record project/scenario coverage rather than claiming the scaffold covers it. Exercise nonmutating core interactions in Firefox and WebKit, not only shell loads; execute payroll mutations once in guarded Chromium and reuse read-only state for other browsers/viewports.
5. Reconcile generic fixture setup/teardown with X2's verified ownership and consumer contract before worker-dependent mutations. Database-fixture and E2E runs have distinct manifests/lifetimes; never reuse a cleaned database manifest or pretend consumers are paused while executing jobs. Refuse source/deployment/worker mismatch, foreign IDs, stale fixtures or unresolved previous effects. No direct Playwright invocation may evade the protected payroll runner.

**Verify**: release-tool unit/type checks pass; discovery regression proves disjoint inventories and accounts for every required scenario. Once fixtures, authority and X2 are actually ready, `bun run test:release` runs generic journeys against explicit candidate URLs. The dedicated command is:

```bash
bun --no-env-file tooling/release/run-xero-e2e.ts --manifest "$TC_XERO_MANIFEST" --preflight
bun --no-env-file tooling/release/run-xero-e2e.ts --manifest "$TC_XERO_MANIFEST" --output "tooling/release/test-results/$TC_XERO_RUN_ID"
```

Load necessary credentials privately through the reviewed environment contract; paths/IDs above are operator-supplied. Preflight is diagnostic, not a successful journey. The real runner returns 0 only for overall PASS, 1 for FAIL and 2 for NOT VERIFIED/incomplete; before X2 is implemented it must refuse. Use its `--recover` mode for an interrupted owned run, never replay uncertain creates. Reports include every Plan 160 subcase and linked 161 evidence level. Do not mock provider success in LIVE cases; CONTROLLED fault evidence remains explicitly labelled.

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
| Payroll | Separate controlled records cover the approved X1 transition table for submit, approve, decline and withdraw; each applicable remote ID/status or independently observed absence is reconciled. Ambiguous submit cannot issue another create; resolution completes without duplicate canonical publication |
| Feeds | Create, display/copy the exact URL, named/masked/private projection, all-day/DST boundaries, stable UID and material-change SEQUENCE, cache/ETag, revoke/rotate and old-token rejection pass |
| Calendar clients | Subscribe and parse events in Outlook, Google Calendar and Apple Calendar; record initial event and subsequent fetch/update evidence. Do not promise immediate client refresh or wait idly for an unspecified polling interval |
| Jobs | Enumerate actual registered functions, including email/usage/supporting jobs; every relevant handler has terminal-state, retry and per-record isolation evidence. Queue acknowledgement alone fails |
| Notifications | In-app and SSE reconnect delivery, per-user/per-tenant isolation, email receipt, preferences/unsubscribe and recovered email backlog pass |
| Holidays | AU source import, location assignment, manual working/non-working override and calendar/feed projections agree |
| Billing | Early access refuses direct checkout/portal operations and hides payment CTAs. If paid: repeated/concurrent checkout creates one subscription, mirror/replay, entitlements, portal and cancellation pass |
| Analytics/privacy | Successful milestones appear once with correct association; no application content, leave data, tokens or raw provider material in events/logs/traces |
| Recovery/support | Failed job/webhook/email alerts reach the owner; support issue is received/responded to; rollback to the named compatible build restores healthy service |

Browser matrix: run guarded mutation journeys in Chromium and core read-only interactions in Chromium, Firefox and WebKit; public/app
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
build and verify health. Never roll back to silent rebinding, independent refresh-token rotation, missing durable submit guards or fail-open rate limiting. Do not restore stale refresh tokens from backups. Additive database changes remain and are forward-fixed
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

- [ ] Every C, D, R, P, G, T and X item is implemented and its named regression checks pass. No confirmed bug is closed by relabelling it P2 or deferred.
- [ ] All source gates, all guarded integration workspaces and all mandatory deployed journeys pass for the final candidate; skips have explicit scenario disposition and no required coverage is skipped.
- [ ] App/API/web are healthy at the same candidate SHA; corrected preflights reflect each actual production environment.
- [ ] Migration history/checksums, post-deploy drift and scoped data invariants pass; no unowned fixture writes or unintended active remote test artefacts remain.
- [ ] C1 has registered real-database concurrency/expiry/recovery evidence plus controlled provider proof; C6 manager empty/missing-scope denial passes in source and deployed journeys.
- [ ] X1 approved AU transitions, X2 enforced worker admission/acquisition and X3 lifecycle rollout are complete; Plan 160 reports all 26 scenarios/92 current subcases, and the 161 charter accounts for all 40 cases/93 current required evidence levels. Updated catalogues, not stale counts, define final coverage.
- [ ] D1 ordinary/protected CI separation is exercised remotely; T1 inventories are disjoint, Clerk admission uses the current flow and queued sync cannot pass as terminal success; P3 exports complete bounded results.
- [ ] AU is the only enabled payroll region; complete authorised feed URLs remain usable; Xero remains authoritative for balances.
- [ ] Application, first-owner admission, support delivery, observability/alerts, credential remediation and rollback work in practice.
- [ ] Any paid-only gate is PASS if paid, or explicitly NOT APPLICABLE because actual mode is early access. C3 source fixes are never waived.
- [ ] Readiness report states READY with links to evidence, no mandatory UNKNOWN/NOT VERIFIED and no unresolved P0/P1 defect. The intentional exclusion of fresh-database construction is disclosed separately.
- [ ] Implementation diffs are reviewed, authorised integrations completed, unrelated changes preserved and temporary development processes/worktrees cleaned up appropriately.

An unavailable credential or unresolved dangerous live outcome can prevent a
truthful READY decision. It must not prevent completing the other work. Report
the precise uncompleted action and continue it when authority/access exists;
never replace missing proof with a waiver or a fabricated result.

### STOP conditions

Stop only the affected action and report the exact evidence needed when:

- The approved AU transition contract (`au-contract-v1`) conflicts with current provider evidence. Do not invent payroll semantics.
- A target, tenant/run/generation, namespace domain, credential snapshot, migration checksum or deployed/worker revision differs from its reviewed manifest. Do not alter a guard, token, epoch or manifest to make a check green.
- Fixtures are unowned, durable recovery evidence is missing, or a remote outcome/consumer state is unresolved. Preserve the fence/ledger and reconcile through the existing recovery path before new mutations.
- A required code change exceeds the stated item scope, or verification fails twice after a bounded fix attempt. Reconcile the affected plan/contract; continue unrelated authorised work.
- A concrete external action lacks authority. Finish its reviewable preparation and request only the missing action, identifying any actual approval-review rejection. Historical rejections are not fresh rejections.

### Maintenance notes

Future submit changes must preserve durable uncertainty across every writer and inbound sync. Billing state, health and replay tests change together. Holiday/status changes update predicate/oracle tests. New integration suites update inventory, allocator and cleanup in the same commit. New worker consumers update X2 enforcement and terminal-drain proof. Launch variables/public CTAs/analytics update runtime, preflight and deployed checks together. A docs-only merge may reuse source proof only after recording exact input equivalence; it never refreshes deployment or provider state.

## 11. Current execution ledger and historical evidence

### Review completed, 2 October 2026

- [x] Reconcile source claims and commands against `6005a5a`.
- [x] Confirm runtime/test/config inputs match recorded `5d2e57b` evidence.
- [x] Separate source presence, recorded tests and unexecuted production proof.
- [x] Retain C1 database coverage, P3 export, D1 CI and G1/T1 gaps as executable work.
- [x] Reconcile AU transition contract (`au-contract-v1` approved on 2 October 2026, merged at `bf01911`).
- [x] Update migration count to 23 applied migrations across all evidence tracks.
- [x] Record abolition of the fixed 24-hour rate limit namespace waiting period (`a4cab6b`).
- [x] Add Plan 159/160/161 ownership, AU decision and actual worker-acquisition dependencies.
- [x] Preserve historical evidence below without treating it as the current queue.
- [x] Complete cold plan review; remove cyclic completion dependencies by separating preparation, deployment and campaign sign-off.
- [x] Check all local Markdown links, existing/new path references, balanced structure and `git diff --check`; no application/live gate was rerun by this review.

Update the Section 2 rows and the table below during execution. A row becomes DONE only when source, relevant regressions and required live evidence pass. Evidence status is PASS, FAIL or NOT VERIFIED; paid-only NOT APPLICABLE requires actual early-access mode. Record exact SHA, command/counts, timestamp, private evidence reference and next action. Never copy secret values, auth state, applicant details or raw provider payloads here.

| Evidence track | Current disposition | Next required result |
| --- | --- | --- |
| Source gates | RECORDED PASS at `5d2e57b`; scoped source equivalence checked; `jose` dependency resolved | Fresh uncached gates after remaining source changes |
| Guarded online database/Redis | RECORDED PASS, 27 files / 246 tests, 23 migrations applied, zero residue; see reconciliation record | New C1/other registered cases and final-candidate full campaign with fresh identity/restore/consumer evidence |
| Production inventory | Last recorded READY deploys are older `11ce7e7`; no fresh provider inspection in this review | Actual metadata/preflights, X3 activation and same-candidate deployments |
| Provider/browser/charter | NOT VERIFIED; diagnostic has no real campaign execution | X2 enforcement, sanctioned fixtures/roles, complete Plan 160 and 161 case evidence |
| Release CI | IN PROGRESS; source workflow still uses disposable database, protected workflow absent | Reviewed current patch, applicable persistent-action authority and remote execution |
| Support/security/rollback | NOT VERIFIED; September 19 records are leads | Current receipts, credential-remediation proof, final-lockfile reachability audit and compatible rollback rehearsal |
| Final release | TODO | Exact deployed candidate, completed mandatory gates, actual release date and READY report |

### Historical record, 19 September 2026

The following record is preserved for provenance only. Its commit/runtime/test counts, pending migrations, deployments, approval/access state and imperative wording are superseded by Sections 1–10 and the current ledger. Do not execute commands or request old approvals merely because they appear below. Temporary evidence paths may no longer exist; if an artefact is unavailable, refresh the affected proof rather than invent it.

<details>
<summary>Expand the original September 19 execution and review record</summary>

Execution started 19 September 2026 on `codex/go-live-candidate` in
`/home/hilton/.codex/worktrees/australian-go-live/teamcalendar`.
Source drift from `80ac9f7` was empty at dispatch. The full consolidated plan
was supplied through its shared absolute filesystem path rather than the older
committed worktree copy. The advisor reviews; the separate executor edits source.

The user explicitly instructed: "Use the live database. Continue. Do not block".
This authorises live Neon testing without another permission request. Target
verification, fixture ownership and cleanup are execution work, not reasons to
request the same authority again. No reset or development seed replacement is
part of that testing.

The following ledger was the active ledger on 19 September; it is now historical. A row is DONE only when its
behaviour, regression checks and applicable live proof pass. Allowed status:
TODO, IN PROGRESS, DONE, or WAITING ON EXTERNAL ACTION with the exact action.
Keep secrets, applicant information and customer data out of this file.

| Work | Status | Commit / command result / evidence |
| --- | --- | --- |
| D1 | IN PROGRESS | Foundation `67cc976`, runner/fencing revisions through `2fef06d`, allocator `c6bfedb` and remaining suites `8810ef1`. Advisor inventory confirms all 21 integration suites use the manifest allocator with no direct dotenv loader or skip wrapper. Revision `eda8fcf` restores real seed function and plan-sync coverage through owned input data, preserving default inputs. `1bc9c64` adds outside-owned catalogue comparison; `92d46ea`/`9baa427` persist and retain the immutable per-run baseline across crashes. Earlier advisor live Neon rollback checks passed 3/3 with no residue. Three additive migrations are pending; full guarded fixture, consumer pause and cleanup proof remain due. |
| C6 | IN PROGRESS | Source commit `0526f5d` reviewed; advisor independently passed 42 service tests and 65 Plans/People UI tests. Deployed role proof pending. |
| C1 | IN PROGRESS | Source review approved through `ef66d86`: durable request snapshot/fingerprint, atomic writer fencing, prepared recovery, verified attach/not-created resolution, resumable merge cancellation and shared normal/recovery completion. Advisor passed 39 submit/recovery/helper tests plus 5 notification dispatch tests. Transactional submit notification persists inbox/email but suppresses pre-commit SSE; browser visibility and guarded live concurrency/provider recovery proof remain required. |
| C2 | IN PROGRESS | Source retries partial membership provisioning and supplies deterministic event UUID plus stable verified timestamp. Advisor passed 25 route/abuse/auth tests; real server SDK transport regression exists. Complete deployed partial-retry/event-cardinality proof remains due. |
| C3 | IN PROGRESS | Source review approved through `b502b28`: authoritative same-second Stripe snapshots may repair equal timestamps, concurrent insertion collisions trigger authoritative retrieval, and unsuccessful repair cannot become processed. Advisor passed 32 payment webhook and 19 billing query tests. Live replay/ordering proof remains due. Rolling API back to the old receipt schema behaviour requires preserving failed-receipt inventory and forward repair/replay. |
| C4/C5 | IN PROGRESS | Source commit `0526f5d` reviewed; advisor independently passed 11 email queue, 2 handler and 36 API route tests with Bun 1.4.0. Deployed email proof pending. |
| R1/R2/R3 | IN PROGRESS | Source commit `42537a0` reviewed. Advisor passed 35 preflight/launch-mode and 10 observability tests; installed Sentry 10.75.0 config export resolves. Actual project preflights and symbolicated event pending. |
| P1/P2/P3 | IN PROGRESS | Guarded fixture regressions added in `4a328be`; read-only live P2/P3 evidence and holiday predicate fix `816b181` are recorded below.  P3 revision `504d1e5` replaces Prisma client-side distinct with fixed per-type findFirst queries and aggregate counts; reviewer passed service/recovery tests 16/16 and sync UI tests 14/14. P1/P2 `2b2c3f5` adds bounded keyset pages and batched hydration; advisor independently passed 93 focused tests. Revision `1f0f723` fixes holiday-only applicability and visible Plans window/empty-state copy; advisor passed 63 revised service/status tests plus 4 Plans server tests. Guarded predicate/oracle parity and actual query counts remain due. Deployed query/payload proof remains pending. |
| P4/P5 | IN PROGRESS | Source sanitisation corrected in `b77f707`. Advisor real Chromium/PostHog transport check delivered four expected events with zero query/fragment markers or browser errors. Turbopack comparison confirms Clerk client parts removed from public routes and PostHog deferred from the synchronous app graph. Final deployed browser network and candidate consistency proof remain due. |
| G1 | IN PROGRESS | Application/private Resend/HMAC-backed KV receipt flow implemented. First activation milestones use durable timestamps and tenant/organisation-scoped identities; first feed access preserves hourly usage updates. Advisor passed 34 feed rendering and 2 job activation tests. Delivered application, complete initial sync and separately admitted first owner proof remain due. |
| G2/G3 | IN PROGRESS | Provisional public identity material and obsolete region/access claims being removed; support and rollback proof pending |
| T1/T2/T3 | IN PROGRESS | Final tooling revisions through `b483535` add pre-mutation fixture/session ownership and provider fingerprint/remote-state verification; advisor passed 29 release-tool tests.  T2 commit `344f749` reviewed: advisor independently passed docs broken-links, email production build, export and 3,961-byte/two-link render assertion. First-party Node types align with Node 22. Browser suite scaffold now exists; reviewer requires exact owned record selection, isolated role contexts, provider final-state reconciliation and first-owner admission coverage before mutation runs. Production runtime and remote CI proof pending. Persistent release workflow rejected by automatic approval review and remains unapplied. |
| O1 | IN PROGRESS | Live Neon read-only identity checked, 12/12 applied migration checksums match base with no pending migrations. At `54f8df5`, API `dpl_4sh5z6nG9AJa4ZEVdRQT9PBUWr92` READY; app `dpl_7GeUDMUW4Dh22kL8AHs2Gbw6cdUT` and web `dpl_BEuv9DgKB4NsrizCwvfZ9zaCZqMg` ERROR. API Inngest GET 500 confirmed by runtime log: missing signing key. |
| External security | IN PROGRESS | Fresh remote mirror at `54f8df5`, Gitleaks 8.30.1 checksum verified, all-ref scan: 1,571 commits, exit 1, 29 redacted findings. Historical `.mcp.json` credential remains reachable through 114 pull refs (no current head/tag). Rotation and GitHub retained-ref/cache purge remain unverified; other findings require fixture/example triage. No secret values reproduced. |
| Final release | TODO | Candidate SHA/tree, launch date and READY report |

### Provider execution, 19 September 2026

Vercel CLI login is now verified as `hiltonbrown`. Build logs for the failed app
and web deployments confirm incomplete Better Stack configuration. Initially
applied the existing complete trio to app/web, then inspected actual resources:
the page contains only an unrelated paused `hiltonbrown.com.au` monitor, not
Team Calendar's five advertised components. Selected the plan's explicitly
allowed disabled-integration option, removing the complete Better Stack group
from production on all three projects. Original values remain privately backed
up and unrelated provider resources are untouched. Public status tests pass 9/9:
missing configuration remains unknown with no hosted-page link or invented check
time. Sentry/Inngest alert proof remains required.

Explicit `NEXT_PUBLIC_LAUNCH_MODE=early_access` was applied to all three projects.
These environment changes still require final-candidate deployments.

Current production aliases were read back from Vercel: app points to READY
`dpl_GRZrokHhhVvcT3FKRUhSgwfykj1M`, web to READY
`dpl_ENreo5KaNud6ewdezntVs2kiJczq`, both at
`a75bcbaeba958429c8aa222e68d55c232e2213fe` (29 August). API points to
`dpl_4sh5z6nG9AJa4ZEVdRQT9PBUWr92` at `54f8df5`. These are recorded
rollback candidates, not a completed rollback rehearsal or compatibility proof.

Resend's existing production account had no sending domain. Created
`teamcalendar.online` (sending enabled, receiving disabled), added its four
provider-required DKIM/mail-from DNS records through Vercel DNS, and confirmed
all four records and the domain are verified. Existing DNS records were retained.
Set API production `RESEND_FROM=notifications@teamcalendar.online` and generated
a server-only `EARLY_ACCESS_APPLICATION_HMAC_SECRET` directly into sensitive
Vercel storage. Private
application recipient and controlled delivery receipt remain pending.

The existing local Stripe credential was checked without printing it: it is test
mode and lists zero webhook endpoints. Production retains its existing sensitive
Stripe credential; no test key was substituted. Production webhook signing
configuration and live paid/replay evidence remain unverified.

Live Clerk Backend API access is verified. Organisation selection is enforced,
but only default admin/member roles exist and the creator role is currently
`org:admin`; the required owner/manager/viewer roles and creator-role configuration
are being reconciled. Public Clerk FAPI reports sign-up mode `restricted`,
confirming invitation-only access is already configured. Production role creation was rejected by Clerk with
`unsupported_subscription_plan_features` (`org:roles`): the B2B Authentication
add-on is required. Config schema access also requires a Clerk account login.
Both provider actions were requested asynchronously; no customer membership was
changed. The live database testing authorisation remains unchanged.

### Browser-confirmed admission correction

Chromium 153.0.8010.12 on 19 September loads the current public site with HTTP 200
and no console/page errors. App sign-in and sign-up return HTTP 200 but repeatedly
block `clerk.teamcalendar.online` scripts under CSP; no Clerk form renders.
Candidate `apps/app/proxy.ts` still allows only Clerk development/vendor domains.
Extend the existing policy with the validated configured Clerk frontend origin
for the necessary script/connect/frame directives, preserving nonce protection.
Candidate fix derives the exact configured frontend origin from the publishable
key without widening the policy to arbitrary custom domains. Advisor passed
18 proxy tests. Rendered Clerk form readiness is asserted in the maintained
browser suite; deployed proof remains required.
This is a confirmed G1 admission defect; HTTP status alone cannot certify it.

### Resumed verification, 19 September

Independent live read-only verification advanced P3: with PostgreSQL
`default_transaction_read_only=on` verified before reads, 82 existing sync runs
produced a 16-query/872-byte overview. History pages requested at 1, 50 and 200
returned 1, 50 and 82 rows using 2, 3 and 3 actual emitted SQL queries. Evidence:
`/tmp/teamcalendar-production-env/sync-monitor-readonly-proof.json`.

The same live read-only approach found a confirmed P2 defect after source gates
passed: an AU/Brisbane organisation with no locations and no applicable holiday
has 23 people displaying `available`, yet `public_holiday` filtering returned all
23 instead of zero. The empty holiday `OR` predicate is not a reliable false
condition when nested in Prisma filters. Revision `816b181` corrects the predicate
with an explicit impossible ID filter and adds unit plus guarded integration
regressions. The advisor reran the exact live read-only check: all 13 status
filters now match the unfiltered status oracle, including zero holidays and
23 available people. Page sizes 1/50/200 return 1/23/23 rows with exact total 23
and 10 emitted SQL queries each. Private passing evidence:
`/tmp/teamcalendar-production-env/people-readonly-proof.json`. Private sanitised counts and SQL text
are in `/tmp/teamcalendar-production-env/people-parity-diagnostic.json`. No data
was modified. Final clean candidate
`816b1811423b32793e0c33eeec48baee08b9e310` passed a fresh forced Node 24.21.0
source wrapper: app/API/web builds, lint, types, boundaries, 2,231 unit tests
across 17 workspaces, 29 release-tool tests and release-tool type checking.
No Turbo tasks were cached. Evidence:
`/tmp/teamcalendar-source-gates-final-816b181-node24.log`.
Independent affected Node 22.23.2 checks passed 433 availability tests and
29 release-tool tests, both exit 0. Evidence:
`/tmp/teamcalendar-final-816b181-node22-availability.log` and
`/tmp/teamcalendar-final-816b181-node22-release.log`.

Clean candidate `bd5f4abd7fe5b2d2c304bcaf028aabe268c35efe` passed the complete
Node 24.21.0 source wrapper with forced uncached builds: app/API/web builds,
workspace type checks, boundary checks, 2,230 unit tests across 17 workspaces,
26 release-tool tests and release-tool type checking. Terminal exit 0 was
recorded at 11:15:33 AEST in
`/tmp/teamcalendar-source-gates-final-node24.log`. Build verification also fixed
the API Stripe module import and an email-template package boundary. The guard
now permits only identified compiler IPC while retaining external network and
database denial. Independent Node 22.23.2 verification also passed (exit 0), including the same
2,230 unit and 26 release-tool tests, recorded in
`/tmp/teamcalendar-source-gates-final-node22.log`. During that run `9aca56e`
updated only `tasks/todo.md`; direct Git comparison confirms no source, lockfile
or configuration changes from verified `bd5f4ab`. No rebuild was repeated for
that documentation-only change. These results do not certify production deployment.

Candidate `b77f707` fixes the real PostHog identity-envelope URL leak. The advisor
rebuilt the candidate instrumentation and ran installed `posthog-js` 1.434.0 in
Chromium with all network requests intercepted and artificial query/fragment
markers. Four real serialised events were delivered: identity, group identity,
one initial page view and one navigation page view. No marker remained in any
payload, including envelope-level `$set_once`, and no browser error occurred.
The only SDK test override disabled automated-browser suppression; capture,
`before_send` and transport serialisation were real. Maintained regression
`be12d0e` now bundles the unchanged application source and reproduces this check
with all four expected events, zero marker leakage and zero browser errors.
Run `PLAYWRIGHT_BROWSERS_PATH=/tmp/teamcalendar-playwright bun run
test:release-analytics-privacy`; evidence is also retained under
`/tmp/teamcalendar-analytics-browser-release/`. Private evidence is in
`/tmp/teamcalendar-analytics-browser-fixed/requests.json` and `result.json`.

D1 has a central allocator with disjoint suite tenant slots and manifest-owned
global plan/event keys. All 21 suite files now call the allocator. Review caught
a seed test that exercised a test-only replacement instead of the production
seed function. Revision `eda8fcf` restores real seed and plan-sync execution
with owned organisations, people, locations and plan limits. Earlier source
wrapper formatting/import failures were corrected; the final source gates above
pass. The full 21-suite guarded live integration run remains pending protected
execution, durable KV fencing, provider configuration and additive migrations.

T1 runner commit `d7c0417` is not approved for live browser mutations. Direct
review still found first matching record selectors, ambiguous submission accepted
as success, premature reconciliation without provider cleanup, and corrupt
journey ledger reads treated as empty. Corrections through `a32aa5e` and `38b98ca` address ambiguity handling, exact
existing-record selectors and ledger read/write handling. Review then found
new-record selectors based on notes absent from the table, and fresh browser
contexts missing base URLs/error observation. Revision `d123f72` fixes these
with guarded exact correlation lookup and error observation on role contexts.
Revision `8e985d1` adds pre-mutation fixture/session ownership validation and
explicit organisation selection. Revision `b483535` adds provider verification
against immutable submit fingerprints, exact remote identity and canonical
state, including no-second-create assertions. These helpers pass the final
29 release-tool tests. Actual provider-side browser journey evidence is still
required; passing helper tests do not establish completed live recovery.

### Review decisions and rejected findings

The advisor decoded the installed Next.js Turbopack analyser format for matching
baseline (`0526f5d`) and candidate builds. On home/about/pricing, Clerk client
module parts dropped from 65 (110,455 raw bytes; 34,964 summed compressed-part
bytes) to zero. PostHog was reachable from the baseline app entry's synchronous
dependency graph and is only an asynchronous dependency in the candidate.
Home-route client module parts totalled 2,678,373 raw / 1,181,555 compressed-part
bytes before and 2,533,524 / 1,133,010 after. These include asynchronous chunks and
are analyser module metrics, not measured initial browser transfer sizes.
Final browser network verification and final-candidate consistency remain due.

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
  production. The initial advisory review changed no source or provider settings;
  subsequent execution and authorised provider changes are recorded above.

### Maintenance notes

Future changes to submit retries must preserve durable uncertainty across every
writer and inbound sync. Billing changes must update delivery-state predicates
and entitlement-health tests together. Status precedence or holiday rules must
update P2 query parity tests. A new integration suite must join D1's inventory
before it can run. New launch modes, provider variables, public CTAs and analytics
events must update runtime validation, preflight and deployed release checks in
the same change. Recheck these invariants when reviewing the final diff.

Final lockfile audit on 19 September still exits 1 with the same seven package
groups (`deepmerge-ts`, `esbuild`, `extract-zip`, `hono`, `mysql2`, `qs`, `sharp`).
Retain the reachability dispositions in candidate
`tasks/release-dependency-audit.md`; do not call this audit a pass. Fresh private
output: `/tmp/teamcalendar-release-scanner/dependency-audit-final.json`.

</details>
