# Plan 161: Harden Xero API connections without replacing server-side OAuth

> Executor: read the entire plan before implementation. Keep the existing
> server-side authorisation-code flow, tenant ownership and synchronous payroll
> writes. Follow each verification gate and record PASS, FAIL or NOT VERIFIED.
> This document authorises no production deployment, payroll mutation or remote
> disconnection by itself. Reuse applicable session authority and owned fixtures.
> A missing external prerequisite blocks its dependent operation only.
>
> Drift check first:
> `git diff --stat 585f6cb..HEAD -- packages/xero packages/database packages/jobs packages/core packages/next-config apps/app apps/api tooling/release PRODUCT.md plans`
> Compare changed in-scope symbols with the excerpts below. Incorporate completed
> equivalent work rather than reimplementing it; stop the affected slice if its
> contract conflicts. Also inspect uncommitted changes with `git status --short`.

## Status

- Status: TODO, planning only.
- Priority: P1, required before production connection-lifecycle sign-off.
- Effort: L, delivered in separately verified slices.
- Risk: HIGH, especially remote deletion, binding migration and refresh recovery.
- Categories: correctness, security, performance, architecture, tests and operations.
- Planned at: `585f6cb`, 21 September 2026. Working tree was clean before planning.
- Depends on: existing database fixture guards and release infrastructure. No
  dependency on completing all of Plan 159.
- Relationship: this plan supersedes **Plan 159 Step 3**, its X6 shared-grant
  prescription, and corresponding lifecycle acceptance criteria. Plan 159 retains
  import completeness, person matching, AU write semantics and onboarding work.
  Plan 160 remains the end-to-end reporting programme and must add this plan's
  scenarios before connection hardening can pass. No prior release evidence is
  revoked or promoted by this planning exercise.

## Why this matters

Ordinary reconnect can currently overwrite the external payroll tenant while
retaining the internal tenant and its payroll data. Local credential removal
also cannot distinguish remote deletion from an unknown remote state, and
process-local budgets cannot enforce Xero quotas across Vercel instances.
Prevent cross-file contamination first, then make remote cleanup durable and
truthful, enforce shared budgets, and improve permission and timeout recovery.

This is a focused implementation specification based on the supplied review and
current source, not a fresh whole-repository audit or live integration test.

## Current state and vetted evidence

| ID | Finding and consequence | Evidence at planned commit | Confidence | Effort / change risk |
| --- | --- | --- | --- | --- |
| H1 | Selection replaces external tenant identity beneath retained payroll records | `packages/xero/src/oauth/service.ts:479-580`; `packages/database/prisma/schema.prisma:461-527` | HIGH, data mixing is an inferred consequence | M / HIGH |
| H2 | Scrubbing destroys available-connection provenance; invalid credentials and confirmed remote absence share one receipt | `service.ts:321-365,1374-1439,1650-1669`; scheduler `packages/jobs/src/handlers/schedule-xero-syncs.ts:363-389` | HIGH | L / HIGH |
| H3 | Each process admits its own tenant/app budget; local organisation keys and fixed daily ceiling differ from provider identity/tier | `packages/xero/src/rate-limit/limiter.ts:77-100`; `limits.ts:4-16`; `xero-fetch.ts:33-69` | HIGH; app tier itself NOT VERIFIED | L / MED |
| H4 | A scope-related 401 causes refresh, and 403 always marks stale | `packages/xero/src/adapter/auth-recovery.ts:7-93`; `packages/xero/src/au/write.ts:230`; `packages/xero/src/write/types.ts:14-19` | HIGH | M / MED |
| H5 | Callback drops authorisation metadata and supplied token scopes | `service.ts:46-63,199-222,2130-2174`; schema `:461-559` | HIGH | M / MED |
| H6 | HTTP waiting can outlive token transactions; disconnect refresh lacks standalone refresh persistence recovery | `service.ts:655-705,923-934,1246,1283-1301,1407`; `xero-fetch.ts:79-124`; `limits.ts:16` | HIGH for timeout mismatch; specific race outcomes need reproduction | L / HIGH |

All `service.ts` references above mean `packages/xero/src/oauth/service.ts`.

### Excerpts for drift checks

Selection currently updates credentials before upserting the same internal tenant:

```typescript
// packages/xero/src/oauth/service.ts:563-580
const nextTenant = await tx.xeroTenant.upsert({
  // create fields omitted here
  update: {
    payroll_region: payrollRegion,
    tenant_name: selectedTenant.tenantName,
    xero_tenant_id: selectedTenant.tenantId,
  },
  where: { xero_connection_id: nextConnection.id },
});
```

The excerpt abbreviates the create branch; do not paste it as replacement code.
The schema makes `XeroConnection.organisation_id` and
`XeroTenant.xero_connection_id` unique, but `xero_tenant_id` has only an index.

```typescript
// packages/xero/src/oauth/service.ts:1437-1439
if (!connection.xero_authorisation_connection_id || terminalAuthorisation) {
  return { ok: true, value: { connection, remoteRevoked: false } };
}
// Same service, remote DELETE result at 1668-1669
if (response.status === 404) {
  return { ok: true, value: { remoteRevoked: false } };
}
```

