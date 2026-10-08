# Xero HTTP infrastructure simplification, Prompt 7

Baseline: `53a59df1`, branch `work`. This phase continues the approved design
and implementation Tasks 3, 11 and 12 in the existing worktree.

## Result

There remains one shared Xero HTTP boundary. Local quota denial now throws a
structured, undispatched transport error rather than manufacturing a provider
HTTP 429. Payroll callers surface a retryable rate error; if a prior native-key
mutation attempt was ambiguous, the same operation remains outcome unknown.
Actual provider responses retain their status, safe correlation IDs and retry
guidance.

Removed the undocumented 60/minute token/inventory quota and its tenant-style
minute/day accounting. Non-tenant calls conservatively share the app counter as
application policy and honour their provider cooldowns. Redis and development
memory implementations agree. One parser handles `Retry-After`, retries are
bounded to four total requests, invalid attempt counts fail before dispatch,
and the unused caller-supplied concurrency lifetime and dead constants are gone.
Code exchange and refresh grants still make one HTTP request per invocation;
the canonical refresh resolver retains ownership of token recovery.

Removed obsolete `fixture-namespace:` ownership acceptance and the retired
bootstrap-only preflight tests. Updated AGENTS, PRODUCT, README,
ScreenCatalogue, app/API environment examples and stale browser fixture
comments. AGENTS explicitly prohibits credential mirrors, manual token refresh,
asynchronous normal disconnect, behavioural inactivity classification and
speculative provider abstractions.

The old tenant-binding trigger function survived the earlier table deletion.
A narrow forward migration drops it. Its SQL was generated from the exact
PostgreSQL function catalogue identity; Prisma cannot model this standalone
object. Historical migration bytes and generated Prisma output were not edited.

## Components retained and their requirement

| Component | Current requirement |
| --- | --- |
| Small atomic Redis script | App, API and Inngest workers collectively enforce five concurrent requests, 60/minute and commercial-tier daily tenant quotas, plus the 10,000/minute app ceiling. Process-local admission would not protect shared external tenants. |
| Expiring concurrency slots | Release after response/body completion, and recover capacity after worker termination. No lifecycle cleanup lease, durable claim or campaign control plane is introduced. |
| Fixture namespace override | Owned Redis integration isolation and cleanup only. No deployment namespace, epoch, sentinel, bootstrap or topology proof. |
| One-field absolute deadline and short transaction budgets | Bound the current HTTP/retry/admission/body-read operation and token grant database locks. |
| Five MiB response limit | Bound fully buffered provider data held by serverless workers; oversized or stalled responses cannot be treated as confirmed successful writes. |
| Origin allowlist and redirect rejection | Prevent bearer/basic credentials reaching an unapproved host. |
| Response headers, 429, backoff and correlation metrics | Follow actual Xero retry guidance, lower remaining quotas conservatively and diagnose failures without logging credentials or raw response bodies. |
| Plan 160 journal and recovery | Preserve genuine approval transitions and resolution after native idempotency retention; outbound writes remain synchronous and user-triggered. |
| Generic release ownership and database guards | Protect scoped fixtures and non-local targets; independent provider/browser assertions prove useful user flows rather than an obsolete Xero campaign. |

Plan 161/163 plans, campaign/evidence collectors, credential-owner and cleanup
scripts, namespace bootstrap, backfills and runtime interception were already
absent at the baseline. This phase audited their remaining consumers rather
than recreating or claiming to delete them again. Current executable-source
searches exclude immutable historical migrations and generated output; no
retired lifecycle/bootstrap/campaign dependency remains.

## Provider verification

Context7 resolved the official Xero libraries; its rate-limit queries returned
no matching material. Current official documentation was verified through web
search before changing quota assumptions:

- [Xero rate limits](https://developer.xero.com/documentation/best-practices/api-call-efficiencies/rate-limits/): per-tenant concurrency/minute/day limits, app minute limit, remaining headers and `Retry-After`.
- [Xero developer FAQ](https://developer.xero.com/faq): current Starter daily allowance of 1,000 and higher-tier allowance of 5,000.

No documented token/inventory-specific 60/minute quota was established. No live
provider request or mutation was made.

## Verification

| Gate | Result |
| --- | --- |
| Targeted HTTP/classification units | 134 passed across seven files |
| Real Redis quota suite | 12 passed, including two independent-client non-tenant regressions |
| Real PostgreSQL schema suite | Five passed, including absence of the orphaned function |
| `bun run check` | 1,155 files passed, no warnings |
| `bun run typecheck --force --concurrency=3` | 19/19 tasks passed, uncached |
| `bun run boundaries` | 1,084 files in 21 packages passed |
| `bun run test` | 3,044 passed across 18 tasks; affected tasks reran after deleting two obsolete tests |
| `bun run test:integration --continue=always --concurrency=2` | 262 passed across six uncached tasks |
| `bun run build --force --concurrency=1` | Four uncached tasks passed: Prisma generation, web, API and app |
| Release-tool tests | 196 passed, four existing Chromium-dependent static-browser tests skipped |
| Release-tool typecheck | Passed |
| Fresh migration replay and schema diff | All 28 migrations applied; no difference detected |
| Independent code review | No Critical, Important or Minor findings |

All 18 unit tasks initially ran uncached and passed 3,046 tests. The final
current-source run passed 3,044, reusing 16 valid task results and rerunning
the two changed packages. Typecheck initially passed all 19 tasks uncached;
the final current-source check also passed all 19 (six rerun, 13 valid cached).
The final lint check passed without warnings. No unit or integration test was
skipped.

TDD evidence: local response distinction and non-tenant memory cases failed
four assertions before implementation; invalid attempt/bounded read cases
failed three assertions before correction. The two non-tenant Redis cases also
failed against the original Lua script and passed with the correction. The
real schema regression failed on the surviving binding function before the
forward migration, then passed. Obsolete fixture authority rejection failed
before deletion and passed afterwards. Existing valid preflight coverage
remains after deleting two architecture-only tests.

Integration targets were owned loopback PostgreSQL on port 54329 and Redis REST
on port 8079. The release-tool SQL test ran against that same local database;
the four skipped checks require Chromium and test controlled static HTML,
not live application or Xero flows. Production builds used the user-supplied
development Clerk publishable key and a randomly generated temporary token
encryption key. No secret file, provider credential or validation bypass was
added. Missing optional observability settings emitted warnings without build
failure.

Full command logs and review are in `/tmp/xero-phase7-*.log` and
`/tmp/xero-phase7-final-review.md`. Live Xero, application-browser and deployment
verification remain NOT VERIFIED. No deployment, merge, push or new worktree
was performed.
