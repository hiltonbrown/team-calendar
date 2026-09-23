# Plan 161e: Share Xero rate budgets across deployments, keyed by external tenant, tier-aware and fail-closed

> **Executor instructions**: Follow this plan step by step. Run every verification command and
> confirm the expected result before moving to the next step. If anything in "STOP conditions"
> occurs, stop and report - do not improvise. When done, update the status row for this plan in
> `plans/README.md` unless a reviewer dispatched you and told you they maintain the index.
>
> **Drift check (run first)**:
> ```bash
> git log --oneline 6b934be..HEAD -- packages/xero/src/rate-limit packages/core/src/redis-rest-transport.ts \
>   packages/xero/keys.ts packages/next-config .github/workflows/ci.yml
> ```
> Expect only 161b-161d commits. Confirm 161c landed: `grep -n "finally" packages/core/src/redis-rest-transport.ts`
> matches, and `packages/xero/src/rate-limit/deadline.ts` exists. Re-check each
> `file:line` below by function name; a changed body is a STOP condition.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: HIGH (fail-closed admission: a mistake stops all Xero traffic rather than degrading)
- **Depends on**: `plans/161a-xero-baseline-and-fixture-ownership.md` (DONE; fixture namespace) and
  `plans/161c-xero-deadlines-and-key-versioning.md` (bounded transport, `XeroDeadline`,
  `acquire(orgKey, { maxWaitMs })`). 161b is not required (rate keys use `XERO_CLIENT_ID`
  directly). If 161d has landed, its `refreshXeroCredentialOwner` also calls `exchangeToken`
  with a placeholder `xero-owner:<id>` key; convert it to the `token` class too.
- **Category**: bug, security
- **Planned at**: commit `6b934be`, 23 September 2026 (reviewed and re-stamped from `8652c31`; excerpts re-read at `6b934be`, before 161b and 161c)
- **Programme charter**: `plans/161-harden-xero-connection-lifecycle.md`

## Why this matters

Xero's rate limits are enforced per **Xero tenant** across every caller using the same app. Team
Calendar's limiter holds its counters in in-process `Map`s and keys them by **internal** IDs:

1. Every Vercel instance starts with a fresh full budget, so the real aggregate can be many times
   the permitted rate.
2. The key is `clerkOrgId:organisationId`, not the external tenant, so anything that changes the
   internal identity (a new payroll entity for the same file after a retired binding, for example)
   starts a new allowance although Xero's counter did not move.
3. The daily allowance is hard-coded at 5,000, correct only for non-Starter tiers. On Starter the
   ceiling is 1,000.

When the limiter is wrong the failure is not local: Xero throttles the whole app, and every
customer's sync stops.

## Current state

### Process-local state

`packages/xero/src/rate-limit/limiter.ts` (262 lines). `RateLimitAcquireResult` (`:31-35`):

```typescript
export type RateLimitDeniedReason = "concurrency" | "daily" | "minute";

export type RateLimitAcquireResult =
  | { ok: false; reason: RateLimitDeniedReason }
  | { ok: true; release: () => void };
```

`XeroRateLimiter` (`:79`) holds `private readonly orgStates = new Map<string, OrgState>()` and
`private readonly concurrency = new Map<string, ConcurrencyState>()` (`:83-84`). `OrgState` is two
continuously refilling `TokenBucket`s (`day`, `minute`), which is not a strict rolling-window cap.
The class comment (`:76-78`) points to "BLOCKED.md item D"; that file does not exist.

### Key identity

`packages/xero/src/rate-limit/xero-fetch.ts:55-65`:

```typescript
export function orgRateLimitKey(input: {
  clerkOrgId: string;
  organisationId?: null | string;
}): string {
  return input.organisationId
    ? `${input.clerkOrgId}:${input.organisationId}`
    : input.clerkOrgId;
}
```

Every `xeroFetch` call site passes `orgKey` built by `orgRateLimitKey`:

