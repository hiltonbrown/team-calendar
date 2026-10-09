# Current work

## Bundled public holidays (plan `docs/superpowers/plans/2026-10-09-bundled-public-holidays.md`)

- [x] Region registry, reference schema and loader; one data file each for AU, NZ and UK.
- [x] Starter data (basics only; the user will add the full range by hand).
- [x] `public_holiday_preferences`; Nager rows, jurisdictions and assignments removed; custom holidays kept.
- [x] Resolver in `@repo/core`, tenant loader in `@repo/database`, preference service in `@repo/availability`.
- [x] Working days, approvals, calendar, dashboard, reports, current status and feeds read through the resolver.
- [x] Public Holidays page, custom holiday modal, Settings > Holidays local day switches, registry regions in General settings.
- [x] `docs/public-holidays.md`; PRODUCT.md, AGENTS.md and ScreenCatalogue.md updated; no runtime Nager references remain.

### Review

- `bun run check`: passes. `bun run typecheck`: 19 of 19 tasks. `bun run test`: 18 of 18 tasks.
- `bun run test:integration` (local PostgreSQL): database 54, availability 25, app 10 and jobs 84 pass. Feeds passes 22 of 22 when run in its package with `TC_TEST_KV_*` set to a local Redis HTTP shim; under turbo those variables are filtered, so it fails to load. The Xero OAuth suite has the same 17 failures as before this work.
- Data gaps: ACT, NT, SA, TAS and VIC have no entries (official sites blocked in the sandbox); NSW, WA and NZ cover 2026 to 2027 only (2028 not yet published). QLD and UK cover 2026 to 2028.
- Deviations from the plan: resolver and reference data live in `@repo/core` and the loader in `@repo/database` (feeds cannot depend on availability); the jurisdiction removal migration is split in two; NZ anniversary days are national `local` entries with the province as the area; QLD Christmas Eve starts at 18:00; WA regional King's Birthday is not modelled; `recursAnnually` was a no-op and is removed; there is no location editing UI, so no location region picker.
- NOT VERIFIED: visual rendering of the holiday screens (needs Clerk and other services); review the Vercel preview.
- `bun.lock` shows an unrelated `next` 16.3.6 to 16.3.8 sync from `bun install`; left uncommitted.

## Design system sync (Claude Design System artifact, 9 October 2026)

Bring code and docs in line with the reviewed Team Calendar design system. Brand mark unchanged.
Auth brand panel rebuild (solid primary with week-view pattern) is out of scope: rule documented only.

- [x] Tokens in `packages/design-system/styles/globals.css`: near-grey neutrals, primary `#46734a`, warmer error set, success aliases primary, lightness-stepped chart ramp, frost lifted in dark, restepped `--elev-*`, new `--elev-card`.
- [x] `button.tsx`: offset focus outline, opaque disabled, hover moves away from label colour, `outline` border, link underlined at rest.
- [x] `input.tsx`: `outline` border, offset focus outline, opaque disabled, 1rem text on coarse pointers.
- [x] `card.tsx`: `elev-card` hairline by default (no border); `variant="plain"` for cards on darker parents. Changed from the original "no edge by default" plan after review: 33 call sites sit on the near-white page and would have lost their edge.
- [x] App: `RefreshCwIcon` replaces `LeafIcon` for every Xero provenance cue; holiday tone uses warning; chip and plan status rings in own text colour at 30%.
- [x] Hard-coded brand colours in the email template, blog OG image and marketing CSS updated.
- [x] Docs: DESIGN.md, AGENTS.md, `.impeccable.md` updated for the above.
- [x] Gates: `bun run check`, `bun run typecheck`, `bun run test`, `bun run test:integration` (see review for sandbox limits).

### Review

- `bun run check`: passes after `bun run fix` reformatted long `--elev-*` lines.
- `bun run typecheck`: 18 of 18 tasks pass. Run with `turbo run typecheck --only` because `prisma generate` cannot download the schema engine in the sandbox; the committed generated client matches the schema.
- `bun run test`: 18 of 18 packages pass, 3,121 tests.
- `bun run test:integration` (local PostgreSQL 16, migrations applied with psql): availability 25, database 52 and app 10 tests pass. The Xero OAuth suite fails identically on `main` (17 failures) in this sandbox. The feeds and Xero shared-store suites need the serverless Redis HTTP proxy, which only runs under Docker. CI provides both; neither package is touched by this change.
- Not verified: visual rendering of the changed screens. The app needs Clerk and other services to render; review the Vercel preview.

## Prompt 7 renewed HTTP and obsolete-infrastructure check

- [x] Recheck the existing `e5fe001f` implementation at baseline `47c75872` against current provider limits and all Prompt 7 requirements.
- [x] Remove or supersede confirmed remaining obsolete runtime, test, release-tool or documentation references; preserve required Plan 160 behavior.
- [x] Obtain independent source/documentation review and fix Critical/Important findings.
- [x] Run targeted Xero, check, typecheck, boundaries, unit, integration and build gates; run release-tool gates after fixture cleanup.
- [x] Record retained-control justifications and verification for the focused completion commit.

Reuse the approved simplification plan Tasks 3, 11 and 12 in this branch and
worktree. No new architecture, compatibility/backfill, provider mutation,
worktree or merge. Retain only controls justified by current Xero limits,
deployed workers, security or Plan 160 domain rules. Stop when all requested
requirements hold, required gates are green and review has no Critical/Important
findings. The existing phase-7 commit is evidence, not a reason to ignore a gap.

Review: corrected the verified Important unreadable-429 response defect with four
RED/GREEN regressions. Provider guidance is recorded before bounded body reads,
rejection metadata survives, and earlier write uncertainty remains protected.
Removed obsolete campaign environment setup, renamed three Plan 161 test labels
without deleting useful coverage, and removed unsupported backfill-job wording.
Both fresh independent reviews have no remaining findings. Shared atomic quotas,
expiry slots and deadlines remain justified by deployed workers and current
provider/security requirements; no speculative control plane was added.

Fresh gates passed: 273 targeted tests; 1,155 linted files; 19 uncached typecheck
tasks; 1,084 boundary files/21 packages; 3,058 unit tests/18 uncached tasks;
273 owned-local integration tests/six uncached tasks; all four build tasks,
including Prisma generation; 196 release-tool tests with four existing Chromium
static-browser skips; release-tool typecheck. The initial targeted fixture timeout
was corrected using actual quota values with unchanged assertions, then the full
targeted command passed. Live provider/browser/Neon proof remains NOT VERIFIED.
Details: `docs/reports/2026-10-08-xero-http-follow-up.md`.

## PR129 review corrections

- [x] Evaluate all review comments against explicit pre-production/no-recovery-architecture scope.
- [x] Reproduce and fix imported leave recovery visibility and feed publication after archive commit.
- [x] Correct verified refresh rotation issue without a new durable recovery model; remove duplicate classifier entry.
- [x] Run relevant RED/GREEN and repository checks; obtain independent review.
- [x] Prepare verified corrections and documented review rulings for the existing PR.

Baseline22cefe59, PR129 main←work. Stopping condition: actionable findings
fixed and verified, explicit scope conflicts explained, same PR updated. Do
not backfill existing connections, add lifecycle recovery state, access live
Xero, create a worktree or merge. Update the existing PR with verified fixes and
record the review rulings in its description.

