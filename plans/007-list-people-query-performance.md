# Plan 007: Stop listPeople fetching the whole organisation and counting per person

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat d9da765..HEAD -- packages/availability/src/people/people-service.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED (pagination semantics must stay stable for the people page UI)
- **Depends on**: none (001 recommended first for the typecheck gate)
- **Category**: perf
- **Planned at**: commit `d9da765`, 2026-06-12
- **Issue**: https://github.com/hiltonbrown/leavesync/issues/63

## Why this matters

`listPeople` backs the people list page. Today it: (1) fetches **every** matching person in the organisation with no `take`, (2) maps each through `toPersonListItem`, which awaits `computeCurrentStatus` (its own availability-record queries) plus a separate `availabilityRecord.count` **per person**, then (3) filters and paginates the fully-materialised array in memory. A 500-person org pays 1 + 500×2+ queries and full status computation for 500 people to show a page of 50. Two fixes are cheap and behaviour-preserving: batch the per-person failed-sync counts into one `groupBy`, and push the `xeroSyncFailedOnly` filter into SQL.

## Current state

- `packages/availability/src/people/people-service.ts`:
  - The fetch (lines 265–297): `database.person.findMany({ where: { ...scoped, ...filters }, orderBy: [{ last_name: "asc" }, { first_name: "asc" }, { id: "asc" }], select: personListSelect })` — note: **no `take`, no `cursor`** at the database level.
  - The mapping + in-memory filter + in-memory pagination (lines 299–330):

```typescript
const mapped = await Promise.all(
  people.map(async (person) => toPersonListItem(person, scoped))
);
const filtered = mapped.filter((person) => {
  if (filters.xeroSyncFailedOnly && person.xeroSyncFailedCount === 0) {
    return false;
  }
  if (
    filters.status?.length &&
    !filters.status.includes(person.currentStatus.statusKey)
  ) {
    return false;
  }
  return true;
});

const cursor = decodePeopleCursor(pagination.cursor ?? null);
const afterCursor = cursor
  ? filtered.filter((person) => comparePeopleCursor(person, cursor) > 0)
  : filtered;
const page = afterCursor.slice(0, pagination.pageSize);
```

  - `toPersonListItem` (lines 699–768) — per person, in `Promise.all`:

```typescript
const [currentStatus, xeroSyncFailedCount] = await Promise.all([
  computeCurrentStatus({ at: new Date(), clerkOrgId: ..., locationId: person.location_id, organisationId: ..., personId: person.id }),
  database.availabilityRecord.count({
    where: { ...scoped, approval_status: "xero_sync_failed", person_id: person.id },
  }),
]);
```

  - `computeCurrentStatus` lives in `packages/availability/src/people/current-status.ts:119` (queries availability records per person; treat as a black box in this plan).
  - `totalCount` returned is `filtered.length` — i.e. the count of all matching people after filters, not the page size. Preserve this.
- Conventions: `Result<T, E>` returns, `scopedQuery(clerkOrgId, organisationId)` spread into every `where`, Zod-validated inputs, co-located Vitest tests. Existing tests: check for `people-service.test.ts` alongside; `packages/availability/index.test.ts` and `index.integration.test.ts` exist at package root.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Availability tests | `bunx vitest run packages/availability` | all pass |
| Single file | `bunx vitest run packages/availability/src/people/people-service.test.ts` | all pass |
| Whole suite | `bun run test` | all pass |
| Lint | `bun run check` | exit 0 |

## Scope

**In scope**:
- `packages/availability/src/people/people-service.ts` (`listPeople`, `toPersonListItem` signature)
- `packages/availability/src/people/people-service.test.ts` (create or extend)

**Out of scope** (do NOT touch):
- `computeCurrentStatus` / `current-status.ts` — batching status computation is a deeper refactor, deferred (see Maintenance notes).
- The cursor encoding/decoding helpers and ordering semantics (`decodePeopleCursor`, `comparePeopleCursor`) — the UI depends on them.
- The `status` filter remaining an in-memory filter (it depends on computed status; cannot move to SQL without the deferred refactor).
- Other consumers of `toPersonListItem`, if any — check first (`grep -n "toPersonListItem" packages/availability -r`).

## Git workflow

- Branch: `advisor/007-list-people-performance`
- Conventional commit, e.g. `perf(availability): batch failed-sync counts and push filters into SQL in listPeople`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Batch the failed-sync counts into one groupBy

In `listPeople`, after the `person.findMany`, replace the per-person `availabilityRecord.count` with one query:

```typescript
const failedCounts = await database.availabilityRecord.groupBy({
  by: ["person_id"],
  _count: { _all: true },
  where: {
    ...scoped,
    approval_status: "xero_sync_failed",
    person_id: { in: people.map((person) => person.id) },
  },
});
const failedCountByPersonId = new Map(
  failedCounts.map((row) => [row.person_id, row._count._all])
);
```