- Tenant payroll calls: `au/read.ts` (93, 225, 302, 386, 458), `au/write.ts:185`,
  `nz/read.ts` (62, 325, 532, 620), `uk/read.ts` (62, 332, 555, 643), and in `oauth/service.ts`
  `inferPayrollRegionForTenant` (`GET /api.xro/2.0/Organisation`, built at `:434`).
- OAuth token calls: `exchangeToken` (`service.ts:2004`), keyed from `:186` (callback) and `:775`
  (refresh).
- User connection inventory: `fetchConnections` (`service.ts:2130`), called from `:199`.
- Connection deletion: `revokeXeroConnectionAtSource` (`service.ts:1650`), keyed from `:1511`.

Each of those helpers takes `orgKey` as a parameter (`:1652/1662`, `:1852/1872`, `:2008/2037`,
`:2132/2141`). Every tenant payroll call site also has the external tenant ID in hand, because it
sends the `Xero-Tenant-Id` header.

### Limits

`packages/xero/src/rate-limit/limits.ts` after 161c keeps the four published constants
(`XERO_CALLS_PER_MINUTE_PER_ORG = 60`, `XERO_CALLS_PER_DAY_PER_ORG = 5000`,
`XERO_CONCURRENT_REQUESTS_PER_ORG = 5`, `XERO_CALLS_PER_MINUTE_APP_WIDE = 10_000`),
`DEFAULT_MAX_WAIT_MS = 65_000`, and 161c's operation budgets. Read the file; do not assume.

### The store

`packages/core/src/redis-rest-transport.ts` exports `executeRedisRestCommand`, which sends one
Upstash-style REST command (JSON array body, bearer token). `EVAL` is therefore available as a
single atomic command. The KV variables are declared today only in `packages/feeds/keys.ts:10-15`
as an **optional** pair, and preflight checks them as optional-together
(`packages/next-config/preflight.ts:194`, `checkPair`). Both `.env.example` files have them
commented out.

### Tests and fixtures

- `packages/xero/src/rate-limit/xero-fetch.test.ts:181-190` tests `orgRateLimitKey`.
- `packages/xero/src/rate-limit/shared-store.integration.test.ts` is registered in
  `LIVE_FIXTURE_SUITES` with one `shared_store_namespace` global key (local value
  `local_shared_store_N`). It is **not** in `tooling/release/integration-inventory.ts`.
- CI (`.github/workflows/ci.yml`) runs `bun run test:integration` with a Postgres service and **no
  Redis**. A new integration suite that needs Redis will fail CI unless CI gains a Redis service.
- `packages/next-config/preflight.test.ts` is the preflight suite.

### Provider contract

`plans/161-xero-provider-contract.md` records, per endpoint, a "Rate bucket" column describing the
**current** org-keyed behaviour. Update it (Step 7) to the classes this plan introduces.

### Repository conventions to match

- `Result<T, E>` from `@repo/core`. Named exports only. Strict TypeScript, no `any`.
- Zod on all external input, including every store response and every parsed response header.
- Integration tests co-located under `src/` in `packages/xero`.
- Optional env vars with a format constraint must be absent, never `""`.
- Australian English. **No em dashes anywhere.** No `console.log`.

## Commands you will need

**Fresh worktree setup.** `bun install --frozen-lockfile`. `bun run build` additionally needs a
syntactically valid `DATABASE_URL` and a 32-byte base64 `XERO_TOKEN_ENCRYPTION_KEY` for that
command only.

**Local shared store (Step 6 onwards).** Upstash's REST protocol is served locally by the
`serverless-redis-http` container in front of Redis:

```bash
docker network create tc-161-net 2>/dev/null || true
docker run -d --name tc-161-redis --network tc-161-net redis:7
docker run -d --name tc-161-srh --network tc-161-net -p 8079:80 \
  -e SRH_MODE=env -e SRH_TOKEN=local-test-token \
  -e SRH_CONNECTION_STRING=redis://tc-161-redis:6379 hiett/serverless-redis-http:latest
export TC_TEST_KV_REST_API_URL=http://localhost:8079
export TC_TEST_KV_REST_API_TOKEN=local-test-token
```

