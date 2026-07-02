# Plan 009: Dispatch the feed_token_rotated notification when an admin rotates a feed token

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report, do not improvise. When done, update the status row for this plan
> in `plans/README.md` unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 8790bdb..HEAD -- apps/app/app/\(authenticated\)/feeds/_actions.ts packages/feeds/src/tokens/token-service.ts packages/notifications/src`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S-M
- **Risk**: LOW-MED (touches a live admin action; notification failure must not break rotation)
- **Depends on**: none
- **Category**: direction (closes a defined-but-dead notification type)
- **Planned at**: commit `8790bdb`, 2026-07-02

## Why this matters

Rotating a feed token is a security action that silently breaks every subscribed calendar: the old URL starts returning 410 and nobody is told. The notification system already anticipates this: the type `feed_token_rotated` is fully defined in the registry (label, icon, email template name, action label) and the in-app notification bell already renders a case for it (`apps/app/components/notifications/bell.tsx:267`). But nothing anywhere dispatches it (verified by grep across apps and packages at commit 8790bdb: the only non-generated references are the registry entry and the bell's render case). This plan wires the dispatch into the rotation action so the acting admin, and the notification centre, get a durable record with a link back to the feed, closing the loop the registry designed for.

## Current state

- `packages/notifications/src/types/notification-type-registry.ts:139-150` - the registry entry:

```ts
  {
    type: "feed_token_rotated",
    label: "Feed token rotated",
    shortLabel: "Token rotated",
    iconKey: "key-round",
    description: "A calendar feed token has been rotated.",
    defaultChannels: { inApp: true, email: true },
    supportsActionUrl: true,
    userFacingCategory: "system",
    emailTemplate: "FeedTokenRotated",
    actionLabel: "Open feed",
  },
