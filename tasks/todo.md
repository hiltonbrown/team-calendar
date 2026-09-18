# Current work

Last reviewed: 2026-08-30

Keep this file limited to active work and unresolved follow-ups. Each plan must
state an outcome, use verifiable checkboxes, and end with a review containing the
evidence actually collected. Completed plans move to `tasks/archive.md`.

## Active plan: Simplify the marketing workflow heading

Status: Complete

### Tasks

- [x] Replace the homepage workflow heading with “One easy workflow”.
- [x] Add a focused copy regression test.
- [x] Run focused tests, web checks and the production build.
- [x] Commit and push the verified copy update to `origin/preview`.

### Review

- The homepage workflow heading is now “One easy workflow”; the former wording
  is absent from the rendered section.
- One focused regression test, all 100 web tests, web typecheck, the 919-file
  repository check, Impeccable detection and the web production build passed.

## Active plan: Restore the TeamTimelineSection branch and live contract

Status: Complete

### Tasks

- [x] Compare the preview implementation with `main` and the published marketing page.
- [x] Restore the timeline copy, horizontal-scroll affordance and interaction styling owned by the section.
- [x] Remove the client-side environment access that prevented the interactive timeline from hydrating.
- [x] Replace the incorrect pre-redesign regression expectations with the current branch/live contract.
- [x] Verify desktop and mobile rendering, focused tests, web checks and the production build.
- [x] Commit and push the verified fix to `origin/preview`.

### Review

- The section markup and owned styling now match `main` and the published
  marketing page: the current selection copy, mobile swipe affordance,
  interaction feedback and 44px mobile controls are restored.
- A client-only Better Stack configuration read was also preventing the page's
  React tree from hydrating. Observability keys now validate the grouped secret
  configuration on the server without reading those fields in the browser.
- The production build hydrated to 13 labelled event buttons. Browser-backed
  interaction coverage confirmed week navigation and selected-entry details;
  desktop and mobile production captures matched the live timeline composition.
- Three focused timeline tests, 101 web tests, all 17 unit-test workspaces, all
  19 typecheck tasks, the 920-file repository check, source Impeccable detection,
  the web production build and all 119 configured integration tests passed. The
  two credential-dependent live-Xero checks remained skipped as expected.

## Active plan: Bind homepage hero motion to its SVG paths

Status: Complete

### Tasks

- [x] Inspect the live desktop hero at multiple animation times.
- [x] Bind each moving packet directly to its visible SVG path.
- [x] Normalise the line-reveal lengths and preserve reduced-motion behaviour.
- [x] Add a regression contract for all three path-to-packet mappings.
- [x] Run focused tests, rendered verification, Impeccable detection, web checks and the production build.
- [x] Commit and push the verified motion fix to `origin/preview`.

### Review

- Each packet now uses an SVG `mpath` reference to the exact visible Xero,
  calendar or return curve. Packets hold at the start while hidden, travel at a
  constant pace while visible, then finish and fade at the path endpoint.
- All three curves use `pathLength="1"`; their scroll-driven reveals no longer
  depend on guessed pixel lengths or a second CSS motion-path coordinate system.
- Chromium captures at 1.5, 3 and 4.5 seconds confirmed every packet remained
  centred on its line. A reduced-motion capture kept all lines visible and
  removed every moving packet.
- Two focused motion tests, all 99 web tests, web typecheck, the 918-file
  repository check, Impeccable detection and the web production build passed.

## Active plan: Restore the homepage team timeline

Status: Complete

### Tasks

- [x] Identify the last pre-redesign TeamTimelineSection visual contract.
- [x] Restore the section markup, copy and local interaction styling without reverting unrelated homepage work.
- [x] Add a regression contract for the restored section.
- [x] Run focused tests, Impeccable detection, web checks and the production build.
- [x] Commit and push the verified restoration to `origin/preview`.

### Review

- Git commit `b1541ce6^` supplied the last pre-redesign visual contract. The
  original overline, heading spacing, interaction copy, flat event blocks,
  day-count treatment and compact mobile controls are restored locally without
  reverting unrelated homepage work.
- Two focused regression tests, all 97 web tests, web typecheck, the 917-file
  repository check, source-based Impeccable detection and the web production
  build passed.
- The existing local homepage returned HTTP 200, but rendered Impeccable URL
  scans could not start because Puppeteer is not installed. No new rendered
  desktop or mobile screenshot claim is made; the restoration is bounded by
  the historical Git diff, component contract and production build.

## Active plan: Restore the focused marketing header menu

Status: Complete

### Tasks

- [x] Restore Home, Features, Integrations and Pricing as the only header menu links.
- [x] Preserve route-specific skip links for removed menu destinations.
- [x] Update the header contract tests for desktop, mobile and no-JavaScript navigation.
- [x] Run focused tests, Impeccable detection, web checks and the production build.
- [x] Commit and push the verified change to `origin/preview`.

### Review

- The desktop, mobile and no-JavaScript header menus now contain only Home,
  Features, Integrations and Pricing. About, Blog and Help Centre remain
  available through their routes and footer navigation, but no longer compete
  in the primary menu.
- Route-specific skip links remain intact on About, Blog and Help Centre pages.
- Eleven focused header tests, all 95 web tests, web typecheck, the 916-file
  repository check, Impeccable detection and the web production build passed.

