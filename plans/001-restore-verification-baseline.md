# Plan 001: Restore a green `bun run test` and `bun run typecheck` baseline

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 960c07b..HEAD -- packages/observability packages/notifications packages/jobs packages/availability turbo.json`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `960c07b`, 2026-07-19

## Why this matters

CI has failed on `main` for three consecutive runs since 2026-07-16 (run ids
29495032672, 29491133778, 29490711884). In every one of those runs the `Run
unit tests` step failed and `Run integration tests` was therefore **skipped** —
so the integration suite has not executed in days. Until this is fixed there is
no trustworthy gate to verify any other change against, which is why this plan
must land before every other plan in `plans/`.

There are two independent causes. Neither is a real product bug: one is a
missing package manifest field, the other is a test assertion that was not
updated when the production code around it improved.

## Current state

### Cause 1 — `@repo/observability` has no `exports` map

`packages/observability/package.json` declares no `exports`, no `main` and no
`types`:

```json
{
  "name": "@repo/observability",
  "version": "0.0.0",
  "private": true,
  "scripts": { ... },
  "dependencies": { ... },
  "devDependencies": { ... }
}
```

The package's modules live at the package root (verified with `ls`):

```
client.ts  edge.ts  error.ts  instrumentation.ts  keys.ts  log.ts
next-config.ts  server.ts  status/
```

`status/` is a directory containing `index.tsx` and `types.ts`.

Consumers import subpaths. Verified counts across `apps/` and `packages/`
(excluding `node_modules`):

| Specifier | Import sites |
|---|---|
| `@repo/observability/log` | 36 |
| `@repo/observability/instrumentation` | 6 |
| `@repo/observability/client` | 6 |
| `@repo/observability/server` | 3 |
| `@repo/observability/next-config` | 3 |
| `@repo/observability/keys` | 3 |
| `@repo/observability/edge` | 3 |
| `@repo/observability/error` | 2 |

Two suites fail because of this. `packages/notifications/src/email-queue-service.ts:7`:

```ts
import { log } from "@repo/observability/log";
```

Running `cd packages/notifications && bun run test` gives:

```
FAIL  src/dispatch.test.ts [ src/dispatch.test.ts ]
FAIL  src/email-queue-service.test.ts [ src/email-queue-service.test.ts ]
Error: Cannot find package '@repo/observability/log' imported from
  /home/hilton/Documents/teamcalendar/packages/notifications/src/email-queue-service.ts
