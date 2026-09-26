# Xero hardening execution report

## Execution context

- Worktree: `/tmp/teamcalendar-161-pre`
- Branch: `codex/xero-connection-hardening`
- Commit at baseline: `91f3bad43495fe10acd3e77fddf77cbfce03788f`
- Bun: `1.4.0`
- Node: `v24.21.0` (satisfies `22 || >=24.0.0`)
- Dependencies: `bun install --frozen-lockfile` exited 0 and installed 1780 packages.

## Step 0: Turbopack worker transport

The shared typed config now sets
`experimental.turbopackPluginRuntimeStrategy` to `"workerThreads"`. The existing
`turbopack.root` value is unchanged. The existing shared-config test now asserts the
setting without adding a test case, so the package suite remains exactly 3 files and
37 tests.

Verification:

- `bun run --cwd packages/next-config test`: exit 0, 3 files passed, 37 tests passed.
- `bun run build` with synthetic `DATABASE_URL` and `XERO_TOKEN_ENCRYPTION_KEY`
  placeholders: exit 0, 4 Turbo tasks successful. The build output reported the
  worker-thread strategy for app, API, and web, and all three Next.js builds completed.

The initial build attempt before this setting exited 1 in the restricted executor
environment because Turbopack's default child-process PostCSS transport could not bind
its local socket (`Operation not permitted`). The supported worker-thread strategy
changed only that Turbopack plugin transport and reconciled the failure; it did not
switch the build to Webpack.

## Pre-execution baseline and post-remediation gates

The gates were rerun after Step 0. Final results:

| Gate | Command | Result |
|---|---|---|
| Lint | `bun run check` | exit 0, 1033 files checked, no fixes applied |
| Types | `bun run typecheck` | exit 0, 19/19 Turbo tasks successful |
| Boundaries | `bun run boundaries` | exit 0, 994 files in 21 packages, no issues found |
| Unit tests | `bun run test` | exit 0, 18/18 Turbo tasks successful; next-config 3 files / 37 tests |
| Build | `bun run build` with synthetic required variables | exit 0, 4/4 Turbo tasks successful |
| Release tool tests | `bun run test:release-tools` | exit 0 outside the restricted sandbox, 11 files / 47 tests passed |
| Release tool types | `bun run typecheck:release-tools` | exit 0 |

The first in-sandbox run of `bun run test:release-tools` exited 1 because its permitted
local Unix-socket IPC test could not bind under the restricted sandbox: 10 files and 46
tests passed, with only that IPC assertion failing. The exact command was rerun outside
the restricted sandbox and passed 11 files / 47 tests.

## Environment examples

Added comment-only guidance to `apps/app/.env.example` and `apps/api/.env.example`:

- `DATABASE_URL` and `XERO_TOKEN_ENCRYPTION_KEY` are required for `bun run build` and
  production.
- All other entries are optional.
- Optional formatted variables must be absent or commented out, never `""`.

`git diff --check` passed after these additions.

## Preflight gate

- `bun run --cwd packages/next-config test`: exit 0, exactly 3 files and 37 tests
  passed.
- `packages/next-config/preflight.test.ts` is the existing suite that plans 161c and
  161e extend. This plan did not add future cases for
  `XERO_TOKEN_ENCRYPTION_ACTIVE_VERSION`, `XERO_TOKEN_ENCRYPTION_KEYS_JSON`, or
  `XERO_APP_TIER`.

## Sub-plan correction confirmation

The required greps were run against `plans/161[a-h]-*.md`:

- `grep -nE "bun run test:release([^-]|$)" ...` matched only explanatory prose about
  the deployed-candidate Playwright suite, not Commands tables or Done criteria.
- `grep -n "bun run preflight" ...` matched only explanatory production-gate prose,
  including explicit statements that it is not a local gate. No Commands-table or
  Done-criteria requirement remained.
- `grep -c "Fresh worktree setup" ...` reported at least one occurrence in every
  sub-plan. Plan 161e reported two occurrences; the other seven reported one each.

## Final checks

- `git diff --check`: exit 0.
- No 161a-161h plan or charter file was modified.
- No real `.env` file was modified; only comments were added to the two `.env.example`
  files.

## Baseline

```text
$ git rev-parse HEAD
b7610d54dfc8ee15abfdb4e974ad5ae4d2149772

$ git status --short

$ bun --version
1.4.0

$ node --version
v24.21.0
```

## Fixture ownership contract

The protected fixture registry now has 26 suites. The five newly reserved suites
own these tenant slots and global key kinds:

| Suite | Owned tenant slots | Global key kinds | Cleanup selection path |
|---|---:|---|---|
| `packages/database/xero-lifecycle-migration.integration.test.ts` | 22-23 | `credential_owner`, `provider_app`, `provider_connection`, `tenant_binding`, `oauth_attempt`, `cleanup_request`, `cleanup_attempt`, `shared_store_namespace` | `selectOwnedGlobalKeyValues`, then the owning migration test's manifest-scoped cleanup |
| `packages/jobs/src/handlers/reconcile-xero-connections.integration.test.ts` | 31-32 | `provider_connection`, `tenant_binding`, `cleanup_request`, `cleanup_attempt` | `selectOwnedGlobalKeyValues`, then reconciliation cleanup in plan 161f |
| `packages/xero/src/oauth/connection-cleanup.integration.test.ts` | 43-44 | `provider_connection`, `tenant_binding`, `cleanup_request`, `cleanup_attempt` | `selectOwnedGlobalKeyValues`, then targeted cleanup in plan 161f |
| `packages/xero/src/oauth/credential-owner.integration.test.ts` | 45-46 | `credential_owner`, `provider_app`, `oauth_attempt` | `selectOwnedGlobalKeyValues`, then credential-owner cleanup in plan 161d |
| `packages/xero/src/rate-limit/shared-store.integration.test.ts` | 50-51 | `shared_store_namespace` | `selectOwnedGlobalKeyValues`, then shared-store namespace cleanup in plan 161e |

Global ownership is kind-qualified. A raw identifier that is owned under one
kind cannot be selected under another kind, and a similar unowned value is
preserved. The writer rejects unsupported or duplicate manifest global keys.
No future database table or Redis key is touched by this baseline plan.

## Plan 161a verification

- `bun install --frozen-lockfile`: exit 0, no dependency changes.
- After registering the five suites, `bun run --cwd packages/database test`
  produced the required two exact-count failures (`21` expected versus `26`)
  before the assertions were updated.
- `bun run --cwd packages/database test`: exit 0, 16 files and 68 tests passed.
- `bun run check`: exit 0, 1033 files checked with no fixes pending.
- `bun run typecheck`: exit 0, 19 of 19 Turbo tasks passed.
- `bun run test:release-tools`: exit 0 outside the restricted sandbox, 11 files
  and 49 tests passed. The first restricted run's local IPC assertion was an
  environment-only bind failure and was rerun faithfully outside the sandbox.
- `bun run typecheck:release-tools`: exit 0.
- `git diff --check`: exit 0.
- `grep -c "integration.test.ts" packages/database/src/live-test-fixture.ts`:
  `26`.
- `grep -c '^|' plans/161-xero-provider-contract.md`: `16`.

## Plan 161b execution, 23 September 2026

Step 1 red regression: `bun run --cwd packages/xero test` failed only the new
`completeXeroTenantSelection > rejects reconnecting an existing payroll entity
to another Xero file` test (330 passed, 1 failed). The assertion expected
`{ error: { code: "tenant_replacement_required" }, ok: false }` but received
`{ ok: true }`. After the guard, the Xero unit suite passed (335 tests).

The user authorised the database configured in local development environment
files for this run. Read-only inspection identified the `neondb` database in
`public` on the configured Neon development target, with the previous latest
migration `20260919110000_harden_outbound_recovery`, one Xero tenant row and no
candidate reservation collision. Migration A applied successfully, followed by
a dry-run backfill (1 row, 1 update, 0 collisions) and an applied backfill with
the same counts. Migration B then applied successfully. Read-back found both
new migrations applied, one row bound to the configured provider app with
`active_slot = 1` and `binding_generation = 1`, and both the CHECK constraint
and reserved-binding unique index present.

Production ordering: deploy migration A, run the backfill dry-run, apply the
backfill only with zero collisions, then deploy migrations B and C together in
a later deployment. Never claim immutable binding with B alone. This execution
validated the order on the development database; it was not a production
rollout.

Verification: `bun run check`, `bun run typecheck`, Xero units, database units,
`bun run test` (18/18 tasks), Prisma validation and release tooling passed.
The first `bun run test` attempt failed because the protected fixture unit
manifest still allocated two provider app keys after the suite allocation rose
to four; its exact count was updated and the rerun passed. The first restricted
`test:release-tools` run failed its local IPC test (48/49 passed); the required
rerun outside the restricted sandbox passed (49/49). The named database and
Xero integration suites are **NOT VERIFIED**: the authorised database is
remote, and the protected live runner requires a release manifest, run ID and
consumer-isolation prerequisites that are unavailable in the local environment.
Do not use `ALLOW_LOCAL_DATABASE_TESTS` against this remote target or count
direct SQL checks as those suite results.

Follow-up development database probe: the first rollback-only SQL attempt
failed before inserting tenant rows because PostgreSQL rejected `interval $4`;
its transaction rolled back. The corrected probe used savepoints and one
outer transaction, then rolled it back. The CHECK rejected `active_slot` values
`0`, `2` and `-1` with `xero_tenants_active_slot_check`, accepted `1`, the
unique key rejected a second reserved binding with
`xero_tenants_reserved_binding_key`, and two retired bindings for the same pair
coexisted. A post-rollback query confirmed no probe organisation remained.
These are extra database constraint checks, not a run of either named
integration suite.

Review reconciliation: migration C adds a trigger that rejects direct changes
to `xero_tenant_id` on an existing row. It was applied after a read-only target
and migration-history check. A rollback-only SQL probe confirmed a change to
an unreserved file raised SQLSTATE `23514` with
`xero_tenants_xero_tenant_id_immutable`, a same-file update succeeded, and the
internal row ID and external file ID remained unchanged. The outer transaction
rolled back; a post-query found no probe organisation. Migration C was read
back as applied. The named integration suites remain NOT VERIFIED until their
protected runner prerequisites are available and the suites actually pass.

