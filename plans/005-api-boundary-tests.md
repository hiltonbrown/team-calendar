# Plan 005: Add tests for the public HTTP boundaries: ICS feed route and manual availability routes

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report, do not improvise. When done, update the status row for this plan
> in `plans/README.md` unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 8790bdb..HEAD -- apps/api/app/ical apps/api/app/api/availability`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.
>
> **Preview branch note**: earlier-numbered plans land on `preview` before
> this one, so this diff will legitimately include their changes. Treat a
> mismatch as a STOP condition only when it is not explained by an earlier
> plan's documented scope; excerpt line numbers may have shifted accordingly.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW (tests only; no production code changes)
- **Depends on**: none (001 covers the payments webhook; do not duplicate it here)
- **Category**: tests
- **Planned at**: commit `8790bdb`, 2026-07-02

## Why this matters

The domain packages are well tested (140+ test files), but the HTTP seam in `apps/api` is nearly untested: the only route test is a health check. The ICS feed endpoint is the public contract for every subscribed Outlook/Google/Apple calendar; its 404/410/304 semantics and cache headers are load-bearing (a wrong status turns into every subscriber's calendar breaking silently). The manual availability routes are user-triggered state mutations whose auth, validation, and organisation-scoping checks live in the route file itself, not the service layer, so nothing exercises them today. These tests pin the request-to-service seam so refactors (for example plan 004's header work, or any auth helper change) cannot silently alter public behaviour.

## Current state

- `apps/api/app/ical/[token]/route.ts` - 65-line GET handler. Behaviour to pin, from the code as written:
  - strips a trailing `.ics` from the token param (lines 20-22)
  - calls `renderFeedForToken(token)` from `@repo/feeds`; on `!ok` returns 404 "Not found" (lines 25-30)
  - on `status === "expired" || status === "revoked"` returns 410 "Gone" (lines 35-37)
  - on `If-None-Match` matching the quoted etag (weak-prefix `W/` stripped, comma-separated list supported) returns 304 with `ETag` and `Cache-Control: max-age=3600, must-revalidate` (lines 39-54)
  - otherwise 200 with the body, `Content-Type: text/calendar;charset=utf-8`, `Cache-Control`, and quoted `ETag` (lines 57-64)
- `apps/api/app/api/availability/route.ts` - POST creates a manual availability record. Order of checks (lines 22-100+): `requireOrg()` from `@repo/auth/helpers` (401 on throw), `currentUser()` (401 if null), Zod `CreateAvailabilitySchema.safeParse` (400 with `issues`), `body.organisationId` required (400), `getOrganisationById(clerkOrgId, organisationId)` (404 when `not_found`), `listPeopleForOrganisation(...)` then person-in-org check, then `createManualAvailability(...)` from `@repo/availability`. Read the rest of the file before writing tests; the excerpt above covers lines 1-100 only.
- `apps/api/app/api/availability/[recordId]/route.ts` - PATCH/DELETE for a single record; same auth/scoping style. Read it fully before testing.
- Existing route-test exemplar, the entire file:

```ts
// apps/api/__tests__/health.test.ts
import { expect, test } from "vitest";
import { GET } from "../app/health/route";

