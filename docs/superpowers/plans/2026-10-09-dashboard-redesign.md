# Dashboard Redesign Implementation Plan

> **For agentic workers (Codex):** Execute this plan task by task, in order. Steps use checkbox syntax for tracking. Each task starts with a failing test, then the smallest change that makes it pass. Do not start a task until the previous task's tests pass and its commit exists. This document authorises no execution in the planning turn.

**Goal:** Rebuild the authenticated dashboard so every role leads with the homepage team timeline, managers get a per-team coverage map, and rare exception states (Xero failures, sync health, connection banner) and admin reference cards leave the dashboard.

**Architecture:** A presentational `TeamTimeline` in `packages/design-system`, fed by neutral week data built in `packages/availability` from the existing `getCalendarRange`. A coverage builder in the same package reads a new nullable `teams.minimum_available_people`. The dashboard service returns fewer, reshaped sections; the app composes them with small server components and one client component for timeline selection.

**Tech stack:** Existing Bun, Next.js App Router, React 19, Tailwind CSS v4, Prisma 7, Zod, Vitest, `lucide-react`. No new dependencies.

**Spec:** [Dashboard redesign design](../specs/2026-10-09-dashboard-redesign-design.md). Read it, `AGENTS.md`, `DESIGN.md` and `.impeccable.md` before starting. Visual reference: the "Dashboard Design Review" canvas (Manager, Employee, Admin, Mobile, Timeline and Coverage boards). Where the canvas and the spec differ, the spec wins (employee timeline is self-only; admin approval rows have no approver column).

**Inspected base:** `381293a` on `claude/upbeat-ramanujan-fs2ax0`.

## Global constraints

- Every service function that touches tenant data accepts and applies both `clerkOrgId` and `organisationId`. Database access only through `@repo/database`.
- Do not change the calendar service's privacy or permission rules. Employees use `scope: { type: "my_self" }`; managers `my_team`; admins and owners `all_teams`.
- Leave balances stay Xero-sourced. No outbound Xero calls are added or moved.
- Named exports only, no default exports (except Next.js route files, which already use them), no `any`, no unjustified `as`, no barrel files except package roots.
- Australian English, no em dashes, 24-hour times, `9 October 2026` dates.
- Design tokens only (`bg-secondary`, `text-on-accent-container`, `bg-warning-container`, `bg-surface-container-low` and so on). Radii: 20px cards, 16px floating, 14px controls, 12px chips. No 4px or 8px radii, except the legend swatch's 4px marker geometry, which the homepage already uses.
- Server Components by default. `"use client"` only for timeline selection and the coverage settings form.
- Remove dead code you orphan in the same task. Do not leave unused exports, CSS utilities or test fixtures.

## Execution conventions

Commands run from the repo root.

```bash
bunx vitest run <path/to/file.test.ts>          # one test file
bun run check && bun run typecheck && bun run test && bun run test:integration   # CI gates (Task 10)
bun run migrate                                  # Prisma format, generate, migrate dev (Task 1 only)
```

