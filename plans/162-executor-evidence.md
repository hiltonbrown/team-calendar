# Plan 162 executor evidence

Status: COMPLETE for the authorised source corrections F1-F12. All required source gates and the complete protected live integration inventory pass. Deployment, payroll/provider operations and client compatibility campaigns were outside this execution.

## Candidate and ownership

- Worktree: `/home/hilton/.codex/worktrees/ics-calendar-fixes/teamcalendar`.
- Branch: `codex/ics-calendar-fixes`; source baseline: `43e844b`.
- Implementation: `4691228fbdbbb8cf57a1570e392dc9357ccde2f4`.
- Horizon regression: `ea2438e63e93b0451a81025314fbb67437f5f650`.
- Final source/test candidate: `4c603ded644eaee7df7861d731014b00d1b0b11a`.
- Final evidence commit changes only this file and `tasks/todo.md`. Runtime and tests remain byte-identical to the exact live candidate above.
- No main-branch source changes, push, merge, PR, dependency upgrades, lockfile changes or committed secrets.

The reviewer approved the durable representation/schema design, explicit calendar slot contract and limited fixture-cache cleanup plumbing before implementation. The generated additive SQL was separately reviewed before online application. The live-database instruction remained authoritative throughout; no local database, disposable database or new Neon branch was substituted.

## Findings and meaningful assertions

| Finding | Implemented behaviour and regression evidence |
| --- | --- |
| F1 | Calendar ranges and details apply the configured direct/all-team manager report boundary, including internal notes. `packages/availability/src/calendar/calendar-service.test.ts` covers settings/identity failures and foreign scope. |
| F2 | Reconciliation queues UUID feed IDs validated by the actual consumer contract. Both registered job callbacks throw valid-input service failures for retries. `packages/jobs/src/handlers/reconcile-feed-publications.test.ts` and `rebuild-feed-cache.test.ts` cover producer shape, queue boundary and cache failures. |
| F3 | Manual date/type edits preserve assigned record/publication UIDs. Manual service regressions and `packages/availability/index.integration.test.ts` use the actual create/update writer, assert Brisbane slot instants, unchanged UID and advanced material sequence. |
| F4 | Real ical-generator serialisation emits durable DTSTAMP and CLASS, PUBLIC for named output and PRIVATE for private/masked output. `packages/feeds/src/render/render-feed.test.ts` positively asserts successful unchanged body/ETag across clocks. |
| F5 | Current authoritative fingerprints select immutable feed-ID/ETag cache entries; generation fences metadata, revalidation detects missed canonical edits, and final token validation follows awaited side effects. Unit races exercise actual cache reads, failed deletion, late rendering and revocation. The live Redis case positively asserts a successful late old-body write and exact read-back, then confirms it cannot be served after privacy changes. API tests assert private HTTP revalidation and revoked-token 410 despite the old validator. |
| F6 | One serialisable transaction projects and reconciles scoped durable event versions. Ledger tests assert no-op success, compatibility upgrade, UID preservation, removal/re-entry, holidays, privacy, names, locations, retries and horizon turnover with an unchanged surviving event. Live tests cover concurrent snapshots, missed canonical materialisation, historical sequence-zero upgrades and genuinely new sequence-zero events. |
| F7 | Scoped issuance gives restored feeds a complete usable URL and serialises issue/rotate with archive. Feed-detail tests cover immediate rotation/issuance receipts and authoritative refreshed archive state. Live fixtures prove exactly one active token, old-token rejection, archive/restore/issue/resume and issue-versus-archive ordering. |
| F8 | Preview resolves active, unarchived identity from the acting user and both tenant IDs. Tests prove viewer/manager success with omitted caller identity, denial for absent/foreign/inactive identity, and disregarding spoofed optional identity in favour of server-resolved identity. Full-page/modal loader tests distinguish errors from empty success; UI offers Retry. |
| F9 | Month navigation clamps month ends/leap years and the March 2026 visible range is 42 days. Toolbar and calendar-service regressions assert these endpoints. |
| F10 | Month/mobile/scan-panel drill-down preserves validated team/location/category filters. Details use organisation timezone and display overnight dates. Explicit wall-clock slots survive form/save; Brisbane/Sydney DST, browser-timezone differences, gap rejection, earliest new repeated-hour instant and unchanged later-fold/seconds precision are tested. |
| F11 | Calendar overlap projection computes local day boundaries once and retains existing membership semantics. Calendar tests include boundary/DST fixtures. |
| F12 | `ScreenCatalogue.md` S-07 now matches the implemented calendar recovery, mobile controls and presentation. Scoped documentation diff was reviewed. |

