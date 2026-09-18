# Team Calendar Go-Live Readiness Report

Date: 18 September 2026

Region: Australia

Decision: **NOT READY FOR GO-LIVE**

## 1. Release candidate

| Item | Evidence |
| --- | --- |
| Branch | Local `main` candidate; remote `origin/main` was not changed |
| Tested source SHA | `822a7c659509765df7be9fb99f22abce3d798b7a` |
| Tested source tree | `495eaa762ffc7eb85f4e65951f5bd30eee20b9ee` |
| Documentation context | `17c34db41d51c47b20d0323222e77e7d0d541ee2` |
| Repository version | 6.0.2 |
| Runtime and tools | Bun 1.4.0; Next.js 16.3.5; React 19.3.0; Prisma 7.10.0; TypeScript 7.0.2; Vitest 5.0.1 |
| Launch mode | Unconfigured in production, therefore not inferred from the application fallback |
| Launch scope | Australian Xero Payroll only; English; app, API and public web |
| Remote actions | No Git push, remote merge or production deployment performed |

The source candidate passed the automated repository gates recorded below. The
documentation commits that follow it reconcile plans and evidence only; they do
not substitute a newly tested application candidate.

## 2. Decision

**NOT READY FOR GO-LIVE**

Mandatory release evidence is missing or failing. All three production
preflights fail, the production launch mode is unset, the latest app and web
deployments are in error, and fresh-database construction, authenticated role
journeys, physical browser coverage, outbound AU Xero writes and external
credential-history remediation are not verified. Passing builds and automated
tests cannot waive those gates.

The latest production app and web deployments are `Error` because the Better
Stack configuration is only partially populated. The latest API deployment is
`Ready`, but its logs warn that Better Stack logging variables are not detected
and that the Sentry authentication token is absent, so source maps were not
uploaded. These deployments do not represent a healthy candidate release.

## 3. Repository reconciliation

- `main` is the current local and remote default branch. Historical `preview`
  branch references remain historical; the branch was not recreated.
- Vercel Preview behaviour remains distinct, including the existing
  `VERCEL_ENV=preview` Xero OAuth restriction.
- Plans 144 through 152 and 154 through 158 are recorded as completed source
  remediation. Plan 153 remains blocked pending the actual launch-mode decision.
- CI retains frozen installation, generation, build, typecheck, boundary,
  migration, drift, unit and integration gates.
- Production environment guidance, Mint tooling and the active plan/task ledger
  were reconciled with the executable contracts.

## 4. Implementation and advisor execution

The go-live work integrated fixes for partial manual availability updates,
serialised Xero leave writes, required decline reasons, Svix webhook
verification, owner protection, OAuth return destinations, active feed-token
uniqueness, authoritative plan limits, identity provisioning coverage, support
submission rate limits, production environment guidance, marketing navigation
accessibility and settings control naming.

The deep advisor audit was reconciled into focused plans, executed in isolated
worktrees and reviewed before local integration. Impeccable guided the interface
changes and its detector reported no remaining findings in the changed UI.
Temporary implementation worktrees were used locally. No isolated source fix is
being presented as deployed production state.

Plan 153 is conditional: it is a P1 for a paid launch because parallel Stripe
subscriptions must be prevented, and a non-blocking P2 for closed early access.
Because production does not configure `NEXT_PUBLIC_LAUNCH_MODE`, the conditional
scope cannot be resolved and the release remains blocked.

## 5. Dependencies and runtime

Stable dependency and runtime updates were reconciled in the manifests and
lockfile. The final verified versions include Bun 1.4.0, Next.js 16.3.5, React
19.3.0, Prisma 7.10.0, TypeScript 7.0.2 and Vitest 5.0.1. Prerelease Prisma 8
was not adopted. Root overrides and the existing `next-themes` patch remain
explicit and reproducible. `bun install --frozen-lockfile` passed without
changing the lockfile.

## 6. Database and migrations

The configured Neon database contains valuable existing organisation, people,
Xero, availability and feed data, so no destructive reset or rebaseline was
justified or performed. Prisma reports 12 committed migrations applied, the
configured schema current and zero drift. Database client generation passed.

An independent fresh PostgreSQL instance was not available. Construction of an
empty database from the complete committed migration chain and its independent
zero-drift check are therefore **NOT VERIFIED**. This is a mandatory release
gate.

## 7. Remediation summary

| Area | Integrated outcome |
| --- | --- |
| Framework and CI | Stable runtime/dependency alignment, generated-route validation and preserved layered CI gates |
| Availability and Xero | Correct partial update contract, shared outbound write claims and consistent decline-reason enforcement |
| Authentication and tenancy | Safe Svix payload handling, owner protection, OAuth return restriction and direct provisioning tests |
| Feeds and billing | One active feed token, authoritative plan-limit counts and accurate production guidance |
| UI and accessibility | Shared marketing skip target, mobile Escape focus return, named settings groups and accessible recurrence targets |
| Operations | Support issue rate limiting, Mint validation tooling and executable environment documentation |
| Security | Source findings remediated; external credential-history actions remain unverified |
| Performance | Five lower-priority query and bundle items are deferred and listed below |

