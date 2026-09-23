# Plan 161d: Introduce a canonical Xero credential owner and make OAuth adoption safe

> **Executor instructions**: Follow this plan step by step. Run every verification command and
> confirm the expected result before moving to the next step. If anything in "STOP conditions"
> occurs, stop and report - do not improvise. When done, update the status row for this plan in
> `plans/README.md` unless a reviewer dispatched you and told you they maintain the index.
>
> **Drift check (run first)**:
> ```bash
> git log --oneline 6b934be..HEAD -- packages/xero packages/database/prisma apps/api/app/api/xero
> ```
> Expect commits from 161b and 161c only. Confirm 161b's columns exist
> (`grep -n "binding_generation\|active_slot\|expected_binding_generation" packages/database/prisma/schema.prisma`
> returns matches) and 161c's keyring exists (`ls packages/xero/src/crypto/keyring.ts`). Then
> re-check every `file:line` in "Current state"; 161b and 161c moved lines in `oauth/service.ts`,
> so locate each excerpt by its function name and treat a changed **body** as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: L (the largest plan in the programme; see Maintenance notes on splitting)
- **Risk**: HIGH (credential migration; a mistake here logs every customer out of Xero)
- **Depends on**: `plans/161b-xero-immutable-tenant-binding.md` (binding columns on `XeroTenant`,
  `provider_app_id`, `expected_binding_generation`) and
  `plans/161c-xero-deadlines-and-key-versioning.md` (keyring, `decryptXeroToken` with a required `keyVersion` argument,
  `XeroDeadline`, `reencryptXeroTokens`). Both must be DONE.
- **Category**: security, bug, migration
- **Planned at**: commit `6b934be`, 23 September 2026 (reviewed and re-stamped from `8652c31`; excerpts re-read at `6b934be`, before 161b and 161c)
- **Programme charter**: `plans/161-harden-xero-connection-lifecycle.md`

## Why this matters

OAuth credentials are stored per internal `XeroConnection`, and refresh locks are keyed the same
way. But Xero issues one token set per **authorising Xero user**, covering every tenant that user
has connected. When a customer with two payroll files reauthorises the second one, Xero rotates
the refresh token the first file was also relying on. Each connection refreshes independently,
races the other, and one ends up holding a dead refresh token.

The current persistence-recovery logic also treats a change in stored ciphertext as proof that
this attempt's refresh committed:

```typescript
// packages/xero/src/oauth/service.ts:922-924, inside reconcileRefreshPersistenceFailure
const tokenChanged =
  input.loadedRefreshTokenEncrypted !== null &&
  current.refresh_token_encrypted !== input.loadedRefreshTokenEncrypted;
```

An unrelated reconnect, a 161c re-encryption pass, or a scrubbed column all satisfy that. The
process then reports a rotation it never performed.

This plan separates the credential identity (one per configured app and verified Xero authoriser)
from the payroll binding (one per internal organisation, on `XeroTenant`, from 161b), so
credentials are coordinated without any binding gaining access it should not have.

## Design decisions already made (do not revisit)

1. **The binding is `XeroTenant`** (161b). Do **not** create a `XeroTenantBinding` model. This
   plan adds two nullable references to `XeroTenant`: `xero_credential_owner_id` and
   `xero_provider_connection_id`.
2. **Provider app ID is `XERO_CLIENT_ID`**, the same value 161b writes to
   `XeroTenant.provider_app_id`.
3. **Authoriser identity comes from the access token.** The app requests no `openid` scope
   (`service.ts:25-28` lists `offline_access` and payroll scopes), so there is no ID token. Xero
   access tokens are JWTs signed by `https://identity.xero.com`; the stable user identifier is the
   `xero_userid` claim. Step 3 confirms this against Xero's documentation before relying on it.
   **Do not add `openid`, `profile` or `email` scopes.**
4. **Transition by mirror-write, not a flag.** Until 161g migrates every reader, legacy code still
   decrypts tokens from `XeroConnection` columns. So whenever the owner coordinator adopts or
   refreshes a token set, it writes the same envelope into the `XeroConnection` rows of every
   **reserved** binding that references that owner, in the same transaction. Only the coordinator
   ever calls Xero's token endpoint for an owned binding. A binding with
   `xero_credential_owner_id = NULL` (not yet backfilled) keeps today's per-connection refresh
   unchanged. 161h scrubs the mirrored columns after 161g lands.
5. **Refresh recovery runs from the existing cron.** No new Inngest function. The existing
   `schedule-xero-syncs` job (cron every 15 minutes) calls one new exported function. No Vercel
   cron.

## Current state

### Where credentials live

`packages/database/prisma/schema.prisma:461-493`, `XeroConnection` (before 161b/161c):

```prisma
model XeroConnection {
  id                               String                 @id @default(uuid()) @db.Uuid
  clerk_org_id                     String
  organisation_id                  String                 @unique @db.Uuid
  status                           xero_connection_status @default(pending)
  access_token_encrypted           String                 @default("")
  access_token_iv                  String?
  access_token_auth_tag            String?
  refresh_token_encrypted          String                 @default("")
  refresh_token_iv                 String?
  refresh_token_auth_tag           String?
  xero_authorisation_connection_id String?
  token_key_version                Int                    @default(1)
  token_encrypted_at               DateTime?
  expires_at                       DateTime
  last_refreshed_at                DateTime?
  // ... status, error and lifecycle timestamps ...
}
```

