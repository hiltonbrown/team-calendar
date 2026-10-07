# Xero Simplification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking. This document authorises no execution in the planning turn.

**Goal:** Replace the development-only Plan 161 lifecycle with canonical Xero OAuth credentials, selected scoped connections and provider-native refresh, incremental reads, idempotency and disconnect.

**Architecture:** Four lifecycle entities: `XeroAuthorisation`, `XeroConnection`, short-lived `XeroOAuthSession` and provider-watermark `XeroSyncCursor`. Keep the existing payroll domain, synchronous leave journal, regional adapters, Inngest inbound workers and shared rate limiter; delete obsolete recovery, reservation, compatibility and campaign infrastructure.

**Tech Stack:** Existing Bun 1.4.0, Next.js, TypeScript, Prisma 7.10.0/PostgreSQL, Clerk, Inngest, Redis, JOSE, Zod and Vitest; no dependency upgrade or new framework.

**Spec:** [Xero simplification design](../specs/2026-10-07-xero-simplification-design.md). Read it and `AGENTS.md` before execution. Inspected base: `338f86f521d70dccecdc2713c4b5a0e7dbd463bf`.

## Global constraints

- No production users, Xero connections, customer Xero migrations or backwards compatibility. No token mirrors, legacy refresh, backfills, binding generations, active slots, reservation/cleanup/refresh-attempt state machines or generic accounting-provider abstraction.
- Preserve Clerk Organisation and payroll Organisation isolation, Xero source-of-truth balances, synchronous outbound writes, AU submit-local/create-on-approval and separate AU/NZ/UK adapters. Activation stays AU-only.
- Consent is exactly `offline_access accounting.settings.read payroll.employees payroll.settings.read`. Store actual granted consent and recognise read/write grants for reads.
- Use AES-256-GCM canonical token envelopes, one automatic refresh path, distributed PostgreSQL locks, two-minute expiry margin, 30-minute provider refresh grace and dormant rotation at 45 days.
- Provider idempotency retention is six minutes; application replay cutoff is five minutes from first dispatch. Keys are immutable UUIDs, at most 128 characters; no ambiguous replay beyond cutoff or from an outbound background job.
- AU modification watermarks advance after complete successful traversal; requests overlap by two minutes. No absent-row archival on incrementals or incomplete full reads.
- Remote DELETE succeeds or establishes owned-target absence before local disconnect/purge. Invalid grants and response loss do not establish remote deletion.
- Database access stays in `packages/database`; Xero wire shapes stay in `packages/xero`. Scope all customer queries by both tenant identifiers. Secrets never enter client DTOs, jobs, logs or evidence.
- Keep Australian English and no em dashes. Use existing framework/test conventions and actual observed requirements. Apply the spec's five simplicity questions to every addition.
- Execute on one isolated development branch using the worktree skill at execution time. Intermediate schema-breaking commits are development checkpoints, not deployable releases. No compatibility shims are required to keep old callers working between tasks.

## Review focus

1. Two payroll entities share one Xero grant; one disconnect must leave the sibling usable (Tasks 2, 5, 8).
2. Reauthorisation arrives while an old token refresh is in flight; old credentials must never replace the new grant (Tasks 2, 4, 5).
3. An empty delta or malformed page must not remove staff/leave or skip a failed record forever (Task 6).
4. Provider write succeeds but response or local commit is lost; late retry must never create duplicate payroll leave (Task 7).
5. A paused connection approaches refresh-token expiry, or DELETE succeeds before a local transaction fails; recover honestly without cleanup machinery (Tasks 5, 8, 9).

## Execution and verification conventions

Tasks are sequential because they replace shared schema/interfaces. Each has its own red/green check and reviewable result; final repository gates run after all consumers are updated. Before each task, reread its inputs/interfaces and the relevant spec section. Do not execute old Plan 160/161 campaigns while implementing this replacement.

All commands below run from `/workspace/team-calendar` unless stated. Use the existing React-server-aware Vitest config for package tests:

```bash
NODE_ENV=test bunx vitest run --config tooling/vitest.config.mts <exact-test-files> -t '<test name>'
```

For app/API tests use their package directory and existing `vitest.config.mts`. Integration tests require the ordinary disposable local PostgreSQL/Redis fixture setup and `ALLOW_LOCAL_DATABASE_TESTS=1`, never an inherited non-local Neon URL. Task commands mentioning that flag apply only to an explicitly local disposable database. No test may silently skip its promised assertion. Run the failing regression before production edits, then the same command after implementation. Refactor only after green. Commit each task's exact owned files with the suggested message; no broad staging of unrelated work.

## File responsibilities and shared interfaces

| File | Responsibility |
| --- | --- |
| `packages/database/src/queries/xero-authorisation.ts` (new) and public `queries/xero-authorisation.ts` | Canonical credential persistence and internal due-grant enumeration; server-only |
| `packages/database/src/queries/xero-connections.ts` (new) and public `queries/xero-connections.ts` | Scoped selected connection CRUD/DTO/roster progress |
| `packages/database/src/queries/xero-sync-cursors.ts` (new) and public `queries/xero-sync-cursors.ts` | Scoped monotonic provider watermarks |
| `packages/database/src/xero-locks.ts` (new) | PostgreSQL app shared/exclusive and authorisation/connection transaction locks |
| `packages/xero/src/oauth/service.ts` (rewrite) | Start, validate callback, discover and select tenant; no refresh or cleanup pipeline |
| `packages/xero/src/oauth/authorisation.ts` (new) | Canonical adoption, fresh scoped access, scope checks and the only token refresh |
| `packages/xero/src/oauth/disconnect.ts` (new) | User-token DELETE before local disconnect transaction |
| `packages/xero/src/oauth/scopes.ts` (new) | Exact consent and read/write capability alternatives |
| `packages/xero/src/rate-limit/xero-fetch.ts` (simplify) | Shared bounded HTTP and safe retry/correlation policy |
| Existing `au/read.ts`, `nz/read.ts`, `uk/read.ts`, `au/write.ts` | Regional wire contracts, explicit filter/idempotency capabilities |
| Existing jobs and availability services | Real import/domain work, preserving stable canonical/publication identity |

Shared types are Xero-specific and server-only unless explicitly safe:

```typescript
type XeroScope = { clerkOrgId: string; organisationId: string };
type XeroAccessContext = XeroScope & {
  connectionId: string; xeroTenantId: string;
  payrollRegion: "AU" | "NZ" | "UK";
  accessToken: string; deadline: XeroDeadline;
};
type XeroSyncMode = "full" | "incremental";
type XeroMutationIdentity = {
  idempotencyKey: string; firstDispatchedAt: Date; replayBefore: Date;
};
```

`XeroDeadline` remains in `packages/xero/src/rate-limit/deadline.ts`; `XeroMutationIdentity` is defined in `packages/xero/src/write/types.ts`. The existing core `ExternalWritePort` accepts the same neutral structural mutation fields without importing Xero types. Database lock helpers consume an absolute deadline timestamp in milliseconds, not a Xero package import. Extending the existing leave port does not create a provider registry or accounting framework.

### Task 1: Replace lifecycle schema and generate destructive DDL

