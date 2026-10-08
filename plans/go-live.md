# Plan 000: Ship Team Calendar's Australian release

> **Executor instructions**: Read this document completely before starting. Use `codex/` branches or worktrees. Follow the exact step sequence. Run every verification command. Never skip assertions or leave unresolved questions. Maintain this document as execution progresses.

## Drift check

Baseline commit: `604d754`
Command to verify tree is clean of unexpected changes:

```bash
git diff --stat 604d754..HEAD -- apps packages scripts tooling .github package.json bun.lock turbo.json PRODUCT.md
```

If scoped diff is non-empty, compare affected source/contracts and reconcile the affected step before proceeding. Stop only that step when its product or safety contract changed; continue independent authorised work.

## Status

- **Status**: IN PROGRESS. Production readiness remains NOT VERIFIED.
- **Documentation reconciled**: 7 October 2026 against the approved Xero simplification; exact-candidate gates remain separately recorded in `tasks/todo.md`. Live Xero credentials are unavailable, so all live provider journeys are **NOT VERIFIED**.
- **Priority / effort / risk**: P0 release programme, L, HIGH for payroll and live operations.
- **Default**: Australian, invitation-only `early_access`, configured explicitly in each deployed project. Paid mode adds the billing journey; NZ/UK activation and new connectors are out of scope.
- **Result**: app, API and web serve one reviewed candidate; admitted customers complete onboarding, leave decisions, Xero reconciliation and calendar subscription; every mandatory gate has attributable passing evidence.
- **Database policy**: ordinary CI uses its configured disposable local PostgreSQL with localhost-only guards; authorised release evidence against Neon uses the protected manifest/ownership runner. Local CI PASS is not Neon/provider PASS. Never point a local guard at Neon or reset, development-seed, `db push`, rebaseline or `migrate dev` against the live target. Synthetic build URLs are validation inputs, never test databases.
- **Plan ownership**: this file owns the wider release programme. [Plan 160](160-xero-end-to-end-verification-and-report.md) owns the bounded AU flow; the [approved simplification design](../docs/superpowers/specs/2026-10-07-xero-simplification-design.md) and [implementation plan](../docs/superpowers/plans/2026-10-07-xero-simplification.md) own the canonical Xero model and Task 13 verification. Removed implementation plans remain in Git history.

## Why this matters

Team Calendar's Australian release programme coordinates the final verification, hardening, and deployment gates required to ship the Australian edition safely into production. It orchestrates across seven distinct workstreams: source isolation and protected runner governance (D1), concurrency control and durable write recovery (C1-C6), performance and query bounding (P1-P5), customer onboarding and public truth (G1-G3), browser journey suites (T1-T3), bidirectional Xero payroll sync and lifecycle enforcement (X1-X3), and production deployment verification (O1).

Rigorous gate enforcement ensures payroll safety, Clerk organisation isolation, reliable ICS calendar feeds, and zero-residue test fixtures, ensuring that customer data and live payroll state in Xero remain strictly protected.

## 1. Execution contract

This review updates planning files only. It does not authorise deployment, payroll writes, customer backfills, provider messages, destructive remote cleanup or permanent production CI access. Reuse applicable existing authority during execution; prepare any still-unauthorised action completely before requesting its specific approval. Continue independent work while an external action is unavailable.

### Working rules, scope and drift

