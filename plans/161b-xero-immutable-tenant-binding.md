# Plan 161b: Make the internal payroll-to-Xero-tenant binding immutable and database-enforced

> **Executor instructions**: Follow this plan step by step. Run every verification command and
> confirm the expected result before moving to the next step. If anything in "STOP conditions"
> occurs, stop and report - do not improvise. When done, update the status row for this plan in
> `plans/README.md` unless a reviewer dispatched you and told you they maintain the index.
>
> **Drift check (run first)**:
> ```bash
> git diff --stat 6b934be..HEAD -- \
>   packages/xero/src/oauth packages/database/prisma packages/database/src \
>   packages/database/xero-tenancy.integration.test.ts
> ```
> At the time this plan was revised that diff was empty. If it is now non-empty, compare the
> "Current state" excerpts below against the live code before proceeding. A mismatch is a STOP
> condition.

## Status

- **Priority**: P1 - this is the release-blocking correctness defect in the programme
- **Effort**: L
- **Risk**: HIGH (schema migration, backfill, and a behaviour change on a live onboarding path)
- **Depends on**: `plans/161a-xero-baseline-and-fixture-ownership.md` (DONE)
- **Category**: bug, security, migration
- **Planned at**: commit `6b934be`, 23 September 2026 (reviewed and re-stamped from `8652c31`; every excerpt below was re-read at `6b934be`)
- **Programme charter**: `plans/161-harden-xero-connection-lifecycle.md`

### Execution reconciliation, 23 September 2026

The user explicitly authorised using the database configured in the local environment files as a **development** database for this execution, including data-changing validation. This supersedes this plan's `LOCAL_OK` prerequisite for that target only. Do not print or copy credentials. Before applying a migration or backfill, identify the target without exposing its URL, inspect applied migrations and existing tenant bindings, and preserve the migration and backfill ordering. The production rollout ordering below still applies to production.

The repository's integration-test guard does not accept a remote URL with `ALLOW_LOCAL_DATABASE_TESTS=1`. Do not disable or spoof that guard. Remote integration tests must use the existing protected live-run machinery in `tooling/release/`, with its manifest, fixture ownership, durable read-back and consumer-isolation checks. If that machinery cannot be satisfied, complete all independent implementation and checks, record the database suites as `NOT VERIFIED`, and continue reconciliation of the verification path without claiming `DONE`.

Review of executor commit `a1fdf33` found a correctness gap in this plan: the reservation unique index prevents duplicate active rows, but still permits an `UPDATE` that changes one row's `xero_tenant_id` to an unreserved value. That violates this plan's immutability claim. The added Step 5a, migration C and test 12 close the gap. They supersede the earlier instruction that migration B alone completes database enforcement.

## Why this matters

A Team Calendar `Organisation` is a payroll entity. It owns exactly one `XeroConnection`, which
owns exactly one `XeroTenant`. Today, when someone reconnects that organisation to Xero and picks
a **different** Xero file from the consent screen, `completeXeroTenantSelection` silently
overwrites `xero_tenant_id` on the existing `XeroTenant` row. Every person, availability record,
leave balance and calendar feed already attached to that tenant row stays attached - and now
points at a different company's payroll data.

There is no database constraint preventing this and no application check that rejects it. The
fix is two-part and both parts are required: reject the replacement in the service layer inside
the same transaction, and add a database constraint so no future code path can reintroduce it.

**Design decision already made (do not revisit):** the binding lives on the **existing**
`XeroTenant` row. There is no new `XeroTenantBinding` table. Plans 161d and 161f extend this same
row. Because `XeroTenant` and `XeroConnection` rows are never deleted by disconnect today
(`disconnectXeroOAuthConnection` deletes leave balances, person matches, sync runs and cursors,
not the tenant or connection row), a counter stored on the row stays monotonic across
disconnect and reconnect.

## Current state

### The defect

`packages/xero/src/oauth/service.ts:380` declares the selection entry point:

```typescript
export async function completeXeroTenantSelection(input: {
  clerkOrgId: string;
  organisationId?: null | string;
  sessionId: string;
  tenantId: string;
  userId: string;
}): Promise<
  Result<
    {
      connectionId: string;
      organisationId: string;
      returnTo: string;
      xeroTenantId: string;
    },
    XeroOAuthError
  >
>
```

Before the transaction, the function already (a) loads the session, (b) calls Xero once to infer
the payroll region (`service.ts:432-454`) and rejects anything other than `AU` with
`invalid_country`, and (c) resolves whether to create or reuse an `Organisation`
(`resolveOrganisationForTenantSelection`, `service.ts:455-463`). Keep all three exactly as they
are. **Do not repeat the region call inside the transaction**; this plan adds no HTTP.

The transaction starts at `service.ts:477`. In order, it:

1. claims the session with `tx.xeroOAuthSession.updateMany({ data: { status: "completed" }, where: { clerk_org_id, created_by_user_id, expires_at: { gt: now }, id, status: "pending" } })` (`:479-491`) and returns `{ ok: false, reason: "session" }` if nothing was claimed;
2. creates or re-reads the `Organisation` (`:493-506`), throwing `OrganisationSelectionRaceError` if the row is missing;
3. upserts `XeroConnection` **including encrypted credentials** (`:512-561`);
4. upserts `XeroTenant` (`:563-579`):

