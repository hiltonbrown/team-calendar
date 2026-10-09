# New User Onboarding Design

Status: approved in discussion on 9 October 2026; awaiting written-spec review.
Inspected base: `402af6f`.

## 1. Job and audience

Two arrivals, owner first:

- **Account owner or admin, first run.** A small-business owner, office manager or HR admin who has just signed up and created a Clerk Organisation. They arrive from the sign-up screen, motivated but short on time, usually holding Xero Payroll access. Visitor mode: Operate.
- **Invited manager or employee, first sign-in.** They accepted a Clerk invitation from their admin. They want to confirm Team Calendar knows who they are and see their own leave. Visitor mode: Operate, lighter density.

## 2. Outcome and proof

- **Aha moment (owner):** the team calendar shows real leave and public holidays from Xero Payroll for their own people.
- **Success:** an owner with Xero access goes from finishing sign-up to a populated team calendar in one sitting, without visiting settings.
- **Product truth to carry:** Xero is the payroll source of truth; leave balances are read from Xero, never calculated; imported people are never merged automatically; the initial import runs in the background.

## 3. Selected direction

- **Visual authority:** existing `DESIGN.md` and `.impeccable.md`. No new visual world.
- **Frame:** full-screen wizard reusing the sign-in split layout (`BrandPanel` left, form column right, `MobileBrand` on small screens, `ModeToggle`). No app sidebar. Sign-up flows into setup without a visual jump.
- **Structural thesis:** a blocking, linear wizard of five steps with a persistent step indicator ("Step 2 of 5"), one primary action per step, and the team calendar as the destination rather than a "you're done" page.
- **Focal moment:** the finale hands off directly to `/calendar` once leave has landed. Import progress, when still running, is shown as plain per-stage status (people, leave, balances), not a decorative animation.

## 4. Scope and boundaries

In scope:

1. Owner/admin setup wizard at `/onboarding` (blocking until complete).
2. Invited member welcome at `/welcome` (one time, skippable).
3. `/settings/getting-started` becomes the only post-wizard checklist.
4. Removal of the dashboard onboarding panel. No dashboard nudge replaces it.

Unchanged:

- Clerk sign-up, sign-in and the `choose-organization` session task.
- The Xero OAuth service, scopes, import jobs and rate limiting. The wizard passes a different `returnTo`; the only callback change is the failure redirect described in section 5.
- The Xero matches review page and the members settings page remain available after onboarding.
- The `/setup` redirect shim continues to point at `/settings/getting-started`.

Anti-goals:

- No guided tours, spotlight overlays, tooltips or tutorial mode.
- No billing or plan selection in onboarding.
- No NZ or UK onboarding; AU is the only selectable country.
- No in-app organisation switching.
- No backfill: there are no live customer organisations.
- No celebratory confetti or motivational copy.

## 5. Owner/admin setup wizard

### Entry and gating

- After the Clerk organisation task completes, the user lands on `/`. `requireActiveOrgPageContext` still creates the default `Organisation` row via `ensureDefaultOrganisation`.
- The authenticated layout redirects owners and admins to `/onboarding` while `organisations.onboarding_completed_at` is null for the active Organisation. The redirect covers every route in the `(authenticated)` group except the Xero tenant selection page (`/settings/integrations/xero/connect`) and the matches page (`/settings/integrations/xero/matches`), which the wizard depends on.
- Members (manager and viewer roles) are never redirected to `/onboarding`. By the time invitations go out (step 4), steps 1 to 3 are complete, so invited members arrive at a usable organisation.
- Any owner or admin can start or resume the wizard. Progress is stored per Organisation, so two admins see the same step.
- Once complete, `/onboarding` redirects to `/calendar`.

### Steps

| # | Step | Primary action | Completes when |
|---|---|---|---|
| 1 | Organisation details | Continue | Name, country (AU, fixed) and timezone saved |
| 2 | Connect Xero | Connect Xero Payroll | Xero connection established, or "Set up without Xero" chosen |
| 3 | People | Continue | No pending person matches and the acting user is linked to a person |
| 4 | Invite your team | Send invitations | Invitations sent, or "Skip for now" |
| 5 | Finish | Open team calendar | Leave has landed, the import failed, or the organisation is manual-only |

