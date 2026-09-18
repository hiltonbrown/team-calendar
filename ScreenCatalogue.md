# Team Calendar: Screen Catalogue

Definitive reference for every screen in `apps/app`, reconciled against the implemented code. This is a living document: it is re-verified against current code periodically, not a dated snapshot. It supersedes `ScreenCatalogue-v5.md` (16 August 2026) and, before that, `ScreenCatalogue-v4.1.md` (May 2026) in full.

## Authority and precedence

When this catalogue and a project file disagree, resolve in this order:

1. `PRODUCT.md` (product truth, schema, sync behaviour, tenancy)
2. `CLAUDE.md` (repo conventions, package boundaries, environment)
3. `DESIGN.md` (colour tokens, typography, elevation, components)
4. Prior versions of this catalogue (superseded, retained only in git history)

This catalogue never overrides token values, tenancy rules, or domain rules. It describes what each screen does and shows; `DESIGN.md` describes how it looks. Where a prior version conflicted with the implemented code and the conflict was not itself a case of the code drifting from an authoritative file, the code wins and the entry is corrected. Every correction is recorded in "What changed since the last full pass" below.

### Last full pass: 29 August 2026

Every screen was independently re-verified against current code (route files, client components, server actions, and service functions), split across seven parallel research passes covering: auth/dashboard, plans/calendar, people/approvals/holidays/notifications, feeds/analytics, settings (two blocks), sync, and redirects/error-states/cross-cutting sections. The previous full pass (16 August 2026, as `ScreenCatalogue-v5.md`) is thirteen days old at time of writing; a surprising amount of the app changed in that window, including several features that did not exist yet and several bug fixes to gaps that pass had flagged. See the change table below.

---

## What changed since the last full pass (16 August 2026)

| # | Change | Screens affected | Evidence |
|---|---|---|---|
| 1 | **Dashboard gained an onboarding checklist.** A dismissible, per-user "Getting started" checklist renders on the dashboard for owner/admin roles, backed by the same derived-state logic as S-30. | S-03 | `apps/app/components/onboarding/dismissible-onboarding-panel.tsx`; `apps/app/lib/server/load-onboarding-state.ts` |
| 2 | **Dashboard gained Xero-connection-conditional rendering.** An `XeroDisconnectedBanner` and conditional hiding of Xero-dependent cards (sync health, approvals queue, balances) now respond to whether the org has an active Xero connection. | S-03 | `apps/app/components/dashboard/xero-disconnected-banner.tsx`; `admin-view.tsx`, `manager-view.tsx`, `employee-view.tsx` |
| 3 | **`ViewerView`'s empty dashboard state is no longer a bare stub.** It now shows a "What you can do" card with next-step guidance and links. Retires a `[v5 proposal]`. | S-03 | `apps/app/components/dashboard/viewer-view.tsx:6-33` |
| 4 | **`/plans` gained a `StatusOverview` summary-card row** (Pending / Approved / Failed or declined / Draft or archived counts) above the filter form. | S-04 | `apps/app/app/(authenticated)/plans/plans-client.tsx:264,646-679` |
| 5 | **Legacy redirect shims now preserve every query parameter, not just `org`.** Retires a `[v5 proposal]`. | S-05, legacy redirects | `apps/app/lib/navigation/org-url.ts`; all six shim `page.tsx` files |
| 6 | **`/calendar` gained a "Today in view" sidebar** (`CalendarScanPanel`) and an `ActiveFilterSummary` chip row summarising active filters. | S-07 | `apps/app/components/calendar/calendar-scan-panel.tsx`; `calendar-toolbar.tsx:253-268` |
| 7 | **`/people` gained two admin features:** a "Sync from Xero" manual-dispatch button, and a "Reconcile Clerk access" dialog for inviting/linking Clerk users to person records. Neither existed at the last pass. | S-08 | `apps/app/app/(authenticated)/people/people-client.tsx:216-337,601-731`; `people/_actions.ts:277-337,457-466` |
| 8 | **`/people`'s `StatusChip` radius corrected to 12px** (`rounded-sm`), matching `DESIGN.md`'s chip token. `/people/[personId]`'s separate `StatusChip` was not fixed and is still 20px: see Conflicts found. | S-08, S-09 | `people-client.tsx:970`; `person-profile-content.tsx:613-632` |
| 9 | **`/leave-approvals`'s "Sync approval state" is now fully wired**, dispatching a real `approval_state_reconciliation` job. It was previously hard-disabled with `reconciliationEnabled={false}`. Retires a `[v5 proposal]`. | S-10 | `apps/app/app/(authenticated)/leave-approvals/leave-approvals-client.tsx:209-248`; `packages/availability/src/approvals/approval-service.ts:776-831` |
| 10 | **`/public-holidays` now client-side hides mutating controls from non-admins**, matching the pattern `/feeds` already used. Previously every viewer saw fully interactive Suppress/Restore/Delete/"Add custom holiday" controls that failed server-side. Retires a `[v5 proposal]`. | S-11 | `apps/app/app/(authenticated)/public-holidays/page.tsx:22-36`; `public-holidays-list.tsx:56,196-204,265-317` |
| 11 | **`/notifications`'s duplicate SSE connection is fixed**; a visible "Connecting…" / "Live notifications are unavailable" indicator now exists; the bell's unread badge uses the `destructive` token instead of raw `bg-red-600`. All three retire prior `[v5 proposal]` items. | S-12 | `apps/app/app/(authenticated)/layout.tsx:40`; `notifications-client.tsx:315-324`; `apps/app/components/notifications/bell.tsx:179,191-198` |
| 12 | **Feed lifecycle status now uses one shared `FeedStatusDot`** across `/feeds` and `/feeds/[feedId]`, with `success`/`warning-container` rather than provenance colours. | S-13, S-14 | `apps/app/components/feed/feed-status-dot.tsx` |
| 13 | **`/feeds` gained a Search/Status/Privacy filter bar.** | S-13 | `apps/app/app/(authenticated)/feeds/feed-filter-bar.tsx` |
| 14 | **`/feeds/[feedId]`'s Rotate/Archive are confirmed genuine `AlertDialog` confirmation modals**, and token rotation history is now rendered (both were previously flagged as gaps or unconfirmed). | S-14 | `apps/app/components/feed/feed-detail.tsx:252-272,321-380` |
| 15 | **`/analytics/leave-reports` and `/analytics/out-of-office` both gained a working date-range preset selector** (`AnalyticsFilters`, presets plus custom range). Previously the date range was fully hardcoded with no filter UI. | S-15, S-16 | `apps/app/app/(authenticated)/analytics/analytics-filters.tsx`; `packages/availability/src/analytics/date-range-options.ts` |
| 16 | **New bug found: `/analytics/leave-reports`'s CSV export ignores the on-screen date-range filter**, always exporting `this_year` regardless of the selected preset. | S-15 | `apps/app/app/(authenticated)/analytics/leave-reports/_actions.ts:68-71,126` |
| 17 | **`/settings/billing`'s status badge and usage bars no longer use raw Tailwind amber**; both now use the `warning`/`warning-container` design tokens. | S-22 | `apps/app/app/(authenticated)/settings/billing/billing-client.tsx:21-44` |
| 18 | **`/settings/audit-log`'s pagination is functional**, not dead: a cursor-based "Load more" link reads and writes the `cursor` query param. Previously recorded as non-functional. | S-24 | `apps/app/app/(authenticated)/settings/audit-log/audit-log-client.tsx:166-186`; `page.tsx:43,51` |
| 19 | **`/sync`'s manual dispatch is now fully wired for all four job types** (`sync-xero-people`, `sync-xero-leave-records`, `sync-xero-leave-balances`, `reconcile-xero-approval-state`). Previously only two of four were registered. Failed-record counts are now colour-differentiated. | S-25 | `packages/availability/src/sync/sync-events.ts:36-41`; `apps/app/app/(authenticated)/sync/sync-client.tsx:40-53,248-259` |
| 20 | **`/sync/[runId]`'s "Re-run sync" is now enabled for every run type**, not just reconciliation runs. Gained undocumented "Cancel running sync" and "View timeline" controls. Failed-count stat cell is now colour-differentiated. | S-26 | `apps/app/app/(authenticated)/sync/[runId]/sync-run-detail-client.tsx:286-351` |
| 21 | **`E-05` (Xero sync failed) component can now compose the specific failed action into its message**, but no call site passes the new `failedAction` prop yet: the fix landed in the component, not in its callers. | E-05 | `apps/app/components/states/xero-sync-failed-state.tsx:6-63`; seven call sites, none pass `failedAction` |
| 22 | **`XeroWriteError` gained four variants**: `network_error`, `not_found_error`, `permission_error`, `region_not_supported_error`, for a total of nine. Previously documented (here and in `CLAUDE.md`/`AGENTS.md`/`GEMINI.md`/`PRODUCT.md`) as five. Corrected in this pass across all five files. | E-05, all agent-instruction files | `packages/xero/src/write/types.ts:3-12` |
| 23 | **New finding: `/people/[personId]`'s balance panel shows a manual-balance "Edit" column/button to every viewer**, not just admins/owners; only the actual edit form beneath it is role-gated, leaving non-admins a dead-end control. | S-09 | `apps/app/components/people/person-profile-content.tsx:494,508-526,539` |
| 24 | **Design system foundations table corrected: no `secondary-container` token exists.** The prior catalogue's colour-tokens table invented a `secondary-container` pairing and misattributed `#5E4F99` to `accent` (that hex belongs to the unrelated `editorial-accent` token). Xero/manual provenance chips actually use `secondary`/`secondary-foreground` and `accent-container`/`on-accent-container`. | Design system foundations | `packages/design-system/styles/globals.css` (no `--secondary-container` or `--color-secondary-container` anywhere) |
| 25 | **`/people/[personId]`'s profile header confirmed to carry zero provenance signal** (no icon, no colour, no text badge): stronger than the prior pass's hedge that it "may still be colour-only." | S-09 | `apps/app/components/people/person-profile-content.tsx:103-126` |

---

## Reconciliation summary

Status definitions: `Matches`, `Drifted` (exists but differs from catalogue), `Undocumented` (route exists, no prior entry), `Unbuilt` (catalogued, not implemented), `Retired` (correctly absent).

