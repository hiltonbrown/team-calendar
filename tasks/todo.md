# Plan: Implement Clerk Self-Service Organisation Onboarding

## Plan

- [x] Wire Clerk's `choose-organization` session task to an app route for public self-service sign-up.
- [x] Route completed self-service sign-ups to organisation creation/selection, while preserving invited-user organisation membership flow.
- [x] Add visible sign-in/sign-up headings to replace hidden Clerk headers on the unauthenticated surface.
- [x] Add tests for auth page copy and Clerk component props.
- [x] Run targeted auth/app typechecks and tests.
- [x] Document verification and results.

## Review

- Added Clerk `taskUrls` wiring in `AuthProvider` so
  `choose-organization` resolves to `/session-tasks/choose-organization`.
- Added the app task route at
  `apps/app/app/(unauthenticated)/session-tasks/choose-organization/page.tsx`,
  backed by a shared `@repo/auth` task component. It completes back to `/`
  after Clerk finishes organisation creation or selection.
- Kept invited-user handling on Clerk's membership path: the sign-up flow is
  not forced through a custom redirect; Clerk session tasks decide when the
  organisation choice page is needed.
- Added a shared auth form frame and embedded Clerk appearance constant so
  both sign-in and sign-up have visible headings while Clerk's duplicate
  embedded header remains hidden.
- Updated sign-up metadata/copy to make public self-service organisation
  creation explicit while mentioning invitations.
- Added targeted tests for the task route constant, task completion URL,
  visible sign-in/sign-up copy, and hidden embedded Clerk header setting.
- Scoped Biome check exits 0:
  `bunx biome check --write packages/auth/provider.tsx packages/auth/components/sign-in.tsx packages/auth/components/sign-up.tsx packages/auth/components/choose-organization-task.tsx packages/auth/components/auth-form-frame.tsx packages/auth/components/embedded-auth-appearance.ts apps/app/app/(unauthenticated)/session-tasks/choose-organization/page.tsx apps/app/app/(unauthenticated)/sign-up/[[...sign-up]]/page.tsx apps/app/__tests__/auth-components.test.tsx`.
- Auth page tests pass from `apps/app`: 3 files, 7 tests.
- `cd packages/auth && bun run typecheck` exits 0.
- `cd apps/app && bun run typecheck` exits 0.
- `cd apps/app && bun run dev` was started for a route smoke check, but after
  about 60 seconds it had not emitted a ready line and
  `curl -I http://localhost:3000` could not connect. The dev process was
  stopped.

# Plan: Review Clerk Unauthenticated Account Pages

## Plan

- [x] Load Clerk guidance and verify SDK version.
- [x] Inspect unauthenticated sign-in/sign-up pages, layout, auth provider, and proxy.
- [x] Review environment defaults and test coverage for unauthenticated flows.
- [x] Document findings, risks, and recommended fixes.

## Review

- Reviewed Clerk SDK version, unauthenticated sign-in/sign-up pages, shared auth
  components, `AuthProvider`, route proxy, environment defaults, and page tests.
- Findings: default sign-up does not encode the required organisation path;
  Clerk form headers are hidden without replacement headings on the mobile
  auth surface; Clerk v7 appearance setup uses the older `@clerk/themes`
  package rather than the current shadcn-first theme guidance; page tests only
  assert render smoke.

# Plan: Fix Product UI Critique Issues

## Plan

- [x] Create a shared availability scan component and status vocabulary for dashboard and calendar.
- [x] Upgrade the manager dashboard scan surface from counts to actionable person/status rows.
- [x] Add calendar scanability: selected/today agenda, active filters, status legend, and mobile-resilient week layout.
- [x] Replace hard-coded/ad hoc status colours and side-stripe alerts with tokenised status treatments.
- [x] Improve loading, empty, error recovery, and system-first copy called out in the critique.
- [x] Run targeted tests, typecheck, and repo checks where feasible.
- [x] Document verification and results in this review section.

## Review

- Added shared availability scan/status components in
  `apps/app/components/availability/` and reused the scan surface from both the
  manager dashboard and calendar.
- Extended `ManagerDashboardView.teamToday` with `peopleNeedingAttention`
  rows, sorted by operational urgency, while retaining existing count metrics.
- Updated the calendar with a today/selected-day scan panel, status legend,
  active filter chips, clearer "Add leave or availability" copy, and a
  horizontally resilient week grid.