### Protected online verification, 24 September 2026

The user authorised the configured online Neon database and explicitly approved the
consumer-isolation fallback required by the provider retention limit: exactly one
production Inngest environment, zero active apps, zero archived apps, and zero
running, queued or paused runs. The final evidence was collected immediately before
the run and revalidated by the guarded runner.

The successful protected candidate was `bade686f19531f96eb5513218b9217a5a3fd87cb`.
The manifest was persisted once in KV under a unique release namespace and owned 53
Clerk organisation IDs, 53 internal organisation IDs and 41 typed global keys. SQL
read-back matched Neon project `soft-dream-28768887`, branch
`br-frosty-union-a7sc6dl7`, endpoint `ep-cold-pond-a7ar2epd`, database `neondb` and
role `neondb_owner`. Restore evidence recorded timeline
`73cb5a3404beeb6412275bed23ffa160` at LSN `0/47830F58`. All 18 applied migration
checksums matched the candidate.

The guarded `run-live-integration.ts` inventory passed all 6 Turbo tasks and all 22
reviewed integration files, 158 tests total:

- app: 1 file, 2 tests passed;
- availability: 3 files, 21 tests passed;
- database: 10 files, 41 tests passed, including 9 Xero lifecycle migration tests;
- feeds: 1 file, 15 tests passed;
- jobs: 5 files, 65 tests passed;
- Xero: 2 files, 14 tests passed, including the tenant-selection service suite.

Remediation during execution preserved the live safety boundary. The cleanup CLI now
uses a package-owned standalone Prisma client instead of the server-only application
client. Constraint tests inspect PostgreSQL constraint metadata directly, concurrent
reservation tests use two transactions coordinated by `SELECT ... FOR UPDATE`, billing
receipts use manifest-owned Stripe event keys, and deterministic availability tests fake
`Date` only so Neon network timers remain operational.

The successful runner exited 0 after cleanup. Independent read-back found zero rows
for every manifest-owned table and implemented global fixture selector, reproduced the unchanged
outside-owned catalogue digest
`41e95ac3737a446c207e103f8c13538b2b04933b005a7de9f737beeafbc8bb8e`, and
confirmed that `release:active-run` was absent. Three stale hard-coded billing test
receipts created by an earlier failed attempt were identified by exact test IDs and
deleted; the current tests no longer use unowned IDs.

Final source gates passed: `bun run check`, `bun run typecheck`, Xero units (21 files,
335 tests), database units (17 files, 72 tests), release tooling (13 files, 65 tests),
Prisma validation, migration safety greps and `git diff --check`.

Outcome: Plan 161b is DONE. The production ordering remains unchanged: deploy
migration A, dry-run and apply the backfill only with zero collisions, then deploy
migrations B and C together. This verification does not claim that a separate rollout
was performed during this run.


## 161c: Deadlines and encryption key versions (26 September 2026)

Implementation worktree: `/tmp/tc-161c`, branch `codex/xero-deadlines-key-versioning`, baseline `11ce7e7`.

- Redis timeout remains active through body consumption, cancellation is distinct from timeout, caller listeners are removed. Reader cancellation replaces the proposed text race so the actual locked body stream can be cancelled.
- Xero calls share an absolute deadline across admission, headers, body and retries; concurrency stays held until the body is buffered. Foreign origins and redirects are rejected, responses have a five MiB application cap, token operations use ten seconds, background admission keeps 65 seconds.
- Version-one compatibility is preserved; optional active-version/keyring configuration is validated, all decrypt calls use stored versions, and unknown version/authentication failures remain distinct and safe.
- Maintenance re-encryption preflights versions, pages both ciphertext tables and uses version-plus-ciphertext compare-and-set updates. Four integration cases cover both tables, idempotency, conflicts, corrupt ciphertext and unknown versions. No real key rotation or schema change.

### Regression evidence before implementation

`bun run --cwd packages/core test` exited 1 before the fix. Exactly the new stalled-body case failed:

```text
FAIL src/redis-rest-transport.test.ts > executeRedisRestCommand > bounds a stalled body after headers
AssertionError: expected 'unsettled' to match object { ok: false, error: { code: "timeout" } }
Test Files 1 failed | 5 passed (6)
Tests 1 failed | 80 passed (81)
```

### Reconciliation and scope

The plan omitted the required version field from `XeroTenantForWrite` and row selects that construct it. Reviewer approved mechanical additions in `packages/xero/src/write/types.ts`, `packages/xero/src/adapter/{auth-recovery,xero-write-adapter}.ts`, the four Xero jobs handlers and typed fixtures. OAuth unit mocks now use real Responses because buffered-body consumption requires an actual body. No adapter classification, lock/persistence, limiter storage or schema logic changed. Prisma generated-file formatting noise is restored before commit.

The initial Xero run occurred during incomplete mechanical crypto updates and failed due to missing fixture versions and Response-shaped test doubles. These were reconciled, not treated as product transport failures.

