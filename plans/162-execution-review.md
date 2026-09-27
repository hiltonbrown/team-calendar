# Plan 162 independent execution review

Verdict: APPROVE, final source `f95c8c3`, full source and protected live gates PASS.

Final source candidate: `f95c8c3710bdd7680a44233e70974bd80fe81524`.
Both final-check date-edit defects are corrected. Fresh verification passes
2,906 unit tests, 509 release tests and 254 protected live tests. Final campaign
`a7c995f0-27bc-4535-b758-51e2c60c0ac7` preserved all 39 table contents and 386
existing rows, matched 22 completed migration checksums with none pending,
passed schema/integrity checks, removed owned fixtures and released ownership.
The five original workers were restored and independently checked. The user's
subsequent instruction authorises the local main commit and merge; post-merge
identity and checks will be recorded below.

Original approved source candidate: `4c603ded644eaee7df7861d731014b00d1b0b11a`.
Implementation commit: `4691228fbdbbb8cf57a1570e392dc9357ccde2f4`.
Original documentation commit: `2228223f559fc59f8c58faa26be0752c5ccc9d18`.
Its complete diff contained only sanitised evidence and the completed task checklist.
Independent equality to the verified source candidate passes outside those two
documentation paths passed. At that original approval, the worktree was clean
and the user's checkout remained at `43e844b` with only advisor plan changes.

Executor worktree: `/home/hilton/.codex/worktrees/ics-calendar-fixes/teamcalendar`,
branch `codex/ics-calendar-fixes`, baseline `43e844b`.
The advisor reviewed the full diff, its scope and meaningful regression assertions.
During the original execution the advisor changed only plans in the user's checkout; the executor implemented
and committed in the isolated worktree. No formal revision verdict was required.
All confirmed findings F1-F12 are included; the four direction options are excluded.

## Implemented behaviour and evidence

| Finding | Reviewed correction and regression evidence |
| --- | --- |
| F1 | Calendar range and detail share the configured direct/all-team manager boundary. Missing settings or identity fail closed; scoped calendar tests cover foreign data and internal notes. |
| F2 | Reconciliation emits UUID feed IDs accepted by the actual consumer schema. Cache write/service failures become retryable job errors. Registered-handler assertions exercise failure propagation. |
| F3 | Editing manual dates/type preserves the assigned UID through canonical publication. Availability unit and live integration assertions cover edits. |
| F4 | The real ical-generator serializer emits durable DTSTAMP, SEQUENCE and explicit PUBLIC/PRIVATE CLASS. No-op bodies and ETags remain stable across clocks. |
| F5 | Immutable feed-ID/ETag cache keys, authoritative re-projection, generation-fenced metadata and final token validation prevent selection of obsolete representations. HTTP responses require private revalidation. Late writes genuinely succeed into old keys while the current response retains tightened privacy; revocation remains 410 with a matching validator. |
| F6 | A dual-scoped feed-event ledger and serialisable coherent projection retain UID/version/stamp across no-ops, removals, re-entry and horizon shifts. Material event/feed privacy, person/location/holiday and membership changes advance the appropriate representation. Bounded concurrency failures return safe Results. |
| F7 | Restored feeds can issue a new complete subscribe URL. Issuance/rotation serialise against archive with one active token, role checks and audit. UI keeps the immediate successful receipt and refreshed server state authoritative. |
| F8 | Preview resolves an active person from actingUserId under both tenant scopes. Viewer/manager tests exercise omitted and spoofed caller person IDs; full-page/modal failures have a distinct error and retry state. |
| F9 | Month navigation clamps month-end dates and handles leap years. Visible range endpoints include the correct final week. |
| F10 | Drill-down retains validated filters. Details use the organisation timezone and show overnight dates. Selected wall-clock slots survive form loading and server conversion; DST gaps reject, new repeated times choose the earliest instant, and unchanged later-fold/second-precision edits preserve their saved instant. |
| F11 | Calendar overlap projection computes local day boundaries once per day. Boundary and DST assertions preserve event membership. |
| F12 | ScreenCatalogue S-07 matches the existing timeline, recovery and mobile creation controls. |

These assertions are source/service/component and owned database evidence.
They do not establish real Outlook, Google or Apple subscription behaviour or
an authenticated browser campaign.

## Original approved source gates

These original gates were independently run at `4c603ded`, with uncached
Turbo execution and generated Next types present where required.

