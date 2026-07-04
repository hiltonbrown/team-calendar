# Plan 019: Harden the Xero token refresh strategy (classify errors, mark stale, lock the manual path)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report, do not improvise. When done, update the status row for this plan in
> `plans/README.md` unless a reviewer dispatched you and told you they maintain
> the index.
>
> **Drift check (run first)**: `git diff --stat da91efd..HEAD -- packages/xero/src/oauth/service.ts packages/xero/src/oauth/service.test.ts apps/app/app/\(authenticated\)/settings/integrations/xero/_actions.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none (independent of plans 017, 018; all touch `service.ts`,
  so if executing alongside them, land one at a time and re-run the drift check)
- **Category**: bug / security
- **Planned at**: commit `da91efd`, 2026-07-04

## Why this matters

Xero OAuth2 uses a 30-minute access token and a **single-use, rotating refresh
token valid for 60 days** (see
https://developer.xero.com/documentation/guides/oauth2/token-types/ and
https://developer.xero.com/documentation/guides/oauth2/auth-flow/). Each refresh
returns a new refresh token and invalidates the old one. Team Calendar's refresh
strategy has three coupled weaknesses that together let a connection silently rot
or brick:

1. **Refresh failures are not classified.** `exchangeToken` returns a generic
   `unknown_error` for every non-2xx response, so a caller cannot tell a
   transient 5xx (safe to retry later) from an `invalid_grant` (the refresh token
   is dead — expired past 60 days, revoked by the user in Xero, or already
   rotated by a racing refresh).
2. **A dead refresh token never transitions the connection to `stale`.** The
   helper built for this, `markXeroConnectionStale`, has **no callers** anywhere
   in the codebase. When `ensureFreshXeroConnection` fails inside a sync, the job
   simply bails; the connection stays `active` with a dead token, so every
   subsequent scheduled sync repeats the doomed refresh and the "reconnect Xero"
   UI (which keys off `status`/`stale_since`) never appears.
3. **The manual "Refresh" button bypasses the advisory lock.**
   `ensureFreshXeroConnection` serialises refreshes with
   `pg_advisory_xact_lock`, but `refreshXeroOAuthConnection` (the action-triggered
   path) calls the refresh helper directly with no lock. A manual refresh racing a
   scheduled sync's refresh can consume each other's single-use tokens and brick
   the connection. The code's own comment anticipates exactly this: "Any future
   token rotation write path must take this same lock key."

This plan fixes all three: classify the OAuth error, transition to `stale` on a
dead refresh token (stopping the doomed-retry loop and surfacing reconnect), and
put the manual refresh path behind the same advisory lock.

## Current state

All excerpts are from `packages/xero/src/oauth/service.ts` unless noted.

- `exchangeToken` collapses every failure to `unknown_error` and never reads the
  error body:

```ts
// packages/xero/src/oauth/service.ts:1045-1110 (abridged — the failure branches)
async function exchangeToken(input: {
  code?: string;
  grantType: "authorization_code" | "refresh_token";
  orgKey: string;
  refreshToken?: string;
}): Promise<Result<TokenResponse, XeroOAuthError>> {
  // ...builds body, calls xeroFetch to XERO_TOKEN_URL...
  if (!response.ok) {
    return {
      ok: false,
      error: {
        code: "unknown_error",
        message: "Xero token exchange failed.",
      },
    };
  }
  const payload = (await response.json()) as Partial<TokenResponse>;
  if (
    !(payload.access_token && payload.refresh_token) ||
    typeof payload.expires_in !== "number"
  ) {
    return {
      ok: false,
      error: { code: "unknown_error", message: "Xero token response was invalid." },
    };
  }
  // ...returns ok...
}
```

  Xero returns HTTP 400 with a JSON body `{"error":"invalid_grant"}` when the
  refresh token is expired, revoked, or already used. (Confirm the exact body
  shape against the executor toolkit note before relying on a different field.)

- `refreshXeroOAuthConnectionWithClient` propagates the exchange error as-is and
  does not touch connection status on failure:

```ts
// packages/xero/src/oauth/service.ts:448-462
const token = await exchangeToken({
  grantType: "refresh_token",
  orgKey: orgRateLimitKey({ clerkOrgId: input.clerkOrgId, organisationId: input.organisationId }),
  refreshToken: decryptXeroToken({
    authTag: connection.refresh_token_auth_tag,
    encrypted: connection.refresh_token_encrypted,
    iv: connection.refresh_token_iv,
  }),
});
if (!token.ok) {
  return token;   // <-- no stale transition on invalid_grant
}
```

  This helper takes `client: Pick<Prisma.TransactionClient, "xeroConnection">`
  (line 417-418), so `client.xeroConnection.update(...)` is available for writing
  a stale transition on the same client/transaction.

- The manual refresh path calls the helper with the bare `database` client — no
  advisory lock:

```ts
// packages/xero/src/oauth/service.ts:401-415
export async function refreshXeroOAuthConnection(input: {
  clerkOrgId: string;
  connectionId: string;
  organisationId: string;
}): Promise<Result<{ refreshedAt: Date }, XeroOAuthError>> {
  const refreshed = await refreshXeroOAuthConnectionWithClient(database, input);
  if (!refreshed.ok) {
    return refreshed;
  }
  return { ok: true, value: { refreshedAt: refreshed.value.refreshedAt } };
}
```

- The advisory-lock pattern to mirror (already used by the proactive path):

```ts
// packages/xero/src/oauth/service.ts:593-601 (inside ensureFreshXeroConnection)
return await database.$transaction(
  async (tx) => {
    // Serialise refreshes for this connection across all instances. The lock is
    // transaction-scoped, so it releases automatically on commit or rollback.
    // Any future token rotation write path must take this same lock key.
    await tx.$queryRaw`
      SELECT pg_advisory_xact_lock(hashtextextended(${input.connectionId}, 0))
    `;
    // ...re-read, decide, refreshXeroOAuthConnectionWithClient(tx, ...)...
  },
  { timeout: 15_000 }
);
```

- The unused stale helper (proof it is dead code — `grep -rn "markXeroConnectionStale"`
  over `packages/` and `apps/`, excluding tests and `generated/`, returns only
  the export in `packages/xero/index.ts:13` and this definition):

```ts
// packages/xero/src/oauth/service.ts:794-814
export async function markXeroConnectionStale(input: {
  clerkOrgId: string;
  connectionId: string;
  errorCode: string;
  errorMessage: string;
  organisationId: string;
}): Promise<void> {
  await database.xeroConnection.updateMany({
    where: { clerk_org_id: input.clerkOrgId, id: input.connectionId, organisation_id: input.organisationId },
    data: { last_error_code: input.errorCode, last_error_message: input.errorMessage, stale_since: new Date(), status: "stale" },
  });
}
```

- The error union to extend:

```ts
// packages/xero/src/oauth/service.ts:63-73
export type XeroOAuthError =
  | { code: "connect_disabled"; message: string }
  | { code: "connection_inactive"; message: string }
  | { code: "invalid_country"; message: string }
  | { code: "invalid_organisation_selection"; message: string }
  | { code: "invalid_state"; message: string }
  | { code: "oauth_not_configured"; message: string }
  | { code: "organisation_not_found"; message: string }
  | { code: "session_not_found"; message: string }
  | { code: "tenant_not_found"; message: string }
  | { code: "unknown_error"; message: string };