| ID | Screen | Route | Status | Summary |
|---|---|---|---|---|
| S-01 | Sign in | `/sign-in` | Matches | Copy centralised into a shared `signInCopy` export; text and behaviour unchanged. |
| S-31 | Sign up | `/sign-up` | Matches | Copy centralised into a shared `signUpCopy` export; text and behaviour unchanged. |
| S-02 | Organisation selection | `/session-tasks/choose-organization` | Matches | Confirmed no `AuthFormFrame`/`embeddedAuthAppearance` is used here at all; resolves a prior open question. |
| S-03 | Dashboard | `/` | Drifted | Undocumented onboarding checklist and Xero-connection-conditional card/banner logic added; `ViewerView` empty state improved; card radius is 16px (`rounded-xl`), not 16px-claimed-as-`rounded-2xl`. |
| S-04 | Plans | `/plans` | Drifted | New `StatusOverview` summary-card row undocumented; pending-status colour and provenance-icon fixes both re-confirmed still correct. |
| S-05 | New / edit plan | `/plans/new`, `/plans/[planId]/edit` | Drifted | Legacy-redirect query-param preservation now fully implemented; live balance-counter proposal remains open; undocumented empty-people-list message found. |
| S-06 | Leave submission confirmation | `components/plans/submit-confirmation-modal.tsx` | Drifted | Retry-mode button literal is "Retry submission", not "Retry Xero sync"; everything else re-verified correct. |
| S-07 | Calendar | `/calendar` | Drifted | New "Today in view" sidebar and active-filter chip row undocumented; mobile FAB gap and provenance icons re-confirmed exactly as before. |
| S-08 | People | `/people` | Drifted | `StatusChip` radius fix confirmed; two substantial new admin features (Sync from Xero, Reconcile Clerk access) are undocumented. |
| S-09 | Person profile | `/people/[personId]` | Drifted | "Edit profile" still a stub; header has zero provenance signal (new finding); manual-balance Edit control wrongly shown to non-admins (new bug); its own `StatusChip` still 20px, now inconsistent with S-08's fixed one. |
| S-10 | Leave approvals | `/leave-approvals` | Drifted | "Sync approval state" is now fully wired, resolving the primary prior finding; failure-copy and badge-differentiation gaps remain open. |
| S-11 | Public holidays | `/public-holidays` | Matches | Single operational home for review, source refresh and admin holiday management; responsive rows and explicit suppressed state. |
| S-12 | Notifications | `/notifications` | Matches | All three prior gaps resolved: duplicate SSE connection fixed, reconnecting indicator added, bell badge uses the `destructive` token. |
| S-13 | Feeds | `/feeds` | Drifted | Status-dot colours correctly resolved on this screen; new Search/Status/Privacy filter bar undocumented. |
| S-14 | Feed detail | `/feeds/[feedId]` | Matches | Complete subscribe URL, token history, public-holiday inclusion, and semantic lifecycle status are rendered. |
| S-15 | Leave reports | `/analytics/leave-reports` | Drifted | Date-range preset/custom-range UI now fully built, contradicting the prior "no filter UI" claim; CSV export silently ignores the selected range. |
| S-16 | Out-of-office analytics | `/analytics/out-of-office` | Drifted | Same date-range UI addition as S-15; chart/variable-naming findings otherwise unchanged. |
| S-17 | Settings: General | `/settings/general` | Matches | Country is truthful read-only context; the unreachable confirmation path is removed. |
| S-18 | Settings: Leave approval | `/settings/leave-approval` | Matches | Auto-save controls are labelled and expose setting-scoped saving, saved and error receipts. |
| S-19 | Settings: Integrations | `/settings/integrations` | Matches | No drift found. |
| S-20 | Settings: Xero detail | `/settings/integrations/xero` | Matches | One recommended sync is promoted; manual and connection controls are disclosed progressively; disconnect is confirmed and pause/resume is reachable. |
| S-21 | Settings: Feeds | `/settings/feeds` | Matches | Feed defaults have visible labels, descriptions and scoped auto-save receipts. |
| S-22 | Settings: Billing | `/settings/billing` | Drifted | Amber-to-token migration confirmed complete and consistent; role-blindness of `getBillingSummary` vs. role-aware dashboard widget re-confirmed. |
| S-23 | Settings: Holidays | `/settings/holidays` | Matches | Truthful summary and launch page; all holiday operations live on S-11. |
| S-24 | Settings: Audit log | `/settings/audit-log` | Drifted | Pagination confirmed functional, contrary to the prior "non-functional" claim; no actor badges or field-level diff, unchanged. |
| S-25 | Sync health | `/sync` | Drifted | All 4 sync dispatch buttons now wired (was 2/4); Records-failed count now colour-differentiated; failure/partial-success card logic more nuanced than previously described. |
| S-26 | Sync run detail | `/sync/[runId]` | Drifted | "Re-run sync" enabled for every run type; Records-failed stat cell colour-differentiated; undocumented Cancel/Timeline controls found. |
| S-27 | Settings: Members | `/settings/members` | Matches | No drift found. |
| S-28 | Settings: Xero connect | `/settings/integrations/xero/connect` | Matches | No drift on documented behaviour; found an undocumented connect-vs-reconnect audit distinction and a redundant duplicate initial sync (inline + queued). |
| S-29 | Settings: Xero person matches | `/settings/integrations/xero/matches` | Matches | No drift; Clerk-ID field is placeholder+fallback rather than a literal pre-filled value, functionally equivalent. |
| S-30 | Settings: Getting started | `/settings/getting-started` | Matches | No drift; derived-state logic, step set, and badge labels all verified exactly. |
| E-01 | Empty state | Component | Matches | No drift. |
| E-02 | Data fetch error | Component | Matches | No drift. |
| E-03 | 404 | `apps/app/app/(authenticated)/not-found.tsx` | Matches | Confirmed only one `not-found.tsx` exists in the whole app; no global (unauthenticated) 404. |
| E-04 | Permission denied | Component | Matches | Component unchanged; corrected file attribution for the dashboard's inline usage (it's in `page.tsx`, not `dashboard-body.tsx`). |
| E-05 | Xero sync failed (inline) | Component | Drifted | Component now supports composing the failed action into its message, but no call site passes it; `XeroWriteError` enum grew from 5 to 9 variants. |
|: | Legacy redirect shims (6 routes) | various | Matches | All six now preserve every query parameter, not just `org`; resolves a prior open proposal. |

---

## Design system foundations

### Colour tokens

Implemented as CSS custom properties on `[data-theme="light"]`/`[data-theme="dark"]` in `packages/design-system/styles/globals.css`. Never hardcoded hex; never `#000000` for text.

| Role | Token | Notes |
|---|---|---|
| Primary action, CTAs, brand | `primary` (`#336A3B`) | Earns its place; not a background wash. |
| Signature sage surface | `primary-container` (`#6DA671`) | Large primary surfaces, success and growth metrics. |
| Xero-synced provenance | `secondary` / `secondary-foreground` | Sage. **Correction:** there is no `secondary-container` token in the codebase (no `--secondary-container` or `--color-secondary-container` anywhere). Xero-linked chips use `bg-secondary text-secondary-foreground` directly (`plans-client.tsx:688`, `people-client.tsx:544`). |
| Manual-entry provenance, informational state | `accent-container` / `on-accent-container` (`#E5DFFF` / `#1F1551`) | Lavender. **Correction:** `#5E4F99` (previously attributed to `accent`) is actually the unrelated `editorial-accent` token; the real `--accent` value is `#EBE5F7`, a neutral hover surface, not a provenance colour. |
| Page background | `surface` / `background` (`#FCF8FF`) | Cool-tinted, never cream. |
| Cards and panels | `surface-container-*` tiers | Tonal hierarchy, not borders. |
| Primary text | `on-surface` (`#1C1A26`) | |
| Secondary text, metadata | `on-surface-variant` (`#46454E`) | |
| Destructive actions, errors, `xero_sync_failed` | `destructive` (`#BA1A1A`) / `error-container` (`#FFDAD6`) | **Naming correction:** the token is `destructive`, not `error`: there is no `--error` custom property in the codebase. |
| Pending, partial sync, expiring tokens | `warning` / `warning-container` / `on-warning-container` | Resolved: defined in `globals.css` (light and dark) and consumed by `billing-client.tsx` and `feed-table.tsx`. No `amber-*` Tailwind usage remains anywhere in `apps/`. |
| Chart categorical scale | `--chart-1` … `--chart-5` | Sage family: `#336A3B`, `#6DA671`, `#4B6542`, `#CAE8BC`, `#57624F` (light); lightened equivalents in dark. |

### Border radius

