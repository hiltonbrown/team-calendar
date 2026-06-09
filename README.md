# LeaveSync

**One accurate view of who is off, who is out, and who is in. Synced straight from Xero.**

LeaveSync is the leave management and team availability platform for organisations that run payroll in Xero. Employees submit and manage leave inside LeaveSync; approvals write back to Xero Payroll in real time, so Xero stays the single source of truth for balances and accruals. Alongside approved leave, LeaveSync captures everyday out-of-office context (working from home, travelling, training, client site) and publishes one combined, privacy-controlled view to the calendars your team already uses: Outlook, Google Calendar, and Apple Calendar.

No more chasing who is in the office. No more leave requested by email and lost in an inbox. No more double entry between a calendar and your payroll system.

## The problem LeaveSync solves

Availability context is scattered. Approved annual leave sits in payroll. "Working from home" and "on a client site" live in chat threads and ad hoc calendar invites. Managers approve leave in one place, then re-key it somewhere else. The result is guesswork about who is actually available, and a payroll system that drifts out of step with reality.

LeaveSync closes the gap:

- **Submit and approve in one place.** Employees request leave in LeaveSync. Managers approve or decline. Approved leave writes back to Xero Payroll immediately, so balances and accruals stay correct without re-keying.
- **One calendar your team can trust.** Approved leave and manual out-of-office states combine into a single view, published as secure calendar feeds your team subscribes to once.
- **Privacy by default.** Choose how much each feed reveals: full detail, a neutral "out of office", or a simple "busy". Sensitive leave reasons are never exposed unless an admin chooses to.

## How it works

1. **Connect Xero.** LeaveSync links to your Xero Payroll file (AU, NZ, or UK) and syncs employees, leave records, and balances on a schedule.
2. **Manage leave.** Employees submit leave and log manual availability. Managers approve or decline. Approved decisions write straight back to Xero.
3. **Publish availability.** LeaveSync combines everything into a canonical view and serves it as secure, revocable ICS feeds with the privacy level you set.
4. **Stay informed.** In-app notifications and email keep employees and managers up to date on submissions, approvals, and sync health.

Xero remains the source of truth for balances. LeaveSync never calculates accruals; it reads them from Xero and writes approved leave back synchronously.

## Built for groups, not just single teams

LeaveSync is multi-tenant by design. A corporate group can run several payroll entities (each with its own Xero file) under one organisation, with strict isolation between entities and role-based access for owners, admins, managers, and viewers.

## Tech stack

LeaveSync is a Turborepo monorepo built on modern serverless primitives:

- **Framework:** Next.js (App Router) on next-forge
- **Runtime and package manager:** Bun
- **Database:** PostgreSQL (Neon serverless) via Prisma 7
- **Authentication:** Clerk (Organisations feature)
- **Background jobs:** Inngest (durable execution for sync, reconciliation, and feed rebuilds)
- **Caching:** Vercel KV (Redis-compatible feed and ETag caching)
- **Email:** Resend with React Email
- **Monitoring:** Sentry
- **Deployment:** Vercel
- **Testing and quality:** Vitest, Biome 2, and Ultracite

## Roadmap

The following are out of scope for the initial build and do not require structural change to add: Slack and Teams notifications, HTML calendar views, and additional payroll connectors (MYOB, Zoho People, QuickBooks). LeaveSync is deliberately Xero-only at this stage to deliver a flawless payroll-integrated experience before broadening.

## Current status

LeaveSync is under active development. Core infrastructure, Clerk multi-tenancy, the Prisma schema, and domain boundaries are established. Xero synchronisation, the leave submission and approval workflow with synchronous write-back, and the canonical ICS feed projection engine are implemented in their respective domain packages.

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
   This idempotently upserts a sample Australian Clerk Organisation: two payroll
   entities (organisations), their teams and locations, and a handful of people
   with a mix of Xero-sourced and manual records. Re-running creates no
   duplicates. The seed writes canonical data only; it never seeds Xero tokens or
   any other secret.

   Every seeded row is scoped to a `clerk_org_id`. By default this is the
   placeholder `org_dev_leavesync`. For the authenticated app to render the
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

### Vercel deployment notes

If you enable GitHub-backed support submissions in deployed environments, configure `GITHUB_TOKEN`, `GITHUB_OWNER`, and `GITHUB_REPO` on the `api` app in Vercel. These values are server-side only and should not be added to the `app` or `web` deployments.

Set the variables in both Preview and Production if the feature should work in both environments. Redeploy the API app after changing them so the updated configuration is picked up.

### Testing and quality

LeaveSync uses co-located tests and strict linting to maintain code quality:

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