# Plan 161h: Report-only inactivity assessment, lifecycle metrics, preflight, evidence runner and a documented rollout

> **Executor instructions**: Follow this plan step by step. Run every verification command and
> confirm the expected result before moving to the next step. If anything in "STOP conditions"
> occurs, stop and report - do not improvise. When done, update the status row for this plan in
> `plans/README.md` unless a reviewer dispatched you and told you they maintain the index.
>
> **Drift check (run first)**:
> ```bash
> grep -E "^\| \[161[b-g]\]" plans/README.md
> ```
> Every row must say DONE, or `BLOCKED (integration gates not run)` for a plan whose code is
> complete and whose only gap is an unavailable local database or store; list those in the rollout
> document as outstanding evidence. Any other status is a STOP. Then confirm the names this plan relies on exist:
> `grep -n "XERO_REMOTE_CLEANUP_MODE\|XERO_APP_TIER\|XERO_RATE_NAMESPACE_EPOCH\|XERO_TOKEN_ENCRYPTION_KEYS_JSON" packages/xero/keys.ts`
> returns all four, and `grep -n "initialiseXeroRateNamespace" packages/xero/src/rate-limit/shared-store.ts`
> matches. Any miss is a STOP condition.

## Status

- **Priority**: P2 for the inactivity evaluator; **P1** for metrics, preflight and the rollout
  document, which make 161b-161g deployable
- **Effort**: M
- **Risk**: MED for code, HIGH for the rollout sequence it describes
- **Depends on**: 161b, 161c, 161d, 161e, 161f and 161g. All six DONE.
- **Category**: dx, docs, direction
- **Planned at**: approved dependency commit `fca052bf78d39d03da4ad0cbc62ef29566b6cee0`, 26 September 2026; implementation base is `/tmp/tc-161g`, branch `codex/xero-permission-recovery`, subsequently merged into main at `2a24395` and recorded at `1d50742`. Historical excerpts below are anchors, not current line counts.
- **Programme charter**: `plans/161-harden-xero-connection-lifecycle.md`

## Execution reconciliation, 26 September 2026

This section takes precedence over historical instructions below.

- All dependencies are DONE, including independently approved 161g at `fca052b`. Create
  `/tmp/tc-161h` on `codex/xero-rollout-inactivity` from that exact commit. Do not merge or
  change primary source. Reviewer maintains the primary plan/index. Track executor work in
  appended `tasks/todo.md` items and review.
- Use only the already authorised online Neon through the protected live runner. The session
  decision in `tasks/lessons.md:211-215` supersedes every localhost/Docker/local migration
  instruction and the blanket real-database restriction below for reviewed additive verification
  schema and manifest-owned test data only. Reviewer owns live preparation and execution after
  source review, with fresh identity, durable ownership, restore, consumer isolation and cleanup
  read-back. No reset, seed, schema push, backfill or real provider operation. Actual rollout,
  commercial namespace initialisation, cleanup enablement, deployment and customer mutations
  remain outside scope. Keep cleanup `report_only`.
- Generate the single additive migration with Prisma schema-diff tooling, never a live shadow
  database. The generated client is tracked in this repository: include only mechanically
  generated `packages/database/generated/**` updates for the new model/relations/enums, and
  verify reproducibility through Prisma generation. Reviewer reviews SQL before any guarded
  application. New report table is a scoped child: explicit Organisation/XeroTenant
  relations, bounded enums or equivalent checks for kind/review status. Preserve existing
  tables and payroll rows. Add the table to manifest-owned cleanup before applying it.
- Scope includes necessary database package export/wrapper, root Xero metric export for the job,
  query tests, relevant existing co-located callsite tests, `memory-store.ts` and its tests,
  shared-store unit/integration tests, `tooling/release/cleanup.ts` and its tests,
  `tooling/release/integration-inventory.test.ts`, database fixture registry/tests and a real
  registered `packages/xero/src/oauth/inactivity-report.integration.test.ts`. Keep registration
  and the actual fixture in the same commit. Reuse allocated manifest fixture slots/namespaces
  where safe, otherwise extend ownership explicitly. Do not weaken guards or inventory tests.
- Evaluate reserved bindings by `active_slot = 1` and `retired_at = null`, never just legacy
  connection status. Scope all signals by both IDs. Only active nonarchived feeds establish current feed service. Aggregate recent usage
  conservatively across their scoped token history, including rotated or revoked tokens, so
  rotation cannot erase recent consumption; absence or unreadable coverage is unknown. Never
  select credential, token/hash, name or payload fields.
  An absent subscription or a status with no proven inactive meaning is `unknown`; active/trialling
  subscriptions are active. Human audit activity must use both IDs and a non-null actor.
  Missing audit events cannot prove no human use, because login history is unavailable: `unknown`.
  Explicit known-null activity is allowed only as a caller-supplied proven signal in pure tests.
  Recent human activity yields active. Archive supplies a candidate reason only after all decision signals are known and nonactive.
  It never overrides an active signal, unknown subscription/human/feed evidence, or an
  unreserved binding. Active signals take
  precedence over unrelated unknown signals; otherwise unknown signals never yield candidate.
  Onboarding is informational only, always unknown in current queries. Invalid/future input
  dates yield unknown; thresholds are strictly older than 30/90 days, with exact boundaries
  protected as recent. Insert validates internal tenant ID belongs to both recorded scope IDs.
