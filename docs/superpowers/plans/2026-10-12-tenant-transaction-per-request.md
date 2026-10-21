# Multi-Company Leave Outcomes and One Tenant Transaction per Request Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans (when installed) to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax. This document authorises no execution in the planning turn. Each stage lands and passes all four CI gates before the next starts. Stage 0 ends at a decision gate that needs the owner's confirmation.

**Goal:** Deliver three confirmed multi-company outcomes for one Clerk organisation holding several Xero companies: (1) all staff see approved leave from every company; (2) each leave request routes to the requester's own company; (3) owners and admins approve leave for all staff in every company from one queue, and managers approve their direct reports in any company. In the same areas, remove the per-query tenant-context overhead (four statements per `tenantDatabase` query) by giving every server action, route handler, page data loader and database-only Inngest step exactly one tenant transaction, opened at the entry point and passed down explicitly as a `TenantDb` argument. Flows that must commit in phases, hold external calls or stay open keep their own short transactions (the carve-outs below).

**Source:** `docs/superpowers/specs/2026-10-11-tenant-database-round-trips-options.md`, Option B, amended.

**Decisions (confirmed 12 October 2026):**

- The three outcomes are folded into this plan and delivered area by area, each area converted to request transactions in the same task (Stage 4).

- Option B is adopted with carve-outs, not as a blanket change. The literal Option B breaks three `AGENTS.md` rules (outbound idempotency, isolated inbound record failures, long-lived and concurrent entry points); the carve-outs below keep them.
- `tx` is passed explicitly. `AsyncLocalStorage` is used only as a guard that detects nested or missing threading; it never supplies a client.
- Option H (measurement on a Neon preview branch) runs first as Stage 0.
- Request transactions use a 15 s timeout (`TENANT_REQUEST_OPTIONS`); account-wide reads keep 30 s.
- A failed fire-and-forget `afterTenantCommit` effect is retried once immediately, then logged and reported to Sentry if it fails again.

**Architecture:** A new `withTenantDb(clerkOrgId, fn)` opens one interactive transaction, sets `app.clerk_org_id` once (transaction-local, as today), and hands `fn` a branded `TenantDb`. Every service and query helper takes `db: TenantDb` as its last parameter and asserts it belongs to the `clerkOrgId` it was given. Fire-and-forget side effects (KV invalidation, SSE publish, notification fan-out) register through `afterTenantCommit(db, effect)` and run only after commit. Result-bearing side effects, whose outcome the user sees (for example an Inngest send that can return `dispatch_failed`), run in the entry point after `withTenantDb` returns, and their `Result` is returned to the caller. Parallel fan-out happens only at entry points, never inside a service that holds a `db`. Phased flows call `assertNoTenantTransaction()` and open one `withTenantDb` per phase. Migration is expand then contract: functions first accept an optional `db`, entry points then supply it, and finally `db` becomes required and `tenantDatabase` / `tenantTransaction` are deleted.

**Tech stack:** Existing Bun, Next.js App Router, TypeScript, Prisma 7 (`@prisma/adapter-neon` deployed, `@prisma/adapter-pg` local), Neon PostgreSQL, Inngest, Vitest, `node:async_hooks` (already used in `packages/jobs/src/handlers/xero-sync-access.ts`). No new dependencies.

**Inspected base:** `1b4b3f1` (main, "Support multiple Xero companies with tenant row-level security (#139)"). Read `AGENTS.md`, the options spec, `packages/database/src/tenant-client.ts`, `packages/availability/src/plans/write-operation.ts`, `packages/jobs/src/handlers/sync-xero-leave-records.ts`, `packages/jobs/src/handlers/xero-sync-access.ts`, `apps/api/app/api/notifications/stream/route.ts` and `packages/database/src/boundary.test.ts` first.

---

## Reconciled status (21 October 2026)

Checked items record completed implementation or verified final outcomes. Suggested
task commit titles were consolidated into `50b9080` and subsequent corrective
commits; a checked commit item does not imply that exact title exists. Intermediate
optional-client bridges and the migration-time detector were removed as planned
in Stage 6; they are not work to recreate. Historical RED-only checkpoints without
independently established execution are retained as non-checkbox instructions.