User confirmed online Neon verification only. A disposable local migration had started before that correction, but no local integration tests ran. The disposable instance was stopped by the reviewer. All subsequent database verification must use the existing protected live runner, with fresh manifest, ownership, consumer isolation and restoration evidence; no remote migrations are needed.

### Verification evidence

- Core units: 6 files, 84 tests passed, including the failing regression and cancellation/listener cleanup cases.
- Xero crypto/config units: 39 tests passed; OAuth service units: 74 tests passed.
- `bun run check`: exit 0 (1047 files).
- `bun run typecheck`: exit 0 (19 tasks).
- `bun run boundaries`: exit 0, 1001 files in 21 packages.
- `bun run test`: exit 0, 18 tasks passed.
- Final Xero units: 23 files, 364 tests passed, including expired budgets, stalled headers and caller cancellation.
- Build and protected live integration: final evidence appended after completion.


### First guarded online integration run and reconciliation

The protected online runner against source candidate `70faf06` collected all new Xero cases: Xero 2 files and 18 tests passed, database 41, app 2, feeds 15 and availability 21 passed. The full command exited 1 due to two existing jobs-suite prerequisites, not a Xero deadline or keyring failure. The people suite failed collection because the runner supplied Inngest signing configuration without its paired event key. The reviewer will supply the existing paired provider configuration, keeping all actual sends mocked in integration tests.

The leave-records CAS test assumed its dynamically allocated person UUID sorted after a hardcoded cursor, so the mocked concurrent update never ran and the result was `succeeded` instead of `cancelled`. With reviewer approval, its initial cursor is now null (first page) and the test explicitly asserts one fetch, ensuring the database race is exercised for every allocated ID. This is a necessary test-only scope reconciliation in `packages/jobs/src/handlers/sync-xero-leave-records.integration.test.ts`.

A comments-only env example amendment created `5b761dd` while the first runner was already executing `70faf06`; executed source and tests were identical. Subsequent candidates are frozen before manifest preparation. The first run's internal cleanup completed and released its fixture fence before any further source edits.

Production build passed: `bun run build` with command-only synthetic validation configuration, 4 tasks successful (database, API, app, web), 40.223 seconds. No secrets or env files were committed. Full unit suite was repeated after all tests: 18 tasks passed. Final lint passed 1047 files. Generated Prisma formatting noise is restored after commands that regenerate it.


Reviewer also approved a deterministic `../client` mock in the people integration suite, following the existing leave-records suite, to isolate outbound Inngest sends and avoid paired deployed-client initialisation when provider keys are supplied to the protected runner. The real database fixture operations and Xero employee mock coverage remain intact. The source candidate is frozen after this test-only reconciliation before the next protected run.


### Final verification on the frozen source candidate

Protected online Neon verification passed on source candidate `caa98406b635bb0f5930c22c7ca8285be7d75e1f`, run `75e1b64e-6147-4b9e-aa9b-8c93249166fc`. The runner exited 0: 6 integration tasks, 22 files and 162 tests passed (app 2, availability 21, database 41, feeds 15, jobs 65, Xero 18). The Xero service integration file was collected and all four new re-encryption cases passed. The jobs CAS test now proves the fetch and concurrent cursor update executed, and the people suite collects with isolated event transport.

The reviewer refreshed the protected manifest using timeline `73cb5a3404beeb6412275bed23ffa160`, restore LSN `0/4863BDA8`, all 18 applied migration checksums, 53 owned tenants and 41 global keys. Consumer isolation and durable-fixture checks were refreshed before execution. The run's guarded cleanup completed; independent final cleanup and KV-fence readback evidence is retained by the reviewer and recorded below after confirmation.

Final candidate gates passed: lint 1047 files, typecheck 19 tasks, full unit 18 tasks, core 84 tests, Xero 364 tests and package boundaries. The reviewer also passed release-tool units (13 files, 65 tests). Production build passed with synthetic command-only format validation values as recorded above. Whitespace and commented-env-addition criteria passed; the stale `customFetch` through `response.json` text probe was reconciled to the equivalent fetch-to-body span because JSON is now parsed from a bounded reader, whose pre-body cleanup count is zero.

The committed changes implement the capability and verify guarded online database behaviour using owned synthetic token rows. Live Xero provider operations, actual production token/key rotation, release preflight and browser rollout were not performed or claimed by this plan.


Independent reviewer cleanup readback passed: all 32 fixture selectors returned zero owned rows; the outside fixture catalogue remained unchanged (`41e95ac` prefix); the protected active-run fence was released (`ACTIVE_RUN_RELEASED`). Final worktree contains no generated-file diff or temporary helper files. Plan 161c implementation and its reconciled verification criteria are complete; the reviewer maintains the plan index.

## 161d: Canonical credential owner, executor candidate (26 September 2026)

Implementation candidate prepared in `/tmp/tc-161d` on `codex/xero-canonical-credentials`, based on `8812ecf7`. No merge or push performed. The session-authorised online Neon database is the sole integration target, through the protected live runner. No localhost or Docker database was provisioned. Reviewer owns refresh of live identity, restore evidence, consumer isolation, manifest ownership, additive migration and cleanup verification.

### Implementation