Read `PRODUCT.md`, `DESIGN.md`, `.impeccable.md` and relevant tests. Preserve both tenancy keys, Xero-owned balances, synchronous writes, full authorised feed URLs, scoped selected connections and fail-closed shared quotas. Canonical authorisations are the only credential owners. Disconnect deletes the exact remote connection before local teardown and preserves sibling connections.

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
git diff --stat 604d754..HEAD -- apps packages scripts tooling .github package.json bun.lock turbo.json PRODUCT.md
git diff --stat -- apps packages scripts tooling .github package.json bun.lock turbo.json PRODUCT.md
```

Compare affected excerpts and test contracts if these paths changed. Resolve ordinary drift locally; stop only the affected step if its safety or product contract changed. Use scoped `codex/` branches/worktrees, conventional commits and sequential integration. Do not push, merge or deploy without applicable authority. Executors track progress in the ledger below and `tasks/todo.md`, preserving history; this review does not edit task files.

### Evidence established by this review

This was a source and plan review, not a fresh release test run. Baseline `604d754` includes merged sync completeness, execution lifecycle, person reconciliation, initial sync and calendar freshness implementation from candidate `4bb6fca`. The previous baseline's source-equivalence claim is obsolete: dependency and application changes since `6005a5a` require candidate-specific verification. The retired Plan 159 ledger recorded lint/build/type/boundary/unit/release-tool PASS at `4bb6fca`; those are historical execution reports, not independently rerun proof here. Its production round trip was explicitly NOT VERIFIED.

The historical reconciliation record (preserved in git history; see `plans/README.md`) reports source candidate `5d2e57b`: 2,810 repository tests, 395 release-tool tests, build/type/lint/boundary gates, and protected online Neon/Redis run `21e2bdb1-ea5b-4acd-ac8f-f484130731ce` with 27 files / 246 tests. It records 21 migrations applied, zero drift, 39 zero-residue selectors, released fence and unchanged outside-owned row content. Do not recreate or reapply historical migrations.

That same record reports production app/API/web READY at older commit `11ce7e7`, missing lifecycle configuration names, and zero registered Inngest apps at its last read. These are dated provider observations, not live facts refreshed by this review. The historical diagnostic recorded no live provider execution and unverified wider journeys. Its report is absent from this checkout; Git history preserves the dated account. No production or provider PASS is inferred from the database inventory.

### Review findings and disposition

Entries below distinguish confirmed source gaps from removed stale instructions. Effort includes tests; risk describes the required change; confidence is HIGH for the inspected source patterns, not for deployed behaviour.

| Finding | Impact | Effort / risk | Evidence and disposition |
| --- | --- | --- | --- |
| Historical defects and pending migrations read as current work | Repeats completed changes and obscures remaining gates | S / LOW | Current implementations in Sections 4–7 and reconciled plans; replace defect claims with preservation and closure criteria |
| C1 lacks a registered real-database uncertainty/concurrency regression | Aggregate integration PASS cannot prove one approval create or safe remote-operation recovery after the replay cutoff or crash | M / HIGH | `packages/database/src/queries/outbound-operations.test.ts:11` mocks transactions; current registered suites do not provide the named competing-client/lease-expiry/restart uncertainty assertions; add owned coverage under C1 |
| Protected release workflow is absent; local and protected-only suites need explicit routing | Ordinary local-CI evidence cannot establish owned Neon proof | M / HIGH | `.github/workflows/ci.yml:28,119`; preserve supported local CI and finish D1 protected routing |
| CSV export still caps/materialises 50,000 rows and points to no full-export API | P3's complete bounded export criterion is not implemented | M / MED | `packages/availability/src/sync/sync-monitor-service.ts:913-945`; complete P3, do not close it as deployed-proof-only |
| Acquisition and browser assertions target obsolete behaviour | Tests miss the actual public form and expect a removed sign-up redirect | M / MED | Contact client posts `/api/contact` at `apps/web/app/contact/components/contact-page-content.tsx:116`; `tooling/release/e2e/admission.spec.ts:8` expects redirect; fix G1/T1 |
| Generic browser suite also discovers dedicated Xero specs and accepts queued sync | Wrong runner context and false terminal-success evidence | M / MED | `tooling/release/playwright.config.ts:18-21`, `tooling/release/e2e/admin-and-roles.spec.ts:24`; separate inventory and observe terminal runs |
| Live Xero credentials unavailable | Documentary contracts and source/integration tests cannot prove live OAuth, consent, import, mutation, refresh or disconnect | L / HIGH | Record all unexecuted provider journeys as NOT VERIFIED; proceed with approved source and local integration work |

## 2. Current queue, priorities and dependencies

`SOURCE PRESENT` means the implementation was located, not that every acceptance test or deployed journey passed. `RECORDED PASS` refers only to the named historical evidence. No row closes without its remaining evidence. Dependencies are phase-specific: a prerequisite for deployment is preparation/source verification, not another row's final production sign-off. C2/G1 and O1/X3 share later verification run evidence without blocking each other's preparation.

| ID | Current state | Remaining work | Dependency |
| --- | --- | --- | --- |
| D1 | Guarded runner SOURCE PRESENT; older online run RECORDED PASS | Local/protected suite routing, source isolation, protected workflow and fresh candidate-owned run/recovery | None for preparation |
| C6 | Fail-closed manager scope SOURCE PRESENT | Current regressions and deployed empty/missing-scope denial | D1 for database-backed proof |
| C1 | Durable uncertainty/recovery SOURCE PRESENT | Add real-database concurrency/expiry/recovery/inbound-merge coverage; provider/browser proof | D1; approved `au-contract-v1` defines outbound expectations |
| C2 | Partial membership retry and stable analytics UUID SOURCE PRESENT | Deployed retry and delivered-event cardinality | Source tests independent; closure uses G1 verification run after O1 deployment |
| C3 | Failed receipts, repair tooling and billing database regressions SOURCE PRESENT | Candidate regressions and authorised provider replay; paid checkout only in paid mode | D1/O1 |
| C4/C5 | Email failure propagation and malformed-JSON handling SOURCE PRESENT | Current regressions and deployed email recovery | R2/O1 |
| R1/R2/R3 | Mode/runtime/preflight/Sentry import SOURCE PRESENT | Separate actual project preflights and symbolicated candidate events | Prepare before O1 promotion; events after deployment |
| P1/P2 | Bounded pages, hydration and predicates SOURCE PRESENT | Candidate parity/query-count and deployed payload proof | C6/D1 |
| P3 | Bounded overview/detail SOURCE PRESENT; CSV incomplete | Implement complete bounded export and verify access, counts and payloads | D1 for fixture proof |
| P4/P5 | Public provider split/lazy sanitised analytics SOURCE PRESENT | Candidate bundle/network and event-delivery proof | G1 |
| G1 | Contact studio, protected API and activation SOURCE PRESENT | Verify `/api/contact`, Clerk admission, first-owner creation and delivered milestones | C2/R2 source checks and X1 sync contract; closure after O1 deployment |
| G2/G3 | Trust-copy cleanup SOURCE PRESENT | Current public copy, support receipt/response and rollback | O1/T1 |
| T1 | Browser harness SOURCE PRESENT, incomplete/stale assertions | Correct inventory/admission/terminal assertions and complete journey matrix | X2 before live worker cases; O1 |
| T2/T3 | Docs/email CI gates and Node 22 types SOURCE PRESENT | Preserve gates, actual runtime/remote CI and email render evidence | D1 |
| X1 | Approved sync/import contract; current evidence in `tasks/todo.md` | Full/delta completeness, watermark/initial-request CAS, whole-roster balances and deployed onboarding/calendar evidence | D1; candidate verification before deployment |
| X2 | Retained AU browser/provider assertions; live NOT VERIFIED | Bounded role/write/recovery journeys with scoped fixture ownership, independent provider reads and cleanup | D1 fixture safeguards; O1 candidate deployment; live credentials/authority |
| X3 | Canonical four-entity lifecycle; live NOT VERIFIED | Exact consent, automatic/dormant refresh, provider-first disconnect and sibling-safety evidence | Actual preflights before O1; controlled live observations afterwards |
| O1 | Production proof NOT VERIFIED | Refresh metadata, configure, apply genuinely pending migrations, deploy one SHA and reconcile journeys | Exact-candidate source/schema/integration gates and X3 configuration; closure follows deployed evidence |

Execution order:

1. Reconcile drift and current evidence. Complete independent D1, C1, P3 and G1/T1 work within their authorised scope. Apply the approved simplification contracts to X1/X2/X3; refresh read-only provider metadata when access and authority exist.
2. Preserve the approved AU transition contract (`au-contract-v1`, local submit, manager approve creates in Xero). Complete worker isolation before any worker-dependent provider/browser action. Keep routine source and protected database testing independent of unavailable provider fixtures.
3. Freeze one candidate, run uncached source gates, compare applied schema, apply only genuinely pending reviewed migrations, then run the complete registered online inventory with fresh ownership and cleanup proof.
4. Prepare actual lifecycle settings and project preflights, deploy the exact candidate under closed admission, verify registered worker revisions, then run bounded owned browser/provider journeys. Finish support, telemetry, security and rollback evidence.

## 3. Finish verification infrastructure without rebuilding it

### D1: Preserve the protected runner and close CI policy gaps

**Current source**: `tooling/release/integration-inventory.ts:4-40` enumerates six workspaces and the concrete integration files registered in its current inventory. `run-live-integration.ts` validates manifest/identity, durable ownership, consumer isolation, inventory, cleanup and fence state. `packages/database/src/live-test-guard.ts` protects direct construction. `cleanup.ts:43` requires an active owner for `--apply` and `--assert-clean`; `--dry-run` remains the read-back path after fence release. Root `test:integration` sets `ALLOW_LOCAL_DATABASE_TESTS=1`, which is localhost-only and never Neon authorisation.

**Remaining scope**: `.github/workflows/ci.yml`, new `.github/workflows/release.yml`, `tooling/release/run-source-gates.ts`, `deny-network.mjs` and tests, `tooling/release/consumer-isolation.ts` and tests, existing runner/manifest/cleanup/inventory modules only where required. Update registry, allocator and cleanup alongside any new C1/X2 integration files.

1. Preserve ordinary CI's disposable local PostgreSQL and valid localhost guards for supported local integration suites. Keep source checks independent of live secrets. Route any surviving genuinely protected-only suites through the protected runner; deleted suites are not retained as compatibility requirements. Do not give ordinary CI production credentials or fabricate its manifest. Add a separate protected exact-candidate release check; a passing local integration job cannot replace it. Preserve docs/email, package-boundary and tooling checks.
2. Harden the existing source wrapper's environment before relying on that claim. It currently filters database/Neon/release variables but retains other inherited provider values (`run-source-gates.ts:17-30`). Run from a clean checkout without live `.env*`, use an allowlisted synthetic environment including build-valid Xero client ID/secret and encryption material, and deny TCP plus Neon HTTP/WebSocket connections. Preserve only documented compiler IPC. Test secret inheritance/env-file loading/network denial; do not weaken production env validation.
3. Reconcile proposed CI restructuring (archived in git history) against current CI and inventory; do not apply old hunks blindly. Prepare a protected exact-SHA workflow using trusted workflow code, reviewed candidate checkout, private manifest, scoped secrets and one active run. A prior persistent-workflow approval rejection is recorded in Section 11; it is not proof of approval now. Finish the concrete workflow and tests first, then obtain any still-required authority for persistent production access. Local protected runs can continue under applicable authority while publication is pending.
4. Keep the existing manifest/allocator: reserve exact tenant IDs and kind-qualified global keys before writes, verify durable read-back, prevent adoption of existing keys, preserve outside-owned catalogue/content baselines, and resume only consumer states paused by that run. Protected database-fixture mode remains all-consumers-paused/drained or verified strict-empty. The current provider read-back in `consumer-isolation.ts:36-98` implements only the never-registered, strict-empty case; a `pausedConsumers` map alone is not observed pause/drain proof. Before a database verification run after worker registration, implement and test fresh provider-backed pause/drain and exact restoration read-back for all affected consumers, using current Context7/provider contracts. Reject stale/missing evidence, active/queued/retrying work and unverified restoration. Do not unregister workers to manufacture the old empty-environment condition. If the provider cannot enforce the window, keep that verification run unavailable while completing independent work. Browser/provider fixtures have a separate lifetime and must not reuse a cleaned database manifest.
5. On interruption use the protected runner's recovery mode, not a new run ID. Cleanup uses only manifest-owned resources in dependency order. An unresolved provider effect or stale consumer proof keeps the fence held and evidence incomplete. After normal release, do not reacquire a fence just to run `--assert-clean`: use `--dry-run` plus independent zero-residue, unchanged-content and released-fence checks.

**Commands**, after a fresh protected environment/manifest is prepared privately:

```bash
bun --no-env-file tooling/release/migration-check.ts --base 92d67c5
TURBO_CONCURRENCY=1 bun --env-file="$TC_RELEASE_ENV_FILE" tooling/release/run-live-integration.ts --manifest "$TC_RELEASE_MANIFEST" --evidence-dir "$TC_RELEASE_EVIDENCE_DIR"
bun --env-file="$TC_RELEASE_ENV_FILE" tooling/release/run-live-integration.ts --manifest "$TC_RELEASE_MANIFEST" --recover --evidence-dir "$TC_RELEASE_EVIDENCE_DIR"
bun --env-file="$TC_RELEASE_ENV_FILE" tooling/release/cleanup.ts --manifest "$TC_RELEASE_MANIFEST" --dry-run
```

Run recovery only for an interrupted owned run, not after a successful run. These variable values are private paths, not secret contents to print. The runner invokes `bun run test:integration` with validated live context; do not run the root command directly against Neon. Assert discovered inventory equals current registration instead of freezing old counts; register new suites, allocation and cleanup together.

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

### C1: Prove durable remote-write uncertainty against the real database

**Current contract**: local AU submission creates no payroll operation; remote approve, decline and withdraw reuse `OutboundOperation`, with immutable UUID idempotency keys and exact request identity. First dispatch starts a five-minute replay cutoff inside Xero's six-minute retention. Attempt generation protects finalisation. Late uncertainty requires authoritative provider inspection and administrator recovery. Candidate evidence is recorded separately, with real database concurrency distinguished from mocked transport and live provider results.

**Scope**: those files/tests including `packages/availability/src/approvals/approval-service.test.ts`; `packages/availability/src/plans/submit-side-effects.ts` for shared finalisation side effects; Plans actions/recovery UI; `packages/availability/src/xero-write-claim.ts`; existing inbound sync/publication callers. Add `packages/database/outbound-operations.integration.test.ts` and register it in `tooling/release/integration-inventory.ts`, allocator/global-key/cleanup contracts. Extend `packages/availability/index.integration.test.ts` or a separately registered recovery suite for service-level merge coverage. The approved simplification migration supplies request-identity and replay timing fields; preserve the migration chain.

1. Preserve immutable snapshots and `prepared`, `outcome_unknown`, `provider_accepted`, `completed`, `definitive_failure` transitions. A worker lease releases execution ownership, not an unresolved operation. Timeout, malformed success, 5xx, process loss or local commit failure never authorise a second create. Retry/edit/archive/approval and inbound writers respect the durable guard. Exact in-request replay is allowed only with the persisted key/request within the five-minute cutoff. Proven pre-send failure or definitive rejection permits a reviewed retry; late uncertainty requires administrator recovery.
2. Add guarded tests with independent database clients contending for the same owned record. For local AU submit assert zero payroll creates; for concurrent manager approval assert exactly one durable `approve` claim and one counted mocked provider create. Cover stable key reuse, immutable request identity and the five-minute cutoff for each supported remote action. Assert persisted unknown status before dispatch, unchanged denial after lease expiry and client/process restart, stale operation-attempt finalisation rejection, and safe retry after definitive failure. Use real repository transactions; provider transport stays mocked in synthetic database suites.
3. Prove verified known-ID recovery, admin/owner-only attach and definitive-not-created resolution. Empty, incomplete, old or ambiguous provider matches never establish absence/origin. Recovery must preserve both scopes, stable UID, privacy, publication sequence and idempotent notifications. Test inbound import racing recovery leaves one canonical publication, retaining audit history and cancelling the duplicate publication safely.
4. Allocate all resources before writes and extend owned cleanup before running. Model fixture setup/teardown on `packages/database/billing.integration.test.ts` and the existing availability integration suite. Do not use unrelated customers, unregistered global keys or real Xero calls to manufacture a concurrency test.
5. Preserve approved `au-contract-v1`: local submit, manager approval creates, local decline/withdraw make no provider call. Plan 160 supplies bounded AU UI proof; broader uncertainty, inbound-race and lifecycle proof remains required here. Keep provider verification separate from mocked transport plus real-database proof.

**Verify**:

```bash
bun run --cwd packages/database test src/queries/outbound-operations.test.ts
bun run --cwd packages/availability test src/plans/submit-service.test.ts src/plans/submit-recovery-service.test.ts src/approvals/approval-service.test.ts src/plans/plan-service.test.ts src/xero-write-claim.test.ts
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

