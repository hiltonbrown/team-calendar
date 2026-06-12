# Plan 004: Restrict SSE CORS to the app origin and guard the keep-alive loop

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat d9da765..HEAD -- apps/api/app/api/notifications/stream`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: MED (a wrong origin allowlist breaks live notifications in one environment — test against dev ports)
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `d9da765`, 2026-06-12
- **Issue**: https://github.com/hiltonbrown/leavesync/issues/60

## Why this matters

The SSE notification endpoint reflects **any** request `Origin` back in `Access-Control-Allow-Origin` while also sending `Access-Control-Allow-Credentials: true` (falling back to `*` when no Origin is present). That tells browsers "any website may make credentialed requests here and read the response". Exploitation is currently blunted by Clerk's cookie `SameSite` attributes, but the header pair is an explicit grant we do not mean to make, and it silently becomes a live cross-origin notification leak if cookie attributes or auth transport ever change. The endpoint should allow exactly the product app origin.

Secondarily, the 25-second keep-alive `setInterval` calls `controller.enqueue()` with no guard. If the controller is already closed/errored when the tick fires (client gone, `cancel()` not yet run), `enqueue` throws inside the interval callback — an unhandled rejection in the function instance, with the interval continuing to fire.

## Current state

- `apps/api/app/api/notifications/stream/route.ts` (99 lines) — auth is solid: `requireOrg()` then an organisation lookup scoped by `clerk_org_id` (lines 42–57), so cross-tenant subscription is already blocked. The two problem areas:

```typescript
// route.ts:76-85
      keepAlive = setInterval(() => {
        controller.enqueue(encoder.encode(": keep-alive\n\n"));
      }, 25_000);
    },
    cancel() {
      unsubscribe?.();
      if (keepAlive) {
        clearInterval(keepAlive);
      }
    },
```

```typescript
// route.ts:88-97
  return new Response(stream, {
    headers: {
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Allow-Origin": request.headers.get("origin") ?? "*",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream",
      "X-Accel-Buffering": "no",
    },
  });
```

- Deployment topology: the product app (`apps/app`) runs on port 3000 / its own domain; this API (`apps/api`) on port 3002 / its own domain — so the browser EventSource call **is** cross-origin and CORS headers are genuinely needed for the app origin.
- The canonical app origin env var already exists in this app: `process.env.NEXT_PUBLIC_APP_URL` (used at `apps/api/app/api/xero/oauth/callback/route.ts:35`; declared in `apps/api/.env.example:21` as `http://localhost:3000`).
- Existing test: `apps/api/app/api/notifications/stream/route.test.ts` (64 lines, connection lifecycle).
- Conventions: no `console.*`; use `@repo/observability/log`. Australian English comments. No em dashes.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Stream route tests | `bunx vitest run apps/api/app/api/notifications/stream/route.test.ts` | all pass |
| API app tests | `cd apps/api && bun run test` | all pass |
| Typecheck | `cd apps/api && bun run typecheck` | exit 0 |
| Lint | `bun run check` | exit 0 |

## Scope

**In scope**:
- `apps/api/app/api/notifications/stream/route.ts`
- `apps/api/app/api/notifications/stream/route.test.ts`

**Out of scope** (do NOT touch):
- `packages/notifications` (the pub/sub internals).
- The auth/org-scoping block (lines 10–57) — it is correct.
- Client-side EventSource code in `apps/app` — if your change would require client changes, the change is wrong (see STOP conditions).
- Adding an OPTIONS preflight handler — EventSource GETs are "simple requests" and send no preflight; do not add dead code.

## Git workflow

- Branch: `advisor/004-sse-cors-keepalive`
- Conventional commit, e.g. `fix(api): restrict SSE CORS to the app origin and guard keep-alive enqueue`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Replace origin reflection with an allowlist

At the top of the route module add a helper:

```typescript
function allowedOrigin(requestOrigin: string | null): string | null {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!(requestOrigin && appUrl)) {
    return null;
  }
  try {
    return new URL(appUrl).origin === requestOrigin ? requestOrigin : null;
  } catch {
    return null;
  }
}
```