**Step 1, Organisation details.** Name prefilled from the Clerk Organisation. Country shows Australia as a read-only value with a one-line note that NZ and UK are not yet available. Timezone is a searchable select of Australian IANA zones, defaulting to `Australia/Sydney`; this replaces the current `UTC` default. Saving reuses the organisation settings update path used by `/settings/general`.

**Step 2, Connect Xero.** Plain explanation of what is read and written: people, leave and balances read; approved leave written back. One primary button, "Connect Xero Payroll", which starts OAuth with `returnTo=/onboarding`. One secondary text action, "Set up without Xero", which opens a confirmation stating that leave will be entered manually and Xero can be connected later from Settings. Confirming sets `xero_setup_skipped_at`. On return from Xero the callback has already dispatched the initial full import; the wizard advances to step 3. When the Xero login can see several payroll files, the existing tenant selection page appears first and then returns to `/onboarding` through the same `returnTo`. Today a failed or cancelled callback renders a JSON 400; it changes to redirect to the session's `returnTo` (or `/settings/integrations/xero` when no session resolves) with `xero_error=<safe code>`, and step 2 shows the matching plain-language reason. Raw provider errors are never shown.

**Step 3, People.**

- With Xero: the step waits for the people stage of the initial import (`xero_connections.last_full_people_sync_at` set), showing "Importing people from Xero" with the running count. When people land it shows the imported count, any pending matches inline (link or keep separate, reusing the matches actions), and confirms the acting user's own person record. If the acting user has no person record, they choose themselves from the roster or create their own record.
- Without Xero: the acting user's person record is confirmed and they can add people manually (name, email) in a compact repeating form. Adding others is optional.
- Leave and balance import continues in the background throughout.

**Step 4, Invite your team.**

- With Xero: a roster of imported people who have an email address and no linked Clerk user. Each row has a checkbox (default selected) and a role select: Admin, Manager, Viewer. The default is Manager when the person has direct reports in Xero, otherwise Viewer. Helper text: "Viewers can see the calendar, check their own balances and request leave."
- Without Xero: email plus role entry rows.
- "Send invitations" calls the existing `inviteMember` action per selected row and reports per-row outcomes. Failures stay listed with a plain reason; successes are ticked. "Skip for now" advances without sending. Members can always be invited later from Settings.

**Step 5, Finish.**

- Leave stage complete (`last_full_leave_records_sync_at` set): set `onboarding_completed_at` and redirect to `/calendar`.
- Import still running: show per-stage status for people, leave and balances, refreshing every 3 seconds, with the primary action "Open team calendar" disabled and the text "Your calendar opens when leave has been imported". A secondary action "Open calendar now" completes onboarding immediately; the calendar fills as the import finishes.
- Import failed: complete onboarding, redirect to `/calendar`, and let the existing Xero recovery banner explain what happened. The wizard never traps a user behind a failed import.
- Manual-only: complete onboarding and redirect to `/calendar`, which shows public holidays and any manual entries.

### Navigation and persistence

- A step indicator lists all five steps; completed steps are reachable via "Back" for review, future steps are not.
- `organisations.onboarding_step` records the furthest reached step. Reloading or returning later resumes there.
- Each step's completion is validated on the server from real state before advancing, so a stale tab cannot skip a step.
- A "Sign out" link stays available in the form column header. There is no other exit.

## 6. Invited member welcome

- **Who:** a signed-in member (manager or viewer role) whose linked `Person` has `welcome_completed_at` null. Owners and admins never see it; the wizard covers them.
- **Trigger:** one redirect from the authenticated layout to `/welcome`. Members without a linked person are not redirected; they land on the dashboard, which shows "Your administrator needs to link your account before you can see your leave" in place of personal cards.
- **Frame:** the same split layout as the wizard, with a three-step indicator.