## Active plan: Deliver Plans 110 through 143 to preview

Status: Complete

### Outcome

Plans 110 through 143 are executed in dependency order on `preview`. Each plan
uses its specified Impeccable workflow, passes its required verification,
receives a dedicated implementation commit, and is pushed to `origin/preview`
before the next plan begins.

### Tasks

- [x] Reconcile the approved Plan 110 through 119 commits with
  `origin/preview` and record their landing evidence.
- [x] Execute, verify, commit and push Plan 120.
- [x] Execute, verify, commit and push Plans 121 through 123 in dependency
  order.
- [x] Plan 124: lock the help content, markup and sitemap contracts with focused
  failing tests.
- [x] Plan 124: centralise the eight-step AU onboarding content and rebuild the
  task gateway and phased guide.
- [x] Plan 124: add Help centre navigation, route-aware bypass links, focus
  treatment and nested sitemap discovery.
- [x] Plan 124: run the Impeccable audit, bounded browser review, build and all
  repository gates; commit and push both implementation and review evidence.
- [x] Execute, verify, commit and push Plans 125 through 129 in dependency
  order.
- [x] Plan 125: characterise Blog landmarks, guide-led positioning, navigation
  and stable sitemap dates with failing tests.
- [x] Plan 125: replace `mdx-bundler` with the supported Next MDX Server
  Component pipeline and one validated static catalogue.
- [x] Plan 125: correct both articles, build the Read-mode index/article system,
  metadata, social image, RSS and error recovery.
- [x] Plan 125: run Impeccable, React, browser, build and repository verification;
  commit, document and push before Plan 126.
- [x] Plan 126: lock Careers applicant truth, landmark, email and responsive
  contracts with focused failing tests.
- [x] Plan 126: rebuild Careers as a candid applicant page with one-or-three
  practice composition and route-aware bypass target.
- [x] Plan 126: run Impeccable, React, Axe, browser, build and repository
  verification; commit, document and push before Plan 127.
- [x] Plan 127: lock feed privacy, direct-person visibility, role assignment,
  holiday administration, observability and route-boundary contracts with
  failing tests.
- [x] Plan 127: implement the stricter privacy projection, central person
  authorisation, owner-aware mutations, Sentry scrubbing and default-protected
  Clerk route matrices.
- [x] Plan 127: rebuild `/security` from verified evidence and align the private
  vulnerability-reporting policy.
- [x] Plan 127: run Impeccable, React, browser, build and repository verification;
  commit, document and push before Plan 128.
- [x] Execute, verify, commit and push Plans 130 through 143 in dependency
  order.
- [x] Run the final preview verification and record exact evidence.

### Review

- All 34 implementation commits for Plans 110 through 143 are ancestors of
  `preview`; the plan index records the exact implementation commit for each.
- The final current-state release run checked 916 files with no fixes, passed
  all 19 typecheck tasks and all 17 unit-test workspaces (1,969 tests), and
  built both the authenticated app and public web app successfully.
- All 119 configured integration tests passed. The two live-Xero checks remain
  skipped because their external credentials are not configured.
- Authenticated visual limitations and external configuration follow-ups remain
  recorded per plan in `plans/README.md`; none is represented as completed
  browser evidence.

## Active plan: Make sync status truthful, accessible and easier to operate

Status: Complete

### Tasks

- [x] Read Plan 140, its Impeccable references and the Sync drift.
- [x] Key dispatch progress by tenant and operation with two-tenant coverage.
- [x] Distil tenant actions into a labelled sync-type choice and one primary action.
- [x] Expose disabled reasons visibly and accessibly on list and detail surfaces.
- [x] Add organisation-preserving filter reset, active feedback and empty recovery.
- [x] Add a complete mobile history projection with accessible wide-table fallback.
- [x] Protect cancel and re-run independently with operation-specific progress.
- [x] Run focused tests, bounded visual/detector checks and every repository gate.
- [x] Commit, document issues and push Plan 140 to `origin/preview` before Plan 141.

### Review

- Plan 140 implementation landed at `1af2433`.
- Sync dispatch progress is keyed by Xero tenant and operation, every registered
  run type remains available through one labelled control, disabled reasons are
  visible, and run history has complete mobile and keyboard-scrollable wide
  projections. Detail re-run and cancellation expose independent progress and
  reject duplicate submission.
- Fourteen focused tests, 504 app tests, the production build, repository check,
  full typecheck, zero Impeccable detector findings and all 119 integration
  tests passed; the two configured live-Xero checks remain skipped.
- The protected route returned Clerk's signed-out 404 with
  `dev-browser-missing`, and the optional `agent-browser` executable was absent.
  Authenticated desktop, mobile, dark-mode and 200% rendered checks therefore
  remain explicitly unclaimed and are recorded in `plans/README.md`.

## Active plan: Keep availability deep links correct and remove legacy UI ambiguity

Status: Complete

### Tasks

- [x] Confirm Plan 141 dependency, canonical route ownership, drift and zero-import proof.
- [x] Centralise legacy redirect query handling with first-valid organisation selection.
- [x] Cover all three redirects, repeated query values and create/edit deep links.
- [x] Collapse duplicate command actions onto the canonical New plan destination.
- [x] Remove the unreferenced manual availability form and guard against its return.
- [x] Run focused tests and every repository gate without a redirect screenshot claim.
- [x] Commit, document and push Plan 141 to `origin/preview` before Plan 142.

