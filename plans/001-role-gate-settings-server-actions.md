# Plan 001: Role-gate the settings server actions (close privilege escalation)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan in
> `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat e1b06a3..HEAD -- apps/app/app/actions/settings apps/app/app/\(authenticated\)/settings/integrations/xero/connect/_actions.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `e1b06a3`, 2026-06-18
- **Issue**: <!-- filled when published via --issues -->

## Why this matters

Three member-management server actions and two destructive org-settings actions
gate only on the *presence* of an active organisation (`if (!orgId)`), not on the
caller's role. Server actions in Next.js are POST endpoints invokable directly by
any authenticated session, regardless of what the UI renders. Today a `viewer`
can call `updateMemberRole` to promote themselves to `org:owner`, remove the real
owner, invite new owners, revoke every feed token org-wide, or rename the
organisation. This is a full tenant-takeover privilege-escalation vulnerability.

The correct pattern already exists in this codebase. `completeTenantSelectionAction`
reads `orgRole` from `auth()` and rejects non-admins. These five actions just never
got the same gate. This plan adds it.

## Current state

The vulnerable actions, each gating on `!orgId` only:

- `apps/app/app/actions/settings/update-member-role.ts` — calls
  `clerk.organizations.updateOrganizationMembership(...role...)`:
  ```ts
  // lines 13-20
  export const updateMemberRole = async (input: unknown): Promise<Result<void>> => {
    const { orgId } = await auth();
    if (!orgId) {
      return { ok: false, error: "Not authenticated" };
    }
    // ... no role check ...
  ```
- `apps/app/app/actions/settings/remove-member.ts` — calls
  `deleteOrganizationMembership`; same `if (!orgId)`-only gate (lines 13-17).
- `apps/app/app/actions/settings/invite-member.ts` — calls
  `createOrganizationInvitation` (can invite `org:owner`); gate is
  `if (!(orgId && userId))` (lines 14-17), still no role check.
- `apps/app/app/actions/settings/revoke-tokens.ts` — calls `revokeAllFeedTokens`
  after `getActiveOrgContext(...)`, which validates org scope but **not role**
  (lines 23-28).
- `apps/app/app/actions/settings/update-org.ts` — renames the org + rewrites
  Clerk public metadata after `getActiveOrgContext(...)`; `if (!orgId)` only
  (lines 26-29).

The blessed pattern to copy — `apps/app/app/(authenticated)/settings/integrations/xero/connect/_actions.ts:34-40`:
```ts
const [{ orgId, orgRole }, user] = await Promise.all([auth(), currentUser()]);
if (!(orgId && user) || (orgRole !== "org:owner" && orgRole !== "org:admin")) {
  return notAuthorised();
}
```
`auth()` returns `orgRole` (a string like `"org:admin"`). It is already imported
from `@repo/auth/server` in every file in scope.

`getActiveOrgContext` (`apps/app/lib/server/get-active-org-context.ts`) checks
membership + org scope only; it is **not** a role check and must not be treated
as one.

A defence-in-depth secondary issue (SEC-05): `update-org.ts:56-57` writes
`database.organisation.update({ where: { id: organisationId } })` — keyed by bare
`id`, not `clerk_org_id`. It is guarded upstream today, but the repo rule is that
every tenant write filters `clerk_org_id`. Tighten it while here.

## Commands you will need

| Purpose   | Command                                              | Expected on success |
|-----------|------------------------------------------------------|---------------------|
| Install   | `bun install`                                        | exit 0              |
| Lint      | `bun run check`                                       | exit 0, no errors   |
| Typecheck | `bun run typecheck`                                   | exit 0 (covers `app`) |
| Test file | `bunx vitest run apps/app/app/actions/settings`       | all pass            |

## Scope

**In scope** (the only files you should modify):
- `apps/app/app/actions/settings/update-member-role.ts`
- `apps/app/app/actions/settings/remove-member.ts`
- `apps/app/app/actions/settings/invite-member.ts`
- `apps/app/app/actions/settings/revoke-tokens.ts`
- `apps/app/app/actions/settings/update-org.ts`
- New test files co-located in `apps/app/app/actions/settings/` (create)

**Out of scope** (do NOT touch):
- `apps/app/lib/server/get-active-org-context.ts` — leave the helper as-is; add
  the role check at the call sites, not inside it (other callers may want
  member-level access).
- The members UI client component — server-side gating is the fix; do not rely on
  UI changes.
- `settings/general/_actions.ts` — already role-gated via `resolveAdminContext`.

## Git workflow

- Branch: `advisor/001-role-gate-settings-actions`
- Conventional commits (repo style, e.g. `fix(auth): gate member-management actions by role`).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add a role gate to the three member-management actions

In `update-member-role.ts`, `remove-member.ts`, and `invite-member.ts`, replace
the `orgId`-only check with a role check. Read `orgRole` from `auth()` and reject
unless it is `"org:owner"` or `"org:admin"`. Example for `update-member-role.ts`:

```ts
const { orgId, orgRole } = await auth();
if (!orgId) {
  return { ok: false, error: "Not authenticated" };
}
if (orgRole !== "org:owner" && orgRole !== "org:admin") {
  return { ok: false, error: "You do not have permission to manage members" };
}
```

For `invite-member.ts`, keep the existing `userId` requirement and add the role
check after it. Match each file's existing `Result` error-string style.

**Verify**: `bun run typecheck` → exit 0.

### Step 2: Add a role gate to the two destructive org-settings actions

In `revoke-tokens.ts` and `update-org.ts`, add the same `orgRole` check. In
`revoke-tokens.ts` the `auth()` call must be added (it currently only uses
`getActiveOrgContext`); read `orgRole` from it and reject non-admins before
calling `revokeAllFeedTokens`. In `update-org.ts` the `orgId` is already read from
`auth()` — add `orgRole` to that destructure and the rejection check.

**Verify**: `bun run typecheck` → exit 0.

### Step 3: Scope the `update-org` write by `clerk_org_id` (SEC-05)

In `update-org.ts`, change the organisation write from `update` keyed by bare `id`
to `updateMany` scoped by both ids, so the tenant boundary is enforced at the
write itself:

```ts
await database.organisation.updateMany({
  where: { id: organisationId, clerk_org_id: orgId },
  data: { /* unchanged */ },
});
```

(`updateMany` returns a count, not the row; the action returns `void`, so this is
behaviour-preserving.)

**Verify**: `bun run typecheck` → exit 0.

### Step 4: Write tests proving non-admins are rejected

Create co-located test files (e.g. `update-member-role.test.ts`) modelled on the
existing `apps/app/app/(authenticated)/plans/_actions.test.ts` mocking style. Mock
`@repo/auth/server`'s `auth()` to return different `orgRole` values. Assert:
- `orgRole: "org:viewer"` → result `ok: false` (rejected), and the Clerk client
  mutation mock is **not** called.
- `orgRole: "org:admin"` → the mutation mock **is** called.
- Cover at least `updateMemberRole` and `revokeAllTokens` (the highest-risk two);
  the others share the identical gate.

**Verify**: `bunx vitest run apps/app/app/actions/settings` → all pass, new tests
included.

## Test plan

- New tests: `update-member-role.test.ts` and `revoke-tokens.test.ts` (minimum),
  asserting viewer-rejected / admin-allowed for each gate, with the underlying
  Clerk/feed mutation mocked and its call asserted.
- Pattern to follow: `apps/app/app/(authenticated)/plans/_actions.test.ts`
  (server-action test with mocked dependencies).
- Verification: `bunx vitest run apps/app/app/actions/settings` → all pass.

## Done criteria

ALL must hold:

- [ ] `bun run typecheck` exits 0
- [ ] `bun run check` exits 0
- [ ] `bunx vitest run apps/app/app/actions/settings` passes, including new
      viewer-rejected tests
- [ ] `grep -n "orgRole" apps/app/app/actions/settings/*.ts` shows a role check in
      all five files
- [ ] `update-org.ts` no longer contains `database.organisation.update({ where: { id:`
      (now `updateMany` with `clerk_org_id`)
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back if:

- The `auth()` return value does not include `orgRole` (the Clerk/auth wiring has
  changed since this plan was written) — verify against the exemplar
  `connect/_actions.ts` first.
- Any in-scope file's "Current state" excerpt no longer matches the live code.
- Adding the role check requires touching `get-active-org-context.ts` or any other
  out-of-scope file.

## Maintenance notes

- For a reviewer: confirm the gate is server-side and runs before any Clerk/DB
  mutation, and that the new tests assert the mutation mock is **not** called for a
  viewer (a test that only checks the return value can pass against a no-op).
- Inviting/granting the `org:owner` role specifically could be tightened to
  owner-only in a follow-up (the billing page was already tightened to owner-only
  in a prior audit). Left at admin||owner here to match Clerk's default
  membership-management permission and the existing exemplar.
- Any new settings server action must carry the same `orgRole` gate. Consider a
  shared `requireAdminAction()` helper if a third destructive action appears.
