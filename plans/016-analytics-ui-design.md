# Plan 016 Analytics UI Design Spike

## Drift check

Command run first:

```bash
git diff --stat e1b06a3..HEAD -- packages/availability/src/analytics apps/app/app
```

Result: the diff only contained settings action files under `apps/app/app/actions/settings`; no analytics service or analytics route files were present. This matches the reviewer note and means the implementation below was compared against live code rather than assuming the original plan snapshot still described the tree.

## Service contract

`aggregateLeaveReports` accepts:

- `actingUserId`, `clerkOrgId`, `organisationId`, `role`, and a resolved `dateRange`.
- Optional `filters` for archived people, leave type, location, person, person type, and team.
- `includePublicHolidays`, which adjusts working-day expansion by the organisation public-holiday rules.

It returns `LeaveReportsData`:

- `summaryStats`: total leave days, total records, scoped people count, people with leave, average days per person with leave, p80 days per person with leave, most common leave type, and most common leave-type days.
- `leaveDaysByPerson`: top people by leave days, with record count, team, and location.
- `leaveDaysByTeam`: leave days and people count per team.
- `leaveDaysByTypeMonthly`: month labels plus leave-type series.
- `leaveTypeDonut`: leave days and percentage per leave type.
- `peakAbsenceHeatmap`: weekly day matrix with max value.
- `appliedFilters`, `range`, and `dataFreshness`.

Role scoping is enforced inside the service:

- `owner` and `admin`: all people in the selected organisation, including archived people only when requested.
- `manager`: people returned by `managerScopePersonIds` for the acting user's linked `Person`.
- `viewer`: only the acting user's linked `Person`.

`listLeaveReportRecordsForDrilldown` shares the same inputs and role scoping, then returns cursor-paginated approved leave records with person, team, location, source, approver, submitted/approved dates, and computed working days.

`aggregateOutOfOffice` accepts the same tenancy, role, and date-range inputs, with filters for archived people, location, person, person type, local-only record type, and team. It returns `OutOfOfficeData`:

- `summaryStats`: total out-of-office days, total records, scoped people count, people with out-of-office entries, average days, most common out-of-office type, and most common type days.
- `oooDaysByTypeMonthly`: month labels plus local-only record-type series.
- `oooTypeDonut`: days and percentage per local-only type.
- `topWfhPeople`: WFH days, total weekdays, and WFH ratio per person.
- `travelFrequencyByPerson`: travelling days and records per person.
- `wfhPatternByDayOfWeek`: WFH days and people count by weekday.
- `appliedFilters`, `range`, and `dataFreshness`.

`listOutOfOfficeRecordsForDrilldown` returns the same record list shape as leave reports, scoped to manual local-only records.

The catalogue audience for S-15/S-16 is manager, admin, and owner. The prototype therefore uses `requirePageRole("org:manager")`, which admits manager, admin, and owner via the existing role hierarchy. The service also supports a viewer self-scope; that does not block this spike, but it should be a maintainer decision whether a future employee-facing personal analytics surface uses the same service.

## Chart approach

Use the existing `recharts` dependency through `packages/design-system/components/ui/chart.tsx`. The design-system wrapper already connects Recharts to the committed five-slot chart scale (`--chart-1` through `--chart-5`) in `packages/design-system/styles/globals.css`.

Trade-off:

- Recharts is already installed in both `apps/app` and `packages/design-system`, so the prototype adds no dependency and stays aligned with shadcn chart conventions.
- It requires a small client component boundary for the chart, while the page remains a server component that fetches and authorises data.
- Lightweight SVG would avoid the client boundary, but it would duplicate chart affordances already present in the design system and would not exercise the planned chart tokens as directly.

Context7 was not available in the active tool set when checked. No new library API was introduced; the implementation uses the existing local Recharts wrapper and package versions from the repository.

## CSV export reuse

`packages/availability/src/settings/shared.ts` exposes `csvEscape`, and `audit-log-service.ts` uses it to build a CSV string with `\r\n` row endings and a `{ csvContent, filename }` result. The app pattern is:

- server action validates input and authorisation
- service composes escaped CSV rows and returns `{ csvContent, filename }`
- client creates a `Blob`, clicks a temporary anchor, and revokes the object URL

Analytics CSV export can reuse that same pattern. The follow-up should add service-level export functions beside each analytics drilldown, use `csvEscape` for row composition, enforce the same analytics role scoping, and keep the browser download in a small client action/control.

## Routing, role guard, and navigation

Routes should live under:

- `apps/app/app/(authenticated)/analytics/leave-reports/page.tsx`
- `apps/app/app/(authenticated)/analytics/out-of-office/page.tsx`

The section should be available to `org:manager` and above. Page guards should call `requirePageRole("org:manager")`, then map Clerk `orgRole` to the service roles:

- `org:owner` -> `owner`
- `org:admin` -> `admin`
- `org:manager` -> `manager`

The sidebar should expose an Analytics entry only for `org:manager`, `org:admin`, and `org:owner`. The prototype links to `/analytics/leave-reports`; the full build can expand that route into an analytics section with tabs or a nested sidebar for Leave Reports and Out-of-Office.

## Prototype scope

The thin slice renders the Leave Reports page for the current organisation and current year. It calls `aggregateLeaveReports` with real tenancy and acting-user context, then renders one chart from `leaveDaysByTeam`.

It intentionally does not include:

- out-of-office route
- date/filter controls
- drilldown table
- CSV export
- all leave report charts
- chart-level loading skeletons beyond the normal route loading state

## Full-build follow-up

1. Add analytics filter schemas and URL state for date preset, custom dates, team, person, location, person type, and record type.
2. Promote the prototype chart component into reusable chart primitives for bar, monthly series, donut, and heatmap views.
3. Build the Leave Reports page with summary stats, team/person charts, monthly leave type trend, donut chart, heatmap, drilldown table, and CSV export.
4. Build the Out-of-Office page with summary stats, WFH weekday pattern, top WFH people, travel frequency, monthly type trend, donut chart, drilldown table, and CSV export.
5. Add tests for role-to-service mapping, query param parsing, empty states, service error states, and CSV action authorisation.
6. Review whether viewer self-scope analytics should be a separate employee route or remain dark.

## Open questions

- Should analytics default to current year, last 12 months, or a catalogue-specific preset?
- Should leave report working-day counts include public holidays by default, or should that be a visible toggle?
- Does the viewer self-scope in the analytics services represent a future employee-facing surface, or should UI access remain manager-and-above only?
- Should the analytics section live under the Team group or Admin group in the sidebar once both pages exist?
- Should exports create audit events like audit-log CSV exports, especially for manager-scoped people data?
