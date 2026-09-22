# Plan 159: Make Xero connection, leave sync and onboarding reliable

> **Lifecycle scope superseded, 22 September 2026:**
> Plan 161 replaces **the whole of Step 3, and findings X5 and X6**, together with their
> grant and mapping verification requirements. Plan 161 is no longer one document:
>
> - [`plans/161-harden-xero-connection-lifecycle.md`](161-harden-xero-connection-lifecycle.md)
>   is the charter (shared boundaries, architecture, and the 40-case evidence matrix in
>   its Section 8.3). It contains no unit bodies and is not an implementation spec.
> - [`plans/161-pre-executor-gate-corrections.md`](161-pre-executor-gate-corrections.md)
>   runs first, then sub-plans **161a** through **161h**.
> - **X5** (reconnect replaces the tenant ID, `packages/xero/src/oauth/service.ts`) is
>   implemented by [`161b`](161b-xero-immutable-tenant-binding.md).
> - **X6** (per-connection tokens and locks) is implemented by
>   [`161d`](161d-xero-canonical-credentials.md).
>
> **Do not implement Step 3.** Its text below is historical context only. Two points in it
> are now actively contradicted and must not be followed:
>
> 1. Step 3.1's wrong-file reconnect guard is 161b's Step 3. Implementing both produces
>    two competing guards in one transaction.
> 2. Step 3.2 says "do not assume that global tenant uniqueness is the product policy
>    across separate accounts". **Plan 161 has since selected exactly that policy**: at
>    most one reserved internal binding per configured Xero app and external payroll
>    tenant, including across Clerk accounts (charter Section 3, enforced by 161b's
>    database constraint). Follow 161, not this paragraph.
>
> All other findings and steps in this plan remain active and unaffected.

> Executor: read this complete plan before editing. It is a planning deliverable,
> not authority to deploy, change customer payroll, merge identities or disconnect
> production connections. Implement source changes and tests when instructed;
> use existing applicable authority for external verification. Record outcomes
> below as PASS, FAIL or NOT VERIFIED. Never equate event acceptance with import
> completion. A blocked provider action does not block independent source work.

## Status and scope of the decision

- Status: TODO. No implementation performed by this plan.
- Priority: P1, with P2 experience improvements included.
- Effort: L, several coordinated implementation slices.
- Change risk: HIGH for payroll state, credentials and person reconciliation;
  MED for orchestration; LOW for isolated presentation changes.
- Categories: correctness, security, architecture, tests, performance and UX.
- Planned at: `246ba27`, 20 September 2026.
- **Re-verified at `8652c31`, 22 September 2026.** 97 files changed between the two
  commits (1,554 insertions). Every `file:line` anchor in the evidence table below was
  re-checked at `8652c31` and still resolves. See "Drift check" before starting.
- Depends on: no new numbered plan. Reuse the fixture ownership, outbound
  operation recovery and release verification infrastructure already implemented
  under `plans/go-live.md`; validate its current state rather than repeat it.
- Coverage: Australian Payroll, onboarding, organisation sharing, inbound leave,
  synchronous outbound writes and calendar visibility. This is not a new audit
  of billing, marketing, email, dependencies generally, or NZ/UK support.

The user selected all issues from the Xero audit for planning. This single plan
preserves the earlier consolidation of the release backlog. Historical numbered
plans end at 158; do not recreate them. The release programme remains active.
For the defects listed here this plan supplies the detailed acceptance criteria;
the release plan still owns release-wide gates and production rollout evidence.

## Drift check, run before anything else

```bash
git rev-parse --short HEAD
git status --short
git diff --stat 8652c31..HEAD -- apps/app apps/api packages/xero packages/jobs \
  packages/availability packages/database packages/notifications packages/feeds \
  tooling/release PRODUCT.md
```

At the last review that diff was **empty against `8652c31`**, and every anchor in the
evidence table resolved. If it is now non-empty, open each cited file and confirm the
excerpt before proceeding; a mismatch is a STOP condition for that step only.

This plan was originally written against `246ba27`. The tree moved substantially between
the two commits, including new files in `tooling/release/` that did not exist at the
original baseline (`consumer-isolation.ts`, `consumer-isolation.test.ts`). Read
`tooling/release/consumer-isolation.ts` before touching release verification tooling in
Step 8; extend it rather than building a parallel mechanism.

## Why this matters

Connecting Xero currently does not prove that leave reached the calendar. A
partial read can look successful, imported employees can be separate from the
people linked to user accounts, and an open calendar can stay stale. Reconnecting
the wrong file and incorrectly representing AU submission status add data and
payroll risks. The desired result is one administrator connecting the business,
a resumable import of all available leave and employees, and every authorised
member seeing the resulting data within their existing permissions.

## Evidence and priorities

All source evidence was read in this checkout. Live incident attribution is
NOT VERIFIED. Confidence is HIGH unless identified otherwise.

| ID | Finding and consequence | Evidence | Priority | Effort / fix risk |
| --- | --- | --- | --- | --- |
| X1 | Incomplete AU response can clear stale/error state and report successful import | `packages/xero/src/au/read.ts:245`, `packages/jobs/src/handlers/sync-xero-leave-records.ts:312` | P1 | M / MED |
| X2 | Initial import blocks the connection action, ignores Results and queues duplicate work | `apps/app/app/(authenticated)/settings/integrations/xero/connect/_actions.ts:127` | P1 | L / MED |
| X3 | Worker failures resolve instead of triggering retries; interrupted runs can cancel their own retry | `packages/jobs/src/handlers/sync-xero-leave-records.ts:156,199,662` | P1 | L / HIGH |
| X4 | Manual and Xero people remain separate; personal calendar selects the manual user identity | `packages/jobs/src/handlers/sync-xero-people.ts:438`, `packages/availability/src/people/current-user-service.ts:175`, `apps/app/app/(authenticated)/calendar/page.tsx:59` | P1 | L / HIGH |
| X5 | Reconnect can replace tenant ID while retaining old payroll data | `packages/xero/src/oauth/service.ts:563` | P1 | M / HIGH |
| X6 | Token persistence and locks are per local connection, without a shared provider grant lifecycle | `packages/xero/src/oauth/service.ts:512,669`, `packages/database/prisma/schema.prisma:461` | P1 | L / HIGH |
| X7 | AU create produces scheduled leave, while local submit persists pending approval | `packages/xero/src/au/write.ts:34`, `packages/availability/src/plans/submit-service.ts:462`, `packages/xero/src/read/leave-records.ts:148` | P1 | L / HIGH |
| X8 | Independent employee/leave scheduling can miss new employees until a subsequent run | `packages/jobs/src/handlers/schedule-xero-syncs.ts:302` | P2 | M / MED |
| X9 | Open calendar does not subscribe to completed sync events | `apps/app/app/(authenticated)/calendar/page.tsx:108`; compare `apps/app/components/dashboard/dashboard-live-updates.tsx` | P2 | S / LOW |
| X10 | Setup readiness ignores imported leave; account-wide connection count hides entity-specific setup | `apps/app/lib/server/load-onboarding-state.ts:114` | P2 | M / MED |
| X11 | Connection/matching UI exposes technical IDs; shared access and entity selection are unclear | `apps/app/app/(authenticated)/settings/integrations/xero/connect/connect-client.tsx`, `matches/matches-client.tsx` beneath the same Xero directory; `apps/app/lib/server/require-active-org-page-context.ts:50` | P2 | M / MED |