**Files:** Modify `packages/database/prisma/schema.prisma`; create `packages/database/xero-simplification-schema.integration.test.ts` and `packages/database/src/test-fixtures/xero-simplification-fixture.ts`; rewrite `packages/database/xero-tenancy.integration.test.ts`; regenerate `packages/database/generated/`; create one Prisma-generated `packages/database/prisma/migrations/<generated_timestamp>_simplify_xero_lifecycle/migration.sql`. Delete `packages/database/xero-lifecycle-migration.integration.test.ts` after replacing useful assertions.

**Interfaces:** Produces the four entities and scoped FKs in spec section 4. `LeaveBalance` and `SyncRun` expose `xero_connection_id`, never internal tenant IDs. Connection enum is `active | reconnect_required | disconnected`; authorisation enum is `active | reconnect_required`; session phases match the spec. Outbound operation action becomes `approve | decline | withdraw`, removing obsolete remote-submit action; Task 7 owns behaviour.

- [ ] Write the real-database tests `stores one grant for two scoped connections`, `rejects a cursor attached to another account`, `preserves manual balance uniqueness`, and `has exactly four lifecycle models`. Insert/read actual rows; assert duplicate canonical user/app or Organisation connection violates uniqueness, wrong composite ownership FK fails, and tables to delete are absent. Add a fresh migration-chain test, not mocked Prisma assertions. The small test-only fixture creates an explicitly local guarded PrismaPg client and owned rows/cleanup, bypassing neither the non-local guard nor any live target; it does not import the obsolete campaign wrapper. Reuse it in subsequent new integration tests and update package exports where tests require it.
- [ ] RED: `ALLOW_LOCAL_DATABASE_TESTS=1 NODE_ENV=test bunx vitest run --config tooling/vitest.config.mts packages/database/xero-simplification-schema.integration.test.ts packages/database/xero-tenancy.integration.test.ts`. Expected failure: old table/column structure and missing target constraints, not a skipped suite or connection failure.
- [ ] Change schema: create canonical envelopes/identity/scopes/refresh metadata; move selected tenant/remote link/region/sync fields onto connection; remove connection/session token copies and all seven obsolete models/enums. Add scoped composite FKs and direct tenant/remote-link uniqueness. Move local balance/regional leave continuations to connection; make cursor `modified_since` a timestamp for people/leave only. Replace balance/run FKs and the manual partial unique index consistently.
- [ ] Extend existing `OutboundOperation` with nullable `idempotency_key` (unique), `request_xero_tenant_id`, `request_method`, `request_url`, exact canonical `request_body_json` (nullable for bodyless actions), `idempotency_first_dispatched_at` and `idempotency_replay_before`. Preserve actor, attempt generation and existing dispatch/accepted/completed timestamps; do not add a second operation table. Non-dispatched local submit/decline/withdraw create no provider operation.
- [ ] Enable `previewFeatures = ["partialIndexes"]` in the existing Prisma generator and declare `@@unique([person_id, leave_type_xero_id], map: "leave_balances_person_id_leave_type_xero_id_manual_key", where: raw("xero_connection_id IS NULL"))` on `LeaveBalance`. Prisma 7.10 can generate this predicate without a package upgrade or handwritten SQL. Generate DDL on a disposable empty-Xero development database using `bunx prisma migrate dev --name simplify_xero_lifecycle --create-only` from `packages/database`, then apply/generate. No backfill or prior-schema compatibility. Preserve historical migration files, unrelated billing/feed/journal constraints and migration trust checks.
- [ ] GREEN: rerun the same database tests, generate client, deploy the complete chain to a second fresh database and run `bunx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code` from `packages/database`. Expect all assertions executed and exit 0, no schema difference.
- [ ] Commit: `refactor(database): simplify Xero lifecycle schema`.

### Task 2: Scoped query boundaries and PostgreSQL grant locks

**Files:** Create the four database source modules in the responsibility table, their three query wrappers, co-located `.test.ts` files and `packages/database/xero-authorisation-locks.integration.test.ts`. Modify `packages/database/src/queries/xero-connection-state.ts`, its wrapper/test, `packages/database/src/queries/leave-balances.ts`, `packages/database/src/client.ts`, `packages/database/index.ts`, `packages/database/package.json`, `packages/database/QUERIES.md`. Replace `src/queries/schedulable-xero-tenants.ts` and `queries/schedulable-xero-tenants.ts` with `schedulable-xero-connections.ts` at both locations and its test.

**Interfaces:**

- `getScopedXeroConnection(scope: XeroScope & { connectionId?: string })`: server-only Result of selected connection and encrypted authorisation; always both scope filters.
- `listSchedulableXeroConnections(now: Date)`: safe routing/health rows; no token fields.
- `withXeroGrantLock<T>({ providerAppId, mode: "code" | "refresh", xeroUserId?, deadlineAt }, work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T>`. Refresh requires a user ID. Shared app lock for refresh; exclusive app lock for code; canonical identity lock after app lock. `lockXeroAuthorisation(tx, appId, xeroUserId)` supports post-code identity adoption.
- `withScopedXeroConnectionLock<T>(scopeWithConnectionId, deadlineAt, work)`: connection row lock and scope recheck for selection/disconnect/persistence.
- `advanceXeroSyncCursor({ scope, connectionId, entityType, expectedModifiedSince, nextModifiedSince }, tx)`: monotonic CAS; no cross-scope update.

- [ ] Write unit query-isolation tests and actual concurrent transactions. Test `blocks code replacement until refresh commits`, `serialises two refreshes for one user`, `allows independent user refreshes concurrently`, `releases locks after rollback`, and `does not reveal sibling account metadata`.
- [ ] RED: run `packages/database/src/queries/xero-connections.test.ts`, `xero-authorisation.test.ts`, `xero-sync-cursors.test.ts` with the shared config; then the new locks integration suite with local database flag. Expected failure: missing query functions/lock behaviour.
- [ ] Implement narrow database helpers. Bound pool wait and SQL lock timeout by the caller's remaining deadline; transaction maximum 15 seconds. Lock order app, authorisation, connection when combined. Use PostgreSQL locks, reread after acquisition, scope updates/deletes and composite FK checks; no token version, generic lock service or durable lease. Internal due-authorisation enumeration remains separate from public application access.
- [ ] Derive safe connection display from connection/authorisation and sync health, removing cleanup joins/legacy fallback. Update balance DTO/FK names. Remove the obsolete campaign-only `createWriteGuardedClient` wrapper from `src/client.ts` now so ordinary isolated tests and the new query boundary are usable before Task 11; retain lazy creation, server-only access and `assertTestDatabaseConnectionAllowed`. Do not expose canonical tokens through scheduler/settings DTOs.
- [ ] GREEN: rerun the same query and real lock suites. Inspect SQL execution with real Prisma Pg and provide a Neon-adapter test against a disposable authorised Neon-compatible test setup when available; do not substitute mock concurrency for adapter verification. If that adapter test cannot run locally, retain it as a recorded final verification requirement.
- [ ] Commit: `refactor(database): scope Xero connections and grant locking`.

### Task 3: Simplify central HTTP and distributed quota admission

