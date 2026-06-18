# Plan 005: Populate `leave_balances.record_type` on Xero balance sync

> **Executor instructions**: Follow this plan step by step, running every
> verification command. If a STOP condition occurs, stop and report. Update
> `plans/README.md` when done unless a reviewer maintains the index.
>
> **Drift check (run first)**: `git diff --stat e1b06a3..HEAD -- packages/jobs/src/handlers/sync-xero-leave-balances.ts packages/availability/src/sync/inbound-leave-normaliser.ts packages/availability/index.ts`
> Compare the "Current state" excerpts against the live code; on a mismatch,
> treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `e1b06a3`, 2026-06-18
- **Issue**: <!-- filled when published via --issues -->

## Why this matters

The Xero leave-balance sync writes `leave_balances` rows but never sets
`record_type` (a nullable `availability_record_type` column). Three readers filter
balances by `record_type`, so for every Xero-synced balance they match nothing:

1. **Approval display** — `approval-service.ts:1075` `loadBalanceSnapshot` filters
   `record_type: record.record_type`. Approvers see no "balance available" /
   "remaining after approval" for Xero leave — a core decision-support feature is
   silently blank.
2. **Plan balance chip** — `plan-service.ts:879` `balanceChipForRecord` does the
   same.
3. **Write-back leave-type resolution** — `resolve-leave-type.ts:33-45`
   `resolveXeroLeaveTypeId` looks up the balance by `record_type` to find the Xero
   `leave_type_xero_id` to write back to. With `record_type` null this returns
   `missing_mapping`, so submitting/approving Xero leave fails to resolve the leave
   type. (This is latent because write-back against synced balances may not have
   been exercised pre-launch — confirm during testing.)

Contrast `people-service.ts:447` which reads balances by `person_id` alone and
works. The manual-balance path (`manual-balance-service.ts:177`) sets `record_type`;
only the **sync** path omits it.

The mapping from a Xero leave-type name to `availability_record_type` already
exists and is used by the leave-records sync: `recordTypeFromLeaveType` in
`packages/availability/src/sync/inbound-leave-normaliser.ts:127`
(`normaliseInboundLeaveRecord` calls it at line 57 to set each record's
`record_type`). Reusing it for balances makes balances and records derive
`record_type` identically, so all three readers start matching with no change to
the read sites.

## Current state

- Balance upsert, `packages/jobs/src/handlers/sync-xero-leave-balances.ts:244-271`
  — neither `create` nor `update` sets `record_type`:
  ```ts
  await database.leaveBalance.upsert({
    create: {
      ...scoped(context),
      as_at: new Date(),
      balance: balance.balance.toFixed(4),
      balance_unit: balance.unitType,
      last_fetched_at: new Date(),
      leave_type_name: balance.leaveTypeName,
      leave_type_xero_id: balance.leaveTypeId,
      person_id: person.id,
      xero_tenant_id: xeroTenantId,
    },
    update: {
      as_at: new Date(),
      balance: balance.balance.toFixed(4),
      balance_unit: balance.unitType,
      last_fetched_at: new Date(),
      leave_type_name: balance.leaveTypeName,
      updated_at: new Date(),
    },
    where: { person_id_xero_tenant_id_leave_type_xero_id: { ... } },
  });
  ```
  `balance.leaveTypeName` is the field used for `leave_type_name`.
- The mapping function, `packages/availability/src/sync/inbound-leave-normaliser.ts:127`:
  ```ts
  function recordTypeFromLeaveType(leaveTypeName: string | null): availability_record_type {
    const value = leaveTypeName?.toLowerCase() ?? "";
    // ... maps name -> enum ...
  }
  ```
  It is currently **not exported**. `normaliseInboundLeaveRecord` (same file) **is**
  exported from the package barrel `packages/availability/index.ts` and imported by
  `sync-xero-leave-records.ts:7`.
- Schema: `packages/database/prisma/schema.prisma` model `LeaveBalance` —
  `record_type availability_record_type?` (nullable, line ~655).

## Commands you will need

| Purpose   | Command                                                       | Expected on success |
|-----------|---------------------------------------------------------------|---------------------|
| Install   | `bun install`                                                 | exit 0              |
| TC avail. | `bunx tsc --noEmit -p packages/availability/tsconfig.json`    | exit 0              |
| TC jobs   | `bunx tsc --noEmit -p packages/jobs/tsconfig.json`            | exit 0              |
| Tests     | `bunx vitest run packages/jobs packages/availability`         | all pass            |

