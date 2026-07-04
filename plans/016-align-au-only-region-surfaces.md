# Plan 016: Align region setup and marketing surfaces with AU-only launch scope

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report, do not improvise. When done, update the status row for this plan
> in `plans/README.md` unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat e04f37d..HEAD -- README.md apps/web/app 'apps/app/app/(authenticated)/setup' 'apps/app/app/(authenticated)/settings/general' packages/xero/src/read/dispatch.ts packages/xero/src/nz/write.ts packages/xero/src/uk/write.ts packages/xero/src/oauth/service.ts`
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
- **Depends on**: plans/003-region-not-supported-error.md
- **Category**: bug
- **Planned at**: commit `e04f37d`, 2026-07-02

## Why this matters

The repo states launch scope is AU-only, but onboarding, settings, and
marketing surfaces present NZ and UK as supported Xero Payroll regions. The
Xero read and write adapters for NZ and UK are still stubs, so users can be
guided into a region that cannot sync core payroll data. Plan 003 fixes the
backend write-back error message; this plan aligns product surfaces so users
see the true launch scope before they connect or configure an unsupported
region.

## Current state

- README says launch scope is AU-only:

```md
<!-- README.md:69-71 -->
## Current status

Team Calendar is under active development and pre-launch. ... Launch scope is AU-only, English-only, core loop.
```

- README and marketing also advertise AU/NZ/UK:

```md
<!-- README.md:23-24 -->
1. **Connect Xero.** Team Calendar links to your Xero Payroll file (AU, NZ, or UK) and syncs employees, leave records, and balances on a schedule.
2. **Manage leave.** ... Approved decisions write straight back to Xero.
```

```ts
// apps/web/app/integrations/page.tsx:107-115
const syncDetails = [
  {
    title: "Inbound sync",
    copy: "Scheduled jobs keep employees, leave, balances, and approval state current across AU, NZ, and UK Payroll APIs.",
  },
  {
    title: "Write-back",
    copy: "Submitted, approved, declined, and withdrawn leave writes to Xero synchronously so payroll records stay correct.",
  },
```

```tsx
// apps/web/app/integrations/page.tsx:188-194
<h2 className="fmkt-section-title">
  One Xero connection, three regions.
</h2>
<p className="fmkt-integrations__copy">
  Team Calendar is built specifically for Xero Payroll AU, NZ, and UK.
```

- Other public copy repeats the same claim:
  - `apps/web/app/features/page.tsx:423-424` says supported regions are
    Australia, New Zealand, and the United Kingdom.
  - `apps/web/app/(home)/components/calendar-integration-section.tsx:4-6`
    says "Connect Xero Payroll AU, NZ, or UK."
  - `apps/web/app/contact/components/contact-form.tsx:28-30` says the team
    understands Xero Payroll AU, NZ, and UK.
  - `apps/web/app/components/footer.tsx:57-59` says built for Xero Payroll
    teams in Australia, New Zealand, and the United Kingdom.

- Product setup allows NZ and UK:

```ts
// apps/app/app/(authenticated)/setup/onboarding-client.tsx:21-25
const COUNTRY_OPTIONS = [
  { label: "Australia", value: "AU" },
  { label: "New Zealand", value: "NZ" },
  { label: "United Kingdom", value: "UK" },
] as const;
```

```ts
// apps/app/app/(authenticated)/setup/_actions.ts:13-15
const SetupOrganisationSchema = z.object({
  countryCode: z.enum(["AU", "NZ", "UK"]),
  name: z.string().trim().min(1).max(128),
});
```

- Settings allows country changes to NZ/UK:

```ts
// apps/app/app/(authenticated)/settings/general/general-client.tsx:30-34
const COUNTRY_OPTIONS = [
  { label: "Australia", value: "AU" },
  { label: "New Zealand", value: "NZ" },
  { label: "United Kingdom", value: "UK" },
] as const;
```

```ts
// apps/app/app/(authenticated)/settings/general/_actions.ts:18-24
const OrganisationSchema = z.object({
  confirmationCountryChange: z.boolean().optional().default(false),
  countryCode: z.enum(["AU", "NZ", "UK"]).optional(),
```

- Xero adapters are stubs for NZ and UK:

```ts
// packages/xero/src/read/dispatch.ts:54-69
case "NZ":
  return {
    ok: false,
    error: {
      code: "unknown_error",
      message: "NZ payroll employee reads are not yet available.",
    },
  };
case "UK":
  return {
    ok: false,
    error: {
      code: "unknown_error",
      message: "UK payroll employee reads are not yet available.",
```

```ts
// packages/xero/src/nz/write.ts:24-46
// TODO(nz-payroll): implement NZ payroll leave write-back.
return Promise.resolve({ ok: false, error: writeBackNotAvailableError });
...
// packages/xero/src/uk/write.ts:24-46
// TODO(uk-payroll): implement UK payroll leave write-back.
return Promise.resolve({ ok: false, error: writeBackNotAvailableError });
```

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Setup action test | `bunx vitest run "apps/app/app/(authenticated)/setup/_actions.test.ts"` | all pass |
| Xero OAuth tests | `bunx vitest run packages/xero/src/oauth/service.test.ts` | all pass |
| App tests | `cd apps/app && NODE_ENV=test bunx vitest run` | all pass |
| Typecheck | `bun run typecheck` | exit 0 |
| Lint | `bun run check` | exit 0 |
| Full tests | `bun run test` | exit 0 |

## Scope

**In scope**:

- `README.md`
- `apps/web/app/integrations/page.tsx`
- `apps/web/app/features/page.tsx`
- `apps/web/app/(home)/components/calendar-integration-section.tsx`
- `apps/web/app/contact/components/contact-form.tsx`
- `apps/web/app/components/footer.tsx`
- `apps/app/app/(authenticated)/setup/onboarding-client.tsx`
- `apps/app/app/(authenticated)/setup/_actions.ts`
- `apps/app/app/(authenticated)/setup/_actions.test.ts`
- `apps/app/app/(authenticated)/settings/general/general-client.tsx`
- `apps/app/app/(authenticated)/settings/general/_actions.ts`
- `packages/xero/src/oauth/service.ts`
- `packages/xero/src/oauth/service.test.ts`
- `plans/README.md` (status row)

**Out of scope**:

- Implementing NZ or UK payroll sync.
- Removing NZ/UK from database enums or Prisma schema.
- Changing the Xero read/write dispatch stubs beyond what plan 003 covers.
- Deleting NZ/UK public holiday or region data if it is needed for future
  support.

## Git workflow

- Branch: `preview` (shared branch for all plans; implement sequentially in plan-number order on top of the previous plan's commits)
- Commit message: `fix(product): align region surfaces with AU-only launch`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Make public copy truthful for launch

Update README and marketing copy to say AU is supported at launch and NZ/UK are
planned or future regions. Do not claim Team Calendar currently syncs employee,
leave, balances, or write-back across NZ/UK. Keep the tone factual and avoid
overexplaining implementation details.

Concrete targets:

- `README.md:23-24`
- `apps/web/app/integrations/page.tsx` region list and sync details
- `apps/web/app/features/page.tsx:423-424`
- `apps/web/app/(home)/components/calendar-integration-section.tsx:4-6`
- `apps/web/app/contact/components/contact-form.tsx:28-30`
- `apps/web/app/components/footer.tsx:57-59`

**Verify**: `rg -n "AU, NZ, or UK|AU, NZ, and UK|Australia, New Zealand and the United Kingdom|three regions|across AU, NZ, and UK" README.md apps/web/app` -> no current-support claims remain. Planned/future wording is acceptable.

### Step 2: Gate new organisation setup to AU

In onboarding UI, keep Australia selectable and either remove NZ/UK from
`COUNTRY_OPTIONS` or render them disabled with clear "planned" copy. In the
server action, reject non-AU `countryCode` with a validation error message such
as: "Team Calendar currently supports Australian Xero Payroll files only."

Extend `apps/app/app/(authenticated)/setup/_actions.test.ts` with a test that
`createOrganisationAction({ countryCode: "NZ", ... })` returns
`ok: false`, does not call `ensureOrganisationForClerk`, and does not redirect.

**Verify**: `bunx vitest run "apps/app/app/(authenticated)/setup/_actions.test.ts"` -> all pass.

### Step 3: Prevent settings from switching live orgs into unsupported countries

In general settings UI, prevent choosing NZ/UK for now. Preserve display of
existing NZ/UK values if they already exist in a database, but do not allow a
new save that switches an organisation to NZ or UK. In
`settings/general/_actions.ts`, reject `countryCode` values other than `AU`
with the same validation message as setup.

If there is no existing test file for this action, add focused tests modelled
after `apps/app/app/(authenticated)/setup/_actions.test.ts` or existing
settings action tests.

**Verify**: `cd apps/app && NODE_ENV=test bunx vitest run` -> all pass.

### Step 4: Block unsupported Xero tenant selection before persisting active connections

In `packages/xero/src/oauth/service.ts`, after `inferPayrollRegionForTenant`
returns a payroll region and before the transaction at lines 308-384 persists
the active connection and tenant, return an error for `NZ` or `UK`. Reuse an
existing error code if one fits (the existing `invalid_country` variant in
`XeroOAuthError` is the likely candidate); otherwise add a local error variant
only if the service type requires it. Message should be plain: "Team Calendar currently
supports Australian Xero Payroll files only."

Keep the broader country-to-region helper intact so future support can re-open
the gate with a small change.

Add or update `packages/xero/src/oauth/service.test.ts` to assert that an NZ or
UK detected tenant returns an error and does not call the transaction/upsert
path.

**Verify**: `bunx vitest run packages/xero/src/oauth/service.test.ts` -> all pass.

### Step 5: Run repo checks

Run the standard gates.

**Verify**:

- `bun run typecheck` -> exit 0
- `bun run check` -> exit 0
- `bun run test` -> exit 0

## Test plan

Tests must cover setup rejection and Xero tenant selection rejection for NZ/UK.
App tests should cover any settings action changes. Marketing copy is covered
by the grep command in step 1 plus typecheck/check.

## Done criteria

- [ ] Marketing and README no longer claim current NZ/UK payroll sync or
      write-back support.
- [ ] New setup cannot create NZ/UK organisations.
- [ ] Settings cannot switch an organisation to NZ/UK, while existing data is
      not destructively rewritten.
- [ ] Xero OAuth tenant selection does not persist active NZ/UK connections.
- [ ] Plan 003 remains the backend write-back stopgap for any legacy NZ/UK
      tenants that already exist.
- [ ] Targeted tests, typecheck, check, and full tests pass.
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report back if:

- The maintainer wants NZ/UK marketed as private beta rather than planned
  future support. That changes copy and gating requirements.
- Existing production data includes active NZ/UK organisations that must keep
  working during rollout. This plan needs a migration/allowlist strategy before
  proceeding.
- Xero OAuth error typing requires changes outside `packages/xero/src/oauth`.
- Tests reveal setup country code is also used as a required public holiday
  seed for existing NZ/UK demo data.

## Maintenance notes

- When NZ support is implemented, reverse this gate deliberately: update copy,
  setup/settings, OAuth tenant selection, read dispatch, write dispatch, and
  tests in one release.
- Plan 007 is the NZ write-back spike. If the spike finds inbound sync is also
  missing, write a separate NZ inbound-sync plan before re-opening marketing.
