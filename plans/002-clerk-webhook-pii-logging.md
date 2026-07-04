# Plan 002: Stop logging the full Clerk webhook body (PII) in the auth webhook

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report, do not improvise. When done, update the status row for this plan
> in `plans/README.md` unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 8790bdb..HEAD -- apps/api/app/webhooks/auth/route.ts`
> If the file changed since this plan was written, compare the "Current
> state" excerpt against the live code before proceeding; on a mismatch,
> treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `8790bdb`, 2026-07-02

## Why this matters

The Clerk auth webhook logs the entire verified webhook body on every delivery. Clerk user events carry email addresses, first and last names, avatar URLs, phone numbers, and organisation membership details, so this PII is persisted into the structured log pipeline (and Sentry breadcrumbs where attached) on every user or membership change. The project's own security baseline (CLAUDE.md, "Security baseline") requires data minimisation: no raw payloads in logs. One log statement violates it.

## Current state

- `apps/api/app/webhooks/auth/route.ts` - Clerk (svix) webhook handler. Svix signature verification happens at lines 306-317, Zod shape validation for consumed event types at lines 322-331, then:

```ts
// apps/api/app/webhooks/auth/route.ts:333-336
  // Get the ID and type
  const { id } = event.data;

  log.info("Webhook", { id, eventType, body });
```

`body` here is the full JSON string of the webhook payload (line 298: `const body = JSON.stringify(payload)`), needed for svix verification and legitimately used there. The only problem is logging it.

Other log calls in this file are fine and must not change: `log.error("Error verifying webhook:", { error })` at line 313, the Zod-issues error log at lines 325-328, and the member-linking failure log at lines 267-273 (ids only).

Repo conventions: `log` from `@repo/observability/log` (already used); Australian English; no em dashes.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `bun run typecheck` | exit 0 |
| Lint | `bun run check` | exit 0 |
| API app tests | `cd apps/api && NODE_ENV=test bunx vitest run` | all pass |

## Scope

**In scope**:

- `apps/api/app/webhooks/auth/route.ts` (one log statement)
- `plans/README.md` (status row)

**Out of scope** (do NOT touch):

- The svix verification flow and the `body` variable itself; verification needs the exact raw string.
- The analytics `identify` calls in the handlers (lines 90-130). They intentionally send profile fields to the analytics platform; that is a product decision, not a logging accident. Leave them.
- `apps/api/app/webhooks/payments/route.ts` (covered by plan 001).

## Git workflow

- Branch: `preview` (shared branch for all plans; implement sequentially in plan-number order on top of the previous plan's commits)
- Commit message: `fix(api): log Clerk webhook id and type only, not the full body`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Reduce the log payload

Replace line 336:

```ts
log.info("Webhook", { id, eventType, body });
```

with:

```ts
// Log identifiers only. The verified body contains PII (emails, names,
// phone numbers) and must never reach the log pipeline.
log.info("Webhook received", { id, eventType });
```

**Verify**: `bun run typecheck` → exit 0. `bun run check` → exit 0 (this also confirms `body` is still used by the svix call, so no unused-variable lint fires; if lint reports `body` unused, something else changed: STOP).

### Step 2: Confirm no other full-body logging exists in the route

Run: `grep -n "body" apps/api/app/webhooks/auth/route.ts` and confirm `body` appears only in its definition (line ~298) and the `webhook.verify(body, ...)` call (line ~307).

**Verify**: the grep output shows no `log.` line containing `body`.

## Test plan

No new test file. This route's testability is poor without a svix-signed fixture, and the change is a single log statement guarded by the grep-based done criterion below. Run the existing suite to confirm nothing regressed: `cd apps/api && NODE_ENV=test bunx vitest run` → all pass.

## Done criteria

- [ ] `bun run typecheck` exits 0
- [ ] `bun run check` exits 0
- [ ] `grep -n "log.info(\"Webhook\", { id, eventType, body })" apps/api/app/webhooks/auth/route.ts` returns no matches
- [ ] `grep -nE "log\.(info|warn|error)\(.*body" apps/api/app/webhooks/auth/route.ts` returns no matches
- [ ] `cd apps/api && NODE_ENV=test bunx vitest run` passes
- [ ] `git status` shows only the in-scope files modified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back if:

- Line 336 no longer matches the excerpt (drift).
- You find the body being logged anywhere else in `apps/api` while doing step 2's grep; report the locations rather than expanding scope silently.

## Maintenance notes

- If webhook debugging ever needs payload visibility, add a redacted-fields logger in `packages/observability` rather than reintroducing raw-body logging here.
- Reviewer check: the diff should be exactly one log statement plus a comment.
