# Plan 009: Scope the feed-render people fetch by feed scope

> **Executor instructions**: Follow step by step, running every verification
> command. If a STOP condition occurs, stop and report. Update `plans/README.md`
> when done unless a reviewer maintains the index.
>
> **Drift check (run first)**: `git diff --stat e1b06a3..HEAD -- packages/feeds/src/scope/feed-scope.ts`
> Compare the excerpt to live code; on a mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: perf
- **Planned at**: commit `e1b06a3`, 2026-06-18
- **Issue**: <!-- filled when published via --issues -->

## Why this matters

`resolvePeopleForFeed` loads **every active person in the organisation** when no
preloaded set is supplied, then filters in memory. The feed projection
(`feed-projection.ts`) and ICS render (`render-feed.ts`) call it without a
preloaded set, so on a cold/invalidated feed cache, rendering a single-person or
single-team ICS feed still pulls the whole org (with location/team joins). The 1h
KV cache bounds how often this fires (cache miss / after invalidation), so it is a
real but not per-request cost.

For person- and team-scoped feeds, the `where` can be narrowed to the ids the
scope actually needs.

## Current state

`packages/feeds/src/scope/feed-scope.ts:146-166`:
```ts
export async function resolvePeopleForFeed(input: {
  actingPersonId?: string | null;
  clerkOrgId: string;
  createdByUserId?: string | null;
  organisationId: string;
  preloaded?: FeedScopeData;
  scopes: FeedScopeInput[];
}): Promise<Result<ScopedFeedPerson[], FeedScopeError>> {
  try {
    const people =
      input.preloaded?.people.filter((person) => person.is_active) ??
      (await database.person.findMany({
        orderBy: [...],
        select: personSelect,
        where: { archived_at: null, clerk_org_id: input.clerkOrgId, is_active: true, organisation_id: input.organisationId },
      }));
    // ... then peopleForScope filters by scope in memory ...
```

The scope set (`input.scopes`, also see `dedupeScopes` and `peopleForScope` in the
same file) distinguishes scope kinds — including `org`, `team`, `person`, and
`self`/`manager_team` (which need the manager/report graph).

## Commands you will need

| Purpose   | Command                                                | Expected on success |
|-----------|--------------------------------------------------------|---------------------|
| Install   | `bun install`                                          | exit 0              |
| Typecheck | `bunx tsc --noEmit -p packages/feeds/tsconfig.json`    | exit 0              |
| Tests     | `bunx vitest run packages/feeds`                       | all pass            |

## Scope

**In scope**:
- `packages/feeds/src/scope/feed-scope.ts` (the `where` construction in
  `resolvePeopleForFeed`)
- Tests in `packages/feeds/src/scope/`

**Out of scope**:
- The privacy/projection logic downstream of people resolution.
- The preloaded path — leave it; only the non-preloaded `findMany` is narrowed.

## Git workflow

- Branch: `advisor/009-scope-feed-people-fetch`
- Conventional commits, e.g. `perf(feeds): narrow feed people fetch by scope`.
- Do NOT push/PR unless instructed.

## Steps

### Step 1: Build a scope-aware `where`

Before the `findMany`, inspect the (deduped) scopes:
- If any scope is `org` (or any scope kind that requires the manager graph such as
  `self`/`manager_team`), keep the current full-org fetch (those genuinely need the
  broader set).
- Otherwise, collect the concrete ids: `team_id IN (team scope values)` and
  `id IN (person scope values)`, combined with `OR`, and add them to the existing
  `where` (keeping `archived_at: null`, `is_active: true`, and both tenant ids).

Keep `peopleForScope` as the final in-memory authority so behaviour is unchanged;
the narrowing only reduces what is fetched.

**Verify**: `bunx tsc --noEmit -p packages/feeds/tsconfig.json` → exit 0.

### Step 2: Tests

Add tests asserting:
- A person-scoped feed fetches with `id: { in: [...] }` (not the whole org) and
  returns the same people as before.
- A team-scoped feed fetches by `team_id: { in: [...] }`.
- An org-scoped feed and a `self`/`manager_team` feed still fetch the broad set and
  return identical results to the pre-change behaviour.

Use the existing `feed-scope` tests as the pattern; spy on the `person.findMany`
`where` argument.

**Verify**: `bunx vitest run packages/feeds` → all pass.

## Test plan

- Per-scope-kind tests confirming the narrowed `where` and identical resolved
  people. Critical: the org and manager-graph scopes must be unchanged.
- Verification: `bunx vitest run packages/feeds` → all pass.

## Done criteria

ALL must hold:

- [ ] `resolvePeopleForFeed` builds a scope-aware `where` (person/team scopes no
      longer trigger a full-org fetch)
- [ ] Org and `self`/`manager_team` scopes still resolve identically
- [ ] `bunx tsc --noEmit -p packages/feeds/tsconfig.json` exits 0
- [ ] `bunx vitest run packages/feeds` passes, including new per-scope assertions
- [ ] `bun run check` exits 0
- [ ] No files outside the in-scope list are modified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back if:

- The scope kinds in this codebase do not cleanly map to org/team/person/manager
  categories, or `self`/`manager_team` resolution needs people outside the scope
  ids in a way a narrowed `where` would miss — keep those on the full fetch and
  report what you found.
- `peopleForScope` relies on having the full org set for correctness even for
  person/team scopes — if so, STOP (the narrowing would change results).

## Maintenance notes

- The correctness invariant: narrowing must never drop a person that the in-memory
  `peopleForScope` would have included. When in doubt for a scope kind, keep the
  full fetch — a perf miss is acceptable; a wrong feed is not.
- Reviewer: focus on the manager-graph scopes; those are where a too-narrow fetch
  would silently omit reports from a feed.
