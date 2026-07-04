# Plan 012: Authorise manual availability mutations by actor and person

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report, do not improvise. When done, update the status row for this plan
> in `plans/README.md` unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat e04f37d..HEAD -- packages/availability/src/records/manual-records-service.ts apps/app/app/actions/availability/manual.ts apps/api/app/api/availability/route.ts packages/availability/src/plans/submit-service.ts packages/database/prisma/schema.prisma`
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
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `e04f37d`, 2026-07-02

## Why this matters

Manual availability creates, updates, and archives records for any `personId`
inside the active organisation. Tenant scoping is present, but there is no
actor-to-person permission check, so a non-admin user who can reach the server
action or API route can mutate another person's manual availability. The fix
must centralise the policy in the availability package so both the app server
actions and API route enforce the same rule.

## Current state

- `packages/availability/src/records/manual-records-service.ts` - mutation
  service. It accepts a `userId`, stores it in audit-ish columns, but does not
  use it for authorisation:

```ts
// packages/availability/src/records/manual-records-service.ts:138-160
export const createManualAvailability = async (
  tenant: TenantContext,
  input: unknown,
  userId: string
): Promise<Result<AvailabilityRecordView>> => {
  const parsed = ManualAvailabilityInputSchema.safeParse(input);
  ...
  const person = await database.person.findFirst({
    where: {
      ...scopedQuery(tenant.clerkOrgId, tenant.organisationId),
      archived_at: null,
      id: parsed.data.personId,
    },
  });
```

```ts
// packages/availability/src/records/manual-records-service.ts:239-263
export const updateManualAvailability = async (
  tenant: TenantContext,
  recordId: string,
  input: unknown,
  userId: string
): Promise<Result<AvailabilityRecordView>> => {
  ...
  const existing = await database.availabilityRecord.findFirst({
    where: {
      ...scopedQuery(tenant.clerkOrgId, tenant.organisationId),
      archived_at: null,
      id: recordId,
      source_type: "manual",
    },
  });
```

```ts
// packages/availability/src/records/manual-records-service.ts:374-399
export const archiveManualAvailability = async (
  tenant: TenantContext,
  recordId: string,
  userId: string
): Promise<Result<void>> => {
  const existing = await database.availabilityRecord.findFirst({
    where: {
      ...scopedQuery(tenant.clerkOrgId, tenant.organisationId),
      archived_at: null,
      id: recordId,
      source_type: "manual",
    },
  });
  ...
  await database.availabilityRecord.update({
    where: { id: recordId },
```

- `apps/app/app/actions/availability/manual.ts` - server actions get the
  active organisation context and `currentUser`, then call the service with
  `user.id` only. There is no Clerk org role lookup:

```ts
// apps/app/app/actions/availability/manual.ts:58-67
const user = await currentUser();
if (!user) {
  return { ok: false, error: "Not authenticated" };
}

const result = await createManualAvailability(
  contextResult.value,
  toServiceInput(parsed.data),
  user.id
);
```

- `apps/api/app/api/availability/route.ts` - API route validates auth,
  organisation, and person membership, then calls the same service. It reads
  `organisationId` from the raw body at line 69 and has no actor permission
  beyond tenant membership:

```ts
// apps/api/app/api/availability/route.ts:94-120
const peopleResult = await listPeopleForOrganisation(
  clerkOrgId as ClerkOrgId,
  organisationId as OrganisationId
);
...
const personExists = peopleResult.value.some((p) => p.id === data.personId);
...
const createResult = await createManualAvailability(
```

- Local authorisation pattern: `packages/availability/src/plans/submit-service.ts`
  already resolves actor person rows and checks admin/owner, self, and direct
  manager:

```ts
// packages/availability/src/plans/submit-service.ts:562-589
async function loadAndAuthorise(
  input: RecordActionInput,
  mode: "manager_allowed" | "owner_only"
): Promise<Result<LoadedRecord, SubmitServiceError>> {
  const [record, actingPerson] = await Promise.all([
    loadScopedRecord(input),
    database.person.findFirst({
      where: {
        ...scoped(input),
        archived_at: null,
        clerk_user_id: input.actingUserId,
      },
      select: { id: true },
    }),
  ]);
  ...
  const isOwner = record.person.clerk_user_id === input.actingUserId;
  const isManager =
    Boolean(actingPerson) &&
    record.person.manager_person_id === actingPerson?.id;
  const isAllowed =
    isAdminOrOwner(input.actingOrgRole) ||
    isOwner ||
    (mode === "manager_allowed" && isManager);
```

```ts
// packages/availability/src/plans/submit-service.ts:717-719
function isAdminOrOwner(role?: string | null): boolean {
  return role === "org:admin" || role === "org:owner";
}
```

- `packages/database/prisma/schema.prisma` has the required relationship fields:
  `Person.clerk_user_id` at line 379, `Person.manager_person_id` at line 367,
  `Person.direct_reports` at line 395, and a unique
  `[organisation_id, clerk_user_id]` at line 406.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `bun run typecheck` | exit 0 |
| Lint | `bun run check` | exit 0 |
| Targeted tests | `bunx vitest run packages/availability/src/records/manual-records-service.test.ts apps/app/app/actions/availability/manual.test.ts apps/api/__tests__/availability-routes.test.ts` | all pass |
| Full tests | `bun run test` | exit 0 |

## Scope

**In scope**:

- `packages/availability/src/records/manual-records-service.ts`
- `packages/availability/src/records/manual-records-service.test.ts` (create if missing)
- `apps/app/app/actions/availability/manual.ts`
- `apps/app/app/actions/availability/manual.test.ts` (create if missing)
- `apps/api/app/api/availability/route.ts`
- `apps/api/__tests__/availability-routes.test.ts` (extend; plan 005 creates it with the route's pre-authorisation contract. Update its mocks for the new actor signature and add the 403 case there. Only create `apps/api/app/api/availability/route.test.ts` if plan 005's file does not exist.)
- `plans/README.md` (status row)

**Out of scope**:

- Changing feed publication, duplicate detection, or record shape.
- Changing Xero leave submit/approval authorisation. That service is only a
  pattern source.
- Changing Clerk membership roles or invitation flows.
- Introducing transitive manager permissions. Use direct manager only unless
  the maintainer explicitly expands the product policy.

## Git workflow

- Branch: `preview` (shared branch for all plans; implement sequentially in plan-number order on top of the previous plan's commits)
- Commit message: `fix(availability): authorise manual availability mutations`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add an actor-aware policy in the availability service

In `packages/availability/src/records/manual-records-service.ts`, replace the
plain `userId: string` parameter with an actor object for all three mutation
exports:

```ts
type ManualAvailabilityActor = {
  orgRole?: string | null;
  userId: string;
};
```

Keep `created_by_user_id` and `updated_by_user_id` populated from
`actor.userId`. Add a small helper that:

1. Returns allowed for `org:admin` and `org:owner`.
2. Resolves the acting person by `clerk_user_id = actor.userId` inside the same
   tenant.
3. Allows a person to mutate their own manual records.
4. Allows a direct manager to mutate a direct report's manual records, using
   `targetPerson.manager_person_id === actingPerson.id`.
5. Returns `{ ok: false, error: appError("not_authorised", "You do not have permission to manage this availability record.") }` otherwise.

For create, authorise against the target `person` loaded at lines 154-160.
For update and archive, load the record with its `person` relation or a
target-person select containing `clerk_user_id`, `id`, and `manager_person_id`,
then authorise before duplicate checks or updates.

**Verify**: `bun run typecheck` -> exit 0.

### Step 2: Pass Clerk org role from all callers

In `apps/app/app/actions/availability/manual.ts`, import `auth` from
`@repo/auth/server`. For each action, resolve `auth()` alongside the existing
`currentUser()` or before it, ensure the active Clerk org from auth matches
the active context, and pass `{ userId: user.id, orgRole }` to the service.

In `apps/api/app/api/availability/route.ts`, import `auth` from
`@repo/auth/helpers` (that package already re-exports Clerk's `auth` in
`packages/auth/helpers.ts:44`). Use it to obtain `orgRole` for the selected
organisation and pass `{ userId: user.id, orgRole }` to
`createManualAvailability`. Do not remove the existing `requireOrg()` or
organisation/person validation unless the replacement is strictly equivalent.

Update `statusForCreateError` to map `not_authorised` to `403`.

**Verify**: `bun run typecheck` -> exit 0. `bun run check` -> exit 0.

### Step 3: Add regression tests

Create or extend tests with these cases:

- Service create rejects a viewer/employee creating a record for another
  person in the same tenant.
- Service create allows self.
- Service create allows `org:admin` or `org:owner`.
- Service update rejects a peer updating another person's manual record.
- Service archive rejects a peer archiving another person's manual record.
- Service allows a direct manager for a direct report and rejects an indirect
  report unless the product owner explicitly changes the policy.
- Server action passes `orgRole` through to the service.
- API route returns `403` when the service returns `not_authorised`.

Use the Vitest mocking style already present in
`packages/availability/src/calendar/calendar-service.test.ts` and
`apps/app/app/(authenticated)/setup/_actions.test.ts`.

**Verify**: `bunx vitest run packages/availability/src/records/manual-records-service.test.ts apps/app/app/actions/availability/manual.test.ts apps/api/__tests__/availability-routes.test.ts` -> all pass.

## Test plan

Run the targeted tests from step 3, then the repo-level checks:

- `bun run typecheck` -> exit 0
- `bun run check` -> exit 0
- `bun run test` -> exit 0

## Done criteria

- [ ] Manual create/update/archive all require actor authorisation in
      `manual-records-service.ts`.
- [ ] Non-admin peers cannot create, update, or archive another person's
      manual availability record.
- [ ] Self, direct manager, admin, and owner cases are covered by tests.
- [ ] API route maps `not_authorised` to HTTP 403.
- [ ] `bun run typecheck`, `bun run check`, targeted tests, and `bun run test`
      all pass.
- [ ] `git status` shows only in-scope files modified.
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report back if:

- The live service signatures no longer match the current-state excerpts.
- Clerk auth in the API route cannot provide org role for the selected org
  without changing shared auth helpers outside this plan.
- Product policy requires managers to edit indirect reports or non-report team
  members. That changes the authorisation model and needs maintainer approval.
- Passing tests requires loosening tenant scoping or accepting `organisationId`
  without validation.

## Maintenance notes

- Reviewer check: the policy must live in the availability package, not only in
  app actions. The API route must not remain a bypass.
- If the product later adds configurable manager scope for manual entries, add
  a settings-backed branch to this helper and new tests for both settings.
