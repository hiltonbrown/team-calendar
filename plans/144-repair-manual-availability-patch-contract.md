# Plan 144: Repair the manual availability PATCH contract

## Status

- Priority: P1
- Effort: S
- Risk: MED, omitted fields and privacy defaults must remain unchanged
- Confidence: HIGH
- Category: bug, test coverage
- Depends on: none
- Planned at: `ee8c410`, 2026-09-18
- Status: DONE

Implemented in `ac39c4e` and locally integrated into the release candidate as
`1000053`. Reviewer reruns passed 16 availability service tests and 32 API route
tests. The executor also passed check, typecheck and unit gates in its isolated
worktree. Database integration was not available in that worktree and remains a
final-candidate gate.

## Why this matters

Every authenticated, otherwise valid PATCH to `/api/availability/:recordId` fails because the route omits `personId`, which the service's full-record schema requires. The route then reports the validation failure as HTTP 500. Its partial-body contract is also incompatible with required dates/title and with defaults that would reset privacy and feed inclusion. The existing route suite mocks the service, so its successful PATCH test cannot detect this mismatch.

## Current state and drift check

Run `git diff --stat ee8c410..HEAD -- apps/api/app/api/availability packages/availability/src/records/manual-records-service.ts apps/api/__tests__/availability-routes.test.ts packages/availability/index.test.ts` and inspect any changed excerpts before implementation.

`packages/availability/src/records/manual-records-service.ts:28` declares a full input schema with required `personId`, `startsAt`, `endsAt`, `recordType`, and `title`; `privacyMode` defaults to `named`, `includeInFeed` to `true`. `updateManualAvailability` parses this before reading the existing record.

`apps/api/app/api/availability/[recordId]/route.ts` accepts optional mutable fields and passes them directly to that service without `personId`. It maps every non-authorisation failure to 500. The database query adapter returns only a subset of editable fields, so do not reconstruct a full record from that projection.

The canonical domain object is AvailabilityRecord. Database reads and mutations must carry both Clerk organisation and payroll Organisation scope. Preserve existing admin/owner/self/direct-manager authorisation, existing source-type restriction, publication materialisation and duplicate identity handling. Follow the service's Result pattern and Zod validation; no new dependency is needed.

## Scope

- `packages/availability/src/records/manual-records-service.ts`
- `packages/availability/index.test.ts`
- `packages/availability/index.integration.test.ts` if database assertions are needed
- `apps/api/app/api/availability/[recordId]/route.ts`
- `apps/api/app/api/availability/route.ts` only for shared nullable-input consistency
- `apps/api/__tests__/availability-routes.test.ts`
- New co-located test/helper files within those directories if necessary
- `plans/README.md` status update

No schema, Xero write logic, UI redesign, or new endpoint. Do not change the record's person through PATCH. Do not weaken privacy. Do not enable NZ/UK.

## Git workflow

Use an isolated local worktree/branch `fix/144-availability-patch`, preserve unrelated work, use a conventional `fix:` commit, and return the verified diff to the coordinator for authorised local merge. Do not push. If worktree creation is unavailable, report that concrete infrastructure limitation before proceeding with the coordinator's safe alternative.

## Steps

1. Add a failing regression in the existing service test harness that updates an existing record with only `{ title: "Changed" }`. Seed `privacy_mode: "private"`, `include_in_feed: false`, non-default all-day/contactability values and existing dates. The result must succeed and preserve every omitted field. Route tests must validate the payload with the real service contract or exercise the actual service with mocked database, rather than merely assert that a mocked update function resolves successfully.
   Verify: `bun run --cwd packages/availability test index.test.ts` should fail only for the new regression before implementation.
2. Introduce a dedicated patch schema without create defaults. Keep the full create schema for creation. Load and authorise the scoped existing record first, select the editable fields required for merged validation, merge only explicitly supplied values, and validate the final interval and title. Preserve null clearing for optional nullable text fields exposed by the route. Ignore/reject person changes consistently with existing service callers. Preserve existing full-record callers and duplicate checks. Update using both tenant keys, record ID and manual/active constraints so a stale initial read cannot broaden the mutation scope.
   Verify: `bun run --cwd packages/availability test index.test.ts` exits 0.
3. Align route and service contracts. Map bad_request to 400, conflict to 409, not_found to 404 and not_authorised to 403. Preserve unknown/internal 500. Return 400 for malformed JSON rather than leaking into the catch-all 500. Do not add a new required person ID to the partial route.
   Verify: `bun run --cwd apps/api test __tests__/availability-routes.test.ts` exits 0.
4. Run the repository gates below, inspect the complete diff, and request advisor review through the coordinator. Update plan state with actual evidence only.

## Test plan

Use `packages/availability/index.test.ts`'s database fake and `apps/api/__tests__/availability-routes.test.ts`'s authentication/tenant fixtures. Cover partial title update, partial date update with merged inverted range rejection, missing personId success, private/non-feed record preservation, null text clearing, unchanged full-input caller, source mismatch, cross-tenant denial, authorisation denial, duplicate conflict and malformed JSON 400. A regression must couple route payload to actual service validation.

## Done criteria

- `bun run --cwd packages/availability test index.test.ts` passes.
- `bun run --cwd apps/api test __tests__/availability-routes.test.ts` passes.
- `bun run check`, `bun run typecheck`, `bun run test`, and `bun run test:integration` exit 0 on the release candidate. Report environmental failures distinctly from successful verification.
- Diff contains no out-of-scope changes, preserves omitted privacy/feed fields and tenant predicates, and advisor review passes.

## STOP conditions

Report to the coordinator if existing callers require reassigning a record's person, if the endpoint was intentionally retired, if schema changes are needed, or if current code no longer matches the finding. Do not replace the API with 405 without a verified retirement decision.

## Maintenance

Keep create and partial-update input contracts separate. Future editable fields need explicit omission versus null semantics and preservation coverage. Mock-only route success tests are insufficient for the route/service contract.
