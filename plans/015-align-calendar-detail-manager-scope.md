# Plan 015: Align calendar event detail manager scope with calendar range scope

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report, do not improvise. When done, update the status row for this plan
> in `plans/README.md` unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat e04f37d..HEAD -- packages/availability/src/calendar/calendar-service.ts packages/availability/src/calendar/calendar-service.test.ts`
> If either file changed since this plan was written, compare the "Current
> state" excerpts against the live code before proceeding; on a mismatch,
> treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `e04f37d`, 2026-07-02

## Why this matters

The calendar range path respects `managerVisibilityScope`: direct reports only
unless settings allow all team leave. The event detail path authorises managers
against a transitive report set regardless of that setting, so a manager can
open an indirect report's event detail even when the list/grid view hides it.
That is an authorisation mismatch and can expose detail beyond the configured
visibility scope.

## Current state

- `packages/availability/src/calendar/calendar-service.ts` - range path gates
  indirect reports on settings:

```ts
// packages/availability/src/calendar/calendar-service.ts:257-267
const allPeople = await loadPeople(parsed.data);
const managerReportIds =
  parsed.data.role === "manager" && parsed.data.actingPersonId
    ? transitiveReportIds(allPeople, parsed.data.actingPersonId)
    : new Set<string>();
const scopedPeopleResult = resolvePeopleForScope(parsed.data, allPeople, {
  includeIndirectReports:
    settingsResult.ok &&
    settingsResult.value.managerVisibilityScope === "all_team_leave",
  managerReportIds,
});
```

- Detail path computes transitive reports unconditionally for managers and uses
  that set for `canViewRecord`:

```ts
// packages/availability/src/calendar/calendar-service.ts:370-395
const managerReportIds =
  parsed.data.role === "manager" && parsed.data.actingPersonId
    ? transitiveReportIds(
        await loadPeople({
          ...
          scope: { type: "all_teams" },
          view: "month",
        }),
        parsed.data.actingPersonId
      )
    : new Set<string>();
if (
  !canViewRecord({
    actingPersonId: parsed.data.actingPersonId ?? null,
    managerReportIds,
    role: parsed.data.role,
    targetPerson: record.person,
  })
) {
  return notAuthorised();
}
```

- Rendering later respects the setting, but too late for auth:

```ts
// packages/availability/src/calendar/calendar-service.ts:397-404
const event = toCalendarEvent(record, {
  actingPersonId: parsed.data.actingPersonId ?? null,
  managerReportIds:
    settingsResult.ok &&
    settingsResult.value.managerVisibilityScope === "all_team_leave"
      ? managerReportIds
      : new Set<string>(),
  role: parsed.data.role,
});
```

- Existing test file:
  `packages/availability/src/calendar/calendar-service.test.ts`. It imports
  `getCalendarRange` and `getEventDetail` at line 45 and already mocks
  `database.person.findMany` and `database.availabilityRecord.findFirst`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Targeted tests | `bunx vitest run packages/availability/src/calendar/calendar-service.test.ts` | all pass |
| Typecheck | `bun run typecheck` | exit 0 |
| Lint | `bun run check` | exit 0 |
| Full tests | `bun run test` | exit 0 |

## Scope

**In scope**:

- `packages/availability/src/calendar/calendar-service.ts`
- `packages/availability/src/calendar/calendar-service.test.ts`
- `plans/README.md` (status row)

**Out of scope**:

- Changing calendar range scope behaviour.
- Changing admin/owner visibility.
- Changing privacy rendering or the `toCalendarEvent` redaction logic.
- Changing dashboard, analytics, approvals, or people manager scopes.

## Git workflow

- Branch: `preview` (shared branch for all plans; implement sequentially in plan-number order on top of the previous plan's commits)
- Commit message: `fix(calendar): respect manager visibility in event detail`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Reuse the settings-gated manager report set for detail auth

In `getEventDetail`, compute whether indirect reports are allowed:

```ts
const includeIndirectReports =
  settingsResult.ok &&
  settingsResult.value.managerVisibilityScope === "all_team_leave";
```

Then build `managerReportIds` so it contains only direct reports when
`includeIndirectReports` is false, and transitive reports only when it is true.
The simplest safe shape is:

1. Load people once for managers, as the current code does.
2. If `includeIndirectReports`, use `transitiveReportIds(allPeople, actingPersonId)`.
3. Otherwise, use a direct-only set:

```ts
new Set(
  allPeople
    .filter((person) => person.manager_person_id === parsed.data.actingPersonId)
    .map((person) => person.id)
)
```

Keep self visibility unchanged through `canViewRecord`.

**Verify**: `bun run typecheck` -> exit 0.

### Step 2: Add regression tests for direct vs indirect detail access

Extend `packages/availability/src/calendar/calendar-service.test.ts`:

1. Add an indirect report person to the test data: manager -> direct report ->
   indirect report.
2. Add a detail record for the indirect report.
3. Mock settings so `managerVisibilityScope: "direct_reports_only"` and assert
   `getEventDetail` for the manager returns `{ ok: false }` with
   `error.code === "not_authorised"`.
4. Mock settings so `managerVisibilityScope: "all_team_leave"` and assert the
   same detail request returns `{ ok: true }`.
5. Keep a direct-report detail case allowed under direct-only scope.

If the current settings mock is implicit, add the smallest mock needed for
`getSettings` rather than replacing unrelated setup.

**Verify**: `bunx vitest run packages/availability/src/calendar/calendar-service.test.ts` -> all pass.

### Step 3: Run repo checks

Run the standard gates.

**Verify**:

- `bun run typecheck` -> exit 0
- `bun run check` -> exit 0
- `bun run test` -> exit 0

## Test plan

The targeted calendar test must include both settings values:
`direct_reports_only` denies indirect report detail, and `all_team_leave`
allows it. The full test suite catches any dashboard/calendar regressions.

## Done criteria

- [ ] Detail authorisation uses direct reports only when manager visibility is
      `direct_reports_only`.
- [ ] Detail authorisation uses transitive reports only when visibility is
      `all_team_leave`.
- [ ] Direct report detail remains visible to the manager.
- [ ] Targeted calendar tests, typecheck, check, and full tests pass.
- [ ] `git status` shows only in-scope files modified.
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report back if:

- `getSettings` no longer returns `managerVisibilityScope`.
- Existing tests show a deliberate product decision that event detail should be
  broader than range visibility.
- Fixing this requires changing `canViewRecord` for admin/owner or peer privacy
  behaviour.

## Maintenance notes

- Reviewer check: ensure the same report set passed to `canViewRecord` is also
  passed to `toCalendarEvent`, unless there is a documented reason to differ.
- If manager scope becomes configurable outside calendar settings, this test
  should move to the shared policy.
