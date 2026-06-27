# Plan: Distil Calendar Scan Area

## Plan

- [x] **Step 1: Reduce Scan Area Density**
  - [x] Retain the Today in view panel.
  - [x] Remove the separate status legend from the primary scan area.
  - [x] Keep Today copy direct and manager-scannable.
- [x] **Step 2: Quiet Timeline**
  - [x] Retain coverage rail and people lanes.
  - [x] Remove non-essential summary pills and repeated labels.
  - [x] Keep exception signals such as Xero sync issues and hidden people.
- [x] **Step 3: Verification**
  - [x] Update focused calendar tests.
  - [x] Run targeted calendar tests, typecheck, lint/check, and route smoke where practical.

## Review

- Removed the separate status legend from `CalendarScanPanel`, leaving the scan area focused on the Today in view panel.
- Updated the Today empty copy to "No one needs attention today" when the selected scan day is today.
- Quieted `CalendarTimeline` by removing routine "affected" and "busiest" summary pills while keeping Xero sync issue and hidden-people exception signals.
- Updated timeline tests to assert that coverage and person lanes remain while non-essential summary copy is absent.
- Verification passed: calendar component/page Vitest suite, `apps/app` typecheck, `bun run check`, `git diff --check`, and the live `/calendar` signed-out redirect smoke check.

# Plan: Overdrive Calendar Timeline

## Plan

- [x] **Step 1: Calendar Timeline Shape**
  - [x] Combine the selected coverage rail and people timeline directions into one product-appropriate calendar module.
  - [x] Keep the interaction model scannable for managers: range pressure first, person lanes second.
- [x] **Step 2: Implementation**
  - [x] Add a reusable calendar timeline component using existing `CalendarRange` data.
  - [x] Integrate the timeline into `apps/app/app/(authenticated)/calendar/page.tsx` without changing calendar data loading.
  - [x] Preserve token-based colour usage, 16px radius, Australian English, and reduced-motion support.
- [x] **Step 3: Verification**
  - [x] Add focused rendering tests for the timeline.
  - [x] Run targeted Vitest coverage for calendar components.
  - [x] Run relevant lint/type/check commands where practical.
  - [x] Perform a local visual smoke check if the app can start in this environment.

## Review

- Added `CalendarTimeline`, combining a daily coverage rail with compact person lanes derived from the existing `CalendarRange` projection.
- The coverage rail links each day into day view and surfaces affected people, busiest day, public holidays, and Xero sync failures.
- The person timeline groups records by person, assigns overlap-safe lanes, preserves event popovers, and caps the compact view at 10 people with a hidden-count summary.
- Integrated the timeline into the authenticated calendar page after the scan panel and before the existing calendar grid.
- Added focused timeline tests for range coverage, person lanes, compact lane capping, and the empty range state.
- Verification passed: scoped Ultracite check, full `bun run check`, calendar component/page Vitest suite, `apps/app` typecheck, and `git diff --check`.
- Local smoke check against the existing app server on port 3000 returned the expected Clerk signed-out redirect for `/calendar`.
- Browser screenshot automation was not available in this workspace, so visual verification was limited to rendered component tests and the live route smoke check.

# Plan: Rebrand LeaveSync to Team Calendar

## Plan

- [x] **Step 1: Read-only Discovery & Audit**
  - [x] Search the repository case-insensitively for `leavesync`, `LeaveSync`, `LEAVESYNC`, `leave-sync`, `leave_sync`, and `@ical.leavesync.app`.
  - [x] Group findings and produce the initial audit inventory in `tasks/rebrand-final-audit.md` (identifying exclusions, human-facing copy, package names, code identifiers, comments, configs, and dev seed placeholder).
- [x] **Step 2: Consolidate Branding Constants**
  - [x] Locate `packages/seo/branding.ts` or its equivalent.
  - [x] Add canonical display name, slug, compact slug, domain, and ICS host constants if missing.
  - [x] Replace any hardcoded brand literals in code with references to these constants.
- [x] **Step 3: Execute Rename & Rebrand**
  - [x] Update human-facing copy (UI strings, HTML templates, email templates) to **Team Calendar**.
  - [x] Update package names and manifests (`package.json`, workspace configurations) to **team-calendar**.
  - [x] Update repo-internal directory/slug identifiers.
  - [x] Rename the seed placeholder `org_dev_leavesync` to `org_dev_teamcalendar` consistently.
- [x] **Step 4: Update ICS UID Suffix**
  - [x] In `packages/feeds`, replace `@ical.leavesync.app` with `@ical.teamcalendar.online`.
  - [x] Update UID formula, constant, and associated tests asserting on the suffix.