```typescript
const nextTenant = await tx.xeroTenant.upsert({
  create: {
    clerk_org_id: input.clerkOrgId,
    organisation_id: organisationId,
    payroll_region: payrollRegion,
    tenant_name: selectedTenant.tenantName,
    xero_connection_id: nextConnection.id,
    xero_tenant_id: selectedTenant.tenantId,
  },
  select: { id: true },
  update: {
    payroll_region: payrollRegion,
    tenant_name: selectedTenant.tenantName,
    xero_tenant_id: selectedTenant.tenantId,   // <-- the defect
  },
  where: { xero_connection_id: nextConnection.id },
});
```

**How rollback works in this function (load-bearing).** `database.$transaction(async (tx) => ...)`
commits whenever the callback **returns**, including when it returns an `{ ok: false }` value.
Only a **thrown** error rolls back. The existing pattern is a private sentinel class,
`class OrganisationSelectionRaceError extends Error {}` at `service.ts:119`, thrown at `:508` and
mapped to a typed error in the `catch` at `:607-615`. Every other thrown error becomes
`unknown_error` (`:617-623`). Your guard must follow that sentinel pattern. Returning early from
the callback would commit the session claim, the new organisation and the overwritten credentials,
which is exactly what this plan forbids.

### The error union

`packages/xero/src/oauth/service.ts:84-99`:

```typescript
export type XeroOAuthError =
  | { code: "already_refreshed"; message: string }
  | { code: "connect_disabled"; message: string }
  ...
  | { code: "tenant_not_found"; message: string }
  | { code: "unknown_error"; message: string };
```

The connect action `apps/app/app/(authenticated)/settings/integrations/xero/connect/_actions.ts:65-71`
flattens every error code to `unknown_error` but **passes `result.error.message` through to the
user**. So the `message` strings you write are user-facing copy: Australian English, no em dash,
no internal identifiers. You do not need to edit that action.

### Where the OAuth session is created

`completeXeroOAuth` (`service.ts:165`) runs on the OAuth callback. After token exchange it creates
the `XeroOAuthSession` row at `service.ts:209` with `organisation_id: state.value.organisationId`.
That is where this plan records the binding generation the session was issued against.

### The schema as it stands

`packages/database/prisma/schema.prisma:495-527`:

```prisma
model XeroTenant {
  id                 String         @id @default(uuid()) @db.Uuid
  clerk_org_id       String
  organisation_id    String         @db.Uuid
  xero_connection_id String         @unique @db.Uuid
  xero_tenant_id     String
  tenant_name        String?
  payroll_region     payroll_region
  // ... sync cursors, staleness and error fields ...
  @@index([clerk_org_id])
  @@index([organisation_id])
  @@index([xero_tenant_id])
  @@map("xero_tenants")
}
```

`@@index([xero_tenant_id])` is a plain index, **not** unique. `XeroConnection`
(`schema.prisma:461-493`) is `@unique` on `organisation_id`, and `XeroTenant` is `@unique` on
`xero_connection_id`. What is missing is any constraint tying an **external** Xero tenant to at
most one reserved internal binding. `XeroOAuthSession` is at `schema.prisma:529-559` and has no
generation field. `enum xero_connection_status` (`schema.prisma:35-41`) is
`pending | pending_tenant_selection | active | stale | disconnected`.

Existing migrations are named `YYYYMMDDHHMMSS_snake_case_name/migration.sql`, for example
`packages/database/prisma/migrations/20260919110000_harden_outbound_recovery/`.

### Where "provider app ID" comes from

The provider app ID is the configured Xero OAuth **client ID**, `XERO_CLIENT_ID`
(`packages/xero/keys.ts:42,49`). A client ID is an identifier, not a secret. It is optional in
`keys.ts` because connect is disabled without it; any code path that writes a binding already
requires it. Plans 161d and 161e reuse this exact definition. Do not invent a second setting.

### Tests to extend, and how they run

- `packages/xero/src/oauth/service.test.ts` - **unit tests with a fully mocked database**
  (`vi.mock("@repo/database")` at the top; `$transaction` is mocked to call the callback with the
  mock). A unit test **cannot** prove rollback. `dbMock.xeroTenant` only has `upsert`; add
  `findFirst` to the mock for the new read.
- `packages/xero/src/oauth/service.integration.test.ts` - real database, allocated through
  `allocateLiveTestFixture("packages/xero/src/oauth/service.integration.test.ts")`. It currently
  owns **one** tenant slot. This plan raises it to two (Step 6).
- `packages/database/xero-tenancy.integration.test.ts` - existing tenancy invariant tests, real
  database, package root.
- `packages/database/xero-lifecycle-migration.integration.test.ts` - create. Already registered in
  `LIVE_FIXTURE_SUITES` (`packages/database/src/live-test-fixture.ts:35-46`) with two tenant
  slots and one `provider_app` global key. Read owned global keys with
  `fixture.globalKey("provider_app")` (index 0 only; values look like `local_provider_app_N`).
  `fixture.id(...)` returns unowned per-suite UUIDs and must not be used for global keys.

### Repository conventions to match

- Service functions return `Result<T, E>` from `@repo/core`. Do not throw for expected failures
  **across a function boundary**; the sentinel throw above is internal to one function and is the
  established exception.
