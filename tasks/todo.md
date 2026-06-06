# Duplicate Manual-Record Guard

- [x] Branch from latest available local ref into `launch/06-duplicate-manual-guard` (environment has no `main` or `origin`).
- [x] Read authoritative references in `PRODUCT.md`, `launch-plan/REVIEW.md`, and the manual availability callers.
- [x] Locate the canonical manual availability create function in `packages/availability/index.ts` used by the manual callers.
- [x] Add an application-layer duplicate guard for manual records using `clerk_org_id`, `organisation_id`, `person_id`, `record_type`, identical `starts_at`, identical `ends_at`, and `source_remote_id IS NULL`.
- [x] Return a typed expected-failure `Result` error for duplicates, not a thrown error.
- [x] Surface duplicate failures cleanly through the app server action and API route.
- [x] Add co-located tests for duplicate rejection, non-duplicate acceptance, and different-organisation allowance.
- [x] Run verification: `bun install`, `bun run build`, `bun run check`, `bun run boundaries`, `bun run test`.
- [x] Review elegance and document outcomes.
- [x] Commit and create PR.

## Review

- Branch setup: requested `git checkout main && git pull origin main` could not run because this checkout has no local `main` ref and no configured `origin`; created `launch/06-duplicate-manual-guard` from the current local `work` ref.
- Duplicate definition used for this slice: same `clerk_org_id`, `organisation_id`, `person_id`, `record_type`, identical `starts_at`, identical `ends_at`, `source_type = "manual"`, and `source_remote_id IS NULL`.
- `packages/availability/index.ts`: `createManualAvailability` now checks for an existing matching manual record before insert and returns a `conflict` `Result` with a user-facing message.
- `apps/api/app/api/availability/route.ts`: create failures now map `bad_request`, `not_found`, and `conflict` to 400, 404, and 409 respectively instead of returning 500 for expected service failures.
- `packages/availability/index.test.ts`: added co-located unit coverage for duplicate rejection before insert, non-duplicate acceptance for different person/type/window, and allowance for identical records in a different organisation scope.
- Elegance review: the guard lives in the shared canonical service used by both app and API entry points, keeping the behaviour central and avoiding schema or migration changes.
- Verification:
  - `git diff --check`: passed.
  - `bun install`: blocked by registry 403 responses for package downloads.
  - `bun run --cwd packages/availability test`: blocked because `vitest` is not installed in `node_modules/.bin` after the failed install.
  - `bun run build`: blocked because `turbo` is not installed in `node_modules/.bin` after the failed install.
  - `bun run check`: blocked because `ultracite` is not installed in `node_modules/.bin` after the failed install.
  - `bun run boundaries`: blocked because `turbo` is not installed in `node_modules/.bin` after the failed install.
  - `bun run test`: blocked because `turbo` is not installed in `node_modules/.bin` after the failed install.