X6 is a confirmed storage-model gap; the effect on a particular live connection
is MED-confidence until provider verification. No production invalidation is
claimed. X7 is supported by the provider contract, not a completed live test.

### Current-state excerpts for drift checking

All anchors below were re-verified at `8652c31`. Where the evidence table cites the
guard and this block cites the return, both are correct and point at the two ends of the
same construct. Excerpts are copied verbatim; if a comparison fails on whitespace alone,
that is a formatting change, not drift.

```typescript
// packages/xero/src/au/read.ts:245-254, parse failure.
// Table cites :245 (the guard); this excerpt starts at :251 (the return).
      if (!mappedPage.ok) {
        log.warn("Xero leave record page could not be parsed", {
          clerkOrgId: input.xeroTenant.clerk_org_id,
          organisationId: input.xeroTenant.organisation_id,
          page,
        });
        return {
          ok: true,
          value: { complete: false, leaveRecords, rawResponse },
        };
      }

// packages/jobs/src/handlers/sync-xero-leave-records.ts:314, :317, :322.
// An incomplete read still clears staleness and reports success.
// The same shape repeats at :577, :605, :612 and :621; fix both sites.
last_leave_records_sync_at: new Date(),
leave_records_stale_since: null,
const finalStatus = counts.failed > 0 ? "partial_success" : "succeeded";

// apps/app/app/(authenticated)/settings/integrations/xero/connect/_actions.ts:138
try {
  await syncXeroPeople(syncContext);
  await syncXeroLeaveRecords(syncContext);
  await syncXeroLeaveBalances(syncContext);
} catch {
  // Best-effort initial execution; scheduled runs or manual syncs will retry.
}

// packages/xero/src/oauth/service.ts:573, existing tenant update
update: {
  payroll_region: payrollRegion,
  tenant_name: selectedTenant.tenantName,
  xero_tenant_id: selectedTenant.tenantId,
},

// packages/availability/src/people/current-user-service.ts:184
if (existingLinkedPerson) {
  return { ok: true, value: mapPerson(existingLinkedPerson) };
}
```

Run `git diff --stat 246ba27..HEAD -- apps/app apps/api packages/xero packages/jobs packages/availability packages/database packages/notifications packages/feeds tooling/release PRODUCT.md`.
Also inspect uncommitted changes with `git status --short` and `git diff --stat`.
At planning time pricing, `tasks/todo.md` and `tasks/lessons.md` already had
unrelated changes. Preserve them. Resolve ordinary drift against live source;
pause only the affected step when its assumptions no longer hold.

## Product and engineering constraints

- AU only. NZ/UK remain disabled. No new payroll connector or calculation engine.
- Clerk Organisation is the account boundary; payroll Organisation is the entity
  boundary. One entity owns one XeroConnection and one XeroTenant. Members do not
  each authorise Xero. Administrator management permissions remain restricted.
- All tenant data operations apply both identifiers. Follow
  `packages/database/src/tenant-query.ts`:
  `where: { ...scopedQuery(clerkOrgId, organisationId), id: recordId }`.
  Use `scopedTo` where the caller has validated plain strings. Resolve the Xero
  tenant through the payroll organisation, never account ID alone.
- Database access uses `@repo/database`; Xero payloads and credentials stay in
  `packages/xero`; canonical people/availability stay in `packages/availability`;
  job definitions stay in `packages/jobs`; notifications stay in their package.
- Service-level expected failures return `Result`. Job adapters translate
  retryable failures into Inngest errors. Do not replace all service Results
  with exceptions. Zod validates external input and persisted JSON contracts.
- Existing claim/CAS protection, outbound-operation uncertainty recovery,
  privacy, stable feed UIDs, SEQUENCE and source audit payloads must survive.
  Preserve complete authorised feed URLs; never expose credentials/raw payroll
  errors to employees. No `any`, unexplained casts or app-local base components.
- Source writes remain synchronous and user-triggered. Only inbound imports,
  publication reconciliation and cache rebuilds run in jobs. Xero remains the
  authority for balances and accruals.
- This plan cannot silently change PRODUCT.md's submit/write-back contract.
  The explicit AU decision in Step 1 is required for that behavioural change.

### Permitted implementation paths

Only change the following paths, their co-located tests, required root package
exports and generated database artefacts directly needed for these changes:

- `packages/xero/src/{oauth,adapter,au,read,rate-limit}/`.
  Its package manifest and `bun.lock` may change only to declare a maintained JWT
  verification dependency if none is already available; no hand-written JWT crypto.
- `packages/availability/src/{people,sync,plans,approvals,calendar}/` and existing
  outbound-operation helpers directly called by those services.
- `packages/jobs/src/{handlers,events.ts,client.ts,functions.ts,activation.ts}`
  and its registration exports. `packages/core/` only for a shared, provider-neutral
  scoped run/event contract if needed to avoid a package dependency cycle.
- `packages/database/prisma/schema.prisma`, generated additive migrations/client,
  `packages/database/queries/` and existing owned-fixture helpers when new models
  require allocation/cleanup support.
- `packages/notifications/src/sse/`, event types and provider subscription code
  only for scoped progress/calendar invalidation.
- `packages/feeds/` only if person reconciliation requires preserving existing
  publication identity, eligibility or cache invalidation, with regression tests.
- `apps/api/app/api/{xero,sync,inngest}/`, `apps/api/lib/sync/`.
- `apps/app/app/(authenticated)/{settings/integrations/xero,settings/getting-started,sync,calendar,people,components}/`, dashboard onboarding integration,
  `apps/app/components/{onboarding,calendar,dashboard}/`, active-organisation and
  onboarding loaders under `apps/app/lib/server/`, and `apps/app/lib/navigation/`.
- Existing leave submit/approve/decline/withdraw action callers in `apps/app` and
  `apps/api` only where Step 1's approved transition contract changes them.
- `tooling/release/e2e/`, related release verification tools and tests.
- `PRODUCT.md`, `ScreenCatalogue.md` and directly affected help/marketing claims
  only after the AU contract decision, limited to factual behaviour corrections.
- This plan, `plans/README.md`, executor task progress entries when implementation
  is authorised. The advisor itself edits only `plans/`.

No unrelated redesign, billing changes, auth-provider replacement, membership
tables, dependency upgrade, customer data purge, payroll-file migration or NZ/UK
activation. Do not revive completed release fixes as new work.

## Commands and verification baseline

Run from the repository root unless a working directory is stated. The repo
declares Bun 1.4.0 and Node 22 or >=24. Use its pinned toolchain for final evidence.
All commands below are executor commands, not claims of execution by the advisor.

**Fresh worktree setup.** This plan directs work into a `codex/xero-sync-onboarding`
branch or isolated worktree. The repository's `.env*` files are gitignored
(`.gitignore:35`), so a fresh worktree has none of them. From the worktree root:

```bash
bun install --frozen-lockfile
```

`bun run test`, `bun run check`, `bun run typecheck` and `bun run boundaries` then work
with no further setup. **`bun run build` additionally requires two variables**, because
`packages/xero/keys.ts:74` validates at module load whenever `NODE_ENV` is not `test`,
and `packages/database/keys.ts:10` has no fallback:

- `DATABASE_URL` - any syntactically valid Postgres URL suffices for a build; the client
  is lazy and nothing connects. Do **not** point it at the real database.
- `XERO_TOKEN_ENCRYPTION_KEY` - any 32-byte base64 value suffices for a build.

Supply them for the build command only. Do not create a committed `.env`, do not copy the
developer's real values, and **do not make either variable optional in `keys.ts`** to
avoid setting them.

| Gate | Exact command | Expected result |
| --- | --- | --- |
| Lint | `bun run check` | Exit 0 |
| Build before final typecheck | `bun run build` | Exit 0; generated Next route types present |
| Types | `bun run typecheck` | Exit 0 |
| Boundaries | `bun run boundaries` | Exit 0 |
| Units | `bun run test` | Exit 0, no skipped required regressions |
| CI integration | `bun run test:integration` | Exit 0 under the supported guarded test environment |
| Release tooling | `bun run test:release-tools` and `bun run typecheck:release-tools` | Both exit 0 |
| Whitespace | `git diff --check` | Exit 0 |
| Filtered app Xero tests | `bun run --cwd apps/app test 'app/(authenticated)/settings/integrations/xero'` | Exit 0; selects 6 files / 43 tests at this baseline |

Earlier in this same audit, at this checkout, the following passed: 57 tests in
the three jobs files and 17 tests in the three app files below. These are existing
tests, not evidence that proposed regressions or production round trips pass.

```bash
# cwd: packages/jobs
bunx vitest run src/handlers/sync-xero-leave-records.test.ts src/handlers/sync-xero-people.test.ts src/handlers/schedule-xero-syncs.test.ts
# cwd: apps/app
bunx vitest run lib/server/load-onboarding-state.test.ts 'app/(authenticated)/settings/integrations/xero/connect/_actions.test.ts' 'app/(authenticated)/calendar/page.test.tsx'
```

Current CI declares an ephemeral local PostgreSQL service and guards local
integration runs with `ALLOW_LOCAL_DATABASE_TESTS`. The older release plan also
contains a live-Neon-only execution policy. Do not silently substitute targets or
bypass either guard. For CI use its already configured service; for operator
live evidence use the release manifest/owned-fixture runner and existing applicable
authority. If these execution contexts remain incompatible, resolve the specific
verification target before database commands and record NOT VERIFIED meanwhile.
Source/unit work can continue. Never run seed, reset, db push, rebaseline or
migrate dev against the configured live database. Generate migrations using
Prisma's schema-diff tooling, review additive SQL, then deploy only under the
appropriate migration authority. Do not hand-edit generated migrations.

## Execution order

| Step | Outcome | Depends on | Initial status |
| --- | --- | --- | --- |
| 1 | AU provider transition contract and regression fixtures | None | TODO, decision required for changed submission semantics |
| 2 | Truthful read completeness and retry-safe run lifecycle | None | TODO |
| 3 | Safe reconnect and shared authorisation lifecycle | None | TODO |
| 4 | Canonical employee and member reconciliation | None; coordinate schema with 2/3 | TODO |
| 5 | Durable initial/ongoing import orchestration | 2, 3, 4 | TODO |
| 6 | Guided onboarding and shared connection experience | 3, 4, 5; copy from 1 | TODO |
| 7 | Calendar freshness and visible two-way state | 2, 4, 5; approved semantics from 1 | TODO |
| 8 | Migrations, end-to-end proof and rollout handoff | All applicable steps | TODO |

Steps 2, 3 and 4 can progress alongside the AU decision. One owner coordinates
schema changes and exports; merge implementation slices sequentially. Use a
`codex/xero-sync-onboarding` branch or isolated worktree, conventional logical
commits, and preserve unrelated work. No push or deployment is implied by this plan.

### Durable state contract for Steps 2 and 5

Use these logical fields regardless of the final Prisma table names. All customer
rows also carry `clerk_org_id`, `organisation_id`, the local Xero tenant FK and
created/updated timestamps. Events contain IDs and safe metadata only.

| Record | Required identity/state | Allowed behaviour |
| --- | --- | --- |
| Import operation | UUID operation ID; connection generation; request key unique within entity/generation; `queued/running/partial/failed/cancelled/ready` | Retry resumes this operation; a new generation cannot inherit its readiness |
| Stage execution | Stable UUID run ID; operation ID; stage type; snapshot generation; `queued/running/retry_wait/partial/failed/cancelled/succeeded` | Unique operation/stage identity; attempts do not create another logical run; explicit retry can resume failed/partial stages |
| Ownership | Monotonic fencing version; attempt owner; lease expiry; connection generation | Atomic claim/renew/reclaim; every write compares the fence and active generation |
| Dispatch intent | Unique operation/event ID; safe payload; `pending/sending/sent`; retry time; lease/attempts; last safe error | Persist with operation; recover expired sending lease; resend same ID after ambiguous send, relying on durable consumer idempotency as well as provider dedup |
| Snapshot progress | Stage/run and snapshot generation; raw-page cursor; seen source IDs; parse failures; page counts; traversal outcome | Never combine partial seen sets from different snapshot generations for archival |

Create `packages/jobs/src/handlers/recover-xero-import-dispatch.ts` and its tests;
register in `packages/jobs/src/functions.ts` and export through `index.ts` for
the existing API serve route. A one-minute Inngest cron scans a bounded batch of
due intents under atomic leases. Normal connection completion attempts dispatch
immediately; the cron closes crash/send gaps. Implement exhausted retries and
reconnect-required outcomes as visible states. Test crash after send but before
marking sent; redelivery must join the original operation even outside the event
provider's deduplication window. Never reset an already completed operation.

## Step 1: Resolve AU submission and approval semantics