- Named exports only. No default exports. Strict TypeScript, no `any`, no unjustified `as`.
- Tables `snake_case` plural, columns `snake_case`.
- **Every query that touches tenant data filters by `clerk_org_id`** and, where applicable,
  `organisation_id`.
- Integration tests in `packages/database` live at the **package root**, not under `src/`.
- Australian English. **No em dashes anywhere.** No `console.log`.
- `CLAUDE.md` says "never hand-edit generated migrations". In this plan the migration SQL is
  produced by `prisma migrate diff` into a file **you** create, and the CHECK and guard blocks are
  appended as clearly commented, separately reviewed SQL. That is authoring, not editing a
  `migrate dev` output, and it is the only way to express a CHECK in Prisma.

## Commands you will need

**Fresh worktree setup.** `.env*` files are gitignored (`.gitignore:35`), so a new worktree has
none. From the worktree root:

```bash
bun install --frozen-lockfile
```

`bun run test`, `bun run check`, `bun run typecheck` and `bun run boundaries` then work with no
further setup. `bun run build` additionally needs `DATABASE_URL` (any syntactically valid Postgres
URL) and `XERO_TOKEN_ENCRYPTION_KEY` (any 32-byte base64 value, e.g. from
`openssl rand -base64 32`). Supply them for that command only. **Do not create a committed `.env`
file, do not copy the developer's real values, and do not make either variable optional.**

**Local integration database (required for every `test:integration` and `migrate:deploy` below).**
The integration guard (`packages/database/src/live-test-guard.ts:69-79`) only permits a
**localhost** `DATABASE_URL`; anything else throws. Use the same throwaway setup as CI
(`.github/workflows/ci.yml:17-33`):

```bash
docker run -d --name tc-161-pg -p 5432:5432 \
  -e POSTGRES_USER=team-calendar -e POSTGRES_PASSWORD=team-calendar \
  -e POSTGRES_DB=team-calendar_test postgres:16
export DATABASE_URL=postgresql://team-calendar:team-calendar@localhost:5432/team-calendar_test
echo "$DATABASE_URL" | grep -q '@localhost:5432/' && echo LOCAL_OK   # must print LOCAL_OK
bun run migrate:deploy                                               # applies all migrations locally
```

`packages/database/prisma.config.ts` loads `packages/database/.env` if present, but an exported
`DATABASE_URL` takes precedence. **Always export it and check `LOCAL_OK` in the same shell before
`migrate:deploy`.** Never run `migrate:deploy` against any non-localhost database in this plan.

If Docker or a local Postgres is unavailable, do every non-integration step, record each
integration gate as `NOT_VERIFIED: no local database` in `plans/161-xero-execution-report.md`,
and set this plan's README status to `BLOCKED (integration gates not run)`, never `DONE`.

A `test:integration` run that **collects zero tests from a file this plan names** is a failure,
not a pass. Check the Vitest file list in the output.

**Not local gates.** `bun run preflight <app|api|web>` (production variables) and
`bun run test:release` (deployed candidate) run during the Plan 161h rollout and the Plan 160
campaign. Never stub either to make it run locally.

| Purpose | Command | Expected on success |
|---|---|---|
| Lint | `bun run check` | exit 0 |
| Types | `bun run typecheck` | exit 0 |
| Xero units | `bun run --cwd packages/xero test` | exit 0 |
| Database units | `bun run --cwd packages/database test` | exit 0 |
| Prisma validate | `(cd packages/database && bunx prisma validate)` | exit 0 |
| Apply migrations (local only) | `bun run migrate:deploy` | exit 0, after `LOCAL_OK` |
| Database integration | `bun run --cwd packages/database test:integration` | exit 0, named files collected |
| Xero integration | `bun run --cwd packages/xero test:integration` | exit 0, named files collected |
| Release tooling | `bun run test:release-tools` | exit 0 (may need to run outside a restricted sandbox: one IPC test binds a local socket) |
| Whitespace | `git diff --check` | exit 0 |

Run Prisma CLI commands from `packages/database` (as `migrate:deploy` does); the Prisma 7 config
file `packages/database/prisma.config.ts` is resolved relative to the working directory.

## Scope

**In scope:**
- `packages/xero/src/oauth/service.ts` - `completeXeroTenantSelection`, `loadPendingSession`
  (select one more column), `completeXeroOAuth` (session creation only), the `XeroOAuthError`
  union and a new private sentinel class
- `packages/database/generated/` (regenerated by `prisma generate`; it is tracked in git)
- Existing tests that create `XeroTenant` rows directly, **only** to add `provider_app_id`
  (Step 5): `packages/jobs/src/handlers/{reconcile-xero-approval-state,schedule-xero-syncs,sync-xero-people,sync-xero-leave-balances,sync-xero-leave-records}.integration.test.ts`,
  `packages/xero/src/oauth/disconnect.integration.test.ts`, `packages/xero/src/oauth/service.test.ts`
