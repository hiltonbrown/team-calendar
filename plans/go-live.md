# Team Calendar Australian go-live plan

Last reviewed: 18 September 2026.

Prepare the exact tested release candidate for the first Australian production
launch. The confirmed stack is Next.js on next-forge, Clerk Organisations,
Prisma and Neon PostgreSQL. This plan covers remediation, verification and the
release decision; it is not evidence that those activities have passed.

Repository: [hiltonbrown/team-calendar](https://github.com/hiltonbrown/team-calendar).
Track execution in [tasks/todo.md](../tasks/todo.md), focused remediation plans
in [plans/README.md](README.md), and historical evidence in
[tasks/archive.md](../tasks/archive.md).

## 1. Objective and execution boundaries

When instructed to execute this plan, discover the current state, upgrade,
audit, implement, verify, integrate completed work, refine UI, clean up and
produce the readiness report. Findings, plans or a successful build alone do
not complete execution. No Australian launch may proceed with an unresolved
P0/P1 or an unverified mandatory release gate.

Use authorisation already granted for the active implementation task. Complete
in-scope source/configuration changes, dependency and lockfile updates,
migrations, local branches/worktrees, commits, verified local merges, safe
temporary-resource cleanup, documentation, tests, browser automation and
production-like runtime checks without repeating approval requests for actions
already authorised.

Justified destructive remediation may be undertaken only against the configured
pre-production database under applicable existing authorisation. Establish the
current target, data value and integration state first, then follow section 7.
Do not treat an old pre-production label as permission to reset production.

Unless separately authorised, do not push remote Git changes, merge remote pull
requests, deploy to production, change unrelated provider resources or perform
irreversible actions against an established production environment. Local merge
authority does not imply remote push or deployment authority. Reviewing or
editing this plan does not authorise its execution.

## 2. Launch scope and architectural invariants

Verify the approved scope at execution time. The expected launch is Australian
Xero Payroll, English, the authenticated application and public website, with
leave submission/approval, manual availability, ICS feeds, notifications/email,
public holidays, analytics, sync health, audit and launch-mode billing.

Plans [108](108-activate-new-zealand-xero-sync.md) and
[109](109-activate-united-kingdom-xero-sync.md) describe future NZ/UK activation.
Reconcile their status, retain regional compatibility tests and adapters, and
do not activate those regions without an approved scope change. Deferred
regional activation does not block the Australian release.

Preserve these contracts from [AGENTS.md](../AGENTS.md) and
[PRODUCT.md](../PRODUCT.md):

- Xero is authoritative for payroll balances, accruals and Xero leave state.
  Team Calendar stores, displays and reconciles them; it does not calculate
  authoritative payroll accruals.
- `AvailabilityRecord` is the canonical model for Xero leave and manual
  availability. Xero payload shapes stay inside `packages/xero`.
- Database access belongs in `packages/database`; domain availability, feed
  publishing, notifications, jobs and shared UI remain in their respective
  `packages/availability`, `packages/feeds`, `packages/notifications`,
  `packages/jobs` and `packages/design-system` boundaries.
- Tenancy follows Clerk Organisation → Organisation → XeroConnection →
  XeroTenant. Enforce both `clerk_org_id` and applicable `organisation_id`
  boundaries. Resolve XeroTenant through the Organisation FK, never bare
  `clerk_org_id`; preserve connection and tenant uniqueness constraints.
- Clerk owns membership and roles. There is no custom workspace/membership
  table. One Clerk Organisation has one country code; personal accounts are
  disabled. Billing is anchored to the Clerk Organisation.
- Use App Router, Server Components by default and `apps/app/proxy.ts` for
  route protection. Preserve existing package boundaries and Tailwind v4
  conventions. Do not restore removed next-forge scaffold packages.
- Follow strict TypeScript, named exports, validated inputs, branded IDs and
  `Result` for expected service failures. Do not weaken repository conventions.

## 3. Current state, execution order and baseline

### Repository snapshot

The following facts were checked in local files on 18 September 2026. They are
source/configuration observations, not deployment or test results. Recheck them
when execution begins and record the final tested commit and working-tree state.

| Area | Current repository state | Release implication |
| --- | --- | --- |
| Git | Local `main` at `ee8c41094a841e4d2ac6a8d4493b2b8356069bb9`, with existing uncommitted dependency, CI, schema, generated-client and documentation changes. | Preserve and reconcile this work; the commit alone does not describe the candidate. |
| Version/runtime | Repository 6.0.2; `packageManager` is `bun@1.4.0`; Node engines are `22` or `>=24.0.0`. | Verify installed, CI and deployment runtimes before testing. |
| Declared framework/tooling | Next.js 16.3.5, React/React DOM 19.3.0, Prisma/client/adapters 7.10.0; TypeScript `^7.0.2`, Vitest `^5.0.1`. | These are current manifest declarations, not proof of installed versions, compatibility or latest stable releases. |
| Deployable apps | PRODUCT specifies app, API and web on Vercel. Docs is future developer/API documentation and is not deployed; email is a development/preview workspace. | Verify three production apps and validate maintained auxiliary tooling separately. |
| CI | Current workflow targets `main`, pins Bun from `package.json`, builds before typecheck and tests migration deployment/drift on PostgreSQL 16. | Preserve these guarantees and run equivalent candidate checks. |
| Launch mode | Code supports `early_access` and `paid`; the preflight requires an explicit valid mode. | Verify the actual deployment configuration; do not infer it from the runtime fallback. |
| Release evidence | Current task checklist still contains unfinished database, browser, provider and release gates. | No READY decision is established by this planning review. |

Sources: [root manifest](../package.json),
[database manifest](../packages/database/package.json),
[app manifest](../apps/app/package.json),
[CI workflow](../.github/workflows/ci.yml), [PRODUCT](../PRODUCT.md) and
[active tasks](../tasks/todo.md).

### Open remediation and carried-forward verification

Recheck each finding against the candidate before implementation. Current
source inspection still supports the three open implementation plans below.

| Work | Priority/status | Required outcome |
| --- | --- | --- |
| [144: manual availability PATCH](144-repair-manual-availability-patch-contract.md) | P1, open | Accept partial updates without requiring `personId`, preserve omitted privacy/feed fields, validate merged values, and return appropriate client errors. Couple route tests to the real service contract. |
| [145: outbound leave write claims](145-serialise-outbound-leave-state-writes.md) | P1, open | Acquire the shared scoped claim before every submit/approve/decline/withdraw provider mutation, enforce claim ownership and prove contention behaviour. Keep writes synchronous. |
| [146: required decline reason](146-make-decline-reason-policy-consistent.md) | P2, open | Remove the ineffective opt-out and enforce the same trimmed 3–1000-character requirement in action and service, including legacy settings. Use Impeccable for the settings UI. |
| Dependency/CI/schema edits | In progress, unverified here | Reconcile existing changes, generated output, migrations and lockfile before accepting any as release-ready. |
| Dashboard timeline and feed URL UI | Browser follow-up open | Verify desktop/mobile, light/dark and reduced-motion behaviour; cover full feed URL selection/copying, lifecycle states and clipboard-failure recovery. |
| Previously exposed credential | External security follow-up open | Verify rotation, obtain the required GitHub Support purge of retained references/cached views, then re-audit a fresh remote mirror. Record evidence and assess residual risk without exposing the credential. |
| Configured Neon and live AU workflows | Verification open | Prove migration integrity, zero drift, real provider execution and persisted downstream state. |

Plans 144 and 145 can proceed independently. Execute 146 after 145 because both
touch approval code. Outstanding security work is not presumed resolved by a
historical cleanup; any active exposed credential is release-blocking.

### Execution order

| Phase | Work | Exit condition |
| --- | --- | --- |
| 1 | Preserve current changes, inspect contracts, establish candidate/environment and baseline. | Reproducible inventory and explicit failures/unknowns. |
| 2 | Reconcile dependency/runtime/CI work and migration state. | Coherent install, generated client, schema and build/type/test baseline, with remaining defects identified. |
| 3 | Complete 144/145, then 146; reconcile the plan ledger and run the deep `improve` audit. Implement other verified AU-launch findings. | Reviewed changes integrated into the release candidate; no known unresolved P0/P1. |
| 4 | Verify configured Neon, independent empty-database migrations, tenancy, AU Xero, feeds/jobs and remaining product workflows. | Evidence for correctness, isolation, persistence and recovery. |
| 5 | Complete Impeccable, role-based browser, public-site, accessibility and production-like runtime reviews. | Critical user journeys and interface states verified. |
| 6 | Run final candidate gates, reviews and cleanup; reconcile documentation and report. | One evidence-based decision with operator actions and known issues. |

### Discovery and planning records

Read before implementation:

- `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `README.md`, `PRODUCT.md`, `SECURITY.md`,
  `DESIGN.md`, `.impeccable.md`, `ScreenCatalogue.md` and relevant architecture
  decisions.
- `plans/README.md`, active plans, `tasks/todo.md`, `tasks/archive.md` and
  `tasks/lessons.md`.
- Root and every workspace `package.json`, `bun.lock`, `turbo.json`,
  `skills-lock.json`, applicable agent hooks, installed skill instructions,
  Prisma schema and complete migration history.
- Environment validation schemas and examples, CI, Vercel configuration,
  scripts, routes, layouts/navigation, components, forms, Server Actions,
  API handlers, jobs, integrations, tests, generated files and outstanding
  TODOs/FIXMEs or temporary implementations.

Resolve skills through the active installed-skill mechanism. Historical paths
such as `agent/skills/improve/SKILL.md` and
`.claude/skills/next-forge/SKILL.md` are discovery hints, not assumptions about
what must be committed. Current Team Calendar decisions override scaffold
examples. Investigate conflicts between code and documentation before choosing
behaviour; preserve approved intent and correct established factual errors.

### Git and baseline evidence

Inspect before changing the release candidate:

```bash
git status
git branch --show-current
git rev-parse HEAD
git log --oneline -10
git remote -v
git branch -a
git worktree list
git fetch --prune
```

Record the current/default/release branches, local and remote branches,
ahead/behind state, worktrees and unrelated uncommitted work. Never force-reset
or discard user changes to obtain a clean tree.

Earlier records describe `main` as the only remote branch and the Git `preview`
branch as retired. Re-check this. If still retired, correct active execution
policies, task references and CI triggers without recreating it or rewriting
historical evidence. Preserve Vercel Preview behaviour, including
`VERCEL_ENV=preview` Xero OAuth restrictions.

Record branch, SHA, working-tree state, repository version, date, launch mode,
Bun, Node, `packageManager`, Next.js, React/React DOM, TypeScript, Prisma/client,
adapters, Neon driver, Turborepo, Clerk, Inngest and Sentry versions. Capture
baseline dependency, build, check, typecheck, unit/integration and migration
results. Historical versions and test runs are not current release evidence.

### Active records

- Maintain a checkable execution plan in `tasks/todo.md` and check in before
  implementation. Keep active work distinct from archived evidence.
- Reconcile DONE, REJECTED, BLOCKED, deferred and stale implementation plans;
  do not duplicate fixed or intentional findings.
- Preserve useful historical evidence in `tasks/archive.md` and the plan ledger.
- Update task progress and review results, and record reusable agent-error
  lessons in `tasks/lessons.md`, including after user corrections.

## 4. Audit, severity and implementation workflow

Use the installed `improve` skill for reconciliation, a deep technical audit,
implementation plans and final diff review. The advisor remains read-only on
application source. Cover incomplete behaviour, fragile state, duplicated logic,
architecture, validation, errors, performance, security, accessibility, test gaps
and technical debt that creates material launch risk.

| Severity | Meaning and treatment |
| --- | --- |
| P0 | Release-blocking tenant leakage, auth bypass, exploitable privilege escalation, secret exposure, data corruption, unsafe migrations, broken deployment or unusable critical workflow. Resolve before launch. |
| P1 | Serious functional, business-state, Xero, authorisation, security, configuration, runtime or critical-accessibility failure. Resolve before launch. |
| P2 | Material usability, consistency, performance, maintainability, operational or error-recovery issue. Implement go-live-relevant fixes where proportionate; document justified deferrals. |
| P3 | Minor polish or future enhancement. Document unless safely resolved with negligible scope. |

Implement all verified AU-launch P0/P1 findings and authorised go-live-relevant
P2 work. Do not ask the user to select findings already covered by the execution
scope. Reject duplicate, stale, fixed, intentional or out-of-scope findings.

For each implementation plan:

1. Use the required isolated feature branch/worktree, with the `codex/` branch
   prefix unless the user specifies otherwise. Reconcile older plan branch
   names with this convention before creation. Preserve unrelated changes.
2. Implement the complete plan, then run focused tests and its done criteria.
3. Inspect the full diff and run applicable repository gates. Obtain advisor
   review where supported; fix material findings and rerun affected checks.
4. Merge locally into the active release branch only when done criteria, tests,
   applicable gates and review pass, the diff has no unexplained scope, and no
   P0/P1 remains in that implementation.
5. If the target moved, reconcile changes/conflicts and rerun affected checks.
6. Verify the merged state, inspect `git status` and recent history, update
   records and safely remove completed temporary branches/worktrees.
7. Continue to the next plan. Do not leave verified implementation stranded in
   a worktree or treat an advisor approval as task completion.

Use focused subagents for independent research, analysis or implementation as
allowed by repository instructions. Keep ownership clear and review integrated
results. If evidence invalidates the plan, stop the affected approach and
re-plan instead of extending a workaround.

## 5. Dependencies, frameworks and runtimes

Audit every direct runtime/development dependency across root, apps, packages
and tooling, including peers, overrides, patches and the lockfile. Upgrade to
appropriate stable releases available at execution time. Major upgrades are in
scope; alpha, beta, canary, experimental, nightly and release-candidate versions
are not default release targets. Workspace `*` references are internal links.

Review at least Next.js, React/React DOM, TypeScript, Turborepo, Prisma/client,
Neon adapters/driver, `pg`, Clerk, Inngest, Stripe, Resend, React Email, Sentry,
PostHog, Vercel Analytics, Zod, Vitest, Biome, Ultracite, Tailwind, Testing Library,
Lucide, Recharts, Arcjet, `ical-generator`, MDX and all remaining direct packages.
Check actual manifests before relying on a library.

Use Context7 for current library/API documentation, migration guides, breaking
changes and configuration. Use next-forge guidance as architectural context;
do not re-scaffold the app. If documentation cannot be obtained, record the
specific gap rather than inventing current API behaviour.

`bun run bump-deps` may assist but does not replace an explicit outdated audit.
Do not retain an old major merely to avoid migration work, or downgrade merely
to avoid fixing a regression. For every package below latest stable, record
installed/latest versions, exact blocker, upstream constraint, evidence,
production impact and follow-up.

| Area | Required review |
| --- | --- |
| Next.js | Align Next-owned packages. Check App Router, RSC/client boundaries, Server Actions, handlers, proxy, caching/revalidation, `cookies()`, `headers()`, redirects, metadata, instrumentation, images/fonts, Turbopack, generated route types, environment and Vercel runtime. |
| React | Align React and React DOM with Next compatibility. Verify hydration, hooks, controlled forms, events, portals/dialogs, Suspense, loading/error boundaries and React Email. |
| Prisma/Neon | Upgrade Prisma, client, Neon/PG adapters, driver and related packages coherently. Verify generation/types, configuration, pooling, transactions, connectivity, migration syntax, bundling and Vercel compatibility. Preserve Neon. |
| Server externalisation | Inspect `packages/next-config/index.ts`, including Prisma externalisation. Establish why each rule exists before changing it; preserve required WASM/compiler compatibility. |
| Overrides/patches | Inspect root overrides, `patchedDependencies`, `patches/` and resolved lockfile versions. Retain or port necessary workarounds; remove only when the underlying defect is proven resolved. |
| Runtime | Align local/CI Bun, `packageManager`, Node engines, package requirements and Vercel runtime. Resolve floating-versus-pinned policy intentionally. |

After upgrades, install and run check, build, typecheck, boundaries, unit and
integration tests. Preserve build-before-typecheck sequencing for generated
Next route validators. Resolve peer conflicts, module resolution, type/build/test
failures, React warnings and material runtime/deprecation warnings. After all
remediation, repeat the dependency/duplicate-version audit and frozen install;
verify Next, React, Prisma, TypeScript, manifest and lockfile alignment.

## 6. Authentication, membership and tenant isolation

Test the actual Clerk roles: owner, admin, manager and viewer. Employee-facing
behaviour comes from linked-person context, not an invented `employee` role.
Enforce permissions on the server, regardless of client visibility.

Explicitly verify supported authentication flows: registration, sign-in,
sign-out, forgotten password/reset, applicable email verification, expired and
invalid sessions, protected routes, redirects and account deletion if supported.
Check profile, organisation creation, invitations, membership, role/ownership
changes and user removal where implemented. Record unsupported capabilities
accurately. Organisation switching is not implemented and remains outside this
release work unless current approved product requirements change.

Review both `clerk_org_id` and `organisation_id` scoping in queries, mutations,
Server Actions, API handlers, feeds, Xero operations, jobs, notifications/SSE,
analytics, billing, audit, holidays and settings. Source tenant context from
authenticated server context or validated job payloads, not client claims.

Use at least two isolated tenant contexts where available and test different
payroll Organisations within a Clerk Organisation. Attempt unauthorised access
through URL/route manipulation, UUIDs/record IDs, query parameters, request
bodies, Server Actions, API inputs, job payloads and stale browser state.

Cover people, teams, locations, availability/leave/balances, feeds/tokens, Xero
connections/tenants, sync runs, notifications/SSE, analytics, billing, audit,
public holidays and settings. Treat cross-tenant or cross-organisation leakage
or mutation as P0. Mark unavailable live evidence explicitly.

## 7. Database and migration integrity

Use the configured database from active environment variables for Neon
verification. Do not create another Neon project, branch, external PostgreSQL
environment or ad hoc go-live database. Never print credentials or connection
strings. The repository's isolated CI PostgreSQL service provides independent
empty-database proof; it does not replace verification of configured Neon.

Before remediation establish the active environment, actual schema, applied and
pending migrations, ordering, drift, existing data value and integration state.
Inspect tables, enums, indexes, foreign keys, unique constraints, nullability,
cascades, timestamps, ownership, tenant fields, organisation relationships,
generated types, Prisma compatibility and server/client credential boundaries.
Sensitive operations must not rely on client restrictions.

Preserve a valid migration chain. For a verified defect, choose the simplest
maintainable correction: corrective migration, history repair or a justified
pre-production rebaseline. Follow repository migration-generation conventions;
never hand-edit generated migrations. Do not use `db:push` to conceal a broken
migration path or make production deployment depend on it.

### Conditional destructive remediation

Only under the applicable authority in section 1 and a verified pre-production
target, a necessary correction may include reset, schema/table recreation,
clearing obsolete data, migration repair/rebaseline, reseeding or regeneration
of application data. Destruction is not a convenience or a release requirement.

Before doing so:

1. Identify the defect and inspect migration/schema evidence.
2. Assess data and connection state, and compare non-destructive alternatives.
3. Document the chosen action, necessity, affected data and recovery steps.
4. Account for Xero reconnection or other reconfiguration needed after reset.
5. Verify the resulting schema, baseline/seed data and application behaviour.

The release must independently prove both:

- The configured Neon database accepts `bun run migrate:deploy`, has coherent
  applied/pending history and matches the intended Prisma schema with zero drift.
- Committed migrations construct the same schema from an empty PostgreSQL
  database through the isolated CI approach, with zero drift.

Use current Prisma-supported drift syntax after checking documentation. Repair
CI if it does not prove empty-database construction. Schema-direct push is
neither migration evidence nor a substitute for these two checks.

## 8. Australian Xero and leave workflows

Verify AU OAuth, tenant selection/persistence, people, leave records, balances,
submit/approve/decline/withdraw, refresh, error handling and reconciliation.

### OAuth and sync

Check OAuth state, registered callbacks, callback validation, token encryption
at rest, proactive refresh, expiry/revocation, reconnect, invalid callbacks and
provider errors. Keep Xero credentials/tokens out of URLs, bundles, user errors,
logs, analytics and Sentry. Preserve Vercel Preview callback restrictions; an
intentional restriction is not a defect to bypass for E2E evidence.

Test initial, scheduled and supported manual sync, pagination, idempotency,
retries/backoff, rate limiting, partial/record-level failures, authentication and
network failures, stale-record handling, reconciliation and duplicate protection.
Use representative regional fixtures and retain NZ/UK compatibility coverage.
Repeated sync must not duplicate canonical records. A queue acknowledgement
alone does not prove execution or tenant-scoped downstream persistence.

### Synchronous writes and role journeys

Submit, approve, decline and withdraw remain synchronous, user-triggered Xero
writes. Do not queue them in Inngest. Verify provider requests and results,
local transitions, rejection, timeout, conflicts, double-clicks, duplicate
submission, stale state, retries and safe error mapping. Never show provider
success after failure. Raw payloads remain server/admin audit material; employees
receive useful plain-language errors.

| Journey | Required evidence |
| --- | --- |
| Employee-facing user | Authentication, dashboard and personal context, balances, request creation/validation, submit, Xero result, local state, persistence after refresh and permitted withdrawal. |
| Manager | Team visibility/calendar, approval queue, review, approve, decline with required reason, local and Xero state, downstream calendar effects. |
| Admin/owner | Xero status, sync health, affected people/records, settings and audit evidence. |

Exercise invalid dates, repeated submission/approval, permission denial,
conflicting/concurrent actions, cancellation, stale pages, refresh during a
mutation, provider failure and useful recovery. Test approval-state transitions
and decline-reason enforcement explicitly. Do not calculate payroll accruals
locally to fill provider gaps.

## 9. Manual availability, calendar and ICS feeds

Test every supported manual category, including work from home, travelling,
training and client site: create, edit, archive/delete, overlap, timezone,
visibility, permissions, privacy, provenance, calendar/feed projection and
interaction with Xero leave. Manual availability must not write to Xero.

Treat ICS publishing as a critical launch journey. Verify creation, detail,
scope, subscription, copy, token rotation/revocation, pause/resume where
implemented, archive, invalid/expired/revoked tokens, privacy, caching and updates
after underlying data changes. Test Outlook, Google Calendar and Apple Calendar
behaviour where available; distinguish serialisation tests from live-client proof.

Validate deterministic/stable UID generation from the PRODUCT formula,
SEQUENCE changes for material published changes, DTSTART/DTEND, all-day end-date
semantics, timezones, escaping, line folding, duplicate prevention and applicable
deletion/cancellation behaviour. Apply privacy during publication projection.

The endpoint is `GET /ical/:token.ics`. Every authorised viewer must see, select
and copy the complete active subscribe URL. Never mask, truncate, hash or replace
it with a hint; copy the exact displayed URL. Event `masked` privacy does not
mask the URL. Verify replacement URLs after rotation, availability while paused
and no active URL for archived feeds. Keep internal hashes/signing material
server-only, avoid plaintext token persistence, and prevent unauthorised URL
exposure through logs, analytics or error reports.

Verify Redis-compatible Vercel KV environment validation, reads/writes, ETags,
`feed_id + etag` caching, invalidation, degraded operation, stale-feed prevention
and credential protection. Do not replace the provider without a verified need.

Distinguish Team Calendar regeneration/cache invalidation from third-party
calendar polling. Remove unsupported fixed refresh promises, such as “within
60 seconds”, across product/help/marketing/README copy and tests. Do not promise
an external client polling schedule Team Calendar cannot control.

## 10. Jobs, notifications, holidays and billing

### Inngest

The current registry in `packages/jobs/src/functions.ts` exports nine functions:
usage recount, notification email, feed cache rebuild, feed publication
reconciliation, Xero approval reconciliation, balances, leave records, people
and scheduled sync. `apps/api/app/api/inngest/route.ts` registers that export.
Re-read both during execution; cover any additions as well as these functions.

For every registered function verify payload validation, tenant/organisation
context, idempotency, retries/backoff, duplicate events, partial/record failures,
concurrency, observability and production configuration. Jobs must not depend on
browser sessions, and one record failure must not fail the entire sync run.

Preserve intentional administrative scans such as the global notification drain
and scheduled sync dispatch. Verify their authorised entry points and scoped
downstream processing rather than treating the cross-tenant scan itself as an
end-user data leak.

### Notifications and SSE

Verify recipients and linked-person context, tenant/user isolation, read/unread,
links, preferences, duplicates, SSE connection/reconnection and email dispatch
and failure handling. A stream must not expose another user's or tenant's data.
Email delivery failure must not undo a completed core transaction unless that
behaviour is explicitly designed.

### Australian public holidays

Verify provider/source integration, refresh, date/timezone accuracy, jurisdiction
and organisation scope, implemented location settings, permissions, overrides,
calendar projection, suppression/restoration, manual deletion and provider
failure. Retain future regional adapters without activating them.

### Billing and launch mode

Discover `NEXT_PUBLIC_LAUNCH_MODE` from the actual configuration and schemas.
In `early_access`, absent Stripe and disabled paid operations may be intentional.
In `paid`, verify checkout, plans, subscriptions, signed webhooks, customer portal,
usage limits/counters, tenant/customer binding and failure behaviour. Do not
report intentional early-access behaviour as a billing defect or claim paid
flows were tested when they were not applicable.

## 11. Validation, security and observability

Validate external input with Zod at trust boundaries: forms, route/query
parameters, JSON bodies, Server Actions, APIs, webhooks, external API responses
and uploaded files if supported. Verify invalid inputs, cancellation, duplicate
submissions, partial failures and safe recovery. Errors must produce useful
feedback, be caught/logged appropriately, expose no sensitive implementation
detail and leave no partial/corrupt state. Remove silent failures.

Review identifiable risks in authentication bypass, access control, IDOR,
tenant leakage, privilege escalation, role enforcement, token/secret exposure,
SSE, webhook signatures, injection, XSS, CSRF where relevant, unsafe/open
redirects, CSP, public endpoints, rate limiting, excessive response data,
verbose production errors, unsafe uploads if present and vulnerable dependencies.
Inspect browser/server credential boundaries; do not introduce speculative
security architecture or bypass security to make checks pass.

Review Sentry and structured logs across browser, server, Edge and Inngest.
Unexpected failures must be observable with useful safe context; expected errors
must be handled. Scrub Xero payloads, tokens, secrets and sensitive external
errors from logs, analytics, monitoring and user responses. Remove inappropriate
production `console.log` calls and development-only behaviour.

Never obtain green checks by deleting/skipping valid tests, broad lint
suppression, weakened types, unjustified `any`/casts/`@ts-ignore`, hidden warnings,
placeholders, mocks replacing production behaviour, authentication/tenant/Xero
bypasses, migration shortcuts or temporary credentials/hard-coded secrets.

## 12. UI, accessibility, responsive and browser review

Every UI, UX, visual, responsive, accessibility, interaction or visible-interface
copy adjustment must use the installed `impeccable` skill. This includes
`apps/app`, `apps/web`, shared components, CSS/Tailwind and the UI portion of a
functional fix. Read current skill instructions, `.impeccable.md`, `DESIGN.md`,
relevant `ScreenCatalogue.md` entries and implemented tokens before UI work.
Absence of a committed skill directory does not waive the requirement.

Use Operate for authenticated screens, Persuade for marketing/conversion, Read
for help/editorial, and appropriate critique, harden, adapt, distill, arrange,
typeset and polish techniques. Refine established design; do not arbitrarily
redesign correct surfaces or create parallel base components.

Preserve Plus Jakarta Sans, semantic forest green (`#336A3B`), tonal separation,
no pure-black text, shadows only for floating elements, and the documented
20/16/14/12px radius scale. Use current tokens, role-appropriate density, clear
Xero/manual provenance, and equal light/dark care.

### Screens and interaction states

Review significant screens for hierarchy, typography, spacing, alignment,
component variants, density, visual balance, navigation and action clarity.
Cover forms, search/filters, tables, charts, calendars, dashboards, dialogs,
drawers, popovers, dropdowns, tooltips, menus and notifications.

Test transitions between loading/skeleton, empty, populated, stale, error,
permission-denied, Xero-unavailable/failed-write, disabled, in-progress, partial
success, success and destructive-confirmation states. Exercise long content,
wrapping, scrolling and sticky elements. Fix overflow, layout shifts, confusing
button placement and weak loading/error/empty feedback.

### Accessibility and responsive coverage

Verify practical WCAG 2.2 AA expectations: semantic HTML, headings/landmarks,
labels/descriptions, required fields and error identification, accessible names,
keyboard navigation, focus order/visibility/trapping/return, modal and Escape
behaviour, contrast, non-colour status indicators, screen-reader text, touch
targets, reduced motion/transparency, dark mode and 200% zoom/reflow. Prefer
semantic elements over unnecessary ARIA. Pay particular attention to calendar
and date controls, leave/approval forms, feeds, settings, tables and mobile nav.

Test 320px, approximately 390px, tablet, laptop, desktop and wide desktop in
light and dark modes. Include sidebars, navigation, cards, forms, charts,
calendars, tables, dialogs/drawers, tooltips/menus, feeds, people, analytics,
settings, sync and marketing. No critical information or action may become
inaccessible at a supported width.

Use available browser automation for Chromium, Firefox and WebKit where
practical. Record actual engine/viewport coverage and unavailable engines.
Continuously inspect console/network, hydration, requests, redirects, assets,
links and runtime errors. Fix material JavaScript/React warnings, failures,
stale state and races. Rerun Impeccable verification after material UI changes
and perform a final app/web/design-system review after functional remediation.

## 13. Public website and documentation truth

Include all current public routes: homepage, features, integrations, pricing,
contact, customers, about, help centre, blog, careers, security, status and legal
pages, plus RSS, sitemap, metadata and social images. Check links/support
destinations, hydration, console, accessibility and responsiveness with
Impeccable for all interface changes.

Verify truthful AU launch scope, NZ/UK future positioning, launch-mode pricing
and service claims. Reconcile branch policy, Vercel Preview behaviour, refresh
timing, Xero sync, roles, job registry, app deployment boundaries, dependencies
and migration workflow. Never describe future functionality as shipped.

Update README, AGENTS, CLAUDE, GEMINI, PRODUCT, SECURITY, DESIGN, `.impeccable.md`,
ScreenCatalogue, plan/task records, environment examples, CI and deployment
instructions where the final implementation requires it. Include purpose,
architecture, development setup, environment/service configuration, migration,
testing, builds, deployment and production constraints. Preserve historical
truth and explicitly unresolved product decisions.

## 14. Performance and repository cleanup

Investigate measured performance risks: large teams and availability sets,
calendar/analytics rendering, Prisma queries/N+1 patterns, unnecessary Client
Components and re-renders, repeated requests/waterfalls, blocking operations,
feed generation/cache invalidation, SSE, jobs, bundle/JavaScript size and
unoptimised images/public assets. Optimise confirmed bottlenecks without
premature micro-optimisation or speculative architecture changes.

After functional remediation, remove confirmed dead code/components/imports,
unused/deprecated dependencies, obsolete routes/compatibility workarounds,
patches/migration workarounds, abandoned experiments, temporary scripts,
commented-out implementations, duplicate utilities, redundant CSS, debugging
output, production mock data/placeholders, stale TODOs/FIXMEs and generated
output that should not be committed.

Preserve historical plan evidence, documented extension points, future NZ/UK
adapters and maintained docs/email tooling. Clean only task-owned temporary
branches/worktrees safely; stop verification processes and confirm expected
ports are free. Inspect tracking and unmerged branches before describing the
repository as clean.

## 15. Automated tests, CI and deployment configuration

Preserve co-located Vitest conventions and meaningful fixtures/factories. Add
regression coverage for material fixes where practical, not tests written solely
to increase a coverage percentage.

Prioritise authentication/roles, tenant/organisation isolation, business-critical
mutations/destructive actions, validation/error handling, Xero regional mapping
and errors, token handling, leave state transitions/decline reasons, sync
idempotency, ICS serialisation/UID/SEQUENCE/privacy, feed tokens, notifications,
SSE, public holidays, launch-mode billing, migrations and environment validation.
Test database uniqueness invariants explicitly. Mocks and skipped credential-bound
tests do not establish live integration success.

Review `.github/workflows/ci.yml`: frozen install, Prisma generation, static
checks, production build, generated Next route validators, typecheck, boundaries,
migration deploy, schema drift, workspace test-script coverage, unit and
integration tests. Check GitHub Action/Bun/Node/PostgreSQL versions and current
Prisma syntax. Correct retired branch triggers while preserving Vercel Preview.

The current deployment contract is Vercel projects for `apps/app`, `apps/api`
and `apps/web`. `apps/email` is a React Email development/preview workspace;
its build is excluded from the root build and must be validated separately.
`apps/docs` is reserved for future developer/API documentation and is not
currently deployed. Its lint script calls `mintlify broken-links`, but its
manifest does not declare the CLI, so resolve and record tooling availability
before claiming validation. The web help centre remains the launch help surface.

Review production environment validation, absent-not-empty optional variables,
secrets, domains/DNS, auth and OAuth callbacks, redirects, build/deploy commands,
database/cache connectivity, integration initialisation, monitoring/analytics,
rate limiting and health checks where implemented. Prevent development-only
behaviour from running in production. Never expose secret values in evidence.

Use `packages/next-config/preflight.ts` and each app's environment schema as the
executable configuration contract. The current preflight requires:

| Scope | Required configuration |
| --- | --- |
| All three apps | Valid launch mode, public app/API/web URLs and `NEXT_PUBLIC_SENTRY_DSN`. |
| App and API | Database, Xero encryption key and OAuth client credentials, Clerk publishable/secret keys, and the complete KV URL/token pair. |
| API | Clerk webhook secret, Inngest event/signing pair, and Resend token/API-key fallback. |
| Web | A valid support email resolved from supported environment values or the configured default. |
| Paid app/API | Stripe secret, Basic/Premium price IDs and portal return URL; API also requires the webhook secret. |

Verify format constraints with the owning schemas as well as preflight presence
checks. README's prose still describes some KV/Sentry settings as optional even
though the production preflight requires them; reconcile those instructions to
the executable contract during release work. Keep optional formatted variables
absent rather than empty. Verify launch mode matches the built public bundle
and server configuration.

## 16. Final verification sequence and evidence

Use current package scripts and documented tool syntax. After remediation and
integration, execute the following gates for the exact candidate. Run relevant
format fixes first when needed. Preserve build before typecheck, and deploy
migrations before database-backed tests that require the release schema.

```bash
bun install --frozen-lockfile
bun run --cwd packages/database build
bun run check
bun run build
bun run typecheck
bun run boundaries
bun run migrate:deploy
bun run test
bun run test:integration
```

Run migration deployment and drift checks separately against configured Neon
and the isolated empty CI PostgreSQL database described in section 7. Do not
silently redirect one environment's evidence to the other.

Run application-specific production preflights for the discovered launch mode:

```text
bun run preflight app <launch_mode>
bun run preflight api <launch_mode>
bun run preflight web <launch_mode>
```

Replace `<launch_mode>` with `early_access` or `paid` as configured. A generic
preflight is not a substitute. Validate maintained auxiliary workspaces with
their actual scripts, currently:

```bash
bun run --cwd apps/docs lint
bun run --cwd apps/email build
```

A missing tool or external prerequisite is an explicit verification constraint,
not a successful check.

### Production-like runtime and E2E

Start app, API and web from production-like builds/configuration. Development
mode alone is insufficient. Verify startup, routes/redirects, Server Actions,
API handlers, assets, environment validation, database/auth/integrations,
observability, navigation, forms, dialogs, feeds, notifications and charts.

Test first-time and returning-user journeys, employee-facing flows, manager
flows and admin/owner flows from sections 6–10. Include settings, navigation,
CRUD, empty/loading/error states, validation and destructive actions. For every
critical mutation:

1. Start at the real UI entry point with realistic authorised test data.
2. Perform the action and inspect response/network behaviour.
3. Verify backend results and database persistence where appropriate.
4. Refresh and confirm persistent state and downstream effects.
5. Inspect browser console and server logs.
6. Exercise invalid inputs, permission denial, cancellation, duplicate actions,
   partial/provider failures and a meaningful recovery path.

Rendering alone does not prove a workflow. Record external callback, credential,
provider, browser-engine and operator constraints as `NOT VERIFIED`.

### Final review loop

After integration, perform the final dependency audit, security review,
`improve` audit/diff review and Impeccable review. Verify plan done criteria,
non-duplication, current task/index state and absence of implementation drift.
Fix material findings, integrate verified changes and rerun affected checks.
Do not rerun unchanged checks solely to produce more output, but ensure all
mandatory evidence applies to the final candidate, including merged changes.

Inspect every task diff: no unrelated changes attributed to this task, secrets,
temporary logging, weakened tests/security, accidental NZ/UK activation or
Preview OAuth bypass. Confirm launch-mode behaviour, manifests/lockfile,
schema/migrations, documentation and task-owned branch/worktree cleanup agree.
Continue until no P0/P1 remains and all mandatory AU gates pass. If an external
block prevents proof, record it and issue NOT READY rather than fabricating
success or endlessly repeating an unchanged check.

### Verification matrix

For each row record result, command/scenario, tested SHA and working-tree state,
environment/date, and durable evidence reference. Use `PASS`, `FAIL` or
`NOT VERIFIED`. Use `NOT APPLICABLE` only for an evidenced conditional scope,
such as paid billing in early access or an unmaintained auxiliary workspace;
it must not waive a mandatory Australian gate. Expand grouped rows into
individual results.

| Gate | Required scope/evidence |
| --- | --- |
| Dependency audit and frozen install | All direct dependencies, exceptions, alignment, overrides/patches and reproducible lockfile install. |
| Repository check | Formatting/lint/static checks. |
| Production build | Current deployable apps and required generated output. |
| TypeScript | Workspace types including generated Next route validators. |
| Package boundaries | Current boundary checks. |
| Unit tests | Relevant complete workspace suites. |
| Integration tests | Configured suites; disclose skips and live-provider limitations. |
| Configured Neon | Schema, constraints, connection and baseline/seed state. |
| Configured migration deploy | Applied/pending history and ordering. |
| Empty-database migration | Independent construction from committed migrations. |
| Schema drift | Zero drift in configured Neon and the isolated migration proof. |
| App/API/web preflight | Separate result for each app and actual launch mode. |
| App/API/web production runtime | Separate result for each production-like process. |
| Employee-facing/manager/admin E2E | Separate role and linked-person evidence. |
| Authentication and membership | Supported account/session/recovery and membership flows. |
| Tenant isolation/authorisation | Cross-Clerk-Organisation and within-account payroll boundaries. |
| AU Xero sync | Provider execution, terminal result and scoped persisted records. |
| AU Xero write-back | Submit, approve, decline and withdraw, including failures. |
| ICS feeds and cache | Serialisation, privacy, full URL access, tokens, publication and client evidence. |
| Inngest | Every current registered function. |
| Notifications/SSE/email dispatch | Recipient/user/tenant isolation and failure handling. |
| Public holidays | Current Australian source, scope and projection. |
| Billing | Active launch-mode behaviour; paid-only checks conditional. |
| Security and observability | Findings, remediation and safe diagnostics. |
| Accessibility | Critical journeys and controls. |
| Responsive UI/light/dark | Actual viewport and theme coverage. |
| Browser console/network | Errors, warnings, requests and tested engines. |
| Public website | Routes, links, metadata and truthful claims. |
| Docs validation | Maintained tooling; justify any non-applicability. |
| Email templates | Separate React Email build. |
| Documentation reconciliation | Current factual accuracy and preserved history. |
| Final `improve` review | Done criteria and unresolved severity counts. |
| Final Impeccable review | App, web, shared UI and interaction states. |

An unexecuted or externally blocked gate is never PASS. A mandatory gate marked
`NOT VERIFIED` prevents either READY decision even when unit tests pass.

## 17. Readiness decision and final report

Issue exactly one decision for the exact tested Australian release candidate:

| Decision | Conditions |
| --- | --- |
| `READY FOR GO-LIVE` | P0 = 0, P1 = 0; dependency work, configured Neon, migrations/empty-database proof/zero drift, CI gates, AU workflows, tenant isolation, security, preflights, runtime and mandatory UI reviews all pass, with no unresolved release finding. |
| `READY FOR GO-LIVE WITH MINOR KNOWN ISSUES` | The same mandatory gates pass and P0 = 0, P1 = 0; only documented P2/P3 remain, with no material security, correctness, integrity or critical-usability impact. |
| `NOT READY FOR GO-LIVE` | Any P0/P1 remains, or any mandatory gate fails or is unverified, including database/migration safety, AU workflows, tenancy or production configuration. |

Deferred NZ/UK activation is not an AU blocker. Unavailable external evidence
must remain visible; “tested to the extent possible” cannot satisfy a mandatory
gate. A plan review is not release verification.

Produce a **Team Calendar Go-Live Readiness Report** containing:

1. **Release candidate:** branch, SHA, working-tree status, repository version,
   date, Bun/Node/Next/React/TypeScript/Prisma versions, launch mode and region.
2. **Decision:** exactly one label above, with supporting evidence.
3. **Repository reconciliation:** branch policy, historical preview references,
   preserved Vercel Preview behaviour, plans/tasks, CI and documentation conflicts.
4. **Implementation/advisor execution:** findings planned, plans executed,
   temporary branches/worktrees, reviews, local merges, cleanup and blocked/deferred
   work. Distinguish integrated fixes from isolated work.
5. **Dependencies:** inspected/updated/removed packages, majors, override/patch and
   runtime changes, remaining below-stable packages and reasons.
6. **Database/migrations:** original defects, any reset/rebaseline/destructive
   action and rationale, final chain, configured Neon, empty-database result,
   drift and baseline/seed status. Include no connection strings or credentials.
7. **Remediation:** group changes by framework, functionality, database/migrations,
   Xero, tenancy/auth, feeds, jobs, notifications, holidays, billing, UI/UX,
   accessibility, security, observability, performance, CI, docs and cleanup.
8. **Verification matrix:** complete the evidence model in section 16; distinguish
   executed, failed, blocked and genuinely inapplicable checks.
9. **Outstanding issues:** severity, area, description, evidence, production
   impact, reason unresolved/deferred, next action and AU launch-blocker yes/no.
10. **External constraints:** credentials, callbacks, permissions, service/browser
    access and operator actions preventing verification. Use `NOT VERIFIED`.
11. **Deferred scope:** NZ, UK and other future capabilities, with rationale.
12. **Operator actions:** any outstanding Git push, Vercel, Neon, Clerk, Xero,
    Inngest, Resend, Sentry, Stripe, Better Stack or DNS work, without secrets.
13. **Final repository state:** branch/commit/tree, worktrees/branches, packages,
    lockfile, build/tests, migrations/database, advisor/Impeccable/docs status,
    and unresolved P0/P1 counts.
14. **Final statement:** whether that exact tested candidate is ready for its
    first Australian production deployment.

## 18. Definition of done

Go-live execution is complete only when:

- [ ] Current Git/release state, launch scope and authority are established;
      stale active branch assumptions are corrected and Preview behaviour preserved.
- [ ] Active tasks and durable plan history are reconciled; authorised plans
      are implemented, reviewed, merged locally and verified in the candidate.
- [ ] All direct dependencies are reviewed, feasible stable upgrades completed,
      exceptions evidenced and framework/runtime regressions resolved.
- [ ] Configured Neon is verified, necessary remediation is complete, migrations
      deploy, empty-database construction passes and both drift checks are zero.
- [ ] Authentication, tenant/organisation isolation and security pass.
- [ ] Mandatory AU Xero, leave, manual availability, calendar/feeds, jobs,
      notifications/SSE, holiday and launch-mode billing workflows pass.
- [ ] Every interface change used Impeccable; final UI, accessibility, responsive,
      browser and light/dark reviews pass.
- [ ] Frozen install, check, build, typecheck, boundaries, unit and integration
      gates pass, together with app/API/web preflights and production-like runtime.
- [ ] Maintained docs/email workspaces and public website are validated.
- [ ] Final dependency, security and `improve` reviews are complete; no P0/P1
      remains and any P2/P3 deferrals are documented with evidence and impact.
- [ ] Documentation reflects the implementation; task-owned temporary processes,
      worktrees/branches and obsolete material are safely cleaned up.
- [ ] The readiness report identifies the exact candidate and contains no
      unsupported verification claims.

When an essential external prerequisite is unavailable, report NOT READY with
completed work, remaining blockers and operator actions. Do not mark this
execution checklist complete or equate a report with launch approval.
