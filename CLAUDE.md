# CLAUDE.md

This file provides guidance to Claude Code when working in the Team Calendar repository.

## Project overview

**Team Calendar** is a multi-tenant leave management and availability publishing platform. It connects to Xero Payroll (AU, NZ, UK) bidirectionally: employees submit and manage leave requests in Team Calendar, approved state is written back to Xero synchronously, and Xero-side leave data is pulled into the canonical availability model on a scheduled basis.

The architecture is: **Leave submission layer > bidirectional Xero sync layer > canonical availability model > feed projection layer > ICS publishing layer**

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
- a multi-connector abstraction layer (Xero only at this stage)

Xero remains the payroll source of truth. Outbound writes (submit, approve, decline, withdraw) are synchronous and user-triggered. Inbound sync is pull-first via scheduled Inngest jobs. Leave balances are always sourced from Xero; never calculated by Team Calendar.

**Reference docs (read before implementing any domain logic):**

- `PRODUCT.md`: authoritative product truth, domain model, database schema, Xero sync model, feed rendering, UID strategy, build order, and stack decisions. Read this first.
- `DESIGN.md`: colour tokens, typography, spacing, elevation rules, and component specifications.
- `.impeccable.md`: brand personality, user context, and design principles.

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
- Diff behavior between main and your changes when relevant
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
- When asked to implement, implement — do not substitute a list of findings for the work itself
- Comparison, gap analysis, and difference lists are intermediate steps toward implementation, never the end product
- If you identify differences between a design and the production code, fix every single one in that same session before reporting back
- Do not report partial progress as completion. "I found 20 differences" is a failure state, not a result
- The correct loop is: read reference → read production → fix all gaps → verify → done
- Never optimise for appearing useful. A list that describes unfixed problems is not useful
- If the task is "implement X to match Y", the session is not over until zero differences remain

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
| Runtime | Bun |
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
bun run test               # Vitest across the monorepo
bunx vitest run <path>     # Single test file
bun run migrate            # Prisma format + generate + migrate dev
bun run migrate:deploy     # Generate + migrate deploy (production)
bun run db:push            # Push schema without migration (dev only)
bun run analyze            # Bundle analysis
bun run clean              # Remove git-ignored files
```

---

## Tenancy model

Team Calendar uses **Clerk Organisations** as the top-level tenant boundary. There is no custom `workspaces` database table.

### Hierarchy

```
Clerk Organisation (clerk_org_id)
  └─ Organisation              one or many per Clerk Org; e.g. Acme Restaurants, Acme Hotels
        └─ XeroConnection      one per Organisation (UNIQUE on organisation_id)
              └─ XeroTenant    one per XeroConnection (UNIQUE on xero_connection_id)
