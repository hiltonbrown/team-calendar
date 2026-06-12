# Plan 008: Serialise concurrent Xero token refreshes per connection

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat d9da765..HEAD -- packages/xero/src/oauth/service.ts packages/xero/src/oauth/service.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED (touches the OAuth refresh path; a bug locks orgs out of Xero until reconnect)
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `d9da765`, 2026-06-12
- **Issue**: https://github.com/hiltonbrown/leavesync/issues/64

## Why this matters

`ensureFreshXeroConnection` is check-then-act with no concurrency control: it reads the connection, decides "refresh", and calls `refreshXeroOAuthConnection`. Inngest sync jobs run in parallel (multiple job types per org can fire together), and user-triggered write-backs can coincide with them. Xero issues **rotating refresh tokens** — each refresh invalidates the old refresh token (with a short grace window). Two concurrent refreshes can interleave so that the *older* response's rotated refresh token is persisted **last**, overwriting the newer one; after the grace window the stored token is dead, every subsequent refresh fails, and the org must manually reconnect Xero. This is a production-outage class bug with a quiet fuse.

The fix: take a Postgres advisory lock per connection for the duration of the decision+refresh, and re-check the freshness decision after acquiring the lock (the winner refreshes; the loser sees a fresh token and skips).

## Current state

- `packages/xero/src/oauth/service.ts`:
  - `ensureFreshXeroConnection` (lines 512–593): `findFirst` connection → `xeroConnectionRefreshDecision(...)` → if `"refresh"`, `await refreshXeroOAuthConnection(...)` → re-read `expires_at`. No lock, no in-flight dedup.
  - `refreshXeroOAuthConnection` (lines 397–471): reads refresh-token columns → `exchangeToken({ grantType: "refresh_token", ... })` → `database.xeroConnection.update` persisting both rotated tokens (lines 445–468).
  - `xeroConnectionRefreshDecision` (lines 482–507): pure function, returns `"active" | "refresh" | "inactive"`; refresh buffer `TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000` (line 475).
- Database: PostgreSQL (Neon) via Prisma 7 + `@prisma/adapter-neon`. `database` is exported from `@repo/database`. Advisory locks: `pg_advisory_xact_lock(key bigint)` is transaction-scoped — acquired inside a transaction, auto-released at commit/rollback, and works under transaction-mode pooling. Use `hashtext(<connection-id>)` to derive the bigint key (or `hashtextextended(id, 0)` for 64-bit).
- Existing tests: `packages/xero/src/oauth/service.test.ts` mocks `@repo/database` via `vi.hoisted` (`dbMock.xeroConnection.findFirst/update`) and sets Xero env vars in `beforeEach` (lines 1–37). It already covers `ensureFreshXeroConnection` happy paths and `xeroConnectionRefreshDecision`.
- Conventions: `Result<T, E>` for expected failures; `XeroOAuthError` union in this file; tenant scoping (`clerk_org_id`, `organisation_id`) on every query — note `refreshXeroOAuthConnection`'s final `update` uses bare `{ id }` (line 446) — keep your new code fully scoped, leave that line as is.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| OAuth service tests | `bunx vitest run packages/xero/src/oauth/service.test.ts` | all pass |
| Xero package tests | `bunx vitest run packages/xero` | all pass |
| Whole suite | `bun run test` | all pass |
| Lint / typecheck | `bun run check` | exit 0 |

## Scope

**In scope**:
- `packages/xero/src/oauth/service.ts` (`ensureFreshXeroConnection`, `refreshXeroOAuthConnection` internals)
- `packages/xero/src/oauth/service.test.ts`

**Out of scope** (do NOT touch):
- `exchangeToken`, the OAuth start/callback flows, `xeroConnectionRefreshDecision` (pure logic stays pure).
- Callers of `ensureFreshXeroConnection` — its signature and `Result` contract must not change.
- Rate limiting (`orgRateLimitKey` usage) — unchanged.
- Schema changes (no new columns; the advisory lock needs none).

## Git workflow

- Branch: `advisor/008-serialise-token-refresh`
- Conventional commit, e.g. `fix(xero): serialise concurrent token refreshes with a per-connection advisory lock`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Confirm raw SQL works through the Neon adapter

Check how `@repo/database` exposes the Prisma client and that `$transaction` + `$queryRaw` are available: `grep -n "queryRaw\|\$transaction" packages/ apps/ -r --include="*.ts" | grep -v node_modules | grep -v generated | head`. If `$transaction(async (tx) => ...)` with `tx.$queryRaw` is unprecedented in the repo, write a 5-line scratch verification under the integration-test pattern (`describeWithDatabase` skips without `DATABASE_URL`) before committing to the approach.

**Verify**: evidence that interactive transactions + raw queries are usable (existing usage found, or scratch test passes locally). If neither is confirmable, STOP.

