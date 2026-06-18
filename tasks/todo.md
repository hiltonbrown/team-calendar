# Plan: Marketing Website Impeccable Audit

## Plan

- [x] Load impeccable audit guidance, register guidance, PRODUCT.md, DESIGN.md, and current lessons.
- [x] Inspect the marketing app structure, tokens, CSS, and representative pages/components.
- [x] Run static checks for accessibility, responsive, theming, performance, and anti-pattern risks.
- [x] Run local build/browser verification where practical.
- [x] Write the audit report as Markdown in `plans/`.
- [x] Document verification results here.

## Review

- Created `plans/019-marketing-website-impeccable-audit.md`.
- `node /home/hilton/.agents/skills/impeccable/scripts/detect.mjs --json apps/web/app apps/web/src`: passed with no detector findings (`[]`).
- `bun run typecheck` from `apps/web`: passed.
- `bun run build` from `apps/web`: failed with existing invalid local env values, then failed without `VERCEL_PROJECT_PRODUCTION_URL`, then passed with valid local public URLs, a dummy syntactically valid `RESEND_TOKEN`, and `VERCEL_PROJECT_PRODUCTION_URL=localhost:3001`.
- Browser screenshot, Lighthouse, Playwright, and axe verification were not run because no Playwright/axe/Lighthouse dependency is installed in this repository.

---

# Previous Plan: Review Open GitHub Issues and Finalise Fixes

## Plan

- [x] Resolve repository and list all open GitHub issues.
- [x] Compare open issues against `plans/README.md` and current `main`.
- [x] Check whether each issue has corresponding implementation on `main`.
- [x] Run verification gates for the implemented fixes.
- [x] Close completed GitHub issues with a concise result note.
- [x] Document the review result here.

## Issue Review

Open issues reviewed:

- #57, Plan 001: Add lint and typecheck gates to CI.
- #58, Plan 002: Serve 304 Not Modified from the ICS feed endpoint and decouple cache writes.
- #59, Plan 003: Make Xero token decryption fail closed.
- #60, Plan 004: Restrict SSE CORS and guard the keep-alive loop.
- #61, Plan 005: Pin latest dependency versions and raise the Node engine floor.
- #62, Plan 006: Batch per-feed people and teams queries in the feed list.
- #63, Plan 007: Stop `listPeople` fetching the whole organisation and counting per person.
- #64, Plan 008: Serialise concurrent Xero token refreshes per connection.
- #65, Plan 009: Add characterisation tests for `reconcile-xero-approval-state`.
- #66, Plan 010: Add feed token service tests.
- #67, Plan 011: Move implementation code out of the availability package barrel.

`plans/README.md` marks all eleven as DONE, and the corresponding implementation commits are present on `main`.

## Verification

- `bun run check`: passed, 630 files checked with no fixes applied.
- `bun run typecheck`: passed for `app`, `api`, and `web`.
- `bun run test`: passed, 9 Turbo test tasks successful from cache.
- `bun run test:integration`: could not run in this local environment because `DATABASE_URL` is unset; the database integration suites fail env validation before registering tests.
- `gh issue list --repo hiltonbrown/leavesync --state open --limit 100`: confirmed zero open issues after closure.

## Review

- Issues #57 through #67 were already implemented on `main` and marked DONE in `plans/README.md`.
- Closed #57, #58, #59, #60, #61, #62, #63, #64, #65, #66, and #67 as completed on GitHub.
- No production source changes were needed in this pass.

## Env Sync

- Pulled Vercel development envs for `leavesync-api`, `leavesync-app`, and `leavesync-web`.
- Development envs for `app` and `web` were incomplete, so production env snapshots were pulled to `/tmp` and used to populate the ignored local `.env.local` files.
- Wrote only `DATABASE_URL` from the API env into `packages/database/.env`, which is the file Prisma and the integration tests load.
- Confirmed `DATABASE_URL` is present in `apps/app/.env.local`, `apps/api/.env.local`, `apps/web/.env.local`, and `packages/database/.env`.
- Did not run DB-backed integration tests against these values because they are production Vercel envs, not a known disposable test database.
