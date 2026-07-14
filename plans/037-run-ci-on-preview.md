# Plan 037: Run CI on `preview`, and unbreak the formatter so it passes

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report, do not improvise. When done, update the status row for this plan in
> `plans/README.md` unless a reviewer dispatched you and told you they maintain
> the index.
>
> **Drift check (run first)**: `git diff --stat dabb529..HEAD -- .github/workflows/ci.yml apps/api/app/webhooks/payments/route.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW (CI config + a pure formatting change; no runtime behaviour)
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `dabb529` (`preview`), 2026-07-14

## Why this matters

`.github/workflows/ci.yml` triggers only on `main`, but **all development in this
repo happens on `preview`** (plans 001-036 all branch from and merge back into
`preview`; `main` is the eventual release branch). The result: the entire 022-032
batch — eleven plans, including a payroll data-loss fix and a rewrite of the SSE
notification transport — merged into `preview` with **zero CI runs**. Nothing was
gating those merges.

This is not hypothetical. It has already cost the repo a real regression: plan 026
(`7bc1491`) added a second argument to two `mirrorSubscription(...)` calls, pushing
both over Biome's line-width limit, and `preview` has been failing `bun run check`
ever since. Every executor verified its own plan inside an isolated worktree and
passed; the break only exists in the *merged* result, which nothing ever checked.

After this plan: pushes to `preview` run the same lint/typecheck/migrate/test gate
that `main` runs, and the gate is green.

**Order matters.** Fix the formatter break (Step 1) *before* enabling the trigger
(Step 2), or the very first `preview` CI run goes red.

## Current state

- `.github/workflows/ci.yml:1-7` — the trigger block, `main`-only:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
```

  The rest of the job is healthy and needs no change: it installs with
  `bun install --frozen-lockfile`, generates the Prisma client, then runs
  `bun run check`, `bun run typecheck`, `bun run migrate:deploy`, a schema-drift
  check, `bun run test`, and `bun run test:integration` against a `postgres:16`
  service container.

- `apps/api/app/webhooks/payments/route.ts` — two calls that Biome's **formatter**
  (not a lint rule) wants wrapped. Around lines 115-118 and 137-139:

```ts
    const parsed = SubscriptionSchema.safeParse(event.data.object);
    if (parsed.success) {
      await mirrorSubscription(parsed.data, dateFromSeconds(event.created) ?? new Date());
      return;
    }
```

```ts
    const subscription = parsed.data.subscription;
    if (subscription && typeof subscription !== "string") {
      await mirrorSubscription(subscription, dateFromSeconds(event.created) ?? new Date());
    } else if (subscription) {
```

  Biome wants each call broken across lines, e.g.:

```ts
      await mirrorSubscription(
        parsed.data,
        dateFromSeconds(event.created) ?? new Date()
      );
```

  This is **formatting only**. Do not change the arguments, the call order, the
  `?? new Date()` fallback, or any logic — plan 026 deliberately made this mirror
  last-writer-by-event-time, and that behaviour must be preserved exactly.

- Conventions: Biome 2 + Ultracite enforce style; config in `biome.jsonc` at the
  repo root. `bun run fix` auto-applies formatting fixes; `bun run check` verifies.

## Commands you will need

| Purpose   | Command                                                    | Expected on success |
|-----------|------------------------------------------------------------|---------------------|
| Install   | `bun install --frozen-lockfile`                            | exit 0              |
| Autofix   | `bun run fix`                                              | exit 0              |
| Lint      | `bun run check`                                            | exit 0              |
| Typecheck | `bun run typecheck`                                        | exit 0              |
| Tests     | `bun run test`                                             | all tasks pass      |
| Targeted  | `bunx biome check apps/api/app/webhooks/payments/route.ts` | exit 0, no errors   |

## Scope

**In scope**:
- `.github/workflows/ci.yml` — the `on:` trigger block only.
- `apps/api/app/webhooks/payments/route.ts` — formatting of the two
  `mirrorSubscription(...)` calls only.

**Out of scope** (do NOT touch):
- Any logic in `apps/api/app/webhooks/payments/route.ts` — the webhook's
  behaviour, the event-time ordering guard from plan 026, or its tests.
- The CI job body (steps, services, env). Adding dependency caching or
  parallelising the job is a known, separate, unplanned item — do not fold it in.