Review: imported recovery discovery, pre-commit archive publication and discarded
rotated tokens reproduced in failing regressions and were corrected. Plans stays
scoped and imported records stay view-only; refresh saves the authenticated
token-endpoint response without a redundant JWKS request or new durable state.
The backfill request is inapplicable to the explicitly empty/pre-production Xero
dataset. Removed the duplicate classifier entry and corrected imported recovery
attestation wording. Fresh independent review has no remaining findings.

Verification before the correction commit: `bun run check` passed (1,155 files);
`bun run typecheck --force --concurrency=3` passed (19 uncached tasks);
`bun run boundaries` passed (1,084 files, 21 packages);
`bun run test --force --continue=always --concurrency=2 -- --maxWorkers=2`
passed (3,054 tests, 18 uncached tasks); `bun run test:integration --force
--continue=always --concurrency=2` passed (273 tests, six uncached tasks);
`bun run build --force --concurrency=1` passed (four uncached tasks, including
Prisma generation). Integration used only owned loopback PostgreSQL/Redis.

The first full unit run exposed a real-time 25 ms AU stalled-body test deadline
race. It now uses the existing transport tests' controlled-clock pattern, retains
the exact permission error and single-dispatch assertions, and restores timers.
The complete failed unit command was rerun successfully after this correction.
Live provider/browser/Neon verification remains NOT VERIFIED; no new live
verification or production operation was performed.

## Final completed-phase Xero audit, Prompt 8

- [x] Independently review OAuth, canonical persistence, refresh, sync, writes, disconnect and security in fresh contexts.
- [x] Recheck official provider contracts and classify every remaining obsolete reference across the repository.
- [x] Correct verified defects with regression coverage and reconcile canonical documentation without speculative infrastructure.
- [x] Run fresh complete check, typecheck, boundaries, unit, integration, build and necessary Xero/release checks.
- [x] Record live connect/discovery/refresh/read/disconnect/reconnect/write availability and precise NOT VERIFIED outcomes.
- [x] Resolve Critical/Important findings, report rulings/minors and finish the existing branch after verification.

Stopping condition: the completed source implements the approved lifecycle,
all required local gates are freshly green, review findings are resolved and
the completion report records evidence and limits. Baseline `e5fe001f` on
`work`; continue this worktree. The prior branch-retention choice remains in
force. No new architecture phase, worktree, live fixture, deployment or push.

Review: three Important defects were reproduced and corrected: old absent-link
reconnect with a new authoriser, isolated malformed balance progress, and atomic
concurrent sync admission. Two scoped reviewers and a third independent
correction reviewer report no remaining Critical/Important/Minor findings.
The deadline regression now uses a controlled clock while preserving and
strengthening its dispatch/body/release assertions. No production HTTP change
or generated-output edit was needed. Build and unit verification are sequenced
after the initial concurrent regeneration/import failure.

Verification: all final commands exited 0. Check covered 1,155 files;
typecheck passed 19 uncached tasks; boundaries covered 1,084 files/21 packages;
full unit rerun passed 3,045 tests/18 uncached tasks; integration passed 267
owned-local tests/six uncached tasks; build passed all four uncached tasks,
including Prisma generation. Release tools passed 196 tests with four existing
Chromium-dependent static-browser skips; release typecheck passed. All 28
migrations replayed in a fresh owned database with zero drift and no obsolete
tables/columns/binding function. Additional OAuth/refresh/provider-loss140,
HTTP56, jobs unit190 and jobs integration82 passed. No unit/integration skips.
The first unit attempt's real-clock deadline failure and concurrent Prisma
regeneration/import failure are recorded and corrected, followed by a full
uncached rerun. Final review has no deferred minor findings.

Live OAuth connect, discovery, automatic refresh, read sync, disconnect,
reconnect and writes remain individually NOT VERIFIED because no configured
Xero app/demo/payroll fixture exists. Actual authenticated browser, deployed
scheduled jobs and Neon-adapter concurrency are NOT VERIFIED. No live provider
call was made. The report is `docs/reports/2026-10-07-xero-final-architecture-audit.md`.
Finish using the existing branch-retention choice: commit locally, preserve
`work` and this workspace, stop owned fixtures and remove only the new replay
database. No merge, push, deployment, PR or worktree creation.

## Xero HTTP and Plan 161 infrastructure simplification, Prompt 7

- [x] Audit exact provider limits and remaining Plan 161 consumers.
- [x] Replace fabricated local HTTP responses with structured, undispatched rate errors; retain earlier mutation uncertainty.
- [x] Remove speculative non-tenant quota buckets, duplicated retry parsing and redundant lease options with RED/GREEN coverage.
- [x] Remove remaining obsolete fixture authority and documentation; actively prohibit deleted lifecycle patterns.
- [x] Run targeted tests, check, typecheck, boundaries, unit, integration, build and applicable release-tool gates.
- [x] Resolve independent Critical/Important review findings and commit on `work`.

Stopping condition: one bounded HTTP boundary enforces demonstrated quotas and
security requirements, obsolete architecture is absent, required gates pass and
the focused phase is reviewed and committed. Baseline `53a59df1`; reuse approved
design and implementation plan Tasks 3, 11 and 12, without another worktree.

Ruling: retain the small atomic Redis quota script and expiring concurrency slots.
App/API/job workers share Xero's five-request tenant ceiling and rolling quotas;
process-local limits would not enforce those requirements across deployments.
Keep fixture-only namespace injection for owned test cleanup, no runtime
namespace bootstrap or configuration. Keep the one-field deadline helper,
bounded database transactions, 5 MiB buffered response cap and origin/redirect
protections. They protect current synchronous writes, token grants and sync.
Remove the undocumented token/inventory 60/minute policy, fabricated provider
429s and duplicated parsing. Preserve Plan 160 domain recovery and generic
non-local database safeguards. Historical migration bytes remain immutable;
generate a narrow forward DROP from PostgreSQL's function catalogue because
Prisma cannot express this standalone trigger function.

Verification: 1,155 linted files, all 19 typecheck tasks, 1,084 boundary files
in 21 packages, 3,044 unit tests across 18 tasks, 262 owned-local integration
tests across six tasks and all four production build tasks passed. Initial
whole-source unit/typecheck gates ran uncached; final affected tasks reran after
removing two obsolete bootstrap-only assertions. Release tools passed 196 tests
with four existing Chromium-dependent static-browser skips, plus typecheck.
All 28 migrations replayed into a fresh owned database with zero schema drift;
real PostgreSQL verifies the obsolete function is absent. Independent review
has no Critical, Important or Minor findings. No live Xero, application-browser
or deployment verification is claimed. Evidence and retained-control rationale
are recorded in `docs/reports/2026-10-07-xero-http-simplification.md`.

## Xero native idempotent outbound writes, Prompt 6

- [x] Recheck exact AU mutation headers and regional differences against current official OpenAPI; inspect Plan 160, transport and approval recovery.
- [x] Use TDD to retain earlier ambiguous dispatch evidence across retries without adding durable provider recovery state.
- [x] Simplify common AU response parsing, reject unconfirmed provider outcomes and capture safe correlation IDs consistently.
- [x] Preserve Plan 160 state on definitively refused withdrawal and centralise existing domain failure classification.
- [x] Run targeted and fresh check/typecheck/test/integration gates, resolve independent review and commit on `work`.

