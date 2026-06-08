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

## Review feedback fixes (PR #48)

- All-day SEQUENCE correctness: the publication materialiser only bumped `published_sequence` on UID, summary, description, or privacy changes, so toggling a record between all-day and timed (without changing dates) shipped a materially different `DTSTART`/`DTEND` with a stale SEQUENCE. Added `published_all_day` to `availability_publications` (migration `20260607000000_add_published_all_day`, backfilled from the source record) and included it in the material-change check. Start/end changes were already covered transitively because the derived UID encodes both.
- Stale-archive resilience: `archiveStaleRecords` materialised publications with `Promise.all`, so one publication failure rejected the whole batch and failed the entire sync run, contradicting the record-level failure tolerance rule. It now materialises one record at a time and logs and continues on per-record failure; the record is already archived and `reconcile-feed-publications` repairs any drift.
- Package boundary (availability to feeds): left as-is. The `@repo/feeds` dependency predates this PR (declared in `packages/availability/package.json` and already consumed by `dashboard-service.ts` on `main`), `turbo boundaries` passes, and the publication orchestration follows that established pattern. Inverting the layering is a broader refactor outside this PR's scope.
- Verification after fixes: `bun run test` (9/9 tasks, all suites green), `packages/feeds` + `packages/jobs` typecheck of touched code, Biome check on changed files, and `bun run boundaries` all passed.

## Review feedback fixes round two (PR #48 unresolved Copilot threads)

- Concurrent-create race in `upsertPublication`: two callers could both observe `record.publication === null` and race on `availabilityPublication.create`, turning the 1:1 `availability_record_id` unique index into a P2002 hard failure. The losing insert is now caught via the established `isUniqueConflict` (P2002) guard, the winning row is reloaded with `findUnique`, and materialisation falls through to the update path so it stays idempotent under concurrency.
- Redundant write when nothing materially changed: `upsertPublication` always issued an `update`, churning `updated_at` (the model has `updated_at @updatedAt`) and re-writing the row even when no published field changed. It now returns the existing published representation directly when `materiallyChanged` is false, removing the no-op write and the load it added to reconcile/materialisation jobs. The conditional `published_at`/`published_sequence` ternaries collapsed because the update path is now only reached on a genuine change.
- Extracted `existingPublicationSelect` so the record's nested publication select and the race-recovery `findUnique` share one field list, and switched the type-only `Prisma` import to a value import for the `instanceof` check.
- Tests: added regression coverage asserting (1) an unchanged re-materialisation skips the `update` and holds the sequence, and (2) a P2002 from `create` reloads the winning row via `findUnique` and returns it idempotently without an update.

## Review feedback fixes round three (PR #48 second Copilot review)

- Decision: best-effort, non-fatal publication materialisation (chosen over atomic transaction threading, which would deepen the availability->feeds coupling deliberately deferred earlier).
- Post-commit side effect no longer fails the write: the four private materialisation wrappers (`materialisePublication` in index.ts, `materialiseApprovalPublication`, `materialiseSubmitPublication`, `materialisePlanPublication`) now return `void` and log on failure via `@repo/observability/log` instead of returning an error. The 16 create/update/approve/decline/submit/withdraw/revert call sites just `await` the wrapper, so a failed feed projection no longer turns a committed record into an API error (which could also cause duplicate retries). The canonical record stays the source of truth; the projection is corrected on the next successful materialisation.
- Inbound sync path left unchanged: `materialiseSyncedPublication` in `sync-xero-leave-records.ts` still throws so Inngest retries (record-level inbound failures are tolerated and isolated per record); only the archive-loop comment was corrected.
- Fixed the misleading comment: `sync-xero-leave-records.ts` no longer claims a non-existent `reconcile-feed-publications` job repairs drift (that job is only planned, tracked in launch-plan T8). It now states the publication is corrected on the next successful materialisation.
- Tests: added an availability regression test asserting `createManualAvailability` still succeeds (and logs) when publication materialisation fails. Mocked `@repo/observability/log` in `index.test.ts`.
- Verification after fixes: availability typecheck + 136 tests green, jobs tests green, Biome clean on all six changed files, `turbo boundaries` clean. (Pre-existing unrelated `setup-env.ts` import.meta/CommonJS typecheck warning left untouched.)
