# Database Row-Level Security (RLS) Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden PostgreSQL Row-Level Security (`tenant_isolation` policies, intra-tenant foreign-key ownership checks, and default schema privileges) so `team_calendar_app` cannot link child rows to parent rows across Accounts or across Organisations within an Account, tighten `WITH CHECK` on non-nullable company tables, and prove every boundary in `row-level-security.integration.test.ts`.

**Architecture:**
1. **Tighten Company-Scoped `WITH CHECK` Policies:** Separate the 19 company-scoped tables that have `organisation_id UUID NOT NULL` from the 5 tables with nullable `organisation_id` (`xero_oauth_sessions`, `feeds`, `feed_event_publications`, `feed_scopes`, `feed_tokens`). Remove the redundant `organisation_id IS NULL OR` branch on the 19 non-nullable tables so their RLS policies are self-contained.
2. **Enforce Intra-Tenant Parent Ownership in RLS `WITH CHECK` Policies:** Because PostgreSQL evaluates Foreign Key constraints as the referenced table's owner (bypassing RLS), single-column FKs (`REFERENCES people(id)`, `REFERENCES teams(id)`, etc.) do not stop a buggy query from referencing a UUID in another Account or another Organisation. Add explicit `WITH CHECK` predicates (reusing `tc_manager_belongs_to_account` for Account-scoped `Person` references and `EXISTS (...)` predicates for Company-scoped and Feed-scoped parent references) so PostgreSQL rejects any cross-account or cross-company child write under `team_calendar_app`.
3. **Fail-Closed Default Schema Privileges:** Configure `ALTER DEFAULT PRIVILEGES IN SCHEMA public` to revoke default grants on future tables, sequences, and functions from `PUBLIC` and `team_calendar_app`.

**Tech Stack:** PostgreSQL 15+ RLS, Prisma 7 (`@repo/database`), TypeScript, Vitest.

---

## 1. Findings & Scope Mapping

| ID | Priority | Area | Problem | Planned Resolution |
|---|---|---|---|---|
| **RLS-1** | **P1 (High)** | Intra-tenant FK isolation under RLS | PostgreSQL FK triggers run as table owner and bypass RLS. 14 tenant child tables use single-column FKs whose parent ownership is not checked by the child table's `WITH CHECK` policy. | Enforce parent `(account_id, organisation_id)` or `(account_id)` ownership in each child table's `tenant_isolation` `WITH CHECK` policy via migration `20261025170000_rls_child_reference_integrity`. |
| **RLS-2** | **P2 (Medium)** | Non-nullable company `WITH CHECK` policies | 18 company-scoped tables with `organisation_id NOT NULL` include `organisation_id IS NULL OR EXISTS (...)` in their `WITH CHECK` policy. | Tighten those 18 policies to require `EXISTS (SELECT 1 FROM public.organisations o WHERE o.id = <table>.organisation_id AND o.account_id = NULLIF(current_setting('app.account_id', true), ''))` (matching `people`). |
| **RLS-3** | **P3 (Low)** | Default schema privileges for future objects | Future functions or tables created in migrations rely on authors remembering `REVOKE ALL ... FROM PUBLIC`. | Add `ALTER DEFAULT PRIVILEGES IN SCHEMA public` revoking default table, sequence, and function privileges from `PUBLIC` and `team_calendar_app`. |
| **RLS-4** | **Deferred (Launch Gate 13.1)** | Dedicated `team_calendar_auth` role (`DATABASE_AUTH_URL`) | Better Auth uses `systemDatabase` (`DATABASE_URL`) per the approved transition architecture in `docs/auth-migration/02-design.md` §13.1. | Keep tracked as Launch Gate 13.1 in `docs/auth-migration/02-design.md`; do not alter Better Auth database wiring in this migration slice. |

---

## 2. Parent Reference Classification Matrix (RLS-1)

Every foreign key on a tenant table falls into one of three domain scopes:

### 2.1 Same-Account + Same-Organisation (`account_id` AND `organisation_id` must match parent)
- `people.team_id -> teams.id` (nullable): `team_id IS NULL OR EXISTS (SELECT 1 FROM public.teams t WHERE t.id = people.team_id AND t.account_id = people.account_id AND t.organisation_id = people.organisation_id)`
- `people.location_id -> locations.id` (nullable): `location_id IS NULL OR EXISTS (SELECT 1 FROM public.locations l WHERE l.id = people.location_id AND l.account_id = people.account_id AND l.organisation_id = people.organisation_id)`
- `alternative_contacts.person_id -> people.id` (`NOT NULL`): `EXISTS (SELECT 1 FROM public.people p WHERE p.id = alternative_contacts.person_id AND p.account_id = alternative_contacts.account_id AND p.organisation_id = alternative_contacts.organisation_id)`
- `availability_records.person_id -> people.id` (`NOT NULL`): `EXISTS (SELECT 1 FROM public.people p WHERE p.id = availability_records.person_id AND p.account_id = availability_records.account_id AND p.organisation_id = availability_records.organisation_id)`
- `outbound_operations.availability_record_id -> availability_records.id` (`NOT NULL`): `EXISTS (SELECT 1 FROM public.availability_records r WHERE r.id = outbound_operations.availability_record_id AND r.account_id = outbound_operations.account_id AND r.organisation_id = outbound_operations.organisation_id)`
- `availability_publications.availability_record_id -> availability_records.id` (`NOT NULL`): `EXISTS (SELECT 1 FROM public.availability_records r WHERE r.id = availability_publications.availability_record_id AND r.account_id = availability_publications.account_id AND r.organisation_id = availability_publications.organisation_id)`
- `xero_person_matches.person_id -> people.id` (nullable): `person_id IS NULL OR EXISTS (SELECT 1 FROM public.people p WHERE p.id = xero_person_matches.person_id AND p.account_id = xero_person_matches.account_id AND p.organisation_id = xero_person_matches.organisation_id)`
- `public_holiday_preferences.location_id -> locations.id` (nullable): `location_id IS NULL OR EXISTS (SELECT 1 FROM public.locations l WHERE l.id = public_holiday_preferences.location_id AND l.account_id = public_holiday_preferences.account_id AND l.organisation_id = public_holiday_preferences.organisation_id)`
- `notifications.availability_record_id -> availability_records.id` (nullable): `availability_record_id IS NULL OR EXISTS (SELECT 1 FROM public.availability_records r WHERE r.id = notifications.availability_record_id AND r.account_id = notifications.account_id AND r.organisation_id = notifications.organisation_id)`
- `notification_email_queue.notification_id -> notifications.id` (`NOT NULL`): `EXISTS (SELECT 1 FROM public.notifications n WHERE n.id = notification_email_queue.notification_id AND n.account_id = notification_email_queue.account_id AND n.organisation_id = notification_email_queue.organisation_id)`
- `failed_records.sync_run_id -> sync_runs.id` (`NOT NULL`): `EXISTS (SELECT 1 FROM public.sync_runs s WHERE s.id = failed_records.sync_run_id AND s.account_id = failed_records.account_id AND s.organisation_id = failed_records.organisation_id)`

### 2.2 Same-Account Cross-Company Capable `Person` References (`account_id` must match parent `people.account_id`)
Per `multi-company-routing.integration.test.ts` and `20261014000000_account_manager_visibility`, managers, reviewers, actors, and notification recipients may be employed in Company A while acting on or receiving notifications for a direct report in Company B within the **same Account**:
- `people.manager_person_id -> people.id` (nullable): `public.tc_manager_belongs_to_account(manager_person_id, account_id)` *(already active)*
- `teams.approver_person_id -> people.id` (nullable): `public.tc_manager_belongs_to_account(approver_person_id, account_id)`
- `alternative_contacts.contact_person_id -> people.id` (nullable): `public.tc_manager_belongs_to_account(contact_person_id, account_id)`
- `availability_records.created_by_person_id -> people.id` (nullable): `public.tc_manager_belongs_to_account(created_by_person_id, account_id)`
- `availability_records.reviewed_by_person_id -> people.id` (nullable): `public.tc_manager_belongs_to_account(reviewed_by_person_id, account_id)`
- `outbound_operations.actor_person_id -> people.id` (nullable): `public.tc_manager_belongs_to_account(actor_person_id, account_id)`
- `notifications.recipient_person_id -> people.id` (nullable): `public.tc_manager_belongs_to_account(recipient_person_id, account_id)`

### 2.3 Feed-Scoped Child References (Account-Wide or Company-Scoped Feeds)
Feeds can be either Account-wide (`feeds.organisation_id IS NULL`) or Company-scoped (`feeds.organisation_id IS NOT NULL`):
- `feed_tokens.feed_id -> feeds.id` (`NOT NULL`):
  `EXISTS (SELECT 1 FROM public.feeds f WHERE f.id = feed_tokens.feed_id AND f.account_id = feed_tokens.account_id AND f.organisation_id IS NOT DISTINCT FROM feed_tokens.organisation_id)`
- `feed_scopes.feed_id -> feeds.id` (`NOT NULL`):
  `EXISTS (SELECT 1 FROM public.feeds f WHERE f.id = feed_scopes.feed_id AND f.account_id = feed_scopes.account_id AND f.organisation_id IS NOT DISTINCT FROM feed_scopes.organisation_id)`
