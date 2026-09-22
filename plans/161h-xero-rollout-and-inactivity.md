# Plan 161h: Add report-only inactivity assessment, monitoring and a safe rollout for the Xero hardening programme

> **Executor instructions**: Follow this plan step by step. Run every verification command and
> confirm the expected result before moving to the next step. If anything in "STOP conditions"
> occurs, stop and report - do not improvise. When done, update the status row for this plan in
> `plans/README.md` unless a reviewer dispatched you and told you they maintain the index.
>
> **Drift check (run first)**:
> ```bash
> git diff --stat 8652c31..HEAD -- \
>   packages/xero/src packages/next-config tooling/release
> ```
> At the time this plan was written that diff was empty. If it is now non-empty, compare the
> "Current state" excerpts below against the live code before proceeding. A mismatch is a STOP
> condition.

## Status

- **Priority**: P2 for the inactivity evaluator; **P1** for the rollout and monitoring work,
  which is what makes 161b–161g deployable
- **Effort**: M
- **Risk**: MED for code, HIGH for the rollout sequence it describes
- **Depends on**: 161b, 161c, 161d, 161e, 161f and 161g. All six.
- **Category**: dx, docs, direction
- **Planned at**: commit `8652c31`, 22 September 2026 (re-stamped from `585f6cb`; the only changes between those commits are under `plans/`, so every source excerpt below is valid at both)
- **Programme charter**: `plans/161-harden-xero-connection-lifecycle.md`

## Why this matters

Two things remain after 161b–161g land.

**Operational visibility.** The programme adds distributed budgets, a credential owner model,
fenced bindings and an asynchronous cleanup worker. Each has a failure mode that is silent without
metrics: refresh conflicts, ageing unknown cleanups, budget denials, shared-store outages,
migration conflicts. Deploying all of that without instrumentation means the first signal of a
problem is a customer complaint.

**Inactivity, carefully.** Xero's best-practice guidance asks integrators to identify and clean up
inactive connections. The dangerous version of that feature deletes a paying customer's connection
because nobody logged in last month. This plan builds only the **evaluator and the report**. It
sends no notice and deletes nothing, because the evidence needed to distinguish "abandoned" from
"working exactly as intended, headlessly" is subtle and the cost of getting it wrong is a
customer's payroll integration.

## Current state

- `packages/next-config/bin/preflight.ts` - the preflight entry point, run by `bun run preflight`.
- `packages/xero/keys.ts` (76 lines) - env validation via `@t3-oss/env-nextjs` `createEnv` with
  `emptyStringAsUndefined: true`, plus a module-load `keys()` call that blocks boot outside test.
  By this point 161c has added the encryption keyring variables and 161e has added `XERO_APP_TIER`.
- `packages/observability` - Sentry and the structured logger. **All logging goes through it;
  there is no `console.log` in production code.**
- `packages/analytics` - PostHog and Vercel analytics.
- `tooling/release/` - the release harness: `run-live-integration.ts`, `verify-live-target.ts`,
  `write-protected-manifest.ts`, `integration-inventory.ts`, `cleanup.ts`,
  `playwright.config.ts`, `vitest.config.ts`, `migration-check.ts`.
- Feed usage records: check how they treat cached and `304` responses **before** relying on them
  as activity evidence. A feed that is being polled and returning 304 is an actively used feed.

### Signals that already exist and must be respected

Onboarding completion state, active entitlement (`clerk_org_subscriptions`, via
`packages/billing`), authorised early-access service, enabled publication, feed consumption,
explicit sync pause (`XeroTenant.sync_paused_at`), and cancellation or archive state.

### Repository conventions to match

- Service functions return `Result<T, E>` from `@repo/core`. Named exports only. No `any`.
- Zod on all external input. **No `console.log`; use `@repo/observability`.**
- Optional env vars with a format constraint must be **absent**, never `""`.
- Australian English. **No em dashes anywhere.**

## Commands you will need

**Fresh worktree setup.** This repository's `.env*` files are gitignored (`.gitignore:35`), so
a new worktree has none of them. Before running any gate, from the worktree root:

```bash
bun install --frozen-lockfile
```

`bun run test`, `bun run check`, `bun run typecheck` and `bun run boundaries` then work with no
further setup. **`bun run build` additionally requires two variables**, because
`packages/xero/keys.ts:74` validates at module load whenever `NODE_ENV` is not `test`, and
`packages/database/keys.ts:10` has no fallback:

