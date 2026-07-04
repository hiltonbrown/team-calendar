# Plan 011: Provision default public holidays for every new organisation

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the next
> step. If anything in the "STOP conditions" section occurs, stop and report. Do
> not improvise. When done, update the status row for this plan in
> `plans/README.md`, unless a reviewer tells you they maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat e04f37d..HEAD -- packages/availability/src/holidays/holiday-service.ts packages/availability/src/holidays/holiday-service.test.ts packages/availability/src/holidays/nager-client.ts packages/availability/src/people/current-user-service.ts packages/availability/index.ts packages/availability/index.integration.test.ts packages/xero/src/oauth/service.ts packages/xero/src/oauth/service.test.ts packages/xero/package.json 'apps/app/app/(authenticated)/settings/general/_actions.ts' 'apps/app/app/(authenticated)/settings/general/general-client.tsx' apps/app/lib/server/load-onboarding-state.ts 'apps/app/app/(authenticated)/public-holidays/public-holidays-list.tsx' 'apps/app/app/(authenticated)/public-holidays/public-holidays-list.test.tsx' 'apps/app/app/(authenticated)/public-holidays/page.test.tsx'`
>
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding. On a
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
- **Depends on**: `plans/010-default-calendar-feed-on-organisation-create.md` for sequencing only, because both plans touch organisation creation hooks. This plan does not require the default feed helper to exist.
- **Category**: direction
- **Planned at**: commit `e04f37d`, 2026-07-02

## Why this matters

New organisations currently get an Organisation row, but their public holidays
remain empty until an admin explicitly imports or adds dates. That contradicts
the product promise that public holiday data is auto-sourced per country and
means calendar views and working-day calculations are incomplete during the
first-run experience. This plan makes public holidays appear by default from the
organisation's configured country, while keeping manual custom holidays and
admin suppression controls unchanged.

## Current state

- `PRODUCT.md:127` says public holiday data is "Nager.Date API" and "Auto-sourced per country and region; manual overrides in database".
- `PRODUCT.md:139-150` says the Clerk Organisation is the top-level tenant and one Clerk Organisation maps to one country code.
- `PRODUCT.md:423-425` says `public_holidays` are sourced from Nager.Date or manual entries and are unique on `(organisation_id, source, source_remote_id)`.
- `packages/database/prisma/schema.prisma:260-267` stores `Organisation.country_code`, optional `region_code`, `timezone`, and active/archive state.
- `packages/database/prisma/schema.prisma:715-735` stores `PublicHolidayJurisdiction` with unique `(organisation_id, country_code, region_code)`.
- `packages/database/prisma/schema.prisma:738-768` stores `PublicHoliday` with unique `(organisation_id, source, source_remote_id)`.
- `packages/availability/src/holidays/nager-client.ts:20-27` fetches Nager holidays from `/PublicHolidays/{year}/{countryCode}`.
- `packages/availability/src/holidays/holiday-service.ts:60-188` has `importForJurisdiction(input)` which fetches one country/year from Nager, creates or restores a jurisdiction, and upserts holidays.
- `packages/availability/src/holidays/holiday-service.ts:72-80` currently keeps all non-global holidays when `input.regionCode` is null:

```ts
const holidays = holidaysResult.value.filter((h) => {
  if (h.global) {
    return true;
  }
  if (!input.regionCode) {
    return true;
  }
  return h.counties?.includes(input.regionCode) ?? false;
});
```

This is wrong for automatic defaults: an AU organisation with no region would
import state-specific dates as if they were national dates. Nager uses prefixed
county codes such as `AU-QLD` and `GB-ENG`; the app's settings UI stores short
region codes such as `QLD`, `AUK`, and `ENG` in
`apps/app/app/(authenticated)/settings/general/general-client.tsx:36-62`.

- `packages/availability/src/people/current-user-service.ts:88-147` creates or updates the default Organisation and returns `{ clerkOrgId, organisationId }`; it does not provision public holiday data.
- `apps/app/lib/server/ensure-default-organisation.ts:17-21` creates a fallback Organisation with `countryCode: "AU"` when a Clerk org has no Organisation row.
- `apps/app/app/(authenticated)/setup/_actions.ts:44-52` calls `ensureOrganisationForClerk()` from setup after an admin chooses a country.
- `packages/xero/src/oauth/service.ts:834-848` directly creates an Organisation during Xero tenant selection when no Organisation exists, bypassing `ensureOrganisationForClerk()`.
- `packages/xero/package.json` currently depends on `@repo/core` and `@repo/database`, but not `@repo/availability`.
- `apps/app/lib/server/load-onboarding-state.ts:95-121` treats public holidays as complete when there is at least one active enabled `PublicHolidayJurisdiction`.
- `apps/app/lib/server/load-onboarding-state.ts:149-176` tells users to confirm country/region/timezone before importing holidays, then links them to Settings > Holidays.
- `apps/app/app/(authenticated)/public-holidays/public-holidays-list.tsx:157-176` shows "No public holidays" and tells users to "Import holidays from a source or add custom holidays."
- `packages/database/src/queries/public-holidays.ts:31-180` has a separate `importPublicHolidaysForFeed()` helper. Do not use it for this plan: it validates a feed, creates feed-scoped assignments, and is not the organisation-wide import surface.

Repo conventions to follow:

- Tenant-scoped queries must filter by both `clerk_org_id` and `organisation_id`. Existing holiday code uses `scopedQuery(input.clerkOrgId, input.organisationId)` at `holiday-service.ts:82-88` and `126-131`.
- Services return the shared `Result` shape with `appError()` rather than throwing for expected failures. Match `importForJurisdiction()` and the action wrappers in `apps/app/app/(authenticated)/public-holidays/_actions.ts`.
- App copy uses Australian English: "organisation", "Public Holidays", "suppressed".
- Tests are Vitest. Unit tests for holiday service use mocked `@repo/database` in `packages/availability/src/holidays/holiday-service.test.ts`; integration tests live beside package roots and use real Prisma with deterministic test `clerk_org_id` values.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Focused holiday tests | `bunx vitest run packages/availability/src/holidays/holiday-service.test.ts` | exit 0, all tests pass |
| Focused availability integration | `bunx vitest run packages/availability/index.integration.test.ts` | exit 0, all tests pass |
| Focused Xero tests | `bunx vitest run packages/xero/src/oauth/service.test.ts` | exit 0, all tests pass |
| Focused app tests | `bunx vitest run 'apps/app/app/(authenticated)/public-holidays' apps/app/lib/server` | exit 0, all tests pass |
| Typecheck | `bun run typecheck` | exit 0, no errors |
| Lint/check | `bun run check` | exit 0, no errors |
| Full tests | `bun run test` | exit 0 |

If an integration test command fails with the Prisma error `The column
'plan_key' does not exist`, that is the test-database schema drift plan 013
repairs. Apply plan 013 ahead of sequence (a sanctioned exception recorded in
`plans/README.md`), then resume this plan; do not debug it here.

## Scope

**In scope**:

- `packages/availability/src/holidays/holiday-service.ts`
- `packages/availability/src/holidays/holiday-service.test.ts`
- `packages/availability/src/holidays/nager-client.ts` only if needed for exported test seams or country-code mapping
- `packages/availability/src/people/current-user-service.ts`
- `packages/availability/index.ts`
- `packages/availability/index.integration.test.ts`
- `packages/xero/src/oauth/service.ts`
- `packages/xero/src/oauth/service.test.ts`
- `packages/xero/package.json`
- `apps/app/app/(authenticated)/settings/general/_actions.ts`
- `apps/app/app/(authenticated)/settings/general/general-client.tsx`
- `apps/app/lib/server/load-onboarding-state.ts`
- `apps/app/app/(authenticated)/public-holidays/public-holidays-list.tsx`
- focused tests under `apps/app/app/(authenticated)/public-holidays/` and `apps/app/lib/server/`

**Out of scope**:

- Prisma schema or migrations. The current holiday tables already support this.
- Backfilling production organisations. This plan covers future creation/update paths only.
- Changing manual custom holiday semantics.
- Replacing Nager.Date or adding a cached country database.
- Repurposing `packages/database/src/queries/public-holidays.ts`; that helper is feed-assignment-specific.
- A background job or retry queue. If product wants guaranteed eventual import after Nager downtime, write a separate plan.
- Changing feed default `includes_public_holidays`; that belongs to plan 010 and feed settings.

## Git workflow

- Branch: `preview` (shared branch for all plans; implement sequentially in plan-number order on top of the previous plan's commits)
- Commit message (conventional commits, per CLAUDE.md): `feat(availability): provision default public holidays for new organisations`. Use one logical commit for the implementation unless instructed otherwise.
- Do not push or open a PR unless the operator asks.

## Steps

### Step 1: Fix Nager country and region normalisation inside the holiday service

In `packages/availability/src/holidays/holiday-service.ts`, add small internal
helpers near `sourceRemoteIdForHoliday()`:

- `nagerCountryCodeFor(countryCode: string): string`
  - return `"GB"` for app country `"UK"`
  - return the input for `"AU"` and `"NZ"`
- `nagerCountyCodeFor(countryCode: string, regionCode: string): string`
  - return `${nagerCountryCodeFor(countryCode)}-${regionCode}` for region-scoped Nager filtering

Update `importForJurisdiction()` so it calls Nager with
`nagerCountryCodeFor(input.countryCode)` but continues storing
`PublicHoliday.country_code` and `PublicHolidayJurisdiction.country_code` as the
app's canonical `input.countryCode` (`AU`, `NZ`, or `UK`).

Update the holiday filter so:

- global holidays are always imported
- non-global holidays are not imported when `input.regionCode` is null
- non-global holidays are imported only when `h.counties` includes the prefixed Nager county code for `input.countryCode` and `input.regionCode`

Do not change the `sourceRemoteIdForHoliday()` persisted key shape except that
it should still use the app country code and app region code. This preserves
existing database uniqueness and ensures working-day logic compares against
`Organisation.country_code`.

Add unit coverage in `packages/availability/src/holidays/holiday-service.test.ts`
by mocking `getPublicHolidays()` if needed:

- AU with `regionCode: null` imports a global holiday and skips an `AU-QLD` holiday.
- AU with `regionCode: "QLD"` imports a global holiday and an `AU-QLD` holiday, but skips `AU-NSW`.
- UK calls `getPublicHolidays("GB", year)` while created rows keep `country_code: "UK"`.

**Verify**: `bunx vitest run packages/availability/src/holidays/holiday-service.test.ts` -> exit 0.

### Step 2: Add an idempotent organisation default holiday helper

In `packages/availability/src/holidays/holiday-service.ts`, export a new helper:

```ts
export interface EnsureDefaultPublicHolidaysInput {
  clerkOrgId: ClerkOrgId;
  organisationId: OrganisationId;
  userId?: string | null;
  years?: number[];
}

