# Review 162: ICS publishing and the team calendar

- Reviewed at: `514efb5`, 27 September 2026.
- Final source drift check: HEAD advanced concurrently to `573d804` through plan-only changes. `git diff --exit-code 514efb5..573d804 -- apps packages tooling .github package.json bun.lock PRODUCT.md DESIGN.md .impeccable.md` exits 0. Reviewed runtime and test inputs are unchanged; existing Plan 160 changes were committed by another workflow, not this review.
- Status: DONE for confirmed corrections F1-F12 and both final-check date-edit fixes, independently verified at final source `f95c8c3` and merged to main at `142d128`. The user required the existing live database for all plans. [Execution plan](162-execution-plan.md) records the contract; [execution review](162-execution-review.md) records 2,906 unit tests, 509 release tests and 254 protected live tests, full content/schema preservation, cleanup, worker restoration and passing post-merge checks. Product direction options remain unselected.
- Method: improve skill, standard depth, focused on feeds and calendar functionality.
- Original audit source changes: none. Subsequent corrections are implemented in the isolated `codex/ics-calendar-fixes` worktree. This focused review does not establish production sign-off.
- Existing uncommitted Plan 160 and index changes were preserved.

The next investment should make the existing calendar and feed journey reliable. The core exists, including signed subscription URLs, privacy projection, scope resolution, publication rows, token concurrency controls, cache handling and month/week/day surfaces. The important gaps are inconsistent authorisation, mismatched producer/consumer contracts and publication metadata that can disagree with the events actually emitted.

## Vetted priorities

Effort includes regression tests: S = hours, M = approximately one day, L = several days. Risk describes the proposed correction, not the seriousness of the defect. Confidence is HIGH unless stated otherwise. These are focused findings, not an exhaustive catalogue of the monorepo.

| ID | Finding | Category | Impact | Effort | Fix risk | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| F1 | Enforce the configured manager report boundary in calendar ranges | Security | Direct-only managers can receive indirect-report records and internal notes | S | MED | `packages/availability/src/calendar/calendar-service.ts:248`, `:478`, `:509`, `:737` |
| F2 | Repair publication-to-cache job contracts and failure handling | Correctness/tests | Reconciliation queues invalid rebuild payloads; failed cache writes can report success without retries | S-M | LOW | `packages/jobs/src/handlers/reconcile-feed-publications.ts:131`, `packages/jobs/src/handlers/rebuild-feed-cache.ts:20`, `:43`, `:105` |
| F3 | Preserve manual event UIDs across edits | Correctness | Changing dates/type changes an existing subscribed event's identity | S | LOW | `packages/availability/src/records/manual-records-service.ts:439`, `:453`, `packages/feeds/src/publication/publication-service.ts:175` |
| F4 | Render stable publication timestamps and explicit CLASS | Correctness/tests | Unchanged events produce different bodies and ETags on rebuild; documented classification is omitted | S | LOW | `packages/feeds/src/render/render-feed.ts:107`, `:121`, `PRODUCT.md:633`, `:637` |
| F5 | Fence stale cache generations and require HTTP revalidation | Security/architecture | Old renders or failed deletion can preserve details after record privacy or scope changes; fresh HTTP responses can be reused after revocation | L | MED | `packages/feeds/src/cache/feed-cache.ts:39`, `packages/feeds/src/feed-service.ts:470`, `packages/feeds/src/render/render-feed.ts:236`, `apps/api/app/ical/[token]/route.ts:112`, `:122` |
| F6 | Version one coherent published representation | Correctness/architecture | Current dates/summary can be emitted with old SEQUENCE; feed privacy changes and holiday edits are not consistently versioned | L | MED | `packages/feeds/src/projection/feed-projection.ts:221`, `:227`, `:233`, `:338`, `packages/feeds/src/feed-service.ts:432` |
| F7 | Complete restored-feed token issuance and keep displayed URLs authoritative | Correctness/UX | Restored feeds cannot get a usable token through the UI; refreshed archived feeds can continue displaying the revoked URL | M | MED | `packages/feeds/src/feed-service.ts:509`, `:555`, `packages/feeds/src/tokens/token-service.ts:242`, `apps/app/components/feed/feed-detail.tsx:84`, `:128` |
| F8 | Resolve viewer identity for previews and show preview errors | Correctness/UX | Authorised viewer/manager previews appear empty despite a working feed | S | LOW | `packages/feeds/src/preview/preview-service.ts:72`, `apps/app/app/(authenticated)/feeds/[feedId]/page.tsx:47`, `:64` |
| F9 | Correct month navigation and visible range endpoints | Correctness/UX | Month controls skip months or remain in the current month; ranges can contain seven weeks | S | LOW | `apps/app/components/calendar/calendar-toolbar.tsx:573`, `packages/availability/src/calendar/calendar-service.ts:854` |
| F10 | Preserve drill-down filters and explicit date/time context | Correctness/UX | Expanded day views change scope; event details use browser time; selected creation slots lose their hour | M | MED | `apps/app/components/calendar/calendar-month-view.tsx:102`, `apps/app/components/calendar/calendar-event-popover.tsx:104`, `apps/app/app/(authenticated)/plans/record-form-data.ts:188` |
| F11 | Precompute local day boundaries for overlap projection | Performance | Day/event loops repeatedly construct timezone formatters for the same boundaries | S | LOW | `packages/availability/src/calendar/calendar-service.ts:303`, `:904`, `:935`, `:962` |
| F12 | Reconcile the calendar screen catalogue | Docs | Catalogue reports absent recovery/mobile controls that exist and a surface toggle that is no longer rendered | S | LOW | `ScreenCatalogue.md:373`, `:379`, `:384`, `apps/app/app/(authenticated)/calendar/page.tsx:175` |