**Current state/scope**: `packages/next-config/preflight.ts:141-155` validates actual `NEXT_PUBLIC_LAUNCH_MODE`; CLI mode is only an assertion. `:222-238` covers Sentry upload and Better Stack's complete-or-absent group; Xero preflight validates encryption/keyring/version, registered HTTPS callback, commercial tier and shared KV; `:301-315` requires runtime Resend names, sender and private application configuration. `packages/observability/next-config.ts:2` already uses `@sentry/nextjs/config`.

Preserve `preflight.ts`, `preflight.test.ts`, `bin/preflight.ts`, observability env/tests and matching README/env examples. Do not replace actual environment mode with `--mode`, accept an unsupported Resend alias, remove upload requirements, weaken keyring semantics, or rotate keys merely to make a check pass. Retain keys referenced by stored envelopes and the supported version-1 fallback.

**Verify**: `bun run --cwd packages/next-config test preflight.test.ts launch-mode.test.ts` and `bun run --cwd packages/observability test keys.test.ts` exit 0. With each actual production build/runtime environment loaded privately and separately, run `bun run preflight app`, `bun run preflight api`, `bun run preflight web` respectively; each exits 0 with actual `early_access` and secret-free diagnostics. A combined environment is invalid evidence. Sentry source-map upload and symbolication, advertised status monitors and Xero grant/configuration read-back are separate O1/X3 observations.

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

