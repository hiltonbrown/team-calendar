# PR #144 Review Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make PR #144 (`better-auth-migration` into `main`) mergeable by fixing the verified review findings: the `@repo/database` to `@repo/auth` import cycle that fails CI, the missing CI evidence, three CodeQL false positives, and stream session re-checks that use up the auth-context rate limit.

**Architecture:** The development seed entry point moves from `@repo/database` into `@repo/auth`. Auth already depends on database, so after the move the dependency runs one way only and `turbo boundaries` passes. The SSE notification stream still checks session expiry locally on every poll. The remote session re-check through `/api/auth-context` is throttled to once every 30 seconds. CodeQL false positives are dismissed using the same approach as `docs/superpowers/plans/2026-10-21-code-scanning-alerts.md`.

**Tech Stack:** Bun, Turborepo (`turbo boundaries`), Prisma 7, Better Auth 1.7.12, Next.js App Router route handlers, Vitest with fake timers, GitHub CLI.

**Spec:** This plan has no separate spec. The source is the PR #144 review completed on 2026-10-31, and its verified findings are reproduced in "Source findings" below.

## Global Constraints

- Planning output only until execution starts. Execution follows AGENTS.md: `bun run check`, `bun run typecheck`, `bun run test`, `bun run test:integration` must all pass, plus `bun run boundaries` (CI step).
- Work on the existing branch `better-auth-migration`. Do not create branches or worktrees. Push only after the owner confirms.
- Conventional commits, one logical change per commit, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Australian English in comments and docs; no em dashes.
- No `any`, no unjustified `as` casts, named exports only.
- Never run integration tests or seeds against the shared Neon endpoint in `packages/database/.env` / `.env.local`. Integration evidence comes from CI's disposable `postgres:16` service.
- Dismissing CodeQL alerts publishes reasons on GitHub: owner confirmation required (Task 3).
- SSE session re-check interval is **30 seconds** (owner decision, 2026-10-31).

## Source findings

| ID | Priority | Finding (verified) |
|---|---|---|
| F1 | P1 | `packages/database/src/seed/auth-fixtures.ts:2-5` imports `../../../auth/development-seed`; `@repo/auth` depends on `@repo/database` (`packages/auth/package.json:89`). `bun run boundaries` fails locally and in CI run 41135521155. |
| F2 | P1 | Because of F1, CI skipped migrate deploy, restricted-role provisioning, drift check, unit tests, release tooling tests, docs link validation, email render and integration tests. There is no CI evidence for the RLS/auth integration suites. |
| F3 | P2 | SSE route `apps/api/app/api/notifications/stream/route.ts:166-171,267-275` calls `getRequestAuthContext` on every poll (2s active). In remote mode each call hits `/api/auth-context`, limited per session to 100/min and per `x-vercel-forwarded-for` address to 2000/min (`packages/auth/context-rate-limit.ts:16-21`). 4 active tabs already exceed the session bucket (120/min); 429 throws in `readRemoteContext` and three failures close the stream. Both the per-poll re-check and the limiter are new in this PR. |
| F4 | P2 | CodeQL check fails with alerts #33 (`packages/xero/src/oauth/service.ts:417`), #40 (`packages/xero/src/oauth/session-token-hash.ts:6`), #41 (`packages/availability/src/sync/availability-uid.ts:20`), all `js/insufficient-password-hash` false positives (HMAC state, random-token lookup hash, deterministic ICS UID). #41 is #25 reappearing after the `clerkOrgId` to `accountId` rename; #25 was dismissed with the same reason. |
| F5 | P3 | `packages/auth/adapters/better-auth-client.ts:53` types `AuthSocialProvider` as `"google" \| "microsoft" \| "xero-auth"`, but only `xero-auth` is configured (`packages/auth/better-auth-options.ts:315-331`, `socialProviders: {}`). |
| F6 | P3 | `packages/database/prisma/schema.prisma:1271-1273` comment still says Clerk remains the active provider. |
| F7 | P3 | PR #144 body is the empty template. |

## Review Focus

