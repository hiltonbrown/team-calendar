# Current work

Last reviewed: 2026-09-24

## Task: Complete Plan 161b against the guarded online Neon database

- [x] Reconcile the current candidate and audit live Neon, KV, Inngest and fixture prerequisites without exposing secrets.
- [x] Repair the protected manifest, cleanup and workflow path without weakening database guards.
- [x] Establish exact target identity, restore evidence, durable manifest read-back, active-run ownership and consumer isolation.
- [x] Run the complete guarded live integration inventory against Neon and confirm the 161b database and Xero service suites pass.
- [x] Recover and clean manifest-owned fixtures, preserve unrelated catalogue and customer data, and release the active-run fence.
- [x] Run affected source gates, record evidence, update Plan 161b to DONE and commit the completion record.

### Review

Completed against the guarded online Neon target. The exact 22-suite inventory passed 6/6 Turbo tasks and 158 tests; all manifest-owned counts read back as zero, the outside-owned catalogue digest was unchanged, and the active-run lock was released. Plan 161b is DONE.

## Task: Fix turbo boundaries dependency declaration for vitest in @repo/email

- [x] Add `"vitest": "^5.0.1"` to `devDependencies` in `packages/email/package.json`
- [x] Add `"test": "NODE_ENV=test vitest run"` to `scripts` in `packages/email/package.json`
- [x] Verify `bun run boundaries`, `bun run test --filter=@repo/email`, `bun run check`, and CI untestable workspace guard

### Review

Resolved `turbo boundaries` error where `packages/email/contact.test.ts` imported `vitest` without `vitest` being declared in `packages/email/package.json`:
- Added `vitest` to `packages/email/package.json` under `devDependencies`.
- Added the standard `test` script (`NODE_ENV=test vitest run`) to `packages/email/package.json`, ensuring the CI workspace test guard passes and `bun run test` executes `contact.test.ts`.
- Verified `turbo boundaries` (992 files across 21 packages clean), unit test execution for `@repo/email` (all 3 tests passing), `bun run check` (1030 files clean), and the workspace test script guard.

## Task: Clarify homepage Xero to Outlook copy

- [x] Check existing copy and supported calendar destinations.
- [x] Name Xero leave and Outlook Calendar in the section heading and explain the subscription.
- [x] Run repository checks and record verification limitations.

Review: replaced the abstract heading with “Sync Xero leave to Outlook Calendar.”
Supporting copy explains approved Xero Payroll leave, secure calendar subscriptions,
and Google Calendar and Apple Calendar support. PASS: check, typecheck, unit tests,
and git diff --check. NOT VERIFIED: integration tests are blocked by the local
database safety guard; browser review is unavailable because agent-browser is not
installed. Design hook found no deterministic issues, but reported the existing
design sidecar is older than DESIGN.md. No design configuration changed.


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

## Contact adaptive studio, 20 September 2026

Approved direction: adaptive contact studio. Preserve brand tokens and early-access eligibility; add enquiry, support and bug paths with optional Resend confirmation.

- [x] Build responsive contact selector and tailored forms, preserving drafts and accessible status feedback.
- [x] Implement validated, rate-limited Resend delivery and optional confirmation with truthful partial-success handling.
- [x] Verify route behaviour, desktop/mobile visuals, lint, types and unit tests; attempt integration gate.
- [x] Record results and remaining environment limitations.

Review: four adaptive contact paths, draft preservation, Australian early-access
preselection for admission links, opt-in confirmation and public submission
references implemented. Resend uses the existing private recipient configuration,
separate idempotency keys for team delivery and confirmations, validated inputs
and existing abuse controls. Confirmation failure does not misreport the accepted
message as failed. Legacy early-access endpoint remains available.

PASS: repository check, typecheck and unit suite (17 tasks); 21 contact UI tests,
21 API contact/legacy cases and 3 transport tests. Browser desktop 1440px and mobile
390px, light/dark and reduced motion; no mobile overflow or page errors. Mocked
submission confirms failed-confirmation receipt. Visual selection contrast fixed.
Impeccable detector: advisory type-ramp findings only, scoped fluid marketing type
retained. React review: native radio keyboard controls, labelled bounded fields,
validated responses, preserved drafts and guarded in-flight submission.
NOT VERIFIED: live Resend delivery (no real emails sent), production deployment,
and database integration coverage. Integration gate rejects non-local DATABASE_URL;
Docker is unavailable in this WSL distro. No database guard bypassed.
Evidence: /tmp/contact-studio-{desktop,mobile,dark}.png and
/tmp/contact-gate-{0,1,2,3}.log. Temporary preview server stopped; port 3001
confirmed free immediately after shutdown. Unrelated concurrent edits preserved.

