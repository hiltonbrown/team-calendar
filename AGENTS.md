# AGENTS.md

This file is the single source of instructions for coding agents working in the Team Calendar repository. It applies regardless of which agent or IDE is in use. `CLAUDE.md` and `GEMINI.md` import this file; edit this file, not them.

## Project overview

**Team Calendar** is a multi-tenant leave management and availability publishing platform. It connects to Australian Xero Payroll bidirectionally: employees submit and manage leave requests in Team Calendar, approved state is written back to Xero synchronously, and Xero-side leave data is pulled into the canonical availability model on a scheduled basis. NZ and UK adapters remain future-release work; current onboarding and writes are AU-only.

The architecture is: **Leave submission layer > bidirectional Xero sync layer > canonical availability model > feed projection layer > ICS publishing layer**.

Team Calendar is:

- a leave submission and approval workflow system, bidirectionally synced with Xero Payroll
- a canonical availability publisher
- a Xero leave visibility and management layer
- a manual availability entry surface for non-leave events (WFH, travelling, training, client site)
- a secure ICS feed generator for Outlook, Google Calendar, and Apple Calendar
- a real-time notification platform (SSE-delivered in-app notifications plus transactional email)

Team Calendar is not:

- a full HRIS
- a payroll engine or accrual calculator
- a multi-connector abstraction layer (Xero is the only provider)

Xero remains the payroll source of truth. Outbound writes (submit, approve, decline, withdraw) are synchronous and user-triggered. Inbound sync is pull-first via scheduled Inngest jobs. Leave balances are always sourced from Xero; never calculated by Team Calendar. Xero-synced leave and manual availability entries are standardised into one publishable calendar domain.

### Reference docs

Read before implementing or changing domain entities, sync logic, feed rendering, or schema:

- `PRODUCT.md`: authoritative product truth, domain model, database schema, Xero sync model, feed rendering, UID strategy, build order, stack decisions. Read this first.
- `DESIGN.md`: colour tokens, typography, spacing, elevation rules, component specifications.
- `.impeccable.md`: brand personality, user context, design principles.

### MCP servers

- Always use Context7 when library or API documentation, code generation, or setup and configuration steps are needed, without waiting to be asked explicitly.

## Workflow Orchestration

1. Plan Mode Default
- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
- If something goes sideways, STOP and re-plan immediately – don't keep pushing
- Use plan mode for verification steps, not just building
- Write detailed specs upfront to reduce ambiguity

2. Subagent Strategy
- Use subagents liberally to keep main context window clean
- Offload research, exploration, and parallel analysis to subagents
- For complex problems, throw more compute at it via subagents
- One task per subagent for focused execution

3. Self-Improvement Loop
- After ANY correction from the user: update `tasks/lessons.md` with the pattern
- Write rules for yourself that prevent the same mistake
- Ruthlessly iterate on these lessons until mistake rate drops
- Review lessons at session start for relevant project

4. Verification Before Done
- Never mark a task complete without proving it works
- Diff behaviour between main and your changes when relevant
- Ask yourself: "Would a staff engineer approve this?"
- Run tests, check logs, demonstrate correctness

5. Demand Elegance (Balanced)
- For non-trivial changes: pause and ask "is there a more elegant way?"
- If a fix feels hacky: "Knowing everything I know now, implement the elegant solution"
- Skip this for simple, obvious fixes – don't over-engineer
- Challenge your own work before presenting it

6. Autonomous Bug Fixing
- When given a bug report: just fix it. Don't ask for hand-holding
- Point at logs, errors, failing tests – then resolve them
- Zero context switching required from the user
- Go fix failing CI tests without being told how

7. Analysis Is Not a Deliverable
- When asked to implement, implement: do not substitute a list of findings for the work itself
- Comparison, gap analysis, and difference lists are intermediate steps toward implementation, never the end product
- If you identify differences between a design and the production code, fix every single one in that same session before reporting back
- Do not report partial progress as completion. "I found 20 differences" is a failure state, not a result
- The correct loop is: read reference → read production → fix all gaps → verify → done
- Never optimise for appearing useful. A list that describes unfixed problems is not useful
- If the task is "implement X to match Y", the session is not over until zero differences remain

