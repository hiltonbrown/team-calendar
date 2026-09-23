# Plan 161g: Give every Xero failure its own recovery reason, and move every caller onto the scoped resolver

> **Executor instructions**: Follow this plan step by step. Run every verification command and
> confirm the expected result before moving to the next step. If anything in "STOP conditions"
> occurs, stop and report - do not improvise. When done, update the status row for this plan in
> `plans/README.md` unless a reviewer dispatched you and told you they maintain the index.
>
> **Drift check (run first)**:
> ```bash
> git log --oneline 6b934be..HEAD -- packages/xero/src packages/availability/src packages/jobs/src \
>   packages/core/src/ports "apps/app/app/(authenticated)" apps/app/lib apps/api
> ```
> Expect commits from 161b-161f only. Confirm `resolveXeroAccess` is exported from
> `packages/xero/src/oauth/credential-owner.ts` (161d) and `XeroFetchError` from
> `packages/xero/src/rate-limit/xero-fetch.ts` (161c). Locate each excerpt below by function name;
> a changed body is a STOP condition.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: MED (wide caller surface; the risk is silently changing what a user is told)
- **Depends on**: 161d (`resolveXeroAccess`, mirror-write, legacy fallback for unowned bindings),
  161e (`admission_unavailable`, `cooldown`) and 161f (cleanup records, read by the
  `disconnect_pending` state). This plan does not change 161f's receipt.
- **Category**: bug, tech-debt
- **Planned at**: commit `6b934be`, 23 September 2026 (reviewed and re-stamped from `8652c31`; excerpts re-read at `6b934be`, before 161b-161f)
- **Programme charter**: `plans/161-harden-xero-connection-lifecycle.md`

## Why this matters

Every distinct Xero failure currently collapses into "Xero is not connected". The write adapter
reduces a missing tenant, an expired token, a revoked scope, an exhausted rate budget and an
unreadable encryption key to the same `null`:

```typescript
// packages/xero/src/adapter/xero-write-adapter.ts:71-87 (at 6b934be)
async function getTenant(clerkOrgId: string, organisationId: string) {
  const tenant = await loadTenant(clerkOrgId, organisationId);
  if (!tenant) {
    return null;
  }
  const freshness = await ensureFreshXeroConnection({
    clerkOrgId,
    connectionId: tenant.xero_connection_id,
    organisationId,
  });
  if (!freshness.ok) {
    return null;                       // <-- every distinct cause becomes null
  }
  if (!freshness.value.refreshed) {
    return tenant;
  }
  return await loadTenant(clerkOrgId, organisationId);
}
```

And `hasActiveXeroConnection` (`packages/availability/src/xero-connection-state.ts:12-52`)
returns `false` from its `catch` (`:45-51`), so a database hiccup is shown to the user as "you are
not connected to Xero". Users then reconnect, which does not help and consumes more quota.

