# Tenant round-trip measurements

Date: 12 October 2026
Status: Stage 7 access rechecked on 21 October 2026; database and Neon measurements NOT VERIFIED.
Plan: [Multi-company leave outcomes and request transactions](../plans/2026-10-12-tenant-transaction-per-request.md), Tasks 0.1 and 0.2.

## Evidence available

The statement recorder observes real `pg.Pool` client calls through `PrismaPg`, including transaction control statements. After Stage 6 removed the per-query helpers, the integration suite exercises the production request-scoped tenant core. It asserts one plain statement, four statements for one tenant query, and six statements for three queries sharing a transaction. It also checks correct results and tenant context, one connection and sequential execution when the transaction receives three concurrent queries. These PrismaPg assertions do not establish PrismaNeon behaviour.

These are assertions to verify, not measurements from this run. All four database tests are currently blocked by sandbox `connect EPERM` on the existing local PostgreSQL service at localhost:5432. No disposable or external database was created. The options spec's earlier local figures are historical evidence only.

The opt-in timing uses driver calls rather than Prisma query events, because Prisma's query events omit the adapter's `BEGIN`. It is disabled unless `TENANT_QUERY_TIMING=1`. Label a loader or one Inngest step with the exported `withTenantQueryTiming(operation, fn)` helper. The flag alone does not add measurement scopes to existing entry points. The measurement scope holds counters only, never a database client.

Each scope logs `tenant_query_timing` through `@repo/observability/log`, with `operation`, `statement_count`, `database_duration_ms` and `wall_time_ms`. Duration is summed across driver calls, including failures; wall time measures the complete labelled operation, so parallel database duration can exceed wall time. Operation labels must be fixed descriptive names, never user data. SQL text, parameters, URLs and account IDs are excluded. Logging failures cannot change the operation's result or error.

## Measurements still required

| Measurement | Before | After |
|---|---|---|
| Vercel region and Neon preview branch identity | NOT VERIFIED | Pending Stage 7 |
| Restricted `team_calendar_app` role | NOT VERIFIED | Pending Stage 7 |
| Vercel to Neon round-trip time | NOT VERIFIED | Pending Stage 7 |
| Calendar, People, approvals, sync, Dashboard and settings statement counts | NOT VERIFIED | Pending Stage 7 |
| Each database-bearing Inngest step's statement count and wall time | NOT VERIFIED | Pending Stage 7 |
| Page p50 and p95 latency | NOT VERIFIED | Pending Stage 7 |
| Effective PrismaNeon pool size and pooled endpoint connection limit | NOT VERIFIED | Pending Stage 7 |
| Each Task 2.3 loader: parallel versus one-transaction wall time | NOT VERIFIED | Pending Stage 7 |
| PrismaNeon concurrent-query correctness and serialisation | NOT VERIFIED | Pending Stage 7 |

The 21 October Stage 7 inspection confirms that the feature-branch app and API previews are READY at implementation commit `c2a3a60120e6ee4a1c446b17325a678e3d97bcb9`. Their project database bindings still reference the same store across Development, Preview and Production, with no feature-branch database override or `DATABASE_APP_URL`. Local files contain a shared owner connection, but no Neon API credential; the local Neon configuration directory is empty. Isolated branch provisioning remains unavailable. Both preflight entry points fail with current branch Preview variables, before the restricted-role catalogue check. No Neon measurement or provider acceptance was executed. See [Stage 7 review](../../../tasks/todo.md#stage-7-review-21-october-2026) for deployment identities, command details and remaining dependencies. Local PostgreSQL cannot establish production-region latency, pool capacity or PrismaNeon concurrency behaviour.

## Reproduction and decision

The owner subsequently directed Stage 7 to use the database configured in
`.env.local`; an isolated branch and Neon API key are not prerequisites. On
21 October all 41 migrations were recorded and the restricted runtime role was
provisioned on that database. Read-only checks passed for all 29 tenant-table
policies/grants, runtime-role restrictions, scoped reads, no-context denial and
transaction-context cleanup. Feature-branch app/API Preview database variables
are configured for subsequent deployments. This supersedes the branch and
runtime-role setup findings above, but supplies no Vercel-region latency,
PrismaNeon performance, provider or four-role acceptance evidence. Those
measurement values remain NOT VERIFIED. The actual database has one company,
zero active staff and zero active Xero connections.

On a host with access to the existing local test database, run from the repository root:

```sh
ALLOW_LOCAL_DATABASE_TESTS=1 bunx vitest run --config packages/database/vitest.config.mts packages/database/tenant-statement-counts.integration.test.ts
```

Supply `DATABASE_APP_URL` (preferred) or a local `DATABASE_URL`. This suite makes read-only queries and uses the existing live-test connection guard. A remote URL is not authorised by `ALLOW_LOCAL_DATABASE_TESTS`.

On an authorised Neon preview deployment in the production Vercel region, enable timing, wrap the named request loaders and Inngest steps, record representative samples, and remove the temporary wrappers after measurement. Repeat the concurrent-query assertion with PrismaNeon. Compare each registered fan-out loader with a temporary uncommitted serial transaction patch. Record pool configuration and the endpoint's actual connection limit rather than assuming defaults.

The decision rule is `overhead = 3 × round-trip time × tenant queries on the critical path`, compared with `0.10 × page p95`. A statement total across parallel branches is not the critical-path query count. The required inputs are unknown, so this document cannot recommend proceeding with the refactor on measured performance grounds.

Gate 0 was approved by the owner, who explicitly chose to proceed with Stage 1 despite the missing Neon measurements and blocked database integration. The measurements remain NOT VERIFIED; approval does not establish measured performance or live isolation evidence.
