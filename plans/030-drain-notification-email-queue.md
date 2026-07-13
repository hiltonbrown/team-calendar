# Plan 030: Add a worker that drains `notification_email_queue` and sends via Resend

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report, do not improvise. When done, update the status row for this plan in
> `plans/README.md` unless a reviewer dispatched you and told you they maintain
> the index.
>
> **Drift check (run first)**: `git diff --stat 123bbd8..HEAD -- packages/notifications/src/email-queue-service.ts packages/jobs/src/functions.ts packages/email/index.ts packages/email/templates/notification.tsx packages/database/prisma/schema.prisma`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW (additive; no existing behaviour changes)
- **Depends on**: none
- **Category**: bug / direction
- **Planned at**: commit `123bbd8`, 2026-07-12

## Why this matters

The email notification channel is enqueue-only. `enqueueNotificationEmail` writes
rows into `notification_email_queue` with `status = queued`, the schema models a
full send lifecycle (`status`/`attempts`/`sent_at`/`last_error`), the React Email
template exists, and the Resend client exists — but **nothing consumes the
queue**. The registered Inngest functions are all event-triggered syncs; none
drain the queue, and the only cron is `keep-alive`. So every queued notification
email is dead-lettered: users who enable email notifications receive nothing, and
the table grows unbounded. README/PRODUCT promise a working email channel. This
plan adds the missing consumer.

## Current state

- The queue table (all fields the worker needs already exist):

```prisma
// packages/database/prisma/schema.prisma (NotificationEmailQueue)
model NotificationEmailQueue {
  id String @id @default(uuid()) @db.Uuid
  clerk_org_id String
  organisation_id String @db.Uuid
  notification_id String? @db.Uuid
  recipient_user_id String
  notification_type notification_type
  email_template String
  recipient_email String
  title String
  body String
  action_url String?
  unsubscribe_url String
  merge_data Json?
  status notification_email_status @default(queued)
  attempts Int @default(0)
  last_error String?
  queued_at DateTime @default(now())
  sent_at DateTime?
  ...
  @@index([status, queued_at])   // already indexed for the drain query
  @@map("notification_email_queue")
}
// enum notification_email_status { queued  sent  failed }
```

- The enqueue side (do NOT change it) — `packages/notifications/src/email-queue-service.ts`
  exports `enqueueNotificationEmail`. Add the drain/send logic to this same file.

- The template (props are exactly what the queue row carries):

```tsx
// packages/email/templates/notification.tsx
interface NotificationEmailTemplateProps {
  readonly actionUrl: string | null;
  readonly body: string;
  readonly title: string;
  readonly unsubscribeUrl: string;
}
export const NotificationEmailTemplate = ({ actionUrl, body, title, unsubscribeUrl }) => ( ... );
```

- The transport — `packages/email/index.ts`:

```ts
import { Resend } from "resend";
import { keys } from "./keys";
const { RESEND_TOKEN } = keys();
export const resend = RESEND_TOKEN ? new Resend(RESEND_TOKEN) : undefined; // undefined when no token
```

  `@react-email/render` (v2) is a dependency of `packages/email`. The sender
  address env var is `RESEND_FROM` (per CLAUDE.md env table), and
  `packages/email/keys.ts` exposes it as **optional**
  (`RESEND_FROM: z.string().email().optional()`, keys.ts:7), same as
  `RESEND_TOKEN`. The send helper must therefore no-op with a clear error when
  **either** the token or the sender address is unset — never throw.

- Inngest function pattern (event-triggered example — you will use a **cron**
  trigger instead):

```ts
// packages/jobs/src/handlers/recount-usage.ts:55
export const recountUsageFunction: InngestFunction.Any = inngest.createFunction(
  { id: "recount-usage", triggers: { event: "recount-usage" } },
  async ({ event, step }) => await step.run("recount-usage", async () => recountUsage(event.data))
);
```

- Registration — `packages/jobs/src/functions.ts` lists all functions in the
  `functions` array; `apps/api/app/api/inngest/route.ts` serves that array
  automatically. Adding to the array is all that is needed to register.

