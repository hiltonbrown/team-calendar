# Plan 161d: Introduce a canonical Xero credential owner and make OAuth adoption safe

> **Executor instructions**: Follow this plan step by step. Run every verification command and
> confirm the expected result before moving to the next step. If anything in "STOP conditions"
> occurs, stop and report - do not improvise. When done, update the status row for this plan in
> `plans/README.md` unless a reviewer dispatched you and told you they maintain the index.
>
> **Drift check (run first)**:
> ```bash
> git diff --stat 8652c31..HEAD -- \
>   packages/xero/src/oauth packages/database/prisma packages/xero/src/crypto
> ```
> At the time this plan was written that diff was empty. If it is now non-empty, compare the
> "Current state" excerpts below against the live code before proceeding. A mismatch is a STOP
> condition.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: HIGH (credential migration; a mistake here logs every customer out of Xero)
- **Depends on**: `plans/161b-xero-immutable-tenant-binding.md` (binding generation and the
  additive migration framework) and `plans/161c-xero-deadlines-and-key-versioning.md`
  (the keyring and the deadline contract)
- **Category**: security, bug, migration
- **Planned at**: commit `8652c31`, 22 September 2026 (re-stamped from `585f6cb`; the only changes between those commits are under `plans/`, so every source excerpt below is valid at both)
- **Programme charter**: `plans/161-harden-xero-connection-lifecycle.md`

## Why this matters

OAuth credentials are currently stored per internal `XeroConnection`, and refresh locks are keyed
the same way. But Xero issues one token set per **authorising Xero user**, and that one token set
covers every tenant that user has connected. So when a customer with two payroll files
reauthorises the second one, Xero rotates the refresh token that the first file was also relying
on. Today each connection refreshes independently, races the other, and one of them ends up
holding a dead refresh token.

Worse, the current persistence-recovery logic treats *any* change in stored ciphertext as proof
that this attempt's refresh committed:

```typescript
// packages/xero/src/oauth/service.ts:922-924
const tokenChanged =
  input.loadedRefreshTokenEncrypted !== null &&
  current.refresh_token_encrypted !== input.loadedRefreshTokenEncrypted;
```

An unrelated reconnect, a re-encryption pass, or a scrubbed column all satisfy that condition. The
process then reports a successful rotation it never performed.

This plan separates the credential identity (one per verified Xero authoriser) from the payroll
binding (one per internal organisation), so credentials can be coordinated without any binding
gaining access it should not have.

## Current state

### Where credentials live

`packages/database/prisma/schema.prisma:461-493`, `XeroConnection`:

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

`XeroOAuthSession` (`schema.prisma:529-559`) carries a parallel set of encrypted token columns
plus `available_tenants_json`, `selected_tenant_id` and `expires_at`.

Note `organisation_id` is `@unique` on `XeroConnection`: one connection per payroll entity. That
invariant stays. What changes is that the **tokens** move off this row.

### The defective recovery path

`packages/xero/src/oauth/service.ts` - `reconcileRefreshPersistenceFailure` takes
`loadedRefreshTokenEncrypted: null | string` (declared around line 888) and reaches the
`tokenChanged` comparison quoted above at lines 922-924. Around line 987-1003 it writes
`refresh_token_encrypted: input.loadedRefreshTokenEncrypted` back.

Transaction timeouts in this file are at lines 694 (`{ timeout: 15_000 }`), 1246 and 1291.
Plan 161c may already have adjusted these; read them, do not assume.

### Consumers that read credentials directly today

- `packages/xero/src/adapter/xero-write-adapter.ts` - `getTenant` at lines 71-87
- `packages/jobs/src/handlers/schedule-xero-syncs.ts` (433 lines)
- `packages/availability/src/xero-connection-state.ts` (53 lines), exporting
  `hasActiveXeroConnection`, consumed at `packages/availability/src/approvals/approval-service.ts:809`
  and `:1152`, and `packages/availability/src/people/people-service.ts:666`
- `packages/xero/src/au/read.ts`, `packages/xero/src/au/write.ts`

This plan cuts over the credential **resolution**. Full caller migration and error classification
are plan 161g.

### Repository conventions to match