### X1: Verify scoped sync, complete initial import and onboarding

Use the approved implementation Tasks 6/9. One persisted initial full-import request sequences people, leave and the entire provider balance roster. Only matching `requestedAt` may complete `initial_sync_requested_at`; scheduler recovery redispatches pending requests. Reconnect preserves domain identities and feeds.

AU employee/V2 leave deltas use the prior completed watermark minus two minutes, with the same header on every page. Advance to captured run start only after successful traversal and persistence; malformed rows, failed upserts and incomplete pages keep it unchanged. Deltas never archive absent records. Only complete successful full reads may archive absent Xero-owned data; manual entries remain. Manual and nightly people/leave reconciliation are full reads. NZ/UK retain explicit provider-supported paging/per-employee reads without invented modification filters. Scheduled balances remain hourly rolling pages of 40 people; initial full import traverses the entire roster and partial work cannot clear whole-roster staleness.

**Verify**: approved scoped database CAS/completeness/identity cases, registered handler tests and surviving `xero-onboarding.spec.ts`/`xero-roundtrip.spec.ts` assertions. Require fresh exact terminal run IDs and persisted counts; queue acknowledgement and a previous successful run do not prove this import. Candidate results belong in `tasks/todo.md`. Live import/calendar observations remain NOT VERIFIED.