- Inngest version is `^4.12.1`. **Confirm the cron trigger shape** (expected
  `triggers: { cron: "*/2 * * * *" }`, matching the singular-object `triggers`
  used by existing functions) using Context7 (`use context7` for "Inngest
  createFunction cron trigger") before writing it.

- Conventions: `packages/notifications` owns notification logic incl. email
  dispatch via Resend; `packages/jobs` owns Inngest handlers; service functions
  return `Result`; tests co-located Vitest. Jobs carry `clerk_org_id` +
  `organisation_id` — but a queue-drain worker is org-agnostic (it processes all
  orgs' queued rows), which is acceptable because each row already carries its own
  tenant ids and recipient; the worker never uses session context.

## Commands you will need

| Purpose   | Command                                                                 | Expected on success |
|-----------|-------------------------------------------------------------------------|---------------------|
| Typecheck | `bun run typecheck`                                                      | exit 0              |
| Unit test | `bunx vitest run packages/notifications/src/email-queue-service.test.ts` | all pass            |
| Lint      | `bun run check`                                                          | exit 0              |

## Suggested executor toolkit

- Use Context7 for the Inngest cron trigger shape and for Resend
  `emails.send` + idempotency-key usage before writing them.

## Scope

**In scope**:
- `packages/notifications/src/email-queue-service.ts` — add
  `sendQueuedNotificationEmails(...)` (select batch → render → send → transition
  status). Reuse the existing file.
- `packages/email/index.ts` (or a new `packages/email/send.ts`) — add a
  `renderNotificationEmail`/`sendNotificationEmail` helper that renders the
  template to HTML and calls `resend.emails.send`, if you prefer to keep the
  React-render + Resend call inside `@repo/email`. (Either location is fine;
  pick one and keep the Resend call out of `packages/jobs`.)
- `packages/jobs/src/handlers/send-notification-emails.ts` (create) — the Inngest
  cron function that calls `sendQueuedNotificationEmails`.
- `packages/jobs/src/functions.ts` — register the new function.
- Tests: `packages/notifications/src/email-queue-service.test.ts`.

**Out of scope**:
- `enqueueNotificationEmail` behaviour — unchanged.
- Notification *preferences* logic — the enqueue side already respects
  preferences; the worker sends whatever is queued.
- The SSE broker (that is plan 031).
- README/PRODUCT wording (becomes true once this lands; optional doc touch-up may
  be a separate trivial commit).

## Git workflow

- Branch: `improve/030-notification-email-worker`
- Conventional commits (e.g. `feat(notifications): drain notification_email_queue and send via Resend`).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add the send helper in `@repo/email`

Add a helper that renders `NotificationEmailTemplate` to HTML (via
`@react-email/render`'s `render`) and sends through the existing `resend` client:

```ts
// packages/email/send.ts (or extend index.ts)
import { render } from "@react-email/render";
import { NotificationEmailTemplate } from "./templates/notification";
import { resend } from "./index";
import { keys } from "./keys";

export async function sendNotificationEmail(input: {
  to: string; title: string; body: string;
  actionUrl: string | null; unsubscribeUrl: string; idempotencyKey: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const from = keys().RESEND_FROM; // optional in keys.ts — must be guarded
  if (!(resend && from)) {
    return { ok: false, error: "Resend transport is not configured" };
  }
  const html = await render(NotificationEmailTemplate({
    actionUrl: input.actionUrl, body: input.body, title: input.title, unsubscribeUrl: input.unsubscribeUrl,
  }));
  const result = await resend.emails.send(
    { from, to: input.to, subject: input.title, html },
    { idempotencyKey: input.idempotencyKey },
  );
  return result.error ? { ok: false, error: result.error.message } : { ok: true };
}
```

Use the queue row id as `idempotencyKey` so a retry or overlapping cron run never
double-sends the same email. Confirm the exact Resend send signature and
idempotency-key option via Context7.

**Verify**: `bun run typecheck` → exit 0.

### Step 2: Add `sendQueuedNotificationEmails` to the notifications service

In `email-queue-service.ts`, add a function that:
1. Selects up to `BATCH_SIZE` (e.g. 50) rows with `status: "queued"` ordered by
   `queued_at` ascending (the `[status, queued_at]` index serves this).
2. For each row: call `sendNotificationEmail({ to: recipient_email, title, body,
   actionUrl: action_url, unsubscribeUrl: unsubscribe_url, idempotencyKey: id })`.
3. On success: `update` the row to `status: "sent"`, `sent_at: new Date()`,
   `attempts: { increment: 1 }`.
4. On failure: `update` `attempts: { increment: 1 }`, `last_error: <message>`, and
   set `status: "failed"` when `attempts + 1 >= MAX_ATTEMPTS` (e.g. 5); otherwise
   leave it `queued` for the next run.
5. Return a `Result` summarising `{ processed, sent, failed }`.

Guard the whole thing so a single row's send failure does not abort the batch
(wrap per-row in try/catch and continue). Use the observability logger for
failures (`import { log } from "@repo/observability/log"`).

**Verify**: `bun run typecheck` → exit 0.

### Step 3: Add the Inngest cron function and register it

Create `packages/jobs/src/handlers/send-notification-emails.ts`:

```ts
import type { InngestFunction } from "inngest";
import { sendQueuedNotificationEmails } from "@repo/notifications";
import { inngest } from "../client";

export const sendNotificationEmailsFunction: InngestFunction.Any =
  inngest.createFunction(
    { id: "send-notification-emails", triggers: { cron: "*/2 * * * *" } },
    async ({ step }) =>
      await step.run("send-notification-emails", async () =>
        sendQueuedNotificationEmails()
      )
  );
```

Confirm `sendQueuedNotificationEmails` is exported from `packages/notifications`
root (`packages/notifications/index.ts`) — add the export if missing. Register
`sendNotificationEmailsFunction` in `packages/jobs/src/functions.ts` (import +
add to the `functions` array).

Overlapping runs: a slow batch can still be in flight when the next cron fires,
and two runs would select the same `queued` rows. The Resend idempotency key
(row id) is the primary double-send guard; additionally set the Inngest
function's concurrency limit to 1 (confirm the exact option shape for inngest
`^4.12.1` via Context7 alongside the cron trigger) so runs cannot overlap at
all.

**Verify**: `bun run typecheck` → exit 0.

### Step 4: Tests

In `email-queue-service.test.ts`, add cases (mock the DB client via the existing
`EmailQueueDatabase`-style injection, and mock `sendNotificationEmail`):
1. A queued row that sends successfully transitions to `sent` with `sent_at` set.
2. A send failure increments `attempts` and records `last_error`, staying
   `queued` below `MAX_ATTEMPTS`.
3. Reaching `MAX_ATTEMPTS` transitions to `failed`.
4. One row's failure does not prevent the others in the batch from sending.

**Verify**: `bunx vitest run packages/notifications/src/email-queue-service.test.ts` → all pass.

## Test plan

- New cases in Step 4 (success, transient failure retry, terminal failure, batch
  isolation).
- Structural pattern: the existing `enqueueNotificationEmail` tests in the same
  file, using the injected `EmailQueueDatabase` client for mocking.
- Verification: the vitest command in Step 4 → all pass; `bun run check`.

## Done criteria

ALL must hold:

- [ ] `sendQueuedNotificationEmails` exists in `packages/notifications` and is exported from its package root
- [ ] `send-notification-emails` Inngest function exists with a cron trigger and is in the `functions` array
- [ ] `grep -n "send-notification-emails" packages/jobs/src/functions.ts` matches
- [ ] Sends use the row id as a Resend idempotency key
- [ ] `bun run typecheck` exits 0
- [ ] Tests from Step 4 pass (success + retry + terminal + batch isolation)
- [ ] `bun run check` exits 0
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The Inngest cron trigger shape differs from `triggers: { cron: "..." }` for
  this version (report the correct shape).
- `packages/email/keys.ts` no longer exposes `RESEND_FROM` at all (report; the
  sender address is required to send). Note it being optional is expected — the
  helper guards it.
- The Resend send API does not accept an idempotency key in this SDK version
  (report; propose an alternative dedupe before proceeding).
- Any excerpt in "Current state" does not match live code (drift).

## Maintenance notes

- Reviewer: confirm the worker never sends when `resend` is undefined (no token
  configured) or `RESEND_FROM` is unset — it must no-op cleanly in those
  environments, not throw. Decide whether unconfigured-transport runs should
  leave rows `queued` (recommended, so they send once configured) rather than
  burning `attempts` toward `failed`.
- Cron cadence (`*/2`) is a starting point; tune against Resend rate limits and
  desired latency. The `[status, queued_at]` index keeps the drain query cheap.
- Deferred: a cleanup/retention job for old `sent`/`failed` rows, and surfacing
  `failed` emails in an admin view, are follow-ups, not part of this plan.
- Once this lands, the README/PRODUCT email-channel claim becomes true; a
  reviewer may pair a one-line doc confirmation.
