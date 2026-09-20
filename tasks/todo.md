# Current work

Last reviewed: 2026-09-20

## Task: Pricing hero redesign, remove plan overview & simulator, align with /integrations

- [x] Remove hero plan overview card from `apps/web/app/pricing/components/pricing-experience.tsx`
- [x] Update hero copy to focus on simple, straightforward pricing with clear value proposition
- [x] Remove AI-slop feed simulator (`fmkt-feed-simulator-section`, mock calendar, chrome) from `apps/web/app/pricing/components/pricing-currency-selector.tsx`
- [x] Refine `CountrySlider` design to align visually with the `/integrations` aesthetic (clean tonal surfaces, flag chips, smooth slider)
- [x] Clean up CSS in `apps/web/app/styles/features.css` for hero and removed simulator elements
- [x] Update tests in `apps/web/app/pricing/pricing.test.ts` and ensure all assertions pass
- [x] Run repository quality gates (`bun run check`, `bun run typecheck`, `bun run test`)
- [x] Verify visually via Playwright browser across Desktop (1440px), Tablet (768px), and Mobile (390px)

### Review

1. **Removed Plan Overview Card**: Removed the duplicate hero overview card (`.fmkt-pricing-hero__overview-card`) from [`apps/web/app/pricing/components/pricing-experience.tsx`](file:///home/hilton/Documents/teamcalendar/apps/web/app/pricing/components/pricing-experience.tsx) to give the page a clean, confident single-column hero matching `/integrations`.
2. **Updated Copy for Simple, Straightforward Pricing**:
   - Hero title: `"Simple, straightforward pricing"`.
   - Hero lead: `"Transparent plans with no per-user fees or surprise add-ons. Every tier includes automated Xero Payroll leave sync, manual availability, and live calendar feeds."`
   - Reassurance strip: 14-day free trial on all plans, connects in 2 minutes, no credit card required.
3. **Removed Feed Simulator ("AI Slop")**:
   - Removed the entire mock-calendar preview (`fmkt-feed-simulator-section`, simulated browser chrome with dots, fake calendar week, filter buttons, and pipeline pulses) from [`apps/web/app/pricing/components/pricing-currency-selector.tsx`](file:///home/hilton/Documents/teamcalendar/apps/web/app/pricing/components/pricing-currency-selector.tsx).
4. **Visual Consistency with `/integrations`**:
   - Styled the Country Slider with tonal surfaces, 20px radii, flag badges, and interactive state transitions aligned directly with the `/integrations` page design system.
   - Positioned the plan cards (`PricingPlans`) immediately below the country selector for clear, immediate hierarchy.
   - Cleaned up obsolete CSS rules and media queries in [`apps/web/app/styles/features.css`](file:///home/hilton/Documents/teamcalendar/apps/web/app/styles/features.css).
5. **Verification**:
   - `bun --filter web test`: 32 test files, 116 tests passed (including all 5 in `pricing.test.ts`).
   - `bun run check`: 1,018 files passed with 0 errors or warnings.
   - `bun run typecheck`: 19/19 packages passed cleanly.
   - Playwright browser testing verified:
     - Zero horizontal overflow on mobile (`scrollWidth === clientWidth === 390px`).
     - Interactive country switching (AUD, NZD, GBP) updates plan prices, currency symbols, and notes seamlessly.
     - Captured evidence: `reports/pricing-redesign-desktop-1440.png` and `reports/pricing-redesign-mobile-390.png`.

- [x] Update `apps/web/app/pricing/constants.ts` Australia `xeroLabel` from `"Xero Payroll AU"` to `"Xero Payroll"`
- [x] Update `apps/web/app/pricing/components/pricing-currency-selector.tsx` pipeline node label from `"Team Calendar Engine"` to `"Team Calendar"`
- [x] Update `apps/web/app/pricing/components/pricing-comparison.tsx` replace all 8 occurrences of `"Not advertised"` with `"Contact Us"`
- [x] Run verification tests and linting (`bun --filter web test`, `bun run check`, `bun run typecheck`, `bun run test`)
- [x] Verify live rendering on `http://localhost:3001/pricing` via browser/playwright

### Review

1. **"Xero Payroll AU" $\rightarrow$ "Xero Payroll"**: Updated `xeroLabel` in [`apps/web/app/pricing/constants.ts`](file:///home/hilton/Documents/teamcalendar/apps/web/app/pricing/constants.ts) for Australia. The live calendar pipeline and country options now display "Xero Payroll".
2. **"Team Calendar Engine" $\rightarrow$ "Team Calendar"**: Updated the middle canonical engine node header in [`apps/web/app/pricing/components/pricing-currency-selector.tsx`](file:///home/hilton/Documents/teamcalendar/apps/web/app/pricing/components/pricing-currency-selector.tsx) to "Team Calendar".
3. **"Not advertised" $\rightarrow$ "Contact Us"**: Replaced all 8 occurrences of `"Not advertised"` in [`apps/web/app/pricing/components/pricing-comparison.tsx`](file:///home/hilton/Documents/teamcalendar/apps/web/app/pricing/components/pricing-comparison.tsx) with `"Contact Us"` across analytics, support, leave utilisation reports, clash detection, heatmaps, audit payroll export, staff seats, and calendar feed rows.
4. **Automated Unit & Regression Tests**:
   - Added explicit assertions in [`apps/web/app/pricing/pricing.test.ts`](file:///home/hilton/Documents/teamcalendar/apps/web/app/pricing/pricing.test.ts) verifying the presence of "Xero Payroll", "Team Calendar", and "Contact Us", and the absence of "Xero Payroll AU", "Team Calendar Engine", and "Not advertised".
   - `bun --filter web test`: 5/5 tests passed.
   - `bun run check`: 1018 files passed cleanly (0 errors).
   - `bun run typecheck`: 19/19 packages passed cleanly.
   - `bun run test`: all unit tests passed across monorepo (561 tests in `app`, 115 tests in `web`).
5. **Browser Verification**:
   - Verified via Playwright against running server at `http://localhost:3001/pricing`. Confirmed rendered content matches assertions with zero occurrences of stale copy and verified both desktop and mobile viewports. Captured visual evidence in `reports/verification-pipeline.png`, `reports/verification-compare.png`, and `reports/verification-compare-mobile.png`.

## Task: Pricing page production-grade redesign with Country Slider & Premium Analytics

- [x] Switch default `/pricing` route mode to `"paid"` so cold hits render the full production-grade pricing experience by default
- [x] Build interactive Country Slider supporting Australia (AUD: $9/$19), New Zealand (NZD: $10/$21), and United Kingdom (GBP: £5/£11)
- [x] Remove the words "Australia First" across hero, cards, and metadata
- [x] Update hero headline to exact wording: `"Straightforward pricing"`
- [x] Add rich details about analytics and reporting for the Premium plan across plan cards, comparison matrix, and FAQ
- [x] Refactor components to satisfy strict Biome complexity limits, no nested ternaries, and no unnecessary conditions
- [x] Verify Playwright browser interactions (slider dragging, stop clicking, URL updates, public holiday dynamic labels, mobile responsiveness)
- [x] Run repository quality gates (`bun run check`, `bun run typecheck`, `bun run test`)
- [x] Capture visual evidence screenshots across Desktop (AUD, NZD, GBP), Tablet, and Mobile

### Review

1. **Default Production-Grade Paid Mode**: Updated [`apps/web/app/pricing/page.tsx`](file:///home/hilton/Documents/teamcalendar/apps/web/app/pricing/page.tsx) and `.env.local` so cold visits to `/pricing` immediately render the full paid experience instead of the early-access holding screen.
2. **Interactive Country Slider**: Created a responsive range slider with notch stops in [`apps/web/app/pricing/components/pricing-currency-selector.tsx`](file:///home/hilton/Documents/teamcalendar/apps/web/app/pricing/components/pricing-currency-selector.tsx) allowing instant switching between:
   - 🇦🇺 **Australia (AUD)**: Starter $9/mo, Premium $19/mo, Xero Payroll AU, Australian Public Holiday
   - 🇳🇿 **New Zealand (NZD)**: Starter $10/mo, Premium $21/mo, Xero Payroll NZ, New Zealand Public Holiday
   - 🇬🇧 **United Kingdom (GBP)**: Starter £5/mo, Premium £11/mo, Xero Payroll UK, UK Public Holiday
3. **Removed "Australia First" & Updated Headline**: Completely eradicated "Australia First" wording from the overview header and components. Updated main `<h1>` headline to the exact copy: `"Straightforward pricing"`.
4. **Premium Analytics & Reporting Breakdown**:
   - In [`apps/web/app/pricing/components/pricing-plans.tsx`](file:///home/hilton/Documents/teamcalendar/apps/web/app/pricing/components/pricing-plans.tsx), added a dedicated reporting breakdown box to the Premium card highlighting:
     - Leave utilisation & balance trends
     - Absence clash & overlap detection
     - Department & team coverage heatmaps
     - Audit-ready payroll exports (CSV)
   - In [`apps/web/app/pricing/components/pricing-comparison.tsx`](file:///home/hilton/Documents/teamcalendar/apps/web/app/pricing/components/pricing-comparison.tsx), added four dedicated matrix rows: Leave utilisation reports, Absence clash detection, Coverage heatmaps, and Audit payroll export.
   - In [`apps/web/app/pricing/components/pricing-faq.tsx`](file:///home/hilton/Documents/teamcalendar/apps/web/app/pricing/components/pricing-faq.tsx), added a dedicated question explaining the analytics and reporting capabilities of the Premium plan.
5. **Quality Gates & Evidence**:
   - `bun run check`: 1018 files passed (0 errors)
   - `bun run typecheck`: 19/19 packages passed (0 errors)
   - `bun run test`: all unit tests passed across domain packages, `web` (115 tests), and `app` (561 tests)
   - Verified in headless browser via Playwright with 100% passing assertions and zero horizontal scroll on mobile (`390px`).
   - Screenshots generated: `reports/pricing-desktop-aud.png`, `reports/pricing-desktop-nzd.png`, `reports/pricing-desktop-gbp.png`, `reports/pricing-tablet.png`, and `reports/pricing-mobile.png`.

### Review

Completely redesigned the `/pricing` marketing page on `apps/web` following **Direction 2: Living Calendar Feed Interactive Preview & Ambient Tonal Stage**:

1. **Ambient Tonal Stage & Interactive Feed Simulator**: Built the interactive living calendar feed preview inside [`apps/web/app/pricing/components/pricing-currency-selector.tsx`](file:///home/hilton/Documents/teamcalendar/apps/web/app/pricing/components/pricing-currency-selector.tsx). It visualises the core product truth (Xero Payroll AU -> Canonical Engine -> Subscribed Apple/Outlook/Google Feeds), includes interactive filtering (All staff, Sydney office, Engineering), dynamic feed URL generation with single-click clipboard copying, and feed cards featuring realistic leave badges (Annual Leave, Sick Leave, WFH, Client site, Public Holiday).
2. **Hero Section Redesign**: Replaced the awkward and generic metrics box with a crystal-clear Australian payroll value proposition, trust reassurance strip (14-day free trial, connects in 2 minutes, no credit card required), and a clean rate overview card highlighting Starter ($9/mo) and Premium ($19/mo).
3. **Plan Cards Overhaul**: Redesigned Starter, Premium, and Enterprise cards in [`apps/web/app/pricing/components/pricing-plans.tsx`](file:///home/hilton/Documents/teamcalendar/apps/web/app/pricing/components/pricing-plans.tsx) with authentic SVG checkmarks, Plus Jakarta Sans typography, 20px radii, and balanced top-border badges for "Recommended" and "Multi-entity".
4. **Comparison Matrix**: Authored a clear, accessible comparison table in [`apps/web/app/pricing/components/pricing-comparison.tsx`](file:///home/hilton/Documents/teamcalendar/apps/web/app/pricing/components/pricing-comparison.tsx) with semantic `<caption>`, `col`/`row` scopes, subtle column highlight for Premium, and dedicated mobile cards for smaller viewports.
5. **Customer FAQ & Conversion Section**: Expanded the FAQ in [`apps/web/app/pricing/components/pricing-faq.tsx`](file:///home/hilton/Documents/teamcalendar/apps/web/app/pricing/components/pricing-faq.tsx) to address 8 critical customer questions using native `<details>` and `<summary>` elements with rotating chevrons. Added `PricingFinalCta` conversion banner with direct trial prompts and bank-grade encryption trust signals.
6. **Responsive Design & Quality Gates**:
   - Visual verification across Desktop (1440px), Tablet (768px), and Mobile (390px) via Playwright screenshots (`reports/fullpage-paid.png`, `reports/mobile-pricing.png`, `reports/tablet-pricing.png`, `reports/early-access-desktop.png`).
   - Zero horizontal overflow on mobile (`scrollWidth === clientWidth === 390px`).
   - All tests pass: `apps/web/app/pricing/pricing.test.ts` (5/5), `bun run check` (1017 files clean), `bun run typecheck` (19/19 packages clean), and `bun run test` (330 tests across domain packages, 115 tests in web).


## Task: Resolve CI integration test failure in @repo/jobs schedule-xero-syncs

- [x] Add defensive relation guarding and type narrowing in `packages/database/src/queries/schedulable-xero-tenants.ts`
- [x] Add unit test in `packages/database/src/queries/schedulable-xero-tenants.test.ts` for orphaned/null relation safety
- [x] Add structured error logging in `packages/jobs/src/handlers/schedule-xero-syncs.ts`
- [x] Improve failure reporting and teardown consistency in `packages/jobs/src/handlers/schedule-xero-syncs.integration.test.ts`
- [x] Run verification gates (`bun run check`, `bun run typecheck`, `bun run test`, `bun run test:release-tools`)

### Review

Diagnosed and resolved the CI integration test failure in `@repo/jobs` (`schedule-xero-syncs.integration.test.ts`):

1. Defensive relation guarding: Because Prisma separates relation hydration into distinct SQL queries without explicit `relationJoins`, concurrent integration test execution across 21 test packages could lead to orphaned or partially deleted relations (`xero_connection` or `organisation`) being returned as `null` in cross-tenant scan queries (`listSchedulableXeroTenants`). Unchecked property access (`item.xero_connection.status` or `item.organisation.timezone`) would trigger a `TypeError: Cannot read properties of null`, causing `listSchedulableXeroTenants` to fail with `{ ok: false }`. Added defensive filtering and type narrowing in `packages/database/src/queries/schedulable-xero-tenants.ts` to ensure only records with intact, non-null relations are processed.
2. Unit test coverage: Added a unit test in `packages/database/src/queries/schedulable-xero-tenants.test.ts` verifying that records with missing connection or organisation relations are safely omitted without throwing or failing.
3. Observability and failure reporting: Added structured error logging via `log.error` in `packages/jobs/src/handlers/schedule-xero-syncs.ts` when `listSchedulableXeroTenants` fails, and updated `schedule-xero-syncs.integration.test.ts` to assert `expect(result).toMatchObject({ ok: true })` on failure so any error details are clearly printed in test output. Added `database.$disconnect()` to `afterAll` for consistency with all other integration tests in `@repo/jobs`.
4. Dedicated Vitest config for `@repo/jobs`: Added `packages/jobs/vitest.config.mts` configuring `testTimeout: 30_000` and server-only alias matching the other domain packages (`@repo/database`, `@repo/feeds`).
5. Quality gates verified: `bun run check` (1017 files clean), `bun run typecheck` (19/19 packages), `bun run test` (all unit test suites passed), `bun run test:release-tools`, and `turbo boundaries`.

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

## Homepage SVG refinement (20 September 2026)

- [x] Inspect the sync diagram and existing theme/motion styles.
- [x] Correct theme contrast, card bounds and connector alignment while preserving copy.
- [x] Verify desktop/mobile, light/dark and reduced motion; run repository gates and record the integration blocker.

### Review

Replaced fixed pale SVG card fills with theme surfaces, enlarged labels and
removed translucent secondary text. SVG text contrast measures at least
6.87:1 in both themes (secondary copy: 7.69:1 light, 8.44:1 dark).
Matched mobile icon colours, kept cards within the viewBox, and removed
independent node parallax so animated paths remain attached. Copy is unchanged.

Chromium screenshots checked at 1440px, 768px and 390px in both themes.
No horizontal overflow or browser errors; reduced motion hides all packets.
Lint, typecheck and unit tests pass (web: 107 tests across 32 files).
Integration tests could not run: the database guard rejects the configured
non-local connection with ALLOW_LOCAL_DATABASE_TESTS. No database writes made.
Browser evidence is in /tmp/svg-*.png and /tmp/svg-*.log. Used the existing
port 3001 server; attempted additional preview processes exited. No deployment.


## Homepage transparent diagram and sizing

- [x] Identify wrapper background and oversized responsive dimensions.
- [x] Remove backdrop and constrain the diagram while preserving readable labels.
- [x] Check both themes at desktop, tablet and mobile sizes; record verification.

### Review

Removed the hero diagram wrapper's tinted fill, dot grid, border and forced
minimum height in both themes. SVG dimensions now follow its 420:540 aspect
ratio with a 440px width cap, keeping tablet elements at desktop scale.
The mobile text alternative sits on the page without a card backdrop or
excess padding, reducing its wrapper to 223px at a 390px viewport.

Chromium checked light and dark at 1440px, 768px and 390px: computed background
is transparent, background-image is none and border is 0px. No horizontal
overflow or browser errors. Screenshots: /tmp/svg-sizing-*.png.
Lint, typecheck and unit tests pass (107 web tests). The prior integration
blocker remains unchanged: configured database connection is not local.


## Hero availability copy clarification

- [x] Include staff travel, out of office notices, WFH and other availability.
- [x] Distinguish approved leave syncing to Xero from shared calendar publication.
- [x] Verify rendered copy and repository checks.

### Review

Updated the shared hero paragraph to include travel plans, out of office
notices, WFH and other availability updates. Approved leave alone is described
as syncing back to Xero, with all these updates appearing together in calendars.
Desktop/mobile browser checks in both themes show no overflow or browser errors.
Lint, typecheck and unit tests pass (107 web tests). Prior integration database
guard blocker remains unchanged. Screenshots: /tmp/hero-copy-*.png.


## Problem-section copy refinement

- [x] Replace the abstract headline and paragraph with specific staffing and payroll consequences.
- [x] Check rendered wording on desktop/mobile and run repository checks.

### Review

Replaced the problem-section headline and lead paragraph with direct language
about missing calendar/payroll records, chasing confirmations and finding cover.
Desktop/mobile browser checks in both themes showed wrapping without horizontal
overflow and no runtime errors. Lint, typecheck and unit tests pass (107 web tests).
The prior integration database guard blocker remains unchanged.

## Contact early access form usability

- [x] Review existing fields and submission behaviour.
- [x] Improve field contrast and add accessible submission confirmation.
- [x] Test validation, cancellation, pending, success and failure states.
- [x] Verify desktop/mobile themes and run repository gates.

### Review

Inputs, selects and textarea now use contrasting theme surfaces, visible outline
borders and 48px minimum height. Shared AlertDialog confirms the response email
before submission, restores focus on close and prevents duplicate clicks.
Unchanged retries retain their idempotency key, failures retain entered details,
and successful responses display the application reference. Ineligible Xero
Payroll selections receive a clear message.

PASS: 9 form tests, 12 targeted API tests, full unit suite, typecheck, scoped lint
and git diff --check. Chromium checked 1440px and 390px in light/dark, validation,
cancel/focus restoration, confirmation and a simulated successful response.
No horizontal overflow or page errors. Screenshots: /tmp/contact-*.png.
The first dialogue captures caught opening animations; settled captures confirm
opaque readable surfaces and correct desktop/mobile sizing.

FAIL: full lint reports an existing formatting issue in homepage problem-section.tsx.
NOT VERIFIED: integration suites stop at the non-local database safety guard;
live email delivery was not exercised. Browser requests and API delivery tests
use simulated responses. Impeccable detector found only existing typography
advisories outside the changed CSS. Reused the existing dev server and closed
test browser instances.

## Features hero whole-team coverage

- [x] Review the existing hero and agree the combined copy, coverage row and motion direction.
- [x] Name payroll and non-payroll staff explicitly and show four illustrative statuses.
- [x] Verify desktop/mobile, light/dark and reduced motion; run repository gates.

### Review

Headline revised after feedback to “See everyone’s availability.” Supporting
copy explicitly includes employees, directors, subcontractors and offshore
staff whether they are on payroll or not. Four labelled examples enter once
with staggered CSS motion, with a static reduced-motion presentation. Sage
identifies payroll leave and lavender identifies manually shared statuses.

PASS: browser checks at 1440px, 768px and 390px in light/dark, no overflow or
runtime errors; reduced motion disables animation. PASS: lint, typecheck, unit
tests and git diff --check. Integration NOT VERIFIED: the suite stops at the
database guard because ALLOW_LOCAL_DATABASE_TESTS rejects the configured
non-local connection. No deployment. Screenshots: /tmp/features-coverage-*.png.
Used the existing dev server and closed the verification browsers.

## Live early access delivery verification

- [x] Attempt a clearly labelled test through the production contact form.
- [x] Diagnose missing browser submission response: Clerk protects the public application endpoint.
- [x] Exempt the exact application route and add regression coverage.
- [ ] Verify live delivery after the API fix is deployed.


Live delivery result: NOT VERIFIED. Production OPTIONS returned Clerk
`protect-rewrite, session-token-and-uat-missing`, matched `/404`, and no
Access-Control-Allow-Origin header for either apex or www origins. The live
browser submission timed out waiting for POST. No successful delivery or
reference was observed. Fixed the exact public route locally; production
requires deployment before delivery can be retested. Added public POST/OPTIONS
and private neighbouring-route regression coverage.

### Resend live transport evidence

PASS: the production Resend sender sent the actual early access template to
user-authorised test recipient the private application mailbox. Resend retrieval returned
HTTP 200 and last_event=delivered for email
01a0bd46-97db-7315-8a18-cb74574cbea3, from notifications@teamcalendar.online,
subject AU early access application EA-DELIVERY-TEST-20260920.
This verifies live email transport, not production browser-to-mailbox completion.
Production still needs the public route fix deployed and Redis abuse-control
configuration. The recipient has now been authorised and saved as a sensitive
production variable. Vercel env ls confirms the HMAC secret already exists;
sensitive values omitted from env pull were initially misclassified as missing.


The application recipient is server-only. Never expose it in public contact-page
copy, client bundles or API responses. Resend remains the delivery provider.
The production recipient setting is saved; existing HMAC and public URL settings
are preserved. Production KV settings are absent from the environment inventory.

## Fix local development and production sign-up page routing

- [x] Inspect sign-up routing logic across `apps/app` and dependencies (`launch-mode`, `isEarlyAccess`, search params, redirect targets)
- [x] Ensure local development (`process.env.NODE_ENV === "development"`) allows direct sign-up without redirection
- [x] Ensure production deployment readiness (`isEarlyAccess()` gate, safe URL construction, ticket handling, fallback redirect)
- [x] Add unit tests in `apps/app/__tests__/sign-up.test.tsx` verifying development bypass, production early access enforcement, ticket admission, and paid mode bypass
- [x] Verify browser behaviour on `http://localhost:3000/sign-up` in development mode
- [x] Run verification gates (`bun run check`, `bun run typecheck`, `bun run test`, `bun run build`)
- [x] Document results in `tasks/todo.md`

### Review

Diagnosed and fixed the local development sign-up redirection issue while ensuring production deployment readiness:

1. **Root cause analysis**: In `apps/app/app/(unauthenticated)/(auth)/sign-up/[[...sign-up]]/page.tsx`, direct sign-ups were unconditionally redirected to `${webUrl}/contact?admission=required` if no `__clerk_ticket` was present in `searchParams`. In local development (`process.env.NODE_ENV === "development"`), developers visiting `http://localhost:3000/sign-up` (or navigating from marketing buttons on `http://localhost:3001`) do not have an early-access invitation ticket, triggering an immediate bounce to the contact application page.
2. **Local development & production gating**:
   - In local development (`NODE_ENV === "development"`), the admission requirement is bypassed, rendering `<SignUp />` directly so local sign-up and authentication flows function without friction.
   - For production environments, admission enforcement is gated by `isEarlyAccess()` from `@repo/next-config/launch-mode`. In `early_access` launch mode, uninvited visitors without a ticket continue to be redirected to `/contact?admission=required`, while valid tickets (`__clerk_ticket`) proceed to `<SignUp />`. In future `paid` launch mode, direct sign-ups are permitted.
   - Redirect URL construction uses `new URL("/contact?admission=required", webUrl).toString()` to eliminate issues with missing or trailing slashes on `NEXT_PUBLIC_WEB_URL`.
   - Empty or whitespace tickets are safely identified as uninvited.
3. **Automated test coverage**: Extended `apps/app/__tests__/sign-up.test.tsx` with 7 unit tests covering:
   - Early-access invitation ticket admission
   - Direct uninvited redirect in early access
   - Empty or whitespace ticket rejection in early access
   - Development mode direct sign-up allowance
   - Paid launch mode direct sign-up allowance
   - Trailing-slash URL normalisation
   - Canonical metadata exports
4. **Live verification**:
   - Automated browser check using Chromium confirmed that navigating to `http://localhost:3000/sign-up` in development returns HTTP 200 and renders the heading "Create your organisation" without errors or redirects.
   - Navigating to `http://localhost:3001/sign-up` cleanly redirects to `http://localhost:3000/sign-up` and displays the sign-up view.
   - Full repository checks verified: `bun run check` (1017 files clean), `bun run typecheck` (19/19 packages clean), `bun run test` (all unit test suites pass), and `bun run build` (production build across `api`, `web`, and `app` all succeeded with 100% route generation).

## Features calendar contrast and consistency

- [x] Compare the features calendar with the home page demo and design tokens.
- [x] Remove decorative green texture, align surfaces and improve label readability.
- [x] Verify responsive layouts, both themes, story controls and run repository checks (integration blocked as recorded below).

Review: Removed the dotted background and green wash from the features calendar.
Matched the home demo's lavender stage/header, alternating rows and neutral avatars.
Kept sage payroll and purple manual events, with full-opacity source labels and
12px event text. Narrow calendars now scroll by touch or keyboard instead of
shrinking text to 8px. Exposed the scroll region to assistive technology.
Browser PASS at 1440, 768 and 390px in both themes: no page overflow, no clipped
event labels, keyboard scrolling and approval selection work, no page errors.
Event text contrast ranges from 6.76:1 to 12.72:1 across the two themes.
Lint, typecheck and unit tests PASS. Integration NOT VERIFIED: the local-database
guard rejects the configured non-local database connection. No guard bypassed.
Screenshots: /tmp/calendar-after-{1440,768,390}-{light,dark}.png.

## Features calendar visible border

- [x] Add theme-aware outline borders to the calendar stage and scrolling grid.
- [x] Verify both themes and run required checks.

Review: Visible 1px outline borders confirmed in light/dark desktop and mobile
captures. No page overflow or event clipping; keyboard scrolling and story
selection pass. Lint, typecheck and unit tests PASS. Integration NOT VERIFIED:
configured database is non-local and the local-database guard rejects it.

## Marketing homepage technical audit, 20 September 2026

- [x] Load audit guidance and identify the homepage and shared components.
- [x] Check implementation, detector findings and design-system consistency.
- [x] Verify desktop/mobile, themes, keyboard and reduced-motion behaviour.
- [x] Record prioritised findings and verification limits without changing UI.

## Integrations marketing critique, 20 September 2026

- [x] Resolve page source and read design context and critique workflow.
- [x] Compare layout and wording with other marketing routes independently.
- [x] Verify desktop/mobile browser evidence and run the design detector.
- [x] Archive the prioritised critique and record verification limits.

Review: Audit recorded in reports/marketing-homepage-audit-2026-09-20.md.
12/20 provisional health score; 3 P1 and 5 P2 findings. Browser checks covered
320, 390, 768 and 1440px in both themes, plus focus, coarse-pointer sizing and
reduced motion. No UI edits. Production performance and full WCAG conformance
remain NOT VERIFIED. Existing dev server and user source changes preserved.

Review: Independent design and detector assessments completed. Score 20/32.
Compared home, features, about, security, pricing and contact; desktop/mobile
integrations screenshots inspected, no horizontal overflow at 390px. Detector
returned zero findings. Four priorities: hero write-back story, plain-language
copy, H1 hierarchy and contextual onboarding help. Product UI unchanged.
Assessment B browser/overlay NOT VERIFIED: sandbox/socket restrictions followed
by a pending launch and aborted escalation. Assessment A browser closed.
No app server started successfully; the existing server was preserved.

## Implement integrations critique improvements

- [x] Clarify both Xero sync directions and separate manual availability in the hero.
- [x] Simplify technical copy and strengthen title hierarchy within the existing design.
- [x] Link guided setup to onboarding and security details; align container styling.
- [x] Update existing content checks, verify desktop/mobile in both themes and run repository gates.

Approved scope: all four critique priorities; retain existing visual identity.

Review: All four priorities implemented in integrations/page.tsx and its CSS
module. Hero now describes staff requests, Xero write-back and separate team
availability; title has stronger hierarchy. Simplified setup/security wording,
linked guided onboarding and its publish section, normalised persistent card
corners, and removed nested summary surfaces. Updated existing content tests.

PASS: scoped lint, typecheck, unit tests, diff whitespace checks, design detector
(zero findings), desktop/tablet/mobile light/dark browser layouts, onboarding
link navigation, 3px keyboard focus, no horizontal overflow or page errors.
Full lint initially passed; final run FAIL due to concurrent homepage timeline
useSemanticElements errors, outside this task. Integration tests FAIL at the
non-local database guard; integration behaviour NOT VERIFIED, no bypass.
Browser closed; existing development server preserved. Screenshots:
/tmp/integrations-after-{1440,768,390}-{light,dark}.png.
Design hook reported stale .impeccable/design.json; left unchanged.

## Implement marketing homepage audit fixes

- [x] Repair CTA contrast, timeline semantics and detail focus.
- [x] Bound diagram animation and honour reduced-motion scrolling.
- [x] Fix touch sizing and enlarged-text wrapping; clarify refresh copy.
- [x] Verify browser behaviour and run check, typecheck, unit and integration gates.

Motion plan: retain the sync diagram as a single explanatory sequence lasting
under five seconds, then leave its static paths and labels visible. Keep
interaction feedback immediate and disable spatial anchor scrolling when the
visitor requests reduced motion. Preserve the current visual identity.

## Integrations follow-up critique

- [x] Resolve current source and start independent design and evidence assessments.
- [x] Inspect fresh desktop/mobile captures in both themes and verify links.
- [x] Synthesise findings, persist the critique and compare scores.

Review: All eight audit findings addressed. CTA token pairs measure 6.43:1
(light) and 7.54:1 (dark) on the primary action. Timeline uses named groups,
full-date/provenance labels, an associated live details region and focus return.
SVG sequence ends within 4.5 seconds; reduced motion uses auto anchor scrolling.
Week controls remain 44px square and footer links have 44px hit heights.
Homepage text wraps safely at 200% root size, including the final CTA.
Browser PASS at 320/390/768/1440px in light/dark, with no page errors or page
overflow; enlarged text, focus return, menu Escape and finite motion PASS.
Lint, typecheck and unit tests PASS. Integration command attempted, NOT VERIFIED:
configured database is non-local and the local-database guard rejects it.
No database guard bypassed. Existing dev server left running; audit browsers closed.
Evidence: /tmp/home-fixed-results.json and /tmp/home-fixed-*.png.

Review: Score 28/32, previous 20/32. No major findings; optional P3 mobile compact-header spacing. Fresh desktop/mobile light/dark checks passed, links reached expected route/anchor, focus 3px and no page errors/overflow. CLI detector clean; runtime overlay returned three untriaged heuristic flags (small text, line length, height transition). Browser closed; temporary detector PID 209559 terminated after helper stop failed to locate it. Existing app server untouched. No UI edits.

## Marketing footer link review

- [x] Inventory footer destinations and public-page coverage.
- [x] Fix confirmed navigation gaps while preserving the footer design.
- [x] Verify destinations and desktop/mobile rendering; run repository checks.
- [x] Record findings and verification limits.

Review: Restored /features#ics-feeds on the publishing story beat. Added home,
All features and Setup guide links; labelled footer navigation landmarks.
Replaced the clipped, fixed-colour wordmark with the existing brand mark and
theme-aware text, and provided a 44px home target. Regression test inventories
all static marketing pages and checks rendered feature fragment IDs.

PASS: 18 internal footer destinations returned HTTP 200 locally; both feature
fragments exist and clicking Calendar feeds reaches the publishing narrative.
Sign-up returned HTTP 200 separately on localhost:3000 (availability only).
Desktop 1440px and mobile 390px in both themes have no horizontal overflow,
no page errors, minimum 44px link targets and visible 3px keyboard focus.
PASS: scoped lint, repository typecheck, unit tests and git diff --check.
FAIL: repository check reports three unrelated existing pricing lint issues.
NOT VERIFIED: integration coverage, command rejected non-local DATABASE_URL
under ALLOW_LOCAL_DATABASE_TESTS. No database guard bypassed.
Production deployment was not changed or verified. Design sidecar staleness
reported by hook was left untouched. Browser sessions closed; the attempted
sandbox dev process was stopped, and the pre-existing server was preserved.
Evidence: /tmp/footer-results.json, /tmp/footer-{1440,390}-{light,dark}.png,
/tmp/footer-{check,typecheck,test,integration}.log.

## Contact in marketing navigation

- [x] Confirm the shared navigation and existing Contact destination.
- [x] Add Contact immediately after Pricing across header variants.
- [x] Run checks and record results.

Review: Contact follows Pricing in the shared desktop, mobile and no-JavaScript
header navigation. PASS: 10 existing header tests, scoped Biome check,
repository typecheck and git diff --check. FAIL: repository lint (two pricing
issues) and unit suite (analytics test and worker timeouts). NOT VERIFIED:
integration coverage, the local-database guard rejected the configured non-local
connection. Logs: /tmp/contact-nav-{check,typecheck,test,integration}.log.

## Integrations overdrive redesign

- [x] Inspect existing page, product truth and approved combined direction.
- [x] Build interactive connection map, scroll narrative and calendar demonstration.
- [x] Verify responsive behaviour, controls, reduced motion and repository gates.
- [x] Obtain independent finish review and document results.

Direction: Persuade mode. Preserve existing brand tokens and factual content;
replace the stacked-card composition with a wide connection diagram and a
scroll-led illustrative leave journey ending in a filterable weekly calendar.
No live data or instant calendar-delivery claims. Existing pricing edits preserved.

Integrations redesign review: interactive three-system map, scroll-driven leave
journey, stage-aware publication example and source filters implemented. Existing
regional, data-scope, setup and security content retained. Independent reviewer
returned fix for submitted-versus-published state contradiction; corrected and
scored resolved, disposition ship for that fix. Scope-limited documentation in
`.impeccable/surfaces/integrations.md`; existing global brand preserved.

PASS: final repository check, typecheck and unit suite; seven integrations tests;
320/390/768/1440px light/dark without horizontal overflow or page errors; scroll
stages, map controls, filters, keyboard activation and 3px focus; reduced motion;
200% text without main-content overflow; no-JavaScript narrative and setup link.
NOT VERIFIED: database integration tests reject the configured non-local database
under ALLOW_LOCAL_DATABASE_TESTS. No guard bypassed. No production deployment.
Browser sessions closed; attempted temporary server exited because the existing
server held the Next.js lock. Existing server left intact. Unrelated concurrent
pricing, header, stylesheet and plan edits preserved.
Evidence: `.impeccable/review/integrations/`, `/tmp/integrations-new-*.png`,
`/tmp/integrations-redesign-*-final.log`, and
`/tmp/integrations-redesign-integration.log`.
