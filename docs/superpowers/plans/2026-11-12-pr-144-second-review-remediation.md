# PR #144 Second Review Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve the two blocking P2 runtime defects identified in the PR #144 (`better-auth-migration` → `main`) code review so the pull request is ready to merge cleanly.

**Architecture:**
1. **Billing Server Actions (`apps/app`):** Remove the redundant, throwing `requireActiveOrgPageContext()` call from `startCheckout` and `startPortal` in `apps/app/app/(authenticated)/settings/billing/actions.ts`. Both actions already resolve `accountResult = await requireAccountResult()` and verify `hasPermission({ billing: [...] })`; passing `accountResult.value` directly to `createCheckoutSession` and `createPortalSession` eliminates an unnecessary tenant database round-trip and prevents `notFound()` (`NEXT_HTTP_ERROR_FALLBACK;404`) from breaking billing actions when an Account has zero active payroll companies.
2. **Remote Auth Context Rate Limiting (`packages/auth`):** Remove the shared `auth-context:address:${digest(address)}` bucket from `authContextBuckets` in `packages/auth/context-rate-limit.ts` when a session cookie is present. In `AUTH_CONTEXT_MODE=remote`, `apps/api` calls `GET/POST /api/auth-context` on `apps/app` server-to-server, causing Vercel to populate `x-vercel-forwarded-for` with `apps/api`'s outbound NAT IP across all tenants. Keying authenticated requests exclusively by `auth-context:session:${digest(cookie)}` (100 req/60s per unique cookie value) while retaining `auth-context:anonymous:${digest(address)}` (100 req/60s per IP) for cookie-less requests eliminates the cross-tenant 2,000 req/min egress IP bottleneck while preserving per-session isolation.

**Tech Stack:** Bun, Turborepo, Next.js 16 App Router Server Actions, Better Auth 1.7.12, Prisma 7, Vitest.

**Spec:** Derived directly from the PR #144 comprehensive review completed on 2026-11-12 against `HEAD` (`77bd13315cd1c05ee754b9bccc56275df35e2dd8`).

---

## Global Constraints

- Planning output only until execution is authorised. During execution, all repository CI gates must pass (`bun run build`, `bun run check`, `bun run typecheck`, `bun run boundaries`, `bun run test`, `bun run test:release-tools`, `bun run typecheck:release-tools`).
- Work on the existing branch `better-auth-migration`. Do not create branches or worktrees. Push only after owner confirmation.
- Conventional commits, one logical change per commit.
- Australian English in comments and documentation; no em dashes.
- Strict TypeScript: no `any`, no unjustified `as` casts, named exports only.
- Never run destructive database scripts or integration tests against shared Neon endpoints in `.env` / `.env.local`.

---

## A. Remediation Summary

| Task | Priority | Original Finding | Required Change | Dependencies | Blocks Merge |
|---|---|---|---|---|---|
| **Task 1:** Remove `requireActiveOrgPageContext()` from billing Server Actions | **P2** | Finding 1: `startCheckout` and `startPortal` call throwing `requireActiveOrgPageContext()` after `requireAccountResult()`, breaking billing when an Account has zero active companies and running a redundant DB transaction | Delete `requireActiveOrgPageContext` from `apps/app/app/(authenticated)/settings/billing/actions.ts` and `actions.test.ts`; pass `accountResult.value` directly to `createCheckoutSession` and `createPortalSession`; update the phased export reason in `packages/database/src/tenant-phased-modules.ts` | None | **Yes** |
| **Task 2:** Remove shared egress IP rate-limit bucket for session-bearing `/api/auth-context` calls | **P2** | Finding 2: Server-to-server `/api/auth-context` calls from `apps/api` share `apps/api`'s egress IP in `x-vercel-forwarded-for`, subjecting all tenants to a single 2,000 req/min address bucket in `authContextBuckets` | Return only `[{ key: \`auth-context:session:${digest(cookie)}\`, limit: 100 }]` when `cookie` is present in `packages/auth/context-rate-limit.ts`, keeping `[{ key: \`auth-context:anonymous:${digest(address)}\`, limit: 100 }]` when `cookie` is absent; update `packages/auth/context-rate-limit.test.ts` and comment in `packages/auth/adapters/better-auth-server.ts` | None | **Yes** |
| **Task 3:** Regression and monorepo gate verification | **P2** | Verification requirement | Run full local verification suite (`build`, `check`, `typecheck`, `boundaries`, `test`, `test:release-tools`, `typecheck:release-tools`) | Tasks 1, 2 | **Yes** |
| **Task 4:** Final PR review & readiness check | **P2** | Merge readiness gate | Inspect `git diff` against `77bd133`, verify zero regressions or scope creep, and record verification evidence | Task 3 | **Yes** |