## Findings and acceptance targets

### F1: Calendar authorisation

Range queries always calculate transitive report IDs. `my_team` checks the visibility setting, but `all_teams` and explicit person scopes use that transitive set unconditionally. Event projection then treats an indirect report as a managed person and returns `notesInternal`. Event detail instead constructs a direct-only set under `direct_reports_only` at `calendar-service.ts:385`.

Use one policy-derived authorised report set for range inclusion, detail authorisation and sensitive-field projection. Existing `packages/availability/src/settings/manager-scope.ts:28` provides a relevant fail-closed exemplar. Preserve the separately documented `all_team_leave` capability. Test direct/indirect chains, explicit person/all-team/team scopes, missing identity, failed settings reads, archived people and both tenant boundaries. Do not treat a denied detail endpoint as proof that the range is safe.

### F2: Feed jobs

`feedIdsForPeople` returns `{ id, privacyMode }[]` at `packages/feeds/src/cache/feed-invalidation.ts:21`. Reconciliation sends each entire object as `data.feedId`, while the rebuild schema requires a UUID string. The reconciliation test mocks the old `string[]` shape at `packages/jobs/src/handlers/reconcile-feed-publications.test.ts:5` and `:67`.

Separately, rebuild ignores the Results returned by invalidation/cache writes and reports `rebuilt: true`. Render failure returns an OK Result with `rebuilt: false`. Returning error Results from the Inngest function does not throw a retryable execution failure.

Use the actual returned ID, type fixtures against the producer contract and test captured dispatch data through the real consumer validator. Distinguish intentionally disabled caching from configured cache failure. Convert retryable failures to thrown errors at the job boundary while preserving service Results. Test projection failure, KV read/write/deletion failure, a valid skipped inactive feed and a successful write. Honour existing consumer admission controls and avoid restructuring the wider Xero job runner.

### F3-F4: Event identity and deterministic serialisation

The manual update path rehashes dates/type and overwrites `derived_uid_key`. Materialisation then replaces the published UID. The formula in `PRODUCT.md:524` includes these fields, but the update rule at `:546` explicitly requires the same UID on updates. Treat the deterministic formula as creation-time identity and preserve each existing assigned UID; do not rewrite historical UIDs or use remote IDs as sole identity.

Rendering supplies no `stamp` and no classification. The installed `ical-generator` 11.1.1 implementation defaults its stamp to `new Date()`. A synthetic real-library probe rendered identical input 1.1 seconds apart: `sameBody=false`, `sameETag=false`, `hasClass=false`. The production renderer makes the same omission. This proves timestamp churn for unchanged projected events, not that no legitimate feed change can occur across a date horizon boundary.

Project a persisted representation timestamp and pass it explicitly to the serializer. Define CLASS from effective publication privacy. The current renderer unit test substitutes a small serializer omitting timestamps and date contracts at `render-feed.test.ts:9`; add real-library tests while retaining focused failure mocks. Assert exact parsed UID, SEQUENCE, DTSTAMP, CLASS, all-day exclusive ends, timed UTC instants, escaping/folding and equality across different wall clocks for unchanged input. Keep no-op edits byte-stable.

