# Leave Balance Sync And Manual Balances

- [x] Read PRODUCT, launch review, existing balance refresh, people sync, Xero read, job registration, person profile, and schema references.
- [x] Add AU leave balance read support in `packages/xero` behind a region dispatcher.
- [x] Implement `sync-xero-leave-balances` with scoped tenant resolution, idempotent upserts, and record-level failure isolation.
- [x] Register and serve the Inngest handler, and wire `setBalanceRefreshDispatcher` so UI refreshes enqueue the job.
- [x] Add a manual balance service in `packages/availability`, gated to disconnected Organisations and targeting the manual partial unique key.
- [x] Add the admin action and person profile UI for disconnected-only manual balance editing.
- [x] Add focused tests for idempotency, disconnected gating, connected blocking, and scope-key usage.
- [x] Run verification: `bun install`, `bun run build`, `bun run check`, `bun run boundaries`, `bun run test`.
- [x] Review results and document outcome.

## Review

- `bun install`: passed, no dependency changes.
- `bun run fix`: passed after formatting and a small manual-balance-service complexity refactor.
- `bun run check`: passed.
- `bun run boundaries`: passed, including no Xero type imports into `packages/availability`.
- Targeted tests passed:
  - `bun run --cwd packages/xero test`
  - `bun run --cwd packages/availability test`
  - `bun run --cwd packages/jobs test`
  - `bunx vitest run packages/jobs/src/events.test.ts packages/jobs/src/handlers/sync-xero-leave-balances.integration.test.ts packages/availability/src/people/manual-balance-service.test.ts packages/xero/src/read/leave-balances.test.ts`
- `bun run build`: blocked by existing Sentry resolution failure in `apps/web`, `Cannot find module '@sentry/nextjs' from packages/observability/next-config.ts`.
- `bun run test`: touched packages pass, then `apps/app` fails with the existing `@sentry/nextjs` resolution error from `packages/observability/error.ts`.
- `bun run --cwd packages/jobs typecheck`: new handler typechecks cleanly, but the package remains blocked by existing `src/handlers/setup-env.ts` CommonJS `import.meta` error.
- `bun run --cwd apps/app typecheck`: blocked by existing Sentry type errors in `packages/observability/client.ts`.
- DB-backed balance sync integration assertions are present but skip when `DATABASE_URL` is absent in this local environment.