- `packages/xero/src/oauth/service.test.ts`
- `packages/xero/src/oauth/service.integration.test.ts`
- `packages/database/prisma/schema.prisma` (`XeroTenant`, `XeroOAuthSession` only)
- `packages/database/prisma/migrations/<timestamp>_add_xero_tenant_binding_reservation/` (create)
- `packages/database/prisma/migrations/<timestamp>_enforce_xero_tenant_binding_reservation/` (create)
- `packages/database/prisma/migrations/<later timestamp>_prevent_xero_tenant_rebinding/` (create, Step 5a)
- `packages/database/scripts/backfill-xero-tenant-binding.ts` (create)
- `packages/database/src/xero-tenant-binding-backfill.ts` and `.test.ts` (create; the pure,
  testable backfill logic the script calls)
- `packages/database/package.json` (one script entry for the backfill)
- `packages/database/src/live-test-fixture.ts` (Step 6 allocation changes only) and `packages/database/src/live-test-fixture.test.ts` (only if
  an exact count assertion needs updating)
- `packages/database/xero-lifecycle-migration.integration.test.ts` (create, at package root)
- `packages/database/xero-tenancy.integration.test.ts`
- `tooling/release/integration-inventory.ts` and `integration-inventory.test.ts` (add the one new
  suite to the allowlist; see Step 6)
- `plans/161-xero-execution-report.md` (append a 161b section)
- `plans/README.md` (status row only)

**Out of scope - do NOT touch:**
- `packages/xero/src/crypto/`, `rate-limit/`, `adapter/` - those are 161c, 161e and 161g.
- Credential storage and refresh. This plan does not move a single token. That is 161d.
  You will see credential columns on `XeroConnection`; leave every one of them exactly as is.
- Any remote Xero call. This plan adds no HTTP.
- `apps/`, `packages/availability/`, and `packages/jobs/` source (only the five test files above).
- The disconnect function. Setting `active_slot = NULL` (retirement) is 161f's job.
- **Dropping or renaming any existing column.** Both migrations are additive or tightening only.

## Git workflow

- Branch: `codex/xero-connection-hardening` (shared across 161a-161h; it exists locally and may
  be behind `main` by plan-only commits: run `git merge --ff-only main` on it first). Run 161b and
  161c **one after the other**, not in parallel: both edit `completeXeroTenantSelection`,
  `loadPendingSession` and `service.integration.test.ts`, and share the local database.
- Conventional commits, one logical change per commit. Suggested sequence:
  `test(xero): add failing wrong-file reconnect regression`, then
  `fix(xero): reject cross-file reconnect in tenant selection`, then
  `feat(database): add xero tenant binding reservation columns`, then
  `feat(database): enforce one reserved binding per xero tenant`.
- Do NOT push or open a PR.

## Steps

### Step 1: Write the failing regression first

In `packages/xero/src/oauth/service.test.ts`, next to the existing `completeXeroTenantSelection`
tests, add `dbMock.xeroTenant.findFirst` to the hoisted mock and one test:

An existing organisation whose `XeroTenant` has `xero_tenant_id: "XERO-AAA"` completes a selection
naming `"XERO-BBB"`. Assert the call returns `{ ok: false }` with
`error.code === "tenant_replacement_required"`, and that `dbMock.xeroTenant.upsert` was **not**
called.

**Verify**: `bun run --cwd packages/xero test` → fails on the new test only. Paste the failing
assertion into a new "161b" section of `plans/161-xero-execution-report.md`.

### Step 2: Add the typed outcomes

Add three members to `XeroOAuthError` (insert them in alphabetical position among the existing members):

- `tenant_replacement_required` - message: "This payroll entity is already connected to a
  different Xero file. Connect the original Xero file, or add a new payroll entity for this one."
- `tenant_binding_conflict` - message: "This Xero file is already connected in Team Calendar and
  cannot be connected again." Must not reveal which Clerk organisation, user or payroll entity
  holds it.
- `connection_changed` - message: "This Xero connection changed while you were connecting.
  Start the connection again."

Add a private sentinel next to `OrganisationSelectionRaceError`:

```typescript
class TenantSelectionRejectedError extends Error {
  readonly code:
    | "connection_changed"
    | "tenant_binding_conflict"
    | "tenant_replacement_required";
  constructor(code: TenantSelectionRejectedError["code"]) {
    super(code);
    this.code = code;
  }
}
```

**Verify**: `bun run typecheck` → exit 0. `bun run --cwd packages/xero test` → still fails only on
the Step 1 test.

### Step 3: Add the schema columns (migration A, additive)

In `schema.prisma`, add to `XeroTenant`:

```prisma
  provider_app_id    String?
  active_slot        Int?
  binding_generation Int       @default(1)
  retired_at         DateTime?
  retirement_reason  String?
```

and to `XeroOAuthSession`:

```prisma
  expected_binding_generation Int?
```

Do **not** add the unique constraint yet. `provider_app_id` stays nullable in this migration
because existing rows need a backfill first.

Generate the SQL as a **schema-to-schema** diff, so objects that exist only in raw migration SQL
(for example the partial unique indexes in `migrations/00000000000000_init/migration.sql`) can
never appear as spurious `DROP`s. Check the flag syntax first
(`(cd packages/database && bunx prisma migrate diff --help)`), then:

```bash
SCRATCH=$(mktemp -d)
git show HEAD:packages/database/prisma/schema.prisma > "$SCRATCH/before.prisma"   # before your edit is committed
mkdir -p packages/database/prisma/migrations/<timestamp>_add_xero_tenant_binding_reservation
(cd packages/database && bunx prisma migrate diff \
  --from-schema "$SCRATCH/before.prisma" --to-schema prisma/schema.prisma --script) \
  > packages/database/prisma/migrations/<timestamp>_add_xero_tenant_binding_reservation/migration.sql
```

