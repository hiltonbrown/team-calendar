# Plan 002: Feed ETag and 304 Responses

## Plan

- [x] Read `plans/002-feed-etag-304.md`, `PRODUCT.md`, current task notes, and relevant source files.
- [x] Run the required drift check for the feed route and render service.
- [x] Decouple the feed cache write from the render response path.
- [x] Add `ETag` headers and `If-None-Match` handling to the ICS route.
- [x] Add route tests for 200, 304, 404, 410, weak/list validators, mismatches, and `.ics` token stripping.
- [x] Add render-service coverage proving cache write failures do not fail a rendered response.
- [x] Run targeted tests and verification checks.
- [x] Run full `bun run check`, app typecheck, and `bun run test`.
- [x] Update `plans/README.md` status for plan 002.

## Review

- `GET /ical/:token.ics` now returns quoted `ETag` headers on 200 responses and serves 304 responses for matching strong, weak, or listed `If-None-Match` validators.
- Expired and revoked feed tokens still return 410 before ETag comparison, so empty service etags never participate in cache validation.
- `renderFeedForToken` still awaits the token/feed database writes, then attempts the KV cache write separately and logs a warning if that performance-layer write fails.
- `packages/feeds` now declares its `@repo/observability` dependency for the render-service warning log.

## Verification

- `bun install --frozen-lockfile`: passed.
- `bunx vitest run apps/api/app/ical/[token]/route.test.ts`: 9 tests passed.
- `bunx vitest run packages/feeds/src/render/render-feed.test.ts`: 4 tests passed.
- `grep -n "_request" apps/api/app/ical/[token]/route.ts`: no matches.
- `grep -n "setCachedFeedBody" packages/feeds/src/render/render-feed.ts`: cache write is outside the persistence `Promise.all`.
- `cd apps/api && bun run typecheck`: passed.
- `bun run check`: passed.
- `bun run test`: passed.
