# Plan 161e: Replace process-local Xero rate limiting with a shared, fail-closed distributed budget

> **Executor instructions**: Follow this plan step by step. Run every verification command and
> confirm the expected result before moving to the next step. If anything in "STOP conditions"
> occurs, stop and report - do not improvise. When done, update the status row for this plan in
> `plans/README.md` unless a reviewer dispatched you and told you they maintain the index.
>
> **Drift check (run first)**:
> ```bash
> git diff --stat 8652c31..HEAD -- \
>   packages/xero/src/rate-limit packages/core/src/redis-rest-transport.ts packages/xero/keys.ts
> ```
> At the time this plan was written that diff was empty. If it is now non-empty, compare the
> "Current state" excerpts below against the live code before proceeding. A mismatch is a STOP
> condition.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: HIGH (fail-closed admission: a mistake stops all Xero traffic rather than degrading)
- **Depends on**: `plans/161a-xero-baseline-and-fixture-ownership.md` (the shared-store namespace
  fixtures and the rate-bucket column of the provider contract ledger) and
  `plans/161c-xero-deadlines-and-key-versioning.md` (the corrected transport and the deadline
  contract). Consumes `resolveXeroAccess` from
  `plans/161d-xero-canonical-credentials.md` where available.
- **Category**: bug, security
- **Planned at**: commit `8652c31`, 22 September 2026 (re-stamped from `585f6cb`; the only changes between those commits are under `plans/`, so every source excerpt below is valid at both)
- **Programme charter**: `plans/161-harden-xero-connection-lifecycle.md`

## Why this matters

Xero's rate limits are enforced per **Xero tenant** across every caller using the same app. Team
Calendar's limiter holds its counters in in-process `Map`s and keys them by **internal** IDs. Three
consequences follow, and all three are live today:

1. Every Vercel instance starts with a fresh full budget, so the real aggregate can be many times
   the permitted rate.
2. Reconnecting a payroll file mints new internal IDs, which resets that tenant's allowance even
   though Xero's counter did not move.
3. The daily allowance is hard-coded at 5,000, which is correct only for non-Starter tiers. On
   Starter the real ceiling is 1,000 and the app will blow through it.

When the limiter is wrong, the failure is not local: Xero throttles the whole app, and every
customer's sync stops.

## Current state

### Process-local state

`packages/xero/src/rate-limit/limiter.ts` (262 lines):

```typescript
// packages/xero/src/rate-limit/limiter.ts:31-35
export type RateLimitDeniedReason = "concurrency" | "daily" | "minute";

export type RateLimitAcquireResult =
  | { ok: false; reason: RateLimitDeniedReason }
  | { ok: true; release: () => void };
```

```typescript
// packages/xero/src/rate-limit/limiter.ts:79-84
export class XeroRateLimiter {
  // ...
  private readonly orgStates = new Map<string, OrgState>();
  private readonly concurrency = new Map<string, ConcurrencyState>();
```

`OrgState` holds two `TokenBucket`s (`day` and `minute`), each with `capacity`, `lastRefillMs`,
`refillPerMs` and `tokens`. That is a **continuously refilling token bucket**, which is not the
same thing as a strict rolling-window cap.

### Wrong key identity

`packages/xero/src/rate-limit/xero-fetch.ts:55-65`:

```typescript
// Build the org-scoped limiter key from the tenant identity already threaded
// through every Xero call. Falls back to the clerk org id alone for OAuth
// bootstrap calls made before an Organisation row exists.
export function orgRateLimitKey(input: {
  clerkOrgId: string;
  organisationId?: null | string;
}): string {
  return input.organisationId
    ? `${input.clerkOrgId}:${input.organisationId}`
    : input.clerkOrgId;
}
```

Both components are internal identifiers. Neither is the external Xero tenant ID that Xero
actually counts against.

Call sites: `packages/xero/src/au/read.ts` (lines 93, 225, 302, 386, 458),
`packages/xero/src/au/write.ts:185`, `packages/xero/src/oauth/service.ts` (186, 434, 775, 1511),
`packages/xero/src/uk/read.ts:62` and the NZ equivalent.

### Hard-coded limits

`packages/xero/src/rate-limit/limits.ts` (16 lines, complete at baseline):

```typescript
export const XERO_CALLS_PER_MINUTE_PER_ORG = 60;
export const XERO_CALLS_PER_DAY_PER_ORG = 5000;
export const XERO_CONCURRENT_REQUESTS_PER_ORG = 5;
export const XERO_CALLS_PER_MINUTE_APP_WIDE = 10_000;
```