8. Execution Discipline
- Before each tool call or delegation, name the current deliverable and its stopping condition. Act only to deliver required work, fix an observed defect or remove a demonstrated blocker
- Explicit user constraints take precedence over inferred improvements, skill workflows and plan extensions. Production quality does not authorise scope expansion
- Prove the approved user flow before building general infrastructure. Add tooling only when a named safety or evidence requirement of the next operation needs it
- Reuse valid evidence. Repeat verification only when relevant changes invalidate it, an observed failure needs investigation or an explicit gate requires it
- Give subagents the same scope, constraints and stopping condition. On a user correction, stop conflicting delegated work immediately
- Treat "commit and merge" as the current operation: preserve unfinished work, record verification gaps and complete it without adding another implementation, review or verification phase
- Stop when the requested outcome is achieved and report its evidence and limits. Acknowledging a correction or recording a lesson does not replace changing the next action

Task Management

1. **Plan First**: Write plan to `tasks/todo.md` with checkable items
2. **Verify Plan**: Check in before starting implementation
3. **Track Progress**: Mark items complete as you go
4. **Explain Changes**: High-level summary at each step
5. **Document Results**: Add review section to `tasks/todo.md`
6. **Capture Lessons**: Update `tasks/lessons.md` after corrections

## Core Principles

- **Simplicity First**: Make every change as simple as possible. Impact minimal code.
- **No Laziness**: Find root causes. No temporary fixes. Senior developer standards.
- **Minimal Impact**: Changes should only touch what's necessary. Avoid introducing bugs.
- **Self-Correction**: Learn from mistakes. Never repeat them.
- **Elegance**: Always seek the most elegant solution, even if it takes longer.
- **Verification**: Never assume it works. Prove it.

---

## Stack

| Concern | Choice |
|---|---|
| Framework | Next.js on next-forge (Turborepo) |
| Runtime / package manager | Bun |
| Database | PostgreSQL (Neon serverless) |
| ORM | Prisma 7 with `@prisma/adapter-neon` |
| Auth | Clerk (Organisations feature; no custom workspace table) |
| Job queue | Inngest |
| Email | Resend + React Email |
| Monitoring | Sentry |
| Feed caching | Vercel KV (Redis-compatible) |
| ICS generation | ical-generator |
| Deployment | Vercel (all apps) |
| Testing | Vitest |
| Linting | Biome 2 + Ultracite |
| Real-time notifications | SSE via Vercel streaming |
| Public holiday data | Nager.Date API |

---

## Commands

All commands run from the repo root.

```
bun run dev                # Start all apps (Turbo)
bun run build              # Build all apps and packages
bun run check              # Biome/Ultracite lint checks
bun run fix                # Auto-fix lint issues
bun run typecheck          # TypeScript project references check
bun run test               # Vitest across the monorepo
bun run test:integration   # Integration test suite
bunx vitest run <path>     # Single test file
bun run migrate            # Prisma format + generate + migrate dev
bun run migrate:deploy     # Generate + migrate deploy (production)
bun run db:push            # Push schema without migration (dev only)
bun run analyze            # Bundle analysis
bun run clean              # Remove git-ignored files
bun run preflight          # Production environment preflight check
```

`typecheck` and `test:integration` are both CI gates. A change is not verified until `bun run check`, `bun run typecheck`, `bun run test` and `bun run test:integration` all pass.

---

## Monorepo layout

### Apps

| App | Port | Purpose |
|---|---|---|
| `app` | 3000 | Authenticated product UI |
| `api` | 3002 | Xero OAuth, sync orchestration, outbound write-back, feed endpoint (`GET /ical/:token.ics`), SSE stream, Inngest handlers |
| `web` | 3001 | Public marketing site |
| `docs` | 3004 | Mintlify documentation |
| `email` | 3003 | React Email template development (dev preview only; not deployed to production) |

### Domain packages

| Package | Purpose |
|---|---|
| `packages/xero` | Xero OAuth, tenant sync, AU/NZ/UK region handling, outbound write operations, rate limiting, leave-type mapping |
| `packages/availability` | Canonical person model, availability records, privacy rules, contactability, feed eligibility, approval state machine |
| `packages/feeds` | ICS generation (ical-generator), stable UID strategy, feed token validation, Vercel KV caching |
| `packages/notifications` | In-app notification creation, SSE delivery, notification preferences, email dispatch via Resend |
| `packages/jobs` | Inngest job definitions: sync scheduling, feed rebuilds, reconciliation |
| `packages/core` | Result type, branded IDs, shared enums, date/timezone utilities, error types |