- `DATABASE_URL` - any syntactically valid Postgres URL is enough for a build; the client is
  lazy and nothing connects. Do **not** point it at the real database.
- `XERO_TOKEN_ENCRYPTION_KEY` - any 32-byte base64 value is enough for a build.

Supply them for the build command only. **Do not create a committed `.env` file, do not copy the
developer's real values, and do not make either variable optional in `keys.ts` to avoid setting
them.**

**Two commands are not local gates and appear in no Done criteria here.**
`bun run preflight <app|api|web>` is a production deployment gate: it requires a positional
argument and the production-only variables `NEXT_PUBLIC_LAUNCH_MODE`, four Sentry variables and
three Better Stack variables. `bun run test:release` is a deployed-candidate Playwright suite:
`tooling/release/e2e/environment.ts:11-17` requires six `TC_*` variables validated when the
config is merely loaded, and `tooling/release/playwright.config.ts:22-33` declares Firefox and
WebKit projects whose browsers are not installed by default. Both run during the Plan 161h
rollout and the Plan 160 campaign. **Never stub either to make it run locally.**

| Purpose | Command | Expected on success |
|---|---|---|
| Lint | `bun run check` | exit 0 |
| Types | `bun run typecheck` | exit 0 |
| Build | `bun run build` | exit 0 |
| All units | `bun run test` | exit 0 |
| Xero units | `bun run --cwd packages/xero test` | exit 0 |
| next-config units | `bun run --cwd packages/next-config test` | exit 0 |
| Release tool tests | `bun run test:release-tools` | exit 0 |
| Release tool types | `bun run typecheck:release-tools` | exit 0 |
| Filtered app Xero tests | `bun run --cwd apps/app test 'app/(authenticated)/settings/integrations/xero'` | exit 0 |
| Whitespace | `git diff --check` | exit 0 |

## Scope

**In scope:**
- `packages/xero/src/oauth/inactivity-policy.ts` and `inactivity-policy.test.ts` (create)
- `packages/database/src/queries/` - the scoped reporting query
- `packages/database/prisma/schema.prisma` and an additive migration for the policy record
- `packages/observability` instrumentation for the new metrics
- `packages/next-config/` preflight validation
- `packages/xero/keys.ts`, `keys.test.ts`
- App and API `.env.example`
- `tooling/release/` runners, manifest and cleanup support, the JSON evidence schema and its tests
- `PRODUCT.md`, `CLAUDE.md` (job list and the credential-owner exception), `AGENTS.md`
- `plans/161-xero-execution-report.md`, `plans/README.md`
- `tasks/todo.md`, `tasks/lessons.md`

**Out of scope - do NOT touch:**
- **Any automatic deletion driven by inactivity.** This plan is report-only, absolutely.
- **Any customer notice or email.** No inactivity notice is sent under this plan.
- `packages/xero/src/oauth/` lifecycle logic - 161d and 161f own it.
- `packages/xero/src/rate-limit/` internals - 161e.
- Creating a generic feature-flag package. Reuse an existing mechanism.
- Adding invasive analytics purely to support cleanup. Use evidence that already exists.
- Any real deployment, push, or production mutation. This plan **describes** the rollout; it does
  not perform it.

## Git workflow

- Branch: `codex/xero-connection-hardening` (shared across 161a–161h).
- Conventional commits. Suggested: `feat(xero): add report-only inactivity evaluator`, then
  `feat(observability): instrument xero lifecycle metrics`, then
  `docs: record xero hardening rollout and rollback procedure`.
- Do NOT push or open a PR.

## Steps

### Step 1: The inactivity evaluator, as a pure function

Create `packages/xero/src/oauth/inactivity-policy.ts` exporting a **pure** evaluator: inputs in,
classification out, no database access and no side effects. That purity is what makes the policy
testable against the adversarial cases in the test plan.

Rules it must encode:

- **Separate customer or service activity from API polling and token maintenance.** Our own
  scheduled sync succeeding every hour is evidence the integration works, **not** evidence a human
  is using it, and equally not evidence of abandonment.
- **No recent login is not inactivity.** A published calendar feed consumed by Outlook with nobody
  ever opening the app is the product working as designed.
