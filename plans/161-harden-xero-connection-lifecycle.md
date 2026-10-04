# Plan 161: Xero lifecycle evidence and production sign-off

> **Remaining work:** collect and review lifecycle evidence on one identified candidate through the existing protected release harness under go-live campaign ownership. All nine implementation slices (161-pre and 161a through 161h) are delivered. Do not reimplement them. Source presence, historical test results and applied-migration records do not establish current browser, provider, database, shared-store or deployment readiness.
>
> Preserve AU-only activation, server-side OAuth, Clerk and payroll-organisation boundaries, synchronous user-triggered writes and fail-closed fixture/worker controls. Use the existing configured targets and owned fixtures. Do not print secrets or create a parallel verification system.

## 1. Status and drift check

| Item | Current state |
| --- | --- |
| Reviewed at | `604d754`, 4 October 2026 |
| Status | IN PROGRESS: source delivered; 40-case evidence and production sign-off NOT VERIFIED |
| Priority / effort / risk | P1 / M evidence collection / HIGH external and distributed-state operations |
| Category | verification, security, correctness |
| Dependencies | Release-wide gates and lifecycle campaign in `plans/go-live.md`; bounded AU UI proof in Plan 160 |
| Authority | This reconciliation changes planning files only; it authorises no deployment, secret change, payroll mutation or remote disconnection |

Run `git rev-parse --short HEAD` and `git diff --stat 604d754..HEAD -- packages/xero packages/database packages/jobs packages/core packages/availability apps/app apps/api tooling/release PRODUCT.md`. Expected: the reviewed SHA or an explicitly reconciled candidate with every changed contract inspected. Inspect uncommitted changes separately with `git diff --stat` and `git diff --cached --stat`; a HEAD comparison does not cover them. Do not use a stale SHA as the deployed candidate.

### 1.1 Scope and ownership

In scope: read current lifecycle source, collect protected evidence, and update this charter, `plans/161-xero-provider-contract.md`, `plans/README.md` and the existing Plan 160/go-live evidence references. Restricted execution artefacts belong in the runner's private evidence location. No source, schema, migration, environment or product redesign is authorised by this remaining-work plan. If a failed assertion identifies a source defect, record its exact evidence and define a separate scoped repair before resuming dependent execution.

Plan 161 owns lifecycle, binding, credential, transport, rate admission and cleanup sign-off. Plan 160 owns bounded AU real UI proof and protected replay. `plans/go-live.md` owns release-wide readiness. AU submission/approval, canonical availability, import completeness and feed publishing retain their existing source contracts; lifecycle evidence cannot certify them by implication.

## 2. Current source evidence

The following symbols were inspected at `604d754` on 4 October 2026. This was source review; no database, browser, shared-store, provider or CI gates ran in this reconciliation.

| Source | Current evidence and role |
| --- | --- |
| `packages/database/prisma/schema.prisma:529` | `XeroCredentialOwner` has unique `(provider_app_id, xero_user_id)`; system infrastructure is distinct from tenant access |
| `packages/database/prisma/schema.prisma:582` | `XeroProviderConnection` retains remote connection provenance |
| `packages/database/prisma/schema.prisma:605` | `XeroTenant` carries scoped binding, owner/link FKs, active slot and binding generation; reserved uniqueness is at line 645 |
| `packages/database/prisma/migrations/20260923190200_prevent_xero_tenant_rebinding/migration.sql:2` | Database trigger prevents rewriting external tenant identity |
| `packages/xero/src/oauth/service.ts:571` | `completeXeroTenantSelection` validates pending scoped intent and verified provider identity |
| `packages/xero/src/oauth/credential-owner.ts:390` | `resolveXeroAccess` is the scoped credential/capability boundary; a null owner retains the guarded legacy fallback during per-binding cutover |
| `packages/xero/src/rate-limit/limiter.ts:28` | Limiter uses `SharedXeroRateStore`; admission returns infrastructure/domain errors instead of a local fallback |
| `packages/xero/src/rate-limit/xero-fetch.ts:87` | Absolute deadline covers admission, retries and buffered body consumption |
| `packages/xero/src/crypto/tokens.ts:42` | New encryption selects active key version; decryption selects `input.keyVersion` at line 66 |
| `packages/core/src/redis-rest-transport.ts:248` | Body consumption stays cancellable; cleanup is in `finally` at line 294 |
| `packages/xero/src/oauth/management-client.ts:117` | Client-credentials request uses singular `scope=app.connections`, typed token parsing and bounded attempts |
| `packages/xero/src/au/read.ts:278` | Leave pagination uses raw item count, preserving malformed-row and traversal evidence |
| `tooling/release/run-xero-e2e.ts:384` | `worker-isolation-unavailable` remains a deliberate stop before live browser/provider work |