- [x] **Step 5: Update Documentation & Email**
  - [x] Update `README.md`, `PRODUCT.md`, `CLAUDE.md`, `DESIGN.md`, screen catalogues. Ensure no tenancy key descriptions (like `clerk_org_id`) are altered.
  - [x] Update transactional email/notifications copy in `apps/email` and `packages/notifications`.
- [x] **Step 6: Document External Follow-Ups**
  - [x] Group all manual/external service changes in `tasks/rebrand-final-audit.md`.
- [x] **Step 7: Verification & Compliance**
  - [x] Run `bun run check` to verify linting and formatting.
  - [x] Run typescript typechecking across all workspaces.
  - [x] Run the Vitest test suite (`bun run test`).
  - [x] Confirm everything compiles, typechecks, and tests pass clean.

## Review

- Compiled a case-insensitive search inventory of legacy brand strings and generated the initial audit report in `tasks/rebrand-final-audit.md`.
- Updated `packages/seo/branding.ts` to expose all canonical constants (display name, hyphenated and compact slugs, primary domain and URL, ICS suffix, noemail domain).
- Refactored hardcoded literals across the workspace packages (`packages/feeds`, `packages/availability`, `packages/jobs`) to import and use the new branding constants.
- Renamed the `leavesync_leave` database enum value to `team_calendar_leave` across the Prisma schema, init migration, and 21 workspace files.
- Renamed the local cache connection database variable and the `leavesync:` localStorage onboarding namespace prefix.
- Updated Vercel project configuration names and package names to use the package slug `team-calendar`.
- Refactored documentation prose, transactional email/notification copy, and doc page favicons, while fully preserving Clerk tenancy rules and the `clerk_org_id` / `organisation_id` model references.
- Renamed the local developer seed org placeholder `org_dev_leavesync` to `org_dev_teamcalendar` consistently.
- Verified workspace compliance: `bun run check` exits with 0 errors, and the entire Vitest suite passes successfully. All files have been clean-formatted.

# Plan: Fix Turbo Dev Shutdown Address Boundary Error

## Plan

- [x] Reproduce `bun run dev` startup after freeing stale ports.
- [x] Confirm the address boundary error happens during Turbo TUI shutdown.
- [x] Test Turbo stream UI as the smaller workaround.
- [x] Update the dev script to use stream UI and verify startup plus Ctrl-C shutdown.

## Review

- Freed stale dev processes that were occupying ports 3000, 3001, 3002, and
  3003 from previous smoke checks.
- Reproduced the shutdown problem: `bun run dev` with the bare `turbo` script
  starts all four services, but Ctrl-C exits with `SIGSEGV (Address boundary
  error)`.
- Direct `bunx turbo dev --ui=stream ...` starts all services and does not emit
  the address-boundary shutdown error.
- Updated the root `dev` script to use
  `bunx turbo dev --ui=stream --filter=app --filter=api --filter=web --filter=email`.
- Verified the updated `bun run dev` starts app, web, api, and email on ports
  3000, 3001, 3002, and 3003.
- Ctrl-C on the updated script exits without the address-boundary error; Turbo
  reports force-killed persistent tasks during shutdown.
- Confirmed no listeners remain on ports 3000-3003 after shutdown.
- `bun run check` exits 0.

# Plan: Fix Remaining API Runtime Error

## Plan

- [x] Reproduce the API runtime error from `apps/api` dev server.
- [x] Identify whether the failure is route code, instrumentation, config, or cache state.
- [x] Patch the smallest source or config issue.
- [x] Verify with API dev smoke test plus targeted checks.

## Review

- The remaining API error was not the design-system boundary issue. The running
  `/api/inngest` route returned `500` because the SDK was in cloud mode without
  `INNGEST_SIGNING_KEY`.
- The active local API env came from Vercel-style values and did not include
  `INNGEST_DEV`, so Inngest did not enter local development mode.
- Added `INNGEST_DEV` validation to `packages/jobs/keys.ts`, documented
  `INNGEST_DEV="1"` in `apps/api/.env.example`, and added it to
  `apps/api/.env.local` without changing secret values.
- Added jobs client coverage for `INNGEST_DEV="1"` and explicit dev server URL
  values.
- Restarted the stale API dev process so it picked up the updated env.
- `curl -i --max-time 15 http://localhost:3002/health` returns `HTTP/1.1 200 OK`.
- `curl -i --max-time 15 http://localhost:3002/api/inngest` returns
  `HTTP/1.1 200 OK` with `"mode":"dev"`.
