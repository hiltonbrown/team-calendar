# LeaveSync: Screen Catalogue v4.1

Definitive reference for every screen in `apps/app`, prepared for design and design-system handoff. Each entry covers route, access roles, purpose, user interactions, data displayed, and design requirements.

This version reconciles the catalogue to the authoritative project files. Where v3 conflicted with `PRODUCT.md` or `DESIGN.md`, those files take precedence. Conflicts are flagged inline as **[v4 correction]** for verification.

## Authority and precedence

When this catalogue and a project file disagree, resolve in this order:

1. `PRODUCT.md` (product truth, schema, sync behaviour, tenancy)
2. `DESIGN.md` (colour tokens, typography, elevation, components)
3. `.impeccable.md` (brand personality, design principles)
4. This catalogue (screen-level intent and layout)

This catalogue never overrides token values, tenancy rules, or domain rules. It describes what each screen does and shows; `DESIGN.md` describes how it looks.

---

## What changed from v3

| # | Change | Screens affected |
|---|---|---|
| 1 | **Colour system replaced.** Per-type palette (rose/purple/teal/blue) retired. Provenance (sage = Xero-synced, purple = manual) plus icon and label now carries meaning. All colour references point to named `DESIGN.md` tokens. | All calendar, plans, people, and analytics screens |
| 2 | **"Workspace" terminology removed where it means tenancy.** Top-level tenant boundary is the Clerk Organisation, switched via `<OrganizationSwitcher />`. | S-02, S-17 |
| 3 | **S-02 is Clerk-hosted.** No custom screen. Designer deliverable is a Clerk theme mapping. v3's workspace-selection screen is retired. | S-02 |
| 4 | **Withdraw is in phase-one scope.** Employee can withdraw own `submitted` or `approved` leave; admins can withdraw any. Synchronous Xero write, `failed_action = withdraw` on failure. | S-09, S-10, E-05 |
| 5 | **Provenance is a first-class visual concept.** Every `AvailabilityRecord` carries a sage (Xero-synced) or purple-accent (manual) provenance chip. | S-04, S-07, S-08, S-09, S-10 |
| 6 | **Frost and elevation rules imported.** Translucency and blur permitted only on elevated transient surfaces; persistent surfaces use tonal layering only. | All screens |
| 7 | **Sync-failed semantics clarified.** `failed_action` enum disambiguates which write failed. Badge and retry must name the specific action, not just "sync failed". | S-04, S-07, S-08, S-09, S-10, E-05 |
| 8 | **Australian English and no em dashes enforced** as design constraints across all copy and microcopy. | All screens |
| 9 | **Border radius aligned to `DESIGN.md`.** Buttons are 16px, not 12px as in v3. | All interactive elements |
| 10 | **S-14 route standardised.** `/feeds/[feedId]` is canonical; `/feed/[feedId]` is retired. | S-14 |
| 11 | **Leave balance editability clarified.** Read-only and locked when Xero is connected; editable (admin-only) only when disconnected. Two panel states required. | S-09 |
| 12 | **Standard disconnect retains all history.** Modal copy must state this plainly. Only the destructive option clears data. | S-20 |

---

## Design system foundations

These apply globally to every screen. The summary below is for reference; `DESIGN.md` is authoritative for exact values, dark-mode tokens, and frost specifications.

### Colour tokens

Implemented as CSS custom properties on `[data-theme="light"]` and `[data-theme="dark"]`. Never hardcoded hex. Never `#000000` for text.

| Role | Token | Notes |
|---|---|---|
| Primary action, CTAs, brand | `primary` (`#336A3B`) | Green earns its place; not a background wash |
| Signature sage surface | `primary-container` (`#6DA671`) | Large primary surfaces, success and growth metrics |
| Manual-entry provenance, informational state | `accent` / `accent-container` (`#5E4F99` / `#E5DFFF`) | Purple. Manual chips, info banners, "New"/"Beta" badges. Supporting voice; never co-lead with green |
| Page background | `surface` (`#FCF8FF`) | |
| Cards and panels | `surface-container-*` tiers | Hierarchy via tonal shift, not borders |
| Primary text | `on-surface` (`#1C1A26`) | |
| Secondary text, metadata | `on-surface-variant` (`#46454E`) | |
| Destructive actions, errors | `error` (`#BA1A1A`) / `error-container` | Decline, archive, revoke, disconnect |
| Pending, partial sync, `xero_sync_failed`, expiring tokens | Amber status treatment | Amber is a state signal. A dedicated `--color-warning` token is pending formalisation in `DESIGN.md`; use it when available. Do not substitute `accent`. |

**[v4 correction]** Record category is not colour-keyed per type. Provenance (sage vs purple) plus a per-type icon and label carry meaning. Colour is never the sole status differentiator (WCAG 2.2 AA requirement).

### Approval status treatment

| Status | Treatment |
|---|---|
| Draft | Muted neutral fill, dashed left border, "Draft" badge |
| Submitted | Amber dot and label, dashed border |
| Approved | `primary-container` sage fill, solid |
| Declined | `error` family, tagged label |
| Withdrawn | Muted neutral |
| Xero sync failed | Amber left border (2px), warning icon, action-specific label per `failed_action` |

### Provenance chips

| Provenance | Chip | Meaning |
|---|---|---|
| Synced from Xero | `secondary-container` fill, `on-secondary-container` text, sage leaf icon | Leave pulled from or written to Xero Payroll |
| Manual entry | `accent-container` fill, `on-accent-container` text, pencil icon | WFH, travelling, training, client site, conference, and other non-Xero records |

Chip specification: `label-sm`, 12px radius, 2px 10px padding, no border.

### Typography

Font: **Plus Jakarta Sans** (Google Fonts), variable weight. No Inter, Roboto, or system fonts. Hierarchy through type scale first, colour second. Use named scale tokens from `DESIGN.md` (`display-*`, `headline-*`, `title-*`, `body-*`, `label-*`), not raw pixel values.

### Border radius

| Element | Radius |
|---|---|
| Cards, containers, panels, modals, elevated surfaces, buttons | 16px |
| Inputs, selects, chips, badges, small elements | 12px |