The shared representation uses the conservative compatibility bound `last_rendered_at >= source.created_at`, preserving UID and seeding the prior sequence plus one, including sequence-zero records/holidays. This is possible prior publication evidence, not proof that each event appeared within the old scope/horizon. Once a ledger entry exists, it governs future versions. Never-rendered/new sources start at zero. No-op and unchanged horizon survivors retain UID/SEQUENCE/DTSTAMP.

## Source verification

The executor ran focused availability, feeds, feed jobs, ICS route, calendar/plans and feed component/loader/service suites while implementing. The final positive preview/cache refinements passed their focused suite and explicit strict integration-file typecheck. The reviewer independently ran the frozen candidate's full gates. Underlying commands below are established by the package scripts and log banners, not invented outer shell invocations.

| Command | Final result |
| --- | --- |
| `bun install --frozen-lockfile` | Exit 0; lockfile unchanged. |
| `bun run --cwd packages/database build` | Exit 0; required generated delegates/schema present. |
| `bun run check` | Exit 0; 1,166 files. |
| `bun run build` | Exit 0; four uncached tasks. |
| `bun run typecheck` | Exit 0; 19 tasks, generated Next route types present. |
| `bun run test` | Exit 0; 18 uncached tasks, 2,893 tests. |
| `bun run boundaries` | Exit 0; 1,081 files in 21 packages. |
| `bun run test:release-tools` | Exit 0; 33 files, 509 tests. |
| `bun run typecheck:release-tools` | Exit 0. |
| Explicit strict TypeScript check using `.cache/162-support/tsconfig.integration.json` | Exit 0; both changed integration suites included despite normal test exclusions. |
| `git diff --exit-code 4691228..4c603ded -- . ':!packages/feeds/src/publication/feed-representation.test.ts' ':!packages/feeds/src/preview/preview-service.test.ts' ':!packages/feeds/index.integration.test.ts'` | Exit 0; only the three follow-up test files differ from the implementation commit. |

Final clean unit verification used `TC_SOURCE_GATES=1`, `NODE_ENV=test`, `TURBO_FORCE=true`, `TURBO_CONCURRENCY=1` and the existing `tooling/release/deny-network.mjs` preload. Production database, KV, API-origin, Clerk, Resend and Inngest variables were removed. Release tests used the same original gate alone with the clean environment/network preload. No test timeout was raised. Build-generated unrelated Prisma whitespace was restored to the committed generated files after processes closed; necessary new model/delegate metadata remains present.

Earlier source invocations are retained as failures: production build configuration inherited into unit execution caused real-KV network attempts and an API-origin fixture mismatch; an existing deadline test and a release subprocess exceeded unchanged five-second limits under concurrent load. The corrected clean/serial original gates passed. These environment/load failures were not concealed or fixed by weakening assertions.

## Reviewed online migration

- Migration: `packages/database/prisma/migrations/20260927151200_feed_event_publications/migration.sql`.
- SHA-256: `18ffd7cc8703b8b196b62b57f385cf965741765113c46a3c75ed9a020092b002`.
- Generated with Prisma diff, never hand-authored. Additive: two Feed columns plus the scoped event ledger/indexes/foreign key; no destructive SQL.
- Applied only that reviewed pending unit under fresh durable owned authority for run `80601167-19b6-4788-a422-a8d4d2a8691e`.
- Complete chain read-back: 22 matching completed migration checksums, zero pending; final pinned Prisma diff exits 0 with no difference.
- Across migration, original Feed columns remained unchanged, existing new columns were NULL/0, and the new ledger was empty. Other existing full table hashes matched. The fixture campaign compares complete post-migration row contents, including both added columns and the ledger.
- Final integrity proof: ledger tenant scope, valid indexes and validated constraints; the existing 12 Xero integrity counts are zero and the immutable binding trigger is enabled.

Actual authorised target was independently read from SQL: project `soft-dream-28768887`, branch `br-frosty-union-a7sc6dl7`, endpoint `ep-cold-pond-a7ar2epd`. Credentials were consumed privately, omitted from this evidence and never committed.

## Protected full live campaign

Final run: `30440382-6c42-402c-b8e3-33c0d37818f8` at exact candidate `4c603ded644eaee7df7861d731014b00d1b0b11a`.

Reviewer invocation:

```sh
bun --env-file=.cache/162-support/final-run/live.env --conditions=react-server .cache/162-support/run-paused-live.ts
```

The reviewed ignored monitor launches `tooling/release/run-live-integration.ts` with the absolute manifest/evidence paths, `--preacquired` and `TURBO_CONCURRENCY=1`. It preserves the existing protected inventory/allocator/cleanup guards. No suite was skipped and no target was substituted.

