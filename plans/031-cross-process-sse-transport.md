# Plan 031: Make SSE notifications work across processes (replace the in-memory broker)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report, do not improvise. When done, update the status row for this plan in
> `plans/README.md` unless a reviewer dispatched you and told you they maintain
> the index.
>
> **This is the highest-risk plan in this batch. Step 0 is a transport-decision
> gate — do not start coding until it is resolved.**
>
> **Drift check (run first)**: `git diff --stat 123bbd8..HEAD -- packages/notifications/src/sse/broker.ts apps/api/app/api/notifications/stream/route.ts packages/notifications/src/dispatch.ts packages/notifications/src/notification-service.ts packages/jobs/src/handlers`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: MED-HIGH (touches every publish call site; cross-tenant leakage is
  the failure mode to avoid)
- **Depends on**: none
- **Category**: bug / architecture
- **Planned at**: commit `123bbd8`, 2026-07-12

## Why this matters

The SSE notification broker is a **module-level in-memory `Map`**. The subscriber
(the `apps/api` stream route) and every publisher (Inngest job handlers in
`packages/jobs`, and `apps/app` server actions via `dispatch.ts` /
`notification-service.ts`) run in **different processes/serverless invocations**
in production. So the `Map` the publisher writes to is never the one the stream
is registered in: `publishNotificationEvent` finds no listener and returns
without delivering. The real-time in-app notification channel that PRODUCT.md
lists as a shipped capability delivers **nothing** in production; users see
notifications only on next page load. It works in single-process local dev, which
is why manual checks pass. This plan routes events through a shared out-of-process
transport so cross-process delivery actually happens.

## Current state

- The in-memory broker — `packages/notifications/src/sse/broker.ts`:

```ts
const listeners = new Map<string, Set<Listener>>();
export function streamKey(input: { organisationId: string; userId: string }): string {
  return `${input.userId}:${input.organisationId}`;
}
export function subscribeToNotificationStream(input, listener): () => void { /* adds to Map */ }
export function publishNotificationEvent(input, event): void { /* Map.get(streamKey).forEach(listener) */ }
export function publishOrganisationNotificationEvent(input, event): void { /* iterate keys ending :orgId */ }
```

- The single subscriber — `apps/api/app/api/notifications/stream/route.ts:91`
  calls `subscribeToNotificationStream({ organisationId, userId }, cb)` inside a
  `ReadableStream.start`, with a 25s keep-alive and cleanup on `cancel`.

- Publishers (all separate processes from the stream route):
  - `packages/notifications/src/dispatch.ts:118`, `notification-service.ts:235,278`
    (called from `apps/app` server actions).
  - `packages/jobs/src/handlers/sync-xero-leave-records.ts:914`,
    `sync-xero-leave-balances.ts:665`, `sync-xero-people.ts:510`,
    `reconcile-xero-approval-state.ts:668` (Inngest invocations).
  - Find them all: `grep -rn "publishNotificationEvent\|publishOrganisationNotificationEvent" packages apps | grep -v test`.

- A working out-of-process store already exists: the feeds package speaks a
  Redis-compatible REST API via `KV_REST_API_URL` / `KV_REST_API_TOKEN`
  (`packages/feeds/src/cache/feed-cache.ts:112-175` — a thin `fetch`-based command
  client supporting `get`/`set`/`del`/`scan`). **Important**: this REST protocol
  does **not** support a blocking `SUBSCRIBE`, so a classic Redis pub/sub
  subscriber is not available over it. The viable REST-compatible design is a
  **capped Redis Stream per channel that the SSE route polls** (default below).

- The event type `NotificationSseEvent` and channel key
  `streamKey = ${userId}:${organisationId}` are already defined and must be
  preserved (the SSE route serialises `event.type` + `event.payload`).

- Conventions: `packages/notifications` owns SSE; per the security baseline, SSE
  is per-user and per-Clerk-Organisation and **must not leak notifications across
  `clerk_org_id`/`organisationId` boundaries**. Tests co-located
  (`broker.test.ts`).

## Commands you will need

| Purpose   | Command                                                                 | Expected on success |
|-----------|-------------------------------------------------------------------------|---------------------|
| Typecheck | `bun run typecheck`                                                      | exit 0              |
| Unit test | `bunx vitest run packages/notifications/src/sse/broker.test.ts`          | all pass            |
| Lint      | `bun run check`                                                          | exit 0              |

## Suggested executor toolkit

- Use Context7 for the Upstash Redis REST command set (`XADD`, `XRANGE`,
  `EXPIRE`, `MAXLEN`) and confirm they are available over the REST client before
  building the default design.

