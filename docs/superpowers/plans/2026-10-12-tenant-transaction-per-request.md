# One Tenant Transaction per Request (Option B with Carve-outs) Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans (when installed) to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax. This document authorises no execution in the planning turn. Each stage lands and passes all four CI gates before the next starts. Stage 0 ends at a decision gate that needs the owner's confirmation.

**Goal:** Remove the per-query tenant-context overhead (four statements per `tenantDatabase` query) by giving every server action, route handler, page data loader and database-only Inngest step exactly one tenant transaction, opened at the entry point and passed down explicitly as a `TenantDb` argument. Flows that must commit in phases, hold external calls or stay open keep their own short transactions (the carve-outs below).

**Source:** `docs/superpowers/specs/2026-10-11-tenant-database-round-trips-options.md`, Option B, amended.

**Decisions (confirmed 12 October 2026):**

- Option B is adopted with carve-outs, not as a blanket change. The literal Option B breaks three `AGENTS.md` rules (outbound idempotency, isolated inbound record failures, long-lived and concurrent entry points); the carve-outs below keep them.
- `tx` is passed explicitly. `AsyncLocalStorage` is used only as a guard that detects nested or missing threading; it never supplies a client.
- Option H (measurement on a Neon preview branch) runs first as Stage 0.

**Architecture:** A new `withTenantDb(clerkOrgId, fn)` opens one interactive transaction, sets `app.clerk_org_id` once (transaction-local, as today), and hands `fn` a branded `TenantDb`. Every service and query helper takes `db: TenantDb` as its last parameter and asserts it belongs to the `clerkOrgId` it was given. Fire-and-forget side effects (KV invalidation, SSE publish, notification fan-out) register through `afterTenantCommit(db, effect)` and run only after commit. Result-bearing side effects, whose outcome the user sees (for example an Inngest send that can return `dispatch_failed`), run in the entry point after `withTenantDb` returns, and their `Result` is returned to the caller. Parallel fan-out happens only at entry points, never inside a service that holds a `db`. Phased flows call `assertNoTenantTransaction()` and open one `withTenantDb` per phase. Migration is expand then contract: functions first accept an optional `db`, entry points then supply it, and finally `db` becomes required and `tenantDatabase` / `tenantTransaction` are deleted.

**Tech stack:** Existing Bun, Next.js App Router, TypeScript, Prisma 7 (`@prisma/adapter-neon` deployed, `@prisma/adapter-pg` local), Neon PostgreSQL, Inngest, Vitest, `node:async_hooks` (already used in `packages/jobs/src/handlers/xero-sync-access.ts`). No new dependencies.

**Inspected base:** `1b4b3f1` (main, "Support multiple Xero companies with tenant row-level security (#139)"). Read `AGENTS.md`, the options spec, `packages/database/src/tenant-client.ts`, `packages/availability/src/plans/write-operation.ts`, `packages/jobs/src/handlers/sync-xero-leave-records.ts`, `packages/jobs/src/handlers/xero-sync-access.ts`, `apps/api/app/api/notifications/stream/route.ts` and `packages/database/src/boundary.test.ts` first.

---

## 1. Findings

### Current footprint (production code, excluding tests and fixtures)

| Measure | Count |
|---|---|
| `tenantDatabase(` call sites | 378 across 109 files |
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
| C4 | Public ICS feed (`apps/api/app/ical/[token]/route.ts`) | Public token discovery uses `systemDatabase`; Option F is reserved for this path | Unchanged apart from the mechanical rename to `withTenantDb` for its existing tenant reads |
| C5 | Serializable feed publication (`packages/feeds/src/publication/feed-representation.ts:40`) | Isolation level is fixed when a transaction starts; it cannot join a Read Committed request transaction | Phased: keeps its own Serializable `withTenantDb`; callers run it outside their request transaction |
| C6 | Actions and services that call Clerk, Stripe or Xero OAuth before writing: `settings/general/_actions.ts`, `actions/settings/update-org.ts`, `people/_actions.ts`, `settings/integrations/xero/matches/_actions.ts`, `packages/xero/src/oauth/service.ts`, `packages/xero/src/oauth/disconnect.ts`, `packages/availability/src/people/xero-person-reconciliation.ts`, `packages/availability/src/people/clerk-access-service.ts` | External HTTP inside a transaction holds a pooled connection for the call's duration, and `disconnect.ts` must delete the remote connection before local teardown | Phased: external call before or after the transaction; results passed in |
| C7 | RSC pages and layouts | Layout and page render concurrently; a transaction cannot span rendering | One `withTenantDb` per data loader; loaders return plain data and close before render |
| C8 | Parallel fan-out readers (see Task 2.3 list) | One transaction serialises `Promise.all` on one connection, and a service holding a `db` cannot open further transactions (the nesting guard throws) | Fan-out moves to the entry point: the loader calls single-purpose service functions through `withTenantReads`, one transaction per branch, unless Stage 0 numbers favour serial. Services that fan out today are split (Task 2.3) |

