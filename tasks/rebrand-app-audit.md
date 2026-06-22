# Rebrand phase 2 audit: apps/app

Rename of the authenticated product UI from "LeaveSync" to the canonical
display brand **Team Calendar** (slug `teamcalendar`, primary domain
`https://teamcalendar.online`).

Scope: `apps/app` only, plus in-scope branding packages. Phase 1
(`apps/web`) was handled separately and is not re-touched here.

## Branding source of truth

`packages/seo/branding.ts` already exists (created in phase 1) and exports
`brandNameDisplay`, `brandNameSlug`, and `primaryDomain`. `apps/app` already
depends on `@repo/seo` and imports `@repo/seo/metadata`, so
`@repo/seo/branding` resolves cleanly with no new bundling boundary. No
duplication of the constants was needed.

Convention followed (matching phase 1 in `apps/web`): the structural
wordmark and any URL constant import from `@repo/seo/branding`; incidental
prose and page-title strings inline the literal `Team Calendar`, the same
way `apps/web` inlines it in body copy while the metadata helper uses the
constant.

## In-scope changes applied

### Wordmarks (import `brandNameDisplay`)

| File | Line | Before | After | Status |
|---|---|---|---|---|
| `apps/app/app/(authenticated)/components/sidebar.tsx` | 153 | `LeaveSync` wordmark text | `{brandNameDisplay}` | Resolved |
| `apps/app/app/(unauthenticated)/layout.tsx` | 15, 26 | `LeaveSync` wordmark + footer | `{brandNameDisplay}` | Resolved |

### Icon assets (aria-label)

| File | Before | After | Status |
|---|---|---|---|
| `apps/app/app/icon.svg` | `aria-label="LeaveSync"` | `aria-label="Team Calendar"` | Resolved |
| `apps/app/app/apple-icon.svg` | `aria-label="LeaveSync"` | `aria-label="Team Calendar"` | Resolved |

Note: the mark artwork (coloured rounded bars) is unchanged. A final
redesigned Team Calendar logo asset is still pending and should replace
both the SVG icons and the inline sidebar SVG when delivered.

### URLs (import `primaryDomain`)

| File | Line | Before | After | Status |
|---|---|---|---|---|
| `apps/app/app/(authenticated)/feeds/layout.tsx` | 22 | `"https://leavesync.app"` fallback origin | `primaryDomain` | Resolved |
| `apps/app/components/feed/feed-detail.tsx` | 202 | `"https://leavesync.app/ical/...ics"` masked placeholder | `` `${primaryDomain}/ical/...ics` `` | Resolved |

### Page titles and metadata descriptions (inline literal)

All `metadata.title` / `description` strings of the form `... LeaveSync`
replaced with `... Team Calendar`:

| File | Field | Status |
|---|---|---|
| `app/(authenticated)/page.tsx` | title | Resolved |
| `app/(authenticated)/people/page.tsx` | title | Resolved |
| `app/(authenticated)/people/[personId]/page.tsx` | title | Resolved |
| `app/(authenticated)/people/new/page.tsx` | title | Resolved |
| `app/(authenticated)/analytics/leave-reports/page.tsx` | title | Resolved |
| `app/(authenticated)/calendar/page.tsx` | title | Resolved |
| `app/(authenticated)/feeds/page.tsx` | title | Resolved |
| `app/(authenticated)/sync/page.tsx` | title | Resolved |
| `app/(authenticated)/sync/[runId]/page.tsx` | title | Resolved |
| `app/(authenticated)/leave-approvals/page.tsx` | title | Resolved |
| `app/(authenticated)/notifications/page.tsx` | title | Resolved |
| `app/(authenticated)/plans/page.tsx` | title | Resolved |
| `app/(authenticated)/public-holidays/page.tsx` | title | Resolved |
| `app/(authenticated)/settings/general/page.tsx` | title | Resolved |
| `app/(authenticated)/settings/members/page.tsx` | title | Resolved |
| `app/(authenticated)/settings/getting-started/page.tsx` | title | Resolved |
| `app/(authenticated)/settings/holidays/page.tsx` | title | Resolved |
| `app/(authenticated)/settings/leave-approval/page.tsx` | title | Resolved |
| `app/(authenticated)/settings/billing/page.tsx` | title | Resolved |
| `app/(authenticated)/settings/feeds/page.tsx` | title | Resolved |
| `app/(authenticated)/settings/audit-log/page.tsx` | title | Resolved |
| `app/(authenticated)/settings/integrations/page.tsx` | title + description | Resolved |
| `app/(authenticated)/settings/integrations/xero/page.tsx` | title | Resolved |
| `app/(authenticated)/settings/integrations/xero/connect/page.tsx` | title + description | Resolved |
| `app/(authenticated)/settings/integrations/xero/matches/page.tsx` | title | Resolved |

### In-app copy (inline literal)

| File | Line | Context | Status |
|---|---|---|---|
| `lib/server/load-onboarding-state.ts` | 137 | Xero setup task description | Resolved |
| `lib/server/README.md` | 4, 42, 65, 67 | developer doc brand references | Resolved |
| `app/(authenticated)/availability/manual-availability-form.tsx` | 278 | note placeholder | Resolved |
| `app/(authenticated)/plans/record-form.tsx` | 360 | note placeholder | Resolved |
| `app/(authenticated)/setup/onboarding-client.tsx` | 51 | onboarding intro | Resolved |
| `app/(authenticated)/settings/integrations/xero/connect/connect-client.tsx` | 72, 128 | connect copy | Resolved |
| `app/(authenticated)/settings/integrations/xero/matches/matches-client.tsx` | 39 | matches empty state | Resolved |
| `app/(authenticated)/settings/billing/billing-client.tsx` | 22 | billing description | Resolved |
| `components/people/person-profile-content.tsx` | 122 | sync warning copy | Resolved |
| `components/dashboard/xero-disconnected-banner.tsx` | 17 | disconnected banner | Resolved |
| `components/onboarding/onboarding-checklist.tsx` | 33 | checklist copy | Resolved |
| `app/(unauthenticated)/sign-up/[[...sign-up]]/page.tsx` | 7 | metadata description | Resolved |
| `app/(unauthenticated)/session-tasks/choose-organization/page.tsx` | 7 | metadata description | Resolved |

