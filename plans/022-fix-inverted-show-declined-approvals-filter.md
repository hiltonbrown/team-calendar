# Plan 022: Fix the inverted approvals status filter so managers see the records the setting promises

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report, do not improvise. When done, update the status row for this plan in
> `plans/README.md` unless a reviewer dispatched you and told you they maintain
> the index.
>
> **Drift check (run first)**: `git diff --stat 123bbd8..HEAD -- packages/availability/src/approvals/approval-service.ts packages/availability/src/approvals/approval-service.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `123bbd8`, 2026-07-12

## Why this matters

The organisation setting `showDeclinedOnApprovals` (default **true**) is meant to
control whether declined leave appears in the manager approvals list. The
default filter that consumes it is inverted and omits `"declined"` from both
branches, so the setting does the opposite of its label and never actually
surfaces declined records:

- With the setting **on** (the default for every org), the approvals list is
  narrowed to `["submitted"]` only. Managers stop seeing approved, withdrawn,
  and crucially `xero_sync_failed` records. `xero_sync_failed` records are the
  only surface from which a stuck Xero write can be retried, so on a
  default-configured org managers cannot see or retry failed approvals.
- With the setting **off**, the list widens to four statuses but still never
  includes `"declined"`.

The fix is a one-line correction to the ternary plus tests for both branches.

## Current state

- `packages/availability/src/approvals/approval-service.ts` — `listForApprover`;
  the default filter is built at lines 239-244. This is the **only** consumer of
  `showDeclinedOnApprovals` (verified: `grep -rn showDeclinedOnApprovals packages apps`
  returns this line plus the settings schema, the settings service default, and
  the toggle UI).

```ts
// packages/availability/src/approvals/approval-service.ts:239-244
const filters = parsed.data.filters ?? {
  status:
    settingsResult.ok && !settingsResult.value.showDeclinedOnApprovals
      ? ["submitted", "approved", "xero_sync_failed", "withdrawn"]
      : ["submitted"],
};
```

- The setting defaults to `true`:

```ts
// packages/availability/src/settings/organisation-settings-service.ts:118
showDeclinedOnApprovals: true,
```

- The valid `approval_status` values are the Prisma enum
  `availability_approval_status`. Confirm the full set before editing:
  `grep -n "enum availability_approval_status" -A 12 packages/database/prisma/schema.prisma`.
  The statuses referenced by this feature are `submitted`, `approved`,
  `declined`, `withdrawn`, `xero_sync_failed`.

- **Intended semantics** (what the corrected code must produce):
  - Base list, always visible: `["submitted", "approved", "xero_sync_failed", "withdrawn"]`.
  - When `showDeclinedOnApprovals` is **true**: append `"declined"`.
  - When `showDeclinedOnApprovals` is **false** (or settings failed to load):
    the base list without `"declined"`.

- Convention: service functions return `Result`; tests are co-located Vitest
  files. Model your new test cases on the existing suite structure in
  `packages/availability/src/approvals/approval-service.test.ts` (it already
  exercises `listForApprover`; find the block near its assertion at
  `approval-service.test.ts:196`).

## Commands you will need

| Purpose   | Command                                                                 | Expected on success |
|-----------|-------------------------------------------------------------------------|---------------------|
| Typecheck | `bun run typecheck`                                                      | exit 0, no errors   |
| Unit test | `bunx vitest run packages/availability/src/approvals/approval-service.test.ts` | all pass            |
| Lint      | `bun run check`                                                          | exit 0              |

## Scope

**In scope** (the only files you should modify):
- `packages/availability/src/approvals/approval-service.ts`
- `packages/availability/src/approvals/approval-service.test.ts`

**Out of scope** (do NOT touch):
- `organisation-settings-service.ts` — the default value is correct; only the
  consumer is wrong.
- The toggle UI (`leave-approval-settings-client.tsx`) — behaviour is correct
  once the filter is fixed.
- Any change to the `filters` request shape — when the caller passes explicit
  `filters`, that path must remain unchanged (the fix only affects the
  `?? { ... }` default).

## Git workflow

- Branch: `improve/022-approvals-filter`
- Conventional commits (e.g. `fix(approvals): correct inverted showDeclinedOnApprovals filter`).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Correct the default filter ternary

Replace the block at `approval-service.ts:239-244` so the base list is always
the four non-declined visible statuses, and `"declined"` is appended only when
`showDeclinedOnApprovals` is true. Target shape:

```ts
const showDeclined =
  settingsResult.ok && settingsResult.value.showDeclinedOnApprovals;
const filters = parsed.data.filters ?? {
  status: showDeclined
    ? ["submitted", "approved", "xero_sync_failed", "withdrawn", "declined"]
    : ["submitted", "approved", "xero_sync_failed", "withdrawn"],
};
```

Keep the `status` array element type identical to what the surrounding code and
the Zod filter schema expect (do not introduce a cast). If the compiler
complains about the literal array type, match how the existing explicit-filter
path types its `status` array.

**Verify**: `bun run typecheck` → exit 0.

### Step 2: Add/adjust tests for both branches

In `approval-service.test.ts`, ensure there are cases proving:
1. Setting **true** (default) → the resolved default filter includes both
   `"declined"` **and** `"xero_sync_failed"` (assert the query the service
   issues, following the existing pattern that inspects the mocked
   `findMany`/`where`, or assert on returned records seeded across statuses).
2. Setting **false** → the filter includes `"xero_sync_failed"` but **not**
   `"declined"`.
3. An explicit `filters` argument is passed through unchanged (regression guard
   that the fix only touches the default path).

Correct the existing expectation near `approval-service.test.ts:196` if it
encoded the old inverted behaviour.

**Verify**: `bunx vitest run packages/availability/src/approvals/approval-service.test.ts`
→ all pass, including the new cases.

## Test plan

- New/updated tests in `packages/availability/src/approvals/approval-service.test.ts`:
  happy path with setting on, setting off, and explicit-filters passthrough
  (listed in Step 2).
- Structural pattern: the existing `listForApprover` tests in the same file.
- Verification: `bunx vitest run packages/availability/src/approvals/approval-service.test.ts` → all pass.

## Done criteria

ALL must hold:

- [ ] `bun run typecheck` exits 0
- [ ] `bunx vitest run packages/availability/src/approvals/approval-service.test.ts` passes, with the three cases from Step 2 present
- [ ] `grep -n '"xero_sync_failed"' packages/availability/src/approvals/approval-service.ts` shows it in the default-filter block, and `"declined"` appears only in the `showDeclined === true` branch
- [ ] `bun run check` exits 0
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The code at `approval-service.ts:239-244` does not match the excerpt (drift).
- The `availability_approval_status` enum does not contain all of `submitted`,
  `approved`, `declined`, `withdrawn`, `xero_sync_failed` (the intended status
  set is wrong for this schema).
- Fixing the filter causes unrelated approval-service tests to fail in a way you
  cannot explain from this change alone.

## Maintenance notes

- Reviewer should confirm `xero_sync_failed` is back in the default list — that
  is the retry surface and its omission was the most damaging part of the bug.
- If new `approval_status` values are ever added, revisit whether they belong in
  the default visible set.
- Follow-up not in scope: the label/help text of the toggle is fine, but a
  reviewer may want to confirm the UI copy matches the corrected behaviour.