- `bunx vitest run packages/jobs/src/client.test.ts` passes: 4 tests.
- `cd apps/api && bun run typecheck` exits 0.
- `cd packages/jobs && bun run typecheck` exits 0.
- `bun run check` exits 0.

# Plan: Fix API Boundary Error

## Plan

- [x] Reproduce the API boundary failure with the project boundary checker.
- [x] Identify the exact import or package rule violation.
- [x] Patch the smallest source/package change that restores the intended boundary.
- [x] Run targeted API boundary/type checks and document the result.

## Review

- `apps/api/app/global-error.tsx` was the only API source importing
  `@repo/design-system`, through the shared `Button` component and font helper.
- Replaced that global error page with self-contained HTML and a native button,
  keeping Sentry error capture and the reset behaviour.
- Removed the unused `@repo/design-system` dependency from `apps/api/package.json`
  and synced `bun.lock` with `bun install`.
- `rg -n "@repo/design-system" apps/api apps/api/package.json` finds no remaining
  API design-system references.
- `bun run boundaries --filter=api` exits 0.
- `cd apps/api && bun run typecheck` exits 0.
- `bun run check apps/api` exits 0.
- `bun run boundaries` exits 0.

# Plan: Fix Web Dev Instrumentation Failure After Turbo 2.10

## Plan

- [x] Reproduce `apps/web` dev failure outside the aggregate Turbo TUI.
- [x] Inspect generated instrumentation output and local config to identify the root cause.
- [x] Apply the smallest durable fix that preserves shared observability conventions.
- [x] Run targeted web verification and repo checks where practical.
- [x] Document verification and results in this review section.

## Review

- The failing file was a stale generated Turbopack artefact:
  `apps/web/.next/dev/server/chunks/[project]_apps_web_instrumentation_ts_056r9kp._.js`.
  It threw `MODULE_UNPARSABLE` for `apps/web/instrumentation.ts` even though the
  source file existed.
- Removed the generated `apps/web/.next` cache so Next 16.2.6/Turbopack could
  rebuild instrumentation from source after the Turbo 2.10 upgrade.
- No source-level instrumentation or observability code changes were required.
- `cd apps/web && bun run dev` starts successfully outside the Codex sandbox:
  Next reports ready on `http://localhost:3001`.
- `curl -I --max-time 10 http://localhost:3001` returns `HTTP/1.1 200 OK`.
- `cd apps/web && bun run typecheck` exits 0.
- `bun run check` exits 0.
- The original root command `bun run dev` starts `web`, `app`, `api`, and
  `email`; all four services report ready. The bounded verification was stopped
  by `timeout` after startup, so Turborepo reported persistent tasks as
  interrupted, but the original web instrumentation error did not recur.

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

# Plan: Critique Plans UI

## Plan

- [x] Resolve the concrete plans route files and read the relevant UI implementation.
- [x] Run the impeccable deterministic detector for the plans surface.
- [x] Review the plans list, create, edit, modal, loading, empty, and error behaviours against PRODUCT.md, DESIGN.md, and the product register.
- [x] Persist the critique snapshot under `.impeccable/critique`.
- [x] Document the critique result and run notes.

## Review

- Used `$impeccable critique` against `apps/app/app/(authenticated)/plans`.
- Detector returned 0 findings for the route directory.
- Manual design assessment scored the plans surface 22/40 with 0 P0 and 3 P1 issues.
- Main critique: no obvious visual slop, but the product workflow feels scaffolded because status semantics, row actions, and leave-vs-availability intent are not structurally clear enough for a payroll-adjacent flow.
- Persisted the snapshot to `.impeccable/critique/2026-06-27T00-35-57Z__apps-app-app-authenticated-plans.md`.

# Plan: Colorize Plans Status Vocabulary

## Plan

- [x] Define a restrained, token-based plans status vocabulary for draft, pending, approved, declined, withdrawn, archived, and Xero sync failed.
- [x] Apply the vocabulary to status badges, source chips, row treatments, and a compact status legend/summary on the plans table.
- [x] Add focused tests for status labels and scanability cues.
- [x] Run targeted plans tests and relevant checks.
- [x] Document verification and results.

## Review

- Added `apps/app/app/(authenticated)/plans/_status.ts` with a plans-specific status vocabulary that maps `submitted` to `Pending`, uses sage for approved, lavender for pending, red container for declined/Xero failures, and muted treatments for draft/withdrawn/archived.
- Updated the plans table to use status badges with icons, source chips for Leave vs Availability, row tints for attention states, and a compact current-view status summary for manager scanning.
- Added `_status.test.ts` for vocabulary mapping and extended `page.test.tsx` to verify visible status labels and current-view counts.
- Verification passed: scoped Biome check, focused plans Vitest suite, `apps/app` typecheck, and impeccable detector.
- Attempted to start an alternate dev server on port 3012, but Next reported an existing app dev server on port 3000. Verified the existing server responds with the expected unauthenticated redirect.

