# Team Calendar Product Specification

<!-- impeccable:product-schema 1 -->

## Platform

web

## Companion documents

| Document | Purpose |
|---|---|
| `PRODUCT.md` | This file. Authoritative product truth, architecture, schema, and non-negotiables. |
| `AGENTS.md` | Single source of coding agent instructions: repo conventions, package boundaries, and environment variables. |
| `CLAUDE.md` | Imports `AGENTS.md` for Claude Code. Do not duplicate content here. |
| `GEMINI.md` | Imports `AGENTS.md` for Gemini CLI. Do not duplicate content here. |
| `DESIGN.md` | Colour tokens, typography, spacing, elevation, and component specifications. |
| `.impeccable.md` | Brand personality, user context, and design principles. |
| `SECURITY.md` | Vulnerability reporting policy, response targets, and disclosure process. |
| `ScreenCatalogue.md` | Screen-by-screen reconciliation of `apps/app` against implemented code; catalogues drift between design intent and shipped behaviour. |

Where this document conflicts with any other, PRODUCT.md takes precedence.

---

## Users

Three overlapping user types, each with different needs and contexts:

- **HR admins and ops managers**: configure Xero connections, manage feeds and tokens, review sync health, audit logs, plans and billing. High data density is acceptable; they need control and confidence. Their surfaces: settings, sync, feeds, public holidays, plans.
- **Team managers**: see who is out or working remotely across their team on any given day, and clear the approvals queue. Scannability and calendar views are the primary surface. They visit frequently, often briefly. Their surfaces: calendar, leave approvals, analytics.
- **Employees**: self-service visibility into their own leave, balances, and availability, plus submitting and withdrawing requests. Their surfaces should be lighter, less dense, and more approachable. Their surfaces: dashboard, availability, leave balances, notifications.

The interface must serve all three without making any group feel like a second-class citizen. The same screen may be shared across roles; density scales with the role's tolerance, never below readability.

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
- Bright "success green" SaaS accents. The sage palette is the brand's only green.
- Legacy HR portals: dense chrome, competing panels, ten actions per row, no obvious next step.
- Any tool that prioritises decoration over density.

## Design Principles

1. **Clarity over cleverness**: calendar and availability data must be immediately scannable. Visual hierarchy is non-negotiable. When in doubt, simplify.
2. **Green as signal, not wallpaper**: the primary green earns its place on screen. Use it for primary actions, success states, and brand anchors. Resist applying it broadly as background colour or decoration.
3. **Provenance at a glance**: sage marks Xero-synced leave; lavender marks manual availability. The colour split makes the source of truth scannable on every calendar, chip, and report. Never blur the two.
4. **Density is role-appropriate**: admin and manager views can be denser. Employee-facing surfaces should breathe. Never sacrifice readability for compactness.
5. **Calm confidence through space**: whitespace is load-bearing. Crowded layouts erode trust. Generous padding and clear separation between sections are defaults, not luxuries. Frosted, blurred treatments remain reserved for elevated transient UI only; DESIGN.md carries the full doctrine.

## Accessibility & Inclusion

WCAG 2.2 AA is the floor for all text, interactive elements, and status indicators. Colour is never the sole differentiator for status; provenance and status always pair colour with an icon or label. All interactive elements are keyboard reachable with a visible 3px focus ring. `prefers-reduced-motion` and `prefers-reduced-transparency` are respected throughout. Australian English only.

---

## Product truth

Team Calendar is a multi-tenant leave management and availability publishing platform built first for Australian small businesses running Xero Payroll. Employees submit and manage leave inside Team Calendar; managers approve or decline; approved state writes back to Xero synchronously via the Xero API. Xero remains the payroll source of truth for balances and accruals, which Team Calendar reads but never calculates. New Zealand and United Kingdom support is planned for future releases.

Alongside Xero leave, Team Calendar captures manual availability entries (WFH, travelling, training, client site) that are not written to Xero, then publishes a combined, privacy-controlled view as secure ICS feeds.

The architecture is:

**Leave submission layer > bidirectional Xero sync layer > canonical availability model > feed projection layer > ICS publishing layer**

### Sync direction (authoritative)