### Infrastructure packages

| Package | Purpose |
|---|---|
| `packages/database` | Prisma schema, migrations, generated client, query helpers |
| `packages/auth` | `requireOrg()`, `requireRole()`, `getOrgId()`, re-exported Clerk hooks |
| `packages/billing` | Stripe billing integration, checkout and customer portal sessions, webhook handling |
| `packages/analytics` | PostHog and Vercel analytics, client and server instrumentation |
| `packages/design-system` | Shared React components, Tailwind CSS, shadcn/ui |
| `packages/email` | React Email templates + Resend transport |
| `packages/observability` | Sentry error tracking, structured logging |
| `packages/next-config` | Shared Next.js configuration |
| `packages/seo` | SEO metadata helpers |
| `packages/typescript-config` | Shared tsconfig base |

### Not in use

Do not reference or depend on: `packages/ai`, `packages/cms`, `packages/collaboration`, `packages/feature-flags`, `packages/internationalization`, `packages/payments`, `packages/rate-limit`, `packages/security`, `packages/storage`, `packages/webhooks`.

---

## Tenancy model

Team Calendar uses **Clerk Organisations** as the top-level tenant boundary. There is no custom `workspaces` database table.

```
Clerk Organisation (clerk_org_id)   : one per customer account; one country code; billing anchor
  └─ Organisation                   : one or many payroll entities (e.g. Acme Restaurants, Acme Hotels)
        └─ XeroConnection           : one per Organisation; UNIQUE on organisation_id
              └─ XeroAuthorisation : canonical grant reference; one verified app/user may serve multiple connections
```

### Key invariants

- `clerk_org_id` (text, not null, indexed) is present on every tenant-scoped table.
- **Every database query that touches tenant data must filter by `clerk_org_id`**, sourced from `auth().orgId` in server context or from job event payloads.
- One Clerk Organisation = one country code (app-layer invariant, not a DB constraint).
- One Organisation owns at most one XeroConnection (`UNIQUE` on `organisation_id`).
- An active XeroConnection references its canonical XeroAuthorisation; credentials are never copied into the connection.
- A Clerk Org with two Xero files has two Organisation rows, two scoped XeroConnections.
- Membership and roles are managed entirely by Clerk. No custom membership or role tables.
- Personal Accounts are disabled. Every user must belong to at least one Clerk Organisation.
- Billing enforced at the Clerk Organisation level via `clerk_org_subscriptions`.
- In-app switching between multiple Organisations is not currently implemented. `CustomUserButton` (`apps/app/app/(authenticated)/components/custom-user-button.tsx`) exposes only Clerk's organisation-profile action (`openOrganizationProfile()`). Adding `<OrganizationSwitcher />` or an equivalent control is an open gap, not a shipped mechanism.

### Auth helpers (`packages/auth`)

```typescript
import { requireOrg, requireRole, getOrgId } from '@repo/auth';

// Server: get clerk_org_id or throw
const clerkOrgId = requireOrg();

// Server: check role or return 403 Result
requireRole('admin');

// Server: get org ID for query scoping
const clerkOrgId = getOrgId();

// Re-exported Clerk helpers
import { auth, currentUser, useAuth, useOrganization } from '@repo/auth';
```

For Inngest jobs and background API routes, call `getToken()` and pass the token in the `Authorization` header. Do not rely on the session cookie in background contexts.

### Roles

| Role | Scope |
|---|---|
| owner | Full Clerk Organisation access |
| admin | Full Organisation (payroll entity) access |
| manager | Team and direct-report access |
| viewer | Read-only filtered access |

Roles are custom roles in the Clerk dashboard. Permission checks use `auth().has({ role: 'org:admin' })` or helpers from `@repo/auth`.

### Query scoping pattern

Every service function that queries tenant data must accept and apply both `clerk_org_id` and `organisation_id`:

```typescript
// Correct
async function listPeople(clerkOrgId: ClerkOrgId, organisationId: OrganisationId) {
  return db.person.findMany({
    where: { clerk_org_id: clerkOrgId, organisation_id: organisationId },
  });
}

// Wrong: missing clerk_org_id
async function listPeople(organisationId: OrganisationId) {
  return db.person.findMany({ where: { organisation_id: organisationId } });
}
```

---

## Architecture rules

### Data access boundaries

