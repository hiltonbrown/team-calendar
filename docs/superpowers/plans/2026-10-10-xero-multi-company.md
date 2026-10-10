# Xero Multi-Company Accounts Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans (when installed) to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax. This document authorises no execution in the planning turn. Stage 1 (Row Level Security) lands and passes all gates before Stage 2 starts.

**Goal:** Expand Team Calendar so one account (Clerk Organisation) authorises several Xero Payroll files through one administrator; every member sees one consolidated, privacy-filtered calendar across those files; no Xero tenant is ever owned by more than one account; PostgreSQL Row Level Security enforces the account boundary underneath the application.

**Product decisions (confirmed 10 October 2026):**

- Multi-file accounts are an expansion of the product, not an edge case.
- Plan limits on Xero files (`payroll_entities`): Starter 1, **Premium 5**, Enterprise unlimited.
- Row Level Security is required. Its absence is a defect to fix first, not an optional hardening.

**Architecture:** Keep the existing model. A "company" is an `Organisation` row bound 1:1 to one `XeroConnection`; credentials live only on the canonical `XeroAuthorisation`. Stage 1 adds database-enforced isolation on `clerk_org_id` with a restricted runtime role and transaction-local tenant context. Stage 2 closes the product gaps: create companies from the OAuth tenant picker, release ownership deliberately, aggregate calendar and feeds across every company in an account, and expose per-company status and filtering. No new queues, cron jobs, services or permission system.

**Tech stack:** Existing Bun, Next.js App Router, TypeScript, Prisma 7 (`@prisma/adapter-neon` in deployment, `@prisma/adapter-pg` locally), Neon PostgreSQL, Clerk, Inngest, Zod, Vitest, `@repo/design-system`. No new dependencies.

**Inspected base:** `9292b6f` (main, 10 October 2026). Read `AGENTS.md`, `PRODUCT.md` (Tenancy, Xero sync, Feeds, UID strategy), `SECURITY.md`, `DESIGN.md`, `.impeccable.md` and `docs/superpowers/plans/2026-10-07-xero-simplification.md` first.

---

## 1. Findings

### Identifier map (do not interchange)

