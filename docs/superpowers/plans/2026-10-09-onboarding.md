# New User Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This document authorises no execution in the planning turn.

**Goal:** Replace the dashboard onboarding panel with a blocking five-step owner/admin setup wizard that ends on a populated team calendar, add a one-time three-step welcome for invited members, and reduce `/settings/getting-started` to post-wizard recommendations.

**Architecture:** Organisation-level wizard state (`onboarding_step`, `onboarding_completed_at`, `xero_setup_skipped_at`) and person-level welcome state (`welcome_completed_at`) in Postgres. A new `(setup)` route group renders `/onboarding` and `/welcome` in the existing sign-in split layout without the app sidebar. The `(authenticated)` layout redirects to them. Step completion is validated on the server from real state; existing Xero OAuth, matches, invite and feed services are reused.

**Tech Stack:** Existing Bun, Next.js App Router, TypeScript, Prisma 7 / PostgreSQL, Clerk, Inngest, Zod, Vitest, `@repo/design-system`, `@repo/analytics`. No new dependencies.

**Spec:** [New user onboarding design](../specs/2026-10-09-onboarding-design.md). Read it, `AGENTS.md`, `DESIGN.md` and `.impeccable.md` before execution. Inspected base: `402af6f`.

## Global constraints

- AU is the only selectable country. Timezone defaults to `Australia/Sydney`.
- Xero is skippable only through the secondary "Set up without Xero" confirmation.
- Holidays and feed are not wizard steps. No dashboard onboarding surface of any kind.
- Members (manager, viewer) are never redirected to `/onboarding`. Owners and admins never see `/welcome`.
- A failed or slow import never blocks wizard completion.
- Every query filters by `clerk_org_id` and `organisation_id`. Actions validate with Zod and return `Result`.
- Feed subscribe URLs are shown in full. Raw Xero errors are never shown.
- Australian English, no em or en dashes, no hype. WCAG 2.2 AA, 3px focus ring, `prefers-reduced-motion` respected.
- Radii per `DESIGN.md`: 20px cards, 16px floating surfaces, 14px buttons/inputs, 12px chips. No borders for content separation.
- One migration; no backfill (no live customer organisations).
- CI gates: `bun run check`, `bun run typecheck`, `bun run test`, `bun run test:integration`.

## Review focus

1. **Gate loops.** An owner on `/settings/integrations/xero/connect` (multi-tenant selection) or `/settings/integrations/xero/matches` must not be bounced to `/onboarding` mid-flow (Task 3).
2. **Stale or parallel tabs.** Two admins, or one admin with two tabs, must not skip a step or double-complete; advancing is validated from database state, not the client's claimed step (Task 2).
3. **Import never lands.** Dispatch fails or a stage errors; step 3 must explain and offer a way forward, and step 5 must still complete into `/calendar` (Tasks 5, 7).
4. **Member with no linked person.** Must not be redirected to `/welcome` or shown a broken step; dashboard shows the link-your-account message (Tasks 3, 8).
5. **Xero later connected after skip.** `xero_setup_skipped_at` clears on connection, and the checklist stops offering "Connect Xero" (Tasks 2, 9).

## Execution and verification conventions

Tasks are sequential. Each has its own red/green cycle and a reviewable commit. Unit tests: `cd apps/app && NODE_ENV=test bunx vitest run <file>`; package tests use `tooling/vitest.config.mts` as in existing plans. Integration tests require a local disposable database and `ALLOW_LOCAL_DATABASE_TESTS=1`. Run the failing test before production edits. Stage only each task's owned files.

## File responsibilities

| File | Responsibility |
|---|---|
| `packages/database/prisma/schema.prisma`, new migration | Onboarding columns and `onboarding_step` enum |
| `packages/database/src/queries/onboarding.ts` (new) + public `queries/onboarding.ts` | Scoped read/write of wizard and welcome state |
| `packages/availability/src/onboarding/wizard-service.ts` (new) | Step derivation and server-validated advancement |
| `packages/availability/src/onboarding/welcome-service.ts` (new) | Member welcome eligibility and completion |
| `apps/app/lib/server/onboarding-gate.ts` (new) | Pure decision: redirect target for a request |
| `apps/app/app/(authenticated)/layout.tsx` | Apply the gate |
| `apps/app/components/brand/` (moved) | `BrandPanel`, `MobileBrand`, `BrandGlyph`, `AvailabilityGrid`, `TimeGreeting` shared by auth and setup layouts |
| `apps/app/app/(setup)/layout.tsx` (new) | Authenticated split layout, no sidebar |
| `apps/app/app/(setup)/onboarding/**` (new) | Wizard page, step components, actions |
| `apps/app/app/(setup)/welcome/**` (new) | Member welcome page, steps, actions |
| `apps/api/app/api/xero/oauth/callback/route.ts` | Failure redirect with safe code |
| `apps/app/lib/server/load-onboarding-state.ts`, `components/onboarding/onboarding-checklist.tsx` | Post-wizard checklist |
| `apps/app/components/onboarding/dismissible-onboarding-panel*.tsx`, `dashboard-body.tsx` | Removed panel |