**Files:** Modify `packages/xero/src/rate-limit/xero-fetch.ts`, `shared-store.ts`, `memory-store.ts`, `admission.lua.ts`, `limiter.ts`, `limits.ts`, `deadline.ts` and their existing tests, including `shared-store.integration.test.ts`. Modify `packages/xero/keys.ts`, `keys.test.ts`, `apps/api/.env.example`, `apps/app/.env.example`. Delete the namespace bootstrap files listed in the deletion appendix.

**Interfaces:** Keep `xeroFetch(input, deps?) -> Promise<Response>`. Replace `retryOnAmbiguousFailure` with explicit `retryPolicy: "read" | "code" | "refresh" | "mutation" | "delete"`, optional `mutation: XeroMutationIdentity`, and existing deadline/rate class. Mutation retries require supported key plus unexpired replay cutoff. Refresh policy makes one HTTP attempt per invocation; Task 5 alone controls at most two total refresh requests. Safe correlation metadata is returned/logged without adding a database table.

- [ ] Add tests `retries 429 only within Retry-After and deadline`, `replays mutation with identical key and body`, `never replays expired mutation`, `never replays code exchange`, `preserves correlation IDs without secrets`, `ordinary shared keys initialise atomically`, `quota store failure prevents provider call`. Include failed body-read/cancellation/lease release and cached 5xx cases. Existing limits tests retain five concurrent, 60/minute and tier-based daily/app limits.
- [ ] RED: `NODE_ENV=test bunx vitest run --config tooling/vitest.config.mts packages/xero/src/rate-limit/xero-fetch.test.ts packages/xero/src/rate-limit/shared-store.test.ts packages/xero/src/rate-limit/limiter.test.ts packages/xero/keys.test.ts`. Expected failures: missing retry policy and unnecessary namespace/sentinel admission.
- [ ] Implement plain atomic app/tenant Redis keys with TTL/cooldown/concurrent admission; retain fail-closed store errors and provider rate-header handling. Remove credential-domain sentinels, namespace epochs, prior-usage bootstrap waiting and campaign provider-effect interception. Keep response cap, allowed origins, redirects rejected and absolute deadline. Default maximum four attempts; code one, refresh at most two under Task 5; writes bounded by existing 120-second operation budget and five-minute replay cutoff. Never manufacture a new mutation key on retry.
- [ ] Remove `XERO_CREDENTIAL_DOMAIN_ID`, `XERO_RATE_NAMESPACE_EPOCH`, `XERO_REMOTE_CLEANUP_MODE` validation and examples; retain Xero app tier, credentials, redirect URI and encryption keyring configuration. Scope token/inventory app counters honestly as application policy, not a claimed Xero payroll quota.
- [ ] GREEN: rerun the same suites plus existing `deadline.test.ts` and actual shared-store integration tests using disposable Redis. Assert contention across independent limiter instances, cooldown and cleanup. No namespace initialisation command is required for an empty store.
- [ ] Commit: `refactor(xero): simplify bounded HTTP and quota admission`.

### Task 4: OAuth state, canonical adoption and tenant selection

**Files:** Rewrite `packages/xero/src/oauth/service.ts`, `service.test.ts`, `service.integration.test.ts`; create `oauth/scopes.ts`, `scopes.test.ts`, `oauth/authorisation.ts`, `authorisation.test.ts`; modify `oauth/identity.ts`, `identity.test.ts`, `crypto/tokens.ts`, `crypto/keyring.ts` and only necessary tests. Modify `apps/api/app/api/xero/oauth/start/route.ts`, callback `route.ts` and both `route.test.ts`; update `packages/xero/index.ts`.

**Interfaces:** Preserve scoped `buildXeroOAuthStartUrl`, `completeXeroOAuth`, `cancelXeroOAuth`, `getPendingXeroOAuthSession`, `completeXeroTenantSelection` with simpler inputs/results. Selection returns `{ connectionId, organisationId, returnTo }`, not internal tenant or generation. `XERO_SCOPES` equals the exact four-scope string; `hasXeroCapability(granted, required)` recognises write scopes for read requests. `adoptXeroAuthorisation(tokenResponse, identity, tx)` persists canonical envelopes under Task 2 locks.

- [ ] Write regressions `requests exactly minimum scopes`, `rejects state replay before exchange`, `rejects wrong account user nonce role expiry and return URL`, `cancelled consent cannot consume another user session`, `keeps all token fields out of session`, `reauthorisation replaces one canonical grant for both consumers`, and `selection reloads owned tenant and enforces AU country`. Add wrong JWT issuer/audience/client/signature, missing actual scope and malformed/non-ORGANISATION inventory cases.
- [ ] RED: shared config runs `packages/xero/src/oauth/service.test.ts`, `scopes.test.ts`, `authorisation.test.ts`, `identity.test.ts`; API package runs `NODE_ENV=test bunx vitest run app/api/xero/oauth/start/route.test.ts app/api/xero/oauth/callback/route.test.ts`. Expected new-state/canonical/scope assertion failures.
- [ ] Keep one 10-minute state/nonce/selection lifetime. Claim callback once before a single code exchange; no retry on lost code response. Exchange/adopt under exclusive app grant lock, verify identity through existing JOSE, atomically upsert canonical user/app and actual scopes; no session credentials. Remove expired legacy identity verification and old code-exchange recovery envelopes. Clear nonce on terminal cancellation/error/success.
- [ ] Use current authenticated role/account/user, fresh `/connections`, current auth-event highlighting and exact selection tuple. Preserve existing optional first-Organisation creation/defaults and safe return path. Same-file reconnect preserves people, feeds and cursor identities. Different-authoriser selection cannot overwrite an unresolved previous remote link; return the spec's reauthorisation/Xero-removal recovery. No provider provenance table is created.
- [ ] GREEN: rerun the unit/API suites plus `service.integration.test.ts` against ordinary local fixtures. Use delayed mocked token responses over real lock transactions to prove callback/refresh ordering; do not treat that as a real provider run.
- [ ] Commit: `refactor(xero): adopt canonical grants through protected OAuth`.

### Task 5: One refresh resolver, grace handling and dormant rotation

**Files:** Complete `packages/xero/src/oauth/authorisation.ts`, its test and new `authorisation.integration.test.ts`; modify `oauth/reencrypt-tokens.ts`, its test, `adapter/auth-recovery.ts`, `adapter/auth-recovery.test.ts`, `adapter/resolved-tenant.ts`, `adapter/capabilities.ts`, `adapter/classify-xero-failure.ts` and tests. Remove the old refresh implementation from `oauth/service.ts`; delete owner/locks/inactivity files in the appendix. Modify `packages/xero/index.ts`.

**Interfaces:** `resolveXeroAccess({ clerkOrgId, organisationId, connectionId?, capability, deadline?, previousAccessToken? }) -> Promise<Result<XeroAccessContext, XeroAccessError>>`. `previousAccessToken` is server-only and supplied only for a definite API 401; if canonical access changed, reuse it. Internal `refreshXeroAuthorisation({ authorisationId, reason: "expiry" | "401" | "dormant", deadline })` is maintenance-only. `refreshDormantXeroAuthorisations(now)` returns safe counts and never credentials. Internal raw IDs are not app action authority.

