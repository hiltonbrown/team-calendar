# Prompt 07: ICS UID and SEQUENCE correctness (build step 12)

## Role and context

You are a senior engineer on LeaveSync. The ICS renderer currently emits the raw
`availability_records.id` as the VEVENT UID and hardcodes `SEQUENCE: 0`
(`packages/feeds/src/render/render-feed.ts:91,93`). The deterministic UID is correctly derived
and stored on `availability_records.derived_uid_key`
(`packages/availability/src/plans/plan-service.ts:1087-1101`) but never read by the renderer,
and `availability_publications` (which should carry `published_sequence`) is never materialised
at runtime. This violates the PRODUCT non-negotiable that UIDs are derived from business
identity, and it will cause calendar clients to duplicate or orphan events on change. This
slice makes the published feed emit the stable UID and a correct, incrementing SEQUENCE, and
adds the mandatory feed tests that are currently missing.

## Hard rules

- Branch first off the latest `main`: `git checkout main && git pull origin main && git
  checkout -b launch/07-ics-uid-sequence`.
- Australian English. No em dashes.
- This slice owns `packages/feeds` (projection, render, publication materialisation) and the
  UID helper in `packages/availability` if the Xero `stable_source_key` branch needs
  completing. Do not change `schema.prisma` or migrations (the
  `availability_publications` table and `published_sequence` column already exist). Do not
  change tenancy keys or the Clerk integration. Keep privacy transforms at the projection
  layer, never at render time.
- Do not use `as any` or suppression. The UID formula and field order must match
  `PRODUCT.md` exactly; do not invent a new format.
- Preserve existing tests and add the mandatory feed tests.
- If materialising `availability_publications` requires deciding what counts as a "material
  change" for SEQUENCE beyond start/end/summary/privacy changes, stop and record the rule in
  `BLOCKED.md`.

## Authoritative references

- `PRODUCT.md` "Canonical event UID strategy" (lines ~446-470), "Feed rendering model"
  (~532-571), and the UID/SEQUENCE non-negotiables.
- `CLAUDE.md` "Feed rules" and the mandatory test list (ICS serialisation, UID, SEQUENCE,
  privacy transforms, feed token validation).
- `packages/feeds/src/render/render-feed.ts`, `packages/feeds/src/projection/feed-projection.ts`,
  `packages/availability/src/plans/plan-service.ts:1087-1101`,
  `packages/database/src/queries/feeds.ts` (`listFeedPublications`).
- `launch-plan/REVIEW.md` "Critical findings" C1.

## Phased steps

1. **Complete the UID for Xero records.** Ensure `derived_uid_key` is computed with the Xero
   `stable_source_key` (`xero_tenant_id + employee_id + leave_type + start + end + units`) for
   Xero-sourced records and `availability_records.id` for manual records, matching the formula
   field order and the `@ical.leavesync.app` suffix. (Prompt 04 sets this on inbound Xero
   records; reconcile so the helper is the single source.)
2. **Materialise `availability_publications`.** When an availability record changes, write or
   update its publication row, computing whether the published representation changed
   materially; increment `published_sequence` on material change, keep it stable otherwise.
   Reuse the existing `packages/database/src/queries/feeds.ts` helpers.
3. **Project the stable UID and SEQUENCE.** In `packages/feeds/src/projection/feed-projection.ts`,
   carry `derived_uid_key` and `published_sequence` into the preview/publication event instead
   of the raw record id.
4. **Render correctly.** In `packages/feeds/src/render/render-feed.ts`, set the VEVENT `id` to
   the stable UID and `sequence` to the publication's `published_sequence` (not 0).
5. **Tests** co-located in `packages/feeds`: ICS serialisation snapshot; UID stable across an
   edit that materially changes the event (UID unchanged, SEQUENCE incremented); UID differs
   per person/record/window; privacy transforms (named, masked, private) at projection; feed
   token validation (active, revoked, expired).

## Verification gate

`bun install`, `bun run build`, `bun run check`, `bun run boundaries`, `bun run test` must
pass, including the new feed tests.

## Commits and PR

Conventional commits, for example: `fix: emit derived_uid_key as VEVENT UID`,
`feat: materialise availability_publications and increment SEQUENCE`,
`test: ICS serialisation, UID stability, SEQUENCE, privacy, token validation`. Push and open a
PR titled "ICS UID and SEQUENCE correctness".

## Acceptance criteria

- [ ] Published VEVENT UID is the stable `derived_uid_key`, not the raw row id.
- [ ] Xero records use the Xero `stable_source_key`; manual records use the record id.
- [ ] `availability_publications` is materialised; `published_sequence` increments on material change, UID stays stable.
- [ ] Privacy transforms remain at the projection layer.
- [ ] The mandatory feed tests exist and pass.