`local-test-token` is a throwaway value for a local container, not a secret. The shared-store
integration suite must refuse any `TC_TEST_KV_REST_API_URL` whose host is not `localhost`/`127.0.0.1`
unless the protected live-manifest mode from `packages/database/src/live-test-guard.ts` is active.
The suite also needs the local Postgres used by every other integration suite (see 161b's
"Local integration database" block; same `docker run` and `DATABASE_URL`).

If Docker is unavailable, record the integration gate `NOT_VERIFIED: no local store` in the
execution report and set the README status `BLOCKED (integration gates not run)`.

**Not local gates:** `bun run preflight` and `bun run test:release`.

| Purpose | Command | Expected on success |
|---|---|---|
| Lint | `bun run check` | exit 0 |
| Types | `bun run typecheck` | exit 0 |
| Xero units | `bun run --cwd packages/xero test` | exit 0 |
| Xero integration (local DB + store) | `bun run --cwd packages/xero test:integration` | exit 0, `shared-store.integration.test.ts` collected |
| next-config units | `bun run --cwd packages/next-config test` | exit 0 |
| Release tooling | `bun run test:release-tools` | exit 0 |
| Whitespace | `git diff --check` | exit 0 |

## Scope

**In scope:**
- `packages/xero/src/rate-limit/shared-store.ts`, `shared-store.test.ts`,
  `shared-store.integration.test.ts` (create)
- `packages/xero/src/rate-limit/admission.lua.ts` (create; the Lua script as an exported string)
- `packages/xero/src/rate-limit/memory-store.ts` (create; see Step 4)
- `packages/xero/src/rate-limit/limiter.ts`, `limits.ts`, `xero-fetch.ts` and their tests
- Every `xeroFetch` call site (list them with
  `grep -rn "xeroFetch(" packages/xero/src --include=*.ts | grep -v "\.test\.ts"`; the list in
  "Current state" plus any 161d added), **only** to pass the new rate class; this includes the
  `oauth/service.ts` and `oauth/credential-owner.ts` helper signatures that carry `orgKey`
- `packages/xero/scripts/initialise-xero-rate-namespace.ts` (create) and a
  `rate:initialise-namespace` script entry in `packages/xero/package.json`
- `packages/xero/keys.ts`, `packages/xero/keys.test.ts`
- `packages/xero/index.ts` (exports only)
- `packages/next-config/preflight.ts` and `preflight.test.ts`
- `apps/app/.env.example`, `apps/api/.env.example` (commented `XERO_APP_TIER` placeholder)
- `.github/workflows/ci.yml` (add the Redis and SRH services and two env vars to the Test job)
- `tooling/release/integration-inventory.ts` and `.test.ts` (add the shared-store suite)
- `plans/161-xero-provider-contract.md` (Rate bucket column only)
- `plans/161-xero-execution-report.md` (append a 161e section, including the operator recovery
  procedure from Step 6)
- `plans/README.md` (status row only)

**Out of scope - do NOT touch:**
- `packages/xero/src/oauth/` beyond the rate-key threading above. Credential logic is 161d.
- `packages/xero/src/crypto/` - 161c.
- `packages/feeds/keys.ts`. Declare the KV pair in `packages/xero/keys.ts` independently.
- Remote deletion and cleanup - 161f. Error classification - 161g.
- **Any real Xero quota exhaustion.** Every exhaustion test uses a fake HTTP provider against the
  local store.

## Git workflow

- Branch: `codex/xero-connection-hardening` (shared across 161a-161h).
- Conventional commits, e.g. `feat(xero): add shared rate store`,
  `fix(xero): key rate budgets by external xero tenant`,
  `feat(xero): require explicit app tier for daily allowance`, `ci: add local redis for shared rate store tests`.
- Do NOT push or open a PR.

## Steps

### Step 1: Prove the key identity defect

In `xero-fetch.test.ts`, next to the `orgRateLimitKey` tests, add two tests of the key function
you are about to introduce, written against today's function so they fail:

1. Two different internal `(clerkOrgId, organisationId)` pairs for the **same** external tenant
   must yield the **same** key.
