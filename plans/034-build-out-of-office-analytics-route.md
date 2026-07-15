# Plan 034: Build the S-16 Out-of-office analytics route

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report, do not improvise. When done, update the status row for this plan in
> `plans/README.md` unless a reviewer dispatched you and told you they maintain
> the index.
>
> **Drift check (run first)**: `git diff --stat 123bbd8..HEAD -- 'apps/app/app/(authenticated)/analytics' 'apps/app/app/(authenticated)/components/sidebar.tsx' packages/availability/src/analytics/out-of-office-service.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: M (coarse — direction/build plan)
- **Risk**: LOW (additive route on an already-built, already-tested service)
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `123bbd8`, 2026-07-12
- **Status**: DONE, implemented in branch `improve/034-out-of-office-analytics` (`e70472e`)

## Why this matters

`ScreenCatalogue-v4.1.md` specifies S-16 "Out-of-office & travel" analytics at
route `/analytics/out-of-office`, and it is build-order step 15. The **service
layer for it is already built, exported, and unit-tested** (`aggregateOutOfOffice`,
`listOutOfOfficeRecordsForDrilldown`), but there is no page/route and the sidebar
links only to leave reports. Managers get leave analytics but not the
WFH/travel/offsite view the product promises. This plan adds the page and nav
entry on top of the existing service — no new domain logic.

## Current state

- The analytics directory has only leave-reports:

```
apps/app/app/(authenticated)/analytics/
  leave-reports/
    leave-days-by-team-chart.tsx
    page.tsx
```

- The service is built and exported from `@repo/availability`:

```ts
// packages/availability/index.ts:33-38
  aggregateOutOfOffice,
  listOutOfOfficeRecordsForDrilldown,
  type OutOfOfficeData,
  type OutOfOfficeFilters,
