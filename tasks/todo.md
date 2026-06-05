# Inbound Xero Leave Sync

- [x] Read PRODUCT, launch review, existing people sync, Xero read, event, registration, and schema references.
- [x] Add provider-agnostic leave normalisation in `packages/availability`.
- [x] Add AU leave read mapping and region dispatch in `packages/xero`, with NZ/UK deferred.
- [x] Implement `sync-xero-leave-records` with scoped tenant resolution, idempotent upserts, stale archival, `FailedRecord`, and targeted feed rebuild dispatch.
- [x] Register the function and event.
- [x] Add focused tests for mapping, idempotency, per-record failure, scope keys, stale archival, and registration.
- [x] Run verification: `bun install`, `bun run build`, `bun run check`, `bun run boundaries`, `bun run test`.
- [x] Review results and document outcome.

## Review

- `bun install`: passed.
- `bun run check`: passed.
- `bun run boundaries`: passed, including no Xero type imports into `packages/availability`.
- Targeted tests passed:
  - `bunx vitest run packages/xero/src/read/leave-records.test.ts packages/availability/src/sync/inbound-leave-normaliser.test.ts`
  - `bunx vitest run packages/jobs/src/events.test.ts packages/jobs/src/handlers/sync-xero-leave-records.integration.test.ts`
  - `bun run --cwd packages/xero test`
  - `bun run --cwd packages/availability test`
  - `bun run --cwd packages/jobs test`
- `bun run build`: blocked by existing Sentry resolution failure in `apps/web`, `Cannot find module '@sentry/nextjs' from packages/observability/next-config.ts`.
- `bun run test`: touched packages pass, then `apps/app` fails with the same `@sentry/nextjs` resolution error from `packages/observability/error.ts`.
- DB-backed leave sync integration assertions are present but skip when `DATABASE_URL` is absent in this local environment.