## 8. Verification matrix

`PASS` means the stated command or scenario ran against the recorded source
candidate. `NOT VERIFIED` means the complete release requirement was not proven,
even where automated subcomponents passed.

| Gate | Result | Evidence |
| --- | --- | --- |
| Dependency audit and frozen install | PASS | Stable dependency review completed; `bun install --frozen-lockfile` passed |
| Database client build | PASS | `bun run --cwd packages/database build` passed |
| Repository check | PASS | 933 files checked with no findings |
| Production build | PASS | App, API and web builds passed; Sentry deprecation and absent Better Stack warnings were non-blocking locally |
| TypeScript | PASS | 19 of 19 tasks passed |
| Package boundaries | PASS | 946 files checked with no boundary violations |
| Unit tests | PASS | 17 of 17 tasks passed; app reported 548 passed and two skipped, and those two authoritative database tests passed separately, 2 of 2, with the configured environment |
| Integration tests | PASS | 5 of 5 packages passed: database 27, availability 17, feeds 15, jobs 65, Xero 5 passed with two credential-bound checks skipped |
| Configured Neon migration deploy | PASS | 12 migrations applied; schema current |
| Configured Neon schema drift | PASS | Zero drift |
| Empty-database migration | NOT VERIFIED | No independent fresh PostgreSQL instance was available |
| Empty-database schema drift | NOT VERIFIED | Depends on the missing fresh-database proof |
| App production preflight | FAIL | Missing `NEXT_PUBLIC_LAUNCH_MODE`, `NEXT_PUBLIC_SENTRY_DSN` and the complete KV URL/token pair |
| API production preflight | FAIL | Missing launch mode, Sentry DSN, KV pair, `CLERK_WEBHOOK_SECRET` and the Inngest event/signing pair |
| Web production preflight | FAIL | Missing launch mode and Sentry DSN |
| App production runtime | NOT VERIFIED | Candidate was built but not served and exercised with production configuration |
| API production runtime | NOT VERIFIED | Candidate was built but not served and exercised with production configuration |
| Web production runtime | PASS | Local production build served HTTP 200 |
| Physical browser matrix | NOT VERIFIED | Agent browser stalled after launching Chromium; no reliable viewport, theme, console or network matrix was captured |
| Employee, manager, admin and owner E2E | NOT VERIFIED | No authenticated role matrix completed |
| Authentication and membership | NOT VERIFIED | Automated provisioning coverage passed; production sign-in, recovery and membership journeys were not exercised |
| Tenant isolation and authorisation | NOT VERIFIED | Automated suites passed; live cross-tenant and multi-organisation role scenarios were not completed |
| AU Xero sync | PASS | Recent live people, leave and balance runs reached succeeded terminal state |
| AU Xero write-back | NOT VERIFIED | Submit, approve, decline and withdraw were not exercised because no safe test tenant was established |
| ICS feeds and cache | NOT VERIFIED | Automated feed suites passed; production cache, subscription clients and full lifecycle browser paths were not exercised |
| Inngest | NOT VERIFIED | Jobs suite passed and live Xero sync jobs succeeded; every registered production function was not exercised |
| Notifications, SSE and email dispatch | NOT VERIFIED | Automated source coverage passed; production recipient isolation and delivery were not exercised |
| Public holidays | NOT VERIFIED | No complete production-source and projection workflow was captured |
| Billing | FAIL | Production launch mode is absent; paid mode also requires Plan 153 subscription hardening |
| Security and observability | FAIL | External credential remediation is unverified; app/web deployment configuration is broken and Sentry/Better Stack production coverage is incomplete |
| Accessibility | NOT VERIFIED | Source remediation, focused tests and Impeccable checks passed; physical keyboard, screen-reader and zoom coverage did not complete |
| Responsive UI, light and dark | NOT VERIFIED | Physical viewport and theme matrix did not complete |
| Browser console and network | NOT VERIFIED | Chromium automation stalled before reliable evidence collection |
| Public website | NOT VERIFIED | Build, unit tests and local HTTP 200 passed; route, link and browser validation did not complete |
| Docs validation | PASS | Mint documentation lint passed |
| Email templates | PASS | React Email build passed |
| Documentation reconciliation | PASS | Plans, environment guidance and release records were reconciled |
| Final improve review | PASS | Deep audit findings were triaged and the source remediation queue was reconciled |
| Final Impeccable review | PASS | Changed interface source and focused interaction tests passed with no detector findings |

## 9. Outstanding issues

