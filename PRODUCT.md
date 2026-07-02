# Team Calendar Product Specification

## Companion documents

| Document | Purpose |
|---|---|
| `PRODUCT.md` | This file. Authoritative product truth, architecture, schema, and non-negotiables. |
| `CLAUDE.md` | Coding agent instructions, repo conventions, package boundaries, and environment variables. |
| `DESIGN.md` | Colour tokens, typography, spacing, elevation, and component specifications. |
| `.impeccable.md` | Brand personality, user context, and design principles. |

Where this document conflicts with any other, PRODUCT.md takes precedence.

---

## Register

product

## Users

Three overlapping user types, each with different needs and contexts:

- **HR admins and ops managers**: configure Xero connections, manage feeds, review sync health and audit logs. High data density is acceptable; they need control and confidence.
- **Team managers**: see who is out or working remotely across their team on any given day. Scannability and calendar views are the primary surface. They visit frequently, often briefly.
- **Employees**: self-service visibility into their own leave, balances, and availability. Their surfaces should be lighter, less dense, and more approachable.

The interface must serve all three without making any group feel like a second-class citizen.

## Product Purpose

Team Calendar exists so that a small business can see who is in, who is out, and why, without hunting through texts, email, or Xero. It is built first for small teams on Xero Payroll where leave admin has outgrown a shared calendar, and grows with them. Employees submit and manage leave; managers approve or decline; the resulting state writes back to Xero synchronously and publishes as secure ICS feeds for calendar subscriptions.

Success: a team manager arrives, scans their calendar, and is back to work in under 30 seconds.

## Brand Personality

**Modern. Calm. Precise.**

Team Calendar is a tool people trust with real business data. It should feel like a well-made instrument: composed, reliable, purposeful. It does not try to entertain. It does not overwhelm. Every screen should lower cognitive load, not raise it.

The emotional goal is **quiet confidence**: the user arrives, sees what they need, acts, and leaves. No friction, no noise.

## Anti-references

- **Notion**: flat document aesthetic, undifferentiated text-heavy layout, absent visual hierarchy, low-contrast chrome.
- Generic SaaS-cream palettes (warm-tinted near-white backgrounds).
- Hero-metric card grids and numbered section scaffolding (01 / 02 / 03).
- Any tool that prioritises decoration over density.

## Design Principles

1. **Clarity over cleverness**: calendar and availability data must be immediately scannable. Visual hierarchy is non-negotiable. When in doubt, simplify.
2. **Green as signal, not wallpaper**: the primary green earns its place on screen. Use it for primary actions, success states, and brand anchors. Resist applying it broadly as background colour or decoration.
3. **Density is role-appropriate**: admin and manager views can be denser. Employee-facing surfaces should breathe. Never sacrifice readability for compactness.
4. **Calm confidence through space**: whitespace is load-bearing. Crowded layouts erode trust. Generous padding and clear separation between sections are defaults, not luxuries.
5. **Frosted touch, used sparingly**: translucent backdrop-blurred surfaces are reserved for elevated transient UI only (modals, popovers, toasts, sticky chrome). Never beneath primary content, dense data, or calendars.

## Accessibility & Inclusion

WCAG 2.2 AA is the floor for all text, interactive elements, and status indicators. Colour is never the sole differentiator for status. `prefers-reduced-motion` and `prefers-reduced-transparency` are respected throughout. Australian English only.

---

## Product truth

Team Calendar is a multi-tenant leave management and availability publishing platform for small businesses running Xero Payroll (AU, NZ, UK). Employees submit and manage leave inside Team Calendar; managers approve or decline; approved state writes back to Xero synchronously via the Xero API. Xero remains the payroll source of truth for balances and accruals, which Team Calendar reads but never calculates.

Alongside Xero leave, Team Calendar captures manual availability entries (WFH, travelling, training, client site) that are not written to Xero, then publishes a combined, privacy-controlled view as secure ICS feeds.

The architecture is:

**Leave submission layer > bidirectional Xero sync layer > canonical availability model > feed projection layer > ICS publishing layer**

### Sync direction (authoritative)

| Direction | Mechanism | Scope |
|---|---|---|
| Inbound | Pull-first, scheduled Inngest jobs | Employees, leave records, leave balances. Xero provides no leave webhooks. |
| Outbound | Synchronous, user-triggered API write | Submit, approve, decline, withdraw. No background queue. Failures surfaced inline. |

Bidirectional leave management is a shipped capability of the initial build, not a future item. The build order (steps 6 and 7) implements submission and approval write-back as core slices.

### Product boundaries

Team Calendar is:

- a leave submission and approval workflow system, bidirectionally synced with Xero Payroll
- a canonical availability publisher
- a Xero leave visibility and management layer
- a manual availability entry surface for non-leave events (WFH, travelling, training, client site)
- a secure ICS feed generator for Outlook, Google Calendar, and Apple Calendar
- a real-time notification platform (SSE-delivered in-app notifications, plus transactional email)

Team Calendar is not:

- a full HRIS
- a payroll engine or accrual calculator (balances are read from Xero, never computed)
- a multi-connector abstraction layer (Xero only at this stage)

### Product boundaries (future)

Slack notifications, Teams integration, HTML calendar views, and additional provider connectors (MYOB, Employment Hero, QuickBooks) are out of scope for the initial build. The architecture accommodates these without requiring structural changes.

---

## Stack decisions

| Concern | Choice | Notes |
|---|---|---|
| Framework | Next.js on next-forge | Turborepo monorepo |
| Runtime | Bun | Package manager and script runner |
| Database | PostgreSQL (Neon serverless) | |
| ORM | Prisma 7 | With `@prisma/adapter-neon` |
| Auth | Clerk | Organisations feature; no custom workspace table |
| Job queue | Inngest | Durable execution, scheduling, retries |
| Email | Resend + React Email | Transactional email only |
| Monitoring | Sentry | Error tracking and performance |
| Feed caching | Vercel KV | Redis-compatible; feed body and ETag caching |
| ICS generation | ical-generator | Supports VEVENT, UID, SEQUENCE, all-day events |
| Deployment | Vercel | `apps/app`, `apps/api`, `apps/web` only |
| Testing | Vitest | Co-located test files |
| Linting | Biome 2 + Ultracite | |
| Real-time notifications | SSE via Vercel streaming | No WebSocket infrastructure required |
| Public holiday data | Nager.Date API | Auto-sourced per country and region; manual overrides in database |

---

## Tenancy model

Team Calendar uses **Clerk Organisations** as the top-level tenant boundary. There is no custom `workspaces` database table.

Multi-entity groups are a supported capability, not the primary case. The typical customer is a single small business (one Account, one payroll entity). The model below also supports a business that grows into several payroll entities under one Account. Nothing in this section changes with buyer size; the invariants hold in both cases.

| Concept | Role |
|---|---|
| Clerk Organisation | Top-level tenant boundary; billing anchor. Identified by Clerk's `org_id` (stored as `clerk_org_id`). One Clerk Organisation = one country code. |
| Organisation | Legal or payroll entity within a Clerk Organisation (e.g. "Acme Restaurants Pty Ltd", "Acme Hotels Pty Ltd"). Owns one XeroConnection, one XeroTenant, its own People and Feeds. |
| XeroConnection | One per Organisation. Holds the OAuth credential set for that Organisation's Xero file. Current-state only; lifecycle history in `audit_events`. |
| XeroTenant | One per XeroConnection. Carries Xero's `xero_tenant_id` and the payroll region (AU, NZ, UK). |
| User | Authenticated identity via Clerk. Managed entirely by Clerk; no local users table. |
| Membership | User-to-Clerk-Organisation relationship. Managed entirely by Clerk; no custom membership table. |
| Team | Grouping of people within an Organisation. |
| Location | Work location within an Organisation; used for feed scoping and timezone/holiday handling. |

### Key invariants