Change `toPersonListItem` to accept the count as a parameter (`xeroSyncFailedCount: number`) instead of querying — it then awaits only `computeCurrentStatus`. Update the `Promise.all` mapping to pass `failedCountByPersonId.get(person.id) ?? 0`.

**Verify**: `bunx vitest run packages/availability` → all pass; `bun run check` → exit 0.

### Step 2: Push `xeroSyncFailedOnly` into the SQL where clause

Add to the `person.findMany` where object:

```typescript
...(filters.xeroSyncFailedOnly
  ? {
      availability_records: {
        some: { ...scoped, approval_status: "xero_sync_failed" },
      },
    }
  : {}),
```

(Confirm the relation name on the Prisma `person` model first: `grep -n "availability_records" packages/database/prisma/schema.prisma` — use the exact relation field name from the `person` model.)

Keep the in-memory `xeroSyncFailedCount === 0` filter line — it becomes a no-op safety net and keeps `filtered.length` semantics identical.

**Verify**: `bunx vitest run packages/availability` → all pass.

### Step 3: Fast-path pagination at the database when no in-memory filters apply

When **both** `filters.status` is empty/undefined **and** `filters.xeroSyncFailedOnly` is false, the in-memory filter is the identity, so pagination can move to SQL. In that case only:

- Decode the cursor as today; translate it to a Prisma `cursor: { id: <cursor person id> }, skip: 1` (the orderBy already ends with `id: "asc"`, making `id` a valid unique cursor — confirm `decodePeopleCursor` exposes the person id; if it only exposes name fields, STOP, see below).
- Add `take: pagination.pageSize + 1` (the +1 detects whether a next page exists).
- `totalCount` must still be the full match count: issue `database.person.count({ where: /* same where */ })` alongside.
- Slice off the extra row; compute `nextCursor` from the last page row exactly as the current code does.

The filtered path (status filter or xeroSyncFailedOnly set) keeps today's fetch-all + in-memory flow — but after Step 1 it no longer issues per-person count queries, which was the worst cost.

**Verify**: `bunx vitest run packages/availability` → all pass, including pagination tests (Step 4 adds them if missing).

### Step 4: Tests

In `people-service.test.ts` (create following the `vi.hoisted` database-mock pattern of `packages/xero/src/oauth/service.test.ts:6-13`, or extend the existing file if present):

1. Query-count regression: with 5 people mocked, `availabilityRecord.count` is called **zero** times and `availabilityRecord.groupBy` exactly once.
2. `xeroSyncFailedOnly: true` adds the `availability_records: { some: ... } }` condition to the `person.findMany` where (assert on the mock's call args).
3. Fast path: no status filter → `person.findMany` receives `take: pageSize + 1`; `nextCursor` set only when an extra row came back.
4. Filtered path unchanged: with `filters.status` set, no `take` is passed and in-memory pagination still slices correctly (fixture of 3 people, pageSize 2).
5. `totalCount` equals the full filtered match count in both paths.

**Verify**: `bunx vitest run packages/availability/src/people/people-service.test.ts` → all pass.

## Test plan

Steps 1–4 above; finally `bun run test` → all pass. If `DATABASE_URL` is available locally, also run `bunx vitest run packages/availability/index.integration.test.ts` to exercise real queries.

## Done criteria

ALL must hold:

- [ ] `grep -n "availabilityRecord.count" packages/availability/src/people/people-service.ts` returns no matches inside `toPersonListItem`
- [ ] One `groupBy` replaces N per-person counts (Step 4 test 1 proves it)
- [ ] Fast path uses DB-level `take`/`cursor`; filtered path behaviour unchanged (tests 3–4)
- [ ] `bunx vitest run packages/availability` exits 0; `bun run test` exits 0; `bun run check` exits 0
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `decodePeopleCursor` does not expose a person `id` usable as a Prisma cursor (the fast path then needs a cursor-format change, which affects the UI's stored cursors — operator decision).
- `toPersonListItem` has callers other than `listPeople` that cannot supply a count (check before changing its signature).
- The `person` model's relation to availability records has a different name than expected and the `some` filter will not typecheck.
- Existing integration tests assert exact query shapes that the groupBy changes in ways you cannot reconcile.

## Maintenance notes

- The remaining hot spot is `computeCurrentStatus` per person on the page (up to pageSize calls). The follow-up is a batched `computeCurrentStatusForPeople(personIds, at)` issuing one availability-record query — deferred because `current-status.ts` logic is intricate and deserves its own characterisation tests first.
- Reviewer should diff the people page behaviour with status filters applied: `totalCount` and `nextCursor` semantics are the regression surface.
- If a DB index is missing for `(clerk_org_id, organisation_id, approval_status, person_id)` on `availability_records`, the groupBy may be slow on large tenants — check `packages/database/prisma/schema.prisma` indexes; flag in the PR rather than adding a migration here.
