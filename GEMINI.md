# GEMINI.md

This file provides foundational mandates and procedural guidance for Gemini CLI when working in the Team Calendar repository. These instructions take precedence over general defaults.

## Project context

**Team Calendar** is a multi-tenant availability publishing platform. It connects to Xero Payroll (AU, NZ, UK), syncs approved leave data, normalises it into a canonical availability model, and publishes through secure ICS calendar feeds.

The architecture is: **Xero sync layer > canonical availability model > feed projection layer > ICS publishing layer**.

Team Calendar does not manage payroll, accruals, or leave approvals. Xero is the only provider. Manual availability entries (WFH, travelling, training, client site) are added directly by users.

### Reference docs

- `PRODUCT.md`: domain model, database schema, Xero sync model, feed rendering, UID strategy, build order.
- `DESIGN.md`: colour tokens, typography, spacing, elevation rules, component specifications.
- `.impeccable.md`: brand personality, user context, design principles.
- `AGENTS.md`: shared agent instructions (architecture rules, coding standards, testing).
- Always use Context7 when I need library/API documentation, code generation, setup or configuration steps without me having to explicitly ask.

Read PRODUCT.md before implementing or changing domain entities, sync logic, feed rendering, or schema.

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
| `packages/xero` | Xero OAuth, tenant sync, AU/NZ/UK region handling, rate limiting, leave-type mapping |
| `packages/availability` | Canonical person model, availability records, privacy rules, contactability, feed eligibility |
| `packages/feeds` | ICS generation, stable UID strategy, feed token validation, Vercel KV caching |
| `packages/jobs` | Inngest job definitions (sync scheduling, feed rebuilds, reconciliation) |
| `packages/core` | Result type, branded IDs, shared enums, date/timezone utilities, error types |

### Infrastructure packages

`packages/database`, `packages/auth`, `packages/design-system`, `packages/email`, `packages/observability`, `packages/next-config`, `packages/seo`, `packages/typescript-config`.

### Not in use

Do not reference or depend on: `packages/ai`, `packages/cms`, `packages/collaboration`, `packages/feature-flags`, `packages/internationalization`, `packages/payments`, `packages/rate-limit`, `packages/security`, `packages/storage`, `packages/webhooks`.

---

## Tenancy model

```
Clerk Organisation (clerk_org_id)   — top-level tenant; one country code; billing anchor
  └─ Organisation                   — payroll entity (e.g. Acme Restaurants Pty Ltd)
        └─ XeroConnection           — one per Organisation; UNIQUE on organisation_id
              └─ XeroTenant         — one per XeroConnection; UNIQUE on xero_connection_id
```

There is no custom `workspaces` database table. Clerk Organisations are the top-level tenant boundary.

### Key invariants

- `clerk_org_id` (text, not null, indexed) is on every tenant-scoped table.
- **All queries must filter by `clerk_org_id`**, sourced from `auth().orgId` in server context or job event payloads.
- One Clerk Organisation = one country code (app-layer invariant, not a DB constraint).
- One Organisation owns exactly one XeroConnection (`UNIQUE` on `organisation_id`).
- One XeroConnection owns exactly one XeroTenant (`UNIQUE` on `xero_connection_id`).
- A Clerk Org with two Xero files has two Organisation rows, two XeroConnections, two XeroTenants.
- Membership and roles are managed entirely by Clerk. No custom membership or role tables.
- Personal Accounts are disabled. Every user must belong to at least one Clerk Organisation.
- Billing enforced at the Clerk Organisation level via `clerk_org_subscriptions`.

### Roles

| Role | Scope |
|---|---|
| owner | Full Clerk Organisation access |
| admin | Full Organisation (payroll entity) access |
| manager | Team and direct-report access |
| viewer | Read-only filtered access |

Roles are custom roles in the Clerk dashboard. Permission checks use `auth().has({ role: 'org:admin' })` or helpers from `packages/auth`.

### Xero connection resolution

Always resolve XeroTenant via Organisation FK, not bare `clerk_org_id`:

```typescript
// Correct
const tenant = await db.xeroTenant.findFirst({
  where: { organisation_id: organisationId },
  include: { xero_connection: true },
});

// Wrong: matches multiple tenants when a Clerk Org has multiple Organisations
const tenant = await db.xeroTenant.findFirst({
  where: { clerk_org_id: clerkOrgId },
});
```

---

## Engineering standards

### TypeScript and patterns

- Strict mode. No `any`. No `as` casts without documented justification.
- Named exports only. No default exports.
- Zod validation on all external input (API params, Xero responses, webhook payloads, form submissions).
- Result pattern for service-layer errors: `{ ok: true; value: T } | { ok: false; error: E }`. Do not throw for expected failures.
- Branded types for domain IDs (`ClerkOrgId`, `OrganisationId`, `PersonId`, `XeroTenantId`, etc.), defined in `packages/core`.

### Code organisation