---

## B. Detailed Implementation Plan

### Phase 1: Critical Corrections (P0 / P1)

No P0 or P1 findings were identified in the PR review. Proceed directly to Phase 2.

---

### Phase 2: Required Quality Improvements (P2)

#### Task 1: Remove `requireActiveOrgPageContext()` from Billing Server Actions

- **Task ID:** Task 1
- **Priority:** P2
- **Original finding:** Finding 1 (`apps/app/app/(authenticated)/settings/billing/actions.ts:39,73`)
- **Problem:**
  `startCheckout` and `startPortal` resolve the caller's Account via `const accountResult = await requireAccountResult();` (lines 16 and 50) and verify `hasPermission({ billing: ["checkout" | "portal"] })`, returning typed `Result<never, AppError>` values on failure. However, lines 39 and 73 still call `const { accountId } = await requireActiveOrgPageContext();`.
  `requireActiveOrgPageContext()` re-runs `requireAccount()`, opens a redundant `withTenantDb` transaction to query `resolveAccountCompanies(accountId, db)`, and invokes Next.js `notFound()` (throwing `NEXT_HTTP_ERROR_FALLBACK;404`) when an Account has zero active payroll companies. `BillingClient` catches non-redirect exceptions and displays the raw `"NEXT_HTTP_ERROR_FALLBACK;404"` string in the UI error banner.
- **Required outcome:**
  `startCheckout` and `startPortal` pass `accountResult.value` directly to `createCheckoutSession(accountResult.value, planKey)` and `createPortalSession(accountResult.value)` without calling `requireActiveOrgPageContext()`. Billing checkout and portal sessions work for any authenticated `owner` or `admin` regardless of whether an active payroll `Organisation` row exists.
- **Files:**
  - Modify: `apps/app/app/(authenticated)/settings/billing/actions.ts`
  - Modify: `apps/app/app/(authenticated)/settings/billing/actions.test.ts`
  - Modify: `packages/database/src/tenant-phased-modules.ts` (update descriptive `reason` on lines 210-211)
- **Dependencies:** None (can run in parallel with Task 2).
- **Risk:** Low. `createCheckoutSession` and `createPortalSession` in `packages/billing/src/stripe.ts` accept `accountId: string` (`AccountId` is assignable to `string`) and open their own `withTenantDb(accountId, ...)` scope to read `account_subscriptions`. Keep `assertNoTenantTransaction("startCheckout")` and `assertNoTenantTransaction("startPortal")` as the first statements in `actions.ts` so `packages/database/src/boundary.test.ts` continues to pass.

##### Implementation Steps (TDD)

- [x] **Step 1.1: Update unit test in `apps/app/app/(authenticated)/settings/billing/actions.test.ts` to remove `requireActiveOrgPageContext` and verify direct `accountResult.value` usage.**
  In `apps/app/app/(authenticated)/settings/billing/actions.test.ts`:
  1. Remove `requireActiveOrgPageContext: vi.fn(),` from `mocks` (line 9).
  2. Replace the `vi.mock("@/lib/server/require-active-org-page-context", ...)` block (lines 16-19) with a mock that throws if ever imported/called, or delete the mock and assert `createCheckoutSession` / `createPortalSession` receive `accountResult.value` directly:
     ```ts
     // Remove lines 16-19 (vi.mock("@/lib/server/require-active-org-page-context", ...))
     ```
  3. Remove `mocks.requireActiveOrgPageContext.mockResolvedValue({ accountId });` (line 42) and the `expect(mocks.requireActiveOrgPageContext).not.toHaveBeenCalled();` assertions (lines 68, 82, 106, 126, 180, 200).
  4. In `apps/app/app/(authenticated)/settings/billing/page.test.tsx`, remove unused `requireActiveOrgPageContext: vi.fn()` (lines 15, 62-65, 99-102) if unused by `page.tsx`, or leave `page.test.tsx` untouched if out of scope (verify `page.tsx` does not import `requireActiveOrgPageContext`).