No 4px or 8px radii anywhere.

### Elevation and depth

Persistent surfaces use tonal layering only: no borders, no shadows, no blur. A card at `surface-container` sits on a parent at `surface-container-low`; the tonal shift is the divider.

Elevated transient surfaces (modals, popovers, dropdowns, command palette, sticky chrome, toasts, sheets, date pickers) may use frosted fill, backdrop blur, and the elevation shadow ramp from `DESIGN.md`. Tooltips skip blur and remain opaque.

Every frosted surface must:
- ship an opaque fallback via `@supports not (backdrop-filter)` and `@media (prefers-reduced-transparency: reduce)`
- use focus rings at `primary` full opacity, never translucent

### Motion

120 to 180ms ease-out. No decorative animation. One sanctioned exception: a subtle pulse on an actively running sync status dot (S-25).

### Spacing and layout

Base unit 4px. Minimum 24px gap between cards. Asymmetrical balance: default content-to-sidebar split roughly 2:1 (`1fr 380px`). Contextual header: full-width `surface-container-low` bleed at the top of each view, `display-sm` headline with `body-lg` summary. Responsive breakpoints: 640px (mobile), 1024px (tablet), 1440px (desktop). Collapse sidebar below 1024px.

### WCAG 2.2 AA

The floor, not the target. All text, controls, and status indicators meet contrast requirements. Colour is never the sole differentiator for status or provenance.

### Copy and language

Australian English throughout. No em dashes. Direct, professional tone. No hype, cliches, or motivational language. No "Oops", "Nothing here yet", or "Looks like" in empty states.

### Navigation shell

**Top bar:** Clerk Organisation switcher via `<OrganizationSwitcher />` (left). **[v4 correction]** Not a custom workspace switcher. Global search (centre). Notification bell with unread count badge (right). User avatar menu (right).

**Desktop sidebar:** Persistent left sidebar. Items: Dashboard, Plans, Calendar, Leave Approvals, People, Public Holidays, Feeds, Notifications (unread badge), Analytics (expandable: Leave Reports, Out-of-Office), Settings. Active item: `primary` fill, `on-primary` label. Inactive: `on-surface-variant`. Collapsible to icon-only. Sticky chrome may use the frost treatment per `DESIGN.md`.

**Mobile:** Bottom tab bar for the five most-used items. Remaining items under a "More" tab.

---

## Authentication

### S-01: Sign in

**Route:** `/sign-in`
**Access:** Unauthenticated

**Purpose:** Authenticate the user via Clerk.

**Interactions:**
- Email and password or SSO (Google, Microsoft).
- Forgot password triggers Clerk reset flow.
- Success redirects to Dashboard.

**Design requirements:**
- Centred card, 16px radius, 40px padding, on `surface` background.
- Wordmark above the form. `primary` green on the primary button and wordmark only.
- 12px radius inputs. `primary` focus ring at the specified opacity.
- No decorative imagery or marketing copy.

---

### S-02: Organisation selection (Clerk-hosted)

**[v4 correction]** Resolved: Clerk-hosted, no custom route. v3's "Workspace selection" screen is retired.

**Route:** Clerk-hosted (no custom app route)
**Access:** Authenticated, pre-organisation

**Purpose:** Organisation selection and creation for users who are members of multiple Clerk Organisations. Personal accounts are disabled, so every user belongs to at least one. Switching organisations after entry is handled by `<OrganizationSwitcher />` in the top bar.

**Design requirements:**
- No custom screen. Apply Clerk's `appearance` API and CSS variables to match the LeaveSync palette: `primary` (`#336A3B`) on primary actions, Plus Jakarta Sans, 16px card radius, 12px input radius, `surface` background.
- Designer deliverable: a Clerk theme mapping, not a page layout. Provide the token-to-Clerk-variable mapping alongside S-01 so sign-in and organisation selection read as one continuous branded surface.

---

## Core screens

### S-03: Dashboard

**Route:** `/dashboard` (alias `/`)
**Access:** All roles
**Country context:** Public holiday callouts filtered to the user's or organisation's location. AU: state-specific (QLD, NSW, VIC, SA, WA, TAS, ACT, NT). NZ: national plus regional anniversary days. UK: England and Wales, Scotland, or Northern Ireland based on `region_code`.

**Purpose:** Role-appropriate at-a-glance summary.

**Interactions:** Read-only. Clicking records, people, or stat cards navigates to detail. Notification bell opens `/notifications`.

**Data displayed:**

*Employee:* today's status; active leave requests with status and action prompts; any `xero_sync_failed` records with a "Resolve" link; upcoming approved leave and manual plans (next 14 days); leave balances summary from `leave_balances`; next public holiday for their location.

*Manager:* leave requests awaiting approval (count and link to `/leave-approvals`); team members out today and this week; upcoming peaks (multiple absences on one date, amber highlight); team `xero_sync_failed` records; next public holiday for the team's location(s).

*Admin:* sync health (last sync, connection status, failed record count); leave requests pending across the organisation; active feed count and last rendered timestamps; usage vs plan limits; `xero_sync_failed` record count with a link to resolution.

**Design requirements:**
- Responsive grid: two to three columns on desktop, one column on mobile.
- Employee cards breathe; admin stat cards are denser. Density is role-appropriate.
- Employee balance strip: horizontal row of balance chips below the today card. Each chip: leave type name, remaining value and unit (days or hours per region). `surface-container` background.
- `xero_sync_failed` callout: amber card, warning icon, names the failed action. Not dismissible until resolved.
- Manager approval-pending count: prominent, links to `/leave-approvals`.
- Empty states: calm brief sentences, no illustrations.

---

### S-04: Plans

**Route:** `/plans`
**Access:** All roles
**Country context:** Leave type names adapt to `country_code` via the leave-type mapping in `packages/xero`. AU: "Annual Leave", "Personal/Carer's Leave", "Long Service Leave". NZ: "Annual Leave", "Sick Leave", "Bereavement Leave". UK: "Annual Leave", "Statutory Sick Pay leave".