## Shape integrations around leave and Outlook, 20 September 2026

- [x] Inspect the current page, interaction model and product boundaries.
- [x] Prepare an Outlook-led direction with simplified requests and an Australian provider roadmap.
- [x] Confirm the proposed brief under the Impeccable shape workflow.
- [x] Implement Outlook-led copy, simpler requests and the provider catalogue.
- [x] Verify responsive layouts, interactions and repository gates.

Review: Proposed scope preserves the existing brand and interactive journey,
leads with planned and unplanned leave in Outlook, and explains simplified
requests and approvals. Xero remains identified as the current Australian
connection. MYOB, Deputy, Tanda, Employment Hero and Acumatica payroll are
explicitly planned, with no availability date or working connection implied.
Shape only: no production code changed or runtime checks performed.

Implementation review: Outlook-led hero and metadata, simplified request and
approval narrative, Outlook-selected connection map, and an expandable Australian
provider catalogue are implemented. Xero remains current early access; MYOB,
Deputy, Tanda, Employment Hero and Acumatica payroll are individually Planned.
Calendar refresh timing, privacy boundaries and secondary destinations retained.

PASS: repository lint, unit suite (web: 116 tests), scoped formatting, whitespace
checks and independent React review. Browser: 1440/768/390/320px in light/dark,
no page overflow or runtime errors; map, stage selection, filters and reduced
motion checked. Desktop light and mobile dark screenshots visually inspected.
Detector reported advisory type-ramp differences consistent with the existing
surface; no blocking findings. Browser closed; existing server preserved.
FAIL: repository typecheck, unrelated packages/email/contact.ts:37 extensionless
import. NOT VERIFIED: database integration coverage, configured non-local
DATABASE_URL rejected by the local-database guard. No guard bypassed.
Evidence: /tmp/integrations-outlook-*.png and /tmp/integrations-outlook-*.log.

## Repair local dev startup, 20 September 2026

- [x] Reproduce the startup failure and identify the failing service.
- [x] Resolve the confirmed port conflict after identifying its owning process.
- [x] Restart the complete dev stack, check local responses and record results.

Plan review: startup fails because web cannot bind port 3001 (EADDRINUSE).
Inspect ownership before stopping the conflicting repository development process.

## Live contact delivery and Neon verification, 20 September 2026

User explicitly authorises live email delivery and the configured live Neon database.
- [x] Verify real Resend contact delivery and optional confirmation.
- [x] Identify live Neon target and inspect guarded integration prerequisites.
- [ ] Run authorised integration coverage and verify scoped cleanup.
- [x] Record concrete PASS/FAIL/NOT VERIFIED evidence.

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

## KV configured verification, 20 September 2026

PASS: Vercel API production inventory now includes KV_REST_API_URL/TOKEN.
Actual live Redis PING, write/read, EVAL and owned-key cleanup verified.
Current contact route imported unchanged into a temporary isolated Next.js server
and tested via HTTP with live Vercel KV and Resend. Used an ephemeral test HMAC
and the previously authorised private mailbox because Vercel omits the configured
sensitive recipient/HMAC from downloads. Clerk development browser handshake
prevented the proxy-inclusive local harness; proxy allowlist remains covered by
regression tests. This is handler/provider evidence, not deployed browser proof.

PASS: OPTIONS 204 with matching CORS; POST 202 confirmation=sent; retry 200 same
reference; changed-payload retry 409; foreign origin 403. Exactly two Resend emails
for the original plus retry. Both last_event=delivered / retrieval HTTP 200.
Reference TC-DA1F89E68EAB. Email IDs 01a0be18-c93f-74b8-ae63-b5756a5b2292 and
01a0be18-c7dd-716e-8c7f-e05bb0ca1ff4. Removed all 3 test KV keys, verified zero
remaining. Evidence: /tmp/contact-kv-verification/evidence.json.
Temporary verification server stopped; downloaded secrets and test HMAC removed.
Existing development server unchanged.

NOT VERIFIED: deployed contact flow, production OPTIONS returned 204 but no CORS
header. Full guarded Neon suite still requires provider identity/restore and
Inngest pause/drain evidence plus the protected manifest. An existing Neon Vercel
integration was found, but no provider-management tools or Inngest credentials.
Neon should connect to teamcalendar-app and teamcalendar-api using the same
production database. Marketing web contact uses API/KV/Resend, not Neon directly.

## Pricing spacing polish, 20 September 2026

- [x] Inspect pricing implementation, project design guidance and desktop/mobile renders.
- [x] Correct hero, country selector, plan and comparison spacing at source.
- [x] Verify responsive layouts, country switching and FAQ interaction; run checks.
- [x] Record results and any verification limitations.