```

### Key invariants

- One Clerk Organisation = one country code. Enforced at the application layer.
- One Organisation owns exactly one XeroConnection.
- One XeroConnection owns exactly one XeroTenant.
- A Clerk Org with two Xero files has two Organisation rows, two XeroConnections, two XeroTenants.
- Billing enforced at the Clerk Organisation level via `clerk_org_subscriptions`.
- **Every database query that touches tenant data must filter by `clerk_org_id`.**
- Membership and roles are managed entirely by Clerk. No custom membership or role tables.
- Personal Accounts are disabled. Every user must belong to at least one Clerk Organisation.

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

Permission checks use `auth().has({ role: 'org:admin' })` or helpers from `@repo/auth`.

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
| `packages/xero` | Xero OAuth, tenant sync, region-specific API handling, outbound write operations, rate limiting |
| `packages/availability` | Canonical person model, availability records, privacy rules, feed eligibility, approval state machine |
| `packages/feeds` | ICS generation via ical-generator, UID strategy, feed token validation, caching |
| `packages/notifications` | In-app notification creation, SSE delivery, notification preferences, email dispatch via Resend |
| `packages/jobs` | Inngest job definitions: sync scheduling, feed rebuilds, reconciliation |
| `packages/core` | Result type, branded IDs, shared enums, date/timezone utilities, error types |

### Infrastructure packages

| Package | Purpose |
|---|---|
| `packages/database` | Prisma schema, migrations, generated client, query helpers |
| `packages/auth` | `requireOrg()`, `requireRole()`, `getOrgId()`, re-exported Clerk hooks |
| `packages/design-system` | Shared React components, Tailwind CSS, shadcn/ui |
| `packages/email` | React Email templates + Resend transport |
| `packages/observability` | Sentry error tracking, structured logging |
| `packages/next-config` | Shared Next.js configuration |
| `packages/seo` | SEO metadata helpers |
| `packages/typescript-config` | Shared tsconfig base |

### Not in use

`ai`, `cms`, `collaboration`, `feature-flags`, `internationalization`, `payments`, `rate-limit`, `security`, `storage`, `webhooks`. Do not add dependencies on them.

---

## Architecture rules

### Data access boundaries

- All database access through `packages/database`. Never import Prisma client directly in apps.
- All Xero-specific logic in `packages/xero`. Canonical domain logic in `packages/availability` never depends on Xero payload shapes.
- All ICS generation logic in `packages/feeds`.
- All notification logic in `packages/notifications`.
- Shared UI components in `packages/design-system`. Do not redefine base components in apps.

### Core entity

The primary domain object is `AvailabilityRecord`. It holds both Xero-synced leave and manual availability entries. It is not called a "leave application". See PRODUCT.md for the full schema.

### Xero write-back

Outbound writes are synchronous and user-triggered. The four write operations are:

- **Submit**: employee submits a leave request; write to Xero, transition to `submitted`
- **Approve**: manager approves; write to Xero, transition to `approved`
- **Decline**: manager declines with a required reason; write to Xero, transition to `declined`
- **Withdraw**: employee or admin withdraws; write to Xero, transition to `withdrawn`

Do not queue outbound writes as background jobs. Failures are surfaced inline to the user.

### Xero connection structure

Each Organisation owns exactly one `XeroConnection` (unique on `organisation_id`) and through it exactly one `XeroTenant` (unique on `xero_connection_id`). When implementing Xero sync or write operations, always resolve the connection and tenant via the Organisation FK, never via a bare `clerk_org_id` lookup.

```typescript
// Correct: resolve tenant via Organisation
const tenant = await db.xeroTenant.findFirst({
  where: { organisation_id: organisationId },
  include: { xero_connection: true },
});

