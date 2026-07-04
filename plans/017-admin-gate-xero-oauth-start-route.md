# Plan 017: Restrict the Xero OAuth start route to admins and owners

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report, do not improvise. When done, update the status row for this plan in
> `plans/README.md` unless a reviewer dispatched you and told you they maintain
> the index.
>
> **Drift check (run first)**: `git diff --stat da91efd..HEAD -- apps/api/app/api/xero/oauth/start/route.ts packages/auth/helpers.ts apps/app/app/\(authenticated\)/settings/integrations/xero/_actions.ts`
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
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `da91efd`, 2026-07-04

## Why this matters

Connecting Team Calendar to a Xero payroll file is an admin-only operation:
it grants an org-wide connection that every user then benefits from, and it
touches payroll data. Every app-layer surface enforces this (the settings page,
the connect page, and all server actions require `org:admin` or `org:owner`).
But the raw OAuth **start** endpoint at `apps/api/app/api/xero/oauth/start/route.ts`
only checks that the caller is authenticated and belongs to the org. It does
not check the caller's role. A viewer or manager who constructs the URL by hand
(the URL shape is visible in the server action that builds it) can trigger a
real Xero login redirect and, on callback, a token exchange that creates a
pending OAuth session row. That contradicts the product rule that only admins
authenticate Xero, and it lets lower-privileged users spend Xero rate-limit
budget and create session rows. This plan closes the gap by enforcing the same
role check the rest of the flow already uses.

Note: the tenant-selection step that finalises the connection is already
admin-gated (`completeTenantSelectionAction` and the connect page), so a
non-admin cannot currently complete a connection. This plan hardens the
entry point so the whole flow is consistently admin-only, matching the stated
requirement and removing the ability to start the flow at all.

## Current state

- `apps/api/app/api/xero/oauth/start/route.ts` — the OAuth start endpoint. It
  authenticates and checks org membership, but performs **no role check**:

```ts
// apps/api/app/api/xero/oauth/start/route.ts:1-49
import { currentUser, requireOrg } from "@repo/auth/helpers";
import { buildXeroOAuthStartUrl } from "@repo/xero";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  let authenticatedClerkOrgId: string;
  try {
    authenticatedClerkOrgId = await requireOrg();
  } catch {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const url = new URL(request.url);
  const clerkOrgId = url.searchParams.get("clerkOrgId");
  const organisationId = url.searchParams.get("organisationId");
  const returnTo = url.searchParams.get("returnTo") ?? undefined;

  if (!clerkOrgId) {
    return NextResponse.json(
      { error: "Missing Clerk organisation ID." },
      { status: 400 }
    );
  }

  if (clerkOrgId !== authenticatedClerkOrgId) {
    return NextResponse.json(
      { error: "Organisation mismatch." },
      { status: 403 }
    );
  }

  const result = buildXeroOAuthStartUrl({
    clerkOrgId: authenticatedClerkOrgId,
    organisationId,
    returnTo,
    userId: user.id,
  });
  if (!result.ok) {
    const status = result.error.code === "connect_disabled" ? 403 : 400;
    return NextResponse.json({ error: result.error.message }, { status });
  }

  return NextResponse.redirect(result.value.redirectUrl);
}
```

- `packages/auth/helpers.ts` — the auth package already exports `requireRole`,
  which wraps Clerk's `auth().has({ role })` and returns a boolean. This is the
  exact primitive to use here:

```ts
// packages/auth/helpers.ts:44-53
export async function requireRole(role: string): Promise<boolean> {
  const authObject = await auth();

  if (!authObject.sessionClaims) {
    throw new Error("Not authenticated");
  }

  return authObject.has({ role });
}
```

- The authorisation rule to match, already used across the app layer, allows
  **either** `org:admin` **or** `org:owner`:

```ts
// apps/app/app/(authenticated)/settings/integrations/xero/_actions.ts:234-241
if (
  !(
    (orgRole === "org:admin" || orgRole === "org:owner") &&
    user &&
    context.ok
  )
) {
  return notAuthorised();
}
```

- Convention: this route module imports auth helpers from `@repo/auth/helpers`
  (not `@repo/auth/server`). Keep that import source. Route handlers in this
  repo return `NextResponse.json({ error }, { status })` for failures — match
  that shape.

- Test convention for API routes that depend on auth: mock `@repo/auth/helpers`
  with `vi.hoisted` mocks and `vi.mock`, then `await import("./route")`. The
  canonical example is
  `apps/api/app/api/support/github-issue/route.test.ts:1-35`:

```ts
// apps/api/app/api/support/github-issue/route.test.ts:1-35 (pattern to follow)
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  currentUser: vi.fn(),
  requireOrg: vi.fn(),
  // add: requireRole, buildXeroOAuthStartUrl
}));

vi.mock("@repo/auth/helpers", () => ({
  currentUser: mocks.currentUser,
  requireOrg: mocks.requireOrg,
  // add: requireRole: mocks.requireRole,
}));

const { GET } = await import("./route");
```

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `bun run typecheck` | exit 0 |
| Lint | `bun run check` | exit 0 |
| Targeted test | `bunx vitest run apps/api/app/api/xero/oauth/start/route.test.ts` | all pass |
| Full tests | `bun run test` | exit 0 |

## Scope

**In scope** (the only files you should modify):

- `apps/api/app/api/xero/oauth/start/route.ts`
- `apps/api/app/api/xero/oauth/start/route.test.ts` (create)
- `plans/README.md` (status row only)

**Out of scope** (do NOT touch, even though they look related):

- `apps/api/app/api/xero/oauth/callback/route.ts` — the callback verifies an
  HMAC-signed state and cannot be forged; role enforcement belongs at the start
  entry point and at tenant selection, both handled elsewhere. Do not add a
  role check here.