**Purpose:** Surface for employees to record forward-looking intentions before formal submission. A plan is an `AvailabilityRecord` with `approval_status = 'draft'` that has not been submitted to Xero. Distinct from the approval workflow on `/leave-approvals` and from confirmed manual availability. Once submitted, the record leaves this surface and is no longer editable as a plan.

**Interactions:**
- "Add plan" opens `/plans/new`.
- Tab toggle: "My plans" (employee) / "Team plans" (manager).
- Filter: leave type, date range, status (draft / submitted).
- Clicking a row opens plan detail.
- "Submit for approval" on a draft: opens the submission confirmation modal (S-06), then synchronous Xero write.
- "Delete draft": removes the plan with no Xero write.
- Xero-synced records do not appear here; they appear on `/calendar` and `/leave-approvals`.

**Data per row:** Leave type chip, date range, duration, remaining balance for that type (from `leave_balances`), status badge, created date. **[v4 correction]** All plans are manual-provenance until submitted, so they carry the manual (purple-accent) provenance chip.

**Design requirements:**
- Two-tab structure. Active tab: `primary` underline.
- Draft rows: muted `surface-container` background, dashed left border, "Draft" badge.
- `xero_sync_failed` rows: amber left border, warning icon, action-specific failed label, "Retry" and "View error" inline.
- "Submit for approval" per row: secondary style. "Add plan" is the primary CTA, top right, `primary`.
- Remaining balance chip beside the date range, `on-surface-variant` text. If no data: "Balance unavailable".
- Mobile: card list. Leave type chip and status on line one; date range and balance on line two.

---

### S-05: New plan / Edit plan

**Route:** `/plans/new` (full page); `/plans/[planId]/edit` (intercepting-route modal overlay)
**Access:** All roles (employees create own; admins can create for others)

**Purpose:** Create or edit a draft plan. No Xero write at this stage. New plan opens as a full page; editing opens as a modal overlay with the list visible behind. Browser back closes the modal.

**Interactions:**
- Fields: leave type (select), person (admin-only; pre-filled for employee), date range, all-day toggle, start and end time (when not all-day), notes (internal).
- Live balance and duration: as leave type and dates are set, show the relevant balance and calculated duration. If duration exceeds balance, display a warning (not a blocker at draft stage).
- "Save draft": creates or updates with `approval_status = 'draft'`. No Xero write.
- "Save and submit": saves, then opens the submission confirmation modal (S-06), then synchronous Xero write.
- "Cancel": returns to `/plans` without saving.

**Design requirements:**
- Single-column form, max 640px, centred on desktop.
- Balance panel: inline to the right of date fields on desktop (not a sidebar). Shows leave type, current balance, calculated duration, and remaining after this request. Updates live.
- Duration exceeds balance: amber warning beneath the panel. Blocker only at submission, not at draft stage.
- "Save draft" secondary; "Save and submit" primary `primary`.
- All-day toggle sits immediately below the date fields. Timed fields animate in and out.
- Modal edit variant: `DialogContent` (max 640px, scrollable). Frost and elevation per `DESIGN.md`. Closes via cancel, background click, or browser back.

---

### S-06: Leave submission confirmation

**Component:** Modal, triggered from `/plans` ("Submit for approval") or `/plans/[planId]/edit` ("Save and submit")
**Access:** Employee submitting own leave

**Purpose:** Final confirmation before the synchronous Xero write. Presents a clear summary and a chance to cancel before the API call is made.

**Interactions:**
- Read-only summary: leave type, dates, duration, remaining balance after submission.
- "Confirm and submit": synchronous Xero write. Button shows a loading state during the call (typically under two seconds).
- On success: modal closes, status moves to `submitted`, success toast, in-app notification to the manager.
- On failure: modal stays open. Plain-language error in an amber callout. Two options: "Try again" and "Save as draft instead". Employee and manager notified in-app.
- "Cancel": closes without action.

**Design requirements:**
- Modal: 16px radius, 400px max width. Strong frost fill, strong blur, `elev-modal` shadow per `DESIGN.md`.
- Summary: compact card inside the modal. Leave type chip, date range, duration.
- Balance row: "Remaining after this request: X days." If zero or below, amber note (not a blocker).
- "Confirm and submit" primary `primary`. During the call: spinner replaces label, button disabled.
- Error: amber callout at the top, plain language, no Xero error codes. "Try again" and "Save as draft instead" as two separate buttons.
- Failure never auto-closes the modal. The user must choose an action.

---

### S-07: Calendar

**Route:** `/calendar`
**Access:** All roles (employees see personal view; managers and admins see team or organisation view)
**Country context:** Public holidays filtered to each location's configured set, sourced from `public_holidays` (auto-sourced plus manual overrides).

**Purpose:** Visual calendar of availability, leave, and public holidays across individuals and teams.

**Interactions:**
- View toggles: Day, Week, Month. Default: Week.
- Previous and next navigation; date picker to jump to a specific date.
- Scope selector (manager/admin): "My team", "All teams", individual team, individual person.
- Filter bar: provenance (Xero-synced / manual), record type, approval status, person type, location. **[v4 correction]** Provenance is a first-class filter.
- Clicking a record block opens a popover: person name (subject to privacy mode), record type, approval status, date range, contactability, "View record" link.
- Clicking a blank date opens `/plans/new` pre-filled with that date.

**Design requirements:**
- Week view: person rows sticky left, date columns sticky top. Record blocks span the range.
- Month view: standard grid. Overflow: "+N more" popover.
- Day view: single column, all people, time slots for timed events.
- **[v4 correction]** Record blocks signal provenance and status, not per-type colour. Manual records carry purple-accent provenance; Xero-synced carry sage provenance. Status is conveyed by fill solidity and border: draft = muted dashed; submitted = amber dashed; approved = solid sage; declined = `error`-tinted with struck label.
- Public holiday rows: `accent-container` background, full width, not selectable. **[v4 correction]** Uses the purple-accent `accent-container` token, not an arbitrary purple.
- `xero_sync_failed` blocks: amber fill, small warning icon, error popover on click naming the failed action.
- Calendar cells are persistent surfaces: tonal layering only, no frost or shadow. Popovers are elevated: frost and `elev-popover` per `DESIGN.md`.
- "Add plan" FAB on mobile, fixed bottom right, `primary`.