`XeroOAuthSession` (`schema.prisma:529-559`) carries a parallel set of encrypted token columns plus
`available_tenants_json` (each entry `{ connectionId, tenantId, tenantName }`),
`selected_tenant_id`, `expires_at` and, after 161b, `expected_binding_generation`. It is created in
`completeXeroOAuth` on the **callback**, after token exchange.

### The OAuth start

`apps/api/app/api/xero/oauth/start/route.ts` checks the caller is an admin or owner, then calls the
**synchronous** `buildXeroOAuthStartUrl({ clerkOrgId, organisationId, returnTo, userId })`
(`service.ts:121`), sets an `xero_oauth_nonce` cookie and redirects. Nothing is persisted before
the redirect; the signed `state` carries the intent.

### The refresh path

- `refreshXeroOAuthConnection` (`service.ts:655`) and `ensureFreshXeroConnection`
  (`service.ts:1068`) take `pg_advisory_xact_lock` keyed on the **connection ID**
  (`service.ts:669`, `:1149`; disconnect uses the same key at `:1315`), call `exchangeToken`
  inside `$transaction(..., { timeout: 15_000 })` (`:694`, `:1246`), and on an ambiguous
  persistence failure call `reconcileRefreshPersistenceFailure` (`:885`, not exported; reached via
  `:698` and `:1250`).
- Inside it, lines 987-1003 run an `updateMany` that **uses** `refresh_token_encrypted:
  input.loadedRefreshTokenEncrypted` as a compare-and-set filter in its `where`, and sets
  `expires_at: now` and `last_error_code: "refresh_persist_failed"`.