2. The same internal pair with two different external tenants must yield **different** keys.

**Verify**: `bun run --cwd packages/xero test` → fails on both. Paste the output into a "161e"
section of the execution report.

### Step 2: Define endpoint classes and keys

Replace `orgRateLimitKey` with:

```typescript
export type XeroRateClass =
  | { kind: "tenant"; providerAppId: string; xeroTenantId: string }
  | { kind: "token"; providerAppId: string }
  | { kind: "user_inventory"; providerAppId: string }
  | { kind: "app_management"; providerAppId: string };
export function xeroRateKeys(rateClass: XeroRateClass, namespaceEpoch: string): string[];
```

- `providerAppId` is `keys().XERO_CLIENT_ID` (the same definition 161b uses for
  `XeroTenant.provider_app_id`). Add a test-only fallback in `packages/xero/keys.ts` next to the
  existing `XERO_CLIENT_SECRET` one (`keys.ts:30-32`): when `NODE_ENV === "test"` and it is unset,
  set `process.env.XERO_CLIENT_ID = "test-xero-client-id"`. Outside test, an unset client ID makes
  store construction return a configuration error (connect is disabled without it anyway).
- Every key starts with the hash-tagged prefix `xero:{<providerAppId>}:` so all keys for one app
  share a Redis Cluster hash slot and one `EVAL` can touch them atomically.
- `tenant` keys: tenant minute window, tenant day window, tenant concurrency set, tenant cooldown,
  plus the app-wide minute window. The other classes use their own window and never touch a tenant
  key, so **token acquisition is never blocked by a tenant's exhausted daily budget**.
- Include the store namespace/epoch (Step 5) in every key.

Change `XeroFetchInput.orgKey: string` to `rateClass: XeroRateClass`. Update every call site:
tenant payroll calls pass `{ kind: "tenant", providerAppId, xeroTenantId }` using the tenant ID
they already send as `Xero-Tenant-Id`; `exchangeToken` uses `token`; `fetchConnections` uses
`user_inventory`; `revokeXeroConnectionAtSource` uses `app_management`. Change only the helper
parameter types needed to pass it through.

**Verify**: `bun run --cwd packages/xero test` → exit 0 including both Step 1 tests (rewritten
against `xeroRateKeys`). `bun run typecheck` → exit 0.

### Step 3: Make the tier explicit

In `packages/xero/keys.ts` add:

- `XERO_APP_TIER`: `z.enum(["starter", "core", "plus", "advanced", "enterprise"]).optional()`.
- `KV_REST_API_URL` (`z.string().url().optional()`) and `KV_REST_API_TOKEN`
  (`z.string().min(1).optional()`), both-or-neither.

Export `resolveXeroDailyAllowance(): number`: 1,000 for `starter`, 5,000 otherwise. When
`XERO_APP_TIER` is unset: in `NODE_ENV === "production"` it is a configuration error (the store
factory in Step 4 returns an error, which denies admission); otherwise use `starter` and log once
through `@repo/observability/log` at warn level. `bun run test`, `build` and `typecheck` must pass
with the tier unset.

In `limits.ts`, keep `XERO_CALLS_PER_DAY_PER_ORG` only as the documented non-Starter published
figure and stop using it directly for admission. Comment which values are Xero published limits
(per-minute 60, concurrency 5, app-wide 10,000, daily 1,000/5,000 by tier) and which are
application policy (the inventory, token and management class caps you choose; use 60 per minute
per app for each and label them as policy).

Also add `XERO_RATE_NAMESPACE_EPOCH` (`z.string().regex(/^[a-z0-9-]{1,32}$/).optional()`);
outside production an unset epoch means `"dev"`.

In `packages/next-config/preflight.ts`, for `app` and `api`: `checkPresent("XERO_APP_TIER")`,
`checkPresent("XERO_RATE_NAMESPACE_EPOCH")`, and change the KV pair from optional-together to
required (`checkPresent` on both). Error text names the variable only.

Add `# XERO_APP_TIER=starter` and `# XERO_RATE_NAMESPACE_EPOCH=2026-09` to both `.env.example`
files.