```typescript
// packages/xero/src/rate-limit/limits.ts:4-7,16
export const XERO_CALLS_PER_MINUTE_PER_ORG = 60;
export const XERO_CALLS_PER_DAY_PER_ORG = 5000;
export const XERO_CONCURRENT_REQUESTS_PER_ORG = 5;
export const XERO_CALLS_PER_MINUTE_APP_WIDE = 10_000;
export const DEFAULT_MAX_WAIT_MS = 65_000;
```

Existing conventions to preserve:

```typescript
// packages/xero/src/adapter/auth-recovery.ts:17-25
const connection = await database.xeroTenant.findFirst({
  select: { xero_connection_id: true },
  where: {
    clerk_org_id: xeroTenant.clerk_org_id,
    id: xeroTenant.id,
    organisation_id: xeroTenant.organisation_id,
  },
});
```

Use `Result<T, E>` for expected service failures, Zod for provider/input payloads,
named exports, co-located Vitest tests, and database access via `@repo/database`.
Both internal scope identifiers remain mandatory even though provider rate keys
are different. Keep existing encryption, state/nonce checks, pending-session user
ownership, AU-only eligibility, owner/admin checks, CAS and recovery logic.

`README.md` and `PRODUCT.md` establish Xero as balance/accrual authority, one
connection per payroll entity, canonical `AvailabilityRecord`, and synchronous
outbound writes. Do not calculate accruals, change AU approval semantics or queue
user payroll writes. `DESIGN.md` and `.impeccable.md` require calm, precise admin
messages, existing design-system components, Plus Jakarta Sans, forest-green
primary actions, tonal surfaces, and light/dark support. This is a status/copy
change, not a settings redesign. Use Australian English without em dashes.

## Provider facts, uncertainty and selected product policy

Documentation inspected on 21 September 2026, including Context7's
`/xeroapi/xero-openapi` Identity reference:

- [Pricing](https://developer.xero.com/pricing) lists daily tenant allowances of
  1,000 for Starter and 5,000 for Core and higher. The actual app tier and any
  exceptional entitlement remain NOT VERIFIED.
- [Limits FAQ](https://developer.xero.com/faq/limits) documents tenant concurrency
  five, minute budget 60, application minute budget 10,000, and remaining-budget
  headers. Its generic daily figure does not resolve the tier distinction.
- [Identity specification](https://raw.githubusercontent.com/XeroAPI/Xero-OpenAPI/master/xero-identity.yaml)
  describes `authEventId`, tenant type and connection timestamps, optional event
  filtering on GET connections, and targeted DELETE with 204/404 outcomes. An
  event identifier is provenance, not proven identity of a rotating token family.
- [Custom integration FAQ](https://developer.xero.com/faq/custom-integration)
  confirms connection/subscription information can be retrieved using client
  credentials. The linked [management guide](https://developer.xero.com/documentation/guides/oauth2/client-credentials)
  returned a JavaScript shell. Exact scopes, coverage, pagination, filtering and
  DELETE permissions are unresolved. Never invent a management endpoint or scope.
- [Granular scopes FAQ](https://developer.xero.com/faq/granular-scopes) documents
  missing-scope indications in `WWW-Authenticate` on 401. The FAQ itself spells
  its example `insufficent_scope`; test both that spelling and the standard
  `insufficient_scope`, without assuming every 401 means missing permission.
- [OAuth FAQ](https://developer.xero.com/faq/oauth2) documents refresh recovery
  with the previous token for up to 30 minutes after a lost response.
- [Official SDK](https://github.com/XeroAPI/xero-node/blob/master/README.md)
  distinguishes targeted disconnect from token revocation. Whole-user revocation
  is out of scope because it can affect other connections.

Selected policy for this plan: **at most one active internal binding per configured
Xero app and external payroll tenant, including across Clerk accounts**. This
follows the supplied product recommendation, not a supposed Xero prohibition.
Preserve inactive historical bindings. Never disclose another account's identity
in collision responses. If existing supported contracts intentionally require
cross-account duplicate bindings, pause that migration for an explicit policy
resolution; do not silently merge, delete or grandfather them as active.

Reauthorisation must select the same file, including after a soft disconnect.
Payroll-file replacement is a separate future privileged workflow requiring an
explicit retention/reset decision. This plan implements no replacement endpoint
and must never treat destructive disconnect as permission to rebind old data.

Shared credential families are an **investigation gate**, not an assumed defect.
Test one Xero authoriser connecting multiple files, then a second administrator
reauthorising the same file. Do not create a global grant table or group by email,
Clerk identity, `authEventId`, decoded unverified claims or matching token strings.
If live evidence establishes shared rotation, stop multi-file sign-off and write
an evidence-backed extension with verified identity and lock boundaries. Binding,
cleanup, limits and recovery work can proceed independently.

## Scope

Permitted implementation paths, restricted to the changes specified here:

- `packages/xero/src/oauth/`: service, tests, new binding/provenance/cleanup and
  inactivity modules with co-located tests.
- `packages/xero/src/rate-limit/`: limits, limiter, fetch wrapper, new shared
  store/deadline modules and tests.
- `packages/xero/src/adapter/auth-recovery.ts` and tests;
  `src/read/`, `src/write/`, `src/au/` for error classification, deadline and
  rate-key plumbing only. NZ/UK call sites may receive mechanical type plumbing
  only, without activating or changing regional behaviour.
- `packages/xero/index.ts`, `keys.ts`, package manifest only if a verified
  dependency is required. Prefer existing `@repo/core` Redis REST transport;
  no new Redis client dependency is currently required.
- `packages/database/prisma/schema.prisma`, generated client and new generated
  additive migration directories; `xero-tenancy.integration.test.ts`; new
  `xero-lifecycle-migration.integration.test.ts`; database lifecycle queries,
  their exports and tests; `src/queries/schedulable-xero-tenants.ts` and tests.
- `packages/jobs/src/handlers/schedule-xero-syncs.ts` and tests; new
  `reconcile-xero-connections.ts` and tests; `src/events.ts`, `src/functions.ts`,
  `index.ts`; sync handlers only to consume typed auth/deadline outcomes and
  generation fencing, without rewriting import orchestration.
- `apps/app/app/(authenticated)/settings/integrations/xero/`: existing connect
  action/client, settings action/client, page DTO construction and tests.
- `apps/api/app/api/xero/oauth/` routes and tests only if needed to persist
  callback intent/provenance; existing Inngest route registration tests.
- `packages/next-config` preflight and tests, `apps/app/.env.example`,
  `apps/api/.env.example`: new non-secret rate-tier/cleanup configuration.
- `tooling/release/` owned inventory, fixture cleanup and focused Xero evidence
  runner/tests; database live-fixture allowlist only for the new owned tables.
- `PRODUCT.md` connection/rate-limit sections; new
  `plans/161-xero-provider-contract.md` and `plans/161-xero-execution-report.md`;
  this plan, Plan 159/160 lifecycle cross-references and `plans/README.md` status.

Out of scope: authentication framework migration, browser credentials, PKCE
rewrite, Custom Connections as the customer auth replacement, bulk onboarding,
whole-grant revocation, replacement-file data migration, automatic inactivity
removal, unrelated UI, calendar/ICS semantics, billing changes, NZ/UK launch,
Plan 159's import/person/AU-contract work and dependency upgrades. No source edits
were performed while writing this plan.

## Commands and baseline

Commands below come from root/package scripts and CI. Package test commands must
run from the indicated workspace because configurations differ. No test, build,
lint or live provider command was executed during planning. All such results
start NOT VERIFIED; historical release results are not a current baseline.

| Purpose | Command | Required result |
| --- | --- | --- |
| Source lint | `bun run check` | exit 0 |
| Typecheck | `bun run typecheck` | exit 0 |
| Unit suites | `bun run test` | exit 0, no new skipped required cases |
| Database integration | `bun run test:integration` | exit 0 against guarded test target |
| Build before full CI typecheck | `bun run build` | exit 0, app route types generated |
| Package boundaries | `bun run boundaries` | exit 0 |
| Focused Xero unit suite | `bun run --cwd packages/xero test` | exit 0 |
| Focused jobs unit suite | `bun run --cwd packages/jobs test` | exit 0 |
| Focused app tests | `bun run --cwd apps/app test 'app/(authenticated)/settings/integrations/xero'` | exit 0 |
| Release runner tests | `bun run test:release-tools` | exit 0 |
| Reviewed migrations | `bun run migrate:deploy` | exit 0 on selected authorised target |
| Whitespace | `git diff --check` | exit 0 |

CI uses PostgreSQL 16 and `ALLOW_LOCAL_DATABASE_TESTS=1`. Current integration
scripts already include `.integration.test.ts`, so positional filters can run
more files than requested. A broader guarded run is acceptable, missing named
cases is not. Reuse `allocateLiveTestFixture` as in
`packages/xero/src/oauth/service.integration.test.ts:25-34`. Remote tests require
the existing owned-manifest protections; setting the local flag is not a bypass.
Never run seed, reset, `db push` or `migrate dev` against live Neon. Generate schema
migrations using the project's approved isolated migration workflow, inspect SQL,
and apply additive changes only. If no permitted generation target exists, finish
source/test work and record migration generation/deployment NOT VERIFIED.

Use Context7 for library/API contracts during execution. Follow the existing
`executeRedisRestCommand` interface in `packages/core/src/redis-rest-transport.ts`
(`command`, `signal`, `timeoutMs`, typed `Result`), rather than the feed cache's
fail-open behaviour. Missing limiter storage must not permit provider requests.

Git: use an isolated `codex/xero-connection-hardening` branch/worktree for execution.
Use conventional commits per verified slice, for example
`fix(xero): reject payroll tenant rebinding`. Do not merge, push or deploy without
applicable operator instructions. Planning itself creates no branch or commit.

## Execution order and steps

Track each checkbox and record commands, commit, target and outcomes in the
execution report. Order: 0 -> 1 -> 2 -> 3 -> 4 -> 5 -> 6. Steps 3 and 4 can be
researched independently; do not activate remote deletion until lifecycle and
rate/deadline protections are verified. Step 2 includes minimum timeout protection
because a cleanup worker cannot safely ship with the existing 65-second waits.

### Step 0: Establish baseline and provider contracts

- [ ] Run the four mandatory source gates and record existing failures separately
  from new regressions. Add build/boundaries according to the command table.
- [ ] Write `plans/161-xero-provider-contract.md`: endpoint/method, auth mode,
  requested/granted scope evidence, identity source, rate policy, authoritative
  inventory coverage/pagination, safe absence semantics and exact source URL/date.
  Enumerate AU endpoints from `src/au/read.ts`, `src/au/write.ts`, OAuth selection
  region inference and read adapters. Keep current scopes until their per-endpoint
  alternatives are proven; do not infer payroll scope redundancy from accounting
  scope transition dates.
- [ ] Record verified app tier, registration environment and management capability
  from authorised operator/provider evidence without values of credentials.
  Unavailable live facts stay NOT VERIFIED. Define a test fixture for each response
  contract; no simulated response can pass the live capability gate.
- [ ] Inventory duplicate `(app, external tenant)` bindings read-only, including
  active, stale and locally disconnected rows with retained data. Never auto-pick
  a winner. Separate public plan summaries from restricted tenant diagnostics.
- [ ] Define the provider-family experiment and fixture ownership/cleanup before
  running it. Management read and delete rights are separate capabilities. Where
  management docs remain unavailable, implement an unsupported-capability result
  and report-only reconciliation, not guessed network calls.

**Verify:** `bun run check`, `bun run typecheck`, `bun run test`,
`bun run test:integration` -> all exit 0 for a verified baseline. If not, record
FAIL/NOT VERIFIED and isolate before sign-off. `test -s plans/161-xero-provider-contract.md`
-> exit 0; its capability matrix must have explicit evidence or NOT VERIFIED for
every row. Missing provider evidence does not delay writing independent source.

### Step 1: Enforce immutable payroll identity and atomic active ownership

- [ ] Add an additive binding-history model with UUID/timestamps, both tenant scope
  identifiers, internal connection/tenant references, provider app ID, external
  tenant ID, provider connection ID, lifecycle generation and retirement reason.
  Use an active-slot field (`1` while reserved, `NULL` after retirement) with a
  database unique constraint on `(provider_app_id, external_tenant_id, active_slot)`.
  PostgreSQL permits multiple historical NULL slots; add tests proving this
  property. Existing XeroTenant identity remains unchanged on reconnect.
- [ ] Treat active/stale/reauthorisation-required bindings as reserved. Keep a
  reservation while remote deletion is pending/unknown, including lease expiry.
  Retire it only after verified deletion/absence and completed local disable, or
  an explicitly reviewed transfer decision outside this plan. This conservative
  rule prevents reassignment while an old delete might still complete.
- [ ] Backfill only after duplicate analysis succeeds. Record legacy app identity
  explicitly from the deployment's configured app, never from an arbitrary env.
  Do not assign historic deletion success to disconnected rows with no evidence.
  Migration must preserve every existing payroll FK and identifier.
- [ ] In `completeXeroTenantSelection`, claim the session, resolve/create the scoped
  organisation, acquire the common lifecycle lock and enforce same external tenant
  before token writes. Roll back the session claim and new organisation on rejected
  selection. Checking outside the transaction may improve feedback but is not the
  integrity control. Retry unique-key collisions as a domain conflict, not a leak
  of database errors or another account's details.
- [ ] Store a lifecycle generation in OAuth intent at start for an existing
  organisation and recheck it during selection. A callback begun before disconnect
  cannot reactivate the connection. New organisation selection uses an explicit
  initial-binding intent. Reconnect after a completed disconnect must be newly
  initiated and remains same-file only.
- [ ] Serialise refresh, reconnect, disconnect and cleanup claims under the same
  connection/binding lock order. Where both identities are known, always acquire
  provider-binding then local-connection locks in stable order. Increment generation
  for lifecycle changes; token refresh uses separate CAS/token-version protection.
- [ ] Add safe error codes `tenant_binding_conflict`, `tenant_replacement_required`
  and `connection_changed` to the service and action mapping. Preserve owner/admin
  checks and user-bound session validation. Rejected selection dispatches no sync.

**Verify:** `bun run --cwd packages/xero test src/oauth/service.test.ts` and the
focused app command -> exit 0. Then
`bun run --cwd packages/xero test:integration` and
`bun run --cwd packages/database test:integration` -> exit 0 on guarded target.
Assert wrong-file rejection leaves tokens, mappings, session and payroll rows
unchanged; concurrent cross-account claims yield exactly one active binding;
refresh/disconnect/reconnect interleavings never resurrect an old generation.

### Step 2: Persist provenance and remote cleanup before scrubbing

- [ ] Replace cast-based connection parsing with Zod schemas. Preserve connection
  ID, external tenant, type, `authEventId`, provider timestamps, supplied granted
  scopes, internal initiating user and a verified provider identity when available.
  Preserve unknown as unknown, not an invented authoriser or scope list. Absent
  scopes on refresh must not erase a previously known set; explicitly supplied
  scope changes must be recorded. Never log raw tokens or decode claims to output.
- [ ] Persist an OAuth attempt before exchange/listing where possible. After token
  exchange, durably encrypt credentials before inventory fetch so a listing failure
  does not discard the only recovery path. An exchange completed remotely but lost
  locally is a durable unknown attempt, not a confirmed unconnected account.
- [ ] Add a scoped `XeroConnectionCleanup` record. Required fields: connection and
  session references where available, provider app/connection/tenant IDs, auth-event
  provenance, expected generation, reason, local-disabled timestamp, remote state,
  attempt count, next attempt, lease owner/expiry, last safe error, outcome evidence
  type and confirmation timestamp. Session-only attempts may have nullable
  `organisation_id`; prove ownership through their Clerk org and user-bound session.
- [ ] Use separate local state and remote state. Remote enum:
  `pending`, `in_progress`, `confirmed_deleted`, `confirmed_absent`, `unknown`,
  `blocked_authorisation`, `cancelled`. Reauthorisation requirements remain an
  access/recovery reason, never evidence of provider absence. Return a typed
  `{ localDisabled, remoteStatus }` receipt instead of `remoteRevoked` internally
  and update all callers, DTOs, audit tests and UI wording in this slice.
- [ ] Disconnect first commits local disable plus durable cleanup intent. No remote
  request is inside that transaction. Exclude the generation from new sync/write
  admission immediately. Already dispatched provider writes cannot be undone;
  prevent further calls and stale local state transitions, and surface ambiguous
  effects for existing write recovery. Retain existing soft/destructive data
  choices, but never erase binding/audit history or feed UID identity implicitly.
- [ ] Separate ordinary credentials from restricted cleanup credential retention.
  Move/copy encrypted credentials only when needed for targeted cleanup, inaccessible
  to payroll reads/writes, with bounded expiry. Define approved retention in the
  contract report before retention-backed cleanup is enabled. Scrub expired secret
  material even when remote status remains unknown; keep non-secret tombstones.
  Do not extend session secrets indefinitely to make cleanup easier.
  Do not create independently refreshable cleanup copies of credentials already
  adopted by successful selection. Cleanup for those sessions must use verified
  management credentials, access-only credentials without refresh, or the existing
  credential owner's single CAS/lock lifecycle. If none is safe, retain an unknown
  candidate for review. This must not introduce the shared-token race that the
  provider-family investigation has yet to establish.
- [ ] Before clearing successful/expired session inventory, atomically save provenance
  and cleanup candidates. A candidate is not deletion authority: filter by current
  auth event when verified, protect every active binding, and hold ambiguous/legacy
  inventory for review. The latest selection screen is never the deletion set.
- [ ] Add `reconcile-xero-connections.ts` in jobs and register through
  `packages/jobs/src/functions.ts`. Enumerate IDs in bounded pages, then use scoped
  per-record processing. Durable intent plus periodic sweep recovers lost dispatch;
  duplicate deliveries must be idempotent. Payloads contain IDs and generation only,
  never access/refresh credentials. Use bounded exponential retry with jitter and
  provider backoff; terminal auth errors require intervention rather than a hot loop.
- [ ] Before DELETE, atomically claim the exact provider binding/generation and
  recheck all current references. Reconnect/attach must reject while a destructive
  cleanup attempt is in flight or its outcome is unknown. Do not rely on a local
  fencing token to cancel an external DELETE already sent. On worker loss/lease
  expiry, reconcile remote outcome before releasing that reservation. A newer
  generation cancels unsent stale tasks; it cannot make an old request harmless.
  Track each issued destructive attempt. Before reauthorisation is permitted,
  every such attempt must have a terminal outcome, or verified provider connection
  identity semantics must prove a late request cannot affect the new connection.
  A timeout, AbortSignal, lease expiry or inventory snapshot alone is insufficient;
  otherwise retain the unknown reservation for operator/provider resolution.
- [ ] Only explicit DELETE success or authoritative, complete, correctly scoped
  absence evidence confirms remote removal. A 404 from targeted DELETE is confirmed
  absence; 401/403/invalid grant is not. Incomplete/user-scoped inventory cannot
  establish application-wide absence. Unknown foreign inventory is report-only.
- [ ] Retain the targeted DELETE fallback with customer credentials where valid.
  Use client-credentials inventory only after scope/coverage verification; enable
  management DELETE only if separately documented and tested. No whole-token revoke.
- [ ] Bound each provider attempt now: network cancellation, body consumption and
  rate wait must fit its deadline. Retry later through Inngest. If refresh is needed
  for cleanup, commit rotated encrypted credentials with CAS and persistence recovery
  before DELETE, so delete failure cannot roll back a successful rotation.

**Verify:** focused Xero/app/jobs unit commands -> exit 0. Xero/jobs/database
`test:integration` scripts -> exit 0 on the guarded target. Cases must prove
204 versus 404 versus invalid grant versus 5xx are distinct, local disable survives
provider outage, intent survives dispatch failure, expired sessions preserve
non-secret provenance, and a stale/in-flight delete cannot remove a new binding.

### Step 3: Enforce shared provider budgets and concurrency

- [ ] Introduce a store interface and production Redis REST implementation within
  `packages/xero/src/rate-limit/`. Keep an injectable deterministic fake for unit
  tests only. Use the existing core transport with bounded timeouts and signals.
  Missing/malformed KV configuration, Redis timeout, partial response or eviction
  uncertainty denies admission with a retryable infrastructure result. Never fall
  back to local Maps in deployed production.
- [ ] Keys use configured provider app identity plus actual external tenant ID, not
  Clerk org, internal organisation or internal XeroTenant UUID. All deployments
  sharing the app credentials share budgets; do not split by deployment environment.
  Internal scope remains in service authorisation. OAuth token/identity endpoints
  without a tenant use a distinct endpoint class and verified app/identity policy,
  never a fake tenant allowance. Region inference already knows the external tenant.
- [ ] Configure tier explicitly with Zod and production preflight: Starter daily
  1,000; Core/Plus/Advanced/Enterprise 5,000 unless separately evidenced. Missing
  tier blocks production readiness; tests use explicit fixtures. No silent 5,000
  default and no unverified Rapid Sync exemption. Update `PRODUCT.md`'s blanket
  daily figure and both app/API environment examples, without secret values.
- [ ] Use one atomic server-side operation to check tenant minute/day, app minute,
  provider cooldowns and concurrency, then reserve all or none. Prefer strict
  rolling-window timestamp sets until provider reset semantics are verified;
  token-bucket burst refill must not exceed any rolling minute/day allowance.
  Redis server time defines expiry. Keep all script keys in a supported atomic
  topology/hash slot and verify deployment support before enabling it.
- [ ] Every attempted HTTP request, including retries, consumes budget. Denied
  admission consumes none. Concurrency is an owner-specific lease, released
  idempotently only by its owner, with lease duration exceeding the hard maximum
  request/body lifetime plus margin. Bound HTTP lifetime so crash recovery cannot
  admit a sixth still-running call. Do not release at response headers while a
  streamed response body remains unconsumed; release/cancel in a finally path.
- [ ] Use unique request IDs so ambiguous Redis responses can be retried without
  double reservation. Expire bounded window/lease records; never evict live budget
  state deliberately. Initial rollout must account for requests admitted by old
  instances: quiesce old callers and conservatively seed/wait out prior windows,
  rather than starting a full daily allowance during mixed deployment.
- [ ] Atomically reconcile `X-DayLimit-Remaining`, `X-MinLimit-Remaining` and
  `X-AppMinLimit-Remaining` as conservative ceilings, with concurrent reservations
  and out-of-order responses accounted for. Never replenish based on a delayed
  higher header. Missing headers keep local accounting; malformed values are
  ignored safely. Known exhausted budgets/cooldowns cannot be cleared by process
  restart, reconnect or changing internal organisation.
- [ ] Retain Retry-After seconds/date support, publish a shared cooldown for 429,
  and return retry timing when it exceeds the caller's deadline. Long inbound
  waits use durable Inngest retries. Outbound payroll remains synchronous and
  returns a clear retry/deferred error without enqueueing the write. Preserve
  `retryOnAmbiguousFailure: false` for non-idempotent mutations.

**Verify:** `bun run --cwd packages/xero test src/rate-limit` -> exit 0 with
fake-clock boundary tests. Add `src/rate-limit/shared-store.integration.test.ts`
using an explicitly configured test Redis REST target and owned key prefix;
`bun run --cwd packages/xero test:integration` -> exit 0 with two independent
client/process instances. Verify aggregate tenant limits, app budget across two
tenants, five concurrent requests, lease-owner release, crash expiry, boundary
bursts, late headers, 429 cooldown and store outage. Missing real shared storage
means distributed enforcement is NOT VERIFIED, regardless of mocked test PASS.

### Step 4: Make recovery permission-aware and preserve provenance

- [ ] Add a shared server-side classifier used by AU read/write errors, OAuth
  connection probing and `executeWithXeroAuthRecovery`. Keep existing public
  `XeroWriteError` variants; add a typed recovery reason and optional retry timing
  rather than scattering incompatible new error codes across the app.
- [ ] Preserve only allowlisted, parsed provider metadata: auth challenge category,
  correlation ID, retry delay and remaining budgets. Raw provider bodies remain
  admin-only audit data; do not forward all response headers or tokens to the UI.
- [ ] Decision table: insufficient scope -> `permission_error`/update permissions,
  no refresh; rejected/expired access token -> one controlled refresh/retry;
  proven authoriser access denial -> check access/appropriate authoriser; invalid
  refresh grant -> reauthorise, leaving remote cleanup state unchanged; 429/5xx/
  network -> retry/defer, no consent-revoked inference. Generic 403 remains an
  actionable permission/access error, not proof of a particular lost role.
- [ ] Classify both first and second response. Scope failure after one legitimate
  refresh must still yield update-permissions, not generic stale credentials.
  Apply the same semantics to background reads so the scheduler does not repeatedly
  refresh a connection that needs consent. Block the affected capability explicitly
  and display the recovery action to admins without exposing raw error details.
- [ ] Complete the AU endpoint-to-scope matrix and granted/requested scope tracking.
  Missing historical scopes are unknown; never treat unknown as consent. Change
  the requested list only for verified endpoint contracts and test updated consent
  on an owned Xero fixture. Do not revoke functioning connections to force migration.
- [ ] Store verified authorisation provenance without changing payroll ownership or
  making unattended service depend on the original user's browser session. Run the
  multi-authoriser/multi-file experiment from Step 0. Keep grant-table redesign
  conditional on evidence, with explicit follow-up rather than speculative schema.

**Verify:** `bun run --cwd packages/xero test src/adapter src/au src/read src/write src/oauth`
and focused app/jobs tests -> exit 0. Assert refresh call counts (zero on scope
failure, at most one on rejected access token), distinct messages, both documented
scope spellings, 403 fallback and no stale-consent marker on transient failures.
Live scope/authoriser tests must be recorded independently in the execution report.

### Step 5: Complete deadline and rotated-token recovery protection

- [ ] Define one absolute operation deadline at entry and pass remaining time plus
  caller cancellation through limiter admission, fetch, response-body parsing,
  backoff and database work. A per-attempt timeout reset is not an overall deadline.
- [ ] For current 15-second refresh transactions, start with a maximum 10-second
  provider budget and bounded lock acquisition, leaving persistence headroom.
  Recalculate remaining time after acquiring the lock; do not spend a fresh ten
  seconds after waiting. No provider sleep may run past the transaction deadline.
  The separated cleanup flow uses short DB claims/commits and independent bounded
  network attempts, not a larger interactive transaction timeout.
- [ ] Preserve `SuccessfulRefreshAttempt`, CAS and recovery callbacks. A returned
  rotated credential pair must be durably recoverable before later cleanup work.
  On lost commit acknowledgement, confirm active generation and expected token
  version, not merely different ciphertext. A scrubbed empty token is not proof
  that refresh committed successfully (`service.ts:923-934`).
- [ ] On response loss, preserve recovery eligibility for the documented grace
  period and record when uncertainty began. Never scrub on the first timeout or
  blindly retry an ambiguous payroll write. Retry refresh through the controlled
  path without resetting the uncertainty window indefinitely. Recovery cannot
  restore an obsolete/disconnected generation.
- [ ] Add deterministic fault injection at response accepted, body read, DB commit,
  post-commit acknowledgement and refresh-before-delete boundaries. Slow body
  consumption and cancellation must release resources within bounded time.

**Verify:** focused OAuth and rate-limit unit suites -> exit 0; Xero integration
suite -> exit 0. Fake-clock assertions must show deadline compliance; real DB
concurrency must prove one winning credential generation, no disconnected-row
refresh success, and rotated token persistence after delete failure. Retain all
existing persistence-recovery tests rather than replacing them with mocks.

### Step 6: Add report-only inactivity assessment and prove rollout

- [ ] Add a pure inactivity evaluator and scoped reporting query under Xero/database,
  scheduled with existing Inngest infrastructure. Separate customer/service activity
  from polling and 45-day token maintenance. Keep maintenance for authorised active
  services while inactivity decisions remain report-only.
- [ ] Report evidence and uncertainty: completed onboarding, active entitlement or
  invitation-only service authorisation, enabled publication, feed-token usage,
  deliberate pause, cancellation/archive and explicit retention decisions. Existing
  feed token `last_used_at` is supporting evidence only; verify how all 200/304 and
  cached requests affect it before relying on it. Missing activity data is unknown,
  never evidence of abandonment. No login is not inactivity; successful polling
  does not manufacture customer activity.
- [ ] Store policy version and candidate reasons. Define notice, retention and
  appeal/reconnect rules with the operator before any future automatic removal.
  This plan sends no notices and enqueues no inactivity-based DELETE. Explicit
  disconnect and provably abandoned OAuth cleanup follow Step 2's separate rules.
- [ ] Add safe operational metrics: pending/unknown cleanup age, attempts, conflicts,
  rate denials, deadlines, refresh recovery and permission-required counts. No token,
  auth header, raw payroll payload or foreign account identity in logs/events.
- [ ] Record portal ownership, collaborator access review and secret-rotation owner
  in the operator checklist. Do not invent Xero's unverified collaborator role matrix.
- [ ] Roll out additive schema first, backfill with collision gate, deploy new readers
  and guards, enable shared limiter after old callers are drained, then enable only
  verified cleanup capabilities. Shadow/report cleanup candidates before deletion.
  Rollback disables the new worker and keeps reservations/local disable/history;
  never roll back to code capable of silent rebind or restore scrubbed credentials.
- [ ] Extend Plan 160's owned evidence/report contract with the scenario table below.
  Prepare tests independently of live access, but run live cases only on owned,
  appropriately authorised files. Produce the execution report even on failures.

**Verify:** `bun run --cwd packages/jobs test`, Xero unit suite, and
`bun run test:release-tools` -> exit 0. Then run every command in the baseline table
on the final candidate. `test -s plans/161-xero-execution-report.md` -> exit 0; every
scenario below has PASS/FAIL/NOT VERIFIED, evidence location, target/candidate,
cleanup outcome and remaining action. A report-only policy test must assert zero
remote DELETE calls for every inactivity classification.

## Required regression and live evidence matrix

Use existing `src/oauth/service.test.ts`, `service.integration.test.ts`,
`disconnect.integration.test.ts`, `src/adapter/auth-recovery.test.ts`,
`src/rate-limit/limiter.test.ts`, `xero-fetch.test.ts`, jobs scheduler tests and
app connect/settings action tests as structural patterns. Use fixture builders,
barriers and injected clocks; arbitrary sleeps are not concurrency evidence.

| Scenario | Required assertion | Minimum evidence |
| --- | --- | --- |
| Reconnect to wrong file | Entire transaction unchanged, no sync dispatch | Unit + real DB |
| Same-file reconnect | Credentials/provenance renewed, internal IDs/data preserved | Unit + real DB + owned live |
| Two accounts bind one external tenant concurrently | One reserved binding; loser gets generic conflict | Real DB |
| Two sessions for one organisation | One valid lifecycle owner, no session replay | Real DB |
| Refresh/reconnect/disconnect overlap | No stale credential overwrite or resurrection | Fault injection + real DB |
| Delete in flight then reconnect | Reconnect blocked until authoritative completion; old request cannot delete new binding | Fault injection + real DB |
| Old unsent cleanup after reconnect | No remote call; task cancelled by generation | Unit + real DB |
| OAuth callback/listing failure or abandoned selection | Recoverable attempt/provenance; active earlier connections preserved | Unit + real DB + owned live |
| Remote 204, 404, 401/403, 429, 5xx and timeout | Distinct truthful remote states; local disable persists | Unit + owned live safe cases |
| Credentials scrubbed while cleanup unresolved | Secrets removed on deadline, unknown state retained | Real DB |
| Lost cleanup dispatch or duplicate job delivery | Sweep recovers; one effective operation | Jobs integration |
| Same authoriser, two payroll entities | Refresh/disconnect effects scoped or shared family proven and separately resolved | Owned live, mocks insufficient |
| Second administrator reconnects | Ownership remains organisational, provenance updated safely | Owned live |
| Missing scope/rejected access/invalid grant | Correct action and exact refresh count | Unit + owned live scope proof |
| Two server processes, same provider tenant | Aggregate minute/day/concurrency ceilings hold | Actual shared Redis integration |
| Two tenants, same app | Shared application ceiling holds | Actual shared Redis integration |
| Rolling-window boundaries, crash, delayed headers | No overspend/double release or early lease expiry | Fake-clock + shared store |
| Redis down or ambiguous admission | No provider request/fail-open fallback | Unit + shared store fault test |
| Lost token response or DB acknowledgement | Recoverable credentials; no duplicate conflicting rotation | Fault injection + real DB |
| Refresh succeeds, disconnect DELETE fails | Rotated credentials remain recoverable, local access disabled | Real DB |
| Active feed customer without login / missing feed evidence | Preserved service or unknown, never automatic deletion | Pure policy + jobs tests |
| Duplicate legacy data during migration | Abort with report; zero automatic merges/deletions | Database migration integration |
| Secrets and foreign-account isolation | No credentials/raw errors in DTOs, logs, snapshots or events | Unit + real DB + browser |

## Done criteria

- [ ] All four required gates exit 0: `bun run check`, `bun run typecheck`,
  `bun run test`, `bun run test:integration`; build, boundaries and release-tool
  checks also pass on the same final candidate.
- [ ] New named test files and scenarios exist, execute without required-case skips,
  and have captured results. Real shared-store tests ran against shared storage.
- [ ] `rg -n 'remoteRevoked' packages/xero apps/app` finds no live receipt consumers;
  historical prose is permitted. Tests assert explicit remote-state outcomes.
- [ ] Wrong-file reconnect cannot modify credentials, session, bindings or payroll
  rows; database uniqueness prevents concurrent active duplicates.
- [ ] Remote cleanup is durable, scoped, idempotent and fenced against active/new
  bindings, including requests already in flight and uncertain worker death.
- [ ] Production has no process-local rate enforcement fallback; tier and KV
  configuration are checked in both caller deployments.
- [ ] Refresh/grant/scope/transient failures remain distinct; deadline and persistence
  fault tests pass without losing rotated credentials or replaying payroll writes.
- [ ] Inactivity is report-only with zero automatic disconnects and no notices sent.
- [ ] Cleanup candidates from successful selection have no independently rotating
  copy of the active credential owner's refresh token; regression tests prove it.
- [ ] The provider contract and execution reports exist and contain no secret values.
  Source completion and live production readiness are separately reported.
- [ ] `git diff --check` exits 0; `git diff --name-only 585f6cb` and untracked files
  contain only permitted changes. Index/plan status updated without erasing history.

## STOP conditions

Pause the affected slice and report, while continuing independent work, if:

- Source drift changes any assumed ownership, status, or recovery contract.
- Existing duplicates require choosing a customer owner or changing retention.
- Provider app identity cannot be established for backfill, or an intended
  cross-account duplicate-binding product contract conflicts with the selected rule.
- Management endpoint scopes, delete authority or inventory completeness cannot
  be verified. Keep that capability off and use truthful pending/unknown reporting.
- Evidence proves shared rotating credentials but no verified family identity and
  safe cross-account storage/lock boundary exists. Multi-file readiness cannot pass.
- Redis cannot atomically enforce all keys on its actual deployment topology, or
  lease lifetime cannot exceed bounded in-flight request lifetime. Do not weaken
  the limiter to process-local or approximate independent counters.
- Migration generation would require live reset/seed/schema push, or tests cannot
  guarantee owned fixtures and cleanup. Do not bypass the existing guards.
- A verification gate fails twice after a reasonable scoped repair, or a necessary
  fix exceeds the allowed paths. Record the exact failure rather than passing it.

## Maintenance and considered alternatives

Review future connect, import, refresh and disconnect changes for the same binding
and generation checks. Provider app rotation changes identity namespaces: migrate
explicitly, never reset budgets or silently reassign historical bindings. Recheck
pricing/scopes when app tier or AU functionality changes. Preserve unknown remote
states across credential retention expiry and service restarts.

Rejected for this plan: OAuth-stack replacement, browser tokens, deleting every
unselected connection, credential failure as proof of remote absence, blanket
5,000/day assumptions, login-only inactivity, polling as customer activity,
automatic whole-grant revocation and unconditional shared-grant redesign. Bulk
connections and payroll-file replacement require later dedicated decisions.

## Planning review

PASS: current source and existing plans inspected; external reference claims
checked where readable; independent lifecycle investigation reviewed; one
self-contained plan and index reconciliation produced. Source was not modified.
NOT VERIFIED: baseline test suites, app entitlement, deployed configuration,
management endpoint permissions, live scope behaviour, multi-authoriser credential
families, Redis deployment capabilities and all production readiness claims.