- `buildXeroInactivityReport` accepts both scope IDs, never scans/writes customers implicitly.
  CLI requires `--clerk-org-id` and `--organisation-id`, prints counts only through the existing
  observability logger. Report is manually invoked, writes only classification rows, no job.
- Domain sentinel is immutable per epoch, initialise is idempotent only for matching domain,
  mismatch must neither rewrite sentinel nor reset allowance. Old sentinel `1` and missing/malformed
  domain fail closed. Atomic Lua verifies domain before reservations, including request replay,
  across all rate classes. Memory supports explicit expected/observed domain for mismatch tests;
  ordinary dev/test with no configured domain may retain existing behaviour. Redis never skips
  domain checks based on NODE_ENV. Preserve response/release budget safety and error propagation.
  A mismatch maps to unavailable/infrastructure fetch behaviour without provider dispatch.
  Rollout drains every deployment whose admission code lacks this domain check, including older
  shared-Lua deployments as well as process-local limiters. An existing legacy sentinel requires
  a separately reviewed budget/lease-preserving transition; never flush state, blindly rewrite
  the sentinel or rotate epochs to resolve a conflict. No such transition is executed here.
- Metrics use closed labels and project through an allowlist at runtime. No IDs, errors, payloads,
  or labels passed via object spreading from provider inputs. Metrics must not change lifecycle
  results. Record store outage separately from ordinary denials and do not call mismatch an outage.
- Evidence covers all 40 charter cases and each required level separately; mock evidence cannot
  stand in for database/Redis/browser/provider. PASS needs same candidate, executed assertion,
  target fingerprint and relevant fixture/cleanup evidence. Conflicting, stale, skipped, missing,
  malformed or cross-candidate observations fail closed. No suite-exit-to-case PASS inference. Add optional bounded top-level runner metadata
  with fixed phase/outcome codes, numeric command exit, inventory/cleanup status and fence state
  only where actually observed; retain the first failure phase before cleanup and identify
  authority/test/cleanup failures without raw errors. Known runner failure or failed cleanup
  prevents overall readiness PASS even if supplied case observations claim success; validate
  inconsistent runner status/exit combinations without changing case-level assertion evidence.
  Empty charter observations must not erase known infrastructure outcomes. Track metadata only,
  with no reordered guard, recovery, cleanup or provider operation.
  Guarded runner optional `--evidence-dir` always emits JSON/Markdown, including authority errors,
  test failures and cleanup failures. Its existing acquisition, recovery, test result, cleanup,
  digest/fence and process-exit semantics remain intact. Partial charter report is NOT_VERIFIED
  and exitCode 1, but does not invalidate a successful infrastructure inventory command: the
  existing runner exit reports that command, while the evidence report states programme readiness.
  Evidence write errors force a failing command without masking an existing failure. No
  fabricated deployed SHA. Browser/provider readiness remains NOT_VERIFIED until Plan 160.
- `CLAUDE.md` is now a short import of canonical `AGENTS.md`, not the historical duplicate
  job/environment tables. Keep AGENTS authoritative; a brief lifecycle inventory pointer in
  CLAUDE satisfies discoverability without creating a second independently maintained table.
- Source gates run with `bun --no-env-file`, forced uncached type/unit/build tasks, boundaries,
  release-tool tests/types, and standalone strict checking of changed integration fixtures.
  Synthetic builds also set synthetic Xero client ID/secret as required by actual keys schema.
  Protected live verification must run the full registered inventory and real owned Redis domain
  mismatch/idempotence checks. Environment failures are reconciled and retried, not abandoned at
  an arbitrary two-attempt limit. Actual unsafe scope expansion is reported to the reviewer.

## Why this matters

**Operational visibility.** The programme adds distributed budgets, a credential owner model,
fenced bindings and an asynchronous cleanup worker. Each has a failure mode that is silent without
signals: refresh conflicts, ageing unknown cleanups, budget denials, shared-store outages,
migration conflicts. Without instrumentation the first signal is a customer complaint.

**Inactivity, carefully.** Xero's guidance asks integrators to identify inactive connections. The
dangerous version deletes a paying customer's connection because nobody logged in last month. This
plan builds only a **pure evaluator and a report**. It sends no notice and deletes nothing.

**A rollout that can actually be followed.** 161b-161g each left ordering constraints (two-phase
migrations, two-phase backfills, namespace initialisation, cleanup enablement, mirror scrubbing).
This plan writes them down in one sequence.

## Current state

### Preflight

- `packages/next-config/bin/preflight.ts` (34 lines) is the CLI entry for
  `bun run preflight <app|api|web>`.
- `packages/next-config/preflight.ts` (245 lines) holds `runProductionPreflight`, which validates
  **only the current process's environment** (`envVars`). For `app` and `api` it checks
  `DATABASE_URL`, `XERO_TOKEN_ENCRYPTION_KEY`, `XERO_CLIENT_ID`, `XERO_CLIENT_SECRET`, Clerk keys,
  and (after 161e) `XERO_APP_TIER`, `XERO_RATE_NAMESPACE_EPOCH` and the KV pair. It does not check
  `XERO_REDIRECT_URI`. Errors name variables, never values.
