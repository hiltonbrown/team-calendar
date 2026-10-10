# Xero Multi-Company Accounts Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans (when installed) to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax. This document authorises no execution in the planning turn. Decisions D1 to D4 must be confirmed before Task 1 starts.

**Goal:** One Team Calendar account (Clerk Organisation) connects several Xero company files through one administrator; every member sees one consolidated, privacy-filtered calendar across those companies; no Xero tenant is ever owned by more than one account.

**Architecture:** Keep the existing model. A "company" is an `Organisation` row bound 1:1 to one `XeroConnection`; credentials live only on the canonical `XeroAuthorisation`. The work closes product gaps around that model: create companies from the OAuth tenant picker, release ownership deliberately, aggregate calendar and feeds across all companies in an account, and expose per-company status and filtering. One additive migration; no new tables, queues, cron jobs or permission system.

**Tech stack:** Existing Bun, Next.js App Router, TypeScript, Prisma 7 (Neon), Clerk, Inngest, Zod, Vitest, `@repo/design-system`. No new dependencies.

**Inspected base:** `9292b6f` (main, 10 October 2026). Read `AGENTS.md`, `PRODUCT.md` (Tenancy, Xero sync, Feeds), `SECURITY.md`, `DESIGN.md`, `.impeccable.md` and `docs/superpowers/plans/2026-10-07-xero-simplification.md` first.

---

## 1. Findings

### Identifier map (do not interchange)

