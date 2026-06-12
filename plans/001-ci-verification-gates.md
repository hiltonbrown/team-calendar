# Plan 001: Add lint and typecheck gates to CI

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 3f96bff..HEAD -- .github/workflows/ci.yml turbo.json package.json biome.jsonc`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `3f96bff`, 2026-06-13
- **Issue**: https://github.com/hiltonbrown/leavesync/issues/57
- **Revision note**: Revised after the first execution stopped because
  unscoped `bun run check` reported 10,757 diagnostics from agent/tooling
  directories outside the product source gate. The scoped product checks
  already pass.
- **Second execution note**: A later execution confirmed the scoped lint
  gate passes, but stopped at the typecheck gate because Turbo ran
  `@repo/typescript-config#typecheck`. That package's `typecheck` script
  runs `tsc` from the shared config package and accidentally typechecks
  the wider repo with the wrong compiler context, producing thousands of
  false-context errors such as missing JSX support, unresolved app aliases,
  CommonJS top-level-await errors, and NodeNext extension diagnostics.
- **Third revision note**: Workspace-by-workspace verification showed the
  first CI typecheck gate should be the three deployable Next apps:
  `app`, `api`, and `web`. They pass through
  `bunx turbo typecheck --filter=app --filter=api --filter=web --only`.
  Several package-level `typecheck` scripts are currently red and should be
  addressed by a separate follow-up plan before broadening the gate.

## Why this matters

CI (`.github/workflows/ci.yml`) currently runs only unit tests, integration
tests, and a Prisma migration drift check. It never runs a source lint gate
or any TypeScript typecheck, so type errors and lint violations can merge to
`main` green. The repo's own rules mandate strict TypeScript and
Biome/Ultracite enforcement, but CI does not enforce them before merge.
Every other plan in `plans/` uses lint + typecheck as verification gates, so
this plan lands first.

The existing root `bun run check` command is currently too broad for CI
because it scans agent/advisor artefacts as well as product source:
`.claude/skills/...`, `.agents/...`, `plans/`, and `tasks/`. A first
execution of this plan stopped at the required STOP condition after
`bun run check` reported 10,757 diagnostics, mostly from those non-product
areas. The product source itself is already clean under a scoped check.

## Current state

- `.github/workflows/ci.yml` — single `test` job: checkout -> setup-bun -> `bun install --frozen-lockfile` -> `prisma generate` -> `migrate:deploy` -> drift check -> `bun run test` -> `bun run test:integration`. No lint, no typecheck, no build step.
- `turbo.json` — defines tasks `build`, `test`, `test:integration`, `analyze`, `dev`, `translate`, `clean`. There is **no `typecheck` task**.
- Per-app and package `typecheck` scripts already exist:
  - `apps/app/package.json` → `"typecheck": "tsc --noEmit --emitDeclarationOnly false"`
  - `apps/api/package.json` → same
  - `apps/web/package.json` → same
  - `apps/email/package.json` → same
  - multiple `packages/*/package.json` files define the same script
- Root `package.json` scripts include `"check": "ultracite check"` but no `typecheck` script.
- Verified unblock evidence on 2026-06-13:
  - `bun run check` currently fails with `Found 10757 errors` because it checks non-product directories such as `.claude/skills`.
  - `bunx ultracite check apps packages` exits 0 (`Checked 615 files`).
  - `bunx ultracite check scripts tooling tsup.config.ts next-env.d.ts` exits 0 (`Checked 7 files`).
  - `bunx turbo typecheck` currently fails only because `turbo.json` has no `typecheck` task yet.
- New blocker discovered during execution:
  - After adding the Turbo task, `bun run typecheck` fails because
    `packages/typescript-config/package.json` defines
    `"typecheck": "tsc --noEmit --emitDeclarationOnly false"`.
  - Turbo therefore executes `tsc` from `packages/typescript-config`, which
    is a shared config package rather than a compilable source package.
  - The failure is not a small source backlog; it is a gate-design problem.
    The next revision should either remove/replace that package script or
    filter it out of the root typecheck gate, then verify the remaining
    workspace typechecks.
- Additional typecheck baseline evidence:
  - `bunx turbo typecheck --filter=app --filter=api --filter=web --only`
    exits 0 and runs exactly three tasks: `app:typecheck`,
    `api:typecheck`, and `web:typecheck`.
  - The same command without `--only` still pulls
    `@repo/typescript-config#typecheck` through `dependsOn: ["^typecheck"]`
    and fails.
  - Individual workspace checks currently fail for `apps/email`,
    `packages/analytics`, `packages/database`, `packages/design-system`,
    `packages/email`, `packages/jobs`, and `packages/typescript-config`.
    Do not fold that backlog into this CI gate plan.
- Note: `bun run build` is deliberately NOT added to CI in this plan — Next.js builds need production env vars (Clerk keys etc.) that the CI environment does not have.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `bun install --frozen-lockfile` | exit 0 |
| Product lint | `bun run check` | exit 0 |
| Current broad lint diagnostic, for context only | `bunx ultracite check . --max-diagnostics=20` | likely exit 1 until non-product directories are excluded or root check is scoped |
| Lint autofix | `bun run fix` | exit 0 |
| Prisma client (needed before typecheck) | `cd packages/database && bunx prisma generate` | exit 0 |
| Typecheck (after step 2) | `bun run typecheck` | runs `app`, `api`, and `web` only, exit 0 |
| Tests | `bun run test` | all pass |

## Scope