---

### Task 1: Schema and scoped queries

**Files:**
- Modify: `packages/database/prisma/schema.prisma` (`Organisation`, `Person`, new enum)
- Create: migration via `bun run migrate` named `add_onboarding_state`
- Create: `packages/database/src/queries/onboarding.ts`, `packages/database/queries/onboarding.ts`
- Test: `packages/database/src/queries/onboarding.integration.test.ts`

**Interfaces:**
- Produces:
  - `type OnboardingStep = "details" | "xero" | "people" | "invites" | "finish"`
  - `getOnboardingRecord(clerkOrgId, organisationId): Promise<Result<{ step: OnboardingStep; completedAt: Date | null; xeroSkippedAt: Date | null }>>`
  - `advanceOnboardingStep(clerkOrgId, organisationId, from: OnboardingStep, to: OnboardingStep): Promise<Result<{ advanced: boolean }>>`: conditional update `WHERE onboarding_step = from`, so concurrent advances are idempotent.
  - `setXeroSetupSkipped(clerkOrgId, organisationId, skipped: boolean): Promise<Result<void>>`
  - `completeOnboarding(clerkOrgId, organisationId): Promise<Result<{ completedAt: Date }>>`: sets only when null; returns the stored value.
  - `getWelcomeState(clerkOrgId, organisationId, clerkUserId): Promise<Result<{ personId: string; completedAt: Date | null } | null>>`
  - `completeWelcome(clerkOrgId, organisationId, personId, clerkUserId): Promise<Result<void>>`

- [ ] **Step 1:** Write integration tests: defaults (`details`, nulls); `advanceOnboardingStep` from a non-matching step returns `advanced: false`; `completeOnboarding` twice keeps the first timestamp; cross-tenant `clerk_org_id` reads return nothing; `completeWelcome` refuses a person whose `clerk_user_id` differs.
- [ ] **Step 2:** Run and confirm failure.
- [ ] **Step 3:** Add enum `onboarding_step`, columns per spec section 10, run `bun run migrate`, implement queries.
- [ ] **Step 4:** Run tests to green; run `bun run typecheck` for `packages/database`.
- [ ] **Step 5:** Commit `feat(database): add onboarding and welcome state`.

### Task 2: Wizard and welcome services

**Files:**
- Create: `packages/availability/src/onboarding/wizard-service.ts`, `welcome-service.ts`, co-located tests
- Modify: `packages/availability/index.ts` (exports)
- Modify: `packages/xero/src/oauth/service.ts` near line 1345 (clear `xero_setup_skipped_at` when a connection is established)

**Interfaces:**
- Consumes: Task 1 queries; `getXeroConnectionStateForScope`; `XeroConnection.last_full_people_sync_at`, `last_full_leave_records_sync_at`; `XeroPersonMatch` pending count; person by `clerk_user_id`.
- Produces:
  - `type WizardSnapshot = { step: OnboardingStep; completed: boolean; mode: "xero" | "manual" | "undecided"; import: { people: StageStatus; leave: StageStatus; balances: StageStatus } ; pendingMatches: number; actingUserLinked: boolean }` with `StageStatus = "not_started" | "running" | "complete" | "failed"`
  - `loadWizardSnapshot(ctx: { clerkOrgId; organisationId; userId }): Promise<Result<WizardSnapshot>>`
  - `advanceWizard(ctx, from: OnboardingStep): Promise<Result<WizardSnapshot, WizardError>>`: validates the completion rule for `from` (spec section 5 table) before advancing; `WizardError` codes `step_incomplete`, `stale_step`, `not_authorised`, `unknown_error`.
  - `finishWizard(ctx, { force: boolean }): Promise<Result<{ redirectTo: "/calendar" }>>`: completes when leave stage is complete, failed, mode is manual, or `force` is true.
  - `loadWelcomeEligibility(ctx): Promise<Result<{ eligible: boolean; personId: string | null }>>`

- [ ] **Step 1:** Write unit tests with factories for each completion rule: step 3 blocked while people stage running; blocked with pending matches; blocked when acting user unlinked; step 5 completes on leave complete, failed, manual, or force; `advanceWizard` from a step behind the stored step returns the current snapshot without error (stale tab); manual mode never waits on import. Add a test that establishing a Xero connection clears `xero_setup_skipped_at`.
- [ ] **Step 2:** Run and confirm failure.
- [ ] **Step 3:** Implement. Derive stage `failed` from the latest `SyncRun` for the connection with `status` failed and no later success for that entity type.
- [ ] **Step 4:** Green; commit `feat(availability): add onboarding wizard and welcome services`.

