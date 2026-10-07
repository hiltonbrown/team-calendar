# Xero architecture audit, 8 October 2026

Status: source audit, corrections, independent review and all six required local
verification gates passed. Live provider and application-browser behaviour remain
unverified; this report does not declare production readiness. The existing
`work` branch began at `8d38e978`; only
simplification phases 2, 3 and 4 were present. Independent source review exposed
missing approved sync and write work as well as concrete security/data defects.
The corrections implement that approved design, without a second worktree,
compatibility layer, new lifecycle subsystem or live provider mutation.

## 1. Architecture

OAuth creates a short-lived session, verifies the authenticated account/user and
single-use state, exchanges one code, inspects authorised connections, selects an
eligible AU tenant and persists a canonical authorisation and scoped connection.
Automatic access resolution owns refresh. One persisted full initial import is
followed by incremental supported reads, rolling balances and synchronous
journalled AU writes. Disconnect deletes the selected remote connection before
local teardown and audit.

## 2. Persistent models

The four provider lifecycle models are `XeroAuthorisation`, `XeroConnection`,
`XeroOAuthSession` and `XeroSyncCursor`. The authorisation exclusively owns
AES-256-GCM encrypted credentials and their key version. Connections contain
both tenancy keys and one Organisation has at most one connection. Sessions
contain temporary selection state and a grant reference, never copied tokens.
`OutboundOperation` remains the real leave mutation journal.

Removed lifecycle models: `XeroCredentialOwner`, `XeroRefreshAttempt`,
`XeroProviderConnection`, `XeroTenant`, `XeroCleanupRequest`, `XeroCleanupAttempt`
and `XeroInactivityClassification`. Historical
migration SQL and absence assertions legitimately mention removed models;
generated output is regenerated. External tenant IDs and in-memory provider
captures remain necessary routing and stale-response protections. The retained
`XeroProviderConnectionCapture` interface and `verifyXeroProviderConnection`
function describe an in-memory identity capture and ordinary authoritative
inventory verification, respectively; neither is a persistent provider model.

## 3. Removed infrastructure

The earlier phases removed mirrored credentials, binding generations/active
slots, tenant reservations/backfills, durable refresh attempts, manual token
controls, management-token deletion, cleanup reconciliation/receipts and
behavioural inactivity policy. This audit removes the remaining credential-domain
sentinel, namespace epoch/manual quota bootstrap, obsolete rate classes/metrics,
deleted campaign snapshot routing and active plans 161, 163 and 164. Deleted
documents are `plans/161-harden-xero-connection-lifecycle.md`,
`plans/161-xero-provider-contract.md`, `plans/163-ordinary-campaign-admission.md`
and `plans/164-protected-integration-spies.md`. Generic
database/Redis fixture ownership and release safety guards remain.

## 4. Exact requested scopes

`offline_access accounting.settings.read payroll.employees payroll.settings.read`

The employee write grant also permits employee/leave reads; settings grants are
read-only for tenant country and payroll leave types. There are no Pay Runs,
duplicate read-only employee, write settings or unused identity scopes. The exact
set is pinned by tests.

## 5. OAuth and refresh

One access resolver checks the scoped connection, required scopes and safe token
expiry, locks the canonical authorisation for rotation, rereads and atomically
replaces the token pair. Valid tokens avoid rotation. Invalid grants require
reconnect. Uncertain rotation preserves the stored pair for a subsequent normal
attempt within Xero's 30-minute grace. Dormant grants are refreshed once per
authorisation at 45 days through the existing 15-minute scheduler.

This audit fixes normalised-path manual-selection redirects and unreferenced
grant cleanup after cancelled callbacks or authoriser replacement. Existing
locked session purge keeps referenced sibling grants safe.

## 6. Disconnect

An authorised owner/admin selects the scoped Organisation. The active canonical
grant deletes `/connections/{id}`; documented 204 or 404 permits local teardown.
Transient/uncertain failures preserve credentials and connection for retry.
Actual unresolved leave operations block teardown. Required audit and local
changes are atomic; grants still referenced by another connection or a live
session remain. Explicit imported-data purge preserves manual records. Confirmed
provider loss requires reconnect and disables scheduled sync/provider writes.

## 7. Incremental sync

Implemented and independently reviewed: AU employees and V2 leave use a fixed
UTC-second `If-Modified-Since` header with two-minute overlap, traverse every
page, and advance a scoped CAS watermark to run start only after complete
successful persistence. Deltas never archive absent records. Initial, manual
and nightly full reconciliation omit the filter and permit absence inference
only after complete success. NZ/UK retain their supported regional retrieval.

