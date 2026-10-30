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
| Outbound | Synchronous, user-triggered API write | AU submission stays local; approval creates scheduled leave. Imported requested leave uses approve/reject; supported remote withdrawal uses reject. No background queue. Failures surfaced inline. |

Outbound writes are synchronous; feed publication and cache rebuilds follow successful changes. Inbound Xero sync is pull-first and periodic, since Xero provides no leave webhooks. External calendar refresh timing is controlled by each calendar provider.

Xero consent requests exactly `offline_access accounting.settings.read payroll.employees payroll.settings.read`. One persisted full initial import covers people, leave and the complete balance roster. AU scheduled people/leave deltas use provider watermarks with a two-minute overlap; manual and nightly reconciliation are full reads. Balance polling remains provider-derived and rolling hourly.

Remote leave mutations reuse a durable UUID idempotency key for five minutes from first dispatch. Uncertain writes after that boundary require provider inspection and administrator recovery. Disconnect removes the selected remote connection before committing local teardown; failed or uncertain deletion preserves retryable state and sibling connections.

Xero calls use small shared, atomic Redis quota counters and expiring concurrency leases across serverless app, API and job workers. They enforce the five-request tenant concurrency limit and documented tenant/app quotas; lease expiry restores capacity after a worker crash. Keys initialise on first use, with no namespace bootstrap. Store failures deny calls as infrastructure failures; provider 429 responses remain separate and retain retry guidance even when their bodies are unreadable. Fixture namespaces isolate tests only.

The [HTTP simplification follow-up](docs/reports/2026-10-08-xero-http-follow-up.md) records the retained-control requirements and current verification.

## Covers everyone who affects cover, not just payroll

Team Calendar is built for the whole team, not only the people on the pay run. Employees on Xero Payroll get the two-way sync and leave balances. Contractors, directors, and advisors who never appear in payroll can still be added by hand, so their availability shows on the same calendar as everyone else, without touching a pay run. Every entry is labelled by where it came from: synced from Xero, or added manually.

## Built for groups too

Team Calendar is multi-tenant by design. A small business that grows into several payroll entities (each with its own Xero file) can run them under one Account, with strict isolation between entities and role-based access for owners, admins, managers, and viewers.

The tenancy boundary is the Account. Each payroll entity within it owns at most one Xero connection to an external payroll file. Canonical encrypted credentials belong to one verified Xero user/app authorisation, which may support several scoped connections. One Account maps to exactly one country code.

## Tech stack

Team Calendar is a Turborepo monorepo built on modern serverless primitives:

- **Framework:** Next.js (App Router) on next-forge
- **Runtime and package manager:** Bun
- **Database:** PostgreSQL (Neon serverless) via Prisma 7 with `@prisma/adapter-neon`
- **Authentication:** Self-hosted Better Auth behind `packages/auth`
- **Background jobs:** Inngest (durable execution for sync, reconciliation, and feed rebuilds)
- **Caching:** Vercel KV (Redis-compatible feed and ETag caching)
- **Email:** Resend with React Email
- **Monitoring:** Sentry
- **ICS generation:** ical-generator
- **Deployment:** Vercel
- **Testing and quality:** Vitest, Biome 2, and Ultracite

## Roadmap

Slack and Teams notifications, HTML calendar views, and additional payroll connectors (MYOB, Zoho People, QuickBooks) are out of scope for the initial build. Team Calendar implements Xero directly. A future connector requires its own reviewed design; the current implementation does not introduce a multi-provider abstraction.

## Current status

Team Calendar is under active development and pre-launch. Core infrastructure, provider-neutral Account tenancy, the Prisma schema, and domain boundaries are established. Xero synchronisation, the leave submission and approval workflow with synchronous write-back, and the canonical ICS feed projection engine are implemented in their respective domain packages. Launch scope is AU-only, English-only, core loop. Current-candidate architecture, verification and review rulings are recorded in the [final Xero audit](docs/reports/2026-10-07-xero-final-architecture-audit.md) and `tasks/todo.md`. Live provider, browser and deployment evidence is recorded separately from source checks.

