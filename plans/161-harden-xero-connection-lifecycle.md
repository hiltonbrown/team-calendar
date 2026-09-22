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
| Source baseline | `8652c31`, re-stamped from `585f6cb4d2532bfa23eb8fb455ad0d360d7e16fe`. The only changes between those commits are under `plans/`, so every source excerpt below is valid at both. All sub-plans use `8652c31` |
| Review scope | Attached Plan 161, this conversation, relevant repository source and existing plans, Xero references and the upstream `improve` execution contract |
| Implementation status | TODO. No source implementation, database migration or live provider test was performed to produce this document |
| Priority | P1 production-hardening programme; binding and credential correctness are release-blocking |
| Effort | XL. Eight dependent units; each of B–H is an L on its own. Do not attempt in one sitting |
| Change risk | HIGH: credential adoption, cross-account infrastructure, migrations and external deletion |
| Category | security, correctness, migration, tech-debt |
| Depends on | None. Coordinates with `plans/159-xero-sync-and-onboarding.md` and `plans/160-xero-end-to-end-verification-and-report.md` |
| Plan file | `plans/161-harden-xero-connection-lifecycle.md`. This is the single active Plan 161; do not create a second Plan 161 file under any other name |
| Execution branch | `codex/xero-connection-hardening`, created from the current release/execution branch. Do not push it |

### 1.0 Drift check, run before anything else

```bash
git rev-parse --short HEAD
git diff --stat 8652c31..HEAD -- \
  packages/xero packages/database packages/jobs packages/core packages/availability \
  packages/next-config apps/app apps/api tooling/release PRODUCT.md
```

At the time this plan was last reviewed, that diff was **empty**: no in-scope source file
had changed since the baseline, so every excerpt in Section 2.0 was live. The permalink URLs in
Section 10.1 stay pinned to `585f6cb` because that commit is immutable; read the local paths. If the diff is now
non-empty, open each changed file listed in Section 2.0 and compare it against the excerpt
before proceeding. A mismatch is a STOP condition (Section 9.5), not something to work around.

The remote baseline was rechecked. This does not establish that the executor's local branch, uncommitted files, environment, database or deployment is unchanged or clean.

### 1.1 Relationship to other plans

Plan 161 owns Plan 159's **X5 and X6 / Step 3** requirements: immutable payroll binding, safe reconnect and coordinated authorisation lifecycle. Preserve those requirements and mark them as **implemented through Plan 161**, not rejected or removed. In particular, coordinated credential ownership is required by this plan, not a deferred investigation.

Plan 159 retains import completeness, employee/person reconciliation, initial-import orchestration, AU submission/approval semantics, onboarding readiness and calendar freshness. Plan 161 may change their direct callers only to pass lifecycle, credential, error or deadline contracts. Do not rewrite their workflows or silently change AU approval behaviour.

Plan 160 retains end-to-end execution and reporting. Extend its scenario coverage with this plan's evidence matrix, without duplicating its harness. `plans/go-live.md` retains release-wide readiness and deployment gates. Passing Plan 161 does not certify those other programmes.

### 1.2 Required artefacts

Maintain this plan, `plans/161-xero-provider-contract.md` and `plans/161-xero-execution-report.md`. The report must reference a machine-readable JSON evidence file produced by the release harness. Update the plan index and relevant Plan 159/160 cross-references. Preserve unrelated work and historical evidence.

Provider contracts must distinguish **public documentation**, **selected Team Calendar policy**, **source observation**, **inference** and **live verification**. No previous assistant verdict or historical test result is a substitute for fresh execution evidence.

## 2. Evidence and corrections carried into this plan

### 2.0 Current state, verified at the baseline commit

Every path and line below was opened and confirmed at `585f6cb` and re-confirmed at `8652c31`. Read these files locally.
The GitHub URLs in Section 10.1 are a convenience only; the executor works from the local
repository and must not depend on network access to read its own source.

