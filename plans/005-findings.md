# Scheduled Xero sync spike findings

## Fan-out query

Use `xeroTenant.findMany`, making the tenant row the source of the emitted
`clerkOrgId`, `organisationId`, and `xeroTenantId`. The relation is traversed
from `XeroTenant` to `XeroConnection`, so the tenant is selected through its
own `organisation_id` foreign key, not by a bare `clerk_org_id` lookup:

```ts
const eligibleTenants = await database.xeroTenant.findMany({
  where: {
    sync_paused_at: null,
    xero_connection: {
      is: {
        disconnected_at: null,
        refresh_token_encrypted: { not: "" },
        revoked_at: null,
        stale_since: null,
        status: "active",
      },
    },
  },
  select: {
    clerk_org_id: true,
    id: true,
    organisation_id: true,
  },
});
```

The eligibility predicate is: an unpaused tenant whose linked connection is
active, has a refresh token, and is neither disconnected, revoked, nor marked
stale. `XeroConnection.organisation_id` is unique and `XeroTenant` stores both
`organisation_id` and `xero_connection_id`; the emitted tuple must use the
selected tenant's `organisation_id` and `id`.

There is no reusable enumeration helper. `hasActiveXeroConnection` in
`packages/availability/src/xero-connection-state.ts` accepts an already-known
Clerk organisation and organisation ID, returns a boolean, and does not filter
`stale_since` or `sync_paused_at`; it cannot provide cron fan-out.

## Rate-limit budget

The following is the steady-state Xero read cost, excluding a conditional token
refresh request. AU is the only region with people, leave-record, and balance
reads implemented. NZ and UK currently return before those reads. The request
counts come from the AU read loops in `packages/xero/src/au/read.ts`:

| Sync type | Request pattern | 50 people | 500 people | 2,000 people |
| --- | --- | ---: | ---: | ---: |
| People | Paginated `Employees`; it makes an additional empty-page request for exact multiples of 100: `floor(N / 100) + 1` | 1 | 6 | 21 |
| Leave records | Paginated `LeaveApplications`: `floor(L / 100) + 1`, where `L` is leave applications, not people | Cannot be derived from headcount | Cannot be derived from headcount | Cannot be derived from headcount |
| Leave balances | One `Employees/:id` request per employee | 50 | 500 | 2,000 |
| Approval reconciliation | One `LeaveApplications/:id` request per eligible active record, sequentially: `R` | Cannot be derived from headcount | Cannot be derived from headcount | Cannot be derived from headcount |

For a sizing comparison only, if a tenant has one leave application or
reconciliation candidate per employee, the leave-record and reconciliation
rows would be 1, 6, 21 and 50, 500, 2,000 respectively. That assumption is not
safe for production capacity planning: neither candidate set is date-bounded.

The PRODUCT.md cadence does **not** fit the 5,000-call daily budget for every
organisation size. Leave balances alone are hourly, therefore `24 × N` calls
per day: 1,200 for 50 people, 12,000 for 500, and 48,000 for 2,000. The 500- and
2,000-person cases exceed the per-org limit before any 15-minute incremental
people or leave-record syncs, or nightly reconciliation, are counted. The
answer is **no**.

The limiter keys its `orgStates` and concurrency maps by `orgKey`; callers
build that key from both `clerkOrgId` and `organisationId`
(`packages/xero/src/rate-limit/limiter.ts` and
`packages/xero/src/au/read.ts`). Within one process, tenants do not consume one
another's per-org bucket. However, the limiter itself documents that state is
in-process, so it is not a reliable cross-instance daily-budget enforcement
mechanism under serverless fan-out.

Prerequisites before scheduling remain: approval reconciliation performs one
unbounded, sequential request per candidate record, and leave-record sync
rewrites and republishes every fetched record even when its calculated
`changed` flag is false. Neither is changed by this spike.

## Recommendation

Not reached. The rate-limit STOP condition applies: the published cadence
exceeds the 5,000-call daily per-organisation budget for balance syncs alone
at 500 and 2,000 employees. Do not wire a schedule until the maintainer chooses
a revised cadence and prerequisite work reduces or bounds request volume.

The existing `syncEventNames` duplication between `packages/jobs/src/events.ts`
and `packages/availability/src/sync/sync-events.ts` remains out of scope.
