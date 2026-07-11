# Team Calendar

**One accurate view of who is off, who is out, and who is in. Synced straight from Xero.**

Team Calendar is the leave management and team availability platform for small businesses that run payroll in Xero. Staff request leave and flag working from home in one place; managers approve or decline, and approved leave writes back to Xero Payroll synchronously, so Xero stays the single source of truth for balances and accruals. Alongside approved leave, Team Calendar captures everyday out-of-office context (working from home, travelling, training, client site) and publishes one combined, privacy-controlled view to the calendars your team already uses: Outlook, Google Calendar, and Apple Calendar.

No more finding out someone is off when they do not show up. No more leave requested by text and lost in a thread. No more double entry between a calendar and your payroll system.

## The problem Team Calendar solves

On a small team, leave admin holds together until it does not. Staff flag leave inconsistently: some use a form, some send a text, some just do not. Approved annual leave sits in payroll, while "working from home" and "on a client site" live in chat threads and ad hoc calendar invites. Managers approve leave in one place, then re-key it somewhere else. The result is guesswork about who is actually available, and a payroll system that drifts out of step with reality.

Team Calendar closes the gap:

- **Submit and approve in one place.** Staff request leave in Team Calendar. Managers approve or decline. Approved leave writes back to Xero Payroll immediately, so balances and accruals stay correct without re-keying.
- **One calendar your team can trust.** Approved leave and manual out-of-office states combine into a single view, published as secure calendar feeds your team subscribes to once, then never updates by hand again.
- **Privacy by default.** Choose how much each feed reveals: full detail, a neutral "out of office", or a simple "busy". Sensitive leave reasons are never exposed unless an admin chooses to.

Approved leave and manual entries appear in every subscribed calendar within 60 seconds of approval.

## How it works

1. **Connect Xero.** Team Calendar links to Australian Xero Payroll files and syncs employees, leave records, and balances on a schedule. New Zealand and United Kingdom support is planned.
2. **Manage leave.** Staff submit leave and log manual availability. Managers approve or decline. Approved decisions write straight back to Xero.
3. **Publish availability.** Team Calendar combines everything into a canonical view and serves it as secure, revocable ICS feeds with the privacy level you set.
4. **Stay informed.** In-app notifications and email keep staff and managers up to date on submissions, approvals, and sync health.

Xero remains the source of truth for balances. Team Calendar never calculates accruals; it reads them from Xero and writes approved leave back synchronously.

## Sync direction

| Direction | Mechanism | Scope |
|---|---|---|
| Inbound | Pull-first, scheduled Inngest jobs | Employees, leave records, leave balances. Xero provides no leave webhooks. |
| Outbound | Synchronous, user-triggered API write | Submit, approve, decline, withdraw. No background queue. Failures surfaced inline. |

Outbound writes and feed publishing are fast (within 60 seconds); inbound Xero sync is pull-first and periodic, since Xero provides no leave webhooks.

## Covers everyone who affects cover, not just payroll

Team Calendar is built for the whole team, not only the people on the pay run. Employees on Xero Payroll get the two-way sync and leave balances. Contractors, directors, and advisors who never appear in payroll can still be added by hand, so their availability shows on the same calendar as everyone else, without touching a pay run. Every entry is labelled by where it came from: synced from Xero, or added manually.

## Built for groups too

Team Calendar is multi-tenant by design. A small business that grows into several payroll entities (each with its own Xero file) can run them under one Account, with strict isolation between entities and role-based access for owners, admins, managers, and viewers.

The tenancy boundary is the Clerk Organisation (the Account). Each payroll entity within it owns exactly one Xero connection and one Xero tenant. One Account maps to exactly one country code.

## Tech stack

Team Calendar is a Turborepo monorepo built on modern serverless primitives:

- **Framework:** Next.js (App Router) on next-forge
- **Runtime and package manager:** Bun
- **Database:** PostgreSQL (Neon serverless) via Prisma 7 with `@prisma/adapter-neon`
- **Authentication:** Clerk (Organisations feature)
- **Background jobs:** Inngest (durable execution for sync, reconciliation, and feed rebuilds)
- **Caching:** Vercel KV (Redis-compatible feed and ETag caching)
- **Email:** Resend with React Email
- **Monitoring:** Sentry
- **ICS generation:** ical-generator
- **Deployment:** Vercel
- **Testing and quality:** Vitest, Biome 2, and Ultracite

