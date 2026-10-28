# Better Auth Migration Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This document is a plan, not execution authority.

**Goal:** Complete the existing Better Auth migration, correct confirmed permission and delivery defects, and obtain separate source, database, browser and provider acceptance evidence.

**Architecture:** Finish the existing auth boundary in `packages/auth`, the online cookie-session app/API transport and the four fixed roles. Keep payroll data behind the restricted tenant client and existing RLS controls. Resolve conflicting requirements explicitly before the affected changes; reuse implemented signup, invitation, Account selection and lifecycle mechanisms.

**Tech Stack:** Bun 1.4.0, Next.js 16, TypeScript, Better Auth 1.7.12, Prisma 7 with PrismaNeon, PostgreSQL, Inngest, Vitest and Playwright. Confirm the installed pinned adapter/plugin exports before changing their configuration; this plan does not request dependency upgrades.

**Spec:** [02-design.md](../../auth-migration/02-design.md), with the later scoped decisions and evidence in [06-server-review.md](../../auth-migration/06-server-review.md), [07-ui-and-organisations-review.md](../../auth-migration/07-ui-and-organisations-review.md) and [03-cutover.md](../../auth-migration/03-cutover.md). Task 1 reconciles their conflicts. [04-verification.md](../../auth-migration/04-verification.md) supplies the 43-check acceptance baseline and observed failures.

## Scope and evidence baseline

Requested on 28 October 2026: review `docs/auth-migration` and plan **complete migration updates**, including code, configuration, documentation and verification. This session changes only this plan and its checklist in `tasks/todo.md`. Implementation, dependency installation, database/provider tests, reset, hosted configuration changes, deployment, commit and merge are outside this planning session.

Source review baseline: `8a41bc9187e0477e5eae9de3421d4f4b90907490`. The independent audit records **11 PASS, 23 FAIL, 9 UNABLE TO VERIFY** against earlier checkout `a391f6e40177eb6c2d69758983a288218822f24b`. Those are historical results, not commands rerun for this plan. The separate build/runtime task in `tasks/todo.md` is active; consume any fixes and valid evidence it produces instead of duplicating them. Recheck relevant paths before implementation.

Concurrent-work readback before handoff: that separate task has now removed preflight's missing provider export/Clerk branch, ported several stale auth tests and replaced the browser wrapper with real password-endpoint sign-in plus safe auth-context reads. These are observed edits, not verified PASS results from this planning session. Tasks 2 and 4 are acceptance/check-and-finish tasks where those changes already satisfy the requested behaviour. The unresolved `.js` transport import issue and lockfile still require their own evidence; do not infer they were fixed from adjacent edits.

All nine documents were reviewed:

| Document | Role in this plan |
|---|---|
| `01-inventory.md` | Historical Clerk dependency, identity-column, backend-call and webhook baseline. Preserve its snapshot. |
| `02-design.md` | Target architecture and requirements, subject to the explicit conflict decisions below. Its opening proposed status conflicts with later reports of approval. |
| `03-naming-review.md` | Completed neutral rename; retained wire compatibility values still need final-cutover treatment. |
| `04-neutral-auth-review.md` | Completed neutral facade; records earlier preservation of direct-manager behaviour. |
| `05-development-verification.md` | Historical 383-test naming/RLS proof on the configured development target. |
| `06-server-review.md` | Server foundation, explicit stage approval for owner storage, native-runtime and database evidence. |
| `07-ui-and-organisations-review.md` | Implemented UI/lifecycle, later successful database evidence, remaining browser/provider gaps. |
| `03-cutover.md` | Reset/seed/rollback tooling and exact target controls; stale provider-switch instructions need correction. |
| `04-verification.md` | Later failing source/gate audit, source-linked permission findings, runtime evidence gaps and conflicting literal checks. |

## Global Constraints

- "Clean reset. Discard existing Clerk users, organisations and memberships. No identity remapping, imported passwords or customer notification."
- "Product **Account** means Better Auth's logical `organization`. Payroll **Organisation** remains the existing company entity."
- "Four static roles: `owner`, `admin`, `manager`, `viewer`." Keep teams and dynamic auth roles disabled.
- "Apps and domain packages never import `better-auth`, `@better-auth/*` or provider-specific types directly."
- "Missing-generation/legacy Clerk payloads are terminally discarded without tenant access, provider calls or retry loops."
- Preserve AU-only public Account creation/payroll behaviour. NZ/UK Accounts are verification fixtures, not new payroll features.
- Preserve the separate Xero sign-in client, `openid profile email` scope and identity-token storage. Never reuse payroll credentials or mutate payroll connections through sign-in.
- Retain explicit account/company filters, RLS, closed tenant scopes around external calls, safe DTOs and Result semantics for expected action failures.
- Keep Infrastructure omitted pending its residency/security decision. Core auth must work without it.
- Preserve historical migrations, inventories, audit evidence and unrelated open work. Generate new migrations; do not rewrite applied migrations or generated client code.
- Use the existing configured development database and guarded target/consumer/restore/owned-fixture/cleanup workflow for authorised integration. A new Neon branch is not a general integration prerequisite. Destructive reset has its own exact named-branch and execution-confirmation contract.
- Australian English; no em dashes. No secrets, private links, backups or session material in documents or test output.
- Stop execution at the authorised phase. Passing source checks does not authorise reset, deployment or provider resource deletion.

