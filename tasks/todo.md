# Current work

Last reviewed: 2026-09-20

## Task: Resolve CI workflow failures and make integration test execution robust

- [x] Fix package import resolution for `@repo/database/live-test-fixture` in `apps/app/vitest.integration.config.mts`
- [x] Add safe local test database support in `packages/database/src/live-test-guard.ts`
- [x] Add deterministic local fixture allocation fallback in `packages/database/src/live-test-fixture.ts` for local/CI test databases
- [x] Configure `test:integration` in `package.json` and `.github/workflows/ci.yml` for robust local/CI integration testing
- [x] Add tests verifying both guarded live database enforcement and local database integration execution
- [x] Verify repository gates: `bun run check`, `bun run typecheck`, `bun run test`, `bun run test:release-tools`, and `bun run test:integration`

### Review

Diagnosed and fixed the root causes of CI workflow run failures during deployment and integration test steps:

1. `@repo` path alias shadowing: In `apps/app/vitest.integration.config.mts`, an object alias configuration resulted in Biome sorting `"@repo"` before subpath entries, preventing `@repo/database/live-test-fixture` from resolving. Replaced with an array alias maintaining explicit precedence.
2. Local/CI database guard and fixture support: Integration tests converted to `allocateLiveTestFixture()` failed on ephemeral CI Postgres service containers (`localhost:5432`) because the guard required remote Neon credentials and release manifests. Added `isLocalDatabase()` check and `ALLOW_LOCAL_DATABASE_TESTS="1"` support in `packages/database/src/live-test-guard.ts` and `packages/database/src/live-test-fixture.ts`. When running against local test databases without a remote release manifest, fixtures are deterministically partitioned into disjoint tenant slots and UUIDs across all 21 registered integration suites. Unit test isolation is fully preserved.
3. Updated CI and workspace test scripts: Scoped `ALLOW_LOCAL_DATABASE_TESTS=1` specifically to `test:integration` in `package.json`, workspace packages, and `.github/workflows/ci.yml`.
4. Automated verification: Added tests in `live-test-guard.test.ts` and `live-test-fixture.test.ts` verifying safe local database detection, remote database blocking, and deterministic slot partitioning. All repository quality gates passed: `bun run check` (1016 files clean), `bun run typecheck` (19/19 packages), `bun run test` (110 test files, 557 tests), `bun run test:release-tools`, `turbo boundaries`, and `bun run build`.


- [x] Relocate `.woff2` font files to `packages/design-system/fonts/`
- [x] Update `packages/design-system/lib/fonts.ts` font source paths
- [x] Remove `.ds-sync/` local directory
- [x] Remove `.design-sync/` from Git repository
- [x] Clean up `.gitignore` obsolete design-sync entries
- [x] Run full verification suite (`check`, `typecheck`, `test`, `build`)

### Review

Relocated the three self-hosted font files (`plus-jakarta-sans.woff2`, `lora-regular.woff2`, `lora-italic.woff2`) directly into `@repo/design-system` at `packages/design-system/fonts/`. Updated `packages/design-system/lib/fonts.ts` to source local fonts from `../fonts/`.

Retired and purged the obsolete design-sync tooling and artifact folders:
- Removed local untracked `.ds-sync/` runner directory and `ds-bundle/` cache.
- Removed tracked `.design-sync/` directory containing old preview components, stubs, and configuration.
- Cleaned up obsolete design-sync entries in `.gitignore`.

Verified with full repository gates: `bun run check` (1015 files clean), `bun run typecheck` (19/19 packages passed), `bun run test` (all unit test suites passed), and `bun run build` (all Next.js apps `app`, `web`, and `api` built production bundles with 100% route generation success).

## Task: Pre-live database review, cleanup, and migration verification

- [x] Audit all 32 models & tables across schema.prisma, database, PRODUCT.md, and application usages.
- [x] Drop old, unmigrated, and outdated tables in the public database schema.
- [x] Deploy the complete 15-migration chain using `bun run migrate:deploy` to establish clean, immutable schema history.
- [x] Seed canonical production billing plans and limits via `syncPlansFromCatalogue`.
- [x] Verify zero schema drift, up-to-date migration status, and passing validation gates.

### Review

All 32 models in `packages/database/prisma/schema.prisma` and their database counterparts were reviewed for live usage and active contracts across all monorepo applications and domain packages. Every model was confirmed to be actively used with no dead code.

