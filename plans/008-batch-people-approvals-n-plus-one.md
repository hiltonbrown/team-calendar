# Plan 008: Eliminate per-row N+1 in the people and approvals list services

> **Executor instructions**: Follow step by step. This plan has two independent
> parts (A: people, B: approvals); each can be committed separately. Run every
> verification command. If a STOP condition occurs, stop and report. Update
> `plans/README.md` when done unless a reviewer maintains the index.
>
> **Drift check (run first)**: `git diff --stat e1b06a3..HEAD -- packages/availability/src/people packages/availability/src/approvals packages/availability/src/duration`
> Compare excerpts to live code; on a mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: none (prefer landing plan 014 approval tests first if doing both)
- **Category**: perf
- **Planned at**: commit `e1b06a3`, 2026-06-18
- **Issue**: <!-- filled when published via --issues -->

## Why this matters

Two list-building paths issue several queries **per row**, repeating identical
reference-data fetches each time:

- **People list / "Team today" dashboard** computes each person's current status
  with ~4 queries per person (location, organisation, active records, public
  holiday). The organisation query is byte-identical for every person. A 200-person
  manager dashboard fires ~800 queries.
- **Approver queue** computes each row's duration (a location/org + holiday-list
  query) and balance snapshot (a `leaveBalance.findFirst`) per record, re-fetching
  the same holiday set and locations for every row. `listForApprover` also feeds
  the manager and admin dashboards, multiplying the cost.

The work is correct but should pre-load shared reference data once and compute
in memory.

## Current state

**Part A — people:**
- `packages/availability/src/people/people-service.ts:301`:
  ```ts
  const mapped = await Promise.all(
    people.map(async (person) => toPersonListItem(person, scoped, failedCountByPersonId.get(person.id) ?? 0))
  );
  ```
  `toPersonListItem` awaits `computeCurrentStatus` per person.
- `packages/availability/src/people/current-status.ts:128`:
  ```ts
  const [location, organisation, activeRecords] = await Promise.all([
    input.locationId ? database.location.findFirst({ ... }) : Promise.resolve(null),
    database.organisation.findFirst({ where: { archived_at: null, clerk_org_id, id: organisationId }, ... }),
    /* active records findMany for this person */,
  ]);
  // ... plus a public-holiday lookup further down
  ```
- `dashboard-service.ts:~1037` `listAllPeople` paginates the whole org and feeds it
  into the same per-person status path.

**Part B — approvals:**
- `packages/availability/src/approvals/approval-service.ts:259`:
  ```ts
  const items = await Promise.all(records.map(toApprovalListItem));
  ```
  `toApprovalListItem` (≈line 1012) awaits `computeDuration` (which calls
  `computeWorkingDays` in `packages/availability/src/duration/working-days.ts`,
  issuing a location/org query + a holiday-list query per record) and
  `loadBalanceSnapshot` (`approval-service.ts:1075`, a `leaveBalance.findFirst` per
  record).
- A request-scoped cache already exists: `createAggregationCache` in
  `packages/availability/src/analytics/request-cache.ts` (used by the analytics
  services) — reuse this boundary rather than inventing a new one.

## Commands you will need

| Purpose   | Command                                                       | Expected on success |
|-----------|---------------------------------------------------------------|---------------------|
| Install   | `bun install`                                                 | exit 0              |
| Typecheck | `bunx tsc --noEmit -p packages/availability/tsconfig.json`    | exit 0              |
| Tests     | `bunx vitest run packages/availability`                       | all pass            |

## Scope

**In scope**:
- `packages/availability/src/people/current-status.ts` (add a batch variant)
- `packages/availability/src/people/people-service.ts` (call the batch variant)
- `packages/availability/src/dashboard/dashboard-service.ts` (the team-today path
  that uses per-person status) — only the call into the status computation
- `packages/availability/src/approvals/approval-service.ts` (pre-load reference
  data for `listForApprover`)
- `packages/availability/src/duration/working-days.ts` (if a batch entry point is
  needed) — additive only
- Tests in the same directories