- One Clerk Organisation maps to exactly one country code. A Clerk Organisation will never span AU, NZ, and UK simultaneously. This is enforced at the application layer, not via a database constraint.
- One Organisation owns exactly one XeroConnection (`UNIQUE` on `organisation_id`).
- One XeroConnection owns exactly one XeroTenant (`UNIQUE` on `xero_connection_id`).
- A Clerk Organisation with multiple payroll entities (e.g. two AU Xero files) has multiple Organisation rows, each with its own XeroConnection and XeroTenant.
- Billing, plan limits, and usage are enforced at the Clerk Organisation level.
- **All database queries must filter by `clerk_org_id`**, sourced from `auth().orgId` in server context.

### Auth integration

- Personal Accounts are disabled in the Clerk dashboard. Every user must belong to at least one Clerk Organisation.
- The `<OrganizationSwitcher />` component provides tenant switching. No custom switcher is required.
- Roles are defined once as custom roles in the Clerk dashboard and apply across all Clerk Organisations.
- The `auth()` helper (server) and `useAuth()` / `useOrganization()` hooks (client) provide `orgId` and role context.
- For background fetches (Inngest jobs, API routes not initiated from the active tab), call `getToken()` and pass the result in the `Authorization` header. Do not rely on the session cookie alone in background contexts.

### Roles

| Role | Scope |
|---|---|
| owner | Full Clerk Organisation access |
| admin | Full Organisation (payroll entity) access |
| manager | Team and direct-report access |
| viewer | Read-only filtered access |

Permission checks use `auth().has({ role: 'org:admin' })` or the `has()` helper from `packages/auth`. No custom roles or permissions tables are required.

---

## Monorepo structure

```text
team-calendar/
├─ apps/
│  ├─ app/                    # authenticated product UI (port 3000)
│  ├─ api/                    # sync, webhooks, feed endpoints, admin APIs (port 3002)
│  ├─ web/                    # marketing site (port 3001)
│  ├─ docs/                   # product and implementation docs (port 3004)
│  └─ email/                  # notification templates (dev preview only; not deployed) (port 3003)
├─ packages/
│  ├─ database/               # Prisma schema, migrations, queries
│  ├─ auth/                   # Clerk helpers, requireOrg(), requireRole(), getOrgId()
│  ├─ design-system/          # shared UI components (shadcn/ui, Tailwind)
│  ├─ core/                   # shared types, enums, Result pattern, utilities
│  ├─ xero/                   # Xero OAuth, tenant sync, region mapping, write operations
│  ├─ availability/           # canonical domain logic
│  ├─ feeds/                  # ICS generation, UID rules, feed filtering
│  ├─ notifications/          # in-app and email notifications
│  ├─ jobs/                   # Inngest job definitions, scheduling
│  ├─ observability/          # Sentry, logging, sync metrics
│  ├─ email/                  # React Email + Resend
│  ├─ next-config/            # shared Next.js configuration
│  ├─ seo/                    # SEO metadata helpers
│  └─ typescript-config/      # shared tsconfig base
└─ tooling/
   ├─ seed/
   ├─ import/
   └─ scripts/
```

### Packages not in use

The following next-forge scaffold packages are present in some form but must not be imported or depended upon: `packages/ai`, `packages/cms`, `packages/collaboration`, `packages/feature-flags`, `packages/internationalization`, `packages/payments`, `packages/rate-limit`, `packages/security`, `packages/storage`, `packages/webhooks`.

The scaffold apps `apps/studio` and `apps/storybook` have been removed from the repository.

`apps/email` is retained for React Email template development and Resend integration. It is a dev preview app only and is not deployed to a production Vercel project.

---

## App responsibilities

### `apps/app`

Authenticated UI for team calendar, person profiles, leave submission, leave approval, leave balance display, manual availability entry, Xero leave visibility, feed management, privacy rule configuration, publishing health, admin settings, and sync health and audit log.

### `apps/api`

