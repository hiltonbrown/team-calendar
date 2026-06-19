# Plan: Fix Local Build and Runtime Environment Variables

## Plan

- [ ] Copy valid `DATABASE_URL` and Clerk keys from `apps/api/.env.local` to `apps/app/.env.local`
- [ ] Set public URL environment variables to their localhost ports (`NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_WEB_URL`, `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_DOCS_URL`) in both `apps/app/.env.local` and `apps/web/.env.local`
- [ ] Comment out any optional environment variables that are set to `""` in `apps/app/.env.local` and `apps/web/.env.local` to prevent validation failures
- [ ] Run `bun run check` to verify linting and typechecking
- [ ] Run `bun run build` to verify the build succeeds for all workspace apps
- [ ] Document the verification and results in `tasks/todo.md`
- [ ] Capture any lessons in `tasks/lessons.md`

## Review
- Verification results and lesson summaries will be recorded here upon completion.

# Plan: Restore Package Typecheck Gate

## Plan

- [x] Delegate plan 006 execution and inspect the STOP condition.
- [x] Keep the safe config edits from plan 006: root `typecheck` runs `turbo typecheck`, and `@repo/typescript-config` has no empty typecheck task.
- [x] Fix only type/config errors surfaced by the widened gate, without runtime behaviour changes.
- [x] Run `bunx turbo typecheck --dry-run=json` to confirm package coverage.
- [x] Run `bun run typecheck`.
- [x] Run `bun run check`.
- [x] Update `plans/README.md` and this review section with the result.

## Review

- Worker stopped because widened typecheck surfaced latent package errors. Continuing with scoped type/config-only fixes.
- `bunx turbo typecheck --dry-run=json` exits 0 and lists `@repo/*` package typecheck tasks.
- `bun run typecheck` exits 0 with the widened `turbo typecheck` gate.
- `bun run check` exits 0.
- `plans/README.md` now marks plan 006 as DONE.