Stopping condition: supported writes use one stable native key and bounded
synchronous retries; domain transitions remain safe, duplicated handling is
removed, required gates pass and the focused phase is reviewed and committed.
Reuse the approved design and existing journal/native-key implementation from
`e875525d`. Preserve the five-minute replay cutoff and approval recovery beyond
Xero's six-minute cache. Do not introduce outbound jobs, new journals,
dependencies, worktrees or NZ/UK activation.

Verification: 1,155 linted files, all 19 typecheck tasks, 3,038 unit tests across
18 tasks and 259 owned-local PostgreSQL/Redis integration tests across 6 tasks
passed. Changed packages reran after final corrections; unchanged task evidence
was reused. Prisma generated with no DDL change. Fresh independent review's sole
Important withdrawal-result finding was reproduced, corrected and closed;
remaining Critical/Important/Minor findings are zero. No live Xero mutation or
application-browser verification is claimed. Evidence and scope are recorded
in `docs/reports/2026-10-07-xero-idempotent-writes.md`.

## Xero incremental inbound sync, Prompt 5

- [x] Recheck official AU employee/V2 leave modification filters and balance retrieval contracts; inspect current implementation against Prompt 5.
- [x] Test and remove obsolete employee snapshot absence thresholds/delay; retain complete/full/success prerequisites, manual-data protection and both tenancy keys.
- [x] Verify watermarks remain unchanged after provider, parsing, persistence and incomplete-run failures; fix any proven gaps with TDD.
- [x] Run targeted sync tests and fresh check/typecheck/test/integration gates, resolve independent review and commit on `work`.

Stopping condition: normal supported polling is incremental, full reconciliation
is separate and truthful, balances use supported retrieval, obsolete snapshot
policy is removed, required gates pass and the focused phase is committed and
reviewed. Existing implementation in `75a939ae` is reused; do not rebuild it,
redesign OAuth/writes or create another worktree.

Verification: 1,153 linted files, 19 uncached typecheck tasks, 2,965 unit tests
across 18 uncached tasks and 259 local PostgreSQL/Redis integration tests across
6 uncached tasks passed. Prisma generated, migration deploy/status and schema
diff passed with 27 migrations. Fresh independent review has no remaining
Critical, Important or Minor findings. No live provider or application-browser
verification is claimed. Evidence and scope are recorded in
`docs/reports/2026-10-07-xero-incremental-sync.md`.

## Final Xero architecture audit, 8 October 2026

- [x] Independently audit current architecture/security/sync/writes and every residual lifecycle/campaign reference against official Xero contracts.
- [x] Fix verified defects and remove obsolete infrastructure/docs without adding speculative architecture; verify regression coverage.
- [x] Run fresh complete check, typecheck, boundaries, unit, integration and production build commands; resolve their root causes.
- [x] Confirm safe live fixture availability and record each unavailable provider/browser flow explicitly as NOT VERIFIED.
- [x] Reconcile AGENTS/PRODUCT/README and current developer documentation with actual implemented architecture.
- [x] Resolve all Critical/Important independent review findings, report exact evidence and commit the phase in the existing branch after required gates pass.

Stopping condition: actual approved lifecycle and current provider contracts are
verified, required gates pass, independent review has no unresolved Critical or
Important findings, documentation is canonical and branch finishing is handled.
This is an audit and verified-defect correction phase. Add no speculative
infrastructure, new worktree, new campaign framework or unapproved provider write.
Baseline is clean commit 8d38e978 (simplification phases 2, 3 and 4); later phases
are not represented by commits in this checkout, so audit existing sync/write
and release code rather than assuming that missing work was completed elsewhere.

Review: final independent security and sync/write reviews have no unresolved
Critical or Important findings. The full lint, typecheck, boundaries, unit,
integration and production build gates passed uncached where Turbo applies:
1,153 linted files; 19 typecheck tasks; 1,082 boundary files in 21 packages;
2,948 unit tests across 18 tasks; 252 PostgreSQL/Redis integration tests across
6 tasks; all 4 production build tasks. Release tooling passed 195 tests with
4 explicit Chromium-dependent static-browser skips; its typecheck passed.
Prisma generated and all 26 migrations replayed into a fresh owned local
database with no schema drift. Build configuration used the user-supplied Clerk
development publishable key and a temporary real encryption key, without
provider credentials or validation bypass. No live Xero or application-browser
verification is claimed. The 11-part result and resolved review rulings are in
`docs/reports/2026-10-08-xero-architecture-audit.md`.

## Xero disconnect lifecycle, 8 October 2026

- [x] Verify official user-authorisation DELETE and absent-connection contracts; map current lifecycle consumers.
- [x] Test and implement scoped remote-first disconnect, required atomic audit and safe unreferenced-authorisation pruning.
- [x] Preserve imported data on soft disconnect; verify explicit purge preserves manual data and consistent feed publication.
- [x] Test provider-confirmed disconnection, stale-response protection and scheduled-sync exclusion; remove obsolete cleanup configuration.
- [x] Pass targeted tests and repository check/typecheck/test/integration gates.
- [x] Resolve independent code review and commit this phase in the existing branch/worktree.

Stopping condition: the requested disconnect lifecycle is implemented, verified,
reviewed and committed. Do not redesign OAuth, refresh, incremental sync or Xero
writes; add only the small connection guard required by an observed disconnect
versus write race. No new schema, lifecycle worker or management credentials.

Official Xero Identity OpenAPI specifies user OAuth DELETE /Connections/{id}:
204 removes the selected connection, 404 confirms it is already absent. Never
revoke the shared user grant to delete a single connection. Retain local state
on uncertain/transient failure. Preserve grants referenced by another connection
or a live short-lived selecting OAuth session. Authoritative provider inventory
and existing identities/timestamps protect reconnect state from stale responses;
do not infer lifecycle from activity or add generation state.
The current product has no Organisation deletion/archive action requiring remote
removal; the Clerk user-deleted webhook records analytics only. Do not introduce
a new account deletion workflow in this phase.

Verification: repository check passed for 1141 files; typecheck passed all 19
tasks; unit tests passed all 18 tasks (2903 tests, including 564 Xero and 514
availability tests); integration passed all 6 packages (247 tests) against
local PostgreSQL and Redis. Focused disconnect/service verification passed
206 units and 54 PostgreSQL tests; provider handling passed 13 additional
PostgreSQL tests. Release tooling passed 179 tests with 4 existing skips and
its typecheck passed. Source and filename audits find no obsolete cleanup,
inactivity, management-client or stale-marker runtime implementation. One
canonical refresh implementation remains. No schema/generated changes.

Independent review approved the final candidate after test-first fixes for
local-only decline/withdraw after disconnect, persisted uncertain payroll
outcomes, expired-session credential pruning and retry, and run-isolated
provider fixture identities. Remote deletion precedes local teardown; required
audit and pruning are transactional. Transient failure retains the local link;
404 supports safe recovery after remote success and local rollback. Explicit
purge preserves manual entries and their people's stable identity and feed.
Actual waiting write claims/preparation are fenced by the existing connection
row; this adds no cleanup lease, generation or payroll algorithm redesign.