**Verify**: `bun run --cwd packages/xero test && bun run typecheck` → exit 0.
`bun run --cwd packages/next-config test` → exit 0 with new cases: tier missing is reported, KV
missing is reported, and a captured output containing a set token does not contain its value.

### Step 4: The shared store and atomic admission

Create the `SharedXeroRateStore` interface in `shared-store.ts` with
`reserve(input) → Promise<Result<{ reservationId }, Denied | Unavailable>>` and
`release(reservationId) → Promise<void>`, and a Redis REST implementation over
`executeRedisRestCommand`. Create `memory-store.ts`, an in-memory implementation with the same
semantics (windows, concurrency, cooldown, sentinel pre-initialised).

Store selection, in one exported `getSharedXeroRateStore()`:
- KV pair configured → Redis REST store.
- KV pair absent and `NODE_ENV` is `test` or `development` → memory store, with one warn log in
  development. This is what keeps every existing test that stubs global `fetch` and uses the
  default limiter (`au/read.test.ts`, `nz/read.test.ts`, `uk/read.test.ts`, `au/write.test.ts`,
  `oauth/service.test.ts`, and the jobs integration suites) passing unchanged, and keeps
  `bun run dev` usable without Redis.
- KV pair absent, tier missing, or client ID missing with `NODE_ENV === "production"` → a store
  whose every `reserve` returns `infrastructure`. **Never a memory store in production.**

The admission script (`admission.lua.ts`) runs as **one** `EVAL`. In a single step it: reads store
time with `redis.call("TIME")`; checks the namespace sentinel (Step 5) and denies if absent;
prunes expired entries from each sorted-set window (`ZREMRANGEBYSCORE`); checks tenant minute,
tenant day, app minute, tenant cooldown and tenant concurrency (`ZCARD`); then either adds the
reservation ID to **every** applicable set or to none. Reservation IDs are caller-generated UUIDs;
re-running with an existing ID returns the existing result without double-counting. Concurrency
entries carry a lease expiry of the operation's `remainingMs` plus 5 seconds (documented margin)
and are pruned by expiry, so a crashed holder frees its slot conservatively.

Rewrite `XeroRateLimiter` to call the store; remove both `Map`s and `TokenBucket`. Keep today's
waiting contract: `acquire(orgKey, { maxWaitMs, leaseMs })` calls `reserve`, and on a `minute`,
`concurrency` or `cooldown` denial retries with backoff (250 ms doubling to 2 s, jittered) until
`maxWaitMs` elapses; `daily` and `infrastructure` denials return immediately. `leaseMs` is the
concurrency lease (pass `remainingMs(deadline) + 5_000` from `xeroFetch`). The returned
`release` becomes `() => Promise<void>`; it removes the reservation from the **concurrency** set
only (window entries stay, because the call was made) and is idempotent. `xeroFetch` awaits it in
its `finally`.

Extend `RateLimitDeniedReason` with `"cooldown"` and `"infrastructure"`. `xeroFetch` maps denials
to the existing synthetic 429 **except** `infrastructure`, which throws the 161c
`XeroFetchError` with a new code `"admission_unavailable"` and `dispatched: false`.

Every admitted attempt, including a retry, is a new reservation; a denied admission consumes
nothing. Keep the existing prohibition on ambiguous payroll retry. On a 429, write a tenant
cooldown (`SET ... PX`) from `Retry-After` (seconds or HTTP date, via the existing
`parseRetryAfter`); non-tenant classes get the same cooldown on their own class key. If
`Retry-After` exceeds `remainingMs(deadline)`, return the 429 to the caller
instead of sleeping. **Never queue the payroll write itself.**

**Verify**: `bun run --cwd packages/xero test` → exit 0 with the unit tests below.
`grep -c "new Map" packages/xero/src/rate-limit/limiter.ts` → `0`.

### Step 5: Headers, namespace and cutover safety