### X2: Verify bounded AU writes and recovery

Preserve [Plan 160](160-xero-end-to-end-verification-and-report.md)'s nine-row local/user/provider flow, the approved transition contract and independent raw provider assertions. Remote approve, decline and withdraw share the existing durable operation journal. Prove UUID reuse within five minutes, no changed-request replay, no late ambiguous create, stored completed outcomes and side effects once. Test concurrent claims, process/local-save failure and administrator recovery with actual scoped database transactions; synthetic transport evidence remains distinct from live Xero evidence.

Use existing protected release fixtures, target/restore checks, generic run ownership, current consumer isolation and scoped cleanup. Never reuse foreign fixture IDs, decrypt tokens in browser scripts, mutate unowned leave or bypass an applicable live guard. List residue and restore before-values after any authorised run. Unavailable credentials or uncertain provider effects stop dependent mutations while independent work continues. Do not add a replacement verification control plane.

### X3: Verify canonical consent, refresh and disconnect

The requested consent string is exactly `offline_access accounting.settings.read payroll.employees payroll.settings.read`. Check actual grants and write/read capability alternatives. Configure the verified `XERO_APP_TIER`, shared KV pair, registered callback and encryption key/version ring for each actual app/API environment; preserve keys referenced by current encrypted rows. Ordinary shared quota keys initialise atomically on first use. Store failure denies calls.