| Direction | Mechanism | Scope |
|---|---|---|
| Inbound | Pull-first, scheduled Inngest jobs | Employees, leave records, leave balances. Xero provides no leave webhooks. |
| Outbound | Synchronous, user-triggered API write | AU submission stays pending locally. Approval creates scheduled leave; imported requested leave uses approve/reject. No background queue. Failures surfaced inline. |

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

Slack notifications, Teams integration, HTML calendar views, and additional provider connectors (MYOB, Employment Hero, QuickBooks) are out of scope for the initial build. The current architecture implements Xero directly; a future connector requires its own reviewed design rather than a speculative multi-provider abstraction.

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
| Organisation | Legal or payroll entity within a Clerk Organisation (e.g. "Acme Restaurants Pty Ltd", "Acme Hotels Pty Ltd"). Owns at most one XeroConnection, its own People and Feeds. |
| XeroConnection | One per Organisation. Contains both tenancy keys, external tenant and remote connection IDs, payroll region, status and sync health/progress; references its canonical authorisation. |
| XeroAuthorisation | One per verified Xero user and provider app. Sole AES-256-GCM encrypted token owner; may support several scoped connections. |
| User | Authenticated identity via Clerk. Managed entirely by Clerk; no local users table. |
| Membership | User-to-Clerk-Organisation relationship. Managed entirely by Clerk; no custom membership table. |
| Team | Grouping of people within an Organisation. |
| Location | Work location within an Organisation; used for feed scoping and timezone/holiday handling. |

### Key invariants

- One Clerk Organisation maps to exactly one country code. A Clerk Organisation will never span AU, NZ, and UK simultaneously. This is enforced at the application layer, not via a database constraint.
- One Organisation owns at most one XeroConnection (`UNIQUE` on `organisation_id`).
- Every active XeroConnection references a canonical XeroAuthorisation; one verified grant may support multiple scoped connections.
- A Clerk Organisation with multiple payroll entities (e.g. two AU Xero files) has multiple Organisation rows, each with its own scoped XeroConnection.
- Billing, plan limits, and usage are enforced at the Clerk Organisation level.
- **All database queries must filter by `clerk_org_id`**, sourced from `auth().orgId` in server context.

### Auth integration

- Personal Accounts are disabled in the Clerk dashboard. Every user must belong to at least one Clerk Organisation.
- In-app switching between multiple Organisations is not currently implemented. `CustomUserButton` (`apps/app/app/(authenticated)/components/custom-user-button.tsx`) exposes only Clerk's organisation-profile action (`openOrganizationProfile()`). Adding `<OrganizationSwitcher />` or an equivalent control is an open product gap, not a shipped mechanism.
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

Public site: marketing pages, Xero integration detail, pricing, security and privacy, blog and changelog. Its help centre is the canonical customer-facing setup and operational help surface at launch.

### `apps/docs`

Reserved for future developer and API documentation. It is not the launch customer-help surface and is not currently deployed.

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

Create leave on manager approval, approve or decline imported requested leave, and withdraw remote leave through Xero Payroll. Local submission and pre-creation decline/withdraw make no payroll write. All write operations return `Result<T, XeroWriteError>`.

`XeroWriteError` variants: `validation_error`, `conflict_error`, `auth_error`, `permission_error`, `rate_limit_error`, `network_error`, `not_found_error`, `region_not_supported_error`, `unknown_error`.

Outbound write failures are surfaced synchronously to the user in plain language. The raw Xero error payload is stored in `xero_write_error_raw` for admin audit only; never displayed to employees.

#### Rate limits

- 60 API calls per minute per external Xero tenant and provider app
- 1,000 API calls per day on Starter, 5,000 on higher commercial tiers, per external Xero tenant and provider app
- Five concurrent requests maximum per external Xero tenant and provider app
- 10,000 calls per minute app-wide

Rate limiting, backoff, and retry logic live inside this package. A small shared, atomic Redis store coordinates serverless app, API and job workers so they collectively respect tenant quotas and the five-request concurrency limit. Successful requests release their concurrency leases; lease expiry recovers capacity after a crashed worker. Ordinary quota keys initialise atomically on first use, without a namespace bootstrap or manual admission command. A fixture namespace is test isolation only. Token and user-connection inventory calls conservatively share the app-wide counter as application policy, without an invented per-tenant or 60/minute non-tenant cap. Store failures deny calls as infrastructure failures; local admission failures do not manufacture provider HTTP 429 responses or rate-limit headers.