- [ ] Add tests `refreshes within two minutes of expiry`, `second concurrent worker reuses committed tokens`, `updates both envelopes atomically`, `lost response retries old refresh within provider grace`, `commit rollback retains old grant`, `late invalid_grant requires reconnect`, `network and invalid_client do not revoke grants`, `read capability accepts payroll.employees`, `paused due grant refreshes once for two connections`, and `key rotation cannot overwrite refreshed credentials`.
- [ ] RED: run `packages/xero/src/oauth/authorisation.test.ts`, `adapter/auth-recovery.test.ts`, `oauth/reencrypt-tokens.test.ts` and the new authorisation integration suite. Expected failures: absent refresh/resolver and old multi-table crypto traversal.
- [ ] Implement the only refresh function with Task 2 locks, reread expiry, 10-second HTTP budget and atomic credentials/expiry/scopes/metadata. Retry lost refresh or persistence once promptly under the same identity lock and provider grace; do not persist a second credential or attempt. On commit-acknowledgement loss reload canonical state before replay. `invalid_grant` updates authorisation status; transient failures keep it retryable. Never call the same refresh path repeatedly for insufficient permission.
- [ ] Convert adapter recovery to one definite-401 fresh-token replay and scope-aware permission failure. Ordinary expired access tokens cause refresh, not a disconnect banner. Re-encryption touches only authorisations under the same lock, preserves success timestamps and never rotates provider tokens.
- [ ] Implement internal due-authorisation enumeration at 45 days, including paused connections and deduplicating shared grants. Session expiry/unreferenced credential removal is housekeeping, not behavioural inactivity. No manual refresh action or standalone inactivity job exists.
- [ ] GREEN: rerun identical suites with real database contention, rollback and delayed response tests. Assert no old mirror/table is read and no plaintext is returned in errors or scheduler output.
- [ ] Commit: `refactor(xero): unify automatic grant refresh`.

### Task 6: Real provider watermarks and full-snapshot reconciliation

**Files:** Modify `packages/xero/src/au/read.ts`, `nz/read.ts`, `uk/read.ts`, `read/dispatch.ts`, `read/employees.ts`, `read/leave-records.ts`, `read/leave-balances.ts` and relevant tests. Modify `packages/jobs/src/handlers/sync-xero-people.ts`, `sync-xero-leave-records.ts`, `sync-xero-leave-balances.ts`, `xero-sync-access.ts`, `sync-run-lifecycle.ts` and their unit/integration tests. Modify `packages/availability/src/people/xero-person-reconciliation.ts`, `packages/availability/src/sync/inbound-leave-normaliser.ts` and tests only for full/delta semantics.

**Interfaces:** Read inputs add `mode: XeroSyncMode` and optional `modifiedSince: Date`; results retain records/failures and `traversalComplete`. Explicit AU capability supports modification headers; NZ/UK does not. Workers take `{ clerkOrgId, organisationId, xeroConnectionId, mode, ...existingRunContext }`. Use Task 2 cursor/connection queries and Task 5 resolver; no token in events.

- [ ] Add tests `all AU pages use one overlap watermark`, `empty incremental result does not archive`, `malformed page prevents watermark and archival`, `full complete snapshot archives missing Xero records only`, `partial failed upsert retries without watermark loss`, `late run cannot regress watermark`, `NZ and UK never receive invented modification headers`, and `targeted balance refresh leaves rolling cursor unchanged`.
- [ ] RED: run shared config over `packages/xero/src/au/read.test.ts`, `nz/read.test.ts`, `uk/read.test.ts`, `read/dispatch.test.ts`, `packages/jobs/src/handlers/sync-xero-people.test.ts`, `sync-xero-leave-records.test.ts`, `sync-xero-leave-balances.test.ts`. Expected header/delta-archival assertions fail against current full traversal and generic cursors.
- [ ] Implement AU `If-Modified-Since` from prior watermark minus two minutes, formatted UTC to seconds; initial/full omit it. Capture run start once; raw page length/page cap and malformed rows retain honest completeness. Advance provider watermark to start only after complete successful persistence; retain failed-record isolation and safe no-op source hashes/timestamps.
- [ ] Guard canonical persistence and cursor CAS with both tenancy IDs and current active connection/external file. Stop an old run if the selected connection changed; no binding generation is reintroduced. Never archive manual entries or absent incremental rows. Full reconciliation alone performs absence detection after full successful traversal.
- [ ] Move balance 40-person continuation/CAS and NZ/UK existing 20-person leave continuation to named connection fields; preserve unit/currency validation, targeted refresh, truthful roster staleness, cancelled-run recovery and stable publication IDs. Keep region code separate and NZ/UK activation disabled.
- [ ] GREEN: rerun unit suites plus all three workers' actual database integration suites with ordinary isolated fixtures. Include data beyond one provider page and one local roster batch; verify retry discovers failed records and full/delta modes produce correct feed membership.
- [ ] Commit: `feat(xero): synchronise using provider modification watermarks`.

### Task 7: Provider-native idempotency within the existing leave journal

**Files:** Modify `packages/core/src/ports/external-write-port.ts`, `packages/xero/src/write/types.ts`, `write/dispatch.ts`, `au/write.ts`, `adapter/xero-write-adapter.ts` and tests. Modify `packages/availability/src/plans/submit-service.ts`, `submit-recovery-service.ts`, `submit-side-effects.ts`, `plan-service.ts`, `approvals/approval-service.ts`, `xero-write-claim.ts`, `xero-connection-state.ts` and tests. Create `packages/availability/src/plans/write-operation.ts` and `write-operation.test.ts` to centralise the existing journal, not add a parallel framework. Modify `packages/availability/index.ts` only for required exports.

**Interfaces:** Domain port mutation input carries `mutation: XeroMutationIdentity`; provider dispatch adds immutable exact tenant/method/URL/body. `prepareXeroWrite({ scope, recordId, action, actorUserId, request }, tx)` persists/reuses a journal operation. `recordXeroWriteOutcome(operationId, attemptGeneration, outcome, tx)` retains existing outcome/side-effect safety. Existing administrator create recovery remains callable; remove only legacy remote-submit recovery branches rather than deleting working approval recovery UI.

- [ ] Write behavioural tests with these assertions:

```typescript
expect(localSubmit.providerMutations).toHaveLength(0);
expect(retriedApprove.requests[1].headers.get("Idempotency-Key"))
  .toBe(retriedApprove.requests[0].headers.get("Idempotency-Key"));
expect(retriedApprove.requests[1].body).toEqual(retriedApprove.requests[0].body);
expect(lateUnknown.providerMutations).toHaveLength(0);
expect(lateUnknown.requiresAdministratorRecovery).toBe(true);
expect(completedApprove.createdRemoteIds).toHaveLength(1);
expect(completedApprove.notificationCount).toBe(1);
```

