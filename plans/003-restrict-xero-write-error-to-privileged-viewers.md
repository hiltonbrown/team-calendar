# Plan 003: Stop exposing Xero write errors to peers on the team calendar

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 960c07b..HEAD -- packages/availability/src/calendar`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: `plans/001-restore-verification-baseline.md`
- **Category**: security
- **Planned at**: commit `960c07b`, 2026-07-19

## Why this matters

`toCalendarEvent` computes `canSeeSensitive` once and uses it to withhold
internal notes, the true record type and edit rights from peers. It then returns
`xeroWriteError` to everyone, unguarded. The result is that an ordinary employee
looking at the team calendar can read Xero Payroll error text attached to a
colleague's leave record whose type and notes are deliberately hidden from them.

That error text is `input.error.userMessage` (set at
`packages/availability/src/approvals/approval-service.ts:938`) and can disclose
leave-type names, employee mapping details and payroll-period context — exactly
the information the `private` and `masked` privacy modes exist to suppress.

This is an inconsistency inside a single function rather than a considered
design decision: the field sits three lines below `notesInternal`, which *is*
guarded. The fix is one conditional.

## Current state

### The projection function

`packages/availability/src/calendar/calendar-service.ts:706-753`. The relevant
part, verbatim:

```ts
function toCalendarEvent(
  record: ScopedRecord,
  actor: {
    actingPersonId: string | null;
    managerReportIds: ReadonlySet<string>;
    role: CalendarRole;
  }
): CalendarEvent {
  const relationship = relationshipToOwner(actor, record.person);
  const canSeeSensitive = relationship !== "peer";
```

and, further down in the returned object:

```ts
    isEditableByActor:
      canSeeSensitive &&
      record.source_type !== "xero" &&
      record.source_type !== "xero_leave",
    notesInternal: canSeeSensitive ? record.notes_internal : null,
    personId: record.person_id,
    privacyMode: record.privacy_mode,
    recordType,
    recordTypeCategory:
      record.source_type === "manual" ? "local_only" : "xero_leave",
    renderTreatment: renderTreatment(record.approval_status),
    sourceType: record.source_type,
    startsAt: record.starts_at,
    xeroWriteError:
      record.approval_status === "xero_sync_failed"
        ? record.xero_write_error
        : null,
  };
}
```

`notesInternal` is guarded by `canSeeSensitive`. `xeroWriteError` is not.

### How `canSeeSensitive` is derived

`packages/availability/src/calendar/calendar-service.ts:789-810`:

```ts
function relationshipToOwner(
  actor: {
    actingPersonId: string | null;
    managerReportIds: ReadonlySet<string>;
    role: CalendarRole;
  },
  targetPerson: Pick<ScopedPerson, "id" | "manager_person_id">
): "admin" | "manager" | "peer" | "self" {
  if (targetPerson.id === actor.actingPersonId) {
    return "self";
  }
  if (targetPerson.manager_person_id === actor.actingPersonId) {
    return "manager";
  }
  if (actor.role === "manager" && actor.managerReportIds.has(targetPerson.id)) {
    return "manager";
  }
  if (isAdminOrOwner(actor.role)) {
    return "admin";
  }
  return "peer";
}
```

and `isAdminOrOwner` at `:919-921` returns true for `"admin"` and `"owner"`.

So `canSeeSensitive` is true for the record's owner (self), their manager,
admins and owners; false only for peers. Applying it to `xeroWriteError` means
the person whose leave it is still sees their own sync error, and their manager
and admins still see it. Only unrelated colleagues stop seeing it. That is the
correct boundary.

### The existing test that looks like it contradicts this

`packages/availability/src/calendar/calendar-service.test.ts:195-213` asserts
that `xeroWriteError` **is** present:

```ts
it("redacts private peer records in range output", async () => {
  const result = await getCalendarRange({
    ...baseInput,
    role: "owner",
    scope: { type: "all_teams" },
  });
  ...
  expect(privateEvent?.renderTreatment).toBe("failed");
  expect(privateEvent?.xeroWriteError).toBe(
    "Xero could not save this leave."
  );
});
```

**This test will still pass after the fix, and it is not evidence that the
current behaviour is intended.** It overrides the role to `"owner"`
(`baseInput` at `:59-69` otherwise sets `role: "manager"`), and the record
belongs to `ids.peer` whose `manager_person_id` is `null` (`:56`). So
`relationshipToOwner` returns `"admin"` via `isAdminOrOwner`, making
`canSeeSensitive` true. The test covers the privileged-viewer case, where
exposing the error is correct.

If this test fails after your change, your change is wrong — see STOP conditions.

### Conventions that apply

- Australian English in comments. No em dashes anywhere.
- Strict TypeScript, no `any`. Named exports only.
- Tests co-located: `calendar-service.test.ts` sits beside `calendar-service.ts`.
- `CLAUDE.md` rule: "Never expose raw Xero error codes or payloads to
  employees." The raw payload is correctly kept in the admin-only
  `xero_write_error_raw` column; this plan tightens who sees the plain-language
  `xero_write_error`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `bun run typecheck --force` | exit 0, no `error TS` lines |
| Calendar suite | `cd packages/availability && bunx vitest run src/calendar/calendar-service.test.ts` | all pass |
| Availability suite | `cd packages/availability && bun run test` | `Test Files  32 passed (32)` |
| Lint | `bun run check` | exit 0 |

## Scope

**In scope** (the only files you should modify):
- `packages/availability/src/calendar/calendar-service.ts`
- `packages/availability/src/calendar/calendar-service.test.ts`

**Out of scope** (do NOT touch, even though they look related):
- `packages/availability/src/approvals/approval-service.ts` — where
  `xero_write_error` is written. The stored value is fine; this plan is about
  who reads it.
- The `CalendarEvent` type's shape. `xeroWriteError` stays `string | null`;
  peers simply receive `null`, which the field already allows. Do not make the
  property optional or remove it.
- `apps/app/components/**` — no client change is needed, because `null` is
  already a valid value the UI handles for every record not in
  `xero_sync_failed`. Do not "fix" the UI to compensate.
- `relationshipToOwner`, `isAdminOrOwner`, `canViewRecord` — the relationship
  logic is correct; only its application to one field is missing.
- The event **detail** path (`getEventDetail`) unless Step 3 shows it has the
  same gap. Investigate before changing, and report rather than expanding scope
  if the fix there is not identical in shape.

## Git workflow

- Branch: `advisor/003-restrict-xero-write-error`
- Conventional commits. Example from `git log`:
  `fix(xero): protect rotated refresh token against transaction abort`.
- Suggested commit:
  `fix(availability): withhold xero write errors from peers on the calendar`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Guard the field

In `packages/availability/src/calendar/calendar-service.ts`, change the
`xeroWriteError` property of the object returned by `toCalendarEvent` to:

```ts
    // Xero error text can disclose leave type and payroll context, so it is
    // withheld from peers alongside notes and the true record type.
    xeroWriteError:
      canSeeSensitive && record.approval_status === "xero_sync_failed"
        ? record.xero_write_error
        : null,
```

Change nothing else in the function.

**Verify**: `bun run typecheck --force` → exit 0, no `error TS` lines.

### Step 2: Add a peer regression test

In `packages/availability/src/calendar/calendar-service.test.ts`, add a test
directly after the existing `"redacts private peer records in range output"`
test at `:195-213`. Model it on that test, but with a genuine peer actor.

The new test must:

- Call `getCalendarRange` with `...baseInput` and `role: "viewer"`,
  `actingPersonId: ids.peer`, `scope: { type: "all_teams" }` — an actor who is
  neither the record's owner, nor its manager, nor an admin or owner.
- Target a record in `xero_sync_failed` state belonging to a different person,
  so `relationshipToOwner` returns `"peer"`.
- Assert `event?.xeroWriteError` is `null`.
- Assert in the same test that `event?.notesInternal` is `null`, so the test
  documents that the two fields now travel together. If they ever diverge again,
  this test says why that is wrong.

Name it something like
`"withholds xero write errors from peers in range output"`.

If the existing fixtures make it awkward to produce a peer actor who can still
see the record at all, check `canViewRecord` at `:812` and the fixture set at
`:56` and `:321` before adding new fixtures. Prefer reusing existing ids.

**Verify**:
`cd packages/availability && bunx vitest run src/calendar/calendar-service.test.ts`
→ all pass, including the new test, **and including the unchanged
`"redacts private peer records in range output"` test**.

### Step 3: Check the event-detail path for the same gap

Read `getEventDetail` in the same file and determine whether it projects
`xeroWriteError` through `toCalendarEvent` or builds its own object.

- If it reuses `toCalendarEvent`, it is already fixed by Step 1. Note that in
  your report and make no further change.
- If it builds its own projection **and** has the same unguarded
  `xeroWriteError`, apply the identical guard and add a matching peer test.
- If it builds its own projection and the shape of the correct fix is not
  obviously identical, STOP and report rather than improvising.

**Verify**: `cd packages/availability && bun run test`
→ `Test Files  32 passed (32)`.

### Step 4: Confirm nothing else regressed

**Verify**: `bun run test --force` → exit 0, no `Failed:` line.
**Verify**: `bun run check` → exit 0.

## Test plan

- New test in `packages/availability/src/calendar/calendar-service.test.ts`:
  a peer actor receives `null` for both `xeroWriteError` and `notesInternal` on
  a record in `xero_sync_failed` state.
- Possibly a second, matching test for `getEventDetail`, depending on Step 3.
- Structural pattern: the adjacent
  `"redacts private peer records in range output"` test at `:195-213`.
- The existing tests at `:169-193` and `:195-213` must continue to pass
  unchanged — they cover the privileged-viewer side of the same boundary and
  are the guard against over-correcting.
- Verification: `cd packages/availability && bun run test` → all pass.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `bun run typecheck --force` exits 0
- [ ] `bun run check` exits 0
- [ ] `bun run test --force` exits 0 with no `Failed:` line
- [ ] `cd packages/availability && bun run test` reports `Test Files  32 passed (32)`
- [ ] `grep -n "canSeeSensitive && record.approval_status" packages/availability/src/calendar/calendar-service.ts`
      returns exactly one match
- [ ] The test named `redacts private peer records in range output` still exists
      and passes, unmodified
- [ ] `git status --porcelain` lists only `calendar-service.ts` and
      `calendar-service.test.ts` (plus `plans/README.md`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The code at `toCalendarEvent` does not match the excerpt above.
- The existing test `"redacts private peer records in range output"` fails after
  your change. That test uses an `owner` actor, for whom `canSeeSensitive` is
  true, so a correct fix leaves it passing. If it fails, either your guard is
  wrong or `relationshipToOwner` does not behave as documented here — report
  the actual failure rather than editing the test to match your change.
- `bun run test` was already failing before your change — that means
  `plans/001-restore-verification-baseline.md` has not landed. Stop and say so.
- Step 3 reveals a third projection path for `xeroWriteError` somewhere outside
  this file. Report it; do not widen the change.
- You conclude peers *should* see Xero errors — for instance because some UI
  depends on it. Report that rather than abandoning the change; the finding is
  that this field is inconsistent with `notesInternal`, and if the intended
  answer is to expose both, that is a decision for the maintainer.

## Maintenance notes

- **For the reviewer**: the thing to scrutinise is that `canSeeSensitive` now
  governs `xeroWriteError`, `notesInternal`, `isEditableByActor` and
  `recordType` as a set. Any future field added to `CalendarEvent` that derives
  from Xero or from internal annotation should be assumed to need the same gate
  unless there is a stated reason otherwise.
- The employee-facing approvals UI reads its Xero error text from the approvals
  action, not from this calendar projection, so this change does not affect an
  employee's view of *their own* failed leave. Confirm that still holds if the
  approvals surface is ever refactored to read from the calendar projection.
- **Deliberately deferred**: `packages/feeds/src/projection/feed-projection.ts`
  performs the privacy projection for published ICS feeds. It was not audited
  for this specific field as part of this plan. Whether Xero error text can
  reach a feed body is worth a separate check.