- Tokenised app status treatments for calendar chips/holidays, Xero sync
  failures, feed statuses, people status chips, provider connection badges, and
  sync run badges.
- Replaced the side-stripe Xero sync failure alert with a full tokenised error
  surface.
- Hardened generic loading and fetch-error states with a dashboard skeleton and
  clearer recovery copy.
- Cleaned user-facing copy for manual availability, calendar empty states,
  feeds, and disconnected-Xero guidance.
- Scoped Biome check on touched files exits 0:
  `bunx biome check --write ...`.
- App tests pass from `apps/app`: 6 files, 10 tests.
- Dashboard service test passes: 1 file, 9 tests.
- `cd apps/app && bun run typecheck` exits 0.
- `bunx tsc --noEmit -p packages/availability/tsconfig.json` exits 0.
- `bun run check` exits 1 on unrelated existing `apps/web/app/styles/home.css`
  formatting/property-order issues. The app/availability files touched in this
  pass are covered by the scoped Biome check above.
- `cd apps/app && bun run dev` was started as a smoke check, but after 60
  seconds it had not emitted a ready line and `curl -I http://localhost:3000`
  could not connect. The dev process was stopped.

# Plan: Critique apps/app/app Product UI

## Plan

- [x] Resolve the target and load Impeccable critique/product guidance.
- [x] Run independent design assessment and detector assessment.
- [x] Inspect representative app routes, shared app chrome, and design tokens.
- [x] Synthesize heuristic scores, priority issues, persona red flags, and run notes.
- [x] Persist the critique snapshot under `.impeccable/critique/`.

## Review

- Critiqued the authenticated product UI at `apps/app/app`, with emphasis on
  `apps/app/app/(authenticated)`, shared app chrome, dashboard, calendar, feeds,
  state components, and design tokens.
- Assessment independence was preserved with two subagents: design review and
  detector/evidence pass.
- Deterministic detector exited 0 with no findings:
  `node /home/hilton/.agents/skills/impeccable/scripts/detect.mjs --json apps/app/app`.
- Browser overlay evidence was skipped because browser automation was not
  available in this session.
- Design health score: 26/40, with 0 P0 issues and 2 P1 issues.
- Top issues: manager scan surface answers with counts instead of people;
  component vocabulary/token usage drifts across admin surfaces; calendar
  controls are complete but not scan-optimised; loading, empty, and recovery
  states are too generic.
- Snapshot written to
  `.impeccable/critique/2026-06-21T06-28-02Z__apps-app-app.md`.

# Plan: Add Clerk Authentication With CLI

## Plan

- [x] Verify Clerk CLI availability and update or install it from the project root.
- [x] Authenticate with `clerk auth login`.
- [x] Run `clerk init --app app_3FQcAQ0Wg9Oz9Dog0oTw7bBBbR1` for this existing Bun/Next.js monorepo.
- [ ] Link the repo and pull env values through the CLI fallback after Clerk re-authentication completes.
- [x] Verify the Next.js app proxy matcher includes `'/__clerk/:path*'` after the API/TRPC matcher.
- [x] Confirm clear signed-out and signed-in auth controls exist in the app UI, adding them if missing.
- [x] Run `clerk doctor` and targeted repo verification.
- [ ] Start the app and document the setup result in this review section.

## Review

- `clerk update --yes` exits 0 and reports Clerk CLI `1.5.0` is already the
  latest available version.
- `clerk auth login` confirmed the existing session for
  `hello@hiltonbrown.com.au`.
- `clerk init --app app_3FQcAQ0Wg9Oz9Dog0oTw7bBBbR1` was run from the monorepo
  root, but the CLI exited 1 because it could not detect a framework.
- The fallback inspection confirmed this is an existing Next.js app:
  `packages/auth` already depends on `@clerk/nextjs` `^7.3.7`, the provider is
  mounted inside `<body>` through `DesignSystemProvider`, sign-in/sign-up pages
  exist under `apps/app/app/(unauthenticated)`, and the authenticated header
  renders a Clerk `UserButton` via `CustomUserButton`.
- Added `'/__clerk/:path*'` after `'/(api|trpc)(.*)'` in
  `apps/app/proxy.ts`.
- `clerk link --app app_3FQcAQ0Wg9Oz9Dog0oTw7bBBbR1` exits 1 with
  `authorization_missing_scopes` for `applications:read`.