test("Health Check", async () => {
  const response = await GET(); 
  expect(response.status).toBe(200);
  expect(await response.text()).toBe("OK");
});
```

- Module-mocking exemplar: `packages/billing/src/stripe.test.ts` (declares `vi.mock(...)` for each dependency, then `await import(...)` of the module under test).
- Test command per app: `cd apps/api && NODE_ENV=test bunx vitest run` (from `apps/api/package.json`: `"test": "NODE_ENV=test vitest run"`).

Conventions: Vitest; factories/builders over repeated literals (CLAUDE.md testing rules); Australian English; no em dashes. These are unit tests of the route handlers with mocked service modules, not database integration tests; the service behaviour itself is covered in the packages.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `bun run typecheck` | exit 0 |
| Lint | `bun run check` | exit 0 |
| Run new feed test | `cd apps/api && NODE_ENV=test bunx vitest run __tests__/ical-route.test.ts` | all pass |
| Run new availability tests | `cd apps/api && NODE_ENV=test bunx vitest run __tests__/availability-routes.test.ts` | all pass |
| Whole api app suite | `cd apps/api && NODE_ENV=test bunx vitest run` | all pass |

## Scope

**In scope** (create only; no production files change):

- `apps/api/__tests__/ical-route.test.ts` (create)
- `apps/api/__tests__/availability-routes.test.ts` (create)
- `plans/README.md` (status row)

**Out of scope** (do NOT touch):

- Any file under `apps/api/app/` - if a test reveals a real bug, STOP and report it; do not fix production code in this plan.
- `apps/api/app/webhooks/payments/route.ts` tests - plan 001 owns them.
- Server actions in `apps/app/**/_actions.ts` - deferred follow-up (see Maintenance notes).
- The Xero OAuth callback route - it depends on OAuth state helpers worth their own focused plan; do not half-test it here.

## Git workflow

- Branch: `preview` (shared branch for all plans; implement sequentially in plan-number order on top of the previous plan's commits)
- Commit message: `test(api): cover ical feed route and availability route handlers`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Test the ICS feed route

Create `apps/api/__tests__/ical-route.test.ts`. Mock `@repo/feeds` with `vi.mock` and dynamically import the route (mocking style of `packages/billing/src/stripe.test.ts`):

```ts
vi.mock("@repo/feeds", () => ({ renderFeedForToken: vi.fn() }));
const { renderFeedForToken } = await import("@repo/feeds");
const { GET } = await import("../app/ical/[token]/route");
```

Call the handler as the framework does:

```ts
const response = await GET(new Request("http://localhost/ical/tok123.ics"), {
  params: Promise.resolve({ token: "tok123.ics" }),
});
```

Cases:

1. `.ics` suffix stripped: params token `"tok123.ics"` → `renderFeedForToken` called with `"tok123"`.
2. Render failure (`{ ok: false, error: ... }`) → 404, body "Not found".
3. `status: "expired"` and `status: "revoked"` (two cases) → 410, body "Gone".
4. Active feed → 200, body equals the fixture body, `Content-Type` is `text/calendar;charset=utf-8`, `ETag` is the quoted etag, `Cache-Control` is `max-age=3600, must-revalidate`.
5. `If-None-Match: "abc"` matching etag `abc` → 304, empty body, `ETag` header present.
6. Weak validator `If-None-Match: W/"abc"` → 304 (weak prefix stripped).
7. `If-None-Match: "zzz", "abc"` (list) → 304; and a non-matching `If-None-Match: "zzz"` → 200.

Use one small builder, e.g. `const renderResult = (overrides = {}) => ({ ok: true, value: { body: "BEGIN:VCALENDAR...", etag: "abc", status: "active", ...overrides } })`, instead of repeating literals.

**Verify**: `cd apps/api && NODE_ENV=test bunx vitest run __tests__/ical-route.test.ts` → 8 tests pass.

### Step 2: Test the availability collection route (POST)

First read `apps/api/app/api/availability/route.ts` and `.../[recordId]/route.ts` in full. Then create `apps/api/__tests__/availability-routes.test.ts` mocking, at minimum:

- `@repo/auth/helpers`: `requireOrg: vi.fn()`, `currentUser: vi.fn()`
- `@repo/availability`: `createManualAvailability: vi.fn()` plus whatever the `[recordId]` route imports
- `@repo/database/src/queries/organisations`: `getOrganisationById: vi.fn()`
- `@repo/database/src/queries/people`: `listPeopleForOrganisation: vi.fn()`
- `@repo/observability/log`: `log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() }`

POST cases:

1. `requireOrg` throws → 401 with `error.code === "unauthorised"`.
2. `currentUser` resolves null → 401.
3. Invalid body (missing `personId`) → 400 with `error.code === "invalid"` and `details` array.
4. Missing `organisationId` in body → 400 with message "organisationId is required".
5. `getOrganisationById` returns `{ ok: false, error: { code: "not_found", ... } }` → 404.
6. Person not in the organisation's people list → whatever the route returns (read the code; assert that exact status).
7. Happy path → `createManualAvailability` called with the parsed data, response status matches the route's success status, and `getOrganisationById` was called with the same `clerkOrgId` returned by `requireOrg` (this is the tenant-isolation assertion).

Request helper: `new Request("http://localhost/api/availability", { method: "POST", body: JSON.stringify(payload), headers: { "content-type": "application/json" } })`.

**Verify**: `cd apps/api && NODE_ENV=test bunx vitest run __tests__/availability-routes.test.ts` → all pass.

### Step 3: Test the single-record route (PATCH/DELETE)

Extend `availability-routes.test.ts` with the `[recordId]` handlers, covering: unauthenticated → 401; record lookup scoped by the caller's org (assert the query/service mock received the `requireOrg` org id); not-found → 404; happy PATCH and happy DELETE statuses as the code defines them. Base the exact cases on your reading of the file; the invariant that matters most is that every data access the route makes carries the authenticated `clerkOrgId`, never one from the request body.

**Verify**: `cd apps/api && NODE_ENV=test bunx vitest run __tests__/availability-routes.test.ts` → all pass, including the new cases.

### Step 4: Full suite and lint

**Verify**: `cd apps/api && NODE_ENV=test bunx vitest run` → all pass. `bun run check` → exit 0. `bun run typecheck` → exit 0.

## Test plan

This plan is a test plan; the case lists in steps 1-3 are the deliverable. Pattern references: `apps/api/__tests__/health.test.ts` (route invocation) and `packages/billing/src/stripe.test.ts` (mock-then-dynamic-import). Expected new totals: ~8 tests for the feed route, ~10-12 for the availability routes.

## Done criteria

- [ ] `apps/api/__tests__/ical-route.test.ts` exists with the 7 case groups from step 1
- [ ] `apps/api/__tests__/availability-routes.test.ts` exists covering POST, PATCH, and DELETE paths
- [ ] `cd apps/api && NODE_ENV=test bunx vitest run` exits 0
- [ ] `bun run typecheck` exits 0 and `bun run check` exits 0
- [ ] `git status` shows only the two new test files (and the plans index) as changes
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back if:

- A test reveals the route behaving differently from its documented contract (for example, revoked tokens not returning 410). That is a production bug: report it with the failing test, leave the test in place marked `.fails` or skipped with a comment, and do not change route code.
- The route modules cannot be imported under Vitest because `@/env` validation demands real env vars; report which vars block the import rather than weakening `env.ts`.
- Mocking `@repo/database/src/queries/...` deep paths fails because the import specifier differs at runtime; report the actual specifier from the route file.

## Maintenance notes

- Deferred follow-ups, in priority order: tests for the Xero OAuth callback route, then the server actions in `apps/app/**/_actions.ts` (9 of 16 action files are untested; approve/decline/withdraw first), then the SSE stream route.
- When plan 004 lands (headers), these tests keep passing because they assert only route-set headers; if a test starts failing on an unexpected header, the route (not the test) changed behaviour.
- If the availability routes are later refactored to take `organisationId` from the URL path instead of the body, update cases 4-7 accordingly; the tenant-isolation assertion (authenticated org id on every data access) must survive any such refactor.
- Plan 012 later adds actor authorisation to these routes (`not_authorised` mapped to 403) and changes the `createManualAvailability` call signature; it extends `availability-routes.test.ts` in place rather than creating a parallel test file. Leave those updates to plan 012; do not pre-empt them here.
