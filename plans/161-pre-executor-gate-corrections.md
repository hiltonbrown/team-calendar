# Plan 161-pre: Record the verification baseline and close the last environment gaps before 161a starts

> **Executor instructions**: Follow this plan step by step. Run every verification command and
> confirm the expected result before moving to the next step. If anything in "STOP conditions"
> occurs, stop and report - do not improvise. When done, update the status row for this plan in
> `plans/README.md` unless a reviewer dispatched you and told you they maintain the index.
>
> **Drift check (run first)**:
> ```bash
> git rev-parse --short HEAD
> git diff --stat 8652c31..HEAD -- package.json turbo.json .gitignore \
>   packages/next-config packages/xero/keys.ts packages/database/keys.ts tooling/release
> ```
> At the time this plan was written that diff was empty. If it is now non-empty, re-run the
> baseline in Step 1 and compare against the recorded results below before proceeding.

## Status

- **Priority**: P1 - it gates all eight Xero hardening sub-plans
- **Effort**: S
- **Risk**: LOW (one new unit test, two `.env.example` comment blocks, one report file)
- **Depends on**: none. **This must land before `plans/161a-xero-baseline-and-fixture-ownership.md`.**
- **Category**: dx, tests
- **Planned at**: commit `8652c31`, 22 September 2026
- **Programme charter**: `plans/161-harden-xero-connection-lifecycle.md`

## What already happened, so you do not redo it

An earlier review found that three gate commands could not exit 0 in an executor's environment
and that sub-plans 161a-161h listed them as Done criteria. **Those plan documents have already
been corrected.** Do not re-edit them. Specifically, already applied:

- `bun run preflight` was removed from the Commands tables, Step verifications and Done criteria
  of 161e and 161h, and replaced with `bun run --cwd packages/next-config test`.
- `bun run test:release` was removed from the Commands tables and Done criteria of 161f, 161g
  and 161h, and replaced with the filtered `apps/app` Xero tests plus a written-not-executed
  browser-assertion deliverable.
- A "Fresh worktree setup" block was added to all eight sub-plans, documenting
  `bun install --frozen-lockfile` and the two variables `bun run build` needs.
- All eight sub-plans were re-stamped from `585f6cb` to `8652c31`.

What remains is the work that actually touches the repository, below.

## Why this matters

Sub-plans 161e and 161h now verify their preflight behaviour through
`bun run --cwd packages/next-config test` instead of `bun run preflight`. That gate is already
real: `packages/next-config/preflight.test.ts` exists and the command passes 37 tests, including
one named "never prints or includes secret values in failure messages". Step 3 confirms it and
records that 161c and 161e **extend** that file rather than creating one, which is exactly the
mistake a forward reference invites.

`main` is green on every gate that can be green locally. Recording that baseline is
what makes a later failure attributable: without it, an executor that hits a red gate in 161c
cannot tell whether it broke something or inherited it.

## Current state

### Verified baseline at `8652c31`

Every command below was run against a clean tree at this commit. These are observed results:

| Gate | Command | Result |
|---|---|---|
| Lint | `bun run check` | **exit 0** - 1033 files checked, no fixes applied |
| Types | `bun run typecheck` | **exit 0** - 19/19 turbo tasks successful |
| Boundaries | `bun run boundaries` | **exit 0** - 994 files in 21 packages, no issues |
| Unit tests | `bun run test` | **exit 0** - 18/18 turbo tasks successful |
| Build | `bun run build` | **exit 0** - 4/4 turbo tasks successful |
| Release tool tests | `bun run test:release-tools` | **exit 0** - 11 files, 47 tests passed |
| Release tool types | `bun run typecheck:release-tools` | **exit 0** |
| Filtered app tests | `bun run --cwd apps/app test 'app/(authenticated)/settings/integrations/xero'` | **exit 0** - 6 files, 43 tests; the filter selects exactly the 6 files that exist under that directory |

Per-package counts observed: `@repo/core` 6 files / 80 tests, `@repo/database` 16 files / 66
tests, `@repo/observability` 7 files / 62 tests, `apps/app` 110 files / 559 tests, `apps/web` 36
files / 134 tests. Plan 159's tripwire commands reported **57** (`packages/jobs`) and **17**
(`apps/app`).

### The preflight entry point

`packages/next-config/bin/preflight.ts:5-15` requires a positional argument:

```typescript
const args = process.argv.slice(2);
const appNameArg = args[0] as AppName;
const [, launchModeValue] = args;
// ...
if (!["app", "api", "web"].includes(appNameArg)) {
  console.error("Usage: bun run preflight <app|api|web> [early_access|paid]");
  process.exit(1);
}
```

