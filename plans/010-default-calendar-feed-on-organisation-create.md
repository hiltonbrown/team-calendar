# Plan 010: Provision a default calendar feed for every new organisation

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the next
> step. If anything in the "STOP conditions" section occurs, stop and report; do
> not improvise. When done, update the status row for this plan in
> `plans/README.md` unless a reviewer tells you they maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat e04f37d..HEAD -- packages/feeds/src/feed-service.ts packages/feeds/src/tokens/token-service.ts packages/feeds/index.integration.test.ts packages/availability/src/people/current-user-service.ts packages/availability/index.integration.test.ts packages/xero/src/oauth/service.ts packages/xero/src/oauth/service.test.ts packages/xero/package.json apps/app/lib/server/load-onboarding-state.ts apps/app/app/\(authenticated\)/feeds/page.tsx`
>
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding. On a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `e04f37d`, 2026-07-02

## Why this matters

New admin users currently land in Team Calendar with no calendar feed, so the
onboarding checklist sends them to manually create their first feed. The product
promise is that availability is published as secure ICS feeds; the first
organisation should therefore start with a sensible all-organisation feed already
present. The implementation must preserve the existing security rule that feed
token plaintext is only shown once and never persisted.

## Current state

- `packages/availability/src/people/current-user-service.ts` creates or updates
  the primary Organisation for a Clerk Organisation. It checks the payroll entity
  limit before creating the first Organisation, then writes only the Organisation
  row.

```ts
// packages/availability/src/people/current-user-service.ts:88
export const ensureOrganisationForClerk = async (
  input: OrganisationSettingsInput
): Promise<TenantContext> => {
  const existingOrganisation = await database.organisation.findFirst({
    where: {
      archived_at: null,
      clerk_org_id: input.clerkOrgId,
    },
    orderBy: { created_at: "asc" },
  });

  // ...

  const organisation = existingOrganisation
    ? await database.organisation.update({ /* settings update */ })
    : await database.organisation.create({
        data: {
          clerk_org_id: input.clerkOrgId,
          country_code: input.countryCode,
          name: input.name,
          // defaults omitted
        },
      });
```

- `apps/app/lib/server/require-active-org-page-context.ts` creates a fallback
  default Organisation when the active Clerk Org has no Organisation rows.

```ts
// apps/app/lib/server/require-active-org-page-context.ts:49
const existingOrganisation = orgResult.value[0];
const organisationId =
  existingOrganisation?.id ??
  (await ensureDefaultOrganisation(clerkOrgId)).organisationId;
```

- `packages/xero/src/oauth/service.ts` also creates an Organisation directly
  when completing Xero tenant selection and no Organisation exists yet.

```ts
// packages/xero/src/oauth/service.ts:835
const defaults = organisationDefaultsForRegion(input.tenantPayrollRegion);
const organisation = await database.organisation.create({
  data: {
    clerk_org_id: input.clerkOrgId,
    country_code: defaults.countryCode,
    name: input.tenantName,
    // defaults omitted
  },
  select: { id: true },
});
return { ok: true, value: { id: organisation.id } };
```

- `packages/feeds/src/feed-service.ts` has the normal user-created feed path. It
  enforces the feed limit, validates scopes, creates the feed, creates the
  initial token in the same transaction, audits creation, and invalidates cache.

```ts
// packages/feeds/src/feed-service.ts:185
const entitlement = await withinLimit(
  parsed.data.clerkOrgId,
  parsed.data.organisationId,
  "feeds"
);

// packages/feeds/src/feed-service.ts:214
const feed = await tx.feed.create({
  data: {
    clerk_org_id: parsed.data.clerkOrgId,
    created_by_user_id: parsed.data.actingUserId,
    includes_public_holidays: parsed.data.includesPublicHolidays,
    name: parsed.data.name,
    organisation_id: parsed.data.organisationId,
    privacy_mode: parsed.data.privacyMode,
    slug,
    status: "active",
    scopes: {
      create: createScopeRows({
        clerkOrgId: parsed.data.clerkOrgId,
        organisationId: parsed.data.organisationId,
        scopes: scopes.value,
      }),
    },
  },
  select: { id: true },
});
```

- Token plaintext is intentionally one-time only.

```ts
// packages/feeds/src/tokens/token-service.ts:134
const plaintext = generateFeedTokenPlaintext();
const hint = plaintext.slice(-4);
const token = await tx.feedToken.create({
  data: {
    clerk_org_id: input.clerkOrgId,
    feed_id: input.feedId,
    organisation_id: input.organisationId,
    token_hash: hashFeedToken(plaintext),
    token_hint: hint,
  },
  select: { id: true },
});
```

- The schema supports the desired default feed shape: active Feed, one
  org-scoped FeedScope, and one active FeedToken.

```prisma
// packages/database/prisma/schema.prisma:798
model Feed {
  id                       String                    @id @default(uuid()) @db.Uuid
  clerk_org_id             String
  organisation_id          String                    @db.Uuid
  name                     String
  slug                     String
  status                   feed_status               @default(active)
  privacy_mode             availability_privacy_mode @default(named)
  includes_public_holidays Boolean                   @default(false)
  created_by_user_id       String?

  @@unique([clerk_org_id, slug])
}

// packages/database/prisma/schema.prisma:825
model FeedScope {
  scope_type  feed_scope_rule_type
  scope_value String?
}
```

- The onboarding checklist treats feeds as a required setup step, so a default
  feed will make that step complete immediately.

```ts
// apps/app/lib/server/load-onboarding-state.ts:103
database.feed.count({
  where: {
    archived_at: null,
    clerk_org_id: clerkOrgId,
    organisation_id: organisationId,
    status: { in: ["active", "paused"] },
  },
}),

// apps/app/lib/server/load-onboarding-state.ts:185
{
  ctaHref: "/feeds",
  ctaLabel: hasFeeds ? "View feeds" : "Create feed",
  description:
    "Create an ICS feed when you are ready to publish availability to team calendars.",
  id: "feed",
  title: "Publish a calendar feed",
}
```

Relevant product constraints from `PRODUCT.md`:

- A Clerk Organisation is the top-level tenant boundary, and an Organisation owns
  its own People and Feeds (`PRODUCT.md:133-154`).
- Feed tokens store only `token_hash`; plaintext is never persisted
  (`PRODUCT.md:443-445`).
- FeedScope rules are applied at render time to filter records
  (`PRODUCT.md:588-595`).

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Feed integration tests | `bunx vitest run packages/feeds/index.integration.test.ts` | exit 0; tests pass or skip only if `DATABASE_URL` is absent |
| Availability integration tests | `bunx vitest run packages/availability/index.integration.test.ts` | exit 0; tests pass or skip only if `DATABASE_URL` is absent |
| Xero OAuth unit tests | `bunx vitest run packages/xero/src/oauth/service.test.ts` | exit 0; tests pass |
| App unit tests for onboarding/feed copy | `bunx vitest run apps/app/lib/server/load-onboarding-state.test.ts apps/app/app/\\(authenticated\\)/feeds/page.test.tsx` | exit 0; tests pass. If these files do not exist, create focused tests or use the nearest existing app test harness. |
| Typecheck | `bun run typecheck` | exit 0, no TypeScript errors |
| Lint/check | `bun run check` | exit 0 |
| Full tests | `bun run test` | exit 0 |

## Scope

**In scope**:

- `packages/feeds/src/feed-service.ts`
- `packages/feeds/index.integration.test.ts`
- `packages/availability/src/people/current-user-service.ts`
- `packages/availability/index.integration.test.ts`
- `packages/xero/src/oauth/service.ts`
- `packages/xero/src/oauth/service.test.ts`
- `packages/xero/package.json` if importing `@repo/feeds` from `@repo/xero`
- `apps/app/lib/server/load-onboarding-state.ts`
- Existing or new focused tests for onboarding/feed empty-state copy

**Out of scope**:

- Prisma schema changes or migrations.
- Changing feed token storage to persist plaintext or encrypted plaintext.
- Passing a plaintext feed token through a URL, query string, cookie, audit log,
  notification, or server log.
- Reworking the manual feed creation form beyond copy/tests directly affected by
  the default feed.
- Backfilling default feeds for all existing production organisations. This plan
  may safely create a default for an existing Organisation only when the
  provisioning helper is called and the Organisation has no Feed rows at all.

## Git workflow

- Branch: `preview` (shared branch for all plans; implement sequentially in plan-number order on top of the previous plan's commits)
- Commit message style in recent history is short prose, e.g. `design updates`.
  Use a clear message such as `Add default calendar feed provisioning`.
- Do not push or open a PR unless the operator asks.

## Steps

### Step 1: Add an idempotent default-feed provisioning service

In `packages/feeds/src/feed-service.ts`, add and export
`ensureDefaultCalendarFeed(input: unknown)`.

Target API:

```ts
export async function ensureDefaultCalendarFeed(input: unknown): Promise<
  Result<
    {
      created: boolean;
      feedId: string;
      token?: TokenDisclosure;
    },
    FeedServiceError
  >
>
```

Use a Zod schema with:

- `clerkOrgId: z.string().min(1)`
- `organisationId: z.string().uuid()`
- `actingUserId: z.string().min(1).optional().nullable()`
- `name: z.string().trim().min(1).max(120).default("All staff")`
- `privacyMode: PrivacyModeSchema.default("named")`
- `includesPublicHolidays: z.boolean().default(false)`

Behaviour:

- First, look for any Feed row for the same `clerk_org_id` and
  `organisation_id`, including archived feeds. If one exists, return
  `{ ok: true, value: { created: false, feedId: existing.id } }`. Do not create
  another feed if an admin archived the original one.
- Only when no Feed row exists, check `withinLimit(..., "feeds")`. The default
  feed counts against the plan's feed limit; Basic currently allows two feeds.
- Create one active feed named `All staff`, privacy `named`, public holidays
  false, with one scope `{ scope_type: "org", scope_value: null }`.
- Create an initial token with `createInitialTokenWithClient`.
- Use a system actor string such as `system:default-calendar-feed` only when
  `actingUserId` is absent. Do not write token plaintext to audit payloads.
- Audit using the existing `feeds.created` action with payload fields
  `{ defaultFeed: true, feedId, name, privacyMode, scopeCount: 1 }` so existing
  dashboard/activity filters still see it.
- Return `{ created: true, feedId, token }` when the feed was created. Callers
  may ignore `token`; plaintext must never be logged or persisted.
- Invalidate the feed cache after creation, matching `createFeed`.

Also update `makeUniqueSlug` so its uniqueness check matches the database
constraint. The schema unique key is `(clerk_org_id, slug)`, but the helper
currently filters by both `clerk_org_id` and `organisation_id`. Remove the
`organisation_id` predicate from the slug lookup to avoid collisions when a
multi-entity Clerk Organisation creates the same default feed name in a second
Organisation.

**Verify**: `bunx vitest run packages/feeds/src/feed-service.test.ts` -> exit 0.

### Step 2: Cover default-feed behaviour in feed integration tests

In `packages/feeds/index.integration.test.ts`, import
`ensureDefaultCalendarFeed` and add tests that prove:

- A tenant with no Feed rows gets one active `All staff` feed, one `org` scope
  with `scope_value = null`, and one active token whose stored `token_hash`
  equals `hashFeedToken(result.value.token.plaintext)`.
- Calling `ensureDefaultCalendarFeed` twice for the same Organisation returns
  the first feed with `created: false` on the second call and does not create a
  second Feed, FeedScope, or FeedToken.
- Two Organisations under the same `clerk_org_id` can both receive defaults
  without violating `feeds_clerk_org_id_slug_key`; the second slug should suffix
  deterministically, e.g. `all-staff-2`.
- An archived existing feed prevents recreation, so explicit admin archival is
  respected.

Follow the cleanup pattern already in `packages/feeds/index.integration.test.ts`;
delete `auditEvent`, `feedToken`, `feedScope`, `feed`, and `organisation` rows
for the test Clerk Org IDs.

**Verify**: `bunx vitest run packages/feeds/index.integration.test.ts` -> exit 0.

### Step 3: Ensure primary app organisation provisioning creates the default feed

In `packages/availability/src/people/current-user-service.ts`, import
`ensureDefaultCalendarFeed` from `@repo/feeds`.

After `organisation` is created or updated in `ensureOrganisationForClerk`, call:

```ts
const defaultFeed = await ensureDefaultCalendarFeed({
  clerkOrgId: input.clerkOrgId,
  organisationId: organisation.id,
});
if (!defaultFeed.ok) {
  throw new Error(defaultFeed.error.message);
}
```

Because `ensureDefaultCalendarFeed` is idempotent and does not recreate after an
archived feed exists, it is safe to call for both new and existing Organisation
rows. This also repairs the case where Organisation creation succeeded but feed
creation failed on a prior request.

Do not change `TenantContext` unless you choose to display the one-time token in
an existing client flow. If you do extend it, keep the new field optional so
existing callers remain source-compatible.

In `packages/availability/index.integration.test.ts`, import
`ensureOrganisationForClerk` and add a focused test with a fresh Clerk Org ID
that:

- Calls `ensureOrganisationForClerk({ clerkOrgId, countryCode: "AU", name })`.
- Asserts one Organisation exists.
- Asserts one non-archived Feed exists for that Organisation with name
  `All staff`, privacy `named`, and status `active`.
- Asserts one org-scoped FeedScope and one active FeedToken exist.
- Calls `ensureOrganisationForClerk` again for the same Clerk Org and asserts
  feed count remains one.

Update test cleanup to delete feed-related rows before deleting Organisations.

**Verify**:
`bunx vitest run packages/availability/index.integration.test.ts` -> exit 0.

### Step 4: Cover Xero-created Organisations

`packages/xero/src/oauth/service.ts` can create an Organisation directly in
`resolveOrganisationForTenantSelection`. Add `@repo/feeds` to
`packages/xero/package.json` dependencies, import `ensureDefaultCalendarFeed`,
and call it immediately after the Organisation row is created.

Use:

```ts
const defaultFeed = await ensureDefaultCalendarFeed({
  clerkOrgId: input.clerkOrgId,
  organisationId: organisation.id,
});
if (!defaultFeed.ok) {
  return {
    ok: false,
    error: {
      code: "unknown_error",
      message: defaultFeed.error.message,
    },
  };
}
```

Do not add `@repo/xero` imports to `@repo/feeds`; that would create the wrong
dependency direction. If the package manager or TypeScript reveals a cycle,
STOP and report the dependency issue instead of moving feed creation into Xero
logic ad hoc.

In `packages/xero/src/oauth/service.test.ts`, mock `@repo/feeds` and add a test
for the no-existing-Organisation tenant-selection path. The test should assert
`ensureDefaultCalendarFeed` is called with the new Organisation ID and Clerk Org
ID. Also test that a failed default-feed result makes tenant selection fail with
`unknown_error` and does not create the Xero connection/tenant rows.

**Verify**: `bunx vitest run packages/xero/src/oauth/service.test.ts` -> exit 0.

### Step 5: Adjust onboarding/feed copy to match the new default

In `apps/app/lib/server/load-onboarding-state.ts`, update the feed step copy so
the completed state no longer reads like the user had to create the first feed.
Use copy like:

- Title: `Review calendar feed`
- Complete CTA: `View default feed`
- Incomplete CTA: `Create feed`
- Description when `hasFeeds`: `Your default all-staff feed is ready. Rotate its token when you need to copy a fresh subscribe URL.`
- Description when not `hasFeeds`: keep a fallback that tells admins to create
  a feed manually, because existing legacy orgs or failed provisioning may still
  have no feed.

In `apps/app/app/(authenticated)/feeds/page.tsx`, keep the empty state as a
fallback, but change the description to mention that new organisations normally
start with a default feed and this state means no feed is currently available.
Do not remove the `New feed` action; admins still need extra scoped feeds.

Add focused app tests if none exist:

- `apps/app/lib/server/load-onboarding-state.test.ts` should mock the database
  counts and assert the feed step uses `View default feed` when `activeFeedCount`
  is greater than zero.
- A feed page test is optional if the current app test harness makes it costly;
  if skipped, rely on typecheck and lint for the copy-only change.

**Verify**:
`bunx vitest run apps/app/lib/server/load-onboarding-state.test.ts` -> exit 0.

### Step 6: Run final gates

Run:

```bash
bun run typecheck
bun run check
bun run test
```

Expected result: all commands exit 0. If integration tests require a local
database and no `DATABASE_URL` is configured, record that they skipped and run
the unit tests above plus `bun run typecheck` and `bun run check`.

## Test plan

- Feed integration tests prove the default feed, scope, token, idempotency,
  slug collision handling, and archived-feed non-recreation behaviour.
- Availability integration tests prove the primary organisation provisioning
  path creates exactly one default feed.
- Xero OAuth unit tests prove the secondary direct Organisation creation path
  also triggers default feed provisioning and fails predictably if provisioning
  fails.
- App tests prove onboarding copy reflects the default-feed state.

## Done criteria

- [ ] A new Organisation created through `ensureOrganisationForClerk` has one
  active all-organisation feed without manual admin feed creation.
- [ ] A new Organisation created through Xero tenant selection also receives the
  same default feed.
- [ ] The default feed has one active token, but token plaintext is never
  persisted, logged, audited, or put into a URL.
- [ ] Re-running provisioning for the same Organisation does not create duplicate
  feeds, scopes, or tokens.
- [ ] Manual extra feed creation still works and slug generation respects
  `@@unique([clerk_org_id, slug])`.
- [ ] `bun run typecheck`, `bun run check`, and `bun run test` exit 0, or any
  skipped integration tests are explicitly explained.
- [ ] No files outside the in-scope list are modified except new focused test
  files and `plans/README.md`.
- [ ] `plans/README.md` status row for plan 010 is updated.

## STOP conditions

Stop and report back if:

- Feed token plaintext would need to be persisted or transported through a URL,
  cookie, audit log, or server log to satisfy the requested UX.
- Adding `@repo/feeds` to `@repo/xero` creates a TypeScript/package dependency
  cycle.
- `ensureDefaultCalendarFeed` cannot be made idempotent without a schema change.
- Billing policy is unclear because a plan can have zero allowed feeds; do not
  bypass `withinLimit` without an explicit product decision.
- The live code at the cited locations no longer matches the excerpts above.

## Maintenance notes

- Future onboarding changes should treat the default feed as baseline
  infrastructure, not as proof that the user has copied a subscribe URL.
- Reviewers should scrutinize tenant scoping on every new query:
  `clerk_org_id` and `organisation_id` must both be present.
- Reviewers should also check that slug uniqueness queries match the database
  unique constraint, not just the current Organisation.
- This plan deliberately does not backfill all existing production tenants.
  Write a separate migration/job plan if that becomes a product requirement.