### Review

- Plan 141 implementation landed at `42f0d7c`.
- All three compatibility routes now share first-valid UUID organisation
  selection and preserve every repeated non-organisation query value. The
  command palette exposes one canonical New plan action with leave and
  availability search terms, and the zero-import legacy form is deleted.
- Fifteen focused tests, 513 app tests, the production build, repository check,
  full typecheck and all 119 integration tests passed; the two configured
  live-Xero checks remain skipped. No screenshot claim was made for redirect
  shims whose rendered destination was already completed by Plan 137.
- Public Help centre copy still names the removed duplicate command label. That
  separate marketing-content mismatch is recorded in `plans/README.md` rather
  than expanding this redirect-only plan's explicit scope.

## Active plan: Preserve leave-balance deep links and orient users at the person profile

Status: Complete

### Tasks

- [x] Confirm Plan 142 dependency, profile-tab mechanism and redirect drift.
- [x] Normalise scalar/repeated organisation and person identifiers safely.
- [x] Preserve repeated query values and open person links on Balances.
- [x] Teach full-page and modal profiles the same validated tab contract.
- [x] Cover exact list/detail redirects and balance-tab discovery.
- [x] Run focused tests and every repository gate without a redirect screenshot claim.
- [x] Commit, document and push Plan 142 to `origin/preview` before Plan 143.

### Review

- Plan 142 implementation landed at `9b8e677`.
- Legacy balance links now select the first valid organisation and person UUID,
  preserve repeated non-routing values and open a person profile with
  `tab=balances`. Full-page and intercepted profiles share one typed parser for
  every supported tab, so the destination renders Balances immediately.
- Fifteen focused tests, 525 app tests, the production build, repository check,
  full typecheck and all 119 integration tests passed; the two configured
  live-Xero checks remain skipped. No screenshot or design-health claim was
  made for the redirect shim; Plan 136 remains the profile visual authority.

## Active plan: Make setup a single, confident next-step experience

Status: Complete

### Tasks

- [x] Confirm Plan 143 dependency, redirect drift, dashboard semantics and dead-client proof.
- [x] Keep one full checklist in Settings and reduce Dashboard to a dismissible summary.
- [x] Promote one required next action and disclose completed/optional/later groups.
- [x] Add labelled progress, all-complete recovery and organisation-safe CTAs.
- [x] Cover scalar/repeated setup redirects and delete the unreachable legacy client.
- [x] Run focused tests, detector, bounded visual checks and every repository gate.
- [x] Commit, document and push Plan 143 to `origin/preview`.

### Review

- Plan 143 implementation landed at `63fee49`.
- The full setup checklist now lives only in Settings, promotes exactly one
  required next action, labels progress and discloses completed, optional and
  later work. The Dashboard keeps a dismissible summary, and completed setup
  offers a direct return to the Dashboard.
- The legacy setup redirect now selects the first valid organisation UUID and
  preserves repeated non-routing query values. The unreachable legacy client
  was deleted after its zero-import proof.
- Sixteen focused tests, 537 app tests, the production build, repository check,
  full typecheck, zero general and layout Impeccable detector findings and all
  119 integration tests passed; the two configured live-Xero checks remain
  skipped.
- The optional `agent-browser` executable is absent, while signed-out requests
  to `/` and `/settings/getting-started` redirect to Clerk with
  `dev-browser-missing`. Authenticated desktop, mobile, dark-mode and 200%
  rendered checks remain explicitly unclaimed.

## Active plan: Make plans clear, responsive and truthful about provenance

Status: Complete

### Tasks

- [x] Confirm Plan 137 drift, data contracts and Impeccable direction.
- [x] Separate Leave/Availability category from Xero/Manual provenance.
- [x] Add action-specific Xero recovery and per-record pending feedback.
- [x] Reflow the records table into a mobile plan list with disclosed detail.
- [x] Distil summary and filter controls, including active chips and reset.
- [x] Add route-local loading/error states and characterise working-day work.
- [x] Complete detector, build and repository verification; commit and push.

### Review

- Plan 137 implementation landed at `ef6469f`.
- Fourteen focused tests cover provenance/category independence, action-specific
  failure copy, filter reset, route recovery, record-scoped pending feedback
  and one working-day computation per item across a 25-record list.
- Impeccable returned no findings. The app production build, repository check,
  typecheck, 479 app tests and all 119 integration tests passed; the two
  configured live-Xero checks remain skipped.
- The protected route redirected the signed-out browser with
  `dev-browser-missing`, so authenticated desktop, mobile, dark-mode and 200%
  rendered checks remain unclaimed. Failed withdrawal retry is not supported by
  the current state service and is recorded in `plans/README.md` rather than
  represented by a non-functional control.

## Active plan: Give public-holiday management one safe, responsive home

Status: Complete

### Tasks

- [x] Confirm Plan 138 ownership, refresh and persisted jurisdiction contracts.
- [x] Make Public Holidays the operational surface and Settings the summary.
- [x] Add consequence-aware suppress/delete confirmation and restore receipts.
- [x] Add organisation-wide and imported-jurisdiction custom holiday scope.
- [x] Remove viewer action chrome and add responsive rows plus Suppressed labels.
- [x] Complete focused tests, detector, build and repository verification.
- [x] Commit, document issues and push Plan 138 to `origin/preview`.