| File | Lines | Role, and what is wrong with it today |
| --- | --- | --- |
| `packages/xero/src/oauth/service.ts` | 2,361 total; `completeXeroTenantSelection` at 380; the rebinding `update` at 565-578; refresh-persistence reconciliation at 888-1010; disconnect at 1286-1490; `remoteRevoked` decisions at 1666-1669 | OAuth start/callback/selection, refresh, persistence recovery and disconnect all live here. H1, H2, H4, H6, H7 |
| `packages/xero/src/rate-limit/limiter.ts` | 262 total; `XeroRateLimiter` at 79; `private readonly orgStates = new Map(...)` at 83; `concurrency = new Map(...)` at 84 | Process-local, per-instance rate state. H5 |
| `packages/xero/src/rate-limit/xero-fetch.ts` | 191 total; `orgRateLimitKey` at 58 | Keys budgets by `{ clerkOrgId, organisationId }`, i.e. internal IDs, not the external Xero tenant. H5 |
| `packages/xero/src/rate-limit/limits.ts` | 16 total | Hard-codes `XERO_CALLS_PER_DAY_PER_ORG = 5000` with no tier input, and `DEFAULT_MAX_WAIT_MS = 65_000`, which exceeds the 15s/20s OAuth transaction timeouts. H5, H6 |
| `packages/xero/src/crypto/tokens.ts` | 93 total; `keyVersion: number` at 37; `keyVersion: 1` written at 54 | Envelope records a version but decryption uses one configured key; the field is metadata, not a selector. H10 |
| `packages/core/src/redis-rest-transport.ts` | 288 total; `setupTimeoutSignal` at ~186; `cleanup()` at 243; `await response.json()` at 247 | The timeout is cancelled before the body is read, so a stalled body is unbounded. H9 |
| `packages/core/src/ports/external-write-port.ts` | 110 total | Provider-neutral write error contract carrying `certainty`. Extend, do not replace. H8 |
| `packages/xero/src/adapter/xero-write-adapter.ts` | 386 total; `getTenant` at 71-87 | `getTenant` returns `null` for both "not connected" and "could not be refreshed", collapsing distinct recovery categories. H8 |
| `packages/database/prisma/schema.prisma` | 1,219 total | No unique constraint on an active external tenant binding. H1 |
| `packages/database/src/live-test-fixture.ts` | 265 total; 21 suites registered | Owns tenant slots and a fixed set of global key kinds. H12 |
| `packages/jobs/src/handlers/schedule-xero-syncs.ts` | 433 total | Reads credential/status fields directly; must move to the new resolver. H11 |
| `packages/availability/src/xero-connection-state.ts` | 53 total; `hasActiveXeroConnection` consumed at `approvals/approval-service.ts:809,1152` and `people/people-service.ts:666` | Boolean connection state that hides infrastructure failure. H11 |

The exact current text of the three behaviours this plan removes:

```typescript
// packages/xero/src/oauth/service.ts:565-578 - an existing internal XeroTenant
// silently receives a different external ID on reconnect.
update: {
  payroll_region: payrollRegion,
  tenant_name: selectedTenant.tenantName,
  xero_tenant_id: selectedTenant.tenantId,
}

// packages/xero/src/oauth/service.ts:922-924 - different ciphertext alone
// currently counts as committed recovery.
const tokenChanged =
  input.loadedRefreshTokenEncrypted !== null &&
  current.refresh_token_encrypted !== input.loadedRefreshTokenEncrypted;

// packages/xero/src/crypto/tokens.ts:54 - envelope metadata is not a key selector.
keyVersion: 1,

// packages/core/src/redis-rest-transport.ts:243-247 - the timer is cleared
// before the body is consumed.
cleanup();
let payload: unknown;
try {
  payload = await response.json();
```

Conventions this plan must match, from `CLAUDE.md` and the existing code:

- Service functions return `Result<T, E>` from `@repo/core`; route handlers map to HTTP. Do not throw for expected failures. See `packages/core/src/ports/external-write-port.ts` for the established error shape.
- Named exports only, no default exports, no barrel files except at package root, strict TypeScript, no `any`, no unjustified `as`.
- Zod on all external input, including every Xero response.
- Database: `snake_case` plural tables, `snake_case` columns, `id`/`created_at`/`updated_at` on every table, `clerk_org_id` on every tenant-scoped table. Section 5.2 defines the only permitted exception and requires it to be documented and tested.
- Unit tests are co-located as `foo.test.ts`. Integration tests live at the **package root** in `packages/database` (see the existing `packages/database/xero-tenancy.integration.test.ts`) and co-located under `src/` in `packages/xero` and `packages/jobs`.
- Australian English in all UI copy, comments and documentation. No em dashes anywhere.
- No `console.log`; use the `@repo/observability` logger.

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

Use the source register in Section 10. The readable current Xero FAQs establish 30-minute access-token life, expiry of unused refresh tokens after 60 days, the 30-minute lost-refresh-response recovery window, and permission-specific `WWW-Authenticate` handling. The pricing table distinguishes Starter's 1,000 daily tenant calls from 5,000 on higher tiers. The Identity specification establishes connection metadata, authorisation-event filtering and targeted DELETE outcomes. [X1], [X2], [X3], [X4], [X5]

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

Each unit is complete only when its own command below exits zero, in addition to the
whole-repository gates in Section 8.1. Run the unit command before moving to the next unit.

| Unit | Minimum command for that unit | Expected |
| --- | --- | --- |
| A | `bun run --cwd packages/database test` | exit 0; updated `live-test-fixture.test.ts` suite-count assertions pass |
| B | `bun run --cwd packages/xero test && bun run --cwd packages/database test` | exit 0; new `completeXeroTenantSelection` rejection tests present and passing |
| C | `bun run --cwd packages/core test && bun run --cwd packages/xero test` | exit 0; new transport deadline and crypto key-version tests present and passing |
| D | `bun run --cwd packages/xero test` | exit 0; new `oauth/credential-owner.test.ts` passing |
| E | `bun run --cwd packages/xero test` | exit 0; new `rate-limit/shared-store.test.ts` passing |
| F | `bun run --cwd packages/xero test && bun run --cwd packages/jobs test` | exit 0; new `reconcile-xero-connections.test.ts` passing |
| G | `bun run --cwd packages/availability test && bun run --cwd apps/app test` | exit 0; recovery-reason assertions present and passing |
| H | `bun run test:release-tools && bun run typecheck:release-tools` | exit 0 |

### 6.1 Advisor and executor responsibilities

Read the locally installed `improve` skill and its execution reference. The repository identifies `shadcn/improve`; current upstream describes a source-read-only advisor and a separate worktree executor. Do not silently edit or replace the installed skill. [S1], [S2]

The advisor reconciles this plan, dispatches a separate implementation executor, reviews the complete diff and records APPROVE, REVISE or BLOCK. The executor makes source changes and runs verification in an isolated worktree. Inline this entire plan in its hand-off; a worktree may not contain uncommitted plan files. Include the actual target branch, applicable authority, completed dependencies and evidence locations.

The advisor maintains `plans/README.md` in accordance with the skill's hand-off contract. The executor updates scoped task records and implementation evidence. Any requirement that cannot be verified must remain explicitly unverified, not be hidden in a COMPLETE status.

After independent approval and required passing gates, the supervising host or executor, **outside the advisor's source-read-only role**, integrates locally into the existing execution/release branch under the user's established local integration authority. Verify the merged state before removing its temporary worktree/branch. No remote push, deployment or real provider mutation is implied.

If the installed skill limits review rounds, obey its review mechanism and record its verdict accurately. A host may arrange a refined, scoped repair outside that advisor invocation; do not turn a review-round limit into a claim that the defect is solved, or silently waive a gate. Where worktree/subagent execution is unavailable, hand this complete plan to a separate implementation session and state that limitation. Do not simulate execution.

## 7. Executable sub-plans

This document is the **programme charter**. It holds the boundaries, the target architecture, the
evidence matrix and the reference register that all eight units share. It is **not itself
executable**: the work lives in the eight sub-plans below, each written to the handoff-plan
template so a single executor with no other context can run one unit end to end.