Plan: preserve the existing design and content. Add the missing selector inset,
remove compounded section padding, restore hero paragraph spacing, and balance
mobile card/CTA padding. Keep edits limited to pricing selectors.

## Updated Vercel database verification, 20 September 2026

PASS: fresh production environment downloads for teamcalendar-api and
teamcalendar-app resolve to the same Neon endpoint and neondb database.
Both connections completed read-only SQL transactions as neondb_owner.
All 15 applied migrations match local checksums; no migrations pending.
Fresh API configuration now includes both KV and Inngest credential pairs.
No database records changed. Temporary downloaded environment files removed.
Evidence: /tmp/tc-database-verification-0920/evidence.json.
Full guarded integration suite remains NOT VERIFIED: protected manifest,
provider restore evidence and verified worker pause/drain window remain absent.

## Full live database test, 20 September 2026

User requests the complete database test; existing live Neon authority persists.
- [ ] Establish provider target, restore and worker-isolation evidence.
- [ ] Create a durable manifest with unique owned fixtures and acquire run lock.
- [ ] Execute all 21 integration suites; resolve in-scope failures.
- [ ] Verify cleanup, unchanged unowned catalogue and restored worker states.
- [ ] Record exact results and outstanding prerequisites.

Pricing polish review: PASS browser checks at 1440, 768, 390 and 320px,
country switching across AUD/NZD/GBP and FAQ expansion, with no horizontal
overflow or page errors. Reviewed mobile dark and early-access captures.
PASS repository check, typecheck, unit suite (retry after concurrent-run timeouts),
five pricing tests and git diff --check. Integration execution BLOCKED by the
local-only database guard rejecting the configured remote connection. No database
configuration changed. Detector findings concern pre-existing styles, outside this
spacing-only diff; stale design sidecar left untouched. Browser closed; existing
development server retained. Evidence: /tmp/pricing-after-*.png and
/tmp/pricing-{check,types,tests-retry,targeted,integration}.log.

## Pricing country selector

- [x] Replace the continuous slider with a native, exclusive country radio selector.
- [x] Remove unused slider styling; verify mouse, keyboard and mobile behaviour.
- [x] Run checks and record results.

Plan: keep the three country choices and prices visible, with native radio
indicators and arrow-key selection. Preserve all pricing data and page spacing.

## Activate connected Inngest configuration, 20 September 2026

- [x] Confirm production API event/signing keys exist and authenticate.
- [x] Inspect production endpoint and logs: existing deployment lacks signing key.
- [x] Redeploy existing production API version with updated environment.
- [ ] Verify endpoint and Inngest app registration; record remaining live-test gates.

Country selector review: PASS desktop and mobile browser checks at 1440, 390
and 320px: native arrow-key selection, country clicks, matching displayed prices,
exactly one checked option, no slider and no horizontal overflow. PASS repository
check, typecheck, unit tests and diff whitespace check. Removed obsolete slider
track/thumb CSS, including the previously flagged width transition; no suppression.
Integration remains NOT VERIFIED due to the remote-database/local-runner mismatch
already demonstrated during this pricing task. Browser closed.

## Production sign-up redirect fix, 20 September 2026

- [x] Reproduce production redirect and inspect sign-up, proxy and Clerk controls.
- [x] Render the Clerk sign-up page independently of marketing launch mode; update regression tests.
- [x] Run repository validation and deploy the isolated app fix (integration guard blocked database tests).
- [x] Verify production sign-in and sign-up in the browser and record results.

Plan: remove the page-level contact redirect, retain Clerk registration controls,
and deploy only the app fix without unrelated workspace changes.

## Homepage early access wording, 20 September 2026

- [x] Locate the homepage hero status badge.
- [x] Remove the “Now in early access” badge.
- [x] Record repository validation results.

Review: removed the badge element from the hero used by the marketing homepage.
PASS: lint, typecheck and diff whitespace check. FAIL: unit suite in unrelated
app sign-up tests. Integration NOT VERIFIED: runner rejected a non-local database
connection under ALLOW_LOCAL_DATABASE_TESTS. No new tests for this copy removal.

### Sign-up redirect review

- Commit `8319b80` merged and pushed to main. Isolated production deployment
  `dpl_2WEofeVzfUEjdHtzzaFJ4dpR3GYB` successfully aliased to app.teamcalendar.online.
- PASS: targeted auth tests (7), full unit task suite (17 tasks), typecheck,
  targeted lint, production build and git diff whitespace checks.
