# Plan 016 (SPIKE): Analytics UI over the existing reporting services

> **Executor instructions**: This is a DESIGN/SPIKE plan, not a build-everything
> plan. Produce the design artefact and a thin prototype described below; do NOT
> attempt to ship the full feature. If a STOP condition occurs, stop and report.
> Update `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat e1b06a3..HEAD -- packages/availability/src/analytics apps/app/app`
> Compare against live code; on a mismatch, note it in your design doc.

## Status

- **Priority**: P2
- **Effort**: M (spike); full build is larger
- **Risk**: LOW (additive UI over tested services)
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `e1b06a3`, 2026-06-18
- **Issue**: <!-- filled when published via --issues -->

## Why this matters

The analytics backend is **done and dark**. `leave-reports-service.ts`
(`aggregateLeaveReports`, `listLeaveReportRecordsForDrilldown`) and
`out-of-office-service.ts` are fully implemented, role-scoped, tested, and exported
from `packages/availability/index.ts` — but `find apps/app/app -path "*analytics*"`
returns **nothing**. No `/analytics/leave-reports` or `/analytics/out-of-office`
route exists; the only consumer is the package barrel. The screen catalogue
(`ScreenCatalogue-v4.1.md`) lists an "Analytics (Leave Reports, Out-of-Office)"
sidebar section (S-15/S-16), and the `LeaveReportsData` shape maps 1:1 onto the
charts that spec describes.

This is the highest-leverage direction option: the expensive query/aggregation
engine exists; only the chart UI is missing.

## What to investigate / produce

Produce a short design document at `plans/016-analytics-ui-design.md` (or
`docs/`-style note) covering the decisions below, plus **one** thin vertical
prototype slice (the Leave Reports page rendering a single chart from real service
data) to de-risk the approach. Do not build both pages or all charts.

### Investigate

1. **Service contract**: read `packages/availability/src/analytics/leave-reports-service.ts`
   (the `LeaveReportsData` shape, `aggregateLeaveReports` inputs/role-scoping) and
   `out-of-office-service.ts`. Document exactly what data each returns and which
   roles may call them (S-15/S-16 audience is manager/admin/owner).
2. **Chart library**: `DESIGN.md` references a planned five-slot `--chart-*` colour
   scale. Decide the chart approach (a library vs. lightweight SVG) consistent with
   the design system; record the trade-off. Use Context7 for any library docs.
3. **CSV export**: the catalogue calls for export. An existing pattern lives in
   `packages/availability/src/settings/shared.ts` (used by sync + audit-log
   exports) — confirm it can be reused and document how.
4. **Routing + nav**: where the routes live (`apps/app/app/(authenticated)/analytics/...`),
   how `requirePageRole` guards them, and the sidebar entry.

### Prototype (thin slice only)

- Add `apps/app/app/(authenticated)/analytics/leave-reports/page.tsx` that calls
  the existing `aggregateLeaveReports` (role-guarded) and renders **one** chart
  from the real shape. Wire the sidebar entry behind the role guard.
- Do not build out-of-office, drilldown, CSV export, or every chart — those are the
  full-build follow-up the design doc scopes.

## Commands you will need

| Purpose   | Command                          | Expected on success |
|-----------|----------------------------------|---------------------|
| Install   | `bun install`                    | exit 0              |
| Typecheck | `bun run typecheck`              | exit 0              |
| App build | `bun run build --filter=app`     | exit 0              |

## Scope

**In scope**:
- `plans/016-analytics-ui-design.md` (the design artefact — primary deliverable)
- A single prototype page + sidebar entry under `apps/app/app/(authenticated)/analytics/`
- Reading (not modifying) the analytics services

**Out of scope**:
- Modifying the analytics services (they are done and tested).
- Building the full S-15/S-16 surface — that is the follow-up the design scopes.

## Git workflow

- Branch: `advisor/016-analytics-spike`
- Conventional commits, e.g. `docs(plans): analytics UI design` and
  `feat(app): analytics leave-reports prototype`.
- Do NOT push/PR unless instructed.

## Done criteria

ALL must hold:

- [ ] `plans/016-analytics-ui-design.md` exists and answers: data contract,
      chart approach + trade-off, CSV-export reuse, routing/role/nav, and a list of
      open questions for the maintainer
- [ ] One prototype page renders a real chart from `aggregateLeaveReports`, behind
      the correct `requirePageRole`
- [ ] `bun run typecheck` and `bun run build --filter=app` exit 0
- [ ] `bun run check` exits 0
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back if:

- The analytics service contract does not actually match the S-15/S-16 chart needs
  (a gap the prototype reveals) — document the gap; do not redesign the service.
- The role-scoping in `aggregateLeaveReports` conflicts with the catalogue's stated
  audience — surface it as an open question.

## Maintenance notes

- The full build (both pages, all charts, drilldown, CSV) is the follow-up; the
  design doc should scope it into implementable steps.
- Reviewer: judge the design doc's decisions and the prototype's fidelity to the
  design system, not feature completeness.
