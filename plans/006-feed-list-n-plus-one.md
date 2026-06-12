# Plan 006: Batch the per-feed people/teams queries in the feed list

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat d9da765..HEAD -- packages/feeds/src/feed-service.ts packages/feeds/src/scope/feed-scope.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED (visibility logic must not change — characterised by tests before refactor)
- **Depends on**: none (001 recommended first for the typecheck gate)
- **Category**: perf
- **Planned at**: commit `d9da765`, 2026-06-12
- **Issue**: https://github.com/hiltonbrown/leavesync/issues/62

## Why this matters

`listFeeds` loops over the feeds page and, **per feed**, calls `canViewFeed` — which calls `resolvePeopleForFeed`, fetching every active person in the organisation — and then `resolveScopeRows`, which fetches every team **and** every person again. A page of 20 feeds in a 200-person org issues roughly 1 (feeds) + 20 (people for visibility) + 20×2 (teams + people for labels) ≈ 61 queries and transfers the people table 40 times, on a page admins open routinely. All of this data is identical across loop iterations; fetching it once cuts the page to 3 queries.

## Current state

- `packages/feeds/src/feed-service.ts:470-509` — the loop:

```typescript
const visibleItems: FeedListItem[] = [];
for (const feed of feeds) {
  const scopes = feed.scopes.map((scope) => ({
    scopeType: scope.scope_type,
    scopeValue: scope.scope_value,
  }));
  const visible = await canViewFeed({
    actingPersonId,
    clerkOrgId: parsed.data.clerkOrgId,
    createdByUserId: feed.created_by_user_id,
    organisationId: parsed.data.organisationId,
    role,
    scopes,
  });
  if (!(visible.ok && visible.value)) {
    continue;
  }
  const labels = await resolveScopeRows({
    clerkOrgId: parsed.data.clerkOrgId,
    organisationId: parsed.data.organisationId,
    scopes: feed.scopes,
  });
  // ... pushes FeedListItem using labels + scopeSummary(...)
}
```

- `packages/feeds/src/scope/feed-scope.ts`:
  - `resolvePeopleForFeed` (lines 139–182) — fetches **all** active people for the org (`database.person.findMany`, line 147), then filters in memory per scope. The DB fetch is the per-feed-invariant part; the in-memory part depends on the feed's scopes.
  - `canViewFeed` (lines 233–271) — admin/owner short-circuits `true` (line 241); otherwise calls `resolvePeopleForFeed` and checks membership / transitive reports.
  - `resolveScopeRows` (lines 184–231) — fetches all teams and all people (lines 194–210), builds `Map`s, then labels each scope. The fetches are per-feed-invariant; the labelling depends on the feed's scopes.
- Key observation for the refactor: in all three functions the database reads depend only on `(clerkOrgId, organisationId)` — never on the feed — so they can be hoisted out of the loop.
- Note: `canViewFeed` is also called from the single-feed paths (e.g. `getFeed`) — keep single-feed call sites working unchanged.
- Conventions: service functions return `Result<T, E>` (`@repo/core`); named exports; strict TS, no `any`; tests co-located, Vitest. Exemplar test: `packages/feeds/src/feed-service.test.ts`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Feeds unit tests | `bunx vitest run packages/feeds` | all pass |
| Feeds integration tests | `bunx vitest run packages/feeds/index.integration.test.ts` | all pass (skips without DATABASE_URL) |
| Whole suite | `bun run test` | all pass |
| Lint / typecheck | `bun run check` | exit 0 |

## Scope

**In scope**:
- `packages/feeds/src/feed-service.ts` (the `listFeeds` loop)
- `packages/feeds/src/scope/feed-scope.ts` (additive refactor only — see Step 2)
- `packages/feeds/src/scope/feed-scope.test.ts` (create or extend if it exists)
- `packages/feeds/src/feed-service.test.ts` (extend)

**Out of scope** (do NOT touch):
- `validateScopes` (feed-scope.ts:96-137) — it has its own per-scope N+1 but runs on create/update, a cold path; noted as a follow-up, do not bundle it in.
- Visibility **semantics**: who can see which feed must be bit-for-bit identical. Any behaviour change is a bug.
- Callers outside `packages/feeds` and the projection/render layer.
- The Prisma queries' `where` filters — tenant scoping (`clerk_org_id` + `organisation_id`) must remain on every query.

## Git workflow

- Branch: `advisor/006-feed-list-n-plus-one`
- Conventional commit, e.g. `perf(feeds): batch people and team lookups in listFeeds`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Characterise current visibility behaviour with tests

