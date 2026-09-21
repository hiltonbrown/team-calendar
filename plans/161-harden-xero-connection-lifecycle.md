# Plan 161: Harden the Xero API integration for production

> **Executor contract:** read this entire plan, reconcile source drift, implement the scoped work, test it, obtain an independent review and integrate verified changes locally. Do not stop after producing another audit, creating a branch or writing tests that do not exercise the required behaviour.
>
> Retain server-side OAuth authorisation-code flow, Clerk account boundaries, payroll-organisation ownership, AU-only activation and synchronous user-triggered payroll writes. This is connection, credential, transport and operational hardening, not a replacement integration.
>
> Use the database already specified by the existing environment configuration. Do not create another database or environment. Use protected, owned fixtures and the existing release harness. Do not print secrets or put them in plans, logs, screenshots, test snapshots or job payloads.
>
> Source implementation, local commits and local integration of reviewed, passing work are within the established execution workflow. Remote push, deployment, secret changes, customer communications, real payroll changes and remote Xero disconnections require their applicable existing authority. A missing prerequisite blocks only its dependent operation, not independent source work. Do not request approval again for actions already authorised.

## 1. Status, ownership and deliverables

| Item | Contract |
| --- | --- |
| Plan | 161, final consolidated execution specification |
| Date | 21 September 2026 |
| Source baseline | `585f6cb4d2532bfa23eb8fb455ad0d360d7e16fe` on `hiltonbrown/team-calendar` |
| Review scope | Attached Plan 161, this conversation, relevant repository source and existing plans, Xero references and the upstream `improve` execution contract |
| Implementation status | TODO. No source implementation, database migration or live provider test was performed to produce this document |
| Priority | P1 production-hardening programme; binding and credential correctness are release-blocking |
| Change risk | High: credential adoption, cross-account infrastructure, migrations and external deletion |
| Recommended repository path | `plans/161-xero-api-production-hardening.md` |
| Existing local Plan 161 | Replace/reconcile its content in its existing path if present; do not keep competing active Plan 161 files |
| Execution branch | Reuse the appropriate existing execution branch or use `codex/xero-connection-hardening` |

The remote baseline was rechecked. This does not establish that the executor's local branch, uncommitted files, environment, database or deployment is unchanged or clean.

### 1.1 Relationship to other plans

Plan 161 owns Plan 159's **X5 and X6 / Step 3** requirements: immutable payroll binding, safe reconnect and coordinated authorisation lifecycle. Preserve those requirements and mark them as **implemented through Plan 161**, not rejected or removed. In particular, coordinated credential ownership is required by this plan, not a deferred investigation.

Plan 159 retains import completeness, employee/person reconciliation, initial-import orchestration, AU submission/approval semantics, onboarding readiness and calendar freshness. Plan 161 may change their direct callers only to pass lifecycle, credential, error or deadline contracts. Do not rewrite their workflows or silently change AU approval behaviour.

Plan 160 retains end-to-end execution and reporting. Extend its scenario coverage with this plan's evidence matrix, without duplicating its harness. `plans/go-live.md` retains release-wide readiness and deployment gates. Passing Plan 161 does not certify those other programmes.

### 1.2 Required artefacts

Maintain this plan, `plans/161-xero-provider-contract.md` and `plans/161-xero-execution-report.md`. The report must reference a machine-readable JSON evidence file produced by the release harness. Update the plan index and relevant Plan 159/160 cross-references. Preserve unrelated work and historical evidence.

Provider contracts must distinguish **public documentation**, **selected Team Calendar policy**, **source observation**, **inference** and **live verification**. No previous assistant verdict or historical test result is a substitute for fresh execution evidence.

## 2. Evidence and corrections carried into this plan

### 2.1 Vetted source findings

Paths below were inspected in this review or earlier in this conversation at the same source baseline. Resolve symbols again during drift checking; do not rely on old line numbers after edits.

| ID | Source evidence | Required correction |
| --- | --- | --- |
| H1 | `packages/xero/src/oauth/service.ts`, `completeXeroTenantSelection`: reconnect upserts the same internal tenant and updates `xero_tenant_id`; `schema.prisma` has no unique active external binding | Reject different-file reconnect transactionally; add database-backed ownership and binding history |
| H2 | OAuth credentials and refresh locks are stored/keyed per internal `XeroConnection` | Coordinate a verified Xero user/app credential lifecycle separately from payroll binding |
| H3 | `fetchConnections` reduces metadata to IDs/names; `TokenResponseSchema` requires refresh tokens and discards other token metadata | Validate and preserve provenance; separate customer and management response contracts |
| H4 | Session scrubbing removes inventory; disconnect uses `remoteRevoked: false` for both absent and unconfirmed outcomes | Persist provenance before scrubbing; durable cleanup with truthful per-target and aggregate outcomes |
| H5 | `rate-limit/limiter.ts` uses process-local Maps; `orgRateLimitKey` uses internal IDs; `limits.ts` fixes daily allowance at 5,000 | Shared atomic budgets by actual app/external tenant, explicit tier and conservative recovery |
| H6 | OAuth transactions have 15-second/20-second timeouts, while HTTP admission can wait 65 seconds and retry | One absolute deadline, bounded lock/network/body handling and no remote DELETE inside a database transaction |
| H7 | `reconcileRefreshPersistenceFailure` treats changed ciphertext as successful persistence before checking active state | Use attempt/token versions and current lifecycle state; an emptied token is not a successful rotation |
| H8 | Auth recovery treats repeated 401/403 generically; `XeroWriteAdapter.getTenant` converts freshness failure to `null` | Preserve actionable recovery categories and distinguish failure before a payroll request from an unknown remote outcome |
| H9 | `packages/core/src/redis-rest-transport.ts` clears its timeout after response headers, before parsing JSON | Keep cancellation effective through body consumption and resource cleanup |
| H10 | `crypto/tokens.ts` writes `keyVersion: 1` and decrypts with a single configured key | Implement compatible version-aware decryption and controlled re-encryption; do not claim metadata alone provides key rotation |
| H11 | `hasActiveXeroConnection`, scheduler queries and adapters read current credential/status fields directly | Migrate every relevant consumer; a new owner model cannot coexist with independently refreshing legacy readers |
| H12 | `live-test-fixture.ts` owns tenant slots and a limited set of global key kinds | Extend protected fixture ownership for new global infrastructure records and Redis keys before integration tests |

H1's possible payroll-data mixing is an inferred consequence of the confirmed update path, not a reproduced production incident. Source findings do not prove that any particular live customer connection has failed. See the pinned source map [R1], [R2], [R3], [R4], [R5], [R6], [R7], [R8], [R9] and [R10].

Representative current behaviours to remove:

```typescript
// service.ts: existing internal XeroTenant receives a different external ID.
update: {
  payroll_region: payrollRegion,
  tenant_name: selectedTenant.tenantName,
  xero_tenant_id: selectedTenant.tenantId,
}

// service.ts: different ciphertext alone currently counts as committed recovery.
const tokenChanged =
  input.loadedRefreshTokenEncrypted !== null &&
  current.refresh_token_encrypted !== input.loadedRefreshTokenEncrypted;

// crypto/tokens.ts: current envelope metadata is not a key selector.
keyVersion: 1,
```

### 2.2 Provider reference baseline

Use the source register in Section 17. The readable current Xero FAQs establish 30-minute access-token life, expiry of unused refresh tokens after 60 days, the 30-minute lost-refresh-response recovery window, and permission-specific `WWW-Authenticate` handling. The pricing table distinguishes Starter's 1,000 daily tenant calls from 5,000 on higher tiers. The Identity specification establishes connection metadata, authorisation-event filtering and targeted DELETE outcomes. [X1], [X2], [X3], [X4], [X5]

The official SDK demonstrates one token set used to retrieve multiple authorised tenant connections and distinguishes connection deletion from whole-user token revocation. Its token interfaces include `xero_userid`, issuer, audience, client and scope claims. This supports separating credentials from tenant bindings, but does not justify treating unverified decoded claims as identity. [X6]

The previous review identified the management scope **`app.connections`** and management GET/DELETE via client credentials. Implement that selected capability using the official management/client-credentials guides. The current text retrieval exposed only JavaScript shells for several detailed guides, so their complete parameters and deployed permissions were not freshly revalidated in this pass. The readable FAQ separately confirms client-credentials access to connection information. [X13] Step A must capture primary-source request/response evidence before enabling management deletion. Do not invent pagination, assume the user-scoped OpenAPI description establishes app-wide coverage, or substitute Custom Connections for customer Payroll OAuth. [X7], [X8], [X9], [X10]

**Do not carry forward these overstatements:** every earlier access token must immediately become invalid after any new consent; `authEventId` is a stable grant identifier; a client timeout cancels provider execution; a generic 403 proves a specific role was removed; or a passing static audit proves production readiness. None is required for this design.

The selected architecture maintains one canonical usable credential set for each **verified provider app/Xero authoriser identity**. Live tests must prove safe repeated consent, refresh, multiple tenants and multiple authorisers. They do not decide whether to implement coordination.

## 3. Non-negotiable product and security boundaries

- Preserve Next.js/next-forge, Neon/PostgreSQL, Prisma, Clerk and Inngest. No authentication-provider migration, browser-held client secret, PKCE rewrite, new membership system or unrelated dependency upgrade.
- Clerk Organisation remains the customer account boundary. Internal `Organisation` remains the payroll-entity boundary. Each payroll entity retains its existing `XeroConnection`, internal `XeroTenant`, canonical people/availability relationships and historical identifiers.
- **At most one reserved internal binding per configured Xero app and external payroll tenant**, including across Clerk accounts. This is a selected Team Calendar policy, not a claimed universal Xero restriction. Conflict responses reveal no other account identity.
- An internal payroll entity cannot silently acquire a different external payroll tenant, including after soft/destructive disconnect. Implement no replacement-file or cross-account transfer workflow. Retiring a reservation does not erase historical ownership or authorise migration of retained data.
- Xero remains authoritative for balances and accruals. No local accrual engine or changes to AU submission/approval semantics. Outbound payroll writes remain synchronous and user-triggered; maintenance jobs never replay a payroll mutation.
- Local disable, credential usability, provider-link status, sync pause and historical data retention are different states. Do not collapse them into one boolean or infer remote deletion from invalid credentials.
- Preserve signed OAuth state, browser nonce protection, safe return paths, owner/admin management permissions, user-bound sessions and registered callback behaviour. AU remains the only activated payroll region.
- Preserve existing outbound-operation uncertainty recovery, privacy, publication identity and stable calendar UIDs. Refreshing or reauthorising credentials must not reset import cursors, regenerate feeds or relink people.
- Secrets stay server-side and encrypted at rest. Provider-level infrastructure may be shared internally, but customer data, account memberships, consent and management authority are never inferred from that sharing.