- Xero OAuth flow and token refresh
- Xero employee and leave sync endpoints
- Leave submission, approval, decline, and withdrawal endpoints (outbound Xero writes)
- SSE notification stream: `GET /api/notifications/stream`
- Manual availability CRUD
- Feed rendering endpoint: `GET /ical/:token.ics`
- Feed preview APIs
- Inngest job handlers (sync scheduling, feed rebuilds, reconciliation)
- Publish invalidation and audit event writes

### `apps/web`

Public site: marketing pages, Xero integration detail, pricing, security and privacy, blog and changelog, help centre.

### `apps/docs`

Xero setup guide, ICS subscription instructions, admin handbook, API integration notes.

### `apps/email`

React Email template development environment for transactional notification email. Operational messages include: sync failure alerts, feed token rotation notices, privacy conflict notifications, and missing alternative contact reminders. Not deployed to production; templates are consumed by `packages/email` and dispatched via Resend.

---

## Package design

### `packages/auth`

Provides Clerk auth helpers and organisation-scoping utilities used across `apps/app` and `apps/api`.

- `requireOrg()`: reads `auth().orgId`; throws if absent.
- `requireRole(role)`: reads `auth().has({ role })`; returns a 403 Result if the check fails.
- `getOrgId()`: returns the current `clerk_org_id` for use in database queries.
- Re-exports Clerk's `auth()`, `currentUser()`, `useAuth()`, `useOrganization()`, `useOrganizationList()`.
- Contains no custom membership or role tables.

### `packages/xero`

Isolates all Xero-specific logic. Region-specific logic isolated in subdirectories.

```text
packages/xero/src/
├─ oauth/
├─ tenants/
├─ au/
│  └─ write.ts
├─ nz/
│  └─ write.ts
├─ uk/
│  └─ write.ts
├─ mappings/
├─ sync/
├─ types/
└─ errors/
```

Responsibilities: Xero OAuth token management (acquire, refresh, encrypt at rest using `XERO_TOKEN_ENCRYPTION_KEY`), tenant discovery and connection state, employee sync, leave record sync, leave-type mapping to canonical types, source fingerprinting and change detection, normalisation into canonical `AvailabilityRecord` shape, region-specific API differences.

#### Write operations

Submit, approve, decline, and withdraw leave applications to Xero Payroll. All write operations return `Result<T, XeroWriteError>`.

`XeroWriteError` variants: `validation_error`, `conflict_error`, `auth_error`, `rate_limit_error`, `unknown_error`.

Outbound write failures are surfaced synchronously to the user in plain language. The raw Xero error payload is stored in `xero_write_error_raw` for admin audit only; never displayed to employees.

#### Rate limits

- 60 API calls per minute per connected organisation
- 5,000 API calls per day per connected organisation
- Five concurrent requests maximum per connected organisation
- 10,000 calls per minute app-wide

Rate limiting, backoff, and retry logic live inside this package.

### `packages/availability`

Canonical business domain: person model, manual availability model, Xero leave normalisation target, visibility and privacy rules, contactability handling, feed eligibility rules, scope filtering, leave submission and approval state machine, leave balance CRUD (for admin-managed manual balances).

### `packages/feeds`

Turns canonical availability into stable ICS output via `ical-generator`. Handles VEVENT rendering, stable UID generation, DTSTART/DTEND, all-day events, privacy masking, DESCRIPTION generation, secure feed token validation, feed scope projection (applies `FeedScope` rows at render time), and feed caching via Vercel KV.

### `packages/jobs`

Inngest job definitions and scheduling: tenant sync scheduling, feed rebuild scheduling, backfill jobs, nightly reconciliation, dead-letter handling. Jobs carry `clerk_org_id` and `organisation_id` in their event payloads.

### `packages/notifications`

In-app notification creation, SSE delivery via `apps/api`, notification preferences, and email dispatch via Resend. Notification rows are owned by the `notifications` table. No external notification service is used for in-app state.

### `packages/core`