Before refactoring, lock in behaviour. In the feed-scope test file, cover `canViewFeed` for: admin/owner (always true), viewer in scope, viewer out of scope, manager with a transitive report in scope, no actingPersonId (false). Mock `database.person.findMany` (follow the `vi.hoisted` + `vi.mock("@repo/database", ...)` pattern from `packages/xero/src/oauth/service.test.ts:6-13`).

**Verify**: `bunx vitest run packages/feeds` → all pass, new characterisation tests green against the **unchanged** code.

### Step 2: Introduce a preloaded scope context (additive)

In `feed-scope.ts`:

1. Export an interface and loader:

```typescript
export interface FeedScopeData {
  people: /* row type of the existing personSelect query */[];
  teams: { id: string; name: string }[];
}

export async function loadFeedScopeData(input: {
  clerkOrgId: string;
  organisationId: string;
}): Promise<Result<FeedScopeData, FeedScopeError>> {
  // One person.findMany (the exact query from resolvePeopleForFeed:147-156)
  // and one team.findMany (the exact query from resolveScopeRows:195-201),
  // via Promise.all.
}
```

2. Add an optional `preloaded?: FeedScopeData` parameter to `resolvePeopleForFeed`, `canViewFeed`, and `resolveScopeRows`. When present, use `preloaded.people` / `preloaded.teams` instead of querying; when absent, query exactly as today. Existing call sites compile unchanged.

Caution: `resolveScopeRows` selects fewer person columns than `resolvePeopleForFeed`'s `personSelect`. Load the superset (`personSelect`, which the planner verified includes `first_name`, `last_name`, `id`) so one people list serves both; confirm `personSelect` covers everything `resolveScopeRows` needs before assuming.

**Verify**: `bunx vitest run packages/feeds` → all pass (no call sites changed yet); `bun run check` → exit 0.

### Step 3: Hoist the loads out of the `listFeeds` loop

In `feed-service.ts`, before the loop: call `loadFeedScopeData` once (only when there are feeds to process; skip the people load entirely when `isAdminOrOwner(role)` is true **and** labels are still needed — admins skip `canViewFeed`'s people scan but `resolveScopeRows` still needs teams+people, so in practice always load once). Pass `preloaded` into the `canViewFeed` and `resolveScopeRows` calls inside the loop.

**Verify**: `bunx vitest run packages/feeds` → all pass, including Step 1's characterisation tests.

### Step 4: Add a query-count regression test

In `feed-service.test.ts`, with mocked database: arrange 5 feeds and assert `person.findMany` is called exactly **once** and `team.findMany` exactly **once** during `listFeeds` (today it would be ≥10). This pins the fix.

**Verify**: `bunx vitest run packages/feeds/src/feed-service.test.ts` → all pass including the count assertion.

## Test plan

- Step 1: characterisation tests for `canViewFeed` (5 cases).
- Step 4: query-count regression test for `listFeeds`.
- Integration: `bunx vitest run packages/feeds/index.integration.test.ts` with `DATABASE_URL` set if available locally — feed list results identical before/after (same items, same order, same `scopeSummary` strings).
- Full: `bun run test` → all pass.

## Done criteria

ALL must hold:

- [ ] `listFeeds` issues one `person.findMany` and one `team.findMany` regardless of feed count (Step 4 test proves it)
- [ ] All Step 1 characterisation tests pass unchanged after the refactor
- [ ] `bunx vitest run packages/feeds` exits 0; `bun run test` exits 0; `bun run check` exits 0
- [ ] Function signatures changed only additively (optional parameter) — `grep -rn "canViewFeed\|resolveScopeRows" apps/ packages/ --include="*.ts" | grep -v node_modules | grep -v feeds/src` shows no caller required changes
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `personSelect` lacks a column `resolveScopeRows` needs and widening it would change what other callers receive in a way the types reject.
- The characterisation tests reveal `canViewFeed` behaviour that depends on query ordering or per-feed data you cannot preserve from a single preload.
- You find external callers of `resolvePeopleForFeed`/`resolveScopeRows` outside `packages/feeds` whose behaviour would change.
- Any Step 1 test fails after Step 3 — that is a semantics change; revert and report rather than adjusting the test.

## Maintenance notes

- Future feed-scope features (e.g. location-based scopes) must extend `FeedScopeData` and `loadFeedScopeData` together, or the preloaded path silently diverges from the direct-query path — reviewer should note this in code comments near the interface.
- Deferred follow-up: batch `validateScopes` (collect IDs, two `findMany` with `id: { in: [...] }`) — same pattern, cold path, separate change.
- If orgs grow to thousands of people, the right next step is pushing scope membership into SQL rather than preloading; this plan keeps the in-memory model.