## 4. Scoped implementation paths

Change only the following areas and their direct, necessary tests/exports. Record each changed file against a plan requirement. Resolve existing modules before adding equivalents.

| Area | Allowed paths and purpose |
| --- | --- |
| Provider boundary | `packages/xero/src/{oauth,crypto,adapter,rate-limit,read,write,au}/`; provider identity verification, canonical credentials, lifecycle, management, transport and error handling |
| Regional compatibility | Existing NZ/UK call sites only for mechanical type/transport compatibility, never activation or payroll behaviour changes |
| Provider exports/configuration | `packages/xero/{index.ts,keys.ts,keys.test.ts,package.json}`; root `bun.lock` only for directly required maintained verification dependencies |
| Database | `packages/database/prisma/schema.prisma`, new additive migrations, generated client, `src/queries/`, existing `queries/` export wrappers, package exports and new lifecycle/migration tests |
| Test protection | `packages/database/src/live-test-{fixture,guard}*`, owned cleanup/inventory helpers and release-manifest schema, restricted to protecting new records |
| Shared transport and neutral errors | `packages/core/src/redis-rest-transport.ts` and tests; `src/ports/external-write-port.ts`, required core exports/types |
| Jobs | `packages/jobs/src/handlers/`, events, functions and registration exports: maintenance, bounded reconciliation, lifecycle/error propagation and scoped job cancellation |
| Domain callers | `packages/availability/src/xero-connection-state.ts`, submit/approval/withdraw services, sync/claim helpers and their tests, only for lifecycle admission, typed errors and no-local-success-after-uncertain-write safeguards |
| Application | Existing Xero settings/connect actions, pages, clients, DTOs and tests; direct onboarding/sync/availability consumers of changed connection states |
| API | `apps/api/app/api/xero/oauth/`, existing Inngest registration and direct provider-error/lifecycle route consumers |
| Publication cleanup | Existing feed/publication invalidation helpers only where the established destructive-disconnect operation requires them; no UID or calendar-semantic redesign |
| Preflight | `packages/next-config`, app/API environment examples and configuration tests |
| Verification | `tooling/release/` runners, manifest/cleanup support, browser tests, JSON evidence schema and tests |
| Documentation | `PRODUCT.md`, relevant agent architecture sections, affected scope/status descriptions, Plan 159/160 references, this plan, provider contract, execution report and `plans/README.md` |
| Execution records | Scoped entries in `tasks/todo.md` and relevant corrections in `tasks/lessons.md`; preserve history |

Do not create a generic integration platform, new billing behaviour, bulk onboarding, automatic inactivity deletion, whole-grant revocation, a new Xero app, an extra database or a parallel test environment. A needed direct caller outside a named directory may be included only after the advisor records its exact path and contract relationship in this plan; this is not permission for unrelated scope expansion.

## 5. Target architecture and invariants

These are required logical records and behaviours. Reuse equivalent existing models where source drift has already implemented them. Names below are recommended, not permission to duplicate equivalent tables.

### 5.1 Separate the three identities

| Record | Required content and constraints |
| --- | --- |
| `XeroCredentialOwner` | Provider app ID and verified Xero authoriser ID, unique together; encrypted canonical access/refresh envelope(s), encryption version, token version, credential generation, token expiry, granted scopes and provenance, last verified/adopted/rotated timestamps, refresh-attempt and recovery state |
| `XeroProviderConnection` | Provider app ID and exact remote connection ID, unique together; external tenant ID, tenant type, verified authoriser association when established, `authEventId`, provider timestamps, observation source/time/coverage and remote lifecycle status |
| `XeroTenantBinding` | Both internal scope IDs, internal organisation/connection/tenant references, immutable external tenant/app identity, selected provider connection/credential-owner references, lifecycle generation, reserved slot, retirement reason and timestamps |

The provider connection is the user-authorised link; the binding is the application's ownership decision. A payroll tenant can have multiple remote authoriser connections, while Team Calendar permits only one reserved internal payroll binding.

Preserve old remote connection records on reauthorisation. Changing authoriser must not overwrite the only record of the superseded connection. Retire obsolete links only through the safe reconciliation process.

### 5.2 Explicit system-level infrastructure boundary

`XeroCredentialOwner` and app-wide provider inventory are **system infrastructure**, not customer-owned payroll rows. Do not attach an arbitrary `clerk_org_id` merely to fit existing conventions. Document this narrow exception in the architecture guidance and test it.

All customer bindings, session intents, local status changes, customer cleanup requests and payroll operations retain both internal scope identifiers, except an onboarding session with no payroll organisation yet. The latter remains bound to its initiating Clerk account and user.

The only normal route to credentials is a server-only resolver equivalent to:

```typescript
resolveXeroAccess({
  clerkOrgId,
  organisationId,
  expectedBindingGeneration,
  capability,
  deadline,
});
```

It proves the scoped active binding, its selected remote connection, its current verified credential owner and required capability before returning server-internal access. A raw owner ID or external tenant ID is never sufficient authority. Do not export unrestricted global credential queries to application actions. System enumeration returns routing IDs and safe metadata, not credentials.

Linking the same Xero authoriser across different Clerk accounts coordinates credentials only. It creates no account membership, new payroll binding, foreign-account visibility or permission to manage another binding.

### 5.3 Database-enforced ownership

Use a nullable `active_slot` for reserved bindings: `1` while reserved, `NULL` after retirement. Add a CHECK allowing only those values. Enforce unique reserved ownership for `(provider_app_id, external_tenant_id, active_slot)` and for the relevant internal organisation/connection. Test multiple historical NULL rows explicitly.

Also enforce scoped FK consistency using composite references/constraints where practical. App-level scope checks remain mandatory. Binding generations are monotonic per internal connection and cannot restart at one after a retirement/reconnect.

Active, permission-required, reauthorisation-required, paused and cleanup-pending bindings keep their reservation. Retire only after the local-disable and remote-outcome contract is satisfied. Historic external identity remains immutable independently of the reserved slot.

### 5.4 Supporting durable state

Extend the existing OAuth session/intent model rather than creating another unrelated login system. Add immutable intent kind, intended payroll organisation, initiating user/account, nonce binding, expected lifecycle generation, token-exchange/adoption status, inventory provenance and expiry.

Add cleanup request and attempt records. A request contains the scoped local intent and frozen target set; each attempt records an exact provider connection, expected binding generation, authorisation reason, lease/attempt owner, dispatch/outcome state, retries and evidence. A multi-target request cannot report overall remote success while any required target is unresolved.

Use an owner-scoped refresh-attempt record, or equivalent durable fields, for attempt ID, expected credential/token version, dispatch time, uncertainty start, recovery deadline and outcome. Never persist a raw refresh token in an attempt log.

### 5.5 Lock and fencing contract

Adopt one documented order throughout: **credential-owner locks in sorted order, external app/tenant-binding locks in sorted order, internal connection locks in sorted order, then OAuth session/cleanup-row claims**. Re-read non-locking lookups after acquisition. Never acquire these in reverse order from another path.

A refresh that touches only an owner needs that owner lock; a binding transition needs its binding/local locks and relevant owner locks. Use bounded PostgreSQL transaction-scoped advisory locking for the short critical sections. Do not hold a transaction open for remote DELETE.

Token version/credential generation fence credential adoption. Binding generation fences payroll access and local lifecycle changes. They are not interchangeable. A refresh must not reactivate a disconnected binding; disconnecting one binding must not erase credentials still required by other authorised bindings.

Fences protect local decisions. They cannot recall a provider request already sent. Record ambiguous remote outcomes and handle them through existing write recovery or the new cleanup recovery process.

## 6. Execution order and `improve` workflow

| Unit | Result | Dependency for integration | Initial status |
| --- | --- | --- | --- |
| A | Source drift, provider contracts, protected fixtures and baseline | None | TODO |
| B | Immutable binding and additive schema/migration framework | A | TODO |
| C | Bounded transport and version-aware encryption | A; coordinate schema with B | TODO |
| D | Canonical credential lifecycle and safe OAuth adoption | B, C | TODO |
| E | Distributed quota/concurrency enforcement | A, C; consume D's access context | TODO |
| F | Management client, durable disconnect and reconciliation | B, C, D, E | TODO |
| G | Permission-aware recovery and all caller integrations | D, E; integrate F's receipt | TODO |
| H | Inactivity reporting, operator recovery and rollout evidence | B–G | TODO |

Binding regression tests and transport work can start independently after A. Assign one schema/credential-contract owner. Do not allow concurrent agents to implement incompatible ownership models in the same service. Remote cleanup remains off until its dependencies pass.

### 6.1 Advisor and executor responsibilities

Read the locally installed `improve` skill and its execution reference. The repository identifies `shadcn/improve`; current upstream describes a source-read-only advisor and a separate worktree executor. Do not silently edit or replace the installed skill. [S1], [S2]

The advisor reconciles this plan, dispatches a separate implementation executor, reviews the complete diff and records APPROVE, REVISE or BLOCK. The executor makes source changes and runs verification in an isolated worktree. Inline this entire plan in its hand-off; a worktree may not contain uncommitted plan files. Include the actual target branch, applicable authority, completed dependencies and evidence locations.

The advisor maintains `plans/README.md` in accordance with the skill's hand-off contract. The executor updates scoped task records and implementation evidence. Any requirement that cannot be verified must remain explicitly unverified, not be hidden in a COMPLETE status.

After independent approval and required passing gates, the supervising host or executor, **outside the advisor's source-read-only role**, integrates locally into the existing execution/release branch under the user's established local integration authority. Verify the merged state before removing its temporary worktree/branch. No remote push, deployment or real provider mutation is implied.