1. Seed entry point after the move: running `bun run --cwd packages/auth seed` must still refuse production and mismatched owner/tenant URLs before any database contact. Pinned by Task 1 Step 6 smoke run with `NODE_ENV=production`.
2. A revoked, switched or downgraded session must still close the stream, now within 30 seconds rather than 2. Pinned by Task 4's rewritten `it.each` test.
3. Session expiry must still close the stream on the very next poll after `expiresAt`, independent of the 30s throttle. Existing test "closes at the original session expiry even if a later lookup might renew it" must pass unchanged.
4. A resolver outage during a throttled re-check must still surface as a poll failure, not a silent close. Existing test "propagates resolver outages instead of returning a signed-out response" must pass unchanged.
5. Hidden failures in CI steps that never ran on this branch (drift check, integration tests). Task 2 surfaces them early; any new failure is a new finding and stops execution for re-planning (AGENTS.md "If something goes sideways, STOP and re-plan").

---

## A. Remediation Summary

| Task | Priority | Original Finding | Required Change | Dependencies | Blocks Merge |
|---|---|---|---|---|---|
| 1 | P1 | F1 | Move seed entry point into `@repo/auth`; database fixture takes the auth seeding function as an argument | None | Yes |
| 2 | P1 | F2 | Push, get CI past boundaries, triage anything newly surfaced | 1 | Yes |
| 3 | P2 | F4 | Dismiss CodeQL #33, #40, #41 as false positives (owner-confirmed) | None | Yes (red check) |
| 4 | P2 | F3 | Throttle SSE remote session re-check to once per 30s | None | No (launch gate) |
| 5 | P3 | F5, F6 | Narrow `AuthSocialProvider`; correct stale schema comment | None | No |
| 6 | — | F1-F6 | Full local gates and final green CI run | 1-5 | Yes |
| 7 | P3 | F7 + all | Final review against findings; fill PR description (owner-confirmed) | 6 | No |

Complexity: Task 1 medium (about 6 files, script relocation); Task 2 low, but open-ended if CI surfaces new failures; Task 3 trivial; Task 4 low-medium (timer logic plus test rewrite); Task 5 trivial; Tasks 6-7 low.

---

## B. Detailed Implementation Plan

### Phase 1: Critical corrections

### Task 1: Break the database to auth import cycle

**Files:**
- Modify: `packages/database/src/seed/auth-fixtures.ts:1-11,104-126`
- Modify: `packages/database/src/seed/auth-fixtures.test.ts:1-60` (mock setup and call sites)
- Create: `packages/database/src/seed/development-seed-runner.ts` (content moved from `packages/database/seed.ts`)
- Delete: `packages/database/seed.ts`
- Modify: `packages/database/package.json` (add export, remove `seed` script at line 152)
- Create: `packages/auth/scripts/seed-development.ts`
- Modify: `packages/auth/package.json` (`scripts` block at line 79)
- Modify: `README.md:145`, `docs/auth-migration/03-cutover.md:48`

**Interfaces:**
- Produces (in `packages/database/src/seed/auth-fixtures.ts`):
  ```ts
  export interface DevelopmentTenantAccount {
    accountId: string;
    country: string;
    timeZone: string;
    users: readonly { email: string; role: string; userId: string }[];
  }
  export type SeedAuthAccounts = (
    owner: PrismaClient,
    password: string
  ) => Promise<readonly DevelopmentTenantAccount[]>;
  export async function seedAuthDevelopmentFixtures(
    owner: PrismaClient,
    password: string,
    seedAuthAccounts: SeedAuthAccounts
  ): Promise<{ accounts: readonly DevelopmentTenantAccount[]; organisations: number; people: number; plans: Awaited<ReturnType<typeof syncPlansFromCatalogue>>; teams: number }>;
  ```
- Produces (in `packages/database/src/seed/development-seed-runner.ts`, exported as `@repo/database/seed/development-seed-runner`):
  ```ts
  export async function runDevelopmentSeed(seedAuthAccounts: SeedAuthAccounts): Promise<void>;
  ```
- Consumes: `seedDevelopmentAuthAccounts(db: PrismaClient, input: { password: string }): Promise<DevelopmentSeedAccount[]>` from `packages/auth/development-seed.ts:199`. `DevelopmentSeedAccount` (line 24) is structurally assignable to `DevelopmentTenantAccount`.