Plan 161c replaced `DEFAULT_MAX_WAIT_MS` in this file. Read the current contents; do not assume.

### The store to build on

`packages/core/src/redis-rest-transport.ts` - the Redis REST transport, with its body-deadline
defect fixed by 161c. The configured service is the existing Vercel KV-compatible store
(`KV_REST_API_URL`, `KV_REST_API_TOKEN`).

### Repository conventions to match

- Service functions return `Result<T, E>` from `@repo/core`. Do not throw for expected failures.
- Named exports only. No default exports. Strict TypeScript, no `any`, no unjustified `as`.
- Zod on all external input, including every store response and every response header parsed.
- Integration tests co-located under `src/` in `packages/xero`.
- Australian English. **No em dashes anywhere.** No `console.log`.

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
| Xero units | `bun run --cwd packages/xero test` | exit 0 |
| Xero integration (guarded) | `bun run --cwd packages/xero test:integration` | exit 0 |
| next-config units | `bun run --cwd packages/next-config test` | exit 0 |
| Whitespace | `git diff --check` | exit 0 |

## Scope

**In scope:**
- `packages/xero/src/rate-limit/shared-store.ts` (create)
- `packages/xero/src/rate-limit/shared-store.test.ts` (create)
- `packages/xero/src/rate-limit/shared-store.integration.test.ts` (create)
- `packages/xero/src/rate-limit/limiter.ts`, `limits.ts`, `xero-fetch.ts` and their tests
- `packages/xero/keys.ts`, `packages/xero/keys.test.ts`
- `packages/xero/index.ts` (exports only)
- `packages/next-config/` preflight validation, app and API `.env.example`
- The `orgRateLimitKey` call sites listed above, **only** to pass the external tenant ID
- `plans/README.md` (status row only)

**Out of scope - do NOT touch:**
- `packages/xero/src/oauth/` credential logic - 161d. You may change the rate-key argument at the
  four call sites in `service.ts` and nothing else in that file.
- `packages/xero/src/crypto/` - 161c.
- Remote deletion and cleanup - 161f.
- Error classification and recovery reasons - 161g.
- **Any real Xero quota exhaustion.** Every exhaustion test uses a fake HTTP provider against the
  real store. Never throttle the live app to produce evidence.

## Git workflow

- Branch: `codex/xero-connection-hardening` (shared across 161a–161h).
- Conventional commits. Suggested: `feat(xero): add shared rate store`, then
  `fix(xero): key rate budgets by external xero tenant`, then
  `feat(xero): require explicit app tier for daily allowance`.
- Do NOT push or open a PR.

## Steps

### Step 1: Prove the key identity defect

Add a test to `packages/xero/src/rate-limit/xero-fetch.test.ts` (model on the existing
`orgRateLimitKey` tests at lines 181-190) showing that two internal organisations bound to the
**same** external Xero tenant receive two independent budgets. Assert the behaviour you want:
one shared budget. It will fail.

Add a second test showing a reconnect that changes the internal connection ID resets the
tenant's allowance. Assert it must not. It will fail.

**Verify**: `bun run --cwd packages/xero test` → fails on both. Record the output.

### Step 2: Build the shared store

Create `SharedXeroRateStore` and a Redis REST implementation in
`packages/xero/src/rate-limit/shared-store.ts`, using the corrected core transport from 161c.

An injectable deterministic fake is permitted **in unit tests only**. Production must never fall
back to process-local `Map`s or to an uncoordinated limiter when the shared store fails.

**Verify**: `bun run --cwd packages/xero test` → exit 0 for the new store's unit tests.

### Step 3: Fix the key identity

Tenant resource keys use **provider app ID plus external Xero tenant ID**. Not the Clerk account,
not the internal organisation, not the internal `XeroTenant` UUID, not the authoriser, not the
deployment name. Every caller deployment that shares the app shares these budgets.

Update `orgRateLimitKey` (rename it if the name no longer fits) and every call site listed in
"Current state" to pass the external tenant ID. Obtain it through `resolveXeroAccess` where 161d
has landed; otherwise read it from `XeroTenant.xero_tenant_id`.

Use explicit endpoint classes, each with its own bucket:

- tenant Payroll and resource calls
- user connection inventory
- app connection management
- OAuth token operations

A non-tenanted call must never consume a fabricated tenant allowance. In particular, **token
acquisition must not be blocked by a payroll tenant's exhausted daily budget** - that is how a
transient quota problem turns into a total outage.

**Verify**: `bun run --cwd packages/xero test` → exit 0 including both Step 1 tests.

