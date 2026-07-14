# Plan 024: Remove the orphaned, unauthorised approval-write action and service function

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report, do not improvise. When done, update the status row for this plan in
> `plans/README.md` unless a reviewer dispatched you and told you they maintain
> the index.
>
> **Drift check (run first)**: `git diff --stat 123bbd8..HEAD -- apps/app/app/actions/availability/approval.ts packages/availability/src/records/manual-records-service.ts packages/availability/index.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `123bbd8`, 2026-07-12

## Why this matters

There is a second, weaker approval-write path that mutates
`approval_status`/`publish_status` with **no role check and no self-approval
guard**. The Next.js `"use server"` action `updateAvailabilityApprovalAction`
resolves the org context and the current user, then calls the availability
service `updateAvailabilityApprovalStatus` passing only the raw `userId`. That
service checks tenant scope and `approval_status: "submitted"` but performs no
authorisation, unlike every sibling mutation and unlike the real approvals path.

It currently has **no `.tsx` caller** — the live UI uses `approve`/`decline`
from `packages/availability/src/approvals/approval-service.ts` instead — so it is
dead code. But an exported `"use server"` function is a latent trap: Next.js can
register callable action endpoints for exported server actions, and any future
wiring of this action would silently bypass the manager/admin authorisation the
live path enforces. Approval also materialises the record into the public ICS
feed, so this primitive can publish availability with no authorisation.

The safe, minimal fix is to delete both the orphaned action and the orphaned
service function. The correct, authorised approval path already exists and is
tested (`approval-service.ts` `approve`/`decline`, gated by `canUseApprovals`
and manager scope).

## Current state

- The orphaned action (entire file):

```ts
// apps/app/app/actions/availability/approval.ts
"use server";
import { currentUser } from "@repo/auth/server";
import { updateAvailabilityApprovalStatus } from "@repo/availability";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getActiveOrgContext } from "@/lib/server/get-active-org-context";
// ...schema { approvalStatus: "approved"|"declined", organisationId, recordId }...
export async function updateAvailabilityApprovalAction(input) {
  // validates body, getActiveOrgContext, currentUser()  -- NO orgRole check --
  const result = await updateAvailabilityApprovalStatus(
    contextResult.value, parsed.data.recordId, parsed.data.approvalStatus, user.id,
  );
  // revalidatePath for "/", "/leave-approvals", "/calendar", "/people"
}
```

- The orphaned service function it calls:

```ts
// packages/availability/src/records/manual-records-service.ts:373
// updateAvailabilityApprovalStatus(context, recordId, status, userId)
//   -> checks tenant scope + approval_status:"submitted" only; NO role/manager/self check.
```

- It is re-exported from the package root:

```ts
// packages/availability/index.ts:191
  updateAvailabilityApprovalStatus,
```

- **Proof it is dead** (run these; both must confirm no live caller before you
  delete anything):
  - `grep -rn "updateAvailabilityApprovalAction" apps packages --include=*.ts --include=*.tsx`
    → only the definition in `approval.ts`.
  - `grep -rn "updateAvailabilityApprovalStatus" apps packages --include=*.ts --include=*.tsx`
    → only: the definition in `manual-records-service.ts`, the re-export in
    `index.ts:191`, and the single call inside `approval.ts`. No `.tsx`
    component imports it, and no test references it.

- The correct authorised path (leave in place, do NOT touch): `approve` and
  `decline` in `packages/availability/src/approvals/approval-service.ts`, wired
  from `apps/app/app/(authenticated)/leave-approvals/_actions.ts`, gated by
  `canUseApprovals(role)` + `managerScopePersonIds`.

## Commands you will need

| Purpose   | Command                        | Expected on success |
|-----------|--------------------------------|---------------------|
| Grep      | `grep -rn "<symbol>" apps packages` | as described above |
| Typecheck | `bun run typecheck`            | exit 0, no errors   |
| Unit test | `bun run test`                 | all pass            |
| Lint      | `bun run check`                | exit 0              |

## Scope

**In scope** (delete/edit only these):
- `apps/app/app/actions/availability/approval.ts` — delete the file.
- `packages/availability/src/records/manual-records-service.ts` — delete the
  `updateAvailabilityApprovalStatus` function only.
- `packages/availability/index.ts` — remove the `updateAvailabilityApprovalStatus`
  re-export line.

**Out of scope** (do NOT touch):
- `packages/availability/src/approvals/**` — the real approval path.
- `apps/app/app/(authenticated)/leave-approvals/**` — the real UI/actions.
- Any other function in `manual-records-service.ts` (only the one function is
  orphaned; the create/update/archive mutations and their
  `authoriseManualAvailabilityActor` guard stay).

## Git workflow

- Base branch: `preview` — all development lands on `preview`, not `main`. Create this branch from `preview` and, if you merge, merge back into `preview`. Earlier-numbered plans in this batch also land on `preview` first, so the drift-check diff may legitimately include their changes; treat a mismatch as a STOP condition only when it is not explained by an earlier plan's documented scope.
- Branch: `improve/024-remove-orphaned-approval-action`
- Conventional commits (e.g. `fix(security): remove unauthorised orphaned approval-write path`).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Confirm the code is dead

Run both greps from "Current state". If either shows a caller other than the
three known references, **STOP and report** — the function is not dead and this
plan's approach (delete) is wrong; it would need authorisation added instead.

### Step 2: Delete the orphaned action file

Delete `apps/app/app/actions/availability/approval.ts` entirely. If the
directory `apps/app/app/actions/availability/` is now empty except for other
files, leave those other files alone.

### Step 3: Delete the orphaned service function and its export

- In `manual-records-service.ts`, remove the `updateAvailabilityApprovalStatus`
  function and any now-unused imports/types that existed **solely** for it
  (let the typecheck/lint tell you which are unused; do not remove imports still
  used by other functions).
- In `packages/availability/index.ts`, remove the
  `updateAvailabilityApprovalStatus,` re-export line (line ~191).

**Verify**: `bun run typecheck` → exit 0.

### Step 4: Full verification

**Verify**:
- `grep -rn "updateAvailabilityApprovalStatus\|updateAvailabilityApprovalAction" apps packages` → **no matches**.
- `bun run test` → all pass.
- `bun run check` → exit 0.

## Test plan

- No new tests required — this is a deletion of unreferenced, untested code.
- Regression guard: the full `bun run test` suite must remain green, proving the
  live approval path (`approval-service` tests) is untouched.
- Verification: `bun run test` → all pass; the grep in Done criteria returns nothing.

## Done criteria

ALL must hold:

- [ ] `apps/app/app/actions/availability/approval.ts` no longer exists
- [ ] `grep -rn "updateAvailabilityApprovalStatus" packages apps` returns no matches
- [ ] `grep -rn "updateAvailabilityApprovalAction" packages apps` returns no matches
- [ ] `bun run typecheck` exits 0
- [ ] `bun run test` exits 0 (approval-service tests still green)
- [ ] `bun run check` exits 0
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Step 1's greps reveal a live caller of either symbol (then the correct fix is
  to add `authoriseManualAvailabilityActor`-style authorisation + tests, not
  deletion — report so the plan can be re-scoped).
- Deleting the function leaves other code in `manual-records-service.ts`
  referencing it (means it was not actually orphaned).
- Any excerpt in "Current state" does not match live code (drift).

## Maintenance notes

- Reviewer should verify that the only remaining approval mutation path is
  `approve`/`decline` in `approval-service.ts` and that it is authorisation-gated.
- If a future feature needs a manual approval-status mutation, it must route
  through the authorised approvals service, not reintroduce a bare
  `userId`-only primitive.
