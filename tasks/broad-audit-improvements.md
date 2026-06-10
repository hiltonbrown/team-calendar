# LeaveSync: Further Improvement Suggestions

Date: 10 June 2026
Commit: df90cfe
Companion to: `tasks/broad-audit.md`

This file collects improvements that sit outside the audit's defect findings. Section A covers functional gaps discovered while preparing this list; they are not catalogued defects in the audit's eleven areas, but each one leaves a specced behaviour unimplemented and should be treated with near-launch urgency. Sections B to F are genuine enhancements, prioritised. Nothing here duplicates the audit's remediation plan; where an item touches an audit finding it references it instead.

---

## A. Functional gaps bordering on defects

### A1. No scheduled sync triggers exist

PRODUCT.md specifies the sync schedule: incremental inbound syncs every 15 minutes during business hours and every 60 minutes outside, leave balance sync every 60 minutes, and a nightly reconciliation. None of this is wired up.

- All six Inngest functions are event-triggered only, for example `triggers: { event: "sync-xero-people" }` (`packages/jobs/src/handlers/sync-xero-people.ts:54`); no function declares a cron trigger (`grep -rn "cron" packages/jobs/src` returns nothing).
- The only Vercel cron is a keep-alive ping (`apps/api/vercel.json:5-9`).

Today a sync runs only when an admin clicks "Run sync now" or immediately after connecting Xero. A connected organisation's data goes stale within hours and `reconcile-xero-approval-state` never runs at all unless manually dispatched.

Suggestion: add a scheduler. Either an Inngest cron function that fans out per active XeroTenant (querying unpaused tenants and emitting the existing `sync-xero-*` events with `clerkOrgId` and `organisationId`), or Vercel crons hitting a dispatch route. The fan-out approach keeps the per-org single-flight behaviour the rate limiter relies on (BLOCKED.md item D). Include the nightly `reconcile-feed-publications` and `reconcile-xero-approval-state` runs. Effort: medium.

### A2. The email queue is never drained

`dispatchNotification` enqueues rows into `notification_email_queue` via `enqueueNotificationEmail` (`packages/notifications/src/dispatch.ts:7`), and the table carries `status` (queued, sent, failed) and `attempts` columns (`schema.prisma:933-934`). But nothing sends them:

- No processor exists in `packages/jobs/src` or `apps/api` (`grep -rn "emailQueue\|email_queue" packages/jobs/src apps/api/app` returns nothing outside the enqueue path).
- The Resend transport in `packages/email` is imported only for env validation (`apps/api/env.ts:4`); no runtime code calls it.

Every transactional email the product promises (sync failure alerts, leave approved or declined, token rotation notices) is queued and silently never delivered.

Suggestion: add a `dispatch-notification-emails` Inngest job that drains queued rows in batches, renders the template named in `email_template` via `packages/email`, sends through Resend, increments `attempts`, and marks `sent` or `failed` with `last_error`. Respect a max-attempts ceiling and surface persistent failures as an admin notification. The `status, queued_at` index already supports the polling query (`schema.prisma:948`). Effort: medium.

### A3. Plan limits are displayed but not enforced

The schema defines `plans`, `plan_limits` (with `plan_limit_type`: `active_people`, `connections`, `feeds`, `organisations`), `clerk_org_subscriptions`, and `usage_counters`. `billing-service.ts` reads them and the dashboard displays usage (`packages/availability/src/dashboard/dashboard-service.ts`). But no create path checks a limit: `grep -rn "plan_limit" packages/availability/src packages/feeds/src apps/app/app` finds no enforcement call.

PRODUCT.md states billing, plan limits, and usage are enforced at the Clerk Organisation level. Currently a free-plan org can create unlimited feeds, people, and organisations.

Suggestion: add an `enforcePlanLimit(clerkOrgId, limitType)` helper in `packages/availability` (or a small billing module) that compares the live count against the subscribed plan's limit and returns a typed `Result` error; call it from the person, feed, organisation, and connection create paths. Pair with a friendly upgrade prompt in the UI. Effort: medium.

---

## B. Operations and CI

### B1. There is no CI pipeline

`.github/` contains Dependabot config, issue templates, and a PR template, but no `workflows/` directory. Nothing runs lint, typecheck, tests, or builds on pull requests; the audit's S4-01 blocker survived precisely because no pipeline ever ran `migrate deploy`.

Suggestion: add a single workflow running `bun install`, `bun run check`, a repo-wide typecheck (see B2), `bun run test`, and `bun run build` on PRs, plus the migrate-deploy-against-empty-Postgres step from audit Slice 1 once the baseline is adopted. Cache the Bun and Turbo stores. Effort: small.

### B2. No repo-wide typecheck task

`apps/app`, `apps/api`, and `apps/web` each have a `typecheck` script, but `turbo.json` defines no `typecheck` task and the root `package.json` has no script for it, so type errors in packages are only caught by `next build` or the editor. Suggestion: add a `typecheck` task to `turbo.json` (`dependsOn: ["^build"]` for generated Prisma types), a root script, and `typecheck` scripts to the packages that lack one. Effort: small.

### B3. No pre-commit hook

No husky or lefthook configuration exists. A one-line lefthook config running `ultracite fix` on staged files would keep formatting noise out of PRs and stop the kind of stray formatting error this audit found locally. Effort: small.

### B4. Alerting on sync and email failure rates

`sync_runs` and `failed_records` capture rich failure data, and Sentry is wired through `packages/observability`, but nothing alerts when failure counts climb; an admin must visit `/sync`. Suggestion: emit a structured Sentry event (or a metric) when a sync run completes `failed` or `partial_success`, and when `notification_email_queue` rows hit `failed` (after A2 lands), so operational drift is visible without polling the UI. Effort: small.

