# Final Xero architecture audit, Prompt 8

Baseline: `e5fe001fc553edd9109ed40cce9385f05ea765b0`, existing branch `work`.
This audit reviews the completed phases 2–7 and corrects observed defects. It
adds no lifecycle model, compatibility path, provider abstraction or worktree.
The earlier dated audit and phase reports remain historical evidence; this
report records the current candidate. Source audit, focused corrections, fresh
local gates and independent review are complete; live provider, application
browser and Neon-runtime verification remain explicitly unavailable below.

## 1. Final architecture

OAuth → `XeroAuthorisation` → scoped `XeroConnection` → automatic refresh →
complete initial import → incremental supported reads → synchronous native-key
writes → remote-first disconnect. Onboarding and outbound writes are AU-only;
NZ/UK regional adapters do not activate those future product releases.

`XeroAuthorisation` exclusively owns encrypted credentials for a verified Xero
user/provider app. One grant may serve several scoped connections. Each Team
Calendar Organisation has at most one connection. `XeroOAuthSession` contains
short-lived, single-use onboarding state and safe selection metadata, with no
credential copy. `XeroSyncCursor` stores completed people/leave watermarks.
`XeroPersonMatch` remains the actual people-matching domain model.

## 2. Removed models and residual-reference rulings

The completed simplification removed `XeroCredentialOwner`, `XeroRefreshAttempt`,
`XeroProviderConnection`, the old `XeroTenant`, `XeroCleanupRequest`,
`XeroCleanupAttempt` and `XeroInactivityClassification`. Fresh PostgreSQL
migration replay leaves only the four lifecycle tables and people matches;
`prevent_xero_tenant_rebinding` is absent. No token mirroring remains.

The entire-repository search includes historical migrations and reports.
Remaining obsolete-name references have these concrete purposes:

- Immutable migration history creates and subsequently drops the retired
  schema; altering those bytes would violate the repository migration policy.
- The approved design/implementation plan and dated audit reports document
  deleted components, rather than presenting an alternate supported design.
- Regression assertions prove manual refresh controls/actions are absent.
- `XeroProviderConnectionCapture`, `XeroProviderConnectionStatus` and
  `verifyXeroProviderConnection` describe an in-memory captured identity and
  current Connections API verification. They prevent stale responses from
  invalidating a replaced connection. None is the deleted persistent model.

The active-source obsolete-model/helper/flag search has no matches. All 100
paths in the approved plan's exact deletion inventory are absent.

## 3. Removed source and infrastructure

Previous phases deleted credential-owner/refresh-attempt modules, mirrored
credentials, binding generations/active slots, tenant reservations/backfills,
management-token deletion, remote-cleanup claims/leases/receipts/reconciliation,
behavioural inactivity policy/reporting, manual token refresh, namespace
bootstrap/sentinels/epochs, campaign interception/evidence tooling and Plans
161/163/164. Their architecture-only tests were deleted with them.

The small shared atomic Redis quota boundary remains necessary across app, API
and job workers: five tenant requests concurrently, 60/minute, commercial-tier
daily allowance and 10,000/minute per app. Expiring request slots recover
capacity after worker termination. Fixture namespaces isolate owned tests;
there is no runtime namespace bootstrap or topology proof. Request deadlines,
5 MiB bounded bodies, allowed origins, redirect rejection, real response-limit
headers, bounded retry, correlation IDs and secret-free metrics remain current
HTTP requirements. Local admission failures never fabricate provider HTTP 429.
Plan 160's domain operation journal and generic database/fixture ownership
safeguards remain justified independently of the deleted architecture.

## 4. Exact scope set

`offline_access accounting.settings.read payroll.employees payroll.settings.read`

The exact set is test-pinned. Employee write permission covers current reads and
AU leave mutations. Accounting settings reads establish tenant country; payroll
settings reads obtain leave types. No Pay Runs, duplicate employee-read grant,
write settings or unused identity scope is requested.

## 5. OAuth, refresh and security

An authenticated owner/admin creates a short-lived session. Callback verifies
signed state, nonce, authenticated initiator and account, claims the session
before exchanging the code once, verifies the token identity and inspects
current authorised connections. `authentication_event_id` identifies the new
event's connections; the complete inventory supports legitimate existing
consents. Multiple eligible organisations retain tenant selection. Region,
scopes and selected file are checked before the canonical grant and connection
are persisted. Temporary state is consumed and one persisted initial import is
requested, with scheduler recovery for failed enqueue.

The sole access resolver requires both tenancy keys, active connection/grant
and required scopes. Safely valid access is reused. Expiring access locks the
canonical authorisation, rereads, performs one refresh grant when needed, and
atomically replaces both encrypted tokens, expiry, scopes and refresh time.
Concurrent callers reuse the first rotation. Uncertain responses preserve the
stored pair for a later normal attempt during Xero's documented grace period.
Invalid grants require reconnect. Internal dormant maintenance runs once per
authorisation at 45 days, including paused active connections.