---

### S-08: People (staff availability)

**Route:** `/people`
**Access:** Manager (own team), Admin, Owner

**Purpose:** Browse all people with current availability status.

**Interactions:**
- Search by name or email.
- Filter: team, location, person type, current status.
- Clicking a row opens the person profile (`/people/[personId]`).
- Admin: "Add person".

**Data per row:** Avatar or initials, display name, job title, team, current availability status today, contactability (if out), next return date (if on leave), `xero_sync_failed` indicator if active, source-system provenance.

**Design requirements:**
- Current status column is the most visually prominent, ahead of the name column.
- Status chip: provenance plus icon plus label. "Available": no chip.
- `xero_sync_failed` indicator: small amber warning icon. Tooltip names the failed action, for example: "An approval write to Xero failed for this person."
- Next return date: `on-surface-variant`, relative format ("Returns Monday").
- Rows are persistent surfaces: tonal layering, no shadow.

---

### S-09: Person profile

**Route:** `/people/[personId]` (intercepting-route modal overlay)
**Access:** Employee (own), Manager (team), Admin, Owner

**Purpose:** Full detail for one person: settings, leave balances, current and upcoming records. Opens as a modal on the people list; URL updates to `/people/[personId]`; browser back returns to the list.

**Interactions:**
- Admin or manager: edit person settings.
- Employee: view own profile; edit permitted fields.
- Leave balances panel: remaining balance per leave type from `leave_balances`, last fetched timestamp. "Refresh balances" (admin-only) triggers `sync-xero-leave-balances` for this person.
- Add, edit, and reorder alternative contacts.
- Navigate to record detail from the record list.
- **[v4 resolved]** Withdraw own submitted or approved leave (employee on own profile; admin on any). Same confirmation modal and synchronous Xero write as S-10. Offered only on records in `submitted` or `approved` state.
- Admin: archive person.

**Data displayed:** Person header (name, job title, team, location, person type, source-system provenance badge, active/inactive); leave balances panel; current status card; default settings (contactability, privacy mode, feed inclusion); alternative contacts; upcoming records (next 30 days with approval status); full history (paginated, descending).

**Design requirements:**
- Modal in `DialogContent` (max 640px, scrollable). Strong frost, `elev-modal`.
- Single-column layout: header, status, balances, records stacked vertically.
- Leave balances: compact table. Type left, balance right (aligned, bold). Last fetched in `label-sm` `on-surface-variant` below.
- Balance of zero: `error` text. Balance within 20% of typical entitlement: amber text.
- **[v4 resolved]** Leave balances panel has two states. **Locked** (Xero connected): muted fill, lock icon at right edge, no edit affordance, label "Managed by Xero". **Editable** (no Xero connection, admin-only): inline edit, no lock icon. LeaveSync never edits Xero balances; admin-managed manual balances are editable only when disconnected.
- Provenance badge in the person header signals Xero-synced vs manually created person.
- Closes via cancel, background click, or browser back.

---

### S-10: Leave approvals

**Route:** `/leave-approvals`
**Access:** Manager (own team), Admin, Owner
**Country context:** Leave type labels adapt to `country_code`. Approval status uses plain English ("Pending approval", "Approved", "Declined"), not Xero internal values.

**Purpose:** In-app approval workflow. Managers review, approve, decline, or withdraw leave requests. All three write actions are synchronous Xero writes.

**Interactions:**
- Filter: status, person, leave type, date range.
- Clicking a row expands to full detail: leave type, dates, duration, employee notes, remaining balance after approval, submission timestamp.
- "Approve": confirmation modal with summary, then synchronous Xero write. Success moves to `approved`, notifies employee and manager. Failure: amber error callout in the modal, record moves to `xero_sync_failed` with `failed_action = approve`.
- "Decline": decline modal with required reason field, then synchronous Xero write. Success moves to `declined`, notifies employee. Failure: as approve, with `failed_action = decline`.
- **[v4 resolved]** "Withdraw": in phase-one scope. Employee can withdraw own `submitted` or `approved` leave; admin can withdraw any. Confirmation modal, then synchronous Xero write. Success moves to `withdrawn`, notifies manager. Failure: amber error callout, `failed_action = withdraw`. Offered only on `submitted` or `approved` records.
- "Request more info" (optional): in-app notification to employee; does not change status.
- Admin view: approve, decline, or withdraw on behalf of any manager.
- "Sync now": manual incremental inbound sync to refresh approval states from Xero.

**Data per row:** Employee name and avatar, leave type, date range, duration, status badge, submitted-at. Expanded view: employee notes, remaining balance, submission history.

**Design requirements:**
- Table on desktop, card list on mobile.
- Status badges: "Pending approval" (amber dot and label), "Approved" (sage), "Declined" (`error`), "Withdrawn" (muted), "Xero sync failed" (amber, warning icon, names the failed action).
- Row actions in the expanded state. "Approve" primary `primary`. "Decline" secondary destructive (`error`-outlined). "Withdraw" tertiary destructive (`error` text, low emphasis), shown only on `submitted` or `approved` records. "Request more info" tertiary text button.
- Approve confirmation modal: employee name, leave type, dates, duration, balance impact. "Confirm approval" primary. 400px max width, strong frost, `elev-modal`.
- Decline modal: 400px max width, strong frost, `elev-modal`. Required reason textarea. "Confirm decline" destructive primary (`error` fill). "Cancel" secondary.
- Withdraw modal: 400px max width, strong frost, `elev-modal`. Read-only summary (leave type, dates, duration) and a plain-language note that withdrawing reverses the request in Xero. Reason field optional. "Confirm withdrawal" destructive primary (`error` fill). "Cancel" secondary.
- `xero_sync_failed` rows: amber left border. Expanded view shows plain-language error and "Retry". Retry re-attempts the specific failed action per `failed_action`.
- Informational note below the page title (info style, not warning): "Approval, decline, and withdrawal actions are written to Xero Payroll immediately."
- Balance impact in the expanded row: "Remaining balance after approval: X days." Over balance shows amber note (not a blocker; Xero validates).