| Concept in the brief | Repository identifier | Where |
|---|---|---|
| Application user ID | Clerk user ID (`created_by_user_id`, `actor_user_id`, `Person.clerk_user_id`) | Clerk |
| Team Calendar organisation ID | `clerk_org_id` (Clerk Organisation); the customer isolation boundary | every tenant table |
| Company (payroll entity) | `Organisation.id` (`organisation_id`) | `organisations` |
| Xero user ID | `XeroAuthorisation.xero_user_id` (verified from the access token) | `xero_authorisations` |
| Xero authorisation ID | `XeroAuthorisation.id` | `xero_authorisations` |
| Xero connection ID | `XeroConnection.remote_connection_id` (Xero's `/connections` id); `XeroConnection.id` is the local row id | `xero_connections` |
| Xero tenant ID | `XeroConnection.xero_tenant_id` | `xero_connections` |

### Already satisfied (reuse, do not rebuild)

1. **Global tenant ownership.** `xero_connections.xero_tenant_id` is `@unique` with no status filter (`packages/database/prisma/schema.prisma:517`). A second account's insert fails at the database; `completeXeroTenantSelection` maps the violation to the generic `tenant_binding_conflict` with no foreign account detail (`packages/xero/src/oauth/service.ts:1075-1083, 1385-1395`).
2. **One credential set per Xero user.** `XeroAuthorisation` is unique on `(provider_app_id, xero_user_id)` and is the sole encrypted token owner (AES-256-GCM, versioned keys). Connections hold only `xero_authorisation_id`. Repeated authorisation by the same Xero user adopts the existing row (`adoptXeroAuthorisation`, `authorisation.ts:69`).
3. **Coordinated refresh.** `refreshXeroAuthorisation` refreshes within two minutes of expiry under the canonical authorisation lock, re-reads state after locking and saves both tokens atomically; invalid grants set `reconnect_required`. Refresh is per authorisation, not per tenant. Dormant grants refresh at 45 days inside the existing scheduler (not a dedicated cron).
4. **Source-tenant identity.** Because `Organisation` to `XeroConnection` is 1:1 and unique, `organisation_id` is the source-tenant key: `Person @@unique([organisation_id, xero_employee_id])`, `AvailabilityRecord @@unique([organisation_id, source_type, source_remote_id])`, `LeaveBalance` and `SyncRun` carry `xero_connection_id`. Records from different tenants cannot collide.
5. **Per-tenant sync.** Cursors, watermarks, stale markers, sweep state and errors live on the connection; jobs carry `clerk_org_id` and `organisation_id` and resolve the connection with both keys (`packages/jobs/src/handlers/xero-sync-access.ts`). One tenant's failure is isolated to its own run.
6. **Rate limiting** is keyed by provider app and Xero tenant in the shared Redis store.
7. **Disconnect** deletes the exact remote connection first, then tears down local sync state, and deletes an authorisation only when no connection references it (`disconnect.ts:243-256`). Sibling connections are untouched.
8. **Roles.** Clerk roles via `requirePageRole("org:admin")` and `@repo/auth`; the Xero settings page already lists every company in the account with its connection state (`settings/integrations/xero/page.tsx`).
9. **Tenant scoping** uses `scopedQuery(clerkOrgId, organisationId)` throughout. No Row Level Security exists.

### Gaps against the brief

| # | Gap | Evidence |
|---|---|---|
| G1 | **A second company cannot be added in product.** Tenant selection requires a pre-existing `Organisation` (`resolveOrganisationForTenantSelection`, `service.ts:123`); the only creator is `ensureOrganisationForClerk`, which reuses the oldest row (`current-user-service.ts:90`). One tenant per OAuth session. | |
| G2 | **Ownership is never released.** A disconnected connection keeps `xero_tenant_id`, so the tenant stays bound to that account permanently; no path archives a company. `remote_connection_id @unique` would also block another account if the same Xero user connects there. | `schema.prisma:517-518`; `disconnect.ts:126-140` |
| G3 | **No consolidated calendar.** `getCalendarRange` and the calendar page take a single `organisationId`; pages default to the oldest company (`require-active-org-page-context.ts`). No company filter or source-company label. | `calendar-service.ts:230`; `calendar/page.tsx` |
| G4 | **Feeds are single-company.** `Feed.organisation_id` and every scope resolver filter one company (`packages/feeds/src/scope/feed-scope.ts`). | |
| G5 | **Settings UI** has no "Add company", no multi-tenant picker and no conflict-specific copy. | `settings/integrations/xero/*` |
| G6 | **Acting person per company.** A Clerk user may have one `Person` per company (`@@unique([organisation_id, clerk_user_id])`); consolidated self and manager scopes must resolve all of them. | `schema.prisma:445` |
| G7 | **Plan limits.** `payroll_entities` is 1 on Basic and Premium, unlimited on Enterprise (`packages/core/src/plan-catalogue.ts:13-25`). Multi-company is Enterprise-only today. | |
| G8 | **Docs** (`PRODUCT.md:141-166`, `AGENTS.md` tenancy, `ScreenCatalogue.md` S-20, S-28) describe multi-entity as supported but unreachable. | |

### Duplicated or unnecessary logic found

- `requireActiveOrgPageContext` silently calls `ensureDefaultOrganisation` (which can mutate the oldest company's settings) from read paths. Company creation should have one entry point (Task 2).
- The Xero page and the integrations page each load companies with their own `findMany`; both should use `listOrganisationsByClerkOrg` plus one connection-state loader.

---

## 2. Decisions to confirm before implementation

| # | Decision | Recommendation |
|---|---|---|
| D1 | **Ownership after disconnect.** Keep or release the tenant? | Ordinary **Disconnect** keeps ownership (reconnect resumes the same company and history). A separate owner-only **Remove company** archives the company and releases the tenant so another account can claim it. |
| D2 | **Data on Remove company.** | Archive, do not hard delete: archive the `Organisation`, its Xero-owned people and records drop out of every calendar, feed and report; publications are withdrawn so subscribed calendars delete the events. Matches existing soft-delete conventions. |
| D3 | **Plan limits.** Keep `payroll_entities` at 1 for Basic and Premium? | Keep as is. The picker shows the limit and an upgrade path; enforcement stays server-side under a lock. Changing pricing is a commercial decision, not part of this work. |
| D4 | **Company navigation for other pages** (people, approvals, reports, settings). | Add a small company selector on pages that already accept `?org=`, shown only when the account has two or more companies. Without it, administrators cannot manage the second company's people or approvals. No other redesign. |

AU only: NZ and UK tenants remain rejected at selection (`invalid_country`), unchanged. The plan does not assume their leave categories or approval rules.

Row Level Security: **not added**. All access runs through one pooled Prisma role with application scoping; RLS would need per-request session variables across Neon pooling and would duplicate the established mechanism. Isolation is hardened in the data-access layer and tested instead.

Token revocation: when Remove company leaves an authorisation with no connections, call Xero's revocation endpoint before deleting the orphaned grant. Ordinary disconnect keeps current behaviour (remote `DELETE /connections/{id}` only).

---

## 3. Schema changes (one migration)

`packages/database/prisma/schema.prisma` and one generated migration `20261010xxxxxx_xero_multi_company`:

1. `XeroConnection.released_at DateTime?`: set by Remove company.
2. Replace `xero_tenant_id @unique` with a partial unique index `xero_connections_owned_tenant_key ON (xero_tenant_id) WHERE released_at IS NULL`. Same for `remote_connection_id` (`WHERE released_at IS NULL AND remote_connection_id IS NOT NULL`). Prisma: `@@unique(..., map: ..., where: raw(...))`, as already used for `feed_tokens` and `availability_records`.
3. `organisation_id @unique` on `XeroConnection` stays: a released company is archived and never reconnected; a new claim creates a new company row.
4. `feed_scope_rule_type` gains `account` (all companies in the Clerk Organisation).
5. No token columns move; no per-tenant credential copies.

History stays where it is: the released connection row, `sync_runs` and `audit_events` are the connection history; the partial index makes the active ownership canonical.

---

## 4. Tasks

Each task: write failing tests first, implement, run the targeted tests, then the package gate. Commit per task (conventional commits).

### Task 1: Ownership schema and release

**Files:** `packages/database/prisma/schema.prisma`, new migration, `packages/database/src/queries/xero-ownership.ts` (+ `.test.ts`, `.integration.test.ts`).

- [ ] Migration per section 3; regenerate client (`bun run migrate`), never hand-edit.
- [ ] `claimXeroTenant(tx, scope, tenantId)` helper: takes `pg_advisory_xact_lock` on `xero-tenant:<tenantId>`, reads the active owner (`released_at IS NULL`), returns `same_account`, `unowned` or `owned_elsewhere`. The partial unique index is the final guard; unique violations map to `tenant_binding_conflict`.
- [ ] Integration tests: a second account cannot claim an owned tenant (brief test 3); two concurrent claims from different accounts produce exactly one owner (test 4, two transactions released together); a released tenant can be claimed by another account.

### Task 2: Company creation from tenant selection

**Files:** `packages/xero/src/oauth/service.ts`, `packages/availability/src/people/current-user-service.ts` (extract `createCompany`), `packages/database/src/queries/billing.ts`.

- [ ] Start OAuth without an `organisation_id` ("Add company"); session status `selecting` keeps `available_tenants_json` as now.
- [ ] `completeXeroTenantSelection` accepts `tenantIds: string[]` (max = tenants in the session). For each tenant, in its own transaction: verify still present in `GET /connections` (existing fetch, once per call), infer region (AU only), `claimXeroTenant`, then:
  - `same_account` → update that company's connection (reconnect or authorisation replacement, existing path);
  - `unowned` → entitlement check under `pg_advisory_xact_lock('payroll-entities:<clerk_org_id>')`, create `Organisation` (name from tenant, account country AU, defaults from the first company), default feed, connection, `xero_connected` audit event, initial import request;
  - `owned_elsewhere` → per-tenant result `tenant_binding_conflict` with neutral copy.
- [ ] Return per-tenant outcomes; one tenant's failure does not roll back the others.
- [ ] Remove the silent `ensureDefaultOrganisation` call from read paths; keep it only for first-run onboarding.
- [ ] Unit and integration tests: one administrator connects three AU tenants, all bound to one account (tests 1, 2); repeated callback and repeated selection are idempotent, no duplicate companies or authorisations (test 18); plan limit blocks the second company on Basic.

### Task 3: Authorisation replacement and reauthorisation

**Files:** `packages/xero/src/oauth/service.ts`, `authorisation.ts`, tests.

- [ ] Reconnect by a different Xero user: the existing path swaps `xero_authorisation_id` only after `/connections` confirms the tenant; add a test that ownership and company are preserved and the old grant is deleted only when orphaned (tests 11, 13).
- [ ] Concurrent refresh test across two callers sharing one authorisation used by two tenants: one provider refresh call, both read the rotated tokens, ciphertext valid (test 10). Reuse the existing refresh fixture.
- [ ] No new refresh mechanism.

### Task 4: Disconnect and Remove company

**Files:** `packages/xero/src/oauth/disconnect.ts`, new `packages/availability/src/companies/remove-company.ts`, `settings/integrations/xero/_actions.ts`.

- [ ] Disconnect stays per company and idempotent (existing). Test: disconnecting one of three tenants leaves the other two connections, cursors, people and feeds unchanged (test 12).
- [ ] Remove company (owner only, `requireRole`): disconnect if connected; set `released_at`; archive the `Organisation`, its Xero-owned people and records; mark its feed publications absent and invalidate KV caches for every affected feed; revoke the authorisation at Xero only when no connection still references it; audit `company_removed`. Repeat calls return success with no further side effects (test 18).
- [ ] "Disconnect all" is a loop over companies calling the same function, reporting per-company results.

### Task 5: Account-wide calendar aggregation

**Files:** `packages/availability/src/calendar/calendar-service.ts` (+ tests), new `packages/database/src/queries/account-companies.ts`, `apps/app/app/(authenticated)/calendar/*`.

- [ ] `resolveAccountCompanies(clerkOrgId)` returns active companies only; this is the only source of the `organisation_id` set. Client-supplied company filters are intersected with it; unknown IDs return validation errors (test 9).
- [ ] `getCalendarRange` accepts `{ clerkOrgId, companyIds?, ... }`; loads people and records with `clerk_org_id = X AND organisation_id IN (owned set)`; applies each company's own `OrganisationSettings` (visibility, pending display, privacy) per record; resolves the acting user's `Person` in every company for self and manager scopes (G6).
- [ ] Events and people carry `companyId` and `companyName`; the page adds a company filter (hidden for single-company accounts).
- [ ] Privacy transform unchanged and applied before return: masked or private records show the generic "Away" label with no leave type, hours or payroll metadata (test 14).
- [ ] Tests: viewer sees all companies without any Xero credential in scope (test 5); records from another account never appear even with a crafted filter (tests 8, 9); two tenants with the same Xero employee and leave IDs render as separate people and events (test 7).

### Task 6: Account-wide feeds

**Files:** `packages/feeds/src/scope/feed-scope.ts`, `projection/*`, `publication/*`, `cache/*`, `/settings/feeds`, `/feeds`.

- [ ] `account` scope resolves people across `resolveAccountCompanies`; `self` resolves the user's people in every company. The default organisation feed for multi-company accounts uses `account`.
- [ ] UID strategy unchanged (`PRODUCT.md` formula already includes organisation identity; confirm in a test that identical Xero IDs in two companies produce distinct UIDs).
- [ ] Cache invalidation: a record change in company B invalidates every `account` feed in the same Clerk Organisation; Remove company invalidates them all.
- [ ] Tests: sensitive leave types and payroll fields are absent from ICS output (test 14); a revoked token returns 404 and serves no cached body (test 15); an `account` feed never includes another account's companies.

### Task 7: Jobs isolation hardening

**Files:** `packages/jobs/src/handlers/xero-sync-access.ts`, `schedule-xero-syncs.ts`, tests.

- [ ] Every handler re-resolves the connection with both keys and `released_at IS NULL`; a mismatched or released pair ends the run as `ignored` without provider calls.
- [ ] Tests: an event carrying account A's `clerk_org_id` with account B's `organisation_id` performs no Xero request and writes nothing (test 16); a failed people sync for tenant 1 leaves tenant 2's cursors, watermarks and records unchanged and tenant 2's run completes (test 17).

### Task 8: Permissions on integration surfaces

**Files:** `settings/integrations/xero/_actions.ts`, `connect/_actions.ts`, API routes under `apps/api/app/api/xero/*`.

- [ ] Confirm each mutating action calls `requireRole('admin')` (Remove company: owner) before reading input, and resolves the company server-side from `clerk_org_id`.
- [ ] Tests: viewer and manager receive 403 for connect, select, reconnect, disconnect, remove, pause and manual sync (test 6); no response body contains token fields, `xero_user_id` or raw payloads.

### Task 9: UI

Use the Impeccable skills (`clarify`, `audit`) where installed; `DESIGN.md` tokens and existing components only.

- [ ] S-20 Xero settings: one row per company with name, connection state, last sync per entity, error summary; actions Reconnect, Disconnect, Pause or Resume, Sync now; "Add company" button; owner-only Remove company with confirm dialog explaining release and archive.
- [ ] S-28 picker: checkbox list of tenants with state per tenant (Available, Already in this account, Unavailable). Unavailable copy: "This Xero organisation is connected to another Team Calendar account. Ask its administrator to remove it there first." No foreign names. Plan-limit notice when selections exceed the entitlement.
- [ ] Calendar company filter and company label in event detail; company selector (D4) on pages already taking `?org=`.
- [ ] Component tests for each state; employees never see integration controls.

### Task 10: Documentation

- [ ] `PRODUCT.md` tenancy and Xero sections: ownership, release, account-wide calendar and feeds, identifier map.
- [ ] `AGENTS.md` tenancy invariants: partial ownership index, `released_at`, `resolveAccountCompanies` as the only source of company sets.
- [ ] `ScreenCatalogue.md` S-20, S-28, calendar and feeds entries reflecting implemented behaviour only.
- [ ] `tasks/todo.md` review section with gate evidence.

### Task 11: Verification

- [ ] `bun run check`, `bun run typecheck`, `bun run test`, `bun run test:integration` (local PostgreSQL and the KV shim), `bun run build`.
- [ ] Compare the Xero OAuth integration failures with `origin/main` on a fresh database; the existing pre-dated failures must not grow.
- [ ] `/security-review` on the branch diff; fix every Critical or Important finding.
- [ ] No live Xero calls in automated tests; fixtures only.
- [ ] Open a PR from `ccr-b9673727-bgfb08`; merge only when CI is green.

---

## 5. Brief test coverage map

| Brief test | Task |
|---|---|
| 1, 2 | 2 |
| 3, 4 | 1 |
| 5, 7, 8, 9 | 5 |
| 6 | 8 |
| 10, 11, 13 | 3 |
| 12 | 4 |
| 14 | 5, 6 |
| 15 | 6 |
| 16, 17 | 7 |
| 18 | 2, 4 |

## 6. Risks and limits

- **Remove company is irreversible for the releasing account** once another account claims the tenant. Mitigated by owner-only access, a confirmation dialog and audit.
- **Calendar performance:** aggregation multiplies rows by company count. Existing indexes lead with `organisation_id`; `IN` over a handful of companies is acceptable. `MAX_VISIBLE_PEOPLE` still caps rendering.
- **Mixed company settings** (privacy, visibility) apply per record, so two people on the same day may render differently by design.
- **Feed SEQUENCE:** moving the default feed to `account` scope adds events, not changes; existing UIDs stay stable.
- **Pre-existing Xero OAuth integration failures** on `main` (17 to 51 depending on environment) limit confidence in that suite; Task 11 compares against `main` rather than claiming a clean run.
- **Live Xero verification** of multi-tenant selection needs a real multi-file Xero user; NOT VERIFIED until done manually on a preview deployment.