Tokens are AES-256-GCM encrypted with versioned keys, server-only and excluded
from client payloads/logs. Single-use callbacks, constrained local redirects,
scoped queries and captured external tenant/link identities prevent replay,
substitution and cross-Organisation access. Global grant maintenance is an
internal system operation, never a customer-supplied grant-ID lookup.

## 6. Disconnect and provider-side loss

Owner/admin confirms the target Organisation. Scoped canonical access deletes
that exact `/connections/{id}` before local teardown. Documented 204 or 404
permits local disconnect, optional explicitly requested imported-data cleanup
and audit. Transient or uncertain deletion retains credentials and local state
for safe retry. Actual unresolved leave operations block teardown. Unreferenced
grants are removed; sibling connections and live onboarding references retain
their grant. Manual records and stable feed identities are preserved.

Confirmed provider loss sets `reconnect_required`, disables scheduled/provider
operations and exposes reconnect. Definite grant invalidation affects all grant
consumers; selected-link loss affects only that connection. Reconnect may use
the old still-active user grant solely to prove its old link is absent, even
when payroll access is disabled. It cannot replace a remote link still present.

## 7. Inbound synchronisation

AU employees and V2 leave use paginated `If-Modified-Since` with a two-minute
overlap from the last successful scoped watermark. Full initial, manual and
nightly reconciliation omit that filter. Every page must parse and all relevant
database changes succeed before a CAS advances the watermark to run start.
Provider, parsing, persistence, deferred-write and incomplete-run failures do
not advance it. Deltas never infer absence. Complete successful full reads
archive missing Xero-owned data while preserving manual data and other tenants;
obsolete snapshot thresholds/delays are gone.

Initial import sequences people, leave and the complete balance roster, with
completion tied to its persisted request timestamp. Employee balance retrieval
has no invented modification filter: scheduled polling walks a rolling roster
of 40 people hourly. Malformed employee data is isolated while healthy balances
persist; a failed sweep retains staleness and cannot complete initial import.
Concurrent run admission is atomic under the scoped connection row lock, so
overlapping distinct run IDs cannot both apply snapshots. Business-hours
people/leave cadence remains 15 minutes, hourly outside that
window, with deliberately separate nightly full reconciliation.

## 8. Native idempotent writes

AU submission remains local. Manager approval creates scheduled leave; imported
requested leave uses approve/reject, and eligible remote withdrawal uses reject.
Official OpenAPI supports `Idempotency-Key` on those exact POST operations.
The synchronous journal persists a stable UUID and exact tenant/method/URL/body
identity before dispatch. Retries reuse that identity and key, bounded to four
requests and five minutes from first dispatch, inside Xero's six-minute cache.
Separate logical mutations receive distinct keys. Auth/scope, Retry-After,
correlation IDs, safe parsing and structured errors share the Xero boundary.

Native keys prevent provider duplicates. `OutboundOperation` protects real
approval transitions, competing edits, local effects and uncertainty beyond
provider retention; it is not a parallel OAuth lifecycle. Late ambiguous
outcomes require authoritative provider inspection and administrator recovery,
never a fresh key or background mutation job.

## Provider contract audit

Current official documentation and OpenAPI were checked afresh:

- [Authorisation-code flow](https://developer.xero.com/documentation/guides/oauth2/auth-flow/),
  [token types](https://developer.xero.com/documentation/guides/oauth2/token-types/)
  and [OAuth FAQ](https://developer.xero.com/faq/oauth2): code exchange,
  30-minute access, rotating refresh pairs, 60-day unused-refresh expiry and
  30-minute retry grace after a lost response.
- [Scopes](https://developer.xero.com/documentation/guides/oauth2/scopes/) and
  [official OpenAPI](https://github.com/XeroAPI/Xero-OpenAPI): exact employee,
  Organisation and PayItems permissions; Pay Runs are unused.
- [Connections](https://developer.xero.com/documentation/guides/oauth2/tenants/)
  and [Identity OpenAPI](https://github.com/XeroAPI/Xero-OpenAPI/blob/master/xero-identity.yaml):
  `authEventId`, complete user inventory and exact-link DELETE 204/404.
- [AU employees](https://developer.xero.com/documentation/api/payrollau/employees)
  and [AU leave](https://developer.xero.com/documentation/api/payrollau/leaveapplications):
  supported modification headers, pagination, V2 statuses, employee balances
  and date-only creation, approve/reject request contracts.
- [Idempotency](https://developer.xero.com/documentation/guides/idempotent-requests/idempotency/):
  128-character key ceiling, six-minute retention and identical request replay.
- [Rate limits](https://developer.xero.com/documentation/best-practices/api-call-efficiencies/rate-limits/)
  and [current developer FAQ](https://developer.xero.com/faq): actual tenant/app
  limits, commercial allowances, remaining headers and Retry-After.

Context7 resolved the official Xero OpenAPI library. Fresh raw official
Payroll AU, Identity and Accounting specifications were downloaded to `/tmp`,
not vendored into the repository. No live provider request was used as evidence.

## 9. Fresh verification

All final commands below are fresh; Turbo's `--force` bypasses cache reuse.
Runtime PATH used Bun 1.4.0 from `/workspace/tools/bun`. Integration/release SQL
used the owned local PostgreSQL database `xero_persistence_verified` on port
54329; Redis REST used the owned fixture on port 8079. Fixture guards remained
active and no non-local database was touched.

| Exact command | Outcome |
| --- | --- |
| `bun run check` | Exit 0; 1,155 files, no warnings or fixes |
| `bun run typecheck --force --concurrency=3` | Exit 0; all 19 tasks uncached |
| `bun run boundaries` | Exit 0; 1,084 files in 21 packages |
| `bun run test --force --continue=always --concurrency=2 -- --maxWorkers=2` | Exit 0; 3,045 tests across all 18 uncached tasks |
| `bun run test:integration --force --continue=always --concurrency=2` | Exit 0; 267 tests across six uncached tasks |
| `bun run build --force --concurrency=1` | Exit 0; all four tasks uncached, including Prisma generation |
| `bun run test:release-tools -- --maxWorkers=2` | Exit 0; 196 passed, four Chromium-dependent static-browser skips |
| `bun run typecheck:release-tools` | Exit 0 |
| `prisma migrate deploy` and `prisma migrate status` on a fresh owned database | Exit 0; all 28 migrations applied, schema up to date |
| `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code` | Exit 0; no difference detected |
| Actual PostgreSQL obsolete-table/column/function queries | No obsolete matches; only current lifecycle tables and people matches |
| Additional OAuth/refresh/provider-loss suites | Exit 0; 140 tests across four files |
| Additional corrected HTTP deadline suite | Exit 0; all 56 tests |
| Additional jobs unit and owned integration suites | Exit 0; 190 unit and 82 integration tests |
| `git diff --check` | Exit 0 |

The first full unit attempt exited 1: the stalled-body test's real 30 ms clock
expired before provider dispatch under concurrent load, and an approval suite
could not import a generated Prisma file while the separately running build
regenerated it. No production HTTP or generated source was hand-edited. The
body test now controls time, waits for dispatch, proves the permit remains held,
and retains deadline/dispatched/cancellation/release assertions. The build was
completed before the entire uncached unit command reran; current typecheck and
lint also reran. These failures are recorded rather than omitted.

The production build used the user-supplied development Clerk publishable key
and a temporary randomly generated token-encryption key. No secret file or
validation bypass was added. Optional logging/Web Vitals configuration and
marketing metadata emitted non-fatal build warnings.


## 10. NOT VERIFIED

Managed runtime has Clerk keys but no Xero client ID/secret, registered callback,
development/demo tenant or approved reversible payroll write fixture. Live
OAuth connect, tenant discovery, automatic refresh, read synchronisation,
remote disconnect, reconnect and outbound writes are individually **NOT
VERIFIED**. No live Xero request or mutation was attempted.

Actual application-browser journeys, deployed scheduled-job execution and
Neon-adapter concurrency are **NOT VERIFIED**. Integration tests use owned
loopback PostgreSQL/Redis, not Neon or deployed workers. Four release-tool
static-browser tests are skipped because Chromium is unavailable; they do not
substitute for application/provider journeys. No deployment, push, merge, PR
or production-readiness claim is made.

## 11. Independent review and corrections

Two fresh review contexts audited lifecycle/security and sync/writes/HTTP. A
third fresh context independently reviewed the completed corrections. Three
Important defects were reproduced and corrected with RED/GREEN coverage:

| Verified defect | Correction and evidence |
| --- | --- |
| Different-authoriser reconnect after old provider-link removal was blocked by operational connection status | Resolve only the captured scoped old active grant for inventory proof, using the existing canonical refresh if expired. The integration matrix covers active/reconnect-required state, expiry, stable connection ID and sibling grant retention/pruning. Both original reconnect-required cases failed before correction; all six cases now pass. |
| One malformed employee balance prevented healthy neighbours and later roster pages from progressing | Keep isolated validation failures in failed records, persist healthy balances and advance roster progress while preserving failed-sweep staleness. The new regression failed before correction; all 26 balance unit cases pass. |
| Concurrent distinct sync runs passed the competing-run check and could apply overlapping snapshots | Check, reclaim and admit runs atomically under the existing scoped connection row lock. Real PostgreSQL admitted seven active owners before correction; afterwards twelve concurrent requests yield one active and eleven cancelled, preserving active/terminal duplicate delivery. No new table, provider lock or long transaction is added. |

The independent final correction review reports no Critical, Important or Minor
findings. No minor findings are deferred. The retained-control and residual-name
rulings appear above; live/Neon/browser limits are verification gaps, rather than
fabricated successful review evidence.

Review artifacts and command logs are in `/tmp/xero-final8-*.md` and
`/tmp/xero-final8-*.log`. The durable conclusions and exact gate outcomes are
recorded here and in `tasks/todo.md`.


## Branch and fixture completion

The existing `work` branch and `/workspace/team-calendar` workspace are retained
under the user's earlier option 3. Changes are committed locally; no new
worktree, merge, push, PR or deployment is performed. Owned verification
containers are stopped and the newly created schema-replay database is removed.
The pre-existing owned local integration database is preserved.