### Review

- Plan 138 implementation landed at `b7f037a`.
- Public Holidays is the one operational home, with source refresh, scoped
  custom creation, consequence-aware suppress/delete confirmation, restore
  receipts, viewer-safe rendering and responsive labelled rows.
- Nine focused UI tests, 16 focused holiday-service tests, 486 app tests, the
  production build, Impeccable detection and all 119 integration tests passed;
  the two configured live-Xero checks remain skipped.
- The authenticated browser route redirected with `dev-browser-missing`, so
  desktop, mobile, dark-mode and 200% rendered checks remain unclaimed.
- The create contract safely persists organisation-wide or imported-
  jurisdiction scope. Location-specific holiday assignments are not accepted
  by that contract and remain recorded in `plans/README.md`.

## Active plan: Make Settings responsive, context-safe and goal-grouped

Status: Complete

### Tasks

- [x] Read Plan 139, Impeccable references and Settings drift.
- [x] Preserve the exact active organisation across grouped Settings navigation.
- [x] Replace the fixed mobile sidebar with an accessible responsive navigator.
- [x] Label auto-save controls and expose scoped save receipts.
- [x] Distil Xero actions and protect disconnect with shared confirmation.
- [x] Make unsupported country choices truthful and read-only.
- [x] Add focused coverage, run detector, build and all repository gates.
- [x] Commit, record issues and push Plan 139 to `origin/preview`.

### Review

- Plan 139 implementation landed at `26b60f2`.
- Settings now preserves the exact payroll organisation across nine grouped
  destinations, uses a labelled focus-restoring mobile sheet and retains the
  tonal desktop navigation without a content-separation border.
- Auto-save controls expose visible labels, descriptions and scoped live
  receipts. Xero promotes one recommended sync, groups manual and connection
  controls, exposes audited pause/resume, and uses typed confirmation for both
  disconnect consequences with duplicate-submit protection.
- Eighteen focused tests, 497 app tests, the production build, Impeccable
  detection and all 119 integration tests passed; the two configured live-Xero
  checks remain skipped.
- A concurrent integration attempt timed out during Xero module setup under
  build/test load; the unchanged serial rerun passed. Protected Settings routes
  redirected with `dev-browser-missing`, so the authenticated visual matrix
  remains explicitly unclaimed. Both issues are recorded in `plans/README.md`.

### Review

- Plans 110 through 123 and their bookkeeping commits are on
  `origin/preview`. Plan 124 replaces the generic help cards with a typed,
  four-phase AU onboarding guide and task gateway, then adds exact product
  labels, role boundaries, recovery receipts, Help centre navigation, focus
  transfer and explicit nested sitemap discovery.
- Plan 124 focused verification passed 5 files and 13 tests. The web production
  build prerendered both help routes and `/sitemap.xml`; the Impeccable detector
  returned no findings. The fresh critique improved from 17/40 to 37/40 with
  zero P0 or P1 findings.
- Chromium captured both routes at 390×844, 820×1180 and 1440×1000 in light and
  dark modes. There was no horizontal overflow. Axe reported zero violations,
  the first keyboard target was the 3px skip link, activation focused the main
  landmark, reduced motion was enabled, and forced colours were verified with
  Chromium high-contrast mode. Headless Chromium ignored browser zoom
  shortcuts, so 720 CSS pixels verified the equivalent reflow of a 1440-pixel
  viewport at 200%.
- Full `bun run check`, `bun run typecheck`, `bun run test` and
  `bun run test:integration` gates passed. The two configured credential-bound
  Xero integration checks remained skipped.
- Plan 125 replaces the client-evaluated `mdx-bundler` path with official
  `@next/mdx` Server Components and one Zod-validated static catalogue. The
  catalogue now owns published ordering, explicit feature state, related
  reading, metadata, stable sitemap dates and static RSS. Both articles use AU
  launch truth, withdrawal vocabulary and a shared Read-mode article ending.
- Plan 125 focused verification passed 7 files and 15 tests. The web build
  prerendered the Blog, both articles, `/blog/opengraph-image`, `/rss.xml` and
  `/sitemap.xml`. Chromium returned HTTP 200 for all five public checks and
  captured 390×844, 820×1180 and 1440×1000 light/dark views; server-rendered
  prose remained present with JavaScript disabled. The Impeccable detector
  returned no findings and the critique improved from 18/32 to 32/32 with no
  P0 or P1 issues.
- Plan 125 full check, typecheck and unit gates passed. The first integration
  command lost Linux temporary-directory values at Turborepo's strict
  environment boundary and collected no tests; the unchanged loose-environment
  rerun passed all 119 integration tests with the two configured Xero skips.
  The optional `agent-browser` executable and Node browser bridge were
  unavailable, so the required browser matrix used the installed headless
  Chromium directly.
- Plan 126 makes the no-vacancy and no-timeline state explicit, replaces generic
  product values with three factual working practices, and adds a bounded
  low-data email introduction path. The practice grid stays one column below
  64rem and changes directly to three columns at 64rem.
- Plan 126 focused verification passed 4 files and 25 tests; web tests passed 23
  files and 75 tests. Axe 4.12.1 reported 36 passes, zero violations and zero
  incomplete checks at desktop and mobile. The first Tab reached the Careers
  bypass link, Enter focused `careers-main`, the CTA measured 44px, and 720px
  reflow plus 320px mobile both reported zero horizontal overflow. The
  Impeccable detector returned `[]` and the final critique scored 32/32 with no
  P0 or P1 issues.
