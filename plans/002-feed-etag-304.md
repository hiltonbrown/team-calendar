# Plan 002: Serve 304 Not Modified from the ICS feed endpoint and decouple the cache write from the response

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat d9da765..HEAD -- "apps/api/app/ical" packages/feeds/src/render/render-feed.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: 001 (uses its lint/typecheck gates for verification; functionally independent)
- **Category**: perf
- **Planned at**: commit `d9da765`, 2026-06-12
- **Issue**: https://github.com/hiltonbrown/leavesync/issues/58

## Why this matters

`GET /ical/:token.ics` is the hottest path in the product: Outlook, Google Calendar, and Apple Calendar poll every subscribed feed on a schedule (typically every 15–30 minutes per subscriber, forever). The render layer already computes a SHA-256 etag for every feed body, but the route discards it: no `ETag` response header is sent and the `If-None-Match` request header is never read (the request parameter is literally named `_request`). Every poll therefore downloads the full ICS body even when nothing changed. Returning 304s cuts bandwidth and lets calendar clients skip re-parsing.

Secondarily, in `renderFeedForToken` the Vercel KV cache write is awaited inside a `Promise.all` with two database writes; if the KV write rejects, the whole render path rejects and the client gets an error even though the feed body was successfully rendered. A cache write failure must never fail the response.

## Current state

- `apps/api/app/ical/[token]/route.ts` — the feed endpoint (45 lines). Verbatim today:

```typescript
// apps/api/app/ical/[token]/route.ts:13-45
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token: tokenParam } = await params;
  const token = tokenParam.endsWith(".ics")
    ? tokenParam.slice(0, -".ics".length)
    : tokenParam;

  const feedResult = await renderFeedForToken(token);

  if (!feedResult.ok) {
    return new Response("Not found", { status: 404 });
  }

  const { body, status } = feedResult.value;

  if (status === "expired" || status === "revoked") {
    return new Response("Gone", { status: 410 });
  }

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar;charset=utf-8",
      "Cache-Control": "max-age=3600, must-revalidate",
    },
  });
}
```

Note: `feedResult.value` already contains `etag` (see `RenderedFeed` below) — the route just never destructures it.

- `packages/feeds/src/render/render-feed.ts` — render service.
  - `RenderedFeed` interface (lines 16–20): `{ body: string; etag: string; status: "active" | "expired" | "revoked" }`.
  - The etag is `createHash("sha256").update(body).digest("hex")` (line 73) — a plain hex string, not yet HTTP-quoted.
  - The post-render persistence block (lines 137–153):

```typescript
// packages/feeds/src/render/render-feed.ts:137-153
await Promise.all([
  markTokenUsed(feedToken),
  database.feed.update({
    data: {
      last_etag: etag,
      last_rendered_at: new Date(),
    },
    where: {
      id: feedToken.feed_id,
      clerk_org_id: feedToken.clerk_org_id,
      organisation_id: feedToken.organisation_id,
    },
  }),
  setCachedFeedBody({ body, etag, key, ttlSeconds: 3600 }),
]);
```

- Conventions:
  - Logging goes through `import { log } from "@repo/observability/log"` — see `apps/api/app/api/availability/route.ts:6` for an exemplar import. No `console.*`.
  - Service functions return `Result<T, E>`; route handlers map to HTTP. Australian English in comments. No em dashes.
- Existing tests: `packages/feeds/src/render/render-feed.test.ts` (mocks `projectFeedEvents` and the database); `apps/api/__tests__/health.test.ts` is the minimal route-test exemplar:

```typescript
// apps/api/__tests__/health.test.ts
import { expect, test } from "vitest";
import { GET } from "../app/health/route";

test("Health Check", async () => {
  const response = await GET();
  expect(response.status).toBe(200);
  expect(await response.text()).toBe("OK");
});
```

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `bun install --frozen-lockfile` | exit 0 |
| Single test file | `bunx vitest run apps/api/app/ical/[token]/route.test.ts` | all pass |
| Feeds tests | `bunx vitest run packages/feeds/src/render/render-feed.test.ts` | all pass |
| Whole suite | `bun run test` | all pass |
| Lint | `bun run check` | exit 0 |
| Typecheck | `cd apps/api && bun run typecheck` | exit 0 |

## Scope

**In scope** (the only files you should modify/create):
- `apps/api/app/ical/[token]/route.ts`
- `apps/api/app/ical/[token]/route.test.ts` (create)
- `packages/feeds/src/render/render-feed.ts` (the `Promise.all` block only)
- `packages/feeds/src/render/render-feed.test.ts` (add cases)

**Out of scope** (do NOT touch):
- The ICS body, UID, or SEQUENCE logic in `renderFeedBody` — calendar clients depend on byte-stable output.
- `packages/feeds/src/cache/feed-cache.ts` — the cache key/TTL scheme is shared with the `rebuild-feed-cache` job.
- Token validation/status logic in `renderFeedForToken` (lines 77–120).
- The `Cache-Control` value — keep `max-age=3600, must-revalidate`.

## Git workflow

- Branch: `advisor/002-feed-etag-304`
- Conventional commits, e.g. `perf(api): return 304 from ICS feed endpoint when etag matches`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Decouple the KV cache write in `renderFeedForToken`

