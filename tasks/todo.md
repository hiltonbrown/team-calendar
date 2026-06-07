# ICS UID and SEQUENCE Correctness

- [x] Branch from latest `main` into `launch/07-ics-uid-sequence`.
- [x] Read PRODUCT/CLAUDE/feed references and confirm existing schema support.
- [x] Add one shared PRODUCT-formula UID helper for manual, LeaveSync, and Xero records.
- [x] Materialise `availability_publications` with prompt-scope SEQUENCE increments.
- [x] Call publication materialisation from feed-visible availability record writers.
- [x] Project stable UID and published SEQUENCE while preserving UI record identity.
- [x] Render VEVENT UID and SEQUENCE from publication data.
- [x] Add mandatory feed and UID tests.
- [x] Run verification: `bun install`, `bun run build`, `bun run check`, `bun run boundaries`, `bun run test`.
- [x] Review elegance and document results.
- [x] Commit, push, and open PR titled "ICS UID and SEQUENCE correctness".

## Review

- Added `deriveAvailabilityUidKey`, using the exact PRODUCT field order and `@ical.leavesync.app` suffix. Manual and LeaveSync-created records now use record id as `stable_source_key`; inbound Xero records keep the Xero stable source key.
- Added feed-owned publication materialisation for `availability_publications`. Rows are created per availability record with `published_sequence = 0` and increment only when the prompt-scope published UID, summary, description, or privacy mode changes.
- Wired materialisation after feed-visible manual availability, plan, approval, submit, and Xero leave sync changes. Draft deletion is intentionally excluded because the record no longer exists and was not feed-visible.
- Feed projection now carries `publishedUid` and `publishedSequence` while preserving `sourceRecordId` for preview UI keys. ICS rendering uses the publication UID and SEQUENCE instead of raw record id and `0`.
- Fixed `apps/app/app/layout.tsx` to allow relative legal URLs when `NEXT_PUBLIC_WEB_URL` is absent; this was required for the full production build to prerender locally.
- Verification:
  - `bun install`: passed.
  - `bun install --force`: repaired an incomplete local `@sentry/nextjs` package install; no tracked lockfile changes.
  - `bun run --cwd packages/availability test`: 28 files, 135 tests passed.
  - `bun run --cwd packages/feeds test`: 4 files, 8 tests passed.
  - `bun run --cwd packages/jobs test`: 1 file, 3 tests passed.
  - `bun run --cwd packages/availability typecheck`: passed.
  - `bun run --cwd packages/feeds typecheck`: passed.
  - `bun run check`: passed.
  - `bun run boundaries`: passed.
  - `bun run test`: passed.
  - `bun run build`: passed with approved network access for Google Fonts.
  - `git diff --check`: passed.