If the installed skill limits review rounds, obey its review mechanism and record its verdict accurately. A host may arrange a refined, scoped repair outside that advisor invocation; do not turn a review-round limit into a claim that the defect is solved, or silently waive a gate. Where worktree/subagent execution is unavailable, hand this complete plan to a separate implementation session and state that limitation. Do not simulate execution.

## 7. Unit A: Baseline, provider contracts and safe test ownership

### 7.1 Drift and toolchain

Run these read-only checks first:

```bash
git status --short
git rev-parse HEAD
git diff --stat 585f6cb4d2532bfa23eb8fb455ad0d360d7e16fe..HEAD -- \
  packages/xero packages/database packages/jobs packages/core packages/availability \
  packages/next-config apps/app apps/api tooling/release PRODUCT.md plans

git diff --stat
git diff --cached --stat
bun --version
node --version
```

Read current `AGENTS.md`, `PRODUCT.md`, design guidance, root/workspace manifests, test guards and affected tests. Record changed symbols and equivalent completed work. Correct only affected steps for ordinary drift; do not restart the whole audit or recreate retired plans.

The baseline declares Bun 1.4.0, Prisma 7.10.0 and Node `22 || >=24.0.0`. Use the checked-in pinned toolchain and lockfile, not a blanket dependency upgrade. In a fresh execution worktree, `bun install --frozen-lockfile` is an implementation prerequisite, not an advisor operation.

### 7.2 Provider contract ledger

Create `plans/161-xero-provider-contract.md` with a row for every actually called endpoint. Record method/path, token class, minimum documented scope, tenant-header requirement, pagination/completeness contract, idempotency/uncertain-outcome rules, deadline class, rate bucket, source URL/date and verification status.

Cover code exchange, refresh, app-management token acquisition, user/app connection inventory, targeted deletion, organisation/region discovery, AU employee list/detail, leave list/detail, pay-item/settings lookups and existing supported AU writes. Discover all call sites rather than assuming those are the only endpoints.

For management requests, explicitly confirm the singular token form parameter `scope`, the `app.connections` permission, response shape without a required refresh token, GET inventory scope and targeted DELETE. Where a guide is unreadable, use an authorised browser, maintained official specification or Xero support evidence. Do not generate guessed page numbers, filters, token audiences or management endpoints. Keep the destructive capability disabled until the missing contract is established, but implement and test the remaining client/lifecycle code.

For user identity, select the documented verified claim/identity route. Distinguish an access token's expected API audience from an ID token's client audience. Do not request extra profile/email scopes merely to obtain a stable identifier already available through the verified contract.

Record the actual app registration, configured callback, enabled scope availability, tier and relevant management entitlement from authorised configuration evidence. Store identifiers only in restricted records when necessary; never secret values. No portal access means those deployment facts remain NOT VERIFIED.

### 7.3 Target and fixture controls

Use the database already configured for this project. Do not create another Neon branch, PostgreSQL service or replacement environment. The repository's already-existing CI service is a separate pre-existing CI context; do not introduce a new one or substitute its results for the configured database evidence.

Ordinary unit/build checks must use the existing isolation mechanisms and must not connect to the configured database or live Xero. Before integration commands, verify the actual target, fixture manifest, rollback/cleanup runner and applicable authority. `ALLOW_LOCAL_DATABASE_TESTS=1` does not authorise remote access or replace the remote manifest guard.

Extend `LIVE_FIXTURE_SUITES`, manifest global-key allocation, inventory and cleanup to cover credential owners, app/provider IDs, bindings, OAuth attempts, cleanup requests/attempts and shared-store namespaces. Prove that a fixture cannot attach to or delete an existing unowned global owner or provider connection merely because an identifier matches.

Database tests use synthetic provider identities and mocked HTTP. Real Xero tests separately use explicitly authorised owned files/authorisers. Redis integration uses the existing configured shared store with manifest-owned synthetic keys and a fake HTTP provider, not real Xero quota exhaustion. Test-only namespaces/app identities must not be selectable by production callers; the test runner cannot read or use real customer credentials. Never flush a shared store, scan/delete arbitrary prefixes or clean up with unrestricted `deleteMany`.

### 7.4 Baseline gates

Run database-free gates first and record pre-existing failures. Before any live test, inspect that test's setup/teardown and guarded execution path. Do not run the entire integration suite solely to discover whether it is safe.

**Acceptance:** baseline commit/toolchain recorded; each contract row has evidence or an explicit unresolved external prerequisite; protected allocation/cleanup tests pass. Missing live evidence does not stop B/C unit implementation.

## 8. Unit B: Immutable bindings and additive migration

### 8.1 Characterisation and service guard

Add failing regression tests around `completeXeroTenantSelection` before refactoring it. Reconnecting an existing internal organisation to a different external tenant must return `tenant_replacement_required` without altering that selection transaction's credentials, session state, bindings, payroll rows or sync dispatch.

Separate intent kinds: `initial_binding` and `same_file_reauthorisation`. Bind the intended organisation at OAuth start. For a first account with no payroll organisation, an initial intent may create one only within that account and transaction. An unbound initial intent cannot be repurposed into reauthorisation of an arbitrary existing organisation.

Within the ordered locks/transaction, revalidate user/account, current role, intended organisation, session expiry/single-use status, expected binding generation and selected provider connection. Confirm tenant type and AU region. Only then claim the session and create/update the scoped binding. Rejecting selection rolls back new local organisations and selection changes.

Do not use cached UI selection or a caller-supplied tenant ID as authority. If remote inventory is stale or the selected link no longer resolves, fail safely without changing payroll identity. Generic collision messages disclose no customer or authoriser information.

### 8.2 Schema and migration sequence

1. Produce a read-only inventory of existing app/external-tenant associations, duplicates, retained data, old connection IDs, credential provenance and unknown remote outcomes. Report diagnostics privately.
2. Generate an additive expansion migration for the target records, nullable references, history and constraints. Preserve all existing payroll FKs and IDs.
3. Use the pinned Prisma schema-diff tooling to produce base SQL without a shadow database or new environment. Verify its installed `migrate diff --help` syntax first. A schema-to-schema diff or read-only configured-datasource-to-target-schema diff is acceptable; `migrate dev`, `db push`, reset, rebaseline and seeding are not.
4. Add separate, explicit reviewed custom SQL for CHECK/composite/partial constraints that Prisma cannot express. Do not rewrite applied migrations or pretend custom SQL was generated automatically. Inspect SQL for destructive statements and unintended unrelated drift before any deployment.
5. Apply expansion using `bun run migrate:deploy` only on the existing authorised target, then run an idempotent, manifest-aware backfill with a dry-run mode, collision report and restart checkpoints.
6. Enforce final active-ownership constraints only after the collision gate passes. Existing collisions do not get an automatically chosen winner, merged data or a fabricated owner. Quarantine affected records and require the concrete ownership decision while unrelated work continues.
7. Deploy switched readers/writers, verify them, then scrub obsolete duplicated credential columns. Dropping those columns is unnecessary for this plan and must not precede proof that all consumers migrated.

Record the configured provider app identity explicitly for each legacy mapping. App/client-ID changes require a deliberate mapping transition, not a namespace reset. Distinguish encryption-key rotation from OAuth client-secret rotation and from changing the OAuth app itself.

### 8.3 Lifecycle integrity

Add `tenant_binding_conflict`, `tenant_replacement_required` and `connection_changed` typed outcomes. Preserve owner/admin checks and scoped queries. A callback started before disconnect cannot re-enable its old generation.

Keep reservations through pending/unknown destructive cleanup. Reconnecting after completed disconnect is a fresh same-file intent. Do not let a retired record reuse an old generation or migrate retained data to another account.

**Verification:** focused OAuth/action tests; configured-database uniqueness, scope/FK and concurrency tests; backfill dry-run/idempotence/collision tests. Verify the slot CHECK, external and internal uniqueness, multiple historical rows and zero automatic data merging.

## 9. Unit C: Absolute deadlines, cancellation and encryption

### 9.1 Transport contract

Create an absolute operation deadline once at entry. Pass remaining time/cancellation through admission, lock acquisition, HTTP, complete body parsing, backoff and persistence. Recalculate after waiting; retries do not receive a new full deadline.

For existing 15-second refresh transactions, use an initial provider budget of at most 10 seconds with bounded lock acquisition and explicit commit headroom. These are selected engineering budgets, not Xero limits. Enforce the remaining overall budget after the lock is acquired. Management deletion uses short database claims and separate bounded network attempts, not a longer interactive transaction.

Make timeout/cancellation work through `response.json()`/text/stream consumption. Correct the core Redis transport's premature timer cleanup, detach abort listeners and release resources in `finally`. Test already-aborted input, headers followed by a stalled body, malformed JSON, caller cancellation and timeout during backoff. Preserve error redaction and typed `Result` returns.

The Xero wrapper must own response-body lifetime, for example by executing a caller's body-consumer callback before releasing its concurrency permit. Returning an unmanaged `Response` while releasing the permit at headers is insufficient. Bound payload size by documented endpoint needs/configured limits and test oversized/malformed responses without logging payroll content.

Use an allowlisted production provider origin/path contract. Do not follow arbitrary redirects with credentials, or allow response-provided URLs to exfiltrate bearer tokens. Tests use injected transports or explicitly guarded test origins; do not weaken production origin checks to make tests pass.

### 9.2 Preserve remote-outcome certainty

An admission, configuration, decryption or deadline failure **before request dispatch** is a definite non-attempt. A lost response **after dispatch** can be an unknown outcome. Carry phase/dispatch information in the neutral error contract and preserve the existing `ProviderWriteError.certainty` semantics.

No generic retry wrapper may replay a non-idempotent payroll mutation after a network error, 5xx or uncertain response. Continue through the existing outbound-operation recovery path. A local abort limits local resources; it does not prove the provider cancelled processing.

### 9.3 Version-aware encryption

Preserve AES-256-GCM and existing version-one ciphertext readability. Add an explicit active encryption-key version and server-only version-to-key configuration, with validation of key sizes, envelope IV/auth-tag lengths and supported versions. Keep the legacy key mapping as version one during migration.