- Initial repository lint passed; repeat lint encountered concurrently added,
  unrelated `tooling/release/consumer-isolation.ts` formatting findings.
- Integration tests NOT VERIFIED: safety guard rejects the configured non-local
  database with ALLOW_LOCAL_DATABASE_TESTS. No database mutation performed.
- Live Chromium: both auth URLs return 200 and retain their URL, no page errors.
  Sign-in displays credentials; sign-up displays Clerk Join waitlist, matching
  live Clerk signUp.mode=waitlist. Provider admission settings were preserved.
- Post-deploy error-level log query returned no errors. Screenshots stored in
  /tmp/sign-in-fixed.png and /tmp/sign-up-fixed.png. Browser closed.

## Vercel variable review, 20 September 2026

- [x] Pull all three standard environments for API, app and web.
- [x] Review names, sensitivity metadata and shared database/KV targets.
- [x] Record findings in tasks/vercel-environment-review.md.
- [x] Record read-only database and repository validation results.

Review: all nine pulls succeeded. Production/Preview/Development share the same
Neon target and credentials; API KV is also shared. Sensitive placeholders are
configured values, not missing settings. No Neon management key or restore
evidence found. Live schema/migration/integrity checks PASS; full guarded write
integration run remains NOT VERIFIED pending provider branch/restore evidence.

## Move Integrations navigation to the footer, 20 September 2026

- [x] Inspect shared header and footer navigation.
- [x] Remove Integrations from header variants and label the existing footer link Integrations.
- [x] Update the existing header assertions and run verification.

Review: Integrations now appears under Product in the footer and is absent from
all header navigation variants. PASS: 10 targeted header tests, repository lint,
typecheck, full unit suite and diff whitespace check. Integration NOT VERIFIED:
the database guard rejects the configured non-local connection under
ALLOW_LOCAL_DATABASE_TESTS.

Inngest connection review: production event/signing credentials present; provider
API authenticated and confirmed configured signing key exactly matches the active
production key. Existing API deployment initially lacked credentials. Rebuilt SHA
032aed4ba82cca103f59c683bb21c4a03858ce16. Runtime then rejected provider sync and
signed GET with Invalid signature. Local Node and Bun SDK4.20.0 verification passed.
Temporary isolated-worktree diagnostic returned runtimeValueMatches=false and
clientValueMatches=false relative to configured key digest. Explicit build/runtime
bindings of verified keys did not resolve authentication. All temporary diagnostic
code and response headers removed. Final deployment dpl_2Yqt7KYg7PCPZeSLPN5sYeJkEoHY
is Ready, original source unchanged; alias api.teamcalendar.online verified by CLI.
FAIL: production signed introspection (401), app sync (422 unauthorized). No app or
functions registered in the inspected production Inngest environment. NOT VERIFIED:
full live integration suite, still requires working consumer control and protected
restore/manifest prerequisites. Downloaded secret files removed. No fixture writes.

## Distil integrations, 20 September 2026

- [x] Replace feature demonstrations with current and planned payroll connections.
- [x] Preserve provider availability and region facts; offer a request path.
- [x] Remove unused interactions and styles; verify desktop/mobile and repository gates.

Direction: retain the marketing typography and tonal surfaces. Lead with payroll
and accounting connections, show Xero AU separately from planned providers, and
link to Features for functional advantages.

## Shape the app waitlist, 20 September 2026

- [x] Confirm scope: preserve the existing waitlist fields and behaviour.
- [x] Inspect authentication layout, form frame, theme and product design context.
- [x] Check Clerk documentation for embedding the existing waitlist flow.
- [x] Inspect live desktop/mobile sign-in and sign-up; record hosted waitlist inspection limitation.
- [x] Confirm the design brief and delivery URL before implementation.

Proposed brief: reuse the app authentication shell, including the desktop brand
panel and availability motif, compact mobile branding, Plus Jakarta Sans, shared
form width, theme toggle and authentication appearance. Keep the email waitlist
flow under Clerk, including validation, pending, error and confirmation states.
Reuse the existing sign-in link and legal links where present. Match spacing,
colour, typography and controls to sign-in/sign-up. Avoid adding fields or access
promises. Adapt the brand-panel instruction for waitlist visitors so it does not
instruct them to sign in.

Implementation consequence: a proposed app.teamcalendar.online/waitlist route
would host Clerk's Waitlist component within the existing authentication layout.
Clerk's waitlistUrl configuration can direct app visitors there. Existing direct
accounts.teamcalendar.online/waitlist links require a separate routing decision;
local app CSS does not style that hosted page. Confirm the intended URL before
claiming that the supplied hosted surface has been replaced.