The existing database tables in Neon were unmanaged (with an empty `_prisma_migrations` table) and outdated (lacking `outbound_operations` and the latest `stripe_events` delivery-state columns and enums).

Authorized destruction was performed to drop all outdated tables and enums from the public database schema. The complete 15-migration chain was deployed cleanly from scratch using `bun run migrate:deploy`, establishing an immutable and verified migration record in `_prisma_migrations`. Canonical billing tiers (`basic`, `premium`, `enterprise`) and plan limits were seeded. Zero schema drift was confirmed against `schema.prisma`, `prisma migrate status` confirmed up-to-date status, and all repository quality gates (`check`, `typecheck`, `test`, `boundaries`, and `build`) passed.

## Documentation task: replace go-live plans

- [x] Check the plan against current repository contracts, scripts and open work.
- [x] Create `plans/go-live.md`, remove both superseded files and update references.
- [x] Verify the standalone plan, links and removal of stale references.

### Review

Complete. Created `plans/go-live.md` and removed both previous files without
redirects. Checked the plan against current product/design contracts, manifests,
CI, preflight, job registration and open remediation. It now records the actual
repository baseline, Plans 144–146, external security/browser follow-ups,
execution order and evidence-based release criteria.

Updated the plan index and active task reference. Verified that both old files
are absent, no stale filename references remain, local links resolve, listed
scripts exist, and document structure/whitespace checks pass. Application and
release gates were not executed for this documentation-only change. Existing
implementation changes and release verification status are preserved.

## Active plan: Australian go-live implementation and release validation

Source: `plans/go-live.md`. Tested source candidate:
`822a7c659509765df7be9fb99f22abce3d798b7a`. Documentation context:
`17c34db41d51c47b20d0323222e77e7d0d541ee2`. Repository 6.0.2,
Bun 1.4.0. The baseline remote check found only `main`. No remote push or
production deployment was performed.

### Tasks

- [x] Establish Git state and preserve supplied plan and unrelated changes.
- [x] Archive historical task evidence and carry forward unresolved follow-ups.
- [x] Read current product, design, architecture, environment and release contracts.
- [x] Record build, static checks, types, tests and configured migration state.
- [x] Reconcile improve plans and retired Git preview execution policies.
- [x] Audit direct dependencies, complete stable upgrades and verify the lockfile.
- [x] Complete the deep improve audit and integrate verified AU-launch source fixes.
- [x] Verify configured Neon migration history and zero schema drift.
- [x] Prove the committed migration chain against an independent fresh empty database.
- [ ] Complete end-to-end tenant, role, Xero write, feed, job and notification workflows.
- [x] Use Impeccable for UI remediation and source-level final review.
- [ ] Run production-like app/API/web and role-based Australian browser workflows.
- [ ] Complete dashboard timeline and feed URL desktop/mobile/light/dark browser follow-ups.
- [x] Run frozen install, database client build, check, build, typecheck, boundaries, unit and integration gates.
- [ ] Make app/API/web production preflights pass for the configured launch mode.
- [x] Run docs validation and the React Email build.
- [x] Reconcile plans and documentation, review fixes and integrate verified source work locally.
- [x] Produce the evidence-based readiness report for the exact tested candidate.

### External security follow-ups carried forward

- [ ] Verify rotation of the credential formerly exposed in `.mcp.json`.
- [ ] Obtain GitHub Support purge of retained pull-request refs and cached commit views.
- [ ] Re-audit a fresh remote mirror after purge.

### Review

Source remediation and automated repository verification are complete for the
recorded candidate. Frozen install, database client generation, repository
checks, app/API/web builds, typecheck, boundaries, unit and integration suites,
configured Neon migration status and drift, docs lint and React Email build
passed. Recent live AU people, leave and balance sync runs also succeeded.

The decision remains `NOT READY FOR GO-LIVE`. Production preflights fail on
missing configuration, the latest app and web deployments are in error, and
fresh-database migration proof, physical browser coverage, authenticated role
workflows, outbound Xero write-back and external security follow-ups are not
verified. See `tasks/go-live-readiness-report.md`. No remote push or deployment
was performed.

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
- [x] C6: empty and missing manager scope fails closed. Focused availability
  suites pass 42 tests in 3 files.
- [x] C4/C5: missing email transport fails before queue selection and malformed
  availability JSON returns 400 after authentication. Focused suites pass 49 tests.