With the argument, on a normally configured development machine, it still fails by design:

```
$ bun run preflight app
Production preflight failed for app "app" in mode "early_access":
  - NEXT_PUBLIC_LAUNCH_MODE is missing or invalid. Must be "early_access" or "paid".
  - NEXT_PUBLIC_SENTRY_DSN is missing or empty
  - SENTRY_ORG is missing or empty
  - SENTRY_PROJECT is missing or empty
  - SENTRY_AUTH_TOKEN is missing or empty
  - BETTERSTACK_API_KEY, BETTERSTACK_STATUS_PAGE_ID, BETTERSTACK_STATUS_PAGE_URL must be configured together
```

**That is correct behaviour.** Preflight exists to stop a deployment missing production
configuration. It is a deployment gate, not a development gate.

The validator underneath it is **already tested**. `packages/next-config/preflight.test.ts`
exists, and `bun run --cwd packages/next-config test` passes 3 files / 37 tests at `8652c31`.
Its `describe("production preflight validation")` block already includes
`it("never prints or includes secret values in failure messages")` at line 264. This is the gate
161e and 161h now use in place of `bun run preflight`.

### Environment files are gitignored

`.gitignore:35-36`:

```
.env*
!**/.env.example
```

Five environment files exist on a configured machine and are all gitignored, so a fresh
`git worktree add` contains none: `.env.local`, `apps/api/.env.local`, `apps/app/.env.local`,
`apps/web/.env.local`, `packages/database/.env`.

Exactly **two** variables are hard requirements; everything else in the app and API env graph is
`.optional()`. Verified by importing `apps/app/env.ts` and `apps/api/env.ts` in production mode
with no env files and only these two set, which both succeeded:

- `DATABASE_URL` - required with no fallback at `packages/database/keys.ts:10`
- `XERO_TOKEN_ENCRYPTION_KEY` - required at `packages/xero/keys.ts:56`, validated at module load
  whenever `NODE_ENV` is not `test` (`packages/xero/keys.ts:74`)

`bun run test` and `bun run typecheck` survive without them because `packages/xero/keys.ts:26-33`
injects test-only fallbacks, `packages/database/src/client.ts:31-34` wraps client construction in
`createLazyClient` ("Keep imports harmless for builds and mocked unit tests"), and
`packages/database/prisma.config.ts:6-11` wraps `process.loadEnvFile` in `try/catch`. Only
`NODE_ENV=production` paths break.

### Repository conventions to match

- Australian English. **No em dashes anywhere.**
- Optional env vars with a format constraint must be **absent or commented out, never `""`**.
  `packages/xero/keys.ts:38` sets `emptyStringAsUndefined: true`; keep that.
- `.env.example` files are tracked and contain **names and placeholders only, never real values**.
- Named exports only. Strict TypeScript, no `any`. Co-located `foo.test.ts`. Vitest as runner.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install (fresh worktree only) | `bun install --frozen-lockfile` | exit 0 |
| Lint | `bun run check` | exit 0 |
| Types | `bun run typecheck` | exit 0 |
| Build | `bun run build` | exit 0 |
| Unit tests | `bun run test` | exit 0 |
| Boundaries | `bun run boundaries` | exit 0 |
| next-config units | `bun run --cwd packages/next-config test` | exit 0 |
| Release tool tests | `bun run test:release-tools` | exit 0 |
| Release tool types | `bun run typecheck:release-tools` | exit 0 |
| Whitespace | `git diff --check` | exit 0 |

`bun run build` needs `DATABASE_URL` and `XERO_TOKEN_ENCRYPTION_KEY` in a fresh worktree; any
syntactically valid Postgres URL and any 32-byte base64 value are sufficient. Supply them for
that command only.

## Scope

**In scope:**
- `plans/161-xero-execution-report.md` (create) - the baseline and preflight-gate record
- `apps/app/.env.example`, `apps/api/.env.example` - comment lines only
- `plans/README.md` (status row only)

**Out of scope - do NOT touch:**
- **Sub-plans 161a through 161h, and the charter.** Their gate corrections are already applied.
  Re-editing them will conflict with work already done.
- **All of `packages/next-config/`.** Its preflight validator and its 37 tests are already
  correct. You confirm the gate; you do not change it. **Do not relax preflight so a local run
  passes**, and do not add the `XERO_*` cases that 161c and 161e own.
