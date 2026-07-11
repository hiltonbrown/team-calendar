# Plan 014: Upgrade high-risk runtime dependencies reported by audit

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report, do not improvise. When done, update the status row for this plan
> in `plans/README.md` unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 637f02d..HEAD -- package.json bun.lock apps/app/package.json apps/api/package.json apps/email/package.json apps/web/package.json packages/analytics/package.json packages/auth/package.json packages/database/package.json packages/jobs/package.json packages/observability/package.json`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.
>
> **Preview branch note**: earlier-numbered plans land on `preview` before
> this one, so this diff will legitimately include their changes. Treat a
> mismatch as a STOP condition only when it is not explained by an earlier
> plan's documented scope; excerpt line numbers may have shifted accordingly.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans/013-repair-integration-database-schema-drift.md for full integration verification
- **Category**: security
- **Planned at**: commit `637f02d`, refreshed 2026-07-11
- **Execution status**: DONE on 2026-07-11 in executor commit `dd13079`.
  Independently verified: clean high-severity audit, typecheck, check, unit
  tests, and all integration suites passed. The approved Clerk Core 3
  appearance migration is included in the executor commit.
- **Reconciled**: 2026-07-11 at current HEAD `c81028a`. The executor commit is
  present and every in-scope runtime file is unchanged from `dd13079`.
  `bun audit --audit-level high` and `bun run check` pass. Typecheck and the
  app unit suite could not be re-verified in the current checkout because its
  ignored `node_modules` still links the pre-upgrade Clerk/Vite installation;
  the manifest and lockfile remain correct, so this does not reopen the plan.

## Why this matters

`bun audit --audit-level high` reported 36 high or critical vulnerabilities in
runtime dependency paths, including auth middleware bypass advisories through
Clerk packages and a critical `protobufjs` advisory through telemetry/job
dependencies. This app relies on Clerk for organisation security and uses
Next.js API routes for webhooks and product operations, so leaving these paths
unpatched is an avoidable production risk.

## Pre-execution state (historical)

- Root package manager:

```json
// package.json:36
"packageManager": "bun@1.3.14"
```

- Key direct dependencies:

```json
// apps/app/package.json:28,33
"@sentry/nextjs": "^10.53.1",
"next": "16.2.6",
```

```json
// apps/api/package.json:27,30-31
"@sentry/nextjs": "^10.53.1",
"inngest": "^4.5.0",
"next": "16.2.6",
```

```json
// packages/auth/package.json:10-21
"@clerk/nextjs": "^7.3.7",
"@clerk/themes": "^2.4.57",
...
"@clerk/types": "^4.101.20",
```

```json
// packages/database/package.json:25-26
"undici": "^8.3.0",
"ws": "^8.20.1",
```

```json
// packages/jobs/package.json:23
"inngest": "^4.5.0",
```

- Audit result recaptured on 2026-07-11: `bun audit --audit-level high` still
  reported 36 vulnerabilities from stale compatible resolutions, including:
  - `@clerk/shared >=3.0.0 <=3.47.4` via `@clerk/nextjs`, `@clerk/themes`, and
    `@clerk/types`, including auth bypass and middleware route protection
    bypass advisories.
  - `protobufjs >=8.0.0 <=8.0.1` via `posthog-js`, `inngest`, and
    `@sentry/nextjs`, including a critical arbitrary code execution advisory.
  - `@grpc/grpc-js`, `undici`, `ws`, `hono`, `fast-uri`, and `vite`.
  - The audit output also mentioned `next >=16.0.0 <16.2.5`, while `bun why
    next` resolves 16.2.6. Treat this as an audit/lock reconciliation check,
    not permission to upgrade Next beyond 16.2.6.

Registry metadata verified during reconciliation:

- `@clerk/shared` 3.47.5 exists and satisfies `@clerk/themes` and
  `@clerk/types` `^3.47.2` ranges.
- `@clerk/types` is deprecated, but removing it requires a source import
  migration and is not necessary for this patch-only security plan.
- Do not run named transitive packages from the repository root. In Bun 1.3.14,
  `bun update @clerk/shared protobufjs ...` adds them as root direct
  dependencies instead of refreshing their owners.
- Do not use `bun update --recursive` for this plan. A disposable-worktree test
  updated unrelated root tooling while leaving vulnerable workspace paths.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Baseline audit | `bun audit --audit-level high` | either clean or same known advisories before updates |
| Dependency path | `bun why <package>` | prints why the package is installed |
| Install/update | `bun update <package...>` | updates manifests/lockfile, exit 0 |
| Install lockfile | `bun install` | exit 0 |
| Audit gate | `bun audit --audit-level high` | exit 0 or only documented non-runtime exceptions |
| Typecheck | `bun run typecheck` | exit 0 |
| Lint | `bun run check` | exit 0 |
| Unit tests | `bun run test` | exit 0 |
| Integration tests | `bun run test:integration` | exit 0 after plan 013 is complete |

## Scope

**In scope**:

- `package.json`
- `bun.lock`
- `apps/app/package.json`
- `apps/api/package.json`
- `packages/auth/package.json`
- `packages/auth/provider.tsx`
- `packages/database/package.json`
- `packages/jobs/package.json`
- `apps/email/package.json`
- `apps/web/package.json`
- `packages/analytics/package.json`
- `packages/observability/package.json`
- Other workspace `package.json` files only if `bun why` proves they own a
  vulnerable direct dependency.
- `plans/README.md` (status row)

**Out of scope**:

- Broad dependency modernization unrelated to high/critical advisories.
- Framework migrations that require product code rewrites unless a security fix
  cannot land otherwise.
- Suppressing or ignoring advisories without a written maintainer decision.

## Git workflow

- Branch: `preview` (shared branch for all plans; implement sequentially in plan-number order on top of the previous plan's commits)
- Commit message: `chore(deps): patch high-risk runtime advisories`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Capture the live audit and dependency paths

Run:

- `bun audit --audit-level high`
- `bun why @clerk/shared`
- `bun why protobufjs`
- `bun why next`
- `bun why undici`
- `bun why ws`
- `bun why vite`

Record the vulnerable direct package owners in your PR notes. If `bun why` is
not available in the installed Bun version, use `bun pm ls <package>` or the
lockfile to identify the same path.

**Verify**: each vulnerable package has a direct owner identified, for example
Clerk packages in `packages/auth/package.json` or `protobufjs` through
`@sentry/nextjs`/`inngest`/`posthog-js`.

### Step 2: Update each vulnerable direct owner from its workspace

Run these owner-scoped updates from the repository root:

```bash
bun update --cwd packages/auth @clerk/nextjs
bun update --cwd apps/web @clerk/nextjs @sentry/nextjs
bun update --cwd apps/api @sentry/nextjs inngest @vitejs/plugin-react vitest
bun update --cwd packages/jobs inngest
bun update --cwd packages/analytics posthog-js
bun update --cwd packages/observability @sentry/nextjs
bun update --cwd packages/database undici ws prisma
bun update --cwd apps/app @sentry/nextjs @vitejs/plugin-react vitest jsdom
bun update --cwd apps/email react-email
```

These commands may advance direct dependency ranges only to their newest
compatible versions. Review every manifest hunk and revert changes unrelated
to an audit owner. Do not replace this list with a root-wide or recursive
update.

The relative `--cwd` form failed under Bun 1.3.14 in an isolated worktree.
Executors must use absolute paths, for example
`bun update --cwd /tmp/<worktree>/packages/auth ...`, while preserving the same
workspace and package ownership shown above.

After updating Clerk, migrate `packages/auth/provider.tsx` to the current Core
3 appearance API:

- Replace `@clerk/themes` with the current compatible `@clerk/ui` release in
  `packages/auth/package.json`, then run `bun install` to resolve it.
- Remove deprecated `@clerk/types`.
- Import `dark` from `@clerk/ui/themes`.
- Derive appearance member types from
  `NonNullable<AuthProviderProperties["appearance"]>` instead of importing
  `Theme`.
- Rename the appearance member `layout` to `options` and pass `options` to
  `ClerkProvider`.
- Rename `baseTheme` to `theme` and pass `theme` to `ClerkProvider`.
- Preserve the existing URLs, tokens, element classes, dark-mode selection,
  and task URL behaviour exactly. Do not redesign the authentication UI.

The earlier attempted replacement `Theme` from `@clerk/nextjs/types` is known
not to compile because that entry point does not export `Theme`; do not repeat
it.

**Verify**:

- `bun install` exits 0.
- `bun why @clerk/shared` shows the legacy branch at 3.47.5 or newer and no
  version in the affected `3.0.0` through `3.47.4` range.
- `bun run typecheck` exits 0.

### Step 3: Resolve remaining patchable transitive paths

Run `bun audit --audit-level high` again. For each remaining advisory, use
`bun why <package>` to confirm the live installed version and owner.

If a vulnerable transitive remains only because its owner pins an older patch,
add a root `overrides` entry beside the existing `parse5` override in
`package.json`, but only when the fixed version is semver-compatible with the
owner's declared range. Use the minimum fixed version reported by the live
advisory. Likely patch floors from the 2026-07-11 audit are:

- `@clerk/shared`: 3.47.5 for the legacy 3.x branch
- `js-cookie`: 3.0.6 or newer
- `@grpc/grpc-js`: 1.14.4 or newer
- `undici`: 8.5.0 or newer for the direct 8.x branch, and 7.28.0 or newer for
  any 7.x branch
- `fast-uri`: 3.1.2 or newer
- `vite`: 8.0.16 or newer
- `ws`: 8.21.0 or newer
- `hono`: 4.12.25 or newer

Do not override `protobufjs` across a major-version boundary. If its direct
owners cannot select a fixed version, stop and report the remaining owner path.
Do not add `next` as an override when `bun why next` already resolves 16.2.6.

The executor added a root `next: 16.2.6` override while reconciling the audit
path. Reconciliation confirmed it is redundant because every app manifest and
the lockfile already resolve 16.2.6. It is an approved, harmless deviation from
this instruction, not a remaining security requirement. A later dependency
maintenance change may remove it with normal verification.

**Verify**: root `package.json` contains no new direct dependencies introduced
solely to force a transitive resolution, and each override is backed by a live
`bun why` path plus a compatible fixed version.

### Step 4: Reconcile the Next.js audit path

Because manifests already pin `next` to `16.2.6`, inspect `bun.lock` and
`bun why next` if the audit still reports the vulnerable Next range. If the
lockfile contains an older Next resolution, regenerate it with explicit Next
updates for every app package. If audit no longer reports Next, do not change
Next further.

**Verify**: `bun audit --audit-level high` no longer reports the Next advisory.

### Step 5: Run the security and regression gates

Run:

- `bun audit --audit-level high`
- `bun run typecheck`
- `bun run check`
- `bun run test`
- `bun run test:integration` if plan 013 has completed and the test DB is in
  sync

**Verify**: all required commands exit 0. If integration tests are blocked only
by the schema drift from plan 013, mark that in the PR and do not hide it.

## Test plan

The primary test is a clean high-severity audit plus the full typecheck,
lint/check, and test suite. If Clerk or Next receives a major/minor upgrade
with auth behaviour changes, also smoke-test protected app routes and API
routes manually in the dev environment before requesting review.

## Done criteria

- [x] `bun audit --audit-level high` exits 0, or any remaining high/critical
      item is documented with a maintainer-approved exception and no runtime
      exploit path.
- [x] `bun run typecheck`, `bun run check`, and `bun run test` exit 0.
- [x] `bun run test:integration` exits 0, or the only blocker is plan 013 and
      it is clearly reported.
- [x] Manifest changes are limited to packages that own vulnerable paths.
- [x] `plans/README.md` status row updated.

## STOP conditions

Stop and report back if:

- A required Clerk or Next upgrade is a major version that changes middleware,
  auth helper, or route protection APIs.
- The audit remains high/critical after explicit direct dependency updates and
  the remaining path cannot be fixed by a semver-compatible transitive patch.
- Typecheck failures require broad app rewrites unrelated to dependency APIs.
- `bun update` wants to remove or rewrite workspace links.
- A named update adds a vulnerable transitive package as a new root direct
  dependency. Revert it and use the owner-scoped command instead.

## Maintenance notes

- Reviewer check: inspect `bun.lock` for duplicate vulnerable and patched
  versions coexisting.
- Add a recurring dependency audit job separately if desired; this plan is the
  patch lane for the current advisories, not CI policy.