Verify canonical one-user/app authorisation across scoped selected connections, state/nonce/user/role isolation, automatic refresh within two minutes of expiry and dormant rotation at 45 days even when sync is paused. The locked canonical old pair supports bounded recovery within Xero's 30-minute grace; this does not promise recovery after an unattended outage beyond provider grace. Definite invalid grants require reconnect. Provider-confirmed lost connections stop sync; permission or inventory failure alone cannot prove revocation.

Owner/admin disconnect synchronously deletes the exact owned remote connection; provider 204/404 permits scoped local teardown/audit. Failure or uncertainty preserves retryable state and siblings. Soft disconnect retains imported history; explicit purge archives imported entries and removes imported balances/mappings while preserving manual data and stable identities. Remove the canonical grant only after the final connection/live selecting session reference is gone. Reject disconnect during a live or unresolved payroll operation.

**Verify**: exact-candidate schema, locks, OAuth/disconnect integration and source tests plus independent controlled provider observations. Apply only genuinely pending reviewed migrations; do not rebaseline history or perform customer backfills for a checklist. All live OAuth/consent/refresh/DELETE journeys remain NOT VERIFIED until observed.

## 8. Verify and deploy one candidate

### A. Run database-free candidate gates

The preceding execution recorded resolved dependency installation (`jose` in `@repo/xero`); this review did not install or verify it afresh. Run the actual candidate type gate; do not treat historical PASS as current or add a source workaround.

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

