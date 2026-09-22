# Plan 161a: Establish the Xero hardening baseline, provider contract ledger and protected fixture ownership

> **Executor instructions**: Follow this plan step by step. Run every verification command and
> confirm the expected result before moving to the next step. If anything in "STOP conditions"
> occurs, stop and report - do not improvise. When done, update the status row for this plan in
> `plans/README.md` unless a reviewer dispatched you and told you they maintain the index.
>
> **Drift check (run first)**:
> ```bash
> git diff --stat 8652c31..HEAD -- \
>   packages/database/src packages/xero/src tooling/release
> ```
> At the time this plan was written that diff was empty. If it is now non-empty, compare the
> "Current state" excerpts below against the live code before proceeding. A mismatch is a STOP
> condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW (no production code paths change; test infrastructure and documents only)
- **Depends on**: none. This plan unblocks 161b through 161h.
- **Category**: tests, docs
- **Planned at**: commit `8652c31`, 22 September 2026 (re-stamped from `585f6cb`; the only changes between those commits are under `plans/`, so every source excerpt below is valid at both)
- **Programme charter**: `plans/161-harden-xero-connection-lifecycle.md`

## Why this matters

The seven plans that follow this one add database records, Redis keys and live Xero calls. The
repository already has a protected-fixture system that stops an integration test from touching
a record it does not own; it currently knows nothing about the record kinds 161b–161h introduce.
If those plans run first, an integration test can allocate an unprotected slot and mutate or
delete real data on the configured Neon database. This plan extends the ownership system before
anything can use it, and pins down which Xero endpoints are actually called so later plans do
not invent endpoint behaviour.

Nothing in this plan changes runtime behaviour. Its whole value is that it makes the next seven
plans safe to execute and stops them guessing.

## Current state

- `packages/database/src/live-test-fixture.ts` (265 lines) - allocates protected fixture slots
  for integration suites. It exports `LIVE_FIXTURE_SUITES`, a map keyed by integration test file
  path. **21 suites are registered today.**
- `packages/database/src/live-test-fixture.test.ts` - asserts the exact suite count **twice**:

  ```typescript
  // packages/database/src/live-test-fixture.test.ts:92 and again at :224
  expect(Object.keys(LIVE_FIXTURE_SUITES)).toHaveLength(21);
  ```

  Adding suites breaks both assertions. That is deliberate: the count is what prevents an
  unregistered suite from allocating an unprotected slot. Update the number; never loosen the
  assertion to a range or delete it.
- `packages/database/src/live-test-guard*` - guards that integration tests run only against an
  explicitly authorised target.
- `tooling/release/` - the release harness. Relevant files:
  `integration-inventory.ts`, `write-protected-manifest.ts`, `database-guard.ts`,
  `verify-live-target.ts`, `run-live-integration.ts`, `cleanup.ts`.
- Integration tests live at the **package root** in `packages/database`
  (for example `packages/database/xero-tenancy.integration.test.ts`) and co-located under `src/`
  in `packages/xero` and `packages/jobs`.

### Xero call sites that exist today

These are the files that make outbound Xero HTTP calls. The ledger in Step 2 must cover every
endpoint reachable from them:

- `packages/xero/src/oauth/service.ts` - token exchange, refresh, connection inventory, disconnect
- `packages/xero/src/au/read.ts`, `packages/xero/src/au/write.ts` - AU Payroll
- `packages/xero/src/nz/`, `packages/xero/src/uk/` - present but not activated
- `packages/xero/src/rate-limit/xero-fetch.ts` - the single HTTP choke point all of the above use

### Repository conventions to match

- Service functions return `Result<T, E>` from `@repo/core`. Do not throw for expected failures.
- Named exports only. No default exports. No barrel files except at package root.
- Strict TypeScript. No `any`. No `as` casts without a justifying comment.
- Zod on all external input, including every Xero response.
- Tables `snake_case` plural, columns `snake_case`, every table has `id`/`created_at`/`updated_at`.
- Unit tests co-located as `foo.test.ts`. No `console.log`; use `@repo/observability`.
- Australian English in all copy, comments and docs. **No em dashes anywhere.**

## Commands you will need

**Fresh worktree setup.** This repository's `.env*` files are gitignored (`.gitignore:35`), so
a new worktree has none of them. Before running any gate, from the worktree root:

```bash
bun install --frozen-lockfile
```

`bun run test`, `bun run check`, `bun run typecheck` and `bun run boundaries` then work with no
further setup. **`bun run build` additionally requires two variables**, because
`packages/xero/keys.ts:74` validates at module load whenever `NODE_ENV` is not `test`, and
`packages/database/keys.ts:10` has no fallback:

- `DATABASE_URL` - any syntactically valid Postgres URL is enough for a build; the client is
  lazy and nothing connects. Do **not** point it at the real database.
- `XERO_TOKEN_ENCRYPTION_KEY` - any 32-byte base64 value is enough for a build.

Supply them for the build command only. **Do not create a committed `.env` file, do not copy the
developer's real values, and do not make either variable optional in `keys.ts` to avoid setting
them.**

