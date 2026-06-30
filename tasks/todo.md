# Marketing Footer Polish

## Plan
- [x] Read the footer critique snapshot and Impeccable polish flow.
- [x] Inspect existing marketing simple-page patterns, footer source, and shell styles.
- [x] Update footer IA so every label has an honest destination.
- [x] Create missing marketing pages for About, Customers, Careers, Status, and Help centre.
- [x] Fix feature deep-link anchors and footer interaction polish.
- [x] Run checks, inspect diffs, and document the result.

## Review
- Added `/about`, `/customers`, `/careers`, `/status`, and `/help-centre` marketing pages using the existing `marketing-simple` pattern.
- Updated the footer so About, Customers, Careers, Status, and Help centre point to real routes instead of proxy destinations.
- Added footer conversion actions, an inverse wordmark, stronger trust copy, hover/focus states, touch-sized CTA links, and reduced-motion handling.
- Added `id="leave-workflow"` and `id="ics-feeds"` to the feature sections targeted by footer/help-centre deep links.
- Verification passed: `bun run fix`, `bun run check`, `bun run typecheck` in `apps/web`, Impeccable detector on `apps/web/app/components/footer.tsx`, and `NEXT_PUBLIC_APP_URL=https://app.teamcalendar.online bun run build` in `apps/web`.
- The first sandboxed build failed because Turbopack was blocked from binding a local worker port. The same build passed with escalated permissions.
