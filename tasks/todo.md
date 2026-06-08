# Prompt 08: Feed publication jobs and cache invalidation

## Plan

- [ ] 1. `packages/feeds`: add `feed-invalidation.ts` with `feedIdsForPeople` and
  `invalidateFeedCachesForPerson` (canonical scope resolution via `resolvePeopleForFeed`).
- [ ] 2. `packages/feeds`: extract `renderFeedBody` from `render-feed.ts` so the renderer and
  the rebuild job build the ICS body the same way (consistent cache key).
- [ ] 3. `packages/feeds`: `materialiseAvailabilityPublication` invalidates affected feed caches
  on record change (default on), with an `invalidateCache` opt-out for bulk callers; return
  `changed`/`personId` for batch callers.
- [ ] 4. `packages/jobs`: `rebuild-feed-cache` handler (invalidate + regenerate KV body).
- [ ] 5. `packages/jobs`: `reconcile-feed-publications` handler (materialise per record,
  idempotent, record-level isolation, enqueue rebuilds for changed feeds).
- [ ] 6. Register both in `functions.ts`; export from `index.ts`; serve via `apps/api`.
- [ ] 7. `sync-xero-leave-records`: opt out of inline invalidation (`invalidateCache: false`);
  rebuilds already enqueued.
- [ ] 8. Tests: invalidation in/out of scope; reconcile idempotency; both scope keys present.

## Decisions

- No schema change: publications are upserted, never deleted, so no historical-feed retention
  question and no `BLOCKED.md` entry is required.
- Cache invalidation reuses the existing `invalidateFeedCache(feedId)` (deletes `feed:{id}:*`),
  driven by canonical scope resolution so out-of-scope records never invalidate.
- All record-change paths funnel through `materialiseAvailabilityPublication`, so inline
  invalidation there covers manual create/update/archive and approval transitions without
  touching `@repo/availability`. Bulk callers (sync, reconcile) opt out and batch rebuilds.

## Review

- [x] 1. `feed-invalidation.ts`: `feedIdsForPeople` + `invalidateFeedCachesForPerson` resolve
  in-scope feeds via the canonical `resolvePeopleForFeed`, so out-of-scope records never match.
- [x] 2. `renderFeedBody` extracted from `render-feed.ts` and shared with the rebuild job.
- [x] 3. `materialiseAvailabilityPublication` invalidates affected caches by default (covers
  manual create/update/archive and approval transitions through the shared funnel) and exposes
  `invalidateCache: false` for bulk callers; returns `changed`/`personId`.
- [x] 4. `rebuild-feed-cache` handler: invalidates then regenerates the KV body under the
  renderer's cache key; treats paused/archived/out-of-scope feeds as a cache-dropping no-op.
- [x] 5. `reconcile-feed-publications` handler: materialises every scoped record idempotently
  with record-level isolation, then enqueues one rebuild per affected feed.
- [x] 6. Both registered in `functions.ts` (six jobs total) and exported; served via the
  existing `apps/api` inngest route (serves the `functions` array).
- [x] 7. `sync-xero-leave-records` passes `invalidateCache: false` (rebuilds already enqueued).
- [x] 8. Tests added for invalidation in/out of scope, scope-key presence, reconcile
  idempotency, failure isolation, and rebuild behaviour.

### Verification
- `bun install`, `bun run check` (only pre-existing `.claude/skills` broken-symlink
  internalErrors remain; all changed files lint clean), `bun run boundaries`, `bun run test`
  (9 packages), and `bun run build` (4 apps) all pass.

### Notes
- No schema change and no publication deletion, so the historical-feed retention question does
  not arise and no `BLOCKED.md` entry is required.
