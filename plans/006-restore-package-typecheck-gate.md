# Plan 006: Restore the package-level typecheck gate

> **Executor instructions**: Follow this plan step by step, running every
> verification command. If a STOP condition occurs, stop and report. Update
> `plans/README.md` when done unless a reviewer maintains the index.
>
> **Drift check (run first)**: `git diff --stat e1b06a3..HEAD -- package.json packages/typescript-config tsconfig.json`
> Compare the "Current state" excerpts against the live code; on a mismatch,
> treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: none (but recommended before the refactor plans 007-009)
- **Category**: dx
- **Planned at**: commit `e1b06a3`, 2026-06-18
- **Issue**: <!-- filled when published via --issues -->

## Why this matters

The repo's typecheck gate is far narrower than it looks. The root script is:
```jsonc
"typecheck": "turbo typecheck --filter=app --filter=api --filter=web --only"
```
The `--only` flag suppresses the `^typecheck` dependency, so only the three app
typecheck tasks run; **all 15 `@repo/*` packages are skipped**. CI calls
`bun run typecheck` (`.github/workflows/ci.yml:48`), so package-internal type
regressions land on `main` green.

The reason the filter exists: `@repo/typescript-config` declares a `typecheck`
script (`tsc --noEmit ...`) but ships **no `tsconfig.json`**. Run inside that
package, `tsc` walks up to the root `tsconfig.json` (which has no `include`) and
scans sibling source with the wrong settings, producing false failures (e.g. JSX
errors in `apps/api/app/layout.tsx`). That broken task is what made repo-wide
`turbo typecheck` unusable, so it was narrowed to three apps.

Individual package typechecks are otherwise clean (verified during the audit:
`@repo/xero` and `@repo/availability` type-check with 0 errors under their own
configs). So fixing the one broken config-only task unblocks the full gate.

## Current state

- `package.json:9` — `"typecheck": "turbo typecheck --filter=app --filter=api --filter=web --only"`.
- `packages/typescript-config/` contains only `base.json`, `nextjs.json`,
  `react-library.json`, `package.json` — **no `tsconfig.json`**. Its
  `package.json:7` has `"typecheck": "tsc --noEmit --emitDeclarationOnly false"`.
- Root `tsconfig.json` has no `include`, so a bare `tsc` from a subdir scans broadly.
- `scripts/initialize.ts:186` has a real type error and `scripts/` is not covered
  by any typecheck task (it is in the lint `check` scope only).

## Commands you will need

| Purpose         | Command                                  | Expected on success |
|-----------------|------------------------------------------|---------------------|
| Install         | `bun install`                            | exit 0              |
| Turbo dry-run   | `bunx turbo typecheck --dry-run=json`    | lists all package tasks |
| Full typecheck  | `bun run typecheck`                      | exit 0              |
| Lint            | `bun run check`                           | exit 0              |

## Scope

**In scope**:
- `packages/typescript-config/package.json` (fix or remove its `typecheck` script)
- Optionally `packages/typescript-config/tsconfig.json` (create with empty include)
- `package.json` (widen the root `typecheck` script)
- Type-error fixes **only** in files that the widened gate surfaces (expected to be
  few). See STOP conditions for the threshold.
- Optional: a typecheck path for `scripts/` and a fix for `scripts/initialize.ts:186`

**Out of scope**:
- Refactoring package internals beyond the minimal change to clear a surfaced type
  error.
- DX-03 (including `**/*.test.ts` in package typecheck) — separate finding,
  separate plan.
- Changing the apps' typecheck scripts.

## Git workflow

- Branch: `advisor/006-typecheck-gate`
- Conventional commits, e.g. `ci: re-enable package-level typecheck`.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Fix the broken `@repo/typescript-config` typecheck task (DX-02)

The package ships no `.ts` source, so it has nothing to type-check. Either:
- **(preferred)** remove the `typecheck` script from
  `packages/typescript-config/package.json`, or
- add `packages/typescript-config/tsconfig.json` with `{ "include": [] }`.

**Verify**: `bunx turbo typecheck --filter=@repo/feeds --dry-run=json` no longer
lists a failing `@repo/typescript-config#typecheck`, and
`bunx vitest --version`-style sanity is not needed — just confirm the dry-run is
clean.

### Step 2: Widen the root typecheck script (DX-01)

Change `package.json:9` to run every package:
```jsonc
"typecheck": "turbo typecheck"
```
(Drop `--filter` and `--only`. Turbo runs `typecheck` for every workspace that
defines it, plus the apps.)

**Verify**: `bunx turbo typecheck --dry-run=json` lists the app tasks **and** the
`@repo/*` package tasks.

### Step 3: Run the full gate and clear what surfaces

Run `bun run typecheck`. Per the audit, expect zero or very few errors.
- If it exits 0: done with this step.
- If a small number of genuine type errors surface (see threshold below), fix each
  with the minimal correct change (no `any`, no `as` casts, no `@ts-ignore` — match
  the repo's strict style). Re-run until exit 0.

**Verify**: `bun run typecheck` → exit 0.

### Step 4 (optional, only if Step 3 is clean): cover `scripts/`

Add a typecheck for `scripts/` (e.g. a `scripts/tsconfig.json` extending
`@repo/typescript-config/base.json` with `"include": ["."]`, wired into a
`typecheck` script, or fold into the root). Fix the known error at
`scripts/initialize.ts:186` (a `(value: string)` callback assigned where
`(value: string | undefined)` is expected — widen the parameter type). Skip this
step if you are time-boxed; the package gate is the primary win.

**Verify**: `bun run typecheck` → exit 0 (including scripts if wired in).

## Test plan

- No new unit tests (this is a tooling gate). The proof is `bun run typecheck`
  exiting 0 while covering all packages.
- Verification that coverage widened: `bunx turbo typecheck --dry-run=json` shows
  `@repo/*` package tasks present.

## Done criteria

ALL must hold:

- [ ] `package.json` `typecheck` script no longer contains `--filter` or `--only`
- [ ] `bunx turbo typecheck --dry-run=json` lists `@repo/*` package typecheck tasks
- [ ] `bun run typecheck` exits 0
- [ ] `bun run check` exits 0
- [ ] No source behaviour changed — only type-level fixes and config
- [ ] No files outside the in-scope list are modified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back if:

- Widening the gate surfaces **more than ~10 distinct type errors**, or any error
  whose correct fix is non-obvious / would change runtime behaviour. Do **not**
  re-narrow the filter to make CI green — report the backlog so it can be triaged
  into its own plan.
- A package has a `typecheck` script that itself has the same "no tsconfig.json"
  problem as `typescript-config` (apply the same Step 1 fix and note it).
- The `@repo/typescript-config` package turns out to ship `.ts` source that needs
  checking (it should not) — report rather than deleting the script blindly.

## Maintenance notes

- After this lands, CI (`bun run typecheck`) gates all packages automatically — no
  CI file change needed.
- DX-03 (test files excluded from package typecheck via `exclude: **/*.test.ts`) is
  the next increment of type coverage; it will surface a backlog of test-type
  issues and is intentionally a separate plan.
- Reviewer: confirm the change is config/type-only (no runtime logic touched) and
  that the dry-run shows the package tasks now running.