- [ ] **Step 1: Write the failing test.** In `auth-fixtures.test.ts`, delete the `vi.mock("../../../auth/development-seed", ...)` block (lines 17-19). Pass `mocks.auth` as the third argument at every `seedAuthDevelopmentFixtures(owner, "long-test-password")` call site. In the existing "writes each country's companies..." test add:
  ```ts
  expect(mocks.auth).toHaveBeenCalledExactlyOnceWith(owner, "long-test-password");
  expect(mocks.auth.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.tenant.mock.invocationCallOrder[0]
  );
  ```
- [ ] **Step 2: Run it to verify it fails.** `bunx vitest run packages/database/src/seed/auth-fixtures.test.ts`. Expected: FAIL, either because the unmocked real `seedDevelopmentAuthAccounts` runs or because `mocks.auth` was not called.
- [ ] **Step 3: Implement.** In `auth-fixtures.ts`, remove the `../../../auth/development-seed` import, add the `DevelopmentTenantAccount` and `SeedAuthAccounts` exports, and change `seedAccountDomain` to take `DevelopmentTenantAccount`. `seedAuthDevelopmentFixtures` calls `await seedAuthAccounts(owner, password)` where it called `seedDevelopmentAuthAccounts` (line 110). Keep `assertNoTenantTransaction("seedAuthDevelopmentFixtures")` as the first statement. Keep the export name, because `packages/database/src/tenant-phased-modules.ts:4-9` registers it by name and path.
- [ ] **Step 4: Run it to verify it passes.** Same command. Expected: PASS.
- [ ] **Step 5: Relocate the entry point.** Move the body of `packages/database/seed.ts` into `runDevelopmentSeed(seedAuthAccounts)` in `development-seed-runner.ts`. Keep `configuration()`, `assertRestrictedDatabaseRole`, `createStandaloneDatabaseClient`, the stdout summary, the fixed stderr message, `process.exitCode = 1` and the `finally` disconnects unchanged. Change the env file path to `fileURLToPath(new URL("../../.env", import.meta.url))` so it still loads `packages/database/.env`, and call `process.loadEnvFile` inside the function. Pass `seedAuthAccounts` through to `seedAuthDevelopmentFixtures`. Delete `packages/database/seed.ts`. In `packages/database/package.json`:
  - remove the `"seed"` script;
  - add the export `"./seed/development-seed-runner": { "types": "./src/seed/development-seed-runner.ts", "default": "./src/seed/development-seed-runner.ts" }` next to the existing entries.

  Create `packages/auth/scripts/seed-development.ts`:
  ```ts
  import { runDevelopmentSeed } from "@repo/database/seed/development-seed-runner";
  import { seedDevelopmentAuthAccounts } from "../development-seed";

  await runDevelopmentSeed((owner, password) =>
    seedDevelopmentAuthAccounts(owner, { password })
  );
  ```
  Add `"seed": "bun --conditions=react-server run scripts/seed-development.ts"` to `packages/auth/package.json` scripts. Update `README.md:145` to `bun run --cwd packages/auth seed`, and `docs/auth-migration/03-cutover.md:48` to the new script path `packages/auth/scripts/seed-development.ts`. Run `grep -rn "packages/database seed\|packages/database/seed.ts" --include=*.md --include=*.json --include=*.yml --include=*.sh . | grep -v node_modules`. Expected: hits only in historical inventory/verification docs under `docs/auth-migration/0[14]-*.md`, which record past state and stay unchanged.
- [ ] **Step 6: Verify boundaries, phased registry and the moved entry point.**
  - `bun run boundaries`: expected `Checked ... 0 issues` (exit 0).
  - `bunx vitest run packages/database/src/boundary.test.ts packages/database/src/seed packages/auth/package-exports.test.ts`: expected PASS.
  - `cd packages/auth && NODE_ENV=production bun --conditions=react-server run scripts/seed-development.ts; echo "exit $?"`: expected the stderr line starting "Development seed failed." and `exit 1`. This proves module resolution with no database contact, because `configuration()` rejects production first. It needs `process.loadEnvFile` not to override an already-set `NODE_ENV`, which matches Node/Bun behaviour. Check that `configuration()` still checks `NODE_ENV` before the URLs.