In the response, build headers conditionally: include `Access-Control-Allow-Origin` and `Access-Control-Allow-Credentials` **only** when `allowedOrigin(...)` returns a value; omit both otherwise (same-origin requests and non-browser clients need neither). Never emit `*`.

```typescript
const origin = allowedOrigin(request.headers.get("origin"));
const headers: Record<string, string> = {
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "Content-Type": "text/event-stream",
  "X-Accel-Buffering": "no",
};
if (origin) {
  headers["Access-Control-Allow-Origin"] = origin;
  headers["Access-Control-Allow-Credentials"] = "true";
  headers.Vary = "Origin";
}
return new Response(stream, { headers });
```

**Verify**: `cd apps/api && bun run typecheck` → exit 0.

### Step 2: Guard the keep-alive and event enqueues

Wrap both `controller.enqueue` call sites (the subscription callback at lines 68–74 and the keep-alive at 76–78) so a closed controller tears the stream down instead of throwing:

```typescript
const safeEnqueue = (chunk: Uint8Array): void => {
  try {
    controller.enqueue(chunk);
  } catch {
    // Controller already closed; stop pushing and release resources.
    unsubscribe?.();
    if (keepAlive) {
      clearInterval(keepAlive);
      keepAlive = null;
    }
  }
};
```

Use `safeEnqueue` in the subscription callback and the interval. Keep the `cancel()` handler as-is (it remains the normal cleanup path).

**Verify**: `bunx vitest run apps/api/app/api/notifications/stream/route.test.ts` → existing tests pass.

### Step 3: Extend the route tests

Add to `route.test.ts` (set `process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000"` in `beforeEach`, restore after — mirror the env handling pattern in `packages/xero/src/oauth/service.test.ts:23-37`):

1. Request with `Origin: http://localhost:3000` → response has `Access-Control-Allow-Origin: http://localhost:3000`, `Access-Control-Allow-Credentials: true`, and `Vary: Origin`.
2. Request with `Origin: https://evil.example` → response has **no** `Access-Control-Allow-Origin` header.
3. Request with no Origin header → no CORS headers, stream still returned (status 200).
4. After the stream is cancelled, a forced enqueue path does not throw (exercise `safeEnqueue` indirectly: cancel the response body reader, then advance fake timers past 25s with `vi.useFakeTimers()`; the test passes if no unhandled rejection occurs).

**Verify**: `bunx vitest run apps/api/app/api/notifications/stream/route.test.ts` → all pass, including 4 new cases.

## Test plan

Covered in Step 3. Then `cd apps/api && bun run test` → all pass.

## Done criteria

ALL must hold:

- [ ] `grep -n '?? "\*"' apps/api/app/api/notifications/stream/route.ts` returns no matches
- [ ] `grep -n "Vary" apps/api/app/api/notifications/stream/route.ts` shows `Vary: Origin` set when CORS headers are emitted
- [ ] `bunx vitest run apps/api/app/api/notifications/stream/route.test.ts` exits 0 with the new cases
- [ ] `cd apps/api && bun run test` exits 0; `bun run check` exits 0; `cd apps/api && bun run typecheck` exits 0
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The client in `apps/app` connects to the SSE endpoint from an origin **other than** `NEXT_PUBLIC_APP_URL` (check: `grep -rn "notifications/stream" apps/app --include="*.ts" --include="*.tsx"` and trace what base URL it uses). If preview deployments use per-deploy URLs, a single-origin allowlist breaks them — report and propose an env-driven multi-origin list instead of guessing.
- `NEXT_PUBLIC_APP_URL` is not set in any deployed environment (check `.env.example` files and ask the operator) — shipping the allowlist would silently kill notifications.
- Existing tests assert the reflected-origin behaviour as intended.

## Maintenance notes

- If preview deployments (per-PR URLs) need SSE, extend `allowedOrigin` to also accept `https://*.vercel.app` origins gated on `process.env.VERCEL_ENV === "preview"` — do not loosen production.
- Reviewer should manually smoke-test live notifications in dev (`bun run dev`, app on :3000, api on :3002) since automated tests mock the transport.
- The same reflected-origin pattern may exist on other API routes added later; this route is the template to copy from now on.