The HTTP boundary retains an absolute deadline, a 5 MiB response-body cap, allowed-origin checks and redirect rejection to bound worker resource use and prevent credential disclosure. Provider responses, including real 429s and their `Retry-After` values, remain distinguishable from local admission failures.

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
XeroAuthorisation
XeroOAuthSession
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

### `xero_authorisations`

System grant rows, unique on `(provider_app_id, xero_user_id)`. Hold the encrypted access and refresh tokens, expiry, granted scopes, refresh health and encryption version. Customer access is authorised through a scoped connection.

### `xero_connections`

One row per Organisation, with both tenancy keys and a scoped Organisation FK. Contains the unique external Xero tenant ID, remote connection ID, region, connection status, sync health timestamps and roster progress. References the canonical authorisation. Lifecycle history remains in `audit_events`; tokens are not copied here.

### `xero_oauth_sessions`

Short-lived, scoped OAuth state and canonical authorisation reference, plus safe selection context. Contains no token envelopes or lifecycle generations.

### `xero_sync_cursors`

Completed provider timestamp watermarks for people and leave records, unique on `(xero_connection_id, entity_type)` with both tenancy keys. Roster position for balances and regional leave polling resides on the connection.

### `availability_records`

Core table. Holds both Xero-synced leave and manual availability entries. Unique on `(organisation_id, source_type, source_remote_id)` for Xero-sourced records.

**Note on the unique constraint:** PostgreSQL treats each NULL value as distinct, so this constraint does not prevent duplicate manual records where `source_remote_id IS NULL`. Application-layer guards in `packages/availability` must prevent duplicate manual records from reaching the database; tests must assert this behaviour.

`source_payload_json` retains the raw Xero response for audit. `xero_write_error_raw` retains the raw Xero write error for admin audit only; never displayed to employees. `derived_uid_key` holds the stable ICS UID.

### `availability_publications`

Materialised publishing state per AvailabilityRecord. Decouples raw data from what was actually emitted in a feed. `published_sequence` increments on material change. Carries `clerk_org_id` for direct tenant isolation.

### `leave_balances`

Fetched from Xero per person per leave type during normal operation, or managed manually by admins when Xero is not connected. `xero_connection_id` is nullable to support admin-managed manual balances. Never calculated by Team Calendar. Updated in place. Unique on `(person_id, xero_connection_id, leave_type_xero_id)` for Xero-sourced rows.

**Note on the unique constraint:** PostgreSQL treats each NULL value as distinct, so the composite unique above does not prevent duplicate manual balances where `xero_connection_id IS NULL`. A partial unique index on `(person_id, leave_type_xero_id) WHERE xero_connection_id IS NULL` guards the manual case so create-or-update can target a single row.

**Balance unit and currency:** `balance_unit` is `hours | days | currency`. `currency_code` is nullable and holds an ISO 4217 code (e.g. `NZD`) for NZ Payroll balances such as Holiday Pay that Xero exposes in dollars rather than hours or days. The unit/code pairing is enforced at the application layer, not by a database constraint: a `currency` balance requires a code from `SupportedCurrencyCodeSchema` (`packages/xero/src/read/leave-balances.ts`, currently `["NZD"]`, extended only alongside a documented provider mapping); an `hours` or `days` balance must never carry a code. Manual balances are always hours or days and always carry a null `currency_code`. `source_payload_json` retains the raw Xero balance payload for admin audit only, validated as Prisma-safe JSON via `LeaveBalanceRawPayloadSchema` in the same file; it is always null for manual balances, which have no Xero-provided payload. Team Calendar stores and displays these provider values as given; it never calculates accruals, converts currency, or subtracts a duration from a monetary balance.

### `public_holidays`

Sourced from Nager.Date API or entered manually. Carries `country_code`, optional `region_code`, and `default_classification` (`non_working` | `working`). `country_code = "CUSTOM"` bypasses country matching and applies across all jurisdictions unless restricted by a region. Unique on `(organisation_id, source, source_remote_id)`.

### `public_holiday_assignments`