- Successful polling cannot make an abandoned account look customer-active.
- **Missing evidence is `unknown`**, never `inactive`.
- Consider: onboarding completion, active entitlement or authorised early access, enabled
  publication, feed consumption, explicit sync pause, cancellation or archive, and retention
  decisions.
- Verify how existing feed usage records treat cached and `304` requests before relying on them.
  A 304 means the feed **is** being consumed.

Store the policy version, the candidate reason, the uncertainty and the review status alongside
each classification, so a later policy change does not silently reinterpret old classifications.

**Verify**: `bun run --cwd packages/xero test` → exit 0 for `inactivity-policy.test.ts`.

### Step 2: The scoped report

Add a scoped reporting query and an operator-reviewed candidate report, with a defined hand-off to
161f's targeted cleanup workflow. Future execution of that hand-off needs its own concrete
authority plus a notice and retention policy; it is not authorised here.

**This plan sends no inactivity notice and performs no automatic inactivity-driven DELETE.**
Explicit disconnect and provably abandoned OAuth cleanup use their own paths in 161f.

Do not claim that a report-only classification proves an operational removal process exists, or
that it satisfies any Xero certification requirement.

**Verify**: `bun run --cwd packages/xero test && bun run --cwd packages/database test` → exit 0.
`grep -rn "delete\|DELETE" packages/xero/src/oauth/inactivity-policy.ts` → no matches.

### Step 3: Metrics

Track safe aggregate metrics through `packages/observability`:

refresh conflicts and failures; recovery age; permission-required bindings;
disabled-but-remote-unknown bindings; cleanup attempts and their age; budget denials;
shared-store failures; deadline and body failures; migration conflicts.

**Avoid high-cardinality customer identity in public telemetry.** Aggregate counts and buckets,
not per-customer series. Configure alert ownership and document remediation for each.

**Verify**: `bun run --cwd packages/xero test` → exit 0, with a test asserting no
`clerk_org_id`, `organisation_id` or user ID appears in an emitted metric label.

### Step 4: Preflight

Extend preflight to validate, for **both** the app and API caller deployments: the intended app
identity and tier, the callback URL, required scopes and capabilities, the encryption key
versions, the shared rate store, and the execution mode.

Verify that **all deployments sharing an OAuth app use the same canonical credential and lock
domain as well as the same rate-budget domain.** Two separate databases using the same app and
user credentials cannot each act as an independent canonical owner: they will fight over the same
refresh token. **Do not resolve that by copying credentials between them or by creating a second
Xero app.** Detect it and fail preflight.

Retain preview connection gating and the registered callback behaviour. **No secret value appears
in preflight output.**

**Verify**: `bun run --cwd packages/next-config test` → exit 0, including new tests that the preflight validator reports each new Xero variable as missing when unset, rejects two deployments sharing one OAuth app but not one credential domain, and never echoes a value.
`bun run build && bun run typecheck` → exit 0.

The real `bun run preflight <app|api|web>` runs during the rollout in Step 7 against a configured deployment. It is not a gate here.

### Step 5: Enablement controls, failing safe

Use explicit configuration for three switches: canonical-credential cutover, shared-limiter
readiness, and remote-cleanup execution. Reuse an existing mechanism; do not create a feature-flag
package.

**Defaults fail safe.** Missing destructive-cleanup approval or configuration keeps the system
report-only while production readiness stays incomplete.

Two of these are **not** discretionary toggles, and the code and documentation must say so:

- **The binding guard.** Once enabled, no rollback may restore silent payroll-file replacement.
- **The shared limiter.** Loss of the shared store must not switch production back to
  process-local quota admission.

**Verify**: `bun run test` → exit 0.
`bun run --cwd packages/xero test` → exit 0 with a test asserting the default configuration leaves
destructive cleanup disabled.

### Step 6: The evidence runner

Extend the existing Plan 160 / release manifest runner in `tooling/release/`. **Do not invent a
new CLI name and do not create a second testing system.** Document the exact executable invocation
in `plans/161-xero-execution-report.md` once implemented.

Produce Markdown **and** machine-readable JSON, even when prerequisites are missing or tests fail.
Each required case records:

```text
caseId, requirement, requiredEvidenceLevels,
status: PASS | FAIL | NOT_VERIFIED,
candidateSha, executedAt, nonSecretTargetFingerprint,
commandOrRunnerScenario, exitCodeOrObservedResult,
expectedAssertion, observedAssertion,
restrictedEvidenceLocations, fixtureOwnershipReference,
cleanupStatus, remainingAction
```

