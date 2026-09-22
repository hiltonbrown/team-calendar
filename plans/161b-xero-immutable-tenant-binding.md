# Plan 161b: Make the internal payroll-to-Xero-tenant binding immutable and database-enforced

> **Executor instructions**: Follow this plan step by step. Run every verification command and
> confirm the expected result before moving to the next step. If anything in "STOP conditions"
> occurs, stop and report - do not improvise. When done, update the status row for this plan in
> `plans/README.md` unless a reviewer dispatched you and told you they maintain the index.
>
> **Drift check (run first)**:
> ```bash
> git diff --stat 8652c31..HEAD -- \
>   packages/xero/src/oauth packages/database/prisma packages/database/src
> ```
> At the time this plan was written that diff was empty. If it is now non-empty, compare the
> "Current state" excerpts below against the live code before proceeding. A mismatch is a STOP
> condition.

## Status

- **Priority**: P1 - this is the release-blocking correctness defect in the programme
- **Effort**: L
- **Risk**: HIGH (schema migration, backfill, and a behaviour change on a live onboarding path)
- **Depends on**: `plans/161a-xero-baseline-and-fixture-ownership.md`
- **Category**: bug, security, migration
- **Planned at**: commit `8652c31`, 22 September 2026 (re-stamped from `585f6cb`; the only changes between those commits are under `plans/`, so every source excerpt below is valid at both)
- **Programme charter**: `plans/161-harden-xero-connection-lifecycle.md`

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

Inside its transaction, at `packages/xero/src/oauth/service.ts:563-579`:

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

