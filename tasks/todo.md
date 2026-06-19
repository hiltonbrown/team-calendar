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