Add role/isolation, changed request/tenant rejection, cached 5xx inspection, response-loss/local-save-loss, actor retention, imported approve/decline and remote withdrawal, processed leave rejection, local decline/withdraw zero-call and stable feed identity tests. Assert date-only AU create is a top-level array without guessed LeavePeriods/NumberOfUnits.
- [ ] RED: run existing `packages/xero/src/au/write.test.ts`, `adapter/xero-write-adapter.test.ts`, `packages/availability/src/plans/submit-service.test.ts`, `submit-recovery-service.test.ts`, `approvals/approval-service.test.ts` plus new `write-operation.test.ts`. Expected missing header/request-journal/cutoff failures; legacy branch removal assertions must fail before removal.
- [ ] Reuse `OutboundOperation` for approval-create and imported remote transitions; retain `attempt_generation` as real domain write fencing. Store exact mutation request and UUID key before dispatch, set first-dispatch time once and replay cutoff at five minutes. Preserve unknown outcomes if provider response or local save is lost. Only definitive non-processing/authoritative provider inspection may authorise a new key; old cache failures cannot.
- [ ] Thread key through port/adapter/dispatch/AU requests and Task 3 HTTP policy. A definite 401 replay uses the same frozen request/key and refreshed credentials. Do not enable NZ/UK write operations or invent idempotency for unsupported methods. Completed attempts return saved outcome; server-action retry and duplicate clicks do not create/notify twice.
- [ ] Delete compatibility for legacy app-submitted remote-created records and obsolete submit operation handling. Keep current local submission, approve/reject/withdraw, uncertainty resolution, manager permissions, Xero-owned balances and synchronous inline errors. No outbound job is introduced.
- [ ] GREEN: rerun the same unit suites and existing availability/database integration suites for journal claims, approval state and publication effects. Include a fake-clock retry at 4:59 versus 5:00, a lost process after dispatch, and delayed local commit after provider acceptance. Live provider duplicate prevention is a final separate journey, not implied by fixtures.
- [ ] Commit: `feat(xero): use provider idempotency for synchronous leave writes`.

### Task 8: Remote-delete-first disconnect and reconnect-required access

**Files:** Create `packages/xero/src/oauth/disconnect.ts`, `disconnect.test.ts`; rewrite existing `oauth/disconnect.integration.test.ts`; modify `oauth/authorisation.ts`, `adapter/auth-recovery.ts` and relevant tests. Delete `connection-cleanup.ts`, `management-client.ts` and tests from appendix; remove old disconnect/cleanup functions in `oauth/service.ts` and exports in `packages/xero/index.ts`.

**Interfaces:** `disconnectXeroOAuthConnection({ clerkOrgId, organisationId, connectionId, destructive, performedByUserId }) -> Promise<Result<{ disconnected: true; remoteStatus: "deleted" | "already_absent"; dataAction: "retained" | "purged" }, XeroOAuthError>>`. There is no cleanup request/receipt ID or pending-success state. `resolveXeroAccess` detects confirmed missing selected link after definite auth failure; shared-grant invalidation is distinguished from one tenant revocation.

- [ ] Write tests `DELETE happens before any local teardown`, `204 and owned 404 complete disconnect`, `timeout preserves credentials and data`, `unusable grant requires recovery`, `DELETE success followed by rollback can retry`, `disconnect leaves sibling usable`, `active or uncertain payroll operation blocks teardown`, `purge preserves manual records`, and `successful inventory absence marks only selected connection`. Add malformed/transient inventory no-revocation assertions.
- [ ] RED: run `packages/xero/src/oauth/disconnect.test.ts`, `adapter/auth-recovery.test.ts` and rewritten local database `disconnect.integration.test.ts`. Expected current local-first ordering or missing module failure.
- [ ] Implement bounded user-token `DELETE /connections/{remote_connection_id}` under connection ownership/row lock, using fresh canonical access and no tenant header. Only 204 or documented 404 permit the subsequent scoped transaction: disconnect, detach credentials/link, reset provider cursors/roster progress, retain/purge selected Xero data, audit and publication invalidation. Lock acquisition uses app/authorisation/connection order where combined; do not hold a connection lock while waiting for an earlier-order credential lock.
- [ ] Keep failed DELETE inline and retryable with all local evidence available. Block while real payroll operations are in flight/uncertain. Never revoke/delete shared canonical credentials. A new attempt after remote-success/local-failure can establish 404 absence and complete local work. No durable disconnect lease or background sweep is created.
- [ ] Remove management-token requests/cache. Implement unusable-grant recovery as reauthorisation or Xero removal plus fresh confirmation; report no success until the actual contract is met. Reconnect preserves source identity; a different authoriser cannot silently orphan an old selected link.
- [ ] GREEN: rerun identical tests over real local rollback/FK data and assert all local effects follow remote confirmation. Verify every remaining connection consumer derives a truthful reconnect-required display.
- [ ] Commit: `refactor(xero): disconnect remotely before local teardown`.

### Task 9: Scheduler and full initial-import orchestration

**Files:** Modify `packages/jobs/src/events.ts`, `events.test.ts`, `functions.ts`, `activation.ts`, `handlers/schedule-xero-syncs.ts`, `initial-xero-sync.ts`, `recover-xero-import-dispatch.ts`, `reconcile-xero-approval-state.ts`, `reconcile-feed-publications.ts`, `rebuild-feed-cache.ts`, `sync-run-lifecycle.ts`, `packages/jobs/index.ts` and their relevant existing tests. Delete `handlers/reconcile-xero-connections.ts` and its tests. Modify `packages/availability/src/sync/sync-events.ts`, `sync-monitor-service.ts` and tests, `packages/availability/src/people/balance-refresh.ts`, `people-service.ts`, `manual-balance-service.ts` and tests.

**Interfaces:** All events use `xeroConnectionId`, scope IDs and explicit full/incremental mode where relevant; remove `bindingGeneration`, `campaign` and admission receipt inputs. `dispatchInitialXeroSync({ scope, xeroConnectionId, requestedAt, triggeredByUserId })` produces deterministic ID from connection plus persisted initial request timestamp. Scheduler only discovers routing metadata and calls maintenance internally.

- [ ] Add tests `one initial job completes people leave and all 81 balances`, `failed enqueue is recovered without duplicate inline import`, `scheduler emits incremental and nightly full modes`, `paused connection has no data jobs but dormant grant refreshes`, `lost dormant refresh retries within grace`, `one shared grant refreshes once`, `no cleanup or refresh-attempt job is registered`, `old initial run cannot complete a newer requestedAt`, and `cancelled or partial run cannot mark initial import complete`. Preserve ordinary run reuse/cancellation tests.
- [ ] RED: run `packages/jobs/src/events.test.ts`, `handlers/initial-xero-sync.test.ts`, `schedule-xero-syncs.test.ts`, `recover-xero-import-dispatch.test.ts`, `sync-run-lifecycle.test.ts`. Expected old tenant/generation events, one-page initial completion or obsolete sweep registration.
- [ ] Keep one initial durable import and step/page through the entire balance roster before completion. Use persisted `initial_sync_requested_at` for initial deduplication and CAS completion against the event's `requestedAt`; same-file reconnect requests full reconciliation with a new timestamp. Existing scheduler recovers saved active connections lacking initial completion. Manual full runs preserve scoped audit/role checks.
- [ ] Keep `*/15` scheduler and exact local-time cadence from spec, nightly full people/leave plus existing approval reconciliation, rolling hourly balances, feed rebuilds and run lifecycle. Replace per-tenant concurrency keys with scoped connection IDs. Remove cleanup registration, refresh-attempt recovery and campaign admission; run short session expiry and once-daily dormant due-grant maintenance in the existing scheduler. Transient dormant-refresh failures retry the existing Inngest step promptly inside 30 minutes; failed rotation never advances last-success metadata, while definitive invalid grant surfaces reconnect. No extra recurring job or inactivity classification.
- [ ] GREEN: rerun unit suites and surviving scheduler/sync/reconciliation integration tests. Assert timestamps mean completed phases, no job body leaks tokens, no outbound payroll mutation is queued and feed jobs still run after actual availability changes.
- [ ] Commit: `refactor(jobs): schedule scoped Xero synchronisation`.