- `packages/next-config/preflight.test.ts` is its test suite.

Preflight cannot see another deployment's configuration. Any cross-deployment rule must be enforced
at runtime through something the deployments share (the shared rate store), plus a written rollout
check.

### Enablement controls that already exist (do not create new ones)

| Control | Where | Safe default |
|---|---|---|
| Remote cleanup execution | `XERO_REMOTE_CLEANUP_MODE` in `packages/xero/keys.ts` (161f) | absent = `report_only` |
| Shared limiter readiness | namespace sentinel set by `initialiseXeroRateNamespace` (161e); epoch from `XERO_RATE_NAMESPACE_EPOCH` | no sentinel = all admission denied |
| Canonical credential cutover | per binding: `XeroTenant.xero_credential_owner_id` set by the 161d backfill; `NULL` keeps the legacy path | unbackfilled = legacy path |

Two of these are **not** discretionary toggles: the binding guard (161b) and the shared limiter
(161e). Once enabled, no rollback may restore silent payroll-file replacement or process-local
admission.

### Observability

`packages/observability` exports `log` (`log.ts`), `error.ts`, `scrubber.ts`, Sentry init and a
`status/` folder. **There is no metrics API.** Emit metrics as structured log events at `info`
level with a fixed `metric` field, which the log pipeline (Better Stack) can aggregate. Do not add
a metrics dependency.

### Inactivity signals that exist

- `XeroTenant.sync_paused_at` (`schema.prisma:503`).
- `ClerkOrgSubscription.status` (`schema.prisma:1161-1181`; table `clerk_org_subscriptions`).
- `FeedToken.last_used_at`, written by `markTokenUsed` in `packages/feeds/src/render/render-feed.ts:341-359`,
  **throttled to once an hour**. The route `apps/api/app/ical/[token]/route.ts` renders before its
  304 check (`:63` then `:107-117`), so origin 304s update it; but responses carry
  `Cache-Control: max-age=3600`, so a client or intermediate cache may not revisit the origin for
  up to an hour. Treat `last_used_at` as lagging by up to about two hours.
- `XeroConnection.status`, `Organisation.archived_at`.
- Onboarding completion is **not stored**; it is derived at request time in
  `apps/app/lib/server/load-onboarding-state.ts`. The evaluator receives it as `unknown`.

### Release tooling

`tooling/release/` contains `run-live-integration.ts`, `run-source-gates.ts`,
`verify-live-target.ts`, `write-protected-manifest.ts`, `integration-inventory.ts`, `cleanup.ts`,
`migration-check.ts`, `playwright.config.ts`, `vitest.config.ts` and `e2e/`. Its tests run with
`bun run test:release-tools`. `run-live-integration.ts` (202 lines) is a top-level-await script
with no tests: it throws at `:28` without `--manifest` and asserts live database authority, so it
cannot be exercised locally as a whole.

### Documentation anchors

`CLAUDE.md` "Inngest job rules" job list (around `:405`) and environment table (around `:443`);
`AGENTS.md` has its own job list (`:314`) and environment table (around `:357`). 161d already added the
system-table `clerk_org_id` exception to `CLAUDE.md` and `PRODUCT.md`; do not add it again.

### Repository conventions to match

- `Result<T, E>`. Named exports only. No `any`. Zod on external input.
- **No `console.log`; use `@repo/observability`.**
- Optional env vars with a format constraint must be **absent**, never `""`.
- Australian English. **No em dashes anywhere.**

## Commands you will need

**Fresh worktree setup**: `bun install --frozen-lockfile`. `bun run build` needs a valid-looking
`DATABASE_URL` and a 32-byte base64 `XERO_TOKEN_ENCRYPTION_KEY` for that command only.

**Database**: protected online Neon only, as specified in Execution reconciliation.

**Not local gates:** `bun run preflight` and `bun run test:release` run during the rollout this
plan documents.

| Purpose | Command | Expected on success |
|---|---|---|
| Lint | `bun run check` | exit 0 |
| Types | `bun run typecheck` | exit 0 |
| Build | `bun run build` (with the two variables) | exit 0 |
| All units | `bun run test` | exit 0 |
| Xero units | `bun run --cwd packages/xero test` | exit 0 |
| Database units | `bun run --cwd packages/database test` | exit 0 |
| next-config units | `bun run --cwd packages/next-config test` | exit 0 |
| Additive migration verification | Reviewer guarded online Neon workflow | checksums, schema diff and owned cleanup pass |
| Release tool tests | `bun run test:release-tools` | exit 0 |
| Release tool types | `bun run typecheck:release-tools` | exit 0 |
| Whitespace | `git diff --check` | exit 0 |

## Scope

**In scope:**
- `packages/xero/src/oauth/inactivity-policy.ts`, `inactivity-policy.test.ts` (create; pure)
- `packages/xero/src/oauth/inactivity-report.ts`, `inactivity-report.test.ts` (create; gathers
  inputs and records classifications)