Recommended configuration is `XERO_TOKEN_ENCRYPTION_ACTIVE_VERSION` plus a secret `XERO_TOKEN_ENCRYPTION_KEYS_JSON` mapping version strings to base64 keys. Preserve `XERO_TOKEN_ENCRYPTION_KEY` as the legacy version-one source while migrating. Reject conflicting definitions for version one. Reuse an existing equivalent keyring if source drift has introduced it. Environment examples contain names and placeholder syntax only, never real keys.

Use envelope key version for decryption. Missing/unknown versions and malformed/corrupt ciphertext yield a safe operational error, never plaintext fallback or blind key guessing. Key values never appear in errors, snapshots, logs or preflight output.

Provide an idempotent re-encryption operation that writes with the active version and uses credential-version CAS. It must not overwrite a simultaneously refreshed/adopted token. Include owner records, unadopted OAuth candidates and retained recovery envelopes in the inventory. Verify all referenced key versions exist before switching writers. Retire an old key only after verifying no live retained envelope requires it and applying the operational backup/retention policy.

Do not rotate real secrets merely because source now supports rotation. Do not scrub a canonical owner's credentials while another active binding still requires them.

**Verification:** core transport, crypto, OAuth and wrapper unit suites; configured-database re-encryption/refresh-race tests. Unknown key version, damaged tag, slow body and lost acknowledgement must have distinct, redacted results.

## 10. Unit D: Canonical credentials and safe OAuth adoption

### 10.1 Verified identity and migration

Use a maintained JWT/OIDC verification library already installed or add the smallest suitable direct dependency. Validate signature, trusted issuer/JWKS, approved algorithms, token class, audience, client binding, required identity claims and relevant time claims. Do not trust a token-provided arbitrary key URL. Bound/cache JWKS retrieval safely; key lookup failure is not permission to skip signature verification.

Canonical key: configured provider app plus verified stable Xero authoriser identity. Never group by email, Clerk user, `authEventId`, unverified payload claims or equality of token strings. Persist the identity's evidence source.

Expired historical tokens do not grant access. A dedicated migration-only verifier may use cryptographically verified historic identity metadata with correct issuer/client binding to associate candidates, but must record expiry and require fresh usable credentials before any payroll access. Otherwise retain the candidate as unverified and require controlled reauthorisation. Do not disable normal runtime expiry validation to make migration succeed, or bulk-refresh unidentified credentials concurrently.

Where several legacy rows belong to one verified owner, retain encrypted candidates until a controlled selection establishes the usable canonical set. Do not pick by local row timestamp alone. Preserve non-secret migration history and explicitly reconcile every dependent binding. No silent merge of Clerk memberships or payroll rows occurs.

### 10.2 OAuth exchange and adoption

Persist the scoped OAuth intent before redirect. On callback, validate signed state/nonce and expiry, claim the exchange once, and persist an encrypted token candidate durably **before** connection inventory/region discovery. Record a remotely-issued but locally-lost token exchange as unknown; do not blindly reuse a one-time authorisation code after an ambiguous exchange.

Verify the candidate's provider identity before adoption. Under the owner lock, re-read current versions and reconcile the candidate with the current credential set. Preserve verified issuance metadata and explicit attempt IDs. Arrival order or a same-second `iat` is not enough to prove which candidate supersedes another. When ordering is ambiguous, use controlled, serialised validity reconciliation; do not overwrite a known usable set with an unverified older candidate.

Store one canonical token set per owner and make its connections available only through existing authorised bindings or a separately valid initial-selection transaction. Connection inventory returned for an authoriser is not permission to bind every tenant it contains.

**Critical sequence:** connecting B may yield replacement credentials needed by already-connected A before B's local selection finishes. Adopt/reconcile verified canonical credentials independently of B's payroll binding. Abandoning B must not discard A's usable owner credentials. Conversely, credential adoption must not activate B, resurrect a disconnected A or create access to another Clerk account.

The wrong-file invariant applies to the rejected **selection transaction**. It does not forbid safe owner-level credential reconciliation caused by the earlier valid OAuth exchange. Tests must distinguish these operations rather than asserting that no credential anywhere can change during a failed onboarding journey.

Persist requested and provider-granted scopes separately, with known/unknown state. Missing scope data on refresh does not erase established metadata; an explicitly supplied change is recorded. Do not assume unknown scope data grants permission. Reauthorisation must preserve the scope/capability needs of existing active owner bindings unless a documented, deliberate permission change is being handled.

Preserve remote connection IDs, tenant type, auth event and provider timestamps. Do not select a connection using only tenant name. Reauthorising the same payroll file with another Xero authoriser selects the new verified link while retaining the old link for safe reconciliation.

### 10.3 Refresh and recovery

Refresh through one owner-scoped coordinator using PostgreSQL locking and token-version CAS. Keep proactive near-expiry refresh, a controlled forced-refresh retry and existing persistence-recovery tests. Multiple callers must reuse the winning token rather than rotate independently.

Record a refresh attempt before remote dispatch. After a valid response, persist the new encrypted pair and metadata atomically. If commit acknowledgement is lost, verify the attempt/token version and owner state, then revalidate the requesting binding. Different ciphertext alone, an emptied legacy column or an unrelated reconnect is not proof that this attempt succeeded.

If the response is lost, preserve the previous refresh token's controlled recovery eligibility for Xero's documented 30-minute window. Record uncertainty once; retries cannot restart that window indefinitely. Schedule necessary recovery using existing Inngest infrastructure and owner IDs only, with no extra Vercel refresh cron. [X1]

An invalid refresh grant affects that owner's credential usability and dependent bindings, not the asserted existence of remote connections. Invalid OAuth client credentials are an app-configuration incident, not evidence that every customer revoked access. Do not overwrite each customer's consent state because of a common app-secret failure.

The fast path after another process rotates a token must still check owner state, scoped binding generation, selected connection and local disable. It must not return success solely because access-token ciphertext changed.

### 10.4 Cut over all consumers

Replace credential reads in AU adapters, resolution/read/write dispatch, manual refresh/disconnect, schedulable queries and job handlers with the new scoped resolver. Update `hasActiveXeroConnection` and related DTOs without hiding infrastructure failure as a user-disconnected state. Remove independently refreshing legacy fallback paths after cutover.

The existing dormant-rotation maintenance becomes owner-deduplicated. Refresh owners still needed by authorised services; a lack of browser login is not expiry of the service relationship. Maintenance must not manufacture customer-activity evidence.

**Verification:** same-owner/two-tenant and two-authoriser/same-tenant tests; two Clerk accounts sharing only credential infrastructure; reversed callback order; same-second candidates; failed inventory; abandoned selection; simultaneous refresh/reconnect/disconnect; unknown commit; scope metadata; key rotation; and expired historic migration. Use real database barriers for races, not arbitrary sleeps. Owned live provider tests separately prove the actual repeated-consent behaviour.

## 11. Unit E: Shared rate limits, concurrency and admission

### 11.1 Store and identity

Implement `SharedXeroRateStore` and a Redis REST implementation under `packages/xero/src/rate-limit/`, using the corrected core transport. An injectable deterministic fake is permitted only in unit tests. Production never falls back to process-local Maps or an uncoordinated limiter when the shared store fails.

Tenant resource keys use **provider app ID plus external Xero tenant ID**, not Clerk account, internal organisation, internal XeroTenant UUID, authoriser or deployment name. All caller deployments sharing the app must share these budgets. Reconnect and new internal records cannot reset a tenant's allowance.

Use explicit endpoint classes: tenant Payroll/resource calls, user connection inventory, app connection management and OAuth token operations. Non-tenanted calls never consume a fabricated tenant allowance. Apply documented limits to their proper classes and explicit conservative operational caps where the provider has not published a class-specific ceiling. Label operational caps as application policy, not provider facts. Token acquisition must not depend on a payroll tenant's exhausted daily budget.

### 11.2 Tier and configuration

Require explicit `XERO_APP_TIER` configuration: `starter`, `core`, `plus`, `advanced` or `enterprise`. Map daily resource allowance to 1,000 for Starter and 5,000 for higher tiers unless a separately recorded provider entitlement overrides it. For ordinary tenant resource calls, configure 60 requests per rolling minute and five concurrent admissions, alongside the published application-wide ceiling of 10,000 requests per minute. Apply these only to the endpoint classes covered by the verified contract; non-tenanted operational throttles remain separately identified. Unknown tier blocks production readiness; there is no silent 5,000 default. [X2], [X3]

Validate the shared-store endpoint, credentials, enabled epoch/configuration and provider app identity in every caller deployment. Do not expose secret values in preflight. Rapid Sync exemptions, premium limits and larger connection entitlements are not assumed. Provider connection-limit errors need a distinct actionable result, not a generic OAuth failure or invented local entitlement.

### 11.3 Atomic accounting

Use one atomic server-side admission operation per applicable resource request: prune expired accounting, inspect tenant minute/day and app minute budgets, shared provider cooldowns and concurrency, then reserve all applicable units or none. Verify that all script keys are supported in one atomic topology, including cluster hash-slot placement.

Prefer strict rolling-window accounting until the provider's reset semantics are established. A full token bucket with continuous refill is not automatically a strict rolling-window cap. Use store time, stable request IDs, bounded retained records and reproducible boundary tests.

Every **admitted HTTP attempt**, including retries, consumes a unit; failed admission consumes none. Use idempotent reservation IDs so an uncertain Redis response can be reconciled without duplicate admission. Distinguish attempt reservations from logical payroll operations.

Concurrency permits are owner-specific and released idempotently after complete body consumption/cancellation. Lease lifetime exceeds the enforced local request/body deadline plus a documented margin. On crash, apply conservative expiry/recovery. Prove at most five admitted active local resource permits per applicable tenant; do not claim local deadlines prove that Xero has stopped executing an abandoned request.

Keep the existing prohibition on ambiguous payroll retry. A `429` produces shared cooldown and appropriate retry metadata. If `Retry-After` exceeds the remaining operation deadline, return/defer to a durable inbound/maintenance retry; do not sleep through a request/transaction deadline. Never queue the payroll write itself.