**Two commands are not local gates and appear in no Done criteria here.**
`bun run preflight <app|api|web>` is a production deployment gate: it requires a positional
argument and the production-only variables `NEXT_PUBLIC_LAUNCH_MODE`, four Sentry variables and
three Better Stack variables. `bun run test:release` is a deployed-candidate Playwright suite:
`tooling/release/e2e/environment.ts:11-17` requires six `TC_*` variables validated when the
config is merely loaded, and `tooling/release/playwright.config.ts:22-33` declares Firefox and
WebKit projects whose browsers are not installed by default. Both run during the Plan 161h
rollout and the Plan 160 campaign. **Never stub either to make it run locally.**

| Purpose | Command | Expected on success |
|---|---|---|
| Install (fresh worktree only) | `bun install --frozen-lockfile` | exit 0 |
| Lint | `bun run check` | exit 0 |
| Types | `bun run typecheck` | exit 0 |
| Database unit tests | `bun run --cwd packages/database test` | exit 0 |
| Release tool tests | `bun run test:release-tools` | exit 0 |
| Release tool types | `bun run typecheck:release-tools` | exit 0 |
| Whitespace | `git diff --check` | exit 0 |

## Scope

**In scope:**
- `packages/database/src/live-test-fixture.ts`
- `packages/database/src/live-test-fixture.test.ts`
- `packages/database/src/live-test-guard*.ts` and their tests
- `tooling/release/integration-inventory.ts`, `write-protected-manifest.ts` and their tests
- `plans/161-xero-provider-contract.md` (create)
- `plans/README.md` (status row only)

**Out of scope - do NOT touch:**
- Any file under `packages/xero/src/` except to **read** it. This plan changes no provider code.
- `packages/database/prisma/schema.prisma`. The new tables belong to 161b; do not pre-create them.
- Any existing integration test body. You register suites; you do not rewrite their assertions.
- `packages/database/seed.ts` and any migration. Seeding and migration are prohibited here.

## Git workflow

- Branch: `codex/xero-connection-hardening` (shared across 161a–161h), created from the current
  release/execution branch.
- Conventional commits, one logical change per commit. Example from `git log`:
  `fix(email): declare vitest dependency and test script for package boundaries`
- Do NOT push or open a PR.

## Steps

### Step 1: Record the baseline

Run and capture the output verbatim into `plans/161-xero-execution-report.md` under a
"Baseline" heading:

```bash
git rev-parse HEAD
git status --short
bun --version
node --version
```

Confirm `bun --version` reports 1.4.0 (the value of `packageManager` in the root
`package.json`) and Node satisfies `22 || >=24.0.0`.

**Verify**: `plans/161-xero-execution-report.md` exists and contains the four outputs.

### Step 2: Write the provider contract ledger

Create `plans/161-xero-provider-contract.md`. One row per **actually called** endpoint. Find them
by reading the call sites listed in "Current state" - do not work from memory or from the Xero
docs index.

Columns: method and path, token class, minimum documented scope, tenant-header requirement,
pagination/completeness contract, idempotency and uncertain-outcome rules, deadline class,
rate bucket, source URL, date read, and verification status.