- [ ] **Step 7: Run the package gates.** `bun run check && bun run typecheck && bunx vitest run packages/database packages/auth --exclude '**/*.integration.test.ts'`. Expected: all pass.
- [ ] **Step 8: Commit.**
  ```bash
  git add packages/database/src/seed packages/database/package.json packages/auth/scripts packages/auth/package.json README.md docs/auth-migration/03-cutover.md
  git rm packages/database/seed.ts
  git commit -m "fix(database): move development seed entry into auth to remove package cycle"
  ```

**Acceptance:** `bun run boundaries` exits 0; no file under `packages/database` imports from `packages/auth`; `seedAuthDevelopmentFixtures` is still registered and guarded; the seed script refuses production.
**Risk:** Low. The development-only seed path changes location. Developers using `bun run --cwd packages/database seed` must switch commands; README covers it.

### Task 2: Surface CI evidence early

**Files:** none (verification task).

- [ ] **Step 1: Get owner confirmation, then push.** Ask the owner before pushing. Then `git push origin better-auth-migration`.
- [ ] **Step 2: Watch CI.** `gh pr checks 144 --watch`. Expected: the `Test` job passes "Package boundaries" and runs every later step.
- [ ] **Step 3: Triage.** If any later step fails (drift check, unit tests, integration tests, docs links, email render), stop. Record the failing step and log excerpt from `gh run view <run-id> --log-failed` under a "New findings" heading in this plan, and re-plan before fixing. Do not fold unplanned fixes into Tasks 3-5.

**Acceptance:** A CI run on the Task 1 commit where every step of the `Test` job ran. Either all pass, or each failure is recorded as a new finding.
**Risk:** May reveal defects that were hidden. That is intended.

### Task 3: Dismiss CodeQL false positives

Requires owner confirmation, because it publishes dismissal reasons on GitHub. It can run in parallel with any other task.

- [ ] **Step 1: Confirm the alerts are still open and unchanged.**
  `gh api "repos/hiltonbrown/team-calendar/code-scanning/alerts?ref=refs/pull/144/head&per_page=50" --jq '.[] | select(.state=="open") | "#\(.number) \(.rule.id) \(.most_recent_instance.location.path):\(.most_recent_instance.location.start_line)"'`
  Expected: exactly #33 `service.ts:417`, #40 `session-token-hash.ts:6`, #41 `availability-uid.ts:20`, all `js/insufficient-password-hash`. If any other alert appears, triage it before dismissing anything.
- [ ] **Step 2: Dismiss with recorded reasons** (`gh api -X PATCH repos/hiltonbrown/team-calendar/code-scanning/alerts/<n> -f state=dismissed -f dismissed_reason="false positive" -f dismissed_comment="..."`):
  - #33: "HMAC-SHA256 authenticates a signed OAuth state token; it is not password storage. Taint path is stitched by unit tests chaining start to callback."
  - #40: "Input is a 32-byte random OAuth nonce or HMAC-signed state token, not a password. SHA-256 is the correct lookup hash."
  - #41: "SHA-256 derives a deterministic ICS calendar UID per PRODUCT.md's UID formula, not a password hash. Same basis as dismissed alert #25; reappeared after the accountId rename."
- [ ] **Step 3: Verify.** After the next push (Task 6), `gh pr checks 144` shows `CodeQL pass`.

**Acceptance:** No open `js/insufficient-password-hash` alerts on `refs/pull/144/head`; the CodeQL check is green.
**Risk:** None to code. A wrong dismissal would hide a real issue, which Step 1 guards against.

### Phase 2: Required quality improvements

### Task 4: Throttle SSE remote session re-check to 30 seconds

**Files:**
- Modify: `apps/api/app/api/notifications/stream/route.ts:9-13` (constants), `:72-105` (session fields/constructor), `:165-175` (`performPoll`)
- Test: `apps/api/app/api/notifications/stream/route.test.ts:169-201` (rewrite `it.each`), plus one new test

**Interfaces:**
- Consumes: `StreamContext.revalidate: () => Promise<boolean>` (unchanged), `StreamContext.expiresAt: number | null` (unchanged).
- Produces: module constant `SESSION_REVALIDATE_INTERVAL_MS = 30_000` (not exported).