- `tooling/release/playwright.config.ts` and `tooling/release/e2e/`. The release suite correctly
  requires a deployed candidate. **Do not add local fallbacks or stub the `TC_*` variables.**
- Any `keys.ts`. `DATABASE_URL` and `XERO_TOKEN_ENCRYPTION_KEY` are required on purpose.
  **Do not make either optional.**
- Any real `.env*` file. You edit `.env.example` comments only.
- All product code in `packages/` and `apps/` beyond the two `.env.example` files.

## Git workflow

- Branch: `codex/xero-connection-hardening` (shared with 161a-161h), from the current
  release/execution branch.
- Conventional commits. Suggested: `docs(plans): record verified gate baseline for xero hardening`,
  then `test(next-config): cover preflight variable validation`.
- Do NOT push or open a PR.

## Steps

### Step 1: Record the verified baseline

Run each gate and record its exact exit code and summary line into
`plans/161-xero-execution-report.md` under a "Pre-execution baseline" heading, alongside
`git rev-parse HEAD`, `bun --version` and `node --version`:

```bash
bun run check
bun run typecheck
bun run boundaries
bun run test
bun run build
bun run test:release-tools
bun run typecheck:release-tools
```

Confirm `bun --version` reports 1.4.0 (the root `package.json` `packageManager` value) and Node
satisfies `22 || >=24.0.0`.

Compare against the table in "Current state". **If any gate that was green there is now red,
that is a pre-existing failure on `main` and a STOP condition** - it is not something 161a-161h
should inherit or work around.

**Verify**: `plans/161-xero-execution-report.md` contains a row per gate with an observed exit
code, and every row reads 0.

### Step 2: Mark the mandatory variables in the env examples

Add comment lines to `apps/app/.env.example` and `apps/api/.env.example` marking `DATABASE_URL`
and `XERO_TOKEN_ENCRYPTION_KEY` as **required for `bun run build` and for production**, and every
other entry as optional. Note in the same comment that an optional variable with a format
constraint must be absent or commented out, never `""`.

**Names and placeholders only. Never a real value.**

**Verify**: `git diff apps/app/.env.example apps/api/.env.example` shows comment-line additions
only, no value changes. `bun run check && git diff --check` exit 0.

### Step 3: Confirm the preflight gate, and record where later plans extend it

Sub-plans 161e and 161h verify their preflight work with
`bun run --cwd packages/next-config test`. **That gate already exists and already passes.** Do
not create a new test file and do not add a `test` script; both are present.

Confirm:

```bash
bun run --cwd packages/next-config test
```

Expected: exit 0, 3 test files, **37 tests**. The relevant file is
`packages/next-config/preflight.test.ts`, whose `describe("production preflight validation")`
block already covers valid app/api/web deployments, launch-mode conflicts, invalid URLs,
half-configured credential pairs, Sentry and Better Stack configuration, and, at line 264,
`it("never prints or includes secret values in failure messages")`.

One caveat worth knowing: the package's `test` script is
`NODE_ENV=test vitest run --passWithNoTests`, so it exits 0 even if every test file is deleted.
**Assert on the count, not just the exit code.**

Record in `plans/161-xero-execution-report.md`, under a "Preflight gate" heading:

- the observed test count (37 at `8652c31`), so a later drop is visible
- that `packages/next-config/preflight.test.ts` is the file 161c and 161e must **extend**
- that 161c adds cases for `XERO_TOKEN_ENCRYPTION_ACTIVE_VERSION` and
  `XERO_TOKEN_ENCRYPTION_KEYS_JSON`, and 161e adds cases for `XERO_APP_TIER`, each in that same
  file, each following the existing structure

**Do not write those cases now.** None of the three variables exists yet; the plans that
introduce them own their tests.

**Verify**: `bun run --cwd packages/next-config test` → exit 0 with 37 tests, and the execution
report contains the "Preflight gate" heading with the count.

### Step 4: Confirm the sub-plan corrections are in place

These were applied before this plan was written. Confirm they survived, so 161a does not start
against a regressed set of documents:

```bash
grep -nE "bun run test:release([^-]|$)" plans/161[a-h]-*.md
grep -n "bun run preflight" plans/161[a-h]-*.md
grep -c "Fresh worktree setup" plans/161[a-h]-*.md
```

Expected: the first two return matches only inside explanatory prose (the "Fresh worktree setup"
block, a Maintenance note, or a Current-state description of the preflight file), never inside a
Commands table or a Done criteria checklist. The third returns at least 1 for each of the eight
files.