export async function ensureDefaultPublicHolidaysForOrganisation(
  input: EnsureDefaultPublicHolidaysInput
): Promise<
  Result<{
    importedCount: number;
    skippedCount: number;
    importedYears: number[];
    skippedYears: number[];
  }>
>
```

Implementation requirements:

- Load the active Organisation by `clerk_org_id` and `id`, selecting `country_code` and `region_code`.
- If no active Organisation exists, return `not_found`.
- Default `years` to the current calendar year and the next calendar year, computed once at call time. Deduplicate and sort any provided years.
- Use `userId ?? "system:default-public-holidays"` when calling `importForJurisdiction()`.
- Before importing a year, count existing `publicHoliday` rows scoped to the organisation with:
  - `source: "nager"`
  - `country_code: organisation.country_code`
  - `region_code: organisation.region_code`
  - `holiday_date` inside that year
  - include archived/suppressed rows in the count, so admin suppressions are not undone by repeated ensure calls.
- If the count is greater than zero, mark that year skipped and do not call Nager.
- If the count is zero, call `importForJurisdiction()` for that year and accumulate its counts.
- If one year's import fails, return the error. Callers in creation paths will handle it as non-fatal in later steps.

Export the new function from `packages/availability/index.ts`.

Add unit tests in `holiday-service.test.ts`:

- Imports current and next year when there are no existing Nager holiday rows.
- Skips a year that already has at least one Nager row, including archived rows.
- Returns `not_found` when the organisation is missing.
- Uses the system actor when `userId` is absent.

**Verify**: `bunx vitest run packages/availability/src/holidays/holiday-service.test.ts` -> exit 0.

### Step 3: Provision holidays from the main Organisation creation/update service

In `packages/availability/src/people/current-user-service.ts`, import
`ensureDefaultPublicHolidaysForOrganisation` from `../holidays/holiday-service`.

After the Organisation create/update at lines 117-141 and before returning the
tenant context at lines 143-146, call:

```ts
await ensureDefaultPublicHolidaysForOrganisation({
  clerkOrgId: input.clerkOrgId as ClerkOrgId,
  organisationId: organisation.id as OrganisationId,
});
```

Do not let Nager downtime block Organisation creation. If the result is
`ok: false`, continue returning the tenant context. Keep this explicit in code,
for example by assigning the result and intentionally ignoring expected errors.
Do not throw from this path for holiday import failures.

Add or extend an integration test in `packages/availability/index.integration.test.ts`
for `ensureOrganisationForClerk()`:

- Mock `getPublicHolidays()` or otherwise avoid real Nager network calls.
- Create a new Clerk org with country `AU`.
- Assert one Organisation exists.
- Assert at least one `publicHolidayJurisdiction` exists for `AU` and `region_code: null`.
- Assert Nager holidays for current and next year were persisted.
- Call `ensureOrganisationForClerk()` again and assert no duplicate jurisdiction or holidays are created.

Make sure cleanup deletes public holiday rows and jurisdictions before deleting organisations, following the deletion order used in `packages/database/public-holidays.integration.test.ts:27-50`.

**Verify**: `bunx vitest run packages/availability/index.integration.test.ts` -> exit 0.

### Step 4: Provision holidays from the direct Xero Organisation creation path

In `packages/xero/package.json`, add `@repo/availability` to dependencies.

In `packages/xero/src/oauth/service.ts`, import
`ensureDefaultPublicHolidaysForOrganisation` from `@repo/availability`.

In `resolveOrganisationForTenantSelection()` at lines 834-848, after the direct
`database.organisation.create()` succeeds and before returning the id, call the
helper with the new organisation id. Treat failure as non-fatal for the Xero
connection flow, matching Step 3.

Use the created organisation's canonical country code (`defaults.countryCode`).
The helper should load the Organisation itself, so do not duplicate country or
region logic in the Xero package.

Update `packages/xero/src/oauth/service.test.ts`:

- Mock `@repo/availability` to expose `ensureDefaultPublicHolidaysForOrganisation`.
- For the "no existing Organisation" tenant-selection scenario, assert the
  helper is called with `clerkOrgId` and the created organisation id.
- Assert the Xero flow still succeeds when the helper returns `ok: false`.

STOP if adding this dependency creates a circular import or causes package
initialisation failures. Report the cycle instead of moving the helper into
`@repo/database`; that lower-level package should not learn about Nager.

**Verify**: `bunx vitest run packages/xero/src/oauth/service.test.ts` -> exit 0.

### Step 5: Import holidays after country or region settings changes

In `apps/app/app/(authenticated)/settings/general/_actions.ts`, import
`ensureDefaultPublicHolidaysForOrganisation` from `@repo/availability`.

After `database.organisation.update()` and audit creation in
`updateOrganisationAction()`, detect whether the effective country or region
changed:

```ts
const holidayJurisdictionChanged =
  updated.country_code !== organisation.country_code ||
  updated.region_code !== organisation.region_code;