Parse `X-MinLimit-Remaining`, `X-DayLimit-Remaining` and `X-AppMinLimit-Remaining` (confirm these
names against the ledger's source; if Xero documents different names, use those and update the
ledger). Treat them as **ceilings only**: if a header reports fewer remaining than the store
believes, add placeholder entries to the window so the store never admits more than Xero says
remain; a header reporting **more** remaining never removes entries. Missing headers change
nothing; malformed values grant nothing.

Namespace: every key includes an epoch string. The store refuses admission unless a sentinel key
`xero:{<app>}:<epoch>:initialised` exists. Export
`initialiseXeroRateNamespace({ epoch, assumeSpentDaily })` for operators; it sets the sentinel and,
when `assumeSpentDaily` is true, pre-fills each known tenant's day window so an empty store does
not hand out a fresh daily budget. The runtime never creates the sentinel itself. The epoch is `XERO_RATE_NAMESPACE_EPOCH` (Step 3); the integration suite uses the fixture's
`shared_store_namespace` global key (`fixture.globalKey("shared_store_namespace")`).

Create `packages/xero/scripts/initialise-xero-rate-namespace.ts` (run as
`bun run --cwd packages/xero rate:initialise-namespace --epoch <e> [--assume-spent-daily]`), a thin
wrapper that refuses to run without both flags explicit and prints only counts.

**Cutover warning (write it into the execution report):** a production deployment running this
code denies **all** Xero traffic until an operator runs that script against the production store.
161h's rollout sequences it.

Write the operator procedure into the execution report's 161e section: quiesce callers; either wait
out the daily window or initialise with `assumeSpentDaily: true`; set the sentinel; resume.
**Never flush live state or rotate the epoch to bypass quota.**

**Verify**: `bun run --cwd packages/xero test` → exit 0.

### Step 6: Integration evidence, CI and inventory

Create `shared-store.integration.test.ts` against the local SRH store (and local Postgres for the
fixture allocation). It constructs its Redis REST store directly from **its own** variables,
`TC_TEST_KV_REST_API_URL` and `TC_TEST_KV_REST_API_TOKEN`, and fails (not skips) if they are unset.
The global `KV_REST_API_*` variables stay unset in test runs, so every other integration suite
keeps using the memory store. Use only keys under the fixture's `shared_store_namespace` epoch, and delete
exactly those keys in `afterAll` (`SCAN` with the namespaced pattern, then `DEL`), following 161a's
owned-cleanup rule. Refuse to run against a non-local store unless in live-manifest mode.

Add to `.github/workflows/ci.yml` Test job two services: `redis` (`image: redis:7`) and `srh`
(`image: hiett/serverless-redis-http:latest`, `ports: ["8079:80"]`, env `SRH_MODE: env`,
`SRH_TOKEN: local-test-token`, `SRH_CONNECTION_STRING: redis://redis:6379`; inside Actions the
Redis service is reachable by its service key, not the local container name). Add
`TC_TEST_KV_REST_API_URL: http://localhost:8079` and `TC_TEST_KV_REST_API_TOKEN: local-test-token`
to the "Run integration tests" step's `env` only. Add the suite to `tooling/release/integration-inventory.ts` in
sorted order and bump the `N-suite` count in both the message and its test.

Replace the `BLOCKED.md item D` comment in `limiter.ts` with a one-line pointer to this plan.

**Verify**: with the local containers running, `bun run --cwd packages/xero test:integration` →
exit 0 listing `shared-store.integration.test.ts`. `bun run test:release-tools` → exit 0.

### Step 7: Update the provider ledger

In `plans/161-xero-provider-contract.md`, rewrite the "Rate bucket" cell of each row to the class
it now uses (`tenant`, `token`, `user_inventory`, `app_management`) and mark application-policy
caps as such.

**Verify**: `grep -c "Bootstrap org bucket" plans/161-xero-provider-contract.md` → `0`.

## Test plan

`shared-store.test.ts` (new, in-memory fake):
1. Reserve-all-or-none when any one window is exhausted.
2. A burst straddling a minute boundary does not over-admit (strict rolling window).
3. Replaying the same reservation ID does not double-admit.
4. A header reporting more remaining does not replenish; one reporting fewer reduces admission.
5. Malformed `Retry-After` and malformed limit headers grant nothing.
6. A `token` class reservation succeeds while the tenant's day window is exhausted.
7. Missing namespace sentinel denies with `infrastructure`.