Do the same for migration B in Step 5, with `before.prisma` taken after migration A's schema
change is committed.

Use a `<timestamp>` later than the newest existing migration. Append, under a comment
`-- Reviewed by hand: Prisma cannot express CHECK constraints`:

```sql
ALTER TABLE "xero_tenants"
  ADD CONSTRAINT "xero_tenants_active_slot_check"
  CHECK ("active_slot" IS NULL OR "active_slot" = 1);
```

Read the file end to end. It must contain only `ALTER TABLE` statements adding the six new columns
(Prisma may combine several `ADD COLUMN` clauses in one statement) plus the CHECK. **No `DROP`, no rename, nothing touching other tables.**

**Verify**:
- `(cd packages/database && bunx prisma validate)` → exit 0
- `grep -c "DROP " packages/database/prisma/migrations/<timestamp>_add_xero_tenant_binding_reservation/migration.sql` → `0`
- `bun run migrate:deploy` (after `LOCAL_OK`) → exit 0

### Step 4: Guard the selection transaction

In `completeXeroOAuth`, when creating the session at `service.ts:209`: if
`state.value.organisationId` is set, read that organisation's `XeroTenant`
(`where: { clerk_org_id: state.value.clerkOrgId, organisation_id: state.value.organisationId }`,
`select: { binding_generation: true }`) and store its `binding_generation` in
`expected_binding_generation` (null when there is no tenant yet). Nothing else in that function
changes.

Add `expected_binding_generation: true` to the `select` in `loadPendingSession`
(`service.ts:1911`) and to its return type, so the selection can read it.

In `completeXeroTenantSelection`, inside the transaction, **after** the organisation is resolved
(step 2 of the transaction) and **before** the `XeroConnection` upsert:

1. `const existing = await tx.xeroTenant.findFirst({ where: { clerk_org_id: input.clerkOrgId, organisation_id: organisationId }, select: { active_slot: true, binding_generation: true, xero_tenant_id: true } })`.
2. If `existing` and `existing.xero_tenant_id !== selectedTenant.tenantId` →
   `throw new TenantSelectionRejectedError("tenant_replacement_required")`. This holds whether
   the existing binding is reserved or retired: a retired binding can only be revived for the
   **same** file.
3. If `existing` and `session.expected_binding_generation !== null` and
   `existing.binding_generation !== session.expected_binding_generation` →
   `throw new TenantSelectionRejectedError("connection_changed")`.
4. Pre-check the reservation:
   `tx.xeroTenant.findFirst({ where: { provider_app_id: providerAppId, xero_tenant_id: selectedTenant.tenantId, active_slot: 1, NOT: { organisation_id: organisationId } }, select: { id: true } })`.
   If found → `throw new TenantSelectionRejectedError("tenant_binding_conflict")`. This query
   deliberately spans Clerk organisations; it selects only `id` and nothing from it is returned.
   `providerAppId` is `keys().XERO_CLIENT_ID`; it is always set on this path because connect is
   disabled without it. If it is somehow undefined, return `oauth_not_configured` **before** the
   transaction.

Then change the `XeroTenant` upsert:

- `create` adds `provider_app_id: providerAppId`, `active_slot: 1` (and leaves
  `binding_generation` at its default of 1).
- `update` **no longer sets `xero_tenant_id`**. It sets `tenant_name`, `payroll_region`,
  `provider_app_id: providerAppId`, `active_slot: 1`, `retired_at: null`,
  `retirement_reason: null` and **always** `binding_generation: { increment: 1 }`. Every
  successful same-file reconnect is a new generation, whether the binding was reserved or
  retired. That is what lets later plans fence work issued against the previous generation (161f's
  cleanup worker relies on it).

Extend the `catch` (`service.ts:607`):

- `if (error instanceof TenantSelectionRejectedError)` → return
  `{ ok: false, error: { code: error.code, message: <the Step 2 message for that code> } }`.
- The concurrent-race case: wrap **only** the `tx.xeroTenant.upsert` call in a `try`/`catch`
  inside the transaction; if the error has `code === "P2002"` (the repository idiom checks only the
  code, e.g. `packages/database/src/queries/outbound-operations.ts:143-148`; use a structural check
  `typeof error === "object" && error !== null && "code" in error && error.code === "P2002"`, not
  an `instanceof` against `Prisma`, which the unit-test mock does not export), throw
  `new TenantSelectionRejectedError("tenant_binding_conflict")`; otherwise rethrow. That upsert
  touches only one unique key that a race can violate, so no constraint-name parsing is needed.

Because every rejection throws, the session claim, any newly created `Organisation` and the
credential upsert all roll back. Do not add any other early return inside the transaction.

**Verify**: `bun run --cwd packages/xero test` → exit 0, including the Step 1 test.

### Step 5: Backfill, then enforce (migration B)

Create the pure logic in `packages/database/src/xero-tenant-binding-backfill.ts`:

```typescript
export function planXeroTenantBindingBackfill(rows: readonly {
  id: string;
  organisation_id: string;
  xero_tenant_id: string;
  connection_status: "pending" | "pending_tenant_selection" | "active" | "stale" | "disconnected";
  provider_app_id: string | null;
  active_slot: number | null;
}[], providerAppId: string): {
  updates: { id: string; provider_app_id: string; active_slot: 1 | null }[];
  collisions: { xero_tenant_id: string; organisation_ids: string[] }[];
}
```

Rules: every row gets `provider_app_id = providerAppId` if null. A row is **reserved**
(`active_slot = 1`) unless its connection status is `disconnected`, in which case it is retired
(`active_slot = null`). A collision is two or more rows that would be reserved for the same
`xero_tenant_id`. Rows already carrying the target values produce no update (idempotent).

Create `packages/database/scripts/backfill-xero-tenant-binding.ts`, a thin CLI that:

- takes `--provider-app-id <value>` (required; the operator passes the deployment's
  `XERO_CLIENT_ID`) and `--dry-run` (default **on**; `--apply` switches it off);
- reads `xero_tenants` joined to `xero_connections.status`, in pages of 500 ordered by `id`;
- prints counts and the collision report (`xero_tenant_id` count and affected `organisation_id`
  values only; no tenant names, no tokens);
- with `--apply` and **zero collisions**, writes updates in one transaction per page; with any
  collision it writes nothing and exits 2.

Add `"backfill:xero-tenant-binding": "bun scripts/backfill-xero-tenant-binding.ts"` to
`packages/database/package.json`. Construct the Prisma client the way
`packages/database/src/client.ts` does (it is `server-only`, so do not import it): `PrismaPg` when
`isLocalDatabase(DATABASE_URL)` (`packages/database/src/is-local-database.ts`), `PrismaNeon`
otherwise. Require `DATABASE_URL` to be exported in the shell and do **not** load
`packages/database/.env`. Parse arguments with `node:util` `parseArgs`.

Now make `provider_app_id` required and add the constraint in `schema.prisma`:

```prisma
  provider_app_id    String
  ...
  @@unique([provider_app_id, xero_tenant_id, active_slot], map: "xero_tenants_reserved_binding_key")
```

Generate migration B into `<later timestamp>_enforce_xero_tenant_binding_reservation/migration.sql`
with the same schema-to-schema diff as in Step 3, then **prepend** this reviewed guard so a deploy that skipped the backfill
fails loudly instead of failing half-way:

```sql
-- Reviewed by hand: refuse to tighten until the backfill has run
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "xero_tenants" WHERE "provider_app_id" IS NULL) THEN
    RAISE EXCEPTION 'xero_tenants.provider_app_id is null; run backfill:xero-tenant-binding first';
  END IF;
END $$;
```

Read the file: it must contain the guard, one `ALTER COLUMN ... SET NOT NULL` and one
`CREATE UNIQUE INDEX "xero_tenants_reserved_binding_key"`. Nothing else.

Migration B makes `provider_app_id` required, so every existing test that creates a `XeroTenant`
directly must supply it. Find them with
`grep -rln "xeroTenant.create\|xeroTenant.upsert\|xeroTenant.createMany" packages apps --include=*.test.ts`
(expected: the five jobs integration suites, `disconnect.integration.test.ts`,
`service.test.ts`, `xero-tenancy.integration.test.ts`). Add
`provider_app_id: process.env.XERO_CLIENT_ID ?? "test-xero-client-id"` to each create and leave
`active_slot` unset (so `NULL`, never colliding on the unique key). Change nothing else in those
files. If the grep returns a file not listed here, STOP and report it.

Because `active_slot` is nullable and PostgreSQL treats `NULL`s as distinct in a unique index,
any number of **retired** rows for the same external tenant coexist while at most one
**reserved** row can exist. Do not add `NULLS NOT DISTINCT`. That is the intended semantics.

**Production ordering (record it in the execution report; do not perform it).** Migration A must
ship separately from B and C: deploy A, run the backfill dry-run, run it with `--apply` only if
the collision report is empty, then deploy B and C together. Do not deploy B alone as a claim of
immutable binding. Plan 161h's rollout procedure must be updated to reference both B and C.

**Verify**:
- Against the local database (after `LOCAL_OK`):
  `bun run --cwd packages/database backfill:xero-tenant-binding --provider-app-id local-check`
  → exit 0 and prints a dry-run report (the table is empty or holds only fixture rows).
- `bun run --cwd packages/database test` → exit 0, including new
  `src/xero-tenant-binding-backfill.test.ts` cases: idempotent second pass produces zero updates;
  `disconnected` rows are retired; two reservable rows for one tenant produce one collision and
  zero updates for those rows.
- `grep -c "DROP " packages/database/prisma/migrations/<timestamp>_enforce_xero_tenant_binding_reservation/migration.sql` → `0`
- `bun run migrate:deploy` (after `LOCAL_OK`) → exit 0

### Step 5a: Enforce row-level immutability (review reconciliation)

The unique reservation index does not reject a direct update from Xero file A to unreserved file
B on the same `xero_tenants` row. Add a third, additive migration after B named
`<later timestamp>_prevent_xero_tenant_rebinding`. Prisma cannot express an OLD-versus-NEW
constraint, so this migration consists only of a reviewed PostgreSQL trigger function and its
`BEFORE UPDATE OF xero_tenant_id` trigger on `xero_tenants`. Reject the change when
`NEW.xero_tenant_id IS DISTINCT FROM OLD.xero_tenant_id`; return `NEW` otherwise. Raise a stable,
named `23514` constraint error (`xero_tenants_xero_tenant_id_immutable`) with a generic message
that contains no tenant ID or customer data. Never rewrite existing `xero_tenant_id` values.