## Roadmap

The following are out of scope for the initial build and do not require structural change to add: Slack and Teams notifications, HTML calendar views, and additional payroll connectors (MYOB, Zoho People, QuickBooks). Team Calendar is deliberately Xero-only at this stage to deliver a flawless payroll-integrated experience before broadening.

## Current status

Team Calendar is under active development and pre-launch. Core infrastructure, Clerk multi-tenancy, the Prisma schema, and domain boundaries are established. Xero synchronisation, the leave submission and approval workflow with synchronous write-back, and the canonical ICS feed projection engine are implemented in their respective domain packages. Launch scope is AU-only, English-only, core loop.

## Production URLs

| URL | Description | Purpose |
|---|---|---|
| `https://app.teamcalendar.online/` | Authenticated product application. | Used by employees, managers, admins, and account owners to manage leave, manual availability, teams, feeds, Xero connections, reports, and account settings. |
| `https://api.teamcalendar.online/` | Public API service for server-side product operations. | Handles Xero OAuth callbacks, sync orchestration, secure ICS feed delivery, SSE notification streams, support submissions, health checks, cron routes, and Inngest handlers. |
| `https://teamcalendar.online/` | Public marketing website. | Explains Team Calendar to prospective customers, publishes product and integration information, and routes visitors into sign-in, sign-up, support, and documentation journeys. |

## Local development

### Prerequisites