Gate failures caused by this change were fixed: package-default server-only
mocks, claim transaction fixtures and the database preparation fixture's active
canonical connection prerequisite. An unchanged 25ms AU scope/deadline test
failed under concurrent compilation and passed in the complete unit gate once
that load ended; its assertions and provider bounds were not weakened. The
final complete unit and integration gates pass. Provider HTTP/token identity
were mocked; official provider documentation supplies the DELETE/inventory
contracts. No live Xero, browser, deployed application or remote database
verification is claimed. All source changes are frozen, verified and reviewed
for the focused phase commit in the existing branch/worktree.

## Xero OAuth and automatic refresh, 7 October 2026

- [x] Verify current official Xero code-flow, inventory, scope and refresh-grace contracts; map current consumers.
- [x] Test and implement exact least-privilege scopes and protected, single-exchange OAuth with eligible-tenant selection and initial sync.
- [x] Test and implement one canonical scoped access resolver, automatic rotation, concurrency and next-attempt grace recovery.
- [x] Refresh dormant authorisations once per grant, including paused connections; remove customer token controls and obsolete refresh wrappers.
- [x] Pass targeted OAuth/concurrency/database tests and repository check/typecheck/test/integration gates.
- [x] Resolve independent code review and commit this phase on the existing branch.

Stopping condition: the requested OAuth/token lifecycle is implemented, verified,
reviewed and committed. Inbound sync and payroll mutation redesign are separate
phases. Existing canonical persistence remains the only token owner.

Provider verification: current official OAuth FAQ confirms 60-day unused refresh
expiry and 30-minute retry grace after a lost response; the tenants guide confirms
`authEventId` filters the current authorisation event and the unfiltered inventory
contains all tenants authorised by that Xero user. Official Identity, Accounting
and AU Payroll OpenAPI documents were downloaded again. Current code requires
exactly `offline_access accounting.settings.read payroll.employees
payroll.settings.read`; no Pay Runs endpoint or settings mutation exists.

Use the existing PostgreSQL canonical app/user refresh lock and narrow grant
issuance barrier to prevent a new unknown-user code exchange from superseding a
concurrent rotation; add no connection/binding/owner refresh locks. Valid access
and missing permissions return before locking. Token HTTP exchanges make one
attempt; uncertain refresh preserves the stored pair for the next normal retry
within documented grace. Reuse the 15-minute scheduler for due grants at 45 days;
a daily-only retry gate would miss that grace window after an uncertain response.

Verification: repository check passed for 1137 files; typecheck passed all 19
tasks; unit tests passed all 18 tasks (2859 tests, including 535 Xero tests);
integration passed all 6 packages (204 tests) against disposable local PostgreSQL
and Redis. Focused core verification passed 167 units and 27 real PostgreSQL
tests, including concurrent refresh, callback versus rotation, lost response,
actual save rollback, shared invalid grant and paused dormant grant maintenance.
Provider HTTP was mocked; official current documentation supplied the provider
contracts. No live Xero, browser or deployment verification is claimed. Prisma
generated successfully during typecheck; this phase changes no schema or
generated output. Runtime legacy-refresh/manual-control audit and diff check
are clean.

Independent review approved spec compliance and code quality after corrections
to preserve every authorised file while highlighting current consent, and to
share the existing best-effort activation capture between both connection paths.
The ancillary post-commit audit cannot prevent initial-sync dispatch; the
canonical transactional audit remains required. Test-first failure/passing
evidence covers these corrections. Compile failures were fixed with an explicit
missing-app configuration result, plain JSON session tuples and a typed callback
result. The existing analytics workspace dependency is declared for its extracted
helper; regenerated lock metadata matches existing manifests without upgrading
installed packages. The focused phase is committed on the existing branch;
incremental sync, central HTTP policy and payroll writes remain later phases.

## Xero persistence simplification, 7 October 2026

- [x] Establish failing real-database assertions for canonical credentials, connection ownership, cursor scope and manual balance uniqueness.
- [x] Generate the four-model schema and destructive migration; replace scoped queries and affected consumers without legacy wrappers.
- [x] Delete obsolete lifecycle-only code, tests and scripts; verify no runtime obsolete model or token mirror remains.
- [x] Pass Prisma generation, targeted tests, database integrations and repository check/typecheck/test/integration gates.
- [x] Obtain independent code review, resolve findings and commit this phase on the existing branch.

Stopping condition: persistence and compile-time consumers are consistent,
required checks pass, code review is resolved and the focused phase is committed.
OAuth, refresh, incremental sync and payroll write redesign remain later phases.

Verification: Prisma Client 7.10.0 generated successfully. The complete historical
migration chain and generated `20261007122236_simplify_xero_lifecycle` applied to
a fresh disposable PostgreSQL database with zero schema drift. Existing manual
availability and active feed-token partial uniqueness are preserved. Repository
check passed for 1129 files; typecheck passed 19 tasks; unit tests passed all 18
tasks; integration tests passed all 6 packages (195 tests) against local
PostgreSQL and Redis. After review fixes, 23 affected PostgreSQL integration
tests and 65 affected unit tests also passed. Release tooling passed 179 tests
with 4 existing skips, and its typecheck passed. The final Xero unit suite passed
496 tests; only 7 tests for an unused obsolete credential decision were removed
after the earlier 503-test run. Runtime obsolete-model/mirroring audit is clean.

Independent review approved spec compliance and code quality after fixes for
initial-import recovery's removed relation, disconnect-induced reconnect pause,
and stale selection racing disconnect. The latter has a failing/passing real
PostgreSQL interleaving regression. Unused legacy refresh decisions were deleted;
canonical adoption uses the stable-identity database save helper. This phase is
committed on the existing branch; later phases remain outside this change.


## Xero simplification planning, 7 October 2026

- [x] Inspect repository instructions, product requirements, Plans 160/161 and current Xero code/schema/jobs/UI/tooling.
- [x] Validate the approved direction against current official Xero documentation and OpenAPI; use Context7 where applicable.
- [x] Write `docs/superpowers/specs/2026-10-07-xero-simplification-design.md` and record the Plan 161 lesson.
- [x] Write and self-review `docs/superpowers/plans/2026-10-07-xero-simplification.md` with exact files, deletions and TDD red/green tasks.

Stopping condition: both requested planning artefacts and the lesson are complete
and self-reviewed. Production code, schema application and live provider work
are outside this turn. Existing unrelated task history is preserved below.

Review: inspected repository source and current official Xero/OpenAPI contracts.
The self-reviewed design and 13-task implementation plan are complete. PASS:
document structure, relative links, whitespace, red/green task structure, all 92
exact deletion paths and planning-only change inventory. No production suite,
provider mutation or implementation is claimed.

## Active plan: Australian go-live implementation and release validation

Source: `plans/go-live.md`. Tested source candidate:
`822a7c659509765df7be9fb99f22abce3d798b7a`. Documentation context:
`17c34db41d51c47b20d0323222e77e7d0d541ee2`. Repository 6.0.2,
Bun 1.4.0. The baseline remote check found only `main`. No remote push or
production deployment was performed.

### Tasks

- [ ] Complete end-to-end tenant, role, Xero write, feed, job and notification workflows.
- [ ] Run production-like app/API/web and role-based Australian browser workflows.
- [ ] Complete dashboard timeline and feed URL desktop/mobile/light/dark browser follow-ups.
- [ ] Make app/API/web production preflights pass for the configured launch mode.

