# Plan 002: Harden Xero OAuth — remove the fallback state secret and authenticate the start route

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If any
> STOP condition occurs, stop and report — do not improvise. When done, update
> the status row for this plan in `plans/README.md` unless a reviewer told you
> they maintain the index.
>
> **Drift check (run first)**: `git diff --stat e1b06a3..HEAD -- packages/xero/src/oauth/service.ts packages/xero/keys.ts apps/api/app/api/xero/oauth/start/route.ts`
> If any in-scope file changed, compare the "Current state" excerpts against the
> live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `e1b06a3`, 2026-06-18
- **Issue**: <!-- filled when published via --issues -->

## Why this matters

The Xero OAuth `state` parameter carries `clerkOrgId`, `organisationId`, `userId`,
and `returnTo`, HMAC-SHA256 signed so the callback can trust it. Two problems
weaken that trust:

1. **Hardcoded fallback secret (SEC-03).** `stateSecret()` returns
   `keys().XERO_CLIENT_SECRET ?? "xero-oauth-state"`. If `XERO_CLIENT_SECRET` is
   ever unset in an environment that processes callbacks, the signing key becomes
   a constant published in source, so anyone can forge a valid `state` and inject
   an arbitrary org/user into the OAuth completion. Even when the env var is set,
   shipping a fallback signing secret is a defence-in-depth break.
2. **Unauthenticated start route (SEC-04).** `GET /api/xero/oauth/start` reads
   `clerkOrgId`/`userId` straight from the query string with no auth, then signs
   them into `state`. The blast radius is bounded today (the callback re-scopes by
   the authenticated org), but an unauthenticated caller can still mint a
   forged-identity start flow. The route should require a session and bind the
   request to it.

OAuth cannot function without `XERO_CLIENT_SECRET` anyway (the token exchange
needs it), so requiring it for state signing costs nothing and removes the
fallback entirely.

## Current state

- `packages/xero/src/oauth/service.ts:1300-1302`:
  ```ts
  function stateSecret(): string {
    return keys().XERO_CLIENT_SECRET ?? "xero-oauth-state";
  }
  ```
  Used by `signState`/`verifyState` (search the file for `stateSecret(`).
- `packages/xero/keys.ts:36` — `XERO_CLIENT_SECRET: z.string().optional()`.
  Note the existing test-env fallback pattern at `keys.ts:26-29` (sets a default
  `XERO_TOKEN_ENCRYPTION_KEY` under `NODE_ENV === "test"`). Mirror it.
- `apps/api/app/api/xero/oauth/start/route.ts:4-23` — synchronous `GET` reading
  identity from query params, no auth:
  ```ts
  export function GET(request: Request) {
    const url = new URL(request.url);
    const clerkOrgId = url.searchParams.get("clerkOrgId");
    const userId = url.searchParams.get("userId") ?? undefined;
    // ... no auth ...
    const result = buildXeroOAuthStartUrl({ clerkOrgId, organisationId, returnTo, userId });
  ```
  Precedent that Clerk `auth()` works inside an `apps/api` route handler:
  `apps/api/app/api/notifications/stream/route.ts` authenticates and org-scopes
  before opening the SSE stream.

## Commands you will need

| Purpose   | Command                                                | Expected on success |
|-----------|--------------------------------------------------------|---------------------|
| Install   | `bun install`                                          | exit 0              |
| Lint      | `bun run check`                                         | exit 0              |
| Typecheck | `bunx tsc --noEmit -p packages/xero/tsconfig.json`     | exit 0              |
| Xero tests| `bunx vitest run packages/xero`                        | all pass            |
| Build api | `bun run build --filter=api`                           | exit 0              |

## Scope

**In scope**:
- `packages/xero/src/oauth/service.ts` (the `stateSecret` function only)
- `packages/xero/keys.ts` (add a test-env fallback for `XERO_CLIENT_SECRET`)
- `apps/api/app/api/xero/oauth/start/route.ts`
- A test for state signing fail-closed behaviour (create or extend a test in
  `packages/xero/src/oauth/`)

**Out of scope**:
- `buildXeroOAuthStartUrl`'s parameter shape and the app-side call site — keep the
  existing query-param interface; bind it to the session rather than redesigning it.
- The callback route and `completeXeroOAuth`/`completeXeroTenantSelection` — they
  already re-scope by the authenticated org; do not change them.
- Token encryption (`crypto/tokens.ts`) — already fail-closed.

## Git workflow

- Branch: `advisor/002-xero-oauth-hardening`
- Conventional commits, e.g. `fix(xero): fail closed on missing OAuth state secret`.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Make `stateSecret()` fail closed