Explicit holiday classification overrides scoped by location (`scope_type = "location"`, `scope_value = location_id`). A matching active location assignment overrides the holiday's `default_classification` (e.g. marking a working day non-working for a specific office or vice versa), even when the holiday jurisdiction differs from the location. Unique on `(public_holiday_id, scope_type, scope_value)`. Other schema scopes (`organisation`, `team`, `person`, `feed`) and `include_in_feeds` remain dormant and inert until a supported writer and UI productise them.

### `notifications`

In-app notifications delivered via SSE. Per-user, per-Clerk-Organisation. SSE connections must not leak across `clerk_org_id` boundaries.

### `notification_preferences`

Per-user, per-Organisation opt-in settings. Defaults: `in_app_enabled = true`, `email_enabled = true`. Unique on `(user_id, organisation_id, notification_type)`.

### `feeds`

ICS calendar feeds. `organisation_id` is nullable: a null value means the feed spans all Organisations within the Clerk Org. Unique on `(clerk_org_id, slug)`.

### `feed_scopes`

Normalised scope rules per feed. Each row is one include rule. Carries `clerk_org_id` for direct tenant isolation.

### `feed_tokens`

Signed, revocable tokens. `token_hash` stores per-token signing material; the plaintext bearer token is reconstructed only after feed visibility checks and is never persisted. Existing legacy random tokens remain valid through hash lookup. `rotated_from_token_id` provides a rotation trail within this table. Revoked and expired tokens return 410. Carries `clerk_org_id` for direct tenant isolation.

#### Calendar feed URL presentation

The active calendar feed URL is a user-facing credential. Every authorised viewer must be able to see, select, and copy the complete URL from the feed list and feed detail screens. The interface must never mask, truncate, hash, redact, or replace the URL with a token hint or placeholder. Copy actions must copy the exact URL displayed.

Pausing a feed does not hide its URL. Rotating or revoking a token invalidates the old URL, and rotation immediately displays the complete replacement URL. Archived feeds have no active subscribe URL. The `masked` privacy mode applies only to published event details; it must never mask the calendar feed URL.

Cryptographic hashes and signing material may be used internally for validation and secure storage, but they are server-only implementation details. An internal hash must never be rendered or returned in place of the usable subscribe URL.

### `sync_runs`

One row per sync execution. Pinned to `Organisation` via UUID FK and to its scoped `XeroConnection` for the specific Xero file synced.

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
| `xero_authorisations` | `(provider_app_id, xero_user_id)` |
| `xero_sync_cursors` | `(xero_connection_id, entity_type)` |
| `people` | `(organisation_id, source_system, source_person_key)` |
| `availability_records` | `(organisation_id, source_type, source_remote_id)`; NULL-distinct, app-layer guard required for manual records |
| `availability_publications` | `availability_record_id` |
| `leave_balances` | `(person_id, xero_connection_id, leave_type_xero_id)` for Xero-sourced rows; partial unique on `(person_id, leave_type_xero_id) WHERE xero_connection_id IS NULL` for manual balances |
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
- `xero_sync_cursors(xero_connection_id, entity_type)`
- `notifications(recipient_user_id, is_read)`
- `notifications(recipient_user_id, created_at)`
- `sync_runs(organisation_id)`
- `sync_runs(xero_connection_id)`

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

- for Xero records: `xero_connection_id + employee_id + leave_type + start + end + units`
- for manual records: the `availability_records.id`

The formula assigns creation identity. Manual date, type and title edits preserve the assigned UID. Existing publication UIDs remain authoritative for upgraded feed events.

### SEQUENCE handling

`availability_publications` retains canonical materialisation state. Subscriber output versions are durable per feed in `feed_event_publications`, keyed by feed and canonical source identity. Each row stores the immutable UID, representation hash, sequence, publication timestamp and presence. Its sequence and timestamp advance only for material serialised changes or membership removal/re-entry. First upgraded events with historical feed rendering at or after their creation start at their prior canonical sequence plus one, including sequence-zero records and holidays. This is a conservative compatibility bound, not proof the event appeared under a prior scope or horizon. Events without that historical rendering evidence start at zero. Durable ledger rows govern all subsequent versions.