Execute them in this order. Each sub-plan carries its own Current state excerpts, Commands,
Scope, Steps with verification gates, Test plan, Done criteria, STOP conditions and Maintenance
notes, and each repeats whatever it needs from this charter rather than referring back to it.

| Sub-plan | Unit | What will be true when it lands | Effort | Risk | Depends on |
| --- | --- | --- | --- | --- | --- |
| [161a](161a-xero-baseline-and-fixture-ownership.md) | A | Provider contract ledger exists; protected fixtures own every record kind the later plans create | M | LOW | none |
| [161b](161b-xero-immutable-tenant-binding.md) | B | An internal payroll entity can no longer silently acquire a different external Xero tenant, enforced in the service **and** in the database | L | HIGH | 161a |
| [161c](161c-xero-deadlines-and-key-versioning.md) | C | One absolute deadline survives lock waits, retries and response bodies; token encryption resolves a real keyring by envelope version | M | MED | 161a |
| [161d](161d-xero-canonical-credentials.md) | D | One canonical credential set per **verified Xero authoriser**, reached only through `resolveXeroAccess`; changed ciphertext is no longer treated as proof of a committed refresh | L | HIGH | 161b, 161c |
| [161e](161e-xero-shared-rate-limits.md) | E | Rate budgets are shared across deployments, keyed by external Xero tenant, tier-aware and fail-closed | L | HIGH | 161a, 161c; consumes 161d |
| [161f](161f-xero-management-cleanup.md) | F | Disconnect commits locally at once and returns a receipt that can say `unknown` honestly; remote deletion is fenced, per-target and narrowly authorised | L | HIGH | 161b, 161c, 161d, 161e |
| [161g](161g-xero-permission-recovery.md) | G | Every distinct failure has its own actionable recovery reason, and no caller reads credentials directly | L | MED | 161d, 161e; integrates 161f |
| [161h](161h-xero-rollout-and-inactivity.md) | H | Report-only inactivity assessment, metrics, preflight, evidence runner and a documented rollout and rollback | M | MED | 161b-161g |

161a is the only unblocked starting point. After it, 161b and 161c can proceed in parallel; assign
**one** owner to the schema and credential contract so two agents cannot implement incompatible
ownership models in the same service. Remote cleanup (161f) stays disabled until its dependencies
pass.

Sections 8 to 14 of earlier revisions of this charter described each unit inline. That content now
lives in the sub-plans, which are the authority. Sections 1 to 6 below remain the shared contract;
Sections 15 to 17 remain the shared verification matrix, sign-off criteria and references.

## 8. Verification commands and required scenarios

### 8.1 Commands

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
| Browser release suite, **deployed candidate only** | `bun run test:release` | Guarded owned browser fixtures, changed Xero flows and cleanup pass. Requires six `TC_*` variables and Firefox/WebKit; runs in the Plan 160 campaign, never as a sub-plan Done criterion |
| Authorised additive migration | `bun run migrate:deploy` | Reviewed migration applies to the existing selected target |
| Whitespace | `git diff --check` | Exit zero |

Integration scripts currently set `ALLOW_LOCAL_DATABASE_TESTS` and match `.integration.test.ts`; positional filtering may still run more tests than requested. Confirm the actual selected suites. Do not treat zero collected tests, omitted required scenarios or broader unowned fixture mutations as success. Do not run integration against an unguarded remote URL.

Use the existing Plan 160/release manifest runner for real provider evidence. Extend its interface rather than guessing a CLI name or creating another testing system. Document the exact executable invocation in the execution report once implemented. This new runner/report capability is a deliverable, not a command claimed to exist at the baseline.

### 8.2 Test locations and patterns

Each sub-plan names its own new test files and the existing test to model on. The list below is the programme-wide view; it is not a second source of truth.

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

### 8.3 Mandatory regression/evidence matrix

Each case below is owned by exactly one sub-plan, which is responsible for implementing and
evidencing it:

| Sub-plan | Owns cases |
| --- | --- |
| 161a | none directly; supplies the fixture ownership and provider ledger every other case relies on |
| 161b | 161-01, 161-03, 161-04, 161-05, 161-06, 161-36 |
| 161c | 161-16, 161-30, 161-38 |
| 161d | 161-02, 161-07, 161-08, 161-09, 161-10, 161-11, 161-12, 161-13, 161-14, 161-15 |
| 161e | 161-26, 161-27, 161-28, 161-29 |
| 161f | 161-17, 161-18, 161-19, 161-20, 161-21, 161-22, 161-23, 161-24, 161-25 |
| 161g | 161-31, 161-32, 161-33, 161-34, 161-37 |
| 161h | 161-35, 161-39, 161-40 |

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

## 9. Completion, evidence and blocked operations

### 9.1 Evidence schema

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

### 9.2 Source implementation complete

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

### 9.3 Production-hardening sign-off

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

### 9.4 When to pause an affected operation

Pause only the dependent operation and record the exact evidence/action needed when ownership is ambiguous, a live target is unowned, an external mutation lacks authority, the required provider contract cannot be established, current shared-store topology cannot enforce the design, legacy identities cannot be verified, or a migration would require prohibited reset/purge behaviour.

Continue independent implementation and tests. Fix failing code and tests rather than requesting another planning round. Do not introduce arbitrary "stop after two failures" behaviour into the product implementation; the installed advisor's own review limits are separate. Never bypass guards, invent a provider capability, claim a test ran or make a larger retention/payroll product decision to avoid a blocked gate.

### 9.5 Executor STOP conditions

Stop and report; do not improvise, do not widen scope to route around any of these:

- The drift check in Section 1.0 is non-empty **and** any file in Section 2.0 no longer matches its excerpt at the stated symbol. Report the actual current code.
- `packages/xero/src/oauth/service.ts` no longer contains `completeXeroTenantSelection`, or the rebinding `update` block has already been changed by other work.
- A unit's gate command in Section 6 fails twice after a reasonable fix attempt.
- The fix appears to require editing a file outside the Section 4 allowed paths. Report the exact path and why.
- Unit A cannot establish the management endpoint contract from primary sources. Implement and test the rest of Unit F with deletion disabled; do not guess endpoints, pagination, token audiences or filters.
- The backfill in Unit B finds existing `(provider_app_id, external_tenant_id)` collisions. Quarantine them, report the count and the affected internal organisation IDs, and continue with the remaining units. Never pick a winner automatically.
- Any identity cannot be established by verified JWT claims. Retain the candidate as unverified and report; do not fall back to email, Clerk user ID, `authEventId` or token-string equality.
- Applying a migration would require `migrate dev`, `db push`, reset, rebaseline or seeding against the configured database.
- A live provider or shared-store test would need to touch a target the fixture manifest does not own.
- You are about to write an env var value, token, authorisation code, `state`/nonce, or any part of `XERO_TOKEN_ENCRYPTION_KEY`/`XERO_CLIENT_SECRET` into a file, log, snapshot, test fixture, job payload or report. Stop.

**Assumptions that, if false, are STOP conditions:** that one external Xero payroll tenant should map to at most one active internal binding (Section 3); that `app.connections` client-credentials management is available to this app's tier; and that the configured Redis REST service supports the atomic multi-key script topology Unit E requires.

### 9.6 Maintenance notes

For whoever owns this code after the change lands:

- **`XeroCredentialOwner` has no `clerk_org_id` by design.** That breaks the otherwise universal repository rule in `CLAUDE.md` ("`clerk_org_id` on every tenant-scoped table", "every query filters by `clerk_org_id`"). Update `CLAUDE.md` and `PRODUCT.md` to record the exception and its boundary, and add a test that fails if a customer-scoped record is added without both scope IDs. A reviewer who does not know about the exception will either revert it or, worse, generalise it.
- **`resolveXeroAccess` is the single choke point.** Any new Xero call site must go through it. In review, grep for direct reads of credential columns and for `new XeroRateLimiter`; either is a regression.
- **Binding generation and token version are different fences** and are easy to confuse in later work. Binding generation fences payroll access; token version fences credential adoption. Never compare or reuse one for the other.
- **The rate limiter becomes fail-closed.** Anyone later adding a `catch` that falls back to local admission when the shared store is unavailable reintroduces H5 across deployments. Sub-plan 161h Step 5 makes this non-revertible on purpose.
- **Deferred out of this plan:** NZ and UK activation, automatic inactivity-driven deletion, customer notices, any replacement-file or cross-account transfer workflow, and OAuth client-secret rotation. Each needs its own plan and its own authority.
- **What a reviewer should scrutinise first:** the migration SQL in Unit B, the DELETE authorisation scope freeze in sub-plan 161f Step 3, and every place a `Result` error is mapped to user-visible copy in sub-plan 161g Step 7, because a misclassification there tells a customer they revoked consent when the app's own credentials failed.