- [ ] **Step 1: Write the failing tests.**
  - New test `"re-checks the session remotely at most once every 30 seconds while polling"`. Use fake timers and a valid context. `GET`, then `await vi.advanceTimersByTimeAsync(0)` (first poll at t=0), then `await vi.advanceTimersByTimeAsync(61_000)`. Expect `mocks.getRequestAuthContext` to have been called `3` times: once at open, then re-checks at the t=30s and t=60s polls. Expect `mocks.pollNotificationStream` to have been called more than 25 times (polls at 0, 2, ..., 60s), proving that polling stays at 2s.
  - Rewrite the `it.each(["revoked", "account switched", "role changed"])` test as `"closes within 30 seconds, before reading more notifications, when the session is %s"`. Keep the existing `advanceTimersByTimeAsync(0)` and the mocked context change. Then `advanceTimersByTimeAsync(29_000)` (last poll at t=28s), record `const polled = mocks.pollNotificationStream.mock.calls.length` and expect `polled > 1`, so the stream is still open. Then advance `1_000` (t=30s re-check fails before reading), expect `mocks.pollNotificationStream` still to have `polled` calls, and expect the reader to end with `{ done: true, value: undefined }`.
- [ ] **Step 2: Run them to verify they fail.** `bunx vitest run apps/api/app/api/notifications/stream/route.test.ts`. Expected: the new test fails, because the call count is about 31. The rewritten test fails, because the stream closes at 2s and `polled` is 1.
- [ ] **Step 3: Implement.** Add `const SESSION_REVALIDATE_INTERVAL_MS = 30_000;` beside the poll constants. Add `private lastRevalidatedAt: number`, initialised to `Date.now()` in the constructor (the GET handler's check counts as the first). In `performPoll`, keep the local `expiresAt` check on every poll. Call `this.context.revalidate()` only when `Date.now() - this.lastRevalidatedAt >= SESSION_REVALIDATE_INTERVAL_MS`, and set `lastRevalidatedAt = Date.now()` after a successful (true) result. A false result closes the stream as today. A thrown result propagates to `handlePollFailure` as today, without updating `lastRevalidatedAt`, so the next poll retries.
- [ ] **Step 4: Run the tests to verify they pass.** Same command. Expected: all tests in the file pass, including the unchanged expiry, outage, failure-counter, idle back-off and Last-Event-ID tests.
- [ ] **Step 5: Check the docs.** Run `grep -rn "every poll\|revalidat" PRODUCT.md AGENTS.md docs/auth-migration apps/docs 2>/dev/null | grep -i "stream\|sse\|notification"`. If a document states per-poll revalidation, change it to "re-checks the session at least every 30 seconds; session expiry is enforced on every poll".
- [ ] **Step 6: Commit.**
  ```bash
  git add apps/api/app/api/notifications/stream/route.ts apps/api/app/api/notifications/stream/route.test.ts
  git commit -m "fix(api): throttle notification stream session re-checks to 30 seconds"
  ```
  Include any doc file changed in Step 5.

**Acceptance:** Each open stream makes at most 2 remote auth-context calls a minute (about 6% of the 100/min session bucket per tab). Revoked, switched or downgraded sessions close within 30s with no further notification reads. Expiry still closes on the next poll.
**Risk:** Accepted window of up to 30s in which a revoked session keeps receiving its own notifications on an already-open stream. Notifications are keyed `account:<accountId>:<userId>`, so nothing crosses accounts.

### Task 5: Trivial cleanup (P3)

**Files:**
- Modify: `packages/auth/adapters/better-auth-client.ts:53`
- Modify: `packages/database/prisma/schema.prisma:1271-1273`

- [ ] **Step 1: Narrow the type.** Change it to `export type AuthSocialProvider = "xero-auth";`. Run `bun run typecheck`. Expected: pass. Callers are `better-auth-client.ts:310` and `apps/app/components/auth/auth-forms.tsx:57`, which use `"xero-auth"` only. Do not touch `apps/app/components/feed/feed-provider-buttons.tsx` (its `"google"` is a calendar `FeedProvider`, unrelated).
- [ ] **Step 2: Correct the comment.** Replace lines 1272-1273 with:
  ```prisma
  // Tenant tables reference Accounts by text account_id without a foreign key.
  // Auth tables have no grants for the restricted team_calendar_app role.
  ```
  Keep line 1271. Run `bun run --cwd packages/database build`, then `git status --short packages/database/generated packages/database/prisma/migrations`. Expected: no changes, because comments do not affect the client or migrations.
- [ ] **Step 3: Commit.**
  ```bash
  git add packages/auth/adapters/better-auth-client.ts packages/database/prisma/schema.prisma
  git commit -m "chore(auth): narrow social provider type and correct auth schema comment"
  ```

**Acceptance:** Typecheck passes; no generated or migration diff.
**Risk:** Negligible.

### Phase 3: Regression and integration validation

### Task 6: Full gates and final CI

- [ ] **Step 1: Run the local gates in order.**
  1. `bun run build`, run on its own first so Prisma generation completes (AGENTS.md).
  2. `bun run check`
  3. `bun run typecheck`
  4. `bun run boundaries`
  5. `bun run test`

  Expected: all exit 0. Use `--force` on turbo if results replay from cache after these edits (`bunx turbo run typecheck test --force`).
- [ ] **Step 2: Push** (owner confirmation) and run `gh pr checks 144 --watch`. Expected: `Test` and `CodeQL` pass, with every `Test` step showing success (`gh run view <id> --json jobs --jq '.jobs[].steps[] | "\(.name): \(.conclusion)"'`), including "Drift check" and "Run integration tests".
- [ ] **Step 3: Manual check, owner-run, does not block merge.** On the Vercel preview for this commit, open the app and keep one notification stream open, then read the app project's runtime logs for `/api/auth-context`. Confirm the call rate is about 2/min per tab. Record whether `x-vercel-forwarded-for` on those server-to-server calls is the API function's outbound IP. If it is, the shared 2000/min address bucket is a confirmed launch risk: record it as a new finding for a separate plan. Do not change the limiter here.

**Acceptance:** Green CI with no skipped `Test` steps. Step 3 outcome recorded in this plan.

### Phase 4: Final PR review

### Task 7: Reassess and document

- [ ] **Step 1: Check against the findings.** For F1-F6, record evidence in a "Results" section of this plan: commit SHA plus the command or check that proves each one.
- [ ] **Step 2: Fill in the PR description** (owner confirmation; `gh pr edit 144 --body-file <file>`). Cover:
  - the purpose (Clerk to self-hosted Better Auth);
  - the main safety mechanisms (allowlisted auth paths, trimmed responses, database-level membership invariants, no app-role grants on auth tables, job identity fencing);
  - migration and cutover notes, linking `docs/auth-migration/03-cutover.md`;
  - the seed command change;
  - the 30s stream re-check window;
  - the deferred findings (section D).

  End the body with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- [ ] **Step 3: Review the diff.** Run a fresh code review of the remediation commits only (`git diff <pre-remediation-sha>..HEAD`) to confirm no scope creep and no new defects.

**Acceptance:** Every merge readiness criterion in section E is met.

### Parallel execution

Tasks 1, 3, 4 and 5 touch disjoint files and can run in parallel. Task 2 waits for Task 1. Task 6 waits for Tasks 1-5. Task 7 waits for Task 6. Use one push for Tasks 3-5 to save CI runs.

---

## C. Validation Matrix

| Requirement | Test / Verification | Expected Result | Automated |
|---|---|---|---|
| No database to auth import | `bun run boundaries` | 0 issues, exit 0 | Yes |
| Seed fixture still calls auth first, then tenant scope | `auth-fixtures.test.ts` | PASS | Yes |
| Phased export registry still valid | `packages/database/src/boundary.test.ts` | PASS | Yes |
| Moved seed entry resolves and refuses production | Task 1 Step 6 smoke run | stderr "Development seed failed.", exit 1 | Yes (local) |
| Stream re-checks at most every 30s | New route test | 3 auth calls in 61s, more than 25 polls | Yes |
| Revoked, switched or downgraded session closes | Rewritten `it.each` | Closed by 30s, no extra reads | Yes |
| Expiry and outage behaviour unchanged | Existing route tests | PASS unchanged | Yes |
| Type narrowing safe | `bun run typecheck` | Exit 0 | Yes |
| Schema comment has no generation effect | `build` plus `git status` | No diff | Yes |
| Lint, types and unit tests | `check`, `typecheck`, `test` | Exit 0 | Yes |
| Migrations apply, no drift, RLS/auth integration suites | CI `Test` job | All steps success, none skipped | Yes (CI only) |
| CodeQL clean | `gh pr checks 144` | CodeQL pass | Yes (after dismissal) |
| Auth-context call rate in deployment | Preview runtime logs | About 2/min per tab; egress IP behaviour recorded | Manual |
| Each finding resolved or deferred | Task 7 Results section | F1-F6 evidenced | Manual |

## D. Deferred Findings

| Finding | Why deferred |
|---|---|
| `publishOrganisationNotificationEvent` ignores `organisationId` (`packages/notifications/src/sse/broker.ts:88-124`) | Behaviour predates this PR (the diff only renames fields) and causes no cross-account leak. Choosing recipients (people in the company, or admins) is a product decision. Track separately. |
| Legacy `clerk_org_id` fallback in Stripe routing and `clerkOrgId` OAuth state fallback | Both are signed or binding-checked, so security is not weakened. Removing them safely needs production data confirmation (no legacy-metadata subscriptions, no unexpired legacy states). Remove after cutover. |
| Reset script allows a `default`/`primary` Neon branch | Deliberate and covered by `reset-auth-data-core.test.ts:240`; guarded by exact branch name, `--execute --confirm`, the `protected` flag and legacy-only row scope. |
| Shared address bucket redesign in `context-rate-limit.ts` | Shared outbound IP is unverified. Task 4 cuts load by about 93%. Task 6 Step 3 measures it; if confirmed, it goes to a separate plan, since it trades off against token-guessing protection. |
| Account deletion leaves tenant rows (no foreign key) | There is no supported Account deletion flow. Task 5 documents the fact. |
| PR scope (web status page, dev scripts, Node pin) | Already committed, low risk, and they build. Splitting would mean rewriting history on a shared PR branch for no defect benefit. Disclosed in the PR description. |

## E. Final Merge Readiness Criteria

1. `bun run boundaries`, `check`, `typecheck` and `test` exit 0 locally on the final commit.
2. CI `Test` job is green on the final commit, with **no skipped steps**, including migrate deploy, drift check and integration tests.
3. CodeQL check green; no open alerts on `refs/pull/144/head` other than ones triaged and dismissed with recorded reasons.
4. Vercel previews for api, app and web deploy successfully.
5. No file in `packages/database` imports from `packages/auth`.
6. Stream route tests prove the 30s re-check bound and unchanged expiry and outage behaviour.
7. Any new finding from Task 2 or Task 6 is resolved, or explicitly deferred with the owner's agreement.
8. PR description filled in; Task 7 Results section lists evidence for F1-F6.
9. Owner sign-off on the 30s re-check window (given 2026-10-31) and on the Task 6 Step 3 measurement outcome.

---

## New findings from CI run 41140715790 (Task 2)

| ID | Priority | Finding |
|---|---|---|
| F8 | P2 | In CI run 41140715790 (commit `47b5e75`), package boundaries, migrate deploy, restricted-role provisioning, and drift check all succeeded. In `Run unit tests`, `@repo/auth#test` failed due to Vitest test timeouts under concurrency on the 2-core CI runner: `better-auth-runtime.test.ts:242` timed out at default 5000ms (5 scrypt password hashing iterations in sign-in bucket test), and `development-seed.test.ts:114,150` timed out at explicit 15000ms (12 and 24 native user seeds with password hashing). `packages/auth` lacked a `vitest.config.mts` setting `testTimeout: 30_000` (which `packages/jobs` and `packages/database` both configure). |

### Remediation Plan for F8 (Task 2.1)

1. Add `packages/auth/vitest.config.mts` matching `packages/jobs/vitest.config.mts` with `testTimeout: 30_000`, `environment: "node"`, `conditions: ["react-server", "node"]` and `server-only` alias.
2. In `packages/auth/development-seed.test.ts`, update explicit `15_000` timeouts on lines 149 and 163 to `30_000` so they match the package standard and do not cap the timeout below 30s on slow CI workers.
3. Verify `bun run --cwd packages/auth test` passes locally.
4. Commit as `fix(auth): configure vitest 30s timeout for password hashing tests`.