Use separate top-level status values for source checks, configured-database tests,
distributed-store tests, browser tests and live provider verification. Record the local
integration SHA and any deployed SHA **separately**.

The runner exits zero **only** when all required selected cases pass. Use a non-zero exit for a
failed assertion or a missing mandatory prerequisite, and record which. A required skipped
scenario is `NOT_VERIFIED`, never `PASS`.

**Never report a mocked HTTP test as live Xero proof, or a single-process fake as distributed-store
proof.** Real provider identifiers and customer diagnostics belong in access-controlled evidence,
not a public repository report.

**Verify**: `bun run test:release-tools && bun run typecheck:release-tools` → exit 0.

### Step 7: Document the rollout and the rollback

Write the following into `plans/161-xero-execution-report.md`. This is documentation of a
**procedure**; executing it needs its own authority and is not part of this plan.

**Rollout sequence:**

1. Capture source, database and configuration fingerprints, the owned fixture inventory and
   recovery evidence. Produce a restricted duplicate and provenance report.
2. Apply the additive expansion migrations on the existing authorised database. Verify the
   constraints, the backup and recovery provisions, and **unchanged payroll identity and counts**.
3. Run the resumable credential and binding migration; verify every resolvable row. Quarantine
   ambiguous rows with explicit recovery state. **Never choose account owners automatically.**
4. Quiesce and drain incompatible old token writers and process-local rate callers across every
   deployment. Canonical coordination and distributed budgets must not be undercut by an old
   deployment still running.
5. Switch credential readers/writers and binding guards; verify error and capability handling, the
   callback, and refresh recovery. Account **conservatively** for pre-cutover provider usage when
   enabling shared budgets: an empty store does not mean a fresh daily allowance.
6. Deploy and verify management **read and report mode**. Observe the candidate sets and the
   protected active references before enabling any deletion.
7. Enable targeted cleanup only after authority, the documented endpoint contract, owned live
   outcomes, generation fencing and the operator recovery gate all pass.
8. Run the final configured-database, real shared-store, browser and authorised live-provider
   scenarios on the same candidate. Record the final merged or deployed SHA separately.
9. Scrub superseded secret copies **only after** canonical references and recovery envelopes are
   proven. Keep non-secret history and the old key material needed by legitimately retained
   ciphertext until it can be safely retired.

**Rollback:**

Stop new provider admissions and cleanup workers where required. Preserve the local disable state,
the reservations, the attempt history and the adopted canonical credentials. Restore only a
compatible reviewed code version.

**Do not restore stale refresh tokens from a backup and immediately use them.** Restore service
through controlled provider reconciliation or reauthorisation.

Do not reverse the additive migrations by deleting payroll data. **Never revert to silent
rebinding, legacy independent token rotation, or fail-open rate limiting.** An unresolved issued
DELETE stays unresolved after an application rollback; rolling back the code does not recall it.
Report the actual reduced service and the required operator action.

**Verify**: `bun run check && bun run typecheck && git diff --check` → all exit 0.

### Step 8: Update the documentation

- `CLAUDE.md`: add `reconcile-xero-connections` to the Inngest job list; add the new environment
  variables to the environment table; record the `XeroCredentialOwner` `clerk_org_id` exception.
- `PRODUCT.md`: record the credential owner, provider connection and tenant binding model.
- `AGENTS.md`: the architecture sections affected.
- `tasks/todo.md` and `tasks/lessons.md`: scoped entries. **Preserve existing history.**
- `plans/README.md`: status rows for 161a–161h.

**Verify**: `grep -n "reconcile-xero-connections" CLAUDE.md` returns a match.

## Test plan

`packages/xero/src/oauth/inactivity-policy.test.ts` (new). These cases are adversarial on purpose;
each is a way the naive version of this feature deletes a real customer's connection:

1. **An active calendar feed with no login for six months is not inactive.** The headline case:
   the product working exactly as designed looks like abandonment to a login-based policy.
2. A feed returning `304` counts as consumption, not silence.
3. Deliberately paused sync (`sync_paused_at` set) is not inactivity.
4. An active entitlement or authorised early-access service is not inactivity.
5. Our own successful scheduled polling does **not** make an abandoned account look active.
6. Missing evidence classifies as `unknown`, never `inactive`.
7. Incomplete onboarding plus no feed plus no entitlement is a **candidate**, and the record
   carries a reason and the policy version.