### F5: Cache correctness and revocation

Bodies use `feed:<id>:<privacyMode>` rather than an authoritative revision. Feed scope updates discard the invalidation Result. Record materialisation explicitly treats invalidation as best effort at `publication-service.ts:81`. An old render can write its body after a successful deletion, repopulating the same key for 3,600 seconds. Separate keys for named/masked/private feed modes do not protect a record becoming private within the same named feed or an unchanged-mode scope narrowing.

The problem is using deletion/TTL as the correctness boundary for visibility changes, not permitting an otherwise valid response when a cache write fails. Advance an authoritative scoped generation with relevant committed changes, use it in cache selection/publication, and fence late render/rebuild completion. Determine the simplest durable representation with the F6 design before choosing a migration. Test failed deletion and controlled interleavings: render begins, privacy/scope changes, old render finishes, subsequent read excludes old details. Reads must never select an unsafe old generation simply because repair is pending.

Both 200 and 304 currently return `max-age=3600, must-revalidate`. A fresh compliant cache can reuse content without reaching the endpoint after revocation; `must-revalidate` applies after freshness expires. Require private HTTP revalidation on reuse and preserve conditional ETags/KV acceleration. Test old-token requests before and after rotation/revocation, including matching validators. Changing cache headers cannot remove events already downloaded into an external calendar, nor control its polling schedule.

### F6: Coherent publication versions

`feed-projection.ts:404` selects only publication UID/SEQUENCE while the emitted dates, all-day flag, summary/name/location come from live canonical data. Manual edits persist before best-effort materialisation, which logs failure and still returns success at `manual-records-service.ts:547`. A later cache miss can consequently publish new contents under an old sequence.

Feed-level privacy changes alter SUMMARY/LOCATION without updating publication versions. Public holidays use a constant SEQUENCE of zero even though holiday import can update names at `packages/availability/src/holidays/holiday-service.ts:173`.

First specify the durable relationship between a canonical publication and each effective feed representation. The existing one-publication-per-record model cannot by itself express every feed-specific material change. Compare a coherent persisted snapshot plus feed revision with an explicitly monotonic feed-event representation ledger. Choose one contract with deterministic no-op behaviour, stable UIDs, durable repair and privacy tightening that never serves superseded details. Do not patch this by taking current time as SEQUENCE or globally rewriting UIDs.

Acceptance should include record edit plus materialisation failure, eventual repair, concurrent equivalent materialisation, feed privacy transitions, location/name changes, holiday edits, withdrawal and no-op/internal-note-only edits. Parse real ICS before and after. Feed contents, timestamps and versions must describe the same committed representation. This architecture slice needs a reviewed design before an executor introduces schema changes.

### F7-F8: Complete the subscription journey

Archive revokes active tokens, restore returns to paused without issuing one, and rotation requires an active predecessor. The UI tells users to create a token (`feed-detail.tsx:427`) but only offers rotation. Provide an admin/owner initial-token operation for an existing non-archived feed with no active token, preserving the database one-active-token constraint and audit trail. Test archive, restore, issue, resume and rejection of every old URL. Do not resurrect revoked tokens.

`FeedDetail` copies the server subscribe URL into state only on initial render. Local rotation updates it, but archive/revocation/new server props do not. Make refreshed server state authoritative while preserving the immediate successful rotation receipt. Rerender tests must verify displayed and copied values become null or the replacement URL. Authorised URLs remain complete, selectable and copyable; masking them is expressly forbidden.

Both feed-detail loaders pass a user ID without a person ID. Unlike `getFeedDetail`, `previewFeed` does not resolve the person and therefore fails non-admin authorisation. Both loaders turn failures into empty arrays. Resolve identity under both tenant scopes and show a distinct error/retry state for failure. Cover a linked viewer and manager through full-page and modal loaders; preserve denial outside feed scope and forbid non-admin privacy overrides.

### F9-F10: Calendar interactions

Native month mutation retains day 31. A read-only probe of the exact operations produced 31 January 2026 plus one month = 3 March, and 31 March minus one month = 3 March. Clamp the day or normalise to the target month anchor. Test both directions, leap years and all 29-31-day boundaries.

The month endpoint adds six days before finding the ending week. It adds a week for month ends Tuesday through Sunday. The current March 2026 calculation returns 49 visible days instead of 42; September returns 42 instead of 35. Derive the exclusive Monday after the week containing the final day, with explicit assertions for first/last dates and day counts.