### Step 4: Make the tier explicit

Add `XERO_APP_TIER` to `packages/xero/keys.ts`, accepting exactly
`starter | core | plus | advanced | enterprise`.

Map the daily resource allowance to **1,000 for Starter** and **5,000 for higher tiers**, unless a
separately recorded provider entitlement in `plans/161-xero-provider-contract.md` overrides it.
For ordinary tenant resource calls keep 60 per rolling minute and five concurrent admissions,
alongside the published application-wide ceiling of 10,000 per minute. Apply these only to the
endpoint classes the verified contract covers; label any other cap as **application policy**, not
a Xero fact.

Scope requiredness precisely: **required in production**, optional in development and test with a
conservative `starter` fallback that logs once. An unset tier must not break `bun run test`,
`bun run build` or `bun run typecheck`, or every contributor is blocked by a deployment fact they
do not have. There is no silent 5,000 default in production.

Add the variable name with a placeholder to the app and API `.env.example`. Never a real value.

**Verify**: `bun run --cwd packages/xero test && bun run typecheck` → exit 0.
`bun run --cwd packages/next-config test` → exit 0, including a new unit test asserting that preflight reports `XERO_APP_TIER` as missing when unset and never echoes a value. Do **not** run `bun run preflight` as a gate; see "Fresh worktree setup".

### Step 5: Atomic admission

Use **one** atomic server-side operation per applicable request. It must, in a single atomic step:
prune expired accounting; inspect the tenant minute and day budgets, the app minute budget, shared
provider cooldowns and concurrency; then reserve **all** applicable units or none.

Verify every script key is reachable in one atomic topology, including cluster hash-slot
placement. If the configured service cannot guarantee that, STOP and report; do not split the
operation into non-atomic parts.

Prefer strict rolling-window accounting until Xero's reset semantics are established in the
provider ledger. A continuously refilling token bucket is not a strict rolling-window cap; the
current `TokenBucket` implementation is the thing being replaced. Use store time, stable request
IDs, bounded retained records and reproducible boundary tests.

**Every admitted HTTP attempt, including a retry, consumes a unit. A failed admission consumes
none.** Use idempotent reservation IDs so an uncertain store response can be reconciled without
double-admitting. Keep attempt reservations distinct from logical payroll operations.

Concurrency permits are owner-specific and released idempotently after the body is fully consumed
or the request is cancelled. The lease lifetime must exceed the enforced request-and-body deadline
from 161c plus a documented margin. On crash, apply conservative expiry. Prove at most five
admitted active local resource permits per tenant. Do **not** claim a local deadline proves Xero
stopped executing an abandoned request.

Keep the existing prohibition on ambiguous payroll retry. A 429 produces a shared cooldown plus
retry metadata. If `Retry-After` exceeds the remaining operation deadline, return or defer to a
durable inbound/maintenance retry rather than sleeping through a transaction deadline.
**Never queue the payroll write itself.**

**Verify**: `bun run --cwd packages/xero test` → exit 0.

### Step 6: Headers, persistence and cutover safety

Parse allowlisted remaining-limit headers and `Retry-After` in both seconds and date form.
Reconcile remaining counts as **conservative ceilings only**, after accounting for concurrent
reservations and out-of-order responses. A delayed higher header must not replenish an
already-spent budget. Missing headers retain local accounting; malformed values grant nothing.

A known exhausted state must survive process restarts. Use an explicitly initialised
namespace/epoch plus a sentinel. The runtime must **not** silently initialise a full allowance
when required accounting disappears: a lost namespace, an ambiguous partial operation, or an
unavailable store denies new provider admission with a retryable infrastructure result.

Document a bounded recovery procedure for lost limiter state: quiesce callers, establish remaining
allowances or conservatively wait out the relevant windows, initialise shared state under operator
control, then resume. **Never flush live state or rotate the namespace to bypass quota.**

During cutover, drain old process-local callers and account for calls already made in the current
provider window. **Deploying an empty shared store must not hand out another full daily budget.**

Validate the store endpoint, credentials, enabled epoch and provider app identity in every caller
deployment, and confirm all deployments sharing the OAuth app share one budget domain. Never
expose a secret in preflight output.

**Verify**: `bun run --cwd packages/xero test:integration` → exit 0 against the real configured
store, using manifest-owned synthetic keys and a fake HTTP provider.

## Test plan

`packages/xero/src/rate-limit/shared-store.test.ts` (new, deterministic fake store):
1. Reserve-all-or-none: a request needing minute + day + concurrency reserves nothing when any
   one is exhausted.