- [Bun](https://bun.sh/) (v1.x)
- Neon database URL
- Clerk API keys (publishable and secret)
- Resend, Inngest, and Vercel KV keys (if running specific jobs or feeds locally)

### Setup

1. **Install dependencies:**
   ```bash
   bun install
   ```

2. **Configure environment variables.** Copy the example environment files for the apps you wish to run:
   ```bash
   cp apps/api/.env.example apps/api/.env.local
   cp apps/app/.env.example apps/app/.env.local
   cp apps/web/.env.example apps/web/.env.local
   ```
   Fill in `DATABASE_URL`, `CLERK_SECRET_KEY`, and `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` as a minimum.

   **Optional GitHub support issue integration (`apps/api/.env.local`):**
   ```bash
   # Server-side only. Do not expose this token in the client.
   GITHUB_TOKEN=github_pat_xxx
   GITHUB_OWNER=your-github-owner
   GITHUB_REPO=your-repository-name
   ```
   - `GITHUB_TOKEN`: the server-side GitHub token used by the API app to create support issues
   - `GITHUB_OWNER`: the repository owner or organisation
   - `GITHUB_REPO`: the repository name without `.git`
   - Leave these values absent if you are not using the feature. Do not set them to empty strings.
   - Minimum fine-grained token permission: repository `Issues: write`.
   - Labels are best effort in v1. If the configured labels do not exist, the issue is still created.
   - If the variables are missing, support submission fails predictably with a configuration error instead of crashing the app.

3. **Set up the database:**
   ```bash
   bun run db:push
   # OR for formal migrations:
   bun run migrate
   ```

4. **Seed development data (optional):**
   ```bash
   cd packages/database && bun run seed
   ```
   This idempotently upserts a sample Australian Account: two payroll entities
   (organisations), their teams and locations, and a handful of people with a mix
   of Xero-sourced and manual records. Re-running creates no duplicates. The seed
   writes canonical data only; it never seeds Xero tokens or any other secret.

   Every seeded row is scoped to a `clerk_org_id`. By default this is the
   placeholder `org_dev_teamcalendar`. For the authenticated app to render the
   seeded tenant, the rows must be scoped to a **real** Clerk Organisation id.
   Set `SEED_CLERK_ORG_ID` to your Clerk org id (visible in the Clerk dashboard,
   in the form `org_...`) before seeding:
   ```bash
   SEED_CLERK_ORG_ID=org_yourrealid bun run seed
   ```
   `DATABASE_URL` must be available, either in `packages/database/.env` or the
   shell environment.

5. **Start the development servers:**
   ```bash
   bun run dev
   ```
   This uses Turbo to spin up all applications concurrently.

### Testing and quality

Team Calendar uses co-located tests and strict linting to maintain code quality:

- **Run all tests:**
  ```bash
  bun run test
  ```
- **Run specific tests:**
  ```bash
  bunx vitest run packages/feeds
  ```
- **Linting and formatting:**
  ```bash
  bun run check
  bun run fix
  ```

## Deploying to Vercel (Hobby)

Team Calendar deploys as three Vercel projects, one per deployable app. This fits the Vercel Hobby three-project limit, so `docs` and `email` are not deployed (`email` is a dev-only preview surface and `docs` is published separately). Each app already carries its own `vercel.json`.

| Vercel project | Root directory | Notes |
|---|---|---|
| `app` | `apps/app` | Authenticated product UI |
| `api` | `apps/api` | Xero OAuth, sync, feeds (`/ical/:token.ics`), SSE, Inngest handler. Runs a daily cron on `/cron/keep-alive` (see `apps/api/vercel.json`). |
| `web` | `apps/web` | Public marketing site |
| `docs` | not deployed | Mintlify docs, published outside Vercel |
| `email` | not deployed | React Email dev preview only |

Set the Root Directory for each project to the relevant `apps/*` folder. Turborepo builds the dependent packages automatically.

### Required environment per project

Copy each app's `.env.example` for the full, annotated list. Optional variables that carry a format constraint (a URL, an email, or a required prefix) are commented out in the examples: an empty string fails validation, so leave them absent rather than set to `""`. The minimum each project needs in production:

- **`app`**: `DATABASE_URL`, `XERO_TOKEN_ENCRYPTION_KEY`, Clerk keys (`CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`), the public URLs (`NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_WEB_URL`), and, to enable feed caching, both `KV_REST_API_URL` and `KV_REST_API_TOKEN`.
- **`api`**: everything `app` needs plus the Xero OAuth credentials (`XERO_CLIENT_ID`, `XERO_CLIENT_SECRET`), the Inngest keys (`INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY`, required together), and the KV pair for feed caching. `GITHUB_TOKEN`/`GITHUB_OWNER`/`GITHUB_REPO` are api-only and optional.
- **`web`**: the public URLs plus optional Resend and observability values. It does not need the database, Clerk, Xero, Inngest, or KV variables.

`KV_REST_API_URL`/`KV_REST_API_TOKEN` and `INNGEST_EVENT_KEY`/`INNGEST_SIGNING_KEY` are validated as pairs: setting one without the other fails fast at boot rather than silently disabling caching or leaving jobs unsigned.

`XERO_TOKEN_ENCRYPTION_KEY` (32 bytes, base64-encoded) is validated on startup in `packages/xero`. An absent or malformed key prevents the application from starting rather than failing later at token access time.

### GitHub-backed support submissions

If you enable GitHub-backed support submissions in deployed environments, configure `GITHUB_TOKEN`, `GITHUB_OWNER`, and `GITHUB_REPO` on the `api` project only. These values are server-side and must not be added to the `app` or `web` deployments. Set them in both Preview and Production if the feature should work in both, and redeploy the API app after changing them.

### Xero OAuth callback on preview deployments

Xero requires every OAuth redirect URI to be pre-registered on the Xero app, and preview deployments get a fresh, unregistered URL. Team Calendar therefore registers a single production callback and disables Xero connect on preview deployments:

- Register `https://<your-api-domain>/api/xero/oauth/callback` as the redirect URI on the Xero app and set `XERO_REDIRECT_URI` to that exact URL on the `api` (and `app`) projects for every environment. If `XERO_REDIRECT_URI` is unset, the callback is derived from `NEXT_PUBLIC_API_URL` instead.
- On preview deployments (`VERCEL_ENV=preview`) the Xero connect flow and the callback route are gated off and return a clear message. Connect Xero from the production deployment.
