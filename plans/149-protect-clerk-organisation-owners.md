# Plan 149: Protect Clerk Organisation owners from administrator mutation

## Status

- Priority: P1
- Effort: S
- Risk: LOW
- Confidence: HIGH
- Category: authorisation, security
- Depends on: none
- Planned at: `4849878`, 2026-09-18
- Status: DONE

Implemented in `77f4fdf` and locally integrated as `c4b993e`. The isolated
executor passed 14 focused tests, app typecheck, scoped Biome and diff checks;
the integrated candidate passed the combined owner/OAuth regression run.

## Why this matters

The member-management server actions allow both owners and administrators to
remove members or change roles. They restrict who may assign the owner role,
but do not load the target membership before mutation. A directly invoked
action therefore lets an administrator remove or demote an existing owner,
despite the client hiding those controls.

## Scope

- `apps/app/app/actions/settings/remove-member.ts`
- `apps/app/app/actions/settings/remove-member.test.ts`
- `apps/app/app/actions/settings/update-member-role.ts`
- `apps/app/app/actions/settings/update-member-role.test.ts`

Do not redesign Clerk roles, add custom membership storage, or change the
members UI unless the corrected server contract requires a truthful error.

## Implementation

1. After input and actor-role validation, load the target membership from the
   authenticated Clerk Organisation by filtering the organisation membership
   list to the supplied user ID. Reject a missing or ambiguous target without
   mutating Clerk.
2. If the target is an owner, require the acting role to be `org:owner` before
   removal or demotion. Preserve an owner's ability to manage a different
   owner, and preserve the existing client prohibition on self-mutation. Clerk
   remains authoritative for any final-owner invariant.
3. Keep owner assignment restricted to owners. Preserve administrator changes
   for non-owner targets.
4. Add tests for administrator removal and demotion of owners, owner mutation
   of another owner, missing targets, and existing allowed/denied paths.

## Verification

- `bun run --cwd apps/app test app/actions/settings/remove-member.test.ts app/actions/settings/update-member-role.test.ts`
- `bun run --cwd apps/app typecheck`
- Final candidate check, build, typecheck, unit and integration gates

## STOP conditions

Stop if the installed Clerk SDK cannot resolve a target membership by user ID,
or if the repository has an approved ownership-transfer policy that conflicts
with this server-side rule. Never rely on client visibility for authorisation.