- All four required gates PASS at `5c9cb42`: [CI evidence](https://github.com/hiltonbrown/team-calendar/actions/runs/39534951518). The run includes 16 RLS tests, six statement-count tests and the multi-company routing integration test, using local PostgreSQL and fake provider calls.
- The configured development database was reset and all 41 migrations executed from scratch. Schema/checksum verification and RLS/grants on 29 tenant tables PASS. See [database results](../../../tasks/todo.md#stage-7-development-database-result).
- Stages 1, 3, 4, 5 and 6 are implemented. Task 4.6's duplicate-person warning now uses a shared bounded lookup in the page and actions, preserves earliest-created selection and has RED/GREEN regression coverage. Fresh lint, typecheck (19 tasks) and unit tests (18 tasks) PASS; scoped independent review found no Critical or Important findings. These uncommitted changes have not had a fresh integration run; the linked CI result applies to `5c9cb42`.
- Task 0.2 Step 4 now PASSes against actual PrismaNeon, including concurrent-query correctness, sequential driver statements and commit/rollback context cleanup. Host-to-Neon diagnostics are recorded in the [measurements document](../specs/2026-10-12-tenant-round-trip-measurements.md), not represented as Vercel-region page measurements. Remaining Task 0.2 measurements, measured fan-out decisions (Task 2.3), and Stage 7 Steps 0 to 3 remain open.
- Fresh branch Preview app/API preflights FAIL. Existing local KV settings were added to app Preview for this feature branch only and metadata readback confirms the scope. Missing Sentry, Xero callback/tier and API delivery/webhook configuration remain; sensitive downloaded blanks are not absence evidence. No deployment was triggered by the configuration fix.
- App and API previews are READY at `5c9cb42`. This establishes deployment, not live acceptance or a completed sync-cycle observation. Stage 7 Step 4 is complete; the plan is not complete.

## 1. Findings

### Outcome requirements (confirmed with the owner, 12 October 2026)

| # | Requirement | Decision |
|---|---|---|
| R1 | Who sees approved leave from every company | Every role: owner, admin, manager, viewer |
| R2 | Privacy | Existing per-record privacy modes (private, masked) still apply across companies |
| R3 | Surfaces | Team calendar, dashboard, People directory, ICS feeds |
| R4 | Dashboard and People | Default to all companies, with a company filter like the calendar |
| R5 | People access rules | Unchanged (viewer: self; manager: their scope; owner and admin: everyone), applied across all companies |
| R6 | Routing | Each staff member belongs to exactly one company (assumed, not enforced); a request goes to that company's Xero connection |
| R7 | Owner and admin approval | One combined queue across every company, each item labelled by company, no company filter |
| R8 | Manager approval | Direct reports in any company; a manager is employed in one company |
| R9 | Manager assignment | Owners and admins set each person's manager on the People profile, choosing anyone in the organisation from any company |
| R10 | Manager visibility setting | Moves from per company to account level; migration takes the most restrictive existing value |
| R11 | Other per-company settings | Decline reason and declined visibility follow each request's company |
| R12 | Notifications | Rules unchanged |
| R13 | Delivery | Interleaved by area with the tenant transaction refactor |
| R14 | 'Sync Xero leave' on Leave approvals | Queues a sync for every connected company; one company's failure is shown without blocking the others |

### Outcome state on `main` (`1b4b3f1`)

| Outcome | State | Evidence | Delivered by |
|---|---|---|---|
| 1 Visibility | Calendar is account-wide; feeds can be; Dashboard and People are one company at a time; cross-company manager relationships are not recognised | `calendar-service.ts` (`resolveAccountCompanies`), `feed-scope.ts:152` to `161`, `dashboard-body.tsx`, `people/page.tsx` (`requireActiveOrgPageContext`), `manager-scope.ts` | Tasks 4.1, 4.3, 4.4, 4.5 |
| 2 Routing | Appears correct (records carry `organisation_id`), not proved; plan actions accept the company from the client | `approval-service.ts:1592`, `1756`, `1795`; `plans/_actions.ts:60` onwards | Task 4.7 |
| 3 Approval | Leave approvals is one company at a time; manager scope is one company; nothing assigns managers | `leave-approvals/page.tsx:75` to `93`; `approval-service.ts:215` to `224`, `347`, `409`; no writer of `manager_person_id` | Tasks 4.1, 4.2, 4.6 |

### Current footprint (production code, excluding tests and fixtures)

| Measure | Count |
|---|---|
| `tenantDatabase(` call sites | 378 across 109 files |
| Files with any tenant access (`tenantDatabase(` or `tenantTransaction(`) | 115 |
| `tenantTransaction(` call sites | 60 (availability 30, feeds 15, jobs 7, xero 3, apps/app 3, database 2) |
| Server action files (`"use server"`) | 28 |
| Route handlers (`route.ts`) | 21 |
| Pages and layouts | 66 pages, 13 layouts (subset touch tenant data) |
| Inngest functions / `step.run` sites | 10 / 13 |
| Files with `Promise.all` in tenant code | 20 (heaviest: `sync-monitor-service.ts` 7, `plan-service.ts` 7, `dashboard-service.ts` 6) |
| Functions already accepting an optional client | 10 (`client?: Prisma.TransactionClient` in feeds, availability, notifications, jobs) |
| Edge runtime routes | None (`AsyncLocalStorage` is safe everywhere tenant code runs) |

The existing optional `client?` convention (for example `feed-scope.ts:149`, `calendar-service.ts:903`, `organisation-settings-service.ts:36`) is the seed of the target design. This plan renames it to `db` and makes it universal.

### Why literal Option B is unsafe here (the carve-outs)

| # | Entry point | Constraint | Carve-out |
|---|---|---|---|
| C1 | Outbound Xero writes: `approve`, `retryApproval`, `decline`, `retryDecline`, `revertApprovalAttempt` (`approval-service.ts`), `submitDraftRecord`, `retrySubmission`, `createLeaveOnApproval`, `withdrawSubmission`, `revertToDraft` (`submit-service.ts`), `attachSubmitRecoveryCandidate`, `resolveSubmitAsNotCreated` (`submit-recovery-service.ts`), `prepareXeroWrite`, `recordXeroWriteOutcome`, `completeXeroWriteSideEffects` (`write-operation.ts`) | The claim and `markSubmitDispatchStarted` must be durable before Xero is called; `au-contract-v1` forbids losing a dispatched idempotency key | Phased: each phase is its own `withTenantDb`; the Xero call runs between phases with no open transaction |
| C2 | Inngest steps that call Xero: `sync-leave-records`, `sync-people`, `sync-leave-balances`, `reconcile-approval-state`, `initial-xero-sync` operations, and `apps/api/lib/sync/execute-local-sync-fallback.ts` | Steps interleave Xero HTTP and rate-limit waits with batched upserts; record-level failures must stay isolated and committed batches must survive a later failure | Phased: one `withTenantDb` per batch or per persistence phase, never across a Xero call. Existing `bindingTransactions` in `xero-sync-access.ts` stays as the batch binding |
| C3 | SSE stream (`apps/api/app/api/notifications/stream/route.ts`, `packages/notifications/src/sse/broker.ts`) | Response stays open indefinitely | One short `withTenantDb` per lookup; none held across the stream |
| C4 | Public ICS feed (`apps/api/app/ical/[token]/route.ts`, through `renderFeedForToken` and `cachedEtagForToken` in `packages/feeds/src/render/render-feed.ts`) | Public token discovery uses `systemDatabase`; `renderFeedForToken` interleaves the KV cache read (line 220) and write (line 270) with tenant writes (lines 260 and 289); Option F is reserved for this path | Phased: token discovery and KV calls run outside any transaction; each tenant read or write phase is its own short `withTenantDb`. `renderFeedBody` and the other database-only exports in `render-feed.ts` take `db` (Task 3.3) |
| C5 | Serializable feed publication (`packages/feeds/src/publication/feed-representation.ts:40`) | Isolation level is fixed when a transaction starts; it cannot join a Read Committed request transaction | Phased: keeps its own Serializable `withTenantDb`; callers run it outside their request transaction |
| C6 | Actions and services that call Clerk, Stripe or Xero OAuth before writing: `settings/general/_actions.ts`, `actions/settings/update-org.ts`, `people/_actions.ts`, `settings/integrations/xero/matches/_actions.ts`, `packages/xero/src/oauth/service.ts`, `packages/xero/src/oauth/disconnect.ts`, `packages/availability/src/people/xero-person-reconciliation.ts`, `packages/availability/src/people/clerk-access-service.ts`, `apps/api/lib/stripe-event-delivery.ts` | External HTTP inside a transaction holds a pooled connection for the call's duration, and `disconnect.ts` must delete the remote connection before local teardown | Phased: external call before or after the transaction; results passed in |
| C7 | RSC pages and layouts | Layout and page render concurrently; a transaction cannot span rendering | One `withTenantDb` per data loader; loaders return plain data and close before render |
| C8 | Parallel fan-out readers (see Task 2.3 list) | One transaction serialises `Promise.all` on one connection, and a service holding a `db` cannot open further transactions (the nesting guard throws) | Fan-out moves to the entry point: the loader calls single-purpose service functions through `withTenantReads`, one transaction per branch, unless Stage 0 numbers favour serial. Services that fan out today are split (Task 2.3) |

### Semantic hazards inside non-carved paths

1. **`Result` failures do not roll back.** Services return `{ ok: false }` rather than throw, so a request transaction would commit any writes made before the failure. `withTenantResult` (Task 1.1) rolls back on `ok: false`. Any service that deliberately persists state and then returns `ok: false` must be phased; Task 2.2 inventories them.
2. **Side effects before commit.** Ten tenant files send Inngest events or dispatch notifications (`feeds/_actions.ts`, `notifications/src/dispatch.ts`, `submit-side-effects.ts`, `submit-service.ts`, `approval-service.ts`, `sync-monitor-service.ts`, `balance-refresh.ts`, and three job handlers) and five touch KV or feed cache invalidation (`feed-invalidation.ts`, `publication-service.ts`, `feed-service.ts`, `token-service.ts`, `rebuild-feed-cache.ts`). Inside a request transaction these must not run before commit. They split into two kinds:
   - **Fire-and-forget** (KV and feed cache invalidation, notification fan-out, SSE publish): move to `afterTenantCommit`. A failure is logged and left to the scheduled reconcilers.
   - **Result-bearing** (the caller returns the outcome to the user): run in the entry point after `withTenantDb` returns, and return their `Result`. Verified examples: `dispatchXeroSyncInternal` returns `dispatch_failed` to the caller (`approval-service.ts:874` to `888`), and `sync-monitor-service.ts:27` declares the same error. Moving these into `afterTenantCommit`, which logs and swallows failures, would report "queued" when nothing was queued. Task 2.2 inventories them.
3. **Nested `tenantTransaction` inside services.** Prisma has no nested interactive transactions; today a nested call silently opens a second connection with a separate commit and can deadlock on row locks held by the outer transaction. The guard in Task 1.1 makes this an error.
4. **Timeouts.** Prisma's 5 s interactive default would apply to whole requests. Request transactions use explicit presets (Task 1.1); account-wide reads keep `TENANT_READ_TRANSACTION_OPTIONS` (30 s). That preset is applied today inside the services themselves (`getCalendarRange`, `calendar-service.ts:332`; `previewFeed`, `preview-service.ts:138`; `projectFeedEvents`, `feed-projection.ts:80`). Once an entry point passes a `db`, `inTenant` reuses it and the service's own options no longer apply, so the transaction's timeout is whatever the entry point chose. Every entry point that reaches one of these services must therefore open its transaction with `TENANT_READ_TRANSACTION_OPTIONS` (step P3, section 7).
6. **Catch-and-continue loops need separate transactions.** In PostgreSQL, any SQL error aborts the enclosing transaction; catching the error in TypeScript does not restore it, and every later statement fails until rollback. A loop that catches one record's failure and continues with the next (for example `reconcile-feed-publications`, which calls `materialiseAvailabilityPublication` once per record, each in its own transaction, and catches failures so successful records stay committed) must keep one transaction per record or batch. Sharing one `db` across the loop would roll back every earlier record on the first failure.
5. **Pool pressure.** `PrismaNeon` is constructed with no explicit pool size (`standalone-client.ts:17`), and each request now holds one connection for its whole data phase. Stage 0 records the effective pool size and Neon pooled-endpoint limit.

---

## 2. Target API

`packages/database/src/tenant-db.ts` (new), exported from `packages/database/index.ts`:

```ts
import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import type { Prisma } from "../generated/client";
import { referenceDatabase } from "./tenant-client";

declare const tenantDbBrand: unique symbol;
/** A transaction client that already carries one account's RLS context. */
export type TenantDb = Prisma.TransactionClient & {
  readonly [tenantDbBrand]: true;
};

export type TenantTransactionOptions = {
  maxWait?: number;
  timeout?: number;
  isolationLevel?: Prisma.TransactionIsolationLevel;
};

/** Default for server actions, route handlers and page loaders. */
export const TENANT_REQUEST_OPTIONS = { maxWait: 5_000, timeout: 15_000 } as const;
/** Account-wide calendar and feed projection reads (unchanged values). */
export const TENANT_READ_TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 30_000 } as const;

const owners = new WeakMap<object, string>();
const effects = new WeakMap<object, Array<() => Promise<void>>>();
const activeScope = new AsyncLocalStorage<{ clerkOrgId: string }>();

export function withTenantDb<T>(
  clerkOrgId: string,
  fn: (db: TenantDb) => Promise<T>,
  options: TenantTransactionOptions = TENANT_REQUEST_OPTIONS
): Promise<T>;
// 1. assertTenant(clerkOrgId)
// 2. throw TenantNestingError if activeScope.getStore() is set
// 3. activeScope.run({ clerkOrgId }, () => referenceDatabase.$transaction(async (tx) => {
//      await tx.$queryRaw`SELECT set_config('app.clerk_org_id', ${clerkOrgId}, true)`;
//      owners.set(tx, clerkOrgId); effects.set(tx, pending);
//      // Branding is a phantom type; the runtime owner check is in owners.
//      return fn(tx as TenantDb);
//    }, options))
// 4. after commit, outside the ALS scope, run pending effects in order;
//    a failed effect is retried once immediately; a second failure is
//    logged and reported to Sentry, never rethrown
//    into the committed request

export function withTenantResult<T, E>(
  clerkOrgId: string,
  fn: (db: TenantDb) => Promise<Result<T, E>>,
  options?: TenantTransactionOptions
): Promise<Result<T, E>>;
// Throws an internal TenantRollback sentinel when fn returns ok: false,
// catches it outside $transaction and returns the original Result.

export function assertTenantDb(db: TenantDb, clerkOrgId: string): void;
// Throws TenantMismatchError if owners.get(db) !== clerkOrgId (including unknown clients).

export function afterTenantCommit(db: TenantDb, effect: () => Promise<void>): void;
// Fire-and-forget effects only. Failures are logged, never returned. An effect
// whose outcome the user must see runs in the entry point after withTenantDb
// returns, and the entry point returns its Result.

export function assertNoTenantTransaction(operation: string): void;
// Throws TenantPhaseError if activeScope.getStore() is set. Called first in every phased function.

export function withTenantReads<K extends string, V>(
  clerkOrgId: string,
  branches: Record<K, (db: TenantDb) => Promise<V>>,
  options?: TenantTransactionOptions
): Promise<Record<K, V>>;
// Runs each branch in its own withTenantDb concurrently. Only for the Task 2.3
// list of entry-point loaders. Throws TenantNestingError if called while a
// tenant transaction is open, so it can never run inside a service holding a db.

/** Expand-phase bridge. Deleted in Stage 6. */
export function inTenant<T>(
  clerkOrgId: string,
  db: TenantDb | undefined,
  fn: (db: TenantDb) => Promise<T>,
  options?: TenantTransactionOptions
): Promise<T>;
// db ? (assertTenantDb(db, clerkOrgId), fn(db)) : withTenantDb(clerkOrgId, fn, options)
```

Mismatch rule: a `TenantDb` for account A used with `clerkOrgId` B throws (the spec's recommended rule). There is no fallback.

---

## 3. Stage 0: Measure (Option H)

### Task 0.1: Statement-count harness

**Files:**
- Create: `packages/database/src/test-fixtures/statement-recorder.ts`
- Create: `packages/database/tenant-statement-counts.integration.test.ts`

- [x] **Step 1:** Write `createRecordingTenantClient()`: a `pg.Pool` whose `connect` hook wraps each client's `query` to push the SQL text to an array, passed to `PrismaPg`, then wrapped exactly like `referenceDatabase`. Verify with one plain query that the adapter routes through `client.query`; if it does not, fall back to `log_statement=all` parsing as the spec did and record that in the test header.
- [x] **Step 2:** Write assertions that pin today's baseline (they pass against `main` and exist to make later changes visible): one `tenantDatabase` query sends 4 statements (`BEGIN`, `set_config`, query, `COMMIT`); three queries in one `tenantTransaction` send 6.
- [x] **Step 3:** Add a concurrency-safety assertion: `Promise.all` of three different queries inside one `tenantTransaction` returns correct results with no transaction error, and the recorder shows them sent one after another on the one connection. Stage 4 relies on this for loaders that are not on the fan-out register.
- [x] **Step 4:** Run `bunx vitest run packages/database/tenant-statement-counts.integration.test.ts` with `ALLOW_LOCAL_DATABASE_TESTS=1`. Expected: PASS.
- [x] **Step 5:** Commit `test: record tenant statement counts per access pattern`.

### Task 0.2: Neon preview measurements

**Files:**
- Modify: `packages/database/src/standalone-client.ts` (opt-in query timing behind `TENANT_QUERY_TIMING=1`, logged through `@repo/observability`, off by default)
- Create: `docs/superpowers/specs/2026-10-12-tenant-round-trip-measurements.md`

- [x] **Step 1:** Add the opt-in timing (count of tenant statements per request and per Inngest step, total database wall time). Unit test that it is inert when the flag is absent.
- [ ] **Step 2:** On the configured Neon database (the owner's existing-target instruction supersedes branch creation), with `DATABASE_APP_URL` as `team_calendar_app` and the production Vercel region, record: Vercel to Neon round-trip time; tenant statements per request for calendar, people, approvals, sync, dashboard and settings pages; tenant statements per Inngest step; p50 and p95 latency for those pages; effective `PrismaNeon` pool size and Neon pooled-endpoint connection limit.
- [ ] **Step 3:** For each Task 2.3 fan-out loader, record wall time with branches parallel (today) and with all branches in one transaction (temporary local patch, not committed).
- [x] **Step 4:** Repeat the Task 0.1 Step 3 concurrency assertion against Neon through `PrismaNeon` (the integration test covers `PrismaPg` only). Actual restricted-role diagnostic PASS on 21 October: correct distinct results/context on one backend, six sequential driver statements, context cleanup after commit and rollback. See the measurements document. No concurrent-query error requires removing `Promise.all`.
- [ ] **Step 5:** Write the measurements document with the spec's decision rule applied: overhead = 3 × round trip × tenant queries on the critical path, compared with 10% of p95.
- [ ] **Step 6:** Commit `docs: record tenant round-trip measurements on Neon preview`.

### Gate 0 (owner decision)

- [x] Owner explicitly approved proceeding to Stage 1 despite missing Neon measurements; this does not establish performance or live acceptance evidence.

Present the measurements document. Proceed to Stage 1 only on explicit confirmation. The gate decides the tenant transaction refactor only: if the owner stops it here, Stage 4 still runs every O step to deliver the three outcomes and skips the E and P steps. New code in O steps (for example the Task 4.2 service) then uses the existing `tenantDatabase` and `tenantTransaction` helpers instead of `TenantDb`. If no core page exceeds the 10% threshold, the spec recommends stopping at Option A; the owner decides whether Option B still proceeds for consistency.

---

## 4. Stage 1: Core API

### Task 1.1: `withTenantDb` and helpers

**Files:**
- Create: `packages/database/src/tenant-db.ts`
- Create: `packages/database/src/tenant-db.test.ts`
- Modify: `packages/database/index.ts` (export the API and error classes)
- Modify: `packages/database/src/tenant-client.ts` (move `TENANT_READ_TRANSACTION_OPTIONS` to `tenant-db.ts` and re-export; keep `tenantDatabase` / `tenantTransaction` working)

- [x] **Step 1: Write failing unit tests** (mocked `referenceDatabase.$transaction`):
  - `withTenantDb` sets context once, passes the transaction client, returns `fn`'s value.
  - Calling `withTenantDb` inside `withTenantDb` throws `TenantNestingError`.
  - `assertTenantDb` passes for the owning account, throws `TenantMismatchError` for another account and for an unregistered client.
  - `afterTenantCommit` effects run after commit, in order, outside the scope (an effect may itself call `withTenantDb`); they never run when `fn` throws; a failing effect is retried exactly once; an effect that fails twice is logged and reported to Sentry and does not reject the call; an effect that succeeds on retry is not reported.
  - `withTenantResult` rolls back and returns the same `Result` object on `ok: false`; commits on `ok: true`.
  - `assertNoTenantTransaction` throws inside a scope and passes outside.
  - `withTenantReads` runs branches concurrently in separate transactions and returns keyed results.
  - `inTenant` reuses a supplied `db` (no new transaction) and opens one when `db` is absent.
  - Blank `clerkOrgId` throws (existing `assertTenant` behaviour).
- [x] **Step 2:** Run `bunx vitest run packages/database/src/tenant-db.test.ts`. Expected: FAIL (module missing).
- [x] **Step 3:** Implement per section 2. Errors are named classes so callers and tests can match them.
- [x] **Step 4:** Run the test again. Expected: PASS.
- [x] **Step 5:** Commit `feat(database): add withTenantDb request-scoped tenant transactions`.

### Task 1.2: Restricted-role integration tests

**Files:**
- Modify: `packages/database/row-level-security.integration.test.ts`
- Modify: `packages/database/tenant-statement-counts.integration.test.ts`

- [x] **Step 1:** Add tests against the restricted role:
  - `withTenantDb(A)` never returns B rows, with 20 concurrent `withTenantDb(A)` and `withTenantDb(B)` calls interleaved.
  - A query with no context is denied (existing test retained).
  - After `withTenantDb` commits or rolls back, a query on the same pooled connection sees no `app.clerk_org_id` (`current_setting('app.clerk_org_id', true)` is empty).
  - `assertTenantDb(dbA, B)` throws before any statement is sent.
  - Statement count: three queries in one `withTenantDb` send 6 statements (`n + 3`).
- [x] **Step 2:** Run `bun run test:integration --filter @repo/database`. Expected: PASS.
- [x] **Step 3:** Commit `test(database): prove withTenantDb isolation, cleanup and statement counts`.

### Task 1.3: Migration-time detector in `tenantDatabase`

**Files:**
- Modify: `packages/database/src/tenant-client.ts`, `packages/database/src/tenant-client.test.ts`

- [x] **Step 1:** Failing test: calling `tenantDatabase(x)` while a `withTenantDb` scope is active throws `TenantNestingError` when `NODE_ENV === "test"` and logs a structured warning (`tenant_db_unthreaded`, with a stack frame) otherwise. Same for `tenantTransaction`.
- [x] **Step 2:** Implement using an exported `isTenantScopeActive()` from `tenant-db.ts`.
- [x] **Step 3:** Run `bun run test`. Expected: PASS (no entry point opens a scope yet).
- [x] **Step 4:** Commit `feat(database): detect unthreaded tenant access inside a request transaction`.

---

## 5. Stage 2: Classification and guard rails

### Task 2.1: Phased-module register

**Files:**
- Create: `packages/database/src/tenant-phased-modules.ts` (exported constant `PHASED_TENANT_EXPORTS`: entries of `{ path, exports, reason }`, naming individual exported functions rather than whole modules, covering C1 to C6)
- Modify: `packages/database/src/boundary.test.ts`

Registration is per export because four modules mix phased and converted functions: `approval-service.ts` (reads converted, Xero writes phased), `submit-recovery-service.ts` (`listSubmitRecoveryCandidates` converted, the rest phased), `render-feed.ts` (C4) and `submit-service.ts` (phased writes beside the pure `submitRequestFingerprint`). Inngest handlers (C2) export `inngest.createFunction` values, not async functions, so a guard on the handler export can never fire; for C2 register the named persistence and step-body functions the handlers call, extracting an anonymous step body into a named function where needed.

- [x] **Step 1:** Failing boundary test: for every registered export, the first statement is `assertNoTenantTransaction(` and the signature has no `TenantDb` parameter (source scan, same technique as `SYSTEM_IMPORT_ALLOWLIST`; first-statement position is checked because it is unambiguous to scan). Unregistered exports in the same module are unaffected. Every registered `{ path, exports }` must resolve to an existing exported function, so a rename fails the test instead of silently dropping the guard.
- [x] **Step 2:** Populate the register from the C1 to C6 rows in section 1, including the C2 step-body functions and the C4 exports `renderFeedForToken` and `cachedEtagForToken`.
- [x] **Step 3:** Add `assertNoTenantTransaction("<function>")` as the first line of each phased export.
- [x] **Step 4:** Run `bunx vitest run packages/database/src/boundary.test.ts` and `bun run test`. Expected: PASS.
- [x] **Step 5:** Commit `refactor: register phased tenant flows and guard them against request transactions`.

### Task 2.2: Failure-persisting services

**Files:**
- Modify: `packages/database/src/tenant-phased-modules.ts`

- [x] **Step 1:** Search every non-phased service for writes followed by an `ok: false` return (status transitions to failure states, failure audit events, attempt counters). Add each to the register with reason "persists state on failure", or restructure so the failure write happens in its own phase.
- [x] **Step 2:** Inventory result-bearing side effects: every Inngest send or notification dispatch whose failure reaches the caller as a `Result` error (for example `dispatch_failed`). Starting points, verified on `main`: `dispatchXeroSyncInternal` behind `dispatchApprovalReconciliation` and `dispatchXeroLeaveSync` (`approval-service.ts:781` to `888`), and the `dispatch_failed` paths in `sync-monitor-service.ts` (declared at line 27); then check `feeds/_actions.ts`, `submit-side-effects.ts`, `submit-service.ts` and `balance-refresh.ts`. For each, split the function so the database part takes `db` and the send is a separate function called by the entry point after `withTenantDb` returns. Record the list in this task's commit message.
- [x] **Step 3:** Add a unit test per affected function proving the failure state is still persisted, and a test per split send proving a failed send still returns its error `Result` to the caller.
- [x] **Step 4:** Commit `refactor: phase failure-persisting services and split result-bearing sends`.

### Task 2.3: Fan-out register

The candidate list, empty approval register and boundary test are implemented.
Measurement-dependent selection, splitting and approval remain open below.

**Files:**
- Create: `packages/database/src/tenant-fan-out.ts` (documented list of entry-point loaders allowed to use `withTenantReads`)

Fan-out can only happen at an entry point. A service that receives a `db` is already inside a transaction; the nesting guard stops it opening more, and `Promise.all` on its `db` serialises on one connection. Services that fan out today are therefore split, and the parallelism moves to the entry point that calls them.

- [ ] **Step 1:** Identify the services that fan out today, to confirm against Stage 0 numbers: `getApprovalSummaryCounts` (`approval-service.ts:510`; four counts in `Promise.all` at line 538), sync monitor summaries (`sync-monitor-service.ts`), dashboard summaries (`dashboard-service.ts`), plan summaries (`plan-service.ts`), `current-status.ts`, `feed-scope.ts`, `feed-service.ts`, `getFeedOversightCounts`, and the per-account loop in `recountUsage` (`recount-usage.ts`). Keep a service on the list only where Stage 0 shows parallel is faster; the rest keep `Promise.all` on their `db` and run serially.
- [ ] **Step 2:** For each retained service, split it into single-purpose functions that each take `db` (for example `countPendingApprovals(input, db)`), and keep a thin composing function with no `db` parameter that the entry point calls. Unit test that each part returns the same values as the original function.
- [ ] **Step 3:** Register the entry-point loaders that call the composing functions through `withTenantReads`: initially `leave-approvals/page.tsx`, `dashboard-body.tsx`, `sync` page loaders, `settings/general/page.tsx`, `settings/billing/page.tsx`, the feeds pages, and the `recount-usage` step.
- [x] **Step 4:** Boundary test: `withTenantReads(` appears only in registered entry-point modules, never under `packages/*/src` other than `packages/jobs/src/handlers`.
- [x] **Step 5:** Run `bun run test`. Expected: PASS.
- [ ] **Step 6:** Commit `refactor: move tenant fan-out to entry points`.

---

## 6. Stage 3: Expand foundations (thread `db` through shared helpers)

This stage is not purely mechanical. Wrapping a whole function body in `inTenant` turns several per-query transactions into one per-function transaction, which serialises any internal `Promise.all` and would hold the transaction across any external call in the middle of the function. Each task therefore starts with a precondition check.

Rule for every task in this stage: add `db?: TenantDb` as the **last** parameter (rename existing `client?: Prisma.TransactionClient` to `db?: TenantDb`); replace each `tenantDatabase(clerkOrgId).x` and internal `tenantTransaction(clerkOrgId, fn)` in the function with one `inTenant(clerkOrgId, db, async (db) => ...)` wrapping the function body; pass `db` to every callee that has already been converted; move fire-and-forget effects (KV invalidation, notification fan-out) into `afterTenantCommit(db, ...)`. Result-bearing sends were split out in Task 2.2 and stay outside. Convert bottom-up so callees are always converted before callers. Package dependencies on `main` fix the order: `availability` imports `@repo/feeds` and `@repo/notifications`; `xero` imports `availability` and `feeds`; `jobs` imports all four. Stage 3 therefore converts database helpers, notifications and feeds; availability services follow in Stages 4 and 5, then xero and jobs; converting a caller before its callee would trip the Task 1.3 detector. Registered phased exports are not converted in this stage; the database-only helpers they call are.

Each task follows the same steps:

- [x] **Step 0 (precondition):** For every function in the task, confirm it has no `Promise.all` over tenant queries that Task 2.3 did not already split, no external call (Xero, Clerk, Stripe, Resend, KV read, Inngest send) between database queries, and no loop that catches a per-item failure and continues (hazard 6). Restructure or register any function that fails before converting it; do not convert first and fix afterwards.
- [x] **Step 1:** Add or extend the co-located test so it calls the function both without `db` (opens its own transaction) and with a `db` from a test `withTenantDb` (reuses it, asserted by spying that `$transaction` is not called again). Add a mismatch test where a `db` for another account throws `TenantMismatchError`.
- **Step 2 (historical RED checkpoint):** Run the file's tests; expect FAIL. Original RED execution is not independently established by this reconciliation; current GREEN verification is complete.
- [x] **Step 3:** Convert.
- [x] **Step 4:** Run the file's tests, then `bun run typecheck` and `bun run test`. Expected: PASS.
- [x] **Step 5:** Commit `refactor(<package>): thread TenantDb through <area>`.

| Task | Files (call sites) |
|---|---|
| 3.1 Database query helpers | `packages/database/src/queries/`: `outbound-operations.ts` (8), `onboarding.ts` (6), `notifications.ts` (6), `billing.ts` (5), `availability-records.ts` (5), `sync-runs.ts` (4), `xero-connections.ts` (3), `teams.ts` (3), `organisations.ts` (3), `feeds.ts` (3), `xero-sync-cursors.ts` (2), `people.ts` (2), `leave-balances.ts` (2), `xero-connection-state.ts`, `support-submissions.ts`, `public-holiday-resolution.ts`, `activation-dashboard.ts`, `account-companies.ts` (1 each); `organisation-settings/repository.ts` (2). `billing.ts:96` reads public plan data directly through `referenceDatabase` with no tenant context; it stays as it is and takes no `db` |
| 3.2 Notifications | `notification-service.ts` (5), `preferences-service.ts` (3), `email-queue-service.ts` (2), `dispatch.ts` (2; fire-and-forget dispatch moves to `afterTenantCommit`; any caller that returns the dispatch outcome uses the Task 2.2 split) |
| 3.3 Feeds | `scope/feed-scope.ts` (8), `feed-service.ts` (7), `render/render-feed.ts` (5; database-only exports such as `renderFeedBody`; `renderFeedForToken` and `cachedEtagForToken` stay phased, C4), `tokens/token-service.ts` (2), `cache/feed-invalidation.ts` (2; KV calls to `afterTenantCommit`), `projection/feed-projection.ts`, `publication/publication-service.ts`, `preview/preview-service.ts` (`previewFeed`, one internal `tenantTransaction`). `feed-representation.ts` stays phased (C5) |

The remaining services are converted inside the area that uses them: Stage 4 for the outcome areas, Stage 5 for everything else. Both reuse the shared E steps at the end of section 7.

---

## 7. Stage 4: Multi-company outcome areas (interleaved)

Each task below delivers one area of the three confirmed outcomes (section 1, "Outcome requirements") and, in the same task, converts that area to request transactions. Outcome steps (O) come first so the behaviour change is proved on today's data access before the refactor touches it; conversion then follows the shared expand steps (E) and entry-point steps (P) defined at the end of this section. If the owner stops the refactor at Gate 0, each task still runs its O steps and skips E and P.

When a page shows all companies, the acting person (for manager scope and privacy relationships) is resolved by `clerk_user_id` across the account, not within one selected company; Tasks 4.3 to 4.6 each test this for a manager whose reports sit in another company.

Every account-wide query in this stage follows the `AGENTS.md` pattern: resolve the owned company set with `resolveAccountCompanies(clerkOrgId)` and filter `organisation_id: { in: ownedIds }` explicitly, alongside `clerk_org_id`.

Order matters: Task 4.1 changes the manager-scope contract every later task depends on, and Task 4.2 creates the cross-company manager links that Tasks 4.3 to 4.7 test against.

### Task 4.1: Account-level manager visibility and cross-company manager scope

Outcomes served: 1 (visibility rules for managers) and 3 (managers approve direct reports in any company).

**Today:** `manager_visibility_scope` is a column on `OrganisationSettings` (one row per company, `schema.prisma:347`). `managerScopePersonIds` (`packages/availability/src/settings/manager-scope.ts`) reads that company's setting and only the people of `input.organisationId`, so reports in another company are invisible to a manager. Callers: approvals, people, dashboard, plans, submit, out-of-office and leave reports.

**Files:**
- Modify: `packages/database/prisma/schema.prisma` (new model `AccountSettings`, table `account_settings`, following the database conventions in `AGENTS.md`: UUID `id`, `created_at`, `updated_at`, `clerk_org_id` not null, indexed and unique; holds `manager_visibility_scope`)
- Create: a generated migration that creates the table, adds RLS policy and the `team_calendar_app` grant (per `AGENTS.md`: new tables need an explicit grant and policy review), and backfills one row per account using the most restrictive existing value (`direct_reports_only` if any company has it, otherwise `all_team_leave`)
- Create: `packages/database/src/queries/account-settings.ts` and test
- Modify: `packages/availability/src/settings/manager-scope.ts` and test; `packages/availability/src/settings/organisation-settings-service.ts`, `settings/shared.ts` and `packages/database/src/organisation-settings/repository.ts` (stop reading and writing the per-company value); `apps/app/app/(authenticated)/settings/leave-approval/page.tsx`, `_actions.ts` and `leave-approval-settings-client.tsx` (the field moves to an account-level control, owner and admin only)
- Modify (direct readers of the setting): `dashboard-service.ts:322`, `calendar-service.ts:437` and `1140` read `managerVisibilityScope` from company settings; switch them to the account setting
- Modify (signature only): every `managerScopePersonIds` caller listed above
- Later contract migration (Task 6.4): drop `organisation_settings.manager_visibility_scope` once nothing reads it

- [x] **O1:** Failing tests: `managerScopePersonIds({ actingPersonId, clerkOrgId })` (no `organisationId`) returns direct reports in every company of the account, honours the account-level setting (`direct_reports_only` versus transitive `all_team_leave`), and never returns people from another account. A search test confirms no code outside `account-settings.ts` reads `managerVisibilityScope` from company settings. Migration test: an account whose companies disagree is backfilled to `direct_reports_only`; an account whose companies all use `all_team_leave` keeps it.
- [x] **O2:** Implement the model, migration, query helper and the new manager-scope contract. Reports are matched by `manager_person_id` across all of the account's people, not one company's.
- [x] **O3:** Move the setting in the settings UI from per-company to account level; per-company settings that apply to individual requests (decline reason, declined visibility, notifications, privacy default) stay per company.
- [x] **O4:** Update every caller to the new signature. Out-of-office and leave reports keep their existing company filter; only their manager scope widens.
- [x] **E/P:** Convert `account-settings.ts`, `manager-scope.ts`, `organisation-settings-service.ts` and the leave-approval settings entry points.
- [x] **Commit:** `feat(availability): account-level manager visibility across companies`.

### Task 4.2: Assign a person's manager from any company

Outcome served: 3. **Today:** nothing in the product writes `people.manager_person_id`; the only write copies an existing value during Xero person reconciliation (`xero-person-reconciliation.ts:491` to `505`). Manager approval therefore depends on a link nobody can create.

**Files:**
- Create: `packages/availability/src/people/manager-assignment-service.ts` and test
- Modify: `apps/app/app/(authenticated)/people/_actions.ts` (new `setPersonManagerAction`), `people/[personId]/page.tsx` and `people/@modal/(.)[personId]/page.tsx` (manager picker on the profile)
- Modify: `packages/database/row-level-security.integration.test.ts`

- [x] **O1:** Failing tests: owner and admin can set or clear any person's manager to any non-archived person in the same account, in any company; managers and viewers get `not_authorised`; a person cannot manage themselves; a cycle (A manages B, B manages A, including longer chains) is rejected; each change writes an audit event; a manager from another account is rejected by RLS and by the service.
- [x] **O2:** Implement the service and action (both tenancy keys, `Result` errors, audit event).
- [x] **O3:** Add the picker to the profile, listing people from every company with their company name, following `DESIGN.md`.
- [x] **O4:** Confirm Xero people reconciliation still preserves a manually assigned manager (the copy at line 505 only fills an empty value) and add a test for it.
- [x] **E/P:** Born converted: the new service takes `db: TenantDb`; the action opens `withTenantResult`.
- [x] **Commit:** `feat(people): owners and admins assign managers across companies`.

### Task 4.3: Calendar and feeds show every company to every role

Outcome served: 1. **Today:** the calendar is account-wide (`getCalendarRange` uses `resolveAccountCompanies`; the company filter defaults to all), and feed scopes can be account-wide (`feed-scope.ts:152` to `161`). Not yet verified for every role, and privacy relationships (`relationshipToOwner`, `calendar-service.ts:1052`) and the `manager_team` feed scope (`feed-scope.ts:590` onwards) look only at reports in the same company.

**Files:**
- Modify: `packages/availability/src/calendar/calendar-service.ts` and test; `packages/feeds/src/scope/feed-scope.ts` and test
- Modify: `apps/app/app/(authenticated)/calendar/page.tsx`; feed entry points (`feeds/page.tsx`, `feeds/[feedId]/page.tsx`, `feeds/@modal/(.)[feedId]/page.tsx`, `feeds/new/page.tsx`, `feeds/@modal/(.)new/page.tsx`, `feeds/_actions.ts`, `apps/api/app/api/feeds/route.ts`, `feeds/[feedId]/route.ts`, `feeds/[feedId]/rotate-token/route.ts`)

- [x] **O1:** Failing tests, with an account holding companies A and B: an owner, admin, manager and viewer employed in A each see B's approved leave on the calendar with the filter on "all"; private and masked records from B show to peers exactly as private and masked records from A do; a manager in A whose report is in B sees that report's leave with manager visibility, not peer masking; the default account feed and a `manager_team` feed for that manager include B's records.
- [x] **O2:** Fix whatever the tests show, expected at least in `relationshipToOwner` and the `manager_team` scope, by using the Task 4.1 account-wide manager scope.
- [x] **E:** Convert `calendar-service.ts` (feeds were converted in Task 3.3).
- [x] **P:** Convert the calendar page and feed entry points with `TENANT_READ_TRANSACTION_OPTIONS`; `ical/[token]/route.ts` stays phased (C4).
- [x] **Commit:** `feat(calendar): show every company's leave to every role`.

### Task 4.4: Dashboard defaults to all companies

Outcome served: 1. **Today:** `dashboard-body.tsx` and `dashboard-service.ts` scope everything to one `organisationId` (`scopedQuery(clerkOrgId, organisationId)`; direct-report count filtered by `organisation_id`, `dashboard-service.ts:280` to `300`).

**Files:** `packages/availability/src/dashboard/dashboard-service.ts` and test; `apps/app/app/(authenticated)/dashboard-body.tsx`, `(authenticated)/page.tsx`

- [x] **O1:** Failing tests: with no company selected, who is away, the timeline and coverage include every company; selecting a company narrows them; the direct-report count and approval-queue widget use the Task 4.1 cross-company scope; privacy rules apply as in Task 4.3.
- [x] **O2:** Implement, reusing the calendar's company selection (`selectCalendarCompanies` and its filter control) rather than a new mechanism; company-specific settings are read per record's company.
- [x] **E/P:** Convert `dashboard-service.ts` (split fan-out per Task 2.3) and the dashboard entry points.
- [x] **Commit:** `feat(dashboard): default to all companies with a company filter`.

### Task 4.5: People directory defaults to all companies, role rules unchanged

Outcome served: 1. **Today:** `people/page.tsx` uses `requireActiveOrgPageContext` and filters by one `organisation_id`; `canAccessPerson` (`people-service.ts:230` to `250`) lets owner and admin see everyone, viewers only themselves, managers their scope within one company.

**Files:** `packages/availability/src/people/people-service.ts`, `current-status.ts` and tests; `apps/app/app/(authenticated)/people/page.tsx`, `people/[personId]/page.tsx`, `people/@modal/(.)[personId]/page.tsx`, `people/_actions.ts` (Clerk calls phased, C6), `people/new/page.tsx`, `people/new/_actions.ts`, `lib/server/create-manual-person.ts`, `lib/server/load-onboarding-people.ts`

- [x] **O1:** Failing tests: owner and admin list every person in every company by default, each labelled with company; a company filter narrows the list; viewers still see only themselves; managers see their Task 4.1 scope across companies; `canAccessPerson` follows the same rules across companies.
- [x] **O2:** Implement with the same company selection as Task 4.4.
- [x] **E:** Convert `people-service.ts`, `current-user-service.ts`, `current-status.ts`, `manual-balance-service.ts`, `alternative-contact-service.ts`, `balance-refresh.ts` (result-bearing sync dispatch per Task 2.2).
- [x] **P:** Convert the people entry points listed above.
- [x] **Commit:** `feat(people): default to all companies with a company filter`.

### Task 4.6: One combined approval queue

Outcome served: 3. **Today:** `leave-approvals/page.tsx` resolves one company with `requireActiveOrgPageContext` and finds the acting person only in that company (`page.tsx:75` to `93`); `ListSchema` requires `organisationId` (`approval-service.ts:215` to `224`) and the query is `scoped(data)` to that company (line 347); `resolveManagedPersonIds` passes `organisationId` (line 409 onwards); approve and decline actions take `organisationId` from the client (`leave-approvals/_actions.ts:26` to `32`).

**Files:** `packages/availability/src/approvals/approval-service.ts` and test; `apps/app/app/(authenticated)/leave-approvals/page.tsx`, `_actions.ts` and their components

- [x] **O1:** Failing tests, with companies A and B: owner and admin see pending requests from A and B in one list, each item labelled with its company; there is no company filter; a manager employed in A sees requests from direct reports in A and B (per the account setting) and nothing else; summary counts span both companies; declined requests appear or not according to each record's company setting; a decline requires a reason when the record's company requires one; approving or declining a B request as an A-employed manager or any admin calls Xero through B's connection.
- [x] **O2:** Make `organisationId` absent from list, detail and summary inputs (account-wide); add the company id and name to `ApprovalListItem`; resolve the acting person by `clerk_user_id` across the account (one company per staff member is assumed, not enforced; see section 13).
- [x] **O2a (review omission):** Detect multiple Person matches for the acting Clerk user and log the warning required by section 13. Both page and actions use the shared tenant-scoped `findMany` lookup with `take: 2`, deterministic earliest-created selection and a duplicate warning. Regression observed the missing warning before the fix; affected tests and the full unit suite PASS afterwards. Admins without a Person remain allowed; managers without a Person remain denied.
- [x] **O3:** Approve, decline, retry and request-more-info actions take `recordId` only. The server loads the record within the account, derives `organisationId` from it, authorises against the Task 4.1 scope, then calls the existing phased C1 services with that company. A client cannot route a decision to another company.
- [x] **O4:** Update the page and components: drop the company switcher from Leave approvals, show the company label on each item, keep the existing status, person, type and date filters.
- [x] **O5:** 'Sync Xero leave' (admins, `leave-approvals-client.tsx:247`; `ReconciliationActionSchema`, `_actions.ts:36`) takes no company: it dispatches a leave sync for every company with an active connection. Each dispatch is result-bearing (Task 2.2), so the action collects one `Result` per company and the page shows which companies queued and which failed; one failure never prevents the others. Test with three companies where one dispatch fails.
- [x] **E:** Convert the non-Xero exports (`listForApprover`, `getApprovalDetail`, the split parts of `getApprovalSummaryCounts`, `requestMoreInfo`, the database parts of `dispatchApprovalReconciliation` and `dispatchXeroLeaveSync`); Xero write exports stay phased (C1).
- [x] **P:** Convert `leave-approvals/page.tsx` and the read paths in `_actions.ts`; decision actions call the phased services with no surrounding transaction.
- [x] **Commit:** `feat(approvals): one queue across every company`.

### Task 4.7: Leave requests route to the requester's company

Outcome served: 2. **Expected today, not yet proved:** submit, approve, decline and withdraw use the record's own `organisation_id` (for example `approval-service.ts:1592`, `1756`, `1795`), and each company's connection is resolved with both tenancy keys. Plan actions still accept `organisationId` from the client (`plans/_actions.ts:60` onwards).

**Files:** `packages/availability/src/plans/plan-service.ts`, `submit-service.ts`, `submit-side-effects.ts`, `submit-recovery-service.ts`, `write-operation.ts`, `xero-write-claim.ts` and tests; `apps/app/app/(authenticated)/plans/_actions.ts`, `plans/record-form-data.ts`; `packages/database/plan-sync-multi-company.integration.test.ts` (extend)

- [x] **O1:** Failing integration test with companies A and B, each with a fake Xero connection: a staff member employed in B creates and submits leave, and an admin and a cross-company manager approve it; every Xero call and `OutboundOperation` uses B's connection and tenant, never A's. A request whose client-supplied `organisationId` disagrees with the record's company is rejected and makes no Xero call.
- [x] **O2:** Fix whatever the test shows. At minimum, derive the company from the person or record on the server rather than trusting the client value.
- [x] **O3:** Confirm the manager notification on submission reaches a manager employed in another company. Notification rules stay as they are; if the current lookup filters the manager by the record's company, fix the lookup, not the rule.
- [x] **E:** Convert `plan-service.ts`, `listSubmitRecoveryCandidates`, `xero-write-claim.ts` and the database parts of `submit-side-effects.ts` (its notification and sync dispatches follow the Task 2.2 split); Xero write exports stay phased (C1).
- [x] **P:** Convert `plans/page.tsx`, `plans/new/page.tsx`, `plans/[planId]/edit/page.tsx`, `plans/@modal/(.)new/page.tsx`, `plans/@modal/(.)[planId]/edit/page.tsx`, `plans/record-form-data.ts` and the read paths in `plans/_actions.ts`; submit and withdraw call phased services directly.
- [x] **Commit:** `test(plans): prove leave routes to the requester's company`.

### Shared expand steps (E)

Used by every E step in Stages 4 and 5. Add `db?: TenantDb` as the last parameter (rename existing `client?: Prisma.TransactionClient`), wrap the function body in one `inTenant(clerkOrgId, db, async (db) => ...)`, pass `db` to converted callees, and move fire-and-forget effects into `afterTenantCommit`; result-bearing sends stay outside (Task 2.2).

- [x] **E0 (precondition):** confirm no unsplit `Promise.all` over tenant queries (Task 2.3), no external call (Xero, Clerk, Stripe, Resend, KV read, Inngest send) between queries, and no catch-and-continue loop (hazard 6). Restructure or register first.
- [x] **E1:** extend the co-located test to call the function without `db` (opens its own transaction) and with a test `withTenantDb` `db` (reuses it; `$transaction` not called again), plus a cross-account mismatch that throws `TenantMismatchError`.
- **E2 (historical RED checkpoint):** Run the tests; expect FAIL. Original RED execution is not independently established by this reconciliation.
- [x] **E3:** Convert.
- [x] **E4:** Run the file's tests, `bun run typecheck` and `bun run test`; expect PASS.

### Shared entry-point steps (P)

- [x] **P1:** test that the entry point opens exactly one `withTenantDb` (or `withTenantResult` for actions returning `Result`), passes `db` to every service, and leaves no partial writes on an injected failure. Pages return plain data and close the transaction before rendering. Entry points that reach `getCalendarRange`, `previewFeed` or `projectFeedEvents` assert `TENANT_READ_TRANSACTION_OPTIONS`.
- **P2 (historical RED checkpoint):** Run; expect FAIL. Original RED execution is not independently established by this reconciliation; current GREEN verification is complete.
- [x] **P3:** convert: authenticate (`requireOrg`, `requireRole`) before opening; resolve the full data set inside the transaction; call phased flows (C1, C5, C6) outside it; call result-bearing sends (Task 2.2) after `withTenantDb` returns and return their `Result`; use `TENANT_READ_TRANSACTION_OPTIONS` (30 s) when reaching `getCalendarRange`, `previewFeed` or `projectFeedEvents`, otherwise the 15 s default; use `withTenantReads` only in registered fan-out loaders, at the top level of the entry point.
- [x] **P4:** run the slice's tests, `bun run test` and the relevant integration suites; expect PASS with no `TenantNestingError` from the detector.

---

## 8. Stage 5: Remaining areas (conversion only)

No behaviour change. Each service row follows the E steps and each entry-point row the P steps, converting services before the entry points that call them.

| Task | Services (E) | Entry points (P) |
|---|---|---|
| 5.1 Reference data | `duration/working-days.ts` (4), `holidays/holiday-service.ts` (3), `holidays/holiday-preferences.ts` (2), `holidays/resolve-public-holidays.ts`, `settings/audit-log-service.ts` (5), `xero-connection-state.ts`, `team-coverage/team-coverage-minimums.ts` (one internal `tenantTransaction`) | `public-holidays/page.tsx`, `public-holidays/_actions.ts`, `public-holidays/holidays/new/page.tsx`, `public-holidays/@modal/(.)holidays/new/page.tsx`, `public-holidays/holidays/new/form-data.ts`, `settings/holidays/page.tsx`, `settings/coverage/page.tsx` and `_actions.ts`, `settings/audit-log/page.tsx` and `_actions.ts` |
| 5.2 Records, analytics, onboarding | `records/manual-records-service.ts` (10), `analytics/out-of-office-service.ts` (4), `analytics/leave-reports-service.ts` (4), `onboarding/wizard-state.ts` (5) | `apps/api/app/api/availability/route.ts`, `availability/[recordId]/route.ts`, `actions/availability/manual.ts`, `analytics/out-of-office/page.tsx`, `analytics/leave-reports/page.tsx` and `_actions.ts`, `(setup)/onboarding/page.tsx` and `_actions.ts`, `(setup)/welcome/page.tsx` and `_actions.ts`, `setup/_actions.ts`, `settings/getting-started/page.tsx`, `(authenticated)/layout.tsx` (C7: its own transaction, separate from the page it wraps), `lib/server/load-onboarding-state.ts`, `lib/server/ensure-default-organisation.ts`, `lib/server/get-active-org-context.ts`, `lib/server/require-active-org-page-context.ts` |
| 5.3 Settings and notifications | (services converted in Stage 3 and Task 4.1) | `settings/general/page.tsx` and `_actions.ts` (Clerk phased), `settings/billing/page.tsx` and `actions.ts` (Stripe phased), `settings/layout.tsx`, `settings/feeds/page.tsx` and `_actions.ts`, `actions/settings/*.ts`, `notifications/page.tsx` and `_actions.ts`, `actions/notifications/manage.ts`, `apps/api/app/api/notifications/[notificationId]/mark-read/route.ts`, SSE stream (C3: per-lookup transactions) |
| 5.4 Sync monitor and integrations | `sync/sync-monitor-service.ts` (25; database parts only, using the Task 2.2 and 2.3 splits), `packages/xero/src/resolution/resolve-leave-type.ts` (2), `resolve-employee.ts` (2), `oauth/activation.ts` (1); OAuth service and disconnect stay phased (C6) | `settings/integrations/page.tsx`, `settings/integrations/xero/page.tsx`, `xero/_actions.ts`, `xero/connect/page.tsx` and `_actions.ts`, `xero/matches/page.tsx` and `_actions.ts`, `sync/page.tsx`, `sync/[runId]/page.tsx`, `sync/_actions.ts`, `apps/api/app/api/sync/dispatch/route.ts`, `apps/api/app/api/xero/oauth/*` (phased, C6) |
| 5.5 Webhooks and support | (database helpers converted in Task 3.1) | `apps/api/app/webhooks/auth/route.ts`, `apps/api/lib/support/persist-support-submission-audit.ts`, `apps/api/app/api/support/github-issue/route.ts` (external call outside the transaction); `apps/api/app/webhooks/payments/route.ts` through `apps/api/lib/stripe-event-delivery.ts` (phased, C6: Stripe retrieval and the Inngest send run outside the transaction; tenant billing queries such as `upsertSubscriptionFromWebhook` run in their own `withTenantDb`). Routes with no tenant access stay unchanged: `contact`, `early-access`, `inngest`, `cron/keep-alive`, `health`, `apps/app/app/api/csp-report` and `apps/web/app/rss.xml` |
| 5.6 Inngest, database-only steps | `handlers/sync-run-lifecycle.ts` (3), `handlers/recount-usage.ts` (3), `activation.ts` (3), `handlers/rebuild-feed-cache.ts` (2), `handlers/recover-xero-import-dispatch.ts` (1) | `recount-usage` (per account via `withTenantReads` if registered), `rebuild-feed-cache`, `send-notification-emails` (email send outside the transaction), `schedule-xero-syncs` `recover-xero-import-dispatch`: each `step.run` body opens one `withTenantDb` per account, with payload `clerk_org_id` and `organisation_id` as today. `reconcile-feed-publications` is phased (hazard 6; register its per-record function in Task 2.1): the candidate read runs in its own `withTenantDb`, then each `materialiseAvailabilityPublication` call keeps its own transaction with the existing per-record catch; add a test that a failure on one record leaves earlier and later records committed. Apply the same to any other catch-and-continue step E0 finds |
| 5.7 Inngest, Xero steps (C2) | (none) | `sync-xero-leave-records.ts`, `sync-xero-people.ts`, `sync-xero-leave-balances.ts`, `reconcile-xero-approval-state.ts`, `initial-xero-sync.ts`, `apps/api/lib/sync/execute-local-sync-fallback.ts`: one `withTenantDb` per batch or persistence phase; no transaction spans a Xero call; add a test that a failure in batch 3 leaves batches 1 and 2 committed |

Commit each row as `refactor(<package>): one tenant transaction per <area> request`.

---
## 9. Stage 6: Contract

### Task 6.1: Make `db` required

- [x] **Step 1:** Remove `?` from every `db?: TenantDb` parameter and replace each `inTenant(clerkOrgId, db, fn)` with `assertTenantDb(db, clerkOrgId)` followed by the body.
- [x] **Step 2:** `bun run typecheck`. Every remaining caller without `db` is a missed entry point; fix it with the P steps in the Stage 4 or Stage 5 task that owns it.
- [x] **Step 3:** Run all four gates. Expected: PASS.
- [x] **Step 4:** Commit `refactor: require TenantDb on all tenant services`.

### Task 6.2: Delete the per-query model

**Files:**
- Modify: `packages/database/src/tenant-client.ts` (delete `tenantDatabase`, `tenantTransaction`, `TenantDatabase`; keep `referenceDatabase` internal)
- Modify: `packages/database/src/tenant-db.ts` (delete `inTenant`)
- Modify: `packages/database/index.ts`, `packages/database/src/boundary.test.ts`

- [x] **Step 1:** Boundary test: `tenantDatabase(`, `tenantTransaction(` and `referenceDatabase` do not appear in production code outside `packages/database/src`; `withTenantDb(` appears only in entry-point modules, phased modules and `tenant-db.ts`. Entry-point modules are defined by path pattern, so the test needs no hand-maintained list: `apps/*/app/**/_actions.ts`, `apps/*/app/**/actions.ts`, `apps/*/app/actions/**`, `apps/*/app/**/route.ts`, `apps/*/app/**/page.tsx`, `apps/*/app/**/layout.tsx`, `apps/*/app/**/*-data.ts` and `form-data.ts` loaders, `apps/*/app/**/dashboard-body.tsx`, `apps/*/lib/server/**`, `apps/api/lib/**` and `packages/jobs/src/handlers/**`. A new entry-point file outside these patterns fails the test until the pattern list is extended deliberately.
- [x] **Step 2:** Delete and fix test fixtures that used the old helpers.
- [x] **Step 3:** Run all four gates. Expected: PASS.
- [x] **Step 4:** Commit `refactor(database): remove per-query tenant transactions`.

### Task 6.3: Documentation

**Files:**
- Modify: `AGENTS.md` (section "Database runtime roles and RLS" and "Query scoping pattern"), `SECURITY.md`, `PRODUCT.md` (tenancy section, roles, approvals and settings), `ScreenCatalogue.md` (Leave approvals, People, Dashboard, People profile)
- Modify: `docs/superpowers/specs/2026-10-11-tenant-database-round-trips-options.md` (status: decided, Option B with carve-outs, link to this plan)

- [x] **Step 1:** Replace the two-helper guidance with: entry points open `withTenantDb` / `withTenantResult`; services take `db: TenantDb` last and call `assertTenantDb`; side effects use `afterTenantCommit`; phased flows are registered and call `assertNoTenantTransaction`; external HTTP never runs inside a tenant transaction. Update the `listPeople` example.
- [x] **Step 1a:** Describe the multi-company behaviour as built: every role sees every company's approved leave subject to privacy rules; Dashboard and People default to all companies with a company filter; owners and admins approve from one combined queue; managers approve direct reports in any company; owners and admins assign managers from any company on the People profile; manager visibility is an account-level setting; per-request settings (decline reason, declined visibility, notifications, privacy default) stay per company.
- [x] **Step 2:** Commit `docs: describe multi-company approvals and request-scoped tenant transactions`.

### Task 6.4: Drop the per-company manager visibility column

- [x] **Step 1:** Confirm with a search that nothing reads `organisation_settings.manager_visibility_scope` (Task 4.1 moved every reader to `account_settings`).
- [x] **Step 2:** Edit `schema.prisma`, generate and apply the column-drop migration. All migrations subsequently executed from scratch through the owner's requested development reset; schema/checksum checks passed, and RLS/settings integration suites passed in CI.
- [x] **Step 3:** Commit `refactor(database): drop per-company manager visibility`.

---

## 10. Stage 7: Verify outcomes on Neon and release

- [ ] **Step 0 (outcome acceptance):** On the Neon preview, with one Clerk organisation holding two Xero demo companies (A and B), staff in each, and a manager employed in A assigned (Task 4.2) as manager of someone in B, record evidence (screenshots or test output) that: (1) an owner, admin, manager and viewer in A each see B's approved leave on the calendar and dashboard and in the default feed, with private and masked records handled as for A; People shows each role what its rules allow, across both companies. (2) Leave submitted by a B employee lands in B's Xero file and never A's. (3) An owner and an admin each see A and B requests together in Leave approvals, labelled by company, and can approve both; the A-employed manager can approve the B report's request. Any failure blocks release.
- [ ] **Step 1:** Re-run the Task 0.2 measurements on the Neon database configured in `.env.local` and append before and after figures to the measurements document. The owner's subsequent instruction supersedes the fresh isolated branch setup; no Neon API key is required to use the configured database. Retain the existing database and fixture guards.
- [ ] **Step 2:** Confirm no `tenant_db_unthreaded` warnings and no transaction timeout errors in Sentry on the preview deployment over a full sync cycle.
- [ ] **Step 3:** Run `bun run preflight app` and `bun run preflight api` against the preview.
- [x] **Step 4:** Record results and any verification gaps in `tasks/todo.md` (review section), per `AGENTS.md`.

---

## 11. Requirements checklist

| Requirement | Where satisfied |
|---|---|
| Invariant 1: context never visible to another request | Transaction-local `set_config` unchanged (Task 1.1); pooled-connection cleanup test (Task 1.2) |
| Invariant 2: no context means denied | Existing RLS test retained (Task 1.2); `withTenantDb` always sets context first |
| Invariant 3: explicit `clerk_org_id` and `organisation_id` filters remain | E steps change only the client, never `where` clauses. Account-wide queries in Tasks 4.3 to 4.6 follow the `AGENTS.md` pattern: validate the company set with `resolveAccountCompanies(clerkOrgId)` and filter `organisation_id: { in: ownedIds }` explicitly |
| Invariant 4: jobs carry both keys in payloads | Tasks 5.6 and 5.7 open transactions from payload keys only |
| Invariant 5: restricted role unchanged | The role keeps no `BYPASSRLS`, superuser or ownership; Task 4.1 adds one table with an RLS policy and an explicit `team_calendar_app` grant, reviewed per `AGENTS.md` |
| `au-contract-v1` idempotency | C1 phased flows, boundary-enforced (Task 2.1) |
| Isolated inbound record failures | C2 per-batch transactions with a test (Task 5.7) |
| Outbound writes surface inline, never queued | Unchanged; phased flows keep their synchronous calls |
| Spec test list (isolation, absence, mismatch, leakage, statement counts) | Tasks 1.1 and 1.2 |
| R1, R2, R3 visibility for every role, privacy kept | Tasks 4.1, 4.3, 4.4, 4.5; acceptance in Stage 7 Step 0 |
| R4 Dashboard and People default to all, filterable | Tasks 4.4 and 4.5 |
| R5 People rules unchanged across companies | Task 4.5 |
| R6 routing to the requester's company | Task 4.7 integration test; Stage 7 Step 0 |
| R7 one combined queue for owners and admins | Task 4.6 |
| R8 managers approve reports in any company | Tasks 4.1 and 4.6 |
| R9 manager assignment on the profile | Task 4.2 |
| R10 account-level manager visibility, most restrictive migration | Tasks 4.1 and 6.4 |
| R11 per-request settings follow the record's company | Task 4.6 |
| R12 notification rules unchanged | Task 4.7 Step O3 |
| R13 interleaved delivery | Stage 4 structure (O, then E and P steps per area) |
| R14 'Sync Xero leave' syncs every company | Task 4.6 Step O5 |
| Australian English, no em or en dashes in code comments and docs | All new text |

## 12. Risks and rollback

- **Reversibility.** Stages 0 to 5 are reversible commit by commit because `tenantDatabase` still works. Stage 6 removes it; do not start Stage 6 until Stages 4 and 5 have run on a preview branch for a full sync cycle. The Task 4.1 migration is the exception: it creates `account_settings` and backfills it, so roll it back with a down migration, not a revert alone.
- **Pool exhaustion.** Holding one connection per request may queue requests at peak. Mitigation: Stage 0 pool figures; `maxWait` of 5 s surfaces exhaustion as an error rather than a hang.
- **Longer lock holding.** Writes now commit at the end of the request, so row locks are held longer. Watch for lock waits in Stage 7.
- **Effect ordering.** Running sends after commit, whether through `afterTenantCommit` or in the entry point, fixes a latent race (a job reading data not yet committed) but changes timing; job tests in Tasks 5.6 and 5.7 cover it.
- **Split services.** Tasks 2.2 and 2.3 change the shape of some service functions before Stage 3 starts. Each split keeps a test proving the composed result matches the original.
- **Scope of churn.** Roughly 115 files change signatures; every slice must leave `main` green.

## 13. Resolved questions (12 October 2026)

1. Request timeout preset: 15 s for server actions and page loaders.
2. Failed fire-and-forget `afterTenantCommit` effects: retry once inline, then log and report to Sentry; the scheduled reconcilers remain the backstop.
3. Outcome requirements R1 to R13 (section 1).

### Stated assumptions (not enforced)

- A Clerk user has a person record in at most one company (R6). The plan adds no block, per the owner's decision. Where code must pick one record (acting-person lookup in Task 4.6), it takes the earliest-created match deterministically and logs a warning if more than one exists.
- Owners and admins approve without needing a person record, as today (`canUseApprovals`).