**Out of scope**:
- The current-status **priority logic** (approved > pending > holiday > local) and
  the working-days/duration numeric computation — must produce identical results.
  Only the data-fetching shape changes.
- Unrelated methods in these large service files.

## Git workflow

- Branch: `advisor/008-people-approvals-batching`
- Conventional commits, e.g. `perf(availability): batch current-status reference data`.
- Commit Part A and Part B separately. Do NOT push/PR unless instructed.

## Steps

### Part A

#### Step A1: Add `computeCurrentStatusForPeople(personIds[])`

Add a batch function beside `computeCurrentStatus` that, for a set of person ids at
a given `at` date:
- fetches the organisation **once**,
- fetches all referenced locations in one `location.findMany({ where: { id: { in } } })`,
- fetches active records for all person ids in one
  `availabilityRecord.findMany({ where: { person_id: { in }, ... } })`,
- fetches the day's public holidays once,
then derives each person's `CurrentStatus` from in-memory maps using the **same
priority logic** as `computeCurrentStatus`. Refactor the existing single-person
function to share the priority-derivation helper so the logic is defined once.

**Verify**: `bunx tsc --noEmit -p packages/availability/tsconfig.json` → exit 0.

#### Step A2: Call it from `people-service` and the dashboard

Replace the `Promise.all(people.map(... computeCurrentStatus ...))` in
`people-service.ts:301` with a single `computeCurrentStatusForPeople(personIds)`
call, then map each person to its status from the result. Do the same in the
dashboard "team today" path.

**Verify**: `bunx vitest run packages/availability` → all pass (status outputs
unchanged).

### Part B

#### Step B1: Pre-load reference data for the approver list

In `listForApprover`, before mapping rows: collect all `person_id`s, location ids,
and the relevant year(s); fetch holidays per year once, locations once, and
`leaveBalance` rows for all person ids once. Pass these into `computeDuration`/
`loadBalanceSnapshot` so they become pure map lookups. Reuse `createAggregationCache`
for the holiday/location memoisation rather than a bespoke cache.

**Verify**: `bunx tsc --noEmit -p packages/availability/tsconfig.json` → exit 0.

#### Step B2: Confirm identical output

Run the approval tests; durations and balance snapshots must be unchanged.

**Verify**: `bunx vitest run packages/availability` → all pass.

## Test plan

- Part A: a test asserting `listPeople` issues **one** organisation query
  regardless of people count (spy on `database.organisation.findFirst`), and that
  each person's status matches the pre-refactor value for a fixture set covering
  approved/pending/holiday/local.
- Part B: a test asserting `listForApprover` issues a bounded number of
  holiday/location/balance queries (not per-row) and produces identical
  duration/balance snapshot values.
- Pattern: existing tests in `packages/availability/src/people` and `.../approvals`.

## Done criteria

ALL must hold:

- [ ] `computeCurrentStatusForPeople` exists and is used by `people-service` and
      the dashboard team-today path
- [ ] `listForApprover` pre-loads holidays/locations/balances once (no per-row
      `findFirst` for these)
- [ ] `bunx tsc --noEmit -p packages/availability/tsconfig.json` exits 0
- [ ] `bunx vitest run packages/availability` passes, including new query-count and
      output-equivalence assertions
- [ ] `bun run check` exits 0
- [ ] No files outside the in-scope list are modified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back if:

- The current-status priority logic or working-days computation cannot be reused
  unchanged in the batch path (i.e. you would have to alter outputs) — report; do
  not change behaviour to make batching easier.
- `createAggregationCache` is not request-scoped in the way needed (read its
  implementation first) — report rather than forcing it.

## Maintenance notes

- If pagination/horizon parameters change on these lists, revisit the `IN (...)`
  pre-fetch sizes.
- Reviewer: the key risk is behavioural drift — scrutinise that the batch status
  derivation matches the single-row logic exactly (same tie-breaks).
- The analytics services (`leave-reports-service.ts`, `out-of-office-service.ts`)
  are already correctly batched and are good reference implementations.
