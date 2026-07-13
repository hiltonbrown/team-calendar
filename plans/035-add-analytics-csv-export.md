# Plan 035: Add CSV export to the leave-reports (and out-of-office) analytics screens

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report, do not improvise. When done, update the status row for this plan in
> `plans/README.md` unless a reviewer dispatched you and told you they maintain
> the index.
>
> **Drift check (run first)**: `git diff --stat 123bbd8..HEAD -- 'apps/app/app/(authenticated)/analytics' packages/availability/src/analytics`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S-M
- **Risk**: LOW
- **Depends on**: plan 034 (for the out-of-office screen's export button; the
  leave-reports export does not require 034)
- **Category**: direction
- **Planned at**: commit `123bbd8`, 2026-07-12

## Why this matters

`ScreenCatalogue-v4.1.md` specifies "Export CSV" as an explicit interaction on
both S-15 (Leave Reports) and S-16 (Out of Office), including placement ("low
emphasis, top right. Icon and 'Export CSV'"). Neither screen has any export path
today, so managers/admins cannot get the data out for payroll reconciliation or
board reporting — the workflow they will otherwise do by screenshotting. The
aggregation services already return structured rows; this plan adds a serialiser
plus a download affordance. **Privacy constraint**: the export must respect the
same privacy/manager-scope rules the analytics services already apply — export
only what the aggregation returns for the caller's role; never widen scope.

## Current state

- The analytics services return structured data with no CSV/serialisation function
  (verify: `grep -rn "csv\|Csv\|CSV\|serialise\|toCsv" packages/availability/src/analytics`
  → no matches).
- `aggregateLeaveReports` returns `LeaveReportsData` (summary stats +
  `leaveDaysByTeam` etc.); `aggregateOutOfOffice` returns `OutOfOfficeData`
  (summary stats + `oooTypeDonut`, `oooDaysByTypeMonthly`, `topWfhPeople`, ...).
  For a row-level export, `listLeaveReportRecordsForDrilldown` /
  `listOutOfOfficeRecordsForDrilldown` already return record-level rows
  (both exported from `packages/availability/index.ts`) and are the natural CSV
  source. Decide (Step 1) whether the export is the aggregated summary or the
  drilldown rows; the catalogue implies a data export, so prefer the drilldown
  rows scoped to the current filters.
- The leave-reports page (`analytics/leave-reports/page.tsx`) is a Server
  Component with a header area where a top-right action can sit.
- Conventions: Australian English UI copy; no em dashes; server actions in
  `_actions.ts`; all domain data via `@repo/availability`; download affordances
  in the app use standard browser download (a server action returning the CSV
  string, or an `apps/api`/route handler streaming `text/csv`). Check how any
  existing download in the app is done first: `grep -rn "text/csv\|Content-Disposition\|download" apps/app apps/api`.

## Commands you will need

| Purpose   | Command                                                          | Expected on success |
|-----------|------------------------------------------------------------------|---------------------|
| Typecheck | `bun run typecheck`                                              | exit 0              |
| Tests     | `bunx vitest run packages/availability/src/analytics`            | all pass            |
| Lint      | `bun run check`                                                  | exit 0              |
| Run app   | `bun run dev`                                                    | export downloads    |

## Scope

**In scope**:
- `packages/availability/src/analytics/` — a CSV serialiser for the chosen export
  shape (pure function; new file, e.g. `analytics-csv.ts`, with a co-located test).
- The leave-reports screen (and, if 034 landed, the out-of-office screen) — a
  top-right "Export CSV" affordance that triggers the download, wired via a
  server action or a route handler.
- Co-located tests for the serialiser.

**Out of scope**:
- Changing the aggregation/drilldown queries (reuse them as-is; do not widen
  scope or bypass privacy transforms).
- PDF/XLSX export.
- The out-of-office **page** itself (plan 034 builds it; this plan only adds the
  export button to it if it exists).

## Git workflow

- Branch: `improve/035-analytics-csv-export`
- Conventional commits (e.g. `feat(analytics): add CSV export to leave reports`).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Decide the export shape and confirm the source

Choose drilldown rows (recommended, matches "export the data") vs summary. Confirm
`listLeaveReportRecordsForDrilldown`'s return type
(`grep -n "listLeaveReportRecordsForDrilldown\|Drilldown" packages/availability/src/analytics/leave-reports-service.ts`)
and that it already applies role/privacy scoping. If it does not scope by role,
STOP and report (the export must not leak beyond what the caller may see).

### Step 2: Write a pure CSV serialiser

Add `packages/availability/src/analytics/analytics-csv.ts` exporting a function
that maps the chosen rows to CSV text with a header row. Requirements:
- Proper CSV escaping (wrap fields containing `,`, `"`, or newlines in quotes;
  double embedded quotes). Do not pull in a new dependency for this unless one is
  already present — a small escape helper is fine.
- Stable column order; ISO dates; Australian-English header labels.
- Export it from `packages/availability/index.ts`.

**Verify**: `bun run typecheck` → exit 0.

### Step 3: Wire the download affordance

Add a low-emphasis top-right "Export CSV" control on the leave-reports screen
(icon + label, per the catalogue). On click it must fetch the CSV for the current
filters and trigger a browser download (`Content-Type: text/csv`,
`Content-Disposition: attachment; filename="leave-report-<range>.csv"`). Implement
via whichever pattern the codebase already uses for downloads (run the
`text/csv`/`Content-Disposition` grep from "Current state" first); if
none exists, a server action returning the CSV string that the client turns into a
Blob download is acceptable. Reuse the page's existing role gate — the export
endpoint/action must re-check the caller's role and org scope server-side (do not
trust the client).