- `Result<T, E>` type
- Branded ID types (`ClerkOrgId`, `OrganisationId`, `PersonId`, `XeroTenantId`, etc.)
- Shared enums
- Date and timezone utilities
- Error types

---

## Core domain model

The primary object is an **AvailabilityRecord**, not a "leave application". This keeps the model provider-agnostic and accommodates both Xero leave and manual availability entries.

### Entities

```text
Organisation
XeroConnection
XeroTenant
XeroSyncCursor
Team
Location
Person
AlternativeContact
AvailabilityRecord
AvailabilityPublication
LeaveBalance
PublicHoliday
Feed
FeedScope
FeedToken
SyncRun
FailedRecord
Notification
NotificationPreference
AuditEvent
Plan
PlanLimit
ClerkOrgSubscription
UsageCounter
```

---

## Database schema

The full Prisma schema is the authoritative reference and lives at `packages/database/prisma/schema.prisma`. The following summarises every table's purpose and key constraints.

### Tenant isolation

Every tenant-scoped table carries `clerk_org_id` (text, not null, indexed). This is the Clerk `org_id` string (e.g. `org_2abc...`). All queries must filter by this column. It is the first line of tenant isolation before any Organisation-level filtering.

The join tables `feed_tokens`, `feed_scopes`, and `availability_publications` now carry their own `clerk_org_id` column for direct tenant isolation.

### `organisations`

Legal or payroll entity within a Clerk Organisation. One Clerk Organisation may have multiple rows (e.g. Acme Restaurants, Acme Hotels). `country_code` is uniform across all rows sharing a `clerk_org_id` (app-layer invariant, not a DB constraint).

### `teams`

Grouping of people within an Organisation. Optional `manager_person_id` FK.

### `locations`

Work location within an Organisation. Carries `region_code` (e.g. QLD, Auckland, Scotland) for public holiday scoping.

### `people`

Employees, contractors, directors, and offshore staff. `source_system` distinguishes Xero-synced from manually created records. Unique on `(organisation_id, source_system, source_person_key)`.

### `alternative_contacts`

Contact alternatives for a person when they are unavailable. Ordered by `priority`.

### `xero_connections`

One row per Organisation. Current-state only (Scenario A): the row is updated in place when a token is refreshed or a connection is revoked. Historical lifecycle is captured in `audit_events`. Unique on `organisation_id`. Tokens stored AES-256-GCM encrypted using `XERO_TOKEN_ENCRYPTION_KEY`; never in plaintext.

### `xero_tenants`

One row per XeroConnection (one per Xero file). Unique on `xero_connection_id`. Carries `payroll_region` (AU, NZ, UK) which determines which Xero Payroll API is used for all sync and write operations. Has an explicit FK to `organisations` via `organisation_id`, declared as a Prisma relation.

### `xero_sync_cursors`

Tracks incremental sync state per entity type per Xero tenant. One row per `(xero_tenant_id, entity_type)` pair; updated in place.

### `availability_records`

Core table. Holds both Xero-synced leave and manual availability entries. Unique on `(organisation_id, source_type, source_remote_id)` for Xero-sourced records.

**Note on the unique constraint:** PostgreSQL treats each NULL value as distinct, so this constraint does not prevent duplicate manual records where `source_remote_id IS NULL`. Application-layer guards in `packages/availability` must prevent duplicate manual records from reaching the database; tests must assert this behaviour.

`source_payload_json` retains the raw Xero response for audit. `xero_write_error_raw` retains the raw Xero write error for admin audit only; never displayed to employees. `derived_uid_key` holds the stable ICS UID.

### `availability_publications`

Materialised publishing state per AvailabilityRecord. Decouples raw data from what was actually emitted in a feed. `published_sequence` increments on material change. Carries `clerk_org_id` for direct tenant isolation.

### `leave_balances`

Fetched from Xero per person per leave type during normal operation, or managed manually by admins when Xero is not connected. `xero_tenant_id` is nullable to support admin-managed manual balances. Never calculated by Team Calendar. Updated in place. Unique on `(person_id, xero_tenant_id, leave_type_xero_id)` for Xero-sourced rows.

