# Plan 002: Require admin or owner on the Stripe checkout and portal server actions

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 960c07b..HEAD -- "apps/app/app/(authenticated)/settings/billing" apps/app/lib/auth/require-page-role.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: `plans/001-restore-verification-baseline.md`
- **Category**: security
- **Planned at**: commit `960c07b`, 2026-07-19

## Why this matters

`startCheckout` and `startPortal` are Next.js server actions. A server action is
an independently addressable POST endpoint: the fact that the page which renders
the button is role-gated does **not** constrain who can invoke the action. Both
actions currently perform an organisation-membership check and no role check, so
any authenticated member of the organisation — including an `org:viewer` — can
invoke `startPortal` and be redirected into the Stripe customer portal for the
entire tenant, where subscriptions can be cancelled, plans downgraded, and
payment methods and billing history viewed.

The page that renders these buttons already gates correctly with
`requirePageRole("org:admin")`. This plan brings the actions up to the same bar,
which is a two-line change plus tests.

## Current state

### The unguarded actions

`apps/app/app/(authenticated)/settings/billing/actions.ts` in full, as it exists
today:

```ts
"use server";

import { createCheckoutSession, createPortalSession } from "@repo/billing";
import { redirect } from "next/navigation";
import { requireActiveOrgPageContext } from "@/lib/server/require-active-org-page-context";

export async function startCheckout(planKey: "basic" | "premium") {
  const { clerkOrgId } = await requireActiveOrgPageContext();
  const result = await createCheckoutSession(clerkOrgId, planKey);
  if (result.ok) {
    redirect(result.value);
  }
  throw new Error(result.error.message);
}

export async function startPortal() {
  const { clerkOrgId } = await requireActiveOrgPageContext();
  const result = await createPortalSession(clerkOrgId);
  if (result.ok) {
    redirect(result.value);
  }
  throw new Error(result.error.message);
}
```

### Why `requireActiveOrgPageContext` is not a role check

`apps/app/lib/server/require-active-org-page-context.ts:17-64` resolves the
active organisation and calls `notFound()` when it cannot. It never reads
`orgRole` and never consults Clerk roles at all. It answers "which organisation
is this user acting in?", not "may this user do this?".

### The helper to use

`apps/app/lib/auth/require-page-role.ts` in full:

```ts
import { requireRole } from "@repo/auth/helpers";

const ROLE_HIERARCHY = ["org:viewer", "org:manager", "org:admin", "org:owner"];

export class PermissionDeniedError extends Error {
  constructor() {
    super("Permission denied");
    this.name = "PermissionDeniedError";
  }
}

export async function requirePageRole(role: string): Promise<void> {
  const allowedRoles = rolesAtOrAbove(role);
  const accessResults = await Promise.all(
    allowedRoles.map((allowedRole) => requireRole(allowedRole))
  );
  const hasRole = accessResults.some(Boolean);
  if (!hasRole) {
    throw new PermissionDeniedError();
  }
}

function rolesAtOrAbove(role: string): string[] {
  const index = ROLE_HIERARCHY.indexOf(role);
  if (index === -1) {
    return [role];
  }
  return ROLE_HIERARCHY.slice(index);
}
```

`requirePageRole("org:admin")` therefore admits `org:admin` and `org:owner` and
denies `org:manager` and `org:viewer`. That is exactly the boundary wanted here.

### The precedent to match

`apps/app/app/(authenticated)/settings/billing/page.tsx:27-28` — the page
rendering these buttons — already does this, and its comment states the intended
policy:

```tsx
// S-22 Settings > Billing. Billing, plan limits, and usage are enforced at the
// Clerk Organisation level. requirePageRole below admits admins and owners and
// denies managers and below, so they can view billing status, usage, and any
// available Stripe self-serve actions. Clerk assigns the org creator org:admin
// by default; org:owner is a distinct higher role, so we resolve the acting role
// explicitly and pass it through to getBillingSummary.
const BillingPage = async ({ searchParams }: BillingPageProps) => {
  await requirePageRole("org:admin");
```

**This comment is the authority for the policy.** Do not invent a different
role boundary.

### How the actions are invoked

`apps/app/app/(authenticated)/settings/billing/billing-client.tsx:115-120`:

```tsx
<form action={startPortal}>
  <Button variant="outline">Manage billing</Button>
</form>
<form action={startCheckout.bind(null, "premium")}>
  <Button>Upgrade to Premium</Button>
</form>
```

They are form actions, so they are reachable by POST independently of the page.

### Conventions that apply

- Named exports only; no default exports. Strict TypeScript, no `any`.
- Australian English in comments. No em dashes anywhere.
- Tests are co-located. `apps/app/app/(authenticated)/settings/billing/page.test.tsx`
  already exists in this directory.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `bun run typecheck --force` | exit 0, no `error TS` lines |
| App suite | `cd apps/app && bun run test` | all pass |
| Single file | `cd apps/app && bunx vitest run "app/(authenticated)/settings/billing/actions.test.ts"` | all pass |
| Lint | `bun run check` | exit 0 |

## Scope

**In scope** (the only files you should modify):
- `apps/app/app/(authenticated)/settings/billing/actions.ts`
- `apps/app/app/(authenticated)/settings/billing/actions.test.ts` (create)

**Out of scope** (do NOT touch, even though they look related):
- `apps/app/lib/auth/require-page-role.ts` — the helper is correct as-is.
- `apps/app/lib/server/require-active-org-page-context.ts` — do **not** add a
  role check here. It is called by many pages with different role requirements;
  adding a role check inside it would change authorisation across all of them.
- `apps/app/app/(authenticated)/settings/billing/page.tsx` — already gated.
- `apps/app/app/(authenticated)/settings/billing/billing-client.tsx` — hiding
  the buttons in the client is not a fix; the server action is the boundary.
- `packages/billing/*` — the Stripe session creation itself is not the problem.
- The other eight server-action guards elsewhere in the app that have drifted
  apart. Consolidating them is a separate, larger piece of work.

## Git workflow

- Branch: `advisor/002-gate-billing-server-actions`
- Conventional commits. Example from `git log`:
  `fix(xero): protect rotated refresh token against transaction abort`.
- Suggested commit: `fix(billing): require admin role on checkout and portal actions`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add the role check to both actions

Edit `apps/app/app/(authenticated)/settings/billing/actions.ts`.

Import the helper:

```ts
import { requirePageRole } from "@/lib/auth/require-page-role";
```

Then add `await requirePageRole("org:admin");` as the **first statement** of
both `startCheckout` and `startPortal`, before `requireActiveOrgPageContext()`.

Ordering matters: check authorisation before resolving organisation context, so
an unauthorised caller cannot probe organisation existence through the
`notFound()` behaviour of the context helper.

Add a short comment above each call explaining why the gate is on the action and
not only the page, in the style of the page's own comment. For example:

```ts
// Server actions are directly invocable endpoints, so the page-level gate in
// page.tsx does not protect them. Admits admins and owners, matching S-22.
await requirePageRole("org:admin");
```

Leave everything else in the file unchanged, including the `redirect()` calls
and the `throw new Error(result.error.message)` lines. `requirePageRole` throws
`PermissionDeniedError`, which is consistent with the throwing style these two
actions already use.

**Verify**: `bun run typecheck --force` → exit 0, no `error TS` lines.

### Step 2: Write the tests

Create `apps/app/app/(authenticated)/settings/billing/actions.test.ts`.

Model the structure on
`apps/app/app/(authenticated)/feeds/_actions.test.ts:1-45`, which uses
`vi.hoisted()` for the mock bag and then `vi.mock()` per module. Mock these
modules:

- `@/lib/auth/require-page-role` → `requirePageRole` as a `vi.fn()`
- `@/lib/server/require-active-org-page-context` → `requireActiveOrgPageContext`
  as a `vi.fn()`
- `@repo/billing` → `createCheckoutSession` and `createPortalSession` as `vi.fn()`
- `next/navigation` → `redirect` as a `vi.fn()`

Cases to write, for **each** of `startCheckout` and `startPortal` (eight tests
total):

1. **Rejects an unauthorised caller** — `requirePageRole` rejects with
   `new Error("Permission denied")`. Assert the action rejects, and assert
   `createCheckoutSession` / `createPortalSession` was **not** called and
   `redirect` was **not** called. This is the regression test for this plan and
   the most important case.