| Command | Actual result |
| --- | --- |
| `bun run build` | PASS, four uncached tasks |
| `bun run check` | PASS, 1,166 files, no fixes applied |
| `bun run typecheck` | PASS, 19 uncached tasks |
| `bun run boundaries` | PASS, 1,081 files in 21 packages |
| `bun run test` | PASS, 18 uncached tasks, 2,893 tests |
| `bun run test:release-tools` | PASS, 33 files, 509 tests |
| `bun run typecheck:release-tools` | PASS |
| `node_modules/.bin/tsc -p .cache/162-support/tsconfig.integration.json --noEmit --listFiles` | PASS, compiler inventory includes both changed availability/feed integration suites |

The successful final unit run used a clean source-test environment,
`NODE_ENV=test`, `TC_SOURCE_GATES=1`, `TURBO_FORCE=true`,
`TURBO_CONCURRENCY=1` and the deny-network preload. Production database, KV
and API-origin settings were removed. The inert source-build URL was never an
integration target. Successful release tests used the original gate alone
with source-test network isolation.

The first combined source invocation inherited production KV/API-origin
settings into units and failed. A corrected parallel unit run hit an existing
deadline assertion under load; an existing release subprocess test also
exceeded its five-second timeout during concurrent execution. The unchanged
full gates passed on serial/standalone retries. No source or timeout was changed
to obtain those passes. Earlier 2,891-test results belong to earlier candidates.

Private final logs: `/tmp/tc162-advisor-final-source.log`,
`/tmp/tc162-advisor-final-unit-serial.log`,
`/tmp/tc162-advisor-final-release-tests-retry.log`,
`/tmp/tc162-advisor-final-release-types.log` and
`/tmp/tc162-advisor-final-integration-types.log`.

Generated Prisma metadata changes only Feed and adds FeedEventPublication;
unrelated models and enums are unchanged. Its embedded schema matches the
reviewed source. Regenerated formatting-only outputs were restored after
verification. The final two source commits strengthen tests only; runtime
equality to the implementation commit was independently confirmed.

## Migration and authorised live target

The user's instruction to refer to lessons and use the live database applies
to all authorised plans. No local database, Docker, disposable target or new
Neon branch was provisioned.

Actual authorised target: project `soft-dream-28768887`, branch
`br-frosty-union-a7sc6dl7`, endpoint `ep-cold-pond-a7ar2epd`,
database `neondb`. Current settings were privately retrieved from existing
configuration and authenticated Vercel environment APIs. No secrets, token
material, customer payloads or capability URLs are included in tracked evidence.

Generated migration `20260927151200_feed_event_publications` was reviewed in
full before deployment. SHA-256:
`18ffd7cc8703b8b196b62b57f385cf965741765113c46a3c75ed9a020092b002`.
It adds two feed columns and the scoped publication ledger, indexes and a
RESTRICT feed foreign key. It removes no existing schema or data.

The generated SQL has an extra blank line at EOF, reported by git diff --check.
It was preserved to retain the generated, applied migration checksum.

The reviewed fenced wrapper applied only this migration in owned run
`80601167-19b6-4788-a422-a8d4d2a8691e`. Independent read-back confirmed
22 complete matching migration checksums, zero pending migrations, schema
equality, NULL/0 new defaults, an empty ledger and preservation of all
309 existing rows across 39 tables. Its first integration attempt failed
before tests because a relative manifest was resolved from package directories;
cleanup and lock release passed. The final campaign uses an absolute manifest.

## Original protected live campaign and closure

Run `30440382-6c42-402c-b8e3-33c0d37818f8`, exact source `4c603ded`,
27 September 2026, 07:16:37.351 to 07:26:46.532 UTC: PASS.

Root invocation:
`bun --env-file=.cache/162-support/final-run/live.env --conditions=react-server .cache/162-support/run-paused-live.ts`.
The reviewed private monitor invokes the unchanged protected integration CLI
with an absolute manifest, `--preacquired`, private `--evidence-dir` and
`TURBO_CONCURRENCY=1`. It continually checks actual paused process identities,
durable manifest equality, run ownership and the frozen clean candidate.

| Package | Files | Passed tests |
| --- | ---: | ---: |
| app | 1 | 2 |
| availability | 3 | 22 |
| xero | 6 | 72 |
| feeds | 1 | 22 |
| jobs | 6 | 84 |
| database | 10 | 52 |
| Total | 27 | 254 |

Six uncached tasks passed. The feeds suite used the actual Redis fixture pair,
including successful obsolete-key writes and current privacy-safe read-back.
Owned feed cache keys are purged before feed rows and checked after cleanup.