### 11.4 Headers, persistence and rollout safety

Parse allowlisted remaining-limit headers and `Retry-After` seconds/date values. Reconcile remaining counts only as conservative ceilings after accounting for concurrent reservations and stale/out-of-order responses. A delayed higher header cannot replenish an already-spent budget. Missing headers retain local accounting; malformed values do not grant more allowance.

Known exhausted state must survive process restarts. Verify store persistence and eviction behaviour. Use an explicitly initialised namespace/epoch and sentinel; runtime may not silently initialise a full allowance when required existing accounting disappears. Avoid intentional eviction of live accounting. A lost namespace, ambiguous partial operation or unavailable store denies new provider admission with a retryable infrastructure result.

Record a bounded recovery procedure for lost limiter state: stop/quiesce callers, establish the provider's remaining allowances or conservatively wait out relevant windows, initialise the shared state under operator control, then resume. Do not flush live state or rotate the namespace to bypass quota.

During initial cutover, drain old process-local callers and account for calls already made in the provider window. Deploying an empty shared store must not grant another full daily budget. Verify actual script behaviour and latency on the configured service; mock success does not prove distributed enforcement.

**Verification:** independent clients/processes sharing the actual configured Redis REST service with owned synthetic keys; aggregate tenant and app budgets; five-permit admission; boundary bursts; idempotent reservation/release; crash and slow-body recovery; delayed headers; store loss/outage; missing configuration and retry deadline. Never generate real Xero quota exhaustion to test these cases.

## 12. Unit F: Management client, durable disconnect and reconciliation

### 12.1 Separate app-management client

Implement a server-only client-credentials path for app connection management with the documented `app.connections` scope. Keep its response schema separate from the customer authorisation/refresh schema: management access tokens do not require a refresh token. Do not add management scope to the customer Payroll consent URL.

Validate management token class, expiry and granted scope where returned. Keep its credentials distinct from customer access resolution. App-management tokens cannot be used by Payroll adapters or returned to client components. Cache only under a bounded server-side contract, with shared token-acquisition coordination to avoid an instance-wide token storm.

Use the exact documented token form and connection endpoints verified in A. Verify app-wide inventory coverage, any filtering/pagination, target identifiers and DELETE semantics with owned fixtures. The current user-oriented Identity specification alone does not prove those management inventory details. Management authentication failure is an operational incident and must not trigger fallback to a guessed endpoint or whole-user revocation.

Default to this management client for connection cleanup, so expired customer refresh tokens do not force retention of a duplicate refreshable credential set. A customer-token fallback may use the canonical owner coordinator when valid and explicitly necessary. Do not create independently rotating cleanup copies. There is no separate cleanup escrow by default; any unavoidable retention exception needs a bounded, documented security contract before activation.

### 12.2 Local disable and truthful receipt

A scoped explicit disconnect commits local disable, generation change and durable cleanup intent in one short transaction. Do not put remote DELETE in that transaction. Block new provider-operation admissions for the disabled binding; cancel unsent work and fence local result commits. Already dispatched payroll mutations may still complete and must retain their existing uncertain-outcome/reconciliation treatment.

Freeze the authorised disconnect scope: the known app connection links for this bound payroll file, not every connection belonging to its authoriser. Reconcile additional links only after establishing that they fall within the same authorised request. App-wide inventory visibility is not deletion authority.

Return a typed receipt through service, action, DTO, audit and interface:

```typescript
interface XeroDisconnectReceipt {
  localDisabled: boolean;
  cleanupRequestId: string;
  remoteStatus:
    | 'pending'
    | 'confirmed_deleted'
    | 'confirmed_absent'
    | 'partially_confirmed'
    | 'unknown'
    | 'blocked_authorisation';
  dataActionStatus: 'not_requested' | 'pending' | 'completed' | 'failed';
}
```

The precise public type may match existing conventions, but these distinctions must survive. Raw remote identifiers and sensitive provider evidence are not employee-facing DTO fields. Remove live `remoteRevoked` receipt consumers after migration.

Preserve soft-disconnect retention and existing explicitly chosen destructive-data behaviour. Make data removal a separate idempotent step with its own result, including a destructive request made after an earlier soft disconnect. Do not purge before needed provenance/intents are durable. Preserve binding/audit history and manual availability, and invoke existing publication/cache invalidation where required. No implicit data retention change is authorised.

### 12.3 Cleanup records and state machine

Use these logical per-target remote states:

| State | Meaning |
| --- | --- |
| `pending` | Eligible authorised target, no issued request recorded |
| `claimed` | Current worker owns a bounded claim; dispatch is not yet recorded |
| `dispatching` | Durable marker exists before the provider request; a crash can leave its outcome unknown |
| `confirmed_deleted` | Explicit successful deletion of the intended remote link |
| `confirmed_absent` | Reliable absence of the intended link under the verified endpoint/coverage contract |
| `unknown` | The request may have executed or evidence is insufficient |
| `blocked_authorisation` | Management/fallback authorisation prevents confirmation |
| `cancelled` | Unsent task superseded or no longer authorised |

Each attempt records its own ID, target connection/app/tenant, expected binding generation, request scope, lease owner/expiry, dispatch/deadline times, safe error/correlation metadata, retry timing and outcome evidence. Non-secret tombstones survive secret scrubbing.

A verified targeted DELETE `204` confirms deletion; a valid targeted endpoint's `404` can confirm absence. A misrouted endpoint, incomplete inventory, 401/403, invalid refresh grant, timeout or 5xx cannot. Use the exact validated connection UUID and authentication/endpoint contract; do not classify every generic 404 as successful cleanup. [X5]

Maintain the target set and aggregate outcome explicitly. One successful authoriser-link deletion does not confirm that every required connection for the payroll file was removed. Conversely, never revoke an owner's entire refresh grant merely to remove one binding. [X6]

### 12.4 Worker, retries and reconnect fencing

Implement `packages/jobs/src/handlers/reconcile-xero-connections.ts` with bounded ID enumeration and scoped target processing. Register through existing Inngest exports/serve registration. Durable intent and a periodic sweep recover missed dispatch. Use deterministic intent IDs and database claims; Inngest delivery deduplication alone is insufficient. Payloads contain IDs/generations, never credentials or payroll payloads.

Before dispatch, take the ordered locks, validate the exact target, scope, references and generation, then durably mark dispatch. A cancelled/old unsent task must make no remote call. Record remote responses in a short subsequent transaction with attempt-owner checks. Late responses may record historical outcome but cannot reactivate or overwrite a newer local lifecycle.

Reconnect/start/selection must not create a conflicting replacement while a destructive request is in flight or its outcome is unknown. A worker lease timeout does not prove that its earlier DELETE stopped. An inventory snapshot alone may show present absence without proving that a delayed destructive request can no longer affect a reused connection ID.

Permit automatic reconnect after all relevant issued attempts have a safe terminal outcome, or after verified provider identity semantics prove a late request cannot affect the new connection. Do not assume a reconnect always generates a different connection ID. Test delayed DELETE and identifier reuse with a fault-injecting provider.

Retry known-safe targeted cleanup under the same reservation with bounded exponential backoff, jitter and shared provider cooldown. Unknown attempts require reconciliation first; avoid concurrent destructive retries. Authentication failures require operational recovery rather than an unbounded hot loop. Deadlines cannot be reset indefinitely.

### 12.5 Abandoned sessions and superseded authorisers

Before clearing successful, expired or cancelled OAuth sessions, atomically retain non-secret auth-event/inventory provenance and possible cleanup candidates. Candidate status is not deletion authority.

Only clean up an unselected connection when the evidence establishes it was created by the relevant abandoned/partial flow, has no legitimate active reference and falls within the approved cleanup policy. Protect previously connected files returned by the same author's inventory. Unknown historic or foreign inventory remains report-only.

Reauthorisation by authoriser B must preserve authoriser A's remote link until its retirement is justified. A blanket tenant-level protection rule must not prevent legitimate removal of A's obsolete link when B's current verified link serves the same binding. Evaluate exact connection/owner references, not tenant ID alone. Deleting A's obsolete link must not impair A's different payroll files.

### 12.6 Operator resolution, not a hidden dead end

Add a restricted operator report and resolution procedure for unknown cleanup. Include request/attempt IDs, safe correlation information, targeted link, dispatch chronology, latest authoritative inventory evidence and required next action. Define an operational alert threshold, responsible owner and escalation route in configuration/runbook; thresholds are application policy, not Xero mandates.

For ambiguous issued DELETE, the procedure must either obtain provider-supported terminal evidence or establish safe identity separation before releasing the reservation. Preserve an escalation record when Xero support is needed. Do not offer a "force reconnect" button that discards unresolved destructive history, and do not mark support escalation as confirmed provider deletion.

**Verification:** request/body/DB/dispatch faults; 204/404/auth/rate/transient outcomes; local disable survives provider failure; missed delivery recovers; only owned targets are deleted; post-soft-disconnect data requests complete correctly; superseded authorisers remain isolated; old, late and duplicate work cannot corrupt a new generation; unknown state has an executable operator route.

## 13. Unit G: Permission-aware recovery and caller integration

### 13.1 Central error/recovery contract

Add a shared classifier at the provider boundary and carry a typed recovery reason through `XeroWriteError`, read Results and the neutral external-write port. Preserve compatibility where possible instead of scattering unrelated string codes.

| Evidence | Required response |
| --- | --- |
| Valid insufficient-scope challenge | `update_permissions`; no refresh attempt |
| Rejected/expired access token without a scope indication | At most one owner-coordinated refresh/reload and one safe retry |
| Insufficient scope on that retry | Still `update_permissions`, not generic stale credentials |
| Invalid refresh grant after controlled reconciliation | `reauthorise`; remote connection state remains independently known/unknown |
| Specific verified authoriser/tenant access denial | `check_xero_access`; affect the relevant link/capability, not unrelated tenants |
| Generic 403 | Actionable permission/access error without inventing the precise cause |
| Invalid OAuth client credentials or unreadable local encryption key | Operational configuration incident; do not tell every user they revoked consent |
| 429 | Shared cooldown and retry timing, no consent-revocation inference |
| 5xx/network/deadline after dispatch | Retry/defer reads; preserve unknown outcome for mutations |
| Store/configuration/decryption/deadline failure before dispatch | Definite non-attempt with appropriate operational/retry message |