- Any other file Biome might want to reformat. If `bun run fix` touches files
  beyond the payments route, revert those and see STOP conditions.
- Branch protection rules / required status checks (a GitHub settings change, not
  a repo change; flag it in the PR instead).

## Git workflow

- Base branch: `preview` — all development lands on `preview`, not `main`. Create
  this branch from `preview` and merge back into `preview`.
- Branch: `improve/037-ci-on-preview`
- Conventional commits (e.g. `fix(ci): run the pipeline on preview` and
  `style(api): reformat payments webhook to satisfy Biome`).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Unbreak the formatter (do this FIRST)

Run `bun run fix`. Expect it to reformat exactly the two `mirrorSubscription(...)`
calls in `apps/api/app/webhooks/payments/route.ts`, wrapping each across multiple
lines as shown in "Current state".

Then inspect `git diff` and confirm the change is **purely formatting**: same
arguments, same order, same `?? new Date()` fallback, no other files touched.

**Verify**:
- `bunx biome check apps/api/app/webhooks/payments/route.ts` → exit 0, no errors
- `bun run check` → **exit 0** (this is the gate that is currently failing)
- `git status` → only `apps/api/app/webhooks/payments/route.ts` modified
- `bun run test` → all tasks pass (the webhook tests must still pass unchanged)

### Step 2: Run CI on `preview`

In `.github/workflows/ci.yml`, add `preview` to both trigger branch lists:

```yaml
on:
  push:
    branches: [main, preview]
  pull_request:
    branches: [main, preview]
```

Change nothing else in the file.

**Verify**: `git diff .github/workflows/ci.yml` → shows only the two
`branches:` lines changed.

### Step 3: Prove the full gate is green

Run the same sequence CI will run, locally:

```
bun run check
bun run typecheck
bun run test
```

All three must pass. (The migrate/drift/integration steps need a Postgres service
and are not required to pass locally — CI supplies the database. Do not attempt to
stand one up.)

**Verify**: all three commands exit 0.

## Test plan

No new tests. This plan changes CI configuration and code formatting only; its
correctness is established by the existing suite continuing to pass and by
`bun run check` newly exiting 0.

The real verification is the first CI run on `preview` after this merges. The
reviewer should confirm in the GitHub Actions tab that a `CI` run appears for the
`preview` push and that it is green.

## Done criteria

ALL must hold:

- [ ] `bun run check` exits 0 (was failing before this plan)
- [ ] `bun run typecheck` exits 0
- [ ] `bun run test` passes all task groups
- [ ] `.github/workflows/ci.yml` lists `preview` in both the `push` and `pull_request` branch filters
- [ ] `git diff` on `apps/api/app/webhooks/payments/route.ts` contains no logic change (same args, same order, same `?? new Date()` fallback)
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `bun run fix` reformats files **beyond** `apps/api/app/webhooks/payments/route.ts`.
  That means other formatting debt has accumulated; report the file list and let
  the reviewer decide whether it belongs in this plan or a separate cleanup.
- `bun run check` still fails after Step 1 with a **lint rule** error (not a
  formatter error). A lint-rule failure is a different defect than the one this
  plan diagnosed — report the rule and file rather than suppressing it.
- `bun run test` fails after the reformat. A formatting change cannot break tests;
  if it does, something else is wrong on `preview` and must be investigated first.
- Any excerpt in "Current state" does not match live code (drift).

## Maintenance notes

- **The deeper lesson, for the reviewer**: this batch's plans were each verified in
  an isolated executor worktree and each passed. The break existed only in the
  merged result. Per-worktree verification does not substitute for a gate on the
  integration branch — which is exactly what this plan restores.
- Consider making the `CI` check **required** on `preview` in GitHub branch
  protection settings. That is a repo-settings change, not a file change, so it is
  out of scope here, but without it CI on `preview` is advisory only and a red run
  will not actually block a merge.
- Known, still-unplanned CI items in the same file: no dependency caching, and the
  job runs fully sequentially. Both are performance concerns, not correctness ones;
  they were deliberately excluded from this plan to keep the trigger fix trivially
  reviewable.
- If `main` and `preview` ever diverge in required checks, revisit whether the two
  branches should share one workflow file at all.