1. Added two regression cases for re-encrypted or scrubbed ciphertext. With the original ciphertext-inequality inference temporarily restored in the disposable worktree, the targeted run produced exactly **2 failed, 398 skipped**; fixed source restored and both pass.
2. Added credential owner, refresh attempt and provider inventory models plus nullable OAuth intent fields and durable requested scopes. The generated additive migration `20260926040000_add_xero_credential_owner` has SHA-256 `fdfa83377c57d4a68d0e9372a188c9a568fb58b8e97e160828895fbf81ee0544`. Generated using Prisma 7 workspace CLI `migrate diff --from-schema /tmp/tc-161d-before-owner.prisma --to-schema prisma/schema.prisma --script`. Only two planned `DROP NOT NULL` operations, no dropped tables or token columns.
3. JWT identity validates fixed issuer, resource audience, configured client, RS256 signature and expiry. The migration-only verifier relaxes expiry alone after authenticated decoding. Fourteen generated-key JWT tests pass; direct `jose` dependency pinned to existing 6.2.12 resolution.
4. Owner refresh commits durable attempt before HTTP, uses SQL-bounded owner/binding/connection lock order, mirrors only reserved active/stale non-disconnected links and proves lost commits by exact attempt ID plus token version. Recovery supersedes obsolete attempts and retains the original grace window. Resolver rechecks binding generation and lifecycle after refresh. Owner/recovery re-encryption uses full envelope/version/outcome CAS.
5. Async OAuth start persists intent and nonce hash before redirect. Callback claims exchange once, persists encrypted candidate before verification/inventory, adopts only a newer verified expiry or unusable owner and returns generic errors. Selection uses current owner credentials and requires verified owner/provider associations for newly exchanged sessions. No OpenID scopes added.
6. Prepared read-only identity planning CLI and default dry-run singleton-only backfill. Shared-authoriser groups and unverifiable identities remain unowned. No real customer backfill, token refresh, consent change or key rotation performed.
7. Added 13 owned PostgreSQL integration cases and registered the 23-suite inventory. Cases include real OAuth start/callback abandonment and inventory persistence failure, queued owner-lock concurrency, cross-account isolation, grace recovery, exact proof, disconnected mirrors, unowned legacy refresh and maintenance CAS. Database migration scope and fixture cleanup checks expanded for system infrastructure ownership.

### Verification before reviewer live run

- `bun run check`: PASS.
- `bun run build`: PASS, four applications, command-only synthetic configuration; no database provisioned or contacted.
- `bun run typecheck`: PASS, 19 workspaces; changed Xero/jobs types rechecked after final edits.
- `bun run test --concurrency=2`: PASS, 18 workspace tasks. Initial unrestricted run timed out in the unrelated marketing contact test; bounded concurrency passed without any marketing source edit.
- Xero unit suite: PASS, 26 files, 402 tests, including JWT identity, coordinator, key maintenance, ciphertext regressions and error/log redaction assertions.
- Database unit suite: PASS, 18 files, 78 tests.
- Jobs unit suite: PASS, 13 files, 136 tests, including scheduled recovery invocation.
- `bun run boundaries`: PASS.
- `bun run test:release-tools`: PASS, 14 files, 72 tests.
- `bun run typecheck:release-tools`: PASS after minimal literal-union typing reconciliation.
- Protected online integration, migration apply, schema drift and zero residue: **PENDING REVIEWER RUN**.

### Reviewed scope reconciliations

Added `XeroOAuthSession.requested_scopes` because Step 5 requires durable requested-scope evidence but omitted a schema field. Generated Prisma model updates are required by the additive schema. Protected cleanup required `tooling/release/cleanup.ts`, new `tooling/release/xero-fixture-cleanup.ts` and its seven tests. The release fixture manifest needed a `Partial<Record<GlobalKeyKind, number>>` annotation to compile the existing heterogeneous allocation registry. Added coordinator/key-maintenance tests and the job handler test as required by plan behaviour. `tasks/todo.md` records this scoped execution and reviewer-controlled live gate. Reviewer explicitly approved these reconciliations. The worktree plan was refreshed from the reviewer's online-only reconciliation; README remains reviewer-owned.

Migration output was regenerated through a terminal-blank normaliser, preserving one final newline and all SQL statements. Generated Prisma whitespace was normalised only for added/changed lines. `git diff --check 8812ecf` passes.


### First protected live run and fixture reconciliation

The first protected live run against source `23dde13` applied the additive migration and passed 43 database tests and 29 Xero tests, but the two new OAuth callback cases failed during OAuth start. The fixture omitted a synthetic callback URI, so `callbackUrl()` had no configured URI in the protected runner environment. The fixture now sets a synthetic callback URI and isolates the preview flag; diagnostics include only the typed error code.

After confirming that the interrupted test workers had terminated, the reviewer refreshed consumer checks, recovered three owned interrupted sync-run fixtures through protected recovery (exit zero), independently confirmed all 35 cleanup selectors empty and released the active-run fence before source edits resumed. Outside-owned catalogue digest unchanged. No executor database operation occurred. Corrected candidate remains subject to protected live rerun.


### Final reviewer verdict and protected online verification