In `packages/feeds/src/render/render-feed.ts`, replace the `Promise.all` block (lines 137–153) so the two database writes stay awaited together but the cache write cannot reject the render:

```typescript
await Promise.all([
  markTokenUsed(feedToken),
  database.feed.update({
    /* unchanged */
  }),
]);
// The KV cache is a performance layer; a write failure must not fail the response.
try {
  await setCachedFeedBody({ body, etag, key, ttlSeconds: 3600 });
} catch (error) {
  log.warn(`Feed cache write failed for feed ${feedToken.feed_id}: ${String(error)}`);
}
```

Add `import { log } from "@repo/observability/log";` if not present. Check whether `@repo/observability` is already a dependency of `packages/feeds` (`grep observability packages/feeds/package.json`); if it is not, add `"@repo/observability": "*"` to its dependencies (matching how other workspace deps are declared in that file).

**Verify**: `bunx vitest run packages/feeds/src/render/render-feed.test.ts` → existing tests pass.

### Step 2: Return `ETag` and handle `If-None-Match` in the route

In `apps/api/app/ical/[token]/route.ts`:

1. Rename `_request` to `request`.
2. Destructure `etag` from `feedResult.value`.
3. After the expired/revoked check, compare the request's `If-None-Match` against the etag. HTTP etags are quoted and may carry a weak prefix, so normalise before comparing:

```typescript
const quotedEtag = `"${etag}"`;
const ifNoneMatch = request.headers.get("if-none-match");
const matches = ifNoneMatch
  ?.split(",")
  .map((candidate) => candidate.trim().replace(/^W\//, ""))
  .includes(quotedEtag);

if (matches) {
  return new Response(null, {
    status: 304,
    headers: {
      ETag: quotedEtag,
      "Cache-Control": "max-age=3600, must-revalidate",
    },
  });
}
```

4. Add `ETag: quotedEtag` to the 200 response headers (keep existing `Content-Type` and `Cache-Control`).

Edge case to preserve: expired/revoked tokens return `etag: ""` from the service — the 410 branch runs **before** any etag handling, so empty etags never reach the comparison. Keep that ordering.

**Verify**: `cd apps/api && bun run typecheck` → exit 0.

### Step 3: Write the route tests

Create `apps/api/app/ical/[token]/route.test.ts`. Mock `@repo/feeds` so `renderFeedForToken` is controllable (follow the `vi.mock` style used in `packages/xero/src/oauth/service.test.ts` — `vi.mock` + `await import`). Cases:

1. 200 with body, `ETag: "<hash>"` header, and `Content-Type: text/calendar;charset=utf-8` when the token is active and no `If-None-Match` is sent.
2. 304 with empty body and `ETag` header when `If-None-Match: "<hash>"` matches.
3. 304 when the client sends a weak validator `W/"<hash>"` or a list `"other", "<hash>"`.
4. 200 (full body) when `If-None-Match` does not match.
5. 404 when `renderFeedForToken` returns `ok: false`.
6. 410 when status is `expired` or `revoked`.
7. `.ics` suffix is stripped before calling `renderFeedForToken` (assert mock called with the bare token).

**Verify**: `bunx vitest run apps/api/app/ical/[token]/route.test.ts` → 7+ tests pass.

### Step 4: Add cache-failure test for the render service

In `packages/feeds/src/render/render-feed.test.ts`, add a case: when `setCachedFeedBody` rejects, `renderFeedForToken` still resolves `ok: true` with the rendered body. (The file already mocks the cache module; make the mock reject for this case.)

**Verify**: `bunx vitest run packages/feeds/src/render/render-feed.test.ts` → all pass, including the new case.

## Test plan

Covered by steps 3–4 above. Full-suite check: `bun run test` → all pass.

## Done criteria

ALL must hold:

- [ ] `bunx vitest run apps/api/app/ical/[token]/route.test.ts` exits 0 with the 7 cases above
- [ ] `bunx vitest run packages/feeds/src/render/render-feed.test.ts` exits 0 including the cache-failure case
- [ ] `grep -n "_request" "apps/api/app/ical/[token]/route.ts"` returns no matches
- [ ] `grep -n "setCachedFeedBody" packages/feeds/src/render/render-feed.ts` shows it outside the `Promise.all`
- [ ] `bun run check` and `cd apps/api && bun run typecheck` exit 0
- [ ] `bun run test` exits 0
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The route or render-feed code does not match the excerpts above.
- `RenderedFeed` no longer exposes `etag`, or the etag is no longer a deterministic hash of the body.
- Adding `@repo/observability` to `packages/feeds` creates a circular workspace dependency (check: does `packages/observability` depend on `packages/feeds`? It should not).
- You find yourself wanting to change the cache key scheme or TTL — out of scope.

## Maintenance notes

- If the etag computation ever changes (e.g. excludes the `DTSTAMP`-like volatile fields), the 304 logic keeps working — it only compares opaque strings — but cache hit rates change; nothing here needs revisiting.
- Reviewer should scrutinise the `If-None-Match` normalisation (quoting, weak prefix, comma lists) — that is where off-by-one bugs live.
- Deferred: `markTokenUsed` writes `last_used_at` to Postgres on **every** poll including cache hits (render-feed.ts:118). Debouncing that write (e.g. only when >1h stale) is a worthwhile follow-up but changes observable data freshness, so it was deliberately left out.