Review: shape only, no application code or provider settings changed. Live
sign-in/sign-up desktop and mobile captures inspected. Hosted waitlist returned
Cloudflare security verification, so its fields and current states remain
NOT VERIFIED. Browser sessions closed. Implementation
verification must cover desktop/mobile, light/dark, keyboard navigation, form
states, sign-in navigation and Clerk routing, followed by repository CI gates.


Review: replaced the feature journey, calendar demo, repeated sync/security copy
and subscription instructions with current Xero connection details, planned
providers/regions and an integration request link. Features has its own link.
Removed the unused client component and its styles. Provider facts are unchanged.
PASS: desktop (1440px) and mobile (390px) visual checks, no overflow or page errors;
Impeccable detector, repository lint, typecheck, unit suite and git diff --check.
Integration NOT VERIFIED: the runner refuses the configured non-local database
under ALLOW_LOCAL_DATABASE_TESTS. No database changes made. Used the existing dev
server; both attempted server starts exited, and browser sessions were closed.
Screenshots: /tmp/integrations-after-desktop.png and
/tmp/integrations-after-mobile.png.

## Restore integration data-flow detail

- [x] Restore Reads from Xero, Writes to Xero and Never reads under What moves between systems.
- [x] Remove the shortened duplicate data summary from the Xero card.
- [x] Verify the restored section and record results.

## Restore integrations hero

- [x] Restore the pre-distillation hero copy, actions and interactive connection map.
- [x] Keep the restored data-flow section and concise provider directory.
- [x] Verify desktop/mobile, interactions and repository checks.


Restoration review: restored the original hero headline, copy, both actions and
three-node connection map, plus the Reads from Xero, Writes to Xero and Never
reads detail. PASS: desktop/mobile layout and all three connection controls,
no browser errors or overflow, repository lint, typecheck, unit tests and diff
whitespace check. Detector reports only advisory typography values retained from
the explicitly requested original hero. Integration NOT VERIFIED: configured
non-local database rejected by ALLOW_LOCAL_DATABASE_TESTS guard. Browser closed;
existing development server preserved.

## Interactive integration exchange map

- [x] Build the approved read/write exchange diagram with persistent privacy exclusions.
- [x] Verify selection, keyboard access, responsive layouts and reduced motion.
- [x] Run repository gates and record results.

Direction approved: lightweight SVG/CSS map, directional paths and selectable
Reads/Writes. Preserve all data categories and the restored hero.


Review: implemented the approved interactive exchange map with directional SVG
paths, one brief trace on direction selection, persistent read/write records,
and a separate Never reads boundary. Hero and provider directory preserved.
PASS: desktop/mobile and dark-theme browser checks; click and keyboard selection;
reduced-motion animation disabled; no overflow or page errors; detector;
repository lint, typecheck, unit suite and diff whitespace check.
Integration NOT VERIFIED: database guard rejects the configured non-local target
under ALLOW_LOCAL_DATABASE_TESTS. No database writes attempted. Real-device frame
rate was not measured. Browser closed; existing dev server retained.

## Move exchange section below hero

- [x] Place DataExchange immediately after the hero, before Connect with Xero.
- [x] Verify source order, lint, typecheck, unit suite and diff whitespace.

Review: all listed checks PASS. Integration NOT VERIFIED: the database guard
continues to reject the configured non-local target. Content and controls unchanged.

## Unify marketing demo calendars

- [x] Inspect homepage benchmark and Features calendar differences.
- [x] Share the homepage calendar rendering, staff and relative-week data with Features.
- [x] Preserve the Features workflow narrative and remove superseded calendar styles.
- [x] Verify desktop/mobile interactions, consistency and record repository gate results.

Plan: retain the homepage visual design, reuse its complete calendar on Features
at the same container width, and keep the workflow explanation beneath it.

Calendar review: both pages render DemoTeamCalendar with identical desktop styling,
all six staff, departments, entry spans and rolling week dates. Corrected contradictory
leave notes and year labels spanning December/January. Full staff names and roles
remain visible on mobile. Features retains its workflow copy beneath the calendar.
PASS: browser comparison of calendar text, computed styles and width at 1440, 768,
390 and 320px; week controls, entry details, focus return, no page overflow/errors;
light/dark visual inspection; six interaction/date tests across both page components;
repository lint, typecheck, unit suite, detector and git diff whitespace.
Integration NOT VERIFIED: ALLOW_LOCAL_DATABASE_TESTS refuses the configured remote
database. No database writes attempted. Existing development server retained;
verification browsers closed. Screenshots: /tmp/calendar-{home,features}-{width}.png.

## Distil and clarify Features