### Task 10: Update settings, sync UI, API consumers and safe DTOs

**Files:** Modify `apps/app/app/(authenticated)/settings/integrations/_connection-view.ts`, its test, `integrations-client.tsx`, `xero/page.tsx`, `xero/xero-client.tsx`, `xero/_actions.ts`, `xero/connect/page.tsx`, `xero/connect/connect-client.tsx`, `xero/connect/_actions.ts` and existing tests. Modify `apps/app/app/(authenticated)/sync/{page.tsx,sync-client.tsx,_schemas.ts,_actions.ts}`, `[runId]/{page.tsx,sync-run-detail-client.tsx}`, `people/{page.tsx,people-client.tsx,_actions.ts}`, `calendar/page.tsx` and relevant tests. Modify `apps/api/app/api/sync/dispatch/route.ts`, `apps/api/lib/sync/execute-local-sync-fallback.ts` and tests. Modify `packages/core/src/xero-recovery.ts`, `packages/availability/src/xero-connection-state.ts` and tests plus `apps/app/components/xero/xero-recovery-notice.tsx`/test.

**Interfaces:** Safe connection DTO exposes metadata, pause/health and connection ID; no encrypted tokens or raw authorisation object. Manual sync/pause actions accept `{ organisationId, xeroConnectionId }`. Disconnect result is Task 8's truthful terminal result. Remove `refreshXeroConnectionAction`, refresh button, old expired-token badge and cleanup-pending receipt variants. Preserve admin confirmation and both retained-data/purge modes.

- [ ] Add tests `settings has no manual token refresh`, `only owner admin can disconnect or resync`, `connect dispatches one full initial job`, `DELETE failure keeps connection controls and history`, `reconnect banner is distinct from paused or transient sync error`, `client props contain no credentials`, and `forged foreign connection ID changes zero rows`. Retain meaningful sync/matching/manual-balance UI tests.
- [ ] RED: run existing integrations/actions/client tests from `apps/app` with `NODE_ENV=test bunx vitest run`; run `apps/api` sync dispatch/local-fallback tests similarly. Expected old input/DTO/manual-refresh/receipt assertions fail.
- [ ] Move Xero data access in actions/pages into scoped database query helpers. Flatten selected tenant fields onto connection DTOs, use connection IDs consistently, remove manual refresh and cleanup status copy, retain progressive disclosure/confirmation, publish plain-language reconnect/sync failures. Connect page still permits first Organisation creation and useful explicit person matching, with one durable initial job.
- [ ] Update the additional balance/sync/calendar consumers listed above; do not leave internal tenant UUIDs in schemas/event forms. Preserve organisation selection, manual balance behaviour, role boundaries, no-secret allowlists and stable IDs/URLs in unaffected product flows.
- [ ] GREEN: rerun same app/API suites and TS checks for changed packages. Apply `vercel:react-best-practices` after multiple TSX edits at execution time. Use browser checks for connect, paused/reconnect/failed-disconnect states and manual full sync. Do not require a new product UI framework.
- [ ] Commit: `refactor(app): simplify Xero connection management`.

### Task 11: Delete obsolete lifecycle/campaign machinery and rewrite real fixtures

**Files:** Delete the exact files in the appendix. Modify `packages/database/src/client.ts`, `index.ts`, `package.json`, `src/integration-spies.test.ts`, `src/live-test-fixture.ts`, `src/test-fixtures/slice-14-fixture.ts` and test. Rewrite `packages/database/availability_records.integration.test.ts`, `public-holidays.integration.test.ts`, `authoritative-usage.integration.test.ts`, `live-rollback.integration.test.ts`, and surviving OAuth/jobs/limiter fixtures. Modify `apps/app/lib/server/xero-campaign-action.ts` consumers listed below before deleting it. Modify `.github/workflows/ci.yml`, root `package.json`, `tooling/release/{integration-inventory,manifest-fixtures,global-fixture-keys,cleanup,run-live-integration}.ts` and their tests, `tooling/release/playwright.config.ts`, `tooling/release/e2e/{environment,fixture,global.setup,global.teardown,release-teardown,provider-snapshot}.ts` and surviving tests.

**Interfaces:** Retain ordinary `database` lazy guarded client, localhost/non-local test guard, scoped fixtures, owned cleanup and generic source/release checks. Remove the database campaign write wrapper and runtime Xero interception. Existing Playwright and disposable fixtures verify current user flows without a durable campaign database/control plane.

- [ ] Write fixture tests `ordinary local OAuth sync and limiter suites execute`, `fixture cleanup understands new connection FKs`, `non-local database is still denied`, `real browser cases remain discoverable`, and `release report cannot label skipped coverage passing`. Update existing fixture/inventory tests to assert current real suites rather than the historic 40-case/13-protected-suite mandate.
- [ ] RED: run `NODE_ENV=test bunx vitest run --config tooling/release/vitest.config.ts tooling/release/integration-inventory.test.ts tooling/release/manifest-fixtures.test.ts tooling/release/cleanup.test.ts tooling/release/run-live-integration.test.ts` and database guard/fixture tests. Expected old table/inventory/campaign plumbing failures.
- [ ] Remove campaign access from surviving HTTP/OAuth/jobs/domain services and these actions/routes: `apps/app/app/(authenticated)/plans/_actions.ts`, `leave-approvals/_actions.ts`, settings Xero/connect `_actions.ts`, `apps/api/app/api/availability/route.ts`, `[recordId]/route.ts`, and OAuth start. Keep their ordinary authentication, role, query-isolation, provider operation journal and audits. Remove obsolete header/query authority input, not actual authorisation checks.
- [ ] Delete Xero-specific campaign protocols/runners and old architecture tests from the appendix; remove exports/scripts/config/CI references. Keep generic non-local guard/owned-fixture safeguards. Simplify `run-live-integration.ts` only where deleted suites/campaign dependencies occur; do not weaken unrelated database protections or provision new external targets.
- [ ] Rewrite ordinary local fixtures and schema-aware cleanup in all surviving domain suites. Update release inventory to actual useful suites; remove old exact-count gates. Retain AU roundtrip, OAuth, onboarding, recovery-reason and role/feed browser checks, simplifying their fixture/observation helpers rather than deleting useful assertions. Rewrite `xero-disconnect-receipts.spec.ts` as `xero-disconnect.spec.ts` for remote-first success/failure/sibling behaviour; retire old cleanup-receipt/generation browser assertions.
- [ ] GREEN: rerun fixture/release-tool suites, `bun run typecheck:release-tools`, and surviving isolated integration tests. Playwright list must contain the retained real journeys; zero tests is failure. Audit executable source for old model/field/export/env/campaign names, excluding historical migrations and the planning artefacts.
- [ ] Commit: `refactor(xero): remove obsolete lifecycle and campaign infrastructure`.

### Task 12: Reconcile canonical documentation with the implemented model