| Concept in the brief | Repository identifier | Where |
|---|---|---|
| Application user ID | Clerk user ID (`created_by_user_id`, `actor_user_id`, `Person.clerk_user_id`) | Clerk |
| Team Calendar organisation ID | `clerk_org_id` (Clerk Organisation); the customer isolation boundary and the RLS key | every tenant table |
| Company (Xero file, payroll entity) | `Organisation.id` (`organisation_id`) | `organisations` |
| Xero user ID | `XeroAuthorisation.xero_user_id` (verified from the access token) | `xero_authorisations` |
| Xero authorisation ID | `XeroAuthorisation.id` | `xero_authorisations` |
| Xero connection ID | `XeroConnection.remote_connection_id` (Xero's `/connections` id); `XeroConnection.id` is the local row id | `xero_connections` |
| Xero tenant ID | `XeroConnection.xero_tenant_id` | `xero_connections` |

### Already satisfied (reuse, do not rebuild)

1. **Global tenant ownership.** `xero_connections.xero_tenant_id` is `@unique` (`packages/database/prisma/schema.prisma:517`). A second account's insert fails at the database; `completeXeroTenantSelection` maps the violation to the generic `tenant_binding_conflict` with no foreign account detail (`packages/xero/src/oauth/service.ts:1075-1083`).
2. **One credential set per Xero user.** `XeroAuthorisation` is unique on `(provider_app_id, xero_user_id)` and is the sole encrypted token owner (AES-256-GCM, versioned keys). Connections hold only `xero_authorisation_id`. Repeated authorisation by the same Xero user adopts the existing row (`adoptXeroAuthorisation`, `authorisation.ts:69`).
3. **Coordinated refresh.** `refreshXeroAuthorisation` refreshes within two minutes of expiry under the canonical authorisation lock, re-reads state after locking and saves both tokens atomically; invalid grants set `reconnect_required`. Refresh is per authorisation, never per tenant.
4. **Source-tenant identity.** `Organisation` to `XeroConnection` is 1:1, so `organisation_id` is the source-tenant key: `Person @@unique([organisation_id, xero_employee_id])`, `AvailabilityRecord @@unique([organisation_id, source_type, source_remote_id])`; `LeaveBalance` and `SyncRun` carry `xero_connection_id`. The ICS UID formula already includes `clerk_org_id` and `organisation_id` (`PRODUCT.md:539-545`).
5. **Per-tenant sync.** Cursors, watermarks, stale markers, sweep state and errors live on the connection; jobs carry `clerk_org_id` and `organisation_id` and resolve the connection with both (`packages/jobs/src/handlers/xero-sync-access.ts`).
6. **Rate limiting** is keyed by provider app and Xero tenant in the shared Redis store.
7. **Disconnect** deletes the exact remote connection first, then tears down local sync state, and deletes an authorisation only when no connection references it (`disconnect.ts:243-256`).
8. **Roles** are Clerk roles via `requirePageRole("org:admin")` and `@repo/auth`. The Xero settings page already lists every company in the account.

### Gaps

| # | Gap | Evidence |
|---|---|---|
| G0 | **No Row Level Security.** Isolation depends entirely on every one of 106 importing modules remembering `scopedQuery`. The runtime connects with one role (`DATABASE_URL`), which is the table owner and, on Neon, a `neon_superuser` member with `BYPASSRLS`, so policies would not apply even if written. 29 tables carry `clerk_org_id`; 41 interactive transactions and 35 raw SQL call sites need tenant context. | `packages/database/src/client.ts`; `schema.prisma` |
| G1 | **A second company cannot be added.** Tenant selection requires a pre-existing `Organisation` (`service.ts:123`); the only creator reuses the oldest row (`current-user-service.ts:90`). One tenant per OAuth session. | |
| G2 | **Ownership is never released.** A disconnected connection keeps `xero_tenant_id` and `remote_connection_id` unique for ever. | `schema.prisma:517-518`; `disconnect.ts:126-140` |
| G3 | **No consolidated calendar.** `getCalendarRange` takes one `organisationId`; pages default to the oldest company. | `calendar-service.ts:230`; `require-active-org-page-context.ts` |
| G4 | **Feeds are single-company.** Every scope resolver filters one company. | `packages/feeds/src/scope/feed-scope.ts` |
| G5 | **Settings UI** has no "Add company", no multi-tenant picker, no conflict copy. | `settings/integrations/xero/*` |
| G6 | **Acting person per company.** One Clerk user can have a `Person` in each company; consolidated self and manager scopes must resolve all of them. | `schema.prisma:445` |
| G7 | **Plan limits and pricing copy** set Premium to one file; the FAQ says multiple files are "coming soon". | `packages/core/src/plan-catalogue.ts:19`; `apps/web/app/pricing/components/pricing-faq.tsx:11` |
| G8 | **Docs** describe multi-entity as supported but unreachable, and omit RLS. | `PRODUCT.md:141-166`, `AGENTS.md`, `SECURITY.md`, `ScreenCatalogue.md` S-20, S-28 |

### Duplicated or unnecessary logic

- `requireActiveOrgPageContext` calls `ensureDefaultOrganisation` (which updates the oldest company's settings) from read paths. Company creation gets one entry point (Task 6).
- The Xero page and integrations page each run their own company `findMany`; both use `listOrganisationsByClerkOrg` plus one connection-state loader.

---

## 2. Decisions

| # | Decision | Status |
|---|---|---|
| D1 | Ordinary **Disconnect** keeps ownership; owner-only **Remove company** archives the company and releases the tenant. | Recommended; proceed unless overruled |
| D2 | Remove company **archives** data (no hard delete) and withdraws publications. | Recommended; proceed unless overruled |
| D3 | `payroll_entities`: Starter 1, Premium 5, Enterprise unlimited. | **Confirmed** |
| D4 | Company selector on pages that already accept `?org=`, shown only with two or more companies. | Recommended; proceed unless overruled |
| D5 | Row Level Security on every tenant table, keyed on `clerk_org_id`, enforced against a restricted runtime role. | **Confirmed** |

RLS keys on `clerk_org_id` because the account is the customer boundary and all members may see every company in their account. Company-level access stays in application scoping (`scopedQuery`, `resolveAccountCompanies`).

AU only: NZ and UK tenants remain rejected at selection (`invalid_country`), unchanged.

---

## 3. Row Level Security design

### Roles

| Role | Attributes | Used by |
|---|---|---|
| Owner (existing `DATABASE_URL` role) | Table owner; bypasses RLS because tables use `ENABLE`, not `FORCE` | Migrations, seed, and the **system client** allowlist only |
| `team_calendar_app` (new) | `LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB`, created with SQL (not the Neon console, which grants `neon_superuser`), owns nothing | All request and tenant job paths via `DATABASE_APP_URL` |

The migration creates `team_calendar_app` as `NOLOGIN` if absent and applies grants; the operator sets `LOGIN PASSWORD` out of band per environment (Neon branch, preview, local). Passwords never enter migrations or logs.

### Grants

- Tenant tables: `SELECT, INSERT, UPDATE, DELETE` to `team_calendar_app`; sequences `USAGE, SELECT`.
- `plans`, `plan_limits`: `SELECT` only, no RLS (global reference data).
- `xero_authorisations`, `stripe_events`, `_prisma_migrations`: **no grant**. Tokens are unreachable from the tenant client; credential handling runs only through the system client in `packages/xero`.
- **No default privileges.** Grants stay explicit per table, issued in the same migration that enables RLS and the policy, so a new table is never readable before it is classified. The catalogue test fails any table that is neither a policy-protected tenant table, a listed reference table nor a listed no-grant table.

### Policies

For each of the 29 tables with `clerk_org_id`:

```sql
ALTER TABLE <t> ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON <t> TO team_calendar_app
  USING (clerk_org_id = current_setting('app.clerk_org_id', true))
  WITH CHECK (
    clerk_org_id = current_setting('app.clerk_org_id', true)
    AND (organisation_id IS NULL OR EXISTS (
      SELECT 1 FROM organisations o
      WHERE o.id = organisation_id
        AND o.clerk_org_id = current_setting('app.clerk_org_id', true)))
  );
```

A missing setting yields `NULL`, so queries return nothing and writes fail: the policy fails closed. The `WITH CHECK` pairing stops a write that carries the current account but another account's company. Many foreign keys reference only the global `organisations.id`, so `clerk_org_id` alone would let account A create, for example, account B's `organisation_settings` row and block B's own. Tables without `organisation_id` (`organisations`, `clerk_org_subscriptions`, `usage_counters`) use the account clause only. Existing composite `(organisation_id, clerk_org_id)` foreign keys stay; the policy covers the rest without rewriting every relation.

### Tenant context in the client

- `packages/database/src/tenant-client.ts`: `tenantDatabase(clerkOrgId: ClerkOrgId)` returns a Prisma client extension bound to an immutable account ID. Every model operation runs as a batch transaction `[SELECT set_config('app.clerk_org_id', $1, true), <operation>]`, so the setting is transaction-local and cannot leak across pooled connections. This is Prisma's documented RLS pattern for query extensions.
- `tenantTransaction(clerkOrgId, fn)`: interactive transactions set the context first, then pass the plain transaction client to `fn` (no nested extension wrapping). All 41 interactive transactions and tenant raw SQL move to this helper.
- Context is passed explicitly per call; no `AsyncLocalStorage` or module globals.
- Inngest handlers build the tenant client from the event payload's `clerk_org_id` after validating it with Zod.

### System client

- `packages/database/src/system-client.ts` exports `systemDatabase` on the owner connection. A boundary test allowlists its importers, including relative imports inside `packages/database` itself:
  - `packages/xero` credential storage, refresh, OAuth sessions and authorisation cleanup;
  - Inngest fan-out that enumerates connections across accounts (`schedule-xero-syncs`, `recover-xero-import-dispatch`, `recount-usage`), which then hands each item to a tenant client;
  - the ICS endpoint's token lookup by `token_hash`, which then renders through `tenantDatabase(feed.clerk_org_id)`;
  - Clerk and Stripe webhooks, before the account is known;
  - seed, migrations and test fixtures.
- The default `database` export is removed from app and domain code once migration completes, so a forgotten call site fails to compile instead of silently bypassing RLS.

### Performance

Each standalone query runs inside its own short transaction with one extra statement. Measure latency on a Neon preview branch in Task 3; hot paths (calendar, feed render) use one `tenantTransaction` for all their reads.

---

## 4. Schema changes

Two migrations, one per logical change:

1. `20261010xxxxxx_row_level_security`: role, grants, default privileges, `ENABLE ROW LEVEL SECURITY` and `tenant_isolation` policies (section 3). SQL only; Prisma schema unchanged.
2. `20261010yyyyyy_xero_multi_company`:
   - `XeroConnection.released_at DateTime?`.
   - Replace `xero_tenant_id @unique` with partial unique `xero_connections_owned_tenant_key ON (xero_tenant_id) WHERE released_at IS NULL`; same for `remote_connection_id` (also `IS NOT NULL`). Prisma `@@unique(..., map, where: raw(...))`, as already used for `feed_tokens`.
   - `organisation_id @unique` stays: a released company is archived, never reconnected.
   - `organisation_id` becomes nullable on `feeds`, `feed_tokens`, `feed_scopes` and `feed_event_publications`: `NULL` means the feed spans every company in the account, as `PRODUCT.md:463` already specifies. The existing default feed is migrated in place (same feed, same active token) to `organisation_id = NULL`, so current subscribers keep their URL and gain the other companies. No new scope enum value.
   - No token columns move; no per-tenant credential copies.

Released connection rows, `sync_runs` and `audit_events` are the connection history; the partial index makes active ownership canonical. Ownership lookups across accounts (conflict checks) run through the system client because RLS hides other accounts' rows by design; the partial unique index remains the final guard.

---

## 5. Tasks

Each task: failing tests first, implement, targeted tests, package gate, one conventional commit.

### Stage 1: Row Level Security (lands first)

#### Task 1: Roles, grants and policies

**Files:** new migration, `packages/database/keys.ts` (`DATABASE_APP_URL`), `scripts/preflight*`, `turbo.json` env passthrough, CI integration setup.

- [ ] Migration per section 3.
- [ ] Preflight fails production when `DATABASE_APP_URL` is absent, its role has `rolsuper`, `rolbypassrls`, `neon_superuser` membership or owns any table.
- [ ] CI and local integration setup create `team_calendar_app` with a test password after migrations.
- [ ] Catalogue integration test: every table with a `clerk_org_id` column has RLS enabled and a `tenant_isolation` policy; `xero_authorisations` and `stripe_events` have no grant to the app role.

#### Task 2: Tenant and system clients

**Files:** `packages/database/src/tenant-client.ts`, `system-client.ts`, `client.ts`, `package.json` exports, `boundary.test.ts`.

- [ ] `tenantDatabase`, `tenantTransaction`, `systemDatabase` per section 3.
- [ ] Integration tests as `team_calendar_app`: account A cannot read, update or delete account B rows even with B's IDs in the `where`; insert with B's `clerk_org_id` fails `WITH CHECK`; insert with A's `clerk_org_id` and B's `organisation_id` (for example `organisation_settings`) fails `WITH CHECK`; no context returns zero rows; context does not survive into the next pooled query; raw SQL inside `tenantTransaction` is filtered.
- [ ] Boundary test: only allowlisted modules import `systemDatabase`.

#### Task 3: Migrate call sites

Package by package, each its own commit: `database` (internal `src/queries/*`, `src/organisation-settings/*` and other helpers importing `../client` by relative path take `clerkOrgId` and use `tenantDatabase`), `availability`, `feeds`, `notifications`, `billing`, `jobs`, `xero` (tenant reads only), `apps/api`, `apps/app`.

- [ ] Replace `database` with `tenantDatabase(clerkOrgId)` or `tenantTransaction`; keep `scopedQuery` (application defence in depth and company filter).
- [ ] Move cross-account paths to `systemDatabase` only where section 3 lists them.
- [ ] Remove the default `database` export and rename the owner client module, so relative imports inside `packages/database` also fail unless allowlisted; typecheck and the boundary test prove no stragglers.
- [ ] Run each package's unit and integration suites against the app role.

### Stage 2: Multi-company accounts

#### Task 4: Plan limits and pricing copy

**Files:** `packages/core/src/plan-catalogue.ts`, `packages/database/src/seed/plans.ts`, `plan-sync.ts`, `apps/web/app/pricing/components/*`, tests.

- [ ] Premium `payroll_entities: 5`; plan sync updates existing `plan_limits` rows idempotently.
- [ ] Pricing comparison shows "Up to 5" for Premium; FAQ answer states Starter 1, Premium up to 5, Enterprise unlimited.
- [ ] Tests: entitlement allows the fifth Premium company and refuses the sixth; Starter refuses the second.

#### Task 5: Ownership release and conflict check

**Files:** migration 2, `packages/database/src/queries/xero-ownership.ts` (+ tests).

- [ ] `claimXeroTenant(tx, scope, tenantId)`: `pg_advisory_xact_lock('xero-tenant:<id>')`, reads the active owner through the system client, returns `same_account`, `unowned` or `owned_elsewhere`; unique violations map to `tenant_binding_conflict`.
- [ ] Integration tests: a second account cannot claim an owned tenant (brief test 3); two concurrent claims from different accounts leave exactly one owner (test 4); a released tenant can be claimed elsewhere.

#### Task 6: Company creation from tenant selection

**Files:** `packages/xero/src/oauth/service.ts`, `packages/availability/src/companies/create-company.ts` (extracted from `current-user-service.ts`), `packages/database/src/queries/billing.ts`.

- [ ] "Add company" starts OAuth without `organisation_id`.
- [ ] `completeXeroTenantSelection` accepts `tenantIds: string[]`. One `GET /connections` call per selection; for each tenant, its own transaction: AU check, `claimXeroTenant`, then `same_account` updates the existing connection (reconnect or authorisation replacement), `unowned` checks the entitlement under `pg_advisory_xact_lock('payroll-entities:<clerk_org_id>')` and creates company, connection, audit event and initial import request (no per-company default feed; the account-wide default feed already covers it), `owned_elsewhere` returns neutral conflict.
- [ ] Per-tenant outcomes; one failure does not roll back others.
- [ ] Remove silent `ensureDefaultOrganisation` from read paths; keep it for first-run onboarding only.
- [ ] Tests: one administrator connects three tenants, all bound to one account (tests 1, 2); repeated callback and selection create no duplicates (test 18).

#### Task 7: Reauthorisation and administrator replacement

- [ ] Reconnect by a different Xero user swaps `xero_authorisation_id` only after `/connections` confirms the tenant; ownership and company preserved; old grant deleted only when orphaned (tests 11, 13).
- [ ] Concurrent refresh with one authorisation shared by two tenants: one provider call, both callers read rotated tokens, ciphertext valid (test 10). No new refresh mechanism.

#### Task 8: Disconnect and Remove company

- [ ] Disconnect one of three tenants: the other two connections, cursors, people and feeds unchanged (test 12).
- [ ] Remove company (`org:owner` only): run the existing remote-first disconnect; set `released_at` only after Xero confirms 204 or 404. A network error, 403, 5xx or other uncertain outcome stops removal with ownership and retryable state intact. Then archive company, Xero-owned people and records; mark publications absent and invalidate KV for every affected feed; audit `company_removed`; repeat calls have no further effect (test 18).
- [ ] No whole-grant token revocation. Authorisation cleanup reuses the existing rule: delete only when no connection references it **and** no unexpired `selecting` OAuth session does (`disconnect.ts:242-260`), so an in-progress Add company flow survives.
- [ ] Tests: uncertain remote failure leaves the tenant owned and the company active; removal during a live selecting session keeps the authorisation.
- [ ] "Disconnect all" loops the same function with per-company results.

#### Task 9: Consolidated calendar

**Files:** `packages/availability/src/calendar/calendar-service.ts`, `packages/database/src/queries/account-companies.ts`, `apps/app/app/(authenticated)/calendar/*`.

- [ ] `resolveAccountCompanies(clerkOrgId)` is the only source of company sets; client filters are intersected with it, unknown IDs are validation errors (test 9).
- [ ] `getCalendarRange({ clerkOrgId, companyIds?, ... })` reads through `tenantDatabase` with `organisation_id IN (owned set)`; applies each company's own settings per record; resolves the acting user's `Person` in every company (G6).
- [ ] Events and people carry `companyId` and `companyName`; company filter hidden for single-company accounts.
- [ ] Privacy transform unchanged and applied before return (test 14).
- [ ] Tests: viewer sees all companies with no credential in scope (test 5); another account's records never appear, including with crafted filters and with application filters removed, proving RLS (tests 8, 9); identical Xero employee and leave IDs in two companies stay separate (test 7).

#### Task 10: Account-wide feeds

- [ ] An account feed (`organisation_id IS NULL`) resolves people across `resolveAccountCompanies`. `self` and `manager_team` resolve every acting `Person` the user has across companies, so a manager's direct reports in each company appear in one feed.
- [ ] A record change in any company invalidates every account feed in the account; Remove company invalidates them all.
- [ ] Tests: sensitive leave types and payroll fields absent from ICS (test 14); revoked token returns 404 with no cached body (test 15); an account feed never includes another account's companies; a manager with reports in two companies sees both in their team feed; adding a second company creates no extra default feed and keeps the existing feed URL; identical Xero IDs in two companies yield distinct UIDs.

#### Task 11: Jobs isolation

- [ ] Handlers re-resolve the connection with both keys and `released_at IS NULL` through `tenantDatabase(event.clerk_org_id)`; a mismatched pair ends as `ignored` with no provider call.
- [ ] Tests: account A's `clerk_org_id` with account B's `organisation_id` makes no Xero request and writes nothing (test 16); a failed sync for tenant 1 leaves tenant 2's cursors, watermarks and records intact and tenant 2 completes (test 17).

#### Task 12: Integration permissions

- [ ] Every mutating Xero action checks `requireRole("org:admin")` or `requireRole("org:owner")`, as `apps/api/app/api/xero/oauth/start/route.ts` already does, before reading input, and resolves the company server-side. Remove company requires `org:owner`.
- [ ] Tests: admin and owner succeed for connect, select, reconnect, disconnect, pause and sync; owner succeeds and admin is refused for Remove company; viewer and manager receive 403 for all of them (test 6); no response contains token fields, `xero_user_id` or raw payloads.

#### Task 13: UI

Impeccable skills (`clarify`, `audit`) where installed; `DESIGN.md` tokens and existing components only.

- [ ] S-20: one row per company with name, state, last sync per entity and error summary; Reconnect, Disconnect, Pause or Resume, Sync now; "Add company" with remaining allowance ("3 of 5 Xero files used"); owner-only Remove company with confirmation explaining release and archive.
- [ ] S-28 picker: checkbox list with per-tenant state (Available, Already in this account, Unavailable). Unavailable copy: "This Xero organisation is connected to another Team Calendar account. Ask its administrator to remove it there first." Plan-limit notice when selections exceed the allowance.
- [ ] Calendar company filter and company label in event detail; company selector (D4).
- [ ] Component tests per state; employees never see integration controls.

#### Task 14: Documentation

- [ ] `SECURITY.md` and `AGENTS.md`: RLS model, roles, `tenantDatabase` and `systemDatabase` rules, `DATABASE_APP_URL`, provisioning steps.
- [ ] `PRODUCT.md`: tenancy, ownership and release, account-wide calendar and feeds, plan limits, identifier map.
- [ ] `ScreenCatalogue.md` S-20, S-28, calendar and feeds as implemented.
- [ ] `tasks/todo.md` review with gate evidence.

#### Task 15: Verification

- [ ] `bun run check`, `bun run typecheck`, `bun run test`, `bun run test:integration` (integration suites connect as `team_calendar_app`), `bun run build`.
- [ ] Compare pre-existing Xero OAuth integration failures with `origin/main` on a fresh database; the count must not grow.
- [ ] `/security-review` on the branch diff; fix every Critical or Important finding.
- [ ] No live Xero calls in automated tests.
- [ ] PR from `ccr-b9673727-bgfb08`; merge only when CI is green.

---

## 6. Brief test coverage map

| Brief test | Task |
|---|---|
| 1, 2 | 6 |
| 3, 4 | 5 |
| 5, 7, 8, 9 | 9 (8 and 9 also 2) |
| 6 | 12 |
| 10, 11, 13 | 7 |
| 12 | 8 |
| 14 | 9, 10 |
| 15 | 10 |
| 16, 17 | 11 |
| 18 | 6, 8 |
| RLS catalogue, cross-account denial, fail-closed context | 1, 2 |

## 7. Risks and limits

- **RLS migration breadth:** 106 importing modules, 41 interactive transactions, 35 raw SQL sites. Removing the default export makes stragglers compile errors, not silent bypasses. Stage 1 is the largest part of this work.
- **Provisioning:** each environment (production, preview branches, local, CI) needs `team_calendar_app` with a password. Preflight blocks a misconfigured production deploy; preview branches inherit the role from the Neon parent branch.
- **System client misuse** is the remaining bypass. Mitigated by the import allowlist and review; each system path hands off to a tenant client as soon as the account is known.
- **Remove company is irreversible** once another account claims the tenant. Owner-only, confirmed and audited.
- **Calendar cost** grows with company count (up to five on Premium). Existing indexes lead with `organisation_id`; `MAX_VISIBLE_PEOPLE` still caps rendering.
- **Mixed company settings** apply per record, so two people on one day may render differently by design.
- **Pre-existing Xero OAuth integration failures** on `main` limit confidence in that suite; Task 15 compares against `main`.
- **Live verification** of multi-tenant selection and of RLS on Neon needs a real multi-file Xero user and a Neon preview branch; NOT VERIFIED until done manually.
