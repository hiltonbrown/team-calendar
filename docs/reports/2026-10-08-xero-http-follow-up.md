# Xero HTTP simplification follow-up, Prompt 7

Baseline: `47c75872`, branch `work`, existing worktree. The original phase-7
implementation is committed at `e5fe001f`; this check closes verified remaining
gaps without restarting the lifecycle design.

## Changes

A genuine provider 429 previously became a transport failure if its response
body stalled or exceeded the size cap. This discarded retry/correlation headers
and could misclassify a rejected payroll mutation as an unknown outcome.

The single `xeroFetch` boundary now records genuine 429 guidance before reading
the bounded body, observes it exactly once, and preserves rejection headers when
the body cannot be read. A later rejection still cannot erase uncertainty from
an earlier mutation attempt. No new state, retry algorithm or provider boundary
was introduced.

Removed obsolete campaign-environment setup from the ordinary provider-snapshot
test, renamed three `161g` test groups around their supported behaviour, and
removed PRODUCT's unsupported backfill-job instruction. All useful provider
failure and Plan 160 recovery assertions remain. AGENTS, PRODUCT and README now
describe authoritative throttling with unreadable bodies. ScreenCatalogue and
environment documentation already describe the supported flows and settings;
no UI, environment variable or lifecycle flag changed.

The obsolete Plan 161 plans, source-integrity/evidence campaigns, credential
scripts, cleanup workers, backfills and runtime interception were already
removed. Current executable/documentation searches find no remaining `161g`,
`TC_XERO_MANIFEST`, obsolete admission flags or campaign/source-integrity
dependency. Historical migration bytes and dated replacement/audit records are
retained under repository conventions; they do not restore dead schema or an
alternative supported architecture.

## Retained controls and current requirements

| Control | Requirement |
| --- | --- |
| Small atomic Redis admission script | App, API and Inngest workers share tenant concurrency and quota limits. Process-local counters cannot enforce them collectively. |
| Expiring concurrency slots | Hold capacity through response/body completion; recover it after worker termination. No lifecycle cleanup leases or durable claims. |
| Fixed key prefix and fixture-only namespace override | Separate provider apps/tenants and owned integration fixtures. No credential-domain sentinels, epochs, bootstrap or topology proof. |
| One-field deadline and bounded database operations | Bound actual HTTP admission, retries/body reads and canonical token-grant locks. |
| Five MiB response cap, allowed origins and rejected redirects | Bound buffered worker data and prevent credential disclosure. |
| Provider headers, Retry-After, bounded backoff and correlation metrics | Honour actual provider responses without synthetic HTTP status or secret logging. |
| Plan 160 journal and generic fixture safeguards | Preserve synchronous business transitions and safe owned verification. No outbound jobs or Xero campaign control plane. |

Current [official Xero rate-limit documentation](https://developer.xero.com/documentation/best-practices/api-call-efficiencies/rate-limits/)
confirms five concurrent requests, 60/minute per tenant, the 10,000/minute app
ceiling, remaining headers and rejection guidance. The
[official developer FAQ](https://developer.xero.com/faq) confirms 1,000/day on
Starter and 5,000/day on higher tiers. These were rechecked on 8 October 2026;
Context7 was consulted but returned no matching rate-limit content.

## Verification

All commands below completed with exit 0. Build/Prisma generation completed
before commands importing generated source.

| Command | Outcome |
| --- | --- |
| Targeted Xero HTTP, AU read/write and adapter tests | 273 passed across 10 files |
| `bun run check` | 1,155 files passed |
| `bun run typecheck --force --concurrency=3` | 19 uncached tasks passed |
| `bun run boundaries` | 1,084 files in 21 packages passed |
| `bun run test --force --continue=always --concurrency=2 -- --maxWorkers=2` | 3,058 tests, 18 uncached tasks passed |
| `bun run test:integration --force --continue=always --concurrency=2` | 273 tests, six uncached tasks passed |
| `bun run build --force --concurrency=1` | All four uncached tasks passed, including Prisma generation |
| `bun run test:release-tools` | 196 passed; four existing Chromium-dependent static-browser tests skipped |
| `bun run typecheck:release-tools` | Passed |

Four regressions failed before the transport fix and passed afterward. They
cover oversized/stalled 429 bodies, early shared cooldown, retained correlation
IDs, initial throttling without write recovery, and earlier ambiguous-write
protection. The first broader targeted run exposed an oversized test fixture:
zero remaining calls against a million-call helper filled a million-entry
memory window. The test now uses actual Xero limits, keeps every assertion and
passes the complete targeted command. This changes no production policy.

Fresh independent HTTP and documentation/fixture reviews have no remaining
Critical, Important or Minor findings. Logs and review evidence are in
`/tmp/p7-repeat-*.log` and `/tmp/p7-repeat-*-review.md`. Integration and release
SQL tests used only owned loopback PostgreSQL/Redis. Builds used the previously
authorised development Clerk key and an ephemeral encryption key.

Live Xero, authenticated application-browser journeys, deployed worker behavior
and Neon-adapter concurrency remain **NOT VERIFIED**. No live provider operation,
production database change or migration change was performed.
