# Plan 007: Batch per-record lookups in the Xero sync handlers

> **Executor instructions**: Follow step by step, running every verification
> command. If a STOP condition occurs, stop and report. Update `plans/README.md`
> when done unless a reviewer maintains the index.
>
> **Drift check (run first)**: `git diff --stat e1b06a3..HEAD -- packages/jobs/src/handlers/sync-xero-leave-balances.ts packages/jobs/src/handlers/sync-xero-leave-records.ts`
> Compare the "Current state" excerpts to the live code; on a mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: none (prefer landing plan 013/014 tests first if doing both)
- **Category**: perf
- **Planned at**: commit `e1b06a3`, 2026-06-18
- **Issue**: <!-- filled when published via --issues -->

## Why this matters

Two scheduled sync handlers issue a database round-trip **per Xero record** against
Neon serverless (each round-trip is a network hop):

- **Balances** re-query the person for every balance even though the handler
  already fetched the whole people set up front.
- **Leave records** query the person and the existing record per leave
  application, and fire feed-rebuild Inngest events one at a time.

For an org with hundreds of employees/balances this is hundreds of avoidable
serial queries per run, lengthening sync duration and Neon load. The data needed
to batch is already in hand or fetchable in one `IN (...)` query.

## Current state

`packages/jobs/src/handlers/sync-xero-leave-balances.ts`:
- Up-front people fetch (lines 120-128):
  ```ts
  const people = await database.person.findMany({
    where: { ...scoped(context), archived_at: null,
      ...(context.personId ? { id: context.personId } : {}), xero_employee_id: { not: null } },
    select: { id: true, xero_employee_id: true },
  });
  ```
- Per-balance re-query inside `processBalance` (lines 225-232):
  ```ts
  const person = await database.person.findFirst({
    where: { ...scoped(context), archived_at: null, xero_employee_id: balance.employeeId },
    select: { id: true },
  });
  if (!person) { await recordFailure(... "person_not_found" ...); return false; }
  ```

`packages/jobs/src/handlers/sync-xero-leave-records.ts`:
- Per-record person lookup (line 414) and per-record existing-record lookup by
  `source_remote_id` (line 488), both inside the per-record loop (line 199).
- Feed-rebuild events sent one-by-one (lines 672-679):
  ```ts
  for (const feed of feeds) {
    await inngest.send({ data: { clerkOrgId, feedId: feed.id, organisationId, reason: "xero_leave_records_synced" }, ... });
  }
  ```
  `inngest.send` accepts an array.

## Commands you will need

| Purpose   | Command                                              | Expected on success |
|-----------|------------------------------------------------------|---------------------|
| Install   | `bun install`                                         | exit 0              |
| Typecheck | `bunx tsc --noEmit -p packages/jobs/tsconfig.json`    | exit 0              |
| Tests     | `bunx vitest run packages/jobs`                       | all pass            |

## Scope

**In scope**:
- `packages/jobs/src/handlers/sync-xero-leave-balances.ts`
- `packages/jobs/src/handlers/sync-xero-leave-records.ts`
- Their unit/integration tests in `packages/jobs/src/handlers/`

**Out of scope**:
- `sync-xero-people.ts` — the per-employee upsert there is inherent (Prisma has no
  batch upsert); do not touch.
- Behaviour of failure recording (`person_not_found` etc.) — must be preserved
  exactly, just sourced from a map instead of a query.

## Git workflow

- Branch: `advisor/007-batch-sync-lookups`
- Conventional commits, e.g. `perf(jobs): batch person/record lookups in leave sync`.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Balances — look up person from the up-front map

Build `const personIdByEmployeeId = new Map(people.filter(p => p.xero_employee_id).map(p => [p.xero_employee_id, p.id]));`
once in the handler. Thread it into `processBalance` (add a parameter) and replace
the `findFirst` with `personIdByEmployeeId.get(balance.employeeId)`. When the key
is absent, keep the existing `person_not_found` failure path unchanged.

**Verify**: `bunx tsc --noEmit -p packages/jobs/tsconfig.json` → exit 0.

### Step 2: Leave records — pre-fetch people and existing records per batch

For each batch (the code already slices into `BATCH_SIZE` batches at line ~198),
before the per-record loop:
- Collect the batch's employee ids and pre-fetch people in one
  `person.findMany({ where: { ...scoped(context), xero_employee_id: { in: [...] } } })`;
  build a `Map<xero_employee_id, person>`.
- Collect the batch's `leaveApplicationId`s and pre-fetch existing records in one
  `availabilityRecord.findMany({ where: { ...scoped(context), source_remote_id: { in: [...] } } })`;
  build a `Map<source_remote_id, record>`.
Pass both maps into `processLeaveRecord` and replace the per-record `findFirst`
calls (lines 414, 488) with map lookups. Preserve the create-vs-update branch
(hash-change detection) semantics exactly.

**Verify**: `bunx tsc --noEmit -p packages/jobs/tsconfig.json` → exit 0.

### Step 3: Batch the feed-rebuild Inngest sends

Replace the `for (const feed of feeds) { await inngest.send({...}) }` loop with a
single `await inngest.send(feeds.map((feed) => ({ name: <existing event name>, data: { clerkOrgId, feedId: feed.id, organisationId, reason: "xero_leave_records_synced" } })));`
Use the exact event `name` the current single-send uses (read it from the existing
call — it is on the object being sent).

**Verify**: `bunx tsc --noEmit -p packages/jobs/tsconfig.json` → exit 0.

### Step 4: Tests

Extend the existing `sync-xero-leave-balances` and `sync-xero-leave-records`
tests/integration tests. Assert:
- A run with N balances issues **one** people query, not N (spy on
  `database.person.findFirst`/`findMany` call counts).
- `person_not_found` is still recorded when an employee id has no person.
- Leave-records: existing-record detection still produces correct
  created/updated/unchanged outcomes from the pre-fetched map.
- `inngest.send` is called once with an array when multiple feeds are affected.

**Verify**: `bunx vitest run packages/jobs` → all pass.

## Test plan

- Assertions on query counts (batched, not per-record), preserved failure paths,
  preserved create/update detection, and single batched `inngest.send`.
- Pattern: existing handler tests in `packages/jobs/src/handlers/`.
- Verification: `bunx vitest run packages/jobs` (+ `bun run test:integration` if a
  test DB is available).

## Done criteria

ALL must hold:

- [ ] `processBalance` no longer calls `database.person.findFirst`
- [ ] `processLeaveRecord` no longer calls `database.person.findFirst` or
      `availabilityRecord.findFirst` per record (replaced by map lookups)
- [ ] Feed-rebuild events sent via a single `inngest.send([...])`
- [ ] `bunx tsc --noEmit -p packages/jobs/tsconfig.json` exits 0
- [ ] `bunx vitest run packages/jobs` passes, including query-count assertions
- [ ] `bun run check` exits 0
- [ ] No files outside the in-scope list are modified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back if:

- The create-vs-update hash-detection logic in `processLeaveRecord` cannot be
  preserved exactly with a pre-fetched map (e.g. it depends on a fresh read).
- A batch's `IN (...)` list could exceed a safe parameter count for very large
  tenants — if a batch can hold thousands of records, chunk the `IN` query and note it.

## Maintenance notes

- The per-batch pre-fetch keeps memory bounded to one batch. Keep `BATCH_SIZE`
  modest.
- Reviewer: confirm the `person_not_found`/failure semantics are byte-for-byte the
  same, just map-sourced; and that the batched `inngest.send` uses the correct
  event name.