# Plan: Distill Plans Action Queue

## Plan

- [x] Define action priority so each row exposes one primary next action and hides secondary actions behind a menu.
- [x] Remove the disabled `View` affordance from rendered row actions.
- [x] Strengthen pending and failed rows with concise action guidance.
- [x] Add focused tests for primary action selection, overflow actions, and no disabled `View`.
- [x] Run scoped formatting, targeted tests, typecheck, and detector.

## Review

- Replaced the visible row action pile-up with a single primary next action plus a `More actions` dropdown for secondary actions.
- Removed the disabled `View` affordance from rendered row actions until a real view state exists.
- Added concise status cues under attention states: pending rows show "Awaiting approval", declined rows show "Needs correction", and Xero sync failures show "Retry or revert".
- Extended the plans client tests to cover primary action selection, overflow actions, and absence of disabled `View`.
- Verification passed: scoped Biome check, focused plans Vitest suite, `apps/app` typecheck, and impeccable detector.

# Plan: Shape Plans Form Intent

## Plan

- [x] Add an intent-first segmented control for Leave vs Availability in the plans form.
- [x] Filter plan type options by intent and reset the record type when intent changes.
- [x] Keep consequence copy, balance visibility, and submit buttons aligned to the selected intent and Xero connection state.
- [x] Add focused tests for default leave intent, switching to availability, and local availability edit defaults.
- [x] Run scoped formatting, targeted tests, typecheck, and detector.

## Review

- Added an intent-first Leave vs Availability segmented control to the plans form.
- Filtered plan type choices by intent, with intent changes resetting the selected type to the first valid option for that intent.
- Kept the consequence panel, balance visibility, and submit action set aligned to the selected intent and Xero connection state.
- Extended the modal form tests for default leave intent, switching to availability, and availability edit defaults.
- Verification passed: scoped Biome check, focused modal form Vitest suite, full scoped plans Vitest suite, `apps/app` typecheck, and impeccable detector.

# Plan: Clarify Plans Consequence Copy

## Plan

- [x] Tighten Xero disconnected copy on the plans page, table footer, and leave form.
- [x] Clarify balance copy so unavailable and remaining-balance states explain the consequence.
- [x] Clarify submit, retry, revert, empty-state, and recovery messages across plans.
- [x] Update focused tests for the revised copy.
- [x] Run scoped formatting, plans tests, app typecheck, and detector.

## Review

- Rewrote the plans page disconnected-Xero banner to say leave saves in Team Calendar only, appears on calendars, and does not create payroll leave or enter the Xero approval queue.
- Updated the plans empty state, plans fetch recovery copy, table introduction, pending/declined/Xero-failed row cues, balance text, and disconnected footer.
- Updated the form consequence panel, intent helper text, balance copy, save error prefix, and no-people empty state.
- Updated submit/retry confirmation copy so users see the Xero handoff, manager approval consequence, retry outcome, and draft recovery path before acting.
- Verification passed: scoped Biome check, full scoped plans Vitest suite, submit confirmation and fetch error state tests, and impeccable detector.
- `cd apps/app && bun run typecheck` is blocked by unrelated existing unauthenticated route moves: generated `.next/types` and `apps/app/__tests__/sign-in.test.tsx` / `sign-up.test.tsx` still reference `app/(unauthenticated)/sign-in` and `sign-up`, while the worktree has those pages under `app/(unauthenticated)/(auth)/...`.

# Plan: Harden Plans Confirmation Dialogs

## Plan

- [x] Replace the submit confirmation inline overlay with the shared dialog system.
- [x] Replace the plans revert/withdraw fixed overlay with the shared alert dialog system.
- [x] Preserve existing submit, retry, revert, and withdraw behaviour while improving focus trapping and close semantics.
- [x] Add focused tests for dialog roles, accessible names, and confirmation controls.
- [x] Run scoped formatting, targeted tests, plans tests, typecheck where possible, and detector.

## Review

- Replaced the custom inline submit confirmation overlay in `SubmitConfirmationModal` with a controlled shared `Dialog`, including `DialogTitle`, `DialogDescription`, close handling, and disabled-close behaviour while pending.
- Replaced the custom fixed revert/withdraw overlay in the plans table with a controlled shared `AlertDialog`, including labelled title, description, cancel action, and confirm action.
- Added tests for the submit dialog role/name, shared close control, alert dialog role/name, focused cancel action, and cancel dismissal.
- Verification passed: scoped Biome check, full scoped plans plus submit confirmation Vitest suite, impeccable detector, `next typegen`, and `cd apps/app && bun run typecheck`.