**Files:** Modify `AGENTS.md`, `PRODUCT.md`, `README.md`, `ScreenCatalogue.md`, `packages/database/QUERIES.md`, `packages/xero/src/discovery/notes.ts`, `plans/README.md`, `plans/go-live.md`, `plans/160-au-transition-contract-v1.md`, `plans/160-xero-end-to-end-verification-and-report.md`, `tasks/todo.md`. Delete `plans/161-harden-xero-connection-lifecycle.md`, `plans/161-xero-provider-contract.md` and the superseded campaign-only `plans/163-ordinary-campaign-admission.md`; this spec's dated sources replace the ledger. Remove their active references without restarting those obsolete plans.

**Interfaces:** Canonical product/agent docs describe the implemented four entities and scope/refresh/sync/disconnect behaviour. Historical source evidence is never upgraded into new runtime proof. Plans 160/go-live retain useful AU flow verification and source gates; remove Plan 161 compatibility/campaign prerequisites.

- [ ] Check current documentation against implemented code and tests: four-scope string, four lifecycle entities, connection FK naming, AU-only activation, real watermarks, paused dormant refresh, five-minute write cutoff and remote-first disconnect. This documentation task does not add mirrored-content tests.
- [ ] Remove owners/mirrors/tenant/slot/generation/cleanup/manual-refresh/inactivity/cutover text. Document `XeroAuthorisation` system-credential exception, both tenant keys on customer queries and separate per-region capabilities. Correct ScreenCatalogue's old duplicate-inline-import finding and connection controls.
- [ ] Update supported environment/commands and current verification inventory. Preserve the AU user/local/provider transition rows, remove legacy remote-submit compatibility, and explain the actual idempotency TTL/administrator-recovery boundary. Retire old Plan 161 campaign completion requirements from the plan index; do not leave redirects masquerading as active plans.
- [ ] Run `git diff --check` and reference/deletion searches. Expect no active requirement or script to execute deleted code. Record current verification outcomes and limitations in task review.
- [ ] Commit: `docs: reconcile simplified Xero contracts and operations`.

### Task 13: Full-suite, fresh-schema and controlled end-to-end verification

**Files:** Only fix defects exposed in this plan's changed files/tests; record results in `tasks/todo.md` and the release evidence destination already used by surviving tooling. No new campaign framework.

**Interfaces:** Completion means the target schema/code/UI and actual registered jobs agree. Source/integration/browser/provider results are reported separately with commands and outcomes.

- [ ] On disposable PostgreSQL/Redis, deploy the full migration chain, generate Prisma, check no obsolete live tables exist, exercise actual locks and shared admission, and prove schema equality. Run from root:

```bash
bun run migrate:deploy
bun run --cwd packages/database build
bun run check
bun run build
bun run typecheck
bun run boundaries
bun run test
bun run test:integration
bun run test:release-tools
bun run typecheck:release-tools
```

Then from `packages/database` run `bunx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code`. Expected exit 0 for each command, with real integration counts and no required skipped suites. Build uses the repository's normal environment setup and freshly generated files.
- [ ] Run existing Playwright release journeys against a controlled local/development app/API using Clerk test sessions and explicitly owned Xero fixtures. Verify owner/admin/manager/employee denial and scope boundaries; state/replay; selected tenant; one complete initial import; scheduled incremental and nightly full execution; manual full; local submit zero-write; approval one remote create with repeated same key; imported approve/reject; scheduled withdrawal; provider balance truth and stable feed output.
- [ ] Verify paused due-grant rotation, external Xero-side disconnect -> reconnect-required and targeted remote DELETE -> local teardown; preserve sibling connections. Observe actual Inngest function execution and persisted source data, not merely accepted events. Verify actual response scopes, headers and supported key retry; do not change payroll inputs or mint a new key to manufacture success.
- [ ] Clean only owned fixtures, stop any verification servers created, and record commands/statuses. Missing provider entitlement, registered callback, role sessions or disposable adapter resources is NOT VERIFIED with the exact prerequisite, not a reason to rebuild campaign admission or claim provider success from unit tests. Live mutations require execution-session authority; this planning request supplies none.
- [ ] Run final `git diff --check`, no-obsolete-executable-reference audit and full spec-to-task check. Fix observed defects using red/green and rerun only affected gates plus required final checks. Invoke verification-before-completion before any passing claim/commit/PR, and use requested review/branch-finish workflow when execution is actually authorised.
- [ ] Commit verified fixes/evidence and stop. Integration/PR/deployment decisions belong to the execution request; do not auto-deploy from this plan.

## Exact deletion inventory

The files below are current inspected paths. Delete paired tests with the obsolete contract; preserve their useful product assertions in the task's replacement tests. Do not delete unrelated domain or generic security code.

### Lifecycle and schema-support modules

```text
packages/xero/src/oauth/credential-owner.ts
packages/xero/src/oauth/credential-owner.test.ts
packages/xero/src/oauth/credential-owner.integration.test.ts
packages/xero/src/oauth/connection-cleanup.ts
packages/xero/src/oauth/connection-cleanup.test.ts
packages/xero/src/oauth/connection-cleanup.integration.test.ts
packages/xero/src/oauth/management-client.ts
packages/xero/src/oauth/management-client.test.ts
packages/xero/src/oauth/inactivity-policy.ts
packages/xero/src/oauth/inactivity-policy.test.ts
packages/xero/src/oauth/inactivity-report.ts
packages/xero/src/oauth/inactivity-report.test.ts
packages/xero/src/oauth/inactivity-report.integration.test.ts
packages/xero/src/oauth/locks.ts
packages/xero/src/rate-limit/namespace-initialisation.ts
packages/xero/src/rate-limit/namespace-initialisation.test.ts
packages/xero/scripts/initialise-xero-rate-namespace.ts
packages/xero/scripts/plan-legacy-credential-owners.ts
packages/xero/scripts/reissue-xero-cleanup.ts
packages/xero/scripts/xero-inactivity-report.ts
packages/database/src/queries/xero-credential-owner.ts
packages/database/src/queries/xero-credential-owner.test.ts
packages/database/queries/xero-credential-owner.ts
packages/database/src/queries/xero-cleanup.ts
packages/database/src/queries/xero-cleanup.test.ts
packages/database/queries/xero-cleanup.ts
packages/database/src/queries/xero-inactivity-signals.ts
packages/database/src/queries/xero-inactivity-signals.test.ts
packages/database/queries/xero-inactivity-signals.ts
packages/database/src/xero-credential-owner-backfill.ts
packages/database/src/xero-credential-owner-backfill.test.ts
packages/database/src/xero-tenant-binding-backfill.ts
packages/database/src/xero-tenant-binding-backfill.test.ts
packages/database/src/xero-credential-identity-artifact.ts
packages/database/src/xero-credential-identity-artifact.test.ts
packages/database/xero-credential-identity-artifact.ts
packages/database/scripts/backfill-xero-credential-owner.ts
packages/database/scripts/backfill-xero-tenant-binding.ts
packages/database/xero-lifecycle-migration.integration.test.ts
packages/jobs/src/handlers/reconcile-xero-connections.ts
packages/jobs/src/handlers/reconcile-xero-connections.test.ts
packages/jobs/src/handlers/reconcile-xero-connections.integration.test.ts
plans/161-harden-xero-connection-lifecycle.md
plans/161-xero-provider-contract.md
plans/163-ordinary-campaign-admission.md
```