### Step 2: Wrap the refresh decision + refresh in an advisory-locked transaction

Restructure `ensureFreshXeroConnection` so the `"refresh"` branch becomes:

```typescript
const refreshed = await database.$transaction(async (tx) => {
  // Serialise refreshes for this connection across all instances. The lock is
  // transaction-scoped, so it releases automatically on commit or rollback.
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${input.connectionId}, 0))`;

  // Re-read inside the lock: a concurrent winner may have refreshed already.
  const current = await tx.xeroConnection.findFirst({
    where: { clerk_org_id: input.clerkOrgId, id: input.connectionId, organisation_id: input.organisationId },
    select: { access_token_encrypted: true, expires_at: true, refresh_token_encrypted: true, refresh_token_iv: true, refresh_token_auth_tag: true, revoked_at: true, status: true },
  });
  if (!current) { /* return not-found error as today */ }
  const decision = xeroConnectionRefreshDecision({ /* fields from current */ }, new Date());
  if (decision === "active") {
    return { expiresAt: current.expires_at, refreshed: false };
  }
  if (decision === "inactive") { /* return connection_inactive error as today */ }

  // Still stale under the lock: do the exchange and persist via tx.
  ...
});
```

To make `refreshXeroOAuthConnection` usable inside the transaction, extract its body into an internal helper that accepts a Prisma client/transaction handle (type it as the transaction client, e.g. `Prisma.TransactionClient` from `@repo/database/generated/client`), and have the existing exported `refreshXeroOAuthConnection` delegate with `database` so its public behaviour is unchanged.

Important transaction-budget note: the `exchangeToken` HTTP call now happens inside an open transaction holding only an advisory lock (no row locks). Pass an increased interactive-transaction timeout (`{ timeout: 15_000 }` as the `$transaction` options argument) since the default 5s may be tight for an OAuth round trip.

**Verify**: `bunx vitest run packages/xero/src/oauth/service.test.ts` → existing tests pass (the db mock needs a `$transaction: (fn) => fn(dbMock)` style stub plus a `$queryRaw` no-op — add to the mock).

### Step 3: Tests for the race

In `service.test.ts` add:

1. **Loser skips**: first `findFirst` (outside lock) says stale; inside-lock re-read returns a **fresh** `expires_at` → resolves `{ refreshed: false }` and `exchangeToken`'s fetch is never invoked (stub `fetch` via `vi.stubGlobal` as the file already does for other tests, or assert the token endpoint was not called).
2. **Winner refreshes**: inside-lock re-read still stale → exchange happens once, update persists rotated tokens, returns `{ refreshed: true }`.
3. **Serialisation**: simulate two concurrent `ensureFreshXeroConnection` calls where the mocked `$queryRaw` lock gates the second until the first completes (a simple promise-based mutex in the mock); assert exactly **one** token exchange occurs.
4. **Lock failure propagates**: `$queryRaw` rejects → function returns an error Result (map to `unknown_error` consistent with the file's error union), no token exchange attempted.

**Verify**: `bunx vitest run packages/xero/src/oauth/service.test.ts` → all pass including 4 new tests.

## Test plan

Step 3 above, then `bunx vitest run packages/xero` and `bun run test` → all pass.

## Done criteria

ALL must hold:

- [ ] `grep -n "pg_advisory_xact_lock" packages/xero/src/oauth/service.ts` shows the lock acquired before any refresh
- [ ] Re-check-inside-lock exists (test 1 proves the loser path issues no token exchange)
- [ ] Public signatures of `ensureFreshXeroConnection` and `refreshXeroOAuthConnection` unchanged (`grep` callers compile untouched)
- [ ] `bunx vitest run packages/xero` exits 0; `bun run test` exits 0; `bun run check` exits 0
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Step 1 cannot confirm interactive transactions + `$queryRaw` through the Neon adapter (driver/pooling limitation) — the fallback design (optimistic concurrency via a `refresh_in_progress_at` column and conditional `updateMany`) needs a schema migration and an operator decision.
- The integration environment shows `pg_advisory_xact_lock` blocking longer than the transaction timeout under normal load.
- You are tempted to hold the lock around **all** callers' Xero API calls rather than just the refresh — scope creep; the lock protects token rotation only.

## Maintenance notes

- The HTTP exchange inside a transaction is a deliberate trade-off: the advisory lock takes no row locks, so the only cost is one held connection during the OAuth round trip per org per ~30 minutes. If Xero latency degrades, revisit with the column-based optimistic scheme.
- Reviewer should scrutinise the inside-lock re-read field list — it must include everything `xeroConnectionRefreshDecision` needs, or the decision silently degrades.
- If a second write path ever persists refresh tokens (e.g. a reconnect flow), it must take the same advisory lock key; note this in a comment at the lock site.