// Wrong: resolving by clerk_org_id alone could match multiple tenants
const tenant = await db.xeroTenant.findFirst({
  where: { clerk_org_id: clerkOrgId },
});
```

---

## Coding rules

### TypeScript

- Strict mode. No `any`. No `as` casts unless justified with a comment.
- Named exports only. No default exports.
- No barrel files (`index.ts` re-exports) except at package root.
- Import aliases: `@repo/database`, `@repo/core`, `@repo/xero`, `@repo/availability`, `@repo/feeds`, `@repo/auth`, etc.

### Validation

- Zod on all external input: API params, Xero responses, webhook payloads, form submissions.
- Branded types for domain IDs (`ClerkOrgId`, `OrganisationId`, `PersonId`, `XeroTenantId`, etc.), defined in `packages/core`.

### MCP Servers

- Always use Context7 when library or API documentation, code generation, or setup steps are needed, without waiting to be asked explicitly.

### Error handling

```typescript
type Result<T, E = AppError> = { ok: true; value: T } | { ok: false; error: E };
```

Service functions return `Result`. Route handlers map errors to HTTP responses. Do not throw for expected failures.

### Next.js

- App Router only. No `pages/` directory.
- Server Components by default. Add `"use client"` only when browser APIs or interactivity require it.
- Route protection and org validation composed in `apps/app/proxy.ts`, not `middleware.ts`.

### Style

- No `console.log` in production code. Use the observability package logger.
- Comments only where intent is non-obvious.
- Australian English in all UI copy, documentation, and comments.
- No em dashes anywhere.

---

## Database conventions

- Table names: `snake_case`, plural (e.g. `availability_records`, `xero_tenants`).
- Column names: `snake_case`.
- Every table: `id` (UUID, PK), `created_at`, `updated_at`.
- `clerk_org_id` (text, not null, indexed) on every tenant-scoped table.
- Soft deletes where specified: `archived_at` (nullable timestamp).
- Foreign keys explicit. Enums at database level.
- JSON columns typed with Zod schemas and documented with a schema reference comment.
- One migration per schema change. Never hand-edit generated migrations.
- Full schema at `packages/database/prisma/schema.prisma`. PRODUCT.md is the authoritative description.

---

## Testing rules

- Co-located: `foo.ts` has `foo.test.ts` in the same directory.
- Vitest as runner. Tests from the first slice. No deferring.
- Factories or builders for test data, not repeated raw literals.
- Fixture-based tests for Xero response mappers and region-specific parsers.
- Explicitly test: ICS serialisation, UID generation, SEQUENCE incrementing, privacy transforms, Zod validators, feed token validation, `clerk_org_id` query isolation, XeroConnection/XeroTenant uniqueness invariants, approval state transitions, decline-reason enforcement.

---

## Xero adapter rules

- All Xero code in `packages/xero`. Region-specific logic in subdirectories (`au/`, `nz/`, `uk/`).
- Raw Xero responses stored in `source_payload_json` on `availability_records` for audit.
- Raw Xero write error payloads stored in `xero_write_error_raw` for admin audit only. A plain-language version is stored in `xero_write_error` for display. Never expose raw Xero error codes or payloads to employees.
- Xero-specific types never leak into `packages/availability` or `packages/feeds`.
- Rate limiting (60/min per org, 5,000/day per org, five concurrent per org) handled inside `packages/xero`.
- Token refresh handled proactively before sync runs.
- All Xero sync operations carry `clerk_org_id` and `organisation_id` in their context.
- Resolve XeroTenant via `organisation_id` FK, not bare `clerk_org_id`.
- Outbound writes return `Result<T, XeroWriteError>`. `XeroWriteError` variants: `validation_error`, `conflict_error`, `auth_error`, `rate_limit_error`, `unknown_error`.

---

## Feed rules

- Feed endpoint: `GET /ical/:token.ics` in `apps/api`.
- UID generation uses the deterministic formula in PRODUCT.md. Never use Xero's LeaveApplicationID as the sole UID.
- SEQUENCE incremented when the published representation changes materially.
- Privacy transforms applied during publication projection, not at render time.
- Feed body cached in Vercel KV by `feed_id + etag`.
- Cache invalidated only when a relevant `availability_record` changes.

---

## Inngest job rules

- Job definitions in `packages/jobs`. Handlers registered in `apps/api`.
- Jobs: `sync-xero-people`, `sync-xero-leave-records`, `sync-xero-leave-balances`, `reconcile-feed-publications`, `rebuild-feed-cache`, `reconcile-xero-approval-state`.
- Inngest handles retries with exponential backoff for inbound sync failures.
- Outbound write failures are not retried automatically; they are surfaced to the user.
- Record-level inbound failures do not fail the entire sync run.
- All inbound upserts must be idempotent.
- Jobs carry both `clerk_org_id` and `organisation_id` in their event payload. Never rely on session context inside a job handler.

---

## Security baseline

- Clerk Organisation isolation on every query (`clerk_org_id` from `auth().orgId`).
- Organisation scoping on all data access (`organisation_id` within the Clerk Org).
- Clerk auth on all authenticated routes.
- Xero tokens encrypted at rest using AES-256-GCM; never stored in plaintext.
- Feed tokens signed and revocable; plaintext never persisted.
- Audit logs for all admin actions.
- No tokens or raw payloads exposed to client.
- No secrets in client bundles.
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
| `SENTRY_DSN` | `packages/observability` | Sentry error tracking |
| `XERO_CLIENT_ID` | `packages/xero` | Xero OAuth app ID |
| `XERO_CLIENT_SECRET` | `packages/xero` | Xero OAuth app secret |
| `XERO_TOKEN_ENCRYPTION_KEY` | `packages/xero` | AES-256-GCM key for encrypting Xero OAuth tokens at rest; must be 32 bytes, base64-encoded |
| `INNGEST_EVENT_KEY` | `packages/jobs` | Inngest event key |
| `INNGEST_SIGNING_KEY` | `packages/jobs` | Inngest signing key |
| `KV_REST_API_URL` | `packages/feeds` | Vercel KV endpoint |
| `KV_REST_API_TOKEN` | `packages/feeds` | Vercel KV auth token |

---

## Platform notes

- Prisma 7 WASM compiler requires `serverExternalPackages: ["@prisma/client", "@prisma/adapter-neon"]` in `packages/next-config/index.ts`.
- Route protection composed in `apps/app/proxy.ts`, not `middleware.ts`.
- Biome 2 + Ultracite enforce repo style. Configuration in `biome.jsonc` at root.
- Git: conventional commits (`feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`), one logical change per commit, branch per feature slice.

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