| # | Step | Content |
|---|---|---|
| 1 | This is you | Name, email, team and manager from the person record. "Not you? Ask your administrator." |
| 2 | Your leave balances | Balances from Xero. With no Xero connection or no balance data: "Your leave balances will appear here once your organisation connects Xero Payroll." Never shows invented zeros. |
| 3 | Add your calendar (optional) | The member's personal feed subscribe URL, shown in full with copy action, plus short Outlook, Google and Apple instructions. "Skip" is equal weight to "Done". |

- "Skip to dashboard" is available on every step and sets `welcome_completed_at`. Finishing step 3 also sets it, then redirects to `/`.
- The welcome is shown once. It never reappears after completion or skip.

## 7. Post-wizard checklist

- `/settings/getting-started` remains the single checklist. It drops the steps the wizard now owns (profile, people) and lists: review public holidays, review calendar feed, and connect Xero (only when the organisation is manual-only or the connection needs attention).
- The intro copy changes to match: setup is complete; these are recommended next steps.
- `DismissibleOnboardingPanel` and its `localStorage` dismissal are deleted, along with the dashboard's `loadOnboardingState` call. This resolves `ScreenCatalogue.md` decision 3 (section "Decisions required").

## 8. States and ranges

- **People imported:** 1 to about 200 for the target market. The invite roster scrolls within the form column beyond about 8 rows and offers "Select all" and "Select none".
- **Pending matches:** usually 0 to 5; more than 10 shows a count with a link to the full matches page, opened in the same tab and returning to `/onboarding`.
- **Import duration:** seconds to several minutes for people; leave can take longer on larger files.
- **Errors:** OAuth denied or failed (stay on step 2 with a reason); import failure (finish into calendar with recovery banner); invite failure (per-row reason, retry available); save failure on step 1 (inline error, input preserved).
- **Concurrency:** two admins in the wizard simultaneously see the furthest step on their next navigation; server validation prevents double completion side effects.

## 9. Interaction and layout

- One primary button per step, bottom of the form column; secondary actions as text buttons.
- The form column keeps its 400px maximum width for steps 1, 2 and 5. Steps 3 and 4 (roster tables) widen to the full right column on desktop and become stacked rows on mobile.
- Focus moves to the step heading on each step change; the step indicator is an ordered list with `aria-current="step"`.
- Live import status uses a polite live region and updates text only when a stage changes, to avoid noisy announcements.
- Motion: the existing `auth-rise` entrance on step change only, respecting `prefers-reduced-motion`.

## 10. Data model changes

On `organisations`:

| Column | Type | Purpose |
|---|---|---|
| `onboarding_step` | enum `onboarding_step` (`details`, `xero`, `people`, `invites`, `finish`), default `details` | Furthest step reached |
| `onboarding_completed_at` | `timestamptz`, nullable | Wizard completion; drives the layout gate |
| `xero_setup_skipped_at` | `timestamptz`, nullable | Manual-only choice; cleared when a Xero connection is established |

On `people`:

| Column | Type | Purpose |
|---|---|---|
| `welcome_completed_at` | `timestamptz`, nullable | Member welcome shown once |

One migration. No backfill.

## 11. Constraints

- All new queries filter by `clerk_org_id` and `organisation_id`.
- Server actions validate input with Zod and return `Result`.
- Wizard actions require `org:owner` or `org:admin`; welcome actions require the acting user to own the person record.
- The feed URL is shown in full; never masked or truncated.
- Australian English, no em or en dashes, no hype.
- WCAG 2.2 AA, visible 3px focus ring, keyboard-complete flow.
- Analytics: capture `Onboarding Step Completed` (step, xero or manual) and `Onboarding Completed` (duration, mode) through `@repo/analytics`, and `Member Welcome Completed` (skipped or finished).

## 12. Decisions a builder must not reinvent

- Xero is skippable only through the secondary "Set up without Xero" confirmation.
- Holidays and feed are not wizard steps.
- No dashboard onboarding surface of any kind.
- Members are never blocked by the organisation wizard.
- A failed or slow import never blocks completion.
