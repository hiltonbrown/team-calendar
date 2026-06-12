# Plan 001: Add lint and typecheck gates to CI

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat d9da765..HEAD -- .github/workflows/ci.yml turbo.json package.json`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `d9da765`, 2026-06-12
- **Issue**: https://github.com/hiltonbrown/leavesync/issues/57

## Why this matters

CI (`.github/workflows/ci.yml`) currently runs only unit tests, integration tests, and a Prisma migration drift check. It never runs `bun run check` (Biome 2 + Ultracite lint) or any TypeScript typecheck, so type errors and lint violations merge to `main` green. The repo's own rules (CLAUDE.md) mandate strict TypeScript and Biome/Ultracite enforcement, but nothing enforces them before merge. Every other plan in `plans/` uses lint + typecheck as verification gates, so this plan lands first.

## Current state

- `.github/workflows/ci.yml` — single `test` job: checkout → setup-bun → `bun install --frozen-lockfile` → `prisma generate` → `migrate:deploy` → drift check → `bun run test` → `bun run test:integration`. No lint, no typecheck, no build step.
- `turbo.json` — defines tasks `build`, `test`, `test:integration`, `analyze`, `dev`, `translate`, `clean`. There is **no `typecheck` task**.
- Per-app `typecheck` scripts already exist:
  - `apps/app/package.json` → `"typecheck": "tsc --noEmit --emitDeclarationOnly false"`
  - `apps/api/package.json` → same
  - `apps/web/package.json` → same
- Root `package.json` scripts include `"check": "ultracite check"` but no `typecheck` script.
- Turbo only runs a task in workspaces that define the matching script, so adding a `typecheck` task to `turbo.json` is safe even though most `packages/*` don't define one.
- Note: `bun run build` is deliberately NOT added to CI in this plan — Next.js builds need production env vars (Clerk keys etc.) that the CI environment does not have.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `bun install --frozen-lockfile` | exit 0 |
| Lint | `bun run check` | exit 0 |
| Lint autofix | `bun run fix` | exit 0 |
| Prisma client (needed before typecheck) | `cd packages/database && bunx prisma generate` | exit 0 |
| Typecheck (after step 2) | `bun run typecheck` | exit 0 |
| Tests | `bun run test` | all pass |

## Scope

**In scope** (the only files you should modify):
- `.github/workflows/ci.yml`
- `turbo.json`
- `package.json` (root — add `typecheck` script only)
- Trivial lint/type fixes surfaced by the new gates, **only if** there are 10 or fewer errors total (see STOP conditions)

**Out of scope** (do NOT touch):
- `.github/workflows/claude.yml`, `.github/workflows/claude-code-review.yml`
- Adding `typecheck` scripts to individual `packages/*` package.json files (follow-up, not required — turbo skips packages without the script)
- Adding a `build` step to CI (needs env vars; separate decision)
- Biome configuration (`biome.jsonc`) — do not weaken rules to make the gate pass

## Git workflow

- Branch: `advisor/001-ci-verification-gates`
- Conventional commits, e.g. `ci: add lint and typecheck gates` (matches repo style: `fix(database): adopt baseline squash migration and add CI migration gate`)
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Baseline the new gates locally

Run, from the repo root:

1. `bun install --frozen-lockfile`
2. `cd packages/database && bunx prisma generate && cd ../..`
3. `bun run check` — record pass/fail and the error count.
4. `cd apps/app && bun run typecheck && cd ../..` (repeat for `apps/api`, `apps/web`) — record error counts.

If everything passes, continue. If there are ≤10 total errors across lint + typecheck, fix them (use `bun run fix` for lint where possible) as part of this plan. If more, STOP (see STOP conditions).

**Verify**: `bun run check` → exit 0, and each app's `bun run typecheck` → exit 0.

### Step 2: Add a `typecheck` task to Turbo and root scripts

In `turbo.json`, add to `"tasks"`:

```json
"typecheck": {
  "dependsOn": ["^typecheck"]
}
```

In root `package.json` scripts, add:

```json
"typecheck": "turbo typecheck"
```

**Verify**: `bun run typecheck` → runs typecheck in `apps/app`, `apps/api`, `apps/web` (and any package defining the script), exit 0.

### Step 3: Add lint and typecheck steps to CI

In `.github/workflows/ci.yml`, after the "Generate Prisma client" step and before "Run migrate deploy", insert:

```yaml
      - name: Lint
        run: bun run check

      - name: Typecheck
        run: bun run typecheck
```

(Prisma generate must run first because `apps/app` and `apps/api` import the generated client; the existing step order already guarantees this.)

**Verify**: `bunx yaml-lint .github/workflows/ci.yml 2>/dev/null || bun -e "const yaml=await import('node:fs').then(fs=>fs.readFileSync('.github/workflows/ci.yml','utf8')); console.log('read ok')"` → file parses / reads. Then re-run `bun run check && bun run typecheck` → both exit 0.

## Test plan

No new test files. The deliverable is the gates themselves:

- `bun run check` exits 0 locally.
- `bun run typecheck` exits 0 locally.
- `bun run test` still exits 0 (no behavioural change expected).

## Done criteria

ALL must hold:

- [ ] `.github/workflows/ci.yml` contains a `Lint` step running `bun run check` and a `Typecheck` step running `bun run typecheck`
- [ ] `turbo.json` defines a `typecheck` task; root `package.json` has a `typecheck` script
- [ ] `bun run check` exits 0
- [ ] `bun run typecheck` exits 0
- [ ] `bun run test` exits 0
- [ ] `git status` shows no modified files outside the in-scope list
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Step 1 surfaces **more than 10** lint + typecheck errors combined — report the full list; fixing a backlog is a separate decision, and the gate should not merge red.
- `bun run typecheck` fails because a `packages/*` workspace unexpectedly defines a broken `typecheck` script.
- Fixing an error would require changing runtime behaviour (not just types/format) — report instead of changing logic.
- `biome.jsonc` would need rule changes for the gate to pass.

## Maintenance notes

- Follow-up candidates (explicitly deferred): per-package `typecheck` scripts for `packages/*`; a CI `build` step once a decision is made about CI env vars; Bun/Turbo caching in CI (`actions/cache` for `~/.bun/install/cache`) to offset the added minutes.
- Reviewers should check the CI run time delta; if typecheck is slow, Turbo remote caching (`TURBO_TOKEN`/`TURBO_TEAM`) is the standard fix.
- `packages/observability/error.ts:20` contains a `console.error` call that violates the repo's logging rule; if the new lint gate flags it, replacing it with the observability logger is in the spirit of this plan (counts toward the ≤10 budget).
