# Plan 161c: Enforce absolute operation deadlines through response bodies, and make token encryption key-version aware

> **Executor instructions**: Follow this plan step by step. Run every verification command and
> confirm the expected result before moving to the next step. If anything in "STOP conditions"
> occurs, stop and report - do not improvise. When done, update the status row for this plan in
> `plans/README.md` unless a reviewer dispatched you and told you they maintain the index.
>
> **Drift check (run first)**:
> ```bash
> git diff --stat 8652c31..HEAD -- \
>   packages/core/src/redis-rest-transport.ts packages/xero/src/crypto \
>   packages/xero/src/rate-limit packages/xero/keys.ts
> ```
> At the time this plan was written that diff was empty. If it is now non-empty, compare the
> "Current state" excerpts below against the live code before proceeding. A mismatch is a STOP
> condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED (touches every outbound call's timing, and the encryption path for stored tokens)
- **Depends on**: `plans/161a-xero-baseline-and-fixture-ownership.md`. Coordinate the schema
  change in Step 6 with `plans/161b-xero-immutable-tenant-binding.md` so both land in one
  additive migration wave; otherwise independent of 161b.
- **Category**: bug, security
- **Planned at**: commit `8652c31`, 22 September 2026 (re-stamped from `585f6cb`; the only changes between those commits are under `plans/`, so every source excerpt below is valid at both)
- **Programme charter**: `plans/161-harden-xero-connection-lifecycle.md`

## Why this matters

Two independent defects, grouped because both are in the transport and crypto layer and both
must land before 161d moves credentials.

**Deadlines.** The shared Redis REST transport cancels its timeout as soon as response headers
arrive, before the body is parsed. A server that sends headers and then stalls holds the request
open indefinitely. Separately, the OAuth refresh transactions run with 15-second and 20-second
timeouts, while HTTP admission is allowed to wait up to 65 seconds and then retry - so the
transaction can time out while its own HTTP call is still waiting for a rate-limit slot.

**Encryption.** `crypto/tokens.ts` writes `keyVersion: 1` into every envelope and decrypts with a
single configured key. The version field looks like key rotation but is not: there is no
version-to-key mapping, so rotating `XERO_TOKEN_ENCRYPTION_KEY` makes every stored token
undecryptable. Plan 161d re-encrypts tokens under a new owner model and cannot do so safely until
a real keyring exists.

## Current state

### The transport defect

`packages/core/src/redis-rest-transport.ts` (288 lines). `setupTimeoutSignal` is defined around
line 186 and returns `{ cleanup, signal }` where `cleanup` is `() => clearTimeout(timeoutId)`.
The call site, at `packages/core/src/redis-rest-transport.ts:230-247`:

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

  cleanup();          // <-- timer cancelled here, before the body is read

  let payload: unknown;
  try {
    payload = await response.json();   // <-- now unbounded
```

`setupTimeoutSignal` also adds an `abort` listener to the caller's input signal
(around line 197) and never removes it.

### The deadline mismatch

`packages/xero/src/rate-limit/limits.ts` (16 lines, complete):

```typescript
export const XERO_CALLS_PER_MINUTE_PER_ORG = 60;
export const XERO_CALLS_PER_DAY_PER_ORG = 5000;
export const XERO_CONCURRENT_REQUESTS_PER_ORG = 5;
export const XERO_CALLS_PER_MINUTE_APP_WIDE = 10_000;

export const MINUTE_MS = 60_000;
export const DAY_MS = 86_400_000;

export const DEFAULT_MAX_WAIT_MS = 65_000;
```

`packages/xero/src/oauth/service.ts` wraps transactions with `{ timeout: 15_000 }` at lines 694
and 1246, and `{ timeout: 20_000 }` at line 1291. `DEFAULT_MAX_WAIT_MS` of 65,000 exceeds all
three.

`packages/xero/src/rate-limit/xero-fetch.ts` (191 lines) is the single HTTP choke point. It
acquires limiter budget, fetches, honours `Retry-After` on 429, and applies exponential backoff.
It returns a `Response` to the caller.

### The crypto defect

`packages/xero/src/crypto/tokens.ts` (93 lines). The envelope type declares
`keyVersion: number` at line 37, and the encrypt path writes a literal at line 54:

```typescript
keyVersion: 1,
```

Decryption reads the single configured `XERO_TOKEN_ENCRYPTION_KEY` and ignores the envelope's
version entirely.

`packages/xero/keys.ts` (76 lines) validates that key today:

```typescript
XERO_TOKEN_ENCRYPTION_KEY: z.string().refine(
  (val) => {
    try {
      validateEncryptionKey(val);
      return true;
    } catch {
      return false;
    }
  },
  { message: "XERO_TOKEN_ENCRYPTION_KEY must be a valid 32-byte base64-encoded string" }
),
```

with `emptyStringAsUndefined: true` set on `createEnv`, and a test-only fallback key injected when
`NODE_ENV === "test"`. `keys()` is invoked at module load when `NODE_ENV !== "test"`, so a bad key
prevents boot.

Stored ciphertext columns live on `XeroConnection` and `XeroOAuthSession` in
`packages/database/prisma/schema.prisma` (both carry `token_key_version Int @default(1)`).

### Repository conventions to match

- Service functions return `Result<T, E>` from `@repo/core`. Do not throw for expected failures.
- Named exports only. No default exports. Strict TypeScript, no `any`, no unjustified `as`.
- Zod on all external input. No `console.log`; use `@repo/observability`.
- Unit tests co-located as `foo.test.ts`.
- Australian English. **No em dashes anywhere.**
- **Optional env vars with a format constraint must be absent or commented out, never `""`.**
  An empty string fails Zod format validation even on an `.optional()` field. `keys.ts` already
  sets `emptyStringAsUndefined: true` to soften this; keep that.

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
| Core units | `bun run --cwd packages/core test` | exit 0 |
| Xero units | `bun run --cwd packages/xero test` | exit 0 |
| Xero integration (guarded) | `bun run --cwd packages/xero test:integration` | exit 0 |
| Whitespace | `git diff --check` | exit 0 |

## Scope

**In scope:**
- `packages/core/src/redis-rest-transport.ts` and its test
- `packages/core/src/ports/external-write-port.ts` (add the dispatch-phase field only)
- `packages/xero/src/crypto/tokens.ts` and its test
- `packages/xero/src/rate-limit/limits.ts`
- `packages/xero/src/rate-limit/xero-fetch.ts` and its test
- `packages/xero/src/rate-limit/deadline.test.ts` (create)
- `packages/xero/keys.ts`, `packages/xero/keys.test.ts`
- `packages/xero/index.ts` (exports only)
- App and API `.env.example` files
- `plans/README.md` (status row only)

**Out of scope - do NOT touch:**
- `packages/xero/src/rate-limit/limiter.ts`. The process-local Map problem is 161e's.
  You change budgets and deadlines here, not where the state lives.
- `packages/xero/src/oauth/service.ts` credential logic. 161d owns that. You may adjust the
  three transaction timeout values and nothing else in that file.
- Any actual key rotation. You are building the capability, not using it.
- `packages/xero/src/adapter/` - error classification is 161g.

## Git workflow

- Branch: `codex/xero-connection-hardening` (shared across 161a–161h).
- Conventional commits. Suggested: `fix(core): keep request deadline active through body parsing`,
  then `feat(xero): add version-aware token encryption keyring`.
- Do NOT push or open a PR.

## Steps

### Step 1: Fix the transport timer, with a failing test first

Add to `packages/core/src/redis-rest-transport.test.ts` a test using an injected fetch that
resolves headers immediately and then returns a body promise that never settles. Assert the call
rejects or returns a timeout `Result` within the configured `timeoutMs`.

**Verify**: `bun run --cwd packages/core test` → fails on the new test only. That proves the
defect. Record the output.

Then fix `redis-rest-transport.ts`:

- Move `cleanup()` out of the happy path and into a `finally` block that runs after the body is
  fully consumed.
- Detach the `abort` listener added to the caller's input signal in the same `finally`.
- Keep `AbortError` handling, the existing typed `Result` shape and `redactCredentials` intact.

**Verify**: `bun run --cwd packages/core test` → exit 0.

### Step 2: Cover the remaining transport cases

Add tests for: an already-aborted input signal, headers followed by a stalled body (Step 1),
malformed JSON, caller cancellation mid-body, and a timeout that fires during backoff. Each must
produce a distinct, redacted result. Assert no token substring appears in any error message.

**Verify**: `bun run --cwd packages/core test` → exit 0 with five new tests.

### Step 3: Create one absolute deadline per operation

Add a deadline helper to `packages/xero/src/rate-limit/`. Create the absolute deadline **once**
at operation entry and thread the remaining time through admission, lock acquisition, HTTP,
complete body parsing, backoff and persistence. Recalculate remaining time after every wait.
**A retry does not get a fresh full deadline.**

In `limits.ts`, replace `DEFAULT_MAX_WAIT_MS = 65_000` with a budget that fits inside the
transaction timeouts. Use **at most 10 seconds** as the provider budget for a refresh, leaving
explicit headroom for lock acquisition and commit inside a 15-second transaction. Comment these
as selected engineering budgets, not Xero limits, because they are ours.

Update the three transaction timeouts in `packages/xero/src/oauth/service.ts` (lines 694, 1246,
1291) only if the new budget requires it. Change nothing else in that file.

**Verify**: `bun run --cwd packages/xero test` → exit 0.
`grep -n "65_000" packages/xero/src/rate-limit/limits.ts` returns no matches.

### Step 4: Make the Xero wrapper own body lifetime

`xeroFetch` currently returns an unmanaged `Response`, so the caller decides when the body is
read while the wrapper has already moved on. Change it to take a body-consumer callback and run
that callback **before** releasing its concurrency permit and cancelling its timer.

Bound payload size to what each endpoint documented in `plans/161-xero-provider-contract.md`
actually needs. Test an oversized response and a malformed one. **Never log payroll content.**

Add an allowlisted production origin and path contract. Do not follow arbitrary redirects while
carrying credentials, and never let a response-supplied URL receive the bearer token. Tests use
injected transports or explicitly guarded test origins. **Do not weaken the production origin
check to make a test pass.**

**Verify**: `bun run --cwd packages/xero test` → exit 0, with new tests for oversized body,
malformed body, redirect-with-credentials rejection and origin rejection.

### Step 5: Preserve remote-outcome certainty

`packages/core/src/ports/external-write-port.ts:9` already carries
`certainty?: ProviderWriteCertainty`. Extend the neutral error contract with a **dispatch phase**:

- A failure **before** the request is sent (admission denied, configuration missing, decryption
  failed, deadline already expired) is a **definite non-attempt**.
- A failure **after** dispatch (lost response, 5xx, timeout) is an **unknown outcome**.

Carry the phase through, and preserve the existing `certainty` semantics. No generic retry
wrapper may replay a non-idempotent payroll mutation after a network error, a 5xx or an uncertain
response. A local abort frees local resources; it does not prove Xero stopped processing.

**Verify**: `bun run --cwd packages/core test && bun run --cwd packages/xero test` → exit 0.

### Step 6: Build the encryption keyring

In `packages/xero/keys.ts`, add two **optional** server variables alongside the existing
`XERO_TOKEN_ENCRYPTION_KEY`, following the established `createEnv` pattern in that file:

- `XERO_TOKEN_ENCRYPTION_ACTIVE_VERSION` - the version new writes use
- `XERO_TOKEN_ENCRYPTION_KEYS_JSON` - a secret mapping of version string to base64 key

Both must be optional while `XERO_TOKEN_ENCRYPTION_KEY` remains the version-one source, so an
existing deployment that sets neither keeps booting unchanged. Reuse `validateEncryptionKey` to
check every key in the map decodes to exactly 32 bytes. Reject a configuration that defines
version one in both places with conflicting values.

In `crypto/tokens.ts`:

- Keep AES-256-GCM. Keep existing version-one ciphertext readable.
- Decrypt using the **envelope's** key version, resolved through the keyring.
- Write new envelopes with the active version.
- A missing or unknown version, a malformed envelope, or a bad auth tag yields a safe operational
  error. **Never fall back to plaintext and never guess keys.**
- Key values never appear in an error, a snapshot, a log or preflight output.

Add an idempotent re-encryption operation that writes with the active version and uses
credential-version compare-and-set so it cannot overwrite a token another process just refreshed.
It must cover owner records, unadopted OAuth candidates and retained recovery envelopes. Verify
every referenced key version exists before switching writers.

Add the two variable **names** with placeholder syntax to the app and API `.env.example` files.
**Never a real key.**

**Verify**: `bun run --cwd packages/xero test` → exit 0.
`bun run typecheck` → exit 0.
`bun run --cwd packages/xero test:integration` → exit 0 for the re-encryption and refresh-race tests.

## Test plan

`packages/core/src/redis-rest-transport.test.ts`:
1. Already-aborted input signal returns immediately with the abort result.
2. Headers then a stalled body times out within `timeoutMs` (the Step 1 regression).
3. Malformed JSON returns `invalid_response`, redacted.
4. Caller cancellation mid-body is distinguishable from a timeout.
5. Timeout during backoff is honoured; the retry does not reset the deadline.
6. No token substring appears in any error message produced by 1-5.

`packages/xero/src/rate-limit/deadline.test.ts` (new):
7. One absolute deadline survives a lock wait, a retry and a slow body.
8. Remaining time is recalculated after each wait; a retry does not receive a fresh budget.
9. Timers, abort listeners and concurrency permits are all released on every exit path,
   including the throwing one. Assert on a counter, not on absence of a crash.

`packages/xero/src/rate-limit/xero-fetch.test.ts` (extend; model on the existing tests there):
10. Oversized response body is rejected without logging its content.
11. A redirect to a non-allowlisted origin does not receive the bearer token.
12. A production-origin check cannot be disabled by a test-only flag when `NODE_ENV` is not test.

`packages/xero/src/crypto/tokens.test.ts` (extend):
13. A version-one envelope written before this change still decrypts.
14. An envelope written with the active version decrypts through the keyring.
15. An unknown key version returns a safe operational error, not plaintext, not a guess.
16. A corrupted auth tag returns a distinct error from an unknown version.
17. Re-encryption is idempotent and its compare-and-set refuses to overwrite a concurrently
    refreshed token. Use a real barrier, not a sleep.
18. No key material appears in any error, log line or test snapshot.

## Done criteria

All must hold:

- [ ] `bun run check` exits 0
- [ ] `bun run typecheck` exits 0
- [ ] `bun run --cwd packages/core test` exits 0, including the six new transport tests
- [ ] `bun run --cwd packages/xero test` exits 0, including the twelve new deadline/fetch/crypto tests
- [ ] `bun run --cwd packages/xero test:integration` exits 0
- [ ] `git diff --check` exits 0
- [ ] `grep -n "65_000" packages/xero/src/rate-limit/limits.ts` returns no matches
- [ ] In `packages/core/src/redis-rest-transport.ts`, `cleanup()` appears inside a `finally` block and **not** between the `await customFetch` and the `await response.json()`
- [ ] `grep -rn "XERO_TOKEN_ENCRYPTION" apps/*/.env.example` shows variable names with placeholder values only, no base64 key of 32 decoded bytes
- [ ] `git status --short` shows no modified file outside the In scope list
- [ ] `plans/README.md` status row for 161c updated

## STOP conditions

Stop and report; do not improvise:

- `cleanup()` is already inside a `finally`, or `setupTimeoutSignal` no longer exists. The
  transport has been changed; report the current code.
- `crypto/tokens.ts` already resolves a keyring. Report what exists and skip Step 6's duplicate.
- Reducing `DEFAULT_MAX_WAIT_MS` to 10 seconds causes existing rate-limit tests to fail in a way
  that implies real callers depend on waiting a full minute for a slot. That is a genuine
  behavioural conflict with 161e. Report it rather than raising the budget back.
- A step's verification fails twice after a reasonable fix attempt.
- The fix appears to require editing `limiter.ts` or `oauth/service.ts` beyond the three timeout
  values. Report the exact change you believe is needed.
- **You are about to rotate a real encryption key.** This plan builds the capability only. A real
  rotation needs its own authority and is explicitly out of scope.
- You are about to write a real key, token or secret into a file, test fixture, snapshot, log or
  `.env.example`. Stop.

## Maintenance notes

- **The `finally` placement in `redis-rest-transport.ts` is load-bearing.** A future refactor that
  moves `cleanup()` back to "right after the fetch resolves" looks tidier and reintroduces the
  unbounded-body bug. Test 2 in the test plan is what catches it; do not let it be deleted.
- The budgets in `limits.ts` are **our** engineering choices, not Xero's published limits, and the
  comments say so. Xero's published ceilings live in `plans/161-xero-provider-contract.md`.
  Do not conflate the two when either changes.
- `XERO_TOKEN_ENCRYPTION_KEY` stays as the version-one source until 161h's rollout retires it.
  **Do not delete it early.** Retaining old key material is what keeps legitimately retained
  ciphertext readable; retire a key only after proving no live envelope needs it.
- In review, scrutinise: every exit path in the transport (does it release the timer, the
  listener and the permit?), and every branch in the decrypt path (can any of them return
  plaintext or try a second key?).
- Deferred: shared/distributed rate-limit state is 161e. This plan only makes the deadline
  correct; it leaves the budget process-local.
