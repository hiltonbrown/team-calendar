# Prompt 05: Leave balance sync and manual balances (build step 5)

## Role and context

You are a senior engineer on LeaveSync. Build step 5, "Leave balance sync from Xero", is a
scaffold only: `packages/availability/src/people/balance-refresh.ts` defines a dispatcher
that is never set, the `sync-xero-leave-balances` event is mapped
(`packages/jobs/src/events.ts:7`) but has no handler, and the `leave_balances` table is only
ever read, never written. PRODUCT requires balances to be sourced from Xero (never
calculated), and editable manually by admins only when Xero is not connected. This slice
implements the inbound balance pull, wires the dispatcher, and adds the admin manual-balance
edit path for the disconnected case.

## Hard rules

- Australian English. No em dashes.
- This slice owns `packages/xero` (AU balance read), `packages/jobs` (the handler),
  `packages/availability` (balance service and dispatcher wiring), and the admin balance UI in
  `apps/app`. Do not change `schema.prisma` or migrations (the nullable column is delivered by
  prompt 01). Do not change tenancy or Clerk integration.
- Balances are never calculated by LeaveSync; they are read from Xero or set manually.
  Manual editing is permitted only when Xero is not connected for that Organisation.
- Keep Xero types in `packages/xero`. Both scope keys on every query; resolve XeroTenant via
  the `organisation_id` FK. Idempotent upserts; record-level failure isolation.
- Do not use `as any` or suppression. Preserve and add tests.
- If the manual-balance edit interacts with an active sync in a way not covered here (for
  example a reconnect mid-edit), stop and record it in `BLOCKED.md`.

## Authoritative references

- `PRODUCT.md:364-366` (leave balances), the non-negotiable "Leave balances ... always
  sourced from `leave_balances` ... never calculated".
- Existing read gate: `apps/app/components/people/person-profile-content.tsx:418-424`.
- `packages/availability/src/people/balance-refresh.ts`, `packages/jobs/src/handlers/sync-xero-people.ts`.
- `launch-plan/REVIEW.md` "Critical findings" C2 and "Open decisions".

## Phased steps

1. **AU balance read** in `packages/xero` (read dispatch + `au/read.ts`): fetch leave
   balances per person per leave type for the tenant region.
2. **Handler** `packages/jobs/src/handlers/sync-xero-leave-balances.ts`: input requires
   `clerkOrgId` and `organisationId`; resolve XeroTenant via FK; idempotent upsert into
   `leave_balances` keyed on `(person_id, xero_tenant_id, leave_type_xero_id)`; per-record
   failure to `FailedRecord`. Register in `packages/jobs/src/functions.ts` and serve in
   `apps/api/app/api/inngest/route.ts`; add to `registeredHandlers`.
3. **Wire the dispatcher**: set `balanceRefreshDispatcher` (via `setBalanceRefreshDispatcher`)
   so `dispatchBalanceRefresh` enqueues the new job instead of returning `job_not_registered`.
4. **Manual balance edit (disconnected only)**: add a service in `packages/availability` and
   an admin action in `apps/app` to create or update a `leave_balances` row with
   `xero_tenant_id = null`, gated so it is available only when the Organisation has no active
   Xero connection. Reuse the existing connection-state check
   (`packages/availability/src/xero-connection-state.ts`). Surface the edit in the person
   profile balances panel, disabled while connected. Target create-or-update on the manual
   partial unique key `(person_id, leave_type_xero_id) WHERE xero_tenant_id IS NULL` delivered
   by prompt 01 (a normal unique over the nullable `xero_tenant_id` is NULL-distinct and would
   let duplicates through); the service must resolve the existing manual row by that key, not
   by the Xero-tenant composite.
5. **Tests**: balance upsert idempotency; manual edit blocked while Xero connected; manual
   edit allowed and persisted when disconnected; both scope keys present.

## Verification gate

`bun install`, `bun run build`, `bun run check`, `bun run boundaries`, `bun run test` must
pass.

## Commits and PR

Conventional commits, for example: `feat: AU Xero leave balance read`,
`feat: sync-xero-leave-balances handler and dispatcher wiring`,
`feat: admin manual leave balance edit when Xero disconnected`,
`test: balance sync and manual edit gating`. Push and open a PR titled "Leave balance sync
and manual balances".

## Acceptance criteria

- [ ] `sync-xero-leave-balances` handler exists, registered, served, dispatcher wired.
- [ ] `leave_balances` is written from Xero idempotently per person per leave type.
- [ ] Admin can set manual balances only when Xero is disconnected; blocked when connected.
- [ ] Manual balance create-or-update targets the partial unique key from prompt 01; duplicate
      manual balances for the same person and leave type are not possible.
- [ ] Balances are never computed; read or set, never derived.
- [ ] Both scope keys on every query; tenant resolved via FK; tests cover the gating.