- Service functions return `Result<T, E>` from `@repo/core`. Do not throw for expected failures.
- Named exports only. No default exports. Strict TypeScript, no `any`, no unjustified `as`.
- Zod on all external input, including every Xero response and every JWT claim set.
- Branded domain ID types live in `packages/core`. Add one for the new owner ID.
- Tables `snake_case` plural, columns `snake_case`, `id`/`created_at`/`updated_at` on every table.
- **Every tenant-scoped table carries `clerk_org_id` and every query filters by it.** This plan
  introduces the one deliberate exception; see Step 2.
- Integration tests co-located under `src/` in `packages/xero`.
- Australian English. **No em dashes anywhere.** No `console.log`.

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
| Xero integration (guarded) | `bun run --cwd packages/xero test:integration` | exit 0 |
| Database integration (guarded) | `bun run --cwd packages/database test:integration` | exit 0 |
| Apply reviewed migration | `bun run migrate:deploy` | exit 0, authorised target only |
| Whitespace | `git diff --check` | exit 0 |

## Scope

**In scope:**
- `packages/database/prisma/schema.prisma` and a new additive migration
- `packages/database/src/queries/` and its export wrappers
- `packages/xero/src/oauth/service.ts`
- `packages/xero/src/oauth/credential-owner.ts` (create)
- `packages/xero/src/oauth/credential-owner.test.ts` (create)
- `packages/xero/src/oauth/credential-owner.integration.test.ts` (create)
- `packages/xero/src/oauth/service.test.ts`, `service.integration.test.ts`
- `packages/core/src/` - the new branded ID type only
- `packages/xero/index.ts`, `packages/xero/package.json` (a JWT/JWKS dependency, if needed)
- Root `bun.lock`, only if a dependency is genuinely required
- `plans/README.md` (status row only)

**Out of scope - do NOT touch:**
- `packages/xero/src/rate-limit/` - 161e.
- `packages/xero/src/adapter/`, `packages/availability/`, `packages/jobs/` - caller migration
  and error classification are 161g. You add the resolver; 161g moves the callers onto it.
- Remote connection **deletion**. 161f owns every DELETE.
- **Dropping the old credential columns on `XeroConnection`.** They stay, unread, until 161h's
  rollout proves every consumer migrated. Dropping them here is the single fastest way to
  lock every customer out.
- Any real credential rotation or any change to a live customer's consent.

## Git workflow

- Branch: `codex/xero-connection-hardening` (shared across 161a–161h).
- Conventional commits. Suggested: `feat(database): add xero credential owner model`, then
  `feat(xero): verify authoriser identity before credential adoption`, then
  `fix(xero): require attempt version to confirm refresh persistence`.
- Do NOT push or open a PR.

## Steps

### Step 1: Prove the defective recovery path

Add to `packages/xero/src/oauth/service.test.ts` a test where
`reconcileRefreshPersistenceFailure` runs while the stored ciphertext has changed **for an
unrelated reason** (simulate a re-encryption pass rewriting the same plaintext under a new key
version). Assert the function does **not** report a successful rotation.

Add a second test where the stored refresh token column has been **emptied** (`""`, which is its
schema default). Assert that is not reported as success either.

**Verify**: `bun run --cwd packages/xero test` → fails on both new tests. That proves the defect.
Record the output.

### Step 2: Add the three records

In `packages/database/prisma/schema.prisma`, add three models. Names are recommended; if 161b
already created an equivalent, extend it rather than duplicating.

**`XeroCredentialOwner`** - provider app ID plus verified Xero authoriser ID, unique together.
Encrypted canonical access and refresh envelopes, encryption version, `token_version`,
`credential_generation`, token expiry, granted scopes with provenance, last verified, adopted and
rotated timestamps, and refresh-attempt and recovery state.

**`XeroProviderConnection`** - provider app ID plus the exact remote connection ID, unique
together. External tenant ID, tenant type, verified authoriser association when established,
`auth_event_id`, provider timestamps, observation source/time/coverage, remote lifecycle status.

**`XeroTenantBinding`** - both internal scope IDs, references to organisation/connection/tenant,
immutable external tenant and app identity, the selected provider connection and credential owner,
lifecycle generation, reserved slot, retirement reason and timestamps.

