# Prompt 08: Feed publication jobs and cache invalidation (build steps 11 and 16)

## Role and context

You are a senior engineer on LeaveSync. Two required Inngest jobs are missing:
`reconcile-feed-publications` (ensure `availability_publications` match current records) and
`rebuild-feed-cache` (regenerate cached ICS bodies in Vercel KV). Only two of the six required
jobs are registered (`packages/jobs/src/functions.ts`). Separately, the feed cache is keyed on
`feed.updated_at` and is only invalidated on feed and token mutations, not when an underlying
`availability_record` changes, so record edits surface only after the 3600s TTL
(`packages/feeds/src/cache/feed-cache.ts`, `packages/feeds/src/render/render-feed.ts:114`). This
slice adds the two jobs and ties cache invalidation to record changes.

## Hard rules

- Branch first off the latest `main`: `git checkout main && git pull origin main && git
  checkout -b launch/08-feed-publication-jobs`. Depends on prompt 07 (the publication
  materialisation pipeline) being merged.
- Australian English. No em dashes.
- This slice owns `packages/jobs` (the two new jobs), `packages/feeds` (cache invalidation),
  and the Inngest registration in `apps/api`. Do not change `schema.prisma`, migrations,
  tenancy keys, or the Clerk integration.
- Both jobs carry `clerk_org_id` and `organisation_id` in their event payloads. Idempotent;
  record-level failure isolation; Inngest retries handle transient failures.
- Do not use `as any` or suppression. Preserve and add tests.
- If reconciliation could legitimately delete publications (for example for archived records)
  in a way that affects historical feeds, stop and record the retention question in
  `BLOCKED.md`.

## Authoritative references

- `PRODUCT.md` "Sync jobs (Inngest)" (lines ~479-490), "Feed rendering model" (~532-548).
- `CLAUDE.md` "Inngest job rules" and "Feed rules".
- `packages/jobs/src/functions.ts`, `packages/jobs/src/events.ts`,
  `apps/api/app/api/inngest/route.ts`, `packages/feeds/src/cache/feed-cache.ts`,
  `packages/feeds/src/feed-service.ts` (`invalidateFeedCache`).
- `launch-plan/REVIEW.md` "Critical findings" C3 and C4.

## Phased steps

1. **`reconcile-feed-publications`** handler in `packages/jobs/src/handlers/`: for the scoped
   Organisation, ensure every current `availability_record` has a correct
   `availability_publications` row (create, update, or mark superseded), incrementing
   `published_sequence` on material change. Register and serve it.
2. **`rebuild-feed-cache`** handler: regenerate the cached ICS body in Vercel KV for the
   affected feeds, keyed consistently with the renderer. Register and serve it.
3. **Cache invalidation on record change**: when an `availability_record` changes (inbound
   sync upsert, manual create/update/archive, approval transitions), invalidate the caches of
   the feeds whose scope includes that record (or advance a content etag that the cache key
   incorporates). The goal is that a changed in-scope record is reflected without waiting for
   the TTL, while out-of-scope records cause no invalidation.
4. **Tests**: reconciliation creates and updates publications idempotently; cache invalidated
   when an in-scope record changes and not when an out-of-scope record changes; both scope
   keys present in job queries.

## Verification gate

`bun install`, `bun run build`, `bun run check`, `bun run boundaries`, `bun run test` must
pass.

## Commits and PR

Conventional commits, for example: `feat: reconcile-feed-publications job`,
`feat: rebuild-feed-cache job`, `fix: invalidate feed cache on availability record change`,
`test: publication reconciliation and cache invalidation`. Push and open a PR titled "Feed
publication jobs and cache invalidation".

## Acceptance criteria

- [ ] `reconcile-feed-publications` and `rebuild-feed-cache` exist, are registered, and are served.
- [ ] All six required Inngest jobs are now registered.
- [ ] Feed cache is invalidated when a relevant `availability_record` changes, not only on TTL.
- [ ] Both jobs carry `clerk_org_id` and `organisation_id`; queries are scoped; tests cover the behaviour.