Authentication and cookie-session API transport run with Better Auth (`AUTH_CONTEXT_MODE=local` on `app`, `remote` on `api`). Public signup creates an AU Account owned by the new user; invitation signup joins its addressed Account. See the [auth migration design](docs/auth-migration/02-design.md).

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
- Better Auth secret and separate Google, Microsoft and Xero sign-in credentials from `apps/app/.env.example`
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
   Fill in `DATABASE_URL`, `DATABASE_APP_URL`, `BETTER_AUTH_SECRET`, and `BETTER_AUTH_URL` as a minimum. `app` and `api` also need the same `XERO_TOKEN_ENCRYPTION_KEY`; generate one with `openssl rand -base64 32`. Copy `packages/database/.env.example` to `packages/database/.env` for migrations and seeding.

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

   Supply `DATABASE_URL` and `DATABASE_APP_URL` for the same development database,
   with distinct owner and restricted roles, plus `SEED_AUTH_PASSWORD` (12 to 128
   characters) through a private environment file or secret manager. Then run:

   ```bash
   bun run --cwd packages/auth seed
   ```

   This creates three separate Better Auth test Accounts (AU, NZ and UK), each
   with an owner, admin, manager and viewer. Each Account gets a country-matching
   payroll Organisation, domain team, location and four linked People. Fixture
   email addresses are `owner.au@teamcalendar.test`, `admin.au@teamcalendar.test`,
   `manager.au@teamcalendar.test`, `viewer.au@teamcalendar.test`, with `.nz` and
   `.uk` equivalents. All use the supplied test password. The seed uses native
   Better Auth APIs for identities, membership and verification, sends no real
   mail, and creates no Xero connection or token. Public signup and payroll
   onboarding remain AU-only.

   Re-running with the same password reuses the owned fixtures; foreign fixtures
   and a changed password are refused. `SEED_ACCOUNT_ID` is no longer used by this
   entrypoint. The command refuses a production process. For named-branch reset,
   OAuth registration, role checks and restore procedures, see
   [the auth cutover runbook](docs/auth-migration/03-cutover.md).

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
| `DATABASE_APP_URL` | `app`, `api` | Required (restricted `team_calendar_app` URL) | Required (restricted `team_calendar_app` URL) |
| `XERO_TOKEN_ENCRYPTION_KEY` | `app`, `api` | Required | Required |
| `XERO_CLIENT_ID` / `XERO_CLIENT_SECRET` | `app`, `api` | Required | Required |
| `XERO_APP_TIER` / `XERO_REDIRECT_URI` | `app`, `api` | Required commercial allowance / registered HTTPS callback | Required commercial allowance / registered HTTPS callback |
| `AUTH_CONTEXT_MODE` | `app`, `api` | `local` on app, `remote` on API | `local` on app, `remote` on API |
| `BETTER_AUTH_SECRET` / `BETTER_AUTH_URL` | `app` | Required secret / exact app origin | Required secret / exact app origin |
| `JOB_IDENTITY_GENERATION` | `app`, `api` | Job queue identity generation fence (default `gen_v1`) | Job queue identity generation fence (default `gen_v1`) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | `app` | Required | Required |
| `MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET` / `MICROSOFT_TENANT_ID` | `app` | Required credentials / `organizations` tenant | Required credentials / `organizations` tenant |
| `XERO_AUTH_CLIENT_ID` / `XERO_AUTH_CLIENT_SECRET` | `app` | Required, separate from payroll credentials | Required, separate from payroll credentials |
| `BETTER_AUTH_INFRA_ENABLED` / `BETTER_AUTH_API_KEY` | `app` | Disabled by default pending residency review; key required only if enabled | Disabled by default pending residency review; key required only if enabled |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | `app`, `api` | Required pair | Required pair |
| `INNGEST_EVENT_KEY` / `INNGEST_SIGNING_KEY` | `api` | Required pair | Required pair |
| `RESEND_TOKEN` / `RESEND_FROM` | `app`, `api` | Required for auth and transactional mail | Required for auth and transactional mail |
| `EARLY_ACCESS_APPLICATION_RECIPIENT` | `api` | Required private mailbox | Required private mailbox |
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
private `EARLY_ACCESS_APPLICATION_RECIPIENT`. Required credential pairs must be complete: setting only one of
`KV_REST_API_URL`/`KV_REST_API_TOKEN` or
`INNGEST_EVENT_KEY`/`INNGEST_SIGNING_KEY` fails preflight.

GitHub-backed support settings remain optional and API-only. The web project
does not need database, Better Auth, Xero, Inngest, or KV variables. To publish live
service health, configure the optional Better Stack API key, status-page ID,
and HTTPS public status-page URL together. The Better Stack page must contain
exactly five public resources named `App access`, `Xero connection and
synchronisation`, `Calendar feed delivery`, `In-app notifications`, and `Email
notifications`. If the trio or a required resource is absent, `/status` reports
Unknown rather than assuming the service is operational.

For versioned encrypted envelopes, configure `XERO_TOKEN_ENCRYPTION_ACTIVE_VERSION` and the server-only `XERO_TOKEN_ENCRYPTION_KEYS_JSON` key map as specified in each app's example. Preserve every key still referenced by canonical authorisations. Never print the key map.

`XERO_TOKEN_ENCRYPTION_KEY` (32 bytes, base64-encoded) is validated on startup in `packages/xero`. An absent or malformed key prevents the application from starting rather than failing later at token access time.

### Maintained browser release suite

`bun run test:release` runs the Playwright release journeys against three
explicit HTTPS candidate deployments. It requires `TC_APP_CANDIDATE_URL`,
`TC_API_CANDIDATE_URL`, `TC_WEB_CANDIDATE_URL`,
`TC_DEPLOYED_CANDIDATE_SHA`, and the D1 `TC_RELEASE_MANIFEST`. The manifest,
deployed SHA assertion, and local checkout must identify the same commit.

The browser release suite exercises the Better Auth authentication flow. It requires `TC_E2E_OWNER_EMAIL`,
`TC_E2E_ADMIN_EMAIL`, `TC_E2E_MANAGER_EMAIL`, and `TC_E2E_VIEWER_EMAIL` with configured credentials for
isolated role sessions. Controlled fixture inputs are
`TC_E2E_APPROVE_EMPLOYEE_NAME`, `TC_E2E_DECLINE_EMPLOYEE_NAME`,
`TC_E2E_FOREIGN_PERSON_ID`, `TC_E2E_FEED_ID`,
`TC_E2E_RECOVERY_PERSON_ID`, `TC_E2E_RETRY_PERSON_ID`, and
`TC_E2E_CALENDAR_EVENT_LABEL`. Missing inputs fail the mandatory journey rather
than skipping it. The suite runs cleanup from the protected manifest even after
test failure and fails if owned residue remains.

Use dedicated development/test credentials and controlled Xero organisations only.
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

The public application and private-mailbox retention rule are documented in [docs/early-access-admission.md](docs/early-access-admission.md). Better Auth owner admission follows public signup in the [auth migration design](docs/auth-migration/02-design.md); it does not require manual admission. The API requires `EARLY_ACCESS_APPLICATION_RECIPIENT` and a private `EARLY_ACCESS_APPLICATION_HMAC_SECRET` of at least 32 characters, plus the configured KV pair used for abuse controls and retry receipts.