**PASS**, tested runtime candidate `1b16680ad34642ba356f4623b144c6160f64c285`, protected run `9050c019-ec1e-4515-a5cc-69e92679b539`. The authorised online Neon runner executed six integration workspace tasks, **23 suites and 177 tests**: app 2, feeds 15, availability 21, database 43, Xero 31 (including all 13 credential-owner cases) and jobs 65. The protected migration gate verified all 19 applied migration checksums with none pending. The read-only live Prisma schema diff reported no difference.

Fresh durable ownership evidence covered 53 tenant slots and 41 global keys; consumer-isolation and restore evidence were refreshed before the run (restore timeline prefix `73cb5a`, LSN `0/490E57C0`). Independent post-run verification confirmed all 35 owned cleanup selectors empty, the outside-owned catalogue digest unchanged at `41e95ac3737a446c207e103f8c13538b2b04933b005a7de9f737beeafbc8bb8e`, and `ACTIVE_RUN_RELEASED`.

The second protected attempt timed out during all three Xero import hooks before any of their 31 tests executed. Cleanup and fence release were independently verified. Pure Bun and real Vitest probes imported the database, service and coordinator without constructing a database client, and reproduced no import-cycle failure. The reviewer verified installed Turborepo support for the documented `TURBO_CONCURRENCY` variable and reran the **unchanged runtime candidate** with concurrency two; the complete integration gate then passed. No hook timeout increase or runtime workaround was introduced.

Reviewer independent lint, forced four-application build, 19-workspace typecheck, full units at concurrency two, boundaries, 72 release-tool tests, release-tool types and source done-criteria probes passed. Generated formatting was restored byte-identically after generation. The final documentation reconciliation adds the same three-table infrastructure exception to the separate tracked `AGENTS.md`; runtime and test source remain exactly the live-tested candidate. Plans and task review now record the completed verification.

No real customer backfill, Xero consent modification, customer credential rotation, deployment, merge or push was performed. Legacy identity grouping that requires a provider refresh remains explicitly unowned, as required by the rollout plan.


### Main merge (26 September 2026)

User-authorised merge into main completed at `128cc66`. The committed runtime,
tests, lockfile and migration match protected live-tested candidate `1b16680`
byte for byte. Existing unrelated local edits were preserved outside the commit;
the instruction import stub was retained when restoring those edits. No push
or additional live database mutation was performed for the merge.

## 161e: shared Xero rate budgets

Step 1 defect reproduced before source implementation: `bun run --cwd packages/xero test` exited 1, 2 failed and 402 passed, 1 failed and 25 passed files. Same external tenant through different internal bindings produced `one:one` and `two:two`; different external tenants through one internal binding both produced `one:one`. Log: `/tmp/tc161e-regression.log`.

Cutover: production admission remains closed until explicit tier, KV pair, namespace epoch and namespace initialisation are configured. Quiesce callers, then either wait out the daily window or initialise conservatively with `assumeSpentDaily: true`; set the sentinel and resume. Conservative recovery also closes newly seen tenant daily windows. Never flush live state or rotate epochs to bypass quota. Plan 161h sequences activation. No production namespace was activated in this execution.

Verification: source lint PASS (1070 files), full types PASS (19 tasks), full units PASS (18 tasks; Xero 430 cases, next-config 42), release tools PASS (16 files, 97 cases, including cluster-safe cleanup), release-tool types PASS and synthetic build PASS (4 tasks). Whitespace and identity-removal criteria PASS. Independent protected live inventory PASS: 24 suites, 187 tests across six tasks, including ten real Redis REST shared-store cases. CI Redis/SRH containers were configured but not provisioned in this session.

Deviation: conservative namespace initialisation uses one namespace-wide expiring daily marker rather than enumerating tenant windows. It blocks tenant daily admission for the complete recovery period, including previously unseen tenants, while allowing separate token/inventory/management classes. Runtime never creates the sentinel. Integration child credentials are isolated from protected runner credentials, and cleanup derives exact owned epochs from manifest namespace keys.

Independent package-boundary gate initially identified three cross-package source imports in the shared suite. The pure fixture epoch and cleanup helpers now live behind explicit database package subpaths, including an explicit live-test guard export. Repeated boundaries PASS (1,026 files across 21 packages), full lint/types/units and synthetic build PASS on the corrected candidate. No boundary suppression or new dependency was introduced.

### 161e independent review and terminal live evidence

Reviewer approved runtime candidate `f2aeff73b050c30ef1dbacfa5997338d57d53268`. Independent uncached gates passed: lint 1,070 files; types 19 tasks; units 18 tasks (430 Xero and 42 next-config cases); release tooling 97 cases across 16 files plus tooling types; package boundaries 1,026 files across 21 packages; build four tasks in 10.219 seconds using command-only synthetic build variables. Whitespace and key-removal probes passed.

Protected live campaign `ccc3ba37-89b3-4636-83ab-58b1b6351d4e` exited zero: 24 suites and 187 tests across six tasks in 1m26.722s (app 2, database 43, availability 21, Xero 41, feeds 15, jobs 65). The Xero total includes ten Redis admission tests using only owned fixture namespaces. Fresh evidence verified 19 migration checksums, no pending migrations, 53 owned tenants, 41 global fixture keys, durable manifest and isolated consumers. Restore evidence used Neon timeline `73cb5a3404beeb6412275bed23ffa160`, LSN `0/49845330`.

