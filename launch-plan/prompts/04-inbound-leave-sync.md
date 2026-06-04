# Prompt 04: Inbound Xero leave sync (build step 4)

## Role and context

You are a senior engineer on LeaveSync. The platform is bidirectionally synced with Xero
Payroll: outbound writes (submit, approve, decline, withdraw) are done, but the inbound half
is incomplete. Build step 4, "Xero leave inbound normalisation into `availability_records`",
is not started: the event name `sync-xero-leave-records` is mapped in
`packages/jobs/src/events.ts:8` but no handler exists and it is not registered. This slice
implements the inbound leave pull for the AU region (the launch region), normalises Xero
leave into the canonical `availability_records` model, and registers the Inngest job.

## Hard rules

- Branch first off the latest `main`: `git checkout main && git pull origin main && git
  checkout -b launch/04-inbound-leave-sync`. Depends on prompt 01 (schema parity) being
  merged.
- Australian English. No em dashes.
- This slice owns `packages/xero` (AU read of leave), `packages/jobs` (the handler and
  registration), and the Inngest registration in `apps/api`. Do not change `schema.prisma`,
  migrations, tenancy keys, or the Clerk integration. Keep Xero-specific types inside
  `packages/xero`; `packages/availability` and `packages/feeds` must not import Xero payload
  types.
- All queries carry both `clerk_org_id` and `organisation_id`. Resolve `XeroTenant` via the
  `organisation_id` FK, never bare `clerk_org_id` (mirror `sync-xero-people.ts`).
- Upserts must be idempotent; record-level failures must not fail the whole run (write a
  `FailedRecord` and continue, end as `partial_success`). NZ and UK reads stay deferred:
  short-circuit them as the people sync does.
- Do not use `as any` or suppression. Preserve and add tests.
- If the canonical mapping of a Xero leave field is ambiguous (for example unit handling or
  approval-status mapping), stop and record it in `BLOCKED.md`.

## Authoritative references

- `PRODUCT.md` "Xero sync model", "Inbound sync flow" (lines ~504-521), the
  `availability_records` schema notes, and the UID `stable_source_key` rule (:463-466).
- Existing patterns to mirror: `packages/jobs/src/handlers/sync-xero-people.ts` (+test),
  `packages/xero/src/au/read.ts`, `packages/xero/src/read/dispatch.ts`,
  `packages/jobs/src/events.ts`, `packages/jobs/src/functions.ts`,
  `apps/api/app/api/inngest/route.ts`.
- `launch-plan/REVIEW.md` "Critical findings" C2.

## Phased steps

1. **AU leave read** in `packages/xero/src/au/read.ts` (and a region dispatch entry in
   `packages/xero/src/read/dispatch.ts`, for example `fetchLeaveRecordsForRegion`): fetch
   leave applications for the tenant's region, returning a Xero-typed result. Keep NZ/UK
   returning "not yet available".
2. **Canonical normaliser** in `packages/availability` (a provider-agnostic input shape;
   `packages/xero` maps Xero payloads to it, the availability package consumes it): map to
   `availability_records` with `source_type` for Xero leave, set `approval_status` from Xero
   state, compute `source_remote_hash` for change detection, store the raw response in
   `source_payload_json`, and set `derived_uid_key` using the Xero `stable_source_key`
   (`xero_tenant_id + employee_id + leave_type + start + end + units`).
3. **Handler** `packages/jobs/src/handlers/sync-xero-leave-records.ts`: input schema requires
   `clerkOrgId` and `organisationId`; resolve the XeroTenant via `organisation_id`; fetch,
   normalise, idempotent upsert keyed on `(organisation_id, source_type, source_remote_id)`;
   archive or suppress records no longer present in Xero; per-record try/catch to
   `FailedRecord`; enqueue feed rebuilds for affected feeds only.
4. **Register** the function in `packages/jobs/src/functions.ts` and ensure
   `apps/api/app/api/inngest/route.ts` serves it; add it to `registeredHandlers` in
   `events.ts`.
5. **Tests** co-located: idempotent re-run produces no duplicates; a single bad record does
   not fail the run; queries include both scope keys; stale archival works.

## Verification gate

`bun install`, `bun run build`, `bun run check`, `bun run boundaries`, `bun run test` must
pass. Boundaries must confirm no Xero type leaked into `packages/availability`.

## Commits and PR

Conventional commits, for example: `feat: AU Xero leave read`,
`feat: normalise Xero leave into availability_records`,
`feat: sync-xero-leave-records inngest handler`, `test: inbound leave sync idempotency`.
Push and open a PR titled "Inbound Xero leave sync".

## Acceptance criteria

- [ ] `sync-xero-leave-records` handler exists, is registered, and is served by `apps/api`.
- [ ] AU leave is fetched, normalised, and upserted idempotently into `availability_records`.
- [ ] `derived_uid_key` is set using the Xero `stable_source_key`.
- [ ] Record-level failures isolated to `FailedRecord`; run ends `partial_success` on failures.
- [ ] Every query carries `clerk_org_id` and `organisation_id`; tenant resolved via FK.
- [ ] No Xero payload type imported into `packages/availability`.