- `packages/xero/src/metrics.ts`, `metrics.test.ts` (create)
- `packages/xero/scripts/xero-inactivity-report.ts` (create) and a `report:xero-inactivity`
  script entry in `packages/xero/package.json`
- Metric call sites (one-line additions, except the age calculation noted in Step 3):
  `packages/xero/src/oauth/credential-owner.ts`, `packages/xero/src/rate-limit/limiter.ts`,
  `packages/xero/src/rate-limit/xero-fetch.ts`, `packages/xero/src/adapter/xero-write-adapter.ts`,
  `packages/jobs/src/handlers/reconcile-xero-connections.ts`
- `packages/xero/src/rate-limit/shared-store.ts`, `admission.lua.ts` and `limiter.ts` (the
  credential-domain check in Step 4 only)
- `packages/database/src/queries/xero-cleanup.ts` (one query: oldest `unknown` attempt age)
- `packages/xero/scripts/initialise-xero-rate-namespace.ts` (add `--credential-domain-id`)
- `tooling/release/xero-evidence.ts`, `xero-evidence.test.ts` (create) and
  `tooling/release/run-live-integration.ts` (import and call the writer only)
- `packages/database/prisma/schema.prisma` and one additive migration
  `<timestamp>_add_xero_inactivity_classifications/`
- `packages/database/src/queries/xero-inactivity-signals.ts` (create) and its export wrapper
- `packages/xero/keys.ts`, `keys.test.ts` (`XERO_CREDENTIAL_DOMAIN_ID`)
- `packages/next-config/preflight.ts`, `preflight.test.ts`
- `apps/app/.env.example`, `apps/api/.env.example`
- `CLAUDE.md`, `AGENTS.md`, `PRODUCT.md` (job list, environment table, lifecycle model)
- `plans/161-xero-execution-report.md`, `plans/README.md`
- `tasks/todo.md`, `tasks/lessons.md` (append only)

**Out of scope - do NOT touch:**
- **Any automatic deletion driven by inactivity**, or any customer notice or email.
- Lifecycle logic in `packages/xero/src/oauth/` beyond the named files and one-line metric calls.
- Rate-limit logic beyond the Step 4 domain check and one metric line.
- `packages/feeds` (read `FeedToken.last_used_at` through the new database query instead).
- Creating a feature-flag package or a new switch; use the controls in "Current state".
- Any real deployment, push, backfill run, migration against a real database, or production
  mutation. This plan **documents** the rollout.

## Git workflow

- Branch: `codex/xero-connection-hardening` (shared across 161a-161h).
- Conventional commits, e.g. `feat(xero): add report-only inactivity evaluator`,
  `feat(xero): emit xero lifecycle metrics`, `feat(xero): refuse a foreign credential domain`,
  `feat(release): record xero evidence cases`, `docs: record xero hardening rollout and rollback`.
- Do NOT push or open a PR.

## Steps

### Step 1: The inactivity evaluator, as a pure function

Create `packages/xero/src/oauth/inactivity-policy.ts`:

```typescript
export const XERO_INACTIVITY_POLICY_VERSION = 1;
export interface XeroInactivityInputs {
  now: Date;
  bindingReserved: boolean;
  syncPaused: boolean;
  organisationArchived: boolean;
  subscriptionActive: boolean | "unknown";
  onboardingComplete: boolean | "unknown";
  feedLastUsedAt: Date | null | "unknown";
  lastHumanActivityAt: Date | null | "unknown";   // login or in-app action, not sync
}
export type XeroInactivityClassification =
  | { kind: "active"; reason: string }
  | { kind: "unknown"; reason: string }
  | { kind: "candidate"; reason: string };
export function classifyXeroInactivity(inputs: XeroInactivityInputs): XeroInactivityClassification;
```

No imports other than types. No database, no clock (the caller passes `now`), no logging. Rules:

- Our own scheduled sync success is **not** an input. Polling neither proves use nor abandonment.
- A feed used within the last 30 days → `active` (the 30 days is application policy and must exceed
  the two-hour `last_used_at` lag; comment this).
- `syncPaused`, `subscriptionActive === true` → `active`.
- `candidate` only when **all** of: binding reserved; not paused; `subscriptionActive === false`
  (known); `feedLastUsedAt` known and more than 30 days ago, or known `null` (never used);
  `lastHumanActivityAt` known and more than 90 days ago, or known `null`. `organisationArchived`
  true satisfies the subscription and activity conditions on its own (reason
  `"organisation archived"`).
- If any of those three signals is `"unknown"` and no `active` rule matched → `unknown`, never
  `candidate`.
- `onboardingComplete` is recorded in the reason text only; it never decides a classification
  (it is always `"unknown"` today).
- No login alone never makes a `candidate` while a feed is in use.

**Verify**: `bun run --cwd packages/xero test` → exit 0 for `inactivity-policy.test.ts`.

### Step 2: Signals query and the report

Add to `schema.prisma`:

```prisma
model XeroInactivityClassification {
  id              String   @id @default(uuid()) @db.Uuid
  clerk_org_id    String
  organisation_id String   @db.Uuid
  xero_tenant_id  String   @db.Uuid
  policy_version  Int
  kind            String   // "active" | "unknown" | "candidate"
  reason          String
  review_status   String   @default("unreviewed")  // "unreviewed" | "reviewed_keep" | "reviewed_escalate"
  classified_at   DateTime @default(now())
  created_at      DateTime @default(now())
  updated_at      DateTime @updatedAt
  @@index([clerk_org_id])
  @@index([organisation_id])
  @@map("xero_inactivity_classifications")
}
```

Generate the additive migration using Prisma schema-diff; reviewer applies only through guarded online verification after SQL review.

Create `packages/database/src/queries/xero-inactivity-signals.ts`: for reserved bindings, return
the raw signal values listed in "Current state" (scope IDs included in each row; no credentials,
no names). Human activity: the most recent `AuditEvent` with a non-null `actor_user_id` for that
Clerk organisation (read the model in `schema.prisma` around `:1100` for its scope columns); if the
model cannot be scoped to the organisation, return `"unknown"`.

Create `packages/xero/src/oauth/inactivity-report.ts` exporting
`buildXeroInactivityReport({ now })` that maps signals to inputs, calls the evaluator, and inserts
one `XeroInactivityClassification` per binding. It performs no other write and imports nothing
from the cleanup code. `packages/xero/scripts/xero-inactivity-report.ts` (run as
`bun run --cwd packages/xero report:xero-inactivity`) calls it and prints counts by `kind`; it is
the only caller. No job runs it.

**Verify**: `bun run --cwd packages/xero test && bun run --cwd packages/database test` → exit 0.
`grep -nE "\.delete(Many)?\(|method: \"DELETE\"|connection-cleanup|management-client" packages/xero/src/oauth/inactivity-policy.ts packages/xero/src/oauth/inactivity-report.ts`
returns no matches.

### Step 3: Metrics

Create `packages/xero/src/metrics.ts`:

```typescript
export type XeroMetricName =
  | "xero.refresh.conflict" | "xero.refresh.failed"
  | "xero.binding.permission_required" | "xero.cleanup.unknown_oldest_age_hours"
  | "xero.admission.denied" | "xero.store.unavailable" | "xero.fetch.deadline_exceeded";
export type XeroMetricLabels = Partial<{
  reason: XeroRecoveryReason | RateLimitDeniedReason | "credential_domain_mismatch";
  class: XeroRateClass["kind"];
  outcome: "committed" | "superseded" | "lost_response" | "failed";
}>;
export function emitXeroMetric(name: XeroMetricName, value: number, labels?: XeroMetricLabels): void;
```

Label values are closed string unions, so an organisation, user or tenant ID cannot type-check as
a label. `emitXeroMetric` calls `log.info` with `{ metric: name, value, ...labels }`.