### Semantic hazards inside non-carved paths

1. **`Result` failures do not roll back.** Services return `{ ok: false }` rather than throw, so a request transaction would commit any writes made before the failure. `withTenantResult` (Task 1.1) rolls back on `ok: false`. Any service that deliberately persists state and then returns `ok: false` must be phased; Task 2.2 inventories them.
2. **Side effects before commit.** Ten tenant files send Inngest events or dispatch notifications (`feeds/_actions.ts`, `notifications/src/dispatch.ts`, `submit-side-effects.ts`, `submit-service.ts`, `approval-service.ts`, `sync-monitor-service.ts`, `balance-refresh.ts`, and three job handlers) and five touch KV or feed cache invalidation (`feed-invalidation.ts`, `publication-service.ts`, `feed-service.ts`, `token-service.ts`, `rebuild-feed-cache.ts`). Inside a request transaction these must not run before commit. They split into two kinds:
   - **Fire-and-forget** (KV and feed cache invalidation, notification fan-out, SSE publish): move to `afterTenantCommit`. A failure is logged and left to the scheduled reconcilers.
   - **Result-bearing** (the caller returns the outcome to the user): run in the entry point after `withTenantDb` returns, and return their `Result`. Verified examples: `dispatchXeroSyncInternal` returns `dispatch_failed` to the caller (`approval-service.ts:874` to `888`), and `sync-monitor-service.ts:27` declares the same error. Moving these into `afterTenantCommit`, which logs and swallows failures, would report "queued" when nothing was queued. Task 2.2 inventories them.
3. **Nested `tenantTransaction` inside services.** Prisma has no nested interactive transactions; today a nested call silently opens a second connection with a separate commit and can deadlock on row locks held by the outer transaction. The guard in Task 1.1 makes this an error.
4. **Timeouts.** Prisma's 5 s interactive default would apply to whole requests. Request transactions use explicit presets (Task 1.1); account-wide reads keep `TENANT_READ_TRANSACTION_OPTIONS` (30 s).
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
//    an effect failure is logged and reported to Sentry, never rethrown
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

/** Expand-phase bridge. Deleted in Stage 5. */
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

- [ ] **Step 1:** Write `createRecordingTenantClient()`: a `pg.Pool` whose `connect` hook wraps each client's `query` to push the SQL text to an array, passed to `PrismaPg`, then wrapped exactly like `referenceDatabase`. Verify with one plain query that the adapter routes through `client.query`; if it does not, fall back to `log_statement=all` parsing as the spec did and record that in the test header.
- [ ] **Step 2:** Write failing-by-design assertions that record today's baseline: one `tenantDatabase` query sends 4 statements (`BEGIN`, `set_config`, query, `COMMIT`); three queries in one `tenantTransaction` send 6.
- [ ] **Step 3:** Add a concurrency-safety assertion: `Promise.all` of three different queries inside one `tenantTransaction` returns correct results with no transaction error, and the recorder shows them sent one after another on the one connection. Stage 4 relies on this for loaders that are not on the fan-out register.
- [ ] **Step 4:** Run `bunx vitest run packages/database/tenant-statement-counts.integration.test.ts` with `ALLOW_LOCAL_DATABASE_TESTS=1`. Expected: PASS.
- [ ] **Step 5:** Commit `test: record tenant statement counts per access pattern`.

### Task 0.2: Neon preview measurements

**Files:**
- Modify: `packages/database/src/standalone-client.ts` (opt-in query timing behind `TENANT_QUERY_TIMING=1`, logged through `@repo/observability`, off by default)
- Create: `docs/superpowers/specs/2026-10-12-tenant-round-trip-measurements.md`