---

### S-11: Public holidays

**Route:** `/public-holidays`
**Access:** All roles (read); Admin, Owner (manage overrides)
**Country context:** AU: national plus state-specific per `region_code`. NZ: national plus regional anniversary days at 16 regional council granularity. UK: England and Wales (8 bank holidays), Scotland (9), Northern Ireland (10).

**Purpose:** View public holidays per location. This is the read-only surface; admin configuration lives in S-23.

**Interactions:**
- Location selector (tabs or dropdown per configured location). Year selector (defaults to current year).
- Admin: suppress a holiday (removes from calendar and calculations without deleting the row); restore a suppressed holiday; "Add custom holiday" (name, date, applies-to, recurrence); "Refresh from source" re-fetches from Nager.Date for the selected location and year; delete a custom holiday.

**Data per row:** Date, day of week, holiday name, type badge (National / State-Regional / Custom), observed date if different, source label (Auto-sourced / Custom), admin action column.

**Design requirements:**
- Location tabs: country flag emoji, location name, region code.
- Rows: date left (day of week muted below), name centre, type badge right, action far right.
- Type badges: "National" (muted neutral), "State/Regional" (`secondary-container`), "Custom" (`accent-container`). **[v4 correction]** Mapped to named tokens.
- Observed date note: `label-sm` `on-surface-variant` below the name, not a separate row.
- Suppressed rows: struck name, reduced row opacity, "Restore" in the action column.
- Custom holidays: amber left border (2px).
- "Add custom holiday" modal: name, date picker, applies-to select, recurrence toggle, "Save" primary, 16px radius, frost and `elev-modal`.
- Read-only view (non-admins): action column hidden; suppressed holidays hidden entirely.
- "Refresh from source": secondary button, "Last updated: [timestamp]" beside it, per location.

---

### S-12: Notifications

**Route:** `/notifications`
**Access:** All roles

**Purpose:** In-app notification feed (SSE-delivered) and email notification preferences.

**SSE delivery:** Pushed from `GET /api/notifications/stream`. The app opens the SSE connection on load and holds it while the tab is active. New notifications update the top-bar unread badge in real time without polling. **[v4 correction]** SSE is per-user and per-Clerk-Organisation; the UI must never surface notifications across organisation boundaries.

**Interactions:**
- Two tabs: "Notifications" (feed) and "Preferences".
- Feed: mark individual as read (click), "Mark all as read", infinite scroll.
- Bell in top bar: unread badge. Clicking opens a popover with the three most recent unread notifications and a "View all" link.
- Preferences: toggle matrix per notification type (in-app / email). Defaults: in-app enabled, email enabled, for all types.

**Notification types (recipients in parentheses):**
- Leave submitted (manager)
- Leave approved (employee)
- Leave declined (employee)
- Leave withdrawn (manager)
- Xero sync failed (admin)
- Sync completed / partial / failed (admin)
- Feed token rotated (admin)
- Privacy conflict detected (admin)
- Missing alternative contact (employee, manager)
- Leave peak warning (manager)
- Plan confirmed (employee)

**Design requirements:**
- Feed: vertical list. Unread: 2px `primary` left border, subtle `surface-container` tint. Read: no treatment.
- Icon per type: small, line weight, category-appropriate.
- Timestamp: relative; absolute on hover.
- "Mark all as read": low emphasis, top right.
- Bell popover: 320px wide, max three rows, "View all notifications" at the bottom. Elevated surface: frost and `elev-popover`.
- Preferences: table. Type description left, in-app toggle centre, email toggle right. Pill toggles. On = `primary`, off = neutral muted.
- Empty feed: "You are up to date." No illustration.

---

## Feed screens

### S-13: Feeds

**Route:** `/feeds`
**Access:** All roles (read); Admin, Owner (manage)

**[v4.1 correction]** Read access is open to all roles from viewer upward, matching the `requirePageRole("org:viewer")` guard in `apps/app/app/(authenticated)/feeds/page.tsx`; management controls (new, pause, activate) are gated to admins and owners. Subscribe URLs are only shown when a token is created or rotated, so read access exposes no secrets. The admin-config counterpart is S-21 at `/settings/feeds`.

**Purpose:** List all ICS feeds with subscription URLs and setup instructions for Outlook, Google Calendar, Apple Calendar, and generic CalDAV.

**Interactions:**
- Clicking a row navigates to feed detail (S-14).
- Quick-copy subscription URL: clipboard icon, tick on copy.
- Admin: pause or activate per row; "New feed".
- "How to subscribe" accordion at the top.

**Subscribe content (tabbed by client):**
- **Google Calendar:** paste URL in "Other calendars > From URL".
- **Outlook:** paste URL in "Add calendar > Subscribe from web".
- **Apple Calendar:** paste URL in "File > New Calendar Subscription".
- **Generic CalDAV:** copy subscription URL directly.
- **Note (Google Calendar):** "Google Calendar refreshes subscribed calendars approximately every 24 hours. Changes may not appear immediately." Shown as a muted info note beneath the Google tab steps.

**Design requirements:**
- "How to subscribe" accordion: collapsed by default for returning users (preference persisted), expanded on first visit.
- Accordion interior: tab strip with client icons; numbered step list per tab; Google refresh limitation as a muted info note.
- Feed table or cards below the accordion. Status: Active (`primary` dot), Paused (amber dot), Archived (muted dot).
- Copy icon: always visible on mobile, visible on hover on desktop. Tick for 1.5 seconds on success.

---

### S-14: Feed detail

**Route:** `/feeds/[feedId]` (intercepting-route modal overlay)
**Access:** Manager (read), Admin, Owner

**Purpose:** Full feed configuration, token management, and preview. Opens as a modal on the feeds list; URL updates to `/feeds/[feedId]`; browser back returns to the list.

**Interactions:**
- "Copy subscription URL".
- "Rotate token": confirmation modal, then immediate new token.
- "Pause" / "Activate".
- "Edit feed".
- "Preview feed": upcoming events per privacy mode tab (Named / Masked / Private).
- "Archive feed": destructive, requires confirmation.
- "How do I add this to my calendar?": quiet link below the URL field, opens the how-to accordion in a modal.