| Severity | Area | Issue and impact | Next action | AU blocker |
| --- | --- | --- | --- | --- |
| P1 | Production configuration | App, API and web preflights fail on required launch, monitoring, cache, webhook and job configuration | Configure each Vercel project, select launch mode and rerun all three preflights | Yes |
| P1 | Deployment | Latest production app and web deployments are `Error` because Better Stack configuration is partial | Complete or remove the partial Better Stack trio, deploy the candidate and inspect build/runtime logs | Yes |
| P1 | Database safety | Fresh empty-database migration and independent drift proof are missing | Run the committed migration chain against isolated PostgreSQL 16 and verify zero drift | Yes |
| P1 | Browser and roles | Physical browser, authenticated roles, console/network and recovery paths are unverified | Run the required engine, viewport, theme and employee/manager/admin/owner matrix | Yes |
| P1 | Xero writes | Live submit, approve, decline and withdraw evidence is absent | Establish an authorised safe AU test tenant and exercise success and failure paths | Yes |
| P1 | Security | Credential rotation, retained GitHub reference purge and fresh mirror audit are unverified | Complete the operator actions and retain non-secret evidence | Yes |
| P1/P2 conditional | Billing | Plan 153 is P1 for paid launch and P2 for closed early access; launch mode is unset | Configure `early_access` or complete paid subscription hardening before selecting `paid` | Yes while unset |
| P2 | Performance | Plans listing performs N+1 or unbounded reads | Add bounded aggregate queries and verify representative account sizes | No |
| P2 | Performance | Sync detail eagerly loads raw failure data | Load summaries first and fetch raw detail only on demand | No |
| P2 | Web bundle | Public web loads Clerk client code | Isolate authentication links from the public bundle where practical | No |
| P2 | Analytics | PostHog is initialised eagerly | Defer non-critical analytics initialisation and measure bundle/runtime impact | No |
| P2 | People | Status pagination is performed in memory | Move filtering and pagination into the scoped database query | No |

## 10. External constraints

- No safe AU Xero tenant was established for destructive or payroll-affecting
  write-back testing.
- Agent-browser launched Chromium but stalled, so no physical browser evidence
  is claimed.
- Fresh PostgreSQL infrastructure was unavailable for independent migration
  construction.
- Credential rotation and GitHub Support removal of retained pull-request refs
  and cached commit views require operator and provider action.
- Production configuration values and provider permissions were inspected only
  by name and status; no secret values are recorded here.

## 11. Deferred scope

New Zealand and United Kingdom Xero activation remain outside the Australian
launch. Their adapters and compatibility tests remain in place, but activation
requires named live environments and, for the UK, partner permission. Other
future connectors and product extensions remain outside this decision.

The five P2 performance items in the outstanding-issues table are deferred
because no measured launch failure was established. They do not waive any P1
or mandatory verification gate.

## 12. Operator actions

1. Choose and configure the production launch mode. If `paid`, complete Plan
   153 before launch; if `early_access`, record that decision explicitly.
2. Configure all required app/API/web environment variables, including complete
   Better Stack groups, Sentry, KV, Clerk webhook and Inngest values, then rerun
   preflight without exposing values.
3. Push the reviewed commits only after approval, deploy app/API/web, verify the
   resulting Vercel deployment logs and confirm source-map and monitoring health.
4. Run PostgreSQL 16 empty-database migration and drift proof from the committed
   chain.
5. Establish safe Clerk organisations, role accounts and an authorised AU Xero
   test tenant; complete browser, tenancy, provider, feed, notification and
   billing journeys.
6. Verify credential rotation, obtain the GitHub Support purge, then audit a
   fresh remote mirror.
7. Confirm Neon, Clerk, Xero, Inngest, Resend, Sentry, Stripe when applicable,
   Better Stack and DNS configuration after deployment.

## 13. Final repository state

The tested application source is commit `822a7c659509765df7be9fb99f22abce3d798b7a`
with tree `495eaa762ffc7eb85f4e65951f5bd30eee20b9ee`.
Documentation was reconciled at `17c34db41d51c47b20d0323222e77e7d0d541ee2`
before this report. Manifests and `bun.lock` passed frozen installation; source
build, check, typecheck, boundaries, unit, integration, configured migration,
docs and email gates passed as recorded.

The source audit queue has no unresolved unconditional P0 finding. Unresolved
P1 release conditions remain in production configuration, deployment,
fresh-database proof, physical browser and role verification, live Xero
write-back and external security evidence. Task-owned work was integrated
locally; nothing was pushed or deployed remotely.

## 14. Final statement

The exact tested candidate is **NOT READY FOR GO-LIVE** for its first Australian
production deployment. Automated source quality is strong, but mandatory
production configuration, database construction, browser/role, provider-write
and security evidence must be completed before a ready decision is possible.
