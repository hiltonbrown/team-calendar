# Plan 162 execution: Correct ICS publishing and calendar behaviour

> Executor: follow the steps, verify each result, and report evidence. Work only in the managed worktree provided by the reviewer. Commit logical changes there with conventional commit messages. Do not merge, push or commit to the user's branch. The reviewer maintains plans/README.md. Send a proposed F5/F6 design before changing schema, then continue independent fixes while the reviewer assesses it.

## Status and authority

- Status: DONE for all confirmed findings F1-F12 and both final-check date-edit corrections, final source `f95c8c3`, independently verified on 27 September 2026. [Execution review](162-execution-review.md) records the scoped approval and evidence; wider go-live/provider/client campaigns remain separate.
- Final check and merge: APPROVE at `f95c8c3`, merged to main without conflicts at `142d128`. All fresh source gates pass, including 2,906 unit and 509 release tests. Exact-candidate protected live campaign `a7c995f0` passes 27 files/254 tests, with full 39-table/386-row preservation, matching migration/schema/integrity checks, zero owned residue, released ownership and restoration of the five original workers. Main post-merge lint/types/boundaries, 2,906 unit tests and 509 release tests pass with source/tests unchanged.
- Subsequent user instruction explicitly authorises the reviewer to commit and merge locally to main after final checks. This supersedes the earlier execution-only merge restriction. No push or deployment is included; the executor still works and commits only in its isolated branch.
- Planned at: `43e844b`. `git diff --exit-code 514efb5..43e844b -- apps packages tooling .github package.json bun.lock PRODUCT.md DESIGN.md .impeccable.md` exits 0: audit runtime is unchanged.
- Priority: P1 correctness/privacy, followed by P2 calendar interaction/performance and P3 catalogue.
- Effort: L. Risk: MED. Dependencies: none for source fixes. Existing go-live/160 own production/browser/client campaign proof, not these corrections.
- Live database authority: user explicitly said "refer to lessons and use the live database for all plans". Use the already authorised online Neon database through the protected live runner for all database tests. Do not provision localhost, Docker, a disposable database or a new Neon branch. Read tasks/lessons.md before implementation.
- This authorisation persists across steps. Implement missing fixtures/tooling/safeguards as necessary; do not ask the user to locate credentials again or silently substitute local evidence. Privately inspect existing local runtime configuration and relevant Vercel project environment inventories; sensitive values omitted from downloads do not prove absence.
- No customer payroll/provider operations, deployment, worker activation, browser invitations, destructive migration, push or merge are authorised by this source execution request. Only owned test fixtures may be mutated in live verification. Additive schema deployment requires a reviewed migration and current target/restore/ownership safeguards.
- Product direction options (location/type scopes, coverage measures, saved views, new client campaign) are excluded.

## Why

Calendar ranges apply broader manager access than event detail, leaking indirect-report internal notes under direct-only settings. Feed jobs send an object where a UUID is required and swallow failure Results. Manual edits change UIDs; the renderer gives unchanged events new timestamps; live contents can be paired with old publication versions. Cache invalidation is not an authoritative visibility boundary. Restored feed/token and preview journeys are incomplete. Calendar navigation, drill-down and slot creation discard important context. Correct all these within current package/domain conventions.

## Current-state excerpts and conventions

`packages/availability/src/calendar/calendar-service.ts:248`:
```ts
const managerReportIds =
  parsed.data.role === "manager" && parsed.data.actingPersonId
    ? transitiveReportIds(allPeople, parsed.data.actingPersonId)
    : new Set<string>();
```
The direct-only range nevertheless permits that whole set in all_teams at :478 and person at :509, then notesInternal at :737. Detail at :385 limits it based on managerVisibilityScope. Match fail-closed settings handling in `packages/availability/src/settings/manager-scope.ts:28`. Every read/update/delete uses both clerk_org_id and organisation_id, including unique-ID writes.

`packages/feeds/src/cache/feed-invalidation.ts:21` returns `Promise<Array<{ id: string; privacyMode: string }>>`, but `packages/jobs/src/handlers/reconcile-feed-publications.ts:131` does:
```ts
feedIds.map((feedId) => ({
  data: { clerkOrgId: context.clerkOrgId, feedId,
    organisationId: context.organisationId, reason: "publication_reconciled" },
  name: "rebuild-feed-cache" as const,
}))
```
Consumer `rebuild-feed-cache.ts:20` requires UUID string. Rebuild :105 ignores setCachedFeedBody Result, :117 claims rebuilt:true; function :43 returns failures rather than throwing retryable execution errors. Preserve service Result pattern; translate at job boundary.

