# Dashboard Redesign Design

**Status:** Approved for planning, 9 October 2026. Second pass against the code after the bundled public holidays change, 9 October 2026.
**Visual reference:** Design canvas "Dashboard Design Review" (claude.ai artifact `VR5vykfCwyy1tHznfyT7f3`), boards Manager, Employee, Admin, Mobile, Timeline and Coverage.
**Implementation plan:** [Dashboard redesign plan](../plans/2026-10-09-dashboard-redesign.md).

## Problem

The authenticated dashboard (`apps/app/app/(authenticated)/page.tsx`) fails the six-second scan test for managers. It leads with the user's own name, never states today's date, has no team view of who is in, and spends space on rare exception states (Xero sync failures, sync health, connection banners) and admin reference data. Record types and statuses render as raw enum strings.

## Product rules (decided)

1. **Dashboards hold frequently checked, up-to-the-minute information only.** Xero sync failures, sync health metrics, the Xero connection banner, feeds, usage against plan limits and audit events are removed from every dashboard. Failures surface in the action receipt, notifications and the Sync page. Connection state lives in onboarding and Settings.
2. **The marketing homepage team timeline is the reference pattern** (`apps/web/app/components/demo-team-calendar.tsx`, `.tl-*` rules in `apps/web/app/styles/home.css`). Every role dashboard leads with it.
3. **Managers get a coverage map** with per-team minimum staffing. Minimums are set per team by owners and admins.
4. **Employees see only their own availability** (PRODUCT.md, Users: "self-service visibility into their own leave"). Their timeline has one row. The canvas Employee board showing teammates is superseded by this rule.

## Page structure (all roles)

1. Header band on `surface-container-low`: today's date and location (`Friday 9 October 2026 · Brisbane, Queensland`), the `Dashboard` title, one scope line, one primary action and at most one secondary action.
2. "Who is in this week" heading with an "Open calendar" link, then the shared timeline.
3. A 2:1 lead and rail split (existing `DashboardGrid`).

| Role | Primary action | Lead | Rail |
| --- | --- | --- | --- |
| Employee | Request leave (`/plans/new`) | Needs your reply, My requests | Leave balances, Next public holiday |
| Manager | Review N requests (falls back to Request leave when N is 0) | Needs your reply, Waiting for your approval | Coverage map, My leave balances, Next public holiday |
| Admin, Owner | Review N requests (falls back to Request leave) | Needs your reply, Waiting for approval (organisation-wide) | My leave balances, Next public holiday |
| Viewer | None | Existing viewer empty state | None |

- **Needs your reply** lists `actionItems.infoRequestedNotifications` only; it is hidden when empty.
- **My requests** lists the viewer's own records with status `submitted`, `approved` or `declined` that end today or later, soonest first, five at most: type, dates, duration, status chip, and one action (Withdraw for submitted, Edit for approved manual records, View for the rest). It replaces `upcoming`, `todayStatus` and the declined rows of `actionItems`.
- **Waiting for approval** rows: person, type, dates, working days, provenance chip, waiting age and a Review link. Count in the title, five rows, then "View all".
- Sections hide when empty, except the timeline (always shown) and the approval list (shows "No requests are waiting" with a link to the approvals page).

## Shared team timeline

A presentational component in `packages/design-system/components/team-timeline/`, visually identical to the homepage timeline:

- Toolbar: previous and next week links, a Today link (sage fill when the current week is shown), week label (`Mon 5 to Sun 11 Oct`) and sub-label (`This week · 2026`), and a legend.
- Grid: 220px person column and seven day columns at `minmax(7rem, 1fr)`, minimum width 62rem, inside a card that scrolls sideways on narrow screens with the "Swipe to see the full week" hint below 768px.
- Day header: weekday, date, a `Today` pill on today and a warning-style holiday chip naming a full-day public holiday (part-day holidays, which carry a start time, are not marked; they are working days). Today's column is tinted `primary` at 5% (8% in the header); holiday columns are tinted `warning-container`.
- Rows: avatar initials, name, secondary line (job title, or team and location for admins), a `You` pill on the viewer's own row, alternating row tones.
- Blocks: `secondary` fill for Xero-synced records, `accent-container` for manual records, neutral `surface-container-high` with the label "Unavailable" for private records. Each block carries a 14px icon: `RefreshCw` for Xero records (the design system replaces the homepage leaf), `House` for working from home, `Briefcase` for client site and another office, `GraduationCap` for training, `Plane` for travel, `Circle` for other. Labels show from two days, day counts from three days.
- Detail strip: selecting a block shows person, type, dates, duration, secondary line, note (`notesInternal`, only when the calendar service returns it) and a provenance chip with its icon: `Synced from Xero` when the record's `sourceType` is `xero` or `xero_leave`, `Leave request` for `team_calendar_leave`, otherwise `Manual entry`. Close returns focus to the block.
- Keyboard: blocks are buttons with arrow-key movement as on the homepage; navigation and close targets are 44px.