Before fixtures, actual host inspection found the local Inngest 1.45.1 server with ten registered functions and its live-backed API. A fresh private catalogue proved every function targeted the reviewed API endpoint. The identity-checked helper acquired the fresh run lease, preserved original UID/cwd/parent/starttime/states for five reviewed processes, paused Inngest first, verified zero running SyncRuns/active transactions, paused API parents before children and drained again. It compare-and-set the exact owned durable manifest to the existing actual pause-window form, preserving target/candidate/owned selectors. No customer settings or worker registrations changed.

A coherent REPEATABLE READ READ ONLY baseline then captured 39 tables and 351 existing rows. The monitor checked reviewed process identities, complete subtrees and stopped states each second, durable authority/ownership periodically, and the terminal cleanup boundary. It reports no isolation failure and successful runner closure:

| Integration task | Files | Tests | Result |
| --- | --- | --- | --- |
| App | 1 | 2 | PASS |
| Availability | 3 | 22 | PASS |
| Xero | 6 | 72 | PASS |
| Feeds | 1 | 22 | PASS |
| Jobs | 6 | 84 | PASS |
| Database | 10 | 52 | PASS |
| Total | 27 | 254 | PASS, six uncached tasks |

Runner started at 2026-09-27 07:16:37 UTC and closed at 07:26:46 UTC, exit 0. Inventory PASS, cleanup PASS, fence released, phase complete. Scoped owned database/cache/shared-store fixtures have zero residue. Real Redis testing uses only dedicated protected fixture credentials and manifest-owned feed UUID key prefixes; current immutable ETag keys are purged before feed rows and foreign keys are preserved.

Independent final post-fixture read-back passed: all 39 full table hashes equal the 351-row baseline; 22 complete matching migration checksums, no pending migration; durable actual pause manifest and integrity checks verified; ownership fence released. After reviewed zero-residue/full-content closure, exactly five originally running worker identities were resumed at 07:28:18 UTC. Independent host verification confirmed original R/S states, the ten-job catalogue and API HTTP 200. No executor temporary server remains.

Private review/support receipts are retained in ignored `.cache/162-support/final-run/` and `/tmp/tc162-advisor-final-{readback,schema-diff,invariants,resume}.log`. These are operational evidence, not committed secrets. The generated Xero programme report remains NOT VERIFIED for separate provider/client/deployment charter assertions even though this runner inventory/cleanup passed.

## Previous live attempts and recovery

1. Run `80601167-19b6-4788-a422-a8d4d2a8691e`: reviewed migration PASS. Initial integration launch FAILED before tests because a relative manifest was resolved from package directories. No test ran. Independent closure proved all 39 table hashes/309 existing rows unchanged, 22 matching migrations and a released fence. The final command uses absolute paths.
2. Run `c581e083-b997-4a4f-a475-12c563a0aca5` at `ea2438e`: full inventory FAILED, 239 passed/15 failed tests, underlying Neon WebSocket ETIMEDOUT in existing jobs suites. Cleanup initially refused stale consumer evidence, preserving ownership. This is not a passing integration gate.
3. Reviewed same-run recovery refreshed actual SQL/provider evidence by exact durable-JSON/active-owner CAS after original writers closed. One exact dual-scoped interrupted owned fixture SyncRun was terminalised failed with actual completion time/error metadata; unchanged protected cleanup then passed, zero owned residue and fence released. Original failure proof was preserved.
4. That recovery's full table equality FAILED for SyncRuns: 25 new customer scheduled-history rows were externally appended, including rows after test-writer closure. The original 138 row hash matched exactly and all other 38 table hashes matched. Those customer rows were preserved. Production Inngest zero apps was insufficient global consumer proof; the actual local dev worker was subsequently identified and isolated for the final campaign. No customer deletion or restoration was attempted.

## Limits and final audit

PITR retention, restore availability and a successful restore exercise remain NOT VERIFIED. SQL timeline/WAL references are observations, not restore proof. An authenticated browser campaign could not be run because owned fixture sessions/manifests were unavailable. Component/loader/timezone tests and actual live persistence assertions passed; no customer session was used. Production deployment, browser invitations, customer payroll/provider operations and calendar-client compatibility are outside this execution and remain NOT VERIFIED.

The whole baseline whitespace comparison reports one harmless extra blank line at EOF in the Prisma-generated migration (line 34). That already-applied generated SQL is preserved byte-for-byte to retain its reviewed checksum; no unqualified whole-tree whitespace pass is claimed.

Only the permitted implementation paths and explicitly reviewed adjacent plans/time/cleanup documentation paths changed. The final documentation commit contains no runtime/test changes. No database or process mutation occurred while writing this final record.

