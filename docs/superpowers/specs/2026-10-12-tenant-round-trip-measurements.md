# Tenant round-trip measurements

Updated: 21 October 2026
Status: PrismaNeon correctness and developer-host diagnostics PASS; representative Vercel page and job measurements NOT VERIFIED.
Plan: [Multi-company leave outcomes and request transactions](../plans/2026-10-12-tenant-transaction-per-request.md), Tasks 0.1, 0.2 and Stage 7.

## Verified prerequisites

The owner directed use of the database configured in `.env.local`. Neither a new Neon branch nor a Neon API key is required. The authorised development reset applied all 41 migrations from scratch. Catalogue checks verified the restricted `team_calendar_app` login, 29 tenant-table RLS policies/grants, no elevated membership or ownership, and transaction-context cleanup. Feature-branch app/API Preview database variables are configured. Implementation CI passed at `5c9cb42`, including the PrismaPg statement-count and RLS integration suites ([CI run](https://github.com/hiltonbrown/team-calendar/actions/runs/39534951518)).

Read-only inventory at 03:22 UTC found one company, no multi-company accounts, zero active people, zero stored Xero grants, zero Xero connections and zero approved records. This supersedes earlier missing-role and branch-provisioning notes; it is not a populated acceptance fixture.

## Actual PrismaNeon diagnostics

Executed on 21 October 2026, final sample at 03:20:10 UTC, from the developer host to the configured pooled Neon endpoint in `ap-southeast-2`, using `DATABASE_APP_URL` as `team_calendar_app`. Driver: `@neondatabase/serverless` 1.1.0; adapter: `@prisma/adapter-neon` 7.10.0. These are not Vercel-region results. All operations were reads or transaction-local context changes; there were zero application-data writes.

| Diagnostic | Result |
|---|---|
| Initial connection plus first `SELECT 1` | 170.27 ms, one observation, not a guaranteed cold start |
| Warm `SELECT 1`, 20 samples | p50 21.06 ms, p95 25.22 ms; one driver statement per sample |
| Effective adapter pool maximum | 10, inspected on the actual underlying pool |
| PostgreSQL `max_connections` | 112 |
| Runtime role `rolconnlimit` | -1, no role-specific limit |
| PgBouncer frontend connection limit | NOT VERIFIED; neither value above establishes it |
| Concurrent-query correctness | PASS: three different queries returned 11, 22 and 33 with the expected tenant context, one PostgreSQL backend and one driver connection |
| Context after commit and rollback | PASS: missing/empty context; no-context company read returned zero |

The concurrency assertion used `Promise.all` inside one PrismaNeon interactive transaction. Each probe included `pg_sleep(0.02)` and checked its result/context/backend. The recorder observed six driver statements, sent sequentially:

| Driver call | Start ms | Completion ms |
|---|---:|---:|
| BEGIN | 0.00 | 21.12 |
| transaction-local `set_config` | 23.36 | 44.63 |
| alpha | 46.54 | 85.05 |
| beta | 85.27 | 124.86 |
| gamma | 125.19 | 164.11 |
| COMMIT | 165.45 | 185.49 |

This closes Task 0.2 Step 4 for the installed PrismaNeon/driver versions and configured endpoint. No concurrency errors were observed, so there is no evidence-based requirement to remove every service-level `Promise.all` for driver compatibility.

## Bounded access-pattern comparison

Each sample read scoped organisation, person and availability-record counts for an absent account; each returned three zeros. After warming three pool connections, each pattern ran 20 times. Counts include BEGIN, context and COMMIT. These are diagnostic model queries, not named production loaders or historical deployed page measurements.

| Pattern | Statements | p50 ms | p95 ms |
|---|---:|---:|---:|
| Three awaited queries, one transaction | 6 | 142.47 | 151.84 |
| Three `Promise.all` queries, one transaction | 6 | 145.89 | 153.48 |
| Three independent transactions, parallel | 12 | 97.87 | 132.89 |
| Three independent transactions, serial (historical per-query emulation) | 12 | 355.92 | 466.68 |

Parallel branches used twice as many statements and up to three connections. Their lower wall time in this bounded diagnostic does not establish a safe or beneficial split for any Task 2.3 production loader. The historical emulation is not a before measurement of the old application.

The decision rule is `overhead = 3 × round-trip time × tenant queries on the critical path`, compared with `0.10 × page p95`. Using the diagnostic warm median only gives `3 × 21.06 = 63.18 ms` of estimated per-query transaction overhead. Three serial per-query wrappers estimate 189.54 ms total control overhead; one wrapper estimates 63.18 ms. This is a model, not a measured page saving. Actual Vercel RTT, page p95 and each loader's critical-path queries are still missing, so the required page decision cannot be made from these figures.

Keep `TENANT_FAN_OUT_ENTRY_POINTS` empty until the named, representative loader comparisons justify individual entries. Do not split or register production loaders based on the generic three-count comparison. Gate 0 remains the owner's approval to proceed without the original performance evidence, not performance proof.

## Remaining measurements

| Required evidence | Status |
|---|---|
| Vercel execution region and Vercel-to-Neon RTT | NOT VERIFIED |
| Calendar, People, approvals, sync, Dashboard and settings loader statement counts and page p50/p95 | NOT VERIFIED |
| Each database-bearing Inngest step's statement count and wall time | NOT VERIFIED |
| Each named Task 2.3 loader, parallel versus one transaction, including result equivalence | NOT VERIFIED |
| Historical populated application before/after figures | NOT VERIFIED; bounded emulation above is not a replacement |
| Actual pooled-endpoint frontend connection limit | NOT VERIFIED |

A direct operational import probe for approval and sync services failed before any database calls: under Bun's `react-server` condition, a transitive React client dependency attempted unavailable `React.createContext`. One normal-Bun attempt, stubbing only the `server-only` build marker in this server-side process, also stopped on a transitive Server Component import restriction. No data, auth or provider results were mocked, and no database test guard or `NODE_ENV` classification was changed. These import failures do not indicate a database or deployed application failure. Named loader measurements remain unexecuted and belong in the running application, with an authenticated, populated account. Absent-account early returns cannot establish representative acceptance or query costs.

The opt-in instrumentation counts actual driver calls, including BEGIN, rather than Prisma query events. Wrap each named loader or job step in `withTenantQueryTiming(operation, fn)` with `TENANT_QUERY_TIMING=1`; the flag alone adds no scopes. Logs contain only fixed operation labels, statement counts, summed driver duration and wall time, never SQL, parameters, URLs, secrets or account IDs. Parallel summed database duration can exceed wall time. Remove temporary measurement wrappers after collecting the required samples.

## Reproduction

The executed read-only operational diagnostic is retained locally, without credentials:

```sh
bun --no-env-file /tmp/teamcalendar-stage7-20261021-NuLvbo/neon-measurements.ts
node /tmp/teamcalendar-stage7-20261021-NuLvbo/inspect-database.mjs --acceptance
```

The diagnostic reads the ignored root `.env.local`, uses the existing restricted runtime URL, and records driver start/completion times. The scripts are session-local evidence, not committed release tooling. It directly uses the production PrismaNeon adapter, not a test runner or a fabricated live-test manifest.

For the existing localhost-only PrismaPg integration suite:

```sh
ALLOW_LOCAL_DATABASE_TESTS=1 bunx vitest run --config packages/database/vitest.config.mts packages/database/tenant-statement-counts.integration.test.ts
```

`ALLOW_LOCAL_DATABASE_TESTS` does not authorise a remote integration test. Existing live-test and fixture guards remain unchanged.