If a Commands table or Done criteria checklist still lists either command, **report it**; do not
fix it silently, because that means a document was reverted and other corrections may be missing
too.

**Verify**: the three greps behave as described, and the result is recorded in
`plans/161-xero-execution-report.md`.

## Test plan

**This plan writes no new tests.** The preflight validator already has 37 passing tests,
including secret redaction. Adding cases for `XERO_APP_TIER`,
`XERO_TOKEN_ENCRYPTION_ACTIVE_VERSION` or `XERO_TOKEN_ENCRYPTION_KEYS_JSON` here would test
variables that do not exist yet; 161c and 161e own those cases and extend the same file.

Verification is the gate suite itself plus the greps in Steps 3 and 4. Do not invent a new test
harness for the `.env.example` comment changes.

## Done criteria

All must hold:

- [ ] `bun run check` exits 0
- [ ] `bun run typecheck` exits 0
- [ ] `bun run build` exits 0
- [ ] `bun run test` exits 0
- [ ] `bun run boundaries` exits 0
- [ ] `bun run --cwd packages/next-config test` exits 0 with **37 tests**, and that count is recorded in the execution report
- [ ] `bun run test:release-tools` exits 0
- [ ] `bun run typecheck:release-tools` exits 0
- [ ] `git diff --check` exits 0
- [ ] `plans/161-xero-execution-report.md` records all seven baseline gates with observed exit codes, plus the preflight-gate test count
- [ ] `grep -nE "bun run test:release([^-]|$)" plans/161[a-h]-*.md` shows no match inside a Commands table or a Done criteria checklist
- [ ] `grep -n "bun run preflight" plans/161[a-h]-*.md` shows no match inside a Commands table or a Done criteria checklist
- [ ] `git status --short` shows no modified file under `packages/` or `apps/` other than the two `.env.example` files
- [ ] No plan file under `plans/161[a-h]-*.md` or the charter is modified by this plan
- [ ] `plans/README.md` status row for 161-pre updated

## STOP conditions

Stop and report; do not improvise:

- **Any gate listed green in "Current state" is now red at HEAD.** That is a pre-existing failure
  on `main` and must be understood before 161a starts, not absorbed into a sub-plan. Report the
  command and its full output.
- Step 4's greps show a Commands table or Done criteria checklist still listing `bun run preflight`
  or `bun run test:release`. A corrected document has been reverted; report which file and line.
- You conclude that `preflight.ts` should accept a default app name, that a `TC_*` variable should
  get a local fallback, or that `DATABASE_URL` or `XERO_TOKEN_ENCRYPTION_KEY` should become
  `.optional()`. **All three weaken a real production guard for local convenience.** Report the
  friction instead.
- `bun run --cwd packages/next-config test` does not report 37 tests, or
  `packages/next-config/preflight.test.ts` is missing. The gate 161e and 161h depend on has
  changed; report the actual count and file list before 161a starts.
- You are about to copy a real value out of any `.env.local`, `packages/database/.env` or the
  developer's shell into a plan, an `.env.example`, a test, a log or the execution report. Stop.
  Placeholders only.

## Maintenance notes

- **The rule this plan encodes: a Done criterion must be a command the executor can actually run
  in its own environment.** Any future plan listing `bun run preflight`, `bun run test:release`,
  `bun run migrate:deploy` or a `test:integration` command as an unqualified "exits 0" gate has
  the same defect. Those four need, respectively, production configuration, a deployed candidate,
  an authorised database, and an authorised database with an owned fixture manifest.
- **The preflight and release-suite requirements were relocated, not deleted.** They remain real
  sign-off criteria in the charter's Section 9.3, executed during the 161h rollout and the Plan
  160 campaign. The distinction that matters is *when and where* they run, not *whether*.
- The two mandatory variables are mandatory deliberately. `XERO_TOKEN_ENCRYPTION_KEY` guards token
  encryption and `DATABASE_URL` guards every query. If a future change makes a build pass without
  them, that change removed a boot-time guard and should be rejected in review.
- 161c adds `XERO_TOKEN_ENCRYPTION_ACTIVE_VERSION` and `XERO_TOKEN_ENCRYPTION_KEYS_JSON`; 161e
  adds `XERO_APP_TIER`. All three are specified as optional in development and test precisely so
  they do not extend this problem, and each adds its own cases to the test file created here.
- If the turbo cache seems not to help in a worktree, that is `turbo.json:3`
  `globalDependencies: ["**/.env.*local", ...]` doing its job: absent env files hash differently.
  Do not "fix" it by committing an env file.