## Files changed

```text
PRODUCT.md
ScreenCatalogue.md
apps/api/app/ical/[token]/route.test.ts
apps/api/app/ical/[token]/route.ts
apps/app/app/(authenticated)/calendar/page.tsx
apps/app/app/(authenticated)/feeds/@modal/(.)[feedId]/page.test.tsx
apps/app/app/(authenticated)/feeds/@modal/(.)[feedId]/page.tsx
apps/app/app/(authenticated)/feeds/[feedId]/page.test.tsx
apps/app/app/(authenticated)/feeds/[feedId]/page.tsx
apps/app/app/(authenticated)/feeds/_actions.test.ts
apps/app/app/(authenticated)/feeds/_actions.ts
apps/app/app/(authenticated)/plans/_actions.test.ts
apps/app/app/(authenticated)/plans/_actions.ts
apps/app/app/(authenticated)/plans/_schemas.ts
apps/app/app/(authenticated)/plans/plan-form-time.test.ts
apps/app/app/(authenticated)/plans/plan-form-time.ts
apps/app/app/(authenticated)/plans/record-form-data.test.tsx
apps/app/app/(authenticated)/plans/record-form-data.ts
apps/app/app/(authenticated)/plans/record-form.tsx
apps/app/components/calendar/calendar-create-launcher.test.tsx
apps/app/components/calendar/calendar-day-view.tsx
apps/app/components/calendar/calendar-event-chip.tsx
apps/app/components/calendar/calendar-event-popover.test.tsx
apps/app/components/calendar/calendar-event-popover.tsx
apps/app/components/calendar/calendar-local-time.test.ts
apps/app/components/calendar/calendar-local-time.ts
apps/app/components/calendar/calendar-month-view.test.tsx
apps/app/components/calendar/calendar-month-view.tsx
apps/app/components/calendar/calendar-scan-panel.tsx
apps/app/components/calendar/calendar-timeline.test.tsx
apps/app/components/calendar/calendar-timeline.tsx
apps/app/components/calendar/calendar-toolbar.test.tsx
apps/app/components/calendar/calendar-toolbar.tsx
apps/app/components/calendar/calendar-url-state.ts
apps/app/components/calendar/calendar-week-view.tsx
apps/app/components/feed/feed-detail.test.tsx
apps/app/components/feed/feed-detail.tsx
packages/availability/index.integration.test.ts
packages/availability/src/calendar/calendar-service.test.ts
packages/availability/src/calendar/calendar-service.ts
packages/availability/src/records/manual-records-service.test.ts
packages/availability/src/records/manual-records-service.ts
packages/database/generated/browser.ts
packages/database/generated/client.ts
packages/database/generated/internal/class.ts
packages/database/generated/internal/prismaNamespace.ts
packages/database/generated/internal/prismaNamespaceBrowser.ts
packages/database/generated/models.ts
packages/database/generated/models/Feed.ts
packages/database/generated/models/FeedEventPublication.ts
packages/database/prisma/migrations/20260927151200_feed_event_publications/migration.sql
packages/database/prisma/schema.prisma
packages/feeds/index.integration.test.ts
packages/feeds/src/cache/feed-cache.test.ts
packages/feeds/src/cache/feed-cache.ts
packages/feeds/src/feed-service.test.ts
packages/feeds/src/feed-service.ts
packages/feeds/src/preview/preview-service.test.ts
packages/feeds/src/preview/preview-service.ts
packages/feeds/src/projection/feed-projection.test.ts
packages/feeds/src/projection/feed-projection.ts
packages/feeds/src/publication/feed-representation.test.ts
packages/feeds/src/publication/feed-representation.ts
packages/feeds/src/publication/publication-service.test.ts
packages/feeds/src/publication/publication-service.ts
packages/feeds/src/render/render-feed.test.ts
packages/feeds/src/render/render-feed.ts
packages/feeds/src/scope/feed-scope.ts
packages/feeds/src/tokens/token-service.test.ts
packages/feeds/src/tokens/token-service.ts
packages/jobs/src/handlers/rebuild-feed-cache.test.ts
packages/jobs/src/handlers/rebuild-feed-cache.ts
packages/jobs/src/handlers/reconcile-feed-publications.test.ts
packages/jobs/src/handlers/reconcile-feed-publications.ts
plans/162-execution-design.md
plans/162-executor-evidence.md
tasks/lessons.md
tasks/todo.md
tooling/release/cleanup.test.ts
tooling/release/cleanup.ts
tooling/release/feed-cache-fixture-cleanup.test.ts
tooling/release/feed-cache-fixture-cleanup.ts
```