- [ ] **Step 1:** Add the opt-in timing (count of tenant statements per request and per Inngest step, total database wall time). Unit test that it is inert when the flag is absent.
- [ ] **Step 2:** On a Neon preview branch with `DATABASE_APP_URL` as `team_calendar_app` and the production Vercel region, record: Vercel to Neon round-trip time; tenant statements per request for calendar, people, approvals, sync, dashboard and settings pages; tenant statements per Inngest step; p50 and p95 latency for those pages; effective `PrismaNeon` pool size and Neon pooled-endpoint connection limit.
- [ ] **Step 3:** For each Task 2.3 fan-out loader, record wall time with branches parallel (today) and with all branches in one transaction (temporary local patch, not committed).
- [ ] **Step 4:** Repeat the Task 0.1 Step 3 concurrency assertion against Neon through `PrismaNeon` (the integration test covers `PrismaPg` only). Record the result; if `PrismaNeon` errors on concurrent queries in one interactive transaction, every `Promise.all` inside a service must be removed in Stage 3 rather than left to serialise, and Gate 0 must note it.
- [ ] **Step 5:** Write the measurements document with the spec's decision rule applied: overhead = 3 × round trip × tenant queries on the critical path, compared with 10% of p95.
- [ ] **Step 6:** Commit `docs: record tenant round-trip measurements on Neon preview`.

### Gate 0 (owner decision)

Present the measurements document. Proceed to Stage 1 only on explicit confirmation. If no core page exceeds the 10% threshold, the spec recommends stopping at Option A; the owner decides whether Option B still proceeds for consistency.

---

## 4. Stage 1: Core API

### Task 1.1: `withTenantDb` and helpers

**Files:**
- Create: `packages/database/src/tenant-db.ts`
- Create: `packages/database/src/tenant-db.test.ts`
- Modify: `packages/database/index.ts` (export the API and error classes)
- Modify: `packages/database/src/tenant-client.ts` (move `TENANT_READ_TRANSACTION_OPTIONS` to `tenant-db.ts` and re-export; keep `tenantDatabase` / `tenantTransaction` working)

- [ ] **Step 1: Write failing unit tests** (mocked `referenceDatabase.$transaction`):
  - `withTenantDb` sets context once, passes the transaction client, returns `fn`'s value.
  - Calling `withTenantDb` inside `withTenantDb` throws `TenantNestingError`.
  - `assertTenantDb` passes for the owning account, throws `TenantMismatchError` for another account and for an unregistered client.
  - `afterTenantCommit` effects run after commit, in order, outside the scope (an effect may itself call `withTenantDb`); they never run when `fn` throws; an effect failure is logged and does not reject the call.
  - `withTenantResult` rolls back and returns the same `Result` object on `ok: false`; commits on `ok: true`.
  - `assertNoTenantTransaction` throws inside a scope and passes outside.
  - `withTenantReads` runs branches concurrently in separate transactions and returns keyed results.
  - `inTenant` reuses a supplied `db` (no new transaction) and opens one when `db` is absent.
  - Blank `clerkOrgId` throws (existing `assertTenant` behaviour).
