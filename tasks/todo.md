# Plan 012: Authorise manual availability mutations by actor and person

## Tasks
- [x] Drift check and git verification
- [x] Step 1: Add actor-aware authorisation in `manual-records-service.ts`
- [x] Step 2: Pass Clerk org role from server actions and API routes
- [x] Step 3: Add service, action, and route regression tests
- [x] Run targeted verification for the touched slice
- [x] Run repo-level verification required by the plan
- [x] Update `plans/README.md` status row and review notes

## Review
- Centralised manual-availability mutation authorisation in the availability package using actor metadata and direct-manager/self/admin-owner checks.
- Threaded Clerk `orgRole` through app actions and API routes, including the single-record PATCH and DELETE route, and mapped `not_authorised` service failures to HTTP 403.
- Added focused regression coverage for service rules, server-action passthrough, and API-route 403 handling.
- Verification passed: targeted Vitest slice, `bun run check`, `bun run typecheck`, and `bun run test`.
- Repo-level typecheck was initially blocked by a stale Bun workspace link in `packages/xero/node_modules/@repo`; `bun install` refreshed the declared `@repo/availability` symlink without manifest changes.