Initial import must process the complete balance roster and CAS completion
against its persisted request timestamp. Rolling workload failure flags preserve
staleness across a failed first page followed by a clean final page. Invalid leave
rows and persistence failures prevent broad archival and freshness claims.

## 8. Supported write idempotency

Implemented and independently reviewed: local submission makes no provider write;
manager approval creates scheduled AU leave, imported requested leave uses
approve/reject, and supported remote withdrawal uses reject. The existing journal
persists one UUID key and exact external tenant/method/URL/body identity before
dispatch, with a fixed five-minute automatic replay cutoff. Replays retain the
key and request; uncertain actions beyond that boundary require provider
inspection and administrator recovery. No mutation worker is introduced. The retained five-minute record claim lease
conservatively requires administrator recovery after some process crashes;
normal released-claim retries can reuse the key within the replay window.
Uncertainty remains durable and late native replay stays blocked.

## 9. Verification commands

All commands below exited 0 on the final source. Turbo executions were uncached.
The only subsequent edits record these outcomes in Markdown.

| Exact repository command | Final outcome |
| --- | --- |
| `bun run check` | 1,153 files checked; no fixes applied |
| `bun run typecheck --force --concurrency=3` | 19/19 tasks passed, 0 cached |
| `bun run boundaries` | 1,082 files across 21 packages; no issues |
| `bun run test --force --continue=always --concurrency=2 -- --maxWorkers=2` | 18/18 tasks passed, 0 cached; 2,948 tests passed |
| `bun run test:integration --continue=always --concurrency=2` | 6/6 tasks passed, 0 cached; 252 tests passed |
| `bun run build --force --concurrency=3` | 4/4 tasks passed, 0 cached; database, app, API and web builds passed |
| `bun run test:release-tools --maxWorkers=2` | 27 files passed; 195 tests passed, 4 skipped |
| `bun run typecheck:release-tools` | TypeScript exited 0 |

Execution used Bun 1.4.0 from `/workspace/tools/bun`, explicitly owned disposable
PostgreSQL 17 at `127.0.0.1:54329`, and Redis with its REST bridge at
`127.0.0.1:8079`. Integration/release tests used `NODE_ENV=test` and the explicit
local test allowance; no non-local database test allowance was enabled. Unit
tests ran with both database-test allowances unset. The release snapshot SQL
isolation test executed against real local PostgreSQL. The four release skips
are controlled static-HTML probes requiring an unavailable Chromium executable;
they are not application or provider verification.

Initial boundaries failed on seven cross-package test imports, which were
corrected. Initial integration failed because a provider-disconnect fixture had
no completed initial import; the fixture now represents the ready sibling the
test asserts, without weakening the production scheduling prerequisite. The
targeted 13-test PostgreSQL suite and complete integration rerun passed.

Initial production builds failed on missing encryption configuration, then on
the managed Clerk publishable key failing validation. The final build used the
user-supplied development publishable key and a real randomly generated temporary
encryption key. No Xero provider credential or validation bypass was fabricated.
Missing optional observability configuration produced warnings, not build
failures. The root build deliberately excludes the email preview app, as defined
by the repository script.

Prisma 7.10.0 generated successfully. The Prisma-generated migration deployed;
all 26 migrations replayed into a fresh local PostgreSQL database, and schema
diff reported no difference. `prisma migrate dev` rejected noninteractive use;
`prisma migrate diff --script --output` generated the migration without hand edits.

Additional targeted OAuth, refresh-concurrency, native write/recovery, cursor,
initial-import, archival and atomic sweep tests passed. The final complete gates
include 587 Xero unit tests, 528 availability unit tests, 188 job unit tests,
81 Xero integration tests, 50 database integration tests and 75 job integration
tests. The new disconnect browser test was successfully collected; collection
does not prove execution. `git diff --check` passed.

## 10. NOT VERIFIED

No approved safe Xero demo credentials or owned provider fixtures are configured.
Live OAuth consent, tenant discovery/selection, token rotation/recovery,
initial/incremental reads, native mutation deduplication, disconnect and reconnect
are **NOT VERIFIED**. Actual application-browser journeys and deployed scheduled
jobs are **NOT VERIFIED**. No live provider write was attempted. Local PostgreSQL,
Redis and mocked provider HTTP tests cannot prove these observations.

Deployed Clerk sessions, candidate deployment/ownership manifests, an approved
exact disposable AU demo connection and specific live mutation authority are
unavailable. Those prerequisites are enforced rather than fabricated. Local
production compilation passed; deployed configuration and provider entitlement
remain **NOT VERIFIED**.