**Design requirements:**
- Modal in `DialogContent` (max 640px, scrollable). Strong frost, `elev-modal`. Single-column layout.
- URL field: monospace, masked by default. "Show" toggle reveals it.
- Token status: Active (`primary` dot and label), Expiring (amber dot and label), Revoked or Expired (`error` dot and label). Revoked and expired tokens return 410 at the feed endpoint.
- "Rotate token": secondary destructive (`error`-outlined).
- Preview: tabbed (Named / Masked / Private). Rows: date, title as published, record type chip with provenance.
- Closes via cancel, background click, or browser back.

---

## Analytics

### S-15: Leave reports

**Route:** `/analytics/leave-reports`
**Access:** Manager (own team), Admin, Owner
**Country context:** Leave type labels adapt to `country_code`. Public holidays excluded from leave-day calculations unless the "Include public holidays" toggle is on.

**Purpose:** Leave pattern analytics on `availability_records` with `source_type` of `xero_leave` or `leavesync_leave` and `approval_status = 'approved'`.

**Interactions:** Date range presets (this month, last month, this quarter, last quarter, this year, custom). Filter: team, location, person type, leave type. Toggle: include or exclude public holidays. Toggle: by person / by team aggregate. Export CSV. Click a data point to drill to the record list.

**Charts:**
- Leave days by type (stacked bar by month)
- Leave days by person (sortable bar)
- Leave days by team (bar)
- Peak absence heatmap calendar
- Leave type breakdown (donut)
- Summary stat cells: total days, average per person, most common type, busiest date

**Design requirements:**
- Summary stat cells: four in a row. Large number, label, secondary metric ("vs prior period").
- Charts: clean, minimal, no 3D, no decorative grid lines. `label-sm` muted axis labels. Hover tooltips.
- **[v4 correction]** Category colours follow the provenance and token system, not arbitrary per-type hues. Use a restrained categorical scale derived from `DESIGN.md` tokens, documented once and reused across S-15 and S-16. A five-slot `--chart-*` scale is planned in `DESIGN.md`; use it when available.
- Heatmap: `surface` (zero) to `primary` (high), with a labelled colour scale.
- Chart cards: `surface-container`, 16px radius, tonal layering. No shadow; cards are persistent surfaces.
- Export: low emphasis, top right. Icon and "Export CSV".
- Mobile: single-column charts. Heatmap replaced by a peak-dates table.

---

### S-16: Out-of-office and travel analytics

**Route:** `/analytics/out-of-office`
**Access:** Manager (own team), Admin, Owner
**Country context:** Country-neutral canonical record types. Public holiday context uses each location's configured set.

**Purpose:** Analytics on manual availability records: WFH, travel, offsite, and out-of-office trends.

**Interactions:** Date range picker (same presets as S-15). Filter: record type, team, location, person. Toggle: include or exclude public holidays. Export CSV. Drill to record list.

**Charts:**
- WFH frequency by person (bar)
- Travel and offsite frequency by person (bar)
- Out-of-office type breakdown (donut)
- Team WFH pattern stacked area by week (labelled "Average in-office vs remote by day of week")
- Most frequent travellers top-N list
- Summary stat cells

**Design requirements:**
- Consistent chart style and categorical scale with S-15. Document the scale once; share it across both screens.
- **[v4 correction]** Manual availability carries purple-accent provenance across the product. Use the documented categorical scale from `DESIGN.md` tokens, not the v3 teal-for-WFH, blue-for-travel scheme. Label every series.

---

## Settings

Settings screens share a left sub-navigation within the settings section, separate from the main sidebar. Sub-nav items: General, Leave Approval, Integrations, Feeds, Billing, Holidays, Audit Log.

### S-17: Settings > General

**Route:** `/settings/general`
**Access:** Admin, Owner
**Country context:** `country_code` drives the state and region selector. Selected `region_code` determines the public holiday set.

**Purpose:** Core organisation configuration.

**Interactions:**
- **[v4 correction]** Edit organisation-level settings, not a "workspace". Where a setting is Clerk-Organisation-level, label it accordingly and prefer Clerk's organisation profile components where they apply.
- Editable: organisation name, `country_code`, `region_code`, primary timezone (IANA).
- Save per section independently.
- Changing `country_code` or `region_code` shows an info note: "Changing this will update the public holiday set for this organisation. Existing manual overrides are preserved."

**Design requirements:**
- **[v4 correction]** Replace v3's "Workspace" and "Organisation" card labels with organisation-scoped cards consistent with the one-Clerk-Org-to-one-country-code rule.
- Country select: flag icons per option. Region selector: conditional on country, searchable.
- Save button per card, not a global page save.
- Country or region change note: muted info style, not a warning.

---

### S-18: Settings > Leave approval

**Route:** `/settings/leave-approval`
**Access:** Admin, Owner

**Purpose:** Configure approval display behaviour and manager visibility scope.

**Interactions:** Toggle: show submitted leave on the team calendar before approval. Toggle: show declined leave on the approvals screen. Toggle: notify managers on team leave status change. Select: approval visibility scope ("All managers see all team leave" / "Managers see only direct reports"). Save.

**Design requirements:**
- Simple toggle and select form.
- Info callout at the top (info style, not warning): "Leave approval actions are written to Xero Payroll immediately and cannot be undone from LeaveSync. Declined leave must be re-submitted in LeaveSync or Xero."
- Toggle rows: label left, one-line description below the label, toggle right.

---

### S-19: Settings > Integrations

**Route:** `/settings/integrations`
**Access:** Admin, Owner

**Purpose:** Manage external integrations. Xero only at this stage.

**Interactions:** View integration cards with status. "Connect" or "Manage" per integration. Future integrations shown as greyed-out "Coming soon" cards.

**Data per card:** Name, logo, one-sentence description, status chip, last sync timestamp (if connected).

**Design requirements:**
- Card grid, landscape orientation.
- Status: "Connected" (`primary` chip), "Not connected" (muted), "Error" (`error` chip).
- Xero card: top left, most prominent, Xero logo. Description: "Sync approved leave and employee data from Xero Payroll (AU, NZ, UK). Submit and approve leave directly from LeaveSync."
- Coming soon cards: greyed, not interactive, "Coming soon" label.