## 10. Reference register and execution hand-off

### 10.1 Current source map

Repository references are pinned to the inspected baseline. Paths are executable investigation targets, not claims that every file in the repository was newly audited.

Read the **local path**. The URL is a convenience for a human reader; the executor must not
require network access to read this repository's own source.

| Reference | Local path | Source |
| --- | --- | --- |
| R1 | `packages/xero/src/oauth/service.ts` | [OAuth selection, refresh, disconnect and persistence recovery][R1] |
| R2 | `packages/database/prisma/schema.prisma` | [Prisma connection, tenant and OAuth session models][R2] |
| R3 | `packages/xero/src/rate-limit/limiter.ts` | [Current process-local limiter][R3] |
| R4 | `packages/xero/src/rate-limit/xero-fetch.ts` | [Current HTTP wrapper][R4] |
| R5 | `packages/xero/src/crypto/tokens.ts` | [Version-one encryption implementation][R5] |
| R6 | `packages/core/src/redis-rest-transport.ts` | [Shared Redis REST transport][R6] |
| R7 | `packages/core/src/ports/external-write-port.ts` | [Provider-neutral write-error contract][R7] |
| R8 | `packages/xero/src/adapter/xero-write-adapter.ts` | [Xero write adapter][R8] |
| R9 | `packages/database/src/live-test-fixture.ts` | [Protected integration fixture allocation][R9] |
| R10 | `packages/jobs/src/handlers/schedule-xero-syncs.ts` | [Scheduler and dormant refresh maintenance][R10] |
| R11 | `package.json` | [Root executable scripts/toolchain][R11] |
| R12 | `packages/database/package.json` | [Database scripts and Prisma version][R12] |
| R13 | `plans/159-xero-sync-and-onboarding.md` | [Plan 159][R13] |
| R14 | `plans/160-xero-end-to-end-verification-and-report.md` | [Plan 160][R14] |
| R15 | `plans/README.md` | [Release plan index][R15] |
| R16 | `packages/xero/src/rate-limit/limits.ts` | Hard-coded published limits, no tier input |
| R17 | `packages/availability/src/xero-connection-state.ts` | `hasActiveXeroConnection` boolean state |
| R18 | `CLAUDE.md`, `AGENTS.md`, `PRODUCT.md`, `DESIGN.md`, `.impeccable.md` | Repository conventions, domain truth and design system |

### 10.2 Xero and skill references

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

### 10.3 Plan index reconciliation

Plan 161 is one charter plus eight executable sub-plans. `plans/README.md` carries a row for the
charter and a row for each of 161a through 161h, so each unit's status can move independently.
Do not create a second Plan 161 file under any other name.

> **161: Xero API production hardening, charter, IN PROGRESS.** Owns Plan 159 X5/X6 and Step 3
> through this consolidated binding, credential, transport and cleanup contract. Plan 159 retains
> import, people, AU semantics and onboarding work. Plan 160 supplies end-to-end evidence.
> Execute sub-plans 161a through 161h in order. Required live and distributed-store verification
> starts NOT VERIFIED; no readiness claim follows from planning.

The charter moves to DONE only when every sub-plan is DONE **and** Section 9.3's
production-hardening sign-off criteria pass. A sub-plan reaching DONE certifies its own unit and
nothing else.

### 10.4 Executor report

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