## Scope

**In scope**:
- `packages/availability/src/sync/inbound-leave-normaliser.ts` (export the mapping
  function)
- `packages/availability/index.ts` (re-export it from the barrel)
- `packages/jobs/src/handlers/sync-xero-leave-balances.ts` (set `record_type` on
  the upsert)
- Tests in `packages/jobs/src/handlers/`

**Out of scope**:
- The three reader sites (`approval-service.ts`, `plan-service.ts`,
  `resolve-leave-type.ts`) — populating the write side fixes them unchanged. Do
  not change the readers.
- The manual-balance path — already sets `record_type`.
- A schema change — `record_type` already exists and is nullable.

## Git workflow

- Branch: `advisor/005-leave-balance-record-type`
- Conventional commits, e.g. `fix(jobs): set record_type on synced leave balances`.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Export the mapping function

In `inbound-leave-normaliser.ts`, change `function recordTypeFromLeaveType` to
`export function recordTypeFromLeaveType`. Then add it to the barrel
`packages/availability/index.ts` alongside the existing `normaliseInboundLeaveRecord`
export (match the existing export style in that file).

**Verify**: `bunx tsc --noEmit -p packages/availability/tsconfig.json` → exit 0.

### Step 2: Set `record_type` on the balance upsert

In `sync-xero-leave-balances.ts`, import `recordTypeFromLeaveType` from
`@repo/availability`, compute it once before the upsert, and set it in both
branches:
```ts
const recordType = recordTypeFromLeaveType(balance.leaveTypeName);
await database.leaveBalance.upsert({
  create: { ...existing..., record_type: recordType },
  update: { ...existing..., record_type: recordType },
  where: { ... },
});
```
Setting it in `update` means the next scheduled balance sync repopulates existing
rows automatically (no separate data backfill required).

**Verify**: `bunx tsc --noEmit -p packages/jobs/tsconfig.json` → exit 0.

### Step 3: Test that the upsert carries the derived `record_type`

Extend the `sync-xero-leave-balances` test (find it with
`ls packages/jobs/src/handlers/*balance*test*`). With the DB `upsert` mocked and a
balance whose `leaveTypeName` maps to a known enum (e.g. an annual-leave name),
assert the mock received `record_type` equal to
`recordTypeFromLeaveType(thatName)` in both `create` and `update`.

**Verify**: `bunx vitest run packages/jobs packages/availability` → all pass.

## Test plan

- New/extended unit test: synced balance upsert includes the correct
  `record_type` derived from `leave_type_name`.
- If `recordTypeFromLeaveType` lacks direct unit coverage, add a small table-driven
  test for it in `packages/availability/src/sync/` (a few representative leave-type
  names → expected enum, plus `null` → its default).
- Verification: `bunx vitest run packages/jobs packages/availability` → all pass.

## Done criteria

ALL must hold:

- [ ] `recordTypeFromLeaveType` is exported and re-exported from
      `packages/availability/index.ts`
      (`grep -n "recordTypeFromLeaveType" packages/availability/index.ts` matches)
- [ ] `sync-xero-leave-balances.ts` upsert sets `record_type` in both `create` and
      `update`
- [ ] `bunx tsc --noEmit -p packages/availability/tsconfig.json` and
      `... -p packages/jobs/tsconfig.json` both exit 0
- [ ] `bunx vitest run packages/jobs packages/availability` passes, including the
      new assertion
- [ ] `bun run check` exits 0
- [ ] No files outside the in-scope list are modified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back if:

- `recordTypeFromLeaveType` does not accept a `string | null` or does not return
  `availability_record_type` (signature drifted) — adjust the call rather than
  guessing, and report.
- A reader expects `record_type` to be null for synced balances by design (search
  for any test asserting null `record_type` on a synced balance) — if so, the
  intended fix may be on the read side instead; report before proceeding.

## Maintenance notes

- Existing rows are repaired by the next scheduled balance sync (the `update`
  branch now sets `record_type`). If you need immediate repair before the next
  sync, a one-off `UPDATE leave_balances SET record_type = ... WHERE record_type IS
  NULL` keyed off `leave_type_name` mapping can be run, but it is optional.
- This is the single point that controls how Xero leave-type names become
  canonical record types for balances. If Xero leave-type naming changes, update
  `recordTypeFromLeaveType` and both records and balances stay consistent.
- Reviewer: confirm write-back leave-type resolution (`resolveXeroLeaveTypeId`)
  now finds a balance for a synced employee — this was the latent half of the bug.
