# Plan 003: Make Xero token decryption fail closed when IV or auth tag is missing

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat d9da765..HEAD -- packages/xero/src/crypto/tokens.ts packages/xero/src/crypto/tokens.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: MED (could surface legacy rows — see Step 1 and STOP conditions)
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `d9da765`, 2026-06-12
- **Issue**: https://github.com/hiltonbrown/leavesync/issues/59

## Why this matters

`decryptXeroToken` silently returns the stored `encrypted` string verbatim whenever the IV or GCM auth tag is missing. That is a fail-open crypto pattern: a row whose IV/auth-tag columns are nulled (bad migration, manual edit, partial write) gets its raw stored value handed to callers and sent to Xero as a bearer/refresh token, with no error and no log. AES-256-GCM's integrity guarantee is bypassed exactly in the case it exists for. The function should fail closed: if the components needed for authenticated decryption are absent, raise a clear error so the connection surfaces as needing re-authentication instead of silently using an unverifiable value.

## Current state

- `packages/xero/src/crypto/tokens.ts` — the entire crypto module (63 lines). The offending branch:

```typescript
// packages/xero/src/crypto/tokens.ts:33-54
export function decryptXeroToken(input: {
  authTag: null | string;
  encrypted: string;
  iv: null | string;
}): string {
  if (!(input.encrypted && input.iv && input.authTag)) {
    return input.encrypted;
  }

  const key = readKey();
  const decipher = createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(input.iv, "base64")
  );
  decipher.setAuthTag(Buffer.from(input.authTag, "base64"));

  return Buffer.concat([
    decipher.update(Buffer.from(input.encrypted, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
```

- The schema allows the gap: `packages/database/prisma/schema.prisma` declares `access_token_iv`, `access_token_auth_tag`, `refresh_token_iv`, `refresh_token_auth_tag` as nullable (`String?`) on both connection tables (lines 445–449 and 514–518).
- Callers of `decryptXeroToken` (all inside `packages/xero`, none in apps):
  - `packages/xero/src/au/read.ts` — lines 44, 110, 184, 278
  - `packages/xero/src/au/write.ts` — line 150
  - `packages/xero/src/oauth/service.ts` — lines 267, 272 (status checks), 431 (refresh flow)
- Important: callers in `read.ts`/`write.ts` run inside functions that return `Result<…>`; `oauth/service.ts` likewise wraps expected failures. However `readKey()` in this same module **already throws** (`throw new Error("XERO_TOKEN_ENCRYPTION_KEY is required.")`), so throwing from this module on an invariant violation is the established pattern — an unexpected-state throw, not an expected failure.
- Empty-string special case: a never-connected/disconnected row stores `""` for `access_token_encrypted` (see `oauth/service.ts:546` checking `connection.access_token_encrypted.length > 0` before use). `decryptXeroToken("")` currently returns `""` via the fail-open branch. Callers gate on emptiness before decrypting in the refresh path, but the status-check path at `service.ts:267-272` may pass empty strings. The fix must keep `""` → `""` (empty input means "no token", not "corrupt token").
- Existing tests: `packages/xero/src/crypto/tokens.test.ts` — co-located, Vitest.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Crypto tests | `bunx vitest run packages/xero/src/crypto/tokens.test.ts` | all pass |
| Xero package tests | `bunx vitest run packages/xero` | all pass |
| Whole suite | `bun run test` | all pass |
| Lint | `bun run check` | exit 0 |

## Scope

**In scope**:
- `packages/xero/src/crypto/tokens.ts`
- `packages/xero/src/crypto/tokens.test.ts`

**Out of scope** (do NOT touch):
- The Prisma schema / migrations (making the columns non-nullable is a separate decision involving production data).
- All callers (`au/read.ts`, `au/write.ts`, `oauth/service.ts`) — the throw propagates through their existing try/catch or error paths; do not restructure them.
- `encryptXeroToken` and `readKey` — unchanged.

## Git workflow

- Branch: `advisor/003-fail-closed-token-decryption`
- Conventional commit, e.g. `fix(xero): fail closed when token decryption components are missing`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Check the live data assumption (read-only)