### Task 3: Layout gate

**Files:**
- Create: `apps/app/lib/server/onboarding-gate.ts`, `onboarding-gate.test.ts`
- Modify: `apps/app/app/(authenticated)/layout.tsx`

**Interfaces:**
- Produces: `resolveOnboardingRedirect(input: { pathname: string; orgRole: string | null; wizardCompleted: boolean; welcomeEligible: boolean }): "/onboarding" | "/welcome" | null`

- [ ] **Step 1:** Table tests: owner/admin incomplete → `/onboarding` on `/`, `/calendar`, `/settings/general`; `null` on `/settings/integrations/xero/connect` and `/settings/integrations/xero/matches`; owner/admin complete → `null`; manager/viewer with incomplete org wizard → never `/onboarding`; member eligible → `/welcome`; member unlinked (not eligible) → `null`; owner/admin with eligible flag → never `/welcome`.
- [ ] **Step 2:** Confirm failure; implement as a pure function.
- [ ] **Step 3:** Apply in the layout. Read the pathname from the `x-pathname` request header set in `apps/app/proxy.ts` (add it there if absent; covered by an existing proxy test file extension). Load wizard and welcome state with `organisationId` already resolved in the layout; call `redirect()` outside any try/catch.
- [ ] **Step 4:** Green; commit `feat(app): gate first run to onboarding and welcome`.

### Task 4: Setup layout and shared brand components

**Files:**
- Move: `apps/app/app/(unauthenticated)/components/{brand-panel,brand-glyph,time-greeting,availability-grid}.tsx` → `apps/app/components/brand/`
- Modify: `apps/app/app/(unauthenticated)/(auth)/layout.tsx` imports
- Create: `apps/app/app/(setup)/layout.tsx`, `apps/app/components/setup/step-indicator.tsx`, `step-indicator.test.tsx`

**Interfaces:**
- Produces: `<StepIndicator steps={{ id: string; label: string }[]} currentId={string} completedIds={string[]} />` rendering an `<ol>` with `aria-current="step"`.
- Produces: `(setup)` layout: requires a signed-in user and active org (redirect to sign-in otherwise), renders `BrandPanel` and a form column whose width the page controls (`data-width="narrow" | "wide"`), a "Sign out" link, and `ModeToggle`.

- [ ] **Step 1:** Test `StepIndicator` semantics: ordered list, `aria-current`, completed steps labelled for screen readers ("completed").
- [ ] **Step 2:** Implement; move brand files with `git mv`; update imports; run existing auth layout tests.
- [ ] **Step 3:** Before any UI edit, read `.impeccable.md` and the craft floor; keep tokens from `DESIGN.md`.
- [ ] **Step 4:** Green; commit `feat(app): add setup layout and step indicator`.

### Task 5: Wizard steps 1 and 2, OAuth failure redirect

**Files:**
- Create: `apps/app/app/(setup)/onboarding/page.tsx`, `_actions.ts`, `_actions.test.ts`, `steps/details-step.tsx`, `steps/xero-step.tsx`, tests
- Modify: `apps/api/app/api/xero/oauth/callback/route.ts` and its test; `packages/xero/src/oauth/service.ts` only if the failure result lacks `returnTo`

**Interfaces:**
- Consumes: `loadWizardSnapshot`, `advanceWizard`, organisation settings update used by `/settings/general`, `startXeroConnectAction` pattern from `settings/integrations/xero/_actions.ts` with `returnTo: "/onboarding"`.
- Produces: actions `saveDetailsAction({ name, timezone })`, `startXeroFromOnboardingAction()`, `skipXeroAction()`, `advanceAction(from)`; each returns `Result`.

- [ ] **Step 1:** Tests: details action rejects empty name, non-AU-zone timezone, non-admin; saves and advances. Xero start builds `returnTo=/onboarding`. Skip sets manual mode and advances. Callback route: failure or cancel redirects to session `returnTo` with `xero_error=<code>`; unknown session falls back to `/settings/integrations/xero`; never includes provider text.
- [ ] **Step 2:** Confirm failure; implement. Page renders the current step from the snapshot; step 2 maps `xero_error` codes to plain copy. "Set up without Xero" uses the design-system `AlertDialog`.
- [ ] **Step 3:** Capture `Onboarding Step Completed` via `@repo/analytics`.
- [ ] **Step 4:** Green; commit `feat(app): onboarding details and Xero steps`.

### Task 6: Wizard steps 3 and 4

