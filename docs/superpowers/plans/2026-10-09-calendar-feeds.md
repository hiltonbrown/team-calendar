# Calendar Feeds Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This document authorises no execution in the planning turn.

**Goal:** Turn `/feeds` into a subscribe-first page for every role with one-click provider links and self-service personal and team feeds, give feed owners full control on the detail page, and give admins a feed oversight list in `/settings/feeds`.

**Architecture:** Permission widening and richer list data in `packages/feeds` (owner concept from existing `created_by_user_id` plus `self`/`manager_team` scope). A pure recommendation function and a pure provider-link builder in `apps/app`. `/feeds` is rebuilt from smaller components; `/settings/feeds` gains a filtered, paginated oversight list. No schema change.

**Tech Stack:** Existing Bun, Next.js App Router, TypeScript, Prisma 7, Clerk, Zod, Vitest, `@repo/design-system`, `@repo/analytics`. No new dependencies.

**Spec:** [Calendar feeds page design](../specs/2026-10-09-calendar-feeds-design.md). Read it, `AGENTS.md` (Feed rules), `DESIGN.md` and `.impeccable.md` first. Inspected base: `402af6f`.

## Global constraints

- Feed URLs are shown in full, never masked, truncated or replaced with hints. Copy uses the exact displayed URL.
- No subscriber counts. "Last fetched" is the latest `last_used_at` across active tokens.
- `/feeds` has no filters, row menus or "New feed" button. Lifecycle actions live only on `/feeds/[feedId]`.
- Personal feeds are created on request only; one active or paused personal feed per creator, one team feed per manager.
- Owner: every scope is `self` or `manager_team` and `created_by_user_id` = acting user. Owners get rename, privacy, public holidays, pause, resume, rotate, archive. Restore stays admin only.
- Every query filters by `clerk_org_id` and `organisation_id`. Services return `Result`; Zod on all input.
- Stale threshold: 30 days.
- Australian English, no em or en dashes. WCAG 2.2 AA, 3px focus ring. Radii and tonal layering per `DESIGN.md`.
- CI gates: `bun run check`, `bun run typecheck`, `bun run test`, `bun run test:integration`.

## Review focus

1. **Privilege escalation through create or update.** A non-admin submits an `org`, `team` or `person` scope, or adds a second scope to their personal feed, or edits an `org` feed they created while an admin and have since been demoted (`isFeedOwner` must be false because the scope is `org`). Service must reject; tests pin each (Task 1).
2. **Duplicate personal feeds** from a double click or two tabs. Creation must return the existing feed (Task 1).
3. **Manager loses direct reports.** Their team feed keeps rendering only themselves; "Create my team feed" disappears; existing feed stays owned and manageable (Tasks 1, 4).
4. **Deep link breaks** for a provider. Button must still lead somewhere useful (copy and open fallback) and the URL field remains visible (Task 3).
5. **Admin on `/feeds`** must not lose access to management: "Manage all feeds" link present; detail pages keep admin controls (Tasks 4, 5).

## Execution and verification conventions

Sequential tasks, each with its own red/green cycle and commit. Package tests: `NODE_ENV=test bunx vitest run --config tooling/vitest.config.mts <files>`; app tests: `cd apps/app && NODE_ENV=test bunx vitest run <files>`. Integration tests need a local disposable database and `ALLOW_LOCAL_DATABASE_TESTS=1`. Stage only each task's files.

## File responsibilities

| File | Responsibility |
|---|---|
| `packages/feeds/src/scope/feed-ownership.ts` (new) | `isFeedOwner`, `canCreateFeedScopes` |
| `packages/feeds/src/feed-service.ts` | Widened permissions, idempotent self-service create, richer list items, `type` filter |
| `apps/app/lib/feeds/recommend-feed.ts` (new) | Pure recommended-feed selection |
| `apps/app/lib/feeds/provider-links.ts` (new) | Pure provider deep-link builder |
| `apps/app/components/feed/your-calendar.tsx` (new) | Recommended feed block with provider buttons, URL field, manual instructions |
| `apps/app/components/feed/feed-provider-buttons.tsx` (new) | Provider buttons and popover variant |
| `apps/app/components/feed/other-feeds-list.tsx` (new) | Compact rows |
| `apps/app/app/(authenticated)/feeds/page.tsx`, `_actions.ts` | Rebuilt page; self-service actions; owner-aware lifecycle actions |
| `apps/app/components/feed/feed-detail.tsx`, `feeds/[feedId]/page.tsx` | Owner rights, provider buttons |
| `apps/app/app/(authenticated)/settings/feeds/*` | Oversight list with filters and pagination |
| Removed from `/feeds`: `feed-filter-bar.tsx`, `FeedTable` usage, `SubscribeInstructions` top panel | Superseded |