## Scope

**In scope**:
- `packages/notifications/src/sse/broker.ts` — replace the in-memory transport.
- A new `packages/notifications/src/sse/redis-stream.ts` (or similar) — the
  REST-based stream client (model it on `feed-cache.ts`'s `createRestCacheClient`).
- `apps/api/app/api/notifications/stream/route.ts` — poll the stream instead of
  registering an in-memory listener.
- All publish call sites (they may need `await`/`void` if the publisher becomes
  async): `dispatch.ts`, `notification-service.ts`, and the four job handlers.
- `packages/notifications/index.ts` — the package root re-exports the broker API
  (`subscribeToNotificationStream`, `listenerCount` at index.ts:32, the publish
  functions); update the re-exports to match the new surface.
- Tests: `broker.test.ts`.

**Out of scope**:
- The event shape `NotificationSseEvent` and `streamKey` format.
- Notification creation/preferences logic.
- The email queue worker (plan 030).

## Git workflow

- Base branch: `preview` — all development lands on `preview`, not `main`. Create this branch from `preview` and, if you merge, merge back into `preview`. Earlier-numbered plans in this batch also land on `preview` first, so the drift-check diff may legitimately include their changes; treat a mismatch as a STOP condition only when it is not explained by an earlier plan's documented scope.
- Branch: `improve/031-sse-cross-process-transport`
- Conventional commits (e.g. `fix(notifications): deliver SSE events across processes via Redis stream`).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 0: Transport decision (GATE — resolve before coding)

Confirm the production deployment's Redis capability:
- If only the REST API (`KV_REST_API_*`) is available (most likely — that is what
  feeds uses), implement the **default design**: a capped Redis Stream per
  channel, polled by the SSE route (Steps 1-4).
- If a pub/sub-capable Redis (TCP) is available and preferred, that is an
  acceptable alternative, but it changes Steps 1-4. **If you find evidence the
  deployment intends TCP pub/sub, STOP and report** so the maintainer can choose;
  do not silently pick a transport that needs infra you cannot confirm.

Record the decision in the PR description. Proceed with the default unless told
otherwise.

### Step 1: Build the REST stream client

Create a small client (model on `feed-cache.ts:130-175`) exposing:
- `append(channel: string, event: NotificationSseEvent): Promise<void>` →
  `XADD <channel> MAXLEN ~ 100 * payload <json>` then `EXPIRE <channel> <ttl>`
  (e.g. 300s) so idle channels self-clean.
- `readSince(channel: string, lastId: string): Promise<{ id: string; event: NotificationSseEvent }[]>`
  → `XRANGE <channel> (<lastId> +` (exclusive), returning parsed events with their
  stream ids.

Degrade gracefully when `KV_REST_API_*` is absent (both-or-neither, like feeds):
`append` no-ops, `readSince` returns `[]`. Channel key = `sse:${streamKey(input)}`
for per-user, and for the org-wide publish, fan out to all active user channels —
see Step 3.

**Verify**: `bun run typecheck` → exit 0.

### Step 2: Reimplement the broker over the stream client

- `publishNotificationEvent(input, event)` → `await append(sse:${streamKey(input)}, event)`.
  Change the return type to `Promise<void>`.
- `subscribeToNotificationStream` is removed/replaced: expose instead an async
  generator or a `pollChannel(input, sinceId)` the route can call. Keep
  `streamKey` unchanged.
- `listenerCount` has no meaning without an in-memory registry. It is only used
  by `broker.test.ts` (verify: `grep -rn "listenerCount" packages apps | grep -v broker`);
  remove it and its `index.ts` re-export, and replace the tests that used it
  (Step 6).
- Preserve strict channel scoping: a user's channel key includes **both** userId
  and organisationId, so a poll never reads another org's events. Add an
  assertion/test for this (the security-critical invariant).

**Verify**: `bun run typecheck` → the compiler flags publisher call sites (async
now) and the route (Step 3-4).

### Step 3: Handle the org-wide publish

`publishOrganisationNotificationEvent({ organisationId }, event)` currently
fans out to every in-memory listener whose key ends `:${organisationId}`. Over a
stream there is no in-memory listener registry. Resolve org membership to
recipient user ids and `append` to each `sse:${userId}:${organisationId}`
channel. Get the recipient set the same way the notification service already
determines org recipients (find how sync handlers currently decide who to notify
org-wide — `grep -n "publishOrganisationNotificationEvent" -B20` at each job call
site to see what user/person set is in scope). If the job only has an
`organisationId`, query active people's `clerk_user_id` for that org
(tenant-scoped) and append per user. **Never** write to a shared org channel that
a different org could read.

**Verify**: `bun run typecheck` → exit 0 for the broker.

### Step 4: Poll from the SSE route

In `stream/route.ts`, replace the `subscribeToNotificationStream` registration
with a poll loop inside the `ReadableStream`: track `lastId`, and on an interval
(e.g. every 2s) call `readSince(channel, lastId)`, enqueue each event as
`event: <type>\ndata: <json>`, and advance `lastId`. Initialise `lastId` to a
connect-time position — note `$` is XREAD syntax and does NOT work with XRANGE;
use a timestamp-based stream id instead (e.g. `` `${Date.now()}-0` ``, since
Redis stream ids are `<unix-ms>-<seq>`), or read the channel's current last id
once at connect via `XREVRANGE <channel> + - COUNT 1`. Keep
the existing 25s keep-alive comment frames and the `cancel`/closed-controller
cleanup (clear the poll interval there). Preserve the existing 403-on-wrong-org
guard and CORS handling.

**Verify**: `bun run typecheck` → exit 0.

### Step 5: Update publisher call sites

Every `publishNotificationEvent`/`publishOrganisationNotificationEvent` caller
must handle the now-async signature. In fire-and-forget contexts keep them
non-blocking with `void publishNotificationEvent(...)` **or** `await` where the
surrounding code is already async and ordering matters (job handlers are async —
prefer `await` there so failures are logged). Ensure none throw uncaught (wrap in
try/catch + `log.error` if a publish failure should not fail the job).

**Verify**: `bun run typecheck` → exit 0; `grep -rn "publishNotificationEvent\|publishOrganisationNotificationEvent" packages apps | grep -v test` — every site compiles against the new signature.

### Step 6: Tests

Rewrite `broker.test.ts` against a mocked stream client:
1. An event appended to a user channel is read back by a poll of that same
   channel.
2. **Cross-tenant isolation**: an event for `user:orgA` is NOT returned when
   polling `user:orgB` (same user id, different org) — the security invariant.
3. Org-wide publish appends to each member's channel and to no other org's.
4. Graceful degradation: with the stream client unconfigured, publish no-ops and
   poll returns `[]` without throwing.

**Verify**: `bunx vitest run packages/notifications/src/sse/broker.test.ts` → all pass.

## Test plan

- Cases in Step 6 (round-trip, cross-tenant isolation, org fan-out, degradation).
- Structural pattern: the existing `broker.test.ts`; mock the REST stream client
  the way `feed-cache.test.ts` mocks its cache client.
- Verification: the vitest command in Step 6 → all pass; `bun run check`.

## Done criteria

ALL must hold:

- [ ] The broker no longer relies on a module-level in-memory `Map` for cross-process delivery
- [ ] `grep -n "new Map" packages/notifications/src/sse/broker.ts` returns nothing (or only a non-transport use you can justify)
- [ ] The SSE route polls the shared transport and preserves the org 403 guard + keep-alive + cleanup
- [ ] A test asserts cross-tenant channel isolation (same user id, different org → no leak)
- [ ] `bun run typecheck` exits 0
- [ ] `bunx vitest run packages/notifications/src/sse/broker.test.ts` passes
- [ ] `bun run check` exits 0
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Step 0 reveals the deployment expects TCP pub/sub, or the REST client cannot do
  `XADD`/`XRANGE` (then the transport choice needs a maintainer decision).
- Org-wide fan-out cannot determine the recipient user set from tenant-scoped
  data at a job call site (report which site).
- Any excerpt in "Current state" does not match live code (drift).
- You cannot prove cross-tenant isolation in a test — do not ship a transport
  whose isolation you cannot demonstrate.

## Maintenance notes

- Reviewer must scrutinise channel-key construction everywhere: the security
  baseline forbids leaking notifications across `clerk_org_id`/`organisationId`.
  Every `append` and every `readSince` must use a key containing both ids.
- Poll latency (~2s) is the tradeoff for REST compatibility; if sub-second
  latency is later required, revisit with a pub/sub-capable Redis.
- Idle channels rely on the `EXPIRE`; confirm the TTL exceeds the keep-alive so an
  active-but-quiet stream does not lose its channel mid-connection.
- This plan and plan 030 together restore the notification delivery layer (SSE +
  email). A reviewer landing both should smoke-test that an approval triggers both
  an in-app event and a queued email.
