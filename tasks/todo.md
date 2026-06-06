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

## PR #46 Review Fixes

Addressing automated review feedback (Copilot + Codex) on PR #46.

- [x] (Codex P1) Throttle per-employee balance reads in `packages/xero/src/au/read.ts` to respect Xero's 60/min per-org limit.
- [x] (Codex P2) Isolate per-employee balance fetch failures: continue past a single non-OK employee response, carry failures back to the handler; still abort the whole fetch for blanket auth/rate-limit errors.
- [x] (Copilot) Record per-employee fetch failures in `sync-xero-leave-balances` handler and poll `cancel_requested_at` during balance processing.
- [x] (Copilot) Fix manual balance editor so an empty Balance input cannot enable Save / submit a stray 0.
- [x] Add/adjust tests: AU `fetchLeaveBalances` failure isolation + blanket abort; update handler mocks for new `failures` field.
- [x] Verify: `bun run --cwd packages/xero test`, `bun run check`, targeted handler tests.

### Review

- `packages/xero/src/au/read.ts`: `fetchLeaveBalances` now paces per-employee reads (interval derived from the documented 60/min ceiling, overridable via `readIntervalMs` for tests), isolates per-employee HTTP failures into a `failures[]` while still aborting the whole fetch for blanket `auth_error`/`rate_limit_error`, and keeps transport errors as a blanket abort.
- `packages/xero/src/read/dispatch.ts` + `packages/xero/index.ts`: thread and export the new `failures` field and `XeroLeaveBalanceFetchFailure` type.
- `packages/jobs/src/handlers/sync-xero-leave-balances.ts`: records each fetch failure as a counted `failed_record`, and processes balances in batches that poll `cancel_requested_at`, completing the run as `cancelled` when requested (mirrors `sync-xero-leave-records.ts`).
- `apps/app/components/people/person-profile-content.tsx`: `hasValidBalanceInput` requires a non-blank numeric value, so a cleared Balance input disables Save and the action guards against an accidental 0.
- Tests: new `packages/xero/src/au/read.test.ts` (success, 404 isolation, auth abort, rate-limit abort); integration mocks updated with `failures: []` plus a new DB-gated failure-recording case.
- Verification: `vitest` in `packages/xero` (60 passed), jobs balance + events tests (4 passed, 3 DB-gated skipped locally), `tsc` clean for `packages/xero` and the touched files (only the pre-existing `setup-env.ts` error remains in jobs), `bun run check` exit 0, `bun run boundaries` no issues.