Month links at `calendar-month-view.tsx:102` and `:149` discard current scope/filters. Preserve validated calendar query state when changing only view/anchor. A team-filtered count and its day expansion must select the same people and categories.

Popover and timeline detail formatters omit `timeZone` at `calendar-event-popover.tsx:104` and `calendar-timeline.tsx:968`, while day placement uses the organisation timezone. Pass that timezone explicitly and show both dates for overnight timed spans. Preserve date-only all-day semantics independently of the browser timezone.

Day slots say “Add at 09:00”, but `record-form-data.ts:188` strips time and initialises all-day mode with blank `startTime` at `:194` and `:203`. Define a date/time/timezone prefill contract, then verify launcher through form values and saved instant. A slot's current Z suffix does not prove a saved-time shift, since the downstream consumer currently discards its time altogether.

### F11-F12: Bounded follow-ups

Precompute each local day's start/end once instead of inside every event overlap check. Preserve the existing comparison and DST semantics. Verify equivalent event/day membership with boundary and daylight-saving fixtures; avoid introducing a new date library for this isolated change. No deployed performance claim is made by this review.

Reconcile calendar catalogue S-07 with the shipped route, loading/error states, toolbar Add action and week timeline. Do not implement controls merely because the stale catalogue calls them absent. Documentation correction follows the actual interaction fixes.

## Recommended execution ordering

The original recommended order below informed the selected F1-F12 execution contract. All confirmed corrections are now implemented and verified:

1. Calendar authorisation (F1), independent and first priority.
2. Feed delivery jobs (F2), independent and a prerequisite for trustworthy repair/rebuild evidence.
3. ICS identity and publication contract (F3, F4, F6). Land small UID/serialiser regressions independently, then settle coherent representation versioning.
4. Cache and revocation (F5). The HTTP header correction can land independently; durable generation design depends on the F6 contract. Implement shared schema changes once.
5. Feed lifecycle (F7), independent of the publication redesign and reusable for the release journey.

Then address viewer previews (F8), calendar interactions (F9-F10), bounded projection performance (F11) and catalogue drift (F12). F8/F9 are small enough to interleave when isolated execution capacity is available. New regression tests belong with their fixes; there is no separate generic “add tests” project.

Every selected execution plan must be self-contained, stamp its actual authoring commit, specify exact allowed paths and inline current snippets, preserve Result/strict TypeScript/package boundaries/dual tenant scope, and include the four CI gates: `bun run check`, `bun run typecheck`, `bun run test`, `bun run test:integration`. Integration execution must use the repository's protected fixture ownership controls. A successful source review or unit run is not live-database/client verification.

## Direction options after correctness

These are product choices, separately ranked from defects. Estimates are coarse and should start as bounded design/spike plans.

1. **Complete calendar-client compatibility proof (M, high grounding).** `PRODUCT.md:116` promises secure feeds for Outlook, Google Calendar and Apple Calendar. `plans/go-live.md:453-454` already owns feed lifecycle and real client update evidence; `tooling/release/e2e/feeds-and-recovery.spec.ts:12` currently checks URL copying and `:96` checks a calendar record, while the Xero campaign has its own publication oracle. Extend the existing evidence matrix after the fixes to parse, subscribe, edit, withdraw, rotate and observe provider refresh. This makes the existing promise credible without claiming instantaneous external refresh; retain the existing release owner rather than add a competing campaign.
2. **Specify location/event-type feed filters (L, high grounding).** `PRODUCT.md:152` and `:615` name these filters, but the schema enum at `packages/database/prisma/schema.prisma:194` and creation choices at `feed-create-form.tsx:155` support org/person/team/self/manager-team only. Define how person inclusion, event-type predicates, combined scopes, public holidays and privacy interact before migrating. Valuable for multiple sites and separate leave/WFH subscriptions, but broadens invalidation and visibility semantics, so follow publication correctness.
3. **Define useful availability/coverage summaries (M-L, high grounding).** Product intent distinguishes being away from working remotely and targets a manager scan under 30 seconds (`PRODUCT.md:31`, `:40`). Existing events expose contactability/type (`calendar-service.ts:729`) while the weekly summary counts people with events (`calendar-timeline.tsx:906`). Prototype separate unavailable/remote/contactable groups with agreed partial-day/holiday rules and denominators. Avoid implying staffing sufficiency or calculating payroll capacity.
4. **Reduce repeat-visit filter work (M, medium grounding).** Calendar filters already live in URL state (`calendar-toolbar.tsx:59`, `:146`), making bookmarks a cheap starting point. Compare explicit bookmarked links against an organisation-specific default or named view. Any stored preference must revalidate current role and scope on every use. Fix F10 first so navigating a saved selection is stable; persistence is optional, not a launch prerequisite.