The later 2 October environment record reports 23/23 migrations applied; the September protected verification run reported 21. Neither establishes current target status or candidate drift. Refresh this read-only evidence against the chosen candidate and target; do not generate replacements or reapply historical migrations. The generation steps below apply only if new source changes genuinely require a migration. Preserve existing custom SQL trigger/constraint behaviour and verify it independently because Prisma schema diff does not prove unsupported database objects.

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
6. Live status, checksums and drift on the existing Neon target do not prove fresh live-target construction. This protected run does not create/reset a Neon database. Ordinary disposable local CI may construct an empty database and migrate it; retain that as separate local evidence, never live-target PASS.

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
| Xero | Approved AU transitions; actual tier/KV/keyring/callback, canonical granted capabilities and scoped controlled fixtures | Independent initial/full/delta sync, synchronous idempotent write/recovery, refresh and selected-connection disconnect evidence; every unexecuted journey NOT VERIFIED |
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

**Current source**: `tooling/release/playwright.config.ts`, surviving `tooling/release/e2e/` specs and protected fixture/cleanup helpers. Compare the actual discovered inventory with required release journeys; source presence does not establish coverage or live PASS.

1. Account for every matrix row below in a surviving test or reproducible evidence step. Avoid duplicate payroll mutations across browser projects; use controlled Chromium once and read-only state for Firefox/WebKit and viewport checks. Missing required observations remain NOT VERIFIED.
2. Verify G1's rendered Clerk restriction and first-owner admission journey using isolated role contexts and scoped identity before mutations. Preserve analytics privacy checks.
3. Require manual/initial sync to start after the request, reach successful terminal status, persist expected rows and update the UI. Reuse exact-run/import observer assertions; never accept a queue message or unscoped latest-run result.
4. Keep scoped fixture ownership, actual target/candidate identity, consumer isolation, before-values and cleanup/restoration. Database and browser runs have distinct lifetimes; do not reuse a cleaned manifest or claim paused consumers while executing jobs. Apply the surviving guarded release runner's actual environment contract.
5. Verify OAuth, onboarding, roundtrip, administrator recovery, full/delta imports and selected remote-first disconnect against the approved simplification. Independent provider snapshots and publication checks remain useful; no mocked success counts as a live provider result.

**Verify**: `bun run test:release-tools` and `bun run typecheck:release-tools`, followed by `bun run test:release` against explicit HTTPS candidate URLs and protected owned fixture inputs when authorised and available. Record candidate SHA, real command/exit, observed case outcomes, provider writes and cleanup. Plan 160's bounded report remains separate from this full journey matrix. Current source discovery and credentials determine what can run; an absent test or credential is an explicit gap, never an implicit PASS.



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
| Payroll | Separate controlled records cover the approved X1 transition table for submit, approve, decline and withdraw; each applicable remote ID/status or independently observed absence is reconciled. An ambiguous remote operation beyond its replay cutoff cannot issue another mutation; resolution completes without duplicate canonical publication |
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
build and verify health. Never roll back to silent rebinding, independent refresh-token rotation, missing durable remote-operation guards or fail-open rate limiting. Do not restore stale refresh tokens from backups. Additive database changes remain and are forward-fixed
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
- [ ] Normal authenticated actions preserve both tenant scopes and fail-closed ordinary shared quotas; no manual quota bootstrap is required.
- [ ] X1 full/delta/initial import, X2 idempotent AU writes/recovery and X3 canonical lifecycle have exact-candidate source/integration and controlled live evidence. Plan 160 remains bounded; actual journey requirements define coverage, without retired fixed case counts.
- [ ] D1 local/protected suite routing and protected release checks are exercised remotely; T1 inventories are disjoint, Clerk admission uses the current flow and queued sync cannot pass as terminal success; P3 exports complete bounded results.
- [ ] AU is the only enabled payroll region; complete authorised feed URLs remain usable; Xero remains authoritative for balances.
- [ ] Application, first-owner admission, support delivery, observability/alerts, credential remediation and rollback work in practice.
- [ ] Any paid-only gate is PASS if paid, or explicitly NOT APPLICABLE because actual mode is early access. C3 source fixes are never waived.
- [ ] Readiness report states READY with links to evidence, no mandatory UNKNOWN/NOT VERIFIED and no unresolved P0/P1 defect. The protected run's exclusion of fresh live-target construction is disclosed separately from local CI migration evidence.
- [ ] Implementation diffs are reviewed, authorised integrations completed, unrelated changes preserved and temporary development processes/worktrees cleaned up appropriately.