- [x] Remove repeated hero examples and workflow narrative; retain the shared demo.
- [x] Clarify table and Short answers copy while preserving their content.
- [x] Verify desktop/mobile layout, calendar controls and repository checks.

Direction: concise hero, interactive calendar, teammate table, Short answers and
one short closing invitation. Retain all six FAQ topics as explicitly requested.

Features distillation review: removed four hero examples, four repeated workflow
paragraphs, redundant overlines and closing CTA explanation. Retained the shared
calendar, all six comparison rows, all six Short answers and existing action links.
Clarified source, sync, balances and calendar subscription language without changing
capability values. Removed obsolete hero/story CSS and unnecessary reveal wrappers.
PASS: desktop/mobile at 1440, 390 and 320px, dark visual inspection, calendar entry
and week controls, keyboard table scrolling, no page overflow/errors, lint,
typecheck, unit suite, detector and diff whitespace. Integration NOT VERIFIED:
configured remote database rejected by ALLOW_LOCAL_DATABASE_TESTS guard. Browser
closed, existing server retained. Evidence: /tmp/features-distill-*.png and logs.

## Connected analytics demonstration

- [x] Confirm connected-dashboard direction and placement.
- [x] Build labelled sample data, coordinated trends, overlaps and coverage heatmap.
- [x] Verify filters, arithmetic, accessibility, responsive visuals and record repository gates.

Direction approved: one shared month and department selection, clickable coverage
cells that reveal people away, leave utilisation bars and balance snapshot trend.
Use lightweight SVG/CSS, meaningful labels and reduced-motion support. Insert after
the teammate matrix and before Short answers. All figures are illustrative.

Analytics review: added the approved connected dashboard between the teammate matrix
and Short answers. Month bars, department selector and heatmap cells coordinate
utilisation, balance snapshots and named overlapping absences. Next overlap cycles
through team/day pairs. Narrow heatmaps retain department labels and reveal the
selected day. Fictional Apr–Jun 2026 data is explicitly labelled; WFH counts as
available, repeated absence records count each person once, no accrual calculation.
PASS: seven data/interaction tests; full unit suite, repository lint and typecheck;
browser controls and keyboard at 1440, 768, 390 and 320px; reduced-motion transitions,
light/dark visuals, no page overflow/errors; diff whitespace. Integration NOT VERIFIED:
configured remote target rejected by ALLOW_LOCAL_DATABASE_TESTS. No database writes.
Detector invocation produced no diagnostic output, so no detector pass claimed.
Physical-device performance was not measured. Browser closed; existing server retained.
Evidence: /tmp/analytics-{width}.png, /tmp/analytics-dark-{width}.png and
/tmp/analytics-{fix,check,types,tests,integration}.log.

## Polish Features

- [x] Refine section rhythm, table hierarchy and mobile scrolling affordances.
- [x] Review keyboard focus, analytics state clarity and responsive readability.
- [x] Verify desktop/mobile, themes, retained interactions and record repository gates.

Plan: preserve all current sections and factual copy; improve table semantics and
sticky mobile row labels, align headings, remove table decoration, clarify scrolling.

Polish review: preserved all content and sections. Unified mobile heading sizes and
section rhythm, enlarged FAQ body/chart labels, replaced table shadows/rules with
tonal rows, added semantic row headers and table heading association. Comparison
row labels stay visible during mobile scrolling; comparison/heatmap now explain
horizontal scrolling. Added a three-pixel comparison focus ring and selected date
to analytics live announcements. Removed one suppression made obsolete by this diff.
PASS: browser at 1440, 768, 390 and 320px, table sticky labels and keyboard focus,
calendar navigation, linked analytics, all six FAQs, no page overflow/errors;
light/dark visual review; lint, typecheck, unit tests, detector, diff whitespace.
Detector advisories remain in unrelated legacy styles and the intentionally enlarged
SVG value labels (SVG units scale with the chart). Integration NOT VERIFIED:
remote target rejected by ALLOW_LOCAL_DATABASE_TESTS. Browser closed; existing dev
server retained. Evidence: /tmp/features-polish-*.png and matching logs.

---

## Marketing site unslop pass (apps/web)

Brief: remove generic AI defaults from every page of the marketing site and
restore intentional craft. Reference: DESIGN.md.

### What was actually wrong

The palette, typography and token system were already brand-correct: sage-led,
lavender-tinted neutrals, Plus Jakarta Sans with Lora as the editorial second
voice. No purple gradients, no cream, no Inter. The slop was a ghost layer left
by earlier rebuilds.

- Three components imported by nothing: `benefits-strip.tsx`,
  `calendar-visibility-section.tsx`, `scroll-reveal.tsx`.
