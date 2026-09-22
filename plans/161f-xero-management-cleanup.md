# Plan 161f: Make Xero disconnection durable, narrowly authorised and truthful about unknown outcomes

> **Executor instructions**: Follow this plan step by step. Run every verification command and
> confirm the expected result before moving to the next step. If anything in "STOP conditions"
> occurs, stop and report - do not improvise. When done, update the status row for this plan in
> `plans/README.md` unless a reviewer dispatched you and told you they maintain the index.
>
> **Drift check (run first)**:
> ```bash
> git diff --stat 8652c31..HEAD -- \
>   packages/xero/src/oauth packages/jobs/src/handlers \
>   'apps/app/app/(authenticated)/settings/integrations/xero'
> ```
> At the time this plan was written that diff was empty. If it is now non-empty, compare the
> "Current state" excerpts below against the live code before proceeding. A mismatch is a STOP
> condition.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: HIGH (this plan issues irreversible DELETE requests to a customer's Xero account)
- **Depends on**: 161b (binding generation), 161c (deadlines), 161d (credential owner and
  resolver), 161e (shared admission). All four must be complete.
- **Category**: bug, security
- **Planned at**: commit `8652c31`, 22 September 2026 (re-stamped from `585f6cb`; the only changes between those commits are under `plans/`, so every source excerpt below is valid at both)
- **Programme charter**: `plans/161-harden-xero-connection-lifecycle.md`

## Why this matters

Disconnect currently returns a single boolean, `remoteRevoked`, and sets it to `false` for two
completely different situations: "there was no remote connection to revoke" and "we tried and do
not know what happened". A customer told "not revoked" cannot tell whether their data link to
Xero is actually gone.

Worse, the remote revocation is attempted inline, and session scrubbing wipes the connection
inventory before the outcome is durable. If the process dies between issuing the DELETE and
recording the result, there is no record that a destructive request is outstanding. A subsequent
reconnect can then land on a connection that a late DELETE is still about to remove.

This plan makes the local disable commit immediately and durably, moves the remote deletion to a
fenced background worker with per-target state, and replaces the boolean with a receipt that can
say "unknown" honestly.

## Current state

### The boolean receipt

`packages/xero/src/oauth/service.ts:116`:

```typescript
| { ok: true; value: { remoteRevoked: boolean } }
```

and at lines 1286 and 1312:

```typescript
Result<{ disconnected: true; remoteRevoked: boolean }, XeroOAuthError>
```

The `false` value is produced at lines 1324, 1439 and 1470 for **absence**, and again at 1669 for
**failure**:

```typescript
// packages/xero/src/oauth/service.ts:1666-1669
      return { ok: true, value: { remoteRevoked: true } };
    }
    // ...
      return { ok: true, value: { remoteRevoked: false } };
```

The disconnect transaction is wrapped with `{ timeout: 20_000 }` at line 1291 (plan 161c may have
adjusted this; read the current value).

### Live consumers of the boolean

- `apps/app/app/(authenticated)/settings/integrations/xero/_actions.ts:152` - `remoteRevoked: result.value.remoteRevoked`
- `apps/app/app/(authenticated)/settings/integrations/xero/_actions.test.ts:85`
- `packages/xero/src/oauth/service.test.ts:1454, 1522, 1547, 1608`
- `packages/xero/src/oauth/disconnect.integration.test.ts:89, 109`

All must be migrated. The grep in "Done criteria" is how you confirm it.

### Where the worker goes

`packages/jobs/src/handlers/` contains the existing Inngest handlers and follows a strict naming
convention: `<job-name>.ts`, `<job-name>.test.ts`, `<job-name>.integration.test.ts`. Existing
examples to model on: `reconcile-xero-approval-state.ts`, `schedule-xero-syncs.ts`,
`reconcile-feed-publications.ts`.

The jobs listed in `CLAUDE.md` today are `sync-xero-people`, `sync-xero-leave-records`,
`sync-xero-leave-balances`, `reconcile-feed-publications`, `rebuild-feed-cache` and
`reconcile-xero-approval-state`. You are adding one.

### Repository conventions to match

- Service functions return `Result<T, E>` from `@repo/core`. Do not throw for expected failures.
- Named exports only. No default exports. Strict TypeScript, no `any`, no unjustified `as`.
- Zod on all external input, including every Xero response.
- **Jobs carry both `clerk_org_id` and `organisation_id` in their event payload and never rely on
  session context.** Inbound upserts are idempotent. Record-level failures do not fail the run.
- **Outbound writes are synchronous and user-triggered; maintenance jobs never replay a payroll
  mutation.** Deleting a connection is not a payroll mutation, which is why it may be a job.
- Raw Xero error payloads go to `xero_write_error_raw` for admin audit only; a plain-language
  version goes in `xero_write_error`. **Never expose a raw Xero error code to an employee.**
- Australian English. **No em dashes anywhere.** No `console.log`.
- Use `packages/design-system` components and the guidance in `DESIGN.md` / `.impeccable.md` for
  any UI change.

## Commands you will need

**Fresh worktree setup.** This repository's `.env*` files are gitignored (`.gitignore:35`), so
a new worktree has none of them. Before running any gate, from the worktree root:

```bash
bun install --frozen-lockfile
```

`bun run test`, `bun run check`, `bun run typecheck` and `bun run boundaries` then work with no
further setup. **`bun run build` additionally requires two variables**, because
`packages/xero/keys.ts:74` validates at module load whenever `NODE_ENV` is not `test`, and
`packages/database/keys.ts:10` has no fallback:

- `DATABASE_URL` - any syntactically valid Postgres URL is enough for a build; the client is
  lazy and nothing connects. Do **not** point it at the real database.
- `XERO_TOKEN_ENCRYPTION_KEY` - any 32-byte base64 value is enough for a build.

Supply them for the build command only. **Do not create a committed `.env` file, do not copy the
developer's real values, and do not make either variable optional in `keys.ts` to avoid setting
them.**

**Two commands are not local gates and appear in no Done criteria here.**
`bun run preflight <app|api|web>` is a production deployment gate: it requires a positional
argument and the production-only variables `NEXT_PUBLIC_LAUNCH_MODE`, four Sentry variables and
three Better Stack variables. `bun run test:release` is a deployed-candidate Playwright suite:
`tooling/release/e2e/environment.ts:11-17` requires six `TC_*` variables validated when the
config is merely loaded, and `tooling/release/playwright.config.ts:22-33` declares Firefox and
WebKit projects whose browsers are not installed by default. Both run during the Plan 161h
rollout and the Plan 160 campaign. **Never stub either to make it run locally.**

| Purpose | Command | Expected on success |
|---|---|---|
| Lint | `bun run check` | exit 0 |
| Types | `bun run typecheck` | exit 0 |
| Xero units | `bun run --cwd packages/xero test` | exit 0 |
| Jobs units | `bun run --cwd packages/jobs test` | exit 0 |
| App Xero tests | `bun run --cwd apps/app test 'app/(authenticated)/settings/integrations/xero'` | exit 0 |
| Xero integration (guarded) | `bun run --cwd packages/xero test:integration` | exit 0 |
| Jobs integration (guarded) | `bun run --cwd packages/jobs test:integration` | exit 0 |
| Filtered app Xero tests | `bun run --cwd apps/app test 'app/(authenticated)/settings/integrations/xero'` | exit 0 |
| Whitespace | `git diff --check` | exit 0 |

## Scope

**In scope:**
- `packages/xero/src/oauth/management-client.ts`, `connection-cleanup.ts` and their tests (create)
- `packages/xero/src/oauth/connection-cleanup.integration.test.ts` (create)
- `packages/xero/src/oauth/service.ts`, `service.test.ts`, `disconnect.integration.test.ts`
- `packages/database/prisma/schema.prisma` and a new additive migration (cleanup request/attempt)
- `packages/jobs/src/handlers/reconcile-xero-connections.ts` plus its two tests (create)
- `packages/jobs/src/` events, functions and registration exports
- `apps/api/` Inngest registration
- `apps/app/app/(authenticated)/settings/integrations/xero/` actions, client, DTOs and tests
- Existing feed/publication invalidation helpers, **only** where destructive disconnect requires them
- `plans/README.md` (status row only)

**Out of scope - do NOT touch:**
- Credential storage and refresh - 161d. You **consume** the owner coordinator.
- Rate limiting internals - 161e. You **consume** the shared admission.
- Error classification and recovery reasons - 161g.
- Inactivity assessment - 161h. This plan deletes only on an **explicit** user disconnect.
- **Whole-user token revocation.** Never revoke an owner's entire grant to remove one binding.
- UID generation, calendar semantics or feed rendering. Invalidation only.
- Any change to data retention policy. Preserve existing soft-disconnect retention exactly.

## Git workflow

- Branch: `codex/xero-connection-hardening` (shared across 161a–161h).
- Conventional commits. Suggested: `feat(xero): add app management client`, then
  `feat(xero): record durable cleanup intent on disconnect`, then
  `feat(jobs): add reconcile-xero-connections handler`, then
  `refactor(app): replace boolean disconnect receipt`.
- Do NOT push or open a PR.

## Steps

### Step 1: Prove the two-meanings defect

Add a test to `packages/xero/src/oauth/service.test.ts` (model on the existing disconnect tests at
lines 1454-1608) with two cases:

- No remote connection exists. Today: `remoteRevoked: false`.
- A remote connection exists and the DELETE times out. Today: also `remoteRevoked: false`.

Assert these produce **different** results. It will fail, because today they do not.

**Verify**: `bun run --cwd packages/xero test` → fails on the new test. Record the output.

### Step 2: Build the app-management client

Create `packages/xero/src/oauth/management-client.ts`: a **server-only** client-credentials path
for app connection management using the `app.connections` scope.

- Keep its response schema **separate** from the customer authorisation/refresh schema. A
  management access token does **not** carry a refresh token; a shared schema will reject it.
- **Do not add management scope to the customer Payroll consent URL.**
- Validate the token class, expiry and granted scope where returned.
- Management tokens must never reach a Payroll adapter and must never be returned to a client
  component. Cache only under a bounded server-side contract, with shared acquisition
  coordination so instances do not stampede.
- Use the **exact** token form parameter and endpoints recorded in
  `plans/161-xero-provider-contract.md` by plan 161a. If those rows are `NOT VERIFIED`,
  implement the client and its tests but keep deletion **disabled** (see Step 7) and say so.
  **Never guess an endpoint, a pagination parameter, a filter or a token audience.**
- A management authentication failure is an **operational incident**. It must not fall back to a
  guessed endpoint and must not escalate to whole-user revocation.

Default to this client for cleanup, so an expired customer refresh token does not force retaining
a duplicate refreshable credential set. A customer-token fallback may use the 161d owner
coordinator when valid and explicitly necessary. **Do not create independently rotating cleanup
copies, and do not create a cleanup credential escrow.**

**Verify**: `bun run --cwd packages/xero test` → exit 0 for `management-client.test.ts`,
including a test asserting a management token cannot be passed to a Payroll adapter.

### Step 3: Split local disable from remote deletion

A scoped explicit disconnect commits, in **one short transaction**: the local disable, the binding
generation change, and a durable cleanup intent. **The remote DELETE is not in that transaction.**

Also in that transaction: block new provider admissions for the disabled binding, cancel unsent
work, and fence local result commits. An already-dispatched payroll mutation may still complete
and keeps its existing uncertain-outcome treatment; do not try to recall it.

**Freeze the authorised scope**: the known app connection links for **this bound payroll file**,
not every connection belonging to its authoriser. App-wide inventory visibility is not deletion
authority. Reconcile additional links only after establishing they fall inside the same authorised
request.

Before clearing a successful, expired or cancelled OAuth session, **atomically retain** the
non-secret auth-event and inventory provenance and any cleanup candidates. Candidate status is not
deletion authority. Non-secret tombstones survive secret scrubbing.

**Verify**: `bun run --cwd packages/xero test:integration` → exit 0 for a test asserting the local
disable is committed even when the provider is unreachable.

### Step 4: Replace the boolean with a receipt

Thread this through service, action, DTO, audit and interface:

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

Match existing naming conventions if they differ, but **these distinctions must survive**. Raw
remote identifiers and sensitive provider evidence are not employee-facing DTO fields.

Migrate every consumer listed in "Current state". Preserve soft-disconnect retention and the
existing explicitly chosen destructive-data behaviour. Make data removal a **separate idempotent
step** with its own result, including when a destructive request follows an earlier soft
disconnect. Do not purge before provenance and intents are durable. Preserve binding and audit
history and manual availability, and invoke existing publication/cache invalidation where
required.

UI copy for the new states, in Australian English, using `packages/design-system` components:

- "Sync stopped. Xero disconnection is pending."
- "Disconnected from Xero."

Test keyboard and focus behaviour, loading and error states, and light and dark.

**Verify**:
`bun run --cwd apps/app test 'app/(authenticated)/settings/integrations/xero'` → exit 0.
`grep -rn "remoteRevoked" packages/ apps/ --include=*.ts --include=*.tsx` → no matches.

### Step 5: Per-target cleanup state

Add cleanup request and attempt records to the schema (additive migration; the same rules as 161b
Step 5 apply: `migrate diff` only, read the SQL, no `DROP`, no rename).

A request holds the scoped local intent and a **frozen** target set. Each attempt records its own
ID, the exact target connection/app/tenant, the expected binding generation, the request scope,
the lease owner and expiry, dispatch and deadline times, safe error and correlation metadata,
retry timing and outcome evidence.

Per-target states:

| State | Meaning |
|---|---|
| `pending` | Eligible authorised target, no issued request recorded |
| `claimed` | Current worker owns a bounded claim; dispatch not yet recorded |
| `dispatching` | Durable marker written before the provider request; a crash leaves the outcome unknown |
| `confirmed_deleted` | Explicit successful deletion of the intended remote link |
| `confirmed_absent` | Reliable absence under the verified endpoint and coverage contract |
| `unknown` | The request may have executed, or evidence is insufficient |
| `blocked_authorisation` | Management or fallback authorisation prevents confirmation |
| `cancelled` | Unsent task superseded or no longer authorised |

A verified targeted DELETE `204` confirms deletion. A **valid targeted endpoint's** `404` can
confirm absence. A misrouted endpoint, incomplete inventory, 401, 403, an invalid refresh grant, a
timeout or a 5xx confirm nothing. Use the exact validated connection UUID. **Do not classify every
generic 404 as successful cleanup.**

Maintain the target set and the aggregate outcome explicitly: one successful link deletion does
not confirm every required connection for the payroll file was removed. **A multi-target request
must never report overall remote success while any required target is unresolved.**

**Verify**: `bun run --cwd packages/database test:integration` → exit 0 for the new state tests.

### Step 6: The worker

Create `packages/jobs/src/handlers/reconcile-xero-connections.ts` with bounded ID enumeration and
scoped target processing. Register it through the existing Inngest exports and `apps/api` serve
registration, following `reconcile-xero-approval-state.ts` exactly.

- Durable intent plus a periodic sweep recovers missed dispatch. Use deterministic intent IDs and
  **database claims**; Inngest delivery deduplication alone is not sufficient.
- Payloads carry IDs and generations. **Never credentials, never payroll payloads.**
- Before dispatch: take the ordered locks (161d's order: credential owners sorted, then bindings
  sorted, then internal connections sorted, then session/cleanup claims), validate the exact
  target, scope, references and generation, then durably mark `dispatching`.
- A cancelled or superseded unsent task makes **no** remote call.
- Record the response in a short subsequent transaction with attempt-owner checks. A late response
  may record historical outcome but must not reactivate or overwrite a newer local lifecycle.

**Reconnect fencing.** Reconnect, start and selection must not create a conflicting replacement
while a destructive request is in flight or its outcome is unknown. A worker lease timeout does
not prove its earlier DELETE stopped. An inventory snapshot showing present absence does not prove
a delayed destructive request cannot affect a reused connection ID. Permit automatic reconnect
only when every issued attempt has a safe terminal outcome, or verified provider identity
semantics prove a late request cannot affect the new connection. **Do not assume a reconnect
always yields a different connection ID.** Test delayed DELETE and identifier reuse with a
fault-injecting provider.

Retry known-safe targeted cleanup under the same reservation with bounded exponential backoff,
jitter and the 161e shared cooldown. **Unknown attempts require reconciliation before any retry**;
never run concurrent destructive retries for one target. An authentication failure goes to
operational recovery, not an unbounded hot loop. Deadlines cannot be reset indefinitely.

**Verify**: `bun run --cwd packages/jobs test && bun run --cwd packages/jobs test:integration`
→ exit 0.

### Step 7: Superseded authorisers, and the operator route

Clean up an unselected connection only when the evidence establishes it was created by the
relevant abandoned or partial flow, has no legitimate active reference, and falls inside the
approved cleanup policy. Protect previously connected files returned by the same authoriser's
inventory. Unknown historic or foreign inventory stays **report-only**.

Reauthorisation by authoriser B must preserve authoriser A's remote link until its retirement is
justified. But a blanket tenant-level protection rule must not block legitimately removing A's
obsolete link once B's verified link serves the same binding. Evaluate **exact connection and
owner references**, never tenant ID alone. Deleting A's obsolete link must not affect A's other
payroll files.

Add a restricted operator report and resolution procedure for `unknown` cleanup: request and
attempt IDs, safe correlation information, the targeted link, dispatch chronology, the latest
authoritative inventory evidence, and the required next action. Define an alert threshold,
responsible owner and escalation route in configuration and the runbook; thresholds are
application policy, not Xero mandates.

For an ambiguous issued DELETE, the procedure must either obtain provider-supported terminal
evidence or establish safe identity separation before releasing the reservation. Preserve an
escalation record when Xero support is needed. **Do not build a "force reconnect" button that
discards unresolved destructive history, and never mark a support escalation as confirmed
provider deletion.**

Gate execution behind explicit configuration, reusing an existing mechanism rather than creating a
feature-flag package. **The default must fail safe**: missing destructive-cleanup approval or
configuration keeps the system report-only.

**Verify**: `bun run check && bun run typecheck && bun run --cwd apps/app test 'app/(authenticated)/settings/integrations/xero'` → all exit 0.

Write the browser assertions in `tooling/release/e2e/`. They execute during the Plan 160 campaign against a deployed candidate, not locally; record them NOT_VERIFIED in the evidence report until that run.

## Test plan

`packages/xero/src/oauth/management-client.test.ts` (new):
1. A management token response **without** a refresh token parses correctly.
2. A management token cannot be handed to a Payroll adapter. Assert the type or guard rejects it.
3. A management authentication failure produces an operational incident, not a fallback call and
   not a revocation.

`packages/xero/src/oauth/connection-cleanup.test.ts` (new):
4. `204` → `confirmed_deleted`. A valid targeted `404` → `confirmed_absent`. A 401, a 403, a 429,
   a 5xx and a timeout each map to a **distinct** non-confirming outcome. Six separate assertions.
5. A generic 404 from a **misrouted** endpoint is **not** `confirmed_absent`.
6. Multi-target aggregate: one success plus one unresolved target reports `partially_confirmed`,
   never overall success.
7. The Step 1 regression: absence and unknown are different results.

`packages/xero/src/oauth/connection-cleanup.integration.test.ts` (new; fixture slot from 161a):
8. The local disable stays committed through a total provider outage; the receipt reads
   `pending` or `unknown` truthfully.
9. Session scrubbing preserves non-secret provenance, and no duplicate independently rotating
   cleanup token survives.
10. An unselected prior connection and a foreign connection are both protected from deletion.
11. Superseded authoriser A's obsolete link can be removed without affecting A's other files.
12. Repeat soft disconnect, a later destructive request, and a failed data action are all
    idempotent and truthful.

`packages/jobs/src/handlers/reconcile-xero-connections.test.ts` and its integration pair (new):
13. An old, cancelled, unsent task makes **no** provider call. Assert the transport was not called.
14. A crash before dispatch and a crash after dispatch recover differently and neither
    double-deletes.
15. Lost and duplicate Inngest delivery both converge without uncontrolled duplicate deletion.
16. A delayed DELETE plus connection-ID reuse cannot corrupt a new generation. Use a
    fault-injecting provider.
17. A job payload contains no credential and no payroll content. Assert on the serialised payload.

`apps/app/.../xero/_actions.test.ts` and `xero-client.test.tsx` (extend):
18. Each `remoteStatus` value renders its correct Australian English copy.
19. No raw provider identifier or Xero error code appears in the employee-facing DTO.

## Done criteria

All must hold:

- [ ] `bun run check` exits 0
- [ ] `bun run typecheck` exits 0
- [ ] `bun run --cwd packages/xero test` exits 0, including the Step 1 regression
- [ ] `bun run --cwd packages/jobs test` exits 0
- [ ] `bun run --cwd apps/app test 'app/(authenticated)/settings/integrations/xero'` exits 0
- [ ] `bun run --cwd packages/xero test:integration` exits 0
- [ ] `bun run --cwd packages/jobs test:integration` exits 0
- [ ] Browser assertions for the new disconnect states exist in `tooling/release/e2e/`; their execution is recorded NOT_VERIFIED pending the Plan 160 campaign
- [ ] `git diff --check` exits 0
- [ ] `grep -rn "remoteRevoked" packages/ apps/ --include=*.ts --include=*.tsx` returns **no matches**
- [ ] `grep -c "DROP " packages/database/prisma/migrations/*/migration.sql` returns 0 for the new migration
- [ ] `reconcile-xero-connections` is registered in the `apps/api` Inngest serve handler
- [ ] Destructive cleanup is **disabled by default** in configuration
- [ ] `git status --short` shows no modified file outside the In scope list
- [ ] `plans/README.md` status row for 161f updated

## STOP conditions

Stop and report; do not improvise:

- **The app-management endpoint rows in `plans/161-xero-provider-contract.md` are `NOT VERIFIED`.**
  This is an **expected** outcome, not a failure. Implement and test everything else, keep
  deletion disabled, and report which rows are unresolved. **Never guess the endpoint, the
  pagination parameters, the filters or the token audience.**
- The `app.connections` scope is not available to this app's tier. Report it; deletion stays off.
- `remoteRevoked` no longer exists in `packages/xero/src/oauth/service.ts`. Someone has already
  changed the receipt; report the current shape.
- You cannot determine, for a given target, whether a DELETE was issued. That is precisely the
  `unknown` state. Record it and route it to the operator procedure. **Do not retry it** and do
  not release the reservation.
- A reconnect would need to proceed while a destructive request's outcome is unknown. Block the
  reconnect and report; do not add a bypass.
- You are about to call DELETE against anything other than an explicitly owned live fixture, or
  to revoke a whole-user grant. Stop.
- You are about to put a credential, an authorisation code, a raw Xero error payload or payroll
  content into a job payload, a log, a DTO or a test snapshot. Stop.
- A step's verification fails twice after a reasonable fix attempt.

## Maintenance notes

- **`unknown` is a real, permanent state and must stay reachable.** The pressure in later work
  will be to collapse it into `confirmed_absent` so the UI looks tidy. That would mean telling a
  customer their Xero link is gone when nobody knows. Test 7 and test 8 guard this.
- **App-wide inventory visibility is not deletion authority.** The frozen target set in Step 3 is
  the boundary. Any future change that widens deletion to "everything this authoriser owns" is a
  serious regression; a reviewer should treat a change to the scope freeze as the highest-risk
  hunk in any diff touching this code.
- **A generic 404 never confirms absence.** Only a valid targeted endpoint's 404 does. This
  distinction is easy to lose in a refactor of the error mapper.
- The worker's `dispatching` marker must be written **before** the request and must be durable. If
  a future change moves it after the call for performance, crash recovery silently breaks and no
  test on the happy path will notice. Test 14 is the guard.
- In review, scrutinise: the scope freeze, the state-transition table, the reconnect fencing
  condition, and any code that maps a provider error to a `remoteStatus`.
- Deferred, with reasons: automatic inactivity-driven deletion (161h, and it remains report-only),
  customer notices, bulk connection management, and any cleanup credential escrow (which would
  need its own bounded security contract before it could be activated).