**Note on the unique constraint:** PostgreSQL treats each NULL value as distinct, so the composite unique above does not prevent duplicate manual balances where `xero_tenant_id IS NULL`. A partial unique index on `(person_id, leave_type_xero_id) WHERE xero_tenant_id IS NULL` guards the manual case so create-or-update can target a single row.

### `public_holidays`

Sourced from Nager.Date API or entered manually. `location_id = null` means the holiday applies to all locations in the Organisation. Unique on `(organisation_id, source, source_remote_id)`.

### `notifications`

In-app notifications delivered via SSE. Per-user, per-Clerk-Organisation. SSE connections must not leak across `clerk_org_id` boundaries.

### `notification_preferences`

Per-user, per-Organisation opt-in settings. Defaults: `in_app_enabled = true`, `email_enabled = true`. Unique on `(user_id, organisation_id, notification_type)`.

### `feeds`

ICS calendar feeds. `organisation_id` is nullable: a null value means the feed spans all Organisations within the Clerk Org. Unique on `(clerk_org_id, slug)`.

### `feed_scopes`

Normalised scope rules per feed. Each row is one include rule. Carries `clerk_org_id` for direct tenant isolation.

### `feed_tokens`

Signed, revocable tokens. `token_hash` stored; plaintext never persisted. `rotated_from_token_id` provides a rotation trail within this table. Revoked and expired tokens return 410. Carries `clerk_org_id` for direct tenant isolation.

### `sync_runs`

One row per sync execution. Pinned to `Organisation` via UUID FK and to `XeroTenant` for the specific Xero file synced.

### `failed_records`

Dead-letter table for individual record failures within a sync run.

### `audit_events`

Full lifecycle audit log. `organisation_id` is nullable to cover Clerk-Org-level events (e.g. OAuth connection changes). `old_values_json` / `new_values_json` are arbitrary entity snapshots.

### Billing tables

`plans` (unique on `key`), `plan_limits` (unique on `(plan_id, limit_type)`), `clerk_org_subscriptions` (unique on `clerk_org_id`; relates to `plans` via `plan_key` to `plans.key`), `usage_counters` (unique on `(clerk_org_id, metric_key, period_start, period_end)`).

---

## Indexes and constraints summary

### Unique constraints

| Table | Constraint |
|---|---|
| `xero_connections` | `organisation_id` |
| `xero_tenants` | `xero_connection_id` |
| `xero_sync_cursors` | `(xero_tenant_id, entity_type)` |
| `people` | `(organisation_id, source_system, source_person_key)` |
| `availability_records` | `(organisation_id, source_type, source_remote_id)`; NULL-distinct, app-layer guard required for manual records |
| `availability_publications` | `availability_record_id` |
| `leave_balances` | `(person_id, xero_tenant_id, leave_type_xero_id)` for Xero-sourced rows; partial unique on `(person_id, leave_type_xero_id) WHERE xero_tenant_id IS NULL` for manual balances |
| `public_holidays` | `(organisation_id, source, source_remote_id)` |
| `notification_preferences` | `(user_id, organisation_id, notification_type)` |
| `feeds` | `(clerk_org_id, slug)` |
| `plans` | `key` |
| `plan_limits` | `(plan_id, limit_type)` |
| `clerk_org_subscriptions` | `clerk_org_id` |
| `usage_counters` | `(clerk_org_id, metric_key, period_start, period_end)` |

### Key indexes

- `clerk_org_id` on every tenant-scoped table
- `availability_records(person_id, starts_at, ends_at)`
- `availability_records(organisation_id, publish_status, include_in_feed)`
- `availability_records(source_type, source_last_modified_at)`
- `feed_scopes(feed_id, rule_type, rule_value)`
- `audit_events(entity_type, entity_id, created_at)`
- `xero_sync_cursors(xero_tenant_id, entity_type)`
- `notifications(recipient_user_id, is_read)`
- `notifications(recipient_user_id, created_at)`
- `sync_runs(organisation_id)`
- `sync_runs(xero_tenant_id)`