The fix assumes no legitimate production rows carry a non-empty `*_token_encrypted` with a NULL IV or auth tag (i.e. there is no plaintext-token legacy population relying on the fail-open branch). Verify in code that nothing writes that shape: 

`grep -rn "access_token_encrypted" packages/ apps/ --include="*.ts" | grep -v node_modules | grep -v ".test."` and confirm every write site (`oauth/service.ts` create/refresh/disconnect paths) always writes the encrypted/iv/authTag triple together or empties all of them together.

If you find a write path that stores a non-empty token without IV/auth-tag, STOP — the fail-open branch is load-bearing and a data migration must precede this change.

**Verify**: the grep output shows the triple always written together (refresh path excerpt: `oauth/service.ts:445-467` writes all six token columns in one update).

### Step 2: Implement fail-closed behaviour

Replace the guard in `decryptXeroToken`:

```typescript
export function decryptXeroToken(input: {
  authTag: null | string;
  encrypted: string;
  iv: null | string;
}): string {
  // An empty stored value means "no token" (never connected or disconnected), not corruption.
  if (!input.encrypted) {
    return "";
  }
  if (!(input.iv && input.authTag)) {
    throw new Error(
      "Encrypted Xero token is missing its IV or auth tag; refusing to use the stored value. Reconnect Xero to repair this connection."
    );
  }
  // ... existing decryption body unchanged
}
```

**Verify**: `bunx vitest run packages/xero/src/crypto/tokens.test.ts` → existing round-trip tests still pass (they encrypt then decrypt, so all components present).

### Step 3: Add tests for the new behaviour

In `packages/xero/src/crypto/tokens.test.ts`, add:

1. `decryptXeroToken({ encrypted: "", iv: null, authTag: null })` returns `""`.
2. Non-empty `encrypted` with `iv: null` throws (match on `/missing its IV or auth tag/`).
3. Non-empty `encrypted` with `authTag: null` throws.
4. Tampered auth tag (flip a byte of a real one) throws (GCM integrity — likely already covered; add if not).

**Verify**: `bunx vitest run packages/xero/src/crypto/tokens.test.ts` → all pass including 3–4 new tests.

### Step 4: Confirm callers degrade safely

Run the full xero package suite, then the whole suite. The throw inside callers' flows should surface as their existing `auth_error`/`unknown_error` handling; no caller change is expected.

**Verify**: `bunx vitest run packages/xero` → all pass. `bun run test` → all pass.

## Test plan

Covered in Step 3. Pattern: the existing `tokens.test.ts` (sets `XERO_TOKEN_ENCRYPTION_KEY` to `Buffer.alloc(32).toString("base64")` style env — see `packages/xero/src/oauth/service.test.ts:29` for the exemplar env setup).

## Done criteria

ALL must hold:

- [ ] `grep -n "return input.encrypted" packages/xero/src/crypto/tokens.ts` returns no matches
- [ ] `bunx vitest run packages/xero/src/crypto/tokens.test.ts` exits 0 with the new cases
- [ ] `bunx vitest run packages/xero` exits 0
- [ ] `bun run test` exits 0; `bun run check` exits 0
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Step 1 finds a write path that stores non-empty tokens without IV/auth-tag (legacy plaintext population — needs a migration decision first).
- Any test in `packages/xero` fails after Step 2 in a way that shows a caller **relies** on receiving the raw stored value (e.g. a fixture with plaintext tokens and null IVs that represents a supported state rather than a test shortcut). Report the test and fixture; do not weaken the fix to accommodate it.
- You feel the need to change the function signature to return `Result` — that ripples into nine call sites and is explicitly out of scope.

## Maintenance notes

- The proper long-term fix is schema-level: make the IV/auth-tag columns non-nullable alongside `*_token_encrypted` being non-empty, with a backfill/re-auth migration. This plan deliberately stops short of that.
- Reviewer should confirm the error message is operator-actionable ("Reconnect Xero") since this will surface in Sentry when it fires.
- If a key-rotation scheme is ever added (`keyVersion` already exists on `EncryptedToken`), decryption will need version-aware key lookup; this guard stays valid regardless.