Independent final cleanup found all 36 selectors zero, including shared Redis namespaces; outside-owned catalogue digest remained `41e95ac3737a446c207e103f8c13538b2b04933b005a7de9f737beeafbc8bb8e`. The active-run fence returned null after release. Read-only Prisma schema comparison reported no difference. The earlier prepared manifest `97d8097f-8086-4cc0-9d05-5a9bb4d96ce9` never acquired an active fence or ran tests; the terminal campaign above is the executed evidence.

Reviewed execution adaptations: the executor received the complete plan through a shared absolute path rather than inline packaging, confirmed reading every step before worktree creation, and worked only in its isolated checkout. Conservative initialisation closes daily admission for all tenants for 24 hours, covering unseen tenants rather than only prefilling known windows. Pure epoch and guarded fixture cleanup helpers moved into explicit database package subpaths after the boundary gate found three cross-package imports. Redis admission, observation and release respect absolute operation deadlines; wait expiry retains the last actual denial, and lease margins are applied once to current remaining time. Cleanup groups deletion batches by Redis hash tag, preserving cluster safety.

No live Xero calls, customer credential mutations or production namespace initialisation were performed. CI Redis/SRH service configuration matches upstream documentation, but an actual GitHub Actions run remains NOT VERIFIED. Production activation remains an explicit Plan 161h operator step with the cutover procedure above.

## 161f: management cleanup operator procedure

Remote cleanup defaults to `report_only`. Code and fake-provider tests do not establish this app's management-tier authorisation. Actual management token acquisition, targeted live DELETE and production cleanup activation remain NOT VERIFIED and were not performed.

For support review, list `xero_cleanup_attempts` in `unknown` or `blocked_authorisation`, join their request to obtain Clerk Org, Organisation, frozen provider app, exact remote connection UUID and binding generation, and compare `created_at`, `updated_at`, `dispatched_at` and lease age. Apply both tenant scope filters when viewing or changing one case; system sweeps return IDs and scopes only. Application policy: escalate any `unknown` older than 24 hours. This threshold is an operator procedure, not an implemented notification service.

A later GET `/connections` inventory that omits a target is report-only evidence. It cannot prove a lost DELETE completed, close an unknown attempt, or authorise a new target. Escalate unresolved provider evidence and management authorisation failures to Xero support through the application's established support route. Resolve management provisioning before considering a blocked case again. Do not force reconnect or remove the binding reservation while a claimed, dispatching or unknown attempt remains unresolved.

An explicit operator may reissue only the original frozen target while reconnect remains fenced. Review the correct tenant scope, unresolved state, provider app, UUID and original binding generation first. Invoke `bun run --cwd packages/xero cleanup:reissue --attempt-id <attempt-uuid> --clerk-org-id <clerk-org-id> --organisation-id <organisation-uuid> --operator-user-id <operator-user-id> --expected-provider-app-id <original-app-id> --expected-remote-connection-id <original-remote-uuid> --expected-binding-generation <original-generation> --confirm-reissue`. These arguments are identity and intent evidence, not credentials. Report-only or superseded cancellations cannot be reissued. A targeted 2xx confirms deletion and a targeted 404 confirms absence only after the app identity check; a lost dispatched response stays unknown. Never widen the deletion to the authoriser's whole grant or infer a fresh target from current inventory.

UI rendering tests cover all receipt states. `tooling/release/e2e/xero-disconnect-receipts.spec.ts` is written but NOT VERIFIED until Plan 160. That campaign must prepare three distinct, already-disconnected, manifest-owned Organisations under the authenticated administrator's Clerk Org, with persisted `left_in_place`, `pending` and `unknown` receipts. Supply their Organisation IDs, names and matching statuses through `TC_E2E_XERO_RECEIPT_FIXTURES_JSON`; absent or unowned fixtures fail explicitly. The browser action then reads the existing receipt idempotently and does not dispatch any provider request. No browser campaign was run in this execution.

### 161f executor source evidence

The two pre-fix disconnect regressions failed exactly as intended: `2 failed, 430 passed` across 27 files (`/tmp/tc161f-regression.log`). Final source gates pass: lint 1083 files, types 19 tasks, full units 18 tasks (Xero 458, Jobs 137, Database 78, app 568), four-task build with command-only synthetic database/encryption variables, package boundaries, and release tooling 104 tests/types. `finaliseLocalXeroDisconnect` remains byte-identical to the approved 161e baseline, preserving destructive data effects. Complete protected integration inventory 26 files is prepared, including nine new local-cleanup/reconnect cases, nine worker cases and two lifecycle cases; the final independent campaign passed as recorded below. Browser scenarios and actual Xero app provisioning remain NOT VERIFIED.

