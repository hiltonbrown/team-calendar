# Plan 020: Replace Clerk pricing table fallback with static catalogue-driven pricing cards

## Plan
- [x] Step 1: Create `apps/web/app/pricing/constants.ts`
  - [x] Add MARKETING_PLANS details matching the plan catalogue.
  - [x] Add prominent cross-reference comment to `packages/database/src/seed/plans.ts`.
- [x] Step 2: Replace `apps/web/app/pricing/components/pricing-plans.tsx`
  - [x] Rewrite the component to use the new static card rendering.
  - [x] Remove Clerk auth imports, fallback observer, and skeleton code.
  - [x] Verify types with `bun run typecheck`.
- [x] Step 3: Implement pricing cards layout and styles in CSS in `apps/web/app/styles/features.css`
  - [x] Remove/replace the `.fmkt-plan-skeleton` styling blocks (lines 2354-2415).
  - [x] Replace `.fmkt-plan-skeleton` with `.fmkt-pricing-cards` in the responsive rules.
  - [x] Append styles for `.fmkt-pricing-cards`, `.fmkt-pricing-card`, and their sub-elements (badge, checkmark, highlight, typography).
- [x] Step 4: Add cross-reference comments in `packages/database/src/seed/plans.ts` at line 12.
- [x] Step 5: Verification and build checks
  - [x] Run `bun run check`.
  - [x] Run `bun run typecheck`.
  - [x] Run `bun run build`.
- [x] Step 6: Smoke test with dev server
  - [x] Start marketing dev server: `cd apps/web && bun run dev`.
  - [x] Run curl check: `curl -s http://localhost:3001/pricing | grep -E "Starter|Premium|Enterprise|Basic"`.
  - [x] Stop the dev server.
- [x] Step 7: Commit changes
  - [x] Verify `git status`.
  - [x] Commit with message: `feat(marketing): replace Clerk table with static pricing cards` on branch `subagent-Pricing-Cards-Executor-self-f76d9138`.

## Review
- Created `apps/web/app/pricing/constants.ts` with the static plans definitions.
- Rewrote `apps/web/app/pricing/components/pricing-plans.tsx` to render the static plans and links, completely removing all Clerk-dependencies, hooks, and fallback code.
- Cleaned up obsolete skeleton styles in `apps/web/app/styles/features.css` and added grid layout for the static pricing cards, integrating with mobile responsive rules and branding colors.
- Added cross-reference comments linking `packages/database/src/seed/plans.ts` and `apps/web/app/pricing/constants.ts` for future synchronization.
- Verified codebase compiles successfully with `bun run check`, `bun run typecheck`, and `bun run build`.
- Ran dev server and verified page contents match the static plans ("Basic", "Premium", "Enterprise").
- Committed all modifications to the workspace worktree.
