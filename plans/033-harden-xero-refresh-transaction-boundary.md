# Plan 033: Harden the Xero refresh so a slow/aborted transaction cannot brick the connection

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. **Step 0 is a design gate — resolve it before large edits.** If
> anything in the "STOP conditions" section occurs, stop and report, do not
> improvise. When done, update the status row for this plan in `plans/README.md`
> unless a reviewer dispatched you and told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat 123bbd8..HEAD -- packages/xero/src/oauth/service.ts packages/xero/src/oauth/service.test.ts`
> If the file changed since this plan was written, compare the "Current state"
> excerpts against the live code before proceeding; on a mismatch, treat it as a
> STOP condition.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: MED (concurrency-critical token path; a bad change can brick every
  connection)
- **Depends on**: none (builds on plan 019, already landed)
- **Category**: bug
- **Planned at**: commit `123bbd8`, 2026-07-12

## Why this matters

Xero refresh tokens are **single-use and rotate on redemption**: a successful
`exchangeToken` invalidates the old refresh token and issues a new one. Today the
network `exchangeToken` call runs **inside** a Prisma interactive transaction
that also holds a `pg_advisory_xact_lock` and has a 15s timeout. If the
transaction aborts *after* Xero has rotated the token (the 15s timeout elapses
during a slow Xero round trip, the Neon connection drops, or the commit fails),
the rollback discards the newly issued refresh token and restores the now-dead
old one. The connection becomes permanently unrecoverable: every later refresh
returns `invalid_grant`, and an admin must redo OAuth. Holding the advisory lock
and a pooled DB connection across an external HTTP call also serialises the
connection's DB access behind Xero's latency.

The goal is to narrow (ideally close) the window where a rotated-but-unpersisted
token is lost, without weakening the single-use serialization the advisory lock
provides.

## Current state

- Both refresh paths run the network exchange inside the locked transaction:

```ts
// packages/xero/src/oauth/service.ts:640-720 (ensureFreshXeroConnection, abridged)
return await database.$transaction(async (tx) => {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${input.connectionId}, 0))`;
  const current = await tx.xeroConnection.findFirst({ where: {...}, select: {...} });
  // decide via xeroConnectionRefreshDecision(...)
  const refreshed = await refreshXeroOAuthConnectionWithClient(tx, {...}); // <-- exchange + persist INSIDE txn
  return refreshed.ok ? { ok: true, value: {...} } : refreshed;
}, { timeout: 15_000 });
```

```ts
// packages/xero/src/oauth/service.ts:454-540 (refreshXeroOAuthConnectionWithClient, abridged)
const connection = await client.xeroConnection.findFirst({ where: {...}, select: { refresh_token_* } });
const token = await exchangeToken({ grantType: "refresh_token", refreshToken: decryptXeroToken({...}) }); // NETWORK
if (!token.ok) {
  if (token.error.code === "refresh_token_invalid") { await client.xeroConnection.update({ ... status: "stale" ... }); }
  return token;
}
await client.xeroConnection.update({ where: { id }, data: { access_token_*, refresh_token_*, status: "active", ... } }); // persist rotated token
```

- `refreshXeroOAuthConnection` (the manual path, `service.ts:420-450`) has the
  same lock-then-exchange-inside-transaction shape.

- Plan 019 already: classifies refresh errors (`refresh_token_invalid`), marks
  the connection `stale` on a dead token, and locks the manual path. This plan
  addresses the **remaining** issue: the abort-after-successful-exchange window.

- Conventions: raw SQL uses parameterised tagged templates; tokens are AES-GCM
  encrypted (`crypto/tokens.ts`); functions return `Result`; tests co-located
  (`service.test.ts`) and already cover refresh error classification.

## Commands you will need

| Purpose   | Command                                                          | Expected on success |
|-----------|------------------------------------------------------------------|---------------------|
| Typecheck | `bun run typecheck`                                              | exit 0              |
| Unit test | `bunx vitest run packages/xero/src/oauth/service.test.ts`        | all pass            |
| Lint      | `bun run check`                                                  | exit 0              |

## Suggested executor toolkit

- Use Context7 for Prisma advisory-lock / interactive-transaction semantics and
  for the Neon adapter's connection behaviour before changing the locking model.

## Scope

**In scope**:
- `packages/xero/src/oauth/service.ts` — the two refresh paths.
- `packages/xero/src/oauth/service.test.ts` — tests.

**Out of scope**:
- `exchangeToken` HTTP mechanics and error classification (plan 019 handled it).
- Token crypto (`crypto/tokens.ts`).
- The stale-marking / reconnect UI.

## Git workflow

- Branch: `improve/033-xero-refresh-boundary`
- Conventional commits (e.g. `fix(xero): protect rotated refresh token against transaction abort`).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 0: Design gate — choose the hardening approach

The single-use token means the exchange **must** be serialised (only one refresh
in flight per connection). A pooled Prisma session cannot hold a *session-level*
advisory lock across a network call outside a transaction. So a full "network
call entirely outside any lock" redesign is not straightforwardly available.
Choose the approach and record it in the PR:

- **Default (recommended, lower risk): keep the lock+exchange inside the
  transaction, but make the persist a compare-and-set (CAS) and shorten the
  post-exchange critical path.** This closes the *concurrent-clobber* sub-case and
  makes the abort-after-success case detectable, without changing the locking
  model. Steps 1-3.