- `feed_event_publications.feed_id -> feeds.id` (`NOT NULL`) & `availability_record_id -> availability_records.id` (`NOT NULL`):
  - Feed match: `EXISTS (SELECT 1 FROM public.feeds f WHERE f.id = feed_event_publications.feed_id AND f.account_id = feed_event_publications.account_id AND f.organisation_id IS NOT DISTINCT FROM feed_event_publications.organisation_id)`
  - Record match: `EXISTS (SELECT 1 FROM public.availability_records r WHERE r.id = feed_event_publications.availability_record_id AND r.account_id = feed_event_publications.account_id AND (feed_event_publications.organisation_id IS NULL OR r.organisation_id = feed_event_publications.organisation_id))`

---

## 3. Detailed Tasks

### Task 1: Author Migration `20261025170000_rls_child_reference_integrity`

- **Priority:** P1
- **Original Findings:** RLS-1, RLS-2, RLS-3
- **Problem:**
  1. Child tenant tables with single-column FKs rely on application-layer filtering to prevent linking rows to parent IDs in another Account or another Organisation because PostgreSQL FK constraint triggers run as the table owner and bypass RLS.
  2. 18 company-scoped tables with non-nullable `organisation_id` still include `organisation_id IS NULL OR` in their `WITH CHECK` policies.
  3. Default privileges in `public` are not explicitly revoked for future migrations.
- **Required Outcome:**
  A new forward SQL migration `packages/database/prisma/migrations/20261025170000_rls_child_reference_integrity/migration.sql` that:
  - Revokes default privileges in schema `public` on `TABLES`, `SEQUENCES`, and `FUNCTIONS` from `PUBLIC` and `team_calendar_app`.
  - Tightens `WITH CHECK` on the 18 non-nullable company-scoped tables (`organisation_settings`, `teams`, `locations`, `alternative_contacts`, `xero_connections`, `xero_sync_cursors`, `availability_records`, `outbound_operations`, `availability_publications`, `leave_balances`, `xero_person_matches`, `public_holidays`, `public_holiday_preferences`, `notifications`, `notification_preferences`, `notification_email_queue`, `sync_runs`, `failed_records`, `audit_events`) so `organisation_id IS NULL` is removed from `WITH CHECK`.
  - Adds the parent-ownership `WITH CHECK` predicates from Section 2 to `people`, `teams`, `alternative_contacts`, `availability_records`, `outbound_operations`, `availability_publications`, `xero_person_matches`, `public_holiday_preferences`, `feed_tokens`, `feed_scopes`, `feed_event_publications`, `notifications`, `notification_email_queue`, and `failed_records`.
- **Files:**
  - Create: `packages/database/prisma/migrations/20261025170000_rls_child_reference_integrity/migration.sql`
- **Implementation Steps:**
  - [x] Step 1.1: Create `packages/database/prisma/migrations/20261025170000_rls_child_reference_integrity/migration.sql` with:
    1. `ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC, team_calendar_app;`
    2. `ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM PUBLIC, team_calendar_app;`
    3. `ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM PUBLIC, team_calendar_app;`
    4. Base `tenant_isolation` policy replacement on the non-nullable company-scoped tables without child FKs (`organisation_settings`, `teams`, `locations`, `xero_connections`, `xero_sync_cursors`, `public_holidays`, `notification_preferences`, `sync_runs`, `audit_events`) requiring `account_id = current_setting('app.account_id', true) AND EXISTS (SELECT 1 FROM public.organisations o WHERE o.id = <table>.organisation_id AND o.account_id = current_setting('app.account_id', true))`.
    5. Specific `tenant_isolation` policies on the 14 child tables with parent FK predicates (`people`, `alternative_contacts`, `availability_records`, `outbound_operations`, `availability_publications`, `leave_balances`, `xero_person_matches`, `public_holiday_preferences`, `feed_tokens`, `feed_scopes`, `feed_event_publications`, `notifications`, `notification_email_queue`, `failed_records`) plus `tc_feed_token_belongs_to_feed`.
- **Tests:**
  - Verified in Task 2 via `packages/database/row-level-security.integration.test.ts` and `packages/availability/src/approvals/multi-company-routing.integration.test.ts`.
- **Acceptance Criteria:**
  - Migration SQL is idempotent (`DROP POLICY IF EXISTS tenant_isolation ON ...; CREATE POLICY tenant_isolation ...`), uses `NULLIF(current_setting('app.account_id', true), '')`, and preserves `schema.prisma` compatibility (zero schema drift).