- All database access through `packages/database`. Never import Prisma client directly in apps.
- All Xero-specific logic in `packages/xero`. Canonical domain logic in `packages/availability` never depends on Xero payload shapes.
- All ICS generation logic in `packages/feeds`.
- All notification logic in `packages/notifications`.
- Shared UI components in `packages/design-system`. Do not redefine base components in apps.

### Core entity

The primary domain object is `AvailabilityRecord`. It holds both Xero-synced leave and manual availability entries. It is not called a "leave application" or "absence event". See PRODUCT.md for the full schema and record types.

### Xero write-back

Outbound writes are synchronous and user-triggered. The four write operations are:

- **Submit (AU)**: validate eligibility and mappings; keep the request local and transition to `submitted`. No payroll creation.
- **Approve (AU)**: manager approval synchronously creates scheduled Xero leave for a local request. Imported requested leave uses the documented approve operation. Transition to `approved`.
- **Decline**: manager declines with a required reason; local requests without a remote ID make no provider call, imported requested leave uses reject. Transition to `declined`.
- **Withdraw**: employee or admin withdraws; local requests without a remote ID make no provider call, remote leave uses the supported provider operation. Transition to `withdrawn`.

The approved AU transition contract is `au-contract-v1` in `plans/160-au-transition-contract-v1.md`. Remote approve, decline and withdraw reuse `OutboundOperation` with a stable UUID idempotency key and exact tenant/method/URL/body identity. The replay cutoff is five minutes from first dispatch, inside Xero's six-minute retention. Uncertain outcomes after that cutoff require authoritative provider reads and administrator recovery; never mint a new key to retry an ambiguous write.

Do not queue outbound writes as background jobs. Failures are surfaced inline to the user.

### Xero connection structure

Each Organisation owns at most one `XeroConnection`. It contains the external Xero tenant and remote connection IDs, region and sync health. Resolve it with both `clerk_org_id` and `organisation_id`; its optional `authorisation` relation is the sole encrypted token owner.

```typescript
const connection = await db.xeroConnection.findFirst({
  where: { clerk_org_id: clerkOrgId, organisation_id: organisationId },
  include: { authorisation: true },
});
```

---

## Engineering standards

### TypeScript

- Strict mode. No `any`. No `as` casts unless justified with a comment.
- Named exports only. No default exports.
- No barrel files (`index.ts` re-exports) except at package root.
- Import aliases: `@repo/database`, `@repo/core`, `@repo/xero`, `@repo/availability`, `@repo/feeds`, `@repo/auth`, etc.

### Validation

- Zod on all external input: API params, Xero responses, webhook payloads, form submissions.
- Branded types for domain IDs (`ClerkOrgId`, `OrganisationId`, `PersonId`, `XeroTenantId`, etc.), defined in `packages/core`.

### Error handling

```typescript
type Result<T, E = AppError> = { ok: true; value: T } | { ok: false; error: E };
```

Service functions return `Result`. Route handlers map errors to HTTP responses. Do not throw for expected failures.

### Next.js

- App Router only. No `pages/` directory.
- Server Components by default. `"use client"` only when browser APIs or interactivity require it.
- Route protection and org validation composed in `apps/app/proxy.ts`, not `middleware.ts`.
- Follow Tailwind CSS v4 patterns.

### Code organisation

- No `console.log` in production code. Use the observability package logger.
- Comments only where intent is non-obvious.

---

## Database conventions

- Table names: `snake_case`, plural (e.g. `availability_records`, `xero_connections`).
- Column names: `snake_case`.
- Every table: `id` (UUID, PK), `created_at`, `updated_at`.
- `clerk_org_id` (text, not null, indexed) on every tenant-scoped table.

`xero_authorisations` deliberately has no `clerk_org_id`: it coordinates one verified Xero user per provider app across payroll connections and accounts. Customer access always resolves a `XeroConnection` using both tenancy keys before accessing its authorisation. Connections and OAuth sessions never store credential copies.

- Soft deletes where specified: `archived_at` (nullable timestamp).
- Foreign keys explicit. Enums at database level.
- JSON columns typed with Zod schemas and documented with a schema reference comment.
- One migration per schema change. Never hand-edit generated migrations.
- Full schema at `packages/database/prisma/schema.prisma`. PRODUCT.md is the authoritative description.

---

## Testing standards