An unavailable credential or unresolved dangerous live outcome can prevent a
truthful READY decision. It must not prevent completing the other work. Report
the precise uncompleted action and continue it when authority/access exists;
never replace missing proof with a waiver or a fabricated result.

### STOP conditions

Stop only the affected action and report the exact evidence needed when:

- The approved AU transition contract (`au-contract-v1`) conflicts with current provider evidence. Do not invent payroll semantics.
- A target, scoped tenant/run or operation attempt generation, credential snapshot, migration checksum or deployed/worker revision differs from the reviewed evidence. Do not alter a guard, token or manifest to make a check green.
- Fixtures are unowned, durable recovery evidence is missing, or a remote outcome/consumer state is unresolved. Preserve the generic run fence and operation/fixture recovery evidence and reconcile through the existing recovery path before new mutations.
- A required code change exceeds the stated item scope, or verification fails twice after a bounded fix attempt. Reconcile the affected plan/contract; continue unrelated authorised work.
- A concrete external action lacks authority. Finish its reviewable preparation and request only the missing action, identifying any actual approval-review rejection. Historical rejections are not fresh rejections.

### Maintenance notes

Future submit changes must preserve durable uncertainty across every writer and inbound sync. Billing state, health and replay tests change together. Holiday/status changes update predicate/oracle tests. New integration suites update inventory, allocator and cleanup in the same commit. New worker consumers update fixture isolation and terminal-drain/restoration evidence. Launch variables/public CTAs/analytics update runtime, preflight and deployed checks together. A docs-only merge may reuse source proof only after recording exact input equivalence; it never refreshes deployment or provider state.

## 11. Current execution ledger and historical evidence

### Documentation reconciliation, 7 October 2026

This file now uses the approved simplified Xero contracts and surviving release tooling. Obsolete lifecycle/admission plans, compatibility requirements and fixed suite/case counts are retired in Git history. Preserve broader source, browser, billing, privacy, support, security and rollback requirements. This documentation pass asserts no new source/integration PASS; all live provider journeys remain NOT VERIFIED because credentials are unavailable.

Update Section 2 and this ledger with exact candidate SHA, command/exit/counts, timestamp, private artefact location and remaining action. Source presence, historical reported PASS and deployed PASS are separate statuses.

| Evidence track | Current disposition | Next required result |
| --- | --- | --- |
| Source gates | Historical reported PASS at sync/onboarding candidate `4bb6fca`; earlier `5d2e57b` evidence does not cover current drift | Fresh exact-candidate uncached source gates after remaining changes |
| Guarded online database/Redis | Historical counts/migration results are dated leads; actual current registry defines coverage | Exact-candidate full registered run with fresh identity/restore/consumer/cleanup proof |
| Production inventory | Dated observations only; no provider refresh here | Actual metadata, separate project preflights, X3 rollout and one-candidate deployments |
| AU UI proof | NOT VERIFIED; live credentials unavailable; bounded Plan 160 | Applicable fixture/consumer authority, actual credential access and independent observations |
| Wider provider/browser/lifecycle | NOT VERIFIED; live credentials unavailable | Controlled full journey matrix, terminal runs and scoped cleanup/restoration |
| Release CI | Local PostgreSQL CI exists; protected workflow absent | Explicit local/protected-only suite routing, applicable workflow authority and remote exact-candidate checks |
| Support/security/rollback | NOT VERIFIED | Current receipts, credential-remediation proof, final-lockfile reachability audit and compatible rollback rehearsal |
| Final release | TODO | Deployed candidate, every mandatory gate, actual release date and READY report |

Historical September 19 execution, provider changes, approval-review rejection and diagnostic counts are preserved in the prior `plans/go-live.md` at commit `6005a5a`. They are evidence leads only, not current instructions or approval status. Refresh unavailable private artefacts; never invent their results. No builds, database/provider operations or application test gates were executed by this planning reconciliation.