Completed implementation instructions and defect excerpts have been removed. Git history retains delivery records. The outstanding evidence must use the actual current symbols, not the old pre-hardening excerpts.

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

## 4. Remaining evidence workflow

1. Identify the integrated candidate, deployed candidate, target fingerprints and ownership manifest. Compare them with current source and the retained invariants. Expected: explicit matching SHA and owned target inventory, or NOT VERIFIED with the exact mismatch.
2. Run the existing release-tool checks and candidate CI gates in the authorised verification workflow. Record commands, exit codes and selected tests. Expected: required gates exit 0; zero collected tests do not pass a requirement.
3. Execute configured-database/shared-store and browser/provider cases only through the existing protected runners. Expected: each of the 40 cases has every required evidence level and cleanup proof. Stop a dependent phase if its worker, ownership, consumer-isolation or provider prerequisites fail.
4. Review Section 9.3 against the same candidate and issue Markdown plus JSON evidence. Expected: no missing case or unresolved cleanup is reported as PASS. Update the index to DONE only after every sign-off item passes.

The improve advisor remains source-read-only. Historical implementation dispatch, worktree creation, integration and unit build instructions are retired; they are not remaining tasks.

## 5. Implemented architecture and retained invariants

These are retained correctness requirements. They describe the implemented lifecycle; they are not instructions to create another schema or credential model.

### 5.1 Separate the three identities

| Record | Required content and constraints |
| --- | --- |
| `XeroCredentialOwner` | Provider app ID and verified Xero authoriser ID, unique together; encrypted canonical access/refresh envelope(s), encryption version, token version, token expiry, granted scopes and provenance, last verified/adopted/rotated timestamps, refresh-attempt and recovery state |
| `XeroProviderConnection` | Provider app ID and exact remote connection ID, unique together; external tenant ID, tenant type, verified authoriser association when established, `authEventId`, provider timestamps, observation source/time/coverage and remote lifecycle status |
| `XeroTenant` (binding record) | Both internal scope IDs, internal organisation/connection/tenant references, immutable external tenant/app identity, selected provider connection/credential-owner references, lifecycle generation, reserved slot, retirement reason and timestamps |

The provider connection is the user-authorised link; the binding is the application's ownership decision. A payroll tenant can have multiple remote authoriser connections, while Team Calendar permits only one reserved internal payroll binding.

Preserve old remote connection records on reauthorisation. Changing authoriser must not overwrite the only record of the superseded connection. Retire obsolete links only through the safe reconciliation process.

### 5.2 Explicit system-level infrastructure boundary

`XeroCredentialOwner` and app-wide provider inventory are **system infrastructure**, not customer-owned payroll rows. The same infrastructure boundary covers `XeroRefreshAttempt`. Customer visibility remains authorised through scoped `XeroTenant` rows. The exception is documented in `AGENTS.md` and `PRODUCT.md`.

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

The schema uses a nullable `active_slot` for reserved bindings: `1` while reserved, `NULL` after retirement. Retain the existing CHECK allowing only those values and unique reserved ownership for `(provider_app_id, xero_tenant_id, active_slot)` and for the relevant internal organisation/connection. Test multiple historical NULL rows explicitly.

Retain scoped FK consistency and app-level scope checks. Binding generations are monotonic per internal connection and cannot restart at one after a retirement/reconnect.