```

If changed, call the helper with:

- `clerkOrgId: context.value.clerkOrgId`
- `organisationId: context.value.organisationId`
- `userId: context.value.actingUserId`

Treat failure as non-fatal for saving settings. Revalidate `/public-holidays`,
`/settings/holidays`, and `/calendar` in addition to the existing paths.

Update `apps/app/app/(authenticated)/settings/general/general-client.tsx` copy:

- At lines 189-190, keep the meaning but say country, region, and timezone affect public holiday defaults and Xero payroll region selection.
- At lines 270-274, replace "You may need to import new public holidays from Settings > Holidays" with copy saying Team Calendar imports available public holidays automatically and existing custom/suppressed records are preserved.
- At lines 281-283, say changing country affects future Xero connections and automatic holiday defaults.

**Verify**: `bunx vitest run 'apps/app/app/(authenticated)/settings/general'` -> exit 0 if tests exist; if Vitest reports no matching test files, note that and continue to `bun run typecheck`.

### Step 6: Update onboarding and public-holiday empty-state copy

In `apps/app/lib/server/load-onboarding-state.ts`:

- Keep the completion signal as `publicHolidayJurisdictionCount > 0`; the new helper creates this jurisdiction.
- Change the profile step description at lines 149-151 so it no longer says users must confirm details before importing holidays. Suggested copy: `"<name> is set to <country>. Confirm the country, region, and timezone used for public holiday defaults."`
- Change the holidays step CTA label at lines 173-176:
  - complete: `"Review holidays"`
  - incomplete: `"Review setup"` or `"Retry setup"`, not `"Set holidays"`
- Change the holidays description to explain that Team Calendar imports the organisation's country holidays automatically, and admins can review regional or custom dates.

In `apps/app/app/(authenticated)/public-holidays/public-holidays-list.tsx`,
update the zero-state description at lines 175-176 so it no longer tells users
to import holidays manually. Suggested copy:

`Team Calendar imports your organisation's country holidays automatically. Add a custom holiday for company-specific dates.`