- Co-located: `foo.ts` has `foo.test.ts` in the same directory.
- Vitest as runner. Tests from the first slice; every feature or fix includes corresponding tests. No deferring.
- Finish Prisma generation before running checks that import generated source. The build regenerates the client; run it separately from unit/integration tests to avoid transient missing-module failures.
- Factories or builders for test data, not repeated raw literals.
- Fixture-based tests for Xero response mappers and region-specific parsers.
- Explicitly test: ICS serialisation, UID generation, SEQUENCE incrementing, privacy transforms, Zod validators, feed token validation, `clerk_org_id` query isolation, XeroConnection/XeroAuthorisation uniqueness invariants, approval state transitions, decline-reason enforcement.

---

## Xero adapter rules

- All Xero code in `packages/xero`. Region-specific logic in subdirectories (`au/`, `nz/`, `uk/`).
- Raw Xero responses stored in `source_payload_json` on `availability_records` for audit.
- Raw Xero write error payloads stored in `xero_write_error_raw` for admin audit only. A plain-language version is stored in `xero_write_error` for display. Never expose raw Xero error codes or payloads to employees.
- Xero-specific types never leak into `packages/availability` or `packages/feeds`.
- Rate limiting uses a small shared, atomic Redis store inside `packages/xero`, keyed by provider app and external Xero tenant: 60/minute, 1,000/day on Starter or 5,000/day on higher commercial tiers, and five concurrent. This coordinates serverless app/API/job workers; process-local counters cannot enforce cross-worker concurrency. Expiring concurrency leases recover capacity after worker crashes, and successful requests release their leases. Ordinary quota keys initialise atomically on first use; fixture namespaces isolate tests only and require no deployment namespace or bootstrap command. App-wide admission enforces 10,000 calls/minute; token and connection-inventory requests have no invented tenant quota. Store failure denies admission as an infrastructure failure. Only an actual provider response supplies an HTTP 429 or provider rate-limit headers.
- Preserve the absolute request deadline, 5 MiB response-body cap, allowed-origin checks and redirect rejection. These bound worker resource use and prevent credentials reaching an unapproved host; they are ordinary transport safeguards.
- Record genuine provider 429 retry guidance before reading its bounded body. Preserve the rejection headers if the body is unreadable, while retaining any earlier uncertain mutation outcome. Local admission must never manufacture a provider response.
- Consent requests exactly `offline_access accounting.settings.read payroll.employees payroll.settings.read`; validate actual granted capabilities, accepting write permission for its corresponding reads.
- Server-only scoped access refreshes within two minutes of expiry, serialises token rotation under the canonical authorisation lock and atomically saves both tokens. Dormant active grants, including paused connections, refresh at 45 days. Invalid grants require reconnect.
- AU people and V2 leave deltas use completed provider watermarks with a two-minute overlap. Only complete successful full reads may archive absent Xero-owned rows. Manual and nightly reconciliation are full reads.
- Complete successful full employee reconciliation archives missing Xero-owned people immediately, without snapshot thresholds or missing-marker delays. Deferred leave changes and cancelled/incomplete runs retain their watermarks. Balance reads validate provider amounts and never invent zero for missing data.
- A single persisted initial full import sequences people, leave and the entire balance roster; completion requires the event `requestedAt` to match `initial_sync_requested_at`. Scheduler recovery redispatches pending imports.
- Owner/admin disconnect deletes the exact remote connection before local teardown/audit; provider 204/404 permits completion, uncertain failure preserves retryable state and sibling connections.
- Do not recreate mirrored credentials, manual token-refresh controls, asynchronous normal disconnect cleanup, behavioural inactivity classifications/reports, or multi-provider abstractions. Canonical authorisations, automatic refresh, synchronous remote-first disconnect and the existing Xero regional adapters are the approved model.
- All Xero sync operations carry `clerk_org_id` and `organisation_id` in their context.
- Resolve XeroConnection with both `clerk_org_id` and `organisation_id`, then its canonical authorisation.
- Outbound writes return `Result<T, XeroWriteError>`. `XeroWriteError` variants: `validation_error`, `conflict_error`, `auth_error`, `permission_error`, `rate_limit_error`, `network_error`, `not_found_error`, `region_not_supported_error`, `unknown_error`.

---

## Feed rules

