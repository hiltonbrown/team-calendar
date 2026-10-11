# Tenant database round trips: options

Status: open for decision
Date: 11 October 2026
Context: review finding 9 on PR #139 (multi-company tenancy with row-level security)

## Summary

Every `tenantDatabase(clerkOrgId)` query now costs four database statements instead of one. On local PostgreSQL that makes a single query about 2.3 times slower; on Neon the penalty scales with network round-trip time and has not been measured.

Recommendation: measure on a Neon preview branch first (Option H). If the overhead is material, combine Option A (cheap local wins) with Option C, an opt-in request-scoped tenant transaction for sequential, query-heavy paths. Parallel fan-out reads stay on the current per-query model. Reject Options D, E and G because they weaken or cannot preserve the row-level security guarantees. Keep Option F in reserve for the public ICS feed endpoint only.

## Current design

`packages/database/src/tenant-client.ts` provides two entry points:

- `tenantDatabase(clerkOrgId)` returns a Prisma client extended with a `$allOperations` hook. Each operation runs as a batch transaction: `SELECT set_config('app.clerk_org_id', $1, true)` followed by the query.
- `tenantTransaction(clerkOrgId, fn, options)` opens an interactive transaction, sets the same transaction-local setting once, then runs `fn(tx)`.

Row-level security policies in `20261010000000_row_level_security` read `current_setting('app.clerk_org_id', true)` (56 references). With no setting, access is denied.

The design is deliberately safe: the setting is transaction-local (`is_local = true`), so it cannot leak to another request through a pooled connection.

### Usage

| Measure | Count |
|---|---|
| `tenantDatabase(` call sites (production code) | 378 across 109 files |
| `tenantTransaction(` call sites (production code) | 60 |
| Heaviest files | `sync-monitor-service.ts` (25), `approval-service.ts` (17), `people-service.ts` (13), `current-user-service.ts` (11) |

## Measured cost

Measured on 11 October 2026 against local PostgreSQL 16 with `log_statement=all`, using the real `tenantDatabase` and `tenantTransaction` helpers through `@prisma/adapter-pg` (the adapter used for local URLs). Production uses `@prisma/adapter-neon` over WebSocket; the statement sequence is expected to match but has not been captured on Neon.

| Pattern | Statements sent |
|---|---|
| Plain query (owner client, no RLS context) | 1: query |
| One `tenantDatabase` query | 4: `BEGIN`, `set_config`, query, `COMMIT` |
| Three `tenantDatabase` queries in `Promise.all` | 12, spread over three connections in parallel |
| Three queries inside one `tenantTransaction` | 6: `BEGIN`, `set_config`, three queries, `COMMIT` |

Timing over 100 sequential queries on loopback: 2.79 ms per tenant query against 1.19 ms per plain query.

Each statement waits for the previous one, so a tenant query costs roughly four round trips rather than one. Approximate added latency per query is three round trips. The real Neon round-trip time from Vercel is the missing input; it decides whether this matters.

### Two shapes of workload

The trade-off differs by access pattern:

- **Sequential chains** (await one query, then the next): per-query costs `4n` round trips; one shared transaction costs `n + 3`. The shared transaction wins clearly.
- **Parallel fan-out** (`Promise.all` of `n` reads): per-query costs about 4 round trips of wall time but uses `n` connections; one shared transaction runs them one after another on a single connection, costing about `n + 3`. Per-query wins on wall time once `n` exceeds one.

Any option that forces every query into one transaction will slow down the parallel fan-outs already in the code (for example `recount-usage.ts`, `getFeedOversightCounts`, `sync-monitor-service.ts`).

## Invariants every option must keep

1. Tenant context is never visible to another request, including through a pooled connection.
2. A query without tenant context is denied by RLS, not silently unfiltered.
3. Explicit `clerk_org_id` and `organisation_id` filters remain in application queries (defence in depth, per `AGENTS.md`).
4. Background jobs keep carrying both tenancy keys in their payloads; no reliance on session state.
5. The restricted `team_calendar_app` role keeps no `BYPASSRLS`, superuser or table ownership.

## Options

### Option A: Keep per-query transactions, take cheap local wins

Keep the current model and remove avoidable overhead:

- Memoise the extended client per `clerkOrgId` (a small LRU) instead of calling `$extends` on every `tenantDatabase()` call. This saves CPU and allocation, not round trips.
- Where one function issues several sequential tenant queries, wrap them in a single `tenantTransaction`. Candidates: the 25 calls in `sync-monitor-service.ts` and the 17 in `approval-service.ts`, where they are sequential.
- Leave genuine parallel fan-outs alone.

| | |
|---|---|
| Round trips saved | Moderate, only where consolidated |
| Security risk | None; mechanism unchanged |
| Effort | Small to medium; file-by-file |
| Reversibility | Trivial |
| Main drawback | Relies on developers noticing sequential chains; no structural guarantee |

### Option B: One tenant transaction per request or job step, everywhere

Wrap every server action, route handler, page render and Inngest step in `tenantTransaction`, and pass `tx` down explicitly.

| | |
|---|---|
| Round trips saved | Highest for sequential code |
| Security risk | Low; still transaction-local |
| Effort | Very large: signatures change across 109 files |
| Reversibility | Hard |
| Main drawbacks | Holds one pooled connection for the whole request, including while rendering or calling Xero; parallel fan-outs become serial; interactive-transaction timeouts (5 s default) apply to whole requests; errors roll back reads and writes together, which changes write semantics; React Server Components render in parallel and do not map cleanly to one transaction |

Not recommended as a blanket change.

### Option C: Opt-in request-scoped tenant transaction (ambient)

Add a scope helper that opens one tenant transaction and makes `tenantDatabase()` reuse it automatically through `AsyncLocalStorage`, so call sites do not change:

```ts
const tenantScope = new AsyncLocalStorage<{
  clerkOrgId: string;
  tx: Prisma.TransactionClient;
}>();

export const withTenantScope = <T>(
  clerkOrgId: string,
  fn: () => Promise<T>,
  options?: TenantTransactionOptions
): Promise<T> =>
  tenantTransaction(
    clerkOrgId,
    (tx) => tenantScope.run({ clerkOrgId, tx }, fn),
    options
  );

// Inside tenantDatabase(clerkOrgId):
const scope = tenantScope.getStore();
if (scope?.clerkOrgId === clerkOrgId) {
  return scope.tx; // already carries this tenant's context
}
// otherwise fall back to the per-query batch transaction
```

Adopt it only on measured hot paths with sequential chains (for example sync monitor, approvals, people pages). Everything else keeps the current behaviour.

Design questions inside this option:

- A mismatched `clerkOrgId` inside a scope: fall back to a per-query transaction (safe, as it is a separate connection with its own context) or throw (stricter, catches bugs). Throwing is the safer default.
- `Promise.all` inside a scope runs serially on one connection. Hot paths that fan out should stay outside the scope or be measured both ways.
- Writes inside a scope become atomic with the surrounding reads. Scope read-mostly paths first; review any write path before wrapping it.
- `AsyncLocalStorage` works in the Node.js runtime (Vercel functions and Inngest handlers). Confirm no tenant query runs on the Edge runtime.

| | |
|---|---|
| Round trips saved | High on adopted paths |
| Security risk | Low; context stays transaction-local. The new risk is a scope reused for the wrong tenant, handled by the mismatch rule above |
| Effort | Small core change plus incremental adoption |
| Reversibility | Easy; remove the wrapper from a path |
| Main drawback | Two execution modes to reason about; needs tests proving the scope never crosses tenants |

### Option D: Session-level setting once per connection

Set `app.clerk_org_id` without `is_local` when a connection is checked out and reset it on release.

Rejected. The tenant changes per query, not per connection, so this needs a checkout per tenant and a guaranteed reset. Prisma driver adapters do not expose a checkout hook for this, and a missed reset leaks one tenant's context to the next request. Neon's pooled endpoint runs PgBouncer in transaction mode, where session state is not reliable. This breaks invariant 1.

### Option E: Per-tenant connection pools with a startup parameter

Open a pool per tenant with `options=-c app.clerk_org_id=...`, so every connection carries its tenant from startup.

Rejected. Pool count grows with the number of accounts, which does not fit serverless connection limits. Support for custom startup parameters through Neon's pooler is NOT VERIFIED. It also complicates the restricted-role preflight.

