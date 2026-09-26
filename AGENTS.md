# AGENTS.md

This file provides shared instructions for coding agents working in the Team Calendar repository. It applies regardless of which agent or IDE is in use.

## Project overview

**Team Calendar** is a multi-tenant leave management and availability publishing platform. It connects to Xero Payroll (AU, NZ, UK), syncs approved leave data, normalises it into a canonical availability model, and publishes through secure ICS calendar feeds.

The architecture is: **Leave submission layer > bidirectional Xero sync layer > canonical availability model > feed projection layer > ICS publishing layer**.

Employees submit and manage leave in Team Calendar; managers approve or decline; approved state writes back to Xero Payroll synchronously. Xero remains the payroll source of truth for balances and accruals, which Team Calendar reads but never calculates. Alongside Xero-synced leave, Team Calendar captures manual availability entries (WFH, travelling, training, client site) and standardises both into one publishable calendar domain.

### Reference docs

Read before implementing or changing domain entities, sync logic, feed rendering, or schema:

- `PRODUCT.md`: domain model, database schema, Xero sync model, feed rendering, UID strategy, build order, stack decisions.
- `DESIGN.md`: colour tokens, typography, spacing, elevation rules, component specifications.
- `.impeccable.md`: brand personality, user context, design principles.
- Always use Context7 when I need library/API documentation, code generation, setup or configuration steps without me having to explicitly ask.

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

---

## Monorepo layout

### Apps

| App | Port | Purpose |
|---|---|---|
| `app` | 3000 | Authenticated product UI |
| `api` | 3002 | Xero OAuth, sync orchestration, feed endpoints, Inngest handlers |
| `web` | 3001 | Public marketing site |
| `docs` | 3004 | Mintlify documentation |
| `email` | 3003 | React Email template development |

### Domain packages

| Package | Purpose |
|---|---|
| `packages/xero` | Xero OAuth, tenant sync, AU/NZ/UK region handling, outbound write operations, rate limiting, leave-type mapping |
| `packages/availability` | Canonical person model, availability records, privacy rules, contactability, feed eligibility |
| `packages/feeds` | ICS generation (ical-generator), stable UID strategy, feed token validation, Vercel KV caching |
| `packages/notifications` | In-app notification creation, SSE delivery, notification preferences, email dispatch via Resend |
| `packages/jobs` | Inngest job definitions: sync scheduling, feed rebuilds, reconciliation |
| `packages/core` | Result type, branded IDs, shared enums, date/timezone utilities, error types |

### Infrastructure packages

| Package | Purpose |
|---|---|
| `packages/database` | Prisma schema, migrations, generated client |
| `packages/auth` | `requireOrg()`, `requireRole()`, `getOrgId()`, re-exported Clerk hooks |
| `packages/billing` | Stripe billing integration, checkout and customer portal sessions, webhook handling |
| `packages/analytics` | PostHog and Vercel analytics, client and server instrumentation |
| `packages/design-system` | Shared React components, Tailwind CSS, shadcn/ui |
| `packages/email` | React Email templates + Resend transport |
| `packages/observability` | Sentry, structured logging |
| `packages/next-config` | Shared Next.js configuration |
| `packages/seo` | SEO metadata helpers |
| `packages/typescript-config` | Shared tsconfig base |

### Not in use

Do not reference or depend on: `packages/ai`, `packages/cms`, `packages/collaboration`, `packages/feature-flags`, `packages/internationalization`, `packages/payments`, `packages/rate-limit`, `packages/security`, `packages/storage`, `packages/webhooks`.

---

## Architecture rules

### Tenancy

Team Calendar uses **Clerk Organisations** as the top-level tenant boundary. There is no custom `workspaces` database table.

```
Clerk Organisation (clerk_org_id)   : one per customer account; one country code
  └─ Organisation                   : one or many payroll entities (e.g. Acme Restaurants, Acme Hotels)
        └─ XeroConnection           : one per Organisation; UNIQUE on organisation_id
              └─ XeroTenant         : one per XeroConnection; UNIQUE on xero_connection_id
```

- `clerk_org_id` (text, not null, indexed) is present on every tenant-scoped table.
- **All data queries must filter by `clerk_org_id`**, sourced from `auth().orgId` in server context or from job event payloads.
- One Clerk Organisation = one country code (app-layer invariant, not a DB constraint).
- Membership and roles are managed entirely by Clerk. No custom membership or role tables.
- Personal Accounts are disabled. Every user must belong to at least one Clerk Organisation.
- In-app switching between multiple Organisations is not currently implemented. `CustomUserButton` (`apps/app/app/(authenticated)/components/custom-user-button.tsx`) exposes only Clerk's organisation-profile action (`openOrganizationProfile()`). Adding `<OrganizationSwitcher />` or an equivalent control is an open gap, not a shipped mechanism.
- Billing enforced at the Clerk Organisation level via `clerk_org_subscriptions`.

