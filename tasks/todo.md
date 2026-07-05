# Plan: Execute and Verify Plan 020 - Implement Static Pricing Cards

## Tasks
- [x] Create isolated git worktree and branch for the executor subagent
- [x] Spawn the executor subagent to run Plan 020
- [x] Review the executor's output and verify scope compliance (`git diff --stat`)
- [x] Run verification commands in the worktree:
  - [x] `bun run check`
  - [x] `bun run typecheck`
  - [x] `bun run build` (Passed after copying `.env.local` to resolve validation issues)
- [x] Start dev server on port 3001 and run curl check:
  - [x] Start: `cd apps/web && bun run dev` (expect port 3001)
  - [x] Curl check: `curl -s http://localhost:3001/pricing | grep -E "Starter|Premium|Enterprise|Basic"`
  - [x] Confirm pricing cards are visible and contain no Clerk billing components/imports
  - [x] Stop dev server and verify port 3001 is free
- [x] Present implementation to the user for merging
- [x] Update plan status to `DONE` in `plans/README.md`
- [x] Update `tasks/todo.md` with review notes

## Review
- **Scope Compliance**: The only files modified by the executor are `apps/web/app/pricing/components/pricing-plans.tsx`, `apps/web/app/pricing/constants.ts`, `apps/web/app/styles/features.css`, and `packages/database/src/seed/plans.ts`.
- **Code Quality**: The changes compile, type-check, and satisfy project lint rules. The component uses the new constants cleanly, uses standard Next.js `<Link>`, and has no remaining references to Clerk Billing.
- **Visuals**: CSS styles for pricing cards look complete, utilizing proper grid columns and clean styles matching Design tokens (forest green highlight colors, correct borders, Outfit / Plus Jakarta Sans fonts).
- **Smoke Tests**: Verified rendering of "Basic", "Premium", and "Enterprise" static plans on the local dev server.