## 11. Independent review

Three fresh read-only review contexts covered security, sync/writes and the whole
repository's residual architecture. Their source findings identified two
Important security defects, five Important sync/write gaps and a Minor safe
transport-observation gap. No Critical issue was proven. Fresh frozen-source security and sync/write review found no remaining proven
Critical or Important issue. A newly added browser DELETE-authority gap was
fixed and rereviewed before any real provider action. No live execution is
claimed.

### Resolved review findings

| Finding | Final correction / evidence |
| --- | --- |
| Normalised manual-selection open redirect | Validate the normalised local pathname and defend stored selection return paths; OAuth unit/PG regressions |
| Unreferenced encrypted grant orphaning | Retain only a pruning reference in closed sessions; locked purge preserves legitimately referenced siblings |
| Malformed leave causes broad archival | AU and regional downstream failures block absence archival while valid neighbours still import |
| Partial initial roster advertised as ready | Complete all balance pages, fence the persisted request timestamp and derive readiness from actual completion |
| Missing incremental watermarks | Supported AU modification header, overlap, complete traversal/persistence and scoped monotonic CAS |
| Non-journalled mutations and save-loss uncertainty | Existing journal covers every supported remote action, exact native key/request identity and accepted/unknown recovery |
| Earlier roster failure lost on final page | Persist real sweep failure truth and clear staleness only after a wholly clean sweep |
| Old final page clears newer failed sweep | Cursor, sweep flags and health/freshness commit atomically with the existing run fence |
| Recovery compares unsent local days with provider hours | Match sent request fields and independently verify the original journal fingerprint, without conversion |
| Original decline note lost after accepted write/local rollback | Persist the note in the existing journal and restore original actor/notification payload |
| New browser DELETE lacked demo/action authority | Exact run/app/tenant/link acknowledgement plus fresh authoritative AU demo proof immediately before confirmation |
| Snapshot read lacked both tenant predicates | Scoped SQL filters both owned Clerk/Organisation keys and scoped journal join; real PG rollback regression |
| Diagnostic output corrupts observer JSON | Route test-observer info/debug to stderr; actual logger child-process regression |
| Dead quota bootstrap/campaign source | Ordinary atomic first-use admission, retained quotas/failure handling, deleted dead exports/env/metrics/plans |
| Missing safe HTTP observations (Minor) | Existing logger records safe method/path/status/delay/correlation without query, credentials or body |

Frozen-source independent reviews reported no remaining proven Critical,
Important or Minor defects in their approved scopes. The retained conservative
process-crash claim policy is disclosed above. Live execution and wider release
readiness remain unverified; local source checks do not substitute for them.

## Provider contracts rechecked

Official documentation and current Xero-owned OpenAPI were rechecked on this
audit. Documentation is contract evidence, never live execution evidence.

- [OAuth FAQ](https://developer.xero.com/faq/oauth2): 30-minute access, 60-day
  unused refresh expiry, rotated pairs and 30-minute lost-response grace.
- [Code flow](https://developer.xero.com/documentation/guides/oauth2/auth-flow/)
  and [SDK](https://github.com/XeroAPI/xero-node): state/code exchange and refresh.
- [Tenants](https://developer.xero.com/documentation/guides/oauth2/tenants/):
  current `authEventId` filtering, complete inventory, user-authorised deletion.
- [Identity OpenAPI](https://github.com/XeroAPI/Xero-OpenAPI/blob/master/xero-identity.yaml):
  user OAuth DELETE, 204 success and 404 absent.
- [Accounting OpenAPI](https://github.com/XeroAPI/Xero-OpenAPI/blob/master/xero_accounting.yaml):
  organisation country/demo metadata and the minimum read-only settings grant.
- [AU OpenAPI](https://github.com/XeroAPI/Xero-OpenAPI/blob/master/xero-payroll-au.yaml):
  endpoint scopes, employee/V2 leave modification filters, paging and AU contracts.
- [AU leave](https://developer.xero.com/documentation/api/payrollau/leaveapplications/):
  V2 all-state retrieval, scheduled array create, requested approve and
  requested/scheduled reject before payroll processing.
- [Rate FAQ](https://developer.xero.com/faq): five concurrent, 60/tenant/minute,
  1,000 Starter or 5,000 higher-tier/tenant/day and 10,000/app/minute.
- [Idempotency](https://developer.xero.com/documentation/guides/idempotent-requests/idempotency/):
  app-wide POST/PUT/PATCH keys, unchanged request identity, six-minute retention
  and provider inspection after uncertain/cached errors.
