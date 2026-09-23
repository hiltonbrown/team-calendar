# Plan 161c: Enforce absolute operation deadlines through response bodies, and make token encryption key-version aware

> **Executor instructions**: Follow this plan step by step. Run every verification command and
> confirm the expected result before moving to the next step. If anything in "STOP conditions"
> occurs, stop and report - do not improvise. When done, update the status row for this plan in
> `plans/README.md` unless a reviewer dispatched you and told you they maintain the index.
>
> **Drift check (run first)**:
> ```bash
> git diff --stat 6b934be..HEAD -- \
>   packages/core/src/redis-rest-transport.ts packages/core/src/ports packages/xero/src/crypto \
>   packages/xero/src/rate-limit packages/xero/src/au packages/xero/src/nz packages/xero/src/uk \
>   packages/xero/keys.ts
> ```
> At the time this plan was revised that diff was empty. **Run 161c after 161b, not in parallel**
> (both edit `completeXeroTenantSelection`, `loadPendingSession` and
> `service.integration.test.ts`). Once 161b has landed, `oauth/service.ts` line numbers will have
> moved: locate each cited site by function name. A changed function **body** at a cited site is a
> STOP condition; moved line numbers are not.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED (touches every outbound call's timing, and the decryption path for stored tokens)
- **Depends on**: `plans/161a-xero-baseline-and-fixture-ownership.md` (DONE) and
  `plans/161b-xero-immutable-tenant-binding.md`: run **after 161b** (shared functions and shared
  local database). This plan makes **no schema change** (`token_key_version` columns already
  exist).
- **Category**: bug, security
- **Planned at**: commit `6b934be`, 23 September 2026 (reviewed and re-stamped from `8652c31`; every excerpt below was re-read at `6b934be`)
- **Programme charter**: `plans/161-harden-xero-connection-lifecycle.md`

## Why this matters

Two independent defects, grouped because both are in the transport and crypto layer and both
must land before 161d moves credentials.

**Deadlines.** The shared Redis REST transport cancels its timeout as soon as response headers
arrive, before the body is parsed; a server that sends headers and then stalls holds the request
open indefinitely. `xeroFetch`, the Xero HTTP choke point, has no timer at all and releases its
concurrency permit before the caller reads the body. And the OAuth token refresh runs inside
database transactions with a 15-second timeout (`service.ts:694`, `:1246`) while the limiter may
make any call wait up to 65 seconds for admission, so a refresh transaction can time out while its
own HTTP call is still queued.

**Encryption.** `crypto/tokens.ts` writes `keyVersion: 1` into every envelope and decrypts with
the single configured key. The stored `token_key_version` looks like key rotation but is not:
there is no version-to-key mapping, so rotating `XERO_TOKEN_ENCRYPTION_KEY` makes every stored
token undecryptable. Plan 161d re-encrypts tokens under a new owner model and cannot do so safely
until a real keyring exists.

## Current state

### The Redis REST transport

`packages/core/src/redis-rest-transport.ts` (288 lines) makes exactly **one** fetch per call; it
has no retry and no backoff. `RedisRestTransportErrorCode` is declared at `:3-8` and has no
cancellation code: a pre-aborted caller signal currently returns `code: "timeout"` (`:214-227`).
`setupTimeoutSignal` is defined at `:172`; it adds an `abort` listener to the caller's input signal
(`:197`) and never removes it. The call site, `:230-247`:

```typescript
const { cleanup, signal } = setupTimeoutSignal(input.timeoutMs, input.signal);

try {
  const response = await customFetch(url, {
    body: JSON.stringify(command),
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    method: "POST",
    signal,
  });

  cleanup();          // :243 - timer cancelled here, before the body is read

  let payload: unknown;
  try {
    payload = await response.json();   // :247 - now unbounded
```

There is a second `cleanup()` in the outer `catch` at `:285`. Existing tests in
`packages/core/src/redis-rest-transport.test.ts` already cover malformed JSON (`:118`) and a
pre-aborted signal (`:199`); keep them passing.

`RedisRestTransportErrorCode` is exported from `packages/core/index.ts:105`. Its consumers live in
`packages/feeds`, `packages/notifications` and `apps/api/lib/rate-limit`. Adding a new code is
safe only if none of them switches on the code exhaustively; Step 1 checks this.

### The Xero HTTP choke point

`packages/xero/src/rate-limit/xero-fetch.ts` (191 lines). `xeroFetch(input, deps)` returns
`Promise<Response>`. Per attempt it calls `limiter.acquire(input.orgKey)`, then
`fetchImpl(input.url, input.init)`, then **immediately** `gate.release()`, and returns the
unread `Response`. Budget exhaustion returns a synthetic 429 (`rateLimitedResponse`). A thrown
network error is re-thrown after retries, and every caller already has a `catch` that maps a
thrown error to a network error. It has no timer, no body-size limit and no origin check.

Callers (19 call sites): `au/read.ts` (5), `au/write.ts:172` (1), `nz/read.ts` (4),
`uk/read.ts` (4), and in `oauth/service.ts`: `revokeXeroConnectionAtSource` (`:1656`),
`inferPayrollRegionForTenant` (`:1863`), `exchangeToken` (`:2028`), `fetchConnections` (`:2134`).

`au/write.ts:17` sets `XERO_WRITE_TIMEOUT_MS = 120_000` and passes
`signal: AbortSignal.timeout(XERO_WRITE_TIMEOUT_MS)` (`:182`). The base URL is
`keys().XERO_API_BASE_URL ?? XERO_DEFAULT_BASE_URL` (`au/write.ts:277`, similar in `nz/read.ts`,
`uk/read.ts`); `XERO_API_BASE_URL` is an optional override in `packages/xero/keys.ts:48`.

`packages/xero/src/rate-limit/limiter.ts`: `acquire(orgKey: string)` (`:100`) computes its own
wait deadline as `now + this.config.maxWaitMs` (`:101`), default `DEFAULT_MAX_WAIT_MS`.

`packages/xero/src/rate-limit/limits.ts` (16 lines):

```typescript
// (lines 1-2: a comment calling these "Xero's published rate limits")
export const XERO_CALLS_PER_MINUTE_PER_ORG = 60;
export const XERO_CALLS_PER_DAY_PER_ORG = 5000;
export const XERO_CONCURRENT_REQUESTS_PER_ORG = 5;
export const XERO_CALLS_PER_MINUTE_APP_WIDE = 10_000;

export const MINUTE_MS = 60_000;
export const DAY_MS = 86_400_000;
// (lines 12-15: comment)
export const DEFAULT_MAX_WAIT_MS = 65_000;
```

**Why the 65-second wait must stay for background reads.** The leave-balance sync makes one
`GET Employees/{id}` per employee against a 60-per-minute budget. A 200-employee organisation
therefore depends on admission waiting for the next minute. Shrinking every call to a 10-second
budget would turn those syncs into rate-limit failures. The tight budget belongs only on token
operations, which run inside 15-second transactions.

### The crypto defect

`packages/xero/src/crypto/tokens.ts` (93 lines). `EncryptedToken.keyVersion: number` (`:37`);
`encryptXeroToken` writes the literal `keyVersion: 1` (`:54`). `decryptXeroToken` (`:58`) and
`tryDecryptXeroToken` (`:16`) take only `{ authTag, encrypted, iv }` and always use the single
configured key. Decrypt call sites (non-test): `tryDecryptXeroToken` at `au/read.ts:500`,
`au/write.ts:145`, `nz/read.ts:675`, `uk/read.ts:698`; `decryptXeroToken` in `oauth/service.ts`
at `:421`, `:426` (inside `completeXeroTenantSelection`), `:779` and `:1506`. `loadPendingSession`
(`service.ts:1911`) does not select the session's `token_key_version` today; add it.
`packages/xero/src/oauth/service.integration.test.ts` calls `decryptXeroToken` directly four times;
those calls need the new argument too.

`packages/xero/keys.ts` (76 lines) validates `XERO_TOKEN_ENCRYPTION_KEY` with
`validateEncryptionKey`, sets `emptyStringAsUndefined: true`, injects a test-only fallback key when
`NODE_ENV === "test"`, and calls `keys()` at module load outside test (`:74`).

`XeroConnection` and `XeroOAuthSession` (`packages/database/prisma/schema.prisma`) each carry
`token_key_version Int @default(1)`.

### Environment examples

`apps/api/.env.example:52` already assigns a development-only placeholder value to
`XERO_TOKEN_ENCRYPTION_KEY` (commented as such by plan 161-pre). `apps/app/.env.example:49`
assigns `""`. Both lines are pre-existing; **leave them unchanged**.

### Repository conventions to match

- Service functions return `Result<T, E>` from `@repo/core`. Do not throw for expected failures
  across a module boundary. (`xeroFetch` already signals transport failure by throwing; keep that
  contract, see Step 3.)
- Named exports only. No default exports. Strict TypeScript, no `any`, no unjustified `as`.
- Zod on all external input. No `console.log`; use `@repo/observability`.
- Unit tests co-located as `foo.test.ts`.
- Australian English. **No em dashes anywhere.**
- Optional env vars with a format constraint must be absent or commented out, never `""`.

## Commands you will need

**Fresh worktree setup.** `.env*` files are gitignored (`.gitignore:35`). From the worktree root:

```bash
bun install --frozen-lockfile
```

`bun run test`, `check`, `typecheck` and `boundaries` then need no further setup. `bun run build`
additionally needs `DATABASE_URL` (any syntactically valid Postgres URL) and
`XERO_TOKEN_ENCRYPTION_KEY` (any 32-byte base64 value, e.g. `openssl rand -base64 32`) for that
command only. Never commit an env file, never copy real values.

**Local integration database (Step 5 only).** The guard in
`packages/database/src/live-test-guard.ts:69-79` accepts only a localhost `DATABASE_URL`. Use the
same throwaway setup as CI (`.github/workflows/ci.yml:17-33`):

```bash
docker run -d --name tc-161-pg -p 5432:5432 \
  -e POSTGRES_USER=team-calendar -e POSTGRES_PASSWORD=team-calendar \
  -e POSTGRES_DB=team-calendar_test postgres:16
export DATABASE_URL=postgresql://team-calendar:team-calendar@localhost:5432/team-calendar_test
echo "$DATABASE_URL" | grep -q '@localhost:5432/' && echo LOCAL_OK   # must print LOCAL_OK
bun run migrate:deploy
```

Never run `migrate:deploy` against a non-localhost database. If no local database is available,
record the integration gate `NOT_VERIFIED: no local database` in the execution report and set the
README status `BLOCKED (integration gate not run)`, never `DONE`. A run that collects zero tests
from `service.integration.test.ts` is a failure.

**Not local gates:** `bun run preflight <app|api|web>` and `bun run test:release` (Plan 161h
rollout and Plan 160 campaign). Never stub either.

| Purpose | Command | Expected on success |
|---|---|---|
| Lint | `bun run check` | exit 0 |
| Types | `bun run typecheck` | exit 0 |
| Core units | `bun run --cwd packages/core test` | exit 0 |
| Xero units | `bun run --cwd packages/xero test` | exit 0 |
| Xero integration (local DB) | `bun run --cwd packages/xero test:integration` | exit 0, `service.integration.test.ts` collected |
| Whitespace | `git diff --check` | exit 0 |

## Scope

**In scope:**
- `packages/core/src/redis-rest-transport.ts` and `redis-rest-transport.test.ts`
- `packages/core/src/ports/external-write-port.ts` (add the dispatch-phase field only)
- `packages/xero/src/rate-limit/deadline.ts` and `deadline.test.ts` (create)
- `packages/xero/src/rate-limit/limits.ts`
- `packages/xero/src/rate-limit/xero-fetch.ts` and `xero-fetch.test.ts`
- `packages/xero/src/rate-limit/limiter.ts` - **only** an optional per-call `maxWaitMs` on
  `acquire`; no change to how state is stored (that is 161e)
- `packages/xero/src/crypto/tokens.ts` and `tokens.test.ts`
- `packages/xero/src/crypto/keyring.ts` and `keyring.test.ts` (create)
- `packages/xero/src/oauth/reencrypt-tokens.ts` (create)
- `packages/xero/src/oauth/service.integration.test.ts` (re-encryption tests, and the new
  `keyVersion` argument on its existing `decryptXeroToken` calls)
- Mechanical call-site edits only (pass `keyVersion` to decrypt, select `token_key_version` where
  the row is loaded, pass a deadline where named in Step 3): `packages/xero/src/au/read.ts`,
  `au/write.ts`, `nz/read.ts`, `uk/read.ts`, `oauth/service.ts`
- `packages/xero/keys.ts`, `packages/xero/keys.test.ts`
- `packages/xero/index.ts` (exports only)
- `apps/app/.env.example`, `apps/api/.env.example` (add two commented lines each)
- `plans/161-xero-execution-report.md` (append a 161c section)
- `plans/README.md` (status row only)

**Out of scope - do NOT touch:**
- How limiter state is stored (process-local `Map`s). That is 161e.
- `oauth/service.ts` credential and lock logic. Advisory-lock and persistence deadlines inside the
  refresh transaction are 161d's refresh coordinator. Here you change only the call shapes listed
  above and, if Step 3 requires it, the two `{ timeout: 15_000 }` values.
- Any actual key rotation. You are building the capability, not using it.
- `packages/xero/src/adapter/` - error classification is 161g.
- Credential-owner records and refresh recovery envelopes. They do not exist yet; 161d creates
  them and extends the Step 5 re-encryption to cover them.
- The existing `XERO_TOKEN_ENCRYPTION_KEY` lines in both `.env.example` files.

## Git workflow

- Branch: `codex/xero-connection-hardening` (shared across 161a-161h).
- Conventional commits. Suggested: `fix(core): keep request deadline active through body parsing`,
  `fix(xero): bound xero responses by an absolute deadline`, then
  `feat(xero): add version-aware token encryption keyring`.
- Do NOT push or open a PR.

## Steps

### Step 1: Fix the transport timer, with a failing test first

In `packages/core/src/redis-rest-transport.test.ts` add a test whose injected fetch resolves a
`Response` immediately but whose body stream never produces data
(`new Response(new ReadableStream({ start() {} }))`). Call with `timeoutMs: 50` and assert the
promise settles with an error result within 500 ms (use `vi.useFakeTimers()` or a real 50 ms
timer, not an unbounded wait).

**Verify**: `bun run --cwd packages/core test` → fails (times out) on the new test only. Paste the
output into a "161c" section of `plans/161-xero-execution-report.md`.

Then fix `redis-rest-transport.ts`:

- Remove `cleanup()` at `:243` and call it in a `finally` that wraps both the fetch and the body
  read, so it runs after the body settles on every path. Remove the now-redundant `cleanup()` at
  `:285`.
- Keeping the timer alive is not enough on its own: a body stream is not necessarily tied to the
  signal (the test's hand-built `Response` is not). Read the body with
  `Promise.race([response.text(), abortedPromise(signal)])`, where `abortedPromise` rejects when
  the signal aborts; on abort call `response.body?.cancel()` (ignore errors), then parse the text
  with `JSON.parse`. In the inner parse `catch` (`:246-261`), check `signal.aborted` first and
  return `"timeout"` or `"aborted"` (see below) instead of `"invalid_response"`.
- Make `cleanup` also remove the `abort` listener that `setupTimeoutSignal` adds to the caller's
  signal (keep a reference to the handler and call `removeEventListener`).
- Add `"aborted"` to `RedisRestTransportErrorCode` and return it when the **caller's** signal
  aborted (pre-aborted or mid-body); keep `"timeout"` for the internal timer. First run
  `grep -rn "RedisRestTransportErrorCode\|\.code ===\|case \"" packages/feeds packages/notifications apps/api/lib/rate-limit --include=*.ts`;
  if any consumer switches exhaustively on the code, STOP and report.
- Keep the typed `Result` shape and `redactCredentials` intact.

**Verify**: `bun run --cwd packages/core test` → exit 0. `bun run typecheck` → exit 0.

### Step 2: Cover the remaining transport cases

Add to `redis-rest-transport.test.ts`:

- caller cancellation mid-body returns `"aborted"`, not `"timeout"`;
- the caller-signal listener is removed after success and after failure (spy on
  `removeEventListener`, or assert a listener count of zero on an `EventTarget`);
- no bearer-token substring appears in any error message from the new tests.

Update the existing pre-aborted test (`:199`) to expect `"aborted"`.

**Verify**: `bun run --cwd packages/core test` → exit 0, four new tests.

### Step 3: One absolute deadline per Xero call, covering the body

Create `packages/xero/src/rate-limit/deadline.ts`:

```typescript
export interface XeroDeadline { readonly expiresAtMs: number }
export function createXeroDeadline(budgetMs: number, now?: () => number): XeroDeadline;
export function remainingMs(deadline: XeroDeadline, now?: () => number): number; // never negative
```

In `limits.ts`, keep `DEFAULT_MAX_WAIT_MS = 65_000` and add, commented as **our engineering
budgets, not Xero limits**:

```typescript
// Token exchange and refresh run inside 15-second transactions (oauth/service.ts),
// so the whole call, including admission and body, must finish well inside that.
export const XERO_TOKEN_OPERATION_BUDGET_MS = 10_000;
// Default for calls that pass no deadline: up to 65s admission wait plus request and body.
export const XERO_DEFAULT_OPERATION_BUDGET_MS = 90_000;
```

Correct the comment on lines 1-2 so it no longer calls the whole file "Xero's published rate
limits": the four per-org/app constants are published limits; the budgets are ours.

In `limiter.ts`, change `acquire(orgKey: string)` to
`acquire(orgKey: string, options?: { maxWaitMs?: number })`, using
`options?.maxWaitMs ?? this.config.maxWaitMs`. No other limiter change.

In `xero-fetch.ts`, add `deadline?: XeroDeadline` and `maxBodyBytes?: number` to
`XeroFetchInput`. When `deadline` is absent, create one from `XERO_DEFAULT_OPERATION_BUDGET_MS`.
For every attempt:

1. If `remainingMs(deadline) === 0`, throw `XeroFetchError` with `code: "deadline_exceeded"`,
   `dispatched: false`.
2. `acquire(orgKey, { maxWaitMs: Math.min(DEFAULT_MAX_WAIT_MS, remainingMs(deadline)) })`.
3. Fetch with a signal that aborts at the deadline, combined with `input.init?.signal` via
   `AbortSignal.any`. Pass `redirect: "manual"`.
4. **Read the whole body before releasing the permit**: read `response.body` with a reader,
   counting bytes, raced against the deadline signal; when the deadline fires, call
   `reader.cancel()` and throw `code: "deadline_exceeded"` (`dispatched: true`). Past
   `maxBodyBytes` (default `XERO_MAX_RESPONSE_BYTES = 5 * 1024 * 1024`, commented as application
   policy) cancel the reader and throw `code: "body_too_large"` (`dispatched: true`). Then return
   `new Response(nullBody ? null : bytes, { headers: response.headers, status: response.status, statusText: response.statusText })`
   where `nullBody` is true for statuses 101, 103, 204, 205 and 304 (the `Response` constructor
   throws if those are given a body; `DELETE /connections/{id}` returns 204). Callers keep calling
   `.json()` / `.text()` unchanged.
5. Release the permit and clear the timer in a `finally`, on every path.
6. Before a backoff sleep, if `remainingMs` is smaller than the sleep, stop retrying and return
   the last response (or throw `deadline_exceeded` if there is none). **A retry never gets a fresh
   deadline.**

`XeroFetchError` is a new exported class in `xero-fetch.ts`:
`code: "body_too_large" | "deadline_exceeded" | "origin_rejected" | "redirect_rejected"`,
`dispatched: boolean`. It is thrown, so every existing caller `catch` still maps it to a network
error; 161g will classify it properly.

Pass deadlines at exactly these call sites:
- `exchangeToken` in `oauth/service.ts`: `deadline: createXeroDeadline(XERO_TOKEN_OPERATION_BUDGET_MS)`.
- `au/write.ts:172`: `deadline: createXeroDeadline(XERO_WRITE_TIMEOUT_MS)` (keep its existing
  `AbortSignal.timeout` as well).
- Everything else uses the default.

Leave both `{ timeout: 15_000 }` values as they are unless a test proves the 10-second token budget
cannot fit; if so, STOP and report rather than raising the budget.

**Verify**: `bun run --cwd packages/xero test` → exit 0.

### Step 4: Origin and redirect rules

In `xero-fetch.ts`, before dispatch, parse `input.url` and allow only `https://api.xero.com` and
`https://identity.xero.com`. Additionally allow the origin of `keys().XERO_API_BASE_URL` **only
when `process.env.NODE_ENV !== "production"`**. Anything else throws
`XeroFetchError("origin_rejected", dispatched: false)` without calling `fetchImpl`.

With `redirect: "manual"`, any 3xx response throws `XeroFetchError("redirect_rejected",
dispatched: true)`; never follow a `Location` header, so a response-supplied URL can never receive
the bearer token.

**Verify**: `bun run --cwd packages/xero test` → exit 0 with the xero-fetch tests from the Test
plan.

### Step 5: Carry dispatch phase through the neutral port

`packages/core/src/ports/external-write-port.ts:9` has `certainty?: ProviderWriteCertainty`. Add
an optional `dispatchPhase?: "before_dispatch" | "after_dispatch"` alongside it, with a comment:
before dispatch (admission denied, configuration missing, decryption failed, deadline already
expired, origin rejected) is a **definite non-attempt**; after dispatch (lost response, 5xx,
timeout, body failure) is an **unknown outcome**. Do not populate it anywhere yet; 161g threads it
from `XeroFetchError.dispatched`. Preserve the existing `certainty` semantics.

**Verify**: `bun run --cwd packages/core test && bun run typecheck` → exit 0.

### Step 6: The keyring

In `packages/xero/keys.ts`, add two **optional** server variables following the existing
`createEnv` pattern (cross-field rules go in `createEnv`'s `createFinalSchema` option; confirm its
signature in the installed `@t3-oss/env-core` under `node_modules` before using it):

- `XERO_TOKEN_ENCRYPTION_ACTIVE_VERSION` - positive integer as a string; the version new writes
  use. Absent means `1`.
- `XERO_TOKEN_ENCRYPTION_KEYS_JSON` - JSON object mapping version string to base64 key, e.g.
  `{"2":"<base64>"}`.

Rules, enforced in that final schema and unit-tested in `keys.test.ts`:
version `1` always resolves to `XERO_TOKEN_ENCRYPTION_KEY`; if the JSON also defines `"1"` with a
different value, reject; every key must pass `validateEncryptionKey`; the active version must
exist in the resolved keyring. An existing deployment that sets neither keeps booting unchanged.
Error messages name the variable, never a value.

Create `packages/xero/src/crypto/keyring.ts` exporting
`resolveXeroEncryptionKey(version: number): Result<Buffer, { code: "unknown_key_version" }>` and
`activeXeroKeyVersion(): number`.

In `crypto/tokens.ts`:
- `encryptXeroToken` writes with `activeXeroKeyVersion()` and returns that `keyVersion`.
- `decryptXeroToken` and `tryDecryptXeroToken` take a **required** `keyVersion: number` and decrypt
  with that version's key. Unknown version → distinct safe error. Bad auth tag → a different
  distinct safe error. Never fall back to plaintext and never try another key.
- Update every decrypt call site listed in "Current state" to pass the row's `token_key_version`
  (add it to the relevant Prisma `select` where missing). Session rows use the session's column,
  connection rows the connection's.

Add the two variable **names** to both `.env.example` files as commented placeholders:

```text
# XERO_TOKEN_ENCRYPTION_ACTIVE_VERSION=1
# XERO_TOKEN_ENCRYPTION_KEYS_JSON={"2":"<base64 32-byte key>"}
```

**Verify**: `bun run --cwd packages/xero test && bun run typecheck` → exit 0.

### Step 7: Idempotent re-encryption for existing rows

Create `packages/xero/src/oauth/reencrypt-tokens.ts` exporting


```typescript
export async function reencryptXeroTokens(
  input: {
    batchSize: number;
    // Optional restriction; tests pass their own owned row IDs so they never touch other suites' rows.
    only?: { connectionIds?: string[]; sessionIds?: string[] };
  },
  deps?: { beforeWrite?: (table: "connection" | "session", id: string) => Promise<void> }
): Promise<Result<{ rewritten: number; skipped: number; failed: number },
  { code: "unknown_key_version_present" | "database_error" }>>;
```

It covers the two tables that hold ciphertext today, `xero_connections` and `xero_oauth_sessions`:

- select rows whose `token_key_version` differs from the active version, in pages ordered by `id`;
- decrypt with the row's version, encrypt with the active version; a row that fails to decrypt is
  counted in `failed`, logged by ID only, left unchanged, and the run continues;
- write with a compare-and-set `updateMany` whose `where` includes the `id`, the old
  `token_key_version` **and** the old ciphertext columns; a zero count means another process
  changed the row, so skip it (count it in `skipped`), never retry with stale plaintext;
- before rewriting anything, confirm every `token_key_version` value present in either table
  resolves in the keyring; if not, return an error and write nothing.

This is a system maintenance operation over all rows, so it does not filter by `clerk_org_id`.
Say so in a comment. It is not exported to `apps/`.

**Verify**: `bun run --cwd packages/xero test:integration` → exit 0 with the two re-encryption
tests (Test plan 17, 18) in `service.integration.test.ts`.

## Test plan

`packages/core/src/redis-rest-transport.test.ts`:
1. Headers then a stalled body settles within the timeout (Step 1 regression).
2. Caller cancellation mid-body returns `"aborted"`, distinct from `"timeout"`.
3. The caller-signal listener is removed on success and on failure.
4. No token substring appears in any error message from 1-3.
(Existing malformed-JSON and pre-aborted tests stay; the pre-aborted one now expects `"aborted"`.)

`packages/xero/src/rate-limit/deadline.test.ts` (new):
5. `remainingMs` decreases with an injected clock and never goes negative.

`packages/xero/src/rate-limit/xero-fetch.test.ts` (extend; model on the existing tests):
6. A stalled body throws `deadline_exceeded` with `dispatched: true`, and the permit is released
   (assert the injected limiter's release count).
7. A 429 retry after a long wait does not get a fresh deadline: with a 1 s deadline and a
   `Retry-After: 5`, no second fetch happens.
8. The limiter is asked for at most `remainingMs` of admission wait.
9. An oversized body throws `body_too_large`, and its content does not appear in any log call.
10. A 302 is rejected and `fetchImpl` is called exactly once (never with the `Location` URL).
11. A non-allowlisted origin is rejected before `fetchImpl` is called.
12. `XERO_API_BASE_URL` pointing elsewhere is rejected when `NODE_ENV` is `production`.
13. A normal response is returned buffered: `.json()` works after the permit was released.
13a. A 204 response is returned with a null body and does not throw.

`packages/xero/src/crypto/tokens.test.ts` and `keyring.test.ts`:
14. A version-1 envelope written before this change still decrypts with `keyVersion: 1`.
15. With active version 2 configured, a new envelope reports `keyVersion: 2` and decrypts.
16. Unknown version and corrupted auth tag return two different safe errors; no plaintext.
16a. `keys.test.ts`: conflicting version-1 definitions are rejected; errors contain no key value.

`packages/xero/src/oauth/service.integration.test.ts` (local database):
17. Re-encryption rewrites a version-1 connection row to version 2 and a second run rewrites
    nothing.
18. Compare-and-set: pass `deps.beforeWrite` that rewrites the row's ciphertext, and assert the
    row is counted in `skipped`, not overwritten. No sleeps.
Both tests pass `only: { connectionIds: [<the suite's own connection>] }`.

## Done criteria

All must hold:

- [ ] `bun run check` exits 0
- [ ] `bun run typecheck` exits 0
- [ ] `bun run --cwd packages/core test` exits 0, including the four new transport tests
- [ ] `bun run --cwd packages/xero test` exits 0, including tests 5-16a and 13a and 13a
- [ ] `bun run --cwd packages/xero test:integration` exits 0 against the local database, including tests 17-18
- [ ] `git diff --check` exits 0
- [ ] `sed -n '/customFetch(url/,/response.json()/p' packages/core/src/redis-rest-transport.ts | grep -c "cleanup()"` prints `0`
- [ ] `grep -n "XERO_TOKEN_OPERATION_BUDGET_MS" packages/xero/src/oauth/service.ts` returns at least one match
- [ ] `grep -n "keyVersion: 1," packages/xero/src/crypto/tokens.ts` returns no matches
- [ ] `git diff 6b934be -- apps/api/.env.example apps/app/.env.example | grep '^+' | grep -v '^+++' | grep -v '^+#'` prints nothing (only commented lines were added)
- [ ] `git status --short -- . ':!plans'` shows no modified file outside the In scope list
- [ ] `plans/161-xero-execution-report.md` has a 161c section with the Step 1 failure output
- [ ] `plans/README.md` status row for 161c updated

## STOP conditions

Stop and report; do not improvise:

- `cleanup()` is already inside a `finally`, or `setupTimeoutSignal` no longer exists.
- `crypto/tokens.ts` already resolves a keyring. Report what exists.
- A consumer of `RedisRestTransportErrorCode` outside `packages/core` switches on it exhaustively
  (Step 1).
- A caller of `xeroFetch` reads `response.body` as a stream (rather than `.json()`/`.text()`),
  so buffering would change its behaviour. Report the call site.
- The 10-second token budget cannot fit inside the 15-second transaction in tests.
- A fix would require changing how limiter state is stored, or changing lock or persistence logic
  in `oauth/service.ts`. Report the exact change you believe is needed.
- A step's verification fails twice after a reasonable fix attempt.
- **You are about to rotate a real encryption key**, or to write a real key, token or secret into a
  file, fixture, snapshot, log or `.env.example`.

## Maintenance notes

- **The `finally` placement in `redis-rest-transport.ts` is load-bearing.** Moving `cleanup()`
  back to "right after the fetch resolves" reintroduces the unbounded body. Test 1 catches it.
- **`xeroFetch` returns a buffered response.** Anyone adding streaming consumption of Xero
  responses must keep the permit held until the stream finishes, or reintroduce the defect.
- Budgets in `limits.ts` are **our** choices; Xero's published ceilings are recorded in
  `plans/161-xero-provider-contract.md`. 161e moves admission to a shared store and should keep
  the per-call `maxWaitMs` contract added here.
- The token-operation budget protects the refresh transaction only while admission is the only
  wait inside it. 161d's refresh coordinator must thread one deadline through its advisory lock
  wait and persistence as well.
- `XERO_TOKEN_ENCRYPTION_KEY` stays the version-one source until 161h's rollout retires it. Retire
  a key only after proving no live envelope needs it.
- 161d adds new ciphertext tables (credential owners, refresh-attempt recovery envelopes). It must
  extend `reencryptXeroTokens` to cover them before any key rotation is attempted.
- In review, scrutinise: every exit path in both transports (timer, listener, permit), and every
  decrypt branch (can any return plaintext or try a second key?).