- **Alternative (only if the default is judged insufficient): re-architect to a
  dedicated pinned connection holding a session advisory lock across the
  exchange.** This is a larger change with real Neon-pooling caveats. If you
  believe this is required, **STOP and report** for a maintainer decision rather
  than attempting it under this plan.

Proceed with the default unless told otherwise.

### Step 1: Add a compare-and-set guard to the token persist

Change the rotated-token persist in `refreshXeroOAuthConnectionWithClient` so it
only writes when the stored refresh token still equals the one that was
exchanged. Capture the ciphertext read at the top (`connection.refresh_token_encrypted`)
as `expectedRefreshEncrypted` and add it to the persist's `where`. Use
`updateMany` for the CAS, not `update`: Prisma's `update` **throws P2025** when
the extended `where` matches no row, whereas `updateMany` returns a count you
can branch on — which also matches the repo's existing optimistic-guard pattern
(`update.count !== 1` in the availability services):

```ts
const persisted = await client.xeroConnection.updateMany({
  where: { id: connectionId, refresh_token_encrypted: expectedRefreshEncrypted },
  data: { /* rotated token fields, status: "active", ... */ },
});
if (persisted.count === 0) {
  // A concurrent winner already rotated the token. The connection is fine —
  // do NOT mark stale; return a distinct non-fatal result so callers retry cleanly.
}
```

Note the advisory lock should make a concurrent rotation impossible; the CAS is
a second line of defence, so the 0-count branch existing and being non-fatal is
the point, not an expected hot path.

**Verify**: `bun run typecheck` → exit 0.

### Step 2: Minimise the post-exchange critical path

Ensure nothing avoidable runs between `exchangeToken` success and the persist
`update` (no extra queries, no encryption of unrelated fields beyond the token
material already computed). The tighter this path, the smaller the
abort-after-success window. Keep the encryption of the new access/refresh tokens
(unavoidable) but move any non-essential work out of the between-space.

**Verify**: `bun run typecheck` → exit 0.

### Step 3: Make abort-after-success observable

Wrap the transaction so that if `exchangeToken` returned success but the enclosing
transaction then fails to commit (timeout/connection error thrown by
`$transaction`), the connection is transitioned to `stale` with a clear
`last_error_code` (e.g. `refresh_persist_failed`) in a **separate** short write,
so the doomed-old-token connection surfaces the reconnect UI instead of silently
looping. Do this in the `catch` of the outer `$transaction` in both
`ensureFreshXeroConnection` and `refreshXeroOAuthConnection`, but only when you
can determine the exchange had already succeeded (e.g. thread a flag out via a
captured variable set right after `exchangeToken` returns ok). If you cannot
reliably determine that the exchange succeeded, prefer marking `stale` on the
generic failure over leaving it `active`, and document the tradeoff.

**Verify**: `bun run typecheck` → exit 0.

### Step 4: Tests

Add cases to `service.test.ts`:
1. CAS: when the stored refresh token no longer matches the exchanged one (0-row
   update), the function returns the non-fatal "already refreshed" result and
   does NOT mark the connection stale.
2. Happy path: a successful exchange persists the rotated token and returns
   `refreshed: true` (existing behaviour preserved).
3. Abort-after-success: simulate `exchangeToken` succeeding then the persist/commit
   failing → the connection ends up `stale` (Step 3), not silently `active`.

Follow the existing mock style (the suite mocks `exchangeToken` and the DB
client and already tests refresh error classification).

**Verify**: `bunx vitest run packages/xero/src/oauth/service.test.ts` → all pass.

## Test plan

- Cases in Step 4 (CAS no-op, happy path, abort-after-success → stale).
- Structural pattern: existing refresh tests in `service.test.ts`.
- Verification: the vitest command in Step 4 → all pass; `bun run check`.

## Done criteria

ALL must hold:

- [ ] The rotated-token persist uses a CAS `where` on the prior refresh ciphertext
- [ ] A 0-row CAS result returns a non-fatal "already refreshed" outcome (no stale marking)
- [ ] Abort-after-successful-exchange transitions the connection to `stale` (not left `active`)
- [ ] The advisory-lock serialization is unchanged (still one refresh in flight per connection)
- [ ] `bun run typecheck` exits 0
- [ ] Tests from Step 4 pass
- [ ] `bun run check` exits 0
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Step 0's alternative (pinned-connection session lock) appears necessary — that
  needs a maintainer decision, not improvisation.
- Any excerpt in "Current state" does not match live code (drift).
- You cannot reliably thread "exchange succeeded" out to the outer `catch` for
  Step 3 without a broader refactor — report and propose the minimal safe variant.
- A change would weaken the single-use serialization (two refreshes able to
  redeem the token concurrently) — that is worse than the bug being fixed.

## Maintenance notes

- Reviewer must verify the serialization property survives: only one
  `exchangeToken` per connection may be in flight; the advisory lock still guards
  it. The CAS is a second line of defence, not a replacement for the lock.
- The abort-after-success window is narrowed, not provably eliminated, under the
  default approach. If production still sees bricked connections, revisit Step 0's
  alternative (pinned-connection session lock) with the Neon pooling caveats.
- A periodic reconnect-health job (surface connections stuck refreshing) would
  further de-risk this; deferred, out of scope.