`shared-store.integration.test.ts` (new, local SRH + Redis):
8. **Two independent `SharedXeroRateStore` instances** share one tenant minute, day and
   concurrency budget (sum of admissions never exceeds the cap).
9. The app-wide minute window aggregates across two tenants.
10. Exactly five concurrent admissions per tenant; the sixth is denied; release is idempotent; an
    unreleased lease expires after its lease time.
11. Stopping SRH mid-test (or pointing a second instance at a closed port) denies admission; assert
    no in-process fallback admitted anything.
12. A new store instance (simulated restart) still sees an exhausted state.

`xero-fetch.test.ts` and `keys.test.ts` (extend):
13. The Step 1 regressions against `xeroRateKeys`.
14. Tier unset: production configuration error; test environment falls back to `starter` and logs
    once.
15. `infrastructure` denial throws `XeroFetchError` with `code: "admission_unavailable"` and
    `dispatched: false`; `fetchImpl` is not called.

## Done criteria

All must hold:

- [ ] `bun run check`, `bun run typecheck` exit 0
- [ ] `bun run --cwd packages/xero test` exits 0, including tests 1-7 and 13-15
- [ ] `bun run --cwd packages/xero test:integration` exits 0 locally and lists `shared-store.integration.test.ts` (tests 8-12)
- [ ] `bun run --cwd packages/next-config test` exits 0 with the new preflight cases
- [ ] `bun run test:release-tools` exits 0
- [ ] `git diff --check` exits 0
- [ ] `grep -c "new Map" packages/xero/src/rate-limit/limiter.ts` prints `0`
- [ ] `grep -rn "orgRateLimitKey" packages/ apps/ --include=*.ts --include=*.tsx` returns no matches
- [ ] `grep -rn "XERO_CALLS_PER_DAY_PER_ORG" packages/xero/src --include=*.ts | grep -v "limits.ts\|\.test\.ts"` returns no matches
- [ ] `grep -n "serverless-redis-http" .github/workflows/ci.yml` returns a match
- [ ] `git status --short -- . ':!plans'` shows no modified file outside the In scope list, and `plans/` changes are limited to the files this plan names
- [ ] `plans/README.md` status row for 161e updated

## STOP conditions

Stop and report; do not improvise:

- The Redis REST service cannot run one `EVAL` over all keys for an app (hash-tagged keys still
  land in different slots, or `EVAL` is disabled). **Do not** split the reservation into several
  calls.
- 161b or 161c has not landed (see the drift check).
- An integration test would need to touch a store key outside the fixture namespace, or to flush
  the store.
- You conclude that production needs a local fallback when the store is unavailable. It does not.
- Xero's documented response header names differ from Step 5 and the ledger cannot be updated
  from a primary source.
- You are about to generate real Xero quota exhaustion or call live Xero.
- You are about to print `KV_REST_API_TOKEN`, `XERO_CLIENT_SECRET` or any key into preflight
  output, a log, a snapshot or a report.
- A step's verification fails twice after a reasonable fix attempt.

## Maintenance notes

- **The limiter is fail-closed, deliberately.** A future `catch` that falls back to local admission
  reintroduces the defect across every deployment at once. Test 11 is the guard; 161h makes this a
  non-discretionary rollout rule.
- **Budgets are keyed by provider app plus external tenant.** Any new `xeroFetch` call site must
  pass a `rateClass`; review each one.
- `XERO_APP_TIER` is a **commercial** fact about the Xero app. When the plan changes, the variable
  must change with it.
- The epoch and sentinel make "empty store" mean "closed", not "fresh budget". Never let the
  runtime create the sentinel.
- 161f's management client uses the `app_management` class; 161g's classifier consumes the
  `admission_unavailable` code.
- In review, scrutinise: the Lua script's all-or-none path, lease expiry, the release path on every
  exit, and any code that turns a store failure into a user-facing "not connected".