- Re-authentication was attempted, but the browser OAuth callback timed out
  before completion. Until that succeeds, the CLI cannot link this repo or run
  `clerk env pull`.
- A second `clerk auth login -y` browser OAuth attempt also timed out before
  the callback completed.
- `clerk env pull --app app_3FQcAQ0Wg9Oz9Dog0oTw7bBBbR1` also exits 1 with
  `authorization_missing_scopes` for `applications:read`, confirming the
  remaining setup is blocked on completing Clerk CLI browser authentication.
- A later `clerk auth login -y` attempt completed successfully and logged in as
  `hello@hiltonbrown.com.au`, but `clerk link --app
  app_3FQcAQ0Wg9Oz9Dog0oTw7bBBbR1` still exits 1 with
  `authorization_missing_scopes` for `applications:read`.
- `clerk apps list` also exits 1 with `authorization_missing_scopes` for
  `applications:read`, confirming the authenticated CLI token cannot read Clerk
  applications.
- `clerk doctor` exits 1: host state is writable, CLI is up to date, and the
  CLI is logged in, but the project is not linked and Clerk env values have not
  been pulled.
- `cd apps/app && bun run typecheck` exits 0.
- `bun run check` exits 0.
- `cd apps/app && bun run dev` was started, but after 40 seconds it had not
  emitted a ready line and `curl -I http://localhost:3000` could not connect, so
  the dev process was stopped.

# Plan: Harden apps/web Marketing Surfaces

## Plan

- [x] Verify the current `apps/web` routes, shared header/footer, and marketing CSS for brittle links, overflow, focus, motion, and fallback risks.
- [x] Fix broken or fragile navigation targets without changing the public information architecture.
- [x] Harden responsive layouts against long labels, narrow screens, horizontal demos, and translated copy.
- [x] Add accessibility resilience for keyboard focus, menu semantics, reduced motion, reduced transparency, and high-contrast/forced-colour modes.
- [x] Run targeted static scans for hardening regressions.
- [x] Run `cd apps/web && bun run typecheck`.
- [x] Run `cd apps/web && bun run build`.
- [x] Document the verification and results in this review section.

## Review

- Hardened the shared web header with labelled nav regions, `aria-current`,
  Escape-to-close behaviour, a persistent mobile nav container, and a
  no-JavaScript mobile navigation fallback.
- Added frosted-header opaque fallbacks for unsupported backdrop blur and
  `prefers-reduced-transparency`, plus forced-colour boundaries for shared
  shell, timeline, calendar, feature, pricing, and form surfaces.
- Hardened calendar and team timeline demos with minimum day-column widths,
  horizontal overflow containment, ellipsis-safe titles, LTR feed URL handling,
  and tokenised provenance colours instead of hard-coded inset side stripes.
- Tightened feature/pricing CSS by removing broad `transition: all`, reducing
  persistent 24px radii to the repo's 16px rule, adding focus-visible states to
  pricing FAQ/form controls, and using token colours for marketing pills.
- Targeted scan exits clean: no `repeating-linear-gradient`, `outline: none`,
  `transition: all`, gradient text, 24px+ persistent radii, `#000` text, or
  inset 3px side-stripe shadows in `apps/web/app` and `apps/web/src`.
- Route check confirmed `/integrations/xero` exists for the header/footer links.
- `cd apps/web && bun run typecheck` exits 0.
- `cd apps/web && bun run build` exits 0 and prerenders all public routes.
- `bun run fix` exits 0 and fixed formatting/property order in changed files.
- `bun run check` exits 0.
- `apps/web/next-env.d.ts` was restored after `next build` rewrote it to the
  production route-types import.
- The working tree already contained other web and SEO changes before this
  hardening pass; those were left in place.

# Plan: Execute Plan 019 Marketing Website P1 Launch Pass

## Plan

- [x] Add a shared canonical web URL helper for metadata, robots, and sitemap generation.
- [x] Fix P1 accessibility issues in the feature sandbox, contact form, and calendar integration tabs.
- [x] Bring `/security`, `/integrations/xero`, `/blog`, `/changelog`, and `/contact` into the marketing token vocabulary.
- [x] Remove P1 feature-page visual anti-patterns: striped pending states, hidden focus, persistent glass/shadow mixtures, and over-rounding.
- [x] Run static scans for the fixed anti-patterns.
- [x] Run `bun run check`.
- [x] Run `bun run typecheck`.
- [x] Run `cd apps/web && bun run typecheck`.
- [x] Run `cd apps/web && bun run build`.
- [x] Document the verification and results in `tasks/todo.md`.

