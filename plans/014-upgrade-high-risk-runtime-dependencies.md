# Plan 014: Upgrade high-risk runtime dependencies reported by audit

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report, do not improvise. When done, update the status row for this plan
> in `plans/README.md` unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat e04f37d..HEAD -- package.json bun.lock apps/app/package.json apps/api/package.json packages/auth/package.json packages/database/package.json packages/jobs/package.json`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans/013-repair-integration-database-schema-drift.md for full integration verification
- **Category**: security
- **Planned at**: commit `e04f37d`, 2026-07-02

## Why this matters

`bun audit --audit-level high` reported 36 high or critical vulnerabilities in
runtime dependency paths, including auth middleware bypass advisories through
Clerk packages and a critical `protobufjs` advisory through telemetry/job
dependencies. This app relies on Clerk for organisation security and uses
Next.js API routes for webhooks and product operations, so leaving these paths
unpatched is an avoidable production risk.

## Current state

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

- Audit result captured on 2026-07-02: `bun audit --audit-level high` reported
  36 vulnerabilities, including:
  - `@clerk/shared >=3.0.0 <=3.47.4` via `@clerk/nextjs`, `@clerk/themes`, and
    `@clerk/types`, including auth bypass and middleware route protection
    bypass advisories.
  - `protobufjs >=8.0.0 <=8.0.1` via `posthog-js`, `inngest`, and
    `@sentry/nextjs`, including a critical arbitrary code execution advisory.
  - `@grpc/grpc-js`, `undici`, `ws`, `hono`, `fast-uri`, and `vite`.
  - The audit output also mentioned `next >=16.0.0 <16.2.5`; manifests show
    `next: 16.2.6`, so the lockfile and transitive path must be reconciled
    rather than assuming Next is already clean.

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
- `packages/database/package.json`
- `packages/jobs/package.json`
- Other workspace `package.json` files only if `bun why` proves they own a
  vulnerable direct dependency.
- `plans/README.md` (status row)

**Out of scope**:

- Broad dependency modernization unrelated to high/critical advisories.
- Framework migrations that require product code rewrites unless a security fix
  cannot land otherwise.
- Suppressing or ignoring advisories without a written maintainer decision.

## Git workflow

- Branch: `advisor/014-runtime-dependency-security`
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

### Step 2: Patch direct dependencies conservatively

Update direct dependencies to the nearest patched compatible versions. Start
with these likely owners:

- `@clerk/nextjs`, `@clerk/themes`, `@clerk/types`
- `@sentry/nextjs`
- `inngest`
- `undici`
- `ws`
- any package that owns `hono`, `@grpc/grpc-js`, `fast-uri`, `vite`, or
  `protobufjs` in the live audit path

Prefer `bun update <package...>` with explicit package names. Avoid a broad
`bun update` unless explicit updates cannot produce a clean audit.

**Verify**: `bun install` -> exit 0. `bun run typecheck` -> exit 0.

### Step 3: Reconcile the Next.js audit path

Because manifests already pin `next` to `16.2.6`, inspect `bun.lock` and
`bun why next` if the audit still reports the vulnerable Next range. If the
lockfile contains an older Next resolution, regenerate it with explicit Next
updates for every app package. If audit no longer reports Next, do not change
Next further.

**Verify**: `bun audit --audit-level high` no longer reports the Next advisory.

### Step 4: Run the security and regression gates

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

- [ ] `bun audit --audit-level high` exits 0, or any remaining high/critical
      item is documented with a maintainer-approved exception and no runtime
      exploit path.
- [ ] `bun run typecheck`, `bun run check`, and `bun run test` exit 0.
- [ ] `bun run test:integration` exits 0, or the only blocker is plan 013 and
      it is clearly reported.
- [ ] Manifest changes are limited to packages that own vulnerable paths.
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report back if:

- A required Clerk or Next upgrade is a major version that changes middleware,
  auth helper, or route protection APIs.
- The audit remains high/critical after explicit direct dependency updates and
  the remaining path is not under a direct dependency the repo controls.
- Typecheck failures require broad app rewrites unrelated to dependency APIs.
- `bun update` wants to remove or rewrite workspace links.

## Maintenance notes

- Reviewer check: inspect `bun.lock` for duplicate vulnerable and patched
  versions coexisting.
- Add a recurring dependency audit job separately if desired; this plan is the
  patch lane for the current advisories, not CI policy.