Add database integration test 12 below. On the authorised development database, apply migration
C after checking the target and migration history, then use one explicit SQL transaction with
`ROLLBACK` to prove that changing a fixture row to an unreserved tenant ID is rejected by the
named trigger, while setting the same ID is accepted. Check that the transaction left no probe
rows. This direct SQL probe is additional evidence; it is not a PASS for the protected integration
suite.

**Verify**: Prisma validation, `bun run check`, `bun run typecheck`, the database unit suite,
`git diff --check`, and migration C contains no `DROP`, rename, or change to another table. The
protected database integration suite must collect and pass test 12 before 161b is marked DONE.

### Step 6: Prove the constraints and the rollback against a real database

1. In `packages/database/src/live-test-fixture.ts`:
   - `"packages/xero/src/oauth/service.integration.test.ts": { tenants: 1 }` →
     `{ globalKeys: { provider_app: 1 }, tenants: 2 }`;
   - `"packages/database/xero-lifecycle-migration.integration.test.ts"`: `tenants: 2` → `3`, and
     its `provider_app: 1` → `2` (keep every other key count).
   Run `bun run --cwd packages/database test`; if an exact-count assertion in
   `live-test-fixture.test.ts` fails, update only that number. In
   `service.integration.test.ts`, set `process.env.XERO_CLIENT_ID = allocation.globalKey("provider_app")`
   in `beforeAll` (after allocation; `keys()` re-reads `process.env` on each call) so every binding
   it reserves uses an owned provider app ID, and derive external tenant IDs from
   `allocation.id("provider-tenant", n)` rather than literals.
2. Create `packages/database/xero-lifecycle-migration.integration.test.ts`, modelled on
   `packages/database/xero-tenancy.integration.test.ts` (same `allocateLiveTestFixture` usage and
   `cleanTestData` pattern scoped by `clerk_org_id`). Use `fixture.tenants[0]` and
   `fixture.tenants[1]` and `fixture.globalKey("provider_app")` as `provider_app_id`. Write
   database tests 7-11 from the Test plan.
3. In `packages/xero/src/oauth/service.integration.test.ts`, add service tests 1-5 from the Test
   plan using the two tenant slots. These are the tests that prove rollback; the unit mock cannot.
4. Register the new suite with the release tooling. `tooling/release/integration-inventory.ts`
   holds `EXPECTED_INTEGRATION_TESTS`, a reviewed allowlist that must **exactly** equal the
   discovered `*.integration.test.ts` files (21 today), and the error text
   `"...reviewed 21-suite allowlist"`. Insert
   `"packages/database/xero-lifecycle-migration.integration.test.ts"` in sorted position (after
   `packages/database/src/seed/seed.integration.test.ts`, before
   `packages/database/xero-tenancy.integration.test.ts`; confirm against the discovered order the
   test prints), change `21-suite` to `22-suite` in both `integration-inventory.ts` and
   `integration-inventory.test.ts`. Nothing else in `tooling/release/` changes.

**Verify**: `bun run test:release-tools` → exit 0.
`bun run --cwd packages/database test:integration` and
`bun run --cwd packages/xero test:integration` → both exit 0, and the output lists
`xero-lifecycle-migration.integration.test.ts` and `service.integration.test.ts` with non-zero
test counts.

## Test plan

Unit (`packages/xero/src/oauth/service.test.ts`, mocked database):

- U1. Wrong-file reconnect returns `tenant_replacement_required` and never calls
  `xeroTenant.upsert` (Step 1).
- U2. Stale `expected_binding_generation` returns `connection_changed`.
- U3. Pre-check hit returns `tenant_binding_conflict`; assert the message contains none of: the
  other row's `organisation_id`, any Clerk org ID, any user ID.
