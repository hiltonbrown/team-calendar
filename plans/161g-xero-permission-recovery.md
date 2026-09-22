# Plan 161g: Give every Xero failure a distinct, actionable recovery reason, and migrate all callers onto the resolver

> **Executor instructions**: Follow this plan step by step. Run every verification command and
> confirm the expected result before moving to the next step. If anything in "STOP conditions"
> occurs, stop and report - do not improvise. When done, update the status row for this plan in
> `plans/README.md` unless a reviewer dispatched you and told you they maintain the index.
>
> **Drift check (run first)**:
> ```bash
> git diff --stat 8652c31..HEAD -- \
>   packages/xero/src/adapter packages/availability/src packages/jobs/src \
>   packages/core/src/ports 'apps/app/app/(authenticated)/settings/integrations/xero'
> ```
> At the time this plan was written that diff was empty. If it is now non-empty, compare the
> "Current state" excerpts below against the live code before proceeding. A mismatch is a STOP
> condition.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: MED (wide caller surface; the risk is silently changing what a user is told)
- **Depends on**: 161d (`resolveXeroAccess` and the credential owner) and 161e (shared
  admission). Integrates 161f's disconnect receipt where present.
- **Category**: bug, tech-debt
- **Planned at**: commit `8652c31`, 22 September 2026 (re-stamped from `585f6cb`; the only changes between those commits are under `plans/`, so every source excerpt below is valid at both)
- **Programme charter**: `plans/161-harden-xero-connection-lifecycle.md`

## Why this matters

Every distinct Xero failure currently collapses into "Xero is not connected". The write adapter
reduces a missing tenant, an expired token, a revoked scope, an exhausted rate budget and an
unreadable encryption key to the same `null`:

```typescript
// packages/xero/src/adapter/xero-write-adapter.ts:71-87
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

The comment above it says callers "surface this as Xero is not connected". So a customer whose
app secret expired, or whose daily quota is exhausted, is told they disconnected from Xero. They
then reconnect, which does not help, and each reconnect consumes more quota.

The second half of this plan finishes 161d's work: every consumer that still reads credentials or
connection status directly must move onto `resolveXeroAccess`, or the new owner model will
coexist with legacy readers that refresh independently.

## Current state

### The collapsing adapter

`packages/xero/src/adapter/xero-write-adapter.ts` (386 lines). `getTenant` is called at lines 94,
130, 164, 224, 250, 285 and 331 - once per exported write operation. `XeroWriteAdapter` implements
`ExternalWritePort`.

### The neutral error contract

`packages/core/src/ports/external-write-port.ts` (110 lines) carries:

```typescript
// packages/core/src/ports/external-write-port.ts:9
  certainty?: ProviderWriteCertainty;