---

### S-20: Settings > Xero detail

**Route:** `/settings/integrations/xero`
**Access:** Admin, Owner
**Country context:** Payroll region (AU, NZ, UK) shown per tenant; determines which Xero Payroll API is used for inbound and outbound sync.

**Purpose:** Xero OAuth management and per-tenant sync configuration.

**Interactions:**
- "Connect Xero": initiates the OAuth flow.
- "Refresh connection": re-initiates OAuth.
- Per tenant: status, last employee sync, last leave sync, last balance sync, linked organisation.
- Per tenant: "Pause sync" / "Resume sync"; "Disconnect" (standard); "Disconnect and clear data" (destructive); "Run sync now".

**Design requirements:**
- Connection status card at the top with primary actions.
- **[v4 correction]** One Organisation owns exactly one XeroConnection and XeroTenant. The per-tenant cards map one-to-one to Organisations within the current Clerk Organisation. Show the linked Organisation name on each tenant card.
- Tenant cards: payroll region badge (AU / NZ / UK text label, not colour-coded), sync timestamps, per-tenant actions.
- **[v4 resolved]** Disconnect modal contains two clearly separated options. **Standard disconnect panel:** neutral description, "Standard disconnect stops syncing but keeps your existing leave history and records. You can reconnect later without data loss." Secondary button. **Destructive disconnect panel:** amber background, `error`-fill "Disconnect and clear data" button. The two options must not look equivalent in visual weight or tone. The destructive option is the only one that clears data; modal copy must make this distinction unambiguous.

---

### S-21: Settings > Feeds

**Route:** `/settings/feeds`
**Access:** Admin, Owner

**Purpose:** Create and configure ICS feeds.

**Interactions:** "New feed" (three-step form); edit existing feed; archive feed.

**Design requirements:**
- Three-step form with a progress indicator: (1) name and scope type, (2) scope values, (3) privacy and inclusion.
- Each scope type option has a one-line description.
- Conditional scope-value fields animate in on scope-type change.
- "Create feed" active only when all required fields are valid.
- Privacy options map to the publishing modes: Named, Masked (Out of office), Private (Busy).

---

### S-22: Settings > Billing

**Route:** `/settings/billing`
**Access:** Owner only

**[v4.1 correction]** Enforced as Owner only in code via `requirePageRole("org:owner")` (`apps/app/app/(authenticated)/settings/billing/page.tsx`). Admins and below are denied; the page renders the owner billing view with the upgrade flow.

**Purpose:** View plan, status, and usage. No checkout in the initial build.

**[v4 correction]** Billing, plan limits, and usage are enforced at the Clerk Organisation level via `clerk_org_subscriptions` and `usage_counters`.

**Interactions:** Read-only plan detail; usage counters vs limits; "Upgrade" / "Contact us" link.

**Design requirements:**
- Plan name prominent. Status badge: Active (`primary`), Cancelled (muted `error`), Past due (amber).
- Usage: progress bars. Amber at 80%, `error` at 100%.
- "Upgrade": secondary, not aggressive.

---

### S-23: Settings > Holidays

**Route:** `/settings/holidays`
**Access:** Admin, Owner
**Country context:** Full country-specific configuration matching S-11.

**Purpose:** Admin configuration for public holidays: suppress, restore, add custom days, refresh from source API. Read-only display for non-admins lives in S-11.

**Interactions:** Location selector; year selector; suppress or restore auto-sourced holidays; "Add custom holiday" (name, date, applies-to, recurrence); "Refresh from source" per location; delete custom holidays.

**Design requirements:**
- Consistent visual treatment with S-11.
- Admin action column visible: suppress and restore controls, "Add custom holiday" button.
- Source label per row. Suppressed rows: struck, muted.
- "Refresh from source": secondary button, "Last updated: [timestamp]" beside it.
- "Add custom holiday" modal: name, date picker, applies-to select, recurrence toggle, 16px radius, frost and `elev-modal`.

---

### S-24: Settings > Audit log

**Route:** `/settings/audit-log`
**Access:** Admin, Owner

**Purpose:** Review all audit events.

**Interactions:** Filter: entity type, actor, action, date range. Expand a row for the before and after diff. Export CSV.

**Design requirements:**
- Dense table. Monospace for entity IDs and JSON diff values.
- Before and after diff: two columns in the expanded row. Changed fields highlighted.
- Actor type badges: "User" (neutral), "System" (`accent-container` muted purple), "Sync" (`secondary-container` muted sage). **[v4 correction]** Mapped to named tokens.
- Timestamp: relative, absolute on hover.

---

## Sync screens

### S-25: Sync health

**Route:** `/sync`
**Access:** Admin, Owner

**Purpose:** Monitor inbound Xero sync run health across all tenants in the current Clerk Organisation.

**Interactions:** "Run sync now" per tenant. Clicking a run row opens S-26. Filter: tenant, run type, status.

**Data displayed:** Per-tenant summary cards (Organisation name, last successful sync, last status, records in / changed / failed, connection status, last balance sync). Run history table.

**Design requirements:**
- Summary card per tenant. Actively running sync: subtle pulse animation on the status dot. This is the only sanctioned animation in the product.
- Failed count in `error` text when greater than zero.
- Dense run history table.
- Cards and table are persistent surfaces: tonal layering, no shadow.

---

### S-26: Sync run detail

**Route:** `/sync/[runId]`
**Access:** Admin, Owner

**Purpose:** Full detail and failed records for one sync run.

**Interactions:** Expand a failed record for error detail. "Re-run sync". "Export failed records" (CSV).

**Design requirements:**
- Large-number stat cells at the top.
- Failed records: monospace IDs and error messages, expandable rows. Data sourced from the `failed_records` dead-letter table. Record-level inbound failures do not fail the whole sync run.

---

## Error and empty states

### E-01: Empty state

Brief, calm sentence. CTA only if a primary action creates the first record. No illustrations unless the context strongly benefits. No "Oops", "Nothing here yet", or "Looks like".