**The deliberate convention exception.** `XeroCredentialOwner` and the app-wide provider inventory
are **system infrastructure**, not customer-owned payroll rows. They get **no `clerk_org_id`**.
Do not attach a synthetic one to satisfy the repository rule. Record the exception in `CLAUDE.md`
and `PRODUCT.md`, and add a test asserting that every **customer-scoped** record still carries
both scope IDs, so the exception cannot quietly spread.

Every customer binding, session intent, local status change, cleanup request and payroll operation
keeps both internal scope identifiers. The sole further exception is an onboarding session that
has no payroll organisation yet; that stays bound to its initiating Clerk account and user.

**Verify**: `bunx prisma validate --schema=packages/database/prisma/schema.prisma` exits 0.
Generate additive SQL as in 161b Step 5 (`bunx prisma migrate diff --help` first; `migrate dev`,
`db push`, reset, rebaseline and seed are prohibited). Read the SQL: **no `DROP`, no rename.**
Then `bun run migrate:deploy` → exit 0.

### Step 3: Verify authoriser identity properly

Use a maintained JWT/OIDC verification library (prefer one already installed; otherwise add the
smallest suitable direct dependency). Validate: signature, trusted issuer via JWKS, approved
algorithms, token class, audience, client binding, required identity claims, and time claims.

- **Do not trust a token-supplied key URL.** Pin the issuer and its JWKS endpoint.
- Bound and cache JWKS retrieval. A JWKS lookup failure is **not** permission to skip signature
  verification.
- Distinguish an access token's expected API audience from an ID token's client audience.

The canonical key is **configured provider app + verified stable Xero authoriser identity**.
Never group by email, Clerk user ID, `auth_event_id`, an unverified payload claim, or equality of
token strings. Persist the evidence source for the identity.

Do not request extra profile or email scopes to obtain an identifier the verified contract
already provides.

**Verify**: `bun run --cwd packages/xero test` → exit 0, with new `credential-owner.test.ts`
covering a valid token, a wrong issuer, a wrong audience, a bad signature, a disallowed
algorithm, and a JWKS fetch failure (which must fail closed).

### Step 4: Migrate legacy credentials

Expired historical tokens grant no access. A **migration-only** verifier may use cryptographically
verified historic identity metadata, with correct issuer and client binding, to associate a
legacy row with an owner - but it must record the expiry and require fresh usable credentials
before any payroll access. Otherwise retain the row as an unverified candidate needing controlled
reauthorisation.

**Never disable runtime expiry validation to make migration succeed.** Never bulk-refresh
unidentified credentials concurrently.

Where several legacy rows belong to one verified owner, retain the encrypted candidates until a
controlled selection establishes the canonical set. **Do not pick by local row timestamp alone.**
Preserve non-secret migration history and reconcile every dependent binding explicitly. No Clerk
membership and no payroll row is merged.

Record the configured provider app identity explicitly for each legacy mapping. A change of app or
client ID is a deliberate mapping transition, not a namespace reset. Keep encryption-key rotation,
OAuth client-secret rotation and changing the OAuth app conceptually separate.

**Verify**: `bun run --cwd packages/database test:integration` → exit 0, with a backfill test
proving idempotence, preservation of every payroll ID, and safe quarantine of ambiguous rows.

### Step 5: Build the resolver choke point

Add the single server-only route to credentials:

```typescript
resolveXeroAccess({
  clerkOrgId,
  organisationId,
  expectedBindingGeneration,
  capability,
  deadline,
});
```

It proves the scoped active binding, its selected remote connection, its current verified
credential owner and the required capability before returning server-internal access.

- A raw owner ID or external tenant ID is **never** sufficient authority.
- Do **not** export an unrestricted global credential query to application actions.
- System enumeration returns routing IDs and safe metadata, never credentials.
- Linking the same Xero authoriser across two Clerk accounts coordinates **credentials only**. It
  creates no membership, no binding, no foreign-account visibility and no management authority.

**Verify**: `bun run --cwd packages/xero test` → exit 0.
`grep -rn "refresh_token_encrypted" apps/` returns no matches (no application code reads
ciphertext directly).

### Step 6: Make OAuth exchange and adoption safe

Persist the scoped OAuth intent **before** redirect: immutable intent kind
(`initial_binding` or `same_file_reauthorisation`), intended payroll organisation, initiating user
and account, nonce binding, expected lifecycle generation, and expiry.