- [x] R1/R2/R3 and T3: source contracts and focused gates pass on declared
  Node/Bun versions; deployed evidence remains part of O1.
- [x] G3: provisional identity and obsolete launch/region claims removed. Focused
  web suites pass 22 tests in 5 files.
- [x] P4/P5 source and privacy behaviour: public provider excludes auth, analytics
  initialisation is conditional and URL data is sanitised. Identical Turbopack
  analyses reduced `analyze.data` from 540,368 to 507,582 bytes and
  `modules.data` from 2,149,679 to 1,996,006 bytes. These are analyser metadata
  sizes, not compressed route-JavaScript savings.
  Decoded Turbopack data shows Clerk browser parts fell from 65 parts
  (110,455 raw / 34,964 per-part compressed bytes) to zero. Home browser module
  parts fell from 2,678,373 / 1,181,555 to 2,533,524 / 1,133,010; About from
  2,564,021 / 1,156,608 to 2,417,857 / 1,107,839; Pricing from
  2,631,576 / 1,168,019 to 2,486,744 / 1,119,481. These totals include async
  chunks and are not network initial-transfer sizes. PostHog moved out of the
  app entry synchronous graph. A real intercepted `posthog-js` Chromium
  delivery produced exactly identify, group-identify and two page-view events,
  with no query/fragment markers or browser errors.
- [x] C1/C2/C3 source: submit side effects remain recoverable through durable
  completion; provisioning deduplicates; failed/equal-time Stripe deliveries
  reconcile authoritatively and remain replayable. Live journey proof remains.
- [x] P1/P2/P3 source: Plans, People and sync views use bounded, stable pages,
  exact scoped counts and batched hydration. Guarded database parity proof is
  still part of D1/T1.
- [x] G1 source: early-access application, invite-only entry contract, stable
  provider idempotency and durable activation capture are implemented. Provider
  mailbox, Clerk role and delivered production evidence remain open.
- [ ] T1: Playwright runner and production Clerk CSP repair exist. All 30
  journeys fail closed without candidate/manifests, use exact owned records,
  fresh role contexts and a durable local create ledger with cleanup. No live
  mutation journey has run because required provider configuration and
  sanctioned candidate deployments are still absent.
- [x] T2 source and local gates: docs links and rendered email checks pass.
- [ ] G2 and O1: production configuration, candidate deployment, rollback-aware
  live journeys, monitoring/alerts and launch decision remain open.

### Current external evidence

- Live Neon read-only identity and the 12 applied migration checksums were
  verified; project/branch/restore metadata is still unavailable.
- API health responds; the deployed Inngest registration endpoint fails because
  production signing configuration is absent.
- App and web deployment configuration was repaired for the prior partial
  Better Stack group, then the unrelated status integration was explicitly
  disabled. A reviewed candidate has not been deployed.
- Host Bun 1.3.14 is not release evidence; candidate gates use the existing
  `/home/hilton/.bun/bin/bun` 1.4.0 executable.

## Worktree consolidation and cleanup (20 September 2026)

- [x] Inventory registered worktrees, branches, stashes and local changes.
- [x] Confirm both secondary worktree commits are already included in `main`
  and that `origin/main` matches the local main commit.
- [x] Inspect ignored files and preserve any unique local configuration or
  verification evidence before removing obsolete worktrees.
- [x] Remove the two merged secondary worktrees and the merged candidate branch;
  prune stale worktree and remote-tracking metadata.
- [x] Verify the remaining worktree, commit reachability and clean Git status,
  then record the result.

### Review

Both secondary worktree tips were already ancestors of `main` at `1910b3aa`:
the candidate branch at `816b1811` and detached Kilo worktree at `e60aaba1`.
Removed both worktrees, the merged `codex/go-live-candidate` branch and two
empty preview directories. Pruned Git worktree and remote-tracking metadata.
The main checkout is the only remaining worktree and branch.

Preserved the ignored historical audit mirror at
`.tmp/worktree-cleanup-2026-09-20/release-remote-mirror.git`. No uncommitted work,
stashes or unique environment files were found in the removed worktrees.

Verification: commit ancestry, remote main equality before this task's log
commit, clean worktree status, no unmerged branches, `git diff --check` and
`git fsck --full --no-dangling`. No application source changed, so application
test suites were not rerun. The cleanup record is committed locally; no remote
push or deployment was performed.