---

## Canonical event UID strategy

### UID formula

```text
uid = sha256(
  clerk_org_id + "|" +
  organisation_id + "|" +
  person_id + "|" +
  source_type + "|" +
  stable_source_key + "|" +
  starts_at_utc + "|" +
  ends_at_utc + "|" +
  record_type
) + "@ical.teamcalendar.online"
```

Where `stable_source_key` is:

- for Xero records: `xero_tenant_id + employee_id + leave_type + start + end + units`
- for manual records: the `availability_records.id`

### SEQUENCE handling

`published_sequence` on `availability_publications` increments when the published representation changes materially. Never create a new UID for an updated event; increment SEQUENCE instead.

---

## Xero sync model

Inbound: pull-first polling. Xero does not provide webhooks for leave data.
Outbound: synchronous API write triggered by user action. No background queue for outbound writes.

### Sync jobs (Inngest)

| Job | Direction | Purpose |
|---|---|---|
| `sync-xero-people` | Inbound | Fetch and upsert employees from Xero |
| `sync-xero-leave-records` | Inbound | Fetch leave records, map to `availability_records` |
| `sync-xero-leave-balances` | Inbound | Fetch leave balances per person per leave type |
| `reconcile-feed-publications` | Internal | Ensure `availability_publications` match current records |
| `rebuild-feed-cache` | Internal | Regenerate cached ICS feed bodies in Vercel KV |
| `reconcile-xero-approval-state` | Bidirectional | Detect and resolve approval state drift |

All jobs carry `clerk_org_id` and `organisation_id` in their event payloads. Never rely on session context inside a job handler.

### Outbound write operations

| Operation | Trigger | State transition |
|---|---|---|
| Submit | Employee submits draft leave | `draft → submitted` |
| Approve | Manager approves submitted leave | `submitted → approved` |
| Decline | Manager declines with required reason | `submitted → declined` |
| Withdraw | Employee or admin withdraws leave | `submitted/approved → withdrawn` |

All write operations are synchronous. Failures are surfaced inline to the acting user. No automatic background retry for outbound writes.

### Inbound sync flow

1. Load active XeroTenant. Verify `clerk_org_id` matches session context.
2. Fetch employees for the tenant's payroll region.
3. Upsert `people` records scoped to the Organisation.
4. Fetch leave records and supporting leave metadata.
5. Fetch leave balances per employee per leave type.
6. Map to canonical `availability_records`, updating `approval_status` from Xero state.
7. Compute `source_remote_hash` for change detection.
8. Archive or suppress stale records no longer present in Xero.
9. Enqueue feed rebuilds for affected feeds only.

### Failure rules

- Inbound transient failures: exponential backoff via Inngest.
- Outbound write failures: surfaced synchronously to the user; no automatic retry.
- Record-level inbound failures do not fail the entire sync run.
- Failed records captured in `failed_records` with full context.
- All inbound upserts must be idempotent.

### Sync scheduling

- Incremental inbound syncs: every 15 minutes during business hours, every 60 minutes outside.
- Leave balance sync: every 60 minutes.
- Nightly reconciliation: full re-sync and stale record detection.
- Manual re-sync: available from the UI for admin users.

---

## Feed rendering model

### Pattern

- Precompute publication rows when availability records change.
- Render ICS from `availability_publications`.
- Apply `FeedScope` rules at render time to filter records by organisation, team, location, person, or event type.
- Cache feed body by `feed_id + etag` in Vercel KV.
- Invalidate only when a relevant record changes.

### Feed endpoint

```text
GET /ical/:token.ics
```

Revoked or expired tokens return `410 Gone`.

### VEVENT output rules