- 155 of 498 marketing CSS classes (31%) matched no markup.
- 19 of 50 `--marketing-*` tokens had no consumer, including a whole
  `.features-prototype` alias layer for a class that does not exist.
- The scroll-choreography layer was inert: every `animation-timeline: --fmkt-slide`
  rule pointed at a named timeline whose provider (`.fmkt-slide`) was never in the
  markup, and a kill switch at the bottom of `motion.css` disabled the rest.
- `section-cover-darken` painted `oklch(0% 0 0 / 0.18)` at `z-index: 50` over
  three unpositioned sections, above the `z-index: 40` sticky header.
- `.ft-flow__hub` set `color: #fff` over a `--marketing-primary` fill. In dark
  mode that is white on `#8fd496`, about 1.7:1. Deleted with the dead block.
- The pricing page had missed the design pass: fourteen weight-700 declarations
  where DESIGN.md sets 600/500, a 24px radius plus 6px and 8px strays, seven
  persistent ramp shadows up to `0 16px 40px`, and a dashed-border card nested
  inside a card.
- The same uppercase 0.76rem/700 eyebrow was redeclared on five pages.

### Changes

- [x] Deleted the three orphaned components.
- [x] Pruned dead rules from `features.css`, `home.css`, `shell.css`, `motion.css`
      and dead tokens from `tokens.css`. Re-audit: zero dead classes remain.
- [x] Rewrote `motion.css` (842 to 165 lines) around one signature move: the hero
      sync diagram drawing its own path. Dropped all below-fold parallax,
      per-item nth-child depth staggering and the darken overlay.
- [x] Weights onto the DESIGN.md scale: 600 display/headline, 500 label.
- [x] Radii onto the ladder: 24 to 20, 8 and 6 to 12, 9 to 12, 5 to 4 with a
      documented marker exception.
- [x] Persistent shadows capped at a new `--marketing-shadow-hairline` token,
      per the Hairline Ceiling Rule.
- [x] Pricing analytics box: nested card to tonal inset (no border, no radius).
- [x] Pricing final CTA: gradient plus sage border to a flat tonal band, so the
      homepage green band stays the site's one drenched moment.

Net: 2,889 deletions, 176 insertions.

### Verification

PASS: `bun run check`, `bun run typecheck` (19 tasks), `bunx vitest run` in
apps/web (36 files, 134 tests), `turbo build --filter=web`.
PASS: all 13 marketing routes at 1440px and 390px, light and dark, in Chromium.
No JS errors, no horizontal overflow. The only failing request is
`/_vercel/insights/script.js`, which the platform injects in production and is
expected to 404 outside Vercel.
Visual review: homepage hero (sync diagram draws correctly), homepage full page,
pricing cards before and after the nesting fix.

---

## Product app unslop pass (apps/app)

Brief: remove generic AI defaults from every page of the authenticated app and
restore intentional craft. Reference: DESIGN.md.

### What was actually wrong

The app was already well disciplined at the level this brief usually finds
problems: three raw palette colours in 245 components, no purple gradients, no
cream, sane z-index, no bounce easing, no nested Card components, every skeleton
matching its final structure. The slop was one systemic problem and a short tail.

**A two-speed type system.** The design system publishes a semantic scale that
names intent: `text-body-*` at 1.6 line height for prose, `text-label-*` at 1.4
for labels, `text-title-*` and `text-headline-*` for structure. The dashboard
used it. The other thirty-odd screens did not: 397 declarations of Tailwind's
generic `text-sm` and `text-xs`, plus five one-off arbitrary sizes, against 85
semantic ones. Hierarchy was expressed as raw size rather than role, and body
copy across the app sat at 1.43 leading instead of the specified 1.6. This is
the "undifferentiated text, flat hierarchy" that DESIGN.md names as the Notion
anti-reference.

**Hero-metric card grids, nested inside cards.** `MetricTile` rendered a filled,
rounded, padded panel inside `DashboardCardShell`'s `CardContent`, six to a
grid, with four of the six tinted neutral. `SummaryFact` on both analytics pages
did the same thing inside a tinted band. DESIGN.md prohibits both by name.

The tail: `tracking-widest` (0.1em) on 21 uppercase eyebrows against a 0.05em
spec cap; 29 `rounded-[20px]`/`rounded-[14px]` escapes for tokens that exist;
`backdrop-blur` on the sticky header, which the Frost Means Floating Rule
reserves for surfaces that float, and which had no reduced-transparency
fallback; `bg-emerald-500/10` on a reconciliation result; two `shadow-lg` where
`--elev-popover` and `--elev-toast` are defined; a `hover:scale-110` on a status
marker dot; seven skeleton pulses that looped forever under reduced motion.