---

## C. Feed performance and protocol correctness

### C1. The ICS endpoint ignores conditional requests

The schema reserves `feeds.last_etag` (`schema.prisma:808`) and PRODUCT.md specifies caching the feed body by `feed_id + etag`, but the route returns a full 200 unconditionally with no `ETag` header (`apps/api/app/ical/[token]/route.ts:37-43`). Calendar clients poll aggressively (Outlook and Apple every few minutes per subscriber); every poll currently renders or fetches the full body.

Suggestion: emit `ETag` from the rendered feed's hash, honour `If-None-Match` with `304 Not Modified`, and update `last_used_at` on the token as the access trail. This is cheap and cuts the dominant request class to a header exchange. Effort: small.

### C2. Confirm the production KV store and enable caching

`KV_REST_API_URL` and `KV_REST_API_TOKEN` are optional both-or-neither (`packages/feeds/keys.ts`), so production may quietly run with feed caching disabled. Note also that Vercel KV is no longer offered as a first-party product; the equivalent is Upstash Redis via the Vercel Marketplace, which provisions the same `KV_REST_API_*` variables. Suggestion: provision the Marketplace store, set both variables in the production environment, and update the docs that still say "Vercel KV". Effort: small.

---

## D. Security hardening

### D1. Abuse protection on the public feed endpoint

`GET /ical/:token.ics` is unauthenticated by design and currently unthrottled. Token entropy makes brute force impractical, but a scraper can still drive unbounded render load, and the 404 versus 410 distinction confirms which tokens once existed. Suggestion: put a coarse per-IP rate limit in front of the route (Vercel WAF rate limiting suits this without adding code), and consider folding 410 into 404 for unrecognised callers if enumeration resistance matters more than client UX. Effort: small.

### D2. Key rotation tooling for Xero token encryption

`token_key_version` exists on `xero_connections` and `xero_oauth_sessions` (`schema.prisma:450,519`), so the schema anticipates rotation, but there is no script that re-encrypts rows under a new `XERO_TOKEN_ENCRYPTION_KEY`. Rotating the key today would orphan every stored token and force all organisations to reconnect. Suggestion: a `tooling/scripts` rotation script that decrypts with the old key, re-encrypts with the new, and bumps `token_key_version`, plus a documented runbook. Removing the legacy plaintext decrypt fallback (audit X5-02) becomes safe once this exists. Effort: medium.

### D3. Security headers

No CSP, HSTS, or frame-ancestors configuration is visible in `packages/next-config`. Suggestion: add a baseline header set (HSTS, `X-Content-Type-Options`, a report-only CSP to start) via the shared Next config so all three deployed apps inherit it. Effort: small.

---

## E. Developer experience

### E1. Seed tooling is documented but absent

PRODUCT.md's monorepo layout promises `tooling/seed`, `tooling/import`, and `tooling/scripts`; the directory contains only `vitest.config.mts`. New contributors have no way to stand up a populated local environment, and build order step 1 lists seed data as part of the first slice. Suggestion: a seed script that creates a demo Clerk-Org-shaped tenant (organisation, teams, locations, people, manual availability records, a feed with token) against a local database, using the existing test factories where possible. Effort: medium.

### E2. Coverage thresholds

The Vitest suites are healthy (all 9 tasks green) but no coverage thresholds are configured, so coverage can erode silently. Suggestion: enable `coverage` with modest per-package thresholds on the domain packages (`availability`, `feeds`, `xero`, `notifications`) only; UI coverage gates tend to cost more than they catch. Effort: small.

---

## F. Product polish (post-launch)

### F1. Annual public holiday refresh

`packages/availability/src/holidays/nager-client.ts` fetches from Nager.Date, but only the manual "Refresh from source" action invokes it. Each January, organisations will silently lack the new year's holidays until an admin remembers to click. Suggestion: a yearly (or quarterly) Inngest cron that re-fetches the next calendar year for every enabled `public_holiday_jurisdictions` row, preserving manual overrides and suppressions. Effort: small.

### F2. SSE client resilience

The notifications stream is held while the tab is active; serverless function time limits and network blips will sever it. Worth verifying the client reconnects with backoff and re-fetches the unread count on reconnect, so the bell badge cannot silently freeze. If `EventSource` default auto-reconnect is relied on, confirm the endpoint tolerates resumed connections cleanly. Effort: small.

### F3. Timed-event timezone correctness in ICS

`availability_records.all_day` defaults true, and all-day VEVENTs are timezone-safe, but timed manual entries (the not-all-day path in S-05) render DTSTART/DTEND that must be correct across the AU, NZ, and UK regions and their daylight saving transitions. Suggestion: add fixture tests in `packages/feeds` for timed events spanning DST boundaries in `Australia/Sydney`, `Pacific/Auckland`, and `Europe/London`, asserting either UTC instants or VTIMEZONE emission from `ical-generator`. Effort: small.

### F4. Durable daily Xero rate counter

Already flagged as audit X5-01 and BLOCKED.md item D; listed here only for sequencing. Once C2 lands, the same Redis store can hold the per-org rolling daily counter, which removes the main objection (adding a new infrastructure dependency to `packages/xero`). Effort: small once C2 is done.

---

## Suggested sequencing

1. A1 (scheduled syncs) and A2 (email drain): the product's stated behaviour depends on both.
2. B1 and B2 (CI plus typecheck): protects everything that follows, and is the natural home for the audit's migrate-deploy gate.
3. A3 (plan limit enforcement) before opening sign-ups beyond design partners.
4. C1 and C2 (ETag plus KV): before feed subscriber counts grow.
5. D1 to D3, E1, E2: steady-state hardening and DX.
6. F1 to F4: post-launch.