Active, permission-required, reauthorisation-required, paused and cleanup-pending bindings keep their reservation. Retire only after the local-disable and remote-outcome contract is satisfied. Historic external identity remains immutable independently of the reserved slot.

### 5.4 Supporting durable state

The existing OAuth session/intent model records immutable intent kind, intended payroll organisation, initiating user/account, nonce binding, expected lifecycle generation, token-exchange/adoption status, inventory provenance and expiry.

The schema contains cleanup request and attempt records. A request contains the scoped local intent and frozen target set; each attempt records an exact provider connection, expected binding generation, authorisation reason, lease/attempt owner, dispatch/outcome state, retries and evidence. A multi-target request cannot report overall remote success while any required target is unresolved.

`XeroRefreshAttempt` records attempt ID, expected credential/token version, dispatch time, uncertainty start, recovery deadline and outcome. Recovery tokens are encrypted, bounded to the provider grace window and scrubbed afterwards; never log or publish them.

### 5.5 Lock and fencing contract

Retain the documented lock order: **credential-owner locks in sorted order, external app/tenant-binding locks in sorted order, internal connection locks in sorted order, then OAuth session/cleanup-row claims**. Re-read non-locking lookups after acquisition. Never acquire these in reverse order from another path.

A refresh that touches only an owner needs that owner lock; a binding transition needs its binding/local locks and relevant owner locks. Use bounded PostgreSQL transaction-scoped advisory locking for the short critical sections. Do not hold a transaction open for remote DELETE.

Token version fences credential adoption. Binding generation fences payroll access and local lifecycle changes. They are not interchangeable. A refresh must not reactivate a disconnected binding; disconnecting one binding must not erase credentials still required by other authorised bindings.

Fences protect local decisions. They cannot recall a provider request already sent. Record ambiguous remote outcomes and handle them through existing write recovery or the existing cleanup recovery process.

## 6. Verification commands and limits

| Gate | Command or procedure | Expected evidence |
| --- | --- | --- |
| Lint | `bun run check` | exit 0 |
| Types | `bun run typecheck` | exit 0; generated types match candidate |
| Unit suites | `bun run test` | exit 0; required assertions collected |
| Integration CI | `bun run test:integration` | Localhost-only via its local guard; exit 0 does not establish Neon proof |
| Boundaries | `bun run boundaries` | exit 0 |
| Release tools | `bun run test:release-tools` and `bun run typecheck:release-tools` | both exit 0 |
| Protected Neon/KV inventory | `TURBO_CONCURRENCY=1 bun --env-file=<private-run-env> ./tooling/release/run-live-integration.ts --manifest <fresh-private-manifest> --evidence-dir <private-evidence-dir>` | all required suites pass, owned cleanup and fence read-back pass |
| Xero campaign | `bun --no-env-file tooling/release/run-xero-e2e.ts --manifest <private-manifest> --output <private-evidence-dir> --preflight` | current prerequisites pass before the existing harness execution under go-live campaign ownership; worker refusal remains NOT VERIFIED |
| Browser | Existing go-live guarded lifecycle campaign | owned browser fixtures, candidate and cleanup proven; direct Playwright is not a worker-isolation bypass |
| Migration state | Protected read-only migration/checksum/schema read-back | expected catalogue matches candidate; do not reapply completed migrations |
| Planning edits | `git diff --check -- plans/161-harden-xero-connection-lifecycle.md plans/161-xero-provider-contract.md` | exit 0 |

Manifest paths above are placeholders for private owned evidence, never reusable authority. The root integration script sets `ALLOW_LOCAL_DATABASE_TESTS=1`, which is localhost-only. Non-local Neon runs require `run-live-integration.ts`, its protected manifest, ownership, restore, consumer and cleanup controls. All four repository CI gates must pass before a changed implementation is verified; this planning reconciliation has not rerun them. Follow the existing go-live build procedure if a fresh candidate build is required.

## 7. Evidence assertion patterns

