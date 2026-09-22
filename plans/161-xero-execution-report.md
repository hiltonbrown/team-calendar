# Xero hardening execution report

## Execution context

- Worktree: `/tmp/teamcalendar-161-pre`
- Branch: `codex/xero-connection-hardening`
- Commit at baseline: `91f3bad43495fe10acd3e77fddf77cbfce03788f`
- Bun: `1.4.0`
- Node: `v24.21.0` (satisfies `22 || >=24.0.0`)
- Dependencies: `bun install --frozen-lockfile` exited 0 and installed 1780 packages.

## Step 0: Turbopack worker transport

The shared typed config now sets
`experimental.turbopackPluginRuntimeStrategy` to `"workerThreads"`. The existing
`turbopack.root` value is unchanged. The existing shared-config test now asserts the
setting without adding a test case, so the package suite remains exactly 3 files and
37 tests.

Verification:

- `bun run --cwd packages/next-config test`: exit 0, 3 files passed, 37 tests passed.
- `bun run build` with synthetic `DATABASE_URL` and `XERO_TOKEN_ENCRYPTION_KEY`
  placeholders: exit 0, 4 Turbo tasks successful. The build output reported the
  worker-thread strategy for app, API, and web, and all three Next.js builds completed.

The initial build attempt before this setting exited 1 in the restricted executor
environment because Turbopack's default child-process PostCSS transport could not bind
its local socket (`Operation not permitted`). The supported worker-thread strategy
changed only that Turbopack plugin transport and reconciled the failure; it did not
switch the build to Webpack.

## Pre-execution baseline and post-remediation gates

The gates were rerun after Step 0. Final results:

| Gate | Command | Result |
|---|---|---|
| Lint | `bun run check` | exit 0, 1033 files checked, no fixes applied |
| Types | `bun run typecheck` | exit 0, 19/19 Turbo tasks successful |
| Boundaries | `bun run boundaries` | exit 0, 994 files in 21 packages, no issues found |
| Unit tests | `bun run test` | exit 0, 18/18 Turbo tasks successful; next-config 3 files / 37 tests |
| Build | `bun run build` with synthetic required variables | exit 0, 4/4 Turbo tasks successful |
| Release tool tests | `bun run test:release-tools` | exit 0 outside the restricted sandbox, 11 files / 47 tests passed |
| Release tool types | `bun run typecheck:release-tools` | exit 0 |

The first in-sandbox run of `bun run test:release-tools` exited 1 because its permitted
local Unix-socket IPC test could not bind under the restricted sandbox: 10 files and 46
tests passed, with only that IPC assertion failing. The exact command was rerun outside
the restricted sandbox and passed 11 files / 47 tests.

## Environment examples

Added comment-only guidance to `apps/app/.env.example` and `apps/api/.env.example`:

- `DATABASE_URL` and `XERO_TOKEN_ENCRYPTION_KEY` are required for `bun run build` and
  production.
- All other entries are optional.
- Optional formatted variables must be absent or commented out, never `""`.

`git diff --check` passed after these additions.

## Preflight gate

- `bun run --cwd packages/next-config test`: exit 0, exactly 3 files and 37 tests
  passed.
- `packages/next-config/preflight.test.ts` is the existing suite that plans 161c and
  161e extend. This plan did not add future cases for
  `XERO_TOKEN_ENCRYPTION_ACTIVE_VERSION`, `XERO_TOKEN_ENCRYPTION_KEYS_JSON`, or
  `XERO_APP_TIER`.

## Sub-plan correction confirmation

The required greps were run against `plans/161[a-h]-*.md`:

- `grep -nE "bun run test:release([^-]|$)" ...` matched only explanatory prose about
  the deployed-candidate Playwright suite, not Commands tables or Done criteria.
- `grep -n "bun run preflight" ...` matched only explanatory production-gate prose,
  including explicit statements that it is not a local gate. No Commands-table or
  Done-criteria requirement remained.
- `grep -c "Fresh worktree setup" ...` reported at least one occurrence in every
  sub-plan. Plan 161e reported two occurrences; the other seven reported one each.

## Final checks

- `git diff --check`: exit 0.
- No 161a-161h plan or charter file was modified.
- No real `.env` file was modified; only comments were added to the two `.env.example`
  files.

## Baseline

```text
$ git rev-parse HEAD
b7610d54dfc8ee15abfdb4e974ad5ae4d2149772

$ git status --short

$ bun --version
1.4.0

$ node --version
v24.21.0
```

## Fixture ownership contract

The protected fixture registry now has 26 suites. The five newly reserved suites
own these tenant slots and global key kinds:

| Suite | Owned tenant slots | Global key kinds | Cleanup selection path |
|---|---:|---|---|
| `packages/database/xero-lifecycle-migration.integration.test.ts` | 22-23 | `credential_owner`, `provider_app`, `provider_connection`, `tenant_binding`, `oauth_attempt`, `cleanup_request`, `cleanup_attempt`, `shared_store_namespace` | `selectOwnedGlobalKeyValues`, then the owning migration test's manifest-scoped cleanup |
| `packages/jobs/src/handlers/reconcile-xero-connections.integration.test.ts` | 31-32 | `provider_connection`, `tenant_binding`, `cleanup_request`, `cleanup_attempt` | `selectOwnedGlobalKeyValues`, then reconciliation cleanup in plan 161f |
| `packages/xero/src/oauth/connection-cleanup.integration.test.ts` | 43-44 | `provider_connection`, `tenant_binding`, `cleanup_request`, `cleanup_attempt` | `selectOwnedGlobalKeyValues`, then targeted cleanup in plan 161f |
| `packages/xero/src/oauth/credential-owner.integration.test.ts` | 45-46 | `credential_owner`, `provider_app`, `oauth_attempt` | `selectOwnedGlobalKeyValues`, then credential-owner cleanup in plan 161d |
| `packages/xero/src/rate-limit/shared-store.integration.test.ts` | 50-51 | `shared_store_namespace` | `selectOwnedGlobalKeyValues`, then shared-store namespace cleanup in plan 161e |

Global ownership is kind-qualified. A raw identifier that is owned under one
kind cannot be selected under another kind, and a similar unowned value is
preserved. The writer rejects unsupported or duplicate manifest global keys.
No future database table or Redis key is touched by this baseline plan.

## Plan 161a verification

- `bun install --frozen-lockfile`: exit 0, no dependency changes.
- After registering the five suites, `bun run --cwd packages/database test`
  produced the required two exact-count failures (`21` expected versus `26`)
  before the assertions were updated.
- `bun run --cwd packages/database test`: exit 0, 16 files and 68 tests passed.
- `bun run check`: exit 0, 1033 files checked with no fixes pending.
- `bun run typecheck`: exit 0, 19 of 19 Turbo tasks passed.
- `bun run test:release-tools`: exit 0 outside the restricted sandbox, 11 files
  and 49 tests passed. The first restricted run's local IPC assertion was an
  environment-only bind failure and was rerun faithfully outside the sandbox.
- `bun run typecheck:release-tools`: exit 0.
- `git diff --check`: exit 0.
- `grep -c "integration.test.ts" packages/database/src/live-test-fixture.ts`:
  `26`.
- `grep -c '^|' plans/161-xero-provider-contract.md`: `16`.
