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

Approved leave and manual entries are published through Team Calendar's feeds. Outlook, Google Calendar and Apple Calendar fetch updates on their own polling schedules, so changes may appear later in subscribed calendars.

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

Outbound writes are synchronous; feed publication and cache rebuilds follow successful changes. Inbound Xero sync is pull-first and periodic, since Xero provides no leave webhooks. External calendar refresh timing is controlled by each calendar provider.

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

- [Bun](https://bun.sh/) at the version pinned in root `packageManager` (also used by CI)
- Node.js 22 or 24 and later, matching root `engines`
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
   bun run migrate:deploy
   ```

   This applies the committed migration chain. Use `bun run migrate` when developing a schema change; `db:push` is only for disposable development databases and is not release verification.

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
   This starts all applications through Turbo and the local Inngest Dev Server.
   Inngest discovers the API handler at `http://localhost:3002/api/inngest` and
   exposes its local dashboard at `http://localhost:8288`. Keep
   `INNGEST_DEV="1"` in `apps/api/.env.local` so locally dispatched sync events
   are sent to that server instead of Inngest Cloud.

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

## Deploying to Vercel

Team Calendar deploys as three Vercel projects, one per deployable app. Each carries its own `vercel.json`. `email` is a development preview workspace. `apps/docs` retains the Mintlify starter and validation tooling; this repository does not establish a published documentation deployment. Customer help is implemented in `apps/web` at `/help-centre`.

| Vercel project | Root directory | Notes |
|---|---|---|
| `app` | `apps/app` | Authenticated product UI |
| `api` | `apps/api` | Xero OAuth, sync, feeds (`/ical/:token.ics`), SSE, Inngest handler. Runs a daily cron on `/cron/keep-alive` (see `apps/api/vercel.json`). |
| `web` | `apps/web` | Public marketing site |
| `docs` | no deployment configured | Retained Mintlify starter tooling |
| `email` | not deployed | React Email dev preview only |

Set the Root Directory for each project to the relevant `apps/*` folder. Turborepo builds the dependent packages automatically.

### Required environment per project and launch mode

Each project requires `NEXT_PUBLIC_LAUNCH_MODE` to be set explicitly to `early_access` or `paid` in production.

#### Production environment matrix

| Variable | Scope | `early_access` requirement | `paid` mode requirement |
|---|---|---|---|
| `NEXT_PUBLIC_LAUNCH_MODE` | All apps | Required (`early_access`) | Required (`paid`) |
| `NEXT_PUBLIC_APP_URL` | All apps | Required (URL) | Required (URL) |
| `NEXT_PUBLIC_WEB_URL` | All apps | Required (URL) | Required (URL) |
| `NEXT_PUBLIC_API_URL` | All apps | Required (URL) | Required (URL) |
| `NEXT_PUBLIC_SENTRY_DSN` | All apps | Required (URL) | Required (URL) |
| `SENTRY_ORG` / `SENTRY_PROJECT` / `SENTRY_AUTH_TOKEN` | All apps | Required for source-map upload | Required for source-map upload |
| `DATABASE_URL` | `app`, `api` | Required | Required |
| `XERO_TOKEN_ENCRYPTION_KEY` | `app`, `api` | Required | Required |
| `XERO_CLIENT_ID` / `XERO_CLIENT_SECRET` | `app`, `api` | Required | Required |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY` | `app`, `api` | Required | Required |
| `CLERK_WEBHOOK_SECRET` | `api` | Required | Required |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | `app`, `api` | Required pair | Required pair |
| `INNGEST_EVENT_KEY` / `INNGEST_SIGNING_KEY` | `api` | Required pair | Required pair |
| `RESEND_TOKEN` / `RESEND_FROM` | `api` | Required | Required |
| `EARLY_ACCESS_APPLICATION_RECIPIENT` | `api` | Required private mailbox | Required private mailbox |
| `SUPPORT_EMAIL` (or `NEXT_PUBLIC_SUPPORT_EMAIL` / `RESEND_FROM`) | `web` | Optional email override (defaults to `support@teamcalendar.online`) | Optional email override (defaults to `support@teamcalendar.online`) |
| `BETTERSTACK_API_KEY` / `BETTERSTACK_STATUS_PAGE_ID` / `BETTERSTACK_STATUS_PAGE_URL` | `web` | Optional complete trio (status is Unknown when absent) | Optional complete trio (status is Unknown when absent) |
| `STRIPE_SECRET_KEY` | `app`, `api` | Optional (disabled) | Required |
| `STRIPE_WEBHOOK_SECRET` | `api` | Optional (disabled) | Required |
| `STRIPE_PRICE_BASIC` / `STRIPE_PRICE_PREMIUM` | `app`, `api` | Optional (disabled) | Required |
| `STRIPE_PORTAL_RETURN_URL` | `app`, `api` | Optional (disabled) | Required |

#### Operator preflight command

Before deploying any application, run the production preflight check:

```bash
bun run preflight app
bun run preflight api
bun run preflight web
```

The rows marked required in the matrix above are the canonical production
minimum enforced by `runProductionPreflight`. Copy each app's `.env.example`
for the full, annotated list. Optional variables that carry a format constraint
(a URL, an email, or a required prefix) are commented out in the examples: an
empty string fails validation, so leave them absent rather than set to `""`.

Run each command after securely pulling that project's production environment.
The optional mode argument is an assertion against `NEXT_PUBLIC_LAUNCH_MODE`;
it never supplies or overrides the deployed value. Run each project separately,
rather than combining all three projects' environments.

The API requires the runtime's `RESEND_TOKEN` name, a valid `RESEND_FROM`, and a
private `EARLY_ACCESS_APPLICATION_RECIPIENT`. The web app uses `SUPPORT_EMAIL`,
then `NEXT_PUBLIC_SUPPORT_EMAIL`, then `RESEND_FROM`, and
finally `support@teamcalendar.online`; any configured value must be a valid
email address. Required credential pairs must be complete: setting only one of
`KV_REST_API_URL`/`KV_REST_API_TOKEN` or
`INNGEST_EVENT_KEY`/`INNGEST_SIGNING_KEY` fails preflight.

GitHub-backed support settings remain optional and API-only. The web project
does not need database, Clerk, Xero, Inngest, or KV variables. To publish live
service health, configure the optional Better Stack API key, status-page ID,
and HTTPS public status-page URL together. The Better Stack page must contain
exactly five public resources named `App access`, `Xero connection and
synchronisation`, `Calendar feed delivery`, `In-app notifications`, and `Email
notifications`. If the trio or a required resource is absent, `/status` reports
Unknown rather than assuming the service is operational.

`XERO_TOKEN_ENCRYPTION_KEY` (32 bytes, base64-encoded) is validated on startup in `packages/xero`. An absent or malformed key prevents the application from starting rather than failing later at token access time.

### Maintained browser release suite

`bun run test:release` runs the Playwright release journeys against three
explicit HTTPS candidate deployments. It requires `TC_APP_CANDIDATE_URL`,
`TC_API_CANDIDATE_URL`, `TC_WEB_CANDIDATE_URL`,
`TC_DEPLOYED_CANDIDATE_SHA`, and the D1 `TC_RELEASE_MANIFEST`. The manifest,
deployed SHA assertion, and local checkout must identify the same commit.

Provide Clerk test-instance keys plus `TC_E2E_OWNER_EMAIL`,
`TC_E2E_ADMIN_EMAIL`, `TC_E2E_MANAGER_EMAIL`, and `TC_E2E_VIEWER_EMAIL` for
isolated role sessions. Controlled fixture inputs are
`TC_E2E_APPROVE_EMPLOYEE_NAME`, `TC_E2E_DECLINE_EMPLOYEE_NAME`,
`TC_E2E_FOREIGN_PERSON_ID`, `TC_E2E_FEED_ID`,
`TC_E2E_RECOVERY_PERSON_ID`, `TC_E2E_RETRY_PERSON_ID`, and
`TC_E2E_CALENDAR_EVENT_LABEL`. Missing inputs fail the mandatory journey rather
than skipping it. The suite runs cleanup from the protected manifest even after
test failure and fails if owned residue remains.

Use Clerk development/test credentials and controlled Xero organisations only.
The suite does not mock authentication or provider success.

```bash
PLAYWRIGHT_BROWSERS_PATH=/tmp/teamcalendar-playwright bun run test:release
```

### GitHub-backed support submissions

If you enable GitHub-backed support submissions in deployed environments, configure `GITHUB_TOKEN`, `GITHUB_OWNER`, and `GITHUB_REPO` on the `api` project only. These values are server-side and must not be added to the `app` or `web` deployments. Set them in both Preview and Production if the feature should work in both, and redeploy the API app after changing them.

### Xero OAuth callback on preview deployments

Xero requires every OAuth redirect URI to be pre-registered on the Xero app, and preview deployments get a fresh, unregistered URL. Team Calendar therefore registers a single production callback and disables Xero connect on preview deployments:

- Register `https://<your-api-domain>/api/xero/oauth/callback` as the redirect URI on the Xero app and set `XERO_REDIRECT_URI` to that exact URL on the `api` (and `app`) projects for every environment. If `XERO_REDIRECT_URI` is unset, the callback is derived from `NEXT_PUBLIC_API_URL` instead.
- On preview deployments (`VERCEL_ENV=preview`) the Xero connect flow and the callback route are gated off and return a clear message. Connect Xero from the production deployment.

### AU early access applications

The public application, private-mailbox retention rule, and separate Clerk owner-admission runbook are documented in [docs/early-access-admission.md](docs/early-access-admission.md). The API requires `EARLY_ACCESS_APPLICATION_RECIPIENT` and a private `EARLY_ACCESS_APPLICATION_HMAC_SECRET` of at least 32 characters, plus the configured KV pair used for abuse controls and retry receipts.