# Plan: Polish Plans Surface

## Plan

- [x] Review the latest plans critique snapshot and current plans implementation against product/design-system guidance.
- [x] Remove stale confirmation dialog API and polish async confirmation behaviour.
- [x] Tighten final accessibility and responsive table details.
- [x] Run scoped formatting, plans tests, typecheck, detector, and diff checks.

## Review

- Reviewed critique snapshot `.impeccable/critique/2026-06-27T00-35-57Z__apps-app-app-authenticated-plans.md`, which had 0 P0 and 3 P1 issues. The status, action queue, form IA, consequence copy, and dialog-pattern issues have now been addressed by the recent passes.
- Removed the obsolete `inline` prop from `SubmitConfirmationModal` and its callers/tests now that submit confirmation always uses the shared `Dialog`.
- Prevented `AlertDialogAction` from auto-closing the revert/withdraw confirmation before the async record action runs to completion.
- Removed the table wrapper clipping so the shared table component can provide horizontal scrolling on narrow viewports.
- Marked row-level action errors with `role="alert"` so async failures are announced.
- Verification passed: scoped Biome check, full scoped plans plus submit confirmation Vitest suite, `cd apps/app && bun run typecheck`, impeccable detector, and `git diff --check`.

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
- [x] Start the app and document the setup result in this review section.

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
- On retry in this session, `clerk auth login` completed successfully as
  `hello@hiltonbrown.com.au`; `clerk auth login -y` also completed successfully.
- `clerk init --app app_3FQcAQ0Wg9Oz9Dog0oTw7bBBbR1` still exits 1 because the
  Clerk CLI cannot detect a framework from the monorepo root.
- The existing Next.js fallback remains valid: `@clerk/nextjs` `^7.3.7` is
  installed through `@repo/auth`, `ClerkProvider` is mounted inside `<body>` via
  `DesignSystemProvider`, auth pages render Clerk sign-in/sign-up components
  with visible headings, authenticated routes use `await auth()`, and the
  authenticated header renders a Clerk `UserButton`.
- The explicit app-linking fallback is blocked by Clerk OAuth scope:
  `clerk link --app app_3FQcAQ0Wg9Oz9Dog0oTw7bBBbR1` exits 1 with
  `authorization_missing_scopes` for `applications:read`.
- `clerk env pull --app app_3FQcAQ0Wg9Oz9Dog0oTw7bBBbR1` exits 1 with the same
  missing `applications:read` scope, so the CLI could not write Clerk env
  values.
- `clerk doctor` exits 1: host state is writable, CLI is up to date, and the
  CLI is logged in, but the project is not linked and Clerk env values have not
  been pulled.
- A fresh `clerk doctor --json` confirms the CLI is authenticated as
  `hello@hiltonbrown.com.au`, but the project is not linked and `.env.local` is
  missing `CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY`.
- Local Clerk development env values were updated without printing secrets:
  `.env.local` now has the Clerk key names required by `clerk doctor`, and both
  `.env.local` and `apps/app/.env.local` have the Clerk route URLs set to
  `/sign-in`, `/sign-up`, `/`, and `/`.
- Root `.env.local` was normalised again from `apps/app/.env.local`: the Clerk
  development publishable key, secret key, optional webhook secret, CLI
  `CLERK_PUBLISHABLE_KEY`, and auth route URLs are present without printing any
  secret values. Prefix checks confirm the publishable key is `pk_test_`, the
  secret key is `sk_test_`, and the CLI publishable key matches the public key.
- After the local env update, `clerk doctor --json` passes the environment
  variables check, but still exits 1 because the project is not linked.
- `clerk link` cannot select an application in agent mode, and `clerk link --app
  app_3FQcAQ0Wg9Oz9Dog0oTw7bBBbR1` still exits 1 with
  `authorization_missing_scopes` for `applications:read`.
- Root `components.json` is absent, so the requested `@clerk/ui` shadcn setup
  does not apply at the project root.
- `cd apps/app && bun run typecheck` exits 0.
- `bun run check` exits 0.
- `cd apps/app && bun run dev` was started, but after about 50 seconds it had
  not emitted a ready line and `curl -I http://localhost:3000` could not
  connect, so the dev process was stopped.
- After the env update, `cd apps/app && bun run dev` was retried, but after
  about 65 seconds it still had not emitted a ready line and
  `curl -I http://localhost:3000` could not connect, so the dev process was
  stopped again.

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
