# Plan 011: Remove dead `load-*-data` loaders and dedupe feed projection helpers

> **Executor instructions**: Follow step by step, running every verification
> command. If a STOP condition occurs, stop and report. Update `plans/README.md`
> when done unless a reviewer maintains the index.
>
> **Drift check (run first)**: `git diff --stat e1b06a3..HEAD -- apps/app/lib/server packages/feeds/src/projection/feed-projection.ts packages/feeds/src/publication/publication-service.ts`
> Compare against live code; on a mismatch, STOP.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `e1b06a3`, 2026-06-18
- **Issue**: <!-- filled when published via --issues -->

## Why this matters

`apps/app/lib/server` contains nine `load-*` loader modules with **zero importers**
— dead code left from an abandoned data-loading architecture. The directory's
317-line `README.md` documents that abandoned pattern (and even loaders that no
longer exist on disk), actively pointing new contributors and agents down a dead
path; the codebase actually converged on `require-active-org-page-context` +
direct `@repo/availability` service calls.

Separately, `displayNameForPrivacy` and `labelForRecordType` are duplicated
verbatim between two feed modules. They encode the published-feed privacy display
contract ("Unavailable"/"Team member" strings and record-type labels); two copies
will silently drift and desync what gets rendered vs. materialised.

## Current state

Dead loaders (verified 0 importers each) in `apps/app/lib/server/`:
- `load-availability-record-detail-data.ts`
- `load-layout-context.ts`
- `load-leave-balances-page-data.ts`
- `load-manual-availability-page-data.ts`
- `load-notifications-data.ts`
- `load-pending-approvals-data.ts`
- `load-person-profile-data.ts`
- `load-sync-health-data.ts`
- `load-team-calendar-data.ts`

Live files in the same dir (KEEP): `load-onboarding-state.ts` (4 importers),
`get-active-org-context.ts`, `require-active-org-page-context.ts`,
`ensure-default-organisation.ts`.

Duplicated helpers (identical implementations):
- `packages/feeds/src/projection/feed-projection.ts:329` `displayNameForPrivacy`,
  `:342` `labelForRecordType`
- `packages/feeds/src/publication/publication-service.ts:210` `displayNameForPrivacy`,
  `:223` `labelForRecordType`
- `publication-service.ts` **already** imports `projectSummaryLine` from
  `feed-projection.ts` (so the shared-import path exists).

## Commands you will need

| Purpose   | Command                                              | Expected on success |
|-----------|------------------------------------------------------|---------------------|
| Install   | `bun install`                                         | exit 0              |
| Typecheck | `bun run typecheck`                                   | exit 0              |
| Feeds test| `bunx vitest run packages/feeds`                      | all pass            |
| App build | `bun run build --filter=app`                          | exit 0              |

## Scope

**In scope**:
- The nine dead loader files listed above (delete)
- Co-located tests of those loaders, if any (delete)
- `apps/app/lib/server/README.md` (trim to the live reality)
- `packages/feeds/src/projection/feed-projection.ts` (export the two helpers)
- `packages/feeds/src/publication/publication-service.ts` (import them, delete copies)

**Out of scope**:
- `load-onboarding-state.ts` and the other live files — KEEP.
- Any behaviour change to the feed projection output.

## Git workflow

- Branch: `advisor/011-dead-code-cleanup`
- Conventional commits, e.g. `refactor(app): remove dead server loaders` and
  `refactor(feeds): dedupe projection helpers`.
- Do NOT push/PR unless instructed.

## Steps

### Step 1: Re-verify each loader is unreferenced, then delete

For each file, run
`grep -rl "<basename-without-ext>" apps packages --include='*.ts' --include='*.tsx' | grep -v "<the file itself>"`.
If the count is 0, delete the file (and any co-located `.test.ts`). If any file has
a non-zero count, **do not delete it** — note it and continue with the rest.

**Verify**: `bun run build --filter=app` → exit 0 (nothing imported the deleted files).

### Step 2: Trim the stale README

Rewrite `apps/app/lib/server/README.md` to describe only the live files
(`require-active-org-page-context`, `get-active-org-context`,
`ensure-default-organisation`, `load-onboarding-state`) and the actual pattern
(page context + `@repo/availability` service calls). Remove all references to the
deleted loaders and to loaders that do not exist (`loadFeedManagementData`,
`loadNotificationsData`). If a full rewrite is too involved, at minimum delete the
sections describing the removed/phantom loaders.

**Verify**: `grep -n "load-pending-approvals-data\|loadFeedManagementData" apps/app/lib/server/README.md`
returns no matches.

### Step 3: Dedupe the feed helpers

Confirm the two `displayNameForPrivacy` and the two `labelForRecordType`
implementations are identical (diff them). If identical: `export` them from
`feed-projection.ts`, delete the copies in `publication-service.ts`, and import
them there alongside the existing `projectSummaryLine` import. If they differ in
any way, STOP (see STOP conditions).

**Verify**: `bunx vitest run packages/feeds` → all pass (projection output
unchanged).

## Test plan

- No new tests required for deletion (the build proves nothing imported the dead
  files). The existing `packages/feeds` tests cover the deduped helpers' behaviour;
  they must still pass.
- Verification: `bunx vitest run packages/feeds` + `bun run build --filter=app`.

## Done criteria

ALL must hold:

- [ ] The nine dead loader files are deleted (or any kept ones are reported with
      their importer)
- [ ] `apps/app/lib/server/README.md` no longer references deleted/phantom loaders
- [ ] `displayNameForPrivacy` / `labelForRecordType` exist once (in
      `feed-projection.ts`), imported by `publication-service.ts`
- [ ] `bun run typecheck` and `bun run build --filter=app` exit 0
- [ ] `bunx vitest run packages/feeds` passes
- [ ] `bun run check` exits 0
- [ ] No files outside the in-scope list are modified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back if:

- Any loader marked dead here actually has an importer at execution time (the
  codebase changed since this plan) — keep it, report it.
- The two `displayNameForPrivacy` or `labelForRecordType` implementations are
  **not** identical — do not merge blindly; report the difference so the correct
  single behaviour can be decided.

## Maintenance notes

- After this, the feed privacy display strings live in one place; any future
  privacy-label change touches one function.
- Reviewer: confirm the deletions are genuinely unreferenced (the build is the
  proof) and the README now matches reality.