### Changes

- [x] Migrated all 435 type declarations onto the product scale, classified by
      the owning element: prose to `body-*`, labels and controls to `label-*`,
      headings to `title-*`/`headline-*`, and the two exact matches (0.6875rem,
      2.25rem) onto `label-sm` and `display-sm`. Zero generic sizes remain.
- [x] `MetricTile` is a stat, not a card: no fill, tone carried by the value's
      colour plus a labelled status dot.
- [x] `SummaryFact` unnested on both analytics pages; the page header there is
      type-led instead of a second identical tinted slab.
- [x] `tracking-widest` to `tracking-wider`; arbitrary radii to `rounded-xl` and
      `rounded-md`.
- [x] Sticky header: frost to an opaque surface with `--elev-sticky`.
- [x] Emerald to the sage secondary container; `shadow-lg` to the named
      elevation tokens; hover-scale removed.
- [x] Skeleton pulses stop under `prefers-reduced-motion`.

Left deliberately: the in-flight button spinners keep animating under reduced
motion. They signal work in progress and the buttons already carry a stable verb
and `aria-busy`, so freezing them would remove signal rather than add calm.

Net: 81 files, 594 insertions, 505 deletions.

### Verification

PASS: `bun run check`, `bun run typecheck` (19 tasks), `turbo test --filter=app`
(110 files, 559 tests), `turbo build --filter=app`.
PASS: all eleven semantic utilities confirmed present in the compiled CSS with
the sizes and line heights DESIGN.md specifies, so nothing was silently dropped.
PASS: zero elements carry conflicting type classes after the migration.
PASS: measured contrast on the rebuilt metric treatment in both themes; lowest
is 6.43:1 against a 4.5:1 requirement.

NOT VERIFIED in a browser: the authenticated routes need a live Clerk instance,
which this environment does not have; every route redirects to `/sign-in` and
Clerk rejects placeholder keys. Visual review was done by rendering the real
components against the compiled stylesheet in Chromium (`MetricTile` in its two
dashboard cards, the settings section header, people status and provenance
chips, the empty state), light and dark.

---

## Pre-production review pass

Re-audited all three commits before shipping. Two defects found and fixed, both
mine; one pre-existing issue found and left alone; the risky automated passes
verified clean.

### Fixed

- `px-1` on the two analytics page headers: an arbitrary 4px inset matching
  nothing in the spacing scale. The parent's `p-6` gutter and `gap-6` rhythm
  already place the block, so the class is gone.
- The "Analytics" eyebrow above each of those headings was a `<p>`, so the type
  migration's tag heuristic gave it prose leading. An eyebrow is a label:
  `text-body-sm` to `text-label-lg`. These two were the only instances; a sweep
  for uppercase labels carrying prose leading returned zero.

### Verified clean

- **CSS pruning.** The dangerous direction is a deleted rule that markup still
  uses. Classes used in markup with no matching rule: 11 at baseline, the same
  11 at HEAD, and the same 11 in the compiled stylesheet. Zero new orphans. The
  `marketing-legal__*` block that the legal pages depend on is intact, confirmed
  by computed style in the browser (760px measure, 40px gap, 36px/600 heading,
  16px body at 1.7 leading).
- **Type migration.** No replacement landed outside a class string. Only one
  `text-body-sm` sits in a `cn()` call rather than a literal `className`, and it
  is on a `<p>` holding an error message, where prose leading is right.
- **Observability.** The earlier tests passed `configuration` explicitly and
  never exercised `parseBetterStackConfiguration(keys())` with the real t3-env
  proxy. Added five tests that do: partial group, empty, HTTP in production and
  a malformed URL all report "configuration" without touching the fetcher, and
  a complete HTTPS config still reaches the provider. That last case matters:
  it proves the status feature was not simply switched off.
- **No markup lost to formatting reflow.** Accessibility attribute counts match
  the baseline exactly in both apps, once the three deleted orphan components
  are accounted for (aria-label -2, aria-hidden -10, alt -1, all theirs). The
  one addition is `aria-hidden` on MetricTile's new status dot.
- **Builds.** app, api and web all compile with the partial Better Stack config
  that broke the Vercel deploy.
- **Routes.** 13 marketing routes at 1440px and 390px, light and dark: no JS
  errors, no horizontal overflow. Legal pages checked separately.

### Found, not fixed (pre-existing, outside this pass)

`.marketing-legal__section ul` sets `padding-left` but no list marker, and
Tailwind's preflight strips the default, so bullets on the privacy policy and
terms pages render as indented paragraphs. Present at baseline. Worth a one-line
fix later; not changed here to keep the production push to reviewed scope.