The feed representation hash covers its name and ordered serialised events. `feeds.representation_generation` advances when that output changes. Every subscriber request and rebuild establishes the authoritative projection and versions in one serializable transaction. All projection reads share that transaction and both tenancy keys. A second authoritative snapshot fences late cache reads and renders; bounded conflict retries fail safely when a coherent representation cannot be established. Canonical materialisation failures do not permit new content under old versions. Immutable cache keys use feed ID and ETag; deletion is best effort, while authoritative projection determines visibility. No-op output retains identical UID, sequence, timestamp, body and ETag. Masked and private output use CLASS PRIVATE. Removed identities remain in the ledger so a returning event retains its UID and advances its version.

---

## Xero sync model

Live Xero credentials are unavailable in the 7 October simplification session. All live OAuth, granted consent, import, refresh, mutation and disconnect journeys remain **NOT VERIFIED**; source/integration gates are recorded separately in `tasks/todo.md`.

Inbound: pull-first polling. Xero does not provide webhooks for leave data.
Outbound: synchronous API write triggered by user action. No background queue for outbound writes.

### OAuth and automatic access

Connect Xero validates the current account, user, management role and short-lived
state before exchanging its code once. Only authorised organisation tenants are
eligible; the verified authorisation event highlights current consent while
earlier authorised files remain available.
A single eligible Xero organisation connects directly when its Team Calendar
target is known or unambiguous. Multiple eligible Xero organisations use the
scoped selection page; a single file needs only a Team Calendar target choice
when that account has several payroll organisations. Completing connection
consumes the temporary session and persists one initial full-import request. Its Inngest job imports people, leave and the entire provider balance roster in order; scheduler recovery redispatches an uncompleted request. Only the job whose `requestedAt` still matches `initial_sync_requested_at` can set `initial_sync_completed_at`. Reconnect preserves canonical IDs and feeds and requests a new full reconciliation.

Any current Team Calendar owner/admin with suitable Xero permissions may reconnect
the Organisation, even when its previous application user or Xero authorisation
is unavailable. Fresh OAuth verifies the replacement Xero authorising principal
and provider inventory. Reconnect must select the existing `xero_tenant_id`; the
Organisation's connection is atomically rebound to the new authorisation under
its existing lock and snapshot checks. The previous authorisation is not required
to prove removal of its remote link and is retained until a successful rebind;
session cleanup removes only grants with no remaining connection/session references.
Cancellation or code-exchange failure leaves the existing connection untouched.
The initiating application user is audit provenance, not the integration owner.

The requested scopes are exactly `offline_access accounting.settings.read
payroll.employees payroll.settings.read`. Organisation country discovery requires
accounting settings reads; employee/leave reads and leave writes require employee
access; PayItems metadata requires payroll settings reads. Write scopes satisfy
their matching read capability, and every required capability must be present.

