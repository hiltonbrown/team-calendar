# Provider-neutral auth facade review

**Follow-up completed, 25 October 2026:** the naming migration is applied to the configured remote development database. The full integration inventory passes (383 tests, including 17 RLS checks); cleanup and unchanged original data are verified. See [05-development-verification.md](05-development-verification.md). The review below records the earlier implementation stage and its original verification limits.

25 October 2026. Clerk remains the active provider. This implements the facade and role boundary from [02-design.md](02-design.md), without installing Better Auth or changing authentication storage, schema, migration SQL, provider configuration or deployed services.

## Public boundary

`packages/auth/server.ts` and `helpers.ts` expose:

| Helper | Behaviour |
|---|---|
| `getSession` | Nullable projected session containing `accountId`, `userId`, `role`, `sessionId`. |
| `requireAccount` | Active account ID or the existing missing-auth/account exception. |
| `requireAccountResult` | Active account ID in `Result`; missing identity/account returns `unauthorised`. Operational failures propagate. |
| `getAccountId` | Nullable active account ID. |
| `requireRole` | Boolean exact-role match. Owner does not implicitly match admin. |
| `hasPermission` | Boolean grant check against the current account session. |
| `hasRoleResult` | Exact-role boolean in `Result`; missing identity/account returns `unauthorised`. |
| `getCurrentUser` | Nullable safe DTO containing `id`, `email`, `emailVerified`, `name`, `image`. |

No SDK auth object, `has`, token getter, SDK user resource or `clerkClient` is exported to consumers. Account IDs remain the existing text IDs.

`permissions.ts` defines `AuthRole = owner | admin | manager | viewer`, the static `statement` and `rolePermissions`, and pure `hasPermission(role, request)` for domain services with explicit actor context. The statement shape can be supplied to the future access-control implementation. Better Auth is not imported or instantiated. Unknown/multiple roles and empty/unknown permission requests fail closed.

Supporting neutral surfaces preserve existing capabilities: account/member/invitation DTOs and directory operations, client `useSession`, `AccountUserMenu`, `SignOutButton`, existing sign-in/provider wrappers, middleware authentication context, server bearer-header transport, and auth-owned release-testing wrappers. Explicit package exports block direct adapter imports.

## Consumer migration

- Apps use safe session/user fields and semantic permissions for member management, Xero operations, billing, settings and other action grants.
- `require-page-role` and its hierarchy are replaced by `require-page-permission`; page access uses the central grants. Exact role helpers retain exact matching.
- Domain actor fields use `role` and `actingRole`. Services use pure permissions without adding session reads inside tenant transactions or jobs.
- Existing ownership, reporting, company, privacy and state checks remain alongside the permission grants. Neutral role comparisons that select scope or presentation remain explicit.
- Jobs obtain account members through the neutral account directory and retain explicit account/company event context. Server manual-sync requests retain bearer forwarding through the transport boundary.
- Webhook roles are decoded through the auth adapter. Webhook tests obtain actual provider wire roles through an auth-owned fixture helper.
- Member mutations reject unrecognised target roles before provider mutation. Feed inputs reject unrecognised roles instead of silently granting viewer. These are deliberate fail-closed changes.
- Member full-name projection preserves displayed names and surname initials. Regular plan actions pass the exact viewer/manager role downstream; a full-suite regression caught and corrected an initial narrowing error.

`AGENTS.md`, `PRODUCT.md` and database query guidance describe the neutral API. Historical inventory/design/naming evidence remains historical.

## Import enforcement

`tooling/release/provider-imports.test.ts` scans repository source outside `packages/auth`. It rejects provider imports, re-exports, type imports, CommonJS imports, dynamic imports and test mock/import calls for `@clerk/*`, `better-auth` and `@better-auth/*`, including nested SDK paths. Dependencies, generated/build output and hidden tooling caches are excluded. It runs in the existing release-tool test CI gate.

The parser uses the existing TypeScript 5.9 compiler API through a development-only alias, because installed TypeScript 7 no longer exposes that parser API. Application typechecks still use TypeScript 7.0.2. Clerk testing dependencies now belong to `packages/auth`; root release tooling depends on its neutral wrapper.

Literal provider role prefixes remain only in the Clerk adapter and its wire-contract tests. They are required to communicate with active Clerk. Consumer roles and consumer fixtures are unprefixed. SDK property names such as `orgRole` remain only inside that adapter boundary. Historical migration documents are not rewritten to conceal the provider contract.

## Policy points preserved for review

No unresolved role-to-permission mapping was invented. The following existing predicates deserve an explicit product decision if their policy is to change:

1. In [manual-records-service.ts](../../packages/availability/src/records/manual-records-service.ts), a viewer whose Person is a target's direct manager can manage that target's manual availability. `manualAvailability.manageDirectReports` preserves this grant; the relationship check still applies. The code establishes current behaviour, but does not establish whether a future manager-only policy is desired.
2. [Plan](../../packages/availability/src/plans/plan-service.ts) and [alternative-contact](../../packages/availability/src/people/alternative-contact-service.ts) operations retain own-person/direct-manager relationship gates independent of the authentication role. No manager-role requirement was inferred.
3. [Dashboard](../../packages/availability/src/dashboard/dashboard-service.ts) `employee` and [sync-monitor](../../packages/availability/src/sync/sync-monitor-service.ts) `contractor` are existing presentation/test inputs, not additional authentication roles. Reporting/privacy branches for manager/viewer remain scope selectors, rather than being converted into guessed action permissions.

## Verification

| Gate | Result |
|---|---|
| `bun run check` | PASS, 1,346 files. |
| `bun run typecheck` | PASS, 19 tasks. Prisma generation completed before the final unit run. |
| `TC_SOURCE_GATES=1 bun run test` | PASS, 18 tasks and 4,001 tests, including 1,001 app tests and 36 auth tests. Unchanged package results reused Turbo cache after the earlier complete package runs. |
| `TC_SOURCE_GATES=1 bun run test:release-tools` | PASS, 28 files, 210 tests; five existing tests skipped. Includes 13 import-boundary tests. Local socket coverage ran with the required sandbox permission. |
| `bun run typecheck:release-tools` | PASS. |
| `bun run test:integration` | NOT VERIFIED, command failed during guarded setup. The configured database is remote; the command's localhost-only opt-in is rejected. |
| Explicit `row-level-security.integration.test.ts` with configured owner/app URLs | NOT VERIFIED, guarded setup failed; all 17 tests skipped. Same remote-target restriction. |
| Schema, migration and generated-source comparison with pre-task snapshot | PASS, no changes. No migration applied. |
| `git diff --check` | PASS. |

Both database URLs are present. Protected live-run manifest, run ID and live-mutation opt-in are absent. No guard was bypassed and no database fixture was allocated by these attempted integration runs. Browser sign-in, provider, background-worker deployment and production behaviour remain NOT VERIFIED.

The existing dirty naming-migration work is preserved. No reset, cutover, deployment, commit or merge was performed. Stopped for review.