`manual-records-service.ts:439` recalculates deriveAvailabilityUidKey from merged dates/type and :453 writes it. Preserve an existing assigned UID on edits, derive only on creation. The documented hash is a creation identity, never a retrospective rewrite. Publication :175 currently adopts the changed UID.

`packages/feeds/src/render/render-feed.ts:107` constructs events using allDay/description/end/id/location/sequence/start/summary/transparency, with neither stamp nor class. Use real ical-generator 11.1.1; Context7 stamp and ICalEventClass APIs are verified. The current test :9 replaces the library with a serializer without DTSTAMP.

`feed-projection.ts:221-239` emits current record dates/title/name/location but :227 uses publication sequence. Its publication select :404 only reads sequence/UID. `manual-records-service.ts:547` allows committed writes to succeed when materialisation fails. Preserve that availability tradeoff while preventing emission of new content under old versions. Feed privacy changes at feed-service :432 do not advance versions; holidays :338 always have zero sequence.

`feed-cache.ts:39` returns `feed:${input.feedId}:${input.privacyMode}`. `feed-service.ts:470` discards invalidation Result. A render can write after deletion at render-feed :236. 200/304 route responses at `apps/api/app/ical/[token]/route.ts:112,122` use max-age=3600. Token validity is already checked before KV reads: preserve that.

Archive revokes active tokens at feed-service :509, restore :555 produces paused with none, rotation at tokens/token-service :242 requires predecessor. Reuse atomic one-active-token insertion and tenant-scoped audit.
`apps/app/components/feed/feed-detail.tsx:84` initialises local subscribeUrl from props once, :101 changes only local rotation, :128 refreshes lifecycle changes. Refreshed server state must become authoritative without a delayed successful rotation receipt. Complete authorised URLs stay visible/selectable/copyable; never mask them.

Preview loaders (full page :47, modal :48) omit actingPersonId; preview-service :72 uses null, unlike getFeedDetail :683 resolving actingUserId. Errors become [] at loaders :64/65. Resolve identity in service with both IDs; errors are distinct from empty success.

Calendar toolbar :573 uses setUTCMonth without clamping; Jan31+1 => Mar3. calendar-service :854 ends month using startOfWeekMonday(addDays(monthEnd,6))+7; March2026 yields49 instead42 days. Month drill-down :102/:149 drops filters. Popover :104 and timeline :968 omit timezone. Day :103 passes a slot time, but plans/record-form-data :188 strips it and :194/:203 sets allDay:true/startTime:"". Define the slot contract explicitly; do not claim existing saved-time shift merely from its Z suffix.
Overlap :303 calls eventOverlapsDate for every event/day, :904 recalculates boundaries; precompute once with existing DST semantics.

Strict TypeScript, named exports except existing framework entrypoint conventions, no new libraries, co-located meaningful Vitest tests, Zod external contracts, Result expected errors, database access through @repo/database, feed logic in @repo/feeds. Australian English, no em dashes. DESIGN uses existing surface/font/spacing tokens and rounded controls; use shared design-system components. Do not redesign unrelated UI.

## Scope