Update focused tests:

- `apps/app/app/(authenticated)/public-holidays/public-holidays-list.test.tsx` should expect the new empty-state description.
- Add or update onboarding-state tests if present under `apps/app/lib/server`; if none exist, create a small unit test that mocks `database` counts and asserts the holidays step is complete when a jurisdiction exists and that the copy matches the automatic-import behaviour.
- `apps/app/app/(authenticated)/public-holidays/page.test.tsx` probably does not need behaviour changes unless the zero-state copy assertion moves there.

**Verify**: `bunx vitest run 'apps/app/app/(authenticated)/public-holidays' apps/app/lib/server` -> exit 0.

### Step 7: Run final gates

Run the full repo checks from the root:

1. `bun run typecheck` -> exit 0, no TypeScript errors.
2. `bun run check` -> exit 0, no Ultracite/Biome errors.
3. `bun run test` -> exit 0.

If a focused Vitest command reports "No test files found" for a path that lacks
tests, record that in the PR notes and rely on the broader commands.

## Test plan

- `packages/availability/src/holidays/holiday-service.test.ts`
  - country-code mapping for UK -> GB fetch with UK persisted
  - no-region imports only global holidays
  - region imports global plus matching prefixed county holidays
  - default helper imports current and next year only when missing
  - default helper is idempotent and counts archived rows as existing
  - missing Organisation returns `not_found`