- Plan 126 production build, check, typecheck, unit and all 119 integration
  tests passed, with two configured Xero skips. The mandated `127.0.0.1` Axe
  sessions caused repeated cross-origin development-resource warnings and an
  eventual Turbopack HMR panic after evidence collection; the process was
  stopped, port 3001 was freed, and the subsequent clean production build
  passed. This is recorded as a development-tooling issue, not a route defect.
- Plan 127 closes six control gaps before publishing the rewritten trust page:
  effective feed privacy, direct-person scope, owner assignment and holiday
  actions, observability scrubbing and default route protection. The public
  page now distinguishes access, protection, processing and response with only
  implemented or deliberately qualified claims.
- Plan 127 focused verification passed 9 files and 91 tests. All three affected
  production builds, repository check, typecheck, unit and 119 integration
  tests passed, with the two configured Xero skips. Impeccable returned no
  findings. True 1440px and 390px Chrome emulation in light and dark modes
  reported zero overflow, one main, one H1, four topics and 44px visible
  actions. The shared header's missing `/security` bypass mapping and absent
  workspace Axe dependency are recorded in `plans/README.md` without blocking
  the authorised sequence.

## Active plan: Add a role-aware dashboard calendar timeline

Status: Implemented, browser review blocked

### Outcome

Employee, manager, and admin dashboards share an accessible calendar timeline
derived from existing dashboard data. Dates and today remain the primary visual
axis; availability, intensity, and provenance support scanning without changing
product behaviour or introducing a second data-fetch path. Viewer and admin
empty states remain explicit and do not receive a decorative timeline.

### Tasks

- [x] Define typed role adapters and deterministic empty and error fallbacks from
  the existing dashboard projections.
- [x] Implement an accessible timeline with chronological dates, a visible today
  anchor, semantic fallback content, dark mode, and reduced-motion behaviour.
- [x] Pass the feature through employee, manager, and admin compositions while
  preserving explicit viewer and admin empty states.
- [x] Align dashboard hierarchy, skeletons, and responsive layouts.
- [x] Add focused tests for personal and manager data, empty and error data,
  accessibility semantics, and static reduced-motion output.
- [x] Add an explicit manager coverage lane to the horizontal date axis, with
  exact counts, threshold-only peaks, and honest unknown-day states.
- [x] Verify the coverage lane remains horizontally scrollable, keyboard
  navigable, and readable at mobile widths.
- [x] Run targeted formatting plus `bun run check`, `bun run typecheck`,
  `bun run test`, and `bun run test:integration`; record exact results.
- [ ] Run one desktop and mobile Chromium review in light, dark, and reduced-motion
  modes; fix observed defects or record the concrete runtime blocker.

### Review

- The 14-day date axis, keyboard tab interaction, mobile scroll snapping, today
  anchor, confidence labels, public holidays, and honest partial-data states are
  implemented. Manager dates now carry proportional unavailable-person bars and
  visible live or peak counts; unknown future days show `No signal`, never zero.
- View Transitions progressively morph the selected date and are bypassed under
  reduced motion or unsupported browsers. Horizontal overscroll is contained,
  while arrow-key selection still scrolls the focused date into view.
- Targeted Biome checks, app typecheck, `git diff --check`, and 14 focused model
  and interaction tests pass.
- Full `bun run check`, `bun run typecheck`, and `bun run test` pass. The parallel
  integration gate encountered shared fixture collisions in `packages/jobs`;
  the other four packages passed, then the isolated jobs retry passed all 65
  tests. The Xero suite retained its two configured credential-dependent skips.
- Browser automation was attempted again. The CLI is unavailable in the
  workspace, Linux ARM64 exposes only Snap Chromium (which exits before DevTools
  starts), and the Windows control bridge rejects the WSL workspace path. No
  visual screenshot result is claimed.

## Active plan: Standardise plan numbering, Git workflow and Impeccable use

Status: Complete

### Outcome

The active plan batch is numbered contiguously from 121 through 143. Every plan
uses `preview` as its working and landing branch, and every plan explicitly uses
Impeccable for its rendered surface where applicable.

### Tasks

- [x] Inventory the existing plan files and their Git workflow sections.
- [x] Renumber the batch contiguously as Plans 121–143 and update dependencies.
- [x] Replace feature-branch instructions with `preview`.
- [x] Add a consistent `## Git workflow` section to every plan.
- [x] Align `plans/README.md` with the direct-on-`preview` policy.
- [x] Verify every Plan 121–143 has exactly one workflow section and
  no stale branch instruction.
- [x] Verify every Plan 121–143 explicitly invokes Impeccable, with redirect
  plans routing visual work to the canonical rendered destination.

### Review

- Confirmed exactly one file and matching `# Plan` heading for each number from
  121 through 143, with no duplicate numbers.
- Confirmed all 23 plans have one Git workflow, branch `preview`, landing target
  `preview`, and no plan-specific branch reference.
- Confirmed all 23 plans contain explicit Impeccable guidance.
- Confirmed all numbered README links resolve. `git diff --check` passes for
  tracked changes, and a direct whitespace/conflict-marker scan passes for all
  untracked plan files.

## Follow-ups

## Active plan: Make People responsive and restore profile source-of-truth cues