The official [AU leave contract](https://developer.xero.com/documentation/api/payrollau/leaveapplications)
says API creation produces scheduled leave; approve applies to requested leave.
The current local `submitted` transition therefore misrepresents remote state.
Do not invent an endpoint, send an undocumented requested status or hide the
problem by changing the inbound mapping of all scheduled leave.

1. Add contract fixtures and tests in `packages/xero/src/au/write.test.ts`,
   `src/read/leave-records.test.ts` and existing availability submit/approval
   tests, distinguishing Xero-created requested leave from app-created leave.
2. Record a transition table here and in PRODUCT.md only when the user approves
   it. Recommended decision: app submission stays local pending approval;
   manager approval synchronously creates scheduled leave in Xero. App-local
   decline/withdraw before remote creation makes no Xero call. Imported requested
   leave uses the documented approve/reject operations. This is a proposed product
   change, not current authorisation to alter the four-write contract.
3. If the user instead requires remote creation on submit, obtain a supported
   provider capability and prove its pending semantics. Otherwise explicitly
   decline that promise; do not implement automatic payroll approval disguised
   as a pending request. Pause only this transition change pending the decision.
4. Under the approved contract, preserve claims and uncertainty recovery for
   the action that actually creates remote leave. Update operation metadata,
   recovery UI, audit, notifications and inbound deduplication to support create
   on approval if chosen. Preserve local withdrawal intent when Xero represents
   rejection; do not rewrite a successful withdrawal as declined on the next pull.
5. Define handling for legacy app-submitted rows already scheduled in Xero:
   scoped administrator review with remote evidence, never automatic rejection,
   deletion, duplicate creation or fabricated local approval audit history.

**Verify:** `bun run --cwd packages/xero test src/au/write.test.ts src/read/leave-records.test.ts`
and `bun run --cwd packages/availability test src/plans/submit-service.test.ts src/plans/submit-recovery-service.test.ts src/approvals/approval-service.test.ts`
exit 0 after the approved implementation. Add cases for duplicate clicks, remote
acceptance followed by timeout, concurrent inbound sync, already processed leave,
decline reason enforcement and legacy scheduled rows. Record the explicit decision
before marking Step 1 complete; passing mock tests alone does not settle it.

## Step 2: Make completeness, retries and run ownership truthful

1. In `packages/xero/src/read/leave-records.ts` and `src/au/read.ts`, validate
   the envelope separately from individual rows. Keep valid rows, record safe
   row failure diagnostics, and distinguish complete empty, malformed envelope,
   malformed row, failed page and pagination limit. Page progression must use raw
   page length/provider pagination, never the count of successfully parsed rows.
   Preserve complete snapshots for stale-deletion decisions only when trustworthy.
2. In leave sync, incomplete traversal or invalid records must not clear staleness,
   advance the last fully successful snapshot or emit Initial Sync Completed.
   Separate last attempted/update progress from last fully successful import.
   A complete zero-row response is success; a missing/unparseable list is not.
   Keep existing records on incomplete snapshots. Preserve raw audit payloads
   server-side while presenting plain-language recoverable errors.
3. Repair run identity before enabling retries. Manual dispatch in
   `packages/availability/src/sync/sync-events.ts` and scheduled dispatch in
   `packages/jobs/src/events.ts` both need the same validated execution contract.
   Persist and propagate a stable logical execution/run ID, scoped to both orgs
   and the tenant. Align handler input schemas, cancellation matching and API
   dispatch. Do not introduce a package cycle to share this contract.
4. Replace the non-atomic find-running/create guard with an atomic owner/lease
   claim. The same logical execution resumes after interruption; a competing
   execution does not steal a live lease. Expired leases can be reclaimed with
   fencing, and late workers cannot finalise or clear a newer worker's state.
   Preserve terminal outcomes on duplicate delivery. Cancellation must target
   the actual run, include tenant scope and work for queued/running executions.
   Each people/availability/balance write batch and archival transaction must
   atomically verify the current fencing version and active connection generation
   before changing data. Checking only before a provider request or at finalisation
   is insufficient. A delayed response from a replaced worker cannot write rows,
   emit completion or enqueue publication changes after losing ownership.
5. Keep service Results but classify failures at the Inngest boundary. Retry
   transport/5xx and rate limits with appropriate delays; refresh auth through
   existing recovery, then surface reconnect requirements as non-retryable.
   Row validation failures create an honest partial outcome, not a retry storm.
   A `status: failed` Result cannot silently finish the durable job successfully.
   Apply equivalent lifecycle semantics to people/balances and the orchestrator.
6. Bound reads into resumable pages/batches rather than one unbounded durable
   step. Do not publish credentials or raw payroll payloads in event data or
   memoised step outputs. Persist checkpoints/results under the scoped run.
   AU pagination is not a transactionally frozen provider snapshot. On an
   interrupted traversal restart at page one under a new snapshot generation,
   while retaining already idempotently applied records; do not splice old/new
   page seen-sets. If concurrent insert/delete/reordering is detected, retain
   partial/stale state and restart rather than claiming exhaustive coverage.
   Before archiving an absent existing record, confirm its remote state through
   an authoritative by-ID read; permission/network failure is not deletion.
   If the provider cannot confirm absence, retain the record and surface the
   unresolved reconciliation. A completed traversal is not a claimed point-in-
   time snapshot of an API that provides no snapshot guarantee.

**Verify:** `bun run --cwd packages/xero test src/au/read.test.ts src/read/leave-records.test.ts`
and `bun run --cwd packages/jobs test src/handlers/sync-xero-leave-records.test.ts src/handlers/sync-run-lifecycle.test.ts src/handlers/sync-xero-people.test.ts src/handlers/sync-xero-leave-balances.test.ts src/events.test.ts`
exit 0. Extend the current truncated-fetch test beyond its archival assertion.
Test malformed first and middle pages, mixed valid/invalid rows, >100 records,
page limit, 429/503 then success, crash after persist before acknowledgement,
same-execution retry, competing execution, expired lease, fenced stale worker,
exhausted retries and cancellation. Add transaction/claim concurrency cases to
co-located guarded integration tests; unit mocks cannot prove atomic ownership.
Include delayed old-worker writes after lease replacement and insertion/deletion
between interrupted pages. Run the Step 2 integration command in the guarded
verification table below before marking this step verified.

## Step 3: Protect payroll mappings and the shared OAuth lifecycle

1. Ordinary reconnect must match the existing remote Xero tenant ID. Reject a
   different file before modifying tokens, tenant mapping or importing. Explain
   which business is already attached. Payroll-file replacement is out of scope.
2. Reject attaching the same remote file twice within an account. Before adding
   constraints, inventory duplicates read-only; surface conflicts for explicit
   resolution, never delete/merge customer data automatically. Do not assume that
   global tenant uniqueness is the product policy across separate accounts.
3. Follow [Xero's token guidance](https://developer.xero.com/documentation/best-practices/data-integrity/managing-tokens):
   authorisation belongs to a Xero user/application grant; remote tenant and
   connection IDs have different roles. Add a server-only authorisation record
   for the credential lifecycle, referenced by scoped local XeroConnections.
   Retain one local connection per payroll entity. Rotate/lock credentials at
   authorisation level so reauthorising or refreshing one mapping cannot leave
   another using superseded credentials. The grouping identity is validated
   `(issuer, configured client_id, xero_userid)` from the access token, not an
   authentication-event ID (which changes on authorisation). Validate signature
   against Xero's fixed trusted JWKS/discovery origin, allowed algorithm, issuer,
   expiry/not-before, documented access-token audience and configured client ID
   before using any claims. Use a maintained verifier, declared directly by the
   Xero package. The current scopes do not request an ID token: do not assume
   one exists. Follow [Xero token verification](https://developer.xero.com/documentation/guides/oauth2/token-types)
   and prove the claim contract with validated fixtures before creating shared
   grant rows. If the required user claim or validation contract is unavailable,
   stop grant grouping and keep legacy isolation/reconnect recovery; never group
   by Clerk user ID, email, decoded-but-unverified claims or guessed subject aliases.
4. Explicitly document the schema exception: an OAuth grant can be provider-wide
   infrastructure if the same provider user connects multiple Clerk accounts.
   Tenant data and access remain on scoped connection mappings. Grant access
   must only follow an authorised mapping; never offer an unscoped grant lookup
   API. If this model cannot meet the repository tenancy rules, pause this schema
   choice for review; do not silently duplicate one rotating grant per account.
5. Backfill only verified grant identities. Keep legacy connections readable
   during rollout and request administrator reconnect when identity cannot be
   established safely. Use an expand/backfill/switch migration; retain old
   ciphertext until reviewed cutover succeeds. Never log/decode tokens to output.
6. Respect current OAuth state/session ownership, safe return destinations and
   AU capability checks. Prefer connections from the current authentication
   event when identifying the newly chosen file, with explicit selection when
   ambiguous. Do not automatically attach every file returned by /connections.
7. Disconnect only the chosen local mapping. Where multiple authorised account
   mappings reference the same provider connection ID, detach locally while
   references remain; delete that provider connection only after the last live
   mapping is removed. Serialise this check with mapping attach/detach under the
   authorisation lock. Persist/retry remote disconnect intent safely without
   reactivating the detached local mapping. Do not reveal other accounts' names
   or memberships in the receipt. Test two accounts sharing the exact same
   provider connection, not just different tenants on one grant.
   Whole-grant revocation
   must never disconnect other entities as a side effect. Reauthorisation by
   another administrator and loss of the original authoriser's Xero permissions
   need clear recovery without deleting historical records.

**Verify:** `bun run --cwd packages/xero test src/oauth/service.test.ts src/adapter/auth-recovery.test.ts`
exits 0. Extend existing OAuth/disconnect integration tests for same-file
reconnect, wrong-file rejection with no data mutation, duplicate mapping,
simultaneous refresh, same Xero authoriser across two entities/accounts, a second
administrator, legacy migration and disconnect-one-preserve-other behaviour.
Verify credentials never appear in UI DTOs, job events, logs or test snapshots.
Run the Step 3 guarded integration command below for mapping locks, grant rotation
and migration compatibility; unit-only success is not sufficient.

## Step 4: Reconcile imported people with existing member identities

1. Put canonical identity resolution in `packages/availability/src/people/`.
   Keep Xero response mapping in its adapter. Call the reconciliation service
   from people import and expose a scoped administrator review action.
2. Resolve exact source employee IDs first. For a previously manual profile,
   propose candidates using scoped verified membership/email evidence. Unique
   verified email/member mapping with no conflicting payroll identity can be
   linked automatically; name-only, duplicate-email, shared-email, missing-email
   and different-member conflicts require review. Non-payroll staff remain valid.
3. Prefer upgrading an unambiguous existing canonical manual person in place,
   preserving its ID, Clerk linkage, team/location, manual plans and references.
   If both Xero and manual people already exist, create a real idempotent match
   proposal. Reuse `XeroPersonMatch`; eliminate the empty matching queue gap.
4. Replace the blanket already-linked rejection in `matches/_actions.ts` with a
   scoped, transactional merge/link operation for the chosen candidate. Inventory
   every Person FK and person-ID JSON reference in schema/source first. Preserve
   availability, balances, manager links, feed scopes, privacy, audit provenance,
   published UIDs and notification relationships. Detect conflicting unique keys
   before mutation. Archive an absorbed identity only after references transfer.
   Never merge across organisations or silently resolve conflicting linked users.
5. Lock/recheck both people and member linkage at commit. Retries must produce
   one canonical identity and no duplicate leave. Preserve historical audit
   identity evidence. Rebuild affected feed projections without gratuitous UID
   changes; increment SEQUENCE only for changed published representation.
6. Use `clerk-access-service.ts` for verified membership discovery where useful,
   but do not assume its simple link routine merges pre-existing profiles.
   Reconcile current-user provisioning so it does not recreate absorbed people.

**Verify:** `bun run --cwd packages/availability test src/people/current-user-service.test.ts src/people/clerk-access-service.test.ts src/people/xero-person-reconciliation.test.ts`
and `bun run --cwd apps/app test 'app/(authenticated)/settings/integrations/xero/matches'`
exit 0. Create the named reconciliation test/service, modelled on existing people
service tests. Add guarded integration coverage for pre-connect manual users,
post-connect users, multiple memberships, conflicting candidates, simultaneous
sync/link, existing leave/feed references, repeat execution and foreign scope.
Assert exact retained IDs/UIDs, relationships and record counts before/after.
Run the Step 4 guarded integration command below before marking reconciliation
verified; include a rollback assertion when a reference transfer conflicts.

## Step 5: Orchestrate a durable first import and ordered ongoing sync

1. Create `packages/jobs/src/handlers/initial-xero-sync.ts` with co-located tests,
   register it through `packages/jobs/index.ts` and the existing API Inngest serve
   route. Use Inngest durable steps/invocations, not three independent fire-and-
   forget events and not a long-running server action.
2. Persist an import session keyed by connection generation and both tenant
   boundaries, with stage, counts, checkpoints, timestamps and safe errors.
   Prefer extending the existing run model where sufficient; any separate parent
   model must have FK/uniqueness/indexes and owned-fixture cleanup support.
   Distinguish connection active from import queued/running/partial/failed/ready.
3. Order stages: import every employee page, reconcile identities, import every
   AU V2 leave page, refresh eligible employee balances to completion, reconcile
   affected publications/cache, finalise receipt. Balances may run independently
   after people when safe, but their completion remains separately visible.
   Ambiguous identity matches do not block importing other staff's leave.
4. “All leave” means all records/statuses/pages exposed by the authorised AU API,
   without a silent date cutoff. Historical/inactive employees must not cause
   silent loss of their leave; retain/import a canonical identity or report the
   exact unresolved record. Calendar filters still control display permissions
   and date range; importing all records does not publish private data to everyone.
5. Persist connection and import intent atomically, then dispatch with an
   idempotent event ID. Close the database-commit/event-send gap using persisted
   dispatch state and a recovery dispatcher. Test a send failure after commit
   and repeated callback; the durable connection remains connected with an honest
   retry path. One logical import must not launch twice.
6. Replace the direct calls and duplicate queueing in `connect/_actions.ts`.
   Return the import-session destination after persistence/dispatch, without
   waiting for payroll downloads. Refreshing/closing the browser must not cancel
   the import. Reconnect to the same file can resume/restart safely; a generation
   check prevents old jobs writing after disconnect or credential replacement.
7. Coordinate scheduled people and leave work for each tenant so new employee
   discovery precedes their leave. Do not make approval reconciliation stand in
   for inbound discovery. Preserve cadence/rate limits, prevent overlap with
   bootstrap, and repair missing-person failures without waiting indefinitely.
8. Update `packages/jobs/src/activation.ts` and `activation.test.ts`: its current
   lookup combines historical successful runs of each type without a common
   import identity. Capture Initial Sync Completed only from terminal verified
   stage outcomes for the current import/connection generation. Preserve the
   account's first-activation analytics deduplication while keeping current
   import readiness separate from that historical milestone.
   Show import completion and “people need review” separately when safe records
   imported but identities remain unresolved. Never claim full setup ready for
   an affected employee until their identity is resolved.

**Verify:** `bun run --cwd packages/jobs test src/handlers/initial-xero-sync.test.ts src/handlers/schedule-xero-syncs.test.ts src/events.test.ts src/activation.test.ts`
and `bun run --cwd apps/app test 'app/(authenticated)/settings/integrations/xero/connect/_actions.test.ts'`
exit 0. Test event-send failure, duplicate callback, restart after every stage,
large multi-page input, no records, partial outcomes, member conflicts, balance
cursor exhaustion, simultaneous cron, cancellation and disconnect mid-import.
Assert stage order, no completion from mixed historical runs/generations and
exactly one first-activation event. A queue ID alone is not PASS.

## Step 6: Build the guided onboarding and shared connection experience

Use the impeccable skill's `onboard` guidance and existing DESIGN.md authority.
Mode: Operate. Audience: an administrator connecting payroll, then employees and
managers using shared data. Success: real leave appears in the authorised calendar.
Use Plus Jakarta Sans, semantic tonal surfaces, forest-green primary actions,
20px containers, 16px overlays, 14px controls, 12px chips, labelled statuses and
3px focus. Preserve equal light/dark care, mobile layouts and reduced motion.

| Surface | Content and primary action | Recovery/role behaviour |
| --- | --- | --- |
| Start | “Connect Xero Payroll”; business name; explain that an administrator connects once for the organisation | “Set up without Xero” remains available; members see connection status, not an OAuth demand |
| Choose business | Business name, country and destination payroll entity; explicit existing mapping | Automatically skip redundant choice when one unambiguous file; do not display UUIDs as business labels |
| Import progress | Persistent stage list, actual counts and last activity; “View calendar” as data arrives | Resume by URL after reload; no fabricated percentage or false completion; safe retry only for administrators |
| Review people | Human names/email, candidate evidence, linked membership, consequences and “Link records” / “Keep separate” | Ambiguity stays unresolved; use member selection rather than typing a Clerk user ID; maintain keyboard/error focus |
| Ready | Imported counts, last successful update, outstanding exceptions, “View calendar” | Complete zero-leave import says so explicitly; failed/partial import does not masquerade as an empty calendar |
| Shared status | Connected business, importing/up-to-date/attention needed, last successful import | Members retain role-scoped data access; admins receive reconnect/retry controls; never expose tokens/raw payroll errors |

1. Make onboarding state entity-specific and derived from durable import and
   person-resolution outcomes. Separate connection, imported data and member
   readiness. Remove the account-wide suppression of a second entity's setup.
   “Without Xero” is a separate intentional setup path, not a failed import.
2. Keep one visible next action; move holidays, invitations and feed setup after
   first calendar value. Existing functionality remains reachable. Do not require
   every administrator to be a payroll employee to complete business setup.
3. Consolidate technical manual sync choices into an understandable “Sync now”
   entry point with advanced diagnostics retained for administrators. Token refresh
   is automatic recovery; it should not be a routine task for customers.
4. Provide a payroll-entity selector for accounts with multiple accessible entities,
   preserving `?org=` through navigation. It is distinct from switching Clerk
   accounts. Resolve saved/default selection on the server within authorised
   scope; do not silently choose another entity because its record is first.
   If a member cannot select a default safely, show an explicit choice or access
   explanation. Changing selection clears stale data/subscriptions immediately.
5. Reuse design-system components and existing notification provider. Progress
   updates use a polite live region; failures present problem, retry and exit.
   Controls keep stable labels while busy and prevent duplicate requests.

**Verify:** `bun run --cwd apps/app test lib/server/load-onboarding-state.test.ts lib/server/require-active-org-page-context.test.ts components/onboarding 'app/(authenticated)/settings/integrations/xero'`
exits 0. Extend component tests for every row above, admin/member separation,
two entities, pending/stale connections, full/partial/zero import, unresolved
identity, no-Xero path, reload/resume, keyboard selection and no raw IDs/credentials.
Use impeccable browser verification in Step 8; source inspection is not visual proof.

## Step 7: Make sync results visible in the calendar

1. Add `apps/app/components/calendar/calendar-live-updates.tsx` with tests. Use
   `useNotificationEvents` from the existing provider and subscribe to relevant
   terminal sync/import changes. Filter by active organisation, deduplicate
   run/version IDs and coalesce `router.refresh()` calls. Refresh automatically
   while preserving calendar date/view/filter URL, scroll and open editing input.
2. Verify that authorised member sessions actually receive a safe invalidation
   event. Do not broadcast administrator sync diagnostics/raw errors to members
   merely to make the calendar refresh. Adjust scoped server event routing or add
   a minimal calendar-change notification through the notifications package.
3. Handle missed events on reconnect/tab visibility with a lightweight version or
   freshness check; clean up subscriptions on entity switch/unmount. Do not poll
   all payroll records or refresh continuously. Errors keep existing content.
4. Show business name, last successful leave refresh and importing/stale/failed
   states near the calendar. Distinguish “no records in this range”, active filters,
   missing personal linkage, no connection and import failure. Preserve roles and
   privacy transforms. Show Xero provenance plus approval state separately.
5. After synchronous outbound writes, invalidate the appropriate calendar/data
   views and reflect the actual approved transition contract. Other members see
   scoped updates; provider failures and unknown outcomes remain visible and
   recoverable. Imported leave updates must retain stable record identity and
   cannot overwrite a newer claimed local operation.

**Verify:** `bun run --cwd apps/app test components/calendar/calendar-live-updates.test.tsx 'app/(authenticated)/calendar/page.test.tsx'`
and `bun run --cwd packages/notifications test` exit 0. Test auto-refresh on the
correct completed run, duplicate/unrelated events, account/entity switch,
cleanup, missed-event recovery, preserved filters, active editing and redaction.
Add a browser assertion that a newly persisted Xero leave event appears in an
already-open permitted calendar without a manual reload.

## Step 8: Prove the whole flow and prepare rollout

1. Generate/review additive schema changes with one coordinated migration owner.
   Include import sessions/leases/grant references, indexes and uniqueness as
   required. Run read-only collision inventories before backfill. Backfills are
   bounded, idempotent and tenant-scoped. No automatic production person merge.
2. Register new models in owned test fixture allocation and cleanup. Register
   new integration suites in `tooling/release/integration-inventory.ts` and its
   test so the guarded runner does not reject or silently omit the new coverage.
   Also allocate each new suite in `packages/database/src/live-test-fixture.ts`;
   update manifest capacity and global-key ownership for grant rows as needed.
   Use existing
   guarded integration tests and release tooling. Test migration from legacy
   connections/people as well as fresh data, interrupted backfill and mixed-version
   application rollout. Keep legacy credential readers until cutover is verified.
3. Add `tooling/release/e2e/xero-onboarding.spec.ts` for owned browser fixtures and
   `xero-roundtrip.spec.ts` for explicitly authorised provider-backed cases. Do
   not issue real payroll writes from unit/ordinary CI tests. Record exact owned
   remote IDs for cleanup/reconciliation, without credentials or customer PII.
4. Execute the following matrix with separate owner/admin/manager/viewer sessions
   and a foreign account. Verify persisted rows, job terminal state and rendered
   UI, not just HTTP 200/event acceptance. For scoped reads, record IDs/counts
   sufficient to prove membership/entity isolation without exporting payroll data.

| Scenario | Required proof |
| --- | --- |
| Fresh Xero connection | Every employee/leave page consumed, honest stage counts, balance completion, calendar receipt |
| Existing manual member | One canonical identity; preserved plans, teams, feed UIDs; personal leave visible |
| Ambiguous match | Safe review, no accidental merge or cross-member access, unaffected people still imported |
| Xero-created/edited/rejected leave | Next eligible pull persists correct dates/state; permitted open calendar updates |
| Approved app workflow | Each supported action has correct provider final state and inline failure/uncertainty handling |
| Complete empty versus failed read | Different UI/outcomes; failure never clears freshness or archives unseen records |
| Interrupted/rate-limited import | Retry/resume from owned state, no self-cancellation, duplicate records or false success |
| Second member | Uses the organisation connection without personal OAuth, sees only permitted data |
| Two entities and same Xero authoriser | Independent data/context; refreshing/reconnecting one does not break the other |
| Wrong-file reconnect/disconnect | Wrong file rejected with unchanged data; chosen disconnect preserves other connections |
| Foreign account/entity event | No readable data, mutation or refresh leakage |
| Mobile/accessibility | 390/768/1440px, both themes, keyboard, focus, status announcements, reduced motion, no overflow |

5. Run all root gates in the commands table. Do not turn a guard rejection,
   skipped provider test or missing browser fixture into PASS. Record the target,
   commit, command, result and evidence artefact for each. Keep ordinary CI's local
   database evidence separate from live-Neon/provider release evidence.
6. Use the existing owned-fixture release runner for authorised live integration:
   `bun run tooling/release/run-live-integration.ts --manifest <protected-manifest-path>`.
   Its required authority/ownership/environment checks must pass; no fabricated
   manifest or bypass. The actual absolute manifest path comes from the authorised
   release environment and must not be committed. Then run the browser command
   with its configured role fixtures; verify cleanup and outside-owned invariants.
7. Prepare rollout order: additive schema, backward-compatible credential/job
   readers, server/job changes, then UI. Drain or fence older import generations.
   Monitor import failures, unresolved matches, failed refreshes, retry exhaustion
   and time to first populated calendar. Rollback must preserve mappings/history;
   never restore consumed refresh tokens or replay uncertain payroll creates.
8. Update the execution ledger below and release-plan Xero acceptance references.
   Do not claim overall launch readiness from this scoped plan alone.

**Verify:** every root gate exits 0 in its supported environment and the matrix has direct
evidence per row.

**`bun run test:release` is not a local gate and must not be treated as one.** It is a
deployed-candidate Playwright suite: `tooling/release/e2e/environment.ts:11-17` requires
`TC_API_CANDIDATE_URL`, `TC_APP_CANDIDATE_URL`, `TC_WEB_CANDIDATE_URL`,
`TC_DEPLOYED_CANDIDATE_SHA`, `TC_E2E_FIXTURE_MANIFEST` and `TC_RELEASE_MANIFEST`, all
validated when the Playwright config is merely loaded, and
`tooling/release/playwright.config.ts:22-33` declares Firefox and WebKit projects whose
browsers are not installed by default. Write the browser assertions in
`tooling/release/e2e/` as a deliverable, and execute them during the authorised release
campaign owned by `plans/160-xero-end-to-end-verification-and-report.md`. Until that run,
record the browser matrix as NOT VERIFIED. **Never stub the `TC_*` variables to make it
run locally.**
Production rollout remains a separate authorised action after reviewable evidence.

### Guarded integration verification at each implementation slice

These commands are exact local-CI commands, run only against its configured local
test PostgreSQL service with applicable migrations already applied. Package scripts
retain their existing guards; never point them at live Neon as a shortcut. For
live evidence run the full owned-manifest runner from Step 8 instead, which owns
the environment and cleanup. Mark database verification NOT VERIFIED if that
target is unavailable; unit PASS must not mark the slice fully verified.

| Step | Files to extend/create | Local guarded command and required result |
| --- | --- | --- |
| 2 | Extend jobs `src/handlers/sync-xero-leave-records.integration.test.ts`; create `src/handlers/sync-run-lifecycle.integration.test.ts` | `bun run --cwd packages/jobs test:integration src/handlers/sync-xero-leave-records.integration.test.ts src/handlers/sync-run-lifecycle.integration.test.ts` exits 0; real concurrent claims yield one owner; delayed stale worker writes zero rows; incomplete scans archive zero unconfirmed records |
| 3 | Extend Xero `src/oauth/service.integration.test.ts`, `src/oauth/disconnect.integration.test.ts`; extend database `xero-tenancy.integration.test.ts` | `bun run --cwd packages/xero test:integration src/oauth/service.integration.test.ts src/oauth/disconnect.integration.test.ts` and `bun run --cwd packages/database test:integration xero-tenancy.integration.test.ts` exit 0; wrong-file mapping unchanged, one refresh owner, detach-one preserves shared remote connection |
| 4 | Create availability `src/people/xero-person-reconciliation.integration.test.ts`; extend `src/people/current-user-service.integration.test.ts` | `bun run --cwd packages/availability test:integration src/people/xero-person-reconciliation.integration.test.ts src/people/current-user-service.integration.test.ts` exits 0; retained canonical IDs/UIDs and FK counts match, foreign tenant rows unchanged, conflicts roll back |
| 5 | Create jobs `src/handlers/initial-xero-sync.integration.test.ts`; extend scheduler integration | `bun run --cwd packages/jobs test:integration src/handlers/initial-xero-sync.integration.test.ts src/handlers/schedule-xero-syncs.integration.test.ts` exits 0; interruption at each boundary resumes one operation, duplicate dispatch does not reapply stages |
| 8 | Create database `xero-sync-migration.integration.test.ts`; extend owned cleanup tests | `bun run --cwd packages/database test:integration xero-sync-migration.integration.test.ts` exits 0; legacy-shaped rows backfill twice identically, unknown grants remain isolated, collision failure preserves all source rows |

Vitest positional filters may include additional integration files because the
package script already supplies `.integration.test.ts`; a broader guarded run is
acceptable, omission of the named cases is not.

**Register all new files in the reviewed inventory and owned allocation before any
guarded live run.** Concretely, each of the four new `.integration.test.ts` files this
plan creates needs an entry in `LIVE_FIXTURE_SUITES` in
`packages/database/src/live-test-fixture.ts`, keyed by its repository-relative path,
following the shape of the existing entries. An unregistered suite can allocate an
unprotected slot and mutate records it does not own.

**Known trap:** `packages/database/src/live-test-fixture.test.ts` asserts the exact suite
count **twice**, at lines 92 and 224. Adding suites breaks both. Update both numbers in the
same change. **Do not delete the assertion or loosen it to a range**: that count is precisely
what stops an unregistered suite from allocating an unprotected slot.

**Derive the number; do not assume it.** The baseline is 21 and this plan adds four, so 25 is
correct *only if nothing else has landed first*. `plans/161a-xero-baseline-and-fixture-ownership.md`
registers five further suites and bumps the same two assertions; if 161a landed first the
baseline is 26 and the answer is 30. Read the real count out of the file:

```bash
grep -n "toHaveLength(" packages/database/src/live-test-fixture.test.ts
grep -c "integration.test.ts" packages/database/src/live-test-fixture.ts
```

The second command is authoritative. Both assertions must equal it.

**Coordinate with Plan 161.** `plans/161a-xero-baseline-and-fixture-ownership.md` registers
five further suites and bumps the same count. The four this plan adds
(`sync-run-lifecycle`, `xero-person-reconciliation`, `initial-xero-sync`,
`xero-sync-migration`) do not overlap 161a's five, but whichever lands second must
recount rather than assume. If you hit a merge conflict on that assertion, the correct
resolution is always `Object.keys(LIVE_FIXTURE_SUITES).length` as it actually is after
the merge, verified by running `bun run --cwd packages/database test`.
After deploying additive migrations to the approved test target, run the existing
CI schema comparison from `packages/database`:
`bunx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code`.
Expect exit 0 and no schema drift. Backfill compatibility tests complement this
schema check; they do not replace migration deployment evidence.

## Done criteria

- [ ] AU transition decision recorded and implemented; provider semantics and UI agree.
- [ ] Complete empty import succeeds; incomplete/invalid/page-failed imports remain partial/failed.
- [ ] Retried/interrupted/duplicate jobs preserve one logical execution and recover safely.
- [ ] First connect returns a durable progress destination without waiting for payroll downloads.
- [ ] All available employee/leave pages and balance stages have truthful completion evidence.
- [ ] Existing manual/Clerk people reconcile safely; ambiguous matches have a usable review queue.
- [ ] Same-file reconnect works; wrong-file reconnect leaves mapping and data unchanged.
- [ ] Shared grant refresh/reconnect/disconnect passes multi-entity and account-isolation tests.
- [ ] Members need no personal Xero OAuth; role and entity permissions remain enforced.
- [ ] Calendar updates without manual reload and preserves filters/edits/privacy.
- [ ] Root lint/build/types/boundaries/unit/integration and release-tool gates pass.
- [ ] Browser assertions are **written** in `tooling/release/e2e/`; their **execution** is
      recorded NOT VERIFIED until the Plan 160 campaign runs them against a deployed
      candidate. `bun run test:release` is not a local gate (see Step 8).
- [ ] `git diff --check` passes; changed files are within scope and user changes are preserved.
- [ ] Ledger and `plans/README.md` accurately distinguish source completion from live verification.

Machine-checkable gates, all required:

- [ ] `bun run check` exits 0
- [ ] `bun run typecheck` exits 0
- [ ] `bun run build` exits 0 (see "Fresh worktree setup" for the two required variables)
- [ ] `bun run test` exits 0
- [ ] `bun run boundaries` exits 0
- [ ] `bun run test:release-tools` exits 0
- [ ] `bun run typecheck:release-tools` exits 0
- [ ] `git diff --check` exits 0
- [ ] `bun run --cwd packages/jobs test` exits 0
- [ ] `bun run --cwd packages/availability test` exits 0
- [ ] `bun run --cwd packages/xero test` exits 0
- [ ] `bun run --cwd apps/app test 'app/(authenticated)/settings/integrations/xero'` exits 0
- [ ] The two baseline commands still pass and their counts have only grown, never shrunk:
      `bunx vitest run src/handlers/sync-xero-leave-records.test.ts src/handlers/sync-xero-people.test.ts src/handlers/schedule-xero-syncs.test.ts`
      from `packages/jobs` reported **57 passed** at `8652c31`, and
      `bunx vitest run lib/server/load-onboarding-state.test.ts 'app/(authenticated)/settings/integrations/xero/connect/_actions.test.ts' 'app/(authenticated)/calendar/page.test.tsx'`
      from `apps/app` reported **17 passed**. A drop in either count means a regression
      was deleted rather than fixed.
- [ ] Both `toHaveLength(...)` assertions in `packages/database/src/live-test-fixture.test.ts`
      equal the output of `grep -c "integration.test.ts" packages/database/src/live-test-fixture.ts`,
      every new `.integration.test.ts` file appears in `LIVE_FIXTURE_SUITES`, and
      `bun run --cwd packages/database test` exits 0
- [ ] `grep -nE "bun run test:release([^-]|$)" plans/159-xero-sync-and-onboarding.md` shows no
      match inside the Commands table or this checklist. The `([^-]|$)` matters: a plain `\b`
      would also match the legitimate `bun run test:release-tools` gate, which this plan uses
- [ ] `git status --short` shows no file changed outside the permitted paths list

## Stop conditions and maintenance

Pause the affected action and record the concrete reason if the AU write contract
has no approved resolution; a migration requires ambiguous customer-data merges;
grant identity cannot be verified; cross-account grant storage lacks a reviewed
access boundary; or a live fixture/authority guard rejects the target. Continue
independent work. Re-plan a slice if drift contradicts its evidence or it needs
out-of-scope changes; do not repeatedly retry an unsafe assumption.

**Step 3 is dead text.** If you find yourself implementing a wrong-file reconnect guard or
a credential-owner record from this plan, stop: those are 161b and 161d. Two guards in one
transaction is worse than none, because each will look correct in isolation.

**The baseline test counts in the Done criteria are a regression tripwire.** 57 and 17 were
measured at `8652c31`. A future change that makes either number fall has removed coverage;
a reviewer should ask which test went and why before approving.

Future status-mapping changes must update create, approval, withdrawal, inbound
normalisation, publication and uncertainty recovery together. Person reconciliation
must inventory new Person references whenever schema evolves. New manual/scheduled
event paths must preserve execution identity and scoped cancellation. Do not derive
readiness from queue acknowledgement, a connection flag or a single page timestamp.

### Considered and rejected

- “AU uses the wrong leave endpoint”: current code already uses V2 for discovery.
- “Every member must connect Xero”: credentials already belong to the entity;
  retain shared use and restricted administration.
- “Just refresh the calendar”: fixes stale presentation only, not failed imports
  or mismatched people.
- “Just throw on failed jobs”: insufficient while retries can cancel themselves
  and cancellation lacks a stable dispatch/run identity.
- “Automatically merge matching names”: unsafe for real employee/payroll identity.
- “Mark scheduled leave pending”: falsifies Xero state and leaves payroll effects.
- “Move outbound writes to jobs”: conflicts with synchronous user-facing writes.

### Documentation checked

- Local `PRODUCT.md`, `DESIGN.md`, `.impeccable.md`, package manifests, CI and
  scoped source/tests named above. Impeccable onboarding guidance was applied.
- [Xero AU leave applications](https://developer.xero.com/documentation/api/payrollau/leaveapplications).
- [Xero AU status definitions](https://developer.xero.com/documentation/api/payrollau/types-and-codes).
- [Xero connections](https://developer.xero.com/documentation/best-practices/managing-connections/connections)
  and [token lifecycle](https://developer.xero.com/documentation/best-practices/data-integrity/managing-tokens).
- The supplied [multi-tenancy URL](https://developer.xero.com/documentation/best-practices/managing-connections/multi-tenancy)
  returned a JavaScript shell; no unobserved contents are claimed.
- Context7 Xero Node and Inngest JS documentation, including durable step failures,
  invocation and retry classification. Recheck version-specific SDK APIs against
  installed Inngest before implementation; do not copy incompatible signatures.

## Execution ledger

| Item | Source status | Verification | Evidence / remaining action |
| --- | --- | --- | --- |
| Planning | COMPLETE | Current source reviewed | `246ba27`; no source changes |
| Second plan review | COMPLETE | Re-verified all 11 finding anchors and both baseline test counts at `8652c31`; corrected the Plan 161 supersession note to name X5, 161b and 161d and flag the reversed cross-account uniqueness policy; relocated the unrunnable `bun run test:release` gate; added worktree env setup, the `LIVE_FIXTURE_SUITES` count trap and machine-checkable gates |
| Plan review | COMPLETE | Independent cold review incorporated | Added verified grant-identity contract, shared-connection detach rules, per-batch fencing, resumed-snapshot semantics, durable state/dispatch contract and guarded per-slice integration commands |
| Existing focused baseline | Unchanged | PASS, 74 tests in 6 files | Commands in baseline section, run during preceding audit |
| Steps 1 through 8 | TODO | NOT VERIFIED | Execute only when implementation requested |
| Production round trip | Not executed | NOT VERIFIED | Owned provider/job/database/browser proof required |