Days and the Today pill use the calendar's `range.timezone` (the organisation timezone). The header date uses the person's timezone; the two can differ only for people in another timezone near midnight.

Week navigation uses a `week` search parameter (`?week=2026-10-12`, any date in the target week) so the dashboard stays server-rendered. Only selection state is client-side.

Rows by role: employee, self only; manager, self first then everyone in `my_team` scope (cap 12, then "Showing 12 of N"); admin, `all_teams` scope limited to people with at least one record that week (cap 10, then "Showing 10 of N people away this week").

Records shown: approved only (current dashboard filter), privacy applied by the calendar service. Overlapping records for one person stack in the track.

## Coverage map (manager)

- Rows: one per team that has at least one person in the manager's scope; people in scope without a team form a "No team" row.
- Team size is the team's full active headcount (the same count used to validate minimums), not only the people the manager can see. Away counts come from a counts-only read of approved records for every active member of those teams; no names or record details from outside the manager's scope are returned.
- Columns: the next five working days from today (Monday to Friday, skipping weekends).
- Cell value: people in, of team size (`5 of 7`). "In" excludes people with an approved record for which the existing `isAwayEvent` rule is true (`packages/availability/src/dashboard/dashboard-service.ts`), deduplicated by person. `isAwayEvent` treats working from home and private records as in.
- States:
  - **Short:** fewer in than the team minimum. `warning-container` fill, alert-triangle icon, label "Short by N".
  - **At minimum:** exactly the minimum. `chart-4` fill, label "At minimum".
  - **Covered:** above the minimum. Neutral `surface-container` fill.
  - **No minimum set:** teams with a null minimum use the existing peak rule (more than 20% away). Peak days use the Short styling with the label "Peak"; other days are neutral.
  - **Public holiday:** `surface-container-high` with "Holiday" when a full-day, non-working public holiday applies to every location represented in the team (people without a location use the organisation level).
- Summary line above the grid: the first Short or Peak cell (`Next shortfall: Customer support, Monday 12 October, 1 of 3 in (minimum 2)`), or "Every team is covered for the next five working days."
- Key below the grid and a footnote: "Counts approved leave and time away, such as training, travel, client sites and other offices. Working from home counts as in."
- Cells link to `/calendar?scopeType=team&scopeValue=<teamId>&view=day&anchor=<date>` (the calendar reads `anchor`). The "No team" row does not link.
- Colour is never the only cue: every non-covered cell has text and an accessible label (`Monday 12 October, Customer support: 1 of 3 in, short by 1`).

### Minimum staffing data

- New nullable column `teams.minimum_available_people` (integer, null means no minimum, validated 0 to team size at write time with Zod; no database check against team size because team size changes).
- New settings page `/settings/coverage` (owner and admin): a table of teams with team size and a numeric minimum field; saving writes an audit event `teams.coverage_minimum_updated` and ends with a receipt (`Customer support minimum set to 2 people.`).

## Removed from dashboards

Components: `XeroDisconnectedBanner`, `SyncHealthCard`, `OrgXeroSyncFailedCard`, `TeamXeroSyncFailedCard`, `OrgPendingApprovalsCard`, `ApprovalQueueCard`, `ActiveFeedsCard`, `UsageVsLimitsCard`, `RecentAuditEventsCard`, `QuickActionsCard`, `TodayStatusCard`, `UpcomingRecordsCard`, `ActionItemsCard` Xero rows, `AmbientCalendarField` and its data module, and the unmounted `TeamTodayCard`, `TeamThisWeekCard`, `CoverageTimeline`, `UpcomingPeaksCard`, `MetricTile`, `DashboardLayout`.

View sections: `syncHealth`, `orgWideXeroSyncFailed`, `teamXeroSyncFailed`, `activeFeeds`, `usageVsLimits`, `recentAuditEvents`, `upcomingPeaks`, `teamThisWeek`, `teamToday`, `todayStatus`, `upcoming`, `quickActions`, `orgWidePendingApprovals`, `actionItems.xeroSyncFailedRecords` and `actionItems.declinedRecords`. `approvalQueue` is reshaped into row data (see the plan). Their loaders and builders are deleted where nothing else imports them.

## Copy

- One record-type label map: the existing `AVAILABILITY_RECORD_TYPE_LABELS` in `packages/core/src/availability-record-label.ts`, moved to sentence case (`annual_leave` to "Annual leave", `wfh` to "Working from home" and so on). The app adds only an icon map. No `replaceAll("_", " ")` in dashboard code.
- Status chips use `approvalStatusLabel` with an icon (clock for Pending, check for Approved).
- Card descriptions are removed unless they add scope.
- Australian English, no em dashes, dates as `9 October 2026` or `Fri 9 Oct`, times in 24-hour format.

## Out of scope

- Migrating the marketing homepage to the shared component (follow-up; it keeps its own demo data and `home.css` contract tests).
- Showing the impact of a pending request on coverage in approval rows (follow-up once minimums are in use).
- Teammate visibility for employees (needs a product and privacy decision).