Status: Complete

### Tasks

- [x] Confirm Plan 136 drift, scope and Impeccable Adapt direction.
- [x] Share status and Xero/manual provenance across list and profile.
- [x] Gate manual balance headers and controls for viewers.
- [x] Add role-aware recovery for Xero-connected unlinked profiles.
- [x] Distil secondary filters and expose active-filter chips.
- [x] Replace horizontal person panning with a wrapping semantic directory.
- [x] Add live balance save/error semantics and plain labels.
- [x] Complete detector, build and repository verification.
- [x] Commit Plan 136 and push it to `origin/preview` before Plan 137.

### Review

- Plan 136 implementation landed at `9b2a7c9`.
- Nineteen focused tests cover viewer balance gating, provenance, shared status,
  unlinked recovery, manual-balance receipts, filter disclosure, the responsive
  semantic directory, sync feedback and Clerk access reconciliation.
- Impeccable detection, the canonical app build, repository check/typecheck,
  473 app tests and all 119 integration tests pass. The two configured live-Xero
  checks remain skipped.
- The protected route correctly redirects a signed-out browser to Clerk with
  `x-clerk-auth-reason: dev-browser-missing`. Authenticated list/profile desktop,
  mobile, dark-mode and 200% rendered checks remain unclaimed and are recorded
  in the plan README as requested.

## Active plan: Make notifications calmer, accessible and mobile-first

Status: Complete

### Tasks

- [x] Confirm Plan 135 drift, scope and Impeccable Distill direction.
- [x] Promote unread and category filters; disclose event types and reset.
- [x] Give preference switches unique labels and described disabled reasons.
- [x] Reflow notification rows around one primary navigation action.
- [x] Move deep-link scroll and keyboard focus to the actual target.
- [x] Add row-level saving, saved and rollback receipts.
- [x] Complete detector, build and repository verification.
- [x] Commit Plan 135 and push it to `origin/preview` before Plan 136.

### Review

- Plan 135 implementation landed at `3a965e8`.
- Nine focused tests cover category and type hierarchy, reset, switch naming,
  last-channel reasoning, saved and rollback receipts, deep-link focus and the
  single primary mobile navigation action.
- Impeccable detection, the canonical app build, repository check/typecheck,
  466 app tests and all 119 integration tests pass. The two configured live-Xero
  checks remain skipped.
- The protected route correctly redirects a signed-out browser to Clerk with
  `x-clerk-auth-reason: dev-browser-missing`. Authenticated desktop, mobile,
  dark-mode and 200% rendered checks remain unclaimed and are recorded in the
  plan README as requested.

## Active plan: Make leave approvals scan-fast and action-safe

Status: Complete

### Tasks

- [x] Confirm Plan 134 drift, scope and Impeccable Clarify direction.
- [x] Give every approval status a distinct labelled icon treatment.
- [x] Thread failed approval and decline actions into Xero recovery copy.
- [x] Replace horizontal panning with one responsive decision row.
- [x] Lead the queue summary with pending and failed work.
- [x] Preserve primary decisions and move secondary actions into context.
- [x] Complete detector, build and repository verification.
- [x] Commit Plan 134 and push it to `origin/preview` before Plan 135.

### Review

- Plan 134 implementation landed at `c48d8f6`.
- Sixteen focused tests cover keyboard disclosure and approval, balance units,
  every status label/icon, action-specific Xero failures, and the wrapping
  mobile decision path. Existing modal tests continue to cover cancellation and
  duplicate-submit protection.
- Impeccable detection, the canonical app build, repository check/typecheck,
  461 app tests and all 119 integration tests pass. The two configured live-Xero
  checks remain skipped.
- The protected route correctly redirects a signed-out browser to Clerk with
  `x-clerk-auth-reason: dev-browser-missing`. Authenticated desktop, mobile,
  dark-mode and 200% rendered checks remain unclaimed and are recorded in the
  plan README as requested.

## Active plan: Make feed subscription primary and administration progressive

Status: Complete

### Tasks

- [x] Confirm Plan 133 drift, scope and Impeccable distillation guidance.
- [x] Gate feed creation for viewers before form data is loaded.
- [x] Keep the complete subscribe URL primary and move lifecycle actions into a labelled overflow.
- [x] Add filter clearing, active feedback and truthful filtered-empty copy.
- [x] Reorder feed detail around subscription, preview and progressive administration.
- [x] Complete detector, build and repository verification.
- [x] Commit Plan 133 and push it to `origin/preview` before Plan 134.

### Review

- Plan 133 implementation landed at `69cacf3`.
- Seventeen focused tests cover viewer create gating without data access,
  organisation-preserving return, active-filter reset, distinct empty states,
  complete URL copy, lifecycle overflow and confirmation focus return.
- Impeccable detection, the canonical app build, repository check/typecheck,
  453 app tests and all 119 integration tests pass. The two configured live-Xero
  checks remain skipped.
- The protected `/feeds/new` route correctly redirects a signed-out browser to
  Clerk with `x-clerk-auth-reason: dev-browser-missing`. Authenticated desktop,
  mobile, dark-mode and 200% rendered checks remain unclaimed and are recorded
  in the plan README as requested.

## Active plan: Make the calendar timezone-correct and mobile-operable

Status: Complete

### Tasks