The second half finishes 161d's cutover: every consumer that still decrypts `XeroConnection`
token columns itself (kept working by 161d's mirror-write) moves onto `resolveXeroAccess`, so 161h
can scrub the mirrors.

## Current state

### Package dependency direction (load-bearing)

`packages/xero/package.json` depends on `@repo/availability` (`service.ts` imports
`ensureDefaultPublicHolidaysForOrganisation`). `@repo/availability` does **not** depend on
`@repo/xero`, and must not start to: that is a cycle `bun run boundaries` rejects. Therefore:

- Code in `packages/xero` and `packages/jobs` may call `resolveXeroAccess`. `apps/*` never calls
  it; apps reach Xero through `XeroWriteAdapter` and the job dispatchers.
- Code in `packages/availability` reads connection **state** through a new query in
  `@repo/database` (Step 5), never through `@repo/xero`. Availability never needs credentials: its
  Xero writes go through the `ExternalWritePort` interface from `@repo/core`, implemented by
  `XeroWriteAdapter` and injected by the app.

### The neutral error contract

- `packages/core/src/ports/external-write-port.ts` (110 lines): `certainty?: ProviderWriteCertainty`
  at `:9`, plus 161c's `dispatchPhase?`. `XeroWriteAdapter` implements `ExternalWritePort`
  (`xero-write-adapter.ts:90`).
- `packages/xero/src/write/types.ts:3-12`: `XeroWriteError` union of `auth_error`,
  `conflict_error`, `network_error`, `not_found_error`, `permission_error`, `rate_limit_error`,
  `region_not_supported_error`, `unknown_error`, `validation_error`, each with
  `XeroWriteErrorDetails` (`correlationId?`, `httpStatus?`, `message`, `rawPayload?`).
  `XeroTenantForWrite` (`:29-40`) carries `xero_connection.access_token_*` columns: this is how
  write code receives credentials today.

### The collapsing adapter

`xero-write-adapter.ts` (386 lines). `getTenant` is called at `:94, 130, 164, 224, 250, 285, 331`,
once per write operation; its only `return null`s are `:74` and `:82`. The adapter is used by
`apps/app/app/(authenticated)/plans/_actions.ts` (`:65, 83, 344, 371, 391`) and
`apps/app/app/(authenticated)/leave-approvals/_actions.ts` (`:69, 129, 172, 188`).
`packages/xero/src/adapter/auth-recovery.ts` and `auth-recovery.test.ts` hold today's
auth-retry helper.

### Direct credential readers to migrate (non-test)

- `packages/xero/src/au/read.ts`, `au/write.ts`, `nz/read.ts:675`, `uk/read.ts:698` (decrypt from
  the passed tenant row), reached via `packages/xero/src/read/dispatch.ts` and `write/dispatch.ts`.
- `packages/jobs/src/handlers/sync-xero-people.ts:662, 702-703`,
  `sync-xero-leave-balances.ts:560, 683-684`, `sync-xero-leave-records.ts:742, 1445-1446`,
  `reconcile-xero-approval-state.ts:233, 784-785`, `schedule-xero-syncs.ts:225` (dormant
  rotation at `:212-252`).
- `packages/xero/src/adapter/auth-recovery.ts`.
- `packages/database/src/queries/schedulable-xero-tenants.ts` does **not** read credential
  columns (see its comment at `:118`); it filters on connection `status` and `disconnected_at`.
  Keep those filters and add `active_slot = 1` (Step 6).

### Direct connection-state readers to migrate (non-test)

`hasActiveXeroConnection` callers: `approvals/approval-service.ts:809, 1152`;
`people/people-service.ts:666` (DTO `:118`, `:701`); `people/balance-refresh.ts:94` (plus its own
`refresh_token_encrypted` filter at `:103-115`); `people/manual-balance-service.ts:87`;
`plans/submit-service.ts:613`; `plans/plan-service.ts:408, 449, 570, 1084, 1220`;
`dashboard/dashboard-service.ts:721, 1068` (DTO fields `:103, 110, 277, 766, 773, 1105`);
`calendar/calendar-service.ts:309` (DTO `:96, 318`) - all under `packages/availability/src/`.
In `apps/app`: `app/(authenticated)/plans/record-form-data.ts:88`, `app/(authenticated)/plans/page.tsx:137`.
Independent re-implementations: `apps/app/app/(authenticated)/people/page.tsx:96` (own query,
`status === "active"`), `apps/app/lib/server/load-onboarding-state.ts:114`,
`packages/availability/src/sync/sync-monitor-service.ts:998-1017`.

### The settings UI

`apps/app/app/(authenticated)/settings/integrations/xero/_actions.ts` (manual refresh at `:79`
calls `refreshXeroOAuthConnection`, which 161d already routed through the owner coordinator),
`xero-client.tsx`, and the status view `apps/app/app/(authenticated)/settings/integrations/_connection-view.ts`.

### Repository conventions to match

- Service functions return `Result<T, E>`. Route handlers and job adapters map errors.
- **Job adapters translate a retryable failure into the Inngest retry contract (throw so Inngest
  retries). A failed job must never resolve as success.** Outbound write failures are not retried
  automatically.
- Raw Xero payloads go to `xero_write_error_raw` only; employees see `xero_write_error`.
- Named exports only. Strict TypeScript, no `any`. Zod on external input.
- `packages/design-system` components; `DESIGN.md` and `.impeccable.md`. Australian English.
  **No em dashes anywhere.** No `console.log`.

## Commands you will need

**Fresh worktree setup**: `bun install --frozen-lockfile`. Build needs a valid-looking
`DATABASE_URL` and a 32-byte base64 `XERO_TOKEN_ENCRYPTION_KEY` for that command only.

**Local integration database**: 161b's "Local integration database" block, with the `LOCAL_OK`
check. If unavailable, record integration gates `NOT_VERIFIED` and set README status
`BLOCKED (integration gates not run)`.

**Not local gates:** `bun run preflight`, `bun run test:release`.

| Purpose | Command | Expected on success |
|---|---|---|
| Lint | `bun run check` | exit 0 |
| Types | `bun run typecheck` | exit 0 |
| Boundaries | `bun run boundaries` | exit 0 |
| Core units | `bun run --cwd packages/core test` | exit 0 |
| Database units | `bun run --cwd packages/database test` | exit 0 |
| Xero units | `bun run --cwd packages/xero test` | exit 0 |
| Availability units | `bun run --cwd packages/availability test` | exit 0 |
| Jobs units | `bun run --cwd packages/jobs test` | exit 0 |
| App units | `bun run --cwd apps/app test` | exit 0 |
| Jobs integration | `bun run --cwd packages/jobs test:integration` | exit 0 |
| Availability integration | `bun run --cwd packages/availability test:integration` | exit 0 |
| Whitespace | `git diff --check` | exit 0 |

## Scope

**In scope:**
- `packages/core/src/ports/external-write-port.ts`
- `packages/xero/src/write/types.ts`, `write/dispatch.ts`, `read/dispatch.ts` and their tests
- `packages/xero/src/adapter/` (all files), including new `classify-xero-failure.ts` and test
- `packages/xero/src/au/`, `nz/read.ts`, `uk/read.ts` (receive an access token instead of
  decrypting; mechanical for NZ and UK)
- `packages/xero/src/resolution/` (only if a signature above forces it)
- `packages/xero/index.ts` (exports)
- `packages/database/src/queries/xero-connection-state.ts` (create), its wrapper
  `packages/database/queries/xero-connection-state.ts`, and the `exports` entry in
  `packages/database/package.json`
- `packages/database/src/queries/schedulable-xero-tenants.ts` and test
- `packages/availability/src/xero-connection-state.ts`, `packages/availability/index.ts` (its
  export line), and every availability file listed in "Direct connection-state readers", plus
  their tests
- `packages/jobs/src/handlers/` (the five handlers listed) and their tests
- `packages/jobs/src/events.ts` and `events.test.ts` (add `bindingGeneration` to the sync event
  schema at `:21-34`)
- `apps/app/app/(authenticated)/settings/integrations/` (`xero/` and `_connection-view.ts`)
- **Every file under `apps/app/` or `packages/availability/` that the Step 5 grep returns**
  (at `6b934be` this includes `apps/app/app/(authenticated)/dashboard-body.tsx`,
  `people/page.tsx`, `people/people-client.tsx`, `plans/page.tsx`, `plans/record-form-data.ts`,
  `calendar/page.tsx`, and `apps/app/lib/server/load-onboarding-state.ts`), plus the
  `apps/app/components/` files that render the changed DTO field, and their tests.
  `leave-approvals/` and `plans/_actions.ts` only if the adapter's error type change requires it
- `tooling/release/e2e/` (one spec; written, not run)
- `plans/161-xero-provider-contract.md` (endpoint-to-scope column only)
- `plans/161-xero-execution-report.md` (161g section), `plans/README.md` (status row)

**Out of scope - do NOT touch:**
- `packages/xero/src/oauth/` - 161d/161f own it. You **consume** `resolveXeroAccess`.
- `packages/xero/src/rate-limit/` internals - 161e. You read `XeroFetchError` and headers only.
- Plan 159's import orchestration (the sync run lifecycle in the three sync handlers): pass the
  binding generation through it, do not restructure it.
- **Requested OAuth scopes.** Do not narrow or widen them.
- Feed rendering, UID generation and publication identity.
- Scrubbing the mirrored `XeroConnection` credential columns - 161h's rollout.

## Git workflow

- Branch: `codex/xero-connection-hardening` (shared across 161a-161h).
- Conventional commits, e.g. `feat(core): carry recovery reason on provider write errors`,
  `fix(xero): stop collapsing tenant resolution failures to null`,
  `refactor(availability): read xero connection state without collapsing failures`,
  `refactor(jobs): resolve xero access through the scoped resolver`.
- Do NOT push or open a PR.

## Steps

### Step 1: Prove the collapse

In `packages/xero/src/adapter/xero-write-adapter.test.ts` (model on the existing tests there), mock
the tenant-resolution dependency so it fails in three ways: rate admission unavailable
(`XeroFetchError` code `admission_unavailable`), decryption failure (unknown key version), and a
401 whose `WWW-Authenticate` header is `Bearer error="insufficient_scope"`. Assert a write
operation returns three **different** recovery reasons. Today all three produce the same
not-connected result.

**Verify**: `bun run --cwd packages/xero test` → fails on the new test. Paste into a "161g" section
of the execution report.

### Step 2: The recovery reason and the classifier

Add to `packages/xero/src/write/types.ts`:

```typescript
export type XeroRecoveryReason =
  | "update_permissions"        // valid insufficient-scope challenge
  | "reauthorise"               // invalid refresh grant, owner reauthorisation_required
  | "access_denied"             // 403 without a scope challenge; cause not guessed
  | "operational_incident"      // invalid client credentials, unreadable key, admission unavailable
  | "retry_later"               // 429, cooldown, 5xx or network before dispatch
  | "outcome_unknown"           // failure after dispatch of a mutation
  | "not_connected";            // no reserved binding for this organisation
```

and `recoveryReason?: XeroRecoveryReason` and `retryAfterMs?: number` on `XeroWriteErrorDetails`.
Add the same optional `recoveryReason` (as a string union re-declared in core, not imported from
xero) to the `ExternalWritePort` error type.

Create `packages/xero/src/adapter/classify-xero-failure.ts`: a pure function from
`{ response?: Response; error?: unknown; dispatched: boolean; isMutation: boolean }` to
`{ code: XeroWriteError["code"]; recoveryReason: XeroRecoveryReason; retryAfterMs?: number }`,
following this table:

| Evidence | Recovery reason | `XeroWriteError` code |
|---|---|---|
| 401/403 with a `WWW-Authenticate` Bearer challenge whose `error` is `insufficient_scope` **or** `insufficent_scope` (Xero's FAQ spelling) | `update_permissions`; **no refresh** | `permission_error` |
| 401 with no scope indication | caller refreshes once through the owner coordinator and retries once; a second 401 → `reauthorise` | `auth_error` |
| Resolver says `reauthorisation_required` | `reauthorise` | `auth_error` |
| Any other 403 | `access_denied`; the message does not guess a cause | `permission_error` |
| `client_credentials_invalid`, key-version or auth-tag decrypt error, `admission_unavailable`, resolver `configuration_error` | `operational_incident` | `unknown_error` |
| 429 or admission `cooldown`/`minute`/`concurrency`/`daily` denial | `retry_later` with `retryAfterMs` | `rate_limit_error` |
| 5xx, network, deadline, body errors with `dispatched: true` and `isMutation` | `outcome_unknown`; never replayed | `network_error` |
| Same with `isMutation: false`, or anything with `dispatched: false` | `retry_later` | `network_error` |
| Resolver `not_connected`, `disconnected` or `generation_changed` | `not_connected` | `auth_error` |

Parse the challenge header only, never the response body.

**Verify**: `bun run --cwd packages/core test && bun run --cwd packages/xero test` → exit 0 with a
classifier table test covering every row, including both spellings.

### Step 3: Stop the adapter collapsing

Replace `getTenant`'s `null` return with a `Result` from `resolveXeroAccess({ clerkOrgId,
organisationId, capability, deadline })`, where `capability` comes from the Step 4 constant
(write Steps 3 and 4 together if convenient; Step 4's constant must exist before Step 3's tests
pass). Change `XeroTenantForWrite` so write and
read dispatch receive `{ accessToken, xeroTenantId, payrollRegion, bindingGeneration }` instead of
the credential columns, and update `au/`, `nz/read.ts`, `uk/read.ts` to use the passed
`accessToken` instead of decrypting. Update all seven call sites to propagate the classified
error. **Never convert an uncertain payroll write into a retry** because a later refresh was
classified differently.

**Verify**: `bun run --cwd packages/xero test` → exit 0 including Step 1.
`grep -c "return null" packages/xero/src/adapter/xero-write-adapter.ts` prints `0`.
`grep -rn "decryptXeroToken\|tryDecryptXeroToken" packages/xero/src/au packages/xero/src/nz packages/xero/src/uk packages/xero/src/adapter --include=*.ts | grep -v "\.test\.ts"`
returns no matches.

### Step 4: Capability and tenant scoping

Complete the "Minimum documented scope" column of `plans/161-xero-provider-contract.md` for each AU
endpoint from Xero's primary docs; leave `NOT VERIFIED` where the docs do not say. Map each adapter
operation to a capability in one exported constant. A read is never denied because a **write**
scope is missing; a 403 for tenant A never writes anything that affects tenant B. Recovery
reasons are per-operation results and are not persisted, except the owner-level
`reauthorisation_required` that 161d already stores.

**Verify**: `bun run --cwd packages/xero test` → exit 0 with the two scoping tests from the Test plan.

### Step 5: Connection state without collapsing, and without a cycle

Create `packages/database/src/queries/xero-connection-state.ts` exporting
`getXeroConnectionState({ clerkOrgId, organisationId })` returning
`Result<XeroConnectionState, { code: "state_unavailable" }>` where

```typescript
export type XeroConnectionState =
  | "connected"
  | "not_connected"
  | "disconnect_pending"      // local disable done, 161f cleanup attempts unresolved
  | "reauthorisation_required"; // owner usability, or legacy connection status "stale" with an
                                 // invalid refresh grant recorded in last_error_code