- `packages/xero/src/oauth/service.ts` and `buildXeroOAuthStartUrl` — the URL
  builder is region/config logic, not the authorisation boundary. Leave it.
- The server action `connectXeroAction` and the connect page — already
  admin-gated. Do not modify.
- `packages/auth/helpers.ts` — use `requireRole` as-is; do not change it.

## Git workflow

- Branch: `preview` (shared branch for all plans; implement sequentially in plan-number order on top of the previous plan's commits)
- Commit message (repo uses conventional commits): `fix(api): restrict Xero OAuth start to admins and owners`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add the admin/owner role check to the start route

In `apps/api/app/api/xero/oauth/start/route.ts`:

1. Add `requireRole` to the existing import from `@repo/auth/helpers`:
   `import { currentUser, requireOrg, requireRole } from "@repo/auth/helpers";`
2. After the `currentUser()` null check and before reading the query params
   (i.e. after the block that returns 401 when `!user`), add a role gate that
   allows the request only when the caller is an admin or owner. `requireRole`
   returns a boolean; call it for both roles and allow if either is true:

```ts
const [isAdmin, isOwner] = await Promise.all([
  requireRole("org:admin"),
  requireRole("org:owner"),
]);
if (!(isAdmin || isOwner)) {
  return NextResponse.json(
    { error: "Only admins and owners can connect Xero." },
    { status: 403 }
  );
}
```

Place this gate before the `clerkOrgId` param validation so an unauthorised
caller is rejected with 403 regardless of the query string. Do not remove the
existing `requireOrg()`, `currentUser()`, or `clerkOrgId !== authenticatedClerkOrgId`
checks — they stay.

**Verify**: `bun run typecheck` → exit 0. `bun run check` → exit 0.

### Step 2: Add a route test

Create `apps/api/app/api/xero/oauth/start/route.test.ts`, modelled structurally
on `apps/api/app/api/support/github-issue/route.test.ts` (hoisted mocks +
`vi.mock("@repo/auth/helpers", ...)` + `await import("./route")`).

Mock `@repo/auth/helpers` (`currentUser`, `requireOrg`, `requireRole`) and
`@repo/xero` (`buildXeroOAuthStartUrl`). Cover these cases:

- **401** when `requireOrg` rejects (unauthenticated).
- **401** when `currentUser` resolves `null`.
- **403** when the user is authenticated but `requireRole` returns `false` for
  both `org:admin` and `org:owner` (this is the regression this plan fixes).
- **302/redirect** when `requireRole("org:admin")` returns `true`,
  `buildXeroOAuthStartUrl` returns `{ ok: true, value: { redirectUrl } }`, and
  the request URL includes a `clerkOrgId` matching the authenticated org. Assert
  the response is a redirect to `redirectUrl` (check `response.status` is 307/308
  or that `response.headers.get("location")` equals the redirect URL — inspect
  what `NextResponse.redirect` produces and assert accordingly).

For `requireRole`, make the mock role-aware, e.g.:
`mocks.requireRole.mockImplementation((role: string) => Promise.resolve(role === "org:admin"))`
for the admin-allowed case, and `mockResolvedValue(false)` for the 403 case.

Build the request with a real `URL`, e.g.:
`new Request("https://api.example.com/api/xero/oauth/start?clerkOrgId=org_clerk_123")`.

**Verify**: `bunx vitest run apps/api/app/api/xero/oauth/start/route.test.ts` →
all pass (at least the 4 cases above).

### Step 3: Update the plans index

Set this plan's row in `plans/README.md` to `DONE`.

**Verify**: `git status` shows only the in-scope files modified.

## Test plan

- New test file `apps/api/app/api/xero/oauth/start/route.test.ts` with the four
  cases in Step 2. The 403-for-non-admin case is the specific regression guard.
- Structural pattern: `apps/api/app/api/support/github-issue/route.test.ts`.
- Verification:
  - `bunx vitest run apps/api/app/api/xero/oauth/start/route.test.ts` → all pass
  - `bun run typecheck` → exit 0
  - `bun run check` → exit 0
  - `bun run test` → exit 0

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `apps/api/app/api/xero/oauth/start/route.ts` calls `requireRole` and
      returns 403 unless the caller is `org:admin` or `org:owner`.
- [ ] `grep -n "requireRole" apps/api/app/api/xero/oauth/start/route.ts` returns
      at least one match.
- [ ] New test file exists and its non-admin case asserts a 403.
- [ ] `bun run typecheck` exits 0
- [ ] `bun run check` exits 0
- [ ] `bunx vitest run apps/api/app/api/xero/oauth/start/route.test.ts` → all pass
- [ ] `bun run test` exits 0
- [ ] `git status` shows only in-scope files modified
- [ ] `plans/README.md` status row updated to DONE

## STOP conditions

Stop and report back (do not improvise) if:

- The live `start/route.ts` no longer matches the "Current state" excerpt
  (it already has a role check, or its structure changed materially).
- `requireRole` is no longer exported from `@repo/auth/helpers` or its signature
  changed (it should take a role string and return `Promise<boolean>`).
- A verification command fails twice after a reasonable fix attempt.
- Making the redirect assertion pass appears to require changing files outside
  the in-scope list.

## Maintenance notes

For the human/agent who owns this after the change lands:

- Reviewer check: confirm the gate is `admin OR owner` (not admin-only), so
  owners are not locked out — this matches `_actions.ts` and `connect/_actions.ts`.
- If the product later introduces a dedicated "integrations manager" role,
  extend this gate and the app-layer `resolveAdminContext` together so the two
  entry points stay consistent.
- The callback route is intentionally not role-checked (it relies on the signed
  state and the downstream admin-gated tenant-selection step). Do not "fix" it
  by adding a role check there without revisiting the whole flow.