8. The evaluator is pure: the same inputs give the same output and it performs no I/O.

Instrumentation and configuration tests:
9. No emitted metric label contains `clerk_org_id`, `organisation_id` or a user ID.
10. Default configuration leaves destructive cleanup disabled.
11. Preflight rejects two deployments sharing one OAuth app but not one credential domain.
12. Preflight output contains no secret value. Assert on the captured output.

`tooling/release/` tests:
13. The evidence runner exits non-zero when a mandatory prerequisite is missing, and records which.
14. A required skipped scenario is recorded `NOT_VERIFIED`, never `PASS`.
15. A mocked HTTP result is not recorded as live provider evidence.

## Done criteria

All must hold:

- [ ] `bun run check` exits 0
- [ ] `bun run typecheck` exits 0
- [ ] `bun run build` exits 0
- [ ] `bun run test` exits 0
- [ ] `bun run --cwd packages/next-config test` exits 0, including the new preflight validator tests
- [ ] `bun run test:release-tools` exits 0
- [ ] `bun run typecheck:release-tools` exits 0
- [ ] `bun run --cwd apps/app test 'app/(authenticated)/settings/integrations/xero'` exits 0
- [ ] `git diff --check` exits 0
- [ ] `grep -rn "DELETE\|delete" packages/xero/src/oauth/inactivity-policy.ts` returns no matches
- [ ] `grep -n "reconcile-xero-connections" CLAUDE.md` returns a match
- [ ] The evidence runner produces both Markdown and JSON when run with a deliberately missing prerequisite, and exits non-zero
- [ ] `git status --short` shows no modified file outside the In scope list
- [ ] `plans/README.md` status rows for 161a-161h reflect actual state

## STOP conditions

Stop and report; do not improvise:

- Any of 161b–161g is incomplete. This plan's monitoring and rollout describe **their** behaviour;
  documenting a rollout for code that does not exist produces a false readiness signal. Report
  which plans are outstanding.
- You are about to send an inactivity notice, or to delete anything on the basis of an inactivity
  classification. **Neither is authorised by this plan, in any form, for any account.**
- Existing feed usage records turn out **not** to distinguish a cached or `304` request from no
  request at all. Then feed consumption is not usable evidence. Report it and mark those
  classifications `unknown` rather than inferring inactivity.
- Preflight detects two deployments sharing an OAuth app but not a credential domain. Report it.
  **Do not resolve it by copying credentials or by creating a second Xero app.**
- Adding a metric would require high-cardinality customer identity in public telemetry. Aggregate
  instead, or report that the metric is not safely obtainable.
- A step's verification fails twice after a reasonable fix attempt.
- You are about to perform the rollout rather than document it, or to push, deploy or mutate
  production. This plan writes a procedure. Executing it is a separate, authorised act.

## Maintenance notes

- **The inactivity evaluator is pure and report-only, and both properties are load-bearing.**
  The pressure over time will be to "just wire it up" to the cleanup worker from 161f, which is
  one small change away and would make the system delete customer connections on a heuristic.
  Any change that gives this module database write access or a cleanup dependency should be
  treated as a product decision requiring explicit authority, not a refactor.
- **Test 1 is the test that matters.** A calendar feed consumed by Outlook for six months with
  nobody logging in is the product succeeding. Any future policy change must keep that case
  passing.
- The policy version is stored per classification so that changing the policy does not silently
  reinterpret historical candidates. Keep writing it.
- Preflight's credential-domain check catches a configuration mistake that is invisible until two
  deployments start fighting over one refresh token, at which point customers see random
  disconnections. Do not relax it to unblock an environment.
- In review, scrutinise: anything that gives the inactivity module a side effect, any metric label
  carrying customer identity, and any change to the evidence runner's exit-code logic (a runner
  that exits zero on a skipped mandatory scenario silently certifies an unverified release).
- **Deferred, and each needs its own plan and authority:** executing the rollout; actual inactivity
  cleanup with a notice and retention policy; retiring `XERO_TOKEN_ENCRYPTION_KEY`; dropping the
  legacy credential columns on `XeroConnection`; and NZ or UK activation.