### Xero connection structure

Each Organisation owns exactly one `XeroConnection` and through it exactly one `XeroTenant`. Always resolve the tenant via the Organisation FK:

```typescript
// Correct
const tenant = await db.xeroTenant.findFirst({
  where: { organisation_id: organisationId },
  include: { xero_connection: true },
});

// Wrong: clerk_org_id alone can match multiple tenants across multiple Organisations
const tenant = await db.xeroTenant.findFirst({
  where: { clerk_org_id: clerkOrgId },
});
```

### Roles

| Role | Scope |
|---|---|
| owner | Full Clerk Organisation access |
| admin | Full Organisation (payroll entity) access |
| manager | Team and direct-report access |
| viewer | Read-only filtered access |

Roles are custom roles in the Clerk dashboard. Permission checks use `auth().has({ role: 'org:admin' })` or helpers from `packages/auth`.

### Data access boundaries

- All database access through `packages/database`. Never import Prisma client directly in apps.
- All Xero-specific logic in `packages/xero`. Canonical domain logic in `packages/availability` never depends on Xero payload shapes.
- All ICS generation logic in `packages/feeds`.
- All notification logic in `packages/notifications`.
- Shared UI components in `packages/design-system`. Do not redefine base components in apps.

### Core entity

The primary domain object is `AvailabilityRecord`. It holds both Xero-synced leave and manual availability entries. It is not called a "leave application" or "absence event". See PRODUCT.md for the full schema.

### Xero write-back

Outbound writes are synchronous and user-triggered. The four write operations are:

- **Submit**: employee submits a leave request; write to Xero, transition to `submitted`
- **Approve**: manager approves; write to Xero, transition to `approved`
- **Decline**: manager declines with a required reason; write to Xero, transition to `declined`
- **Withdraw**: employee or admin withdraws; write to Xero, transition to `withdrawn`

Do not queue outbound writes as background jobs. Failures are surfaced inline to the user.

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

### Code organisation

- No `console.log` in production code. Use the observability package logger.
- Comments only where intent is non-obvious.

---

## Database conventions

- Table names: `snake_case`, plural.
- Column names: `snake_case`.
- Every table: `id` (UUID, PK), `created_at`, `updated_at`.
- `clerk_org_id` (text, not null, indexed) on every tenant-scoped table.

The system infrastructure tables `xero_credential_owners`, `xero_refresh_attempts` and `xero_provider_connections` deliberately have no `clerk_org_id`. They coordinate one verified Xero authoriser across payroll bindings and customer accounts. Customer visibility and access remain scoped through `XeroTenant` by Clerk organisation and payroll organisation.
- Soft deletes where specified: `archived_at` (nullable timestamp).
- Foreign keys explicit. Enums at database level.
- JSON columns typed with Zod schemas; schema reference in a column comment.
- One migration per schema change. Never hand-edit generated migrations.

---

## Testing standards

- Co-located: `foo.ts` has `foo.test.ts` in the same directory.
- Vitest as runner. Tests from the first slice. No deferring.
- Factories or builders for test data, not repeated raw literals.
- Fixture-based tests for Xero response mappers and region-specific parsers.
- Explicitly test: ICS serialisation, UID generation, SEQUENCE incrementing, privacy transforms, Zod validators, feed token validation, `clerk_org_id` query isolation, XeroConnection/XeroTenant uniqueness invariants, approval state transitions, decline-reason enforcement.

---

## Xero adapter rules

- All Xero code in `packages/xero`. Region-specific logic in subdirectories (`au/`, `nz/`, `uk/`).
- Raw Xero responses stored in `source_payload_json` for audit.
- Raw Xero write error payloads stored in `xero_write_error_raw` for admin audit only. A plain-language version is stored in `xero_write_error` for display. Never expose raw Xero error codes or payloads to employees.
- Xero-specific types never leak into `packages/availability` or `packages/feeds`.
- Rate limiting (60/min per org, 5,000/day per org, five concurrent per org) handled inside `packages/xero`.
- All sync operations carry `clerk_org_id` and `organisation_id` in their context.
- Always resolve XeroTenant via `organisation_id` FK, not bare `clerk_org_id`.
- Outbound writes return `Result<T, XeroWriteError>`. `XeroWriteError` variants: `validation_error`, `conflict_error`, `auth_error`, `permission_error`, `rate_limit_error`, `network_error`, `not_found_error`, `region_not_supported_error`, `unknown_error`.