| Property | Value |
|---|---|
| `UID` | stable derived UID |
| `DTSTAMP` | publication timestamp |
| `SEQUENCE` | incrementing version |
| `SUMMARY` | title per privacy mode |
| `DESCRIPTION` | allowed metadata only |
| `LOCATION` | only if privacy permits |
| `CLASS` | `PUBLIC` or `PRIVATE` |
| `TRANSP` | `OPAQUE` for away/unavailable states |

### Privacy transforms

| Mode | SUMMARY example |
|---|---|
| `named` | Jane Smith, Working from home |
| `masked` | Out of office |
| `private` | Busy |

---

## Security

- Clerk Organisation isolation on every query (filter by `clerk_org_id`).
- Organisation scoping on all data access (filter by `organisation_id` within the Clerk Org).
- Clerk auth on all authenticated routes.
- Xero OAuth tokens encrypted at rest using AES-256-GCM. The encryption key is stored in `XERO_TOKEN_ENCRYPTION_KEY` (32 bytes, base64-encoded). Tokens are never stored in plaintext.
- Feed tokens signed and revocable; plaintext never persisted. Revoked and expired tokens return 410.
- Audit logs for all admin actions.
- No tokens or raw payloads exposed to client.
- No secrets in client bundles.
- SSE connections are per-user and per-Clerk-Organisation. Must not deliver notifications across `clerk_org_id` boundaries.

---

## Build order

1. Organisation, people, team, location schema and seed data (keyed by `clerk_org_id`)
2. Xero OAuth and tenant persistence (XeroConnection + XeroTenant per Organisation)
3. Xero employee sync (AU, NZ, UK)
4. Xero leave inbound normalisation into `availability_records`
5. Leave balance sync from Xero
6. Leave submission workflow: draft, submit, Xero write-back, approval state machine
7. Leave approval workflow: manager approve/decline, Xero write-back
8. Manual availability CRUD (WFH, travel, etc.)
9. Public holiday data: API sourcing, manual overrides, per-location configuration
10. SSE notification infrastructure and in-app notification delivery
11. Feed model and token model
12. ICS renderer with stable UID and privacy modes
13. Feed preview and feed detail UI
14. Team calendar and person profile UI
15. Analytics: leave reports and out-of-office reports
16. Reconciliation jobs, sync health UI, and audit reporting

Each step produces a deployable, testable vertical slice.

---

## Non-negotiables

- TypeScript strict mode throughout.
- Zod validation on all external input.
- Clean separation between Xero-specific logic (`packages/xero`) and canonical domain logic (`packages/availability`).
- No custom workspace table; tenant isolation is via Clerk `org_id`.
- No custom membership or role tables; managed entirely by Clerk.
- One Organisation owns exactly one XeroConnection (unique on `organisation_id`).
- One XeroConnection owns exactly one XeroTenant (unique on `xero_connection_id`).
- `clerk_org_id` must be present on every query that touches tenant data.
- Stable ICS UIDs derived from business identity, not provider IDs alone.
- Result pattern for service-layer errors.
- Co-located tests from the first slice.
- Australian English in all UI copy and documentation.
- No em dashes anywhere.
- Outbound Xero writes are synchronous. No background queuing of approval state.
- Leave balances displayed in the UI are always sourced from the `leave_balances` table. Never calculated by Team Calendar.
- SSE connections are per-user and per-Clerk-Organisation. Must not leak across organisation boundaries.
- Notification preferences default to in-app enabled, email enabled for all types.
- Xero write errors are surfaced to the user in plain language. Raw error payloads stored in `xero_write_error_raw` for admin audit only; never displayed to employees.
- Xero OAuth tokens are encrypted at rest using AES-256-GCM. The `XERO_TOKEN_ENCRYPTION_KEY` environment variable must be present and validated on startup in `packages/xero`. An absent or malformed key must prevent the application from starting, not fail silently at token access time.
- The `AvailabilityRecord` unique constraint `(organisation_id, source_type, source_remote_id)` is NULL-distinct in PostgreSQL. Application-layer guards in `packages/availability` must prevent duplicate manual records (`source_remote_id IS NULL`). Tests must assert this guard is enforced.