Every row's verification status is one of exactly: `DOCUMENTED` (confirmed from a primary Xero
source you read), `OBSERVED` (confirmed from this repository's code), `INFERRED`, or
`NOT VERIFIED`. Mark the distinction explicitly. An inference is never promoted to documented.

For the app-management endpoints specifically, you must establish from a primary source: the
singular token form parameter name, the `app.connections` permission, the response shape
(management access tokens do not carry a refresh token), the GET inventory scope, and the
targeted DELETE semantics. If you cannot read those guides, mark them `NOT VERIFIED` and say so.
**Do not invent pagination parameters, filters, token audiences or endpoint paths.** Plan 161f
is written to proceed with deletion disabled when these rows are `NOT VERIFIED`.

**Verify**: `grep -c '^|' plans/161-xero-provider-contract.md` returns at least 12 (one header,
one separator, and a row for each of code exchange, refresh, connection inventory, targeted
delete, organisation discovery, AU employees, AU leave, AU pay items, AU leave write, and
management token acquisition).

### Step 3: Register the new fixture suites

In `packages/database/src/live-test-fixture.ts`, add `LIVE_FIXTURE_SUITES` entries for every
integration suite plans 161b–161h will add:

```text
packages/database/xero-lifecycle-migration.integration.test.ts
packages/xero/src/oauth/credential-owner.integration.test.ts
packages/xero/src/oauth/connection-cleanup.integration.test.ts
packages/xero/src/rate-limit/shared-store.integration.test.ts
packages/jobs/src/handlers/reconcile-xero-connections.integration.test.ts
```

Follow the shape of the existing entries exactly. Each needs its own owned slot allocation; do
not let two suites share one.

**Verify**: `bun run --cwd packages/database test` - fails at the two `toHaveLength(...)`
assertions. That failure is expected and proves the guard works. Proceed to Step 4.

### Step 4: Update the suite-count assertions

Change both `expect(Object.keys(LIVE_FIXTURE_SUITES)).toHaveLength(N)` occurrences
(`live-test-fixture.test.ts:92` and `:224`) to the **actual** map length after your change.

**Derive the number; do not assume it.** The baseline is 21 and this plan adds five, so 26 is
correct *only if nothing else has landed first*. `plans/159-xero-sync-and-onboarding.md`
registers four further suites (`sync-run-lifecycle`, `xero-person-reconciliation`,
`initial-xero-sync`, `xero-sync-migration`) and bumps the same two assertions. If 159 landed
first the baseline is 25 and the answer is 30. Whichever plan lands second recounts.

Read the current number out of the file rather than trusting this paragraph:

```bash
grep -n "toHaveLength(" packages/database/src/live-test-fixture.test.ts
grep -c "integration.test.ts" packages/database/src/live-test-fixture.ts
```

The second command is the authoritative count of registered suites. Both assertions must equal
it. If you hit a merge conflict on those lines, the resolution is always the real map length,
confirmed by `bun run --cwd packages/database test` passing.

**Verify**: `bun run --cwd packages/database test` → exit 0.

### Step 5: Extend global key ownership

Extend manifest global-key allocation, inventory and cleanup in
`packages/database/src/live-test-fixture.ts` and `tooling/release/write-protected-manifest.ts`
to cover the new global record kinds: credential owners, provider app identifiers, provider
connection records, tenant bindings, OAuth attempt records, cleanup requests and attempts, and
shared-store namespaces.

Add a test proving a fixture **cannot** attach to or delete an existing unowned global record
merely because an identifier matches. This is the single most important test in this plan.

**Verify**: `bun run --cwd packages/database test && bun run test:release-tools` → exit 0, and
the new negative-ownership test is present and passing.

### Step 6: Document the fixture contract

Add a short section to `plans/161-xero-execution-report.md` listing each new suite, its owned
slot, its global key kinds and its cleanup path.

**Verify**: `bun run check && bun run typecheck && git diff --check` → all exit 0.

## Test plan

New tests, all in `packages/database/src/live-test-fixture.test.ts` (model the structure on the
existing tests in that file):

1. Each of the five new suites allocates a distinct, non-overlapping slot.
2. The suite count assertion matches the registered map (update in place, both occurrences).
3. **Negative ownership**: allocating a fixture for a new global record kind does not grant
   access to a pre-existing record with a colliding identifier. Assert the attempt is rejected.
4. Cleanup for each new global key kind removes only manifest-owned keys. Assert that an
   unowned key with a similar prefix survives.

Do not add a test that connects to the database. These are pure unit tests over the allocation
map; the guarded integration behaviour is exercised by 161b onward.

## Done criteria

All must hold:

- [ ] `bun run check` exits 0
- [ ] `bun run typecheck` exits 0
- [ ] `bun run --cwd packages/database test` exits 0
- [ ] `bun run test:release-tools` exits 0
- [ ] `bun run typecheck:release-tools` exits 0
- [ ] `git diff --check` exits 0
- [ ] `plans/161-xero-provider-contract.md` exists, and every row has a verification status of `DOCUMENTED`, `OBSERVED`, `INFERRED` or `NOT VERIFIED`
- [ ] Both `toHaveLength(...)` assertions in `packages/database/src/live-test-fixture.test.ts` equal the output of `grep -c "integration.test.ts" packages/database/src/live-test-fixture.ts`, and `bun run --cwd packages/database test` exits 0
- [ ] `git status --short` shows no modified file outside the In scope list
- [ ] `plans/README.md` status row for 161a updated

## STOP conditions

Stop and report; do not improvise:

- `LIVE_FIXTURE_SUITES` no longer exists, or the count assertions are already gone from
  `live-test-fixture.test.ts`. The fixture system has been redesigned; report what replaced it.
- The negative-ownership test in Step 5 cannot be made to pass, because that means the fixture
  system does not actually prevent unowned access. Report this. **Do not weaken the test.**
- You cannot establish the app-management endpoint contract from a primary source. This is an
  expected outcome, not a failure: mark those ledger rows `NOT VERIFIED`, finish every other step,
  and report which rows are unresolved. Plan 161f depends on this being reported honestly.
- Any step tempts you to run `bun run migrate`, `bun run db:push`, `prisma migrate dev`, a reset,
  a rebaseline, or `packages/database/seed.ts`. All are prohibited in this plan.
- You are about to write a real endpoint credential, token, or any part of
  `XERO_CLIENT_SECRET` / `XERO_TOKEN_ENCRYPTION_KEY` into the ledger or the report. Stop.
  The ledger records endpoint shapes and identifiers, never secret values.

## Maintenance notes

- **The suite count assertion is a feature.** Every future integration suite must be registered
  in `LIVE_FIXTURE_SUITES` and must bump the count. A reviewer who sees the count changed without
  a corresponding suite registration should reject the change.
- The provider contract ledger is the authority 161c, 161e and 161f cite for deadlines, rate
  buckets and DELETE semantics. When Xero changes a documented limit, update the ledger row and
  its date first, then the code that cites it.
- Rows left `NOT VERIFIED` are the programme's external blockers. They are tracked in the charter's
  sign-off criteria and must not be quietly marked verified later without a fresh primary source.