**In scope** (the only files you should modify):
- `.github/workflows/ci.yml`
- `turbo.json`
- `package.json` (root — scope `check` to product/tooling paths and add `typecheck` script)
- `apps/api/lib/support/persist-support-submission-audit.test.ts` only for the branded-ID fixture typing already surfaced by the app-level typecheck
- `biome.jsonc` only if you choose the exclude-based alternative below; do not weaken or disable rules
- Trivial lint/type fixes surfaced by the new gates, **only if** there are 10 or fewer errors total (see STOP conditions)

**Out of scope** (do NOT touch):
- `.github/workflows/claude.yml`, `.github/workflows/claude-code-review.yml`
- Adding `typecheck` scripts to individual `packages/*` package.json files (follow-up, not required — turbo skips packages without the script)
- Making all package-level `typecheck` scripts pass; this is a separate follow-up plan
- Changing `packages/typescript-config/package.json`
- Adding a `build` step to CI (needs env vars; separate decision)
- Weakening Biome/Ultracite rules to make the gate pass
- Formatting or linting `.claude`, `.agents`, `plans`, `tasks`, `skills`, or other advisor/operator artefacts as part of this CI gate

## Git workflow

- Branch: `advisor/001-ci-verification-gates`
- Conventional commits, e.g. `ci: add lint and typecheck gates` (matches repo style: `fix(database): adopt baseline squash migration and add CI migration gate`)
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Confirm the lint scope problem

Run, from the repo root:

1. `bun install --frozen-lockfile`
2. `cd packages/database && bunx prisma generate && cd ../..`
3. `bun run check` — record that the current broad root check fails, and record the diagnostic count.
4. `bunx ultracite check apps packages` — should exit 0.
5. `bunx ultracite check scripts tooling tsup.config.ts next-env.d.ts` — should exit 0.
6. `cd apps/app && bun run typecheck && cd ../..` (repeat for `apps/api`, `apps/web`) — record error counts.

If the broad `bun run check` failure is still dominated by non-product
directories and the two scoped Ultracite checks pass, continue. If the scoped
checks surface 10 or fewer product/tooling errors, fix them using
`bun run fix` where possible. If the scoped checks surface more than 10
product/tooling errors, STOP.

**Verify**: both scoped Ultracite commands exit 0, and each app's
`bun run typecheck` exits 0.

### Step 2: Scope the root lint gate and add root typecheck

Preferred approach: change the root `package.json` script from:

```json
"check": "ultracite check"
```

to:

```json
"check": "ultracite check apps packages scripts tooling tsup.config.ts next-env.d.ts"
```

This makes `bun run check` enforce the product app/package source plus
repo-owned tooling, while excluding local agent/advisor artefacts that are not
part of the application CI contract.

Alternative approach, only if the maintainer prefers `ultracite check` with
no path arguments: update `biome.jsonc` `files.includes` to exclude the same
non-product directories that caused the first execution to stop, including
`.claude`, `.agents`, `plans`, `tasks`, `skills`, `.impeccable`, `.turbo`,
`.vercel`, and `.vscode`. Do not disable any lint rules.

**Verify**: `bun run check` exits 0.

### Step 3: Add a `typecheck` task to Turbo and root scripts

In `turbo.json`, add to `"tasks"`:

```json
"typecheck": {
  "dependsOn": ["^typecheck"]
}
```

In root `package.json` scripts, add:

```json
"typecheck": "turbo typecheck --filter=app --filter=api --filter=web --only"
```

The `--only` flag is required. Without it, `dependsOn: ["^typecheck"]`
pulls package dependency tasks back into the graph, including
`@repo/typescript-config#typecheck`, and the command fails for reasons
outside this plan.

**Verify**: `bun run typecheck` runs exactly `app:typecheck`,
`api:typecheck`, and `web:typecheck`, then exits 0.

### Step 4: Add lint and typecheck steps to CI

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
- [ ] Root `package.json` scopes `check` to product/tooling paths, or `biome.jsonc` excludes non-product agent/advisor artefacts without weakening rules
- [ ] `turbo.json` defines a `typecheck` task; root `package.json` has a `typecheck` script using `--filter=app --filter=api --filter=web --only`
- [ ] `bun run check` exits 0
- [ ] `bun run typecheck` exits 0
- [ ] `bun run test` exits 0
- [ ] `git status` shows no modified files outside the in-scope list
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The scoped product/tooling lint commands surface **more than 10** errors combined. Report the full list; fixing a backlog is a separate decision, and the gate should not merge red.
- `bun run typecheck` runs any workspace other than `app`, `api`, or `web`.
- `bun run typecheck` fails after running only the three deployable app workspaces.
- Fixing an error would require changing runtime behaviour (not just types/format) — report instead of changing logic.
- Biome/Ultracite rule changes would be required for the gate to pass.
- The broad `bun run check` failure is no longer attributable to non-product directories, or the scoped `apps packages scripts tooling tsup.config.ts next-env.d.ts` check no longer passes.

## Maintenance notes

- Follow-up candidates (explicitly deferred): a CI `build` step once a decision is made about CI env vars; Bun/Turbo caching in CI (`actions/cache` for `~/.bun/install/cache`) to offset the added minutes.
- Agent/advisor directories can have their own formatting policy later. They should not block the application CI gate unless the maintainer explicitly promotes them into the product source contract.
- Reviewers should check the CI run time delta; if typecheck is slow, Turbo remote caching (`TURBO_TOKEN`/`TURBO_TEAM`) is the standard fix.
- `packages/observability/error.ts:20` contains a `console.error` call that violates the repo's logging rule; if the new lint gate flags it, replacing it with the observability logger is in the spirit of this plan (counts toward the ≤10 budget).