- **Dependencies:** None.
- **Risk:** Low. Only `WITH CHECK` policies on `INSERT`/`UPDATE` for `team_calendar_app` are tightened; `USING` policies on `SELECT`/`UPDATE`/`DELETE` remain lightweight (`account_id = NULLIF(current_setting('app.account_id', true), '')`).

---

### Task 2: Expand `row-level-security.integration.test.ts` to Verify Cross-Account and Cross-Company Child FK Isolation

- **Priority:** P1
- **Original Findings:** RLS-1, RLS-2
- **Problem:** `packages/database/row-level-security.integration.test.ts` currently verifies `people.manager_person_id` cross-account rejection and `organisations` ownership on `people` and `feeds`, but does not test cross-account or cross-company child FK rejection on `people.team_id`, `people.location_id`, `availability_records.person_id`, `teams.approver_person_id`, `feed_tokens.feed_id`, etc.
- **Required Outcome:**
  Add integration test assertions in `packages/database/row-level-security.integration.test.ts` proving that under `withTenantDb`:
  1. Inserting/updating a `Person` in Company A with a `team_id` or `location_id` belonging to Company B (even within the **same Account**) or belonging to another Account is rejected by RLS (`WITH CHECK`).
  2. Inserting an `AvailabilityRecord` in Company A with a `person_id` belonging to Company B (same Account) or another Account is rejected by RLS (`WITH CHECK`), while setting `reviewed_by_person_id` to a manager in Company B of the **same Account** succeeds and setting `reviewed_by_person_id` to a person in **another Account** is rejected.
  3. Inserting a `FeedToken` or `FeedScope` whose `(account_id, organisation_id)` mismatches its parent `Feed` is rejected by RLS (`WITH CHECK`).
- **Files:**
  - Modify: `packages/database/row-level-security.integration.test.ts`
- **Implementation Steps:**
  - [x] Step 2.1: Add a test in `packages/database/row-level-security.integration.test.ts` (`"child RLS policies enforce same-company and same-account parent ownership"`) that creates fixture rows in `tenantA`, `tenantA2` (a second company under `tenantA.accountId`), and `tenantB` (`tenantB.accountId`) and asserts:
    - `people.team_id` and `people.location_id` reject cross-company (`tenantA2`) and cross-account (`tenantB`) IDs, and accept same-company (`tenantA`) IDs.
    - `availability_records.person_id` rejects cross-company (`tenantA2`) and cross-account (`tenantB`) `person_id`s.
    - `availability_records.approved_by_person_id` accepts a same-account cross-company person (`tenantA2`) and rejects a cross-account person (`tenantB`).
    - `feed_tokens.feed_id` and `feed_tokens.rotated_from_token_id` reject linking a company-scoped token to a different company's feed or another feed's token.
- **Tests:**
  - `packages/database/row-level-security.integration.test.ts`
  - `packages/availability/src/approvals/multi-company-routing.integration.test.ts`
- **Acceptance Criteria:**
  - Every cross-account and cross-company child FK violation is rejected by PostgreSQL RLS under `team_calendar_app`.
  - Valid same-account cross-company manager/reviewer/recipient workflows (`multi-company-routing.integration.test.ts`) continue to pass.
- **Dependencies:** Task 1.
- **Risk:** Low.

---

### Task 3: Run Verification Gates & Update Documentation

- **Priority:** P2
- **Original Findings:** RLS-1, RLS-2, RLS-3
- **Problem:** All changes must pass repository static and runtime gates.
- **Required Outcome:**
  - `bun run build`, `bun run check`, `bun run typecheck`, `bun run typecheck:release-tools`, `bun run boundaries`, `bun run test`, and `bun run test:release-tools` pass with zero errors.
  - If a disposable local PostgreSQL instance is configured, run `bun run migrate:deploy` and `bunx vitest run --config vitest.integration.config.ts packages/database/row-level-security.integration.test.ts`.
  - Record results in `tasks/todo.md`.
- **Files:**
  - Modify: `tasks/todo.md`
  - Modify: `docs/superpowers/plans/2026-11-12-database-rls-hardening.md`
- **Implementation Steps:**
  - [x] Step 3.1: Run `bun run check`, `bun run typecheck`, `bun run boundaries`, and `bun run test`.
  - [x] Step 3.2: Apply migration (`bun run migrate:deploy`), verify zero drift (`prisma migrate diff`), and verify live RLS enforcement against `DATABASE_APP_URL`.
  - [x] Step 3.3: Update `tasks/todo.md` and this plan with verification evidence.
- **Acceptance Criteria:**
  - Zero lint, typecheck, boundary, or test failures.
- **Dependencies:** Tasks 1 and 2.
- **Risk:** None.