- [x] Confirm Plan 132 drift, timezone contract and Impeccable guidance.
- [x] Place timed events in the organisation timezone with off-hours groups.
- [x] Complete compact event accessible names with type, source and status.
- [x] Add a chronological mobile month agenda with complete day paths.
- [x] Add a safe-area mobile create action and responsive toolbar grouping.
- [x] Add calendar-shaped loading and retry recovery surfaces.
- [x] Complete detector, build and repository verification.
- [x] Commit Plan 132 and prepare it to push to `origin/preview` before Plan 133.

### Review

- Plan 132 landed at `e159764`; the Plan 131 Next route-export correction found
  by the build gate landed separately at `93fef28`.
- Twenty-three focused tests cover Brisbane and New York local-hour placement,
  UTC boundaries, off-hours groups, complete event labels, agenda navigation,
  safe-area creation, loading and retry.
- Impeccable detection, canonical production build, repository check/typecheck,
  447 app tests and all 119 integration tests pass. Two configured live-Xero
  checks remain skipped.
- Turbopack twice panicked on a cached source-map task. Moving the generated
  `.next` directory to `/tmp/teamcalendar-app-next-plan132-panic` allowed the
  canonical build to complete. The protected browser route then correctly
  redirected to Clerk with `dev-browser-missing`; authenticated visual claims
  remain unmade.

## Active plan: Make out-of-office analytics accessible and insight-led

Status: Complete

### Tasks

- [x] Confirm Plan 131 drift, dependency and Impeccable Operate direction.
- [x] Add validated employee and contractor segmentation to the shared filter.
- [x] Add exact semantic values and non-colour labels to both charts.
- [x] Replace equal cards with a decision-led presence summary.
- [x] Delay the two-chart layout until wide screens and cover long labels.
- [x] Complete detector, build and repository verification.
- [x] Commit Plan 131 and prepare it to push to `origin/preview` before Plan 132.

### Review

- Plan 131 implementation landed at `b5031c9`.
- Nine focused tests cover person-type URL state, aggregation input, invalid
  values, long labels and exact semantic values across both charts.
- Impeccable detection, production build, repository check/typecheck, 439 app
  tests and all 119 integration tests pass. The two configured live-Xero checks
  remain skipped.
- The production route correctly redirects a signed-out browser to Clerk with
  `x-clerk-auth-reason: dev-browser-missing`. Authenticated desktop, mobile,
  dark-mode and 200% rendered checks remain unclaimed and are recorded here as
  requested.

## Active plan: Make leave reports trustworthy, accessible and decision-led

Status: Complete

### Tasks

- [x] Confirm Plan 130 drift, scope and Impeccable Operate direction.
- [x] Thread the selected period through CSV export and truthful filenames.
- [x] Add field-linked custom-range validation that preserves query state.
- [x] Add a semantic exact-value alternative for the team chart.
- [x] Replace equal metric cards with a decision-led summary band.
- [x] Complete focused, visual and repository verification.
- [x] Commit Plan 130 and prepare it to push to `origin/preview` before Plan 131.

### Review

- Plan 130 implementation landed at `4d726fa`.
- Focused action and UI suites pass 19 tests, including every preset, a custom
  range, linked validation errors, query preservation and the semantic chart
  table. App type-checking, production build, Impeccable detection and diff
  checks pass.
- The production route correctly redirects a signed-out browser to Clerk with
  `x-clerk-auth-reason: dev-browser-missing`. No authenticated local browser
  state is available, so desktop, mobile, dark-mode and 200% rendered checks
  remain unclaimed. This named Plan 130 visual-gate limitation is recorded here
  as requested; source, component tests and detector evidence remain valid.
- Repository check, typecheck, 434 app tests and all 119 integration tests pass;
  the two configured live-Xero checks remain skipped.

## Active plan: Rebuild pricing launch modes

Status: Complete

### Tasks

- [x] Confirm Plan 129 drift, prerequisites, approved pricing contract, and Impeccable Persuade direction.
- [x] Centralise the public plan catalogue and database projection with tests.
- [x] Rebuild coherent early-access and paid pricing experiences.
- [x] Isolate the AUD/NZD/GBP selector and add accessible comparison and FAQ surfaces.
- [x] Verify responsive modes, build, full repository gates, commit, and push.

### Review

- Plan 129 landed through `c03bc44`, `f63ddc4` and `ddef650`. The shared
  catalogue, database projection, early-access mode, paid AUD mode, regional
  availability states, native FAQ and responsive comparison are implemented.
- Both static builds, Impeccable, browser desktop/tablet/mobile checks, focused
  tests, repository check/typecheck/unit gates and all 119 integration tests
  passed. The two configured Xero checks remained skipped.
- Headless keyboard automation changed and retained the native currency value
  but did not capture the dependent React panel replacement. The pure state
  projections are covered in tests; this harness limitation is recorded in the
  plan README rather than represented as product evidence.

## Active plan: Publish Better Stack service status

Status: Complete

### Tasks

- [x] Confirm Plan 121 and 122 contracts, drift, and current official Better Stack read schemas.
- [x] Lock the provider and environment contracts with focused tests.
- [x] Replace the private-monitor React adapter with a validated public status service.
- [x] Build the accessible `/status` operational hierarchy and route-scoped styles.
- [x] Update support, environment, deployment, and status bookkeeping documentation.
- [x] Run focused checks, visual verification, production build, and all repository gates.
- [x] Commit Plan 128 and push it to `origin/preview` before starting Plan 129.