- Feed endpoint: `GET /ical/:token.ics` in `apps/api`.
- Display and return the complete active calendar feed URL to every authorised viewer. Never mask, truncate, hash, redact, or replace it with a token hint. Copy actions must use the exact displayed URL.
- Internal token hashes and signing material are server-only implementation details. They must never be returned in place of the usable subscribe URL.
- The `masked` privacy mode applies to published event details only. It must never mask the calendar feed URL.
- UID generation uses the deterministic hash formula in PRODUCT.md. Never use Xero's LeaveApplicationID as the sole UID.
- SEQUENCE incremented when the published representation changes materially.
- Privacy transforms applied during publication projection, not at render time.
- Feed body cached in Vercel KV by `feed_id + etag`.
- Cache invalidated only when a relevant `availability_record` changes.

---

## Inngest job rules

- Job definitions in `packages/jobs`. Handlers registered in `apps/api`.
- Jobs: `sync-xero-people`, `sync-xero-leave-records`, `sync-xero-leave-balances`, `reconcile-feed-publications`, `rebuild-feed-cache`, `reconcile-xero-approval-state`.
- Inngest handles retries with exponential backoff for inbound sync failures.
- Outbound writes have no background retry. Supported synchronous retries reuse the exact provider idempotency key/request within the fixed replay cutoff; unresolved failures are surfaced to the user.
- Record-level inbound failures are isolated and captured, but prevent traversal completeness, watermark advancement and absent-row archival.
- All inbound upserts must be idempotent.
- Jobs carry both `clerk_org_id` and `organisation_id` in their event payload. Never rely on session context inside a job handler.

---

## Style and language

- Australian English in all UI copy, documentation, and comments (organise, analyse, colour, centre, prioritise).
- No em dashes anywhere. Use commas, colons, semicolons, or parentheses instead.
- Direct, professional tone. No hype, cliches, or motivational language.

---

## Design system summary

- Brand colour: `#336A3B` (deep forest green). Primary actions, CTAs, brand moments. Not decoration.
- Font: Plus Jakarta Sans.
- Border radius: 20px (cards/containers), 16px (dialogs/sheets/popovers/dropdowns), 14px (buttons/inputs), 12px (chips/small elements). No 4px or 8px.
- No borders for content separation. Use tonal layering (surface colour shifts).
- No `#000000` for text. Use `on-surface` token.
- No drop shadows except on floating elements.
- Light-first. Dark mode receives equal care.
- Full token tables in DESIGN.md.

---

## Security baseline

- Clerk Organisation isolation on every query (`clerk_org_id` from `auth().orgId`).
- Organisation scoping on all data access (`organisation_id` within the Clerk Org).
- Clerk auth on all authenticated routes.
- Xero tokens encrypted at rest using AES-256-GCM; never stored in plaintext.
- Feed tokens signed and revocable; plaintext never persisted. The complete active subscribe URL is intentionally returned to authorised viewers.
- Audit logs for all admin actions.
- No Xero tokens, internal feed token hashes, signing material, or raw payloads exposed to client.
- No secrets in client bundles. Never log or commit secrets or `.env` files.
- SSE connections are per-user and per-Clerk-Organisation. Must not leak notifications across `clerk_org_id` boundaries.

---

## Environment variables

Optional variables with format constraints must be absent (commented out), not `""`. Empty strings fail Zod format validation even for `.optional()` fields.

| Variable | Used by | Purpose |
|---|---|---|
| `DATABASE_URL` | `packages/database` | Neon Postgres connection string |
| `CLERK_SECRET_KEY` | `packages/auth` | Clerk server-side auth |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | `packages/auth` | Clerk client-side auth |
| `RESEND_TOKEN` | `packages/email` | Resend API key |
| `RESEND_FROM` | `packages/email` | Sender address |
| `NEXT_PUBLIC_SENTRY_DSN` | `packages/observability` | Sentry error tracking (client DSN) |
| `XERO_CLIENT_ID` | `packages/xero` | Xero OAuth app ID |
| `XERO_CLIENT_SECRET` | `packages/xero` | Xero OAuth app secret |
| `XERO_TOKEN_ENCRYPTION_KEY` | `packages/xero` | AES-256-GCM key for encrypting Xero OAuth tokens at rest; must be 32 bytes, base64-encoded |
| `XERO_APP_TIER` | `packages/xero` | Required production commercial allowance: Starter 1,000/day; Core and above 5,000/day |
| `XERO_REDIRECT_URI` | `packages/xero` | Registered HTTPS OAuth callback, required by production preflight |
| `XERO_TOKEN_ENCRYPTION_ACTIVE_VERSION` | `packages/xero` | Positive version for new envelopes; preserve referenced old keys |
| `XERO_TOKEN_ENCRYPTION_KEYS_JSON` | `packages/xero` | Server-only versioned encryption key map, never print values |
| `INNGEST_EVENT_KEY` | `packages/jobs` | Inngest event key |
| `INNGEST_SIGNING_KEY` | `packages/jobs` | Inngest signing key |
| `KV_REST_API_URL` | `packages/feeds`, `packages/xero` | Shared feed cache and Xero quota endpoint, required for production Xero calls |
| `KV_REST_API_TOKEN` | `packages/feeds`, `packages/xero` | Shared KV authentication, configured together with its URL |