- [x] **Step 1.2: Implement the fix in `apps/app/app/(authenticated)/settings/billing/actions.ts`.**
  1. Delete line 9:
     ```ts
     import { requireActiveOrgPageContext } from "@/lib/server/require-active-org-page-context";
     ```
  2. In `startCheckout` (lines 39-40), replace:
     ```ts
     const { accountId } = await requireActiveOrgPageContext();
     const result = await createCheckoutSession(accountId, planKey);
     ```
     with:
     ```ts
     const result = await createCheckoutSession(accountResult.value, planKey);
     ```
  3. In `startPortal` (lines 73-74), replace:
     ```ts
     const { accountId } = await requireActiveOrgPageContext();
     const result = await createPortalSession(accountId);
     ```
     with:
     ```ts
     const result = await createPortalSession(accountResult.value);
     ```
  4. In `packages/database/src/tenant-phased-modules.ts` (lines 208-212), update the `reason` string so it accurately describes the phased boundary:
     ```ts
     {
       exports: ["startCheckout", "startPortal"],
       path: "apps/app/app/(authenticated)/settings/billing/actions.ts",
       reason:
         "C6: Account authentication precedes subscription lookup and Stripe calls outside SQL",
     },
     ```

- [x] **Step 1.3: Run targeted tests and boundary checks.**
  - Run: `bunx vitest run apps/app/app/(authenticated)/settings/billing/actions.test.ts apps/app/app/(authenticated)/settings/billing/billing-client.test.tsx apps/app/app/(authenticated)/settings/billing/page.test.tsx packages/database/src/boundary.test.ts`
  - Expected: All 4 test files pass with 0 errors.

- **Acceptance criteria:**
  - `apps/app/app/(authenticated)/settings/billing/actions.ts` has zero imports or calls to `requireActiveOrgPageContext`.
  - `startCheckout` and `startPortal` pass `accountResult.value` directly to `createCheckoutSession` and `createPortalSession`.
  - `assertNoTenantTransaction` guards remain intact and `packages/database/src/boundary.test.ts` passes.

---

#### Task 2: Remove Shared Egress IP Rate-Limit Bucket for Session-Bearing `/api/auth-context` Calls

- **Task ID:** Task 2
- **Priority:** P2
- **Original finding:** Finding 2 (`packages/auth/context-rate-limit.ts:10-21`, `packages/auth/adapters/better-auth-server.ts:43-71`)
- **Problem:**
  In `AUTH_CONTEXT_MODE=remote`, `apps/api` resolves every authenticated API request and every 30-second SSE heartbeat by calling `fetch(new URL("/api/auth-context", appOrigin))` on `apps/app` via `readRemoteContext`. Because `forwardAuthCookies` forwards only the `cookie` header and Vercel overwrites `x-vercel-forwarded-for` at the edge with the caller's TCP IP, all server-to-server calls from `apps/api` carry `apps/api`'s outbound NAT IP.
  `authContextBuckets` currently returns two buckets when a session cookie is present:
  1. `{ key: "auth-context:address:${digest(address)}", limit: 2000 }`
  2. `{ key: "auth-context:session:${digest(cookie)}", limit: 100 }`
  Consequently, all authenticated users across all tenants hitting `apps/api` share a single 2,000 req/min address bucket per `apps/api` egress IP. Exceeding 2,000 req/min causes `/api/auth-context` to return `429`, which causes `readRemoteContext` to throw `Error("Auth context resolver failed (429)")`.