Parse both `insufficent_scope` as printed in Xero's FAQ and standard `insufficient_scope`, including supported Bearer challenge formatting. Do not use substring matches against arbitrary raw bodies as authority. [X4]

A generic `getTenant() => null` must not erase a rate-limit, deadline, key or permission problem. Preserve recovery reason and request phase all the way to the user/job. Never convert an uncertain payroll write to a safe retry just because its wrapper classified the later refresh result differently.

### 13.2 Capability and job behaviour

Permission can vary by endpoint and tenant even for one credential owner. Store capability-specific recovery state where needed. A read-only operation need not be disabled solely because an unrelated write permission is absent. Credential-owner failure and tenant-specific access failure have different scope.

Classify both initial and retry responses. Background reads must not repeatedly refresh a grant that requires additional consent. Jobs consume typed retry metadata, use durable waits/retries for transient failures and surface terminal recovery needs. Service functions retain `Result`; job adapters translate retryable failure into the appropriate Inngest retry contract rather than resolving a failed job as success.

Thread binding generation into schedulers, manual sync dispatch and direct provider callers. Reject or cancel work admitted for an obsolete generation. Before persisting fetched data or a user-visible write result, validate the applicable current lifecycle or route the already-issued operation to existing reconciliation. Coordinate these narrow changes with Plan 159's run lifecycle; do not invent a second import orchestration system.

Complete the endpoint-to-scope matrix. Do not assume broad/read Payroll scopes are redundant merely because Accounting scopes changed. Only adjust requested scopes when the endpoint contract and an owned consent test support the change. Do not disconnect working customers to force a scope migration as part of this plan.

### 13.3 Interface and audit

Use existing Impeccable guidance and design-system components for every changed interface. Keep scope to Xero status, selection, errors, disconnect progress and recovery actions. Test keyboard/focus, loading/error states, light/dark and Australian English. Do not expose raw provider IDs or cross-account conflict details unnecessarily.

Use truthful copy, for example:

- "Sync stopped. Xero disconnection is pending."
- "Disconnected from Xero."
- "Update Xero permissions to continue."
- "Xero access needs to be renewed."
- "Xero is temporarily unavailable. Try again after [time]."

Do not present a queued job as a completed sync, a disabled connection as remotely deleted or a temporary store failure as customer revocation. Preserve existing authorised historical visibility and feed behaviour, with applicable stale/status messages rather than fabricated freshness.

Audit only allowlisted metadata: scoped operation IDs, reasons, transitions, attempt/version identifiers, correlation IDs and safe timing. Redact tokens, authorisation codes, state/nonces, URLs containing secrets, raw provider headers and payroll content. Restricted diagnostic records still require retention/access controls; "admin-only" does not make unrestricted raw logging acceptable.

**Verification:** exact refresh-call counts and recovery reason assertions; background retry tests; pre-dispatch versus post-dispatch mutation tests; scope isolation; browser status/action tests and secret-redaction tests. Preserve all existing outbound duplicate-prevention regressions.

## 14. Unit H: Inactivity, operational readiness and rollout

### 14.1 Report-only inactivity assessment

Implement a pure evaluator and scoped reporting query. Separate customer/service activity from API polling and token maintenance. Consider actual onboarding completion, active entitlement or authorised early-access service, enabled publication, feed consumption, explicit sync pause, cancellation/archive and retention decisions.

No recent login is not inactivity. Successful polling cannot make an abandoned account appear customer-active. Missing evidence is unknown. Verify how existing feed usage records treat cached and 304 requests before relying on them. Use current evidence rather than adding invasive analytics solely for cleanup.

Store policy version, candidate reason, uncertainty and review status. This plan sends no inactivity notices and performs no automatic inactivity-driven DELETE. Explicit disconnect and provably abandoned OAuth cleanup use their separate authorised paths.

Provide an operator-reviewed candidate report and a defined hand-off to the same targeted cleanup workflow. Future execution requires its concrete authority and notice/retention policy. Do not claim report-only classification alone proves an operational removal process or Xero certification. [X11], [X12]

### 14.2 Monitoring and configuration

Track safe aggregate metrics for refresh conflicts/failures, recovery age, permission-required bindings, disabled-but-remote-unknown bindings, cleanup attempts/age, budget denials, shared-store failures, deadline/body failures and migration conflicts. Avoid high-cardinality customer identity in public telemetry. Configure alert ownership and document remediation.

Preflight must validate the intended app identity/tier, callback, required scopes/capabilities, encryption key versions, shared rate store and execution mode for both app/API caller deployments. Verify all deployments sharing an OAuth app use the same canonical credential/lock domain as well as the same rate-budget domain. Separate databases with the same app/user credentials cannot each act as independent canonical owners. Do not solve that conflict by silently copying credentials or creating another Xero app.

Retain preview connection gating and registered callback behaviour. No secrets in preflight output. Review developer-portal ownership, collaborator access and responsibility for OAuth secret, encryption key and operational credential rotation. Portal collaboration is separate from Team Calendar customer roles. [X16]

### 14.3 Enablement controls

Use explicit configuration for canonical-credential cutover, shared-limiter readiness and remote-cleanup execution. Reuse an existing equivalent mechanism where present; do not create a generic feature-flag package. Defaults must fail safely: missing destructive-cleanup approval/configuration keeps processing report-only, while production readiness remains incomplete.

The binding guard is not a discretionary feature toggle. Once enabled, no rollback may restore silent payroll-file replacement. Similarly, loss of the shared store must not switch production back to process-local quota admission.

### 14.4 Rollout sequence

1. Capture source/database/configuration fingerprints, owned fixture inventory and recovery evidence. Produce a restricted duplicate/provenance report.
2. Apply additive expansion migrations on the existing authorised database. Verify constraints, backup/recovery provisions and unchanged payroll identity/counts.
3. Perform resumable credential/binding migration and verify all resolvable rows. Quarantine ambiguous rows with explicit recovery state; never choose account owners automatically.
4. Quiesce/drain incompatible old token writers and process-local rate callers across deployments. Canonical owner coordination and distributed budgets must not be undercut by an old deployment.
5. Switch credential readers/writers and binding guards; verify error/capability handling, callback and refresh recovery. Account conservatively for pre-cutover provider usage when enabling shared budgets.
6. Deploy and verify management read/report mode. Observe candidate sets and protected active references before enabling deletion.
7. Enable targeted cleanup only after authority, documented endpoint contract, owned live outcomes, generation fencing and operator recovery gates pass.
8. Run final configured-database, actual shared-store, browser and authorised live-provider scenarios on the same candidate. Record final merged/deployed SHA separately where deployment was authorised.
9. Scrub superseded secret copies only after canonical references and recovery envelopes are proven. Keep non-secret history and applicable old key material for legitimate retained ciphertext until safe retirement.

### 14.5 Rollback

Stop new provider admissions/cleanup workers when required, preserve local disable, reservations, attempt history and adopted canonical credentials, and restore only a compatible reviewed code version. Do not restore stale refresh tokens from a backup and immediately use them; restore service through controlled provider reconciliation or reauthorisation.

Do not reverse additive migrations by deleting payroll data. Never revert to silent rebinding, legacy independent token rotation or fail-open rate limiting. Unresolved issued DELETE requests remain unresolved even after application rollback. Report the actual reduced service and required operator action.

## 15. Verification commands and required scenarios

### 15.1 Commands

Commands below are defined by the inspected repository manifests unless explicitly marked as a new deliverable. Run workspace tests in the correct workspace. A fresh build may be needed before final typechecking to generate Next route types.

| Gate | Command | Required evidence |
| --- | --- | --- |
| Dependencies, executor worktree only | `bun install --frozen-lockfile` | Declared toolchain/lockfile honoured |
| Lint | `bun run check` | Exit zero |
| Build | `bun run build` | Exit zero for configured app/API/web build scope |
| Types | `bun run typecheck` | Exit zero after generated types exist |
| Boundaries | `bun run boundaries` | Exit zero |
| Unit suites | `bun run test` | Exit zero; required regressions executed |
| Xero units | `bun run --cwd packages/xero test` | New and existing provider regressions pass |
| Jobs units | `bun run --cwd packages/jobs test` | Retry, maintenance and registration contracts pass |
| Core units | `bun run --cwd packages/core test` | Transport/error contract tests execute |
| App Xero tests | `bun run --cwd apps/app test 'app/(authenticated)/settings/integrations/xero'` | Correct status, ownership and actions |
| Configured-database integration | `bun run test:integration` | Run only through the validated guarded target/manifest context |
| Focused database integration | `bun run --cwd packages/database test:integration` | Owned migration/lifecycle fixtures and cleanup pass |
| Focused provider integration | `bun run --cwd packages/xero test:integration` | Owned database/shared-store scenarios execute, as selected by existing configuration |
| Release tooling | `bun run test:release-tools` | Exit zero |
| Release-tool types | `bun run typecheck:release-tools` | Exit zero |
| Browser release suite | `bun run test:release` | Guarded owned browser fixtures, changed Xero flows and cleanup pass |
| Authorised additive migration | `bun run migrate:deploy` | Reviewed migration applies to the existing selected target |
| Whitespace | `git diff --check` | Exit zero |

Integration scripts currently set `ALLOW_LOCAL_DATABASE_TESTS` and match `.integration.test.ts`; positional filtering may still run more tests than requested. Confirm the actual selected suites. Do not treat zero collected tests, omitted required scenarios or broader unowned fixture mutations as success. Do not run integration against an unguarded remote URL.

Use the existing Plan 160/release manifest runner for real provider evidence. Extend its interface rather than guessing a CLI name or creating another testing system. Document the exact executable invocation in the execution report once implemented. This new runner/report capability is a deliverable, not a command claimed to exist at the baseline.

### 15.2 Test locations and patterns

Extend existing `src/oauth/service.test.ts`, `service.integration.test.ts`, `disconnect.integration.test.ts`, crypto tests, `src/adapter/auth-recovery.test.ts`, rate-limit tests, scheduler tests, Xero tenancy tests and app connect/settings action tests.