| Element | Radius | CSS variable |
|---|---|---|
| Cards, containers, panels | 20px | `rounded-xl` → `--radius-xl` |
| Elevated surfaces (modals, popovers, dropdowns, sheets, command palette, toasts) | 16px | `rounded-2xl` (Tailwind's built-in default; this codebase does not redefine `--radius-2xl`, so it coincides with `--radius`/`--radius-lg`) |
| Buttons, inputs | 14px | `rounded-md` → `--radius-md` |
| Chips, badges, small elements | 12px | `rounded-sm` → `--radius-sm` |

No 4px or 8px radii anywhere. `/people`'s `StatusChip` is now correctly `rounded-sm` (12px). `/people/[personId]`'s separately-defined `StatusChip` is still `rounded-xl` (20px): see Conflicts found.

### Elevation and frost

Persistent surfaces use tonal layering only: no borders, no shadows, no blur. `DESIGN.md` requires frosted fill and backdrop blur on every elevated transient surface (modals, popovers, dropdowns, command palette, sticky chrome, toasts, sheets), each with an opaque `@supports`/`prefers-reduced-transparency` fallback. Still confirmed: `backdrop-blur` exists in exactly one place across `apps/app` and `packages/design-system`: the sticky header (`apps/app/app/(authenticated)/components/header.tsx:29`), and even that instance pairs it with a `supports-[backdrop-filter]` fallback class but not the full `prefers-reduced-transparency` handling `DESIGN.md` requires. `Dialog`, `Popover`, `Sheet`, `DropdownMenu`, `Command`, and the toast primitive remain unconfirmed to have any blur/frost treatment. Unresolved; see Conflicts found.

### Provenance chips

| Provenance | Chip | Meaning |
|---|---|---|
| Synced from Xero | `secondary` fill / `secondary-foreground` text, sage `LeafIcon` | Confirmed live on `/plans`, `/people`, `/calendar`. |
| Manual entry | `accent-container` fill / `on-accent-container` text, `PencilIcon` | Confirmed live at the same three surfaces. |

Provenance icons (leaf/pencil) are now implemented on `/calendar` (`calendar-event-chip.tsx`), `/plans` (`plans-client.tsx`), and `/people` (`people-client.tsx`). **`/people/[personId]`'s profile header carries zero provenance signal**: no icon, no colour, no text badge; only narrower per-field `LockIcon`s indicating Xero-owned fields (Email, Start date). This is a genuine, confirmed WCAG 2.2 AA gap and a cross-screen inconsistency (the list view now correctly signals provenance; the detail view for the same person does not). See Conflicts found.

### Typography, spacing, motion, WCAG floor, copy and language, navigation shell

Not re-investigated in this pass; no divergence signal surfaced incidentally. Carried forward unchanged from the last full pass.

---

## Screen inventory

| ID | Screen | Route | Guard literal | Access roles | Status | Evidence |
|---|---|---|---|---|---|---|
| S-01 | Sign in | `/sign-in` | Unauthenticated | Unauthenticated | Matches | `apps/app/app/(unauthenticated)/(auth)/sign-in/[[...sign-in]]/page.tsx` |
| S-31 | Sign up | `/sign-up` | Unauthenticated | Unauthenticated | Matches | `apps/app/app/(unauthenticated)/(auth)/sign-up/[[...sign-up]]/page.tsx` |
| S-02 | Organisation selection | `/session-tasks/choose-organization` | Unauthenticated (post sign-up Clerk task) | Authenticated, pre-organisation | Matches | `apps/app/app/(unauthenticated)/(auth)/session-tasks/choose-organization/page.tsx` |
| S-03 | Dashboard | `/` | `requirePageRole("org:viewer")` | All | Drifted | `apps/app/app/(authenticated)/page.tsx:24` |
| S-04 | Plans | `/plans` | `requirePageRole("org:viewer")` | All | Drifted | `apps/app/app/(authenticated)/plans/page.tsx:34` |
| S-05 | New / edit plan | `/plans/new`, `/plans/[planId]/edit` (+ `@modal`) | No `requirePageRole`; implicit viewer via `currentUser()` + `requireActiveOrgPageContext` | All | Drifted | `apps/app/app/(authenticated)/plans/record-form-data.ts:24-161` |
| S-06 | Leave submission confirmation | `components/plans/submit-confirmation-modal.tsx` | Inherits caller's guard | Employee (submit), any actor with a `xero_sync_failed` record (retry) | Drifted | `apps/app/components/plans/submit-confirmation-modal.tsx:182` |
| S-07 | Calendar | `/calendar` | `requirePageRole("org:viewer")` | All | Drifted | `apps/app/app/(authenticated)/calendar/page.tsx:42` |
| S-08 | People | `/people` | `requirePageRole("org:viewer")` | All (read); Admin/Owner (`Add person`, Sync from Xero, Reconcile Clerk access) | Drifted | `apps/app/app/(authenticated)/people/page.tsx:23`; `people/new/page.tsx:18` |
| S-09 | Person profile | `/people/[personId]` (+ `@modal`) | `requirePageRole("org:viewer")` | All (scoped) | Drifted | `apps/app/app/(authenticated)/people/[personId]/page.tsx` |
| S-10 | Leave approvals | `/leave-approvals` | `requirePageRole("org:manager")` | Manager, Admin, Owner | Drifted | `apps/app/app/(authenticated)/leave-approvals/page.tsx:68` |
| S-11 | Public holidays | `/public-holidays` (+ `holidays/new`) | `requirePageRole("org:viewer")`; custom-holiday form requires admin; mutating actions independently call `requireRole("org:admin")` | All (read); Admin/Owner (mutate, client-hidden and server-enforced) | Matches | `apps/app/app/(authenticated)/public-holidays/page.tsx`; `holidays/new/form-data.ts` |
| S-12 | Notifications | `/notifications` | `requirePageRole("org:viewer")` | All | Matches | `apps/app/app/(authenticated)/notifications/page.tsx:46` |
| S-13 | Feeds | `/feeds` (+ `new`) | `requirePageRole("org:viewer")` (list); no page-level guard on `new`, action-layer enforces admin/owner | All (read); Admin/Owner (manage, action-layer enforced) | Drifted | `apps/app/app/(authenticated)/feeds/page.tsx:34` |
| S-14 | Feed detail | `/feeds/[feedId]` (+ `@modal`) | No page-level guard; `getFeedDetail`'s `canViewFeed` scope check | Scope-dependent; Admin/Owner see all | Drifted | `apps/app/app/(authenticated)/feeds/[feedId]/page.tsx` |
| S-15 | Leave reports | `/analytics/leave-reports` | `requirePageRole("org:manager")` | Manager, Admin, Owner | Drifted | `apps/app/app/(authenticated)/analytics/leave-reports/page.tsx:42` |
| S-16 | Out-of-office analytics | `/analytics/out-of-office` | `requirePageRole("org:manager")` | Manager, Admin, Owner | Drifted | `apps/app/app/(authenticated)/analytics/out-of-office/page.tsx:40` |
| S-17 | Settings: General | `/settings/general` | `requirePageRole("org:admin")` (+ layout gate) | Admin, Owner | Matches | `apps/app/app/(authenticated)/settings/general/page.tsx:20` |
| S-18 | Settings: Leave approval | `/settings/leave-approval` | `requirePageRole("org:admin")` (+ layout gate) | Admin, Owner | Matches | `apps/app/app/(authenticated)/settings/leave-approval/page.tsx:17` |
| S-19 | Settings: Integrations | `/settings/integrations` | `requirePageRole("org:admin")` (+ layout gate) | Admin, Owner | Matches | `apps/app/app/(authenticated)/settings/integrations/page.tsx:14` |
| S-20 | Settings: Xero detail | `/settings/integrations/xero` | `requirePageRole("org:admin")` (+ layout gate) | Admin, Owner | Matches | `apps/app/app/(authenticated)/settings/integrations/xero/page.tsx:14` |
| S-21 | Settings: Feeds | `/settings/feeds` | `requirePageRole("org:admin")` (+ layout gate) | Admin, Owner | Matches | `apps/app/app/(authenticated)/settings/feeds/page.tsx:24` |
| S-22 | Settings: Billing | `/settings/billing` | `requirePageRole("org:admin")` (+ layout gate); `requireRole("org:owner")` computed but unused by rendering | Admin, Owner (rendered identically) | Drifted | `apps/app/app/(authenticated)/settings/billing/page.tsx:28,36-37` |
| S-23 | Settings: Holidays | `/settings/holidays` | `requirePageRole("org:admin")` (+ layout gate) | Admin, Owner | Matches | `apps/app/app/(authenticated)/settings/holidays/page.tsx:22` |
| S-24 | Settings: Audit log | `/settings/audit-log` | `requirePageRole("org:admin")` (+ layout gate) | Admin, Owner | Drifted | `apps/app/app/(authenticated)/settings/audit-log/page.tsx:22` |
| S-25 | Sync health | `/sync` | `requirePageRole("org:admin")` | Admin, Owner | Drifted | `apps/app/app/(authenticated)/sync/page.tsx:33` |
| S-26 | Sync run detail | `/sync/[runId]` | `requirePageRole("org:admin")` | Admin, Owner | Drifted | `apps/app/app/(authenticated)/sync/[runId]/page.tsx:35` |
| S-27 | Settings: Members | `/settings/members` | No page-level `requirePageRole`; layout-only gate (raw `orgRole` string check) | Admin, Owner | Matches | `apps/app/app/(authenticated)/settings/{layout.tsx:12-22,members/page.tsx}` |
| S-28 | Settings: Xero connect | `/settings/integrations/xero/connect` | `requirePageRole("org:admin")` (+ layout gate) | Admin, Owner | Matches | `apps/app/app/(authenticated)/settings/integrations/xero/connect/page.tsx:21` |
| S-29 | Settings: Xero person matches | `/settings/integrations/xero/matches` | `requirePageRole("org:admin")` (+ layout gate) | Admin, Owner | Matches | `apps/app/app/(authenticated)/settings/integrations/xero/matches/page.tsx:21` |
| S-30 | Settings: Getting started | `/settings/getting-started` (+ `/setup` redirect) | `requirePageRole("org:admin")` (+ layout gate) | Admin, Owner | Matches | `apps/app/app/(authenticated)/settings/getting-started/page.tsx:21` |
| E-01 | Empty state | Component | N/A | All | Matches | `apps/app/components/states/empty-state.tsx` |
| E-02 | Data fetch error | Component | N/A | All | Matches | `apps/app/components/states/fetch-error-state.tsx` |
| E-03 | 404 | `apps/app/app/(authenticated)/not-found.tsx` | N/A | All | Matches | `apps/app/app/(authenticated)/not-found.tsx` |
| E-04 | Permission denied | Component | N/A | All | Matches | `apps/app/components/states/permission-denied-state.tsx` |
| E-05 | Xero sync failed (inline) | Component | N/A | All | Drifted | `apps/app/components/states/xero-sync-failed-state.tsx` |

Spot-checked guard literals for S-03, S-10, S-17, S-22, S-27 against live `requirePageRole`/`requireRole` calls: all five match exactly. Table shape (46 total `page.tsx` files, 31 numbered screens + 6 redirect shims + `@modal`/`new` sub-routes folded into parent rows) confirmed consistent with `find apps/app/app -name page.tsx`.

---

## Authentication

### S-01: Sign in

**Route:** `/sign-in` (catch-all `[[...sign-in]]`), no modal or intercept behaviour.
**Guard:** Unauthenticated. Access: unauthenticated.
**Evidence:** `apps/app/app/(unauthenticated)/(auth)/sign-in/[[...sign-in]]/page.tsx:1-17`; `packages/auth/components/sign-in.tsx:1-16`; `auth-form-frame.tsx`; `embedded-auth-appearance.ts`; `apps/app/app/(unauthenticated)/(auth)/layout.tsx`; `apps/app/app/styles.css:30-42,68-99,151-167`.

**Purpose:** Authenticate the user via Clerk.

**User interactions, as-built:** A thin wrapper around Clerk's `SignIn` component, itself wrapped in `AuthFormFrame`. Copy ("Welcome back" / "Sign in to manage leave and availability for your organisation.") is now centralised into a shared `signInCopy` export in `packages/auth/components/sign-in.tsx:5-9`, consumed by both the page's `metadata` and the rendered frame, so the two can no longer drift out of sync with each other (a small refactor since the last pass; behaviour and text are unchanged). `embeddedAuthAppearance` hides Clerk's own header since `AuthFormFrame` supplies it instead. Success redirects into the app (Clerk-managed).

**Role variations:** None; unauthenticated only.

**Data displayed:** None beyond the Clerk sign-in form itself.

**States:** Loading/error/validation states are Clerk-managed within its own component.

**Design requirements:** Two-column layout: `BrandPanel` on the left, hidden below `lg`; form pane on the right with a mobile-only `ModeToggle` and `MobileBrand`. The Auth Brand Panel uses the dedicated `--auth-*` tokens exactly as `DESIGN.md`'s "Auth Brand Panel" section specifies. `.auth-rise` entrance animation respects `prefers-reduced-motion`.

**`[v5 proposal]` interaction improvements:** None; this screen matches its intent closely.

---

### S-31: Sign up

**Route:** `/sign-up` (catch-all `[[...sign-up]]`), no modal or intercept behaviour.
**Guard:** Unauthenticated. Access: unauthenticated.
**Evidence:** `apps/app/app/(unauthenticated)/(auth)/sign-up/[[...sign-up]]/page.tsx:1-17`; `packages/auth/components/sign-up.tsx:1-16`.

**Purpose:** Create a new Clerk Organisation, or accept an existing invitation.

**User interactions, as-built:** Same pattern as S-01. Copy ("Create your organisation" / "Start a new Team Calendar organisation, or accept an invitation from your team email.") is centralised into a shared `signUpCopy` export (`sign-up.tsx:5-9`), the same refactor applied to S-01. On completion, Clerk routes the user into the S-02 organisation-choice task if applicable.

**Role variations:** None; unauthenticated only.

**Data displayed:** None beyond the Clerk sign-up form.

**States:** Clerk-managed.

**Design requirements:** Identical to S-01.

**`[v5 proposal]` interaction improvements:** None; matches intent.

---

### S-02: Organisation selection

**Route:** `/session-tasks/choose-organization`, reached via Clerk's session-tasks redirect flow. Not a modal or intercept; a full page within the `(auth)` layout.
**Guard:** Unauthenticated route group; gated by Clerk session-task state (user is authenticated but has an unresolved "choose organisation" task). No app-level middleware special-cases this route: `apps/app/proxy.ts` has no `session-tasks` reference; it only attaches CSP/nonce headers. Access: authenticated, pre-organisation.
**Evidence:** `apps/app/app/(unauthenticated)/(auth)/session-tasks/choose-organization/page.tsx:1-13`; `packages/auth/components/choose-organization-task.tsx:1-9`; `apps/app/proxy.ts`.

**Purpose:** Organisation selection and creation for users who are members of multiple Clerk Organisations, or who have a pending invitation, before entering the app. Personal accounts are disabled, so every user belongs to at least one Organisation eventually. **Switching organisations after entry is not currently supported anywhere in the app**: `<OrganizationSwitcher />` is confirmed absent by a full-repo grep, and `CustomUserButton` exposes only Clerk's "Organisation profile" action (`openOrganizationProfile()`).

**User interactions, as-built:** Renders `TaskChooseOrganization` directly with `redirectUrlComplete="/"`. **Resolved:** `ChooseOrganizationTask` (`choose-organization-task.tsx:5-9`) passes no `appearance` prop and is not wrapped in `AuthFormFrame`, unlike S-01/S-31: it is a bare `<ClerkTaskChooseOrganization redirectUrlComplete="/" />`. The surrounding Brand Panel is inherited purely from the `(auth)` layout, not from any Team Calendar wrapper component. Team Calendar supplies no custom list rendering, form fields, or interaction logic.

**Role variations:** None; pre-organisation state has no role yet.

**Data displayed:** Clerk-managed organisation list/invitation state.

**States:** Clerk-managed.

**Design requirements:** Inherits the Brand Panel from the `(auth)` layout only: even more directly "Clerk-hosted" than previously documented, since there isn't even a Team Calendar title/description wrapper here.

**`[v5 proposal]` interaction improvements:** None proposed; correction is documentary only.

---

## Core screens

### S-03: Dashboard

**Route:** `/` (root of the authenticated app). No `/dashboard` alias exists; `components/dashboard/` is a shared component library, not a second route. No modal behaviour.
**Guard:** `requirePageRole("org:viewer")` (`page.tsx:24`). Access: all roles.
**Evidence:** `apps/app/app/(authenticated)/page.tsx:1-56`; `dashboard-body.tsx:1-201`; `packages/availability/src/dashboard/dashboard-service.ts`; `apps/app/components/dashboard/{admin-view,manager-view,employee-view,viewer-view,admin-empty-view,dashboard-skeleton,dashboard-scaffold,quick-actions-card,dashboard-live-updates,xero-disconnected-banner,dashboard-card-shell}.tsx`; `apps/app/components/onboarding/{dismissible-onboarding-panel,onboarding-checklist}.tsx`; `apps/app/lib/server/load-onboarding-state.ts`.
**Country context:** Public holiday callouts filtered by the acting person's or team's `location_id`/`region_code`, same underlying data as S-11.

**Purpose:** Role-appropriate at-a-glance summary and entry point.

**User interactions, as-built:** Each card exposes an optional "Review" CTA linking deeper into the app; `QuickActionsCard` hard-codes three shortcuts ("Create a new plan", "View my calendar", "Open notifications"); `DashboardLiveUpdates` subscribes to SSE and shows a toast with a "Refresh" action, no auto-refresh. **Two features new since the 16 August pass:**
1. **Dismissible onboarding checklist.** `DashboardBody` renders `DismissibleOnboardingPanel` above the role view whenever the acting role is owner or admin, regardless of whether the admin has a linked person record. It shows an `OnboardingChecklist` (four required steps plus a conditional "Connect Xero" step) and a "Dismiss onboarding" button; dismissal is stored per `clerkOrgId:organisationId:userId` in `localStorage` and the panel self-hides once complete. This overlaps in purpose with S-30 and reads the same underlying `loadOnboardingState()`: worth confirming with product whether both surfaces are intended, or whether the dashboard panel should just deep-link to S-30 instead of duplicating it.
2. **Xero-connection-conditional card visibility and banner.** Each role view reads `hasActiveXeroConnection` and renders an `XeroDisconnectedBanner` when false, while conditionally hiding `SyncHealthCard`/`OrgPendingApprovalsCard` (admin), `ApprovalQueueCard` (manager), and `BalancesCard` (all roles) when Xero is not connected. The banner's `connectHref` differs by role.

**Role variations:** Each of `resolveDashboardRole()`'s five roles (owner/admin/manager/employee/viewer) renders a distinct card set, now further conditioned on Xero connection status as above. `ViewerView` (no linked person record) is no longer a bare stub: it now includes a "What you can do" card with next-step guidance and two buttons ("Organisation settings", "View people").

**Data displayed:** Per-card `{status: "error", message} | {status: "ready", data}` typing.

**States:** Loading (`loading.tsx` + `DashboardSkeleton`, `aria-busy`/`role="status"`), error (`error.tsx` branches on `PermissionDeniedError`), empty (`AdminEmptyView` or the now-richer `ViewerView`), `xero_sync_failed` cards per-card.

**Design requirements:** `DashboardCardShell` applies `rounded-xl border-0 shadow-sm` (16px card radius per the Border radius table: this is the correct 20px-card-radius-scheme token in this codebase's naming, i.e. matches spec), not `rounded-2xl` as previously claimed. `DashboardGrid` collapses to a single column below 1024px.

**`[v5 proposal]` interaction improvements:**
- ~~Give the `viewer`-role dashboard the same onboarding-style guidance admins get.~~ **Done.** `ViewerView` now has a "What you can do" list with next-action buttons.
- ~~`DashboardLiveUpdates`'s refresh prompt should announce via an `aria-live` region.~~ **Done** for the announcement half: a `sr-only` `aria-live="polite"` region now fires descriptive text alongside the toast. **Still open:** unread/count badges are not auto-updated; the user still must click "Refresh" manually.

---

### S-04: Plans

**Route:** `/plans`. No modal on the list itself (create/edit open as modals, see S-05).
**Guard:** `requirePageRole("org:viewer")`. Access: all roles.
**Evidence:** `apps/app/app/(authenticated)/plans/page.tsx:34`; `plans-client.tsx`; `_status.ts`.
**Country context:** Leave type names adapt to `country_code` via the leave-type mapping in `packages/xero`.

**Purpose:** Surface for employees to record and manage `AvailabilityRecord`s (leave and manual availability) before or after synchronous Xero write-back.

**User interactions, as-built:** Two tabs, "My records" (all roles) and "Team records" (manager+ only, hidden client-side and hard-redirected server-side for non-managers). Filters: Category, Status, From/To date, in a plain GET form. "New record" CTA links to `/plans/new`. `xero_sync_failed` rows render `XeroSyncFailedState` inline with Retry/"Revert to draft" buttons. **New, undocumented at the last pass:** a `StatusOverview` legend grid of four summary cards (Pending / Approved / Failed or declined / Draft or archived) with live counts renders above the filter form whenever there is at least one record.

**Role variations:** Employee sees own records only; manager+ additionally sees "Team records".

**Data displayed:** Per row: leave-type/record-type chip with a `SourceBadge` (leaf icon + "Leave" for Xero, pencil icon + "Availability" for manual), date range, duration, status badge plus a one-line status cue, remaining-balance text (plain table text via `renderBalance()`, not a styled chip). No "Created" column exists (a stale claim in the prior entry: the table header is Person/Plan/Dates/Duration/Status/Balance/Actions only).

**States:** Loading falls through to the shared `(authenticated)/loading.tsx`. Error: manual inline `FetchErrorState` branch. Empty: "No plans yet" (default filters) or "No matching plans" (filtered).

**Design requirements:** Draft rows: `bg-muted text-muted-foreground` badge, hover-only tint. `xero_sync_failed` rows: persistent `bg-error-container/45` tint. Declined rows also carry a persistent `bg-error-container/35` tint, not just hover. Pending (submitted) rows use `border-dashed bg-secondary/15` (sage), matching `/calendar`'s treatment: confirmed still correct.

**`[v5 proposal]` interaction improvements:**
- ~~Move the "pending" status off `accent-container`.~~ **Done, re-confirmed still correct.**
- Add a route-level `loading.tsx`/`error.tsx` for `/plans` instead of the manual inline branch. **Still open.**
- Render the remaining-balance figure as a proper chip/badge rather than plain table text. **Still open.**

---

### S-05: New / edit plan

**Route:** `/plans/new` (full page); `/plans/[planId]/edit` (full page); both also have `@modal` intercepting-route siblings that render the identical form inside `InterceptingModalShell` when navigated to from within the app.
**Guard:** No `requirePageRole` call. Implicit `org:viewer`+ via `currentUser()` and `requireActiveOrgPageContext`. Access: all roles (employees create/edit own; admin/owner/manager can select another person).
**Evidence:** `apps/app/app/(authenticated)/plans/{new,[planId]/edit}/page.tsx`; `record-form-data.ts:24-161`; `record-form.tsx`; legacy redirects `availability/new/page.tsx`, `availability/[recordId]/edit/page.tsx`.

**Purpose:** Create or edit a draft `AvailabilityRecord`, and optionally trigger the synchronous Xero submission via S-06.

**User interactions, as-built:** Intent toggle (Leave/Availability); Person select (admin/owner/manager only); leave/availability type; dates; "All day" checkbox; contactability; privacy; notes. A static current-Xero-balance line is shown when relevant; still not a live running remaining-balance counter (that estimate only appears inside the S-06 confirmation modal). Buttons: "Save draft"/"Save changes" plus "Save and submit" for Xero-connected leave; a single "Save" for local-only availability or when Xero is disconnected. Empty-people-list case shows "Add a person profile before creating leave or availability records." (previously undocumented).

**Role variations:** Admin/owner/manager can select which person the record is for; other roles create/edit only their own.

**Data displayed:** Prefilled from `?personId=`/`?startsAt=` query params on create, or the existing record on edit.

**States:** Error: `notFound()` if the record doesn't resolve or the requester lacks visibility.

**Design requirements:** Modal variant uses `InterceptingModalShell`, `rounded-2xl`. No backdrop blur (shared `DialogOverlay` primitive uses only `bg-black/50`).

**`[v5 proposal]` interaction improvements:**
- Add a genuine live "N days remaining if approved" counter to the form itself. **Still open.**
- ~~Preserve all incoming query parameters (not just `org`) on the legacy `/availability/new` and `/availability/[recordId]/edit` redirects.~~ **Done.** Both now forward every search param except `org` verbatim, so `personId`/`startsAt` deep links are preserved.

---

### S-06: Leave submission confirmation

**Component:** Modal (`SubmitConfirmationModal`), triggered from `/plans/new`/`/plans/[planId]/edit` and from `/plans`' row-level "Retry" on a `xero_sync_failed` record.
**Guard:** Inherits the caller's guard.
**Evidence:** `apps/app/components/plans/submit-confirmation-modal.tsx`; `record-form.tsx:468-490`; `plans-client.tsx:436-459`.

**Purpose:** Final confirmation before the synchronous Xero write; on failure, an inline retry/revert path.

**User interactions, as-built:** Title "Send leave to Xero?" (submit) / "Retry Xero submission?" (retry). Summary block: leave type, dates, duration, balance impact. Buttons: "Cancel" and **"Send to Xero" / "Retry submission"** (corrected: the retry-mode primary button literal is "Retry submission", not "Retry Xero sync" as previously documented). Both buttons are `disabled` while pending, genuinely preventing double-submission. On failure, the modal stays open and shows `XeroSyncFailedState` inline with "Try again" and "Revert to draft". Dismissal is suppressed while a write is in flight.

**Role variations:** None; identical for every role able to reach it.

**Data displayed:** Leave type, date range, duration, "Remaining after this request" balance figure.

**States:** Pending, success (modal closes), failure (inline retry/revert).

**Design requirements:** `rounded-2xl`. No backdrop blur (same shared `Dialog` primitive as S-05).

**`[v5 proposal]` interaction improvements:** None; the underlying flow satisfies the review criteria.

---

### S-07: Calendar

**Route:** `/calendar`. No modal behaviour; clicking a record opens a popover, clicking a blank date/slot navigates to `/plans/new`.
**Guard:** `requirePageRole("org:viewer")`. Access: all roles (scoped).
**Evidence:** `apps/app/app/(authenticated)/calendar/page.tsx`; `apps/app/components/calendar/{calendar-toolbar,calendar-event-chip,calendar-event-popover,calendar-event-provenance,calendar-day-view,calendar-week-view,calendar-month-view,calendar-timeline,calendar-create-launcher,calendar-scan-panel}.tsx`.
**Country context:** Public holidays filtered to each location's configured set.

**Purpose:** Visual calendar of availability, leave, and public holidays across individuals and teams.

**User interactions, as-built:** View select: Day/Week/Month, plus a surface toggle between the grid views and a `CalendarTimeline` "Coverage" view. Scope select: Myself/My team/All teams/specific team/specific person. Filter sheet: record category, approval status, person type, location, with a "Reset calendar filters" action. **New, undocumented at the last pass:** an `ActiveFilterSummary` chip row ("Currently showing: …") renders below the toolbar controls; and, when not on the Coverage surface, a `CalendarScanPanel` sidebar ("Today in view") renders beside the grid, listing up to 3 people/holidays with a status dot for today, a "View N more" link, and a link into day view. Clicking a record opens a popover; clicking a blank date/slot navigates to `/plans/new` with the date/person prefilled.

**Role variations:** Scope selector default differs by role.

**Data displayed:** Record chips coloured by provenance/status tone, each paired with a leaf/pencil provenance icon: confirmed correctly implemented. Public holiday rows/pills in the lavender `accent-container` tone. The new sidebar surfaces the same tone system via coloured dots.

**States:** No route-level `loading.tsx`/`error.tsx`; manual inline `FetchErrorState`. `CalendarScanPanel` renders nothing when there are no days to show, and "No one is unavailable" when the selected day has zero items.

**Design requirements:** Chips: `rounded-xl px-2 py-1 text-xs ring-1`, `dashed` treatment for submitted/pending, 65% opacity for drafts. No backdrop blur anywhere in this surface either.

**`[v5 proposal]` interaction improvements:**
- Add a persistent, thumb-reachable "Add" affordance for mobile. **Still open**, re-confirmed: no floating action button exists anywhere in the calendar surface.
- ~~Pair the calendar chip's provenance colour with the leaf/pencil icon.~~ **Done, re-confirmed still correct.**

---

### S-08: People

**Route:** `/people`. No modal on the list itself; row click opens S-09's modal.
**Guard:** `requirePageRole("org:viewer")` (list); `requirePageRole("org:admin")` on `/people/new`. Access: all roles (read); Admin/Owner ("Add person", `includeArchived` filter, Sync from Xero, Reconcile Clerk access).
**Evidence:** `apps/app/app/(authenticated)/people/page.tsx:23`; `people-client.tsx`; `people/new/page.tsx:18`; `people/_actions.ts:277-337,457-466`.

**Purpose:** Browse all people with current availability status.

**User interactions, as-built:** Debounced name/email search. Filters: Team, Location, Person type, Status, Xero link, "Xero sync failed only", "Include archived" (admin/owner only, server-forced false otherwise). "Add person" CTA (admin/owner only). **Two features new since the last pass:** a **"Sync from Xero" button** (admin/owner, only when the org has an active Xero connection) that dispatches a real manual sync and reports fetched/upserted/failed counts inline; and a **"Reconcile Clerk access" dialog** (admin/owner) that loads linkable/invitable/conflict candidates and dispatches invitations, both server-role-checked independently of the client-side hiding.

**Role variations:** Admin/owner see "Include archived", "Add person", "Sync from Xero", and "Reconcile Clerk access" (hidden, not disabled, for everyone else); every action is independently re-checked server-side.

**Data displayed:** Avatar/initials, name, job title/type, "Archived" badge, team, location, `StatusChip`, Xero column with "Linked"/"Manual" badge plus `LeafIcon`/`PencilIcon` and an `AlertTriangleIcon` sync-failed count pill.

**States:** No route-specific `loading.tsx`; `FetchErrorState`; empty states now include a conditional "Sync from Xero" action slot in the fully-empty case.

**Design requirements:** `StatusChip` now renders `rounded-sm` (12px), matching `DESIGN.md`'s chip token: this is now spec-correct; the prior claim of 20px is stale. Note: the separate `StatusChip` on S-09's profile header was not fixed the same way: see Conflicts found.

**`[v5 proposal]` interaction improvements:**
- ~~Correct the `StatusChip` radius to the 12px chip token.~~ **Done.**
- ~~Add the leaf/pencil provenance icon to the Xero badge.~~ **Done.**

---

### S-09: Person profile

**Route:** `/people/[personId]` (full page) and `/people/@modal/(.)[personId]` (intercepting modal).
**Guard:** `requirePageRole("org:viewer")` on both, with duplicated view-model-loading logic in each file.
**Evidence:** `apps/app/app/(authenticated)/people/[personId]/page.tsx`; `people/@modal/(.)[personId]/page.tsx`; `apps/app/components/people/{person-profile-content,alternative-contacts-panel}.tsx`.

**Purpose:** Full profile view for a single person: core fields, alternative contacts, leave balances, recent activity.

**User interactions, as-built:** Header, four tabs. **"Edit profile" is still a non-functional stub**: clicking it only sets inline text "Profile editing is not yet available."; no form exists. Alternative contacts support full drag-and-drop plus keyboard reordering with `aria-live="polite"` announcements, gated to admin/owner/self/manager.

**Role variations:** "Refresh balances" gated admin/owner + Xero link + active connection. Alternative-contact management gated admin/owner/self/manager. No withdraw action exists anywhere in this component; no archive-person action either.

**Data displayed:** Core fields with a `LockIcon` on Xero-owned Email/Start date only; no other visual dimming. **The header carries zero provenance signal**: no leaf/pencil icon, no colour, no text badge; only the narrower per-field `LockIcon`s. This is a genuine, confirmed gap: `/people` (S-08) now shows provenance via icon+badge, but this screen for the same person record does not.

**States: balance panel, three-state, keyed on connection health first, person-link second:**
- Xero connected and person linked → read-only table, "Last refreshed" caption.
- Xero not actively connected → table gains an Edit column. **New bug found:** this Edit column and its per-row "Edit" button render for **every viewer**, not admin/owner only: only the actual inline edit form beneath it is role-gated. A non-admin can click "Edit" and populate local state that no visible form ever renders: a dead-end control, despite an on-screen caption stating "Only admins and owners can edit manual balances."
- Xero connected but person not linked → neither renders; plain text.

**Design requirements:** Full-page wrapper and modal shell both use `rounded-2xl` (16px); core-fields and aside cards inside also use `rounded-2xl`, against `DESIGN.md`'s 20px spec for persistent card containers. This screen defines its **own separate** `StatusChip` using `rounded-xl` (20px): never fixed alongside S-08's identically-named component, so the two screens now have inconsistent `StatusChip` radii for the same concept.

**`[v5 proposal]` interaction improvements:**
- Implement or hide/relabel "Edit profile." **Still open.**
- Gate the manual-balance Edit column/button behind the same role check as the edit form, not a looser one. **New.**
- Add the same leaf/pencil provenance badge to the profile header that `/people` now has. **New.**
- Fix this screen's `StatusChip` to `rounded-sm` (12px) to match the now-corrected `/people` list version. **New.**

**Note (unchanged, open product question):** the withdraw-location contradiction between this screen, S-10, and `/plans` remains unresolved: see Decisions required.

---

### S-10: Leave approvals

**Route:** `/leave-approvals`.
**Guard:** `requirePageRole("org:manager")`, local `try/catch` → `PermissionDeniedState`.
**Evidence:** `apps/app/app/(authenticated)/leave-approvals/page.tsx`; `leave-approvals-client.tsx`; `_actions.ts`; `packages/availability/src/approvals/approval-service.ts:776-831,1519-1538`.

**Purpose:** Manager/admin queue for reviewing and actioning submitted leave.

**User interactions, as-built:** Status filter/"Include failed" checkbox, row expansion, `A`/`D` keyboard shortcuts, "Request more info". **"Sync approval state" is no longer hard-coded disabled.** It is now fully wired: the button dispatches a real `approval_state_reconciliation` job via a service function that validates admin/owner role and an active Xero connection, only showing "Reconciliation is not yet enabled" when the service itself declines (e.g. no active connection), not as a permanent state.

**Role variations:** Manager sees own team; admin/owner see all. No withdraw action exists for any role on this screen: the "Revert to pending" action visible in the UI is scoped only to `xero_sync_failed` records with a failed approve/decline write-back, not a general withdraw.

**Data displayed / States / Design requirements:** `StatusBadge` renders all statuses as the same secondary tone except `xero_sync_failed` (destructive); balance impact shown as a single post-approval figure; `XeroSyncFailedState` uses the `destructive`/`error-container` tokens, not amber.

**`[v5 proposal]` interaction improvements:**
- ~~Wire "Sync approval state" to a real dispatch or remove it.~~ **Done.**
- Failure copy doesn't name the attempted action. **Still open** (see E-05).
- Pending/Approved/Withdrawn badges are visually identical. **Still open.**
- `PermissionDeniedError` handling pattern still differs from `/people`'s. **Still open.**

---

### S-11: Public holidays

**Route:** `/public-holidays` (list) and `/public-holidays/holidays/new` (+ intercepting modal).
**Guard:** `requirePageRole("org:viewer")` on the list; no page-level guard on `holidays/new`. Every mutating action independently calls `requireRole("org:admin")`.
**Evidence:** `apps/app/app/(authenticated)/public-holidays/page.tsx:22-36,71-76`; `public-holidays-list.tsx`; `_actions.ts`.

**Purpose:** Member-facing view of public holidays, with admin mutation controls.

**User interactions, as-built:** This is the single operational holiday surface. `page.tsx` computes `canManage` server-side and passes it down; admins and owners can refresh every organisation/location jurisdiction for the selected year, add a custom holiday, suppress or restore an imported holiday, and permanently delete a manual holiday. Suppress and delete require consequence-aware confirmation. Viewers receive no action column or management chrome. The custom form supports organisation-wide scope or one active imported jurisdiction; its organisation and jurisdiction options are resolved server-side.

**Role variations:** Admin/owner see mutating controls; everyone else sees a read-only equivalent. Server-side enforcement is unchanged and independently present on every action regardless of what the client hides.

**Data displayed / States / Design requirements:** Date | Day | Name | Type | Source and, for managers, Actions; seven-value type badge map; jurisdiction shown with the source; suppressed rows have an explicit Suppressed badge in addition to dimming. Rows become labelled blocks below desktop width instead of requiring horizontal panning.

**`[v5 proposal]` interaction improvements:**
- ~~Hide suppress/restore/delete/"Add custom holiday" from non-admin viewers client-side.~~ **Done.**
- ~~Add a reachable source refresh action.~~ **Done.**
- ~~Expose safe persisted scope in "Add custom holiday."~~ **Done for organisation-wide and imported-jurisdiction scope.** Location-specific assignments remain outside the current create-action contract.

**Note:** an unreferenced dead file, `public-holidays-client.tsx` (`return null`), exists in this directory: likely leftover scaffolding.

---

### S-12: Notifications

**Route:** `/notifications`.
**Guard:** `requirePageRole("org:viewer")`.
**Evidence:** `apps/app/app/(authenticated)/notifications/page.tsx`; `notifications-client.tsx`; `apps/app/app/(authenticated)/layout.tsx:11,40`; `packages/notifications/components/provider.tsx`; `apps/app/components/notifications/bell.tsx`; `packages/database/prisma/schema.prisma:203-215`.

**Purpose:** In-app notification centre.

**User interactions, as-built:** Two custom tab buttons; feed click-to-read-and-navigate; "Mark read"/"Mark all as read"; bell popover with 3 recent unread plus "View all." Notification types (11) match the Prisma enum exactly, sourced directly so the two cannot drift.

**All three previously-flagged gaps are now resolved:**
1. **Duplicate SSE connection fixed.** The authenticated layout mounts one app-wide `NotificationsProvider`; the notifications page only consumes it via a hook, no longer mounting a second provider.
2. **Reconnecting indicator added.** Both the page and the bell popover now show "Connecting to live notifications…" or "Live notifications are unavailable. Updates may be delayed." depending on connection state. Exponential backoff (1s→2s→4s→8s→16s, capped 30s) is unchanged.
3. **Bell badge uses the design system token.** The unread badge now uses `bg-destructive text-destructive-foreground` instead of raw `bg-red-600`.

**Role variations:** None.

**Data displayed / States:** As previously documented, including last-enabled-channel-disabled logic in notification preferences.

**`[v5 proposal]` interaction improvements:** All three prior items (duplicate connection, reconnecting indicator, badge token) are resolved. None remain open for this screen.

---

## Feed screens

### S-13: Feeds

**Route:** `/feeds` (list), `/feeds/new` (full page + `@modal` intercept).
**Guard:** `requirePageRole("org:viewer")` on the list. No page-level guard on `/feeds/new`; admin/owner enforcement happens in `feeds/_actions.ts`'s `resolveAdminContext()` and again in `packages/feeds/src/feed-service.ts`'s `isAdminOrOwner`. Access: all roles (read); Admin/Owner (manage, action-layer enforced, not page-gated).
**Evidence:** `apps/app/app/(authenticated)/feeds/page.tsx:34`; `feeds/_actions.ts:277-323`; `apps/app/components/feed/{feed-table,subscribe-instructions,feed-filter-bar}.tsx`; `packages/feeds/src/feed-service.ts:191-193`; `feeds/_schemas.ts:52-64`.

**Purpose:** List all ICS feeds with subscription URLs and setup instructions.

**User interactions, as-built:** "How to subscribe" is a single accordion with six client-specific items (Outlook desktop, Outlook web, Google Calendar, Apple Calendar macOS/iOS, Generic ICS), not per-client tabs. Every visible feed shows its complete, selectable subscribe URL with a direct Copy URL action. A `FeedFilterBar` with Search (name), Status (Active+paused/Active/Paused/Archived), and Privacy (All/Named/Masked/Private) selects, round-tripping through URL search params. Rotate and Archive are genuine `AlertDialog` confirmation modals, not inline banners.

**Role variations:** `canManage` (admin/owner) unlocks Pause/Resume/Rotate/Archive and "New feed"; everyone else sees a read-only list scoped by `canViewFeed`.

**Data displayed:** Per feed: name, description, status dot (Active = `bg-success`, Paused = `bg-warning-container`, Archived = muted: confirmed correctly resolved on this screen), privacy badge, scope summary, complete subscribe URL, plus the new filter row. Calendar feed URLs must never be masked, truncated, hashed, or replaced with a token hint.

**States:** Empty: "No feeds yet"; "Create feed" CTA shown only to `canManage`.

**Design requirements:** Feed cards and filter bar use `rounded-2xl` (16px) throughout.

**`[v5 proposal]` interaction improvements:**
- Feed status tone: **resolved** through the shared `FeedStatusDot` (`bg-success`/`bg-warning-container`) used by list and detail views.
- ~~Copy-URL-with-no-token-cached message should suggest rotating.~~ **Done.**

---

### S-14: Feed detail

**Route:** `/feeds/[feedId]` (full page + `@modal` intercept, wide).
**Guard:** No page-level `requirePageRole`. Visibility is scope-based via `canViewFeed`: admin/owner always see all feeds; a viewer/manager with no linked person record sees none; a linked person sees only feeds within scope; anyone outside scope gets a generic 404, not a permission-denied message.
**Evidence:** `apps/app/app/(authenticated)/feeds/[feedId]/page.tsx`; `packages/feeds/src/scope/feed-scope.ts:271-310`; `apps/app/components/feed/{feed-detail,subscribe-url-field}.tsx`.

**Purpose:** Full feed configuration, token management, and preview.

**User interactions, as-built:** "Rotate token" and "Archive feed" are confirmed genuine `AlertDialog` modals, not inline confirmation banners. The complete active subscribe URL is always visible and copyable to authorised viewers; rotation replaces it immediately. Preview tabs: admin/owner see Named/Masked/Private; everyone else sees only their own configured mode, server-enforced. `FeedDetail` shows a "Token history" panel listing each token's masked id suffix, status badge, and created date, sourced from `getFeedDetail`'s `tokenHistory` field.

**Role variations:** `canManage` unlocks Rotate/Pause/Resume/Archive/Edit and all three preview modes; scoped viewers/managers get read-only detail plus their single privacy-mode preview.

**Data displayed:** Feed name, scope, privacy mode, complete active subscribe URL, token creation and last-used dates, public-holiday inclusion, and token history. Token status enum remains `active | expired | revoked`, no "Expiring" state.

**States:** Preview empty: "No upcoming events. Your feed will update automatically when leave or availability is added."

**Design requirements:** `rounded-2xl` modal shell, spec-correct. Lifecycle status uses the same shared semantic status component as the feed list.

**`[v5 proposal]` interaction improvements:**
- 404-vs-permission-denied for out-of-scope feeds. **Still open.**
- ~~Render token rotation history.~~ **Done.**
- ~~Convert Rotate/Archive banners to genuine confirmation modals.~~ **Done.**

---

## Analytics

### S-15: Leave reports

**Route:** `/analytics/leave-reports`.
**Guard:** `requirePageRole("org:manager")`. Access: Manager (own team), Admin, Owner.
**Evidence:** `apps/app/app/(authenticated)/analytics/leave-reports/page.tsx:42`; `leave-days-by-team-chart.tsx`; `export-csv-button.tsx`; `_actions.ts`; `apps/app/app/(authenticated)/analytics/analytics-filters.tsx`; `packages/availability/src/analytics/date-range-options.ts`.
**Country context:** Leave type labels adapt to `country_code`; public holidays excluded from leave-day calculations, hardcoded, not user-toggleable.

**Purpose:** Leave pattern analytics on approved leave records.

**User interactions, as-built:** One chart exists ("Leave days by team", bar, top 10 teams); leave-by-type, leave-by-person, peak-absence heatmap, and a leave-type donut do not exist. Four summary stat cells. "Export CSV" is functional (paginated, capped at 10,000). **A date-range preset selector now exists and works**: `AnalyticsFilters` renders a "Period" select (this month/last month/this quarter/last quarter/this year/last year/last 12 months/custom) plus From/To inputs, defaulting to `this_year` only when no valid preset is supplied. This directly contradicts the prior "no date-range UI" claim. `personType: "all"` and public-holiday exclusion remain hardcoded server-side with no filter UI. **New bug found: "Export CSV" ignores the on-screen date-range filter**: it always calls the export action with `preset: "this_year"` regardless of what's selected, and the downloaded filename is hardcoded to `leave-report-this-year.csv`. A manager who filters to "Last quarter" and exports silently gets this-year data instead.

**Role variations:** Manager sees own team's data; admin/owner see the whole organisation.

**Data displayed:** As above; chart colour is exclusively `var(--chart-1)`, no hardcoded hex.

**States:** Empty: "No approved leave records were found for this period."

**Design requirements:** Chart uses the `--chart-1..5` ramp correctly.

**`[v5 proposal]` interaction improvements:**
- Date-range preset/filters/public-holiday toggle: **partially done.** Preset selector and custom range are built; personnel-type filter and public-holiday toggle remain unbuilt.
- **New:** fix the CSV export to respect the selected date range, or make the mismatch explicit in the UI/filename.
- Clickable stat cells/chart drilldown. **Still open.**

---

### S-16: Out-of-office and travel analytics

**Route:** `/analytics/out-of-office`.
**Guard:** `requirePageRole("org:manager")`. Access: Manager (own team), Admin, Owner.
**Evidence:** `apps/app/app/(authenticated)/analytics/out-of-office/page.tsx:40`; `ooo-days-by-type-chart.tsx`; `ooo-days-monthly-chart.tsx`; `analytics-filters.tsx`.

**Purpose:** Analytics on manual availability records (WFH, travel, offsite, training).

**User interactions, as-built:** Two charts exist, both bar-family: "Out-of-office by type" (internally still named `donutChartData` but rendered as a plain bar chart) and "Monthly trends" (a stacked bar chart, internally implying an area chart in naming but not rendered as one). WFH-frequency/travel-frequency charts and a most-frequent-travellers list do not exist. Five summary stat cells. **Same date-range preset UI as S-15 now exists on this page**, resolving the "hardcoded this_year" half of the prior gap; `personType: "all"` remains hardcoded with no filter UI.

**Role variations:** Same pattern as S-15.

**Data displayed:** Monthly-trends chart cycles through the full `--chart-1..5` ramp for its series; no hardcoded hex.

**States:** Empty: "No approved out-of-office records were found for this period."

**Design requirements:** Consistent chart-ramp usage with S-15.

**`[v5 proposal]` interaction improvements:**
- Date-range/filter gap: **partially done**, same correction as S-15: presets now built; only the personnel-type filter remains unbuilt.
- Most-frequent-travellers list. **Still open.**

**Note:** the `donutChartData` variable name and "by type" card copy still imply a donut that isn't built; a bar chart renders instead.

---

## Settings

**Shared shell:** Every Settings destination is grouped under Organisation,
Publishing or Operations and preserves the exact active payroll organisation.
Desktop uses a tonal side navigation; below the desktop breakpoint a labelled
sheet exposes the same information architecture, marks the current page and
returns focus to its trigger when dismissed. Content no longer reserves a fixed
sidebar width on small screens.

### S-17: Settings > General

**Route:** `/settings/general`.
**Guard:** `requirePageRole("org:admin")` + layout gate. Access: Admin, Owner.
**Evidence:** `apps/app/app/(authenticated)/settings/general/page.tsx:20`; `general-client.tsx`; `_actions.ts`.
**Country context:** `country_code` drives the region selector; `region_code` determines the public holiday set.

**Purpose:** Core Clerk-Organisation and payroll-Organisation configuration.

**User interactions, as-built:** Account card: Account name (editable, writes through to Clerk), Account slug (disabled). Payroll entity card: Organisation name; current Country as read-only context; Region (depends on the persisted country); Primary timezone (fixed list of six IANA zones). Region changes show a consequence note. The unreachable country-change confirmation flow has been removed; New Zealand and United Kingdom payroll sync remain explicitly planned.

**Role variations:** None; admin and owner see the identical page.

**Design requirements:** No flag icons or disabled pseudo-choices; persisted country is a labelled read-only field.

**`[v5 proposal]` interaction improvements:**
- ~~Drop the unreachable confirmation-checkbox flow and make regional rollout status explicit.~~ **Done.**

---

### S-18: Settings > Leave approval

**Route:** `/settings/leave-approval`.
**Guard:** `requirePageRole("org:admin")` + layout gate. Access: Admin, Owner.
**Evidence:** `apps/app/app/(authenticated)/settings/leave-approval/page.tsx:17`; `leave-approval-settings-client.tsx`.

**Purpose:** Configure approval display behaviour and manager visibility scope.

**User interactions, as-built:** All controls auto-save immediately: "Show pending leave on calendar", "Show declined records by default", "Notify managers on status change" (switches); "Manager visibility scope"; "Leave request advance days"; "Require decline reason"; "Default privacy mode"; "Restore defaults". Every switch/radio/input has a visible associated label and description, and its own live Saving, Saved or recovery receipt. No synchronous-Xero-writes info callout exists on this page. `defaultFeedPrivacyMode`/`feedsIncludePublicHolidaysDefault` are reset here by "Restore defaults" but have no corresponding control on this page: they live on `/settings/feeds` (S-21) instead.

**`[v5 proposal]` interaction improvements:**
- Add a synchronous-Xero-writes info callout to this page. **Still open.**
- Move or cross-link the feed-defaults controls that "Restore defaults" resets but this page doesn't expose. **Still open.**

---

### S-19: Settings > Integrations

**Route:** `/settings/integrations`.
**Guard:** `requirePageRole("org:admin")` + layout gate. Access: Admin, Owner.
**Evidence:** `apps/app/app/(authenticated)/settings/integrations/page.tsx:14`; `integrations-client.tsx`.

**Purpose:** Clerk-Organisation-level rollup of Xero connection health across every payroll Organisation.

**User interactions, as-built:** A single "Xero Payroll" card with a rolled-up status badge, a 4-stat grid, a per-organisation status list, and "Manage Xero" linking to S-20. A rollup dashboard, not a per-integration card grid; no "Coming soon" placeholders.

**`[v5 proposal]` interaction improvements:** None surfaced.

---

### S-20: Settings > Xero detail

**Route:** `/settings/integrations/xero`.
**Guard:** `requirePageRole("org:admin")` + layout gate. Access: Admin, Owner.
**Evidence:** `apps/app/app/(authenticated)/settings/integrations/xero/page.tsx:14`; `xero-client.tsx`; `_actions.ts:104-160,162-218`.
**Country context:** Payroll region shown per tenant, text-only, not colour-coded.

**Purpose:** Xero OAuth management and per-tenant sync configuration, one card per payroll Organisation.

**User interactions, as-built:** Per-org card: connection and paused-state badges, plain-language error banner, payroll region text and a four-stat sync-timestamp grid. The oldest or never-run sync is promoted as the one recommended action. Other manual sync types live under a native disclosure. Token refresh, audited pause/resume and both disconnect modes live under a separate Connection controls disclosure. Disconnect opens `ConfirmActionDialog`, previews soft versus destructive consequences, requires the exact organisation name and prevents duplicate submission while pending.

**Design requirements:** Routine health and one recommended sync remain primary; manual and high-risk connection controls use progressive disclosure. Destructive purge keeps explicit destructive emphasis inside its confirmation flow.

**`[v5 proposal]` interaction improvements:**
- ~~Wire "Pause sync"/"Resume sync" into the UI using the audited server actions.~~ **Done.**
- ~~Move disconnect into `ConfirmActionDialog` with explicit consequence copy.~~ **Done.**

---

### S-21: Settings > Feeds

**Route:** `/settings/feeds`.
**Guard:** `requirePageRole("org:admin")` + layout gate. Access: Admin, Owner.
**Evidence:** `apps/app/app/(authenticated)/settings/feeds/page.tsx:18-24`; `feeds-client.tsx`.

**Purpose:** Organisation-wide defaults for new feeds, plus a browse/launch list into `/feeds`. Does not itself create or configure individual feeds, contrary to its own in-code comment.

**User interactions, as-built:** "Default privacy mode for new feeds" and "Include public holidays in new feeds" are auto-saved with visible labels, descriptions and setting-scoped live receipts. The page also provides an "All feeds" read-only list with "Open" links and a "Create new feed" button linking to `/feeds/new`.

**`[v5 proposal]` interaction improvements:**
- The page's own in-code comment still claims it "creates and configures feeds", contradicting the shipped header copy. **Still open**, unresolved documentation-vs-code mismatch in the source itself.

---

### S-22: Settings > Billing

**Route:** `/settings/billing`.
**Guard:** `requirePageRole("org:admin")` + layout gate; `requireRole("org:owner")` is separately computed but has no effect on rendering. Access: Admin and Owner see an identical page.
**Evidence:** `apps/app/app/(authenticated)/settings/billing/page.tsx:28,36-37`; `billing-client.tsx:21-44`; `packages/availability/src/settings/billing-service.ts:55-124`.

**Purpose:** View plan, status, and usage.

**User interactions, as-built:** Read-only plan card and usage card (progress bars per metric). **The status badge and usage bars no longer use raw Tailwind amber**: `statusClassName` returns `bg-primary`/`bg-destructive`/`bg-warning-container text-on-warning-container` depending on status, and `usageBarColour` returns `bg-warning` at ≥80% and `bg-destructive` at ≥100%, all named design tokens. Whether "Manage billing"/"Upgrade to Premium" render at all is gated solely by a global early-access flag, not by role.

**Role variations:** None: the computed owner/admin distinction has no visible effect anywhere on this page. `getBillingSummary` unconditionally sets both upgrade and contact flows to `true` regardless of role, in direct contrast to the dashboard widget's own `getBillingSummaryForDashboard`, which does vary by role.

**States:** Over-limit banner when applicable.

**`[v5 proposal]` interaction improvements:**
- Either implement the owner-only restriction the design previously called for, or formally retire that decision; the current state is dead server-side plumbing (`isOwner`/`actingRole` computed then unused) that suggests a restriction the page does not enforce. **Still open**: see Decisions required.

---

### S-23: Settings > Holidays

**Route:** `/settings/holidays`.
**Guard:** `requirePageRole("org:admin")` + layout gate. Access: Admin, Owner.
**Evidence:** `apps/app/app/(authenticated)/settings/holidays/page.tsx:16-22`; `holidays-client.tsx`.
**Country context:** Matches S-11.

**Purpose:** Compact admin summary of public-holiday coverage and one launch into the operational S-11 surface.

**User interactions, as-built:** One imported/custom count summary, an upcoming-holidays card and one "Manage public holidays" launch. Its code comment and visible copy both identify S-11 as the operational home.

**`[v5 proposal]` interaction improvements:**
- ~~Choose one operational home and make this page a truthful summary-and-launch surface.~~ **Done.**

---

### S-24: Settings > Audit log

**Route:** `/settings/audit-log`.
**Guard:** `requirePageRole("org:admin")` + layout gate. Access: Admin, Owner.
**Evidence:** `apps/app/app/(authenticated)/settings/audit-log/page.tsx:22,43,51`; `audit-log-client.tsx:133-186`.

**Purpose:** Review audit events.

**User interactions, as-built:** GET-form filters (From/To date, Action prefix, Entity ID). Each event row is a native disclosure; expanding shows a `JSON.stringify` metadata block, and: only for the first 10 events on the page: a two-column raw-JSON before/after block (not a field-level diff, no highlighting of what changed). "Export CSV" is functional. **Pagination is functional, not dead:** a cursor-based "Load more" link reads and writes the `cursor` query param, and the server honours it: the prior claim that `nextCursor` was computed but never consumed by the client is now incorrect.

**Design requirements:** No actor-type badges exist (actor display is plain inline text). No dedicated monospace treatment for entity IDs outside the raw JSON blocks.

**`[v5 proposal]` interaction improvements:**
- ~~Wire the "Load more" control the `nextCursor` prop already supports.~~ **Resolved**: confirmed present and functional.
- Add actor-type badges (User/System/Sync) and render a real field-level diff. **Still open.**

---

## Sync screens

### S-25: Sync health

**Route:** `/sync`.
**Guard:** `requirePageRole("org:admin")`. Access: Admin, Owner.
**Evidence:** `apps/app/app/(authenticated)/sync/page.tsx:33`; `sync-client.tsx:40-53,248-259,288-428,617-656`; `packages/availability/src/sync/sync-events.ts:36-41`.

**Purpose:** Monitor inbound Xero sync run health across all tenants in the current Clerk Organisation.

**User interactions, as-built:** Per-tenant summary cards: name, payroll-region badge, connection status dot, a four-cell "last synced" grid. **All four manual dispatch buttons are now wired**: `people`, `leave_records`, `leave_balances`, and `approval_state_reconciliation` are all registered handlers; this is a fix since the last pass (previously only two of four were registered). Buttons are disabled only when a sync of that type is currently running or the connection is inactive. Run history table's Records column **now colour-differentiates**: failed counts render with `font-medium text-destructive` when greater than zero. Failure-surfacing logic is more nuanced than previously documented: a current-failure card, a distinct partial-success banner, and a plain historical-failures paragraph are three separate, mutually-adjusted states driven by current failed runs, pending failed records, and current partial-success runs in combination. The CTA in both failure states reads "Review affected runs", not "N pending failures" as previously documented.

**Design requirements:** `ConnectionDot` is still a static element with no pulse animation. Three other `animate-pulse` usages remain, unrelated to the connection dot (header avatar skeleton, a "Running" text pill, and the running-status badge shared with S-26).

**`[v5 proposal]` interaction improvements:**
- ~~Wire "Sync people" and "Sync leave records" manual dispatch.~~ **Done.**
- ~~Colour the Records column's failed count when greater than zero.~~ **Done.**

---

### S-26: Sync run detail

**Route:** `/sync/[runId]`.
**Guard:** `requirePageRole("org:admin")`. Access: Admin, Owner.
**Evidence:** `apps/app/app/(authenticated)/sync/[runId]/page.tsx:35`; `sync-run-detail-client.tsx:223,286-351`.

**Purpose:** Full detail and failed records for one sync run.

**User interactions, as-built:** Four stat cells (fetched/upserted/skipped/failed). **The "Records failed" cell now colour-differentiates** when greater than zero. Failed records list: collapsible, monospace `sourceRemoteId`, `recordType`/`errorCode` badges, expandable full message and raw-payload block. **"Re-run this sync" is now enabled for every run type**, not just reconciliation runs: the gate is connection-status/already-running only. **Two previously undocumented controls found:** a "Cancel running sync" button, shown only while the run is in progress; and a "View timeline" toggle that expands an audit-trail event list. "Export as CSV" unchanged, shown only when failed records exist.

**Design requirements:** Monospace applied to `sourceRemoteId` but not to the raw-payload block or error-message text.

**`[v5 proposal]` interaction improvements:**
- ~~Enable "Re-run sync" for every run type.~~ **Done.**
- ~~Colour-differentiate the "Records failed" stat cell.~~ **Done.**

---

## Settings: newly catalogued screens

### S-27: Settings > Members

**Route:** `/settings/members`.
**Guard:** No page-level `requirePageRole`; relies entirely on `settings/layout.tsx`'s admin/owner gate (raw `orgRole` string check, redirects to `/` rather than rendering `PermissionDeniedState`). Access: Admin, Owner.
**Evidence:** `apps/app/app/(authenticated)/settings/{layout.tsx:11-22,members/page.tsx:11-58,members/members-client.tsx}`; `apps/app/app/actions/settings/{invite-member,remove-member,update-member-role}.ts`.

**Purpose:** Manage Clerk Organisation membership (invite, role change, remove) via the Clerk Backend SDK, distinct from `/people` (S-08).

**User interactions, as-built:** Custom-built UI, not Clerk's hosted components. Invite: email + role select (Owner option only if the acting user is owner) → server independently re-checks owner assignment. Members table: role cell is read-only for self or for another owner unless the acting user is also owner, else an editable select. Remove: `ConfirmActionDialog` (destructive). Pending invitations list has no revoke/resend action: no such server action exists anywhere in the settings actions directory.

**`[v5 proposal]` interaction improvements:**
- Add revoke/resend for pending invitations. **Still open.**

---

### S-28: Settings > Xero connect

**Route:** `/settings/integrations/xero/connect`.
**Guard:** `requirePageRole("org:admin")` + layout gate. Access: Admin, Owner.
**Evidence:** `apps/app/app/(authenticated)/settings/integrations/xero/connect/page.tsx:21`; `connect-client.tsx`; `_actions.ts:1-176`.

**Purpose:** OAuth callback and tenant/organisation attachment step, reached via a session parameter after `apps/api`'s OAuth start endpoint.

**User interactions, as-built:** "Select a Xero tenant" list. "Attach to an existing payroll organisation" or "Create the first payroll organisation" when none exist. "Complete connection" writes a distinct audit event depending on whether this is a fresh connect or a reconnect of an existing `XeroConnection` (previously undocumented), and fires a best-effort initial inline sync for people/leave records/leave balances, wrapped so a sync error never fails the connection. **New finding:** immediately after, the action also dispatches the same three run types through the manual-sync queue: since all three are now registered handlers (see S-25), the initial sync effectively runs twice, once inline and once queued. Idempotent per the jobs rules, so not incorrect, but redundant work worth a follow-up decision on whether to drop one path.

---

### S-29: Settings > Xero person matches

**Route:** `/settings/integrations/xero/matches`.
**Guard:** `requirePageRole("org:admin")` + layout gate. Access: Admin, Owner.
**Evidence:** `apps/app/app/(authenticated)/settings/integrations/xero/matches/page.tsx:21`; `matches-client.tsx`; `_actions.ts:1-299`.

**Purpose:** Explicit-review reconciliation between Xero-synced and manually-created `Person` candidates. Possible matches are never merged automatically.

**User interactions, as-built:** Per pending match card: Xero person's name/email, stored candidate person (or an explicit "no candidate stored" message), a Clerk-user-ID input, and two actions: "Link to Clerk user" and "Keep separate". The input uses an empty controlled value with the candidate's existing linked ID shown only as a placeholder; both the client click handler and the server independently fall back to the candidate's existing ID if the field is left untouched, so the documented "defaults to the existing link" behaviour holds even though the mechanism is placeholder+fallback rather than a literal pre-filled value. Server-side, linking verifies Clerk org membership and rejects a user already linked to a different person. Every resolution writes an audit event.

---

### S-30: Settings > Getting started

**Route:** `/settings/getting-started` (+ `/setup` redirect).
**Guard:** `requirePageRole("org:admin")` + layout gate. Access: Admin, Owner.
**Evidence:** `apps/app/app/(authenticated)/settings/getting-started/page.tsx:21`; `apps/app/components/onboarding/onboarding-checklist.tsx:76-98`; `apps/app/lib/server/load-onboarding-state.ts:34-223`.

**Purpose:** Derived-state onboarding checklist, shared with the dashboard widget (see S-03's new panel, which duplicates this surface's purpose).

**User interactions, as-built:** No manual "mark complete"; every step's status is derived live from database counts. Steps: Review organisation profile; Connect Xero (shown only while no connection exists, not counted toward the required-steps ratio); Add or sync people; Review public holidays; Review calendar feed. Status badges: Done/Next/Later/Optional.

---

## Legacy redirect shims

| Route | Redirects to | Evidence |
|---|---|---|
| `/availability` | `/plans` (every query param except `org` forwarded verbatim) | `apps/app/app/(authenticated)/availability/page.tsx:11-24` |
| `/availability/new` | `/plans/new` (every query param except `org` forwarded verbatim) | `availability/new/page.tsx:11-24` |
| `/availability/[recordId]/edit` | `/plans/{recordId}/edit` (every query param except `org` forwarded verbatim) | `availability/[recordId]/edit/page.tsx:14-29` |
| `/leave-balances` | `/people/{personId}` if `?personId=` present, else `/people` (other params forwarded) | `leave-balances/page.tsx:11-28` |
| `/settings` | `/settings/general` (every query param except `org` forwarded verbatim) | `settings/page.tsx:9-22` |
| `/setup` | `/settings/getting-started` (S-30) (every query param except `org` forwarded verbatim) | `setup/page.tsx:9-22` |

**Corrected:** all six now preserve every incoming query parameter, not just `org`: `org` is destructured out, the remaining params are rebuilt into the query string, and `org` is re-applied on top via `withOrg()` (`apps/app/lib/navigation/org-url.ts:5-17`). This resolves a previously-open proposal; the earlier claim that non-`org` params were silently dropped is now stale.

**Also confirmed still correctly absent (no catalogue entry needed):** `/search` (global search is the Cmd/Ctrl+K command palette, not a route); `/settings/danger` (no file exists anywhere in the repo); `/support` (API-only: `apps/api` has `POST /api/support/github-issue`, no `apps/app` page calls it); `/webhooks` (API-only: inbound Clerk/Stripe receivers under `apps/api/app/webhooks/{auth,payments}`, not a settings screen).

---

## Error and empty state components

### E-01: Empty state

**Component:** `apps/app/components/states/empty-state.tsx:16-28`. `title?`/`description`/`actionSlot?` shape wrapping `Empty`/`EmptyHeader`/`EmptyTitle`/`EmptyDescription`/`EmptyContent`.

### E-02: Data fetch error

**Component:** `apps/app/components/states/fetch-error-state.tsx:16-31`. Default title `"Unable to load {entityName}"`; default description: "Try again. If the issue continues, check the Xero connection and contact support with this page name." Optional `retrySlot`.

### E-03: 404

**Component:** `apps/app/app/(authenticated)/not-found.tsx:11-30`. Title "Page not found", CTA "Go to Dashboard" → `/`. Confirmed only one `not-found.tsx` exists anywhere in `apps/app`, and it lives under `(authenticated)`: no global (unauthenticated) 404 exists.

### E-04: Permission denied

**Component:** `apps/app/components/states/permission-denied-state.tsx:18-35`. Default title "Permission Denied", description "You do not have permission to view this page.", CTA "Go to Dashboard" → `/`. Triggered by `PermissionDeniedError` from `requirePageRole()`, caught either by the shared `apps/app/app/(authenticated)/error.tsx` boundary (most screens) or by a local `try/catch` inside the page itself (`/leave-approvals`, `/sync`, `/sync/[runId]`, `/analytics/*`, `/settings/billing`, and the dashboard's own route file `page.tsx:6,51`: corrected attribution; not `dashboard-body.tsx` as previously stated). This inconsistent mechanism is still present across 9 files; see Conflicts found.

### E-05: Xero sync failed (inline)

**Component:** `apps/app/components/states/xero-sync-failed-state.tsx:6-63`. **The component now accepts an optional `failedAction` prop** and, when supplied, composes it into both the badge text ("{Action} to Xero failed") and the body message: the fix a prior proposal asked for. **However, no call site passes it.** Checked all current usages: `plans-client.tsx`, `leave-approvals-client.tsx` (whose data model *does* carry a per-record `failedAction` from the server but never threads it into the component), `person-profile-content.tsx`, `sync-client.tsx`, plus three confirmation/decline modals. None supply `failedAction`, so the badge still renders the generic literal "Xero sync failed" in production. The remaining work is pure wiring at the four record-level call sites; `person-profile-content.tsx` and `sync-client.tsx` aggregate multiple records/runs and may need a product decision on what "action" to show for an aggregate rather than a simple wiring fix. `/calendar` is **not** a usage site for this component (corrected: no reference to it exists anywhere under the calendar directory).

`XeroWriteError` now has **nine** variants, not five: `auth_error`, `conflict_error`, `network_error`, `not_found_error`, `permission_error`, `rate_limit_error`, `region_not_supported_error`, `unknown_error`, `validation_error` (`packages/xero/src/write/types.ts:3-12`). `permission_error` has its own plain-language copy in `toPlainLanguageMessage()`. This has been corrected across `CLAUDE.md`, `AGENTS.md`, `GEMINI.md`, and `PRODUCT.md` as part of this pass.

Styling (`bg-error-container text-destructive ring-destructive/30`) and the destructive badge/`AlertTriangleIcon` combination are unchanged.

---

## Proposed new screens

No new full screens are proposed. Every functional gap surfaced in this and the prior pass (missing filters, disabled buttons since fixed, unwired server actions, unrendered token history since fixed) is an improvement to an *existing* screen, not a case for a screen that does not exist today. The one candidate considered and rejected: a dedicated `/support` page: `apps/api` exposes a working endpoint with no `apps/app` caller, but its intended audience and placement cannot be determined from code or governing files alone. Recorded in Decisions required.

---

## Resolved decisions

| # | Decision | Detail | Screens | Status |
|---|---|---|---|---|
| 1 | **Leave balance editability** | Balances are read-only and locked when Xero is connected; admin-managed manual balances editable only when Xero is not connected. | S-09 | **Refined.** The manual editor keys off org-wide connection health, independent of this specific person's link status; a third state exists where neither panel renders. **New bug found in this pass:** the Edit control itself is shown to every viewer, not just admins: see Conflicts found. |
| 2 | **Standard disconnect retains all history** | Only the destructive disconnect option clears data. | S-20 | **Confirmed in code**, unchanged. |
| 3 | **Withdraw is in phase-one scope** | Employees can withdraw own leave; admins can withdraw any, via synchronous Xero write. | S-09, S-10, E-05 | **Still contradicted.** Withdraw exists only on `/plans` (row-level), not S-09 or S-10, re-confirmed this pass. See Decisions required. |
| 4 | **S-02 is Clerk-hosted** | No custom organisation-selection route with business logic. | S-02 | **Confirmed, refined.** The route exists (required by Clerk's session-tasks flow) but has zero custom logic: no `AuthFormFrame`, no `appearance` prop, nothing beyond the bare Clerk primitive. |
| 5 | **S-14 route is `/feeds/[feedId]`** | The singular `/feed/[feedId]` variant is retired. | S-14 | **Confirmed**, unchanged. |
| 6 | **S-02's `embeddedAuthAppearance` question** | Whether the Clerk appearance API applies to `TaskChooseOrganization`. | S-02 | **Resolved this pass: no.** Confirmed by direct code inspection: no `appearance` prop is passed. |
| 7 | **Legacy redirect query-param preservation** | Whether non-`org` params should be forwarded. | Legacy redirects, S-05 | **Resolved this pass: yes, implemented.** All six shims now forward every param. |
| 8 | **Feed status colour tokens** | Whether `/feeds` should stop reusing provenance tokens for lifecycle status. | S-13, S-14 | **Resolved.** Both views use the shared semantic `FeedStatusDot`. |
| 9 | **Sync manual dispatch wiring** | Whether all four sync job types should be dispatchable from the UI. | S-25, S-26 | **Resolved this pass: yes.** All four registered and wired; re-run enabled for every run type. |
| 10 | **`/notifications` SSE and reconnection UX** | Duplicate connection, missing reconnect indicator, raw-colour badge. | S-12 | **Resolved this pass**, all three items. |

---

## Conflicts found

Numbered independently of the change table above for cross-reference clarity.

1. **`StatusChip` radius is inconsistent across screens.** `/people` (S-08) is now correctly `rounded-sm` (12px); `/people/[personId]` (S-09) defines its own separate `StatusChip` still at `rounded-xl` (20px). **Recommended rule:** consolidate into one shared `StatusChip` component so this class of bug cannot recur per-screen.

2. **Frost and backdrop blur remain almost entirely unimplemented.** `DESIGN.md` mandates frost fill plus blur on every elevated transient surface, with opaque fallbacks and `prefers-reduced-transparency` handling. Confirmed still only the sticky header uses `backdrop-blur`, and even that instance lacks full reduced-transparency handling. `Dialog`, `Popover`, `Sheet`, `DropdownMenu`, `Command`, and the toast primitive were not re-confirmed this pass but nothing surfaced to contradict the prior "zero blur elsewhere" finding. **Recommended rule:** close the gap in `packages/design-system`'s shared primitives; this is a code change outside a documentation pass's scope.

3. ~~**`/feeds/[feedId]`'s lifecycle status reused provenance tokens.**~~ **Resolved:** list and detail views now share `FeedStatusDot`, so lifecycle colours cannot drift between the two surfaces.

4. **Withdraw location.** The carried-forward "Resolved decision" #3 places withdraw on S-09 and S-10; code implements it only on `/plans`, re-confirmed this pass. **Recommended rule:** update the decision to reflect `/plans` as the sole withdraw surface, or treat this as a real product gap. See Decisions required.

5. **`PermissionDeniedError` handling is inconsistent across screens.** Some pages bubble to the shared `error.tsx` boundary; others (`/leave-approvals`, `/sync`, `/sync/[runId]`, `/analytics/*`, `/settings/billing`, the dashboard) catch it locally and render `PermissionDeniedState` inline. Both produce the same visible output today, but it's a maintenance inconsistency. **Recommended rule:** standardise on the ancestor boundary everywhere `requirePageRole` can throw.

6. **`/people/[personId]`'s manual-balance Edit control is shown to every viewer**, not just admins/owners, even though the actual edit form beneath it is correctly role-gated: a dead-end control for non-admins that contradicts the on-screen caption stating only admins/owners can edit. **Recommended rule:** gate the Edit column/button with the same `canEditManual` check as the form, not the looser `showManualEditor` check.

7. **`/people/[personId]`'s profile header has zero provenance signal**, while `/people`'s list view now correctly pairs colour with a leaf/pencil icon for the same underlying concept (Xero-linked vs. manual person record). **Recommended rule:** add the same provenance badge to the profile header for consistency; this is a WCAG 2.2 AA gap, not merely cosmetic.

8. **`/analytics/leave-reports`'s CSV export ignores the on-screen date-range filter**, always exporting `this_year`. **Recommended rule:** either make the export respect the current filter state, or make the mismatch explicit in the UI/filename so it isn't silently misleading.

9. **The design-tokens documentation itself contained two factual errors**, now corrected: no `secondary-container` token exists in the codebase, and `#5E4F99` (previously attributed to `accent`) actually belongs to the unrelated `editorial-accent` token. **Recommended rule:** when documenting design tokens, cite the actual CSS custom property name, not an inferred pairing.

10. **The dashboard's new onboarding checklist may duplicate S-30.** Both read the same `loadOnboardingState()` derived state and serve the same purpose. **Recommended rule:** confirm with product whether both surfaces are intentional, or whether the dashboard panel should link out to S-30 instead of rendering its own copy.

---

## Decisions required

1. **Should withdraw be built on S-09/S-10, or should the carried-forward decision be retired in favour of `/plans` as the sole withdraw surface?** Re-confirmed unresolved this pass; changes user-visible outcomes (whether a manager can withdraw an employee's leave from the approvals queue at all).

2. **Is a user-facing `/support` screen in scope?** `apps/api` has a working endpoint with no `apps/app` caller. If in scope, its intended audience and placement need a product decision before a screen entry can be written.

3. **Should the dashboard's new onboarding checklist and S-30 both exist, or should one defer to the other?** New question raised by this pass; both currently render independently from the same derived state.

4. **What should `E-05` show for an aggregate failure (e.g. `sync-client.tsx`'s tenant-level card, or `person-profile-content.tsx`'s multi-record view) now that the component supports a single `failedAction`?** The per-record call sites (`/plans`, `/leave-approvals`) are a straightforward wiring fix; the aggregate ones are not.

5. **Should `/settings/billing`'s owner-only restriction be implemented to match the dashboard widget's actual behaviour, or should the unused `isOwner`/`actingRole` computation be deleted?** Dead server-side plumbing computes a distinction the page's rendering ignores entirely.

6. **Should the redundant duplicate initial sync on Xero connect (`/settings/integrations/xero/connect`) be simplified to just the inline call or just the queued dispatch, now that both paths work?** Not incorrect (idempotent), but wasteful.

---

## Version footer

**Reconciled:** 30 August 2026, against `apps/app` as of that date.
**Supersedes:** `ScreenCatalogue-v5.md` (16 August 2026) and, before that, `ScreenCatalogue-v4.1.md` (May 2026), in full.
**Scope of this pass:** every catalogued screen (S-01 through S-31, E-01 through E-05, all redirect shims) was independently re-verified against current code. A substantial amount of app functionality changed in the thirteen days since the last full pass: several features did not exist yet (Sync from Xero, Reconcile Clerk access, dashboard onboarding panel, calendar "Today in view" sidebar, feed filter bar, analytics date-range filters) and several previously-flagged gaps were fixed in code (all four sync dispatch types, audit-log pagination, notifications SSE/reconnection, public-holidays role hiding, billing's amber-to-token migration). Two new bugs were found in the process (CSV export ignoring the analytics date filter; the manual-balance Edit control visible to non-admins). Next review should re-run this reconciliation after the frost/blur, withdraw-location, and E-05 aggregate-failure decisions (see Conflicts found and Decisions required) are resolved in code or product direction.