---

### Task 1: Ownership and self-service in `packages/feeds`

**Files:**
- Create: `packages/feeds/src/scope/feed-ownership.ts`, `feed-ownership.test.ts`
- Modify: `packages/feeds/src/feed-service.ts` (`createFeed` ~215, `updateFeed` ~386, `pauseFeed`/`resumeFeed` ~481, `archiveFeed` ~487, `listFeeds` ~571, token rotation path), its schemas, `packages/feeds/index.ts`
- Test: `packages/feeds/src/feed-service.test.ts`, `packages/feeds/index.integration.test.ts`

**Interfaces:**
- Produces:
  - `isFeedOwner(feed: { createdByUserId: string | null; scopes: { scopeType: FeedScopeType }[] }, actingUserId: string): boolean`
  - `canCreateFeedScopes(input: { role: FeedRole; scopes: FeedScopeInput[]; actingPersonId: string | null; hasDirectReports: boolean }): Result<"admin" | "self_service", FeedServiceError>`
  - `createOwnFeed(input: { clerkOrgId; organisationId; actingUserId; actingRole; kind: "personal" | "team" }): Promise<Result<{ feedId: string; created: boolean }, FeedServiceError>>`: idempotent; default names per spec section 6; privacy and holidays from organisation settings.
  - `FeedListItem` gains `scopeTypes: FeedScopeType[]`, `createdByUserId: string | null`, `createdByName: string | null`, `lastFetchedAt: Date | null`, `isOwnedByActor: boolean`.
  - `ListFeedsSchema.filters.type?: Array<"org" | "team" | "person" | "self" | "manager_team">`.

- [ ] **Step 1:** Write failing tests: non-admin creating `org`, `team`, `person`, or two scopes → `not_authorised`; non-admin without person → `validation_error` with link message; `team` kind without direct reports → `not_authorised`; second `createOwnFeed` returns `{ created: false }` with same id; archived personal feed does not block a new one; owner can update privacy, pause, resume, rotate, archive own feed; owner cannot restore; non-owner non-admin cannot update another person's personal feed; admin can update any feed; an admin's own `org` feed has `isOwnedByActor: false`; `lastFetchedAt` is max across active tokens only; `type` filter; cross-tenant isolation.
- [ ] **Step 2:** Run and confirm failure.
- [ ] **Step 3:** Implement. Replace `isAdminOrOwner` gates on the listed operations with `isAdminOrOwner(role) || isFeedOwner(feed, actingUserId)`, loading the feed's scopes and creator inside the same scoped query. Wrap `createOwnFeed` lookup and insert in a transaction with a row-level lock on the acting person to serialise double submits.
- [ ] **Step 4:** Green; commit `feat(feeds): allow personal and team feed self-service`.

### Task 2: Recommendation and provider link helpers

**Files:**
- Create: `apps/app/lib/feeds/recommend-feed.ts`, `recommend-feed.test.ts`, `apps/app/lib/feeds/provider-links.ts`, `provider-links.test.ts`

**Interfaces:**
- Produces:
  - `recommendFeed(feeds: FeedListItem[], actingUserId: string): { recommended: FeedListItem | null; others: FeedListItem[]; ownPausedFeed: FeedListItem | null }`
  - `buildProviderLinks(input: { subscribeUrl: string; feedName: string }): { apple: string; google: string; outlookWeb: string; outlookDesktop: string }`

- [ ] **Step 1:** Tests: priority order from spec section 5; paused and archived never recommended; own paused feed reported; ties among org feeds pick oldest; `others` excludes the recommended feed and archived feeds. Links: `https` and `http` both convert to `webcal://`; Google and Outlook parameters are URL-encoded; names with spaces, ampersands and non-ASCII encode correctly; the original URL is never altered other than scheme.
- [ ] **Step 2:** Before implementing, confirm current Google and Outlook add-by-URL formats with Context7 or provider documentation; record the source in a code comment.
- [ ] **Step 3:** Implement; green; commit `feat(app): add feed recommendation and provider links`.

### Task 3: Subscribe components

**Files:**
- Create: `apps/app/components/feed/feed-provider-buttons.tsx`, `your-calendar.tsx`, `other-feeds-list.tsx`, co-located tests
- Reuse: `subscribe-url-field.tsx`, manual instruction copy from `subscribe-instructions.tsx` (extract to `subscribe-instruction-copy.ts`)

**Interfaces:**
- Produces:
  - `<FeedProviderButtons feedName subscribeUrl variant="block" | "popover" onProviderClick?={(provider) => void} />`
  - `<YourCalendar feed={FeedListItem | null} createActions={{ personal: boolean; team: boolean }} ownPausedFeed hasLoadError linkBlocked={boolean} />`
  - `<OtherFeedsList feeds={FeedListItem[]} orgQueryValue />`