The `update` branch changes `xero_tenant_id` on an existing row. Nothing rejects it.

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
  organisation    Organisation     @relation(fields: [organisation_id], references: [id])
  xero_connection XeroConnection   @relation(fields: [xero_connection_id], references: [id])
  sync_cursors    XeroSyncCursor[]
  leave_balances  LeaveBalance[]
  sync_runs       SyncRun[]

  @@index([clerk_org_id])
  @@index([organisation_id])
  @@index([xero_tenant_id])
  @@map("xero_tenants")
}
```

Note `@@index([xero_tenant_id])` is a plain index, **not** unique. `XeroConnection`
(`schema.prisma:461-493`) is `@unique` on `organisation_id`, and `XeroTenant` is `@unique` on
`xero_connection_id`, so the one-connection-per-organisation and one-tenant-per-connection
invariants already hold. What is missing is any constraint tying an **external** Xero tenant to
at most one active internal binding.

### Existing tests to extend

- `packages/xero/src/oauth/service.test.ts` - unit tests for the OAuth service
- `packages/xero/src/oauth/service.integration.test.ts` - guarded database tests
- `packages/database/xero-tenancy.integration.test.ts` - existing tenancy invariant tests

### Repository conventions to match

- Service functions return `Result<T, E>` from `@repo/core`. Do not throw for expected failures.
- Named exports only. No default exports. Strict TypeScript, no `any`, no unjustified `as`.
- Zod on all external input. Tables `snake_case` plural, columns `snake_case`.
- Every tenant-scoped table carries `clerk_org_id` (text, not null, indexed).
- **Every query that touches tenant data filters by `clerk_org_id`** and, where applicable,
  `organisation_id`.
- Integration tests in `packages/database` live at the **package root**, not under `src/`.
- Australian English. **No em dashes anywhere.** No `console.log`.
- One migration per schema change. Never hand-edit a generated migration.

## Commands you will need

**Fresh worktree setup.** This repository's `.env*` files are gitignored (`.gitignore:35`), so
a new worktree has none of them. Before running any gate, from the worktree root:

```bash
bun install --frozen-lockfile
```

`bun run test`, `bun run check`, `bun run typecheck` and `bun run boundaries` then work with no
further setup. **`bun run build` additionally requires two variables**, because
`packages/xero/keys.ts:74` validates at module load whenever `NODE_ENV` is not `test`, and
`packages/database/keys.ts:10` has no fallback:

- `DATABASE_URL` - any syntactically valid Postgres URL is enough for a build; the client is
  lazy and nothing connects. Do **not** point it at the real database.
- `XERO_TOKEN_ENCRYPTION_KEY` - any 32-byte base64 value is enough for a build.

Supply them for the build command only. **Do not create a committed `.env` file, do not copy the
developer's real values, and do not make either variable optional in `keys.ts` to avoid setting
them.**

**Two commands are not local gates and appear in no Done criteria here.**
`bun run preflight <app|api|web>` is a production deployment gate: it requires a positional
argument and the production-only variables `NEXT_PUBLIC_LAUNCH_MODE`, four Sentry variables and
three Better Stack variables. `bun run test:release` is a deployed-candidate Playwright suite:
`tooling/release/e2e/environment.ts:11-17` requires six `TC_*` variables validated when the
config is merely loaded, and `tooling/release/playwright.config.ts:22-33` declares Firefox and
WebKit projects whose browsers are not installed by default. Both run during the Plan 161h
rollout and the Plan 160 campaign. **Never stub either to make it run locally.**

| Purpose | Command | Expected on success |
|---|---|---|
| Lint | `bun run check` | exit 0 |
| Types | `bun run typecheck` | exit 0 |
| Xero units | `bun run --cwd packages/xero test` | exit 0 |
| Database units | `bun run --cwd packages/database test` | exit 0 |
| Database integration (guarded) | `bun run --cwd packages/database test:integration` | exit 0 |
| Xero integration (guarded) | `bun run --cwd packages/xero test:integration` | exit 0 |
| Apply reviewed migration | `bun run migrate:deploy` | exit 0, on the authorised target only |
| Whitespace | `git diff --check` | exit 0 |

`bun run migrate:deploy` runs `prisma generate && prisma migrate deploy`. It is the **only**
migration command permitted in this plan.

## Scope

**In scope:**
- `packages/xero/src/oauth/service.ts`
- `packages/xero/src/oauth/service.test.ts`
- `packages/xero/src/oauth/service.integration.test.ts`
- `packages/database/prisma/schema.prisma`
- `packages/database/prisma/migrations/` (new additive migration only)
- `packages/database/src/queries/` and its export wrappers
- `packages/database/xero-lifecycle-migration.integration.test.ts` (create, at package root)
- `packages/database/xero-tenancy.integration.test.ts`
- `plans/README.md` (status row only)

**Out of scope - do NOT touch:**
- `packages/xero/src/crypto/`, `rate-limit/`, `adapter/` - those are 161c, 161e and 161g.
- Credential storage and refresh. This plan does not move a single token. That is 161d.
  You will see credential columns on `XeroConnection`; leave every one of them exactly as is.
- Any remote Xero call. This plan adds no HTTP.
- `packages/availability/`, `packages/jobs/` - caller migration is 161g.
- **Dropping or renaming any existing column.** This migration is purely additive.

## Git workflow

- Branch: `codex/xero-connection-hardening` (shared across 161a–161h).
- Conventional commits, one logical change per commit. Suggested sequence:
  `test(xero): add failing wrong-file reconnect regression`, then
  `fix(xero): reject cross-file reconnect in tenant selection`, then
  `feat(database): add xero tenant binding ownership constraints`.
- Do NOT push or open a PR.

## Steps

### Step 1: Write the failing regression first

Add to `packages/xero/src/oauth/service.test.ts`, modelled on the existing
`completeXeroTenantSelection` tests already in that file.

Test: an `Organisation` already bound to external tenant `XERO-AAA` completes a selection naming
external tenant `XERO-BBB`. Assert the call returns `{ ok: false }` with error code
`tenant_replacement_required`, **and** that the transaction left everything untouched: the
`XeroTenant.xero_tenant_id` is still `XERO-AAA`, credentials are unchanged, the OAuth session is
not consumed, and no sync was dispatched.

**Verify**: `bun run --cwd packages/xero test` → fails on the new test only. That failure proves
the defect is real. Record the failure output in `plans/161-xero-execution-report.md`.

### Step 2: Add the typed outcomes

Add three error codes to the `XeroOAuthError` union in `packages/xero/src/oauth/service.ts`:

- `tenant_replacement_required` - the selection names a different external tenant than the one
  this organisation is already bound to
- `tenant_binding_conflict` - the selected external tenant is already reserved by another
  internal binding
- `connection_changed` - the binding generation moved under this request

Follow the existing union's shape and keep the existing codes untouched.

Conflict messages must be generic. `tenant_binding_conflict` must not reveal which Clerk
organisation, which user, or which payroll entity holds the other reservation.

**Verify**: `bun run --cwd packages/xero test` → still fails only on the Step 1 test.
`bun run typecheck` → exit 0.

### Step 3: Guard the selection transaction

In `completeXeroTenantSelection`, inside the existing transaction and **before** the
`tx.xeroTenant.upsert` call:

1. Read the current `XeroTenant` for this organisation, scoped by `clerk_org_id` **and**
   `organisation_id`.
2. If one exists and its `xero_tenant_id` differs from `selectedTenant.tenantId`, return
   `{ ok: false, error: { code: "tenant_replacement_required", ... } }` and let the transaction
   roll back. Do not consume the session, do not write credentials, do not dispatch sync.
3. Change the `upsert`'s `update` branch so it **no longer sets `xero_tenant_id`**. It may still
   update `tenant_name` and `payroll_region`. After step 2 those are the only fields that can
   legitimately change on reconnect.

Also revalidate inside the transaction, before claiming the session: the user, the Clerk
organisation, the caller's current role, the intended organisation, session expiry and
single-use status, and that the selected tenant's region is AU. Do not trust a cached UI
selection or a caller-supplied tenant ID as authority.

If an initial-binding intent created a new `Organisation` in this transaction and the selection is
then rejected, the rollback must remove it. Assert this.

**Verify**: `bun run --cwd packages/xero test` → exit 0, including the Step 1 test.

### Step 4: Add the schema constraints

In `packages/database/prisma/schema.prisma`, add to `XeroTenant`:

- `active_slot Int?` - `1` while the binding is reserved, `NULL` after retirement
- `binding_generation Int @default(1)` - monotonic per internal connection; never restarts at 1
  after a retirement or reconnect
- `provider_app_id String` - the configured Xero app this binding belongs to
- `@@unique([provider_app_id, xero_tenant_id, active_slot])`

Because `active_slot` is nullable, PostgreSQL treats each `NULL` as distinct, so any number of
**retired** historical rows for the same external tenant coexist while at most one **reserved**
row can exist. That is the intended semantics; test it explicitly in Step 6.

**Verify**: `bunx prisma format --schema=packages/database/prisma/schema.prisma` succeeds and
`bunx prisma validate --schema=packages/database/prisma/schema.prisma` exits 0.

### Step 5: Generate the migration and add the CHECK by hand

Generate base SQL with the pinned Prisma tooling. **Confirm the installed flag syntax first**:

```bash
bunx prisma migrate diff --help
```

Use a schema-to-schema diff, or a read-only diff from the configured datasource to the target
schema. `migrate dev`, `db push`, reset, rebaseline and seed are prohibited.

Prisma cannot express the `active_slot` domain constraint. Add it as explicit, separately
reviewed SQL in the same migration file:

```sql
ALTER TABLE "xero_tenants"
  ADD CONSTRAINT "xero_tenants_active_slot_check"
  CHECK ("active_slot" IS NULL OR "active_slot" = 1);