2. Rolling-window boundaries: a burst straddling a window edge does not over-admit.
3. Idempotent reservation: replaying the same request ID does not double-admit.
4. A delayed header reporting a higher remaining count does not replenish a spent budget.
5. Malformed `Retry-After` and malformed headers grant no extra allowance.
6. Non-tenanted token acquisition is admitted while the tenant's daily budget is exhausted.

`packages/xero/src/rate-limit/shared-store.integration.test.ts` (new; real configured store,
manifest-owned keys from 161a, fake HTTP provider):
7. **Two independent client instances** share one aggregate tenant minute, day and concurrency
   budget. This is the test that proves the defect is fixed; a single-process fake cannot.
8. App-wide allowance aggregates across tenants.
9. Exactly five concurrent admissions per tenant; the sixth is denied.
10. Permit release is idempotent, and a crashed holder's permit expires conservatively.
11. Store loss, an ambiguous partial result and an outage all **deny** admission. Assert no
    process-local fallback path is reachable.
12. A restart does not reset a known exhausted state.

`packages/xero/src/rate-limit/xero-fetch.test.ts` (extend):
13. The two Step 1 regressions: same external tenant shares one budget; reconnect does not reset.
14. Missing `XERO_APP_TIER` in a simulated production environment blocks readiness; in test it
    falls back to `starter` and logs once.

## Done criteria

All must hold:

- [ ] `bun run check` exits 0
- [ ] `bun run typecheck` exits 0
- [ ] `bun run --cwd packages/xero test` exits 0, including both Step 1 regressions
- [ ] `bun run --cwd packages/xero test:integration` exits 0, including tests 7 and 11
- [ ] `bun run --cwd packages/next-config test` exits 0, including the new `XERO_APP_TIER` preflight-validation test
- [ ] `git diff --check` exits 0
- [ ] `grep -n "new Map" packages/xero/src/rate-limit/limiter.ts` returns no matches for budget or concurrency state
- [ ] `grep -rn "XERO_CALLS_PER_DAY_PER_ORG" packages/xero/src/` shows the value is derived from the configured tier, not a bare 5000 constant
- [ ] `git status --short` shows no modified file outside the In scope list
- [ ] `plans/README.md` status row for 161e updated

## STOP conditions

Stop and report; do not improvise:

- **The configured Redis REST service cannot support the atomic multi-key topology Step 5
  requires** (for example, keys land in different cluster hash slots and no single atomic
  operation covers them). Report the exact limitation. **Do not** split the reservation into
  several non-atomic calls; that reintroduces over-admission with extra complexity.
- `packages/core/src/redis-rest-transport.ts` still cancels its timeout before body parsing,
  meaning 161c has not landed. This plan's store will inherit the defect. Stop.
- An integration test would need to touch a store key the fixture manifest does not own, or would
  require flushing the store. Both are prohibited.
- A step's verification fails twice after a reasonable fix attempt.
- You conclude that production needs a local fallback when the store is unavailable. It does not;
  that is the defect. Report what is failing instead.
- You are about to generate real Xero quota exhaustion, or call live Xero to observe a 429.
  Synthetic faults prove the failure paths.
- You are about to print `KV_REST_API_TOKEN`, `XERO_CLIENT_SECRET` or any key into preflight
  output, a log, a test snapshot or a report. Stop.

## Maintenance notes

- **The limiter is now fail-closed, deliberately.** Anyone later adding a `catch` that falls back
  to local admission when the store is unavailable reintroduces the original defect across every
  deployment at once. Test 11 is the guard. Plan 161h Step 5 makes this non-revertible.
- **Budgets are keyed by external Xero tenant, never internal IDs.** If a future change threads a
  new call site through `xeroFetch`, it must pass the external tenant ID. A reviewer should check
  every new `orgKey` argument.
- The daily allowance depends on `XERO_APP_TIER`, which is a **commercial** fact about the Xero
  app, not a code constant. When the plan tier changes, that env var must change with it, or the
  app will either self-throttle or exceed the real ceiling.
- Distinguish, in every future change, Xero's published limits (recorded in
  `plans/161-xero-provider-contract.md` with a source and date) from our operational caps
  (in `limits.ts`, commented as application policy). Merging the two loses the provenance.
- In review, scrutinise: the atomicity of the admission operation, the permit release path on
  every exit including the throwing one, and any code that turns a store failure into a
  non-retryable user-facing error.
- Deferred: a Rapid Sync exemption, premium limits and larger connection entitlements are not
  assumed anywhere. If Xero grants one, it is recorded in the ledger first, then consumed here.