// from ./src/analytics/out-of-office-service
```

- `aggregateOutOfOffice` returns `OutOfOfficeData` with, among others:
  - `summaryStats`: `totalOooDays`, `totalRecords`, `peopleWithOooInPeriod`,
    `peopleInScope`, `averageDaysPerPersonWithOoo`, `mostCommonOooType`,
    `mostCommonOooTypeDays`.
  - `oooTypeDonut`: `[{ recordType, label, days, percentage }]`.
  - `oooDaysByTypeMonthly`: `{ months: string[], series: [{ recordType, values }] }`.
  - `topWfhPeople`, `travelFrequencyByPerson`, `wfhPatternByDayOfWeek`.
  - `range`, `dataFreshness: { generatedAt, recordCount }`.
  Its input shape mirrors `aggregateLeaveReports`:
  `{ actingUserId, clerkOrgId, organisationId, role, dateRange, filters, ... }`.

- **The page to model on** (same auth, org-context, error-state, and layout
  pattern) is the leave-reports page:

```
// apps/app/app/(authenticated)/analytics/leave-reports/page.tsx
// - requirePageRole("org:manager") with PermissionDeniedState fallback
// - resolves { orgRole } + currentUser(), maps to AnalyticsRole via analyticsRole()
// - requireActiveOrgPageContext(orgParam) -> { clerkOrgId, organisationId }
// - loads organisation timezone, resolveDateRange({ preset: "this_year", timezone })
// - aggregateLeaveReports({...}) -> renders StatCards + a chart Card + freshness line
// - <Header ... page="Leave Reports" />
```

  Its chart component `leave-days-by-team-chart.tsx` shows the design-system chart
  usage to mirror.

- The sidebar has a single Analytics entry to copy the pattern from — note it is
  role-gated via `roles: ANALYTICS_NAV_ROLES`, and the new entry must carry the
  same gating so viewers do not see a link to a page that will deny them:

```ts
// apps/app/app/(authenticated)/components/sidebar.tsx:75-80
{
  title: "Analytics",
  href: "/analytics/leave-reports",
  icon: BarChart3Icon,
  roles: ANALYTICS_NAV_ROLES,
},
```

- The categorical chart scale `--chart-1..5` exists in
  `packages/design-system/styles/globals.css`. Reuse it (as the leave-reports
  chart does); do not invent new colours. See DESIGN.md for tokens/typography and
  `.impeccable.md` for tone. Australian English; no em dashes.

- Conventions: Server Components by default; `requirePageRole` /
  `requireActiveOrgPageContext` for protection; all data via `@repo/availability`
  (never Prisma directly in the app for domain reads); shared UI from
  `@repo/design-system`.

## Commands you will need

| Purpose   | Command                                                          | Expected on success |
|-----------|------------------------------------------------------------------|---------------------|
| Typecheck | `bun run typecheck`                                              | exit 0              |
| Tests     | `bun run test`                                                   | all pass            |
| Lint      | `bun run check`                                                  | exit 0              |
| Run app   | `bun run dev` (then visit `/analytics/out-of-office`)            | page renders        |

## Suggested executor toolkit

- If a design/frontend skill is available in your environment, invoke it when
  composing the layout; otherwise follow DESIGN.md and `.impeccable.md` directly
  so the screen matches the existing analytics visual system.
- Use the `run` skill to launch the app and confirm the route renders.

## Scope

**In scope** (create/modify):
- `apps/app/app/(authenticated)/analytics/out-of-office/page.tsx` (create) —
  mirror the leave-reports page against `aggregateOutOfOffice`.
- `apps/app/app/(authenticated)/analytics/out-of-office/*-chart.tsx` (create as
  needed) — chart client components mirroring `leave-days-by-team-chart.tsx`.
- `apps/app/app/(authenticated)/components/sidebar.tsx` — add an
  `/analytics/out-of-office` nav entry (or a nested Analytics group with both).

**Out of scope**:
- `packages/availability` — the service is done; do not change aggregation logic.
- CSV export (that is plan 035; do not build it here even though S-16 lists it).
- The leave-reports page — leave it as the reference, do not refactor it.

## Git workflow

- Base branch: `preview` — all development lands on `preview`, not `main`. Create this branch from `preview` and, if you merge, merge back into `preview`. Earlier-numbered plans in this batch also land on `preview` first, so the drift-check diff may legitimately include their changes; treat a mismatch as a STOP condition only when it is not explained by an earlier plan's documented scope.
- Branch: `improve/034-out-of-office-analytics`
- Conventional commits (e.g. `feat(analytics): add out-of-office analytics route`).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Scaffold the page from the leave-reports pattern

Create `analytics/out-of-office/page.tsx` copying the auth/org-context/error-state
scaffolding from `leave-reports/page.tsx` verbatim (role gate, `analyticsRole`
mapping, `requireActiveOrgPageContext`, organisation timezone, `resolveDateRange`).
Swap the data call to `aggregateOutOfOffice({ actingUserId: user.id, clerkOrgId,
organisationId, role, dateRange, filters: { includeArchivedPeople: false,
personType: "all" } })`. Set the `<Header page="Out of Office" />` and metadata
title/description in Australian English.

**Verify**: `bun run typecheck` → exit 0.

### Step 2: Render summary + charts

Render, using `@repo/design-system` `Card`/`CardContent` and the existing
`StatCard` pattern:
- Stat cards from `summaryStats` (total OOO days, records, people with OOO,
  average days, most common type).
- A donut/bar for `oooTypeDonut` and a monthly stacked series for
  `oooDaysByTypeMonthly`, each in its own Card, following
  `leave-days-by-team-chart.tsx` for chart wiring and the `--chart-1..5` scale.
- The `dataFreshness` line at the bottom (mirror leave-reports).
- Empty states matching the leave-reports "No records found" treatment.

Keep chart components as `"use client"` only where the chart library requires it
(mirror the existing chart component's directive).

**Verify**: `bun run typecheck` → exit 0; `bun run check` → exit 0.

### Step 3: Add the sidebar entry

Add an Analytics entry for `/analytics/out-of-office` in `sidebar.tsx`. If a
single "Analytics" link exists, either add a second sibling link ("Out of
Office") or convert Analytics into a group containing "Leave Reports" and "Out of
Office" — match how other multi-item groups in the sidebar are structured. The
new entry must keep `roles: ANALYTICS_NAV_ROLES` (or the group equivalent) so
the link stays hidden from roles the page will deny.

**Verify**: `bun run typecheck` → exit 0.

### Step 4: Manual render check

Run `bun run dev`, sign in to an org with a manager+ role, visit
`/analytics/out-of-office`, and confirm: the page renders, stat cards populate,
charts draw (or show the empty state), and a viewer-role user gets
`PermissionDeniedState`. **Stop the dev server when done** (leftover listeners
break the next `bun run dev`).

## Test plan

- The service is already unit-tested; this plan adds a page. If the repo has page
  or action tests for `leave-reports`, add an equivalent smoke test for the new
  page; otherwise the manual render check (Step 4) plus typecheck/lint is the gate
  (matching how the leave-reports page is currently verified).
- Verification: `bun run test` stays green; manual route check passes.

## Done criteria

ALL must hold:

- [ ] `apps/app/app/(authenticated)/analytics/out-of-office/page.tsx` exists and renders `aggregateOutOfOffice` output
- [ ] The sidebar links to `/analytics/out-of-office`
- [ ] The page is gated by `requirePageRole("org:manager")` with the same `PermissionDeniedState` fallback as leave-reports
- [ ] Charts reuse the `--chart-1..5` scale; no new colour tokens invented
- [ ] `bun run typecheck` exits 0
- [ ] `bun run test` exits 0
- [ ] `bun run check` exits 0
- [ ] Manual render check (Step 4) passes and the dev server is stopped
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `aggregateOutOfOffice`'s input shape differs from `aggregateLeaveReports` in a
  way the leave-reports scaffold cannot be reused for (report the delta).
- Any excerpt in "Current state" does not match live code (drift).
- A chart type in the `OutOfOfficeData` shape has no analogue in the existing
  design-system chart components (report so a chart primitive decision can be made
  rather than importing a new charting dependency).

## Maintenance notes

- Reviewer: confirm the role gate and org scoping match leave-reports exactly
  (this is manager-visible analytics; it must respect manager scope, which the
  service already applies via `role`).
- CSV export (plan 035) will add an export button to both analytics screens;
  build this page so a top-right action slot is easy to add later.
- Keep aggregation in the service; the page must remain a thin render layer.