```

Plan 161c added a dispatch-phase distinction alongside it. Read the current file.

`CLAUDE.md` defines the `XeroWriteError` variants as: `validation_error`, `conflict_error`,
`auth_error`, `permission_error`, `rate_limit_error`, `network_error`, `not_found_error`,
`region_not_supported_error`, `unknown_error`. Extend with a recovery reason; **do not** scatter
unrelated string codes.

### The boolean connection state

`packages/availability/src/xero-connection-state.ts` (53 lines) exports
`hasActiveXeroConnection`. It is consumed at:

- `packages/availability/src/approvals/approval-service.ts:809` and `:1152`
- `packages/availability/src/people/people-service.ts:666`, which surfaces it into a DTO at
  `:118` and `:701` as `hasActiveXeroConnection: boolean`

A boolean cannot distinguish "the customer disconnected" from "our shared store is down".

### Other direct consumers to migrate

- `packages/jobs/src/handlers/schedule-xero-syncs.ts` (433 lines) - schedulable queries and
  dormant-connection rotation
- `packages/xero/src/au/read.ts`, `packages/xero/src/au/write.ts`
- `apps/app/app/(authenticated)/settings/integrations/xero/_actions.ts` and `xero-client.tsx`

### Repository conventions to match

- Service functions return `Result<T, E>` from `@repo/core`. Route handlers map errors to HTTP.
  Do not throw for expected failures.
- **Job adapters translate a retryable failure into the Inngest retry contract. A failed job must
  never resolve as success.** Inngest retries inbound sync with exponential backoff. Outbound
  write failures are **not** retried automatically; they surface to the user.
- Raw Xero error payloads go to `xero_write_error_raw` (admin audit only); a plain-language
  version goes in `xero_write_error`. **Never expose a raw Xero error code to an employee.**
- Named exports only. Strict TypeScript, no `any`, no unjustified `as`. Zod on external input.
- Use `packages/design-system` components; follow `DESIGN.md` and `.impeccable.md`.
- Australian English. **No em dashes anywhere.** No `console.log`.

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
| Boundaries | `bun run boundaries` | exit 0 |
| Core units | `bun run --cwd packages/core test` | exit 0 |
| Xero units | `bun run --cwd packages/xero test` | exit 0 |
| Availability units | `bun run --cwd packages/availability test` | exit 0 |
| Jobs units | `bun run --cwd packages/jobs test` | exit 0 |
| App Xero tests | `bun run --cwd apps/app test 'app/(authenticated)/settings/integrations/xero'` | exit 0 |
| Filtered app Xero tests | `bun run --cwd apps/app test 'app/(authenticated)/settings/integrations/xero'` | exit 0 |
| Whitespace | `git diff --check` | exit 0 |

## Scope

**In scope:**
- `packages/core/src/ports/external-write-port.ts` and required core exports/types
- `packages/xero/src/adapter/` including `auth-recovery.ts` and `auth-recovery.test.ts`
- `packages/xero/src/au/read.ts`, `packages/xero/src/au/write.ts` and their tests
- `packages/availability/src/xero-connection-state.ts`, the submit/approve/decline/withdraw
  services, sync and claim helpers, and their tests
- `packages/availability/src/people/people-service.ts` (the DTO field only)
- `packages/jobs/src/handlers/` - lifecycle and error propagation, scoped job cancellation
- `apps/app/app/(authenticated)/settings/integrations/xero/` and direct consumers of the
  changed connection states
- `apps/api/` direct provider-error and lifecycle route consumers
- `plans/README.md` (status row only)

**Out of scope - do NOT touch:**
- `packages/xero/src/oauth/` credential logic - 161d owns it. You **consume** `resolveXeroAccess`.
- `packages/xero/src/rate-limit/` internals - 161e.
- Remote deletion - 161f.
- **Plan 159's import orchestration and run lifecycle.** Thread the binding generation through
  its callers; do not invent a second import orchestration system and do not change AU approval
  semantics.
- **Requested OAuth scopes.** Do not narrow or widen them and do **not** disconnect working
  customers to force a scope migration.
- Feed rendering, UID generation and publication identity.

## Git workflow

- Branch: `codex/xero-connection-hardening` (shared across 161a–161h).
- Conventional commits. Suggested: `feat(core): carry recovery reason on provider write errors`,
  then `fix(xero): stop collapsing tenant resolution failures to null`, then
  `refactor(availability): consume scoped xero access resolver`.
- Do NOT push or open a PR.

## Steps

### Step 1: Prove the collapse

Add to `packages/xero/src/adapter/` a test (model on the existing `auth-recovery.test.ts`) where
`ensureFreshXeroConnection` fails for three different reasons: an exhausted rate budget, an
unreadable encryption key, and an insufficient-scope challenge. Assert the write operation reports
**three different** recovery reasons. It will fail: today all three produce `null`.

**Verify**: `bun run --cwd packages/xero test` → fails on the new test. Record the output.

### Step 2: Build the classifier

Add one shared classifier at the provider boundary and carry a typed recovery reason through
`XeroWriteError`, read `Result`s and the neutral external-write port. Extend the existing variants
rather than inventing a parallel code space.

| Evidence | Required response |
|---|---|
| Valid insufficient-scope challenge | `update_permissions`; **no refresh attempt** |
| Rejected/expired access token with no scope indication | At most **one** owner-coordinated refresh/reload and one safe retry |
| Insufficient scope on that retry | Still `update_permissions`, not generic stale credentials |
| Invalid refresh grant after controlled reconciliation | `reauthorise`; remote connection state stays independently known or unknown |
| Verified authoriser/tenant access denial | `check_xero_access`; affects that link or capability, **not** unrelated tenants |
| Generic 403 | An actionable permission/access error **without inventing** the precise cause |
| Invalid OAuth client credentials, or unreadable local encryption key | **Operational configuration incident.** Do not tell every user they revoked consent |
| 429 | Shared cooldown and retry timing. **No consent-revocation inference** |
| 5xx, network or deadline **after** dispatch | Retry or defer reads; **preserve unknown outcome for mutations** |
| Store, configuration, decryption or deadline failure **before** dispatch | Definite non-attempt with an operational or retry message |

Parse both `insufficent_scope` **as Xero's FAQ actually prints it** and the standard
`insufficient_scope`, including supported Bearer challenge formatting. Parse the challenge header,
not arbitrary raw response bodies; a substring match against a body is not authority.

**Verify**: `bun run --cwd packages/core test && bun run --cwd packages/xero test` → exit 0
including the three Step 1 cases.

### Step 3: Stop the adapter collapsing

Replace `getTenant`'s `null` return with a `Result` carrying the recovery reason and request
phase. Update all seven call sites (lines 94, 130, 164, 224, 250, 285, 331) to propagate it.

**Never convert an uncertain payroll write into a safe retry** because a later refresh was
classified differently. Preserve the recovery reason and the request phase all the way to the user
or the job.

**Verify**: `bun run --cwd packages/xero test` → exit 0.
`grep -n "return null" packages/xero/src/adapter/xero-write-adapter.ts` → no matches in the
tenant-resolution path.

### Step 4: Capability and tenant scoping

Permission varies by endpoint **and** by tenant, even for one credential owner. Store
capability-specific recovery state where needed:

- A read-only operation is not disabled merely because an unrelated **write** permission is absent.
- Credential-owner failure and tenant-specific access failure have different blast radii. One
  tenant's 403 must not disable another tenant's sync.

Complete the endpoint-to-scope matrix in `plans/161-xero-provider-contract.md`. Do not assume a
broad or read Payroll scope became redundant because an Accounting scope changed.

**Verify**: `bun run --cwd packages/xero test` → exit 0, with a test proving a write-scope failure
leaves reads working and a per-tenant 403 does not affect a sibling tenant.

### Step 5: Job behaviour

Classify **both** the initial and the retry response. A background read must not repeatedly
refresh a grant that actually requires additional consent; that is how a permission problem
becomes a quota problem.

Jobs consume the typed retry metadata, use durable waits and retries for transient failures, and
surface terminal recovery needs. Service functions keep returning `Result`; the **job adapter**
translates a retryable failure into the Inngest retry contract. A failed job must never resolve as
success.

Thread the binding generation into schedulers, manual sync dispatch and direct provider callers.
Reject or cancel work admitted for an obsolete generation. Before persisting fetched data or a
user-visible write result, validate the current lifecycle, or route an already-issued operation to
the existing reconciliation path.

**Verify**: `bun run --cwd packages/jobs test` → exit 0, including a test asserting the exact
refresh call count for a scope failure (it must be zero or one, never a loop).

### Step 6: Migrate every remaining consumer

Replace direct credential and status reads with `resolveXeroAccess` in: the AU adapters,
resolution/read/write dispatch, manual refresh and disconnect, schedulable queries, and job
handlers.

Update `hasActiveXeroConnection` and the DTO at `people-service.ts:118` so infrastructure failure
is **not** presented as a user-disconnected state. Remove legacy fallback paths that refresh
independently; leaving one is the failure mode 161d's owner model exists to prevent.

The existing dormant-rotation maintenance in `schedule-xero-syncs.ts` becomes owner-deduplicated.
Refresh owners still needed by authorised services: a lack of browser login is not expiry of the
service relationship, and maintenance must not manufacture customer-activity evidence.

**Verify**:
`bun run --cwd packages/availability test && bun run --cwd packages/jobs test` → exit 0.
`bun run boundaries` → exit 0.

### Step 7: Interface and audit

Use `packages/design-system` components and the guidance in `DESIGN.md` and `.impeccable.md`.
Keep the scope to Xero status, selection, errors, disconnect progress and recovery actions.

Truthful Australian English copy, one string per distinct recovery reason:

- "Update Xero permissions to continue."
- "Xero access needs to be renewed."
- "Xero is temporarily unavailable. Try again after [time]."

**Do not** present a queued job as a completed sync, a disabled connection as remotely deleted, or
a temporary store failure as customer revocation. Preserve existing authorised historical
visibility and feed behaviour, with stale or status messaging rather than fabricated freshness.

Test keyboard and focus behaviour, loading and error states, light and dark.

Audit only allowlisted metadata: scoped operation IDs, reasons, transitions, attempt and version
identifiers, correlation IDs and safe timing. **Redact** tokens, authorisation codes, state and
nonces, URLs containing secrets, raw provider headers and payroll content. A restricted diagnostic
record still needs retention and access controls; "admin-only" does not make unrestricted raw
logging acceptable.

**Verify**: `bun run --cwd apps/app test 'app/(authenticated)/settings/integrations/xero'` and
→ exit 0.

Write the browser assertions for each recovery-reason string in `tooling/release/e2e/`. They execute during the Plan 160 campaign against a deployed candidate, not locally.

## Test plan

`packages/xero/src/adapter/auth-recovery.test.ts` (extend; it already exists):
1. The three Step 1 cases produce three distinct recovery reasons.
2. A valid insufficient-scope challenge triggers **zero** refresh attempts. Assert the count.
3. An expired access token with no scope indication triggers **exactly one** refresh and one retry.
4. Insufficient scope on that retry still yields `update_permissions`, not stale credentials.
5. Both `insufficent_scope` (Xero's spelling) and `insufficient_scope` parse from the challenge.
6. Invalid OAuth **client** credentials produce an operational incident, and **no** per-customer
   consent-revocation state is written. Assert on the database writes, not just the message.
7. A 429 produces a cooldown and retry timing, and no revocation inference.
8. A pre-dispatch rejection is a definite non-attempt; a post-dispatch lost mutation response
   stays uncertain and is **not** replayed.

`packages/xero/src/au/write.test.ts` and `read.test.ts` (extend):
9. A write-scope failure leaves read operations working.
10. A per-tenant 403 does not affect a sibling tenant's operations.

`packages/jobs/src/handlers/*.test.ts` (extend):
11. A background read hitting a scope failure does not loop refreshing. Assert the exact count.
12. A retryable failure reaches the Inngest retry contract; a failed job never resolves as success.
13. Work admitted for an obsolete binding generation is cancelled and is **not** reported as a
    successful sync.

`packages/availability/src/**/*.test.ts` (extend):
14. An infrastructure failure is **not** reported to the user as a disconnected Xero account.
    This is the headline behaviour change; assert the DTO value directly.

`apps/app/.../xero-client.test.tsx` (extend):
15. Each recovery reason renders its own copy, in Australian English, with no em dash.
16. No token, authorisation code, state, nonce, raw provider header or payroll content appears in
    any DTO, log or rendered output.

## Done criteria

All must hold:

- [ ] `bun run check` exits 0
- [ ] `bun run typecheck` exits 0
- [ ] `bun run boundaries` exits 0
- [ ] `bun run --cwd packages/core test` exits 0
- [ ] `bun run --cwd packages/xero test` exits 0, including the Step 1 regression
- [ ] `bun run --cwd packages/availability test` exits 0, including test 14
- [ ] `bun run --cwd packages/jobs test` exits 0
- [ ] `bun run --cwd apps/app test 'app/(authenticated)/settings/integrations/xero'` exits 0
- [ ] Browser assertions for each recovery reason exist in `tooling/release/e2e/`; their execution is recorded NOT_VERIFIED pending the Plan 160 campaign
- [ ] `git diff --check` exits 0
- [ ] `grep -n "return null" packages/xero/src/adapter/xero-write-adapter.ts` returns no matches in the tenant-resolution path
- [ ] No consumer reads a credential column directly: `grep -rn "refresh_token_encrypted\|access_token_encrypted" packages/availability packages/jobs apps/` returns no matches
- [ ] `git status --short` shows no modified file outside the In scope list
- [ ] `plans/README.md` status row for 161g updated

## STOP conditions

Stop and report; do not improvise:

- `resolveXeroAccess` does not exist, meaning 161d has not landed. This plan's Step 6 cannot
  proceed. Do Steps 1-5 and report Step 6 as blocked.
- `getTenant` is no longer at `packages/xero/src/adapter/xero-write-adapter.ts:71`, or its body no
  longer matches the excerpt. Report the current code.
- Migrating a caller would require changing Plan 159's import orchestration or AU approval
  semantics. Both are out of scope. Report the exact conflict.
- You conclude the requested OAuth scopes must change. **Do not change them** and do not
  disconnect working customers to force a migration. Record what the endpoint contract requires in
  `plans/161-xero-provider-contract.md` and report.
- A generic 403 tempts you to assert a specific cause (a named role removed, a specific permission
  revoked). You cannot know that from a generic 403. Return an actionable error without inventing
  the cause.
- A step's verification fails twice after a reasonable fix attempt.
- You are about to put a raw Xero error code, a raw provider header, a token or payroll content
  into an employee-facing DTO, a log or a test snapshot. Stop.

## Maintenance notes

- **The whole point of this plan is that distinct causes stay distinct.** Every future change that
  adds a `catch` returning a generic "not connected" undoes it. In review, any new
  `return null` or bare `catch` in the provider boundary deserves scrutiny.
- **"Invalid client credentials" is an incident, not a customer event.** If the app secret expires
  and the code writes per-customer revocation state, every customer is told they disconnected and
  will try to reconnect, multiplying the load during an outage. Test 6 guards this; it asserts on
  database writes, not on the message, because the message is the easy half.
- **Refresh call counts are assertions, not incidental.** Tests 2, 3 and 11 assert exact counts
  because an accidental refresh loop on a permission failure is invisible in a passing happy path
  and expensive in production quota.
- Recovery reasons are user-facing through the copy in Step 7. Changing a reason's meaning without
  changing its copy silently misinforms customers. Keep them changed together.
- In review, scrutinise: every place a `Result` error is mapped to user-visible copy, the exact
  refresh-count assertions, and any new code path that reads a credential column directly.
- Deferred: scope changes, NZ and UK activation, and any change to AU submission or approval
  semantics. Each needs its own plan and, for the AU semantics, an explicit product decision.