- **Required outcome:**
  - When a request carries an allowlisted session cookie (`cookie` is truthy), `authContextBuckets` returns only `[{ key: \`auth-context:session:${digest(cookie)}\`, limit: 100 }]`.
  - When a request has no allowlisted session cookie (`cookie` is falsy, e.g. unauthenticated requests to `/api/auth/bootstrap-context`, `/api/auth/account-invitations/[invitationId]/accept`, or `/api/auth-context`), `authContextBuckets` returns `[{ key: \`auth-context:anonymous:${digest(address)}\`, limit: 100 }]`.
  - Every bucket call consumes a single atomic `INSERT ... ON CONFLICT DO UPDATE` in `consumeAuthContextRateLimit` (reducing DB queries per `/api/auth-context` call from 2 to 1) and eliminates cross-tenant interference over shared `apps/api` egress IPs.
- **Files:**
  - Modify: `packages/auth/context-rate-limit.ts`
  - Modify: `packages/auth/context-rate-limit.test.ts`
  - Modify: `packages/auth/adapters/better-auth-server.ts` (update comment on lines 52-53)
- **Dependencies:** None (can run in parallel with Task 1).
- **Risk:** Low. Individual sessions remain strictly capped at 100 req/60s per unique cookie digest, and unauthenticated callers remain capped at 100 req/60s per client IP digest.

##### Implementation Steps (TDD)

- [x] **Step 2.1: Write the failing test in `packages/auth/context-rate-limit.test.ts`.**
  Update the first test in `packages/auth/context-rate-limit.test.ts` (lines 17-25) so it asserts that session-bearing requests sharing an API egress address are keyed solely by their isolated session digest and do not share an address bucket:
  ```ts
  it("isolates sessions sharing an API egress address without a shared address bucket", () => {
    const first = authContextBuckets(request("first"), origin, true);
    const second = authContextBuckets(request("second"), origin, true);
    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);
    expect(first[0].key).toContain(":session:");
    expect(second[0].key).toContain(":session:");
    expect(first[0].key).not.toBe(second[0].key);
    expect(first[0].limit).toBe(100);
    expect(JSON.stringify(first)).not.toContain("first");
    expect(JSON.stringify(first)).not.toContain("secret");
  });
  ```

- [x] **Step 2.2: Run the test to verify it fails.**
  - Run: `bunx vitest run packages/auth/context-rate-limit.test.ts`
  - Expected: FAIL (`expected [ { …(2) }, { …(2) } ] to have a length of 1 but got 2`).

- [x] **Step 2.3: Implement the change in `packages/auth/context-rate-limit.ts` and update the comment in `packages/auth/adapters/better-auth-server.ts`.**
  1. In `packages/auth/context-rate-limit.ts`:
     ```ts
     import { createHash } from "node:crypto";
     import { forwardAuthCookies } from "./cookie-transport";

     /** Session hashes isolate authenticated callers across shared API egress IPs; anonymous requests are bounded by client address. */
     export function authContextBuckets(
       request: Request,
       appOrigin: string,
       vercel: boolean
     ) {
       const address = vercel
         ? (request.headers.get("x-vercel-forwarded-for") ?? "unknown")
         : "development";
       const digest = (value: string) =>
         createHash("sha256").update(value).digest("hex");
       const cookie = forwardAuthCookies(request.headers, appOrigin).get("cookie");
       return cookie
         ? [{ key: `auth-context:session:${digest(cookie)}`, limit: 100 }]
         : [{ key: `auth-context:anonymous:${digest(address)}`, limit: 100 }];
     }
     ```
  2. In `packages/auth/adapters/better-auth-server.ts` (lines 52-53), update the comment above the loop:
     ```ts
     // Each bucket uses one atomic upsert keyed by session token digest (or
     // client address for unauthenticated admission requests).
     ```

- [x] **Step 2.4: Run the `@repo/auth` unit test suite.**
  - Run: `bunx vitest run packages/auth/context-rate-limit.test.ts packages/auth/context.test.ts packages/auth/invitation-route.test.ts packages/auth/adapters/remote-context.test.ts`
  - Expected: All 4 test suites pass.