```

- The `xero_connection_status` enum already includes `stale` (from
  `packages/database/prisma/schema.prisma`), and `xeroConnectionRefreshDecision`
  (service.ts:506-531) already treats `status === "stale"` as `"inactive"`. So
  once a connection is marked stale, the proactive path correctly refuses to keep
  retrying and reports `connection_inactive`. No schema change is needed.

- Manual-refresh caller (for context; the audit event already exists):

```ts
// apps/app/app/(authenticated)/settings/integrations/xero/_actions.ts:79-101 (abridged)
const result = await refreshXeroOAuthConnection({
  clerkOrgId: context.value.clerkOrgId,
  connectionId: parsed.data.connectionId,
  organisationId: context.value.organisationId,
});
if (!result.ok) {
  return unknownError(result.error.message);
}
```

- Test conventions: `packages/xero/src/oauth/service.test.ts` uses a hoisted
  `dbMock` (with `$queryRaw`, `$transaction`, `xeroConnection.findFirst/update`),
  stubs HTTP with `vi.stubGlobal("fetch", fetchSpy)`, and builds stored token
  fields with `encryptXeroToken`. `$transaction` is mocked as
  `dbMock.$transaction.mockImplementation((callback) => callback(dbMock))` and
  `$queryRaw.mockResolvedValue([])` (lines 5-16, 44-56, 249, 304-313). Match this.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `bun run typecheck` | exit 0 |
| Lint | `bun run check` | exit 0 |
| Targeted test | `bunx vitest run packages/xero/src/oauth/service.test.ts` | all pass |
| Full tests | `bun run test` | exit 0 |

## Suggested executor toolkit

- Before relying on the `invalid_grant` body shape, confirm Xero's token-error
  response: it is an OAuth2 (RFC 6749 §5.2) error object, HTTP 400 with
  `{"error":"invalid_grant", ...}`. The two reference docs are
  https://developer.xero.com/documentation/guides/oauth2/token-types/ and
  https://developer.xero.com/documentation/guides/oauth2/auth-flow/. If the repo
  has fixture files for Xero token errors, prefer matching those.

## Scope

**In scope** (the only files you should modify):

- `packages/xero/src/oauth/service.ts`
- `packages/xero/src/oauth/service.test.ts`
- `plans/README.md` (status row only)

**Out of scope** (do NOT touch, even though they look related):

- `packages/database/prisma/schema.prisma` — no schema change needed; the
  `stale` status already exists. Do not add columns or migrations.
- The sync job handlers in `packages/jobs/src/handlers/*` — they already bail on
  `ensureFreshXeroConnection` failure; once the connection is marked stale, their
  behaviour is correct. Do not modify them in this plan.
- `xeroConnectionRefreshDecision` — its logic is correct as-is; do not change it.
- The destructive/disconnect logic and any part of the OAuth start/callback
  flow.
- The manual-refresh audit event in `_actions.ts` — leave it; do not change the
  action's control flow (it already surfaces the error message to the admin).

## Git workflow

- Branch: `advisor/019-harden-xero-token-refresh`
- Commit message (conventional commits): `fix(xero): classify refresh errors, mark stale, and lock the manual refresh path`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add a `refresh_token_invalid` error code and classify it in `exchangeToken`

In `packages/xero/src/oauth/service.ts`:

1. Add `| { code: "refresh_token_invalid"; message: string }` to the
   `XeroOAuthError` union (line 63-73).
2. In `exchangeToken`, change the `!response.ok` branch so that, for a
   `refresh_token` grant, it reads the response body and detects `invalid_grant`.
   Read the body defensively (it may not be JSON); never log or return the token
   itself. Target shape:

```ts
if (!response.ok) {
  if (input.grantType === "refresh_token") {
    const errorCode = await readOAuthErrorCode(response);
    if (errorCode === "invalid_grant") {
      return {
        ok: false,
        error: {
          code: "refresh_token_invalid",
          message: "The Xero refresh token is no longer valid. Reconnect Xero.",
        },
      };
    }
  }
  return {
    ok: false,
    error: { code: "unknown_error", message: "Xero token exchange failed." },
  };
}
```

3. Add a private helper `readOAuthErrorCode(response: Response): Promise<string | null>`
   that does `try { const body = await response.json(); return typeof body?.error === "string" ? body.error : null; } catch { return null; }`.
   It must never throw. Do not include token values or the raw body in any
   returned string.

**Verify**: `bun run typecheck` → exit 0.

### Step 2: Transition the connection to `stale` when the refresh token is invalid

In `refreshXeroOAuthConnectionWithClient`, replace the bare
`if (!token.ok) { return token; }` (lines 460-462) so that a
`refresh_token_invalid` result writes a stale transition on the **same client**
before returning:

```ts
if (!token.ok) {
  if (token.error.code === "refresh_token_invalid") {
    await client.xeroConnection.update({
      where: { id: input.connectionId },
      data: {
        last_error_code: "refresh_token_invalid",
        last_error_message: token.error.message,
        stale_since: new Date(),
        status: "stale",
      },
    });
  }
  return token;
}
```

Rationale: `ensureFreshXeroConnection` calls this helper inside its
`$transaction` and **returns** (does not throw) the error result, which commits
the transaction — so the stale write persists. The manual path (after Step 3)
also runs inside a transaction, so the same holds.

Do NOT call the standalone `markXeroConnectionStale` here — it uses the global
`database` client, not the transaction client, and would escape the lock/tx.

**Verify**: `bun run typecheck` → exit 0.

### Step 3: Put the manual refresh path behind the advisory lock

Rewrite `refreshXeroOAuthConnection` (lines 401-415) so it acquires the same
transaction-scoped advisory lock as `ensureFreshXeroConnection` before calling
the refresh helper:

```ts
export async function refreshXeroOAuthConnection(input: {
  clerkOrgId: string;
  connectionId: string;
  organisationId: string;
}): Promise<Result<{ refreshedAt: Date }, XeroOAuthError>> {
  try {
    return await database.$transaction(
      async (tx) => {
        // Same lock key as ensureFreshXeroConnection so a manual refresh cannot
        // race a scheduled refresh and consume each other's single-use tokens.
        await tx.$queryRaw`
          SELECT pg_advisory_xact_lock(hashtextextended(${input.connectionId}, 0))
        `;
        const refreshed = await refreshXeroOAuthConnectionWithClient(tx, input);
        if (!refreshed.ok) {
          return refreshed;
        }
        return { ok: true, value: { refreshedAt: refreshed.value.refreshedAt } };
      },
      { timeout: 15_000 }
    );
  } catch {
    return {
      ok: false,
      error: { code: "unknown_error", message: "Failed to refresh the Xero connection." },
    };
  }
}
```

Note: because the stale-write in Step 2 now runs inside this transaction and the
callback returns (not throws) the error result, the stale transition commits
here too.

**Verify**: `bun run typecheck` → exit 0. `bun run check` → exit 0.

### Step 4: Tests

In `packages/xero/src/oauth/service.test.ts`, add cases (model them on the
existing `ensureFreshXeroConnection`/refresh tests that stub `fetch` and mock
`dbMock`):

- **`exchangeToken` classification (via `refreshXeroOAuthConnection`)**: stub the
  token endpoint `fetch` to resolve `{ ok: false, status: 400, json: async () => ({ error: "invalid_grant" }) }`.
  Assert the result error `code` is `refresh_token_invalid`, and that
  `dbMock.xeroConnection.update` was called with `data` containing
  `status: "stale"` and `stale_since`.
- **Transient failure stays `unknown_error`**: stub `fetch` to resolve
  `{ ok: false, status: 503, json: async () => ({}) }`. Assert the error `code`
  is `unknown_error` and `dbMock.xeroConnection.update` was **not** called with
  `status: "stale"`.
- **Manual refresh takes the advisory lock**: for a successful refresh, assert
  `dbMock.$transaction` was used and `dbMock.$queryRaw` was called (the advisory
  lock). Reuse the `$transaction`/`$queryRaw` mock setup already in the file
  (`$transaction.mockImplementation((cb) => cb(dbMock))`, `$queryRaw.mockResolvedValue([])`).
- **`ensureFreshXeroConnection` marks stale on invalid_grant**: with a connection
  whose token is within the refresh buffer and a `fetch` that returns
  `invalid_grant`, assert the result is not ok and `xeroConnection.update` wrote
  `status: "stale"`.

**Verify**: `bunx vitest run packages/xero/src/oauth/service.test.ts` → all pass.

### Step 5: Update the plans index

Set this plan's row in `plans/README.md` to `DONE`.

**Verify**: `git status` shows only in-scope files modified.

## Test plan

- New cases in `packages/xero/src/oauth/service.test.ts` per Step 4. The
  `invalid_grant → stale` and `manual-refresh-takes-lock` cases are the core
  regression guards.
- Structural pattern: the existing refresh tests in the same file.
- Verification:
  - `bunx vitest run packages/xero/src/oauth/service.test.ts` → all pass
  - `bun run typecheck` → exit 0
  - `bun run check` → exit 0
  - `bun run test` → exit 0

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -n "refresh_token_invalid" packages/xero/src/oauth/service.ts`
      returns matches in the error union, `exchangeToken`, and the stale-write.
- [ ] `grep -n "pg_advisory_xact_lock" packages/xero/src/oauth/service.ts`
      returns at least **two** matches (the existing proactive path plus the new
      manual path).
- [ ] `refreshXeroOAuthConnectionWithClient` writes `status: "stale"` on a
      `refresh_token_invalid` exchange result.
- [ ] Transient (non-`invalid_grant`) refresh failures still return
      `unknown_error` and do NOT mark the connection stale.
- [ ] `bun run typecheck` exits 0
- [ ] `bun run check` exits 0
- [ ] `bunx vitest run packages/xero/src/oauth/service.test.ts` → all pass
- [ ] `bun run test` exits 0
- [ ] `git status` shows only in-scope files modified
- [ ] `plans/README.md` status row updated to DONE

## STOP conditions

Stop and report back (do not improvise) if:

- The live `service.ts` no longer matches the "Current state" excerpts
  (`exchangeToken`, `refreshXeroOAuthConnection`,
  `refreshXeroOAuthConnectionWithClient`, or the advisory-lock block changed).
- Xero's refresh-error body is not `{"error":"invalid_grant"}` (verify against a
  fixture or the linked docs); do not guess an alternative field name.
- Marking stale inside the transaction turns out to roll back on the returned
  error result (i.e. the ORM throws rather than commits on a returned non-ok) —
  if a test proves the stale write does not persist, stop and report; the fix is
  a design decision (write stale in a separate committed statement).
- A verification command fails twice after a reasonable fix attempt.
- The change appears to require touching a sync job handler or the schema.

## Maintenance notes

For the human/agent who owns this after the change lands:

- `markXeroConnectionStale` (service.ts:794-814) remains exported but is still
  unused after this plan (the refresh path writes stale inline within its
  transaction for atomicity). If nothing else adopts it, a follow-up can delete
  it; do not delete it in this plan (out of scope, and a webhook-driven stale
  path may want it).
- Reviewer check: confirm the stale write uses the transaction `client`, not the
  global `database`, so it stays inside the advisory lock.
- **Deferred (not in this plan) — 60-day idle keep-alive.** Tokens only stay
  alive because scheduled syncs call `ensureFreshXeroConnection`. A connection
  with `sync_paused_at` set, or an org with no sync activity for 60 days, will
  let the refresh token lapse and require a full reconnect. If paused connections
  are a supported long-term state, add a scheduled Inngest job that refreshes
  idle-but-active connections before the 60-day boundary. This is a separate
  design decision — see the note in `plans/README.md`.
- If Xero introduces a refresh-token grace window (old token briefly valid after
  rotation), the advisory lock still prevents the local double-spend that would
  otherwise desync the stored token; keep the lock.
