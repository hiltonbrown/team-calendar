# Plan 022: Make `showDeclinedOnApprovals` functional and fix the inverted service default

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report, do not improvise. When done, update the status row for this plan in
> `plans/README.md` unless a reviewer dispatched you and told you they maintain
> the index.
>
> **Drift check (run first)**: `git diff --stat 123bbd8..HEAD -- packages/availability/src/approvals/approval-service.ts packages/availability/src/approvals/approval-service.test.ts 'apps/app/app/(authenticated)/leave-approvals/page.tsx'`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S-M
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `123bbd8`, 2026-07-12; corrected on review 2026-07-13
  (the original diagnosis overstated production impact; see below)

## Why this matters

The organisation setting `showDeclinedOnApprovals` (default **true**) is meant to
control whether declined leave appears in the manager approvals list. Two defects
combine so the setting currently does nothing at all:

1. **The service default that consumes the setting is inverted** and omits
   `"declined"` from both branches: with the setting on it narrows the list to
   `["submitted"]`; with it off it widens to four statuses that still never
   include `"declined"`.
2. **The service default is unreachable from every live caller.** The approvals
   page (`leave-approvals/page.tsx:98-118`) always constructs an explicit
   `filters` object (defaulting to `status: ["submitted"]`, with its own
   `includeFailed` toggle adding `xero_sync_failed`), and both dashboard call
   sites (`dashboard-service.ts:455,584`) pass
   `filters: { status: ["submitted", "xero_sync_failed"] }`. So the
   settings-driven branch never executes.

Net effect in production: managers can still see and retry `xero_sync_failed`
records via the page's includeFailed filter, but toggling
`showDeclinedOnApprovals` in settings changes nothing anywhere. The fix is to
correct the inverted default AND make the approvals page defer to it when the
user has not chosen an explicit status filter, so the setting actually governs
the default view.

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

- The Zod filter schema defaults `status` when a `filters` object is passed
  without one, which also bypasses the settings-driven default:

```ts
// approval-service.ts:154 (FiltersSchema)
status: z.array(ApprovalStatusSchema).default(["submitted"]),
```

- Every live caller passes explicit `filters`, so the settings-driven default is
  dead code today (verify: `grep -rn "listForApprover(" packages apps | grep -v test`):

```ts
// apps/app/app/(authenticated)/leave-approvals/page.tsx:98-118 (abridged)
const parsedFilters = parseFilterParams(params, FilterSchema) ?? {
  includeFailed: false,
  status: ["submitted"],
};
const status = parsedFilters.status ?? ["submitted"];
const statusWithFailed = parsedFilters.includeFailed && !status.includes("xero_sync_failed")
  ? [...status, "xero_sync_failed"] : status;
const filters = { dateFrom, dateTo, personId, recordType, status: statusWithFailed };
// listForApprover({ ...serviceInput, filters })
```

```ts
// packages/availability/src/dashboard/dashboard-service.ts:455,584
// listForApprover({ ..., filters: { status: ["submitted", "xero_sync_failed"] } })
// (deliberate fixed scope for dashboard cards; leave these unchanged)
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

- **Intended semantics** (what the corrected code must produce when no explicit
  status filter is supplied):
  - Base list: `["submitted", "approved", "xero_sync_failed", "withdrawn"]`.
  - When `showDeclinedOnApprovals` is **true**: append `"declined"`.
  - When `showDeclinedOnApprovals` is **false** (or settings failed to load):
    the base list without `"declined"`.
  - An explicit status filter (URL param on the page, or a caller-passed
    `filters.status`) always wins over the settings-driven default.

  Note this default view (four or five statuses) is deliberately wider than the
  page's current `["submitted"]` default. If during implementation you find
  evidence the product intends the default view to stay submitted-only (with the
  setting governing only whether "declined" is offered/added), STOP and report —
  the intended default set is the one product-semantics question in this plan.

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
- `apps/app/app/(authenticated)/leave-approvals/page.tsx` (and its filter
  client component only if the status-filter UI needs the effective default
  passed down)

**Out of scope** (do NOT touch):
- `organisation-settings-service.ts` — the default value is correct; only the
  consumers are wrong.
- The toggle UI (`leave-approval-settings-client.tsx`) — behaviour is correct
  once the filter is fixed.
- The dashboard call sites (`dashboard-service.ts:455,584`) — their fixed
  `["submitted", "xero_sync_failed"]` scope is deliberate for dashboard cards.
- Explicit-filter behaviour — when a caller passes an explicit `filters.status`,
  that path must remain unchanged.

## Git workflow

- Base branch: `preview` — all development lands on `preview`, not `main`. Create this branch from `preview` and, if you merge, merge back into `preview`. Earlier-numbered plans in this batch also land on `preview` first, so the drift-check diff may legitimately include their changes; treat a mismatch as a STOP condition only when it is not explained by an earlier plan's documented scope.
- Branch: `improve/022-approvals-filter`
- Conventional commits (e.g. `fix(approvals): correct inverted showDeclinedOnApprovals filter`).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Correct the default filter and make it reachable

In `listForApprover`, restructure the default so it applies whenever the caller
did not supply an explicit `status`, not only when `filters` is absent entirely:

- Remove the `.default(["submitted"])` from `FiltersSchema.status`
  (`approval-service.ts:154`) so an omitted status survives parsing as
  `undefined`. Confirm no other consumer of `FiltersSchema` relies on that Zod
  default (`grep -n "FiltersSchema" packages/availability/src/approvals/approval-service.ts`).
- Compute the settings-driven default status list and apply it when
  `parsed.data.filters?.status` is undefined. Target shape:

```ts
const showDeclined =
  settingsResult.ok && settingsResult.value.showDeclinedOnApprovals;