The actual local Inngest consumer on port 8288 had ten registered jobs backed by
the API on port 3002. A fresh catalogue, exact PID/parent/start-time/cwd/UID
allowlist and original process states were recorded. The five original
Inngest/API worker processes were temporarily SIGSTOP-paused; the main UI and
customer settings remained untouched. SQL running jobs and transactions drained
before the coherent baseline. Durable pause-window evidence was installed by
same-run compare-and-set under the exclusive ownership lock. The monitor
confirmed that the actual pause held through runner closure.

Independent final closure passed:

- Actual runner exit zero, inventory PASS, cleanup PASS, terminal phase complete.
- Zero owned database/shared-store/feed-cache residue; ownership fence released.
- All 39 public-table full content hashes and all 351 pre-existing rows equal
  the coherent pre-fixture baseline.
- All 22 completed migration checksums match; no pending migrations.
- Pinned Prisma read-only diff reports no difference from the reviewed schema.
- Ledger dual scope, indexes and constraints pass, as do all 12 existing Xero
  integrity checks and the enabled immutable tenant-binding trigger.
- Exact original five worker identities restored to running/sleeping states.
  Independent read-only checks confirm the original ten-job Inngest catalogue
  and both existing endpoints respond HTTP 200.

Private closure evidence is in the managed worktree's
`.cache/162-support/final-run/`; logs are
`/tmp/tc162-advisor-final-{live,readback,schema-diff,invariants,resume}.log`.
Only sanitised summaries are committed.

## Retained failure and recovery evidence

Prior run `c581e083-b997-4a4f-a475-12c563a0aca5` at `ea2438e` failed:
27 files, 239 passed and 15 failed tests. Existing approval/balance job suites
reported Neon WebSocket termination with underlying ETIMEDOUT. It is not a
passing gate. Consumer evidence then aged beyond the unchanged 15-minute
freshness requirement, so cleanup refused and retained ownership.

After independently proving writer closure, the same-run recovery refreshed
actual target/checksum and strict production Inngest observations by CAS against
the exact old durable manifest and owner. It terminalised one precisely scoped
interrupted owned SyncRun, then unchanged protected cleanup passed and released
the fence. No foreign row was changed by recovery.

Full-table equality for that run was FAIL: sync_runs grew from 138 to 163
customer rows. A read-only hash proves the original 138 rows were unchanged;
the other 38 table hashes also matched. The 25 scheduled customer-history
appends included rows written after test-process exit. They were preserved.
Production-only Inngest inventory did not cover the actual local dev consumer.
That omission was investigated and corrected with the concrete worker pause,
fresh coherent baseline and complete final campaign above. Neither the failed
run nor its full-table comparison is retrospectively labelled PASS.

## Limits

Current PITR retention, restore availability and a successful restore exercise
remain NOT VERIFIED. A SQL timeline/WAL reference is only a reference.
Authenticated browser journeys, real provider/calendar-client compatibility,
deployment and the wider Plan 160/go-live campaign remain NOT VERIFIED and
outside this correction plan. No merge, push, deployment, customer payroll
operation or new worker activation was performed.

## Final check and authorised merge

The user subsequently requested a final check, any necessary fixes, then commit
and merge to main. This explicitly authorises the local commit and merge and
supersedes the earlier execution-only restriction. No push or deployment is
included. Source/live proof remains tied to its exact verified candidate.

- [x] Fresh independent final code review and focused regression checks.
- [x] Read-only current live migration/schema and integrity check.
- [ ] Commit the advisor's reviewed plan documents and any necessary scoped fixes.
- [ ] Merge the approved feature branch into main, preserving unrelated work.
- [ ] Verify main source equals the tested source and post-merge checks pass.
- [ ] Record merge identity and final clean status.

The fresh feed review found no remaining blocker. The advisor reproduced a
calendar edit defect with the actual schema: a valid Sydney interval from
2026-04-04T15:50Z to 16:10Z renders as 02:50 to 02:10 during the repeated hour.
UTC wall-clock ordering rejects the unchanged update before server-authoritative
timezone resolution can preserve the original instants. The executor must fix
both form and action validation, retain genuine invalid-interval rejection and
add a real unchanged/edit regression. Approval of the new source awaits full
source gates and fresh protected live verification; the prior 4c603ded result
remains historical evidence, not a new-candidate pass.

Correction source candidate: `146a74de6a2c09d3b86f0b188227a3edceb16c88`.
The only production change removes the shared/client schema's UTC-order
refinement. Field validation remains; the existing scoped server action resolves
the timezone, preserves matching original endpoint instants, rejects nonexistent
times and requires end after start before calling a writer. Regressions cover
both schemas, actual client submission/error state, unchanged and note-only
cross-fold updates and genuinely reversed create/update inputs without writes.
The advisor read the complete correction diff and independently reproduced the
previous rejection and corrected parse.