---

## Feed rules

- Feed endpoint: `GET /ical/:token.ics` in `apps/api`.
- Display and return the complete active calendar feed URL to every authorised viewer. Never mask, truncate, hash, redact, or replace it with a token hint. Copy actions must use the exact displayed URL.
- Internal token hashes and signing material are server-only implementation details. They must never be returned in place of the usable subscribe URL.
- The `masked` privacy mode applies to published event details only. It must never mask the calendar feed URL.
- UID generation uses the deterministic hash formula in PRODUCT.md. Never use Xero's LeaveApplicationID as the sole UID.
- SEQUENCE incremented on material changes to the published representation.
- Privacy transforms applied during publication projection, not at render time.
- Feed body cached in Vercel KV by `feed_id + etag`.

---

## Inngest job rules

- Job definitions in `packages/jobs`. Handlers registered in `apps/api`.
- Jobs: `sync-xero-people`, `sync-xero-leave-records`, `sync-xero-leave-balances`, `reconcile-feed-publications`, `rebuild-feed-cache`, `reconcile-xero-approval-state`.
- Inngest handles retries with exponential backoff.
- Record-level failures do not fail the entire sync run.
- All upserts must be idempotent.
- Jobs carry both `clerk_org_id` and `organisation_id` in their event payload. Never rely on session context inside a job handler.

---

## Style and language

- Australian English everywhere (organise, analyse, colour, centre, prioritise).
- No em dashes. Use commas, colons, semicolons, or parentheses instead.
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
- Xero tokens encrypted at rest; never in plaintext.
- Feed tokens signed and revocable; plaintext never persisted. The complete active subscribe URL is intentionally returned to authorised viewers.
- Audit logs for admin actions.
- No Xero tokens, internal feed token hashes, signing material, or raw payloads exposed to client.
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
| `NEXT_PUBLIC_SENTRY_DSN` | `packages/observability` | Sentry error tracking (client DSN) |
| `XERO_CLIENT_ID` | `packages/xero` | Xero OAuth app ID |
| `XERO_CLIENT_SECRET` | `packages/xero` | Xero OAuth app secret |
| `XERO_TOKEN_ENCRYPTION_KEY` | `packages/xero` | AES-256-GCM key for encrypting Xero OAuth tokens at rest; must be 32 bytes, base64-encoded |
| `INNGEST_EVENT_KEY` | `packages/jobs` | Inngest event key |
| `INNGEST_SIGNING_KEY` | `packages/jobs` | Inngest signing key |
| `KV_REST_API_URL` | `packages/feeds` | Vercel KV endpoint |
| `KV_REST_API_TOKEN` | `packages/feeds` | Vercel KV auth token |

---

## Agent workflow

### 1. Research first

- Inspect the existing codebase before suggesting or making changes.
- Verify package usage in `package.json` before introducing or relying on libraries.
- Refer to PRODUCT.md for domain decisions, DESIGN.md for UI tokens, `.impeccable.md` for brand direction.

### 2. Implement within repo conventions

- Follow Tailwind CSS v4 patterns.
- Keep changes aligned with existing package boundaries.
- Default to server components unless a client component is necessary.
- Every new service function must accept and apply both `clerk_org_id` and `organisation_id`.
- Resolve XeroTenant via Organisation FK, not bare `clerk_org_id`.

### 3. Verify changes

- Run `bun run fix` after modifications when lint autofixes are relevant.
- Run `bun run check` for linting and type-checking.
- Run `bun run test` for validation.
- For targeted tests: `bunx vitest run <path/to/test>`.

---

## Commands

```bash
bun run dev
bun run build
bun run check
bun run fix
bun run typecheck
bun run test
bun run test:integration
bunx vitest run <path/to/test>
bun run migrate
bun run migrate:deploy
bun run db:push
bun run analyze
bun run clean
bun run preflight
```

`typecheck` and `test:integration` are both CI gates. A change is not verified until `bun run check`, `bun run typecheck`, `bun run test` and `bun run test:integration` all pass.

---

## Platform notes

- Prisma 7 WASM compiler requires `serverExternalPackages: ["@prisma/client", "@prisma/adapter-neon"]` in `packages/next-config/index.ts`.
- Route protection composed in `apps/app/proxy.ts`, not `middleware.ts`.
- Optional env vars with format constraints must be absent (commented out), not `""`. Empty strings fail Zod `.optional()` validation.
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

---

## Build order

1. Organisation, people, team, location schema and seed data (keyed by `clerk_org_id`)
2. Xero OAuth and tenant persistence (XeroConnection + XeroTenant per Organisation)
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