Permitted source changes, including directly co-located unit tests:
- packages/feeds/index.ts, packages/feeds/index.integration.test.ts, packages/feeds/src/ (feed services, scope/person identity helpers, tokens, preview, projection, publication, cache, render). New representation helper/service files may live under src/publication or src/render.
- packages/availability/src/calendar/calendar-service.ts and tests; packages/availability/src/settings/manager-scope.ts and tests if a shared policy is needed; packages/availability/src/records/manual-records-service.ts and tests; packages/availability/index.integration.test.ts for relevant live regression.
- packages/jobs/src/handlers/reconcile-feed-publications.ts and tests; rebuild-feed-cache.ts and tests; packages/jobs/src/events.ts if its typed contract needs correction. No general worker/admission rewrite.
- apps/api/app/ical/[token]/route.ts and tests.
- apps/app/components/feed/feed-detail.tsx and tests; related subscribe controls only if needed by state synchronisation; apps/app/app/(authenticated)/feeds/_actions.ts and tests; both feed detail page loaders and their tests.
- apps/app/components/calendar/ and co-located tests (toolbar, day/month/week/timeline, popover, scan panel, launcher, explicit time/navigation helper); apps/app/app/(authenticated)/calendar/page.tsx and tests only for passing validated state/timezone.
- apps/app/app/(authenticated)/plans/record-form-data.ts, record-form.tsx, _schemas.ts, _actions.ts, plan-form-time.ts and co-located tests for slot prefill, server-authoritative timezone conversion and saved instant proof.
- packages/core date/time utility only if existing shared conversion has to be reused; any new core helper and co-located tests must be named in the F5/F6 or slot design sent before editing.
- ScreenCatalogue.md S-07; PRODUCT.md feed publication/schema/UID clarification strictly matching reviewed implemented contract; tasks/lessons.md only to capture the live-authority correction as required by AGENTS; tasks/todo.md for the Plan 162 checklist and factual verification review, preserving existing task history.
- packages/database/prisma/schema.prisma, one new generated migration per reviewed schema unit (never hand-edit generated migrations), generated ignored client; packages/database/src/queries/feeds.ts and tests, packages/database/queries/feeds.ts or package-root exports when required for new scoped helpers. No unrelated query refactor.
- Existing feed integration suite is preferred. If a new suite is necessary: register exact path with packages/database/src/live-test-fixture.ts and tests, tooling/release/integration-inventory.ts and tests, matching allocator/cleanup/read-back selectors. Limited safety plumbing changes to existing protected runner/cleanup/manifest tests are allowed only if explained and reviewer-approved before editing.
- Approved live-cache safety plumbing: tooling/release/cleanup.ts and cleanup.test.ts; optional extracted feed-cache-fixture-cleanup.ts and its co-located test. Enumerate feed IDs under both manifest-owned tenant scopes before deleting rows, scan/count/delete only feed:<owned UUID>:* keys, retain those IDs for post-deletion assertions and fail on Redis errors. Feed package purge helper must validate UUIDs and remove only that feed's keys; integration fixtures use their dedicated TC_TEST_KV pair without enabling unrelated provider suites.
- plans/162-execution-design.md and plans/162-executor-evidence.md in the worktree for design and sanitised results. Do not edit plans/README.md.

Out of scope: direction features, Xero adapters/credential lifecycle, other release campaigns, auth or billing redesign, dependency upgrades, customer data cleanup, token masking, secrets/env commits, AGENTS/CLAUDE/GEMINI edits. Scope expansion requires reviewer reconciliation; it is not another user approval gate.

## Commands

Run from the worktree root unless a command uses --cwd.
- Drift: git diff --stat 43e844b..HEAD -- <permitted paths>; inspect any mismatch before editing.
- Install if needed: bun install --frozen-lockfile; exit0 and unchanged lockfile. Build/generate only in worktree.
- Focused: bun run --cwd packages/availability test src/calendar/calendar-service.test.ts src/records/manual-records-service.test.ts src/settings/manager-scope.test.ts.
- Focused: bun run --cwd packages/feeds test.
- Focused: bun run --cwd packages/jobs test src/handlers/reconcile-feed-publications.test.ts src/handlers/rebuild-feed-cache.test.ts.
- Focused: bun run --cwd apps/api test 'app/ical/[token]/route.test.ts'.
- Focused: bun run --cwd apps/app test components/calendar 'app/(authenticated)/calendar' components/feed 'app/(authenticated)/feeds' 'app/(authenticated)/plans/record-form'.
- Safety tooling: bun run test:release-tools; bun run typecheck:release-tools.
- CI source gates: bun run check; bun run build; bun run typecheck; bun run test; bun run boundaries. Every required gate exit0; generated Next route types must be present for final types. Fix formatting only in permitted files.
- Integration gate: use privately loaded authorised Neon configuration and current protected manifest, then `bun --conditions=react-server tooling/release/run-live-integration.ts --manifest <private-current-manifest-path>`. It runs the required inventory and integration gate with guard authority. Do not directly bypass runner or set ALLOW_LOCAL_DATABASE_TESTS for Neon. Expected PASS, exact candidate identity, zero owned residue, unchanged unowned content, verified current migration/schema, released ownership.
- Migration generation/deployment: use Prisma migrate diff/from-empty versus intended additive model as appropriate to generate (not hand-author) the new SQL, inspect full SQL and reviewed schema delta; apply only that additive migration under existing authorised online target procedure. Never use migrate dev/db push/reset or apply pending unrelated migrations against live. If the host cannot generate without a shadow target, use supported diff generation, not a new database. Verify complete migration chain/schema/checksums read-back. Ask reviewer to resolve tooling mechanics rather than the user for repeated live approval.
- Browser source flow: use existing browser tooling and owned fixture sessions when available; use localhost dev origin for app browser, while its database remains authorised online Neon. No customer session/provider mutations. Capture real UI evidence for changed flows where available and report unavailable browser prerequisites honestly.