- [ ] **Step 1:** Tests: three buttons render with correct hrefs; Outlook desktop item present; status message after click; full URL visible and copy writes the exact URL; clipboard failure shows the select-and-copy fallback; empty, load-error, link-blocked and paused-own-feed states; other-feed rows show no URL, show "Paused, not updating", link to detail, and "Add" opens a popover with the same providers; accessible names include the feed name.
- [ ] **Step 2:** Read the impeccable craft floor and `DESIGN.md`; implement with design-system components; frost only on the popover.
- [ ] **Step 3:** Green; commit `feat(app): add subscribe-first feed components`.

### Task 4: Rebuild `/feeds`

**Files:**
- Modify: `apps/app/app/(authenticated)/feeds/page.tsx`, `_actions.ts`, `_actions.test.ts`
- Delete: `apps/app/app/(authenticated)/feeds/feed-filter-bar.tsx` and its test if present; remove `FeedTable` and top-level `SubscribeInstructions` usage (delete the components if no other consumer remains, after a repo-wide search)

**Interfaces:**
- Consumes: Task 1 `listFeeds`, `createOwnFeed`; Task 2 helpers; Task 3 components.
- Produces: `createOwnFeedAction({ organisationId, kind })` returning `{ feedId }`; lifecycle actions now resolve "admin or owner" instead of admin only.

- [ ] **Step 1:** Tests: page renders header with "Manage all feeds" only for admins; no filters, no menus, no "New feed"; create buttons follow person link and direct-report rules; after `createOwnFeedAction` the page refreshes and focuses the "Your calendar" heading; lifecycle actions accept an owner and reject others.
- [ ] **Step 2:** Implement. One `listFeeds` call (active and paused) replaces the two existing calls. Capture `Feed Subscribe Clicked`, `Feed URL Copied`, `Personal Feed Created`.
- [ ] **Step 3:** Green; commit `feat(app): make feeds a subscribe-first page`.

### Task 5: Detail page owner rights

**Files:**
- Modify: `apps/app/app/(authenticated)/feeds/[feedId]/page.tsx`, `@modal/(.)[feedId]/page.tsx`, `apps/app/components/feed/feed-detail.tsx`, `feed-detail.test.tsx`

- [ ] **Step 1:** Tests: owner sees rename, privacy, public holidays, pause/resume, rotate, archive; owner does not see restore or scope editing; non-owner member sees read-only; admin unchanged; provider buttons render beside the URL; preview modes for owners follow the admin preview set for their own feed only.
- [ ] **Step 2:** Implement `canManage = isAdmin || item.isOwnedByActor` passed from the page; keep confirmations.
- [ ] **Step 3:** Green; commit `feat(app): give feed owners control of their feeds`.

### Task 6: `/settings/feeds` oversight

**Files:**
- Modify: `apps/app/app/(authenticated)/settings/feeds/page.tsx`, `feeds-client.tsx`, tests
- Create: `apps/app/app/(authenticated)/settings/feeds/_schemas.ts` (filter schema), `feed-oversight-list.tsx`, test

- [ ] **Step 1:** Tests: header shows total and personal counts as text; "New feed" link; filters for search, status (default active and paused) and type round-trip through URL params; rows show name, type, created by ("Administrator" when no person), status, last fetched relative with exact date in `title` and visually hidden text; "Never fetched" and "Not fetched in 30 days" flags with icon and text, suppressed for paused and archived; cursor pagination at 50; empty and filtered-empty states.
- [ ] **Step 2:** Implement using `parseFilterParams` and the existing cursor pattern. Remove the old "All feeds" card.
- [ ] **Step 3:** Green; commit `feat(app): add feed oversight to settings`.

### Task 7: Onboarding plan alignment, docs and verification

**Files:**
- Modify: `docs/superpowers/plans/2026-10-09-onboarding.md` Task 8 (reuse `createOwnFeedAction`), `ScreenCatalogue.md` (S-13, S-14, S-21), `tasks/todo.md` review section

- [ ] **Step 1:** Update docs to match shipped behaviour.
- [ ] **Step 2:** Run the four CI gates; fix anything red.
- [ ] **Step 3:** Run the app and verify at desktop and mobile widths, light and dark: viewer with no person; employee creating a personal feed and subscribing via each provider button; manager creating a team feed; owner pausing and rotating own feed; admin on `/feeds` and `/settings/feeds` with filters and stale flags. Record evidence and limits in `tasks/todo.md`.
- [ ] **Step 4:** Commit `docs: record calendar feeds changes and verification`.