```

Read the generated SQL end to end before applying it. Confirm there is **no** `DROP`, no column
rename, and no unrelated drift. If there is, STOP.

Backfill `provider_app_id` and `active_slot` in an idempotent backfill with a dry-run mode, a
collision report and restart checkpoints. Add the unique constraint **only after** the collision
report is clean.

If the report finds two reserved bindings for the same `(provider_app_id, xero_tenant_id)`:
quarantine both, report the count and the affected `organisation_id` values, and STOP. Never
pick a winner automatically, never merge data, never fabricate an owner.

**Verify**: `bun run migrate:deploy` on the authorised target → exit 0. Then confirm the
constraints exist and payroll row counts are unchanged.

### Step 6: Prove the constraints in a database test

Create `packages/database/xero-lifecycle-migration.integration.test.ts` (package root, per
convention - model it on the existing `packages/database/xero-tenancy.integration.test.ts`).
It was registered in `LIVE_FIXTURE_SUITES` by plan 161a; use its owned fixture slot.

**Verify**: `bun run --cwd packages/database test:integration` → exit 0.

### Step 7: Lifecycle integrity

- A callback that started **before** a disconnect cannot re-enable its old generation. Enforce by
  comparing `binding_generation` inside the transaction and returning `connection_changed`.
- A binding keeps its reservation while it is active, permission-required,
  reauthorisation-required, paused, or has cleanup pending. Retire (set `active_slot = NULL`)
  only once the disconnect contract is satisfied. 161f owns that contract; here, just make sure
  nothing else sets `active_slot` to `NULL`.
- Reconnecting after a **completed** disconnect is a fresh same-file intent, and must allocate a
  new, higher `binding_generation`.

**Verify**: `bun run --cwd packages/xero test && bun run --cwd packages/xero test:integration`
→ exit 0.

## Test plan

Unit tests in `packages/xero/src/oauth/service.test.ts` (model on the existing selection tests):

1. Wrong-file reconnect returns `tenant_replacement_required` and mutates nothing (Step 1).
2. Same-file reconnect succeeds and preserves `XeroTenant.id`, people links and feed identity.
3. A rejected initial-binding selection rolls back the `Organisation` it created.
4. A selection whose session has expired, is already consumed, or names a tampered intended
   organisation is rejected before any write.
5. A callback carrying a stale `binding_generation` returns `connection_changed`.
6. The `tenant_binding_conflict` message contains no Clerk organisation ID, user ID, payroll
   entity name or authoriser identity. Assert on the message string.

Database tests in `packages/database/xero-lifecycle-migration.integration.test.ts`:

7. The `active_slot` CHECK rejects `0`, `2` and `-1`, and accepts `1` and `NULL`.
8. Two reserved rows for the same `(provider_app_id, xero_tenant_id)` violate the unique
   constraint. Assert the constraint name in the error.
9. **Many retired rows** (`active_slot = NULL`) for the same `(provider_app_id, xero_tenant_id)`
   coexist alongside one reserved row. This is the case a naive unique index would break.
10. Two concurrent transactions racing to reserve the same external tenant: exactly one wins.
    Use a real database barrier, not a sleep.
11. `binding_generation` is monotonic per connection and does not restart at 1 after retirement.
12. Backfill is idempotent: running it twice produces the same rows, and every pre-existing
    payroll ID is preserved.

## Done criteria

All must hold:

- [ ] `bun run check` exits 0
- [ ] `bun run typecheck` exits 0
- [ ] `bun run --cwd packages/xero test` exits 0, including all six new unit tests
- [ ] `bun run --cwd packages/database test:integration` exits 0, including all six new database tests
- [ ] `bun run --cwd packages/xero test:integration` exits 0
- [ ] `git diff --check` exits 0
- [ ] `grep -n "xero_tenant_id: selectedTenant.tenantId" packages/xero/src/oauth/service.ts` returns **exactly one** match - the `create` branch. The `update` branch match is gone.
- [ ] `grep -c "DROP " packages/database/prisma/migrations/*/migration.sql` returns 0 for the new migration
- [ ] `git status --short` shows no modified file outside the In scope list
- [ ] `plans/README.md` status row for 161b updated

## STOP conditions

Stop and report; do not improvise:

- `completeXeroTenantSelection` no longer exists at `packages/xero/src/oauth/service.ts:380`, or
  the `upsert` `update` branch no longer matches the excerpt. Report the current code.
- The backfill collision report finds existing duplicate reserved bindings. Quarantine them,
  report the count and affected `organisation_id` values, and stop. **Never choose a winner.**
- The generated migration SQL contains any `DROP`, column rename, or change to a table this plan
  does not name. Report the exact SQL.
- Applying the migration would require `migrate dev`, `db push`, reset, rebaseline or seeding.
- A database test would need to touch a record the fixture manifest does not own.
- **The assumption that one external Xero payroll tenant maps to at most one active internal
  binding turns out to be false for this product.** That is a charter-level product decision
  (charter Section 3, "Non-negotiable product and security boundaries"), not something to resolve here. If the backfill shows legitimate existing
  multi-binding use, stop and escalate.
- You are about to make a remote Xero call. This plan adds no HTTP.

## Maintenance notes

- **`binding_generation` and token version are different fences and must never be conflated.**
  Binding generation fences payroll access and local lifecycle changes. Token version (added in
  161d) fences credential adoption. Comparing one against the other is a bug that will look
  correct in review.
- The nullable `active_slot` pattern is load-bearing. Anyone who "tidies" it into a non-nullable
  boolean, or replaces the partial-uniqueness semantics with a plain unique index, breaks
  retirement history. The Step 6 test with many `NULL` rows is what catches that.
- Once this lands, **no rollback may restore silent payroll-file replacement.** Reverting the
  service guard without reverting the constraint produces confusing database errors; reverting
  both reintroduces the data-mixing defect. If this must be rolled back, roll back the whole
  branch and say so.
- In review, scrutinise: the migration SQL, the `update` branch of the `upsert`, and the
  conflict message strings (an information leak here discloses another customer's existence).
- Deferred: cross-account transfer and replacement-file workflows are explicitly out of the
  programme. If a customer genuinely needs to move payroll files, that needs its own plan.