Read actual tests under `packages/xero/src/oauth/`, `packages/xero/src/rate-limit/`, `packages/database/` and `packages/jobs/src/handlers/reconcile-xero-connections*`. Map their assertions to the matrix rather than inventing empty files or counting a test filename as evidence. Use controlled HTTP faults for unsafe provider failures; only safe owned live operations prove the real contract. No new implementation or test files are requested by this charter.

## 8. Required lifecycle evidence

### 8.3 Mandatory regression/evidence matrix

Historical source ownership below maps the cases to delivered units. Release evidence must still cover every minimum evidence level; completed source ownership does not mark a case PASS:

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

## 9. Completion and stop criteria

### 9.1 Evidence schema

Every matrix case records `caseId`, requirement, required evidence levels, `status` (`PASS`, `FAIL` or `NOT_VERIFIED`), candidate SHA, execution time, non-secret target fingerprint, command/scenario, exit code or observed result, expected/observed assertions, restricted evidence location, fixture ownership, cleanup status and remaining action. Produce Markdown and JSON even when prerequisites fail. Separate source, database, store, browser and provider status; local and deployed SHAs are distinct.

Use the existing report exit contract: 0 PASS, 1 FAIL, 2 NOT VERIFIED/incomplete. A mock is not live provider proof; a single process is not distributed-store proof. Real provider/customer identifiers remain in restricted evidence.

### 9.2 Delivered source, current limits

All nine source slices are delivered. Historical source-gate and migration results remain recorded evidence, not fresh results for `604d754`. Source presence was spot-checked in Section 2. Current database, distributed-store, deployed browser/provider execution and the full 40-case matrix remain NOT VERIFIED until the protected campaign supplies candidate-specific evidence.

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

Report completed onboarding source separately from active Plan 160 AU proof and go-live status. Plan 161 cannot certify AU payroll semantics, import completeness, full product readiness or Xero App Store approval by implication.

### 9.4 STOP conditions

Stop only the affected operation, retain truthful evidence and report its exact remaining prerequisite when:

- Candidate/deployed source or a retained contract has drifted without review.
- Worker/consumer isolation, restore, ownership, cleanup or manifest validation fails. `worker-isolation-unavailable` cannot be bypassed by direct browser execution or labels.
- A target is not owned, an external mutation lacks applicable authority, management capability is unproven, or cleanup mode is still `report_only`.
- Shared-store sentinel/topology cannot prove matching credential-domain admission; no local fallback or relaxed guard is permitted.
- Identity, binding collision or remote outcome is unresolved; never pick a winner or force reconnect.
- A required command fails or collects no required assertions; do not mark it PASS.
- Execution requires source/schema changes, `migrate dev`, `db push`, reset, rebaseline, seeding or disclosure of secrets.

Continue independent read-only reconciliation and record unaffected results. A missing prerequisite remains NOT VERIFIED; it is not permission to alter the safety gate.

### 9.5 Maintenance boundaries

Keep `resolveXeroAccess` as the server-only authority boundary, retain binding-generation versus token-version fencing, and keep shared admission fail-closed. `XeroCredentialOwner`, `XeroRefreshAttempt` and `XeroProviderConnection` are the documented infrastructure exceptions to customer-row scoping. Null canonical-owner FKs preserve the established scoped legacy fallback until a reviewed per-binding cutover; do not misreport its mere presence as an independently deployed legacy writer.

NZ/UK activation, inactivity notices/deletion, replacement-file or cross-account transfer, whole-grant revocation and client-secret rotation are outside this charter. AU transition authority remains `plans/160-au-transition-contract-v1.md`.

## 10. Provider references and final report

`plans/161-xero-provider-contract.md` separates historical primary-source contracts from current repository observation and live evidence. External documentation has not been freshly fetched in this reconciliation. Revalidate the exact primary-source contract before enabling dependent management operations; a link or mock does not establish the app's capability or entitlement.

The final report records candidate/deployed SHA, commands and outcomes, every matrix case, separate source/database/store/browser/provider statuses, fixture cleanup, authority used and exact remaining actions. Plan 161 stays IN PROGRESS until Section 9.3 passes. Completed sub-plan files need not remain in the active backlog and must not be dispatched again.