- `packages/availability/index.integration.test.ts`
  - `ensureOrganisationForClerk()` creates the Organisation and default public holiday jurisdiction/holidays
  - repeated calls do not duplicate rows
- `packages/xero/src/oauth/service.test.ts`
  - direct Xero Organisation creation calls the holiday helper
  - helper failure does not fail tenant selection
- App tests
  - onboarding copy/status reflects automatic public holidays
  - public-holiday empty state no longer tells new users to import holidays manually

## Done criteria

- [ ] New organisations created via `ensureOrganisationForClerk()` get a default Nager public holiday jurisdiction for their `Organisation.country_code`.
- [ ] The direct Xero tenant-selection Organisation creation path also invokes the default holiday helper.
- [ ] Default import covers current and next year and is idempotent.
- [ ] UK organisations fetch from Nager using `GB` but persist app country code `UK`.
- [ ] Organisations with no region do not import regional/state holidays as national holidays.
- [ ] Settings country/region changes trigger a non-fatal default holiday import for the new jurisdiction.
- [ ] Public-holiday and onboarding copy no longer implies admins must manually import their country's holidays.
- [ ] Focused Vitest commands listed above pass, except any no-test-file path is explicitly noted.
- [ ] `bun run typecheck`, `bun run check`, and `bun run test` pass.
- [ ] No files outside the in-scope list are modified, except `bun.lock` if adding `@repo/availability` to `packages/xero/package.json` requires a workspace lockfile update.
- [ ] `plans/README.md` status row for plan 011 is updated.

## STOP conditions

Stop and report back if:

- The code at the paths in "Current state" no longer matches the excerpts.
- Nager.Date does not use `GB` for United Kingdom or prefixed county codes like `AU-QLD`/`GB-ENG`; the country/region mapping design must be revised.
- Adding `@repo/availability` to `@repo/xero` creates a circular dependency or package initialisation problem.
- Making imports synchronous causes unacceptable request latency in tests or local manual verification; this should become a background-job plan rather than an ad hoc timeout.
- A step's verification fails twice after a reasonable fix attempt.
- The implementation appears to require a schema change or production backfill.

## Maintenance notes

- This plan intentionally keeps Nager import failures non-fatal during Organisation creation so a third-party API outage does not block signup or Xero connection.
- Reviewers should scrutinise the no-region filtering carefully. The current code imports all regional holidays when `regionCode` is null; that should not survive this plan.
- When a future retry/background job is added, it should call `ensureDefaultPublicHolidaysForOrganisation()` rather than duplicating Nager import logic.
- Plan 010 lands first on `preview`, so `ensureOrganisationForClerk()` and the Xero creation path will already call `ensureDefaultCalendarFeed`. Compose the holiday helper call alongside it rather than restructuring or overwriting that hook.