### E-02: Data fetch error

"Unable to load [entity]. Try again or contact support if the issue continues." Secondary "Try again" button. No technical detail for non-admins.

### E-03: 404

Minimal. Wordmark, "Page not found", "Go to Dashboard" link. No navigation shell.

### E-04: Permission denied

"You do not have permission to view this page." "Go to Dashboard" link.

### E-05: Xero sync failed (inline)

Not a full screen. An inline state on records in `/plans`, `/leave-approvals`, `/calendar`, and `/people/[personId]`.

**Design requirements:**
- Amber left border (2px) on the affected row or card.
- Warning icon inline with the record label.
- **[v4 correction]** Badge text names the action that failed, driven by `failed_action` (submit, approve, decline, withdraw), for example "Submit to Xero failed". A generic "Xero sync failed" is acceptable only when the failed action is genuinely unknown.
- Expanded view (on click): plain-language error message. No Xero error codes or raw payloads; the raw payload lives in `xero_write_error_raw` for admin audit only. Two actions: "Retry" (re-attempts the same synchronous write for that action) and "Save as draft" (reverts to draft).
- Retry success clears the failed state. Retry failure refreshes the error message.

---

## Screen inventory

| ID | Screen | Route | Access |
|---|---|---|---|
| S-01 | Sign in | `/sign-in` | Unauthenticated |
| S-02 | Organisation selection | Clerk-hosted (no custom route) | Authenticated |
| S-03 | Dashboard | `/dashboard` | All |
| S-04 | Plans | `/plans` | All |
| S-05 | New / edit plan | `/plans/new`, `/plans/[planId]/edit` | All |
| S-06 | Leave submission confirmation | Modal component | Employee |
| S-07 | Calendar | `/calendar` | All (scoped) |
| S-08 | People | `/people` | Manager, Admin, Owner |
| S-09 | Person profile | `/people/[personId]` | All (scoped) |
| S-10 | Leave approvals | `/leave-approvals` | Manager, Admin, Owner |
| S-11 | Public holidays | `/public-holidays` | All (read), Admin/Owner (manage) |
| S-12 | Notifications | `/notifications` | All |
| S-13 | Feeds | `/feeds` | All (read), Admin/Owner (manage) |
| S-14 | Feed detail | `/feeds/[feedId]` | Manager (read), Admin, Owner |
| S-15 | Leave reports | `/analytics/leave-reports` | Manager, Admin, Owner |
| S-16 | Out-of-office analytics | `/analytics/out-of-office` | Manager, Admin, Owner |
| S-17 | Settings: General | `/settings/general` | Admin, Owner |
| S-18 | Settings: Leave approval | `/settings/leave-approval` | Admin, Owner |
| S-19 | Settings: Integrations | `/settings/integrations` | Admin, Owner |
| S-20 | Settings: Xero detail | `/settings/integrations/xero` | Admin, Owner |
| S-21 | Settings: Feeds | `/settings/feeds` | Admin, Owner |
| S-22 | Settings: Billing | `/settings/billing` | Owner |
| S-23 | Settings: Holidays | `/settings/holidays` | Admin, Owner |
| S-24 | Settings: Audit log | `/settings/audit-log` | Admin, Owner |
| S-25 | Sync health | `/sync` | Admin, Owner |
| S-26 | Sync run detail | `/sync/[runId]` | Admin, Owner |
| E-01 | Empty state | Component | All |
| E-02 | Data fetch error | Component | All |
| E-03 | 404 | `/not-found` | All |
| E-04 | Permission denied | Component | All |
| E-05 | Xero sync failed (inline) | Component | All |

---

## Resolved decisions

These decisions are binding for all design and implementation work from 27 May 2026.

| # | Decision | Detail | Screens |
|---|---|---|---|
| 1 | **Leave balance editability** | Balances are read-only and locked when Xero is connected. Admin-managed manual balances are editable only when Xero is not connected. Two panel states required: locked (lock icon, no edit affordance, "Managed by Xero") and editable (admin-only inline edit). | S-09 |
| 2 | **Standard disconnect retains all history** | A standard Xero disconnect keeps all historical data and records, available on reconnect with no data loss. Only the destructive option clears data. Modal copy must state the distinction plainly. | S-20 |
| 3 | **Withdraw is in phase-one scope** | Employees can withdraw own `submitted` or `approved` leave; admins can withdraw any. Synchronous Xero write, `failed_action = withdraw` on failure. Withdraw modal specified in S-10. | S-09, S-10, E-05 |
| 4 | **S-02 is Clerk-hosted** | No custom organisation-selection route. Designer deliverable is a Clerk theme mapping, not a page layout. v3's workspace-selection screen is retired. | S-02 |
| 5 | **S-14 route is `/feeds/[feedId]`** | The `/feed/[feedId]` variant is retired. | S-14 |

---

## Uncatalogued routes

These routes are referenced in the repo but have no agreed design spec. Do not invent treatments for them in this pass. Raise each as a decision before designing.

| Route | Notes |
|---|---|
| `/sign-up` | Clerk sign-up flow. Likely Clerk-provided UI; confirm whether custom styling is in scope. |
| `/search` | Global search results. Referenced in the top bar but no screen entry exists. |
| `/settings` | Settings section index. Likely a redirect to `/settings/general`; confirm. |
| `/settings/members` | Member management. Distinct from People; likely Clerk organisation members UI. Confirm scope. |
| `/settings/danger` | Destructive account actions. |
| `/support` | In-app support. The `apps/api` README documents a GitHub-backed support submission feature; confirm whether this screen drives it. |
| `/webhooks` | Webhook management. `packages/webhooks` is in the do-not-use list; confirm whether this route is in scope at all. |

---

*v4.1. All content from v4 retained. "What changed from v3" condensed to a reference table. Duplicate "Uncatalogued routes" section eliminated; "Resolved decisions" moved to a dedicated end section with table format. Notification types listed in full in S-12 rather than referenced by v3. S-11 and S-23 relationship clarified (read vs admin config). Amber treatment noted as pending token formalisation. S-20 disconnect modal tightened. Version footer updated. Supersedes v4 (May 2026).*