### External security follow-ups carried forward

- [ ] Verify rotation of the credential formerly exposed in `.mcp.json`.
- [ ] Obtain GitHub Support purge of retained pull-request refs and cached commit views.
- [ ] Re-audit a fresh remote mirror after purge.

## Active execution: consolidated Australian go-live plan

Candidate branch: `codex/go-live-candidate`, based on `80ac9f7`. Live Neon test
authority is explicit and persists for this release. Verification safeguards
are implementation work, not a new permission gate.

- [ ] D1: unit/live database isolation. Source-only CI, exact 21-suite runtime
  allowlist, lazy connection denial, candidate-bound protected manifest,
  durable KV read-back, active-run fencing, pre-write zero-residue assertion,
  FK-ordered cleanup and focused live rollback proof are implemented. The
  exact protected workflow patch is reviewable but unapplied. All 21 suites now
  use disjoint manifest-owned fixtures, production seed execution accepts owned
  inputs, cleanup checks outside-owned catalogue digests, and interrupted runs
  retain the digest in durable storage. Consumer pause/restore provider proof,
  a protected workflow environment and the complete guarded live run remain open.
- [ ] T1: Playwright runner and production Clerk CSP repair exist. All 30
  journeys fail closed without candidate/manifests, use exact owned records,
  fresh role contexts and a durable local create ledger with cleanup. No live
  mutation journey has run because required provider configuration and
  sanctioned candidate deployments are still absent.
- [ ] G2 and O1: production configuration, candidate deployment, rollback-aware
  live journeys, monitoring/alerts and launch decision remain open.

## Live early access delivery verification

- [ ] Verify live delivery after the API fix is deployed.

Live delivery result: NOT VERIFIED. Production OPTIONS returned Clerk
`protect-rewrite, session-token-and-uat-missing`, matched `/404`, and no
Access-Control-Allow-Origin header for either apex or www origins. The live
browser submission timed out waiting for POST. No successful delivery or
reference was observed. Fixed the exact public route locally; production
requires deployment before delivery can be retested. Added public POST/OPTIONS
and private neighbouring-route regression coverage.

## Live contact delivery and Neon verification, 20 September 2026

User explicitly authorises live email delivery and the configured live Neon database.
- [ ] Run authorised integration coverage and verify scoped cleanup.

Review: port 3001 was occupied by Bun PID 320008, which exited before inspection. The retry started all services. Fixed the subsequently exposed API compilation failure caused by contact.ts importing nonexistent index.js: extracted the shared Resend client into client.ts and removed the circular root import.

PASS: check, typecheck, unit suite, three targeted contact transport tests, diff whitespace check. Browser HTTP 200 for web, app sign-in and email preview with no page errors; API Inngest endpoint HTTP 200. NOT VERIFIED: database integration tests, blocked by non-local database guard. Verification server stopped after checks.

## Unblock authorised Neon integration tests, 20 September 2026

User explicitly selected the configured Neon database for guarded integration tests.
- [ ] Verify configured live target and required provider access without exposing credentials.
- [ ] Establish the guarded runner's restore, consumer pause and durable ownership prerequisites.
- [ ] Run integration tests, clean owned fixtures and restore consumer state.
- [ ] Record verified outcomes and any concrete remaining blocker.

Live contact verification review: PASS actual production Resend transport using
current sendContactEmail and the previously authorised private test mailbox.
Both team and confirmation emails return HTTP 200 / last_event=delivered.
Team ID: 01a0be01-36bf-7498-ae37-a1a4f59043bc.
Confirmation ID: 01a0be01-3c49-705d-8447-bf6d7109e1a1.
Evidence: /tmp/contact-studio-email-evidence.json. Provider delivery proves mail
server acceptance, not inbox placement. Temporary downloaded secrets removed.

PASS live Neon read-only identity and migration verification using DATABASE_URL
pulled directly from Vercel API production: neondb / neondb_owner, 15 applied
migrations, zero checksum mismatches, zero pending migrations. No fixture writes.
Vercel API, app and web inventories checked across environments: no KV_REST_API_URL
or KV_REST_API_TOKEN. API has no Inngest production credentials. Protected manifest,
restore evidence and consumer pause/drain evidence are unavailable.
NOT VERIFIED full database integration suite and full contact HTTP delivery path:
the guarded live runner and contact abuse controls require missing KV configuration.
Existing live-database permission persists; this is a configuration prerequisite,
not an authorisation gap. No manifest facts invented and no guards bypassed.

Fixed a discovered contact delivery defect: /api/contact now bypasses Clerk auth
for anonymous POST/OPTIONS only at that exact path; neighbouring routes remain
protected. PASS 38 targeted route/proxy tests and fresh repository check, typecheck
and unit suite. Logs: /tmp/contact-live-{api-tests,check,types,tests}.log.

Neon unblock review: user authorised the configured Neon target. PASS: read-only
SQL connection to neondb as neondb_owner; 15 completed migrations observed.
Initial sandbox DNS failure was resolved by the approved external read-only check.
NOT VERIFIED: live integration execution. No KV_REST_API_URL/KV_REST_API_TOKEN,
protected manifest, Neon management credential or Inngest management access was
available in the inspected environment files/process/tools. Existing runner requires
provider target/restore evidence, paused and drained consumers, durable manifest
read-back and active-run ownership before fixture writes. No guard was weakened
and no live data was mutated. Next step: supply/connect the release provider access
and KV configuration, then establish the manifest and run the guarded suite.

Continuation after provider connection: refreshed Vercel development inventory.
Neon and Upstash are now Available; downloaded configuration privately and merged
only database/KV variables into ignored root/API/app local environments, preserving
existing settings. The Neon endpoint matches the previously SQL-verified target.
Inngest CLI explicitly reports not logged in; production API environment inventory
still has no Inngest signing/event credentials. Full fixture suite remains gated by
consumer pause/drain and restore evidence, not database reachability or permission.

PASS connected KV read-only PING: HTTP 200, PONG. PASS 12 focused release guard/active-run registry tests. Temporary downloaded environment removed after selective merge. Existing dev stack occupies ports 3000-3002 and 8288; duplicate startup exited without replacing those processes.

## Full live database test, 20 September 2026

User requests the complete database test; existing live Neon authority persists.
- [ ] Establish provider target, restore and worker-isolation evidence.
- [ ] Create a durable manifest with unique owned fixtures and acquire run lock.
- [ ] Execute all 21 integration suites; resolve in-scope failures.
- [ ] Verify cleanup, unchanged unowned catalogue and restored worker states.
- [ ] Record exact results and outstanding prerequisites.

## Activate connected Inngest configuration, 20 September 2026

- [ ] Verify endpoint and Inngest app registration; record remaining live-test gates.

## Pre-production review pass

Re-audited all three commits before shipping. Two defects found and fixed, both
mine; one pre-existing issue found and left alone; the risky automated passes
verified clean.

### Found, not fixed (pre-existing, outside this pass)

`.marketing-legal__section ul` sets `padding-left` but no list marker, and
Tailwind's preflight strips the default, so bullets on the privacy policy and
terms pages render as indented paragraphs. Present at baseline. Worth a one-line
fix later; not changed here to keep the production push to reviewed scope.

# Previous Xero verification work