On callback: validate signed state, nonce and expiry; claim the exchange exactly once; persist an
encrypted token candidate durably **before** connection inventory or region discovery. A token
exchange that Xero issued but this process lost is recorded as **unknown**. Do not blindly reuse a
one-time authorisation code after an ambiguous exchange.

Verify the candidate's provider identity before adoption. Under the owner lock, re-read current
versions and reconcile the candidate against the current set. Arrival order and a same-second
`iat` are **not** proof of which candidate supersedes another; when ordering is ambiguous, use
controlled serialised validity reconciliation. Never overwrite a known usable set with an
unverified older candidate.

**The critical sequence.** Connecting file B can yield replacement credentials that already
connected file A depends on, before B's local selection finishes. So: adopt and reconcile verified
canonical credentials **independently of B's payroll binding**. Abandoning B must not discard A's
usable credentials. Conversely, adopting credentials must not activate B, resurrect a disconnected
A, or create access to another Clerk account.

Note the boundary carefully: 161b's wrong-file invariant applies to the rejected **selection
transaction**. It does not forbid safe owner-level credential reconciliation caused by the earlier
valid OAuth exchange. Your tests must distinguish these two operations rather than asserting that
no credential anywhere may change during a failed onboarding journey.

Persist requested and provider-granted scopes separately with known/unknown state. Missing scope
data on a refresh does not erase established metadata. Unknown scope data does not grant
permission. Preserve remote connection IDs, tenant type, auth event and provider timestamps.
**Never select a connection by tenant name.**

**Verify**: `bun run --cwd packages/xero test:integration` → exit 0.

### Step 7: Coordinate refresh and recovery

Refresh through one owner-scoped coordinator using PostgreSQL transaction-scoped advisory locking
and token-version compare-and-set. Keep proactive near-expiry refresh, the controlled
forced-refresh retry, and the existing persistence-recovery tests. Concurrent callers reuse the
winning token rather than each rotating.

Lock order, applied consistently everywhere: **credential-owner locks in sorted order, then
external app/tenant-binding locks in sorted order, then internal connection locks in sorted order,
then OAuth session and cleanup row claims.** Re-read non-locking lookups after acquisition. Never
acquire in the reverse order from any other path.

Record a refresh attempt **before** remote dispatch: attempt ID, expected credential and token
version, dispatch time, uncertainty start, recovery deadline, outcome. **Never persist a raw
refresh token in an attempt log.**

Now fix Step 1's defect: after a lost commit acknowledgement, confirm success by checking the
**attempt ID and token version** and the owner's current lifecycle state, then revalidate the
requesting binding. Changed ciphertext alone, an emptied legacy column, or an unrelated reconnect
is not proof.

If the **response** is lost, preserve the previous refresh token's controlled recovery eligibility
for Xero's documented 30-minute window (see `plans/161-xero-provider-contract.md`). Record the
uncertainty once; retries must not restart that window indefinitely. Schedule recovery through
existing Inngest infrastructure carrying owner IDs only. **Do not add a Vercel cron for refresh.**

An invalid refresh grant affects that owner's credential usability and its dependent bindings. It
is **not** evidence about whether remote connections still exist. Invalid OAuth **client**
credentials are an app-configuration incident: do not overwrite every customer's consent state
because the app secret broke.

**Verify**: `bun run --cwd packages/xero test` → exit 0 including both Step 1 tests.
`bun run --cwd packages/xero test:integration` → exit 0.

## Test plan

`packages/xero/src/oauth/credential-owner.test.ts` (new):
1. Valid token verifies; wrong issuer, wrong audience, bad signature and disallowed algorithm
   each fail with distinct errors.
2. JWKS fetch failure fails **closed**. Assert verification is not skipped.
3. Grouping is by verified authoriser ID. Assert two tokens with the same email but different
   verified subjects produce two owners.

`packages/xero/src/oauth/credential-owner.integration.test.ts` (new; uses the fixture slot
registered by 161a):
4. **Same authoriser, two payroll files**: both share coordinated usable credentials, and neither
   gains payroll access to the other. Assert both directions.
5. **Same verified authoriser, two Clerk accounts**: no cross-account access, no new binding, no
   membership. This is the isolation test that matters most.
