# LeaveSync: final pre-launch review

Read-only senior architect audit of the monorepo as it stands on disk at commit
`7e06ab8` (branch `claude/practical-pascal-EBKpT`, forked from `main`). Authoritative
reference is `PRODUCT.md`. Every claim cites a file path. Launch target is AU-only,
English-only, the core loop: connect Xero and inbound sync; leave submit, approve,
decline and withdraw with synchronous write-back; manual availability; one feed type
with privacy modes; the calendar and person read views.

No code, schema, migration or config was modified during this audit. The only files
created are the Markdown deliverables under `launch-plan/`.

---

## Executive summary

### Cleanup-and-upgrade landing check

| Expected artefact | Status |
|---|---|
| `cleanup/DEFERRED.md` | Present. Records the nine deferred screens. |
| `cleanup/BASELINE.md` | Present. Pre-cleanup baseline. |
| Forbidden packages removed (`ai`, `cms`, `collaboration`, `feature-flags`, `internationalization`, `payments`, `rate-limit`, `security`, `storage`, `webhooks`) | Confirmed gone as directories AND as `@repo/<name>` importers. `apps/web` has no `[locale]` tree and no i18n proxy. |
| `upgrade/INVENTORY.md` | **Absent.** There is no `upgrade/` directory and no `INVENTORY.md` anywhere. However the dependency upgrade itself is evidently in place: `next` 16.2.6, `react` 19.2.6, `prisma` / `@prisma/client` 7.8.0, `zod` 4.4.3, `ical-generator` 10.2.0 (`apps/app/package.json`, `packages/database/package.json`, `packages/feeds/package.json`). Treat the upgrade as landed but its inventory document as missing. |
| `main` builds | Conditional. `bun run check` (Ultracite) passes; ~338 unit tests pass. But `bun run build` is gated on `bun run test` (`turbo.json:8`, `build.dependsOn: ["^build", "test"]`), and `test` fails fast on DB-integration suites that need a live Neon database. See Deployment blockers. |

### Completion estimate

- **Launch core (AU-only core loop): roughly 75 to 80 percent.** The outbound half of the
  loop (submit, approve, decline, withdraw with Xero write-back), manual availability, SSE
  notifications, holidays, feed and token CRUD, and the calendar and person read views are
  implemented and largely tested. The incomplete parts are concentrated in the inbound and
  publishing halves: inbound leave normalisation (step 4) is not started, leave balance sync
  (step 5) is scaffold only, and the ICS publishing pipeline (step 12) emits raw row IDs as
  UIDs with a hardcoded SEQUENCE.
- **Full 16-step build order: roughly 70 percent.** Analytics (step 15) is deferred per
  launch scope with its domain services retained and tested. Several read-view slices are
  "implemented without tests".

### Three highest-severity gaps