- **Acceptance criteria:**
  - `authContextBuckets` returns a 1-element array `[{ key: "auth-context:session:<sha256>", limit: 100 }]` when an allowlisted session cookie is present.
  - `authContextBuckets` returns `[{ key: "auth-context:anonymous:<sha256>", limit: 100 }]` when no allowlisted session cookie is present.
  - Duplicate session cookies still throw `"Duplicate auth cookie"`.
  - Raw cookie values and unrelated cookies are never included in bucket keys.

---

### Phase 3: Regression and Integration Validation

#### Task 3: Run Full Monorepo Validation Suite

- **Task ID:** Task 3
- **Priority:** P2
- **Original finding:** All remediated findings (Tasks 1 and 2)
- **Problem:** Any change to Server Actions, phased export metadata, or `@repo/auth` rate-limit helpers must be verified against the repository's build, lint, typecheck, boundary, release-tooling, and unit test gates.
- **Required outcome:** All automated verification commands exit `0` with zero errors.
- **Files:** None modified (verification only).
- **Dependencies:** Tasks 1 and 2.
- **Risk:** None.

##### Verification Steps

- [x] **Step 3.1: Run production build first (regenerates Prisma client per `AGENTS.md`).**
  - Run: `bun run build`
  - Expected: `@repo/database`, `web`, `api`, and `app` build cleanly (exit 0).
- [x] **Step 3.2: Run lint and formatting check.**
  - Run: `bun run check`
  - Expected: Ultracite / Biome exits 0 with 0 errors.
- [x] **Step 3.3: Run TypeScript project references and release-tooling typechecks.**
  - Run: `bun run typecheck && bun run typecheck:release-tools`
  - Expected: 19/19 package typechecks and release-tools typecheck exit 0.
- [x] **Step 3.4: Run package boundary and provider-import checks.**
  - Run: `bun run boundaries`
  - Expected: 0 issues across all 21 packages.
- [x] **Step 3.5: Run monorepo unit tests and release-tooling tests.**
  - Run: `bun run test && bun run test:release-tools`
  - Expected: All 18 package unit test suites and 28 release-tooling test files pass with 0 failures.

---

### Phase 4: Final PR Review

#### Task 4: Final Diff Inspection and Merge Readiness Confirmation

- **Task ID:** Task 4
- **Priority:** P2
- **Original finding:** PR #144 merge readiness
- **Problem:** Confirm that the remediation diff is minimal, introduces no unintended changes, and satisfies every criterion in Section E.
- **Required outcome:** Clean `git status`, surgical `git diff`, and documented verification evidence in `tasks/todo.md`.
- **Files:** `tasks/todo.md` (update progress upon execution).
- **Dependencies:** Task 3.
- **Risk:** None.

##### Steps

- [x] **Step 4.1: Inspect `git diff` and `git status`.**
  - Run: `git status -sb && git diff --stat`
  - Expected: Only `apps/app/app/(authenticated)/settings/billing/actions.ts`, `apps/app/app/(authenticated)/settings/billing/actions.test.ts`, `packages/database/src/tenant-phased-modules.ts`, `packages/auth/context-rate-limit.ts`, `packages/auth/context-rate-limit.test.ts`, `packages/auth/adapters/better-auth-server.ts` (and `tasks/todo.md`) are modified.
- [x] **Step 4.2: Commit changes (upon owner confirmation during execution).**
  - Commit 1: `fix(app): use resolved accountId directly in billing server actions`
  - Commit 2: `fix(auth): key authenticated auth-context rate limit by session digest only`

---

## C. Validation Matrix