## Review

- Added `packages/seo/canonical-url.ts` and reused it from SEO metadata,
  `robots.ts`, and `sitemap.ts`.
- Updated the contact form heading and labels, calendar integration tab ARIA,
  and feature sandbox keyboard focus state.
- Converted the legacy web routes to tokenised `marketing-simple` surfaces in
  `apps/web/app/styles/shell.css`.
- Removed the required scan targets: no `repeating-linear-gradient`, no
  `outline: none`, and no scaffold `uppercase tracking-widest` /
  `rounded-2xl bg-muted` / `rounded-2xl bg-background` matches in the scoped
  route files.
- `env -u NEXT_PUBLIC_WEB_URL -u VERCEL_PROJECT_PRODUCTION_URL bun -e 'import { resolveCanonicalWebUrl } from "./packages/seo/canonical-url.ts"; console.log(resolveCanonicalWebUrl().href)'`
  prints `http://localhost:3001/`.
- `bun run check` exits 0.
- `bun run typecheck` exits 0.
- `cd apps/web && bun run typecheck` exits 0.
- `cd apps/web && bun run build` exits 0 and prerenders `/robots.txt` and
  `/sitemap.xml`.
- `apps/web/next-env.d.ts` was restored after `next build` rewrote it to the
  production route-types import.

# Plan: Fix Local Build and Runtime Environment Variables

## Plan

- [ ] Copy valid `DATABASE_URL` and Clerk keys from `apps/api/.env.local` to `apps/app/.env.local`
- [ ] Set public URL environment variables to their localhost ports (`NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_WEB_URL`, `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_DOCS_URL`) in both `apps/app/.env.local` and `apps/web/.env.local`
- [ ] Comment out any optional environment variables that are set to `""` in `apps/app/.env.local` and `apps/web/.env.local` to prevent validation failures
- [ ] Run `bun run check` to verify linting and typechecking
- [ ] Run `bun run build` to verify the build succeeds for all workspace apps
- [ ] Document the verification and results in `tasks/todo.md`
- [ ] Capture any lessons in `tasks/lessons.md`

## Review
- Verification results and lesson summaries will be recorded here upon completion.

# Plan: Repair Branch and Worktree State

## Plan

- [x] Inspect all local branches, worktrees, branch containment, and git object health.
- [x] Commit any uncommitted edits in every worktree.
- [x] Rebase local worktree branches onto `main` where they are not already contained.
- [x] Merge all local branches into `main`.
- [x] Remove or prune stale/corrupt worktree metadata only if git reports it as stale.
- [x] Run verification commands from `main`.
- [x] Document the final branch/worktree state and verification results here.
- [x] Capture any lesson learned in `tasks/lessons.md`.

## Review

- `git fsck --full` reports dangling objects only, not missing or corrupt objects.
- `git worktree prune --dry-run --verbose` reports no stale worktree metadata.
- All local branches are already contained in `main`; `advisor/016-analytics-spike`
  remains checked out in `/tmp/leavesync-016` at its branch tip.
- Committed the repair plan and lesson in `4eca137`.
- Rebased `advisor/015-broadcast-date-holiday-tests`,
  `advisor/016-analytics-spike`, and `advisor/017-html-calendar-spike` onto
  `main`.
- Merged all three advisor branches back into `main`; each reported "Already up
  to date" after the rebase.
- Final `git branch --no-merged main` produced no output.
- Final `git worktree prune --dry-run --verbose` produced no output.
- Final `bun run check` exits 0.
- Final `bunx vitest run packages/feeds` exits 0 with 10 files and 53 tests
  passing.

# Plan: Execute Plan 007 Batch Xero Sync Handler Lookups

## Plan

- [x] Refresh `plans/007-batch-sync-handler-lookups.md` against current HEAD `d99740f`.
- [x] Dispatch the implementation to a worker with source scope limited to the two sync handlers and matching handler tests.
- [x] Review the worker diff for scope, batching semantics, and meaningful tests.
- [x] Run `bunx tsc --noEmit -p packages/jobs/tsconfig.json`.
- [ ] Run `bunx vitest run packages/jobs`.
- [x] Run `bun run check`.
- [ ] Mark `plans/README.md` plan 007 as DONE if review and verification pass.