- [ ] **Step 2:** Run `bunx vitest run packages/database/src/tenant-db.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3:** Implement per section 2. Errors are named classes so callers and tests can match them.
- [ ] **Step 4:** Run the test again. Expected: PASS.
- [ ] **Step 5:** Commit `feat(database): add withTenantDb request-scoped tenant transactions`.

### Task 1.2: Restricted-role integration tests

**Files:**
- Modify: `packages/database/row-level-security.integration.test.ts`
- Modify: `packages/database/tenant-statement-counts.integration.test.ts`

- [ ] **Step 1:** Add tests against the restricted role:
  - `withTenantDb(A)` never returns B rows, with 20 concurrent `withTenantDb(A)` and `withTenantDb(B)` calls interleaved.
  - A query with no context is denied (existing test retained).
  - After `withTenantDb` commits or rolls back, a query on the same pooled connection sees no `app.clerk_org_id` (`current_setting('app.clerk_org_id', true)` is empty).
  - `assertTenantDb(dbA, B)` throws before any statement is sent.
  - Statement count: three queries in one `withTenantDb` send 6 statements (`n + 3`).
- [ ] **Step 2:** Run `bun run test:integration --filter @repo/database`. Expected: PASS.
- [ ] **Step 3:** Commit `test(database): prove withTenantDb isolation, cleanup and statement counts`.

### Task 1.3: Migration-time detector in `tenantDatabase`

**Files:**
- Modify: `packages/database/src/tenant-client.ts`, `packages/database/src/tenant-client.test.ts`

- [ ] **Step 1:** Failing test: calling `tenantDatabase(x)` while a `withTenantDb` scope is active throws `TenantNestingError` when `NODE_ENV === "test"` and logs a structured warning (`tenant_db_unthreaded`, with a stack frame) otherwise. Same for `tenantTransaction`.
- [ ] **Step 2:** Implement using an exported `isTenantScopeActive()` from `tenant-db.ts`.
- [ ] **Step 3:** Run `bun run test`. Expected: PASS (no entry point opens a scope yet).
- [ ] **Step 4:** Commit `feat(database): detect unthreaded tenant access inside a request transaction`.

---

## 5. Stage 2: Classification and guard rails

### Task 2.1: Phased-module register

**Files:**
- Create: `packages/database/src/tenant-phased-modules.ts` (exported constant `PHASED_TENANT_MODULES`, a list of repository paths with a one-line reason each, covering C1, C2, C3, C5, C6)
- Modify: `packages/database/src/boundary.test.ts`

- [ ] **Step 1:** Failing boundary test: the first statement of every exported async function in a registered module is `assertNoTenantTransaction(` (source scan, same technique as `SYSTEM_IMPORT_ALLOWLIST`; first-statement position is checked rather than "before first database access" because it is unambiguous to scan), and no registered module accepts a `TenantDb` parameter.
- [ ] **Step 2:** Populate the register from the C1 to C6 rows in section 1.
- [ ] **Step 3:** Add `assertNoTenantTransaction("<function>")` as the first line of each phased export.
- [ ] **Step 4:** Run `bunx vitest run packages/database/src/boundary.test.ts` and `bun run test`. Expected: PASS.
- [ ] **Step 5:** Commit `refactor: register phased tenant flows and guard them against request transactions`.

### Task 2.2: Failure-persisting services

**Files:**
- Modify: `packages/database/src/tenant-phased-modules.ts`

- [ ] **Step 1:** Search every non-phased service for writes followed by an `ok: false` return (status transitions to failure states, failure audit events, attempt counters). Add each to the register with reason "persists state on failure", or restructure so the failure write happens in its own phase.
- [ ] **Step 2:** Inventory result-bearing side effects: every Inngest send or notification dispatch whose failure reaches the caller as a `Result` error (for example `dispatch_failed`). Starting points, verified on `main`: `dispatchXeroSyncInternal` behind `dispatchApprovalReconciliation` and `dispatchXeroLeaveSync` (`approval-service.ts:781` to `888`), and the `dispatch_failed` paths in `sync-monitor-service.ts` (declared at line 27); then check `feeds/_actions.ts`, `submit-side-effects.ts`, `submit-service.ts` and `balance-refresh.ts`. For each, split the function so the database part takes `db` and the send is a separate function called by the entry point after `withTenantDb` returns. Record the list in this task's commit message.
- [ ] **Step 3:** Add a unit test per affected function proving the failure state is still persisted, and a test per split send proving a failed send still returns its error `Result` to the caller.
- [ ] **Step 4:** Commit `refactor: phase failure-persisting services and split result-bearing sends`.

### Task 2.3: Fan-out register

**Files:**
- Create: `packages/database/src/tenant-fan-out.ts` (documented list of entry-point loaders allowed to use `withTenantReads`)

Fan-out can only happen at an entry point. A service that receives a `db` is already inside a transaction; the nesting guard stops it opening more, and `Promise.all` on its `db` serialises on one connection. Services that fan out today are therefore split, and the parallelism moves to the entry point that calls them.

- [ ] **Step 1:** Identify the services that fan out today, to confirm against Stage 0 numbers: `getApprovalSummaryCounts` (`approval-service.ts:510`; four counts in `Promise.all` at line 538), sync monitor summaries (`sync-monitor-service.ts`), dashboard summaries (`dashboard-service.ts`), plan summaries (`plan-service.ts`), `current-status.ts`, `feed-scope.ts`, `feed-service.ts`, `getFeedOversightCounts`, and the per-account loop in `recountUsage` (`recount-usage.ts`). Keep a service on the list only where Stage 0 shows parallel is faster; the rest keep `Promise.all` on their `db` and run serially.
- [ ] **Step 2:** For each retained service, split it into single-purpose functions that each take `db` (for example `countPendingApprovals(input, db)`), and keep a thin composing function with no `db` parameter that the entry point calls. Unit test that each part returns the same values as the original function.
- [ ] **Step 3:** Register the entry-point loaders that call the composing functions through `withTenantReads`: initially `leave-approvals/page.tsx`, `dashboard-body.tsx`, `sync` page loaders, `settings/general/page.tsx`, `settings/billing/page.tsx`, the feeds pages, and the `recount-usage` step.
- [ ] **Step 4:** Boundary test: `withTenantReads(` appears only in registered entry-point modules, never under `packages/*/src` other than `packages/jobs/src/handlers`.
- [ ] **Step 5:** Run `bun run test`. Expected: PASS.
- [ ] **Step 6:** Commit `refactor: move tenant fan-out to entry points`.

---

## 6. Stage 3: Expand (thread `db` through)

This stage is not purely mechanical. Wrapping a whole function body in `inTenant` turns several per-query transactions into one per-function transaction, which serialises any internal `Promise.all` and would hold the transaction across any external call in the middle of the function. Each task therefore starts with a precondition check.

Rule for every task in this stage: add `db?: TenantDb` as the **last** parameter (rename existing `client?: Prisma.TransactionClient` to `db?: TenantDb`); replace each `tenantDatabase(clerkOrgId).x` and internal `tenantTransaction(clerkOrgId, fn)` in the function with one `inTenant(clerkOrgId, db, async (db) => ...)` wrapping the function body; pass `db` to every callee that has already been converted; move fire-and-forget effects (KV invalidation, notification fan-out) into `afterTenantCommit(db, ...)`. Result-bearing sends were split out in Task 2.2 and stay outside. Convert bottom-up so callees are always converted before callers. Phased modules are not converted in this stage.

Each task follows the same steps:

- [ ] **Step 0 (precondition):** For every function in the task, confirm it has no `Promise.all` over tenant queries that Task 2.3 did not already split, and no external call (Xero, Clerk, Stripe, Resend, KV read, Inngest send) between database queries. Restructure or register any function that fails before converting it; do not convert first and fix afterwards.
- [ ] **Step 1:** Add or extend the co-located test so it calls the function both without `db` (opens its own transaction) and with a `db` from a test `withTenantDb` (reuses it, asserted by spying that `$transaction` is not called again). Add a mismatch test where a `db` for another account throws `TenantMismatchError`.
- [ ] **Step 2:** Run the file's tests. Expected: FAIL.
- [ ] **Step 3:** Convert.
- [ ] **Step 4:** Run the file's tests, then `bun run typecheck` and `bun run test`. Expected: PASS.
- [ ] **Step 5:** Commit `refactor(<package>): thread TenantDb through <area>`.

| Task | Files (call sites) |
|---|---|
| 3.1 Database query helpers | `packages/database/src/queries/`: `outbound-operations.ts` (8), `onboarding.ts` (6), `notifications.ts` (6), `billing.ts` (5), `availability-records.ts` (5), `sync-runs.ts` (4), `xero-connections.ts` (3), `teams.ts` (3), `organisations.ts` (3), `feeds.ts` (3), `xero-sync-cursors.ts` (2), `people.ts` (2), `leave-balances.ts` (2), `xero-connection-state.ts`, `support-submissions.ts`, `public-holiday-resolution.ts`, `activation-dashboard.ts`, `account-companies.ts` (1 each); `organisation-settings/repository.ts` (2) |
| 3.2 Notifications | `notification-service.ts` (5), `preferences-service.ts` (3), `email-queue-service.ts` (2), `dispatch.ts` (2; fire-and-forget dispatch moves to `afterTenantCommit`; any caller that returns the dispatch outcome uses the Task 2.2 split) |
| 3.3 Availability: reference data | `duration/working-days.ts` (4), `holidays/holiday-service.ts` (3), `holidays/holiday-preferences.ts` (2), `holidays/resolve-public-holidays.ts`, `settings/organisation-settings-service.ts`, `settings/manager-scope.ts`, `settings/audit-log-service.ts` (5), `xero-connection-state.ts` |
| 3.4 Availability: people | `people/people-service.ts` (13), `people/current-user-service.ts` (11), `people/current-status.ts` (8), `people/manual-balance-service.ts` (6), `people/alternative-contact-service.ts` (6), `people/balance-refresh.ts` (4; sync dispatch to `afterTenantCommit` only if no caller returns its outcome, otherwise the Task 2.2 split) |
| 3.5 Availability: records, calendar, analytics, dashboard | `records/manual-records-service.ts` (10), `calendar/calendar-service.ts` (4), `analytics/out-of-office-service.ts` (4), `analytics/leave-reports-service.ts` (4), `dashboard/dashboard-service.ts` (4), `onboarding/wizard-state.ts` (5) |
| 3.6 Availability: plans and approvals (non-Xero exports) | `plans/plan-service.ts` (8); reads in `approvals/approval-service.ts` (`listForApprover`, `getApprovalDetail`, the split parts of `getApprovalSummaryCounts`); `requestMoreInfo`, a database-only write (status change and audit event, no Xero call); the database parts of `dispatchApprovalReconciliation` and `dispatchXeroLeaveSync` as split in Task 2.2 (the send stays with the entry point); `plans/submit-recovery-service.ts` `listSubmitRecoveryCandidates`. Xero write exports stay phased (C1) |
| 3.7 Availability: sync monitor | `sync/sync-monitor-service.ts` (25; database parts only, using the Task 2.2 and 2.3 splits; result-bearing dispatch stays with the entry point) |
| 3.8 Feeds | `scope/feed-scope.ts` (8), `feed-service.ts` (7), `render/render-feed.ts` (5), `tokens/token-service.ts` (2), `cache/feed-invalidation.ts` (2; KV calls to `afterTenantCommit`), `projection/feed-projection.ts`, `publication/publication-service.ts`. `feed-representation.ts` stays phased (C5) |
| 3.9 Xero resolution | `packages/xero/src/resolution/resolve-leave-type.ts` (2), `resolve-employee.ts` (2), `oauth/activation.ts` (1). OAuth service and disconnect stay phased (C6) |
| 3.10 Jobs, database-only helpers | `handlers/sync-run-lifecycle.ts` (3), `handlers/recount-usage.ts` (3), `activation.ts` (3), `handlers/rebuild-feed-cache.ts` (2), `handlers/reconcile-feed-publications.ts` (1), `handlers/recover-xero-import-dispatch.ts` (1) |

---

## 7. Stage 4: Entry points open the transaction

Each slice converts every entry point in one area so the detector from Task 1.3 proves no unthreaded access remains. Steps per slice:

- [ ] **Step 1:** Write or extend the entry point's test: it opens exactly one `withTenantDb` (or `withTenantResult` for actions returning `Result`), passes `db` to every service, and an injected service failure leaves no partial writes. For pages, the loader returns plain data and the transaction is closed before the component renders.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Convert: authenticate (`requireOrg`, `requireRole`) before opening; resolve the full data set inside the transaction; call phased flows (C1, C5, C6) outside it; call result-bearing sends (Task 2.2) after `withTenantDb` returns and return their `Result`; use `withTenantReads` only in registered fan-out loaders (Task 2.3), and only at the top level of the entry point, never inside another `withTenantDb`.
- [ ] **Step 4:** Run the slice's tests, `bun run test`, and the relevant integration suites. Expected: PASS, with no `TenantNestingError` from the detector.
- [ ] **Step 5:** Commit `refactor(app): one tenant transaction per <area> request`.

| Slice | Entry points |
|---|---|
| 4.1 Calendar and dashboard | `calendar/page.tsx`, `dashboard-body.tsx`, `(authenticated)/page.tsx` loader, `apps/api/app/api/availability/route.ts`, `availability/[recordId]/route.ts`, `actions/availability/manual.ts` |
| 4.2 People | `people/page.tsx`, `people/[personId]/page.tsx`, `people/@modal/(.)[personId]/page.tsx`, `people/_actions.ts` (Clerk calls phased, C6), `people/new/_actions.ts`, `lib/server/create-manual-person.ts`, `lib/server/load-onboarding-people.ts` |
| 4.3 Approvals and plans (reads) | `leave-approvals/page.tsx`, read paths in `leave-approvals/_actions.ts`, `plans/record-form-data.ts`, read paths in `plans/_actions.ts`. Approve, decline, submit and withdraw actions call the phased services directly with no surrounding transaction |
| 4.4 Settings | `settings/general/page.tsx` and `_actions.ts` (Clerk phased), `settings/billing/page.tsx` and `actions.ts` (Stripe phased), `settings/holidays/page.tsx`, `settings/coverage/_actions.ts`, `settings/leave-approval/_actions.ts`, `settings/audit-log/_actions.ts`, `settings/feeds/_actions.ts`, `actions/settings/*.ts` |
| 4.5 Integrations and sync | `settings/integrations/page.tsx`, `settings/integrations/xero/page.tsx`, `xero/_actions.ts`, `xero/connect/_actions.ts`, `xero/matches/page.tsx` and `_actions.ts`, `sync/_actions.ts`, `apps/api/app/api/sync/dispatch/route.ts`, `apps/api/app/api/xero/oauth/*` (phased, C6) |
| 4.6 Feeds | `feeds/new/page.tsx`, `feeds/@modal/(.)new/page.tsx`, `feeds/_actions.ts`, `apps/api/app/api/feeds/route.ts`, `feeds/[feedId]/route.ts`, `feeds/[feedId]/rotate-token/route.ts`, `ical/[token]/route.ts` (C4: rename only) |
| 4.7 Holidays, analytics, notifications | `public-holidays/page.tsx`, `public-holidays/_actions.ts`, `public-holidays/holidays/new/form-data.ts`, `analytics/out-of-office/page.tsx`, `analytics/leave-reports/page.tsx` and `_actions.ts`, `notifications/_actions.ts`, `actions/notifications/manage.ts`, `apps/api/app/api/notifications/[notificationId]/mark-read/route.ts`, SSE stream (C3: per-lookup transactions) |
| 4.8 Onboarding and setup | `(setup)/onboarding/_actions.ts`, `(setup)/welcome/_actions.ts`, `setup/_actions.ts`, `lib/server/load-onboarding-state.ts`, `lib/server/ensure-default-organisation.ts`, `lib/server/get-active-org-context.ts`, `lib/server/require-active-org-page-context.ts` |
| 4.9 Webhooks and support | `apps/api/app/webhooks/auth/route.ts`, `apps/api/lib/support/persist-support-submission-audit.ts`, `apps/api/app/api/support/github-issue/route.ts` (external call outside the transaction) |
| 4.10 Inngest, database-only steps | `recount-usage` (per account via `withTenantReads` if registered), `rebuild-feed-cache`, `reconcile-feed-publications`, `send-notification-emails` (email send outside the transaction), `schedule-xero-syncs` `recover-xero-import-dispatch`. Each `step.run` body opens one `withTenantDb` per account it touches, with event payload `clerk_org_id` and `organisation_id` as today |
| 4.11 Inngest, Xero steps (C2) | `sync-xero-leave-records.ts`, `sync-xero-people.ts`, `sync-xero-leave-balances.ts`, `reconcile-xero-approval-state.ts`, `initial-xero-sync.ts`, `apps/api/lib/sync/execute-local-sync-fallback.ts`: replace per-query `tenantDatabase` with one `withTenantDb` per batch or persistence phase; no transaction spans a Xero call; add a test that a failure in batch 3 leaves batches 1 and 2 committed |

---

## 8. Stage 5: Contract

### Task 5.1: Make `db` required

- [ ] **Step 1:** Remove `?` from every `db?: TenantDb` parameter and replace each `inTenant(clerkOrgId, db, fn)` with `assertTenantDb(db, clerkOrgId)` followed by the body.
- [ ] **Step 2:** `bun run typecheck`. Every remaining caller without `db` is a missed entry point; fix it in the owning Stage 4 slice's style.
- [ ] **Step 3:** Run all four gates. Expected: PASS.
- [ ] **Step 4:** Commit `refactor: require TenantDb on all tenant services`.

### Task 5.2: Delete the per-query model

**Files:**
- Modify: `packages/database/src/tenant-client.ts` (delete `tenantDatabase`, `tenantTransaction`, `TenantDatabase`; keep `referenceDatabase` internal)
- Modify: `packages/database/src/tenant-db.ts` (delete `inTenant`)
- Modify: `packages/database/index.ts`, `packages/database/src/boundary.test.ts`

- [ ] **Step 1:** Boundary test: `tenantDatabase(`, `tenantTransaction(` and `referenceDatabase` do not appear in production code outside `packages/database/src`; `withTenantDb(` appears only in entry-point modules, phased modules and `tenant-db.ts`. Entry-point modules are defined by path pattern, so the test needs no hand-maintained list: `apps/*/app/**/_actions.ts`, `apps/*/app/**/actions.ts`, `apps/*/app/actions/**`, `apps/*/app/**/route.ts`, `apps/*/app/**/page.tsx`, `apps/*/app/**/layout.tsx`, `apps/*/app/**/*-data.ts` and `form-data.ts` loaders, `apps/*/app/**/dashboard-body.tsx`, `apps/*/lib/server/**`, `apps/api/lib/**` and `packages/jobs/src/handlers/**`. A new entry-point file outside these patterns fails the test until the pattern list is extended deliberately.
- [ ] **Step 2:** Delete and fix test fixtures that used the old helpers.
- [ ] **Step 3:** Run all four gates. Expected: PASS.
- [ ] **Step 4:** Commit `refactor(database): remove per-query tenant transactions`.

### Task 5.3: Documentation

**Files:**
- Modify: `AGENTS.md` (section "Database runtime roles and RLS" and "Query scoping pattern"), `SECURITY.md`, `PRODUCT.md` (tenancy section, if it names the helpers)
- Modify: `docs/superpowers/specs/2026-10-11-tenant-database-round-trips-options.md` (status: decided, Option B with carve-outs, link to this plan)

- [ ] **Step 1:** Replace the two-helper guidance with: entry points open `withTenantDb` / `withTenantResult`; services take `db: TenantDb` last and call `assertTenantDb`; side effects use `afterTenantCommit`; phased flows are registered and call `assertNoTenantTransaction`; external HTTP never runs inside a tenant transaction. Update the `listPeople` example.
- [ ] **Step 2:** Commit `docs: describe request-scoped tenant transactions`.

---

## 9. Stage 6: Verify on Neon and release

- [ ] **Step 1:** Re-run the Task 0.2 measurements on a fresh Neon preview branch and append before and after figures to the measurements document.
- [ ] **Step 2:** Confirm no `tenant_db_unthreaded` warnings and no transaction timeout errors in Sentry on the preview deployment over a full sync cycle.
- [ ] **Step 3:** Run `bun run preflight app` and `bun run preflight api` against the preview.
- [ ] **Step 4:** Record results and any verification gaps in `tasks/todo.md` (review section), per `AGENTS.md`.

---

## 10. Requirements checklist

| Requirement | Where satisfied |
|---|---|
| Invariant 1: context never visible to another request | Transaction-local `set_config` unchanged (Task 1.1); pooled-connection cleanup test (Task 1.2) |
| Invariant 2: no context means denied | Existing RLS test retained (Task 1.2); `withTenantDb` always sets context first |
| Invariant 3: explicit `clerk_org_id` and `organisation_id` filters remain | Stage 3 rule changes only the client, never `where` clauses; reviewers reject any filter removal |
| Invariant 4: jobs carry both keys in payloads | Tasks 4.10 and 4.11 open transactions from payload keys only |
| Invariant 5: restricted role unchanged | No migration or grant changes in this plan |
| `au-contract-v1` idempotency | C1 phased flows, boundary-enforced (Task 2.1) |
| Isolated inbound record failures | C2 per-batch transactions with a test (slice 4.11) |
| Outbound writes surface inline, never queued | Unchanged; phased flows keep their synchronous calls |
| Spec test list (isolation, absence, mismatch, leakage, statement counts) | Tasks 1.1 and 1.2 |
| Australian English, no em or en dashes in code comments and docs | All new text |

## 11. Risks and rollback

- **Reversibility.** Stages 0 to 4 are reversible commit by commit because `tenantDatabase` still works. Stage 5 removes it; do not start Stage 5 until Stage 4 has run on a preview branch for a full sync cycle.
- **Pool exhaustion.** Holding one connection per request may queue requests at peak. Mitigation: Stage 0 pool figures; `maxWait` of 5 s surfaces exhaustion as an error rather than a hang.
- **Longer lock holding.** Writes now commit at the end of the request, so row locks are held longer. Watch for lock waits in Stage 6.
- **Effect ordering.** Running sends after commit, whether through `afterTenantCommit` or in the entry point, fixes a latent race (a job reading data not yet committed) but changes timing; job tests in slices 4.10 and 4.11 cover it.
- **Split services.** Tasks 2.2 and 2.3 change the shape of some service functions before Stage 3 starts. Each split keeps a test proving the composed result matches the original.
- **Scope of churn.** Roughly 109 files change signatures; every slice must leave `main` green.

## 12. Open questions for the owner

1. Request timeout preset: is 15 s acceptable for server actions and page loaders, given Vercel function limits on the `app` project?
2. Should a failed `afterTenantCommit` effect (for example an Inngest send) be retried inline once, or only logged and left to the scheduled reconcilers?