| Requirement | Test / Verification | Expected Result | Mode |
|---|---|---|---|
| Billing actions do not call `requireActiveOrgPageContext()` | `bunx vitest run apps/app/app/(authenticated)/settings/billing/actions.test.ts` | PASS; `createCheckoutSession` and `createPortalSession` called with `accountResult.value` | Automated (Local & CI) |
| Phased tenant export registry remains valid | `bunx vitest run packages/database/src/boundary.test.ts` | PASS; `startCheckout` and `startPortal` pass `phaseExportViolation` check | Automated (Local & CI) |
| Session-bearing `/api/auth-context` calls do not share an egress IP bucket | `bunx vitest run packages/auth/context-rate-limit.test.ts` | PASS; 1 bucket (`auth-context:session:<hash>`, limit 100) returned per authenticated request | Automated (Local & CI) |
| Anonymous `/api/auth-context` and bootstrap requests remain IP-bounded | `bunx vitest run packages/auth/context-rate-limit.test.ts` | PASS; 1 bucket (`auth-context:anonymous:<hash>`, limit 100) returned when cookie absent | Automated (Local & CI) |
| Duplicate session cookies rejected | `bunx vitest run packages/auth/context-rate-limit.test.ts` | PASS; throws `"Duplicate auth cookie"` | Automated (Local & CI) |
| Code formatting and lint rules | `bun run check` | PASS (0 errors across 1,430 files) | Automated (Local & CI) |
| TypeScript strictness across monorepo | `bun run typecheck && bun run typecheck:release-tools` | PASS (0 errors) | Automated (Local & CI) |
| Package boundaries & provider encapsulation | `bun run boundaries` | PASS (0 violations) | Automated (Local & CI) |
| Full unit & release-tooling test suites | `bun run test && bun run test:release-tools` | PASS (all suites green) | Automated (Local & CI) |
| Production Next.js & database builds | `bun run build` | PASS (`@repo/database`, `web`, `api`, `app` build cleanly) | Automated (Local & CI) |
| PostgreSQL migrations, RLS & integration suites | GitHub Actions `Test` workflow (`bun run test:integration` on disposable `postgres:16`) | PASS with 0 skipped steps on push | Automated (CI) |

---

## D. Deferred Findings

| Original Finding | Priority | Technical Justification for Deferral |
|---|---|---|
| **Finding 3:** `apps/web/next.config.ts:14-17` overrides `turbopackPluginRuntimeStrategy: "childProcesses"` | **P3** | Deliberately introduced in commit `3b08288` (tracked as F11 in `tasks/todo.md:54`) to prevent intermittent MDX/PostCSS worker-thread desynchronisation failures on 2-core GitHub Actions runners (`TypeError: Cannot read properties of undefined (reading 'map')`). `apps/web` is a small static/MDX marketing app that builds well within the 8 GB Vercel container memory limit even with `childProcesses`, whereas `apps/app` and `apps/api` inherit `workerThreads` on Node `22.x`. Changing `apps/web/next.config.ts` now would re-introduce CI flakiness without fixing a defect. |
| **Finding 4:** `docs/auth-migration/01-inventory.md:946-953` contains relative links to deleted `docs/superpowers/*` files | **P3** | `docs/auth-migration/02-design.md` Section 13.6 (`lines 402-404`) explicitly establishes that `docs/auth-migration/01-inventory.md` and `04-verification.md` are frozen point-in-time historical audit artifacts that must not be altered. |

---

## E. Final Merge Readiness Criteria

PR #144 is ready to be approved and merged into `main` when all of the following objective conditions are satisfied:

1. **Task 1 Complete:** `apps/app/app/(authenticated)/settings/billing/actions.ts` no longer imports or calls `requireActiveOrgPageContext()`, and `apps/app/app/(authenticated)/settings/billing/actions.test.ts` passes.
2. **Task 2 Complete:** `packages/auth/context-rate-limit.ts` keys session-bearing requests exclusively by `auth-context:session:${digest(cookie)}` (limit 100/60s) and cookie-less requests by `auth-context:anonymous:${digest(address)}` (limit 100/60s), and `packages/auth/context-rate-limit.test.ts` passes.
3. **Local Gates Green:** `bun run build`, `bun run check`, `bun run typecheck`, `bun run typecheck:release-tools`, `bun run boundaries`, `bun run test`, and `bun run test:release-tools` all exit `0`.
4. **CI Gates Green:** On push to `origin/better-auth-migration`, the GitHub Actions `Test` workflow (including `bun run test:integration` against disposable PostgreSQL 16) and `CodeQL` check pass with 0 failures and 0 skipped steps.