The former Plan 160/161/163 campaign tasks are retired by the approved Xero
simplification. Their execution history remains in Git. No campaign lease,
credential-domain sentinel, namespace bootstrap, tenant-binding cutover or
cleanup receipt is a current prerequisite. Current release work uses ordinary
scoped fixtures, the shared quota limiter and the guarded release runner.

Historical source results do not verify the current candidate. Live Xero,
application browser, deployment and recovery observations remain NOT VERIFIED
until explicitly authorised safe fixtures and valid sessions are available.

## 2026-10-08 Organisation-owned OAuth hardening

- [x] Inspect current implementation; restore merged PR #129 baseline because the selected workspace predates it.
- [x] Reproduce missing Organisation/user binding with failing tests.
- [x] Require an existing scoped Organisation and initiating user before consent; remove OAuth Organisation creation and preserve canonical encrypted authorisation.
- [x] Add targeted privilege-loss, replay, state expiry/forgery/actor isolation, return-path safety, tenant substitution and credential-isolation coverage. Database-backed assertions remain unverified below.
- [x] Run unit, integration, lint, typecheck, boundary and build checks; independently review the focused diff. Integration execution is blocked by local service access below.

Scope: standard confidential server-side Authorization Code flow. No PKCE, Plan 161 machinery, credential mirrors, backfills or new abstraction. Existing callback role checks are retained. Initiating application user is transaction/audit provenance only; runtime access resolves the Organisation connection.

## 2026-10-08 Centralised Xero refresh hardening

- [x] Inspect the PR #129 canonical authorisation and PostgreSQL transaction/advisory locks. Retain the existing lock; reread and expiry checks already run inside it.
- [x] Reproduce and fix 401 recovery incorrectly accepting a newer token that is itself near expiry. A changed safely valid token is reused; expiry still requires rotation.
- [x] Add regression coverage for the expiry defect, fresh concurrent credentials, subsequent use of the rotated refresh token, response-derived expiry, encrypted persistence and safe logs; extend transient HTTP cases to 429/500/503.
- [x] Strengthen the database concurrency test to five simultaneous callers, one provider rotation and the new access token returned to every caller.

Verification: focused refresh/recovery/authorisation suite passed (118 tests); lint, all 19 typecheck tasks and boundaries (1,084 files / 21 packages) passed. All four build tasks passed using synthetic build-only Clerk keys because the injected publishable-key placeholder was not valid for compilation. The final full unit run passed all 3,067 tests across 18 tasks (including 677 Xero tests and 264 API tests).

Database integration verification is NOT COMPLETE: the full six-task integration command was attempted and failed in database/Redis fixture setup. Loopback PostgreSQL/Redis were unavailable to this sandbox (including EPERM at localhost:5432); starting the local Docker services required a permission request that the user aborted. No safety guard was weakened and no production data was used. The real PostgreSQL concurrency, persistence rollback and Organisation identity-deletion assertions have been added/retained but are not verified by this run. No live Xero or Clerk session was exercised.

## 2026-10-08 Dormant Xero authorisation review