Recommended new files, where an equivalent does not already exist:

```text
packages/xero/src/oauth/credential-owner.test.ts
packages/xero/src/oauth/credential-owner.integration.test.ts
packages/xero/src/oauth/management-client.test.ts
packages/xero/src/oauth/connection-cleanup.test.ts
packages/xero/src/oauth/connection-cleanup.integration.test.ts
packages/xero/src/oauth/inactivity-policy.test.ts
packages/xero/src/rate-limit/shared-store.test.ts
packages/xero/src/rate-limit/shared-store.integration.test.ts
packages/xero/src/rate-limit/deadline.test.ts
packages/database/xero-lifecycle-migration.integration.test.ts
packages/jobs/src/handlers/reconcile-xero-connections.test.ts
packages/jobs/src/handlers/reconcile-xero-connections.integration.test.ts
```

Match existing test configuration and module boundaries. Do not create empty files to satisfy path checks. Name actual assertions in the evidence report. Use deterministic clocks, controlled HTTP faults, database barriers and independent store clients. Distinguish a mock provider with real infrastructure from real Xero evidence.

### 15.3 Mandatory regression/evidence matrix

Legend: **U** unit/fault injection; **D** configured real database with owned fixtures; **R** actual configured shared Redis; **B** guarded browser; **X** authorised owned Xero provider evidence. Do not force provider-side faults or rate exhaustion simply to obtain X evidence; synthetic faults prove those failure paths and safe live cases prove the real contract.

| Case | Scenario and required assertion | Minimum |
| --- | --- | --- |
| 161-01 | Wrong-file reconnect rejects without changing the selection transaction or dispatching sync | U, D, B |
| 161-02 | Same-file reconnect preserves internal payroll/person/feed identities and uses renewed credentials | U, D, X |
| 161-03 | Concurrent cross-account claims yield one reserved external binding and a non-disclosing conflict | U, D |
| 161-04 | Two sessions for one entity, expiry, replay and tampered intended organisation cannot bypass intent | U, D, B |
| 161-05 | Callback initiated before disconnect cannot reactivate the old binding generation | U, D |
| 161-06 | Reserved-slot CHECK, both uniqueness directions, scoped FKs and historical NULL rows behave correctly | D |
| 161-07 | Same authoriser/two payroll files share coordinated usable credentials without sharing payroll access | U, D, X |
| 161-08 | Same verified authoriser across two Clerk accounts grants no cross-account access or new binding | U, D |
| 161-09 | Repeated authorisation and reversed/same-second callback arrival cannot overwrite a known newer usable owner set | U, D, X for normal repeated consent |
| 161-10 | Authorise B then abandon selection: A remains serviceable; B is not implicitly bound | U, D, X |
| 161-11 | Token exchange succeeds, inventory/body/persistence fails: candidate/attempt remains recoverable without blind code replay | U, D |
| 161-12 | Second authoriser reconnects same file; retiring old link preserves the new link and unrelated old-authoriser files | U, D, X |
| 161-13 | Concurrent refresh, adoption, disconnect and key re-encryption do not lose the winning token or resurrect a binding | U, D |
| 161-14 | Lost refresh response/commit acknowledgement and grace-window expiry have controlled distinct recovery | U, D |
| 161-15 | Empty/scrubbed ciphertext or a changed inactive token is not reported as successful refresh | U, D |
| 161-16 | Unknown encryption version/corrupt envelope fail safely; old/new versions coexist and re-encryption is CAS-safe | U, D |
| 161-17 | Management token without refresh token parses correctly and cannot reach Payroll adapters | U, X for token contract |
| 161-18 | Management inventory coverage and exact-target DELETE/absence are evidenced, with no guessed pagination | U, X |
| 161-19 | Local disable remains committed through provider outage; aggregate receipt stays pending/partial/unknown truthfully | U, D, B |
| 161-20 | DELETE success, valid absence, auth denial, rate limit, 5xx and timeout are distinct outcomes | U; X for safe success/absence |
| 161-21 | Old unsent cleanup cancels without a provider call; issued unknown/late cleanup cannot permit unsafe reconnect | U, D |
| 161-22 | Lost/duplicate Inngest delivery and crash before/after dispatch recover without uncontrolled duplicate deletion | U, D |
| 161-23 | Session scrubbing preserves non-secret provenance; no duplicate independently rotating cleanup token survives | U, D |
| 161-24 | Unselected prior/foreign connections are protected; abandoned new-link candidates require specific evidence | U, D, X for inventory mapping |
| 161-25 | Repeat soft disconnect, later destructive request and failed data action have idempotent truthful outcomes | U, D, B |
| 161-26 | Two processes share aggregate tenant minute/day/concurrency and app-wide allowance across tenants | U, R |
| 161-27 | Rolling boundaries, delayed headers, retry cooldown, request-ID replay, owner release and crash expiry do not over-admit | U, R |
| 161-28 | Missing/lost store state, malformed result or outage prevents provider dispatch; no process-local fallback | U, R |
| 161-29 | Payroll daily exhaustion does not masquerade as a token/connection-management tenant quota | U, R |
| 161-30 | Absolute deadline survives lock waits, retries and a slow body; permits/timers/listeners are cleaned up | U; controlled integration |
| 161-31 | Missing scope on first/retry response yields update-permissions and exact permitted refresh count | U, B, X for approved scope case |
| 161-32 | Tenant permission failure, owner invalid grant and app-credential failure have different impact scopes | U, D |
| 161-33 | Pre-dispatch rejection is a definite non-attempt; post-dispatch lost payroll response remains uncertain and is not replayed | U, D |
| 161-34 | Old-generation jobs/results are cancelled/fenced without misreporting successful sync | U, D |
| 161-35 | Active feed with no login, deliberately paused service and missing evidence never trigger inactivity deletion | U, D |
| 161-36 | Legacy duplicates/unverified identity stop affected backfill safely; reruns preserve every payroll ID and owned cleanup | U, D |
| 161-37 | Tokens/codes/state/payroll payloads and foreign identity do not appear in DTOs, logs, jobs or public evidence | U, D, B |
| 161-38 | Origin/redirect/JWKS checks reject credential exfiltration and identity substitution; test overrides cannot operate in production | U |
| 161-39 | Final code has no independently rotating legacy credential consumers and no direct quota bypass | Source audit, U, D |
| 161-40 | Same candidate passes required gates, safe rollout controls and reduced-service/rollback procedures | D, R, B, authorised X |

## 16. Completion, evidence and blocked operations

### 16.1 Evidence schema

Produce Markdown and machine-readable JSON even when prerequisites are missing or tests fail. Each required case records:

```text
caseId
requirement
requiredEvidenceLevels
status: PASS | FAIL | NOT_VERIFIED
candidateSha
executedAt
nonSecretTargetFingerprint
commandOrRunnerScenario
exitCodeOrObservedResult
expectedAssertion
observedAssertion
restrictedEvidenceLocations
fixtureOwnershipReference
cleanupStatus
remainingAction
```

Use separate top-level status for source checks, configured-database tests, distributed-store tests, browser tests and live provider verification. Record local integration SHA and deployed SHA separately. Real provider identifiers and customer diagnostics belong in access-controlled evidence, not public repository reports.

The runner exits zero only when all required selected cases pass; use non-zero for failed assertions or missing mandatory prerequisites and record which. A required skipped scenario is NOT_VERIFIED. Never report a mocked HTTP test as live Xero proof, or a single-process fake as distributed-store proof.

### 16.2 Source implementation complete

- [ ] All units' source changes, new meaningful tests, migrations, configuration validation and documentation are implemented within scope.
- [ ] Database-free lint/build/types/boundary/unit gates and release-tool tests/types pass on the final reviewed source candidate.
- [ ] No live consumer uses the old boolean disconnect receipt; targeted searches and full diff review confirm migration of direct token/status consumers.
- [ ] Binding guards are transactional; ownership constraints and safe migration/backfill tooling exist.
- [ ] Canonical credential coordination, verified identity, key-version handling and refresh persistence recovery are implemented, not deferred as an investigation.
- [ ] Distributed admission is fail-closed with no deployed local fallback, and request/body deadlines are enforced.
- [ ] Management cleanup is durably recorded, narrowly authorised, correctly fenced and truthful about unknown outcomes.
- [ ] Permission, credential, configuration, infrastructure and ambiguous-write outcomes remain distinct through application/job boundaries.
- [ ] Impeccable review covers every changed UI element, and required browser assertions are implemented.
- [ ] Independent advisor review approves the scoped source diff; the supervising host integrates passing changes locally and verifies the integrated state.

An approved source-only change can be integrated with unsafe/unverified runtime capabilities kept disabled. This is not a production-readiness approval. Keep the plan IN PROGRESS while mandatory infrastructure/provider evidence is outstanding.

### 16.3 Production-hardening sign-off

- [ ] Source-completion criteria hold on the integrated candidate.
- [ ] Reviewed additive migrations and protected integration suites pass on the existing configured database, with verified fixture cleanup.
- [ ] Actual shared-store multi-client tests pass; deployment atomicity, persistence and cutover accounting are established.
- [ ] Required owned browser and live Xero cases pass under applicable authority, including repeated consent, multiple tenants/authorisers, scope recovery and management cleanup.
- [ ] All app/API caller deployments share the intended credential and budget coordination domains and are running compatible code; no legacy writer remains active.
- [ ] Actual app tier, callback, scope availability, management capability and retained encryption key versions are evidenced.
- [ ] Unknown remote outcomes, migration conflicts and operational failures have usable owner/escalation procedures; there is no hidden force-reconnect bypass.
- [ ] No unwanted fixture/provider links, test keys or temporary credentials remain. Approved retained evidence/unknown tombstones have an owner and retention reason.
- [ ] No inactive-customer notices or automatic inactivity deletion occurred under this plan.
- [ ] Reports identify every required case and its actual evidence. Plan index changes to DONE only when its full agreed sign-off criteria pass.

Report Plan 159/160/go-live status separately. Plan 161 cannot certify AU payroll semantics, import completeness, full product readiness or Xero App Store approval by implication.

### 16.4 When to pause an affected operation