## Verification performed

All commands below exited 0. These are source-only focused tests, not full CI or external evidence.

| Command from repository root | Result |
| --- | --- |
| `bun run --cwd packages/feeds test` | 9 files, 126 tests passed |
| `bun run --cwd apps/app test components/calendar 'app/(authenticated)/calendar' components/feed 'app/(authenticated)/feeds'` | 20 files, 71 tests passed |
| `bun run --cwd packages/availability test src/calendar/calendar-service.test.ts` | 1 file, 11 tests passed |
| `bun run --cwd packages/jobs test src/handlers/reconcile-feed-publications.test.ts src/handlers/rebuild-feed-cache.test.ts` | 2 files, 14 tests passed |
| `bun run --cwd apps/api test 'app/ical/[token]/route.test.ts'` | 1 file, 14 tests passed |

Total: 236 tests across 33 files. Additional agent runs overlapped these files and are not added to the total. Synthetic in-memory probes independently reproduced real serializer timestamp churn, native month overflow and the current month-end formula. Context7 documentation for `/sebbo2002/ical-generator` confirmed explicit stamp and classification APIs; installed 11.1.1 source was inspected to verify actual defaults.

Not executed: full lint/typecheck/build/all-tests gates, integration tests, real Redis failure/race scenarios, browser interaction/accessibility checks, authorised production queries, Xero provider calls or external calendar subscriptions. Database integration test source was read for concurrency and tenancy coverage. No production state or secrets were read or changed.

Coverage boundaries: focused correctness/security/tests review of feeds, associated publication/rebuild handlers, token/subscription surfaces, calendar service/components and direct manual/holiday callers. No full dependency vulnerability audit, visual design audit, broader tenancy audit, billing review, NZ/UK provider review or repository-wide performance benchmark. Performance/doc suggestions are scoped evidence, not comprehensive category audits.

## Existing ownership and considered/rejected leads

- Plan 159 owns import completeness, person reconciliation, onboarding truth and calendar freshness. This review does not create a second refresh/import plan.
- Plan 160 and go-live own campaign orchestration, deployed evidence, feed privacy/UID/SEQUENCE and real client sign-off. Their generic acceptance requirements do not mean these new concrete defects are already corrected. Link selected implementation plans into those verification journeys.
- Plan 161 owns Xero credential/binding/lifecycle controls. Preserve its admission, generation and fixture ownership contracts when changing feed jobs.
- Complete authorised subscribe URLs, server reconstruction of signed tokens and public bearer-token lookup are intentional. Subsequent canonical queries use both tenant IDs. No URL masking or token redesign is recommended.
- An old KV body alone does not bypass a revoked token on a new origin request: token/feed state is checked before the cache read. F5 concerns stale visibility generations and HTTP reuse that never reaches that check.
- Best-effort projection after a committed manual write is an intentional availability tradeoff. F6 concerns emitting new content with old versions, not converting a successful write into a fabricated failure or removing that tradeoff blindly.
- The day slot Z suffix was not promoted as a saved-time shift; its consumer drops time. F10 records the supported hour-loss defect.
- Missing mobile Add, missing route recovery and missing provenance icons were rejected as already implemented. Stale catalogue claims are F12.
- Universal feed-style masking for every in-app relationship is not a documented rule. F1 concerns an actual configured role boundary.
- General cache replacement, a new calendar library, additional payroll connectors, AI features and a generic test-baseline project are not justified by this audit.

## Review checklist

- [x] Recon and product/design intent read.
- [x] Parallel read-only review completed and every promoted source citation independently checked.
- [x] Existing plans inspected for ownership overlap.
- [x] Focused tests and synthetic probes completed.
- [x] Findings ranked and direction options separated.
- [x] Scope and verification limits recorded.
- [x] User selects execution-plan scope: all confirmed fixes F1-F12.
- [x] Self-contained execution contract authored and indexed.
- [x] Executor source, live-database verification and independent final review complete at `f95c8c3`: 2,906 unit tests, 509 release tests, 254 protected live tests; migration/content/cleanup and original worker restoration verified.