- U4. Same-file reconnect calls `upsert` with an `update` branch that has **no** `xero_tenant_id`
  key (assert on the mock's call argument).
- U5. `completeXeroOAuth` writes `expected_binding_generation` from the existing tenant.

Service integration (`packages/xero/src/oauth/service.integration.test.ts`, real database):

1. Wrong-file reconnect: `XeroTenant.xero_tenant_id` unchanged, `XeroConnection` credential
   columns byte-identical to before, and the `XeroOAuthSession` still `status: "pending"`.
2. Same-file reconnect succeeds and preserves `XeroTenant.id`.
3. Initial binding (organisation created in this transaction) that hits
   `tenant_binding_conflict` because tenant slot 2 already reserves the same external tenant:
   the new `Organisation` row does **not** exist afterwards.
4. Expired, already-consumed, and other-user sessions are rejected and nothing is written.
5. Same-file reconnect of a reserved binding increments `binding_generation` from N to N+1;
   reviving a retired binding (`active_slot` set to `NULL` in test setup) sets `active_slot = 1`
   and also increments it.

Database (`packages/database/xero-lifecycle-migration.integration.test.ts`, real database):

7. The `active_slot` CHECK rejects `0`, `2` and `-1`, and accepts `1` and `NULL`. Assert the
   constraint name `xero_tenants_active_slot_check`.
8. Two reserved rows for the same `(provider_app_id, xero_tenant_id)` violate
   `xero_tenants_reserved_binding_key`. Assert the name in the error.
9. Retired rows (`active_slot = NULL`) for the same pair on tenant slots 1 and 2 coexist with one
   reserved row on slot 3 (one organisation, connection and tenant row per slot).
10. Two concurrent transactions reserving the same external tenant: exactly one commits. Use two
    `database.$transaction` calls coordinated by a `pg_advisory_lock` barrier or a
    `SELECT ... FOR UPDATE` on a shared row, not a sleep.
11. The same `xero_tenant_id` under two **different** `provider_app_id` values
    (`fixture.globalKey("provider_app", 0)` and `fixture.globalKey("provider_app", 1)`) may both be
    reserved (the key is per configured app).
12. Directly updating an existing `XeroTenant.xero_tenant_id` to a different, unreserved external
    tenant ID fails with `xero_tenants_xero_tenant_id_immutable`; writing the same ID succeeds.
    Assert the existing row and its attached internal ID are unchanged after rejection.

## Done criteria

All must hold:

- [x] `bun run check` exits 0
- [x] `bun run typecheck` exits 0
- [x] `bun run --cwd packages/xero test` exits 0, including U1-U5
- [x] `bun run --cwd packages/database test` exits 0, including the backfill unit tests
- [x] `bun run --cwd packages/database test:integration` exits 0 and lists `xero-lifecycle-migration.integration.test.ts` with 5+ tests
- [x] `bun run --cwd packages/xero test:integration` exits 0 and lists `service.integration.test.ts`
- [x] `bun run test:release-tools` exits 0 (the inventory allowlist includes the new suite)
- [x] `git diff --check` exits 0
- [x] `grep -c "DROP " <each of the three new migration.sql files>` prints `0` for all three
- [x] migration C rejects direct `xero_tenant_id` changes, allows same-value updates, and contains no `DROP`
- [x] `grep -n "class TenantSelectionRejectedError" packages/xero/src/oauth/service.ts` returns one match
- [x] `awk '/xeroTenant.upsert/,/where: \{ xero_connection_id/' packages/xero/src/oauth/service.ts | grep -c "xero_tenant_id: selectedTenant.tenantId"` prints `1` (the `create` branch only)
- [x] `git status --short -- . ':!plans'` shows no modified file outside the In scope list (plan files may carry reviewer edits)
- [x] `plans/161-xero-execution-report.md` has a 161b section with the Step 1 failure output and the production ordering note
- [x] `plans/README.md` status row for 161b updated

## STOP conditions

Stop and report; do not improvise:

- `completeXeroTenantSelection` no longer starts at `service.ts:380`, the transaction no longer
  matches the four-part order in "Current state", or the upsert `update` branch no longer matches
  the excerpt.
- The backfill dry-run against any database finds a collision. Report the count and affected
  `organisation_id` values. **Never choose a winner, never merge, never fabricate an owner.**
- A generated migration contains any `DROP`, rename, or change to a table other than
  `xero_tenants` and `xero_oauth_sessions`. Report the SQL.
- Applying a migration would require `migrate dev`, `db push`, reset, rebaseline or seeding, or
  `LOCAL_OK` does not print.
- A database test would need to touch a record the fixture manifest does not own.
- **The assumption that one external Xero payroll tenant maps to at most one reserved internal
  binding per app turns out to be false for this product** (for example, the backfill shows
  legitimate multi-binding use). That is a charter-level product decision (charter Section 3), not
  something to resolve here.
- You are about to make a remote Xero call, or to edit disconnect. Neither is in this plan.

## Maintenance notes

- **`binding_generation` and token version are different fences and must never be conflated.**
  Binding generation fences payroll access and local lifecycle changes. Token version (added in
  161d) fences credential adoption.
- **The binding lives on `XeroTenant`.** 161d adds the credential-owner and provider-connection
  references to this row; 161f retires it by setting `active_slot = NULL`, `retired_at`,
  `retirement_reason` and incrementing `binding_generation`. Nobody creates a parallel binding
  table.
- **Every successful selection increments `binding_generation`.** 161f's disconnect increments it
  too. Do not "optimise" the reconnect increment away; queued cleanup and sync work is fenced on it.
- 161d moves the capture of `expected_binding_generation` from the callback to the OAuth start
  (a persisted intent before redirect). Until then, a disconnect that completes between OAuth
  start and callback is treated as a fresh reconnect, which is acceptable because the user has
  just consented again.
- The nullable `active_slot` pattern is load-bearing. Replacing it with a boolean, or adding
  `NULLS NOT DISTINCT`, breaks retirement history. Database test 9 catches that.
- Rejections must **throw** the sentinel inside the transaction. A refactor that turns them into
  early returns commits the session claim and credential overwrite; service integration test 1
  catches it, the unit tests do not.
- Once this lands, **no rollback may restore silent payroll-file replacement.** If this must be
  rolled back, roll back the whole branch and say so.
- In review, scrutinise: both migration files, the `update` branch of the upsert, the sentinel
  `catch` mapping, and the conflict message (an information leak discloses another customer).
- Deferred: cross-account transfer and replacement-file workflows are explicitly out of the
  programme.