Replace the fallback with a throw when `XERO_CLIENT_SECRET` is absent:

```ts
function stateSecret(): string {
  const secret = keys().XERO_CLIENT_SECRET;
  if (!secret) {
    throw new Error(
      "XERO_CLIENT_SECRET is required to sign OAuth state but was not found in the environment."
    );
  }
  return secret;
}
```

**Verify**: `bunx tsc --noEmit -p packages/xero/tsconfig.json` → exit 0.

### Step 2: Keep tests green with a test-env fallback for `XERO_CLIENT_SECRET`

In `packages/xero/keys.ts`, mirror the existing encryption-key test fallback so
state-signing in tests does not throw:

```ts
if (process.env.NODE_ENV === "test" && !process.env.XERO_CLIENT_SECRET) {
  process.env.XERO_CLIENT_SECRET = "test-xero-client-secret";
}
```

Place it next to the existing `XERO_TOKEN_ENCRYPTION_KEY` fallback block.

**Verify**: `bunx vitest run packages/xero` → all pass (no regressions from the
fail-closed change).

### Step 3: Authenticate the start route and bind it to the session

Make the route `async`, require a Clerk session, and reject when the
authenticated org does not match the requested `clerkOrgId`. Use the
authenticated `userId` rather than trusting the query value:

```ts
import { auth } from "@repo/auth/server";
// ...
export async function GET(request: Request) {
  const { orgId, userId } = await auth();
  if (!(orgId && userId)) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  const url = new URL(request.url);
  const clerkOrgId = url.searchParams.get("clerkOrgId");
  if (!clerkOrgId || clerkOrgId !== orgId) {
    return NextResponse.json(
      { error: "Organisation mismatch." },
      { status: 403 }
    );
  }
  const organisationId = url.searchParams.get("organisationId");
  const returnTo = url.searchParams.get("returnTo") ?? undefined;

  const result = buildXeroOAuthStartUrl({
    clerkOrgId: orgId,
    organisationId,
    returnTo,
    userId,
  });
  // ... unchanged result handling ...
}
```

**Verify**: `bun run build --filter=api` → exit 0.

### Step 4: Add a fail-closed test for state signing

Add a unit test (in `packages/xero/src/oauth/`) that, with `XERO_CLIENT_SECRET`
unset for that test, asserts the signing/start path throws (or returns an error
result) rather than using a constant. Stub `process.env.XERO_CLIENT_SECRET` for
the case and restore it after. Follow the mocking style of the existing OAuth
refresh tests in the same directory.

**Verify**: `bunx vitest run packages/xero` → all pass, new test included.

## Test plan

- New test: state-signing fail-closed (secret absent → throws/errors, not the
  fallback constant).
- Existing OAuth/refresh tests in `packages/xero/src/oauth/` must still pass with
  the test-env fallback from Step 2.
- Verification: `bunx vitest run packages/xero` → all pass.

## Done criteria

ALL must hold:

- [ ] `grep -n "xero-oauth-state" packages/xero/src/oauth/service.ts` returns no
      matches
- [ ] `bunx tsc --noEmit -p packages/xero/tsconfig.json` exits 0
- [ ] `bunx vitest run packages/xero` passes, including the new fail-closed test
- [ ] `bun run build --filter=api` exits 0
- [ ] The start route is `async`, calls `auth()`, and rejects org mismatch
- [ ] `bun run check` exits 0
- [ ] No files outside the in-scope list are modified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back if:

- `auth()` from `@repo/auth/server` cannot resolve a session inside the
  `apps/api` start route (e.g. cross-domain cookie issue): the SSE route is the
  precedent that it works, so a failure here means something structural changed.
  Do **not** weaken the existing downstream callback guard to compensate — report.
- Removing the fallback breaks an OAuth test that the Step 2 fallback does not fix
  (it may indicate a code path reads the secret outside `NODE_ENV === "test"`).
- The "Current state" excerpts no longer match the live code.

## Maintenance notes

- **Rotation**: the fallback constant `"xero-oauth-state"` is committed in git
  history. If any deployment ever processed an OAuth callback with
  `XERO_CLIENT_SECRET` unset, every `state` signed under the fallback is forgeable
  — rotate the Xero client secret as a precaution. (Do not put the new secret in
  any file; set it via the platform's env var management.)
- A cleaner long-term design is a dedicated `XERO_OAUTH_STATE_SECRET` decoupled
  from the client secret, so state signing does not depend on the OAuth app
  credentials. Deferred to keep this change minimal.
- Reviewer: confirm the start route rejects both the unauthenticated case and the
  org-mismatch case, and that `userId` is taken from the session, not the query.