Execution packaging deviation: reviewed full plan supplied by shared absolute path rather than duplicated inline; complete plan and reconciliation read before worktree creation. Isolated branch `codex/xero-management-cleanup` starts at approved 161e `af649c24`; no main merge/push. Additional reviewed scope includes Inngest route `maxDuration=300`, one durable step per bounded cleanup attempt, management-only ledger truth updates and guarded malformed-table-readback rejection. Online Neon/Redis verification remains exclusively protected runner-owned; no local database/container, real Xero request or production namespace activation was performed by the executor.

### 161f first protected campaign and reconciliation

Protected run `90a51cda` (run identifier prefix) applied the reviewed additive migration successfully, bringing the online target to 20 migrations. It then failed the old `service.integration.test.ts` expectation that local credentials must remain active until remote DELETE succeeds. This was a stale integration expectation, and the failed run is not counted as a pass. Interrupted sibling tests left one owned running sync fixture; after worker termination and renewed consumer isolation, the reviewer cancelled only that owned fixture. Recovery also exposed PostgreSQL `08P01`: the cleanup-request DELETE had three placeholders but four bound values. Its transaction rolled back and the protected fence remained held.

The reviewer recovered through a private copy of the same guarded cleanup code, changing only that request DELETE's binding arity and retaining all ownership, consumer, identity and catalogue checks. All 38 selectors subsequently read zero, the original outside-owned catalogue digest (`41e95ac3...`) matched, and the exact active-run CAS released the fence with independent Redis read-back. Only after that safe-edit signal did the executor change source. The repository now binds three request values and has a placeholder-arity regression. A stored legacy remote target remains `left_in_place` on repeated no-request disconnect, while an absent target is `not_applicable`. The old integration now proves local disable, zero HTTP and an idempotent truthful receipt; the bound-tenant integration proves repeated receipt/request identity, one request and unchanged generation. Migration checksum remains `d038fcd0041cb6b0cebcffca869c9c01053895eb597e053da19a2d4d68dc1d96`. Final source gates passed again; the corrected runtime subsequently passed the final protected 207-test campaign below.

### 161f standalone operator entry reconciliation

The real `cleanup:reissue` entry initially failed during module loading under Bun's `react-server` condition: importing cleanup locks through `credential-owner.ts` pulled `service.ts`, availability/feeds and Clerk's Next runtime. Isolated keys and observability logger imports both passed with a synthetic encryption key; the logger was not the cause and remains unchanged. The existing lock helper block is now extracted byte-identically into `oauth/locks.ts`, consumed directly by cleanup, service and credential-owner. The existing credential-owner integration imports that helper directly, and its unit test supplies the normal server-only test mock.

The CLI validates explicit operator intent first and rejects default `report_only` before dynamically importing database/cleanup operations. Actual package-script execution now rejects missing flags and fully specified report-only intent with exit 1 and clear fixed messages; a direct cleanup module import also passes under `react-server`. These checks used synthetic encryption/database settings, with no SQL or provider requests. Dynamic imports use `.js` extensions required by the repo's NodeNext compiler. Full lint 1083 files, types 19 tasks and units 18 tasks pass after correcting the initially exposed import-extension/unit-marker failures. Release tooling 104 tests/types remain green. A metadata-only manifest prepared for candidate `6efa83e` was never activated or used for a campaign; it is distinct from the failed run `90a51cda` and was superseded by the fresh manifest for the final corrected source below.


### 161f final independent review and protected online verification

Reviewer approved runtime candidate `c0ce9a13b7b188d4805bf74d0d85d9cbeac68d69`. Independent uncached verification passed: lint 1083 files, full typecheck 19 tasks, full units 18 tasks, package boundaries, release tooling 104 cases and tooling types, and four application builds with command-only synthetic variables. Generated formatting noise was restored exactly to the frozen candidate after builds. Actual standalone missing-intent and fully specified default report-only CLI rejection checks passed, as did direct cleanup module import; no database configuration was needed for the rejection checks.

Protected online Neon campaign `aa4e28f1-b3f7-45c1-92ce-db5290c8b91a` exited zero: **26 files and 207 tests across six uncached tasks**, comprising app 2, feeds 15, Xero 50, availability 21, database 45 and jobs 74. Fresh manifest evidence covered 53 owned tenant scopes and 145 global keys. Durable ownership, consumer isolation and restore evidence were verified before execution and again at closure. Restore evidence used timeline `73cb5a3404beeb6412275bed23ffa160`, LSN `0/4A536A40`. All 20 applied migration checksums matched, with zero pending migrations.

Independent post-run dry-run verification confirmed all 38 cleanup selectors zero, including Redis namespaces. The outside-owned catalogue digest remained `41e95ac3737a446c207e103f8c13538b2b04933b005a7de9f737beeafbc8bb8e`; the active-run Redis fence was null. Read-only schema comparison exited zero with `No difference detected`. The initial failed campaign and guarded recovery remain recorded above; the unused metadata-only manifest is not represented as an executed campaign.

Final documentation copies the reviewer's completed plan and index exactly and closes the task review. Runtime and tests remain byte-identical to the approved live-tested candidate. No real Xero management token acquisition, targeted provider DELETE, customer credential mutation, production namespace activation, deployment, merge or push was performed. Actual app management authorisation and Plan 160 browser scenarios remain **NOT VERIFIED**; remote cleanup continues to default to `report_only`.
