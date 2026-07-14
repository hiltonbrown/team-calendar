# Plan 023: Stop the ICS feed cache from invalidating its own key on every render

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report, do not improvise. When done, update the status row for this plan in
> `plans/README.md` unless a reviewer dispatched you and told you they maintain
> the index.
>
> **Drift check (run first)**: `git diff --stat 123bbd8..HEAD -- packages/feeds/src/cache/feed-cache.ts packages/feeds/src/render/render-feed.ts packages/jobs/src/handlers/rebuild-feed-cache.ts packages/feeds/src/cache/feed-cache.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: perf
- **Planned at**: commit `123bbd8`, 2026-07-12

## Why this matters

The ICS feed cache key embeds the feed's `updated_at`, but the token-served
render path writes back to the `Feed` row (setting `last_etag`,
`last_rendered_at`) on every cache miss, and `Feed.updated_at` is a Prisma
`@updatedAt` column that is bumped by any update to the row. So each render
computes a key from the pre-update `updated_at`, stores the body under it, then
immediately changes `updated_at`. The next poll computes a **different** key,
misses, re-renders, and bumps again.

The result: once a feed drops out of cache (1-hour TTL, or any feed the
`rebuild-feed-cache` job has not pre-warmed), it enters a permanent 0%-hit-rate
loop. Every ICS poll from every calendar subscriber runs the full feed
projection + ICS render + a DB write, and orphans a Redis key per request.
Calendar clients poll every 5-15 minutes per subscriber, so cost scales with
subscriber count, not with how often leave actually changes. This is the core
publishing feature of the product silently running with no cache.

The `rebuild-feed-cache` job writes under the same key **without** bumping
`updated_at`, which is exactly why the scheduled path works and the token path
does not, confirming the diagnosis.

## Current state

- `packages/feeds/src/cache/feed-cache.ts` — cache key builder:

```ts
// packages/feeds/src/cache/feed-cache.ts:33-39
export function feedCacheKey(input: {
  feedId: string;
  feedUpdatedAt: Date;
  privacyMode: string;
}): string {
  return `feed:${input.feedId}:${input.feedUpdatedAt.toISOString()}:${input.privacyMode}`;
}
```

- `packages/feeds/src/render/render-feed.ts` — the hot token path builds the key
  from `feed.updated_at`, then on a miss writes `last_etag`/`last_rendered_at`
  back to the `Feed` row:

```ts
// packages/feeds/src/render/render-feed.ts:112-115
const key = feedCacheKey({
  feedId: feedToken.feed.id,
  feedUpdatedAt: feedToken.feed.updated_at,
  privacyMode: feedToken.feed.privacy_mode,
});
// ... on cache miss (render-feed.ts:140-150):
await Promise.all([
  markTokenUsed(feedToken),
  database.feed.update({
    data: { last_etag: etag, last_rendered_at: new Date() },
    where: { id: feedToken.feed_id, clerk_org_id: feedToken.clerk_org_id, organisation_id: feedToken.organisation_id },
  }),
]);
```

- `Feed.updated_at` is `@updatedAt`, so the `feed.update` above changes it:

```
// packages/database/prisma/schema.prisma:814
updated_at               DateTime                  @updatedAt
```

- The rebuild job writes the cache without touching `updated_at` (reference for
  the correct pattern):

```ts
// packages/jobs/src/handlers/rebuild-feed-cache.ts:103-110 (approx)
// setCachedFeedBody(feedCacheKey({...}), ...) with no feed.update after it
```

- `invalidateFeedCache` already deletes by prefix `feed:${feedId}:*` (see
  `feed-cache.ts` — the SCAN-based invalidation). That means the correct
  behaviour on a real content change is to invalidate the whole feed prefix, and
  the `updated_at` component was never load-bearing for correctness.

- Conventions: `packages/feeds` owns all cache logic; service functions return
  `Result`; tests are co-located Vitest. Cache tests live in
  `packages/feeds/src/cache/feed-cache.test.ts`.

## Commands you will need

| Purpose   | Command                                                          | Expected on success |
|-----------|------------------------------------------------------------------|---------------------|
| Typecheck | `bun run typecheck`                                              | exit 0, no errors   |
| Unit test | `bunx vitest run packages/feeds/src/cache/feed-cache.test.ts packages/feeds/src/feed-service.test.ts` | all pass |
| Lint      | `bun run check`                                                  | exit 0              |

## Scope

**In scope**:
- `packages/feeds/src/cache/feed-cache.ts` (key builder)
- `packages/feeds/src/render/render-feed.ts` (key call site)
- `packages/jobs/src/handlers/rebuild-feed-cache.ts` (its key call site — must
  use the identical new key so the pre-warm still lands where the token path reads)
- `packages/feeds/src/cache/feed-cache.test.ts` (tests)
- Any other call site of `feedCacheKey` — find them ALL first:
  `grep -rn "feedCacheKey" packages apps`

**Out of scope**:
- The invalidation mechanism (`invalidateFeedCache` and its SCAN loop) — it is
  separately logged as a known item; do not redesign it here. It already deletes
  by `feed:${feedId}:*`, which keeps working with the new key.
- The Prisma schema `@updatedAt` on `Feed` — leave it; other code relies on
  `updated_at`.
- Feed projection / privacy logic.

## Git workflow

- Base branch: `preview` — all development lands on `preview`, not `main`. Create this branch from `preview` and, if you merge, merge back into `preview`. Earlier-numbered plans in this batch also land on `preview` first, so the drift-check diff may legitimately include their changes; treat a mismatch as a STOP condition only when it is not explained by an earlier plan's documented scope.
- Branch: `improve/023-feed-cache-key`
- Conventional commits (e.g. `fix(feeds): drop mutable updated_at from feed cache key`).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Inventory every `feedCacheKey` caller

Run `grep -rn "feedCacheKey" packages apps`. Note every call site. All of them
must be updated in lockstep in the following steps so the token path and the
rebuild job compute the **same** key. If a caller you did not expect appears
(outside `render-feed.ts`, `rebuild-feed-cache.ts`, `feed-cache.ts`, and tests),
treat it as a STOP condition and report.

### Step 2: Remove `feedUpdatedAt` from the key

Change `feedCacheKey` to key on `feedId` and `privacyMode` only:

```ts
export function feedCacheKey(input: {
  feedId: string;
  privacyMode: string;
}): string {
  return `feed:${input.feedId}:${input.privacyMode}`;
}
```

This keeps the `feed:${feedId}:` prefix that `invalidateFeedCache` deletes by, so
explicit invalidation on content change still clears every privacy-mode variant.

**Verify**: `bun run typecheck` → the compiler now flags every call site that
still passes `feedUpdatedAt`. Good — that is your worklist for Step 3.

### Step 3: Update all call sites

Update `render-feed.ts:112-115`, `rebuild-feed-cache.ts`, and any others from
Step 1 to call `feedCacheKey({ feedId, privacyMode })` without `feedUpdatedAt`.
Do **not** otherwise change what each site does. Leave the `feed.update`
bookkeeping write in `render-feed.ts` as-is — with `updated_at` out of the key,
the bump is now harmless.

**Verify**: `bun run typecheck` → exit 0 (no remaining references to the removed field).

### Step 4: Prove the render/rebuild keys match and survive an `updated_at` bump

Add a test in `feed-cache.test.ts` asserting:
1. `feedCacheKey` returns the same string for the same `feedId` + `privacyMode`
   regardless of any date (i.e. the mutable component is gone).
2. Two calls that previously differed only by `updated_at` now produce an
   identical key.

If `feed-service.test.ts` or a render test asserted the old key format, update
those expectations.

**Verify**: `bunx vitest run packages/feeds/src/cache/feed-cache.test.ts packages/feeds/src/feed-service.test.ts` → all pass.

### Step 5: Confirm the invalidation paths cover every content change

With `updated_at` out of the key, feed freshness within the 1-hour TTL depends
entirely on explicit invalidation firing on content change. Do not change any of
these paths — just verify they exist and record the result in the PR:

- Record/publication changes: `invalidateFeedCachesForPerson` is called from the
  publication service (`packages/feeds/src/publication/publication-service.ts:89`).
- Feed-level mutations (rename, privacy change, scope change, archive):
  `invalidateFeedCache` calls throughout `packages/feeds/src/feed-service.ts`
  and `tokens/token-service.ts`.
- The rebuild job invalidates before re-warming
  (`packages/jobs/src/handlers/rebuild-feed-cache.ts:76,83`).

If any feed-content mutation path lacks an invalidation call, treat it as a STOP
condition — landing the key change without it would serve stale bodies for up to
an hour after that mutation.

## Test plan

- New test in `feed-cache.test.ts`: key stability across differing dates; same
  key for token-path inputs vs rebuild-job inputs (Step 4).
- Update any existing test that hardcoded the `feed:id:iso:mode` format.
- Structural pattern: existing cases in `feed-cache.test.ts`.
- Verification: the vitest command above → all pass.

## Done criteria

ALL must hold:

- [ ] `bun run typecheck` exits 0
- [ ] `grep -rn "feedUpdatedAt" packages/feeds packages/jobs` returns no matches
- [ ] `grep -rn "feedCacheKey" packages apps` — every call site passes only `{ feedId, privacyMode }`
- [ ] `bunx vitest run packages/feeds/src/cache/feed-cache.test.ts packages/feeds/src/feed-service.test.ts` passes, with the new stability test present
- [ ] Step 5's invalidation-coverage check is recorded in the PR description
- [ ] `bun run check` exits 0
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Any excerpt in "Current state" does not match live code (drift).
- Step 1 reveals a `feedCacheKey` caller outside the listed files — report it so
  the scope can be extended deliberately.
- Removing `feedUpdatedAt` breaks a test whose intent is to verify
  content-change invalidation (that would mean `updated_at` was load-bearing for
  correctness somewhere — report before changing the invalidation path).

## Maintenance notes

- After this lands, correctness of feed freshness depends entirely on
  `invalidateFeedCache` being called whenever a feed's published content changes.
  A reviewer should confirm the invalidation call sites (record change →
  rebuild/invalidate) still fire; the separately-logged SCAN-loop redesign, if
  ever done, must preserve the `feed:${feedId}:*` prefix contract.
- If a future change needs cache busting on feed rename/privacy change, prefer an
  explicit `invalidateFeedCache(feedId)` call over reintroducing a mutable
  timestamp into the key.
- Related plan 028 (SEQUENCE on date edits) also touches feed publication; it
  does not touch the cache key, but a reviewer landing both should sanity-check
  that a materially-changed record still triggers invalidation.