## Review

- Implemented batched person lookups for leave balances, batched person and existing-record lookups for leave records, and batched feed rebuild events.
- `bunx tsc --noEmit -p packages/jobs/tsconfig.json` exits 0.
- Targeted handler tests pass: `bunx vitest run packages/jobs/src/handlers/sync-xero-leave-balances.test.ts packages/jobs/src/handlers/sync-xero-leave-records.test.ts` exits 0 with 9 tests passing.
- `bun run check` exits 0.
- `bunx vitest run packages/jobs` exits 1 before Plan 007 assertions fail because `packages/jobs/src/handlers/sync-xero-people.integration.test.ts` imports database config without `DATABASE_URL` set. This is outside Plan 007 scope, so `plans/README.md` was not marked DONE.

# Plan: Execute Plan 008 Batch People And Approvals N+1 Queries

## Plan

- [x] Refresh `plans/008-batch-people-approvals-n-plus-one.md` against current HEAD `d99740f`.
- [x] Dispatch the implementation to a worker with source scope limited to availability people, approvals, duration, and matching tests.
- [x] Review the worker diff for scope, batching semantics, and behavioural equivalence.
- [x] Run `bunx tsc --noEmit -p packages/availability/tsconfig.json`.
- [x] Run `bunx vitest run packages/availability`.
- [x] Run `bun run check`.
- [x] Mark `plans/README.md` plan 008 as DONE if review and verification pass.

## Review

- Worker implemented Plan 008 in commits `52d0706` and `8198ce0` on branch `advisor/008-people-approvals-batching`.
- `computeCurrentStatusForPeople` batches people-list current status lookups; `listPeople` now calls it once per result set. No dashboard edit was required because `dashboard-service.ts` reaches this path through `listPeople`.
- `listForApprover` now preloads working-day reference data and leave balances for the list, while detail/action paths retain their existing single-record fallback helpers.
- `bunx tsc --noEmit -p packages/availability/tsconfig.json` exits 0.
- `bunx vitest run packages/availability` exits 0 with 31 files and 183 tests passing.
- `bun run check` exits 0.
- `plans/README.md` now marks plan 008 as DONE.

# Plan: Execute Plan 009 Scope Feed Render People Fetch

## Plan

- [x] Refresh `plans/009-scope-feed-render-people-fetch.md` against current HEAD `b224ab0`.
- [x] Dispatch the implementation to a worker with source scope limited to feed scope resolution and tests.
- [x] Review the worker diff for scope safety and unchanged manager/dynamic-scope behaviour.
- [x] Run `bunx tsc --noEmit -p packages/feeds/tsconfig.json`.
- [x] Run `bunx vitest run packages/feeds`.
- [x] Run `bun run check`.
- [x] Mark `plans/README.md` plan 009 as DONE if review and verification pass.

## Review

- Worker implemented scope-aware non-preloaded people fetches in `resolvePeopleForFeed`.
- Person and team scopes now narrow the Prisma `where`; org, self, and manager-team scopes keep the broad active-org fetch.
- Added query-shape and output-equivalence tests for person, team, mixed person/team, org, self, and manager-team scopes.
- `bunx tsc --noEmit -p packages/feeds/tsconfig.json` exits 0.
- `bunx vitest run packages/feeds` exits 0 with 9 files and 50 tests passing.
- `bun run check` exits 0.
- `plans/README.md` now marks plan 009 as DONE.

# Plan: Restore Package Typecheck Gate

## Plan

- [x] Delegate plan 006 execution and inspect the STOP condition.
- [x] Keep the safe config edits from plan 006: root `typecheck` runs `turbo typecheck`, and `@repo/typescript-config` has no empty typecheck task.
- [x] Fix only type/config errors surfaced by the widened gate, without runtime behaviour changes.
- [x] Run `bunx turbo typecheck --dry-run=json` to confirm package coverage.
- [x] Run `bun run typecheck`.
- [x] Run `bun run check`.
- [x] Update `plans/README.md` and this review section with the result.

## Review

- Worker stopped because widened typecheck surfaced latent package errors. Continuing with scoped type/config-only fixes.
- `bunx turbo typecheck --dry-run=json` exits 0 and lists `@repo/*` package typecheck tasks.
- `bun run typecheck` exits 0 with the widened `turbo typecheck` gate.
- `bun run check` exits 0.
- `plans/README.md` now marks plan 006 as DONE.