export interface XeroConnectionStateResult {
  state: XeroConnectionState;
  bindingGeneration: number | null;
}
```

It reads `XeroTenant` (`active_slot`, `binding_generation`), `XeroConnection.status`,
`disconnected_at`, `revoked_at` and `last_error_code`, the owner's `usability` (owner may be
`NULL`: then use the connection fields only), and unresolved 161f cleanup attempts, scoped by both
IDs. It never selects a credential column. Permission problems are **not** a stored state: they
are per-operation recovery reasons (Step 2), because permission varies by endpoint and tenant.
`sync-monitor-service.ts` keeps its own `expired`/`revoked` distinctions from these fields.

Rewrite `packages/availability/src/xero-connection-state.ts` to export
`getXeroConnectionStateForScope` wrapping that query; a thrown database error returns
`{ ok: false, error: { code: "state_unavailable" } }`, **not** `not_connected`. Update its export
in `packages/availability/index.ts:256`. Delete
`hasActiveXeroConnection` and migrate every caller listed in "Current state". Where a caller only
needs a yes/no to gate a Xero write, treat `state_unavailable` as "cannot check now" and return a
retryable error rather than "not connected". Replace boolean DTO fields
(`hasActiveXeroConnection: boolean`) with `xeroConnectionState: XeroConnectionState | "unavailable"`
and update each rendering component; find them with
`grep -rn "hasActiveXeroConnection" apps packages --include=*.ts --include=*.tsx --exclude-dir=.next --exclude-dir=node_modules`.
Replace the independent re-implementations (`people/page.tsx:96`, `load-onboarding-state.ts:114`,
`sync-monitor-service.ts:998-1017`, `balance-refresh.ts:103-115`) with the same query.

**Verify**: `bun run --cwd packages/availability test && bun run --cwd apps/app test` → exit 0.
`bun run boundaries` → exit 0. The grep above returns no matches.

### Step 6: Jobs

In the five handlers, replace `ensureFreshXeroConnection` plus direct decryption with
`resolveXeroAccess`, passing the binding generation carried in the job event (add
`bindingGeneration` to the event payloads that `schedule-xero-syncs.ts` sends; read it from
`XeroTenant` when scheduling). Before persisting fetched data, re-read `bindingGeneration` from `getXeroConnectionState`; if it
differs from the event's, end the run as cancelled, **not** success.

Classify both the first and the retry response. `retry_later` and `operational_incident` throw so
Inngest retries; `update_permissions`, `reauthorise` and `access_denied` end
the run with the reason code written to the sync run's existing `error_summary` field (the
`SyncRun` model has `error_message` and `error_summary`; add no column), without looping
refreshes. Dormant rotation in
`schedule-xero-syncs.ts` becomes one refresh per credential **owner**, not per connection.

Update `schedulable-xero-tenants.ts` to add `active_slot = 1` to its existing filters (keep the
`status` and `disconnected_at` conditions) and to return `binding_generation` for the event.

**Verify**: `bun run --cwd packages/jobs test` → exit 0 including an exact refresh-count assertion
for a scope failure (zero). `bun run --cwd packages/jobs test:integration` → exit 0.

### Step 7: Interface copy, audit and browser spec

In the settings integration UI and the components that render `xeroConnectionState`, one string
per state/reason, with `packages/design-system` components:

- `update_permissions`: "Update Xero permissions to continue."
- `reauthorise` / `reauthorisation_required`: "Xero access needs to be renewed."
- `access_denied`: "Xero declined this request. Check that the person who connected Xero still has
  payroll access."
- `retry_later`: "Xero is temporarily unavailable. Try again after {time}." (format `retryAfterMs`
  as a local time)
- `outcome_unknown`: "We could not confirm whether Xero received this change. Check Xero before
  trying again."
- `operational_incident` / `unavailable`: "We cannot reach Xero right now. Our team has been
  notified."
- `disconnect_pending`: "Sync stopped. Xero disconnection is pending."
- `not_connected`: existing "connect Xero" copy, unchanged.

Do not present a queued job as a completed sync, a disabled connection as remotely deleted, or a
store failure as revocation. Audit metadata carries only reason codes, operation and attempt IDs,
generations and timing; never tokens, codes, state, nonces, raw headers or payroll content.

Write one Playwright spec under `tooling/release/e2e/` asserting each string renders for its
reason. Record it `NOT_VERIFIED` in the execution report (it runs in the Plan 160 campaign).

**Verify**: `bun run --cwd apps/app test` → exit 0. `bun run test:release-tools` → exit 0.

## Test plan

`classify-xero-failure.test.ts` (new): one case per table row; both challenge spellings; body text
containing "insufficient_scope" without a header is **not** `update_permissions`.

`xero-write-adapter.test.ts` / `auth-recovery.test.ts`:
1. The three Step 1 cases give three reasons.
2. Insufficient-scope challenge → zero refresh calls.
3. Expired access token with no scope indication → exactly one refresh and one retry.
4. Insufficient scope on that retry → `update_permissions`.
5. Invalid client credentials → `operational_incident`, and no binding or owner row is written
   (assert on the database mock).
6. Pre-dispatch rejection is a definite non-attempt; a post-dispatch lost mutation response is
   `outcome_unknown` and not replayed.

`au/read.test.ts`, `au/write.test.ts`:
7. A write-scope failure leaves reads working.
8. A 403 for one tenant does not change a sibling tenant's state.

`packages/jobs/src/handlers/*.test.ts`:
9. A scope failure makes zero refresh calls and ends the run with `update_permissions`.
10. `retry_later` throws (Inngest retries); the run is never recorded as success.
11. A changed binding generation mid-run ends as cancelled, not success.

`packages/availability` tests:
12. A database error in `getXeroConnectionStateForScope` yields `unavailable` in the DTO, **not**
    `not_connected`. This is the headline behaviour change.

`apps/app` tests:
13. Each state renders its own copy, no em dash.
14. No token, code, state, nonce, raw header or payroll content in any DTO or rendered output.

## Done criteria

All must hold:

- [ ] `bun run check`, `bun run typecheck`, `bun run boundaries` exit 0
- [ ] `bun run --cwd packages/core test`, `packages/database test`, `packages/xero test`, `packages/availability test`, `packages/jobs test`, `apps/app test` all exit 0
- [ ] `bun run --cwd packages/jobs test:integration` and `bun run --cwd packages/availability test:integration` exit 0 locally
- [ ] `bun run test:release-tools` exits 0
- [ ] `git diff --check` exits 0
- [ ] `grep -c "return null" packages/xero/src/adapter/xero-write-adapter.ts` prints `0`
- [ ] `grep -rn "hasActiveXeroConnection" apps packages --include=*.ts --include=*.tsx --exclude-dir=.next --exclude-dir=node_modules` returns no matches
- [ ] `grep -rln "refresh_token_encrypted\|access_token_encrypted\|decryptXeroToken" packages/availability/src packages/jobs/src packages/xero/src/au packages/xero/src/nz packages/xero/src/uk packages/xero/src/adapter apps/app/app apps/app/lib --include=*.ts --include=*.tsx | grep -v "\.test\.ts\|\.integration\.test\.ts"` returns no files
- [ ] `grep -n "@repo/xero" packages/availability/package.json` returns no matches
- [ ] A spec under `tooling/release/e2e/` references each recovery string; the execution report records it `NOT_VERIFIED`
- [ ] `git status --short -- . ':!plans'` shows no modified file outside the In scope list, and `plans/` changes are limited to the files this plan names
- [ ] `plans/README.md` status row for 161g updated

## STOP conditions

Stop and report; do not improvise:

- `resolveXeroAccess` does not exist (161d not landed). Do Steps 1, 2 and 4 only and report.
- Migrating a caller would require `@repo/availability` to import `@repo/xero`.
- Migrating a sync handler would require restructuring Plan 159's run lifecycle or changing AU
  approval semantics.
- You conclude the requested OAuth scopes must change. Record the endpoint requirement in the
  ledger and report.
- A generic 403 tempts you to name a specific cause.
- The Step 5 grep returns a file outside `apps/app/` and `packages/availability/`. Report it before
  editing.
- A step's verification fails twice after a reasonable fix attempt.
- You are about to put a raw Xero error code, raw header, token or payroll content into an
  employee-facing DTO, log or snapshot.

## Maintenance notes

- **Distinct causes stay distinct.** Any new `return null` or bare `catch` in the provider boundary
  that yields "not connected" undoes this plan.
- **"Invalid client credentials" is an incident, not a customer event.** Test 5 asserts on writes.
- **Refresh counts are assertions.** Tests 2, 3 and 9.
- **Availability never imports `@repo/xero`.** Connection state is a database read; credentials are
  only ever resolved in `packages/xero`, `packages/jobs` and `apps/*`.
- After this plan, nothing reads the mirrored `XeroConnection` credential columns. 161h's rollout
  may scrub them; 161d's mirror-write can then be removed in a follow-up.
- Changing a reason's meaning without changing its copy misinforms customers. Change them together.
- Deferred: scope changes, NZ/UK activation, AU submission or approval semantics.