### Review

- Plan 128 landed at `ad3df8a`. The provider boundary validates public Better
  Stack resources and reports, the page fails closed to Unknown, and only the
  five canonical customer-facing services can appear.
- Focused suites passed 51 tests. Production build, Impeccable, browser
  desktop/mobile light/dark checks, 200% reflow, forced colours, reduced motion,
  check, typecheck, unit and all 119 integration tests passed. The two configured
  Xero credential checks remained skipped.
- Live Better Stack credentials and the five exact public resources are not
  configured locally. Preview remains truthfully Unknown until the documented
  web-deployment trio and provider resources are supplied.

### Calendar subscribe URL verification

- [ ] Review feed list and detail views at desktop and mobile widths using the
  available Chromium installation; verify light and dark modes, selection,
  copying, lifecycle states, and clipboard failure recovery.

### Repository credential cleanup

- [ ] Rotate the credential formerly exposed in `.mcp.json`.
- [ ] Ask GitHub Support to purge retained pull-request refs and cached commit
  views that cannot be rewritten by a normal Git push.
- [ ] Re-audit a fresh remote mirror after the purge and record the result.

## Active plan: Clarify the marketing homepage hero

Status: Complete

### Tasks

- [x] Review the existing hero, product truth and brand voice.
- [x] Replace the headline and supporting copy with the approved message.
- [x] Verify formatting, type safety and the focused marketing build.

### Review

- Reworked the homepage hero around the Xero-to-calendar outcome, then named
  travel, out of office and staff leave as the core use cases.
- Reduced the revised hero to one outcome, one scope line and one proof
  paragraph after user review, without removing the Xero write-back or supported
  calendar providers.
- Tightened the following problem section around one escalation: scattered leave
  admin becomes leave clashes, uncovered shifts, Xero gaps and payroll errors.
- Marketing formatting, focused and repository type checks, the production web
  build, all unit tests and all integration tests pass. The two configured live
  Xero checks remain skipped. Test reruns used `/tmp` because the shell inherited
  a stale Windows temporary-directory path under WSL.

## Active plan: Overdrive the marketing features page

Status: Complete

### Outcome

The `/features` page becomes a cinematic but calm product narrative. One living
calendar canvas carries a leave entry from Xero or manual input through approval
and team visibility into subscribed calendars, with progressive enhancement,
accessible static fallbacks and equal desktop, mobile and dark-mode care.

### Tasks

- [x] Lock the existing page, interaction and product-truth contracts with
  focused regression coverage.
- [x] Build the sticky calendar narrative and connect each story beat to one
  coherent source-to-calendar state transition.
- [x] Recompose the supporting feature content around the narrative without
  changing unverified product claims or provenance semantics.
- [x] Honour keyboard access, reduced motion, reduced transparency, forced
  colours and narrow viewports.
- [x] Run focused tests, Impeccable and React checks, desktop and mobile browser
  verification, the web production build and repository gates.

### Review

- The former persona, capability and sync-flow sequence is now one continuous
  source-to-calendar story. A sticky calendar advances through source,
  approval, team-cover and publication states while the factual narrative stays
  available in normal document order.
- Sage Xero provenance, lavender manual provenance, synchronous approval
  write-back and calendar-app refresh timing remain explicit. The four story
  beats are keyboard-selectable, use one cleaned-up observer and settle to a
  complete state for reduced-motion visitors.
- Chromium captures at 1440px and 390px confirmed the light composition,
  narrow calendar fit and dark palette. The preferred `agent-browser` binary
  was unavailable, so the bounded rendered review used the installed headless
  Chromium runtime directly.
- Two focused feature tests, all 102 web tests, all 17 unit-test workspaces,
  all 19 typecheck tasks, the 922-file repository check, zero Impeccable
  detector findings, the web production build and all 119 configured
  integration tests passed. The two credential-dependent live-Xero checks
  remained skipped as expected.

## Active plan: Distil the marketing features hero

Status: Complete

### Outcome

The `/features` hero becomes a quiet, decisive entry to the page: one promise,
one short proof sentence and one primary action. The living calendar story below
remains the page's single authored product demonstration.

### Tasks

- [x] Remove the duplicated interactive sandbox and secondary hero action.
- [x] Tighten the hero copy and spacing without changing product truth.
- [x] Remove the retired client logic and route-scoped sandbox styling.
- [x] Verify desktop, mobile, dark mode, focused tests and web gates.

### Review

- The hero now carries one headline, one factual proof sentence and one signup
  action. The full sandbox, feed tab, approval controls, legend, particles and
  secondary scroll action are removed because the living calendar immediately
  below owns the product demonstration.
- The former 1,272-line client component is now an 18-line server component.
  Its retired route-scoped sandbox styles and responsive overrides are removed,
  eliminating the duplicate interaction and its JavaScript from the hero.
- Headless Chromium captures at 1440px and 390px confirmed the simplified light
  composition, mobile reflow and dark palette without requiring a correction
  pass.
- Three focused feature tests, all 103 web tests, all 17 unit-test workspaces,
  all 19 typecheck tasks, the 922-file repository check, zero Impeccable
  detector findings, the web production build and all 119 configured
  integration tests passed. The two credential-dependent live-Xero checks
  remained skipped as expected.