- [x] Verify the current provider limit: Xero OAuth FAQ documents expiry after 60 days of refresh-token non-use (https://developer.xero.com/faq/oauth2, reviewed 2026-10-08).
- [x] Inspect due selection, under-lock rechecks, scheduler and demand-driven access. Existing 45-day threshold provides a 15-day margin; retain it.
- [x] Document the 60-day limit / 15-day margin in code and PRODUCT.md; add locked 45-day boundary and lost-eligibility unit tests, a disconnected/archived/inactive database matrix and shared-maintenance credential-reuse assertions. Runtime logic and threshold are unchanged.
- [x] Run focused tests and relevant checks; record integration verification limits.

Dormant review verification: focused unit suite passed 35 tests; all 19 typecheck tasks and boundaries passed. Focused database integrations were attempted: six cases failed before exercising their assertions because local PostgreSQL remains inaccessible. Real due selection, eligibility filtering and advisory-lock concurrency remain unverified in this environment. Independent review found no concrete defects. Final full unit run passed all 3,071 tests across 18 tasks; lint passed (1,155 files), and git diff --check passed. No build rerun was needed: this review changed only comments/docs/tests, and the preceding build passed all four tasks.

## 2026-10-08 Organisation-owned reconnect hardening

- [x] Inspect current reconnect: previous-link validation wrongly requires the original Xero grant before rebinding to a different authoriser.
- [x] Reproduce the blocker (two failing regressions), delete previous-authoriser/link-removal requirements, and retain same-tenant scoped atomic connection rebinding.
- [x] Add same/different admin, original identity absent, cancellation/exchange failure, substitution and concurrent reconnect coverage. The database-backed assertions remain unverified below.
- [x] Independently review and run unit, integration, typecheck, lint, boundary and build checks; report unavailable local integration services honestly.

Design: the owner/admin and fresh actor-bound OAuth session authorise reconnect. Verified new Xero identity plus authenticated provider inventory establishes the replacement grant. Existing Organisation connection identity and Xero tenant remain fixed; existing snapshot/row/advisory locks and session consumption atomically rebind the authorisation. No old-principal dependency, remote-link cleanup campaign, parallel connection, schema or migration is introduced.

Reconnect review: focused OAuth/service/route suite passed 107 tests. Lint, all 19 typecheck tasks and boundary checks passed; independent review found no additional concrete defect. Targeted integration command was attempted: 13 reconnect/old-link cases failed in local database fixture setup, before exercising their assertions. PostgreSQL remains inaccessible in this sandbox, so actual atomic rollback, competing-session serialization and original identity-deletion flows are NOT VERIFIED. No production credentials/data were used, and no database guard was weakened. Final full unit rerun passed all 3,073 tests across 18 tasks; build passed all four tasks. See the initial intermittent feed failure and integration limits below.

The initial full reconnect unit run passed 3,072 tests but failed one unrelated existing UI test: apps/app/components/feed/feed-detail.test.tsx > FeedDetail > lets refreshed archive, restored no-token and replacement props supersede a rotation receipt (archive rerender still showed the rotated textbox). All ten tests in that file passed in an isolated rerun; no feed source/test was changed. The fresh complete unit rerun passed all 3,073 tests across 18 tasks, including all 711 app tests and 683 Xero tests. This intermittent feed test failure is recorded; no feed code or test was changed. Build passed all four tasks with synthetic build-only Clerk keys (the injected placeholder key is not valid for compilation).

## 2026-10-08 Organisation-level disconnect review

- [x] Inspect current PR #129 remote-first disconnect, owner/admin action boundary, scoped locks, business-data handling and grant pruning.
- [x] Verify provider mechanism: Xero documents DELETE /connections/{connectionId} for one tenant link; token revocation removes all connections for that grant (https://developer.xero.com/documentation/guides/oauth2/tenants/ and /token-types/, reviewed 2026-10-08).
- [x] Retain runtime after review found no defect; add 14 service unit cases, strengthen owner/admin actor assertions and add confirmed-disconnect/denied-access/later-admin OAuth reconnect coverage.
- [x] Independently review and run relevant verification; preserve local integration-service limits.

Design: delete the exact stored remote connection ID, retain scoped local connection and encrypted grant until provider absence is confirmed (204/404), commit local teardown/audit together, and prune only unused grants. Whole-grant revocation is inappropriate for an Organisation-level disconnect when sibling connections use the same grant. Soft disconnect keeps business data; the separate explicitly selected purge affects only Xero-imported data. No new lifecycle machinery.

Disconnect verification: new actual-service unit suite passed 14 tests; app server-action suites passed 165 tests across 17 files, including member denial and scoped administrative disconnect. Lint passed (1,156 files), all 19 typecheck tasks passed and boundaries passed (1,085 files / 21 packages). Independent review found no concrete runtime defect. Targeted database integration run attempted six cases and failed in fixture setup because local PostgreSQL remains inaccessible; real transaction rollback, locking and later-admin reconnect assertions remain NOT VERIFIED. This review changes only comments/docs/tests, so the preceding four-task build result remains applicable. Final full unit suite passed 3,087 tests across all 18 tasks, including 697 Xero tests and 711 app tests. git diff --check passed.

## 2026-10-08 Repository-wide Xero call-path audit

- [x] Inventory production, lifecycle, jobs, scripts and test/helper HTTP paths and trace both scope keys and tenant headers.
- [x] Reproduce stale final resolver snapshots and stale tokens across pagination/retries; fix through the existing central resolver without independent refresh logic.
- [x] Verify remaining source boundaries, record a complete call-path table, and run all requested gates; database/IPC verification limits are recorded below.

Design: keep XeroConnection as the Organisation boundary and XeroAuthorisation as the sole encrypted credential store. Re-resolve at dispatch when a prior context may be stale. OAuth bootstrap uses the authenticated, actor-bound Organisation session before a connection exists; provider inventory selects the tenant. No new ownership or lifecycle infrastructure.

Audit verification: final full unit run passed 3,108 tests across 18 tasks, including 718 Xero tests and 711 app tests. The 14 targeted release observation tests passed. Lint passed (1,156 files); all 19 application/package typecheck tasks, separate release tooling typecheck and boundary checks (1,085 files / 21 packages) passed. Independent review confirmed the pending OAuth limiter/retry gap was closed; all audited source paths are recorded as Compliant in docs/xero-call-path-audit.md.

Integration limits: all 90 cases in the three relevant database suites failed during fixture setup before assertions, because local PostgreSQL remains inaccessible. Real tenant-query isolation, grant locking, transaction rollback and concurrent mutation assertions remain NOT VERIFIED. The broader release tooling suite passed 196 tests with five skipped, but deny-network.test.ts:51 failed because sandbox policy prevents its local IPC operation. No live Xero/Clerk or production data was exercised.

Final audit build passed all four tasks with synthetic build-only Clerk keys because the injected placeholder key is unsuitable for compilation. git diff --check passed. No schema, migrations, new connection abstraction, token mirrors or independent refresh implementation were added.

## Focused shared-connection integration suite (committed at user request)

Added six lifecycle scenarios modelling two tenancies, Admin A/Admin B/Member A/User B and Xero organisations X/Y, plus the owned fixture registration. The suite uses real PostgreSQL queries, locks, OAuth services, scoped access and administrative actions; external Clerk/Xero/Next request boundaries are simulated. Runtime implementation is unchanged.

Work was committed and pushed when requested. Database execution remains NOT VERIFIED: the attempted run failed before test collection at the local-database guard, and the subsequent disposable-service access request was cancelled. The complete relevant integration suite has not passed; concurrency and lifecycle assertions require an available local PostgreSQL environment. No database guards were weakened and no tests were skipped.

## 2026-10-08 Shared Xero connection integration coverage

Scope: strengthen the existing focused suite against the 16 requested observable invariants. Use real PostgreSQL for persistence and refresh locks; simulate only external Clerk, Xero and Next request boundaries. No implementation redesign, external database or weakened test guard.

- [x] Model two connected Organisations with distinct Xero tenants and canonical grants; prove foreign credentials and tenant substitution cannot dispatch.
- [x] Prove shared permitted reads create no member/admin OAuth grants; retain connection ownership when the original administrator leaves and a replacement authoriser reconnects.
- [x] Hold refresh dispatch open while concurrent authenticated users enter the resolver; prove one rotation and durable reuse.
- [x] Cover member denial, owner/admin disconnect, denied disconnected access and duplicate-free reconnect.
- [ ] Run focused and complete relevant suites plus four CI gates; record evidence and any environment limits.

Review: the focused real-PostgreSQL app run passed 10 tests (eight shared-connection scenarios plus two existing app cases). Coverage includes two connected tenancies, distinct Xero tenant/grant credentials, no additional member/admin OAuth sessions or grants, revoked original Clerk membership, stable application ownership on principal replacement, held refresh response with concurrent users, exact remote DELETE, owner/admin permissions and duplicate-free reconnection. Clerk/Xero request boundaries are simulated. Connection runtime remains unchanged.

The complete local integration attempt passed database (52), app (10), availability (25) and feeds (22). Xero passed 85 and failed 17 cases in oauth/service.integration.test.ts (connection/reconnect/selection scenarios, including a timeout); Turbo interrupted jobs. This is not a complete passing integration result. The first run also exposed setup-env.ts overwriting the explicitly configured DATABASE_URL; a regression failed before the defaults-only fix and both tests pass after it. Fixed stale fixture registry suite counts and included the focused suite in the protected runner allowlist.

User correction: use the database configured in environment variables and refer to lessons. Disposable service work stopped, correction recorded in lessons. The configured PostgreSQL database is reachable through read-only pg; no fixture writes were made there. Existing stored manifests either use the obsolete development-fixture shape or stale production consumer-isolation evidence. The available API Inngest signing key is not a production key. The protected configured-database run is pending current manifest/consumer evidence; no guard was weakened or evidence invented.

Final source checks: lint passes (1,158 files), typecheck passes all 19 tasks, and full unit suite passes all 18 tasks (3,114 tests). The 22 relevant release-runner/manifest/environment tests pass. Initial simultaneous source runs timed out in database export-boundary and web RSS tests; the sequential full run passes. Installed the already-declared analytics workspace link locally after its absence caused resolution errors; no dependency manifest or lockfile changed.

Outstanding: configured-database full integration execution and resolution of its genuine failures. Do not mark the requested integration verification complete until that run passes and cleanup is proven.

### Requested test rerun, 8 October 2026

Executed `bun run test --force --continue=always` with the normal unit environment: PASS, all 18 tasks freshly executed (zero cached), 3114 tests passed. Log: `/tmp/tc-shared-xero-test-rerun/unit-normal.log`.

Executed `bun run test:integration` with the configured DATABASE_URL loaded from `.env.local`: exit 1 before app/feed integration collection. The existing guard reports `ALLOW_LOCAL_DATABASE_TESTS can only be used with a local database connection.` No protected manifest/run ID is configured. Remaining tasks were interrupted by Turbo; this is NOT VERIFIED, rather than a failing application assertion. Log: `/tmp/tc-shared-xero-test-rerun/integration.log`. No configured database fixture writes were made and no guard changed.

The initial unit invocation loaded every environment-file setting and failed one feed subscribe-URL assertion, with three OAuth callback failures reported before interruption. These were environment contamination (configured localhost URLs replacing test defaults); the normal fresh full run above passes. No feed or callback implementation changed.

## 2026-10-08 Local dashboard loading failure

- [x] Reproduce the dashboard failure and identify the underlying approval query error.
- [x] Apply the minimal root-cause fix with regression evidence.
- [x] Verify the local dashboard data flow and run the four CI gates, recording limits.

Plan: inspect local server logs and reproduce failing data reads against the configured database without changing customer data. Fix only the demonstrated cause and preserve existing unfinished changes.

Review: reproduced `getAdminView` failing for both linked people with `Failed to build employee dashboard`. The underlying plan query rejected `decline` because the configured database retained the old outbound-action enum; approval queries also failed with Prisma P2022 because eight outbound request/idempotency columns were absent. Generated the configured-database schema diff with Prisma, extracted only its additive outbound columns and unique index, and added the missing `decline`/`withdraw` enum values while retaining legacy `submit` rows. Rehearsed in a transaction and rolled back successfully before applying the additive repair. Existing outbound rows remained two before and after; no credentials or customer rows were changed. No application source or migration files were changed, and migration history was not falsely marked current.

After repair: tenant-scoped owner, employee and manager dashboard services passed for both linked people (six successful reads). Employee/manager sections had no errors. Owner sync-health remains unavailable because the existing Xero lifecycle schema differs from the current repository; the recorded `20261006090000_simplify_xero_persistence` migration is absent from current history. Full migration deployment would conflict and would remove the legacy `submit` enum value still used by two records, so it was not applied as a dashboard fix. Broader Xero schema reconciliation remains outstanding.

Verification: `bun run check` passed (1,158 files); `bun run typecheck` passed all 19 tasks (cached); `bun run test` passed all 18 tasks (cached, unchanged application source). `bun run test:integration` exited 1 before assertions because the guard rejects the configured Neon database with `ALLOW_LOCAL_DATABASE_TESTS can only be used with a local database connection.` No integration guard was weakened. Browser verification remains NOT VERIFIED: the computer-use runtime rejected the Linux workspace URI before initialization; unauthenticated HTTP requests correctly redirect to sign-in. Direct dashboard service verification used actual configured database reads with only the server-only import marker stubbed outside Next.js. No development process was started or stopped.

Operational evidence: `/tmp/tc-dashboard-additive-repair.sql`, `/tmp/tc-dashboard-schema-repair.sql`, `/tmp/tc-dashboard-check.log`, `/tmp/tc-dashboard-typecheck.log`, `/tmp/tc-dashboard-test.log`, `/tmp/tc-dashboard-integration.log`.

## 2026-10-08 All-screen loading review and repair

- [x] Inventory every authenticated route and reproduce its data-loading flow without customer writes.
- [x] Prepare and verify a data-preserving repair for the demonstrated schema mismatches.
- [x] Fix any demonstrated application loading defects with regression tests.
- [x] Re-run screen data flows and required gates; record route-level evidence and browser/integration limits.

Scope: loading errors on existing local screens, including the remaining dashboard Xero sync-health failure. Preserve customer records, encrypted credentials and unfinished workspace changes. No design changes, payroll writes, disconnects or test-guard bypasses. Review routes in independent groups while diagnosing the shared configured-database schema.

Review: inventoried every authenticated page and intercepted-modal route, plus authentication pages and legacy redirects. Fixed two demonstrated source defects: `/public-holidays` incorrectly queried Organisation with `organisation_id`; it now uses `id`, `clerk_org_id` and the archive filter. Organisation settings retained rejected cache promises indefinitely; failed loads now evict their own cache entry while preserving concurrent in-flight deduplication. Both regressions failed before their fixes and pass afterwards; independent review found no actionable defects.

The configured database used an earlier Xero lifecycle schema. Prepared and rollback-rehearsed a data-preserving operational repair before committing it: preserved the existing remote connection identifier and token expiry through column renames; added current connection progress/health and authorisation metadata; restored current connection/session/cursor enum contracts; added required tenancy constraints. No tables or customer rows were deleted. Existing encrypted token bytes, IVs, tags, key versions and expiry values were compared before/after and remained exact. Row counts for grants, connections, outbound operations, availability and people remained unchanged. The existing grant does not contain a usable access-token identity, so it remains encrypted and preserved with an unverified legacy app reference and `reconnect_required` status. No fabricated verified provider identity, live Xero call or provider write was used. This closes the dashboard sync-health limitation recorded in the preceding dashboard review.

Verification coverage:

| Routes | Evidence |
|---|---|
| Dashboard, calendar, people list/profile/history | Actual scoped service reads for both linked accounts; all dashboard sections ready |
| Plans, availability aliases, leave balances alias, approvals | Actual my/team plan lists, approval lists/counts and profile balances; redirect destinations reviewed |
| Notifications | Actual notification and preference reads |
| Sync list/detail | Actual tenant summaries, runs and available run detail |
| Public holidays, new holiday, modal | Actual list/jurisdiction/organisation reads; real new form loader; page regression tests |
| Feeds list/detail/new/modals | Actual list/detail and three privacy previews, people/team creation options; modal loaders share these paths |
| General/Members settings | Clerk organization, membership and pending-invitation reads passed for both linked accounts; no Clerk write |
| Integrations/Xero/matches | Actual safe connection projection/state and pending-match queries |
| Getting started/setup | Actual onboarding reads; legacy redirect reviewed |
| Leave-approval/feed/holiday settings | Actual existing settings, feed and holiday reads; no diagnostic creation of missing settings |
| Billing/audit | Actual billing summary/activation, audit list/detail; avoided billing page audit insertion |
| Plans new/edit/modals, availability new/edit aliases | New form loaders passed for both accounts with only request authentication/context stubbed; edit loaders checked separately against existing records, without writes |
| Xero selection | Missing-session rejection verified; no valid pending session exists to exercise a selection screen with current customer data |
| Authentication pages | Existing Clerk component routes reviewed; no automated sign-in or authentication changes |

Core data probe: 69 passes, zero failures across two linked accounts (`/tmp/tc-all-screen-after.log`). New/holiday/invalid-selection loader probe: six passes, zero failures (`/tmp/tc-screen-form-reads.log`). Clerk-backed settings: six successful reads across the two linked accounts. A further stale database-only account returned Clerk 404; it has no linked current user and is not a reachable authenticated account. No stale account was deleted. Edit-loader results are in `/tmp/tc-screen-edit-reads.log`.

CI: `bun run check` passed (1,158 files). `bun run typecheck` passed all 19 tasks (five executed, 14 cached). `bun run test` passed 3,117 tests across all 18 tasks (changed app and availability suites executed, unchanged suites cached). `bun run test:integration` exited 1 before assertions because the configured Neon database is rejected by the local-only guard. No test guard was bypassed, external fixtures added or live integration success claimed. Browser rendering remains NOT VERIFIED because computer-use initialization fails on the Linux workspace URI; service/loader checks are not a browser UI walkthrough. No development server was started or stopped.

Operational repair evidence: `/tmp/tc-screen-lifecycle-repair.sql`, `/tmp/tc-screen-lifecycle-repair.ts`, `/tmp/tc-screen-lifecycle-apply.log`. Remaining schema diff (`/tmp/tc-screen-preserved-legacy-diff.sql`) contains preserved legacy enum values/metadata and old constraints, with no missing current screen columns. Migration history remains untouched because the database records an out-of-repository lifecycle migration and the destructive repository migration cannot truthfully be marked applied. Do not blindly deploy that migration over this database; migration-history reconciliation is separate from the verified screen-loading fixes.