Emit at: refresh outcomes in `credential-owner.ts` (`conflict` on `superseded`, `failed`);
admission denials in `limiter.ts`; `XeroFetchError` `deadline_exceeded` in `xero-fetch.ts`;
`update_permissions` classifications in `xero-write-adapter.ts`; and once per sweep in
`reconcile-xero-connections.ts`, the age in hours of the oldest `unknown` attempt (the one piece of
new logic: a single `MIN(updated_at)` query through a new function in 161f's
`packages/database/src/queries/xero-cleanup.ts`, which is added to this plan's scope).
Backfill conflicts are reported by the backfill CLIs' own output, not as metrics.

In the execution report, list each metric with its alert threshold (application policy) and the
remediation, pointing to the 161e and 161f operator procedures.

**Verify**: `bun run --cwd packages/xero test` → exit 0, with a `metrics.test.ts` case containing
`// @ts-expect-error` on a call that passes a UUID string as `reason`, and a case asserting the
logged object has only the keys `metric`, `value` and the given labels.

### Step 4: Preflight and the credential domain

Add `XERO_CREDENTIAL_DOMAIN_ID` to `packages/xero/keys.ts` (optional; a UUID). It names the
database that owns canonical credentials for this Xero app.

Preflight (`packages/next-config/preflight.ts`, `app` and `api`): require
`XERO_CREDENTIAL_DOMAIN_ID`, `XERO_REDIRECT_URI` (must be `https`), and keep 161e's checks. Error
text names variables only.

Runtime rule (shared store): `initialiseXeroRateNamespace({ epoch, assumeSpentDaily,
credentialDomainId })` also writes `credentialDomainId` into the namespace sentinel. The admission
script (`admission.lua.ts`) receives the deployment's `XERO_CREDENTIAL_DOMAIN_ID` as an argument
and returns a new denial reason `credential_domain_mismatch` (add it to `RateLimitDeniedReason`;
`xeroFetch` treats it like `infrastructure`) when the sentinel's value differs. In production an
unset `XERO_CREDENTIAL_DOMAIN_ID` makes the store deny everything (preflight already requires it);
in development and test the memory store skips the check. This detects two databases sharing one store and one Xero app. It cannot
detect two deployments that also use different stores; the rollout checklist in Step 7 covers that
by inspection.

Add commented placeholders for the new variables to both `.env.example` files. Update the 161e
`rate:initialise-namespace` script to take `--credential-domain-id`.

**Verify**: `bun run --cwd packages/next-config test` → exit 0 with new cases: each new variable
reported when missing; a non-https redirect URI rejected; captured output contains no value.
`bun run --cwd packages/xero test` → exit 0 with a mismatch-denies test using the in-memory store.
`bun run build && bun run typecheck` → exit 0.

### Step 5: Enablement controls

Do not add a switch. In `CLAUDE.md` (environment table) and `AGENTS.md` (environment table),
document the three controls from "Current state" and state that the binding guard and the shared
limiter are not discretionary.

**Verify**: `grep -n "XERO_REMOTE_CLEANUP_MODE" CLAUDE.md AGENTS.md` returns a match in each.

### Step 6: The evidence runner

Create `tooling/release/xero-evidence.ts`, a pure module:

```typescript
export const XERO_EVIDENCE_CASES: readonly XeroEvidenceCase[]; // from charter Section 8.3
export function buildXeroEvidence(input: {
  results: Partial<Record<XeroEvidenceCaseId, XeroEvidenceObservation>>;
  prerequisites: Record<string, boolean>;
  candidateSha: string;
  deployedSha: string | null;
}): { json: XeroEvidenceReport; markdown: string; exitCode: 0 | 1 };
export function writeXeroEvidence(dir: string, report: ReturnType<typeof buildXeroEvidence>): void;
```

Each case in the report carries:

```text
caseId, requirement, requiredEvidenceLevels,
status: PASS | FAIL | NOT_VERIFIED,
candidateSha, executedAt, nonSecretTargetFingerprint,
commandOrRunnerScenario, exitCodeOrObservedResult,
expectedAssertion, observedAssertion,
restrictedEvidenceLocations, fixtureOwnershipReference,
cleanupStatus, remainingAction
```

Separate top-level statuses for source checks, configured database, distributed store, browser and
live provider. `exitCode` is 0 **only** when every required case is PASS; a missing result or a
false prerequisite yields `NOT_VERIFIED` and exit code 1, and the report names the missing
prerequisite. An observation whose `evidenceLevel` is `mock` can never satisfy a `live_provider`
requirement. In `run-live-integration.ts`, import the module and, in a `finally` around its
existing work, write both files to a `--evidence-dir` argument when given. Do not change anything
else in that script.

Document the exact invocation in the execution report.

**Verify**: `bun run test:release-tools && bun run typecheck:release-tools` → exit 0 with tests
12-14 in `xero-evidence.test.ts`.

### Step 7: Document the rollout and the rollback

Write into `plans/161-xero-execution-report.md`, under "Rollout procedure (not executed)":

1. Capture source, database and configuration fingerprints and the owned fixture inventory.
   Inspect every deployment using the Xero app and confirm they share one database
   (`XERO_CREDENTIAL_DOMAIN_ID`) and one store.
2. Deploy 161b migration A. Run `backfill:xero-tenant-binding --dry-run`; with zero collisions run
   `--apply`. Only then deploy 161b migrations B and C together (B's guard aborts without the
   backfill; C prevents changing an existing tenant row's external Xero file). Deploy 161c-161f
   additive migrations. Verify constraints and **unchanged payroll row counts**.
3. Initialise the rate namespace with
   `bun run --cwd packages/xero rate:initialise-namespace --epoch <e> --assume-spent-daily --credential-domain-id <id>`
   before any deployment running 161e code serves traffic; an empty store is not a fresh daily
   allowance. Drain every deployment still running the process-local limiter first.
4. Generate the current strict version-1 scoped credential identity artefact from 161d. Legacy identity-only arrays are rejected. The locked apply rejects any changed credential envelope, key version, expiry, binding generation, scope, connection identity or eligibility; regenerate stale plans. Run the 161d two-phase credential-owner backfill (identity plan, then `--dry-run`, then
   `--apply`). Bindings it cannot verify stay on the legacy path and are listed for controlled
   reauthorisation. **Never choose account owners automatically.**
5. Deploy 161g. Unowned (legacy) bindings keep working through 161d's legacy fallback inside
   `resolveXeroAccess`. Verify recovery reasons, the callback and refresh recovery on owned
   fixtures. Groups of bindings sharing one Xero user that the backfill left unowned are attached
   by a controlled reauthorisation, one customer at a time, with that customer's agreement.
6. With `XERO_REMOTE_CLEANUP_MODE` unset, observe cleanup requests and targets in report-only mode.
7. Set `XERO_REMOTE_CLEANUP_MODE=enabled` only after the management-token provisioning row in the
   provider ledger is verified, owned live DELETE outcomes pass, and the operator procedure is
   staffed.
8. Run the evidence runner against the same candidate; record local and deployed SHAs separately.
9. Scrub the mirrored `XeroConnection` credential columns (and remove 161d's mirror-write in a
   follow-up) only after every reserved binding has an owner and no reader remains. Keep old key
   material while any envelope references it.

Rollback: stop provider admission and the cleanup worker where needed; preserve local disables,
reservations, attempt history and adopted credentials; restore only a compatible reviewed version.
Do not restore stale refresh tokens from a backup and use them. Do not reverse additive migrations
by deleting payroll data. **Never revert to silent rebinding, independent token rotation or
fail-open rate limiting.** An unresolved issued DELETE stays unresolved after a code rollback.

**Verify**: `grep -c "Rollout procedure (not executed)" plans/161-xero-execution-report.md` prints `1`.

### Step 8: Documentation

- `CLAUDE.md` and `AGENTS.md`: add `reconcile-xero-connections` to both Inngest job lists; add
  `XERO_APP_TIER`, `XERO_RATE_NAMESPACE_EPOCH`, `XERO_CREDENTIAL_DOMAIN_ID`,
  `XERO_REMOTE_CLEANUP_MODE`, `XERO_TOKEN_ENCRYPTION_ACTIVE_VERSION`,
  `XERO_TOKEN_ENCRYPTION_KEYS_JSON` to both environment tables.
- `PRODUCT.md`: the credential owner, provider connection and binding-on-`XeroTenant` model.
- `tasks/todo.md`, `tasks/lessons.md`: append scoped entries; preserve history.
- `plans/README.md`: status rows for 161b-161h.

**Verify**: `grep -c "reconcile-xero-connections" CLAUDE.md AGENTS.md` prints at least `1` for each.

## Test plan

`inactivity-policy.test.ts` (new):
1. **An active calendar feed with no login for six months is not a candidate.**
2. A feed used 2 hours ago (within the `last_used_at` lag) counts as use.
3. `syncPaused` is `active`, not a candidate.
4. An active subscription is `active`.
5. Scheduled sync success is not an input (type-level: the inputs have no such field).
6. Any `"unknown"` input yields `unknown`, never `candidate`.
7. The full candidate case carries a reason; the report row stores `policy_version`.
8. Purity: same inputs twice give equal outputs; the module has no runtime imports (assert on the
   file's import lines).

Instrumentation and configuration:
9. A UUID passed as a label fails to type-check, and the logged object carries only `metric`, `value` and labels.
10. Preflight reports each new variable when missing and never echoes a value.
11. A different `XERO_CREDENTIAL_DOMAIN_ID` from the recorded one denies admission.

`tooling/release/` tests:
12. The runner exits non-zero when a mandatory prerequisite is missing and records which.
13. A required skipped case is `NOT_VERIFIED`, never `PASS`.
14. A mocked-transport result is never recorded at the live-provider level.

## Done criteria

All must hold:

- [x] `bun run check`, `bun run typecheck`, `bun run build` (with the two variables), `bun run test` exit 0
- [x] `bun run --cwd packages/next-config test` exits 0 with the new preflight cases
- [x] `bun run test:release-tools && bun run typecheck:release-tools` exit 0
- [x] `git diff --check` exits 0
- [x] `grep -nE "\.delete(Many)?\(|method: \"DELETE\"|connection-cleanup|management-client" packages/xero/src/oauth/inactivity-policy.ts packages/xero/src/oauth/inactivity-report.ts` returns no matches
- [x] `grep -c "reconcile-xero-connections" CLAUDE.md AGENTS.md` shows at least 1 in each
- [x] `grep -n "XERO_REMOTE_CLEANUP_MODE" CLAUDE.md AGENTS.md` matches in each
- [x] `grep -c "Rollout procedure (not executed)" plans/161-xero-execution-report.md` prints `1`
- [x] `xero-evidence.test.ts` includes a case where a prerequisite is `false`: `buildXeroEvidence` returns `exitCode: 1`, both `json` and `markdown` are non-empty and name the prerequisite, and `writeXeroEvidence` writes both files to a temporary directory
- [x] `git status --short -- . ':!plans'` shows no modified file outside the In scope list, and `plans/` changes are limited to the files this plan names
- [x] `plans/README.md` status rows for 161b-161h reflect actual state

## STOP conditions

Stop and report; do not improvise:

- Any of 161b-161g is not DONE, or the drift-check names are missing.
- You are about to send an inactivity notice, or to delete or disable anything because of an
  inactivity classification.
- Feed usage evidence cannot be read through the database query. Classify those bindings
  `unknown`.
- Adding a metric would require an organisation, user or tenant identifier as a label.
- Wiring the writer into `run-live-integration.ts` would require changing its live-authority
  checks or argument contract beyond adding `--evidence-dir`.
- You are about to perform any rollout step, run a backfill against a real database, push, deploy
  or mutate production.
- A step's verification fails twice after a reasonable fix attempt.

## Maintenance notes

- **The evaluator is pure and the report is write-only to its own table.** Wiring it to 161f's
  cleanup is a product decision needing explicit authority, not a refactor.
- **Test 1 is the test that matters.** A feed consumed for six months with no login is the product
  succeeding.
- `policy_version` is stored per classification so policy changes do not reinterpret history.
- The credential-domain check catches a configuration mistake that otherwise shows up as random
  disconnections when two databases fight over one refresh token. Do not relax it.
- In review, scrutinise: any side effect in the inactivity modules, any metric label, and the
  runner's exit-code logic.
- **Deferred, each needing its own plan and authority:** executing the rollout; inactivity cleanup
  with notice and retention policy; retiring `XERO_TOKEN_ENCRYPTION_KEY`; dropping the mirrored
  credential columns; removing 161d's mirror-write; NZ or UK activation.


## Independent execution approval, 26 September 2026

**APPROVE** isolated runtime candidate `8325a35b328b4786181c421ce8a89e946f119a84`, branch `codex/xero-rollout-inactivity`, worktree `/tmp/tc-161h`. Independent full source/test/schema review found no remaining actionable issue. Dependencies remain DONE; 161g and 161h are approved isolated branches, not merged.

Independent source gates PASS: lint 1114 files; forced types 19 uncached tasks; full units 2723 tests across 18 uncached tasks; boundaries 1068 files across 21 packages; release tooling 175 tests across 18 files and tooling types; strict metric and both changed integration-fixture types; four uncached synthetic builds; separate next-config 47 tests; all documentation, report-only prohibited-operation, scope and base-to-candidate whitespace criteria. Eleven regenerated files differed only in whitespace and were restored byte-for-byte to the reviewed candidate. The two inherited deadline timing scenarios use controlled clocks with all original assertions retained.

Protected online Neon campaign `f7578441-2838-4361-9ced-0f59a19d73c3` passed all **27 files, 233 tests and six uncached tasks**, in 9m6.962s. Package totals: database 45, jobs 78, Xero 72, availability 21, feeds 15 and app 2. Jobs retained the complete 505-record fixture and both passes, completing in 456.90 seconds. Actual owned Redis domain immutability, matching reinitialisation, legacy/malformed/foreign denial and unchanged allowance assertions passed. Durable ownership covers 55 tenant slots and 146 kind-qualified global keys. Fresh strict consumer isolation and exact target identity were verified before writes; restore evidence records timeline `73cb5a3404beeb6412275bed23ffa160`, LSN `0/4BB179F8`.

The independently reviewed additive migration `20260926130000_add_xero_inactivity_classifications` was applied under protected authority and the active-run fence. Final SQL SHA-256: `0606302b88c98b28aadc4dd42ab4c1ce674e3f08a6d0b577f169559d062b2d93`. All 21 applied checksums match; zero pending migrations. Read-only schema comparison reports `No difference detected`. Its first invocation did not propagate the private environment into the Prisma subprocess; an explicit environment-preserving subprocess rerun passed, with no guard or source change.

Independent post-run cleanup PASS: zero owned rows across all 39 selectors, active fence released, durable manifest and strict empty-consumer isolation verified. Outside-owned catalogue digest remains `41e95ac3737a446c207e103f8c13538b2b04933b005a7de9f737beeafbc8bb8e`. All 204 pre-existing rows across 37 tables retain their exact per-table counts; the new classification table has zero rows. No registered or archived Inngest app and no nonterminal run. Source remained frozen and clean throughout the campaign. Temporary private verification credentials were removed after final read-back.

Both restricted evidence artefacts are present at `/tmp/tc161h-evidence/xero-evidence.json` and `/tmp/tc161h-evidence/xero-evidence.md`, mode 0600. They record actual inventory PASS, cleanup PASS, command exit zero and released fence. All 40 charter cases and their required levels remain NOT_VERIFIED without separately supplied assertion provenance; the builder does not infer case PASS from infrastructure success. Deployed SHA is null. Production rollout, customer backfills, commercial namespace activation, destructive provider operations, browser and real Xero provider behaviour remain NOT VERIFIED or unexecuted. Cleanup remains `report_only`. No deployment, merge or push occurred.

Documentation closure copies this completed reviewer plan and DONE index exactly, updates only the scoped 161h task review and appends the same evidence to the execution report. Runtime, generated output, schema and SQL remain byte-identical to the verified candidate; no repeat database campaign is required for documentation-only closure.


## Merge to main, 26 September 2026

The user authorised committing all remaining work and merging to main. Remaining reviewer documentation was committed as `24ffcf2`; merge `2a2439561b06c0a9e61e091c151b4539ff8b7533` brings approved Plan 161g `fca052bf78d39d03da4ad0cbc62ef29566b6cee0` and Plan 161h `a206458365a0697c7deead43b123ecf9b81f9c7a` into main. The merge completed without conflicts and its complete tree is byte-identical to approved `a206458`. Runtime, schema, generated files and SQL remain identical to the independently verified `8325a35` candidate. Both feature commits are ancestors of main. Existing source gates and protected online Neon evidence therefore remain applicable; no repeated database campaign is claimed. This follow-up records merged status only. Rollout, provider/browser verification, namespace activation, deployment and push remain unexecuted; cleanup remains `report_only`.

### Cross-plan reconciliation, 27 September 2026

Current audit, scoped bug corrections, uncached source gates, complete protected online Neon/Redis inventory, all 21 migration checksums, schema and integrity read-back, fixture cleanup and catalogue preservation are consolidated in `plans/160-161-reconciliation.md`. Historical source candidates and counts above remain execution records. Source-slice DONE does not certify the Plan 160 real browser/provider campaign, customer backfills, namespace activation or the charter production sign-off. The already authorised online Neon protected-runner policy remains mandatory.