### Option F: Neon HTTP non-interactive transactions for selected reads

`@neondatabase/serverless` 1.1.0 (installed) provides `sql.transaction([...])`, which submits several statements as one non-interactive transaction in a single HTTP request. `set_config` plus the query would then cost one network round trip.

Constraint (verified in `@prisma/adapter-neon` 7.10.0): `PrismaNeonHttp.startTransaction()` rejects with "Transactions are not supported in HTTP mode". This path is therefore not available through Prisma; it needs raw SQL and Zod-validated results outside the Prisma client.

| | |
|---|---|
| Round trips saved | Highest per query (one request) |
| Security risk | Low if the setting stays in the same transaction; new raw-SQL surface needs review |
| Effort | Medium per endpoint; a second data-access path to maintain |
| Main drawback | Loses Prisma types and query building; does not work for local `PrismaPg` without a second implementation |

Keep in reserve for the public `GET /ical/:token.ics` endpoint, if feed latency proves to be the bottleneck after caching.

### Option G: Drop RLS on hot read paths and rely on application filters

Rejected. It removes the defence-in-depth the PR introduced and reopens cross-tenant exposure on exactly the busiest paths.

### Option H: Measure before deciding

Add query timing (Prisma query events or the existing Sentry tracing) on a Neon preview branch using the restricted `team_calendar_app` role, then capture:

- Round-trip time from a Vercel function in the production region to Neon.
- Tenant queries per request for the calendar, people, approvals and sync pages, and per Inngest sync step.
- p50 and p95 request latency with the current model.

Suggested decision rule: if the tenant-context overhead (three round trips times queries on the critical path) exceeds about 10% of p95 latency on any core page, proceed with Option C on that page. Otherwise take Option A's cheap wins and stop.

This also closes the PR's own open item: "Neon preview RLS/latency remain NOT VERIFIED".

## Comparison

| Option | Round trips saved | Security | Effort | Reversible | Verdict |
|---|---|---|---|---|---|
| A. Cheap local wins | Moderate | Unchanged | Small | Yes | Do |
| B. Transaction per request | Highest (sequential) | Unchanged | Very large | Hard | Avoid as a blanket change |
| C. Opt-in ambient scope | High where adopted | Unchanged, plus a scope-mismatch rule | Small core, incremental | Yes | Recommended for hot paths |
| D. Session-level setting | High | Breaks invariant 1 | Medium | Yes | Reject |
| E. Per-tenant pools | High | Unverified | Large | Medium | Reject |
| F. Neon HTTP transaction | Highest per query | Needs raw-SQL review | Medium per endpoint | Yes | Reserve for ICS feed |
| G. Drop RLS on reads | Highest | Regression | Small | Yes | Reject |
| H. Measure first | None directly | None | Small | Yes | Do first |

## Proposed sequence

1. **Measure (H).** Instrument a Neon preview branch and record the figures above.
2. **Cheap wins (A).** Memoise the extended client and consolidate obvious sequential chains into existing `tenantTransaction` calls.
3. **Decide on C.** If step 1 shows material overhead, add `withTenantScope` with tests, then adopt it on the worst pages one at a time, measuring each.
4. **Revisit F** only if the ICS feed endpoint misses its latency target after caching.

## Tests any change needs

- Cross-tenant isolation: a scope for account A never returns account B rows, including under concurrent requests (extend the restricted-role integration suites).
- Context absence: a query with no scope and no per-query context is denied by RLS.
- Mismatch handling: `tenantDatabase(B)` inside a scope for A follows the chosen rule (throw or fall back).
- No leakage: after a scope ends, a later query on the same pooled connection has no `app.clerk_org_id`.
- Statement counts: assert the expected count per pattern with `log_statement` or Prisma query events, so regressions are visible.

## Decisions needed

1. Approve measuring on a Neon preview branch first (Option H)?
2. Accept Option A's cheap wins regardless of the measurement?
3. If overhead is material, adopt Option C? If so, should a tenant mismatch inside a scope throw (recommended) or fall back?
4. Should write paths ever run inside an ambient scope, or should it be read-only by policy?
5. Is a raw-SQL HTTP path (Option F) acceptable for the ICS feed endpoint if needed later?