## Tenancy identifiers, confirmed untouched

Verified by diffing every commit in this pass. None of the following were
changed; the rename is UI vocabulary only.

- `clerk_org_id`, `organisation_id` (and the `clerkOrgId` / `organisationId`
  camelCase variables) appear throughout `apps/app` and are unchanged.
- No branded ID type in `packages/core` was touched.
- No Prisma column, schema enum, or Xero-side identifier was touched.

The `git diff` for this branch contains zero `+`/`-` content lines for any
tenancy identifier token.

## Flagged: not changed (identifiers or out of scope)

These are `leavesync`-bearing strings that are **not** brand display text.
They were deliberately left untouched.

| File | Line | String | Reason |
|---|---|---|---|
| `app/(authenticated)/plans/_schemas.ts` | 39 | `"leavesync_leave"` in `planSourceTypes` | Source-type enum value (data identifier). Renaming would break record provenance semantics and any persisted/synced data. Out of scope for a UI rebrand. |
| `components/calendar/calendar-day-view.test.tsx` | 95 | `sourceType: "leavesync_leave"` | Test fixture for the above enum value. Untouched with the enum. |
| `components/calendar/calendar-event-popover.test.tsx` | 66 | `sourceType: "leavesync_leave"` | As above. |
| `components/calendar/calendar-week-view.test.tsx` | 77 | `sourceType: "leavesync_leave"` | As above. |
| `components/calendar/calendar-month-view.test.tsx` | 112 | `sourceType: "leavesync_leave"` | As above. |
| `components/calendar/calendar-event-chip.test.tsx` | 70 | `sourceType: "leavesync_leave"` | As above. |
| `app/(authenticated)/plans/page.test.tsx` | 77 | `sourceType: "leavesync_leave"` | As above. |
| `components/onboarding/dismissible-onboarding-panel.tsx` | 25 | `leavesync:onboarding-dismissed:...` localStorage key | Storage-key namespace (identifier), not display text. Changing it would silently reset every user's dismissed-panel state. Treat as a deliberate migration if ever changed, not a rebrand edit. |
| `app/(authenticated)/settings/integrations/xero/connect/_actions.ts` | 120 | `new URL(path, "https://leavesync.local")` | Dummy base URL used only to parse a relative path server-side; never displayed or emitted. Not a brand reference. |
| `app/(authenticated)/settings/integrations/xero/xero-client.tsx` | 164 | `label="Leave sync"` | Generic feature label ("leave sync" = syncing leave), not the brand name. |
| `lib/navigation/org-url.test.ts` | 26, 27 | `"https://leavesync.app"` | Arbitrary base URL input in a unit test for `withOrg`; generic test fixture, not displayed. |
| `lib/public-api-url.test.ts` | 10, 12, 14 | `"https://api.leavesync.test"` | Stubbed env value in a unit test; generic test fixture. |
| `app/(authenticated)/setup/_actions.test.ts` | 49, 55 | `name: "LeaveSync Test"` | Arbitrary organisation name used as test data; not display copy. |
| `__tests__/auth-components.test.tsx` | 45 | `"Start a new LeaveSync organisation, ..."` | Asserts copy that lives in `@repo/auth/components/sign-up` (the `signUpCopy` export). The source string is in `packages/auth`, which is **out of scope** for this pass. Changing the assertion without changing the source would fail the test. See out-of-scope section. |

## Out of scope, flagged for separate initiative

The following still reference the old brand but were not touched because
they fall outside the apps/app branding scope. They need their own pass:

- **`packages/auth`** sign-up / sign-in / choose-organisation copy
  (`signUpCopy` and related). This is the source of the `LeaveSync`
  reference asserted in `apps/app/__tests__/auth-components.test.tsx:45`.
  When `packages/auth` copy is rebranded, update that test assertion in the
  same change.
- **`apps/email`** and **`packages/email`**: transactional email templates
  and subjects.
- **`packages/notifications`**: any in-app notification copy assembled
  server-side (notification titles/bodies) rather than rendered by
  `apps/app` components.
- **`apps/api`**, **`apps/docs`**: not in this scope.
- **`packages/feeds`** ICS UID derivation and any Xero-side identifiers:
  explicitly excluded; must never change for a rebrand.
- **Final logo asset**: the icon SVGs and the inline sidebar mark still use
  the original artwork. A redesigned Team Calendar logo is still needed.

## Verification

- Re-ran the `leavesync` / `LeaveSync` search across `apps/app` and the
  in-scope packages. Zero remaining brand-display hits; every remaining hit
  is in the flagged identifier/out-of-scope table above.
- Confirmed zero changes to `clerk_org_id`, `organisation_id`, or any
  branded ID type across all commits in this pass.
- `bun run typecheck` (apps/app): 0 errors.
- `bunx biome check apps/app`: 259 files, no errors.
- `bun run test` (apps/app): 42 files, 114 tests passed.