- The existing unit test `service.test.ts:1199` ("recovers rotated credentials when proactive
  refresh persistence is ambiguous") is the model for Step 1.

### Everyone who calls the refresh functions

`ensureFreshXeroConnection`: `adapter/xero-write-adapter.ts:76`, `adapter/auth-recovery.ts`,
`packages/jobs/src/handlers/schedule-xero-syncs.ts:225`, `sync-xero-people.ts:662`,
`sync-xero-leave-balances.ts:560`, `sync-xero-leave-records.ts:742`,
`reconcile-xero-approval-state.ts:233`. `refreshXeroOAuthConnection`:
`apps/app/app/(authenticated)/settings/integrations/xero/_actions.ts:79`.

Because all of them go through these two functions, rewiring the two functions onto the owner
coordinator changes refresh behaviour for every caller **without touching the callers**. That is
the point of this plan. Callers that decrypt tokens themselves (`au/read.ts`, `au/write.ts`,
`nz/read.ts`, `uk/read.ts`, and the jobs above at e.g. `sync-xero-people.ts:702`) keep working
because of the mirror-write. 161g migrates them.

### Fixture and inventory state

- `packages/xero/src/oauth/credential-owner.integration.test.ts` is registered in
  `LIVE_FIXTURE_SUITES` (`packages/database/src/live-test-fixture.ts`) with 2 tenant slots and
  global keys `credential_owner`, `oauth_attempt`, `provider_app`. It is **not** yet in the
  release inventory allowlist `tooling/release/integration-inventory.ts` (`EXPECTED_INTEGRATION_TESTS`).
- Plan 161a requires 161d to add its new tables to the owned-fixture cleanup path. Owned global
  keys are read with `fixture.globalKey(kind)` (index 0 only: each kind is allocated once), **not**
  `fixture.id(...)`, which returns unowned per-suite UUIDs. Use `fixture.globalKey("credential_owner")`
  as the owner row `id`, and set `process.env.XERO_CLIENT_ID = fixture.globalKey("provider_app")`
  in the suite's `vi.hoisted` block so every owner and provider-connection row carries an owned
  `provider_app_id`. The suite's `afterAll` deletes only rows with that `provider_app_id` or those
  IDs, following the `cleanTestData` pattern in `packages/database/xero-tenancy.integration.test.ts`.
- `jose` is present in `bun.lock` only as a transitive dependency.

### Repository conventions to match

- `Result<T, E>` from `@repo/core`. Named exports only. Strict TypeScript, no `any`.
- Zod on all external input, including every JWT claim set.
- Branded domain IDs are declared in `packages/core/index.ts:25-29`. Add `XeroCredentialOwnerId`
  there the same way.
- Tables `snake_case` plural, columns `snake_case`, `id`/`created_at`/`updated_at` on every table.
- **Every tenant-scoped table carries `clerk_org_id`.** This plan introduces the one deliberate
  exception (Step 2).
- Integration tests co-located under `src/` in `packages/xero`.
- Australian English. **No em dashes anywhere.** No `console.log`.

## Commands you will need

**Fresh worktree setup.** From the worktree root: `bun install --frozen-lockfile`. `bun run build`
additionally needs a syntactically valid `DATABASE_URL` and a 32-byte base64
`XERO_TOKEN_ENCRYPTION_KEY` (e.g. `openssl rand -base64 32`) for that command only.

**Local integration database (every `test:integration` and `migrate:deploy`).**

```bash
docker run -d --name tc-161-pg -p 5432:5432 \
  -e POSTGRES_USER=team-calendar -e POSTGRES_PASSWORD=team-calendar \
  -e POSTGRES_DB=team-calendar_test postgres:16
export DATABASE_URL=postgresql://team-calendar:team-calendar@localhost:5432/team-calendar_test
echo "$DATABASE_URL" | grep -q '@localhost:5432/' && echo LOCAL_OK   # must print LOCAL_OK
bun run migrate:deploy
```

Never run `migrate:deploy` against a non-localhost database. If no local database is available,
record integration gates `NOT_VERIFIED: no local database` in the execution report and set the
README status `BLOCKED (integration gates not run)`. A run that collects zero tests from a file
this plan names is a failure.

**Not local gates:** `bun run preflight` and `bun run test:release`.

| Purpose | Command | Expected on success |
|---|---|---|
| Lint | `bun run check` | exit 0 |
| Types | `bun run typecheck` | exit 0 |
| Boundaries | `bun run boundaries` | exit 0 |
| Xero units | `bun run --cwd packages/xero test` | exit 0 |
| Database units | `bun run --cwd packages/database test` | exit 0 |
| Prisma validate | `(cd packages/database && bunx prisma validate)` | exit 0 |
| Apply migrations (local) | `bun run migrate:deploy` | exit 0 after `LOCAL_OK` |
| Xero integration | `bun run --cwd packages/xero test:integration` | exit 0, `credential-owner.integration.test.ts` collected |
| Database integration | `bun run --cwd packages/database test:integration` | exit 0 |
| Release tooling | `bun run test:release-tools` | exit 0 |
| Whitespace | `git diff --check` | exit 0 |

## Scope

**In scope:**
- `packages/database/prisma/schema.prisma` and one new additive migration
  `<timestamp>_add_xero_credential_owner/`
- `packages/database/src/queries/xero-credential-owner.ts` (create), its wrapper
  `packages/database/queries/xero-credential-owner.ts`, and the matching `exports` entry in
  `packages/database/package.json`
- `packages/database/src/xero-credential-owner-backfill.ts` and `.test.ts` (create; pure planning
  logic) and `packages/database/scripts/backfill-xero-credential-owner.ts` (create; thin CLI in
  the style of 161b's binding backfill) plus a `backfill:xero-credential-owner` script entry in
  `packages/database/package.json`
- `packages/xero/scripts/plan-legacy-credential-owners.ts` (create) and a
  `plan:legacy-credential-owners` script entry in `packages/xero/package.json`
- `packages/database/xero-lifecycle-migration.integration.test.ts` (add backfill and
  scope-column tests; the suite already owns `credential_owner` and `provider_app` keys)
- `packages/xero/src/oauth/service.ts`
- `packages/xero/src/oauth/identity.ts` and `identity.test.ts` (create; JWT verification)
- `packages/xero/src/oauth/credential-owner.ts` and `credential-owner.test.ts` (create; coordinator,
  resolver, recovery sweep)
- `packages/xero/src/oauth/credential-owner.integration.test.ts` (create)
- `packages/xero/src/oauth/reencrypt-tokens.ts` (extend to the new ciphertext table)
- `packages/xero/src/oauth/service.test.ts`, `service.integration.test.ts`
- `packages/xero/index.ts` (exports), `packages/xero/package.json` (add `jose` as a direct
  dependency), root `bun.lock` (that one addition only)
- `packages/core/index.ts` (the `XeroCredentialOwnerId` brand only)
- `apps/api/app/api/xero/oauth/start/route.ts` (await the now-async start function; nothing else)
- `packages/jobs/src/handlers/schedule-xero-syncs.ts` (one call to `recoverXeroRefreshAttempts`;
  nothing else) and its unit test
- `tooling/release/integration-inventory.ts` and `.test.ts` (add
  `credential-owner.integration.test.ts`; bump the suite count in the message)
- `CLAUDE.md` and `PRODUCT.md` (the `clerk_org_id` exception paragraph only)
- `plans/161-xero-provider-contract.md` (one row: access-token identity claims)
- `plans/161-xero-execution-report.md` (append a 161d section), `plans/README.md` (status row)

**Out of scope - do NOT touch:**
- `packages/xero/src/rate-limit/` - 161e.
- `packages/xero/src/adapter/`, `au/`, `nz/`, `uk/`, `packages/availability/`, and every job
  handler except the one line above. They keep reading mirrored columns until 161g.
- Remote connection **deletion**. 161f owns every DELETE.
- **Dropping or scrubbing the credential columns on `XeroConnection`.** They are the mirror.
- Any real credential rotation or any change to a live customer's consent.

## Git workflow

- Branch: `codex/xero-connection-hardening` (shared across 161a-161h).
- Conventional commits, e.g. `test(xero): prove ciphertext change is not refresh proof`,
  `feat(database): add xero credential owner model`, `feat(xero): verify xero access token identity`,
  `feat(xero): coordinate refresh through credential owner`, `feat(xero): persist oauth intent before redirect`.
- Do NOT push or open a PR.

## Steps

### Step 1: Prove the defective recovery path

In `packages/xero/src/oauth/service.test.ts`, copy the structure of the test at `:1199` and drive
`reconcileRefreshPersistenceFailure` through `ensureFreshXeroConnection` (it is not exported). Two
tests:

1. The re-read row's `refresh_token_encrypted` differs from the loaded value **because it was
   re-encrypted** (same plaintext, `token_key_version` 2). Assert the result is **not** reported
   as a successful rotation.
2. The re-read row's `refresh_token_encrypted` is `""` (the schema default after a scrub). Assert
   not success either.

**Verify**: `bun run --cwd packages/xero test` → fails on exactly these two tests. Paste the output
into a "161d" section of `plans/161-xero-execution-report.md`.

### Step 2: Add the records

Add to `schema.prisma`. The repository convention is "Enums at database level", so the
status fields are Prisma enums with these exact names:

```prisma
enum xero_credential_usability {
  usable
  reauthorisation_required
}

enum xero_refresh_attempt_outcome {
  pending
  superseded
  committed
  lost_response
  failed
}

enum xero_provider_connection_status {
  present
  absent_confirmed
  unknown
}

enum xero_oauth_intent_kind {
  initial_binding
  same_file_reauthorisation
}

enum xero_token_exchange_status {
  not_started
  dispatching
  exchanged
  unknown
}

model XeroCredentialOwner {
  id                        String                    @id @default(uuid()) @db.Uuid
  provider_app_id           String
  xero_user_id              String
  identity_evidence         String                    // "access_token_jwt" | "legacy_access_token_jwt"
  access_token_encrypted    String
  access_token_iv           String
  access_token_auth_tag     String
  refresh_token_encrypted   String
  refresh_token_iv          String
  refresh_token_auth_tag    String
  token_key_version         Int
  token_version             Int                       @default(1)
  last_refresh_attempt_id   String?                   @db.Uuid
  token_expires_at          DateTime
  granted_scopes            String[]
  granted_scopes_known      Boolean                   @default(false)
  usability                 xero_credential_usability @default(usable)
  last_verified_at          DateTime?
  last_adopted_at           DateTime?
  last_rotated_at           DateTime?
  created_at                DateTime                  @default(now())
  updated_at                DateTime                  @updatedAt
  refresh_attempts          XeroRefreshAttempt[]
  provider_connections      XeroProviderConnection[]
  tenants                   XeroTenant[]
  @@unique([provider_app_id, xero_user_id])
  @@map("xero_credential_owners")
}

model XeroRefreshAttempt {
  id                       String                       @id @default(uuid()) @db.Uuid
  xero_credential_owner_id String                       @db.Uuid
  expected_token_version   Int
  dispatched_at            DateTime?
  uncertain_since          DateTime?
  recovery_deadline        DateTime?
  outcome                  xero_refresh_attempt_outcome @default(pending)
  // Previous refresh token kept only for Xero's 30-minute retry grace window; scrubbed after.
  recovery_token_encrypted String?
  recovery_token_iv        String?
  recovery_token_auth_tag  String?
  recovery_key_version     Int?
  created_at               DateTime                     @default(now())
  updated_at               DateTime                     @updatedAt
  owner XeroCredentialOwner @relation(fields: [xero_credential_owner_id], references: [id])
  @@index([outcome, recovery_deadline])
  @@index([xero_credential_owner_id])
  @@map("xero_refresh_attempts")
}

model XeroProviderConnection {
  id                       String                          @id @default(uuid()) @db.Uuid
  provider_app_id          String
  remote_connection_id     String
  xero_tenant_id           String
  tenant_type              String?
  xero_credential_owner_id String?                         @db.Uuid
  auth_event_id            String?
  provider_created_at      DateTime?
  provider_updated_at      DateTime?
  observed_at              DateTime
  observed_via             String                          // "user_inventory" | "management_inventory"
  remote_status            xero_provider_connection_status @default(present)
  created_at               DateTime                        @default(now())
  updated_at               DateTime                        @updatedAt
  owner   XeroCredentialOwner? @relation(fields: [xero_credential_owner_id], references: [id])
  tenants XeroTenant[]
  @@unique([provider_app_id, remote_connection_id])
  @@index([provider_app_id, xero_tenant_id])
  @@index([xero_credential_owner_id])
  @@map("xero_provider_connections")
}
```

Add to `XeroTenant`:

```prisma
  xero_credential_owner_id    String?                 @db.Uuid
  xero_provider_connection_id String?                 @db.Uuid
  credential_owner            XeroCredentialOwner?    @relation(fields: [xero_credential_owner_id], references: [id])
  provider_connection         XeroProviderConnection? @relation(fields: [xero_provider_connection_id], references: [id])
  @@index([xero_credential_owner_id])
  @@index([xero_provider_connection_id])
```

Add to `XeroOAuthSession`: `intent_kind xero_oauth_intent_kind?`, `nonce_hash String?`,
`token_exchange_status xero_token_exchange_status?` (null on rows created before this migration,
which are treated as `exchanged`), and make `token_expires_at` and `available_tenants_json`
nullable (a session now exists before the exchange).

**The deliberate convention exception.** `XeroCredentialOwner`, `XeroRefreshAttempt` and
`XeroProviderConnection` are **system infrastructure**, not customer-owned payroll rows. They get
**no `clerk_org_id`**. Add one paragraph to the Database conventions section of `CLAUDE.md` and to
the data-model section of `PRODUCT.md` naming these three tables and the reason. Add a test to
`packages/database/xero-lifecycle-migration.integration.test.ts` that queries
`information_schema.columns` and asserts every table **except** those three and a fixed,
explicit allowlist of existing non-tenant tables has a `clerk_org_id` column (build the allowlist
from the tables that lack it today and record it in the test).

Generate SQL as in 161b (`migrate diff --from-config-datasource --to-schema --script` from
`packages/database`, into a new `<timestamp>_add_xero_credential_owner/migration.sql`). Read it:
**no `DROP`, no rename**; the nullability relaxations on `xero_oauth_sessions` appear as
`ALTER COLUMN ... DROP NOT NULL`, which is expected and is the only allowed `DROP` text.

**Verify**: `(cd packages/database && bunx prisma validate)` → exit 0.
`grep "DROP" <new migration.sql> | grep -v "DROP NOT NULL"` prints nothing.
`bun run migrate:deploy` (after `LOCAL_OK`) → exit 0.

### Step 3: Verify authoriser identity

First confirm the claim contract. Read Xero's token documentation
(`https://developer.xero.com/documentation/guides/oauth2/token-types`, already cited in
`plans/161-xero-provider-contract.md`) and record one new ledger row: issuer, JWKS URL, expected
`aud`, the `client_id` claim, and the stable user claim (`xero_userid`), with status `DOCUMENTED`.
If the documentation does not establish a stable user identifier claim in the **access token**,
STOP: the whole owner model depends on it.

Add `jose` as a direct dependency of `packages/xero` (`bun add jose --cwd packages/xero`, pinning
the version already in `bun.lock`). Create `packages/xero/src/oauth/identity.ts`:

```typescript
export async function verifyXeroAccessTokenIdentity(
  accessToken: string,
  deps?: { jwks?: JWTVerifyGetKey; now?: () => Date }
): Promise<Result<{ xeroUserId: string; authEventId: string | null; expiresAt: Date }, XeroIdentityError>>;
```

- Issuer and JWKS URL are **constants** from the ledger row; never read a key URL from the token.
- `createRemoteJWKSet` with a cooldown and timeout; a JWKS failure returns an error. **Never skip
  signature verification.**
- Allow `RS256` only (or exactly what the ledger records).
- Check `iss`, `aud`, `exp`/`nbf`, and that `client_id` equals `keys().XERO_CLIENT_ID`.
- Parse the claim set with Zod; `xero_userid` must be a non-empty string.
- A **migration-only** variant `verifyLegacyXeroAccessTokenIdentity` accepts an expired token
  (signature, issuer, audience and client still verified) and returns `expired: true`.

Never group owners by email, Clerk user ID, `auth_event_id`, an unverified claim, or token string
equality.

**Verify**: `bun run --cwd packages/xero test` → exit 0 with `identity.test.ts` covering, using a
locally generated key pair and an injected JWKS: valid token; wrong issuer; wrong audience; wrong
`client_id`; bad signature; `HS256`; JWKS failure (fails closed); missing `xero_userid`.

### Step 4: The owner coordinator and the resolver

In `packages/xero/src/oauth/credential-owner.ts`:

**Lock order** (write it as a comment at the top of the file and follow it everywhere):
credential-owner locks in sorted order, then binding locks (keyed by internal `XeroTenant.id`) in
sorted order, then internal connection locks in sorted order, then OAuth session and cleanup-row
claims. Keys: owner `hashtextextended('xero-owner:' || id, 0)`, binding
`hashtextextended('xero-binding:' || id, 0)`. The **existing** connection lock key
`hashtextextended(connectionId, 0)` (`service.ts:669`, `:1149`, `:1315`) stays exactly as it is;
its comment at `service.ts:1146-1148` requires every token-rotation write path to take it, and
mirror-writes (below) do. Any path that also takes an owner lock takes it **first**. Bound every
lock wait with `SET LOCAL lock_timeout = '<remainingMs(deadline)>ms'` issued as the first statement
of the transaction; a JavaScript timer cannot interrupt `pg_advisory_xact_lock`.

**Mirror-write** (used by refresh and adoption): inside the same transaction, after taking the
connection locks in sorted order, write the owner's `access_token_*`, `refresh_token_*`,
`token_key_version`, `token_encrypted_at`, `expires_at` (from `token_expires_at`) and
`last_refreshed_at` into every `XeroConnection` whose `XeroTenant` has this owner,
`active_slot = 1`, and whose connection has `status` in (`active`, `stale`),
`disconnected_at IS NULL` and `revoked_at IS NULL`. A disconnected connection never receives
tokens again.

`refreshXeroCredentialOwner({ ownerId, expectedTokenVersion, deadline })`:
1. **Transaction A (short, committed before any HTTP):** insert a `XeroRefreshAttempt` with
   `outcome: "pending"`, `expected_token_version`, `dispatched_at: now`, and the current refresh
   token copied into `recovery_token_*` (the grace-window copy). Committing first is what makes
   the attempt durable; if the process dies anywhere after this, recovery can see it.
2. **Transaction B:** take the owner lock (with `lock_timeout`), re-read the owner. If
   `token_version > expectedTokenVersion`, another caller already refreshed: mark this attempt
   `superseded`, scrub its `recovery_token_*`, return the current set (concurrent callers reuse
   the winner). Otherwise call `exchangeToken` with the 161c `XeroDeadline` and an `orgKey` of
   `xero-owner:<ownerId>` (161e replaces this with its `token` rate class).
3. On success, still in B: write the new envelope, `token_version: { increment: 1 }`,
   `last_refresh_attempt_id: <this attempt>`, `last_rotated_at`; mark the attempt `committed` and
   scrub its `recovery_token_*`; mirror-write.
4. On a lost response (a `XeroFetchError` with `dispatched: true`, or no parseable reply): end B
   without writing the owner; in a new short transaction mark the attempt `lost_response`, set
   `uncertain_since` once (never reset on retry) and `recovery_deadline = uncertain_since + 30
   minutes`. The retained token stays.
5. An invalid-grant response sets owner `usability: "reauthorisation_required"`. It says nothing
   about whether remote connections exist. An invalid **client** response
   (`client_credentials_invalid` today) is an app-configuration incident: return the error, write
   nothing to owners or bindings.

A lost **commit** of B shows up as an attempt still `pending` after B's caller saw an error.
Recovery decides it by reading the owner: `last_refresh_attempt_id === attempt.id` and
`token_version === expected_token_version + 1` means committed; otherwise treat as
`lost_response`.

Fix the Step 1 defect: `reconcileRefreshPersistenceFailure` decides success only by that
attempt-ID and token-version rule. Changed ciphertext, an emptied column, or a different attempt is
not proof. For bindings not yet owned (`xero_credential_owner_id IS NULL`), keep the legacy
per-connection logic but remove the ciphertext-inequality success inference there too (treat it as
"unknown: reload and re-check expiry").

Rewire `ensureFreshXeroConnection` and `refreshXeroOAuthConnection`: if the connection's tenant has
an owner, delegate to `refreshXeroCredentialOwner`; otherwise the legacy path. Their exported
signatures and result types do not change.

`resolveXeroAccess({ clerkOrgId, organisationId, expectedBindingGeneration, capability, deadline })`
is exported from `packages/xero` for `packages/xero` internals and `packages/jobs` (161g). It is
**not** called from `apps/`. It:

- loads the `XeroTenant` scoped by both IDs with its `XeroConnection`, and requires
  `active_slot = 1`, connection `status` in (`active`, `stale`), `disconnected_at IS NULL`,
  `revoked_at IS NULL`, and `binding_generation === expectedBindingGeneration` when provided;
- **owned binding**: requires owner `usability: "usable"`, refreshes through the coordinator when
  within 5 minutes of `token_expires_at`, and decrypts the owner envelope;
- **unowned binding** (`xero_credential_owner_id IS NULL`, not yet backfilled): calls the legacy
  `ensureFreshXeroConnection` path and decrypts the connection columns. This keeps unverified
  legacy customers working after 161g moves every caller onto the resolver;
- capability: if `granted_scopes_known` and the capability's scope is absent, return
  `capability_missing`. If scopes are unknown, proceed and let Xero's response decide; the resolver
  never records a capability as granted from unknown data;
- returns `{ accessToken, xeroTenantId, payrollRegion, bindingGeneration, tokenVersion | null }` or
  a typed error (`not_connected`, `disconnected`, `generation_changed`, `reauthorisation_required`,
  `capability_missing`, `configuration_error`). A raw owner ID or external tenant ID is never
  accepted as input.

`recoverXeroRefreshAttempts({ now })`: for attempts `pending` older than 2 minutes, apply the
lost-commit rule above. For `lost_response` with `recovery_deadline > now`, retry the refresh once
with the retained token under the owner lock. After the deadline, scrub `recovery_token_*`, mark
`failed`, and set the owner to `reauthorisation_required`. Call it once from
`schedule-xero-syncs.ts` alongside the existing dormant-rotation call; payloads carry owner IDs
only.

Extend `reencryptXeroTokens` (161c) to cover `xero_credential_owners` and non-null
`recovery_token_*` columns with the same compare-and-set rule (include `token_version` in the
owner `where`).

**Verify**: `bun run --cwd packages/xero test` → exit 0 including both Step 1 tests.
`bun run --cwd packages/jobs test` → exit 0.

### Step 5: Persist the OAuth intent before redirect, and adopt safely

Make `buildXeroOAuthStartUrl` async (no rename). Before returning the URL it creates a
`XeroOAuthSession` with `status: "pending"`, `intent_kind` (`initial_binding` when
`organisationId` is null or the organisation has no `XeroTenant`, else `same_file_reauthorisation`),
`clerk_org_id`, `organisation_id`, `created_by_user_id`, `nonce_hash` (hex SHA-256 of the nonce it
puts in the cookie), `expected_binding_generation` (moved here from the callback),
`token_exchange_status: "not_started"`, and `expires_at: now + 15 minutes` (the same lifetime the
callback uses today). Put the session ID in the signed state. Update the start route to `await` it.

Update `getPendingXeroOAuthSession` (`service.ts:268`) and the internal `loadPendingSession`
(`service.ts:1911`) to select only sessions whose `token_exchange_status` is `exchanged` or `NULL`
(pre-migration rows), so a session created at start is never offered for tenant selection.

On callback, `completeXeroOAuth`:
1. validates signed state, the cookie nonce against the stored `nonce_hash` (constant-time
   compare of the hashes), and expiry;
2. claims the session with an `updateMany` compare-and-set `not_started` → `dispatching`; a second
   callback for the same session finds zero rows and is rejected, so an authorisation code is never
   exchanged twice;
3. exchanges the code. On success sets `exchanged` and **immediately** persists the encrypted
   candidate tokens on the session, before inventory or region discovery. On a
   `XeroFetchError` with `dispatched: true` sets `unknown` and returns an error asking the user to
   start again. A session left in `dispatching` by a crash is treated as `unknown`;
4. verifies identity (Step 3); upserts `XeroCredentialOwner` for `(provider_app_id,
   xero_user_id)` under the owner lock. If an owner exists, **adopt** the candidate only when its
   verified `exp` is later than the owner's `token_expires_at`, or the owner is not usable; arrival
   order and equal `iat` are not proof. Adoption increments `token_version` and mirror-writes.
   Adoption never activates, creates or revives a binding;
5. upserts one `XeroProviderConnection` per inventory entry (`observed_via: "user_inventory"`),
   linking the owner. **Never select a connection by tenant name.**

In `completeXeroTenantSelection`, the `XeroConnection` upsert now writes the **owner's current
envelope** (not the session's candidate tokens) whenever the session's identity resolved to an
owner, so the connection mirror always equals the owner. It also sets `xero_credential_owner_id`
and `xero_provider_connection_id` on the tenant row. 161b's wrong-file guard still applies to the
**selection**; owner adoption in callback step 4 is a separate, earlier operation and may
legitimately change credentials that another file of the same authoriser uses.

Persist requested scopes (the constant list) and granted scopes (from the token response `scope`
field when present; otherwise leave `granted_scopes_known` unchanged). Missing scope data on a
refresh never erases known scopes.

**Verify**: `bun run --cwd packages/xero test` → exit 0.
`bun run --cwd packages/xero test:integration` → exit 0.

### Step 6: Backfill legacy credentials

Two phases, because verification needs `@repo/xero` and `packages/database` must not import it.

**Phase 1** - `packages/xero/scripts/plan-legacy-credential-owners.ts`, run as
`bun run --cwd packages/xero plan:legacy-credential-owners --out <path>`: for each reserved
binding, decrypt the connection's access token, call `verifyLegacyXeroAccessTokenIdentity`, and
write a JSON array of `{ tenantId, xeroUserId: string | null }` to `<path>`. No tokens, no names.
Follow the style of `packages/database/seed.ts` for constructing clients in a script.

**Phase 2** - `packages/database/scripts/backfill-xero-credential-owner.ts`
(`bun run --cwd packages/database backfill:xero-credential-owner --identities <path> --provider-app-id <id>`,
default `--dry-run`, `--apply` to write), calling the pure planner in
`packages/database/src/xero-credential-owner-backfill.ts`.

Planner rules:
- **An expired access token is normal and says nothing about the refresh token** (Xero access
  tokens last 30 minutes; refresh tokens last much longer). A verified identity, expired or not,
  creates or reuses one owner per `(provider_app_id, xero_user_id)` with `usability: "usable"`,
  copying that binding's connection envelope. The first coordinated refresh proves it; an invalid
  grant then sets `reauthorisation_required` through the normal path.
- A group of **one** binding is attached to its owner.
- A group of **two or more** bindings (same Xero user, several payroll files) cannot have its
  canonical set chosen without a live refresh, which this plan does not perform. Leave every
  binding in the group unowned (legacy path, unchanged behaviour) and list the group. These are
  attached later when a user reauthorises (Step 5 adoption) or through a controlled refresh in the
  161h rollout. Never pick by row timestamp.
- Unverifiable rows (`xeroUserId: null`) stay unowned and are listed.
- No Clerk membership and no payroll row is merged. A rerun changes nothing.

**Verify**: `bun run --cwd packages/database test` → exit 0 with planner tests: idempotent rerun,
unverifiable row left unowned, an expired-but-verified single binding owned and `usable`, a
two-binding group left unowned and reported.

### Step 7: Integration evidence

Create `packages/xero/src/oauth/credential-owner.integration.test.ts` using its fixture
allocation (2 tenant slots, `credential_owner`/`oauth_attempt`/`provider_app` keys); delete only
owned keys in `afterAll`. Add it to `tooling/release/integration-inventory.ts` in sorted order and
bump the `N-suite` count in both the message and its test.

**Verify**: `bun run --cwd packages/xero test:integration` → exit 0 listing the new file.
`bun run test:release-tools` → exit 0.

## Test plan

`identity.test.ts` (new): the eight Step 3 cases, plus two tokens with the same email-like claim
but different `xero_userid` produce two identities.

`credential-owner.test.ts` (new, mocked database): lock order is owner before connection in every
exported function (assert call order on the `$queryRaw` mock); invalid client response writes
nothing; `resolveXeroAccess` rejects a stale generation, a retired binding, an unusable owner, and
unknown scope data.

`credential-owner.integration.test.ts` (new, local database):
1. **Same authoriser, two payroll files** (tenant slots 1 and 2 in one Clerk org): one owner,
   both bindings mirror the same envelope, and `resolveXeroAccess` for org A never returns org B's
   tenant ID. Assert both directions.
2. **Same authoriser, two Clerk accounts** (the two tenant slots use different Clerk org IDs): no
   binding, membership or visibility crosses; `resolveXeroAccess` with the other account's IDs
   returns not found.
3. **Authorise B then abandon selection**: A's binding remains usable with the adopted set; B has
   no binding.
4. A candidate with an earlier `exp` than the current owner set is not adopted.
5. Exchange succeeds but persistence of inventory fails: the session keeps the encrypted
   candidate and `token_exchange_status: "exchanged"`; a replayed callback does not exchange again.
6. Two concurrent `refreshXeroCredentialOwner` calls: exactly one token-endpoint call (count on
   the injected fetch), both receive the same `token_version`. Barrier: hold the owner advisory
   lock in a third connection and release it. No sleeps.
7. Lost commit acknowledgement vs lost response vs grace-window expiry produce three different
   attempt outcomes.
8. A re-encryption pass during a refresh does not overwrite the refreshed token.
9. A refresh does not mirror tokens into a binding's connection whose `status` is `disconnected`,
   and `resolveXeroAccess` returns `disconnected` for it.
10. An unowned (legacy) binding still resolves through the legacy refresh path.

`service.test.ts` (extend): the two Step 1 regressions; no token, code, state or nonce in any
log call (spy on the logger) or returned error.

## Done criteria

All must hold:

- [ ] `bun run check`, `bun run typecheck`, `bun run boundaries` exit 0
- [ ] `bun run --cwd packages/xero test` exits 0, including the Step 1 regressions
- [ ] `bun run --cwd packages/database test` and `bun run --cwd packages/jobs test` exit 0
- [ ] `bun run --cwd packages/xero test:integration` exits 0 locally and lists `credential-owner.integration.test.ts`
- [ ] `bun run --cwd packages/database test:integration` exits 0 locally
- [ ] `bun run test:release-tools` exits 0
- [ ] `git diff --check` exits 0
- [ ] `grep -n "model XeroTenantBinding" packages/database/prisma/schema.prisma` returns no matches
- [ ] `grep -n "tokenChanged" packages/xero/src/oauth/service.ts` returns no matches
- [ ] `grep -rn "resolveXeroAccess\|refreshXeroCredentialOwner" apps/ --include=*.ts --include=*.tsx` returns no matches
- [ ] `grep -n "access_token_encrypted" packages/database/prisma/schema.prisma` still shows the `XeroConnection` column
- [ ] `grep -n "xero_credential_owners" CLAUDE.md PRODUCT.md` returns a match in each
- [ ] `git status --short -- . ':!plans'` shows no modified file outside the In scope list, and `plans/` changes are limited to the files this plan names
- [ ] `plans/README.md` status row for 161d updated

## STOP conditions

Stop and report; do not improvise:

- Xero's documentation does not establish a stable user identifier in the access token.
- 161b or 161c is not DONE, or `reconcileRefreshPersistenceFailure` no longer contains the
  ciphertext comparison.
- An identity cannot be verified for a row. Leave it unowned and list it; never fall back to
  email, Clerk user ID, `auth_event_id` or token equality.
- The backfill finds bindings that share an owner but whose canonical set cannot be chosen
  without guessing. Report and change nothing for that group.
- Adding `jose` changes `bun.lock` beyond that one package.
- A caller outside the in-scope files would need editing for the rewired refresh to compile.
- Any change would require dropping or scrubbing `XeroConnection` credential columns.
- You are about to write a token, authorisation code, `state`, nonce, or key material into a file,
  log, snapshot, fixture, job payload or report, or to refresh a real customer's credentials.
- A step's verification fails twice after a reasonable fix attempt.

## Maintenance notes

- **Mirror-write is temporary and load-bearing.** Until 161g lands, any path that writes owner
  tokens without mirroring leaves legacy readers with dead tokens. After 161g, 161h's rollout
  scrubs the mirrors. Never add a new reader of the mirrored columns.
- **The three system tables have no `clerk_org_id` by design.** The schema test guards against the
  exception spreading.
- **Token version and binding generation are different fences.**
- **"Ciphertext changed" is never proof.** Reject any reintroduction.
- Consider executing this plan as two reviewed units if the executor struggles: Steps 1-4 (schema,
  identity, coordinator) and Steps 5-7 (intent, adoption, backfill). The step order already allows
  a clean stop after Step 4.
- In review, scrutinise: the JWKS failure path, candidate adoption ordering, the mirror-write set
  (reserved bindings of **this** owner only), and every lock acquisition's order.
