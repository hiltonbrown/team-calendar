# Plan 011: Move implementation code out of the availability package barrel

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat d9da765..HEAD -- packages/availability/index.ts`
> This file has the highest churn in the repo (19 commits in 3 months), so
> drift is likely — re-map the inline implementation block before starting;
> if the structure no longer matches "Current state", STOP and report.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: MED (mechanical move, but the file is high-churn and heavily imported)
- **Depends on**: 001 (typecheck gate makes the move safe to verify)
- **Category**: tech-debt
- **Planned at**: commit `d9da765`, 2026-06-12
- **Issue**: https://github.com/hiltonbrown/leavesync/issues/67

## Why this matters

`packages/availability/index.ts` is 928 lines and the most-churned file in the repository. It is supposed to be the package's barrel (the one place CLAUDE.md permits re-exports), but roughly 700 of those lines are **implementation**: the manual-availability CRUD service, current-user/person onboarding, profile normalisation helpers, and a publication materialiser — complete with their own `database` imports and Zod schemas. Every change to manual records or onboarding rewrites the package's public entry point, inflating churn, merge conflicts, and review surface. Moving the implementation into `src/` modules (where all 25+ other services in this package already live) and leaving index.ts as pure re-exports makes the entry point stable and the services individually testable.

## Current state

- `packages/availability/index.ts` (928 lines) layout, verified at planning time:
  - Lines 1–~200: pure re-exports from `./src/...` (analytics, approvals, calendar, dashboard, holidays, people, plans, settings, sync — 58 export statements). **Keep these.**
  - Line 201 onwards: implementation. Inline imports at 201–213 (`node:crypto` randomUUID, `@repo/database` database/scopedQuery, `Prisma` from generated client, `materialiseAvailabilityPublication` from `@repo/feeds`, `log` from observability, `zod`, `deriveAvailabilityUidKey` from `./src/sync/availability-uid`).
  - Inline exported values (grep-verified):
    - `ManualAvailabilityInputSchema` (line 232)
    - `getInitials` (309)
    - `ensureOrganisationForClerk` (381)
    - `ensureCurrentUserPerson` (424)
    - `listPersonViews` (569)
    - `listAvailabilityRecords` (584)
    - `createManualAvailability` (615)
    - `updateManualAvailability` (716)
    - `updateAvailabilityApprovalStatus` (813)
    - `archiveManualAvailability` (851)
  - Inline private helpers: `normaliseCurrentUserProfile` (520), `safeCurrentUserProfilePatch` (549), `cleanString` (559), `normaliseEmail` (564), `materialisePublication` (883).
- Existing tests at package root: `packages/availability/index.test.ts` and `index.integration.test.ts` — they import from the package root, so they keep passing if re-exports are faithful.
- The sanctioned exception: `@repo/availability` importing `@repo/feeds` is **intentional** (publication materialisation) — do not "fix" it while moving code.
- Conventions: named exports only; no barrel files except package root; services live in `packages/availability/src/<domain>/<name>-service.ts`; co-located tests. Exemplar: `packages/availability/src/people/people-service.ts`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Availability tests | `bunx vitest run packages/availability` | all pass |
| Whole suite | `bun run test` | all pass |
| Typecheck | `bun run typecheck` (after plan 001) or per-app `cd apps/app && bun run typecheck` | exit 0 |
| Lint | `bun run check` | exit 0 |
| Consumer scan | `grep -rln "@repo/availability" apps packages --include="*.ts" --include="*.tsx" \| grep -v node_modules` | list of importers |

## Scope

**In scope**:
- `packages/availability/index.ts` (shrinks to pure re-exports)
- `packages/availability/src/records/manual-records-service.ts` (create)
- `packages/availability/src/people/current-user-service.ts` (create)
- `packages/availability/src/people/profile-normalisation.ts` (create)
- Co-located test files for the new modules (create/move)

**Out of scope** (do NOT touch):
- Any consumer in `apps/` — the public API of `@repo/availability` must be unchanged; if a consumer needs an edit, the move was not faithful.
- The 200 lines of existing re-exports at the top of index.ts.
- Behaviour of any moved function — this is a mechanical move, zero logic edits. Resist cleanups.
- `src/sync/availability-uid.ts`, `@repo/feeds` imports — they move with the code verbatim.

## Git workflow

- Branch: `advisor/011-split-availability-barrel`
- One commit per step (mechanical moves reviewable in isolation), e.g. `refactor(availability): move manual records service out of the package barrel`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Map the exact inline block and its internal dependencies

Re-run the structure greps (`grep -n "^export\|^function\|^import" packages/availability/index.ts`) and note which private helpers each exported function uses (e.g. `createManualAvailability` likely uses `materialisePublication`; `ensureCurrentUserPerson` uses the normalisation helpers). Group accordingly:

- **records** group → `src/records/manual-records-service.ts`: `ManualAvailabilityInputSchema`, `listAvailabilityRecords`, `createManualAvailability`, `updateManualAvailability`, `updateAvailabilityApprovalStatus`, `archiveManualAvailability`, private `materialisePublication`.
- **current-user** group → `src/people/current-user-service.ts`: `ensureOrganisationForClerk`, `ensureCurrentUserPerson`, `listPersonViews`, `getInitials`.
- **normalisation** group → `src/people/profile-normalisation.ts`: `normaliseCurrentUserProfile`, `safeCurrentUserProfilePatch`, `cleanString`, `normaliseEmail` (exported from this module, imported by current-user-service).

If a helper is shared across groups, put it in the normalisation module (or a small shared module in `src/records/`) rather than duplicating.

**Verify**: a written mapping of every line-201+ symbol to a destination file, with no symbol unassigned.

### Step 2: Move the records group

Cut the records-group code verbatim into `src/records/manual-records-service.ts` (carry the needed imports; add `import "server-only"` if the barrel had it at line 1 — it does). In `index.ts`, replace with:

```typescript
export {
  archiveManualAvailability,
  createManualAvailability,
  listAvailabilityRecords,
  ManualAvailabilityInputSchema,
  updateAvailabilityApprovalStatus,
  updateManualAvailability,
} from "./src/records/manual-records-service";
```

**Verify**: `bunx vitest run packages/availability` → all pass; `bun run check` → exit 0.

### Step 3: Move the normalisation and current-user groups

Same procedure: helpers into `src/people/profile-normalisation.ts` (exported), the four current-user functions into `src/people/current-user-service.ts` importing the helpers. Re-export the four public functions from `index.ts`. Do not export the private helpers from the package root (they were private before; keep them package-internal).

**Verify**: `bunx vitest run packages/availability` → all pass; `cd apps/app && bun run typecheck` → exit 0 (apps compile against the unchanged public API).

### Step 4: Confirm the barrel is pure and the API is identical

- `index.ts` should now contain only `import "server-only"`, export statements, and type re-exports — no `database` import, no function bodies.
- API equivalence check: from the repo root run a scratch type test or simply rely on typecheck of all consumers — `bun run typecheck` (all apps) and `bun run test`.

**Verify**:
- `grep -cE "^export" packages/availability/index.ts` → count ≥ previous 58 (all old exports still present).
- `grep -n "from \"@repo/database\"" packages/availability/index.ts` → no matches.
- `wc -l packages/availability/index.ts` → roughly ≤ 250 lines.

### Step 5: Move or add co-located tests

If `index.test.ts` contains tests that exercise the moved functions directly, leave them working (they import from the package root, which still exports everything) — but add thin co-located test files for the new modules only if logic-level tests existed inline. Do not write new behavioural tests in this plan (the move is mechanical); `profile-normalisation.ts` is the one exception — its pure helpers (`cleanString`, `normaliseEmail`) are now importable, so add a small `profile-normalisation.test.ts` covering them (trim/empty/null cases, email lowercasing — derive from the code).

**Verify**: `bunx vitest run packages/availability` → all pass including the new normalisation tests. `bun run test` → all pass.

## Test plan

- Existing `index.test.ts` / `index.integration.test.ts` pass unchanged (they are the API-stability proof).
- New `packages/availability/src/people/profile-normalisation.test.ts` for the pure helpers.
- Full suite + all-app typecheck green.

## Done criteria

ALL must hold:

- [ ] `packages/availability/index.ts` contains no `@repo/database` import and no function bodies (re-exports only)
- [ ] All previously-exported symbols still importable from `@repo/availability` (typecheck of `apps/app`, `apps/api` proves it; zero consumer edits in the diff)
- [ ] `wc -l packages/availability/index.ts` ≤ ~250
- [ ] `bunx vitest run packages/availability` exits 0; `bun run test` exits 0; `bun run check` exits 0; typecheck exits 0
- [ ] `git diff --stat` shows changes only in `packages/availability/`
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The drift check shows the inline block has materially changed since `d9da765` (likely given churn) and the Step 1 mapping no longer covers every symbol.
- Any consumer in `apps/` fails typecheck after the move — indicates a missed or renamed export; if you cannot restore API equivalence with a re-export line, stop.
- You discover the moved code has a circular import with an existing `src/` module (e.g. `people-service` importing from the barrel) — report the cycle instead of inventing an interface.
- The urge arises to "fix" logic while moving it. Mechanical means mechanical.

## Maintenance notes

- After this lands, the rule for the package is: index.ts gains only export lines. Reviewer should reject future PRs adding function bodies to it.
- The duplication noted in the audit between `normaliseCurrentUserProfile` and similar logic in `people-service.ts` becomes fixable cheaply once the helpers live in `profile-normalisation.ts` — deferred follow-up, not part of this move.
- High churn means rebase conflicts are likely if this branch lives long; execute it in a quiet window and merge promptly.
