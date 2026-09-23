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
- **Planned at**: commit `6b934be`, 23 September 2026 (reviewed and re-stamped from `8652c31`; excerpts re-read at `6b934be`, before 161b-161g)
- **Programme charter**: `plans/161-harden-xero-connection-lifecycle.md`

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

**Local integration database**: 161b's "Local integration database" block with the `LOCAL_OK`
check, for Step 2's migration only.

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
| Apply migrations (local) | `bun run migrate:deploy` | exit 0 after `LOCAL_OK` |
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

Generate the migration as in 161b and apply it locally.

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
   `--apply`. Only then deploy 161b migration B (its guard aborts otherwise). Deploy 161c-161f
   additive migrations. Verify constraints and **unchanged payroll row counts**.
3. Initialise the rate namespace with
   `bun run --cwd packages/xero rate:initialise-namespace --epoch <e> --assume-spent-daily --credential-domain-id <id>`
   before any deployment running 161e code serves traffic; an empty store is not a fresh daily
   allowance. Drain every deployment still running the process-local limiter first.
4. Run the 161d two-phase credential-owner backfill (identity plan, then `--dry-run`, then
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

- [ ] `bun run check`, `bun run typecheck`, `bun run build` (with the two variables), `bun run test` exit 0
- [ ] `bun run --cwd packages/next-config test` exits 0 with the new preflight cases
- [ ] `bun run test:release-tools && bun run typecheck:release-tools` exit 0
- [ ] `git diff --check` exits 0
- [ ] `grep -nE "\.delete(Many)?\(|method: \"DELETE\"|connection-cleanup|management-client" packages/xero/src/oauth/inactivity-policy.ts packages/xero/src/oauth/inactivity-report.ts` returns no matches
- [ ] `grep -c "reconcile-xero-connections" CLAUDE.md AGENTS.md` shows at least 1 in each
- [ ] `grep -n "XERO_REMOTE_CLEANUP_MODE" CLAUDE.md AGENTS.md` matches in each
- [ ] `grep -c "Rollout procedure (not executed)" plans/161-xero-execution-report.md` prints `1`
- [ ] `xero-evidence.test.ts` includes a case where a prerequisite is `false`: `buildXeroEvidence` returns `exitCode: 1`, both `json` and `markdown` are non-empty and name the prerequisite, and `writeXeroEvidence` writes both files to a temporary directory
- [ ] `git status --short -- . ':!plans'` shows no modified file outside the In scope list, and `plans/` changes are limited to the files this plan names
- [ ] `plans/README.md` status rows for 161b-161h reflect actual state

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