## Steps

1. Bootstrap isolated workspace, read lessons/intent, confirm drift, obtain source baseline. Verify git status shows no unrelated changes and focused baseline commands exit0.
2. Correct calendar authorisation and add range/detail parity tests for direct-only/all-team settings, missing identity/settings failure and foreign scope. Verify availability focused command.
3. Inspect F5/F6 alternatives and send reviewer a concise design: durable feed-specific versions, timestamp source, stable UID compatibility, no-op semantics, coherent read/mutation linearisation, cache generation/read/write fencing, horizon/membership/removal, privacy tightening, concurrency retries, additive schema/fixture cleanup. Include exact allowed path/migration changes and expected evidence. Save worktree plans/162-execution-design.md. Do not implement schema until reviewer approves; continue independent steps4-8.
4. Fix job payload and Result retry translation, manual UID preservation, HTTP private revalidation, and deterministic CLASS/stamp tests with the real serializer. A temporary stamp implementation must not become a conflicting second contract: integrate reviewed step3. Verify jobs/feeds/API focused suites.
5. Implement existing-feed token issuance, authorisation/audit/concurrency constraints, restored-feed action/UI, authoritative refreshed subscribe URL, scoped viewer preview identity and error receipt. Verify full page/modal/component/service tests, old-token410 with matching validator, archive/restore/issue/resume on owned fixtures.
6. Correct month overflow/range endpoints, keep validated filter state through drill-down, pass organisation timezone to details, show overnight dates, implement explicit wall-clock slot prefill preserving date-only creation and correct saved instant. Test Brisbane/Sydney DST and browser-timezone difference, month ends/leap years, team/location/category drill-down. Verify app/calendar/plans suites.
7. Precompute day boundaries and demonstrate unchanged event membership including boundary/DST fixtures. Reconcile catalogue against implemented behaviour. Verify calendar tests and scoped documentation diff.
8. After reviewer design approval, implement coherent feed-event versions and cache safety. Keep cache transport best-effort for valid current content while failing safely if current authoritative representation cannot be established. Include concurrent no-op/version updates, materialisation failure/recovery, feed/record privacy, names/locations, holidays, archive/withdrawal, horizon rolling, late render and failed deletion tests. Every emitted event must have stable UID and durable material-change SEQUENCE/DTSTAMP; unchanged projection byte/ETag stable across clocks. Shared generation/schema unit only once. Verify feeds/jobs/availability tests and migration inspection.
9. Extend database-backed regressions using authorised owned fixtures, preserve inventory/allocator/cleanup. Freeze logical source commits in worktree. Run full source gates and exact-source live regression through protected runner; verify current migration read-back, unowned checksums/content and zero fixture residue. A previous candidate's run is not this candidate's evidence.
10. Audit all F1-F12 against actual assertions, stop temporary servers, save sanitised execution evidence with commands/outcomes/candidate/migration/ownership/cleanup and limitations. Commit logical worktree changes. Return exact report format.

## Done criteria

- All F1-F12 have meaningful regression/diff evidence; no confirmed defect silently deferred.
- All required CI gates and protected live integration inventory exit0 at exact candidate; source failures corrected, environment limitations explicitly NOT VERIFIED and independently useful work continued.
- Tests use the real serialiser for ICS contracts and actual producer shape/consumer validation for jobs.
- Live database verifies scope isolation, UID/edit versions, privacy/cache concurrency, token issuance/rotation/restore and cleanup. No localhost or disposable database substitution.
- Reviewed additive migration if needed, current deployed schema/checksum proof and zero unowned data mutation; no destructive SQL.
- Stable UID on manual date/type edit; increased version for material per-feed output changes; unchanged UID/sequence/stamp/body/ETag on no-op.
- Old token returns410 after revoke/rotation even with matching If-None-Match; fresh HTTP reuse requires validation.
- Restored feed obtains new complete URL; stale URL disappears on refreshed archive/revocation; linked viewer/manager preview correct or shows an actual error.
- Calendar range/detail authorisation agree, month navigation/range tests pass, drill-down scope stays the same, selected slot time and explicit timezone survive form/save.
- Scope-clean diff, no secrets/lockfile drift, no main commits/push/merge; sanitised evidence committed in worktree, temporary processes stopped.

## STOP and continuation rules

