# Plan 161f: Make disconnect commit locally at once, move remote deletion to a fenced worker, and return a truthful receipt

> **Executor instructions**: Follow this plan step by step. Run every verification command and
> confirm the expected result before moving to the next step. If anything in "STOP conditions"
> occurs, stop and report - do not improvise. When done, update the status row for this plan in
> `plans/README.md` unless a reviewer dispatched you and told you they maintain the index.
>
> **Drift check (run first)**:
> ```bash
> git log --oneline 6b934be..HEAD -- packages/xero/src/oauth packages/jobs/src \
>   "apps/app/app/(authenticated)/settings/integrations/xero" packages/database/prisma
> ```
> Expect commits from 161b-161e only. Confirm they landed: `resolveXeroAccess` and
> `refreshXeroCredentialOwner` exist in `packages/xero/src/oauth/credential-owner.ts` (161d),
> `xeroRateKeys` exists in `packages/xero/src/rate-limit/xero-fetch.ts` (161e). Then locate each
> excerpt below by function name; a changed body is a STOP condition.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: HIGH (this plan can issue irreversible DELETE requests to a customer's Xero account)
- **Depends on**: 161b (binding columns), 161c (deadlines, `XeroFetchError`), 161d (credential
  owner, `XeroProviderConnection`, lock order), 161e (`app_management` rate class). All DONE.
- **Category**: bug, security
- **Planned at**: commit `6b934be`, 23 September 2026 (reviewed and re-stamped from `8652c31`; excerpts re-read at `6b934be`, before 161b-161e)
- **Programme charter**: `plans/161-harden-xero-connection-lifecycle.md`

## Why this matters

`disconnectXeroOAuthConnection` runs the remote DELETE **inside** a 20-second database
transaction, and the whole disconnect succeeds or fails with it:

- If the DELETE times out, fails on the network, returns 5xx, 401 or 403, the function returns an
  error and **nothing is disabled locally**. The customer asked to stop syncing and sync keeps
  running.
- If it succeeds, the receipt is a single boolean, `remoteRevoked`, which is `false` for four
  different situations: already disconnected, no remote link recorded, refresh grant invalid after
  a 401, and remote 404. Only the last one is evidence about Xero.
- A DELETE response lost after Xero processed it leaves no record that a destructive request is
  outstanding, so a later reconnect can land on a link that a late DELETE removes.

This plan makes the local disable commit immediately and durably, records a cleanup request with
per-target state, moves the remote DELETE to a fenced background worker using Xero's
app-management client, and replaces the boolean with a receipt that can say `unknown` honestly.

**Behaviour change to be aware of.** Remote deletion is gated by `XERO_REMOTE_CLEANUP_MODE`,
default `report_only`. Until an operator sets `enabled` (a 161h rollout step), disconnect no longer
removes the remote Xero link at all, where today it tries once inline with the customer's token.
The receipt says so truthfully (`remoteStatus: "pending"`). This is intentional: the charter keeps
destructive cleanup off until its evidence gates pass.

## Current state

### Disconnect today

Single caller: `disconnectXeroAction` in
`apps/app/app/(authenticated)/settings/integrations/xero/_actions.ts:130`, via the export in
`packages/xero/index.ts:9`. The action checks the typed confirmation, calls
`disconnectXeroOAuthConnection({ clerkOrgId, connectionId, destructive, organisationId, performedByUserId })`,
maps any error to `unknownError(result.error.message)`, writes an `auditEvent` whose `metadata`
includes `remoteRevoked: result.value.remoteRevoked` (`:150-153`), and returns
`{ ok: true, value: { disconnected: true } }`. `remoteRevoked` never reaches the client.

`packages/xero/src/oauth/service.ts`:

- `disconnectXeroOAuthConnection` (`:1283`) wraps `disconnectXeroOAuthConnectionWithClient` in
  `database.$transaction(..., { timeout: 20_000 })` (`:1289-1292`); any throw becomes
  `unknown_error`.
- `disconnectXeroOAuthConnectionWithClient` (`:1308`) takes
  `pg_advisory_xact_lock(hashtextextended(connectionId, 0))`, loads the connection, returns
  `{ disconnected: true, remoteRevoked: false }` if already `disconnected` (`:1322-1327`), calls
  `prepareConnectionForDisconnect` (may refresh the token, `:1363-1424`), then
  `revokePreparedXeroConnection` (a 401 triggers one refresh and retry, `:1459-1485`; no
  authorisation connection ID or a terminal authorisation returns `remoteRevoked: false` at
  `:1439`; invalid refresh grant after 401 returns `false` at `:1470`), then
  `finaliseLocalXeroDisconnect` (`:1560-1648`).
- `revokeXeroConnectionAtSource` (`:1650`) sends `DELETE https://api.xero.com/connections/{xero_authorisation_connection_id}`
  with the **customer** access token via `xeroFetch` with `maxAttempts: 1`; 2xx → `true`, 404 →
  `false` (`:1669`), any throw → `network_error` (`:1685-1693`), other statuses → an error.
- `finaliseLocalXeroDisconnect` blanks the token columns and sets `status: "disconnected"`. When
  `destructive` it also deletes `leaveBalance` and `xeroPersonMatch` rows, archives Xero-sourced
  persons and nulls their `clerk_user_id`, nulls `xero_employee_id` on all persons, archives
  Xero-sourced `availabilityRecord`s, and deletes `syncRun` and `xeroSyncCursor` rows for the
  tenant. It calls no feed or publication invalidation. It never deletes the `XeroConnection` or
  `XeroTenant` row.

`remoteRevoked` appears at `service.ts:116, 1286, 1312, 1358, 1434, 1456, 1482`, and in
`_actions.ts:152`, `_actions.test.ts:85`, `service.test.ts:1454, 1522, 1547, 1608`,
`disconnect.integration.test.ts:89, 109`.

OAuth session scrubbing is a separate cron path: `scrubInactiveXeroOAuthSessionCredentials`
(`service.ts:321-368`) blanks tokens and `available_tenants_json`, called only from
`packages/jobs/src/handlers/schedule-xero-syncs.ts:365`.

### Provider contract

`plans/161-xero-provider-contract.md` records, as **DOCUMENTED**: `POST https://identity.xero.com/connect/token`
with `grant_type=client_credentials` and the singular form parameter `scope=app.connections`
returns `access_token`, `expires_in`, `token_type` and **no refresh token**; that token may call
`GET https://api.xero.com/connections` and `DELETE https://api.xero.com/connections/{connectionId}`.
Only this app's management-tier enablement and credential provisioning are **NOT VERIFIED**. The
client-credentials request uses the existing `XERO_CLIENT_ID` and `XERO_CLIENT_SECRET`.

### Jobs

`packages/jobs/src/functions.ts` exports the `functions` array that `apps/api/app/api/inngest/route.ts`
serves; adding a function there registers it. Handler files follow `<job>.ts`, `<job>.test.ts`,
`<job>.integration.test.ts`. Models: `schedule-xero-syncs.ts` for a **cron** trigger
(`*/15 * * * *`), `reconcile-xero-approval-state.ts` for an **event** trigger. The new job is cron-only:
`packages/xero` cannot send an Inngest event (`@repo/jobs` already depends on `@repo/xero`, so the
reverse import is a cycle).

### Fixtures and inventory

Registered in `LIVE_FIXTURE_SUITES` (not yet in `tooling/release/integration-inventory.ts`):
`packages/xero/src/oauth/connection-cleanup.integration.test.ts` and
`packages/jobs/src/handlers/reconcile-xero-connections.integration.test.ts`, each with 2 tenants
and `provider_connection`, `tenant_binding`, `cleanup_request`, `cleanup_attempt` keys.
`packages/database/xero-lifecycle-migration.integration.test.ts` (created by 161b) owns
`cleanup_request` and `cleanup_attempt` keys too.

### Repository conventions to match

- `Result<T, E>` from `@repo/core`. Named exports only. Strict TypeScript, no `any`.
- Zod on all external input, including every Xero response.
- **Jobs carry `clerk_org_id` and `organisation_id` in their event payload and never rely on
  session context.** Record-level failures do not fail the run.
- **Maintenance jobs never replay a payroll mutation.** Deleting a connection is not a payroll
  mutation, which is why it may be a job.
- Raw provider payloads never reach an employee-facing surface.
- UI: `packages/design-system` components, `DESIGN.md` and `.impeccable.md`. Australian English.
  **No em dashes anywhere.** No `console.log`.

## Commands you will need

**Fresh worktree setup**: `bun install --frozen-lockfile`. Build needs a valid-looking
`DATABASE_URL` and a 32-byte base64 `XERO_TOKEN_ENCRYPTION_KEY` for that command only.

**Local integration database and store**: use exactly the Postgres block from 161b ("Local
integration database") and the SRH block from 161e ("Local shared store"), including the
`LOCAL_OK` check before `bun run migrate:deploy`. If either is unavailable, record integration
gates `NOT_VERIFIED` in the execution report and set README status `BLOCKED (integration gates not run)`.
A run that collects zero tests from a file this plan names is a failure.

**Not local gates:** `bun run preflight`, `bun run test:release`.

| Purpose | Command | Expected on success |
|---|---|---|
| Lint | `bun run check` | exit 0 |
| Types | `bun run typecheck` | exit 0 |
| Xero units | `bun run --cwd packages/xero test` | exit 0 |
| Jobs units | `bun run --cwd packages/jobs test` | exit 0 |
| Database units | `bun run --cwd packages/database test` | exit 0 |
| App Xero tests | `bun run --cwd apps/app test 'app/(authenticated)/settings/integrations/xero'` | exit 0 |
| Apply migrations (local) | `bun run migrate:deploy` | exit 0 after `LOCAL_OK` |
| Xero integration | `bun run --cwd packages/xero test:integration` | exit 0 |
| Jobs integration | `bun run --cwd packages/jobs test:integration` | exit 0 |
| Database integration | `bun run --cwd packages/database test:integration` | exit 0 |
| Release tooling | `bun run test:release-tools` | exit 0 |
| Whitespace | `git diff --check` | exit 0 |

## Scope

**In scope:**
- `packages/database/prisma/schema.prisma` and one new additive migration
  `<timestamp>_add_xero_cleanup_requests/`
- `packages/database/src/queries/xero-cleanup.ts` (create), its wrapper
  `packages/database/queries/xero-cleanup.ts`, and the `exports` entry in
  `packages/database/package.json`
- `packages/database/generated/` (regenerated by `prisma generate`; tracked in git)
- `packages/xero/scripts/reissue-xero-cleanup.ts` (create) and its `packages/xero/package.json`
  script entry
- `packages/database/xero-lifecycle-migration.integration.test.ts` (cleanup-state tests)
- `packages/xero/src/oauth/management-client.ts`, `management-client.test.ts` (create)
- `packages/xero/src/oauth/connection-cleanup.ts`, `connection-cleanup.test.ts`,
  `connection-cleanup.integration.test.ts` (create)
- `packages/xero/src/oauth/service.ts` (the disconnect functions, plus the reconnect fence and the
  `cleanup_unresolved` code in `completeXeroTenantSelection`), `service.test.ts`,
  `disconnect.integration.test.ts`
- `packages/xero/keys.ts`, `keys.test.ts` (`XERO_REMOTE_CLEANUP_MODE`)
- `packages/xero/index.ts` (exports)
- `packages/jobs/src/handlers/reconcile-xero-connections.ts`, `.test.ts`, `.integration.test.ts` (create)
- `packages/jobs/src/functions.ts`
- `apps/app/app/(authenticated)/settings/integrations/xero/_actions.ts`, `_actions.test.ts`,
  `xero-client.tsx`, `xero-client.test.tsx`
- `tooling/release/integration-inventory.ts` and `.test.ts` (add the two new suites)
- `tooling/release/e2e/` (one new spec file for the disconnect states; written, not run)
- `apps/app/.env.example`, `apps/api/.env.example` (commented `XERO_REMOTE_CLEANUP_MODE`)
- `plans/161-xero-execution-report.md` (161f section, including the operator procedure),
  `plans/README.md` (status row)

**Out of scope - do NOT touch:**
- Credential storage and refresh - 161d. You **consume** the owner coordinator.
- Rate limiting internals - 161e. You **consume** the `app_management` class.
- Error classification and recovery reasons - 161g.
- Inactivity assessment - 161h. This plan deletes only on an **explicit** user disconnect.
- **Whole-user token revocation.** Never revoke an owner's entire grant to remove one binding.
- Feed rendering, UID generation, calendar semantics. The destructive branch's data changes stay
  exactly as they are today.
- `CLAUDE.md` job list - 161h updates the documentation.

## Git workflow

- Branch: `codex/xero-connection-hardening` (shared across 161a-161h).
- Conventional commits, e.g. `feat(database): add xero cleanup request records`,
  `feat(xero): add app management client`, `feat(xero): commit disconnect locally before cleanup`,
  `feat(jobs): add reconcile-xero-connections`, `refactor(app): show xero disconnect receipt`.
- Do NOT push or open a PR.

## Steps

### Step 1: Prove the defect

In `service.test.ts`, next to the disconnect tests at `:1454-1608`, add:

1. The DELETE throws (injected `fetchImpl` rejects). Assert the call returns `ok: true` and that
   the transaction mock received the local disable write (`status: "disconnected"`). Today it
   returns `network_error` and writes nothing, so this fails.
2. "Already disconnected" and "remote 404" must produce different receipts. Today both are
   `remoteRevoked: false`, so this fails.

**Verify**: `bun run --cwd packages/xero test` → fails on exactly these two. Paste into a "161f"
section of the execution report.

### Step 2: Cleanup records (schema first)

Add to `schema.prisma`:

```prisma
model XeroCleanupRequest {
  id                 String   @id @default(uuid()) @db.Uuid
  clerk_org_id       String
  organisation_id    String   @db.Uuid
  xero_tenant_id     String   @db.Uuid   // internal XeroTenant.id (FK below)
  binding_generation Int                 // XeroTenant.binding_generation after the disconnect increment
  requested_by_user_id String
  destructive        Boolean
  data_action_status xero_cleanup_data_action_status
  created_at         DateTime @default(now())
  updated_at         DateTime @updatedAt
  attempts           XeroCleanupAttempt[]
  organisation       Organisation @relation(fields: [organisation_id], references: [id])
  xero_tenant        XeroTenant   @relation(fields: [xero_tenant_id], references: [id])
  @@index([clerk_org_id])
  @@index([organisation_id])
  @@map("xero_cleanup_requests")
}

model XeroCleanupAttempt {
  id                          String    @id @default(uuid()) @db.Uuid
  clerk_org_id                String
  organisation_id             String    @db.Uuid
  xero_cleanup_request_id     String    @db.Uuid
  provider_app_id             String
  remote_connection_id        String
  expected_binding_generation Int
  state                       xero_cleanup_attempt_state @default(pending)
  lease_owner                 String?
  lease_expires_at            DateTime?
  dispatched_at               DateTime?
  deadline_at                 DateTime?
  next_attempt_at             DateTime?
  retry_count                 Int       @default(0)
  outcome_reason              String?   // safe, allowlisted code; never a raw payload
  correlation_id              String?
  created_at                  DateTime  @default(now())
  updated_at                  DateTime  @updatedAt
  request XeroCleanupRequest @relation(fields: [xero_cleanup_request_id], references: [id])
  @@unique([xero_cleanup_request_id, remote_connection_id])
  @@index([state, next_attempt_at])
  @@index([clerk_org_id])
  @@map("xero_cleanup_attempts")
}
```

Add the matching back-relation fields (`XeroCleanupRequest[]`) to `Organisation` and `XeroTenant`,
and two enums (the repository convention is "Enums at database level"):
`enum xero_cleanup_data_action_status { not_requested pending completed failed }` and
`enum xero_cleanup_attempt_state { pending claimed dispatching confirmed_deleted confirmed_absent unknown blocked_authorisation cancelled }`.
Per-target states:

| State | Meaning |
|---|---|
| `pending` | Authorised target, no request issued |
| `claimed` | A worker holds a bounded lease; dispatch not recorded |
| `dispatching` | Durable marker written **before** the provider request; a crash leaves the outcome unknown |
| `confirmed_deleted` | Targeted DELETE returned 2xx |
| `confirmed_absent` | The verified targeted DELETE endpoint returned 404 for the exact ID |
| `unknown` | The request may have executed, or evidence is insufficient |
| `blocked_authorisation` | Management authorisation failed (401/403 from the token or DELETE call) |
| `cancelled` | Never dispatched and no longer to be: superseded by a reconnect, or recorded under `report_only` (`outcome_reason: "report_only"`) |

Generate the migration with 161b's **schema-to-schema** diff
(`--from-schema <before.prisma> --to-schema prisma/schema.prisma --script`, run from
`packages/database`). Read it: only `CREATE TYPE`, `CREATE TABLE`, `CREATE INDEX`, foreign keys;
no `DROP`.

Add `packages/database/src/queries/xero-cleanup.ts`, its wrapper
`packages/database/queries/xero-cleanup.ts`, and the matching `exports` entry in
`packages/database/package.json` (copy the pattern of an existing entry such as
`./queries/outbound-operations`). Functions, each filtering by `clerk_org_id` and
`organisation_id` except the sweep:
`createXeroCleanupRequest`, `claimXeroCleanupAttempt` (compare-and-set on `state` and lease),
`markXeroCleanupAttemptDispatching`, `recordXeroCleanupAttemptOutcome` (compare-and-set on attempt
ID and lease owner), `listDueXeroCleanupAttempts` (system sweep; returns attempt IDs and scope IDs
only).

**Verify**: `bun run migrate:deploy` (after `LOCAL_OK`) → exit 0. `bun run --cwd packages/database test:integration`
→ exit 0 with new tests in `xero-lifecycle-migration.integration.test.ts`: a claim by a second
lease owner fails while the first lease is live; an outcome write with a stale lease owner is
rejected; attempts are unique per request and remote connection.

### Step 3: The app-management client

Create `management-client.ts`, **server-only**:

- `getXeroManagementToken({ deadline })`: `POST https://identity.xero.com/connect/token` with
  HTTP Basic `XERO_CLIENT_ID:XERO_CLIENT_SECRET`, body `grant_type=client_credentials&scope=app.connections`,
  through `xeroFetch` with `rateClass: { kind: "app_management", providerAppId }`. Parse with a
  **separate** Zod schema: `access_token`, `expires_in`, `token_type`, optional `scope`; no
  `refresh_token`. Cache in module memory until 60 seconds before expiry; a concurrent miss shares
  one in-flight promise.
- `deleteXeroConnection({ remoteConnectionId, deadline })`: validate `remoteConnectionId` is a
  UUID, `DELETE https://api.xero.com/connections/{id}` with the management token and
  `maxAttempts: 1`, `retryOnAmbiguousFailure: false`. Return a typed outcome:
  `deleted` (2xx), `absent` (404), `auth_failed` (401/403), `rate_limited` (429, with
  `retryAfterMs`), `server_error` (5xx), `not_sent` (a `XeroFetchError` with `dispatched: false`),
  `unknown` (any other throw or `dispatched: true` error).
- The returned token type is branded (`XeroManagementAccessToken`) so it cannot be passed where a
  customer access token is expected. **Do not add `app.connections` to the customer consent scopes.**

**Verify**: `bun run --cwd packages/xero test` → exit 0 with `management-client.test.ts`.

### Step 4: Split local disable from remote deletion

Add `XERO_REMOTE_CLEANUP_MODE: z.enum(["report_only", "enabled"]).optional()` to
`packages/xero/keys.ts`; absent means `report_only`. Add a commented placeholder to both
`.env.example` files.

Create `packages/xero/src/oauth/connection-cleanup.ts`. It holds the pure and database logic for
this plan's cleanup: `freezeCleanupTargets` (below), `aggregateXeroDisconnectReceipt` (Step 5),
`getXeroDisconnectReceipt` (Step 5), and `mapDeleteOutcomeToState` (Step 6). `service.ts` and the
job import from it.

Rewrite `disconnectXeroOAuthConnectionWithClient` so the transaction contains **no HTTP**:

1. Take locks in the 161d order: owner (if any), then the binding lock
   `hashtextextended('xero-binding:' || <XeroTenant.id>, 0)`, then the existing connection lock.
   Load the connection and tenant scoped by both IDs.
2. If already `disconnected`, return the receipt of the latest request for this tenant (or
   `remoteStatus: "not_applicable"` if none).
3. Run today's `finaliseLocalXeroDisconnect` unchanged (status, token blanking, destructive data
   changes) and set `XeroTenant.binding_generation: { increment: 1 }`. 161d's resolver and
   mirror-write already refuse `disconnected` connections, so sync and credential use stop here.
4. `freezeCleanupTargets`: if the tenant has an owner, the `XeroProviderConnection` rows for this
   tenant's `(provider_app_id, xero_tenant_id)` whose `xero_credential_owner_id` equals that owner;
   **if the tenant has no owner, only the legacy `xero_authorisation_connection_id`**. Add the legacy
   ID too when set and not already included. Never add connections of the same authoriser for other
   tenants, and never match on a `NULL` owner.
5. Create one `XeroCleanupRequest` (`binding_generation` and each attempt's
   `expected_binding_generation` set to the value **after** the increment in step 3;
   `data_action_status` `completed` if destructive else `not_requested`) with one attempt per
   target.
6. Retirement: if there are **no** targets, or `XERO_REMOTE_CLEANUP_MODE` is `report_only`, create
   the attempts directly as `cancelled` with `outcome_reason: "report_only"` (or none when there are
   no targets) and retire the binding in the same transaction (`active_slot: null`, `retired_at`,
   `retirement_reason: "disconnected"`). Nothing will ever be dispatched for them, so there is
   nothing to fence and the file must not stay reserved. Only in `enabled` mode do attempts start
   `pending` and the binding stay reserved until the worker resolves them.

No Inngest event is sent: `packages/xero` cannot import `@repo/jobs` (jobs already depends on xero).
The Step 6 cron sweep picks up new attempts within 15 minutes.

Remove `prepareConnectionForDisconnect`'s refresh and `revokePreparedXeroConnection` from the
disconnect path, and delete `revokeXeroConnectionAtSource`; the inline DELETE is gone.

**Verify**: `bun run --cwd packages/xero test` → exit 0 including both Step 1 tests.

### Step 5: The receipt

Replace `{ disconnected: true; remoteRevoked: boolean }` with:

```typescript
export interface XeroDisconnectReceipt {
  cleanupRequestId: string | null;
  dataActionStatus: "not_requested" | "pending" | "completed" | "failed";
  localDisabled: true;
  remoteStatus:
    | "not_applicable"      // no remote link was recorded
    | "left_in_place"       // report_only: the remote link was deliberately not removed
    | "pending"             // enabled mode: targets recorded, none resolved yet
    | "confirmed_deleted"
    | "confirmed_absent"
    | "partially_confirmed" // some targets confirmed, others unresolved
    | "unknown"
    | "blocked_authorisation";
}
```

`aggregateXeroDisconnectReceipt(attemptStates)` applies these rules in order:
1. no attempts → `not_applicable`;
2. all `cancelled` with reason `report_only` → `left_in_place`;
3. any `unknown` or `dispatching` → `unknown`;
4. any `blocked_authorisation` → `blocked_authorisation`;
5. every attempt `confirmed_deleted`/`confirmed_absent`/`cancelled` → `confirmed_deleted` if any
   was deleted, else `confirmed_absent`;
6. some confirmed and some `pending`/`claimed` → `partially_confirmed`;
7. otherwise → `pending`.
Never report overall success while any target is unresolved. `getXeroDisconnectReceipt({ clerkOrgId,
organisationId, cleanupRequestId })` loads the attempts and applies it.

In `_actions.ts`, return `{ disconnected: true, receipt }` (no raw IDs beyond `cleanupRequestId`),
and write `remoteStatus` instead of `remoteRevoked` into the audit metadata. In `xero-client.tsx`
show, with existing `packages/design-system` components:

- `not_applicable`: "Disconnected from Xero."
- `left_in_place`: "Sync stopped. Team Calendar no longer uses this Xero connection. To remove it
  from Xero as well, open Connected apps in Xero."
- `pending`: "Sync stopped. Xero disconnection is pending."
- `confirmed_deleted` / `confirmed_absent`: "Disconnected from Xero."
- `partially_confirmed` / `unknown` / `blocked_authorisation`: "Sync stopped. We could not confirm
  the Xero disconnection. Our team has been notified."

Update every `remoteRevoked` occurrence listed in "Current state".

**Verify**: `bun run --cwd apps/app test 'app/(authenticated)/settings/integrations/xero'` → exit 0.
`grep -rn "remoteRevoked" packages/ apps/ --include=*.ts --include=*.tsx --exclude-dir=.next --exclude-dir=node_modules`
→ no matches.

### Step 6: The worker

Create `packages/jobs/src/handlers/reconcile-xero-connections.ts` exporting
`reconcileXeroConnectionsFunction`, triggered by cron `*/15 * * * *` only (model on
`schedule-xero-syncs.ts`). Add it to `functions` in `packages/jobs/src/functions.ts`.

For each due attempt (bounded batch of 50):
1. If `XERO_REMOTE_CLEANUP_MODE` is not `enabled`: make **no** provider call; leave `pending`.
2. `claimXeroCleanupAttempt` with a 2-minute lease. A `claimed` attempt whose lease expired is
   claimable again (it was never dispatched).
3. **One transaction, under the binding lock** (`hashtextextended('xero-binding:' || tenantId, 0)`,
   the same lock reconnect takes in step "Reconnect fencing" below): re-read the tenant; if
   `binding_generation` differs from `expected_binding_generation` (a reconnect happened), set the
   attempt `cancelled` and stop; otherwise set it `dispatching` with `dispatched_at`. Commit.
   Because the check and the marker share one transaction under the lock reconnect also takes, no
   reconnect can slip between them.
4. Call `deleteXeroConnection` outside any transaction.
5. Record the outcome with `recordXeroCleanupAttemptOutcome` (attempt ID and lease owner checked),
   via `mapDeleteOutcomeToState`: `deleted` → `confirmed_deleted`; `absent` → `confirmed_absent`;
   `auth_failed`, or a failed management-token call (401/403) → `blocked_authorisation`;
   `not_sent`, a management-token network failure, or `rate_limited` → back to `pending` with
   `next_attempt_at` (from `retryAfterMs`, else exponential backoff with jitter, base 1 minute,
   cap 1 hour, no maximum: a definitely-unsent attempt never becomes `unknown`); `server_error` and
   `unknown` → `unknown`.
6. An attempt found in `dispatching` with an expired lease becomes `unknown`.
7. When every attempt of a request is `confirmed_*` or `cancelled`, retire the binding in a
   transaction under the binding lock, only if `binding_generation` still equals the request's
   `binding_generation`.

**Reconnect fencing.** In `completeXeroTenantSelection`, take the binding lock before the 161b
guard. If the tenant has any attempt in `claimed`, `dispatching` or `unknown`, throw 161b's
`TenantSelectionRejectedError` with a new code `cleanup_unresolved` (message: "A previous Xero
disconnection is still being confirmed. Try again later or contact support."). Otherwise mark the
tenant's `pending` attempts `cancelled`. 161b's selection then increments `binding_generation`, so
any later worker pass sees the change. Do not assume a reconnect yields a different remote
connection ID.

**Leaving `unknown`.** An operator may re-issue the **same** targeted DELETE for an `unknown`
attempt while reconnect remains fenced: a 2xx gives `confirmed_deleted`, a targeted 404 gives
`confirmed_absent`. Add `reissueXeroCleanupAttempt({ attemptId, operatorUserId })` to
`connection-cleanup.ts` (it re-enters step 3 with the attempt's existing generation) and a
`packages/xero/scripts/reissue-xero-cleanup.ts` wrapper with a `cleanup:reissue` script entry in
`packages/xero/package.json`. It is never called automatically.

Job payloads carry IDs and generations only.

**Verify**: `bun run --cwd packages/jobs test && bun run --cwd packages/jobs test:integration` →
exit 0 listing `reconcile-xero-connections.integration.test.ts`.

### Step 7: Operator procedure, inventory and browser spec

Write the `unknown`/`blocked_authorisation` operator procedure into the 161f section of the
execution report: how to list them (`xero_cleanup_attempts` by state and age), the required
evidence to resolve (a later authoritative `GET /connections` inventory showing absence is
**report-only evidence**, not a confirmation), the escalation route to Xero support, and an alert
threshold (application policy: any `unknown` older than 24 hours). **No "force reconnect" button.**

Add both new integration suites to `tooling/release/integration-inventory.ts` in sorted order and
bump the `N-suite` count in the message and test.

Write one Playwright spec under `tooling/release/e2e/` (model on an existing spec there) asserting
the three receipt messages. It runs in the Plan 160 campaign, not locally; record it
`NOT_VERIFIED` in the execution report.

**Verify**: `bun run test:release-tools && bun run typecheck:release-tools` → exit 0.

## Test plan

`management-client.test.ts`: a token response with no `refresh_token` parses; a customer token
type is rejected where `XeroManagementAccessToken` is required (a `// @ts-expect-error` line);
each DELETE status maps to its outcome; a 401 on the token call does not attempt any DELETE.

`connection-cleanup.test.ts` / `service.test.ts`: the two Step 1 regressions; the receipt
aggregate for each combination (all deleted → `confirmed_deleted`; one deleted plus one
`unknown` → `unknown`; one deleted plus one `pending` → `partially_confirmed`); target
freezing excludes a same-authoriser connection for a different tenant.

`connection-cleanup.integration.test.ts` (local DB):
1. With `XERO_REMOTE_CLEANUP_MODE=enabled`, local disable commits with zero provider calls and the
   receipt is `pending`.
2. No remote link → binding retired immediately, receipt `not_applicable`.
3. Destructive request: data changes match today's `finaliseLocalXeroDisconnect` exactly and
   `dataActionStatus` is `completed`.
4. Reconnect while an attempt is `unknown` is rejected with `cleanup_unresolved`.

`reconcile-xero-connections.test.ts` / `.integration.test.ts`:
5. `report_only`: disconnect retires the binding at once, attempts are `cancelled`/`report_only`,
   the receipt is `left_in_place`, and the worker makes no provider call.
6. A cancelled or superseded unsent attempt makes no provider call.
7. Crash after `dispatching` (simulate by leaving the marker with an expired lease) → `unknown`,
   not retried.
8. Two concurrent sweeps dispatch at most once per attempt.
9. Reconnect while an attempt is `claimed` is rejected; after the claim's lease expires and the
   attempt returns to `pending`, reconnect cancels it and the worker makes no call.
10. `reissueXeroCleanupAttempt` on an `unknown` attempt with a targeted 404 yields
    `confirmed_absent` and allows retirement.

`xero-client.test.tsx` / `_actions.test.ts`: each receipt maps to its copy; the returned DTO has
no remote connection ID and no provider error code.

## Done criteria

All must hold:

- [ ] `bun run check`, `bun run typecheck` exit 0
- [ ] `bun run --cwd packages/xero test`, `bun run --cwd packages/jobs test`, `bun run --cwd packages/database test` exit 0
- [ ] `bun run --cwd apps/app test 'app/(authenticated)/settings/integrations/xero'` exits 0
- [ ] `bun run --cwd packages/xero test:integration`, `bun run --cwd packages/jobs test:integration`, `bun run --cwd packages/database test:integration` exit 0 locally, listing the new suites
- [ ] `bun run test:release-tools && bun run typecheck:release-tools` exit 0
- [ ] `git diff --check` exits 0
- [ ] `grep -rn "remoteRevoked" packages/ apps/ --include=*.ts --include=*.tsx --exclude-dir=.next --exclude-dir=node_modules` returns no matches
- [ ] `grep -n "reconcileXeroConnectionsFunction" packages/jobs/src/functions.ts` returns a match
- [ ] `grep -n "report_only" packages/xero/keys.ts` returns a match and `keys.test.ts` asserts the absent default is `report_only`
- [ ] `grep -c "revokeXeroConnectionAtSource\|revokePreparedXeroConnection" packages/xero/src/oauth/service.ts` prints `0` (the inline revoke is gone)
- [ ] A spec under `tooling/release/e2e/` references the three receipt messages; the execution report records it `NOT_VERIFIED`
- [ ] `git status --short -- . ':!plans'` shows no modified file outside the In scope list, and `plans/` changes are limited to the files this plan names
- [ ] `plans/README.md` status row for 161f updated

## STOP conditions

Stop and report; do not improvise:

- 161b-161e are not all DONE.
- The management token call is rejected for this app in any environment you are authorised to use
  (tier or provisioning). Keep `report_only`, finish everything else, report.
- A disconnect change would alter what the destructive branch deletes or archives today.
- You cannot tell whether a DELETE was issued for an attempt. That is `unknown`; do not retry it and
  do not retire the binding.
- A reconnect would need to proceed while an attempt is `dispatching` or `unknown`.
- You are about to call DELETE against anything other than an owned test fixture, or to revoke a
  whole-user grant.
- You are about to put a credential, authorisation code, raw Xero payload or payroll content into a
  job payload, log, DTO or snapshot.
- A step's verification fails twice after a reasonable fix attempt.

## Maintenance notes

- **`unknown` is a real, permanent state.** Collapsing it into `confirmed_absent` tells a customer
  their Xero link is gone when nobody knows.
- **The target freeze in Step 4 is the deletion authority boundary.** Widening it to "everything
  this authoriser owns" is the highest-risk change anyone can make to this code.
- **The `dispatching` marker must commit before the request.** Moving it after for performance
  silently breaks crash recovery; test 7 guards it.
- The reservation survives disconnect until cleanup resolves. Same-organisation same-file reconnect
  still works (161b's guard only blocks other organisations and other files); other accounts cannot
  claim the file meanwhile.
- 161h's rollout sets `XERO_REMOTE_CLEANUP_MODE=enabled` only after its evidence gates pass.
- In review, scrutinise: the target freeze, the state transition code, reconnect fencing, and the
  provider-outcome mapping.
- Deferred: inactivity-driven deletion (161h, report-only), customer notices, bulk management,
  cleanup credential escrow.