Remove package scripts `cleanup:reissue`, `plan:legacy-credential-owners`, `rate:initialise-namespace`, `report:xero-inactivity`, `backfill:xero-credential-owner` and `backfill:xero-tenant-binding`. Remove old owner/cleanup/inactivity/identity/campaign exports and manual-refresh public exports.

Delete tables `xero_credential_owners`, `xero_refresh_attempts`, `xero_provider_connections`, `xero_tenants`, `xero_cleanup_requests`, `xero_cleanup_attempts`, `xero_inactivity_classifications`. Remove `xero_credential_usability`, `xero_refresh_attempt_outcome`, `xero_provider_connection_status`, `xero_oauth_intent_kind`, `xero_token_exchange_status`, `xero_cleanup_data_action_status`, `xero_cleanup_attempt_state`, `xero_inactivity_kind`, `xero_inactivity_review_status`; replace connection/session enums and cursor entity variants as Task 1 specifies. Remove all relations and database triggers/checks/unique indexes tied to removed reservation tables in the new generated migration.

### Xero campaign and obsolete evidence control plane

```text
packages/database/src/xero-campaign-access.ts
packages/database/src/xero-campaign-access.test.ts
packages/database/src/xero-campaign-contract.ts
packages/database/src/xero-campaign-lock.ts
packages/database/src/xero-campaign-store.ts
packages/database/src/xero-campaign-store.test.ts
packages/database/src/xero-campaign.test-support.ts
packages/database/xero-campaign.integration.test.ts
packages/database/src/live-campaign-fixture.ts
packages/database/src/live-campaign-fixture.test.ts
packages/database/src/write-guard.ts
packages/database/src/write-guard.test.ts
apps/api/lib/xero-campaign-action.ts
apps/app/lib/server/xero-campaign-action.ts
apps/app/lib/server/xero-campaign-action.test.ts
tooling/release/xero-evidence.ts
tooling/release/xero-evidence.test.ts
tooling/release/xero-campaign-collector.ts
tooling/release/xero-campaign-collector.test.ts
tooling/release/xero-execution-guard.ts
tooling/release/xero-execution-manifest-store.ts
tooling/release/xero-execution-manifest-store.test.ts
tooling/release/xero-ledger.ts
tooling/release/xero-ledger.test.ts
tooling/release/xero-observations.ts
tooling/release/xero-observations.test.ts
tooling/release/xero-observation-producers.ts
tooling/release/xero-observation-producers.test.ts
tooling/release/xero-observer-authority.ts
tooling/release/xero-observer-authority.test.ts
tooling/release/xero-source-integrity.ts
tooling/release/xero-source-integrity.test.ts
tooling/release/xero-scenarios.ts
tooling/release/xero-report.ts
tooling/release/xero-report.test.ts
tooling/release/run-xero-e2e.ts
tooling/release/run-xero-e2e.test.ts
tooling/release/xero-e2e.config.ts
tooling/release/xero-e2e.config.test.ts
tooling/release/e2e/xero-scenarios.spec.ts
tooling/release/e2e/xero-intent-guards.spec.ts
tooling/release/e2e/xero-browser-case.ts
tooling/release/e2e/xero-browser-mutation-scope.ts
tooling/release/e2e/xero-browser-mutation-scope.test.ts
tooling/release/e2e/xero-browser-scope-cli.ts
tooling/release/e2e/xero-independent-snapshot-cli.ts
tooling/release/e2e/xero-import-observer-cli.ts
```

The inspected schema has no `XeroCampaign*` SQL models. Its campaign control state resides in Redis under `xero:e2e:runtime:v1:<credentialDomainId>`, with per-run, organisation/provider reservation, invocation, attempt and sentinel keys. Remove all producers/readers of that namespace; no campaign SQL migration is needed. Do not erase generic `release:active-run` ownership or unrelated Redis state. Removal of any existing development-only campaign keys is ordinary owned-fixture cleanup, not a new reconciliation job.

Keep and simplify useful `tooling/release/xero-fixture-cleanup.ts`/test and existing browser `xero-{roundtrip,oauth,onboarding,recovery-reasons}.spec.ts`, provider oracle/import observer/publication probe/read-only assertions and generic provider snapshot. Their foreign-table/campaign arguments disappear. Delete the two campaign producer CLI wrappers listed above; rewrite `tooling/release/e2e/provider-snapshot.ts` to use its surviving ordinary `provider-snapshot-cli.ts`, preserving independent raw-state assertions. `apps/app/lib/xero-action-target.ts` is a real scoped action-target helper: retain its ownership assertions and remove only obsolete generation/campaign fields.

## Active reference audit and consumer completeness

Use `rg` against executable source and current docs, excluding generated client until regeneration and historical migrations/planning artefacts. Review each hit for these names:

```text
XeroCredentialOwner XeroRefreshAttempt XeroProviderConnection XeroTenant
XeroCleanupRequest XeroCleanupAttempt XeroInactivityClassification
xeroCredentialOwner xeroRefreshAttempt xeroProviderConnection xeroTenant
xeroCleanupRequest xeroCleanupAttempt xeroInactivityClassification
bindingGeneration binding_generation active_slot expected_binding_generation
XERO_REMOTE_CLEANUP_MODE XERO_CREDENTIAL_DOMAIN_ID XERO_RATE_NAMESPACE_EPOCH
refreshXeroConnectionAction refreshXeroOAuthConnection ownerMirror
xero-campaign XeroCampaign campaignAction cleanupRequestId
```

External `xero_tenant_id` remains valid on connections and request contexts; delete only old internal tenant FK uses. `OutboundOperation.attempt_generation` remains valid. Generic fixture-run ownership and non-local guards remain valid. The final audit must explain remaining references; do not delete source identifiers by global text replacement.

Additional fixtures/DTOs outside the central files are intentionally assigned to Tasks 9 to 11: `packages/database/src/test-fixtures/slice-14-fixture.ts`, source record/balance integration tests, API availability routes, app plan/approval actions, people/manual balances, sync detail pages and feed jobs. Use `rg -l 'xeroTenant|bindingGeneration|xero_credential_owner|xero-campaign' apps packages tooling/release` at execution to reconcile any newer callers. A caller discovered after the inspected base belongs to its existing owning task, not a new compatibility layer.

## Self-review and stopping point

Planning self-review completed against spec sections 1 to 11: model/scope/crypto contracts map to Tasks 1 to 5; regional increments/full reconciliation to Task 6; synchronous/idempotent domain writes to Task 7; remote deletion/revocation to Task 8; dormant/initial/cadence/run behaviour to Task 9; DTO/role/UI to Task 10; exact deletions/fixtures/tooling to Task 11; canonical documentation and full verification to Tasks 12 and 13. Every review-focus condition has a named regression. Shared interface names and connection IDs are consistent; scope filters and provider-vs-application policies are explicit.

No production implementation or test execution is claimed by this plan. No genuine Xero documentary contract remains undecided; live entitlement/consent/wire results are explicitly final verification work. Stop the planning turn after both documents, lesson update and documentation checks. Execution method and implementation authorisation come from a later user request, not this document.