const defaultStatus: availability_approval_status[] = showDeclined
  ? ["submitted", "approved", "xero_sync_failed", "withdrawn", "declined"]
  : ["submitted", "approved", "xero_sync_failed", "withdrawn"];
const filters = {
  ...parsed.data.filters,
  status: parsed.data.filters?.status ?? defaultStatus,
};
```

Keep the `status` array element type identical to what the surrounding code and
the Zod filter schema expect (do not introduce a cast).

**Verify**: `bun run typecheck` → exit 0.

### Step 2: Make the approvals page defer to the settings-driven default

In `leave-approvals/page.tsx`, stop hard-defaulting `status` to `["submitted"]`
when the URL carries no status filter: pass `filters` with `status` **omitted**
in that case (still appending `xero_sync_failed` via the `includeFailed` toggle
when the user has chosen an explicit status). When the URL does carry a status
param, pass it through unchanged.

If the status-filter UI needs a concrete list to render its checked state,
derive the effective default server-side (the page can read the same
organisation settings it already has access to, or reuse the exported default
from the service) and pass it down as display state only — the service remains
the source of truth for the query.

**Verify**: `bun run typecheck` → exit 0.

### Step 3: Add/adjust tests for both branches

In `approval-service.test.ts`, ensure there are cases proving:
1. Setting **true** (default), no explicit status → the resolved filter includes
   both `"declined"` **and** `"xero_sync_failed"` (assert the query the service
   issues, following the existing pattern that inspects the mocked
   `findMany`/`where`, or assert on returned records seeded across statuses).
2. Setting **false**, no explicit status → the filter includes
   `"xero_sync_failed"` but **not** `"declined"`.
3. An explicit `filters.status` argument is passed through unchanged (regression
   guard for the page, dashboard, and URL-filter paths).

Correct the existing expectation near `approval-service.test.ts:196` if it
encoded the old inverted behaviour.

**Verify**: `bunx vitest run packages/availability/src/approvals/approval-service.test.ts`
→ all pass, including the new cases.

## Test plan

- New/updated tests in `packages/availability/src/approvals/approval-service.test.ts`:
  setting on, setting off, and explicit-status passthrough (listed in Step 3).
- Structural pattern: the existing `listForApprover` tests in the same file.
- Verification: `bunx vitest run packages/availability/src/approvals/approval-service.test.ts` → all pass.

## Done criteria

ALL must hold:

- [ ] `bun run typecheck` exits 0
- [ ] `bunx vitest run packages/availability/src/approvals/approval-service.test.ts` passes, with the three cases from Step 3 present
- [ ] With no explicit status filter, the service default includes `"xero_sync_failed"` in both branches and `"declined"` only when `showDeclinedOnApprovals` is true
- [ ] The approvals page no longer hard-codes `status: ["submitted"]` when the URL has no status filter, so the setting governs the default view
- [ ] Dashboard call sites are unchanged (`git diff --stat` shows no `dashboard-service.ts` change)
- [ ] `bun run check` exits 0
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The code at `approval-service.ts:239-244` or the page excerpt does not match
  live code (drift).
- The `availability_approval_status` enum does not contain all of `submitted`,
  `approved`, `declined`, `withdrawn`, `xero_sync_failed` (the intended status
  set is wrong for this schema).
- You find evidence the product intends the default approvals view to remain
  submitted-only (see the note under "Intended semantics") — the wider default
  needs a maintainer decision in that case.
- Removing the Zod `.default` or changing the page default breaks the
  status-filter UI in a way that needs changes beyond the in-scope files.
- Fixing the filter causes unrelated approval-service tests to fail in a way you
  cannot explain from this change alone.

## Maintenance notes

- Reviewer should confirm the setting now visibly changes the default approvals
  view, and that `xero_sync_failed` is in the default list in both branches —
  that is the retry surface for stuck Xero writes.
- If new `approval_status` values are ever added, revisit whether they belong in
  the default visible set.
- The dashboard's fixed `["submitted", "xero_sync_failed"]` scope is deliberate;
  if the dashboard should ever honour the setting too, that is a separate
  decision.
- Follow-up not in scope: confirm the settings toggle's label/help text matches
  the corrected behaviour.