- No barrel files (`index.ts` re-exports) except at package root.
- Import aliases: `@repo/database`, `@repo/core`, `@repo/xero`, `@repo/availability`, `@repo/feeds`, `@repo/auth`, etc.
- All database access through `packages/database`. Never import Prisma client directly in apps.
- All Xero logic in `packages/xero`. Canonical domain logic never depends on Xero payload shapes.
- All ICS logic in `packages/feeds`.
- Shared UI in `packages/design-system`. Do not redefine base components in apps.

### Database conventions

- Table names: `snake_case`, plural. Column names: `snake_case`.
- Every table: `id` (UUID, PK), `created_at`, `updated_at`.
- `clerk_org_id` (text, not null, indexed) on every tenant-scoped table.
- Soft deletes: `archived_at` (nullable timestamp).
- Enums at database level. JSON columns typed with Zod schemas.
- One migration per schema change. Never hand-edit generated migrations.

### Testing

- Co-located: `foo.ts` has `foo.test.ts` in the same directory.
- Vitest as runner. Every feature or fix must include corresponding tests.
- Factories or builders for test data.
- Fixture-based tests for Xero response mappers and region-specific parsers.
- Explicitly test: ICS serialisation, UID generation, SEQUENCE incrementing, privacy transforms, Zod validators, feed token validation, `clerk_org_id` query isolation, XeroConnection/XeroTenant uniqueness invariants.

---

## Core entity

The primary domain object is `AvailabilityRecord`. It holds both Xero-synced leave and manual availability entries. It is not called a "leave application" or "absence event". See PRODUCT.md for the full schema and record types.

---

## Xero adapter rules

- All Xero code in `packages/xero` with region subdirectories (`au/`, `nz/`, `uk/`).
- Raw Xero responses stored in `source_payload_json` for audit.
- Rate limiting (60/min per org, 5,000/day per org, five concurrent per org) handled inside `packages/xero`.
- Xero-specific types never leak into `packages/availability` or `packages/feeds`.
- All sync operations carry `clerk_org_id` and `organisation_id` in their context.
- Resolve XeroTenant via `organisation_id` FK, not bare `clerk_org_id`.

---

## Feed rules

- Feed endpoint: `GET /ical/:token.ics` in `apps/api`.
- UID generation uses the deterministic hash formula in PRODUCT.md. Never use Xero's LeaveApplicationID as the sole UID.
- SEQUENCE incremented on material changes to the published representation.
- Privacy transforms applied during publication projection.
- Feed body cached in Vercel KV by `feed_id + etag`.

---

## Inngest job rules

- Job definitions in `packages/jobs`. Handlers registered in `apps/api`.
- Jobs: `sync-xero-people`, `sync-xero-leave-records`, `sync-xero-leave-balances`, `reconcile-feed-publications`, `rebuild-feed-cache`, `reconcile-xero-approval-state`.
- All upserts must be idempotent. Record-level failures do not fail the entire run.
- Jobs carry both `clerk_org_id` and `organisation_id` in their event payload. Never rely on session context inside a job handler.

---

## Style and language

- Australian English everywhere (organise, analyse, colour, centre, prioritise).
- No em dashes. Use commas, colons, semicolons, or parentheses.
- Direct, professional tone. No hype, cliches, or motivational language.

---

## Critical workflows

### 1. Research first

- Map the codebase before suggesting changes.
- Refer to PRODUCT.md for domain logic, DESIGN.md for UI tokens, `.impeccable.md` for brand personality.
- Verify library usage in `package.json` before employing them.

### 2. Implement within conventions

- Server Components by default. `"use client"` only for interactivity.
- Tailwind CSS v4 patterns.
- Route protection in `apps/app/proxy.ts`, not `middleware.ts`.
- Every new service function must accept and apply both `clerk_org_id` and `organisation_id`.
- Resolve XeroTenant via Organisation FK, not bare `clerk_org_id`.

### 3. Verify changes

- Run `bun run check` for linting and type-checking.
- Run `bun run test` for validation.
- For Prisma changes, ensure `serverExternalPackages` includes `@prisma/client` and `@prisma/adapter-neon` in `packages/next-config/index.ts`.

---

## Commands

```bash
bun run dev
bun run build
bun run check
bun run fix
bun run test
bunx vitest run <path>
bun run migrate
bun run migrate:deploy
bun run db:push
bun run analyze
bun run clean
```

---

## Security

- Clerk Organisation isolation on every query (`clerk_org_id` from `auth().orgId`).
- Organisation scoping on all data access (`organisation_id` within the Clerk Org).
- Clerk auth on all authenticated routes; middleware in `apps/app/proxy.ts`.
- Xero tokens encrypted at rest; never in plaintext.
- Feed tokens signed and revocable; plaintext never persisted.
- No tokens or raw payloads exposed to client.
- Never log or commit secrets or `.env` files.

---

## Platform notes

- Prisma 7 WASM compiler requires `serverExternalPackages: ["@prisma/client", "@prisma/adapter-neon"]` in `packages/next-config/index.ts`.
- Optional env vars with format constraints must be absent (commented out), not `""`. Empty strings fail Zod `.optional()` validation.
- Git: conventional commits (`feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`), one logical change per commit, branch per feature slice.

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
