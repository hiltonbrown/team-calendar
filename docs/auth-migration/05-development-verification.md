# Remote development integration and RLS verification

25 October 2026. The configured Neon database is the owner's development database. Verification uses that existing target and its configured owner/restricted-role connections. Clerk remains active.

**PASS:** all 383 integration tests in 39 files across six packages, including all 17 RLS checks. Final protected run `2084be35-c887-460b-accf-8e3b189c1e8d` completed with exit code 0, inventory PASS, cleanup PASS and its active-run fence released.

## Migration and data

- Applied `20261025100000_neutral_account_identity_names` with Prisma Migrate against the direct endpoint, without resetting the database.
- All 42 applied migration checksums match the repository. Prisma migration status is up to date; schema diff reports no differences.
- Verified a private PostgreSQL backup by restoring into a uniquely named temporary database and comparing all 33 application tables and 94 existing rows. The restore database was removed.
- Canonical row hashes before and after the naming migration match. The comparison normalises only the renamed top-level columns and subscription table name; it does not discard timestamps, encrypted values or other data.
- Final post-run verification confirms the original 94 rows remain exact and no temporary database, role or table remains.

## Repairs required to execute the requested coverage

1. **Remote admission:** the test guard now admits the exact configured restricted connection on the same protected owner target, rather than requiring that connection to use the owner username. Durable manifest, active-run and consumer verification remain mandatory.
2. **Development consumer evidence:** explicit `database-fixture` runs support the authenticated Inngest branch environment. Branch key prefix and exact environment ID/type are checked. Production admission defaults remain unchanged.
3. **Long-run cleanup:** a run can exceed the admission sample's fifteen-minute age. Cleanup/recovery can use a freshly verified matching active-run owner while still requiring fresh authenticated consumer readbacks, the same environment and empty inventories. New admissions still require a fresh sample, and future-dated samples are rejected. Manifest timestamps are not rewritten.
4. **Owned fixtures:** local-only integration fixtures now use protected allocations. The registry declares 37 fixture suites and 90 tenant/company slots. It also declares 17 individual authorisation slots, including all twelve job grants. The existing configured Xero provider app is never declared fixture-owned.
5. **Cleanup inventory:** removed obsolete holiday tables, included current preferences and account settings, and covered account-wide rows with null company IDs while retaining owned-account and company predicates. Generated company fixtures use preallocated company IDs.
6. **RLS test compatibility:** preserved historical SQL column names in its backfill replay, cast PostgreSQL catalogue names to text, and provisioned/revoked the temporary role's required PostgreSQL 17 test privileges. PID assertions use a dedicated real restricted connection with a one-connection direct pool; transaction-pooler backend changes cannot mask the context-clearing proof.
7. **Neutral auth and fixture configuration:** updated both neutral auth mock entry points in the app integration suite, and aligned feed fixture creation/detail reads to the same API origin.
8. **Actual runtime defect:** the Xero binding-conflict mapper now recognises the captured RLS-opaque unique violation. Its fallback requires `P2002`, the `XeroConnection` model, `UniqueConstraintViolation`, SQLSTATE `23505`, missing constraint metadata, and an exact primary message naming one of the two ownership indexes. Unrelated/malformed errors remain unclassified. The original failing case passes against Neon.

The guarded runner completes packages and files sequentially and allows every package to finish after a failure, so RLS role mutations remain isolated and cleanup follows writer closure. The repository import boundary also avoids parsing source that cannot name a provider, with escaped-import regressions retained.

An early cancelled run left two generated test companies outside its initial allocation and two unreferenced job grants outside its global-key inventory. Recovery proved the exact reserved accounts, deterministic grant IDs, creation windows, reference closure and active ownership before removing only those test rows. Original row hashes match afterwards. Future allocations address both causes; the shared-grant cleanup refusal remains intact.

## Evidence

| Check | Result |
|---|---|
| `bun run check` | PASS, 1,347 files. |
| `bun run typecheck` | PASS, 19 tasks. Prisma generation completed before tests. |
| `TC_SOURCE_GATES=1 bun run test` | PASS, 4,033 tests across 18 tasks. |
| `TC_SOURCE_GATES=1 bun run test:release-tools` | PASS, 248 tests; five existing tests skipped. |
| `bun run typecheck:release-tools` | PASS. |
| Complete protected integration inventory | PASS: 39 files, 383 tests, six packages, no cached integration results. |
| RLS integration file | PASS: all 17 checks in the final complete run. |
| Independent catalogue/context probe | PASS: 29 enabled tenant policies; no legacy columns; missing and legacy context deny access; commit and rollback clear context on the same backend. |
| Restricted role | PASS: no superuser, RLS bypass, memberships or table ownership; system authorisations, Stripe events and migration history deny reads. |
| Migration status/schema diff | PASS: 42 migrations, matching checksums and no schema difference. |
| Final owned-fixture residue and original data comparison | PASS: guarded cleanup completed, active-run fence released, original 33-table/94-row hashes match, no temporary database/role/table residue. |

Final package results: app 10, availability 31, database 98, feeds 35, jobs 91, Xero 118. The RLS checks are included in the database total. Independent scoped source review found no concrete defect in the production conflict mapper or the RLS connector/setup.

Local evidence is retained under `.cache/auth-db-verification/`, including the private backup, migration/schema logs, source-gate logs, per-run protected manifests and runner receipts, bounded recovery receipts, and row-hash/catalogue reports. Manifests also have durable KV readback. `current-run.json` identifies the latest run. These tests exercise the working tree; its changes have not been committed or deployed.

The protected remote entry point is `tooling/release/run-live-integration.ts --manifest <protected-path> --evidence-dir <directory>`, with the configured target, live acknowledgement, run ID and actual consumer/restore evidence. `ALLOW_LOCAL_DATABASE_TESTS=1` remains a localhost-only opt-in and is not remote authority.

This verification covers real database behaviour with stubbed authentication/provider responses. It does not establish browser sign-in, live payroll-provider acceptance or deployed-worker behaviour. No account reset, identity remap, Better Auth runtime, deployment, commit or merge was performed.