### Stripe billing environment

| Variable | Scope | Notes |
|---|---|---|
| `STRIPE_SECRET_KEY` | `packages/billing` | Server-side Stripe secret key. Must be absent, not empty, when unset. |
| `STRIPE_WEBHOOK_SECRET` | `apps/api` | Stripe endpoint signing secret (`whsec_...`). |
| `STRIPE_PRICE_BASIC` | seed/config | Stripe recurring Price id for the Basic product. |
| `STRIPE_PRICE_PREMIUM` | seed/config | Stripe recurring Price id for the Premium product. Enterprise is custom quoted and has no price id. |
| `STRIPE_PORTAL_RETURN_URL` | `packages/billing` | Return URL after the hosted Customer Portal. |
| `STRIPE_CHECKOUT_SUCCESS_URL` | `packages/billing` | Success URL after hosted Checkout. |
| `STRIPE_CHECKOUT_CANCEL_URL` | `packages/billing` | Cancel URL after hosted Checkout. |

---

## Agent workflow

### 1. Research first

- Inspect the existing codebase before suggesting or making changes.
- Verify package usage in `package.json` before introducing or relying on libraries.
- Refer to PRODUCT.md for domain decisions, DESIGN.md for UI tokens, `.impeccable.md` for brand direction.

### 2. Implement within repo conventions

- Keep changes aligned with existing package boundaries.
- Default to Server Components unless a client component is necessary.
- Every new service function must accept and apply both `clerk_org_id` and `organisation_id`.
- Resolve XeroConnection through its Organisation FK using both tenancy keys.

### 3. Verify changes

- Run `bun run fix` after modifications when lint autofixes are relevant.
- Run the four CI gates: `bun run check`, `bun run typecheck`, `bun run test`, `bun run test:integration`.
- For targeted tests: `bunx vitest run <path/to/test>`.

---

## Platform notes

- Prisma 7 WASM compiler requires `serverExternalPackages: ["@prisma/client", "@prisma/adapter-neon"]` in `packages/next-config/index.ts`.
- Route protection composed in `apps/app/proxy.ts`, not `middleware.ts`.
- Biome 2 + Ultracite enforce repo style. Configuration in `biome.jsonc` at root.
- Git: conventional commits (`feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`), one logical change per commit, branch per feature slice.

---

## Build order

1. Organisation, people, team, location schema and seed data (keyed by `clerk_org_id`)
2. Xero OAuth and tenant persistence (scoped XeroConnection + canonical XeroAuthorisation)
3. Xero employee sync (AU, NZ, UK)
4. Xero leave normalisation into `availability_records`
5. Leave balance sync from Xero
6. Leave submission workflow: draft, submit, Xero write-back, approval state machine
7. Leave approval workflow: manager approve/decline, Xero write-back
8. Manual availability CRUD
9. Public holiday data: API sourcing, manual overrides, per-location configuration
10. SSE notification infrastructure and in-app notification delivery
11. Feed model and token model
12. ICS renderer with stable UID and privacy modes
13. Feed preview and feed detail UI
14. Team calendar and person profile UI
15. Analytics: leave reports and out-of-office reports
16. Reconciliation jobs, sync health UI, and audit reporting

Each step: deployable, testable vertical slice.

### Xero persistence controls

`XeroAuthorisation` is the sole encrypted token owner, unique per verified provider app and Xero user. `XeroConnection` is unique per payroll organisation and carries both tenancy keys. `XeroOAuthSession` holds a short-lived grant reference and safe selection metadata; it has no credentials. Provider timestamp cursors cover people and leave records, with roster progress on the connection. Historical migrations are retained; generate migrations and Prisma output rather than editing them.