If plan 034's out-of-office page exists, add the same control there against the
out-of-office drilldown.

**Verify**: `bun run typecheck` → exit 0; `bun run check` → exit 0.

### Step 4: Tests + manual check

- Unit-test the serialiser: header row correct, escaping of commas/quotes/newlines,
  empty-dataset yields header-only output.
- Manual: `bun run dev`, open leave reports as a manager, click Export CSV, confirm
  a correctly-shaped file downloads and that a viewer role cannot reach the export.
  Stop the dev server afterward.

**Verify**: `bunx vitest run packages/availability/src/analytics` → all pass.

## Test plan

- Serialiser unit tests (Step 4): correctness + escaping + empty case.
- Structural pattern: existing analytics service tests in
  `packages/availability/src/analytics/*.test.ts`.
- Server-side authorisation for the export is covered by reusing the page's role
  gate; add an action/route test if the repo has a pattern for it.
- Verification: the vitest command → all pass; manual download check.

## Done criteria

ALL must hold:

- [ ] A pure CSV serialiser exists in `packages/availability/src/analytics/` with escaping tests
- [ ] Leave reports has a top-right "Export CSV" control that downloads a `text/csv` file
- [ ] The export endpoint/action re-checks role + org scope server-side and uses the scoped drilldown (no privacy widening)
- [ ] If plan 034 landed, out-of-office also has the export control
- [ ] `bun run typecheck` exits 0
- [ ] `bunx vitest run packages/availability/src/analytics` passes, incl. escaping tests
- [ ] `bun run check` exits 0
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The drilldown source does not already apply role/privacy scoping (Step 1) —
  exporting unscoped data would be a privacy regression.
- Any excerpt in "Current state" does not match live code (drift).
- No download pattern exists and a server action returning a large CSV would
  exceed reasonable payload limits for big orgs — report so a streaming route
  handler can be chosen instead.

## Maintenance notes

- Reviewer: verify the export respects manager scope and privacy transforms — the
  CSV must contain exactly what the on-screen analytics show for that role, nothing
  more.
- CSV escaping is the classic source of export bugs; the escaping unit tests are
  the guard — do not remove them.
- If XLSX or scheduled exports are later requested, keep the serialiser pure so it
  can be reused behind a different transport.