Fresh source gates independently PASS at that exact candidate:
lint 1,166 files; build four uncached tasks; types 19 uncached tasks; boundaries
1,081 files/21 packages; units 18 uncached tasks/2,901 tests; release tools
33 files/509 tests; release types and explicit changed integration-suite types.
All nine commands exit zero in the private network-denied wrapper, with clean
serial unit/release settings and actual command banners retained in
`/tmp/tc162-merge-source-gates.log`. No source or timeout was changed for a retry.
Fresh protected live verification passed at that correction candidate: owned run
`52edd117-40cf-4cc9-8b71-b75bbe88ac08`, 07:50:05.012 to 08:00:25.094 UTC,
six uncached tasks, 27 files and 254 tests. Monitor exit zero, no isolation
failure, inventory/cleanup PASS and released fence were independently read back.
All 39 table contents and 377 pre-existing rows matched the coherent baseline;
22 completed migration checksums matched, none pending, Prisma schema diff zero
and integrity checks passed. The same five original workers were restored;
their ten-function catalogue and API HTTP 200 were independently checked.
This is historical evidence for `146a74d`, not the final all-day correction.

The independent calendar reviewer also found an inclusive all-day edit case:
canonical records may have equal start/end at midnight for one inclusive date.
The preservation logic retains those valid endpoints, then the new strict
timed-interval comparison rejects them. The advisor confirmed the canonical
schemas allow equality. The next minimal correction must allow equality only
for all-day inputs, preserve those endpoints, reject reversed all-day dates and
retain strict positive timed intervals. Source remains frozen throughout the
52edd117 campaign; this fix follows verified cleanup and restoration,
then receives fresh final-candidate gates. No current run's evidence is relabelled.

The all-day correction is committed at final source candidate
`f95c8c3710bdd7680a44233e70974bd80fe81524`. Its only runtime change allows equal
inclusive endpoints for all-day records and keeps timed intervals strictly
positive. Five action regressions cover note-only same-midnight preservation,
reversed all-day create/update and zero-length timed create/update without writes.
The complete focused suite passes 46 tests; focused lint and app types pass.

Root independently repeated all nine source commands at `f95c8c3`: PASS.
Build four uncached tasks, lint 1,166 files, types 19 uncached tasks, boundaries
1,081 files/21 packages, units 18 uncached tasks/2,906 tests, release tools
33 files/509 tests, release types and changed integration-suite types. The private
network-denied wrapper retains real command banners and zero exits in
`/tmp/tc162-final-merge-source-gates.log`. Initial worktree sandbox write access
stopped Prisma before source verification; the clean unchanged candidate passed
with authorised worktree write access. No source or timeout was changed.
All 13 regenerated Prisma artefacts were independently confirmed whitespace-only
before restoration. The exact-candidate live verification passed as follows.

Final owned campaign `a7c995f0-27bc-4535-b758-51e2c60c0ac7` ran at clean
`f95c8c3` with fresh actual-worker isolation. Before fixtures, all five original
workers were paused and SQL work drained; the coherent baseline contains
39 tables and 386 existing rows. Safety logic is byte-identical to the reviewed
prior helpers after normalising only candidate/private-run paths. Tracked source
stayed frozen through cleanup, full read-back and restoration.

Final campaign closure: 08:08:43.341 to 08:18:47.631 UTC on 27 September 2026.
All six uncached tasks, 27 files and 254 tests pass; runner and monitor exit zero,
no isolation failure, inventory/cleanup PASS and terminal phase complete.
The package inventory is app 2, availability 22, xero 72, feeds 22, jobs 84 and
database 52 tests. The real Redis feed fixture pair and obsolete-key privacy
assertions passed. All owned SQL/store/feed-cache selectors are clear.

Independent repeatable-read closure matches every count and content hash across
39 tables and 386 existing rows. All 22 applied migration checksums match; none
are pending; Prisma schema diff exits zero with no difference. All 12 scoped
integrity checks pass, indexes and constraints are valid, the immutable trigger
is enabled and the pre-existing unowned reserved binding remains untouched.
Durable authority and released fence were independently confirmed.

After reviewed closure approval, the same five original worker identities and
states were restored. A fresh read confirms the ten-function Inngest catalogue
and API HTTP 200. No customer data was restored, deleted or rewritten. Private
logs use `/tmp/tc162-final-merge-` prefixes and the ignored private evidence bundle
is `.cache/162-support/final-merge-run/` in the executor worktree.
Actual browser/provider/client, deployment and PITR restore proof remain
NOT VERIFIED; those broader campaigns are outside this correction slice.