Report to reviewer immediately if source drift invalidates an assumption, design needs an unlisted path, or two reasonable corrections cannot fix a verification. Continue independent authorised steps while reviewer reconciles. Never bypass a live guard, overwrite another run's lease, fabricate cleanup/restore/provider evidence or change the target to make a gate green. Missing executable fixture/manifest tooling is implementation work within reviewed safety scope, not revocation of settled live authority. If an external condition genuinely prevents a gate, name exact failed command/condition and mark NOT VERIFIED; do not mark whole execution complete or repeatedly ask the same permission.

## Maintenance

Review UID preservation across every writer, privacy/version/cache coupling, horizon rollover and real serializer behaviour together. New feed predicates affect both publication and cache fingerprints. New integration tables/suites must extend owned cleanup before live execution. Future payroll sync/import fixes remain Plan159; deployed/provider/client proof remains go-live/160.

## Design review, 27 September 2026

The advisor approves the proposed F5/F6 architecture for implementation: a scoped FeedEventPublication ledger unique on feed/source, persistent UID/content hash/SEQUENCE/publication timestamp/presence, and Feed representation generation/hash. Projection and ledger reconciliation share one serialisable transaction and transaction-scoped query client. Removal and re-entry retain identity and advance versions; unchanged events retain their versions as the horizon moves. Migrated existing events preserve UID and seed the existing sequence plus one, documenting the initial representation upgrade. New events start at zero.

Cache selection follows an authoritative snapshot and uses immutable representation identity. No mutable privacy-only cache key can select a previous generation. Token/feed state is checked before the response, and rendered metadata writes are fenced by generation. Generation checks alone do not detect canonical changes that have not yet reconciled: any revalidation claimed to establish current visibility must rebuild the authoritative snapshot, not merely read Feed.representation_generation. Bounded retries must return a safe Result on exhaustion, never stale contents.

All source data reads, including scope, person, location, holiday and publication reads, use the same transaction client and both tenant identifiers. The feed name and all serialised event fields, including CLASS, are part of the representation hash. Cache rebuild and subscriber render use the same durable representation service. Extend protected cleanup with the ledger before live execution; the added table must also be covered by outside-owned content verification. Additive migration generation is approved; deployment awaits inspection of exact SQL and fresh live identity/ownership evidence.

The slot design and named plan-form-time.ts helper are approved: explicit date/time without a Z suffix, organisation timezone resolved on the server, DST gap rejection, deterministic earliest instant for a repeated wall-clock time, and backwards-compatible date-only all-day semantics. Include edit-form conversion in the same contract so previously saved timed records do not change when saved without edits.

The live-cache cleanup design is approved. Validate actual Redis SCAN envelopes, including numeric-string cursors, rather than trusting a TypeScript generic. Suite teardown purges owned feed keys before deleting feed rows, and protected interrupted-run cleanup follows the same order. Assert foreign keys remain untouched. Real cache tests must fail explicitly if the dedicated fixture pair is absent; an optional-cache no-op cannot prove live caching.

## Original isolated completion review, 27 September 2026

- [x] All F1-F12 implemented in the managed worktree and full diff reviewed.
- [x] Full source gates independently pass at `4c603ded`, including 2,893 unit tests and 509 release tests.
- [x] All 27 files/254 tests pass through the authorised protected live runner.
- [x] Reviewed additive migration applied, 22 matching checksums and schema equality independently verified.
- [x] All 39 table content hashes/351 pre-existing rows preserved, owned fixtures cleaned and ownership released.
- [x] Actual local worker pause held through closure; all five original identities restored and endpoints verified.
- [x] Sanitised evidence and completed tasks committed at `2228223`, with runtime/tests equal to the verified candidate and clean worktree.
- [x] Original advisor verdict APPROVE; no merge, push or deployment during that initial execution. Historical failures and unverified browser/provider/client/PITR evidence remain explicit in the execution review.

## Final-check and authorised merge completion, 27 September 2026

- [x] Both cross-fold timed-edit and inclusive all-day edit defects fixed with meaningful positive and no-write regressions.
- [x] Final source `f95c8c3` independently passes full gates, 2,906 unit tests and 509 release tests.
- [x] Fresh exact-source live run `a7c995f0` passes 27 files/254 tests, full 39-table/386-row preservation, schema/integrity/cleanup and original worker restoration.
- [x] Final documentation head `ae501c8` contains only evidence/tasks and preserves tested source byte-for-byte.
- [x] User-authorised main merge `142d128` completes without conflicts; tested-source equality passes.
- [x] Main post-merge lint, both types, boundaries, 2,906 unit tests and 509 release tests pass; generated formatting-only artefacts restored and final records committed.
- [x] No push or deployment; actual browser/provider/client/PITR proof remains outside this correction slice.