1. **ICS UID and SEQUENCE are incorrect (step 12).** The renderer emits the raw
   `availability_records.id` as the VEVENT UID and hardcodes `SEQUENCE: 0`
   (`packages/feeds/src/render/render-feed.ts:91,93`). The stable `derived_uid_key`
   (correctly derived in `packages/availability/src/plans/plan-service.ts:1087-1101`) is
   never selected or emitted. This violates a PRODUCT non-negotiable ("Stable ICS UIDs
   derived from business identity, not provider IDs alone") and will cause calendar clients
   to duplicate or orphan events whenever a record changes. `availability_publications` is
   never materialised at runtime, so `published_sequence` never increments.
2. **The inbound half of the bidirectional loop is incomplete.** Step 4 (Xero leave inbound
   normalisation) has no handler at all (`packages/jobs/src/handlers/` holds only
   `sync-xero-people.ts` and `reconcile-xero-approval-state.ts`), and step 5 (leave balance
   sync) is a dispatcher scaffold that never writes `leave_balances`
   (`packages/availability/src/people/balance-refresh.ts`). Four of the six required Inngest
   jobs are missing. Without inbound sync, Xero-side leave never appears in LeaveSync.
3. **Build is gated on DB-integration tests, and two specified tables are missing.**
   `turbo.json` makes `build` depend on `test`, and the `test` task halts at
   `@repo/database` whose suites require a reachable Neon instance
   (`connect ECONNREFUSED 127.0.0.1:443`). A Vercel build with no database is therefore
   blocked. Separately, `Plan` and `PlanLimit` exist in neither the schema nor any migration
   despite `PRODUCT.md:302-303,406,426`, and `leave_balances.xero_tenant_id` is still
   `NOT NULL` against `PRODUCT.md:366`.

### Go / no-go for a first AU-only deploy

**Conditional no-go.** The hardest and most security-sensitive parts are in good shape:
tenant isolation is clean (no `clerk_org_id` or `organisation_id` scoping breaks were
found), package boundaries hold, Xero token encryption blocks boot when misconfigured, and
the outbound write path is correctly synchronous. The blockers are concrete and bounded:
fix the ICS UID and SEQUENCE pipeline, land inbound leave and balance sync, decouple the
production build from DB-integration tests, and close the schema-parity gaps. With the
prompt series in `launch-plan/prompts/` executed in order, this becomes a go.

---

## Build order status table

Status legend: not started / scaffolded / partial / implemented-no-tests / complete-with-tests / deferred-per-launch-scope.

| # | Step | Status | Justifying files | Remaining work |
|---|---|---|---|---|
| 1 | Org/people/team/location schema and seed (keyed by `clerk_org_id`) | partial | Models in `packages/database/prisma/schema.prisma` (Organisation:251, Team:318, Location:334, Person:353), all carry `clerk_org_id` + index; `packages/availability/src/people/people-service.test.ts` | No seed script exists (no `seed` entry in `packages/database/package.json`, no `*seed*` file). Step explicitly calls for seed data. |
| 2 | Xero OAuth + tenant persistence | complete-with-tests | `packages/xero/src/oauth/service.ts`; routes `apps/api/app/api/xero/oauth/{start,callback}/route.ts`; `packages/xero/src/crypto/tokens.ts` (+test) | None material for AU. |
| 3 | Xero employee sync (AU, NZ, UK) | complete-with-tests (AU); NZ/UK deferred | `packages/jobs/src/handlers/sync-xero-people.ts` (+test); `packages/xero/src/au/read.ts`; `packages/xero/src/read/dispatch.ts` (NZ/UK return "not yet available") | NZ/UK reads deferred per AU-only launch. |
| 4 | Xero leave inbound normalisation into `availability_records` | **not started** | Event name mapped at `packages/jobs/src/events.ts:8` but not registered; no handler file exists | Build the inbound fetch + normaliser writing `availability_records` (source_type xero leave), the `sync-xero-leave-records` handler, and registration. |
| 5 | Leave balance sync from Xero | **scaffolded** | `packages/availability/src/people/balance-refresh.ts` (dispatcher never set); `leave_balances` only ever read (`plan-service.ts:838`, `approval-service.ts:1042`, `people-service.ts:389`) | Implement Xero balance fetch + upsert; `sync-xero-leave-balances` handler + registration; wire `setBalanceRefreshDispatcher`. |
| 6 | Leave submission workflow | complete-with-tests | `packages/availability/src/plans/submit-service.ts` (+test); `apps/app/app/(authenticated)/plans/` | None material for AU. |
| 7 | Leave approval workflow | complete-with-tests | `packages/availability/src/approvals/approval-service.ts` (decline-reason enforced :418-430) (+test); `apps/app/app/actions/availability/approval.ts` | None material for AU. |
| 8 | Manual availability CRUD | implemented-no-tests (service) | `apps/app/app/actions/availability/manual.ts`; `apps/api/app/api/availability/route.ts` + `[recordId]/route.ts` | Confirm the duplicate-manual-record guard (PRODUCT non-negotiable) exists with a test; see Critical findings. |
| 9 | Public holidays (Nager, overrides, per-location) | complete-with-tests | `packages/availability/src/holidays/holiday-service.ts` (+test); `holidays/nager-client.ts` (+test); `apps/app/app/(authenticated)/public-holidays/` | Bulk import deferred per `cleanup/DEFERRED.md`. |
| 10 | SSE notifications + in-app delivery | complete-with-tests | `packages/notifications/src/sse/broker.ts` (per-user+per-org key); `apps/api/app/api/notifications/stream/route.ts` (+test) | None. |
| 11 | Feed model + token model | partial | `packages/feeds/src/feed-service.ts`; `packages/feeds/src/tokens/token-service.ts`; schema Feed/FeedToken/FeedScope/AvailabilityPublication | `availability_publications` never written at runtime; no tests for token-service. |
| 12 | ICS renderer (stable UID + privacy) | partial | `packages/feeds/src/render/render-feed.ts`; `packages/feeds/src/projection/feed-projection.ts` (privacy correct, at projection time) | Emit `derived_uid_key`, not raw IDs; handle Xero `stable_source_key`; materialise publications and increment `published_sequence`; add feeds tests. |
| 13 | Feed preview + detail UI (`/feeds/[feedId]`) | implemented-no-tests | `apps/app/app/(authenticated)/feeds/[feedId]/page.tsx`; `packages/feeds/src/preview/preview-service.ts` | Route path correct. Add tests. |
| 14 | Team calendar + person profile UI | implemented-no-tests | `apps/app/app/(authenticated)/calendar/page.tsx` (+test); `packages/availability/src/calendar/calendar-service.ts` (+test); `people/[personId]/page.tsx` | Person profile page untested (service tested). |
| 15 | Analytics: leave + out-of-office reports | deferred-per-launch-scope | Domain services retained and tested: `packages/availability/src/analytics/*` (+tests); UI routes removed per `cleanup/DEFERRED.md` | Re-enable routes post-launch. |
| 16 | Reconciliation jobs, sync health UI, audit reporting | partial | Sync health `apps/app/app/(authenticated)/sync/` + `packages/availability/src/sync/sync-monitor-service.ts` (+test); `packages/jobs/src/handlers/reconcile-xero-approval-state.ts`; audit `packages/availability/src/settings/audit-log-service.ts` (+test) | `reconcile-feed-publications` and `rebuild-feed-cache` jobs missing. Sync run detail and audit-log UI deferred. |

---

## Critical findings

### C1. ICS UID and SEQUENCE not derived from business identity (severity: critical)

- **Why it matters:** PRODUCT non-negotiable. Emitting `availability_records.id` as the UID
  and `SEQUENCE: 0` for every event means a record edit that produces a new row, or any
  re-key, creates a brand new calendar event rather than updating the existing one;
  subscribers see duplicates and stale entries. The deterministic UID exists but is unused.
- **Affected files:** `packages/feeds/src/render/render-feed.ts:91` (`id: event.sourceRecordId`),
  `:93` (`sequence: 0`); projection sets `sourceRecordId` from `record.id`
  (`packages/feeds/src/projection/feed-projection.ts:183`) and `holiday.id` (`:281`); the
  derived UID lives in `packages/availability/src/plans/plan-service.ts:1087-1101` and is
  stored on `availability_records.derived_uid_key:401` but never read by the renderer. The
  Xero `stable_source_key` branch (`PRODUCT.md:463-466`) is not implemented.
- **Exact fix:** project `derived_uid_key` into the preview event and use it as the VEVENT
  UID; materialise `availability_publications` and read `published_sequence` for SEQUENCE,
  incrementing it on material change; implement the Xero-record `stable_source_key`.
- **Regression tests required:** ICS serialisation, UID generation (Xero and manual),
  SEQUENCE increment on material change while UID stays stable, privacy transforms.

### C2. Inbound leave sync and balance sync not implemented (severity: critical)

- **Why it matters:** LeaveSync is bidirectional; without inbound sync the canonical model
  never reflects Xero-side leave or balances, and `availability_publications` has nothing to
  reconcile.
- **Affected files:** step 4 has no handler (`packages/jobs/src/handlers/` holds only
  `sync-xero-people.ts`, `reconcile-xero-approval-state.ts`); `packages/jobs/src/events.ts:7-8`
  maps `sync-xero-leave-records` and `sync-xero-leave-balances` but neither is in
  `registeredHandlers`; `packages/jobs/src/functions.ts:5-8` registers only two functions;
  `packages/availability/src/people/balance-refresh.ts` never sets its dispatcher;
  `leave_balances` is never written anywhere in app code.
- **Exact fix:** implement `sync-xero-leave-records` (fetch, map to canonical records,
  idempotent upsert, archive stale) and `sync-xero-leave-balances` (fetch, upsert
  `leave_balances`), register both in `functions.ts`, wire `setBalanceRefreshDispatcher`.
- **Regression tests required:** idempotent upsert, record-level failure isolation,
  `clerk_org_id` + `organisation_id` scoping in handler queries.

### C3. Feed cache not invalidated on availability change (severity: high)

- **Why it matters:** A changed availability record is only reflected after the 3600s TTL
  expires, not when the record changes, contradicting the feed rule.
- **Affected files:** cache key uses `feed.updated_at` not an etag
  (`packages/feeds/src/cache/feed-cache.ts:32-38`); `invalidateFeedCache` is called on feed
  and token mutations but not when an `availability_record` changes; TTL fallback at
  `packages/feeds/src/render/render-feed.ts:114`.
- **Exact fix:** invalidate affected feed caches when a relevant `availability_record`
  changes (tie into the publication-reconcile path), or key the cache on a content etag that
  advances with record changes.
- **Regression tests required:** cache key changes when an in-scope record changes; no change
  for out-of-scope records.

### C4. Missing required Inngest jobs (severity: high)

- **Why it matters:** `reconcile-feed-publications` and `rebuild-feed-cache` are required by
  `PRODUCT.md:486-487` and `CLAUDE.md`; without them the publication and cache layers drift.
- **Affected files:** `packages/jobs/src/functions.ts` (only two functions);
  `packages/jobs/src/handlers/` (no feed jobs).
- **Exact fix:** implement and register both jobs; both must carry `clerk_org_id` and
  `organisation_id`.

### C5. Xero rate limiting not implemented (severity: high)

- **Why it matters:** `CLAUDE.md` and `PRODUCT.md:240-247` require 60/min, 5,000/day and five
  concurrent per org enforced inside `packages/xero`. Only the `rate_limit_error` variant
  exists (a 429 passthrough at `packages/xero/src/au/write.ts:231`); no limiter, backoff or
  concurrency gate is present.
- **Exact fix:** add a per-org token-bucket plus concurrency limiter in `packages/xero`,
  applied to all read and write calls.
- **Regression tests required:** limiter enforces per-minute, per-day and concurrency caps.

### C6. Duplicate manual-record guard unverified (severity: medium)

- **Why it matters:** PRODUCT non-negotiable: because the unique constraint is NULL-distinct,
  `packages/availability` must prevent duplicate manual records (`source_remote_id IS NULL`),
  with a test. No dedicated guard or guard test was located in
  `packages/availability/src` (the manual create path is `apps/app/app/actions/availability/manual.ts`
  into the availability create function).
- **Exact fix:** add an application-layer guard on manual create and a co-located test.

> Tenant isolation: no critical findings. A full sweep of every Prisma call site across
> `packages/*` and `apps/*` found no query missing `clerk_org_id`/`organisation_id` scoping,
> no `account_id`/`accountId` tenancy-key leak from the labelling change, and `XeroTenant`
> always resolved via the `organisation_id` FK. SSE streams are keyed `${userId}:${organisationId}`
> and gated by a scoped org-ownership check (`apps/api/app/api/notifications/stream/route.ts:42-67`).
> Minor notes: an unscoped existence probe selecting only `id`
> (`packages/xero/src/resolution/resolve-employee.ts:29-32`) and a deep import path
> (`apps/app/lib/server/get-active-org-context.ts:6` imports from
> `@repo/database/src/queries/organisations` rather than the package root).

---

## Standards violations

Grouped by type; counts are genuine source violations (generated Prisma client excluded).

- **`any` types (1):** `packages/jobs/src/handlers/sync-xero-people.test.ts:16`
  (`(...args: any[])`). Production source is clean.
- **Uncommented `as` casts (~256):** dominated by branded-ID casts that should flow through
  `@repo/core` brand constructors. Representative:
  `apps/api/app/api/availability/route.ts:84-85,97-98,123-124`;
  `apps/api/app/api/availability/[recordId]/route.ts:80-81,93-95,142-145,232-233,245-247,276-279`;
  `apps/api/app/webhooks/auth/route.ts:176-177`;
  `apps/app/app/(authenticated)/people/new/_actions.ts:55,61`;
  `apps/app/lib/server/get-active-org-context.ts:25,39,62`. Double casts (uncommented):
  `apps/app/proxy.ts:4`, `apps/api/app/api/inngest/route.ts:13,18,23`. Best fixed
  systemically with brand parse helpers, not line by line.
- **Default exports in library code (2 genuine + 1 borderline):**
  `packages/email/templates/contact.tsx:54`, `packages/email/templates/notification.tsx:71`;
  borderline `packages/database/prisma.config.ts:12` (Prisma tooling expects a default).
  All `apps/**` page/layout/route default exports are the allowed Next.js convention.
- **Nested barrel file (1):** `packages/database/src/queries/index.ts` (re-export below the
  package root). Package-root `index.ts` files are allowed.
- **Missing Zod on external input (1):** `apps/api/app/webhooks/auth/route.ts` verifies the
  Clerk webhook via svix signature (`:225,235`) but does not Zod-validate the payload shape
  before use (`:248,258-275`).
- **Throw vs Result (0):** all throws in service layers are inside `$transaction` callbacks
  for rollback, then caught and mapped to `Result`, or are config/programmer-error
  assertions. Correct idiom.
- **`console.*` in production (4):** `apps/web/app/(home)/components/marketing-feed-copy.tsx:22`;
  `apps/api/app/api/availability/route.ts:153`;
  `apps/api/app/api/availability/[recordId]/route.ts:169,292`. Should use `@repo/observability`.
- **Direct Prisma imports in apps (0):** clean. All DB access via `@repo/database`.
- **Route protection location (compliant):** `apps/app/proxy.ts` holds the protection; no
  `middleware.ts` exists.
- **Em dashes (2):** `apps/app/app/(authenticated)/settings/members/page.tsx:7` (title copy);
  `apps/app/app/(authenticated)/setup/_actions.ts:44` (comment).
- **US spelling in copy (8 lines):** `apps/api/app/webhooks/auth/route.ts:91,96,112,117,130,136,143,157`
  ("Organization ..." response/analytics strings). Clerk webhook event names
  (`organization.created`, `data.organization`) are external identifiers and are allowed.
- **Residual "workspace" identifier (1):** `packages/core/index.ts:26`
  `export type WorkspaceId` (dead, unused; contradicts the "workspace removed from code
  identifiers" decision). The `apps/web` hit is "Google Workspace" (benign).

Package boundaries (architecture rules): all PASS. No Xero types leak into
`packages/availability` or `packages/feeds`; no ICS generation outside `packages/feeds`; no
redefined shadcn base components in apps.

---

## Test and lint results

Commands were run with `bunx` (the `turbo`/`ultracite` binaries are not on PATH; `bunx`
resolves them) and dummy env vars for the env-validated packages.

- **`bun run check` (Ultracite): PASS.** "No fixes applied".
- **`bun run boundaries`: FAIL, 47 issues** (down from 52 at baseline), all of one kind:
  `apps/api` imports packages it does not declare as dependencies. Affected:
  `@repo/core` x4, `@repo/availability` x2, `@repo/notifications` x1, `@repo/email` x1, and
  the rest across `apps/api/env.ts`, `apps/api/app/api/availability/route.ts`,
  `apps/api/app/api/notifications/stream/route.ts`, `apps/api/app/webhooks/auth/route.ts`,
  `apps/api/lib/support/persist-support-submission-audit.ts`. These are missing
  `package.json` dependency declarations, not architectural leaks.
- **`bun run test`: FAIL.** Turbo schedules all 20 packages but halts at the first failure,
  `@repo/database`, whose suites need a reachable Neon database. Run per-package, the picture
  is: all failures are the same `connect ECONNREFUSED 127.0.0.1:443` DB-integration cause;
  unit tests pass.

  | Package | Result |
  |---|---|
  | `@repo/core` | 15 passed |
  | `@repo/xero` | 53 passed |
  | `@repo/notifications` | 21 passed |
  | `apps/api` | 26 passed |
  | `apps/app` | 91 passed |
  | `@repo/availability` | 120 passed, 8 failed (DB integration) |
  | `@repo/feeds` | 2 passed, 3 failed (DB integration) |
  | `@repo/jobs` | 3 passed, 5 failed (DB integration) |
  | `@repo/database` | 8 passed, 7 failed (DB integration) |

  Totals: ~338 unit tests pass; 23 DB-integration tests fail purely for lack of a database.
- **`bunx prisma validate`:** the canonical schema at
  `packages/database/prisma/schema.prisma` is structurally valid (the only error seen was an
  env-var resolution issue from the unconfigured `prisma.config.ts` loader, not a schema
  error).

### Mandatory test cases (from CLAUDE.md)

| Required case | Present? | Evidence |
|---|---|---|
| ICS serialisation | **Missing** | No test in `packages/feeds/src/render/` |
| UID generation | Partial | Derivation tested in `packages/availability/src/plans/plan-service.test.ts`, but the renderer path (which emits the real UID) is untested and currently wrong |
| SEQUENCE incrementing | **Missing** | SEQUENCE hardcoded to 0; no test |
| Privacy transforms | **Missing** | Projection logic exists, no co-located test |
| Zod validators | Present | `packages/core` and route schemas |
| Feed token validation | **Missing** | No test for `packages/feeds/src/tokens/token-service.ts` |
| `clerk_org_id` query isolation | Present (DB integration) | `packages/database/availability_records.test.ts` ("rejects cross-org queries") |
| XeroConnection / XeroTenant uniqueness | Present (DB integration) | `packages/database` constraint tests |
| Approval state transitions | Present | `packages/availability/src/approvals/approval-service.test.ts` |
| Decline-reason enforcement | Present | same file (:418-430 enforced) |
| Duplicate manual-record guard | **Missing** | See C6 |

---

## Schema and migration gaps

Canonical schema: `packages/database/prisma/schema.prisma` (1043 lines). Migrations:
`packages/database/prisma/migrations/` (17 directories).

- **Applied (confirmed), PRODUCT prose is stale:** `clerk_org_id` on `feed_tokens`,
  `feed_scopes`, `availability_publications` (schema lines 818, 800, 609; backed by the
  original create migrations); the `xero_tenants` to `organisations` Prisma relation via
  `organisation_id` (schema:487; FK in `20260414002000_create_xero_connection_sync_models`).
  `PRODUCT.md:318,346,362,386,390` still calls these "pending"; update the prose.
- **Outstanding migration:** `leave_balances.xero_tenant_id` is still `NOT NULL`
  (schema:635; create migration `20260414005000`), but `PRODUCT.md:366` requires it nullable
  for admin-managed manual balances. Needs a `DROP NOT NULL` migration.
- **Missing tables:** `Plan` and `PlanLimit` exist in neither the schema nor any migration,
  despite `PRODUCT.md:302-303,406,426`. `ClerkOrgSubscription` and `UsageCounter` are
  present.
- **Constraint drift (schema vs PRODUCT prose):** `notification_preferences` unique uses
  `(user_id, organisation_id, notification_type)` (schema:887) not the PRODUCT-stated
  `clerk_org_id`; `usage_counters` unique uses `(clerk_org_id, metric_key, period_start,
  period_end)` (schema:1040) not `counter_type`; `public_holidays` unique uses
  `(organisation_id, source, source_remote_id)` (schema:737) not
  `(organisation_id, location_id, date, source)`. The schema is internally consistent and
  richer; decide whether to update PRODUCT prose or align the schema, but do not leave both
  diverging silently.
- **Stale duplicate:** the repo-root `schema.prisma` (918 lines) is unreferenced
  (`prisma.config.ts` and `package.json` both point at `prisma/schema.prisma`), is missing
  six tables that exist in the canonical schema, and uniquely contains `plans`/`plan_limits`
  and a `balance_value` column name that match PRODUCT but nothing on disk. Delete it to
  remove the risk of a contributor treating it as authoritative.
- **Slice numbering:** migrations exist for slices 06, 08, 09, 10, 12; there is no `slice_07`
  or `slice_11` migration directory. Confirm those slices needed no schema change rather than
  having a dropped migration.

---

## Deployment blockers

What must be true before `app`, `api` and `web` can deploy on Vercel Hobby:

1. **Decouple production build from DB-integration tests.** `turbo.json:8` makes `build`
   depend on `test`; `test` requires a live Neon DB and fails fast. A Vercel build with no
   database cannot succeed. Split unit from integration tests (tag or separate task), or
   remove `test` from the `build` dependency and run tests in CI only.
2. **Complete `.env.example` coverage.** Missing from the per-app examples:
   `XERO_CLIENT_ID`, `XERO_CLIENT_SECRET`, `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`,
   `KV_REST_API_URL`, `KV_REST_API_TOKEN`, and a Sentry DSN (only `NEXT_PUBLIC_SENTRY_DSN`
   is validated, in `packages/observability/keys.ts`, and it is in no example). `KV_*` are
   read directly via `process.env` in `packages/feeds/src/cache/feed-cache.ts:121-122` and
   bypass `@t3-oss/env` validation, so a missing value silently no-ops feed caching;
   `INNGEST_*` are likewise unvalidated.
3. **Resolve the Xero OAuth callback strategy for preview deployments.** The redirect URI is
   built from a fixed base (`packages/xero/src/oauth/service.ts:932-941`,
   `NEXT_PUBLIC_API_URL ?? NEXT_PUBLIC_APP_URL`); no `VERCEL_URL`/`VERCEL_ENV` handling
   exists. Xero requires every redirect URI to be pre-registered, so preview deployments will
   not complete OAuth unless a strategy (single registered callback via the production
   domain, or a per-environment Xero app) is chosen and documented.
4. **Fix the 47 boundary issues** by declaring the missing `@repo/*` dependencies in
   `apps/api/package.json` so `bun run boundaries` passes in CI.

Already in good shape: per-app `vercel.json` for `app`, `api`, `web`
(`apps/{app,api,web}/vercel.json`), with an `apps/api` cron for `/cron/keep-alive`;
`apps/docs` and `apps/email` carry no `vercel.json` (the Hobby three-project limit is
satisfied by configuration); `GITHUB_TOKEN`/`OWNER`/`REPO` are api-only
(`apps/api/lib/github/keys.ts`, consumed only in `apps/api/lib/github/`); and
`serverExternalPackages: ["@prisma/client", "@prisma/adapter-neon"]` is set
(`packages/next-config/index.ts:5`).

---

## Prioritised to-do list

Ordered by build-order step then severity. Each item is a thin vertical slice. Dependencies
are marked `[after: N]`. Items map to the prompts in `launch-plan/prompts/`.

- [ ] **T1 (schema, prompt 01).** Delete root `schema.prisma`; add `Plan` and `PlanLimit`
      tables; migration to make `leave_balances.xero_tenant_id` nullable; reconcile the three
      constraint-drift items and the stale "pending migration" prose in `PRODUCT.md`.
      Packages: `packages/database`. Acceptance: one migration per change; `bunx prisma
      validate` passes; PRODUCT prose matches schema.
- [ ] **T2 (CI/build, prompt 02).** Split unit vs DB-integration tests; remove the
      `build -> test` hard gate or make it unit-only; add `check` and `boundaries` Turbo
      tasks; declare the missing `@repo/*` deps in `apps/api/package.json`. Packages:
      `turbo.json`, `apps/api`. Acceptance: `bun run build` succeeds without a database;
      `bun run boundaries` passes.
- [ ] **T3 (standards, prompt 03).** Remove the four `console.*` calls (use observability
      logger); fix the two em dashes; change the eight "Organization" copy strings to
      "Organisation"; replace the two `packages/email/templates` default exports with named
      exports; remove the nested `packages/database/src/queries/index.ts` barrel; delete the
      dead `WorkspaceId` brand; Zod-validate the Clerk webhook payload in
      `apps/api/app/webhooks/auth/route.ts`. Packages: several. Acceptance: `bun run check`
      passes; no behavioural change.
- [ ] **T4 (step 4, prompt 04) [after: T1].** Implement `sync-xero-leave-records`: inbound
      fetch, map to canonical `availability_records`, idempotent upsert, stale archival;
      register the handler. Packages: `packages/xero`, `packages/jobs`, `apps/api`.
      Acceptance: idempotent upsert test; record-level failures isolated; both scope keys in
      every query.
- [ ] **T5 (step 5, prompt 05) [after: T1].** Implement `sync-xero-leave-balances`: fetch
      and upsert `leave_balances`; wire `setBalanceRefreshDispatcher`; add the admin
      manual-balance edit path (enabled only when Xero is disconnected, now that the column is
      nullable). Packages: `packages/xero`, `packages/jobs`, `packages/availability`,
      `apps/app`. Acceptance: balances written and read; manual edit blocked while connected.
- [ ] **T6 (step 8, prompt 06).** Add the duplicate manual-record guard in
      `packages/availability` with a co-located test. Packages: `packages/availability`.
      Acceptance: duplicate manual record rejected; test asserts it.
- [ ] **T7 (step 12, prompt 07).** Emit `derived_uid_key` as the VEVENT UID; implement the
      Xero `stable_source_key`; materialise `availability_publications` and increment
      `published_sequence`; add feeds tests (ICS serialisation, UID, SEQUENCE, privacy,
      token validation). Packages: `packages/feeds`, `packages/availability`. Acceptance: UID
      stable across edits; SEQUENCE increments on material change; mandatory feed tests exist.
- [ ] **T8 (step 11/16, prompt 08) [after: T7].** Implement `reconcile-feed-publications`
      and `rebuild-feed-cache` jobs; invalidate feed cache when an in-scope
      `availability_record` changes. Packages: `packages/jobs`, `packages/feeds`, `apps/api`.
      Acceptance: publications reconciled; cache invalidated on record change, not just TTL.
- [ ] **T9 (Xero rules, prompt 09).** Add per-org rate limiting (60/min, 5,000/day, five
      concurrent) and backoff inside `packages/xero`. Packages: `packages/xero`. Acceptance:
      limiter enforced and tested.
- [ ] **T10 (step 1, prompt 10).** Add a seed script for org/people/team/location dev data
      keyed by `clerk_org_id`. Packages: `packages/database`, `tooling`. Acceptance: `bun
      run db:push` + seed produces a usable dev tenant.
- [ ] **T11 (deployment, prompt 11) [after: T2].** Complete `.env.example` for app/api/web;
      bring `KV_*` and `INNGEST_*` under `@t3-oss/env` validation; choose and document the
      Xero preview-deployment callback strategy. Packages: `apps/*`, `packages/feeds`,
      `packages/jobs`. Acceptance: documented env; deploy dry-run succeeds.

---

## Open decisions

- **Person merge / link on duplicate manual records (open).** A Xero-to-existing-person match
  review surface exists (`apps/app/app/(authenticated)/settings/integrations/xero/matches/page.tsx`,
  backed by `xeroPersonMatch`), but there is no capability to merge two duplicate
  manually-created person records and no `mergePerson` service in `packages/availability`.
  Options: (a) prevent duplicates at creation only (pairs with C6) and defer merge;
  (b) build an admin merge surface. Recommended default: (a) for launch, defer merge.
- **Xero app environment strategy for preview deployments (open).** The callback URL is fixed
  (`packages/xero/src/oauth/service.ts:932-941`). Options: (a) register a single production
  callback and disable Xero connect on preview deployments; (b) a dedicated non-production
  Xero app with a wildcard-free registered preview callback; (c) an OAuth proxy.
  Recommended default: (a) for launch simplicity, documented in `apps/api/.env.example`.
- **OAuth-time tenant-to-Organisation mapping (resolved).** Implemented in
  `packages/xero/src/oauth/service.ts:586-655` (`resolveOrganisationForTenantSelection`):
  creates an Organisation from region defaults when none exists, otherwise requires and
  validates an explicit selection with a country-code/payroll-region match. No action needed
  beyond confirming the UX in `completeXeroTenantSelection`.
- **Schema-vs-PRODUCT constraint drift (decision needed).** Three unique constraints differ
  between the live schema and PRODUCT prose (see Schema gaps). Decide the direction of truth.
  Recommended default: treat the live schema as correct and update PRODUCT prose, since the
  schema's choices (organisation-scoped preference uniqueness, period-scoped usage counters)
  are more defensible than the prose.
- **Manual leave balance editing (half-built).** The "editable only when Xero is disconnected"
  decision is reflected in the read-only UI gate
  (`apps/app/components/people/person-profile-content.tsx:418-424`) but the edit path does not
  exist and the column is not yet nullable. Folded into T1 and T5.
