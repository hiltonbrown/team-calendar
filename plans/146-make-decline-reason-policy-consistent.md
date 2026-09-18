# Plan 146: Make required decline reasons consistent across settings and approval

## Status

- Priority: P2, go-live-relevant settings contract
- Effort: S
- Risk: LOW
- Confidence: HIGH
- Category: correctness, usability
- Depends on: none (coordinate approval-service edits with Plan 145)
- Planned at: `ee8c410`, 2026-09-18
- Status: TODO

## Why this matters

The leave-approval settings screen offers a switch to disable required decline reasons, and saves the setting successfully. The server action always requires 3–1000 characters, so the switch has no effect on the shipped approval workflow. The underlying service, conversely, allows an empty reason when that stored setting is false. The current domain contract explicitly requires a decline reason. Preserve that contract and remove the ineffective opt-out instead of weakening the action.

## Current state and drift check

Run `git diff --stat ee8c410..HEAD -- 'apps/app/app/(authenticated)/settings/leave-approval' packages/availability/src/settings packages/availability/src/approvals/approval-service.ts` and inspect changes.

- `apps/app/app/(authenticated)/settings/leave-approval/leave-approval-settings-client.tsx:240` renders an enabled `SettingsToggleCard` labelled `Require decline reason`, with copy recommending against disabling it.
- The colocated `_actions.ts` accepts optional boolean `requireDeclineReason`.
- `apps/app/app/(authenticated)/leave-approvals/_actions.ts:29` has `reason: z.string().trim().min(3).max(1000)`.
- `packages/availability/src/approvals/approval-service.ts:179,583` permits empty reason when the stored setting is false.
- `packages/availability/src/settings/organisation-settings-service.ts:143` persists the opt-out. `plans/README.md` records the mismatch as a historical Plan 124 follow-up.

The current domain instructions say decline requires a reason. Keep Australian English and reuse existing settings components/tokens. Invoke the installed Impeccable skill before UI changes.

## Scope

- `apps/app/app/(authenticated)/settings/leave-approval/leave-approval-settings-client.tsx` and its tests
- The colocated `_actions.ts` and tests
- `packages/availability/src/settings/shared.ts`, `organisation-settings-service.ts` and tests
- `packages/availability/src/approvals/approval-service.ts` and tests
- `plans/README.md`

Do not remove the database column or create a migration solely for this cleanup. Do not alter the required reason bounds or introduce configurable optional reasons. Do not rewrite the full settings screen.

## Git workflow

Use isolated local branch/worktree `fix/146-decline-reason-policy`, conventional `fix:` commit and coordinator's authorised local merge after review. No push. Coordinate overlapping approval-service edits after Plan 145.

## Steps and verification

1. Replace the ineffective switch with clear static settings copy stating a reason is always required, using existing surface/typography. Remove the disabling action from the browser. Invoke Impeccable before editing. Update the existing component test to assert no opt-out switch and visible policy explanation.
   Verify: `bun run --cwd apps/app test 'app/(authenticated)/settings/leave-approval/leave-approval-settings-client.test.tsx'` passes.
2. Make the service's decline schema enforce the same 3–1000 trimmed-character rule independently of settings. Keep settings responses/defaults truthful for legacy false rows, and reject/normalise attempts to persist false at the settings service boundary. Preserve compatibility for existing true defaults; no destructive migration is necessary.
   Verify: `bun run --cwd packages/availability test src/approvals/approval-service.test.ts src/settings/organisation-settings-service.test.ts` passes; blank reasons with stored false must now fail before provider calls.
3. Update action tests for attempted opt-out, then run all gates and browser verification for the changed settings surface. Record the historical Plan 124 follow-up as resolved only after verification.

## Tests and done criteria

- Blank/whitespace/2-character reason rejected, 3-character and 1000-character accepted, >1000 rejected regardless of legacy setting value.
- Provider not called for invalid reasons; unavailable settings cannot bypass the invariant.
- Settings client exposes no ineffective control, server rejects or normalises false consistently, and stored legacy false is presented truthfully.
- Focused suites and `bun run check`, `bun run typecheck`, `bun run test`, `bun run test:integration` pass.
- Browser confirms readable policy text and no disabled-required setting ambiguity.
- Diff and advisor review pass.

## STOP conditions and maintenance

If a newer approved product decision explicitly allows optional reasons, report that contradiction before implementation. Otherwise the required reason is a domain invariant, not a preferences toggle. Keep future action and service validators aligned; add contract coverage when either changes.
