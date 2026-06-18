# Plan 004: Guard `archiveStaleRecords` against empty-fetch data loss

> **Executor instructions**: Follow this plan step by step, running every
> verification command. If a STOP condition occurs, stop and report. Update
> `plans/README.md` when done unless a reviewer maintains the index.
>
> **Drift check (run first)**: `git diff --stat e1b06a3..HEAD -- packages/jobs/src/handlers/sync-xero-leave-records.ts`
> If the file changed, compare the "Current state" excerpt against the live code
> first; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: MED
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `e1b06a3`, 2026-06-18
- **Issue**: <!-- filled when published via --issues -->

## Why this matters

`syncXeroLeaveRecords` archives synced leave records that are no longer present in
Xero by selecting records whose `source_remote_id` is **not** in the set just
fetched. When the fetched set is empty it falls through to the branch
`source_remote_id: { not: null }`, which matches **every** non-archived
`xero_leave` record for the org — and archives all of them.

`archiveStaleRecords` is called unconditionally after the fetch loop. So if a Xero
read ever returns `ok` with zero leave applications for a populated tenant (a
transient empty 200 during a Xero incident, a permission/scope change, a paging
bug), one sync run silently archives the entire org's synced leave and drops it
from every feed. Recovery requires a later full successful sync to un-archive.

Treating "fetched nothing" as "everything is stale" is the bug. A genuinely empty
tenant and a transient empty response are indistinguishable here, so the safe
default is to **not** mass-archive on an empty fetch.

## Current state

`packages/jobs/src/handlers/sync-xero-leave-records.ts`:

Call site (lines 219-223), unconditional:
```ts
const stale = await archiveStaleRecords(
  context,
  fetched.map((record) => record.leaveApplicationId).filter(Boolean)
);
counts.archived = stale.archived;
```

The function (lines 562-580):
```ts
async function archiveStaleRecords(
  context: SyncXeroLeaveRecordsInput,
  fetchedRemoteIds: string[]
): Promise<{ archived: number; personIds: string[] }> {
  const stale = await database.availabilityRecord.findMany({
    where: {
      ...scoped(context),
      archived_at: null,
      source_remote_id:
        fetchedRemoteIds.length > 0
          ? { notIn: fetchedRemoteIds }
          : { not: null },   // <-- selects ALL synced leave when fetch is empty
      source_type: "xero_leave",
    },
    select: { id: true, person_id: true },
  });
  if (stale.length === 0) {
    return { archived: 0, personIds: [] };
  }
  // ... updateMany archives them ...
}
```

## Commands you will need

| Purpose   | Command                                              | Expected on success |
|-----------|------------------------------------------------------|---------------------|
| Install   | `bun install`                                         | exit 0              |
| Typecheck | `bunx tsc --noEmit -p packages/jobs/tsconfig.json`    | exit 0              |
| Unit test | `bunx vitest run packages/jobs`                       | all pass            |

## Scope

**In scope**:
- `packages/jobs/src/handlers/sync-xero-leave-records.ts` (the `archiveStaleRecords`
  function and, if needed, its call site)
- A unit test for the empty-fetch guard in `packages/jobs/src/handlers/`

**Out of scope**:
- The other sync handlers — only leave-records has this archive-on-empty branch.
- Changing the legitimate non-empty stale-archival behaviour (records genuinely
  removed in Xero must still archive).

## Git workflow

- Branch: `advisor/004-empty-fetch-archive-guard`
- Conventional commits, e.g. `fix(jobs): do not archive all leave when Xero returns an empty set`.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Skip archival on an empty fetch

At the top of `archiveStaleRecords`, return early when there are no fetched ids:
```ts
async function archiveStaleRecords(
  context: SyncXeroLeaveRecordsInput,
  fetchedRemoteIds: string[]
): Promise<{ archived: number; personIds: string[] }> {
  if (fetchedRemoteIds.length === 0) {
    return { archived: 0, personIds: [] };
  }
  const stale = await database.availabilityRecord.findMany({
    where: {
      ...scoped(context),
      archived_at: null,
      source_remote_id: { notIn: fetchedRemoteIds },
      source_type: "xero_leave",
    },
    select: { id: true, person_id: true },
  });
  // ... unchanged ...
}
```
The `{ not: null }` branch is removed entirely — it only ever ran on the unsafe
empty case.

**Verify**: `bunx tsc --noEmit -p packages/jobs/tsconfig.json` → exit 0.

### Step 2: Test the guard

Add a unit test (model after the existing `sync-xero-leave-records` test or
integration test in the same directory). With the database `findMany`/`updateMany`
mocked, assert:
- `archiveStaleRecords(context, [])` returns `{ archived: 0, personIds: [] }` and
  does **not** call `updateMany` (no archival).
- `archiveStaleRecords(context, ["id-1"])` queries with `source_remote_id: { notIn: ["id-1"] }`
  (the normal path still works).

If `archiveStaleRecords` is not exported, test it via the handler entry point with
a Xero read mock returning an empty leave set, asserting no records are archived.

**Verify**: `bunx vitest run packages/jobs` → all pass, new test included.

## Test plan

- New test: empty fetch → zero archived, no `updateMany`; non-empty fetch → normal
  `notIn` archival.
- Pattern: existing `sync-xero-leave-records` test in `packages/jobs/src/handlers/`.
- Verification: `bunx vitest run packages/jobs` → all pass.

## Done criteria

ALL must hold:

- [ ] `grep -n "{ not: null }" packages/jobs/src/handlers/sync-xero-leave-records.ts`
      returns no matches in `archiveStaleRecords` (the unsafe branch is gone)
- [ ] `bunx tsc --noEmit -p packages/jobs/tsconfig.json` exits 0
- [ ] `bunx vitest run packages/jobs` passes, including the empty-fetch test
- [ ] `bun run check` exits 0
- [ ] No files outside the in-scope list are modified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back if:

- The call site relies on `archiveStaleRecords` archiving on empty for a
  legitimate "tenant cleared all leave in Xero" workflow (search the file and its
  tests for any such expectation) — if so, the right fix is to gate on an explicit
  "fetch was complete and genuinely empty" signal, which needs design input.
- The "Current state" excerpt no longer matches the live code.

## Maintenance notes

- If a deliberate "Xero returned zero because the tenant truly has no leave"
  reconciliation is ever needed, implement it as an explicit, separately-flagged
  path — never as the fallback of an empty fetch.
- Reviewer: confirm the normal stale-archival path (records removed in Xero while
  others remain) is unchanged and still archives only the missing ids.