**Files:**
- Create: `steps/people-step.tsx`, `steps/invite-step.tsx`, tests; extend `_actions.ts`
- Reuse: `settings/integrations/xero/matches/_actions.ts`, `app/actions/settings/invite-member.ts`

**Interfaces:**
- Produces: `linkSelfAction({ personId } | { create: { name; email } })`, `addPersonAction({ name, email })` (manual mode), `sendInvitesAction(rows: { personId?: string; email: string; role: "org:admin" | "org:manager" | "org:viewer" }[]): Result<{ results: { email: string; ok: boolean; reason?: string }[] }>`, `skipInvitesAction()`.

- [ ] **Step 1:** Tests: people step shows importing state while stage running and polls; shows matches inline when 1 to 10, link to matches page with `returnTo` when more than 10; link-self rejects a person already linked to another user. Invite roster excludes people without email or with `clerk_user_id`; default role Manager when the person has direct reports else Viewer; per-row failures reported without aborting others; owner role never offered.
- [ ] **Step 2:** Confirm failure; implement. Polling: client refresh every 3 seconds only while a stage is `running`, stopped on unmount. Roster widens the column (`data-width="wide"`), stacks on mobile, supports "Select all" / "Select none".
- [ ] **Step 3:** Green; commit `feat(app): onboarding people and invite steps`.

### Task 7: Wizard finish

**Files:**
- Create: `steps/finish-step.tsx`, test; extend `_actions.ts`

**Interfaces:**
- Consumes: `finishWizard`.
- Produces: `finishAction({ force: boolean })` returning `{ redirectTo: "/calendar" }`.

- [ ] **Step 1:** Tests: leave complete → completes and redirects; running → disabled primary with explanatory text and enabled "Open calendar now"; failed → completes; manual → completes; polite live region announces stage changes only. Capture `Onboarding Completed` with duration and mode.
- [ ] **Step 2:** Confirm failure; implement; green.
- [ ] **Step 3:** Commit `feat(app): onboarding finish into team calendar`.

### Task 8: Member welcome

**Files:**
- Create: `apps/app/app/(setup)/welcome/page.tsx`, `_actions.ts`, `steps/{identity,balances,calendar}-step.tsx`, tests
- Modify: dashboard employee/viewer view for the unlinked message if not already present (verify `viewer-view.tsx` first)

**Interfaces:**
- Consumes: `loadWelcomeEligibility`, person profile read, leave balance read used by `balances-card.tsx`, feed creation with scope `self` used by `/feeds/new`.
- Produces: `completeWelcomeAction({ skipped: boolean })`, `createSelfFeedAction()` returning the full subscribe URL.

- [ ] **Step 1:** Tests: ineligible users redirected to `/`; identity step shows name, email, team, manager; balances step shows explanatory copy and no zeros when no connection or no balances; calendar step shows full URL with copy and instructions, reuses an existing self feed rather than creating a duplicate; skip and finish both set `welcome_completed_at`; second visit redirects to `/`. Capture `Member Welcome Completed`.
- [ ] **Step 2:** Confirm failure; implement; green.
- [ ] **Step 3:** Commit `feat(app): invited member welcome`.

### Task 9: Post-wizard checklist and panel removal

**Files:**
- Modify: `apps/app/lib/server/load-onboarding-state.ts`, test; `components/onboarding/onboarding-checklist.tsx`, test; `app/(authenticated)/settings/getting-started/page.tsx`; `app/(authenticated)/dashboard-body.tsx`
- Delete: `components/onboarding/dismissible-onboarding-panel.tsx`, `.test.tsx`

- [ ] **Step 1:** Update tests: steps are holidays, feed, and Xero only when manual mode or the connection needs attention; no profile or people steps; intro copy "Setup is complete. These steps are recommended next." Dashboard renders no onboarding panel and no longer calls `loadOnboardingState`.
- [ ] **Step 2:** Confirm failure; implement; delete panel; green.
- [ ] **Step 3:** Commit `refactor(app): reduce getting started to post-wizard checklist`.

### Task 10: Documentation and full verification

**Files:**
- Modify: `ScreenCatalogue.md` (S-03, S-30, new S entries for `/onboarding` and `/welcome`, resolve decision 3), `PRODUCT.md` onboarding references if any, `tasks/todo.md` review section

- [ ] **Step 1:** Update docs to match shipped behaviour.
- [ ] **Step 2:** Run `bun run check`, `bun run typecheck`, `bun run test`, `bun run test:integration`; fix anything red.
- [ ] **Step 3:** Run the app and walk both flows at desktop and mobile widths in light and dark: owner with Xero (single and multiple tenants), owner without Xero, OAuth cancel, invited viewer linked, invited viewer unlinked. Record evidence and limits in `tasks/todo.md`.
- [ ] **Step 4:** Commit `docs: record onboarding flows and verification`.