Test Files  2 failed | 4 passed (6)
```

Suites that pass do so **only because they mock the specifier before it is
resolved**. For example `packages/feeds/src/render/render-feed.test.ts:46` has
`vi.mock("@repo/observability/log", ...)`. The two failing notifications tests
mock `server-only`, `@repo/database` and `@repo/email` but not
`@repo/observability/log` — see `packages/notifications/src/dispatch.test.ts:3-4`.

This failure also cascades into `packages/availability`. Running
`cd packages/availability && bun run test` gives
`Test Files  1 failed | 31 passed (32)`, where the failure is `index.test.ts`
importing through `@repo/notifications`. Note that
`packages/availability/index.test.ts:195` *does* call
`vi.mock("@repo/observability/log", ...)` and still fails — vitest must resolve
a module id before it can register a mock for it, so mocking cannot rescue an
unresolvable specifier unless `{ virtual: true }` is passed.

### Cause 2 — a stale assertion in `packages/jobs`

Commit `3adb8ed` ("feat(availability): allow withdraw of approved leave and
harden sync boundaries") changed the production query at
`packages/jobs/src/handlers/sync-xero-leave-records.ts:468-478`:

```ts
const records = await database.availabilityRecord.findMany({
  where: {
    ...scoped(context),
    source_remote_id: { in: [...new Set(sourceRemoteIds)] },
    source_type: { in: ["xero_leave", "team_calendar_leave"] },
  },
  select: {
    approval_status: true,
    failed_action: true,
    id: true,
    source_remote_hash: true,
    source_remote_id: true,
```

`scoped(context)` expands to `clerk_org_id` + `organisation_id`. The test file
was last touched in an earlier commit (`12efa92`) and still asserts the old
shape at `packages/jobs/src/handlers/sync-xero-leave-records.test.ts:300-314`:

```ts
expect(mocks.availabilityRecordFindMany).toHaveBeenNthCalledWith(
  1,
  expect.objectContaining({
    where: expect.objectContaining({
      source_remote_id: {
        in: [
          LEAVE_APPLICATION_ID,
          LEAVE_APPLICATION_ID_2,
          LEAVE_APPLICATION_ID_3,
        ],
      },
      source_type: "xero_leave",
    }),
  })
);
```

**The production code is correct and must not be changed.** It is strictly
better than what the test expects: it is now tenant-scoped and selects only the
columns it needs. Only the assertion is wrong.

**Important**: there is a *second* `availabilityRecordFindMany` assertion in the
same file, at lines 177-187, which asserts `source_type: "xero_leave"` for the
**stale-archival** query. That one is **correct and must be left alone** —
`archiveStaleRecords` at `sync-xero-leave-records.ts:676-682` genuinely still
uses `source_type: "xero_leave"`. Only the `toHaveBeenNthCalledWith(1, ...)`
assertion at lines 300-314 is stale.

### Conventions that apply

- No barrel files except at package root; named exports only (`CLAUDE.md`).
- Tests are co-located: `foo.ts` has `foo.test.ts` beside it.
- Australian English in comments. No em dashes anywhere.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck (cold) | `bun run typecheck --force` | exit 0, no `error TS` lines |
| All tests (cold) | `bun run test --force` | exit 0, no `Failed:` line |
| Notifications suite | `cd packages/notifications && bun run test` | `Test Files  6 passed (6)` |
| Availability suite | `cd packages/availability && bun run test` | `Test Files  32 passed (32)` |
| Jobs suite | `cd packages/jobs && bun run test` | `Test Files  8 passed (8)` |
| Lint | `bun run check` | exit 0 |

Always pass `--force` on the repo-root turbo commands in this plan. Turbo caches
`test` and `typecheck` with no declared `inputs`, so a cached green result can
outlive the change that broke it.

## Scope

**In scope** (the only files you should modify):
- `packages/observability/package.json`
- `packages/jobs/src/handlers/sync-xero-leave-records.test.ts`

**Out of scope** (do NOT touch, even though they look related):
- `packages/jobs/src/handlers/sync-xero-leave-records.ts` — the production query
  is correct; the test is what is wrong. Changing production code to satisfy a
  stale test would remove tenant scoping from a tenant-scoped query.
- The assertion at `sync-xero-leave-records.test.ts:177-187` — correct as-is,
  see "Current state".
- `turbo.json` — the `dependsOn: ["^test"]` cascade and the missing `inputs`
  declarations are real issues but belong to a separate plan. Do not change
  the task graph here.
- Adding `vi.mock("@repo/observability/log", ...)` to the failing notifications
  tests. That is a band-aid that spreads the workaround further; this plan
  fixes the root cause instead.
- Any `packages/*/vitest.config.mts` file.

## Git workflow

- Branch: `advisor/001-restore-verification-baseline`
- Conventional commits, one logical change per commit. Recent examples from
  `git log`: `fix(ci): run the pipeline on preview`,
  `fix(xero): protect rotated refresh token against transaction abort`.
- Suggested commits: `fix(observability): add subpath exports map` and
  `test(jobs): update stale leave-records query assertion`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add an `exports` map to `@repo/observability`

Edit `packages/observability/package.json`. Add an `exports` field covering
every subpath in the table above, plus the package root and `./status`. Because
the repo consumes workspace packages as TypeScript source (see
`packages/core/package.json`, which uses `"main": "./index.ts"` and
`"types": "./index.ts"` with no build step), the export targets are `.ts`/`.tsx`
files directly.

Target shape:

```json
"exports": {
  "./client": { "types": "./client.ts", "default": "./client.ts" },
  "./edge": { "types": "./edge.ts", "default": "./edge.ts" },
  "./error": { "types": "./error.ts", "default": "./error.ts" },
  "./instrumentation": { "types": "./instrumentation.ts", "default": "./instrumentation.ts" },
  "./keys": { "types": "./keys.ts", "default": "./keys.ts" },
  "./log": { "types": "./log.ts", "default": "./log.ts" },
  "./next-config": { "types": "./next-config.ts", "default": "./next-config.ts" },
  "./server": { "types": "./server.ts", "default": "./server.ts" },
  "./status": { "types": "./status/index.tsx", "default": "./status/index.tsx" }
}
```

Place it after `"private": true` and before `"scripts"`.

**Verify**: `cd packages/notifications && bun run test`
→ `Test Files  6 passed (6)`, exit 0.

### Step 2: Confirm the cascade into `packages/availability` is cleared

No edit. This step only confirms Step 1 fixed the downstream failure.

**Verify**: `cd packages/availability && bun run test`
→ `Test Files  32 passed (32)`, exit 0.

If `index.test.ts` still fails with a resolution error, STOP and report.

### Step 3: Update the stale assertion in `packages/jobs`

In `packages/jobs/src/handlers/sync-xero-leave-records.test.ts`, change **only**
the `toHaveBeenNthCalledWith(1, ...)` assertion at lines 300-314 so it matches
the current production query. It must assert the tenant scoping and the widened
`source_type`:

```ts
expect(mocks.availabilityRecordFindMany).toHaveBeenNthCalledWith(
  1,
  expect.objectContaining({
    where: expect.objectContaining({
      clerk_org_id: CLERK_ORG_ID,
      organisation_id: ORGANISATION_ID,
      source_remote_id: {
        in: [
          LEAVE_APPLICATION_ID,
          LEAVE_APPLICATION_ID_2,
          LEAVE_APPLICATION_ID_3,
        ],
      },
      source_type: { in: ["xero_leave", "team_calendar_leave"] },
    }),
  })
);
```

Asserting the tenant scoping is deliberate, not incidental: `CLAUDE.md` names
`clerk_org_id` query isolation as an explicitly must-test invariant, and this
assertion is now the thing that would catch its removal.

Leave the `select` shape unasserted — `expect.objectContaining` on `where` does
not require it, and pinning the column list would make the test brittle against
harmless future additions.

**Verify**: `cd packages/jobs && bun run test`
→ `Test Files  8 passed (8)`, `Tests  32 passed (32)`, exit 0.

### Step 4: Confirm the whole repo is green from cold

**Verify**: `bun run test --force`
→ exit 0, no `Failed:` line in the output. Every package with a `test` script
(`apps/api`, `apps/app`, `packages/availability`, `packages/billing`,
`packages/core`, `packages/database`, `packages/feeds`, `packages/jobs`,
`packages/notifications`, `packages/xero`) must run. Because turbo's `test`
task uses `dependsOn: ["^test"]`, a single failure stops downstream suites, so
"no `Failed:` line" is the signal that the whole graph executed.

**Verify**: `bun run check` → exit 0.

### Step 5: Resolve the typecheck discrepancy

There is an unresolved discrepancy that this step must settle empirically.

Locally, on a clean tree at `960c07b`, `bun run typecheck --force` **fails**:

```
@repo/availability:typecheck: ../notifications/src/email-queue-service.ts(7,21):
  error TS2307: Cannot find module '@repo/observability/log' or its
  corresponding type declarations.
Tasks:    12 successful, 14 total
Failed:    @repo/availability#typecheck
```

But CI run 29495032672, on that same commit, reported the `Typecheck` step as
**passing** and failed only at `Run unit tests`. The CI logs for that run have
since expired, so the reason for the divergence could not be determined when
this plan was written. `packages/typescript-config/base.json` sets
`moduleResolution: NodeNext`, which requires an `exports` map for subpath
resolution; packages extending `nextjs.json` use bundler resolution and tolerate
its absence, which is the most likely explanation for why only
`@repo/availability` surfaces it.

Step 1 should fix this regardless of the cause.

**Verify**: `bun run typecheck --force` → exit 0, no `error TS` lines.

If typecheck still fails after Step 1, STOP and report the full error output —
do not add `// @ts-ignore`, do not relax `moduleResolution`, and do not edit any
`tsconfig.json`.

## Test plan

This plan writes no new test files. Its purpose is to make ~470 existing tests
executable again. The verification is that previously-failing suites pass and
previously-blocked suites now run:

- `packages/notifications`: `2 failed | 4 passed` → `6 passed`.
- `packages/availability`: `1 failed | 31 passed` → `32 passed` (201 tests).
- `packages/jobs`: `1 failed | 7 passed` → `8 passed` (32 tests).
- `apps/api`, `apps/app` and every other suite: must now execute at all, since
  the `^test` cascade previously stopped them.

Do not add new test cases in this plan. If you spot a coverage gap while
working, note it in your report rather than acting on it.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `bun run typecheck --force` exits 0 with no `error TS` lines
- [ ] `bun run test --force` exits 0 with no `Failed:` line
- [ ] `bun run check` exits 0
- [ ] `cd packages/notifications && bun run test` reports `Test Files  6 passed (6)`
- [ ] `cd packages/availability && bun run test` reports `Test Files  32 passed (32)`
- [ ] `cd packages/jobs && bun run test` reports `Test Files  8 passed (8)`
- [ ] `git status --porcelain` lists only `packages/observability/package.json`
      and `packages/jobs/src/handlers/sync-xero-leave-records.test.ts`
      (plus `plans/README.md`)
- [ ] `git diff -- packages/jobs/src/handlers/sync-xero-leave-records.ts` is empty
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The code at the locations in "Current state" doesn't match the excerpts.
- Adding the `exports` map breaks a previously-passing import — most likely a
  deep import of a path not in the table above. Report the failing specifier;
  do not guess at additional export entries beyond the nine listed.
- `bun run typecheck --force` still fails after Step 1 (see Step 5).
- Any suite outside `notifications`, `availability` and `jobs` that was passing
  before your change starts failing.
- You find yourself wanting to edit `sync-xero-leave-records.ts`,
  any `tsconfig.json`, `turbo.json`, or any `vitest.config.mts`. All are out of
  scope; the need to touch them means an assumption in this plan is wrong.

## Maintenance notes

- **For the reviewer**: the single highest-value thing to check is that
  `packages/jobs/src/handlers/sync-xero-leave-records.ts` is untouched. The
  failure mode this plan guards against is an executor "fixing" the production
  query to match the stale test, which would silently remove tenant scoping
  from a tenant-scoped query.
- Adding the `exports` map makes `@repo/observability` the first workspace
  package with one. If further subpaths are added to the package later, they
  must be added to the map too or they will not resolve — this is a deliberate
  tradeoff, since strict resolution is what surfaced this bug.
- Once this lands, the ~36 `vi.mock("@repo/observability/log", ...)` calls
  scattered through the suites are no longer load-bearing for *resolution*
  (they remain useful for silencing log output). Do not remove them as part of
  this plan.
- **Deliberately deferred**: turbo's `dependsOn: ["^test"]` means one package's
  failure still prevents every downstream suite from running, so a single red
  package hides the state of all the others. The missing `inputs` declarations
  on `test`/`typecheck` likewise let a stale green cache replay over a broken
  change, which is how this sat on `main` for three days. Both are real and
  both are out of scope here; they need their own plan.
