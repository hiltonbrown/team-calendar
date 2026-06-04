# Prompt 02: CI and build integrity

## Role and context

You are a senior engineer on LeaveSync (next-forge, Turborepo, Bun, Prisma 7, Neon, Vercel).
Today `bun run build` is gated on `bun run test` (`turbo.json` makes `build` depend on
`test`), and the `test` task halts at `@repo/database`, whose suites need a reachable Neon
database. A Vercel build with no database therefore cannot succeed. This slice makes the
production build pass without a database, splits unit from integration tests, brings the
`check` and `boundaries` checks into the Turbo pipeline, and clears the 47 boundary issues
caused by undeclared dependencies in `apps/api`. It is second in the series because every
later slice relies on a green build and boundaries check.

## Hard rules

- Branch first off the latest `main`: `git checkout main && git pull origin main && git
  checkout -b launch/02-ci-build-integrity`.
- Australian English. No em dashes.
- Do not touch `schema.prisma`, migrations, the protected domain packages' logic, or the
  tenancy and Clerk integration. This slice owns `turbo.json`, `package.json` scripts, and
  `apps/api/package.json` dependency declarations, plus test-config wiring.
- Do not use `as any` or lint suppression. Do not delete tests to make the suite pass;
  separate integration tests from unit tests instead.
- If splitting tests would change which suites run in CI in a way that could hide coverage,
  stop and write the trade-off to `BLOCKED.md`.

## Authoritative references

- `turbo.json`, root `package.json`, `apps/api/package.json`.
- `launch-plan/REVIEW.md` "Test and lint results" and "Deployment blockers".
- The boundary errors: `apps/api` imports `@repo/core` (x4), `@repo/availability` (x2),
  `@repo/notifications`, `@repo/email` without declaring them. Files include
  `apps/api/env.ts`, `apps/api/app/api/availability/route.ts`,
  `apps/api/app/api/notifications/stream/route.ts`, `apps/api/app/webhooks/auth/route.ts`,
  `apps/api/lib/support/persist-support-submission-audit.ts`.

## Phased steps

1. **Declare the missing dependencies** in `apps/api/package.json`: add `@repo/core`,
   `@repo/availability`, `@repo/notifications`, `@repo/email` (workspace `*` versions, matching
   how `apps/app` declares its `@repo/*` deps). Run `bun install`. Re-run
   `bun run boundaries` and confirm zero issues.
2. **Separate integration from unit tests.** The DB-integration suites are the ones hitting
   Neon (in `packages/database`, and the failing files in `packages/availability`,
   `packages/feeds`, `packages/jobs`). Give them a distinct vitest project or naming
   convention (for example `*.integration.test.ts`, or a `vitest` `--project` split using the
   shared `tooling/vitest.config.mts`). Add a `test:integration` script alongside the
   existing unit `test` script so unit tests run with no database.
3. **Ungate the build.** In `turbo.json`, change `build.dependsOn` from `["^build", "test"]`
   to `["^build"]` (or to a unit-only `test` that needs no database). Tests run as their own
   CI step, not as a build precondition.
4. **Add pipeline tasks.** Add `check` and `boundaries` tasks to `turbo.json` so the standard
   checks are orchestrated by Turbo, matching how CLAUDE.md describes the workflow.
5. **Confirm a database-free build.** With no `DATABASE_URL` pointing at a live database,
   `bun run build` and `bun run check` must pass.

## Verification gate

`bun install`, `bun run build` (no database), `bun run check`, `bun run boundaries` (zero
issues), `bun run test` (unit, no database) must all pass. The integration suite is run via
`bun run test:integration` where a database is available.

## Commits and PR

Conventional commits, for example: `fix: declare missing @repo deps in apps/api`,
`test: split db integration tests from unit tests`,
`build: ungate production build from integration tests`,
`build: add check and boundaries to turbo pipeline`. Push and open a PR titled "CI and build
integrity".

## Acceptance criteria

- [ ] `bun run boundaries` reports zero issues.
- [ ] `bun run build` succeeds with no database available.
- [ ] Unit tests run with no database; integration tests run under a separate task.
- [ ] `check` and `boundaries` are Turbo tasks.
- [ ] No test was deleted; integration coverage is preserved under the new task.