Run `bun run build` (or the database package's generate step) after the schema change and before tests that import generated Prisma types; do not run it in parallel with tests. Commit each task with the suggested conventional message, staging only that task's files.

## File map

| File | Status | Responsibility |
| --- | --- | --- |
| `packages/database/prisma/schema.prisma` | modify | `Team.minimum_available_people Int?` |
| `packages/database/prisma/migrations/<generated>_team_coverage_minimum/` | generated | One migration; never hand-edit |
| `packages/availability/src/coverage/team-coverage-minimums.ts` | new | Read and update team minimums, audit event |
| `packages/availability/src/dashboard/timeline-week.ts` | new | Neutral week model from `CalendarRange` |
| `packages/availability/src/dashboard/coverage-map.ts` | new | Coverage cells and summary |
| `packages/availability/src/dashboard/dashboard-service.ts` | modify | New sections, removed sections, `weekAnchor` |
| `packages/design-system/components/team-timeline/team-timeline.tsx` | new | Presentational timeline (client: selection) |
| `packages/design-system/components/team-timeline/types.ts` | new | Neutral props |
| `apps/app/components/availability/record-type-labels.ts` | new | Record-type labels and icon keys |
| `apps/app/components/dashboard/timeline-adapter.ts` | new | Week model to `TeamTimeline` props |
| `apps/app/components/dashboard/coverage-map.tsx` | new | Coverage card |
| `apps/app/components/dashboard/approval-rows.tsx` | new | Waiting for approval list |
| `apps/app/components/dashboard/my-requests.tsx` | new | Employee request list |
| `apps/app/components/dashboard/needs-reply.tsx` | new | Info-request replies (replaces `ActionItemsCard`) |
| `apps/app/components/dashboard/dashboard-header.tsx` | rewrite | Date, title, scope, actions |
| `apps/app/components/dashboard/{employee,manager,admin}-view.tsx` | rewrite | Role composition |
| `apps/app/app/(authenticated)/page.tsx`, `dashboard-body.tsx` | modify | `week` param, header data |
| `apps/app/app/(authenticated)/settings/coverage/{page.tsx,_actions.ts,coverage-settings-client.tsx}` | new | Minimum staffing settings |

## Shared interfaces

```typescript
// packages/availability/src/dashboard/timeline-week.ts
export interface TimelineWeekDay {
  date: Date;              // start of day in the range timezone
  dateKey: string;         // "2026-10-09"
  holidayName: string | null; // only when the holiday applies to all locations in view and is not suppressed
  isToday: boolean;
}
export interface TimelineWeekEntry {
  dayCount: number;        // days visible inside this week (1 to 7)
  endIndex: number;        // 0 to 6, inclusive
  id: string;              // CalendarEvent.id
  isPrivate: boolean;      // recordType "private" or privacy-masked
  note: string | null;     // only what the calendar service already exposes
  provenance: "manual" | "xero";
  recordType: string;      // CalendarRecordType
  startIndex: number;      // 0 to 6
  startsAt: Date;
  endsAt: Date;
}
export interface TimelineWeekRow {
  entries: TimelineWeekEntry[];
  firstName: string;
  isSelf: boolean;
  jobTitle: string | null;
  lastName: string;
  locationName: string | null;
  personId: string;
  teamName: string | null;
}
export interface TimelineWeek {
  days: TimelineWeekDay[];             // always 7, Monday first
  isCurrentWeek: boolean;
  nextWeekStart: string;               // dateKey
  previousWeekStart: string;           // dateKey
  rows: TimelineWeekRow[];
  timezone: string;
  totalPeopleInScope: number;
  weekStart: string;                   // dateKey
}
export function buildTimelineWeek(input: {
  actingPersonId: string;
  onlyPeopleWithEntries: boolean;
  range: CalendarRangeData;            // week view
  rowLimit: number;
  today: Date;
}): TimelineWeek;

// packages/availability/src/dashboard/coverage-map.ts
export const PEAK_AWAY_THRESHOLD_PERCENT = 20; // existing rule from buildUpcomingPeaksCard
export type CoverageCellState = "at_minimum" | "covered" | "holiday" | "peak" | "short";
export interface CoverageCell {
  awayCount: number;
  dateKey: string;
  inCount: number;
  shortBy: number;                     // 0 unless state is "short"
  state: CoverageCellState;
}
export interface CoverageRow {
  cells: CoverageCell[];               // five working days
  minimum: number | null;
  teamId: string | null;               // null for "No team"
  teamName: string;
  teamSize: number;
}
export interface CoverageMap {
  days: Array<{ date: Date; dateKey: string; isToday: boolean }>;
  firstIssue: { dateKey: string; state: "peak" | "short"; teamName: string; inCount: number; minimum: number | null; teamSize: number } | null;
  rows: CoverageRow[];
}
export function buildCoverageMap(input: {
  minimumsByTeamId: ReadonlyMap<string, number | null>;
  ranges: readonly CalendarRangeData[]; // week views covering the next five working days
  today: Date;
}): CoverageMap;
```

The design-system props mirror `TimelineWeek` but carry display strings only (labels, date labels, icon keys, tone). The design-system package must not import `@repo/availability`.

```typescript
// packages/design-system/components/team-timeline/types.ts
export type TeamTimelineTone = "manual" | "private" | "xero";
export type TeamTimelineIcon = "client" | "home" | "other" | "private" | "training" | "travel" | "xero";
export interface TeamTimelineBlock {
  ariaLabel: string; dateLabel: string; dayCount: number; durationLabel: string;
  endIndex: number; icon: TeamTimelineIcon; id: string; label: string;
  note: string | null; provenanceLabel: string; startIndex: number; tone: TeamTimelineTone;
}
export interface TeamTimelineRowProps {
  blocks: TeamTimelineBlock[]; initials: string; isSelf: boolean;
  name: string; personId: string; secondary: string | null;
}
export interface TeamTimelineProps {
  cornerLabel: string;
  days: Array<{ dateLabel: string; dow: string; holidayName: string | null; isToday: boolean; key: string }>;
  footer: string | null;
  isCurrentWeek: boolean;
  navigation: { nextHref: string; previousHref: string; todayHref: string };
  renderLink?: (props: { "aria-label"?: string; children: React.ReactNode; className: string; href: string }) => React.ReactNode; // apps pass next/link
  rows: TeamTimelineRowProps[];
  weekLabel: string;   // "Mon 5 to Sun 11 Oct"
  weekSub: string;     // "This week · 2026"
}
```

## Review focus

1. Tenancy: the coverage minimum read and write filter by both tenancy keys; a team ID from another organisation is rejected (Task 2).
2. Privacy: private and masked records render as "Unavailable" with no type, note or provenance detail beyond what the calendar service already returns (Tasks 4, 6).
3. Week edges: records starting before Monday or ending after Sunday clamp correctly; DST and timezone use `range.timezone`, never server local time (Task 4).
4. Coverage maths: a person with two away records on one day counts once; working from home counts as in; a team minimum above team size reads as short every day without crashing (Task 5).
5. Removals leave no orphaned imports, CSS utilities (`ambient-calendar-*`) or tests (Task 8).

---

### Task 1: Team minimum staffing column

**Files:** `packages/database/prisma/schema.prisma`, generated migration, `packages/database/src/**` query helper (follow the existing per-entity query file pattern, scoped by both tenancy keys).

- [ ] Write a failing test for a database query helper `listTeamsWithCoverageMinimum({ clerkOrgId, organisationId })` returning `{ id, name, minimumAvailablePeople, activePeopleCount }[]`, and `setTeamCoverageMinimum({ clerkOrgId, organisationId, teamId, minimum })` returning `Result`. Include an isolation case: a team from another `clerk_org_id` is not listed and cannot be updated (`not_found`).
- [ ] Add `minimum_available_people Int?` to `model Team` (after `name`). Run `bun run migrate` with migration name `team_coverage_minimum`. Do not edit the generated SQL.
- [ ] Implement the helpers. `activePeopleCount` counts `archived_at: null, is_active: true` people in the team.
- [ ] Run the new test and `bunx vitest run packages/database`. Commit `feat(database): add team coverage minimum`.

### Task 2: Coverage minimum service and audit

**Files:** `packages/availability/src/coverage/team-coverage-minimums.ts` and test; export from the package root.

- [ ] Failing tests: `updateTeamCoverageMinimum({ actingRole, actingUserId, clerkOrgId, organisationId, teamId, minimum })`:
  - rejects roles other than `owner` and `admin` with `not_authorised`;
  - rejects a minimum below 0, above the team's active people count, or non-integer with `validation_error` ("Minimum must be between 0 and 7 people.");
  - accepts `null` to clear;
  - writes one `auditEvent` with action `teams.coverage_minimum_updated`, entity type `team`, payload `{ before, after }`, in the same transaction as the update (copy the pattern in `settings/organisation-settings-service.ts:79`);
  - returns `{ teamName, minimum }` for the receipt.
- [ ] Implement with Zod input parsing. Commit `feat(availability): manage team coverage minimums`.

### Task 3: Coverage settings page

**Files:** `apps/app/app/(authenticated)/settings/coverage/page.tsx`, `_actions.ts`, `coverage-settings-client.tsx`, tests; add a "Coverage" entry to the settings navigation in `settings/layout.tsx` (or its nav component) for owners and admins only.

- [ ] Failing tests (follow `settings/leave-approval/_actions.test.ts` and `leave-approval-settings-client.test.tsx`): the action resolves admin context exactly like `resolveAdminContext` in `leave-approval/_actions.ts`; the client renders one row per team (name, team size, number input labelled "Minimum people in"), saves one team at a time, keeps the entered value on failure, and announces the receipt politely (`Customer support minimum set to 2 people.` or `Customer support minimum cleared.`).
- [ ] Page copy: title "Coverage", description "Set how many people each team needs available on a working day. Managers see shortfalls on their dashboard." Empty state: "No teams yet. Teams come from your people records." with a link to People.
- [ ] Use existing design-system `Input`, `Button`, `Label`; 14px control radius; errors with the alert icon.
- [ ] Commit `feat(app): coverage minimum settings`.

### Task 4: Timeline week model

**Files:** `packages/availability/src/dashboard/timeline-week.ts` and test with fixtures built by a small `buildCalendarRangeFixture()` factory in the test file.

- [ ] Failing tests:
  - seven Monday-first days from a week range; `isToday` from `today` in `range.timezone`;
  - holiday name only when `appliesToAllLocationsInView && !isSuppressed`;
  - a record from the previous Thursday to this Tuesday yields `startIndex 0, endIndex 1, dayCount 2`; a record crossing Sunday clamps `endIndex 6`;
  - `provenance` is `xero` when `recordTypeCategory === "xero_leave"`, else `manual`;
  - private or privacy-masked events set `isPrivate: true` and `note: null`;
  - multi-day events appearing on several `days[].events` are deduplicated by `id`;
  - rows: self first when present, then people sorted by first entry start then name; `onlyPeopleWithEntries` drops empty rows; `rowLimit` caps rows while `totalPeopleInScope` stays the full count;
  - `previousWeekStart`, `nextWeekStart`, `isCurrentWeek`.
- [ ] Implement as pure functions. Commit `feat(availability): timeline week model`.

### Task 5: Coverage map model

**Files:** `packages/availability/src/dashboard/coverage-map.ts` and test.

- [ ] Move the `isAwayEvent` and `dedupeEventsByPerson` helpers from `dashboard-service.ts` into this module (export them for the service) and replace the literal `20` in `buildUpcomingPeaksCard` with `PEAK_AWAY_THRESHOLD_PERCENT` if that builder survives Task 7 (it does not; delete it there).
- [ ] Failing tests:
  - the next five working days from `today` skip Saturday and Sunday and may span two week ranges;
  - rows group `range.people` by team (`teamName`, team ID from the person; add `teamId` to `CalendarPerson` in `calendar-service.ts` if absent, populated from `team_id`, with a calendar-service test), "No team" last;
  - `inCount = teamSize - away`, away counted once per person per day using `isAwayEvent`; `wfh` counts as in;
  - with a minimum: `short` when `inCount < minimum` (`shortBy` set), `at_minimum` when equal, `covered` when above;
  - without a minimum: `peak` when away share is above 20%, else `covered`;
  - `holiday` when the day has an all-locations, unsuppressed public holiday;
  - `firstIssue` is the earliest `short` or `peak` cell, ties broken by team name.
- [ ] Commit `feat(availability): coverage map model`.

### Task 6: Shared TeamTimeline component

**Files:** `packages/design-system/components/team-timeline/{team-timeline.tsx,types.ts,team-timeline.test.tsx}`.

Port the homepage timeline's markup and behaviour from `apps/web/app/components/demo-team-calendar.tsx` and its `.tl-*` rules in `apps/web/app/styles/home.css` into Tailwind classes on design tokens. Keep the measurements: 24px card padding on `surface-container-low`, 16px radii, 220px person column (200px below 1024px), `repeat(7, minmax(7rem, 1fr))` days, `min-w-[62rem]` grid, 64px rows, 40px blocks (44px below 768px), 12px block radius, 44px nav and Today buttons, 76px detail strip. Do not modify the marketing files.

- [ ] Failing tests (Testing Library, as used in `apps/app` component tests):
  - renders week label, sub-label, legend ("Leave from Xero", "Manual: home, client site, training", "Public holiday"), corner label and seven day heads with a `Today` pill on today and the holiday chip text;
  - today and holiday tints render only when present;
  - a block spans `startIndex + 1 / span dayCount` grid columns, shows its label from two days and its day count from three days, and has the given `aria-label`;
  - xero, manual and private tones use `bg-secondary`, `bg-accent-container` and `bg-surface-container-high`; each block renders its icon (`RefreshCwIcon` for xero, `HouseIcon`, `BriefcaseIcon`, `GraduationCapIcon`, `PlaneIcon`, `CircleIcon`, `EyeOffIcon` for private);
  - clicking a block sets `aria-expanded="true"` and shows the detail strip (title `Name · Label`, meta joined with " · ", provenance chip with icon); Close returns focus to the block; empty strip text "Select any entry above to see its details, owner and provenance.";
  - ArrowRight, ArrowLeft, ArrowDown and ArrowUp move focus between blocks as in the homepage `Block` handler;
  - `renderLink` is used for previous, next and Today; the Today control has the sage current style when `isCurrentWeek`;
  - the "Swipe to see the full week" hint has `md:hidden` and `aria-hidden`.
- [ ] `"use client"` at the top (selection state only). Focus ring: `outline-3 outline-ring outline-offset-2`. Respect `motion-reduce` for the block press transform.
- [ ] Commit `feat(design-system): shared team timeline`.

### Task 7: Dashboard service sections

**Files:** `packages/availability/src/dashboard/dashboard-service.ts`, `dashboard-service.test.ts`, `dashboard-cache.ts` if keys change.

- [ ] Failing tests first, then implement:
  - `ViewSchema` gains optional `weekAnchor: z.coerce.date().optional()`; default today.
  - `EmployeeDashboardView` gains `timeline: DashboardSection<TimelineWeek>` and `myRequests: DashboardSection<{ records: Array<{ approvalStatus; dayCount: number | null; endsAt; recordId; recordType; sourceType; startsAt; canWithdraw: boolean; canEdit: boolean }> }>` (submitted, approved or declined, `endsAt >= today`, soonest first, five max). Employee timeline: `getCalendarRange` with `scope: { type: "my_self" }`, `view: "week"`, `anchorDate: weekAnchor`, approved only, `rowLimit 1`.
  - Manager: timeline with `scope: { type: "my_team" }`, `rowLimit 12`; `coverage: DashboardSection<CoverageMap>` from week ranges anchored on today and today plus seven days (two calls in the same `Promise.all`), with minimums from Task 1's helper; `approvalQueue` reshaped to `{ count: number; rows: ApprovalRow[] }` where `ApprovalRow = { recordId; personFirstName; personLastName; recordType; sourceType; startsAt; endsAt; durationWorkingDays; submittedAt }`, five rows, oldest submitted first.
  - Admin and owner: timeline with `scope: { type: "all_teams" }`, `onlyPeopleWithEntries: true`, `rowLimit 10`; `approvalQueue` in the same shape, organisation-wide (replaces `orgWidePendingApprovals`).
  - `header` keeps only fields the app still uses; the app formats the date line, so add no date fields to the service.
  - Remove `syncHealth`, `orgWideXeroSyncFailed`, `teamXeroSyncFailed`, `activeFeeds`, `usageVsLimits`, `recentAuditEvents`, `upcomingPeaks`, `teamThisWeek`, `teamToday`, `todayStatus`, `upcoming`, `quickActions`, `orgWidePendingApprovals`, `actionItems.xeroSyncFailedRecords`, `actionItems.declinedRecords`, and their loaders and builders (`loadSyncHealthCard`, `loadTeamTodayPeople`, `buildTeamTodayCard`, `teamTodaySortWeight`, `buildTeamThisWeekCard`, `buildUpcomingPeaksCard`, `buildTeamXeroSyncFailedCard`, `buildOrgPendingApprovalsCard`, `buildOrgWideXeroSyncFailedCard`, `loadUpcomingCard`, the month-range call) when nothing else imports them. Remove now-unused imports (feeds and billing summaries, audit allowlist).
  - Approvals list status filter becomes `["submitted"]` only.
  - Each section fails independently (`errorSection`) as today.
- [ ] Commit `refactor(availability): reshape dashboard sections`.

### Task 8: App components and removals

**Files:** new `record-type-labels.ts`, `timeline-adapter.ts`, `coverage-map.tsx`, `approval-rows.tsx`, `my-requests.tsx`, `needs-reply.tsx` with co-located tests; rewrite `dashboard-header.tsx`; delete removed components and their tests.

- [ ] `record-type-labels.ts`: `recordTypeLabel(type)` and `recordTypeIcon(type)` for every `availability_record_type` value plus `private` ("Unavailable"). Icons: leave types and `public_holiday` to `xero` when provenance is Xero else `other`; `wfh` home; `client_site`, `another_office`, `offsite_meeting` client; `training` training; `travel`, `travelling` travel; others other. Test every enum value has a label (iterate the generated enum).
- [ ] `timeline-adapter.ts`: `toTeamTimelineProps(week, { role, orgQueryValue })` producing labels: week label `Mon 5 to Sun 11 Oct` (`Mon 28 Sep to Sun 4 Oct` across months), sub-label `This week · 2026`, `Last week`, `Next week` or `Week of 19 Oct`; entry date labels as in the homepage `Detail`; duration `1 day` or `N days`; provenance `Synced from Xero` or `Manual entry`; private entries labelled "Unavailable" with provenance `Private`; secondary line job title (manager, employee) or `team, location` (admin); corner label `Me`, `My team` or `All teams`; footer `Showing 12 of 31 people.` or `Showing 10 of 48 people away this week.` or null; hrefs `?week=<dateKey>` merged with `withOrg`. Tests cover each label rule.
- [ ] `coverage-map.tsx` (server component): card per spec and the canvas Coverage board, five day columns, one row per team, cells as links, key, footnote, summary line. Tests: states map to classes and text, accessible labels, no colour-only state.
- [ ] `approval-rows.tsx`, `my-requests.tsx`, `needs-reply.tsx`: per spec; status chips with icons via `approvalStatusLabel`; provenance chips with `RefreshCwIcon` or `PencilIcon` and a 1px ring of their text colour at 30%; empty states per spec. Tests for each.
- [ ] `dashboard-header.tsx`: props `{ dateLabel, locationLabel, scopeLine, primaryAction, secondaryAction? }`; renders date line, `Dashboard` h1, scope line, actions as `Button asChild` links. Test.
- [ ] Delete: `xero-disconnected-banner.tsx`, `sync-health-card.tsx` (+ test), `org-xero-sync-failed-card.tsx`, `team-xero-sync-failed-card.tsx`, `org-pending-approvals-card.tsx`, `approval-queue-card.tsx`, `active-feeds-card.tsx`, `usage-vs-limits-card.tsx`, `recent-audit-events-card.tsx`, `quick-actions-card.tsx`, `today-status-card.tsx`, `upcoming-records-card.tsx`, `action-items-card.tsx`, `ambient-calendar-field.tsx` (+ test), `ambient-calendar-data.ts` (+ test), `team-today-card.tsx`, `team-this-week-card.tsx`, `coverage-timeline.tsx`, `coverage-timeline-data.ts` (+ test), `upcoming-peaks-card.tsx`, `metric-tile.tsx`, `dashboard-layout.tsx`, `dashboard-scaffold.tsx` if no longer used, and the `ambient-calendar-*` CSS utilities wherever they are defined (search the app and design-system styles).
- [ ] `rg "replaceAll\(\"_\", \" \"\)" apps/app/components/dashboard` returns nothing.
- [ ] Commit `feat(app): dashboard timeline, coverage and approval components`.

### Task 9: Page composition

**Files:** `apps/app/app/(authenticated)/page.tsx`, `dashboard-body.tsx`, `{employee,manager,admin}-view.tsx`, `dashboard-skeleton.tsx`, `dashboard-grid.tsx`.

- [ ] Failing tests for each view (render with a factory-built view object): section order per the spec table; header primary action label (`Review 4 requests`, or `Request leave` when the count is 0); no Xero banner for any `xeroConnectionState`; timeline heading "Who is in this week" with "Open calendar" linking to `/calendar?scopeType=<my_self|my_team|all_teams>&view=week`; manager rail starts with the coverage map.
- [ ] `page.tsx`: parse `searchParams.week` with Zod (`z.string().regex(/^\d{4}-\d{2}-\d{2}$/)`); invalid values are ignored. Pass `weekAnchor` through `DashboardBody` to the view getters.
- [ ] Header data: date line formatted in the person's timezone (`header.timezone ?? "Australia/Brisbane"`) as `Friday 9 October 2026`, location from `header.locationName`; scope line: employee `Your leave and availability`, manager `header.scopeLabel`, admin `${organisationName} · ${totalActivePeopleCount} people`.
- [ ] Skeleton: header band, a timeline-shaped block (toolbar row plus six 64px rows) and the 2:1 grid, with `role="status"` and visually hidden "Loading dashboard".
- [ ] Keep `DismissibleOnboardingPanel` for owners and admins (onboarding, not an exception state) and `DashboardLiveUpdates`.
- [ ] Commit `feat(app): compose role dashboards around the team timeline`.

### Task 10: Verification

- [ ] `bun run fix`, then `bun run check`, `bun run typecheck`, `bun run test`, `bun run test:integration`. All must pass; record any failure verbatim and fix it.
- [ ] Run the app (`bun run dev`) with seeded data and check, in light and dark themes: 1440px, 1024px and 390px widths; keyboard only (Tab to the timeline, arrow between blocks, open and close detail, navigate weeks); 200% zoom (only the timeline card scrolls sideways); `prefers-reduced-motion`.
- [ ] Six-second scan check per role: the date, who is away today, pending approvals and coverage shortfalls are visible without scrolling at 1440 by 900.
- [ ] Compare against the canvas boards; any intentional difference must come from the spec.
- [ ] Add a review section to `tasks/todo.md` with evidence and any gaps marked NOT VERIFIED. Commit `docs: record dashboard redesign verification`.

## Follow-ups (not in this plan)

- Move the marketing homepage onto the shared `TeamTimeline` and retire its `.tl-*` CSS.
- Show coverage impact in approval rows ("Leaves Operations short on 14 Oct").
- Teammate visibility on the employee timeline (product and privacy decision).