One server-only scoped access resolver performs automatic refresh within two minutes of expiry,
rechecks canonical credentials under the authorisation lock and saves the rotated
pair atomically from the validated, authenticated token-endpoint response. Initial
authorisation verifies Xero identity; refresh does not add another JWKS request
after rotation. Demand-driven refresh is primary; background maintenance does not
refresh merely because the 30-minute access token has expired. Xero documents a
[60-day refresh-token inactivity limit](https://developer.xero.com/faq/oauth2)
(reviewed 2026-10-08). Dormant grants with active connections on active, unarchived
Organisations, including paused sync, are refreshed after 45 days since successful
token issuance. This leaves a 15-day margin for scheduler interruptions. The
existing 15-minute scheduler only checks eligibility: once rotated, a grant is
not due again for 45 days. Maintenance rechecks eligibility and successful rotation
time inside the same central refresh implementation and database lock used by
normal access; shared grants rotate once, rather than once per connection. An uncertain response
keeps the stored pair for the next normal attempt within Xero's documented
30-minute grace period. Invalid grants require reconnect. Token refresh has no
customer control or manual server action.

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

Approved AU contract: `au-contract-v1` (2 October 2026). Xero AU API creation schedules leave immediately, so Team Calendar keeps employee submission local until manager approval.

| Operation | Provider action | Local transition |
|---|---|---|
| Submit app leave | Validate AU eligibility, connection, employee and leave-type mapping; no payroll creation | `draft → submitted` |
| Approve app leave without remote ID | Synchronously create scheduled leave in Xero | `submitted → approved` |
| Decline app leave without remote ID | No provider call; require decline reason | `submitted → declined` |
| Withdraw app leave without remote ID | No provider call | `submitted → withdrawn` |
| Approve/decline imported requested leave | Documented Xero approve/reject operation | `submitted → approved/declined` |
| Withdraw remote leave | Documented Xero reject operation where supported | `submitted/approved → withdrawn` |

The create on approval uses a durable `approve` outbound operation, immutable request fingerprint and fenced attempt generation. An uncertain outcome blocks conflicting edits and writes. Exact in-request replay within the persisted five-minute window may recover the original result; uncertainty after the cutoff requires an administrator to attach verified provider evidence or independently confirm no creation. Recovery retains the original approving actor; a removed person leaves the approver link explicitly unknown. Inbound sync preserves completed withdrawal when Xero reports rejection.

Remote approve, decline and withdraw reuse `OutboundOperation`; local submit/decline/withdraw create no provider journal entry. Persist one immutable UUID idempotency key and the exact tenant, method, URL/body identity before dispatch. Short in-request retries reuse that request and key only within five minutes of first dispatch, conservatively inside Xero's six-minute retention. Retries never extend the cutoff. A changed request, cached 5xx or expired uncertain result cannot justify a new key. After the cutoff, authoritative provider reads and administrator recovery precede another mutation. Completed operations return the stored result and apply audit, notifications and publication once.

Native idempotency handles provider duplicate prevention. The local write claim
and journal fence business transitions, original actors and local side effects.
A later admission failure or rejection cannot erase an earlier uncertain
dispatch. Successful AU writes require one confirmed result, the expected remote
ID for transitions and no provider validation errors. Diagnostics retain only
safe correlation identifiers. An imported operation prepared but never
dispatched exposes its original action after claim expiry; it keeps the same
operation, key and actor. A definitive refusal to withdraw approved leave keeps
the record approved with a plain-language error.

Plans includes imported Xero leave only when an unresolved approve, decline or
withdraw operation needs recovery. The Xero recovery source filter finds these
records; imported records remain view-only and only owners/admins can recover
them using authoritative provider evidence.

All provider mutations are synchronous and user-triggered. Failures are surfaced inline; outbound writes have no automatic background retry. NZ and UK submission remain unavailable.

### Inbound sync flow

1. Resolve the active XeroConnection with both tenancy keys and its canonical authorisation.
2. Fetch employees for the tenant's payroll region.
3. Upsert `people` records scoped to the Organisation.
4. Fetch leave records and supporting leave metadata.
5. Fetch leave balances per employee per leave type.
6. Map to canonical `availability_records`, updating `approval_status` from Xero state.
7. Compute `source_remote_hash` for change detection.
8. Archive absent Xero-owned records only after a complete successful unfiltered full read. Delta or incomplete reads never establish absence; manual entries are preserved.
9. Enqueue feed rebuilds for affected feeds only.

For AU employees and V2 leave, every delta page uses the prior completed `modified_since` minus a two-minute overlap in `If-Modified-Since` (UTC seconds), with page size 100. Capture run start before fetching and advance the scoped watermark to that start only after all pages and relevant records persist successfully. Empty complete deltas are valid. Malformed or incomplete traversal and failed upserts leave the watermark unchanged. Compare-and-set the prior watermark and recheck the active scoped connection/external tenant before persistence; delayed jobs cannot move progress backwards. Full reads omit the header. NZ/UK retain their supported paging and per-employee reads without a fabricated modification filter; local roster progress belongs on the connection.

A complete successful full employee reconciliation immediately archives absent Xero-owned people, including a genuinely empty roster. It preserves manual people and other Organisations. There is no missing-person percentage/count threshold, confirmation delay or persistent missing marker. Archival and the employee watermark commit together. Leave changes deferred by a concurrent local write keep the prior watermark and are retried on the next delta; already-applied duplicate or older snapshots do not block progress. Cancelled runs never establish completion.

AU balances remain per-employee detail reads, without modification filters or calculated amounts. Invalid employee/balance envelopes and absent or nonnumeric amounts are recorded as failures, preventing successful initial import or whole-roster freshness. Genuine empty balances and numeric zero remain valid.

Malformed individual balance responses are isolated: healthy employees persist and roster progress continues while the failed sweep remains stale. Sync admission checks and creation share the existing scoped connection row lock, preventing competing runs of the same type from applying overlapping snapshots.

### Failure rules

- Inbound transient failures: exponential backoff via Inngest.
- Outbound write failures: surfaced synchronously to the user; no automatic retry.
- Record-level inbound failures are isolated and captured, but prevent traversal completeness, watermark advancement and absent-row archival.
- Failed records captured in `failed_records` with full context.
- All inbound upserts must be idempotent.

### Sync scheduling

- Incremental inbound syncs (people, leave records): every 15 minutes during business hours (07:00 through 18:59 local time on weekdays, Monday–Friday), every 60 minutes outside (weekends and 19:00 through 06:59 local time).
- Leave balance sync: every 60 minutes at all times. The scheduler processes one ordered page of 40 active people per run to support an unlimited employee roster. Roster balance refreshes are rolling best-effort across scheduled pages rather than fixed whole-roster batch completions.
- Nightly reconciliation: full re-sync, approval state reconciliation (dispatched once per local night between 01:00 and 02:59 local time), and stale record detection.
- Manual re-sync: explicit full reconciliation, available from the UI for admin users.

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
- Feed tokens signed and revocable; plaintext never persisted. The complete active subscribe URL is intentionally returned to authorised viewers. Revoked and expired tokens return 410.
- Audit logs for all admin actions.
- No Xero tokens, internal feed token hashes, signing material, or raw payloads are exposed to the client.
- No secrets in client bundles.
- SSE connections are per-user and per-Clerk-Organisation. Must not deliver notifications across `clerk_org_id` boundaries.

---

## Build order

1. Organisation, people, team, location schema and seed data (keyed by `clerk_org_id`)
2. Xero OAuth and tenant persistence (scoped XeroConnection + canonical XeroAuthorisation)
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
- One Organisation owns at most one XeroConnection (unique on `organisation_id`).
- An active XeroConnection references its canonical verified XeroAuthorisation; connection and session rows contain no credentials.
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

`xero_authorisations` deliberately has no tenancy keys because one verified provider grant can support several payroll organisations. Every customer-facing resolution first selects `XeroConnection` using both `clerk_org_id` and `organisation_id`. The grant is the only persisted credential owner; there are no mirrors, legacy fallbacks, backfills, or parallel lifecycle structures.


### Xero disconnection lifecycle

Connection states are `active`, `reconnect_required` and `disconnected`.
An owner or admin confirms the target Organisation before disconnecting its
Xero connection. The Organisation's scoped canonical authorisation deletes that specific
remote connection first. HTTP 204 or 404 permits local teardown; a transient or
uncertain provider failure retains the connection and credentials for retry.
Xero's [tenant disconnect documentation](https://developer.xero.com/documentation/guides/oauth2/tenants/)
specifies deleting the remote **connection ID**, rather than the Xero tenant ID.
Whole-grant token revocation would remove sibling tenant connections, so it is
not used for this Organisation-level operation. A retry after a lost response
can confirm remote absence via 404. Only confirmed teardown marks the local
connection disconnected and prevents subsequent scoped access. The initiating
user is recorded for audit; disconnect uses the Organisation's existing grant
independently of its original Team Calendar user. A later owner/admin may reconnect the
same Organisation and Xero tenant using a freshly verified authorisation.
Local teardown and its required audit commit together. Remove the authorisation
only when no other connection or live selecting OAuth session references it.
The existing closed-session purge removes credentials once that final temporary
reference expires; session deletion and grant pruning commit under the same
authorisation lock so a failed cleanup can be retried.

A soft disconnect preserves imported history. An explicitly requested purge
archives Xero-imported entries and removes imported balances and mappings while
preserving manual entries, their people and stable calendar identities. Reject
disconnect while a live payroll write or unresolved outbound operation exists.
Provider-confirmed loss of a connection requires reconnect and stops scheduled
sync; a permission error or unavailable inventory does not prove revocation.
Lifecycle follows explicit customer actions and authoritative provider events,
with no activity heuristics, separate remote-cleanup worker or management token.