```

  Caution: `emailTemplate: "FeedTokenRotated"` names a template that a repo-wide grep at 8790bdb finds nowhere else. Step 1 investigates whether that string maps to a real template; the answer changes step 3.

- `apps/app/app/(authenticated)/feeds/_actions.ts:125-157` - `rotateTokenAction`: parses input, `resolveAdminContext(organisationId)` (yields `role`, `userId`, `clerkOrgId`, `organisationId`), calls `rotateToken({...})` from the feeds package, then `revalidateFeedPaths(feedId)` and returns `{ hint, plaintext, tokenId }`. This server action is the ONLY live rotation entry point: `apps/api/app/api/feeds/[feedId]/rotate-token/route.ts` is a 405 stub returning "Rotate feed tokens from the authenticated app."
- `packages/feeds/src/tokens/token-service.ts` - `rotateToken` implementation (rotation lineage via `rotated_from_token_id` on `feed_tokens`).
- Dispatch exemplar - `packages/availability/src/plans/submit-service.ts:604-640` (`notifyManager`): builds a call to `dispatchNotification({ actionUrl, actorUserId, clerkOrgId, organisationId, objectId, objectType, body, recipientPersonId, recipientUserId, title, type }, tx)` and treats a failed Result as an error. Note it passes a transaction handle; the rotation action has no transaction, so check `dispatchNotification`'s signature for the non-tx form.
- Recipient reality check: there is no membership table (Clerk-managed), so "notify all org admins" requires Clerk API calls. This plan scopes recipients to the acting admin (a durable record of the security action with the feed link). Broader fan-out is an open question recorded in Maintenance notes.

Repo conventions: Result pattern for service errors; notification failure must not fail the parent action silently NOR break it (log at error level, still return rotation success: the token HAS rotated); Australian English; no em dashes; tests co-located.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `bun run typecheck` | exit 0 |
| Lint | `bun run check` | exit 0 |
| Notifications tests | `cd packages/notifications && NODE_ENV=test bunx vitest run` | all pass |
| App tests | `cd apps/app && NODE_ENV=test bunx vitest run` | all pass |
| Full unit tests | `bun run test` | exit 0 |

## Scope

**In scope**:

- `apps/app/app/(authenticated)/feeds/_actions.ts` (dispatch after successful rotation)
- A co-located test for the action (create, e.g. `apps/app/app/(authenticated)/feeds/_actions.test.ts`; if server-action testing proves impractical in this app, see step 4's alternative)
- `packages/email` / `apps/email` ONLY IF step 1 shows the email leg requires a `FeedTokenRotated` template to exist and its absence throws (see STOP conditions)
- `plans/README.md` (status row)

**Out of scope** (do NOT touch):

- `packages/notifications/src/types/notification-type-registry.ts` - the entry is already correct.
- `packages/feeds/src/tokens/token-service.ts` - rotation logic is correct; dispatch belongs in the action layer where actor context lives, matching where `revalidateFeedPaths` already sits.
- `apps/api/app/api/feeds/[feedId]/rotate-token/route.ts` - the 405 stub stays.
- Token rotation history UI on the feed detail - deferred (Maintenance notes).
- `revokeTokenAction` - same pattern, but out of scope; note it as follow-up.

## Git workflow

- Branch: `advisor/009-feed-token-rotation-notification`
- Commit message: `feat(app): notify on feed token rotation`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Trace the email leg before writing anything

Read `packages/notifications/src/dispatch.ts` (and `email-queue-service.ts` if dispatch delegates to it) and answer: when `dispatchNotification` runs for a type whose registry entry has `emailTemplate: "FeedTokenRotated"`, what happens if no template by that name exists? Three possible worlds: (a) template strings resolve lazily and unknown names fail soft (log/skip), (b) unknown names throw at dispatch time, (c) templates are looked up from a map in `packages/email` and `FeedTokenRotated` is simply missing from it. Record which world you are in.

**Verify**: you can state, with file:line evidence, what happens on dispatch with a missing template. If world (b) and adding a template is required, confirm the template addition is small (mirror an existing template like the `sync_failed` one); if it is not small, STOP and report.

### Step 2: Dispatch from rotateTokenAction

In `apps/app/app/(authenticated)/feeds/_actions.ts`, after `rotateToken` succeeds and before returning:

- Build the action URL the same way the feed detail is linked elsewhere in this file or in the feed components (find the existing feed-detail path helper; likely `withOrg`-style; match it).
- Call `dispatchNotification` with: `type: "feed_token_rotated"`, `title` like "Feed token rotated", `body` naming the feed (fetch or thread the feed name if the action already has it; if not available cheaply, use a body without the name rather than adding a query), `actorUserId: context.value.userId`, `recipientUserId: context.value.userId`, `recipientPersonId: null` (unless the action context provides a person id), `clerkOrgId` and `organisationId` from context, `objectId: parsed.data.feedId`, `objectType: "feed"`, `actionUrl` from above. Match the exemplar call shape in `packages/availability/src/plans/submit-service.ts:615-636` and the non-tx signature found in step 1.
- On a failed Result from dispatch: `log.error` (import the observability logger as done elsewhere in `apps/app`) with feedId and error, and continue to return rotation success. The rotation has already happened; the notification is best-effort.

**Verify**: `bun run typecheck` → exit 0. `bun run check` → exit 0.

### Step 3: Email template (only if step 1 found world (b) or (c) with a hard failure)

If dispatch would throw or hard-fail on the missing `FeedTokenRotated` template, add a minimal template mirroring the structure of an existing notification email template (locate the `sync_failed` template named `SyncFailed` in the registry; copy its file structure, wiring, and export style exactly). Content: feed name/hint, when it was rotated, and the instruction that subscribers need the new feed URL; do NOT include the token plaintext or the full feed URL containing the token in the email. If step 1 found fail-soft behaviour, skip this step and record in the report that the email leg silently no-ops until a template is added (and add that to Maintenance notes as follow-up).

**Verify**: `bun run typecheck` → exit 0; `bun run test` → exit 0.

### Step 4: Test the dispatch

Create a co-located test for `rotateTokenAction` mocking `@repo/feeds` (`rotateToken` returns ok), the admin-context resolver, `dispatchNotification`, and navigation/revalidation helpers, asserting: (a) on success, `dispatchNotification` is called once with `type: "feed_token_rotated"`, the acting user as recipient, and the feedId as `objectId`; (b) when `dispatchNotification` returns a failed Result, the action still returns ok and logs an error; (c) when `rotateToken` fails, `dispatchNotification` is NOT called. If mocking the server-action module's imports proves impractical (Next.js "use server" constraints under Vitest), the fallback is to extract the dispatch into a small exported helper in the same file and unit-test the helper with the same three cases; keep the helper in `_actions.ts`.

**Verify**: `cd apps/app && NODE_ENV=test bunx vitest run <new test file>` → 3 tests pass. Then `bun run test` → exit 0.

## Test plan

Covered in step 4 (three cases). Pattern references: mock-then-import style from `packages/billing/src/stripe.test.ts`; dispatch call shape from `packages/availability/src/plans/submit-service.ts:604-640`. Plus `bun run test` for the monorepo.

## Done criteria

- [ ] `grep -rn "feed_token_rotated" apps/app/app --include="*.ts"` shows the dispatch in `_actions.ts`
- [ ] `bun run typecheck` exits 0 and `bun run check` exits 0
- [ ] New tests pass; `bun run test` exits 0
- [ ] Rotation still succeeds when dispatch fails (test case b proves it)
- [ ] No token plaintext or tokened URL appears in any notification title, body, or email content (review your diff for `plaintext`)
- [ ] `git status` shows only in-scope files modified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back if:

- `rotateTokenAction` no longer matches the excerpt (drift).
- Step 1 shows dispatch hard-fails on missing templates AND adding the template requires more than mirroring an existing one (e.g. a template registry rebuild).
- `dispatchNotification` has no non-transactional form and threading a transaction into the action would mean restructuring `rotateToken`; that is out of scope.
- You find rotation entry points other than `rotateTokenAction` (the API route stub aside); report them rather than wiring dispatch into multiple paths ad hoc.

## Maintenance notes

- Follow-ups deliberately deferred: (1) same dispatch for `revokeTokenAction`; (2) broader recipient fan-out to all org admins (needs a Clerk membership query strategy; decide once, reuse for other admin-facing types); (3) a token rotation history panel on the feed detail using `rotated_from_token_id` lineage; (4) if step 3 was skipped due to fail-soft behaviour, the `FeedTokenRotated` email template still needs creating for the email channel to actually fire.
- Reviewer check: the notification must never contain the plaintext token; the action returns it to the UI once, and that must remain the only place it appears.
