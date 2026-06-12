# Plan 010: Test coverage for the feed token service

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat d9da765..HEAD -- packages/feeds/src/tokens/token-service.ts`
> If the service changed since this plan was written, compare the "Current
> state" export map against the live code before proceeding; on a mismatch,
> treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW (tests only — no production code changes permitted)
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `d9da765`, 2026-06-12
- **Issue**: https://github.com/hiltonbrown/leavesync/issues/66

## Why this matters

`token-service.ts` (569 lines) is the credential factory for the product's only public, unauthenticated surface: ICS feed URLs. It generates token plaintexts, hashes them for storage, rotates and revokes them, and enforces cross-organisation isolation. It has **zero** tests. Two specific hazards justify pinning it now: (1) `hashFeedToken` is the lookup key for every feed request — any change to it silently bricks every subscribed calendar in production; (2) the org-scoping guards are the only thing preventing one tenant rotating or revoking another tenant's tokens. The repo's own testing rules (CLAUDE.md) explicitly mandate tests for "feed token validation" and "clerk_org_id query isolation".

This plan adds tests only. If a test exposes a real bug, report it — do not fix it here.

## Current state

- `packages/feeds/src/tokens/token-service.ts` — export map (line numbers at planning time):
  - `generateFeedTokenPlaintext` (line 80) — 30 random bytes, base64url (verify exact encoding in code).
  - `hashFeedToken(plaintext)` (line 83) — SHA-256 hex; the persisted `token_hash`.
  - `createInitialToken` (86) / `createInitialTokenWithClient` (104) — issue first token for a feed; store hash + `token_hint` (last 4 chars of plaintext).
  - `rotateToken` (157) — revokes current, issues new, links via `rotated_from_token_id`.
  - `revokeToken` (256), `listTokens` (313), `getActiveTokenHint` (347), `revokeAllFeedTokens` (396).
  - Types: `FeedActorRole` (10), `TokenServiceError` (17), `TokenDisclosure` (26), `TokenHistoryItem` (32), `ActiveTokenHint` (41).
  - Internal scoping guards (not exported): the service queries feeds/tokens with `clerk_org_id` + `organisation_id` filters and maps misses to not-found errors — read the bodies before writing tests; assert through the public functions.
- Consumer of the hash: `packages/feeds/src/render/render-feed.ts:80-82` — `database.feedToken.findUnique({ where: { token_hash: hashFeedToken(token) } })`. A hash-stability test protects this contract.
- Test patterns in this package:
  - Integration (real DB, skip without `DATABASE_URL`): `packages/feeds/index.integration.test.ts` — read it first; reuse its fixture/cleanup approach and its `describe.skip` guard pattern.
  - Unit (mocked db): `packages/feeds/src/feed-service.test.ts`, and the `vi.hoisted` db-mock style in `packages/xero/src/oauth/service.test.ts:6-13`.
- Conventions: co-located tests (`token-service.test.ts` beside the source); Vitest; factories over repeated literals.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| New unit tests | `bunx vitest run packages/feeds/src/tokens/token-service.test.ts` | all pass |
| Feeds integration | `bunx vitest run packages/feeds/index.integration.test.ts` | all pass (skips without DATABASE_URL) |
| Feeds package | `bunx vitest run packages/feeds` | all pass |
| Lint | `bun run check` | exit 0 |

## Scope

**In scope**:
- `packages/feeds/src/tokens/token-service.test.ts` (create)
- `packages/feeds/index.integration.test.ts` (extend with token lifecycle cases, if integration coverage fits there better than a new file — executor's choice, but extend rather than duplicate fixtures)

**Out of scope** (do NOT touch):
- `token-service.ts` itself — zero production changes.
- `render-feed.ts` and the cache layer.
- The `token_hint` design (last-4-chars) — noted and accepted; do not "improve" it.

## Git workflow

- Branch: `advisor/010-feed-token-service-tests`
- Conventional commit, e.g. `test(feeds): cover token service lifecycle, hashing, and org isolation`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Pure-function tests (no database)

In the new `token-service.test.ts`:

1. `generateFeedTokenPlaintext` returns distinct values across calls, of the expected length/alphabet (derive from the implementation).
2. `hashFeedToken` is deterministic (same input → same output) and produces 64 lowercase hex chars.
3. **Hash stability pin**: hard-code one known pair, e.g. `expect(hashFeedToken("leavesync-test-vector")).toBe("<compute the actual value by running it once>")` with a comment: "If this test fails, every persisted token_hash in production is invalidated — do not update the expectation without a migration plan."

**Verify**: `bunx vitest run packages/feeds/src/tokens/token-service.test.ts` → passes.

### Step 2: Lifecycle tests with mocked database

Mock `@repo/database` (`vi.hoisted` pattern). Read each function body first; assert both return values and the `where`/`data` shapes passed to the mock (that is where tenant isolation lives):

1. `createInitialToken`: persists `token_hash` = hash of returned plaintext; `token_hint` = last 4 chars of plaintext; plaintext returned once and never passed to the database mock in any other field.
2. `rotateToken`: old token revoked, new token created with `rotated_from_token_id` set to the old id; new plaintext returned; **every** query in the flow carries `clerk_org_id` and `organisation_id` (assert on mock call args).
3. `revokeToken`: revokes only with matching org scoping; wrong-org id → not-found-shaped `TokenServiceError` (read the exact error code from the type union).
4. `listTokens` / `getActiveTokenHint`: return shapes match `TokenHistoryItem` / `ActiveTokenHint`; queries scoped.
5. `revokeAllFeedTokens`: the `updateMany`/equivalent carries both org identifiers.

**Verify**: `bunx vitest run packages/feeds/src/tokens/token-service.test.ts` → all pass.

### Step 3: Cross-org isolation integration tests (real database)

In `packages/feeds/index.integration.test.ts` (or a co-located `token-service.integration.test.ts` if the existing file's fixtures don't fit), guarded by the existing `DATABASE_URL` skip pattern, with two org fixtures:

1. Org A creates a feed + token. Org B calls `rotateToken`/`revokeToken` with org A's feed/token ids and org B's identifiers → not-found error; org A's token remains active in the database.
2. Full lifecycle round-trip: create → the plaintext's hash finds the row (`findUnique({ where: { token_hash: hashFeedToken(plaintext) } })` returns it) → rotate → old plaintext's hash now resolves to a revoked row, new plaintext's hash resolves to the active row → revoke-all → no active tokens remain for the feed.

**Verify**: with `DATABASE_URL` set, `bunx vitest run packages/feeds/index.integration.test.ts` → all pass; without it, suite skips cleanly.

## Test plan

This plan is the test plan (steps 1–3). Final check: `bunx vitest run packages/feeds` and `bun run check` → clean.

## Done criteria

ALL must hold:

- [ ] `packages/feeds/src/tokens/token-service.test.ts` exists; ≥9 tests across pure functions and mocked lifecycle, including the hard-coded hash-stability vector
- [ ] Cross-org isolation integration cases exist and pass under `DATABASE_URL`
- [ ] `git diff --stat -- packages/feeds/src/tokens/token-service.ts` shows zero changes
- [ ] `bunx vitest run packages/feeds` exits 0; `bun run check` exits 0
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` status row updated (note any bugs found)

## STOP conditions

Stop and report back (do not improvise) if:

- Any isolation test fails against the real implementation (cross-org rotate/revoke succeeds) — that is a security finding; report with evidence, do not patch the service.
- `token-service.ts` functions cannot be exercised without internals that resist mocking (e.g. module-level singletons) — report what blocks rather than refactoring the service.
- The existing integration fixtures conflict with new two-org token fixtures (ID collisions) — pick fresh fixed UUIDs/org IDs rather than editing shared fixtures.

## Maintenance notes

- The hash-stability vector is intentionally brittle: it converts "someone changed the token hashing" from a production outage into a failing test. Reviewers must treat a change to that expectation as a migration-requiring event.
- When NZ/UK feed features or token TTL policies are added, extend the lifecycle tests rather than starting a parallel file.
- Plan 002 (ETag/304) touches the render path that consumes `hashFeedToken`; these tests are its safety net.
