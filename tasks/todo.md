# Current work

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

## Task: AU contract continuation, 4 October 2026

- [ ] Remove ordinary campaign bootstrap prerequisite without bypassing isolation.
- [ ] Route protected integration suites and verify source gates.
- [ ] Freeze reviewed candidate and replay integration through the live Neon runner.
- [ ] Execute admissible bounded AU UI/provider rows, clean up and report honestly.

Execution: `plans/163-ordinary-campaign-admission.md` records the narrow source
prerequisite. The operator target is live Neon only. No new generic harness work.

Last reviewed: 2026-10-03

## Task: Reconcile Plans 160 through 161h, 27 September 2026

- [ ] Obtain the separately authorised real provider/application-browser observations and charter sign-off when sanctioned fixtures, approved AU contract, deployed revisions, role sessions and enforced worker isolation are available.

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

# Plan 160 execution

## Plan 160 completion, 29 September 2026

- [ ] Complete synchronous action/OAuth admission, acquisition drain and the real campaign lease/drivers.
- [ ] Verify the final candidate and protected online inventory.
- [ ] Execute admitted scenarios and reconcile cleanup and reports.
- [ ] Independent review and final evidence reconciliation.

Review: in progress; live/browser/provider results require actual admitted execution.

### Plan 160 resumed continuation, 30 September 2026

- [ ] Rebuild protected monitor artefacts lost with the temporary worktree, freeze the corrected candidate and repeat required gates and online verification.
- [ ] Reconcile final source, evidence and remaining full-campaign requirements independently.

Review: `72a7115` passed offline gates, but its online attempts were interrupted and failed respectively. Both cleaned up and preserved the database, but their private receipts were lost when `/tmp` was cleared by the disconnect. The persistent isolated worktree now holds the next corrections. Neither attempt proves the browser/provider campaign or a passing domain regression for the changed source.

### Plan 160 source verification after disconnect, 30 September 2026

- [ ] Complete protected exact-candidate online integration and independent postcheck.
- [ ] Complete actual approved fixture/session and browser/provider verification. Full campaign drivers/recovery remain deferred outside the merge scope.

Review: source result is PASS within the stated gates; protected online, actual browser/provider and PITR evidence remain NOT VERIFIED. Historical failed online attempts are not promoted to this source candidate.

## Plan 160 campaign continuation, 2 October 2026

Execution policy: the user removed the fixed 24-hour namespace initialisation
waiting period. It is excluded from remaining tasks and completion estimates.
Proceed when namespace authority and actual Xero quota admission checks pass.

- [ ] Verify new source against focused and complete source gates; freeze for protected live verification.
- [ ] Complete lease and scenario drivers if the full campaign is resumed; preserve unfinished tooling outside this merge.
- [ ] Record actual remaining operational requirements and final evidence without promoting unit tests to campaign proof.

### Remaining runtime and campaign work, execution order

- [ ] Implement operational lease acquisition/recovery: exact deployment and registered worker revision, partial ownership retention, independent writer closure, worker drain and settings restoration.
- [ ] Wire actual producer execution to browser subcases, including independent provider/local observations and causal no-call receipts.
- [ ] Implement scheduled X08 driver with real tick/run join and controlled X03/X05/X14/X22 handler drivers, then complete remaining multi-step catalogue cases.
- [ ] Freeze candidate, pass source gates and protected live inventory; execute only scenarios whose sanctioned fixtures, sessions, deployed revision and operation authority are present.
- [ ] Reconcile effects and emit exact-candidate sanitised reports. Missing operational facts and PITR remain NOT VERIFIED.

### Plan 160 deferred native execution work, excluded from merge (2026-10-02)

- [ ] Verify the runtime controller uses the existing SQL advisory transition barrier and complete its focused regression checkpoint.
- [ ] Implement campaign-fenced consumer admission distinct from the ordinary paused/unregistered database-fixture contract.
- [ ] Implement durable native browser supervisor identity and independent cross-process recovery closure.
- [ ] Implement narrowly scoped post-drain cleanup action authority for new-request withdrawal, with no create replay or generic provider deletion.
- [ ] Compose the actual lease members and default CLI path with the native scenario operation factory; bind private actors/session files and reobserve deployment/registration throughout execution.
- [ ] Complete outside-owned baseline/restoration/release evidence, final source gates, exact candidate freeze and coordinated protected live verification.

Checkpoint evidence: 35 credential-free tests passed across native admission, lease recovery, fixture resolution and runtime control; release-tool typecheck passed. Subsequent advisory-barrier and cleanup-only journal-transition corrections remain under focused verification. The default execution adapter is not yet wired and no end-to-end campaign is claimed.

### Plan 160 commit and merge reconciliation, 2 October 2026

- [ ] Complete the requested reviewed commits and merge to main (reviewer owns staging and merge).
- [ ] If verification resumes, replay corrected live integration and execute the approved bounded AU browser/provider flow with existing mandatory controls and independent readbacks.

Review: source delivery and live verification are distinct. The full Plan 160 catalogue is incomplete. Browser/provider actions, deployed candidate and scheduled-job claims, PITR availability and restore exercise remain NOT VERIFIED. A candidate development app/API can exercise the ordinary synchronous AU flow without deployment; it must still satisfy shared sentinel/rate/binding/database guards, exact fixture authority, fresh demo confirmation and authenticated user sessions. No additional framework is required merely to claim a focused flow, and no focused flow result may be promoted to full campaign completion.

### Plan 160 continuation and Plan 163, 4 October 2026

- [ ] Verify authorised bounded AU UI/provider rows and cleanup.

Review: 189 focused database tests pass; ordinary collection skips all 13
protected suites without database access. One Important review finding was fixed
in one pass; no other source findings. Actual Lua regressions are registered in
the protected suite and await live execution. Backup inspection is not a PITR or
destructive restore exercise. CI publication, provider/browser and deployed
worker evidence remain NOT VERIFIED.