Pause only the dependent operation and record the exact evidence/action needed when ownership is ambiguous, a live target is unowned, an external mutation lacks authority, the required provider contract cannot be established, current shared-store topology cannot enforce the design, legacy identities cannot be verified, or a migration would require prohibited reset/purge behaviour.

Continue independent implementation and tests. Fix failing code and tests rather than requesting another planning round. Do not introduce arbitrary "stop after two failures" behaviour into the product implementation; the installed advisor's own review limits are separate. Never bypass guards, invent a provider capability, claim a test ran or make a larger retention/payroll product decision to avoid a blocked gate.

## 17. Reference register and execution hand-off

### 17.1 Current source map

Repository references are pinned to the inspected baseline. Paths are executable investigation targets, not claims that every file in the repository was newly audited.

| Reference | Source |
| --- | --- |
| R1 | [OAuth selection, refresh, disconnect and persistence recovery][R1] |
| R2 | [Prisma connection, tenant and OAuth session models][R2] |
| R3 | [Current process-local limiter][R3] |
| R4 | [Current HTTP wrapper][R4] |
| R5 | [Version-one encryption implementation][R5] |
| R6 | [Shared Redis REST transport][R6] |
| R7 | [Provider-neutral write-error contract][R7] |
| R8 | [Xero write adapter][R8] |
| R9 | [Protected integration fixture allocation][R9] |
| R10 | [Scheduler and dormant refresh maintenance][R10] |
| R11 | [Root executable scripts/toolchain][R11] |
| R12 | [Database scripts and Prisma version][R12] |
| R13 | [Plan 159][R13] |
| R14 | [Plan 160][R14] |
| R15 | [Release plan index][R15] |

### 17.2 Xero and skill references

Readable FAQs/specification/SDK evidence was checked during this conversation. Several detailed guide URLs returned a JavaScript shell in the final retrieval; retain that distinction in the provider ledger and re-read the full relevant contracts during Unit A. A link in this list does not establish live access or entitlement.

| Reference | Purpose |
| --- | --- |
| X1 | [OAuth FAQ][X1]: lifetime and lost-response recovery |
| X2 | [Developer pricing][X2]: tier-dependent limits and entitlements |
| X3 | [Limits FAQ][X3]: quota/concurrency/header behaviour |
| X4 | [Granular scopes FAQ][X4]: consent and insufficient-scope handling |
| X5 | [Official Identity OpenAPI][X5]: connection metadata, event filtering and targeted deletion |
| X6 | [Official Node SDK][X6] and [token/client source][X6a]: token and connection distinctions |
| X7 | [Client-credentials guide][X7]: non-tenanted app management |
| X8 | [Managing connections][X8]: app connection management and target semantics |
| X9 | [Multi-tenancy][X9]: authoriser/tenant relationships |
| X10 | [Managing tokens and IDs][X10]: credential lifecycle and identity |
| X11 | [Designing a connection cleanup routine][X11] |
| X12 | [Identifying inactive connections][X12] |
| X13 | [Custom integration FAQ][X13]: management grant versus Custom Connections |
| X14 | [Authorisation-code flow][X14] and [OAuth overview][X14a] |
| X15 | [Token types][X15], [scopes][X15a] and [tenants][X15b] |
| X16 | [Collaborator role management][X16]: developer-portal operations |
| X17 | [Bulk connections][X17]: reference only, not part of this implementation |
| X18 | [OAuth limits][X18], [troubleshooting][X18a] and [PKCE][X18b] |
| S1 | [Improve skill][S1]: advisor versus executor responsibilities |
| S2 | [Improve execution/reconciliation reference][S2]: worktree hand-off and independent review |

### 17.3 Plan index reconciliation

Use one active Plan 161 row. Suggested index text:

> **161: Xero API production hardening, TODO.** Owns Plan 159 X5/X6 and Step 3 through this consolidated binding, credential, transport and cleanup contract. Plan 159 retains import, people, AU semantics and onboarding work. Plan 160 supplies end-to-end evidence. Implement in units A–H. Required live and distributed-store verification starts NOT VERIFIED; no readiness claim follows from planning.

### 17.4 Executor report

Return the skill's required execution report and attach the detailed evidence:

```text
STATUS: COMPLETE | STOPPED
STEPS: each unit, implementation result, verification commands and outcomes
STOPPED BECAUSE: affected prerequisite or gate, when applicable
FILES CHANGED: exact paths and requirement mapping
SOURCE VERIFICATION: PASS | FAIL | NOT_VERIFIED
CONFIGURED DATABASE VERIFICATION: PASS | FAIL | NOT_VERIFIED
SHARED STORE VERIFICATION: PASS | FAIL | NOT_VERIFIED
LIVE XERO VERIFICATION: PASS | FAIL | NOT_VERIFIED
LOCAL INTEGRATION: target branch and verified commit, or explicit remaining action
REMOTE ACTIONS: performed under applicable authority, or not performed
CLEANUP: fixture/provider/key cleanup evidence and approved retained records
NOTES: justified deviations, uncertainty and exact remaining actions
```

Do not end implementation by merely listing unfixed findings, suggesting another audit or waiting at a passing worktree. Complete the authorised work, integrate independently reviewed passing source locally, and state external verification limits accurately.

[R1]: https://github.com/hiltonbrown/team-calendar/blob/585f6cb4d2532bfa23eb8fb455ad0d360d7e16fe/packages/xero/src/oauth/service.ts
[R2]: https://github.com/hiltonbrown/team-calendar/blob/585f6cb4d2532bfa23eb8fb455ad0d360d7e16fe/packages/database/prisma/schema.prisma
[R3]: https://github.com/hiltonbrown/team-calendar/blob/585f6cb4d2532bfa23eb8fb455ad0d360d7e16fe/packages/xero/src/rate-limit/limiter.ts
[R4]: https://github.com/hiltonbrown/team-calendar/blob/585f6cb4d2532bfa23eb8fb455ad0d360d7e16fe/packages/xero/src/rate-limit/xero-fetch.ts
[R5]: https://github.com/hiltonbrown/team-calendar/blob/585f6cb4d2532bfa23eb8fb455ad0d360d7e16fe/packages/xero/src/crypto/tokens.ts
[R6]: https://github.com/hiltonbrown/team-calendar/blob/585f6cb4d2532bfa23eb8fb455ad0d360d7e16fe/packages/core/src/redis-rest-transport.ts
[R7]: https://github.com/hiltonbrown/team-calendar/blob/585f6cb4d2532bfa23eb8fb455ad0d360d7e16fe/packages/core/src/ports/external-write-port.ts
[R8]: https://github.com/hiltonbrown/team-calendar/blob/585f6cb4d2532bfa23eb8fb455ad0d360d7e16fe/packages/xero/src/adapter/xero-write-adapter.ts
[R9]: https://github.com/hiltonbrown/team-calendar/blob/585f6cb4d2532bfa23eb8fb455ad0d360d7e16fe/packages/database/src/live-test-fixture.ts
[R10]: https://github.com/hiltonbrown/team-calendar/blob/585f6cb4d2532bfa23eb8fb455ad0d360d7e16fe/packages/jobs/src/handlers/schedule-xero-syncs.ts
[R11]: https://github.com/hiltonbrown/team-calendar/blob/585f6cb4d2532bfa23eb8fb455ad0d360d7e16fe/package.json
[R12]: https://github.com/hiltonbrown/team-calendar/blob/585f6cb4d2532bfa23eb8fb455ad0d360d7e16fe/packages/database/package.json
[R13]: https://github.com/hiltonbrown/team-calendar/blob/585f6cb4d2532bfa23eb8fb455ad0d360d7e16fe/plans/159-xero-sync-and-onboarding.md
[R14]: https://github.com/hiltonbrown/team-calendar/blob/585f6cb4d2532bfa23eb8fb455ad0d360d7e16fe/plans/160-xero-end-to-end-verification-and-report.md
[R15]: https://github.com/hiltonbrown/team-calendar/blob/585f6cb4d2532bfa23eb8fb455ad0d360d7e16fe/plans/README.md
[X1]: https://developer.xero.com/faq/oauth2
[X2]: https://developer.xero.com/pricing
[X3]: https://developer.xero.com/faq/limits
[X4]: https://developer.xero.com/faq/granular-scopes
[X5]: https://github.com/XeroAPI/Xero-OpenAPI/blob/master/xero-identity.yaml
[X6]: https://github.com/XeroAPI/xero-node/blob/master/README.md
[X6a]: https://github.com/XeroAPI/xero-node/blob/master/src/XeroClient.ts
[X7]: https://developer.xero.com/documentation/guides/oauth2/client-credentials/
[X8]: https://developer.xero.com/documentation/best-practices/managing-connections/connections/
[X9]: https://developer.xero.com/documentation/best-practices/managing-connections/multi-tenancy/
[X10]: https://developer.xero.com/documentation/best-practices/data-integrity/managing-tokens/
[X11]: https://developer.xero.com/documentation/best-practices/managing-connections/designing-and-implementing-connection-cleanup-routine/
[X12]: https://developer.xero.com/documentation/best-practices/managing-connections/identifying-inactive-connections/
[X13]: https://developer.xero.com/faq/custom-integration
[X14]: https://developer.xero.com/documentation/guides/oauth2/auth-flow
[X14a]: https://developer.xero.com/documentation/guides/oauth2/overview
[X15]: https://developer.xero.com/documentation/guides/oauth2/token-types
[X15a]: https://developer.xero.com/documentation/guides/oauth2/scopes
[X15b]: https://developer.xero.com/documentation/guides/oauth2/tenants
[X16]: https://developer.xero.com/documentation/guides/collaborators/overview/#role-management
[X17]: https://developer.xero.com/documentation/xero-app-store/app-partner-guides/app-partner-features/#bulk-connections
[X18]: https://developer.xero.com/documentation/guides/oauth2/limits
[X18a]: https://developer.xero.com/documentation/guides/oauth2/troubleshooting
[X18b]: https://developer.xero.com/documentation/guides/oauth2/pkce-flow
[S1]: https://github.com/shadcn/improve/blob/main/skills/improve/SKILL.md
[S2]: https://github.com/shadcn/improve/blob/main/skills/improve/references/closing-the-loop.md