## Approach and decisions to settle

Recommended approach: finish the current single-provider implementation in small, regression-driven tasks. Reintroducing dual Clerk/Better Auth code contradicts current removal and adds work. Rebuilding auth or adding identity migration infrastructure contradicts the approved clean reset.

These are proposed acceptance resolutions, not claims that the user has approved new architecture:

| Conflict | Proposed resolution and dependency |
|---|---|
| Original restricted auth role versus later explicitly accepted owner connection | **Pending user decision.** Recommend the original dedicated restricted role for the final launch boundary (Task 6). Later reviews explicitly approve the owner for their implementation stage; do not silently overturn that decision. If owner storage is retained for launch, document the precise exception and residual privilege exposure in design/SECURITY/acceptance, and omit Task 6's role change. |
| `AUTH_PROVIDER` and retained Clerk adapter versus Better Auth-only source | Remove obsolete selectors and claims. Keep `AUTH_CONTEXT_MODE=local` on app and `remote` on API. Rollback restores the preceding coherent deployment/configuration/database, not a flag in this build. |
| Literal zero Clerk references versus historical evidence | Require no active Clerk SDK/dependency/configuration/wire contract in the completed candidate. Explicitly classify historical Markdown/migration replay/negative-context tests and installed/generated artefacts. Preserve historical records; do not make the audit pass by erasing its baseline or broadly excluding active first-party source. |
| Every SECURITY DEFINER function must read tenant context | Verify tenant policies/functions use `app.account_id`; separately verify narrowly granted auth bootstrap/lifecycle functions using row identity and trusted auth actor context. Pre-Account auth functions cannot require an already-selected Account. |
| Reset requires confirmation even for a dry-run | Preserve the deliberate non-mutating branch-bound dry-run. Actual deletion requires both `--execute` and `--confirm`; test the distinction. |
| Native ACL defaults versus the fixed custom permission matrix | Preserve exact grants and disabled features. Reconcile section 6 with explicit custom statements; do not blindly inherit native owner deletion, team or dynamic-ACL grants. If a pinned native operation needs a missing statement, add only that statement with positive and negative tests. [Official organisation access-control documentation](https://better-auth.com/docs/plugins/organization) explains that custom roles replace defaults; Context7 was also consulted. |
| Recovery/verification limit 5/60 in design versus implemented 3/60 | Recommend retaining the stricter 3/60 setting and documenting it, unless policy approval selects 5/60. This is a policy discrepancy, not proof of a bypass. Pin the selected value in tests. |
| Viewer direct-manager access retained by facade review versus own-only leave design | Apply own-only leave rules from the final permission matrix. Preserve `manualAvailability:manageDirectReports` for a viewer who is the actual direct manager. Keep these two domains separate. |
| Auth audit retention and Infrastructure residency unresolved | Record the required retention/access/deletion policy before launch; keep Infrastructure disabled. Do not start a hosted Infrastructure integration project to complete core auth. |

## Review Focus

1. A manager with no linked Person or an unrelated employee in the same Account must not receive an admin queue/count or recovery control (Task 3).
2. A viewer who is a direct manager may manage permitted manual availability but cannot create/read/edit/submit/retry another employee's leave (Task 3).
3. A last-owner removal or concurrent owner/membership change must roll back without partial audit/session/Person effects (Task 5 and Task 10).
4. Old queued, retried or cached job work must not perform effects after identity reset or restore; an event check alone cannot stop already-running old code (Task 8 and Task 12).
5. A stale cookie, session renewal, Account switch or auth outage across sibling production and unrelated Preview hosts must fail closed or propagate renewal correctly, including SSE (Tasks 4 and 11).

## Dependency order

Task 1 precedes changes affected by its decisions. Task 2 restores source gates. Tasks 3 to 5 can then proceed independently. Task 6 depends on the storage decision. Tasks 7 and 8 complete current contracts before reset. Task 9 corrects operational guidance before Task 10's destructive boundary. Tasks 10 to 12 require their actual environment and execution authority. No later task may use an earlier stage's PASS as evidence of a different candidate or runtime.

### Task 1: Reconcile the specification and acceptance scope

**Files:** Modify `docs/auth-migration/02-design.md`, `docs/auth-migration/03-cutover.md`, `docs/auth-migration/04-verification.md` only through explicit dated clarifications; preserve recorded results. Update current `PRODUCT.md`/`SECURITY.md` decisions with Task 9.

**Interfaces:** Consumes the nine-document review above. Produces one explicit acceptance contract for storage, provider selection, scan scope, ACLs, rate limits and reset ordering used by every later task.

- [ ] Record the storage decision, exact selected rate values, custom/native ACL policy and launch retention requirements. Mark unresolved decisions as pending and stop only their dependent work.
- [ ] Correct the design's status and stale dual-provider sections to distinguish approved decisions, implemented stages and outstanding acceptance. Keep historical reviews dated rather than rewriting their old PASS results.
- [ ] Define active-source removal checks, justified historical exceptions, tenant versus auth-function catalogue checks and dry-run versus deletion assertions. Preserve all substantive security checks.
- [ ] Verify that every conflict above has an explicit disposition and that `04-verification.md` retains its original failed/unverified outcomes until new evidence is collected. Review this contract before implementation; this planning request supplies no implementation authority.

### Task 2: Repair installation, configuration, module resolution and source gates

**Files:** Modify `packages/next-config/preflight.ts`, `packages/next-config/preflight.test.ts`, `packages/auth/transport.ts`, `packages/auth/selection.ts` only if needed, `packages/auth/keys.test.ts`, the stale tests below, `apps/app/.env.example`, `apps/api/.env.example`, `turbo.json`, `bun.lock`. Correct the eight exact lint diagnostics recorded in `04-verification.md` section 4 only where still present.

**Interfaces:** Preserve `getSessionAuthorizationHeaders(): Promise<Record<string, string> | null>` and `getRequestAuthContext(requestHeaders: Headers)`. Preflight validates the exclusive Better Auth runtime with local/remote context modes; it must not restore `authProviderSchema` or a Clerk fallback.

- [ ] Add/update preflight assertions for local app, remote API, missing/mismatched paired origins, cookie configuration and rejected unsafe runtime roles. Reproduce the missing-export failure before fixing it.
- [ ] Remove obsolete `authProviderSchema` imports/defaults/Clerk branches and `AUTH_PROVIDER` cache/example entries. Retain actual Better Auth keys and required catalogue validation.
- [ ] Exercise both request-context branches without mocks hiding module resolution. Align `transport.ts` imports with actual TypeScript files and existing Next.js conventions. Preserve deferred loading where needed to avoid constructing the local server in API runtime.
- [ ] Port stale provider assumptions in `packages/auth/adapters/{session,accounts,proxy,playwright}.test.ts`, `packages/auth/{keys,cookie-transport,context,route,invitation-route,package-exports}.test.ts`. Assert verified session/membership, unknown-role denial, cookie allowlisting, missing context, operational errors and invitation behaviour; do not merely remove failing assertions.
- [ ] Reconcile `bun.lock` with current manifests using Bun 1.4.0 after the browser wrapper no longer needs Clerk (Task 4). Then require `bun install --frozen-lockfile` to succeed without changing it. No package upgrades are needed.
- [ ] Generate Prisma once with `bun run --cwd packages/database build`, then run focused preflight/auth tests, `bun run check`, `bun run typecheck`, `bun run test` and `bun run build`. Record actual results; distinguish unresolved source imports from host worker/socket restrictions. Do not change compiler or test semantics to manufacture a PASS.

### Task 3: Restore exact role scope and Result-safe billing actions

**Files:** Modify `apps/app/app/(authenticated)/leave-approvals/page.tsx`, its `account-scope.test.ts`, `packages/availability/src/plans/plan-service.ts`, `submit-service.ts` and their tests; `apps/app/app/(authenticated)/settings/billing/{actions.ts,actions.test.ts,billing-client.tsx,billing-client.test.tsx}`. Create a focused page test only if existing approval coverage cannot exercise rendering.

**Interfaces:** Pass the real `AuthRole` into approval queue/summary calls. Leave own-person admission remains separate from `plans:manageReports`. Set `startCheckout(planKey: "basic" | "premium"): Promise<Result<never>>` and `startPortal(): Promise<Result<never>>`: successful provider URLs still use Next.js `redirect`; expected errors return an AppError Result and are rendered by the caller.

- [ ] Add failing approval-page regressions: manager remains manager at queue/summary, unrelated reports are excluded, missing linked Person is denied, and admin-only reconciliation is absent. Owner/admin behaviour remains covered.
- [ ] Remove the permission-to-admin conversion at the page role resolver. Keep independent mutation checks and company/report filtering.
- [ ] Add failing leave regressions for viewer direct-manager create/detail/update/archive/submit/retry denial; include a manager's permitted report, unrelated Person, own Person and foreign Account/company. Assert rejection before provider dispatch or writes.
- [ ] Require the appropriate leave grant in `canActOnPerson` and submission/retry admission before using a reporting relationship. Preserve manual-availability direct-report semantics, self-approval restrictions, state rules and withdrawal ownership.
- [ ] Add billing action assertions for signed-out/viewer/manager denial, owner/admin success redirect, early-access refusal and provider Result failure. Use Result-safe auth admission and update client handlers to show returned errors without swallowing redirect control flow.
- [ ] Run `bun run --cwd apps/app test -- 'app/(authenticated)/leave-approvals' 'app/(authenticated)/settings/billing'` and `bun run --cwd packages/availability test -- src/plans/plan-service.test.ts src/plans/submit-service.test.ts`. Expect all selected cases to pass; retain caller-level assertions, not just the pure grant matrix.

### Task 4: Replace the Clerk browser harness and prove cookie transport contracts

**Files:** Modify `packages/auth/testing/playwright.ts`, `packages/auth/adapters/playwright.test.ts`, `tooling/release/e2e/global.setup.ts` and actual consumers found with `rg -n 'signInTestUser|setupAuthTestingToken|readBrowserAuthIdentity' tooling/release packages/auth`; existing `packages/auth/{cookie-transport,api-proxy,context}.test.ts` and adapter remote-context tests.

**Interfaces:** Keep `BrowserAuthIdentity` with `accountId`, `email`, `role`, `userId`; keep `readBrowserAuthIdentity(page: Page): Promise<BrowserAuthIdentity>`. Change `signInTestUser` to accept `{ email: string; password: string; page: Page }`, using per-role controlled fixture credentials. Remove provider testing-token setup and migrate its callers; no no-op compatibility shim or production auth bypass.

- [ ] Verify wrapper tests show genuine password sign-in through the existing production auth endpoint with the browser cookie jar, safe identity/session observation and failure on invalid/unverified credentials. Remove any remaining `@clerk/testing`, `window.Clerk` and deleted `clerk-roles` imports. Reuse the concurrent implementation where it meets these assertions; Task 11 separately proves the UI form journeys.
- [ ] Update release credential parsing/setup to use seeded role passwords supplied privately. Observe identity through the existing safe app auth-context boundary, with no tokens exposed in browser globals or logs.
- [ ] Extend transport tests for allowlisted cookies only, fixed target/no redirects, operational failures, fresh membership, renewal Set-Cookie, exact credentialed CORS/Origin and Preview app-origin SSE/payroll proxy behaviour. Do not instantiate the local auth server in API mode.
- [ ] Run focused wrapper/transport tests and `bun run typecheck:release-tools`. With an actual candidate/fixture manifest, require `bun run test:release --list` to discover tests. Discovery is not a successful browser journey; Task 11 executes it.

### Task 5: Close membership edge coverage and paginate job recipients

**Files:** Modify `packages/auth/adapters/better-auth-accounts.test.ts`, `packages/jobs/src/handlers/reconcile-xero-approval-state.ts` and its unit/integration tests; keep `packages/auth/adapters/better-auth-accounts.ts`'s existing paginated directory unless a demonstrated defect requires a change.

**Interfaces:** Reuse `listAccountMembersForJob(input: ListMembersInput): Promise<Page<AccountMember>>`, including `limit`, `offset`, `data`, `totalCount`. Preserve the directory's safe projection and session-free job contract.

- [ ] Add a failing case with more than 100 members and an eligible owner/admin after the first page. Fetch pages until exhausted; filter current roles and de-duplicate recipient user IDs. Cover empty data and changing counts without an infinite loop.
- [ ] Add the specifically absent `removeAccountMember` last-owner rejection case alongside demotion and leave. Assert unchanged membership, session and audit state on rollback; cover removal where another owner exists and the target has another membership.
- [ ] Add database-backed concurrent owner removal/demotion and final-membership assertions to the guarded coverage in Task 10. Prove database constraints and session revocation, not only mocked directory behaviour.
- [ ] Run `bun run --cwd packages/auth test -- adapters/better-auth-accounts.test.ts` and `bun run --cwd packages/jobs test -- src/handlers/reconcile-xero-approval-state.test.ts`. Expect all pages' eligible recipients and all removal invariants to pass.

### Task 6: Resolve and implement the final auth storage boundary

**Decision dependency:** Run the restricted-role work below only if selected in Task 1. The later stage approval for `systemDatabase` is documented; this plan does not assume it has been revoked.

**Files, restricted-role route:** Create `packages/database/src/auth-client.ts` and focused tests. Modify database exports/env validation, `packages/auth/adapters/{better-auth-server,better-auth-accounts}.ts`, `packages/auth/account-provisioning-adapter.ts` and other auth-owned owner-client uses found by search, `packages/auth/keys.ts`, `packages/next-config/preflight.ts`/tests, app example, and a newly generated Prisma migration with reviewed grants. Extend `packages/database/row-level-security.integration.test.ts` or a registered adjacent auth-role suite.

**Interfaces:** A server-only database client exported through `packages/database` for auth internals, configured by `DATABASE_AUTH_URL`. It is never a TenantDb or public app/domain directory handle. The auth adapter/directory APIs remain unchanged. API gets neither this URL nor `BETTER_AUTH_SECRET`.

- [ ] Write catalogue/integration assertions for `team_calendar_auth`: explicit auth-table CRUD allowlist; audit SELECT/INSERT only; no domain access, schema/table ownership, DDL, superuser, BYPASSRLS or inherited/PUBLIC privilege escape. Retain denied auth access for `team_calendar_app`.
- [ ] Implement lazy auth-client construction and switch all auth storage/atomic transaction paths consistently. Keep post-commit payroll defaults/Person linking in restricted tenant scopes; validate required narrowly scoped function grants.
- [ ] Generate and review grants/migration; separate no-login role creation from administrator-managed login credentials. Do not invent a provider API/key or branch prerequisite for existing configured development work.
- [ ] Extend app preflight to inspect the selected auth role's real catalogue, alongside the existing domain-role checks. Test missing/wrong/cross-target URLs and inherited privileges without logging credentials.
- [ ] Prove native signup, invitation, session, directory, audit and transaction rollback through PrismaNeon using the selected role in Task 10. If owner storage is selected instead, document its precise exception/risks and test the existing app-role deny boundary; do not claim restricted-auth PASS.

### Task 7: Complete current wire names, audit visibility and Infrastructure policy

These are bounded contract changes; implement and review each group independently.

**Files:** `packages/billing/src/{stripe.ts,stripe.test.ts}`, `apps/api/lib/stripe-event-delivery.ts` and associated Stripe route/replay tests; `packages/xero/src/oauth/{service.ts,service.test.ts}`, current analytics cache/audit strings found in the naming register; `packages/auth/keys.ts`/tests and options tests. Create `packages/auth/account-audit.ts` and its tests plus an explicit package export; modify existing audit page, client, actions/tests and auth lifecycle audit context where needed.

**Interfaces:** Emit/read Stripe metadata `account_id`; signed payroll OAuth state uses `accountId`. Old state is invalidated by coordinated closure/expiry at cutover, not an identity compatibility adapter. New `listAccountAuthAuditEvents(input: { cursor?: string; limit?: number }): Promise<Result<{ events: AccountAuthAuditEvent[]; nextCursor: string | null }>>` authenticates the session and `audit:read` internally and derives the Account. Define `AccountAuthAuditEvent` in `packages/auth/account-audit.ts`: `id`, `accountId`, `eventType`, `createdAt` (ISO), nullable `actorUserId`, `targetUserId`, `requestId`, and nullable allowlisted `before`/`after` string-field records. No credential/session/provider token fields. The page's combined event type discriminates `source: "auth" | "domain"`; its cursor records both source positions and a stable time/ID ordering.

- [ ] Add wire regressions for neutral Stripe metadata and payroll state signature/expiry/tampering. Establish the handling of outstanding test Stripe deliveries/subscriptions and OAuth states in the runbook before changing both writers and readers. Do not rewrite remote objects or delete provider resources under implementation authority alone.
- [ ] Replace active provider-labelled cache fingerprints and emitted audit action names with neutral values; preserve immutable stored historical records and historical migration replay/legacy-context denial tests. Re-run the complete active-source register rather than claiming lexical zero from a partial search.
- [ ] Add auth audit read tests for owner/admin permission, Account derivation, foreign-event/detail rejection, safe field projection, equal timestamps and pagination. Combine auth and company-domain audit entries in the existing audit surface using explicit source discriminators and deterministic ordering/cursors. Read auth outside TenantDb, including when no payroll company exists; never grant auth tables to the tenant role. Extend CSV/detail paths to preserve the same restrictions.
- [ ] Carry a trusted server request ID through controlled auth mutations and trigger audit writes, covering rollback and no secret values. Use a new generated migration if the trigger definition changes; do not edit the applied lifecycle audit migration.
- [ ] Enforce `BETTER_AUTH_INFRA_ENABLED=true` rejection while approval is unresolved, even with a key. Test omission of Dash and absence of Infrastructure outbound calls when disabled. Pin the selected recovery/verification limit from Task 1. Confirm the native fixed permission matrix and direct endpoint denials rather than broadening grants via SDK defaults.
- [ ] Run `bun run --cwd packages/billing test -- src/stripe.test.ts`, `bun run --cwd packages/xero test -- src/oauth/service.test.ts`, `bun run --cwd packages/auth test`, and the app/API suites covering the changed audit and Stripe consumers. Expected: exact active wire contracts, safe Account-scoped audit results and rejected premature Infrastructure enablement.

### Task 8: Fence obsolete job identity generations before effects

**Files:** Modify `packages/jobs/{keys.ts,src/event-context.ts,src/events.ts}`, their tests and every actual event producer/handler discovered by `rg -n 'inngest.send|readJobEventData|step.run|step.sendEvent' packages apps`; API/app job env validation/examples, Turbo inputs and the existing release environment/manifest consumers where necessary. Create one focused jobs helper/test for generation validation if keeping it separate improves clarity.

**Interfaces:** Add required server configuration `JOB_IDENTITY_GENERATION`, bound to the release's chosen non-empty generation. Every new event carries `identity_generation`. `readJobEventData(input: unknown)` validates that value against configuration before returning existing `accountId`/`organisationId` context; mismatched/missing values throw `NonRetriableError`. Producers set it from trusted server config, never from browser input. Use a fresh generation after identity reset **and** restore rollback.

- [ ] Add failing consumer tests for absent/old generation and legacy IDs, asserting zero tenant opens, provider calls, notification writes and retry loops. Add producer assertions for sync, initial import, cancellation, recovery, feed, usage and email events, including nullable company scope.
- [ ] Add a generation fence outside resumable cached steps and recheck before effectful phases where needed. Cover an old cached observation and a generation change between phases. Keep jobs session-free and maintain both tenancy keys.
- [ ] Extend existing release binding/configuration only enough to prove all app/API/job consumers share the chosen generation. Include it in scheduled event IDs where needed so cutover/rollback cannot deduplicate against the quarantined generation.
- [ ] Run `bun run --cwd packages/jobs test` and affected API/app dispatch tests. Require zero effects for obsolete work and unchanged intended current-generation behaviour.
- [ ] Document provider-backed cancellation/quarantine/closure of running, queued, retry and cached executions for Task 12. This code cannot prove old deployed workers are stopped; closure remains an operational gate, not a synthetic test PASS.

### Task 9: Make current product, agent and release guidance consistent

**Files:** Modify `PRODUCT.md`, `AGENTS.md`, `README.md`, `SECURITY.md`, `docs/auth-migration/{02-design,03-cutover}.md` and current database/auth guides with active contradictory claims. `CLAUDE.md` and `GEMINI.md` continue importing `AGENTS.md`; do not duplicate instructions there. Link, rather than overwrite, dated naming/server/UI evidence.

**Interfaces:** One current setup contract for local app/remote API, selected database roles, four permissions, local users/memberships, independent payroll Organisations, signup/invitations, cookies and rollback. Historical documents retain snapshot semantics.

- [ ] Replace Clerk-managed current identities/memberships and no-local-users claims. Document current safe helpers, actual schema and selected storage decision, immutable Account country, pending/ready bootstrap and explicit jobs generation.
- [ ] Remove obsolete provider flag/retained-adapter/browser-token instructions. Keep historical previous-build rollback, independent identity/payroll callbacks and exact displayed feed URL behaviour.
- [ ] Correct reset ordering: verified snapshot/consumer closure, branch-bound dry-run, separately authorised destructive execution, then UUID/FK migration, fresh native auth seed and coordinated candidate. A blanket `migrate:deploy` must not apply the conversion while Clerk text IDs remain.
- [ ] Specify precise prerequisite evidence for source, guarded development integration, native auth/SQL, browser, mail/OAuth, Infrastructure policy and deployment. Preserve 25 October successes as dated and link the later failed audit; do not call it current release acceptance.
- [ ] Check relative links and source references, scan current guidance for contradictory `AUTH_PROVIDER`, retained Clerk adapter, text-ID final-state or membership claims, and run `git diff --check`.

### Task 10: Rehearse clean reset, UUID auth relations and database invariants

**Execution boundary:** Only after explicit authority for the named reset target. Ordinary guarded integration on the configured development target does not require a new branch. Never infer destructive reset authority from credentials, elapsed time or approval of this plan.

**Files:** Modify `packages/database/prisma/schema.prisma`, neutral ID validators in `packages/core`, applicable database query/fixture factories and `packages/database/src/seed/auth-fixtures.ts`; generate one coherent new identity-conversion migration; extend `packages/database/better-auth-schema.test.ts`, registered identity/RLS integration tests, reset tests and `packages/auth/development-seed.test.ts` as required.

**Interfaces:** UUID Account/User IDs and explicit local auth relations for every final tenant/identity reference inventoried in `01-inventory.md`, including generic actor/recipient/triggering-user fields. `Person.user_id` and resolved-user fields remain nullable where specified. Preserve account/company composite keys and RLS predicates. Required history uses RESTRICT; only explicitly approved nullable historical references use SET NULL; no payroll-history deletion cascade.

- [ ] Write schema/catalogue assertions for all intended Account/User FKs, UUID types, company ownership and deletion actions. Check every affected SQL function/context comparison, fixture allocator, durable manifest and reset selector, not just Prisma's three prominent models. Preserve historical text-ID migration-replay tests.
- [ ] Generate the conversion migration against a clean reset state; prove deterministic migration replay on a restored rehearsal before the authorised target operation. Do not fabricate email/ID backfills or hand-edit prior migration history.
- [ ] Verify backup restoration, target metadata and consumer closure using the existing protected workflow. Execute branch-bound dry-run and confirm it changes nothing. Retain reset tests for protected/incorrect branch, missing execution confirmation, shared grants, cross-scope dependencies and transaction rollback.
- [ ] Confirm auth-table RLS classifications and the existing cleanup registry remain valid with the new relations before permitting fixture allocation. Extend the existing registered inventory for any new integration file; do not create an unguarded execution path.
- [ ] Execute the explicitly authorised reset with both required flags, then apply the conversion migration and selected role grants. Verify checksum/schema parity and seed fresh native Accounts/users. Existing reset selection must finish before UUID enforcement; never make the reset query depend on already-migrated IDs.
- [ ] Seed AU/NZ/UK Accounts with all four roles through genuine auth APIs, linked People, payroll Organisations and business Teams. Repeat seed to prove idempotency; leave no active seed sessions. NZ/UK remain fixtures.
- [ ] Run native PrismaNeon signup/invitation/country/readiness/last-owner/final-membership/audit/session-revocation and concurrent rollback assertions under the selected auth role. Verify fresh and legacy/missing RLS context and denied app-role auth reads against the actual catalogue.
- [ ] Run full guarded integration with the existing `tooling/release/run-live-integration.ts --manifest <protected-path> --evidence-dir <private-directory>` entry point and its configured invocation/runtime. Require complete inventory, all tests including explicit RLS, writer closure, owned-fixture cleanup, fence release and unrelated-data/restore evidence. Do not use the root localhost-only opt-in against Neon or weaken guards.

### Task 11: Prove the deployed user journeys and external providers

**Files:** Extend existing `tooling/release/e2e` journeys and role setup; place new auth-specific cases with those journeys. Update `docs/auth-migration/04-verification.md` with dated candidate-bound results and sanitised evidence pointers.

**Interfaces:** Exact paired app/API/web candidate URLs, matching deployed/source SHA, selected job generation, protected release/fixture manifests and controlled role credentials. Real Google/Microsoft/independent Xero sign-in clients, registered callbacks and controlled inboxes are required for their own checks, not for unrelated source work.

- [ ] Run both app/API preflights with actual target configuration and catalogue validation; require source gates, build, release-tool types/tests and browser discovery to pass first. Do not count a preflight import failure as a completed role-catalogue check.
- [ ] For each of owner/admin/manager/viewer prove password and magic-link sign-in, verified-email/no-Account/readiness handling, Account picker/switch, calendar, scoped People, member-role admission/denial and permitted AU payroll connect. Record expected and observed results per role, including unlinked managers.
- [ ] Prove new/existing-user invitation, addressed-mailbox mismatch, expiry/replay/scanner handling, concurrent claims, owner restrictions, recovery/password reset and session renewal. Prove downgrade/removal denies the next app/API request and closes active SSE without replay.
- [ ] Exercise foreign Account/company/Person IDs through UI, direct actions, API and feed-management/token paths for AU versus NZ/UK. Check full usable feed URL display/copy for authorised viewers, while invalid/revoked tokens and foreign management fail.
- [ ] Exercise sibling production-style cookies and unrelated Preview app-origin proxies, exact CORS/Origin, refreshed Set-Cookie and SSE. Verify Preview payroll start/callback state/nonce only where its actual registered callback exists.
- [ ] Prove Google, Microsoft work/school and Xero sign-in callbacks plus explicit linking: both email verifications, same-email requirement, rejected implicit/different-email/direct-token linking. Observe that Xero identity login neither creates nor modifies payroll grants/connections. Record actual mail delivery and safe single-use links separately from callback configuration tests.
- [ ] Capture runtime logs and browser evidence without secrets. Keep unavailable provider/browser/hosting checks UNABLE TO VERIFY and source failures FAIL. Stop only the dependent operation; finish independent authorised checks.

### Task 12: Cutover acceptance, rollback and final evidence reconciliation

**Files:** Update `docs/auth-migration/{03-cutover,04-verification}.md`, current setup instructions and `tasks/todo.md` with results. No new release framework is required.

**Interfaces:** One exact candidate, database state, configuration and job generation across all evidence. Deployment/reset/provider resource operations require their own actual execution authority; preparing this runbook does not execute them.

- [ ] Reconcile every inventory area and all 43 checks with the agreed Task 1 criteria and current evidence. Record commands, candidate IDs, counts, skipped cases, failures and cleanup limits. Preserve original audit results as a dated baseline with the new assessment clearly separated.
- [ ] Obtain authenticated closure evidence for all pre-cutover consumer work, including cached/resumable steps. Pause/quarantine old registrations before deploying the coordinated candidate and new generation; do not bypass existing protected release admission.
- [ ] Under explicit cutover authority, follow the reviewed reset/migration/seed/deploy sequence and run scoped post-cutover role, cookie/API/SSE, account isolation and Xero-separation smoke checks. Remove old hosted Clerk secrets/webhook registration only within that authorised scope and after acceptance.
- [ ] Rehearse rollback of the matching database/configuration and preceding coherent deployment, with another fresh job generation and all pre-restore work quarantined. State the fresh-fixture cutoff and loss of later writes; a provider flag is not rollback.
- [ ] Mark completion only when mandatory checks pass at their required evidence level and the storage/retention/Infrastructure launch decisions are explicit. Otherwise report the exact remaining FAIL/UNABLE TO VERIFY rows and stop at the authorised boundary. Commit/merge only if separately requested.

## Audit coverage map

Every original check remains accounted for. A task mapping is not a PASS result.

| Original checks | Closure tasks |
|---|---|
| 1 zero Clerk; 2 dependencies; 3 environment; 4 legacy routes/flag/mocks | 1, 2, 4, 7, 9, 12. Remove obsolete `session-tasks/choose-organization` route after updating consumers/tests; classify historical records explicitly. |
| 5 names; 6 RLS/functions; 7 rename integrity; 8 terminology | 1, 7, 9, 10. Preserve existing rename SQL and historical denial/replay evidence. |
| 9 provider boundary; 10 auth connection; 11 schema | 2, 6, 10; retain and run `tooling/release/provider-imports.test.ts`. Storage PASS depends on the selected contract. |
| 12 sign-in methods; 13 roles/plugins/mail; 14 nextCookies; 15 security; 16 Infrastructure | 1, 4, 5, 7, 10, 11. Preserve nextCookies last and disabled teams/dynamic roles. |
| 17 Xero credentials/scopes; 18 token separation; 19 reuse rejection | 2, 7, 11; retain the existing configuration and credential-reuse tests. |
| 20 role literals; 21 helper/Result actions; 22 scope; 23 grant matrix; 24 server enforcement | 1 to 5, 7, 11. Unknown/multiple roles continue failing closed. |
| 25 picker; 26 API transport; 27 job context/generation; 28 backend calls | 4, 5, 6, 8, 11, 12. Keep the audit's twelve-call replacement ledger. |
| 29 invitations; 30 bootstrap/invariants; 31 escalation; 32 revocation | 3, 5, 10, 11. Include last-owner removal and active SSE. |
| 33 reset; 34 seed; 35 env/preflight; 36 CLI/schema compatibility | 1, 2, 6, 9, 10. Check the pinned native schema/API exports, not current upstream main alone. |
| 37 all delivery gates; 38 baseline/deletion comparison | 2, 4, 10, 11, 12. Account for every removed/replaced test; do not lower coverage to pass. |
| 39 role journeys; 40 cross-tenant; 41 provider linking | 11, then 12. Source/unit evidence cannot close these deployed checks. |
| 42 PRODUCT; 43 AGENTS/CLAUDE/README/SECURITY | 9, 12. Keep imported agent instructions canonical. |
| Additional design coverage: combined auth audit/request ID, UUID relations, stale cached work | 7, 8, 10, 12. These requirements extend beyond a literal summary-only repair. |

## Plan review and handoff

Planning verification: all nine documents are represented, confirmed gaps have owning tasks, and original checks 1 to 43 map to closure. Five local document links and 47 existing file references resolve; the two proposed new modules are explicitly identified. All 12 tasks are ordered, checkable and include their acceptance requirements. No em dashes were found. This task's edits are limited to the plan/checklist; concurrent source fixes belong to the separate build/runtime task and remain preserved. Application gates were deliberately not run during this planning-only session.

Before execution, review Task 1's proposed resolutions, especially the storage decision. No execution method was selected by the user. Native execution suits the coupled schema/transport changes; focused independent reviews should cover permission scope and reset/role safety. Subagent-driven execution is also available. Neither is started by saving this plan.