6. **Authorise B then abandon selection**: A remains serviceable, B is not implicitly bound.
7. Reversed callback arrival order and same-second `iat` candidates cannot overwrite a known newer
   usable set.
8. Token exchange succeeds but inventory, body parsing or persistence fails: the candidate and
   attempt remain recoverable, and the authorisation code is not blindly replayed.
9. Concurrent refresh, adoption, disconnect and re-encryption: the winning token is not lost and
   no disconnected binding is resurrected. Use real database barriers, **not sleeps**.
10. Lost commit acknowledgement, and grace-window expiry, produce distinct controlled recoveries.
11. Expired historic credentials migrate to an owner but do **not** grant payroll access.
12. Legacy duplicates and unverifiable identities stop the affected backfill safely; a rerun
    preserves every payroll ID.

`packages/xero/src/oauth/service.test.ts` (extend):
13. The two Step 1 regressions: unrelated ciphertext change, and emptied column, are not success.
14. No token, authorisation code, `state` or nonce appears in any log, error, DTO or job payload.

## Done criteria

All must hold:

- [ ] `bun run check` exits 0
- [ ] `bun run typecheck` exits 0
- [ ] `bun run --cwd packages/xero test` exits 0, including the Step 1 regressions
- [ ] `bun run --cwd packages/xero test:integration` exits 0, including tests 4, 5 and 9
- [ ] `bun run --cwd packages/database test:integration` exits 0
- [ ] `git diff --check` exits 0
- [ ] `grep -rn "refresh_token_encrypted\|access_token_encrypted" apps/` returns no matches
- [ ] `grep -c "DROP " packages/database/prisma/migrations/*/migration.sql` returns 0 for the new migration
- [ ] The old credential columns on `XeroConnection` still exist in `schema.prisma`
- [ ] `CLAUDE.md` and `PRODUCT.md` record the `XeroCredentialOwner` `clerk_org_id` exception
- [ ] `git status --short` shows no modified file outside the In scope list
- [ ] `plans/README.md` status row for 161d updated

## STOP conditions

Stop and report; do not improvise:

- The `tokenChanged` comparison is no longer at `packages/xero/src/oauth/service.ts:922-924`, or
  `reconcileRefreshPersistenceFailure` no longer exists. Report the current code.
- **An identity cannot be established from verified JWT claims.** Retain the candidate as
  unverified and report it. Never fall back to email, Clerk user ID, `auth_event_id` or token
  string equality, however convenient.
- The backfill finds legacy rows that map to one owner but whose canonical set cannot be chosen
  without guessing. Quarantine, report the count, and stop. **Do not pick by timestamp.**
- Adding a JWT library would require upgrading an unrelated dependency or changing `bun.lock`
  beyond that one addition. Report the dependency graph conflict.
- A step's verification fails twice after a reasonable fix attempt.
- You conclude the old credential columns must be dropped for something to work. They must not.
  Report what is blocked.
- You are about to write a token, authorisation code, `state`, nonce, or key material into a file,
  log, snapshot, fixture, job payload or report. Stop.
- You are about to trigger a real refresh against a live customer's credentials. Owned live
  fixtures only.

## Maintenance notes

- **`XeroCredentialOwner` has no `clerk_org_id` by design**, breaking the otherwise universal rule
  in `CLAUDE.md`. Step 2 documents it. A reviewer who does not know this will either revert it or,
  worse, generalise it to customer tables. The test added in Step 2 is the guard.
- **`resolveXeroAccess` is the single choke point.** Every new Xero call site goes through it. In
  review, grep for direct reads of credential columns; any hit is a regression.
- **Token version and binding generation are different fences.** Token version fences credential
  adoption; binding generation (161b) fences payroll access. They are not interchangeable and
  confusing them produces code that passes review and fails in production.
- **"Ciphertext changed" is never proof of anything.** That inference is what this plan removes.
  If a future change reintroduces a ciphertext comparison as a success signal, reject it.
- The old credential columns on `XeroConnection` are dead but present. 161h scrubs them only after
  proving every consumer migrated. Until then, a reader that still uses them is a live bug, which
  is why 161g exists.
- In review, scrutinise: the JWKS failure path (does it ever skip verification?), the candidate
  reconciliation ordering logic, and every place a refresh outcome is turned into a user-visible
  message.