2. **Checks the role before resolving org context** — `requirePageRole` rejects;
   assert `requireActiveOrgPageContext` was **not** called.
3. **Happy path** — `requirePageRole` resolves, the billing call returns
   `{ ok: true, value: "https://stripe.example/session" }`; assert `redirect`
   was called with that URL.
4. **Propagates a billing failure** — the billing call returns
   `{ ok: false, error: { message: "..." } }`; assert the action rejects with
   that message and `redirect` was not called.

For case 1, assert on the guard's effect (the downstream calls not happening),
not merely that `requirePageRole` was invoked. A test that only asserts the
call was made would still pass if someone later ignored its result.

**Verify**:
`cd apps/app && bunx vitest run "app/(authenticated)/settings/billing/actions.test.ts"`
→ all 8 tests pass.

### Step 3: Confirm nothing else regressed

**Verify**: `cd apps/app && bun run test` → all pass, including the existing
`page.test.tsx` in the same directory.

**Verify**: `bun run check` → exit 0.

## Test plan

- New file: `apps/app/app/(authenticated)/settings/billing/actions.test.ts`,
  8 tests as enumerated in Step 2.
- Structural pattern: `apps/app/app/(authenticated)/feeds/_actions.test.ts`.
- The load-bearing assertion is that a rejected `requirePageRole` prevents any
  Stripe session from being created and any redirect from being issued.
- Verification: `cd apps/app && bun run test` → all pass, including 8 new tests.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `bun run typecheck --force` exits 0
- [ ] `bun run check` exits 0
- [ ] `cd apps/app && bun run test` exits 0, including 8 new tests
- [ ] `grep -c "requirePageRole" "apps/app/app/(authenticated)/settings/billing/actions.ts"`
      returns `3` (one import, two call sites)
- [ ] `git status --porcelain` lists only `actions.ts`, the new `actions.test.ts`
      (plus `plans/README.md`)
- [ ] `git diff -- apps/app/lib/server/require-active-org-page-context.ts` is empty

## STOP conditions

Stop and report back (do not improvise) if:

- `actions.ts` does not match the excerpt above.
- `bun run test` was already failing before your change — that means
  `plans/001-restore-verification-baseline.md` has not landed. Stop and say so;
  without a green baseline you cannot demonstrate this change is safe.
- Adding the guard breaks `page.test.tsx` or any other existing test. That
  would suggest something renders or invokes these actions in a context without
  an admin role, which is a product question, not something to work around.
- You conclude the correct boundary is something other than `org:admin` — for
  example that `org:manager` should reach billing. Report it; do not change the
  policy unilaterally. The comment at `page.tsx:21-26` is the current authority.
- You find yourself wanting to modify `require-active-org-page-context.ts`.

## Maintenance notes

- **For the reviewer**: check that the `requirePageRole` call is the *first*
  statement in each action, and that the test asserts the Stripe call does not
  happen for an unauthorised caller rather than merely asserting the guard was
  invoked.
- **The general lesson**: every server action in this app is a public POST
  endpoint. Page-level gating never protects one. Any new action under
  `apps/app/app/(authenticated)/` that performs a privileged operation needs its
  own guard.
- **Known related issue, deliberately out of scope**: there are nine
  hand-written copies of this admin guard across the app's `_actions.ts` files
  and at least two disagree with each other.
  `apps/app/app/(authenticated)/feeds/_actions.ts:288-296` accepts four role
  spellings (`"admin"`, `"owner"`, `"org:admin"`, `"org:owner"`) after passing
  `orgRole` through `normaliseRole`, while
  `apps/app/app/(authenticated)/settings/general/_actions.ts:242-250` accepts
  only `"org:admin"` and `"org:owner"` from the raw `orgRole`. Either the
  unprefixed spellings are unreachable dead branches, or two guards genuinely
  disagree about who is an admin. Resolving that requires first establishing
  empirically which spellings Clerk emits, which is why it is not bundled here.
- If Clerk's role vocabulary ever changes, `ROLE_HIERARCHY` in
  `require-page-role.ts` is the single place this plan depends on.
