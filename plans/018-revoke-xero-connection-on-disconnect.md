# Plan 018: Revoke the Xero connection on disconnect (DELETE /connections/{id})

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report, do not improvise. When done, update the status row for this plan in
> `plans/README.md` unless a reviewer dispatched you and told you they maintain
> the index.
>
> **Drift check (run first)**: `git diff --stat da91efd..HEAD -- packages/xero/src/oauth/service.ts packages/xero/src/oauth/service.test.ts packages/database/prisma/schema.prisma apps/app/app/\(authenticated\)/settings/integrations/xero/_actions.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: none (independent of plan 017)
- **Category**: security
- **Planned at**: commit `da91efd`, 2026-07-04

## Why this matters

When an admin disconnects Xero, Team Calendar clears its local tokens and marks
the connection `disconnected`, but it never tells Xero. Per Xero's connection
management guidance
(https://developer.xero.com/documentation/best-practices/managing-connections/connections/),
proper cleanup requires calling `DELETE https://api.xero.com/connections/{id}`,
where `{id}` is the **connection id** returned by `GET /connections` — a value
distinct from the tenant id. Because Team Calendar currently discards that
connection id at OAuth time, it cannot make this call at all.

The consequence: after a user "disconnects", the authorisation remains live on
Xero's side. The connection keeps counting against the org's app-connection
limits, and Team Calendar's stored refresh token would remain valid until it
naturally expires (Xero refresh tokens live ~60 days). This is a data-governance
gap — the product tells the user access is revoked, but it is not. This plan
captures the connection id and revokes at Xero on disconnect, best-effort so a
Xero-side failure never blocks the local disconnect the user asked for.

## Current state

- `packages/xero/src/oauth/service.ts` — `fetchConnections` calls Xero's
  `GET /connections` but reads only `tenantId` and `tenantName`, discarding the
  connection `id`:

```ts
// packages/xero/src/oauth/service.ts:11-13 (constants — XERO_CONNECTIONS_URL already exists)
const XERO_CONNECTIONS_URL = "https://api.xero.com/connections";

// packages/xero/src/oauth/service.ts:39-42
interface ConnectionResponse {
  tenantId: string;
  tenantName: string;
}

// packages/xero/src/oauth/service.ts:1112-1145
async function fetchConnections(
  accessToken: string,
  orgKey: string
): Promise<Result<ConnectionResponse[], XeroOAuthError>> {
  const response = await xeroFetch({
    init: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      method: "GET",
    },
    orgKey,
    url: XERO_CONNECTIONS_URL,
  });
  if (!response.ok) {
    return {
      ok: false,
      error: {
        code: "unknown_error",
        message: "Failed to load Xero tenants.",
      },
    };
  }

  const payload = (await response.json()) as Partial<ConnectionResponse>[];
  return {
    ok: true,
    value: payload.flatMap((item) =>
      typeof item.tenantId === "string" && typeof item.tenantName === "string"
        ? [{ tenantId: item.tenantId, tenantName: item.tenantName }]
        : []
    ),
  };
}
```

  The real Xero `GET /connections` item shape is (relevant fields):
  `{ "id": "<connection-uuid>", "tenantId": "<tenant-uuid>", "tenantName": "...", "tenantType": "ORGANISATION", ... }`.
  The `id` is what `DELETE /connections/{id}` takes. It is NOT the `tenantId`.

- The connection id is threaded nowhere. It is stored on neither the pending
  session nor `XeroConnection`. The pending session stores only tenant id/name:

```ts
// packages/xero/src/oauth/service.ts:52-61
export interface PendingXeroSessionOrganisation {
  countryCode: string;
  id: string;
  name: string;
}

export interface PendingXeroSessionTenant {
  tenantId: string;
  tenantName: string;
}

// packages/xero/src/oauth/service.ts:148-154 (written in completeXeroOAuth)
available_tenants_json: {
  tenants: connections.value.map((tenant) => ({
    tenantId: tenant.tenantId,
    tenantName: tenant.tenantName,
  })),
},

// packages/xero/src/oauth/service.ts:1017-1043 (readAvailableTenants — parses that JSON back)
function readAvailableTenants(payload: unknown): PendingXeroSessionTenant[] {
  // ... currently extracts tenantId and tenantName only
}
```

- The selected tenant is persisted in `completeXeroTenantSelection`, which
  upserts `XeroConnection`. There is currently no column for the connection id,
  so nothing is written:

```ts
// packages/xero/src/oauth/service.ts:256-259 (tenant lookup inside completeXeroTenantSelection)
const selectedTenant = readAvailableTenants(
  session.available_tenants_json
).find((tenant) => tenant.tenantId === input.tenantId);

// packages/xero/src/oauth/service.ts:308-356 (the XeroConnection upsert — create/update objects)
const nextConnection = await tx.xeroConnection.upsert({
  where: { organisation_id: organisation.value.id },
  create: { /* ...token + status fields, NO connection-id field... */ },
  update: { /* ...token + status fields, NO connection-id field... */ },
  select: { id: true },
});
```

- `disconnectXeroOAuthConnection` clears local tokens and (optionally) purges
  synced data, but never calls Xero. It returns `Result<{ disconnected: true }>`:

```ts
// packages/xero/src/oauth/service.ts:683-792 (abridged)
export async function disconnectXeroOAuthConnection(input: {
  clerkOrgId: string;
  connectionId: string;
  destructive: boolean;
  organisationId: string;
  performedByUserId?: null | string;
}): Promise<Result<{ disconnected: true }, XeroOAuthError>> {
  const connection = await database.xeroConnection.findFirst({
    where: {
      clerk_org_id: input.clerkOrgId,
      id: input.connectionId,
      organisation_id: input.organisationId,
    },
    select: {
      id: true,
      xero_tenant: { select: { id: true } },
    },
  });
  if (!connection) { /* organisation_not_found */ }

  const now = new Date();
  await database.$transaction(async (tx) => {
    await tx.xeroConnection.update({
      where: { id: connection.id },
      data: {
        access_token_encrypted: "",
        // ...clears tokens, sets status "disconnected"...
      },
    });
    // ...destructive purge of synced data when input.destructive...
  });

  return { ok: true, value: { disconnected: true } };
}
```

- The `decryptXeroToken` helper (already imported at the top of `service.ts`
  from `../crypto/tokens`) turns the stored `{ encrypted, iv, authTag }` triple
  back into the plaintext token. `xeroFetch` and `orgRateLimitKey` are already
  imported from `../rate-limit/xero-fetch`.

- The Prisma model to extend:

```prisma
// packages/database/prisma/schema.prisma — model XeroConnection (abridged)
model XeroConnection {
  id                      String                 @id @default(uuid()) @db.Uuid
  clerk_org_id            String
  organisation_id         String                 @unique @db.Uuid
  status                  xero_connection_status @default(pending)
  access_token_encrypted  String                 @default("")
  // ...token fields, timestamps...
  organisation Organisation @relation(fields: [organisation_id], references: [id])
  xero_tenant  XeroTenant?
  @@index([clerk_org_id])
  @@map("xero_connections")
}
```

  **Naming trap**: `XeroTenant` already has a field named `xero_connection_id`
  which is the **foreign key to `XeroConnection.id`** (a Team Calendar UUID).
  Do NOT reuse that name for the Xero-side connection id. Use a distinct name:
  `xero_authorisation_connection_id` (nullable string).

- The app-layer disconnect action writes an audit event and would benefit from
  recording whether the remote revoke succeeded:

```ts
// apps/app/app/(authenticated)/settings/integrations/xero/_actions.ts:130-153 (abridged)
const result = await disconnectXeroOAuthConnection({
  clerkOrgId: context.value.clerkOrgId,
  connectionId: parsed.data.connectionId,
  destructive: parsed.data.mode === "destructive",
  organisationId: context.value.organisationId,
});
if (!result.ok) {
  return unknownError(result.error.message);
}
await database.auditEvent.create({
  data: {
    ...auditBase(context.value),
    action: parsed.data.mode === "destructive"
      ? "xero.connection_disconnected_destructive"
      : "xero.connection_disconnected_soft",
    // ...
    metadata: { mode: parsed.data.mode },
    // ...
  },
});
```

- Test conventions for the service: `packages/xero/src/oauth/service.test.ts`
  mocks `@repo/database` with a hoisted `dbMock` and stubs HTTP with
  `vi.stubGlobal("fetch", fetchSpy)` (see lines 5-16 and 249, 304-313). Follow
  that style. `encryptXeroToken` from `../crypto/tokens` is used to build stored
  token fields (see `buildStoredTokenFields` at lines 26-39).

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Format + generate migration (dev DB) | `bun run migrate` | creates one migration, Prisma client regenerates, exit 0 |
| Push schema without migration (if no dev DB) | `bun run db:push` | schema applied, client regenerated |
| Typecheck | `bun run typecheck` | exit 0 |
| Lint | `bun run check` | exit 0 |
| Targeted test | `bunx vitest run packages/xero/src/oauth/service.test.ts` | all pass |
| Full tests | `bun run test` | exit 0 |

If neither a dev database nor `DATABASE_URL` is available, `bun run migrate`
will fail at the "apply migration" step. In that case you may generate the
migration SQL and regenerate the client via Prisma's offline path, but if you
cannot regenerate the Prisma client so that the new field is typed, that is a
STOP condition — report it rather than hand-editing generated client code.

## Scope

**In scope** (the only files you should modify):

- `packages/database/prisma/schema.prisma` — add one nullable column to
  `XeroConnection`.
- `packages/database/prisma/migrations/**` — the one new generated migration
  (created by `bun run migrate`; do not hand-write or hand-edit it).
- `packages/xero/src/oauth/service.ts` — capture connection id, thread it
  through, persist it, and call `DELETE /connections/{id}` on disconnect.
- `packages/xero/src/oauth/service.test.ts` — new/updated unit tests.
- `apps/app/app/(authenticated)/settings/integrations/xero/_actions.ts` —
  include the remote-revoke outcome in the disconnect audit metadata.
- `plans/README.md` (status row only).

**Out of scope** (do NOT touch, even though they look related):

- `disconnect.integration.test.ts` — it is an opt-in integration test gated on
  `RUN_XERO_DISCONNECT_INTEGRATION`; do not wire the remote-revoke into it.
- The destructive-purge logic inside `disconnectXeroOAuthConnection` (leave
  balances, person matches, sync runs). Do not change what it deletes.
- `refreshXeroOAuthConnection` / `ensureFreshXeroConnection` — do NOT change
  their return shapes or add a proactive refresh into the disconnect path (see
  Step 4; the primary approach uses the already-stored access token).
- Rate-limit internals in `packages/xero/src/rate-limit/`.
- Any Xero read/write region adapters.

## Git workflow

- Branch: `advisor/018-revoke-xero-connection-on-disconnect`
- Commit message (conventional commits): `feat(xero): revoke Xero connection on disconnect`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add the connection-id column to XeroConnection

In `packages/database/prisma/schema.prisma`, add a nullable string field to
`model XeroConnection` (place it near the token fields, before the relations):

```prisma
  xero_authorisation_connection_id String?
```

Generate the migration:

**Verify**: `bun run migrate` → one new migration under
`packages/database/prisma/migrations/`, Prisma client regenerates, exit 0.
(If no dev DB is available, see the "Commands you will need" note and the STOP
conditions.)

### Step 2: Capture the connection id in fetchConnections

In `packages/xero/src/oauth/service.ts`:

1. Extend the `ConnectionResponse` interface with `connectionId: string`
   (mapped from the Xero payload's `id` field):

```ts
interface ConnectionResponse {
  connectionId: string;
  tenantId: string;
  tenantName: string;
}
```

2. In `fetchConnections`, read `id` from each payload item and map it to
   `connectionId`. Type the payload item as
   `Partial<ConnectionResponse> & { id?: string }` (the Xero field is `id`, not
   `connectionId`). Only include items that have all three of `id`, `tenantId`,
   and `tenantName`:

```ts
const payload = (await response.json()) as Array<
  Partial<ConnectionResponse> & { id?: string }
>;
return {
  ok: true,
  value: payload.flatMap((item) =>
    typeof item.id === "string" &&
    typeof item.tenantId === "string" &&
    typeof item.tenantName === "string"
      ? [{ connectionId: item.id, tenantId: item.tenantId, tenantName: item.tenantName }]
      : []
  ),
};
```

**Verify**: `bun run typecheck` → exit 0.

### Step 3: Thread the connection id through the pending session to XeroConnection

Still in `packages/xero/src/oauth/service.ts`:

1. Add `connectionId: string` to the `PendingXeroSessionTenant` interface.
2. In `completeXeroOAuth`, when writing `available_tenants_json.tenants`, include
   `connectionId: tenant.connectionId` alongside `tenantId`/`tenantName`.
3. In `readAvailableTenants`, extract `connectionId` the same defensive way it
   extracts `tenantId`/`tenantName`, and only return a tenant when all three
   strings are present.
4. In `completeXeroTenantSelection`, the `selectedTenant` now carries
   `connectionId`. In the `tx.xeroConnection.upsert` call, set
   `xero_authorisation_connection_id: selectedTenant.connectionId` in **both**
   the `create` and `update` objects.

**Verify**: `bun run typecheck` → exit 0. `bun run check` → exit 0.

STOP-check: if the regenerated Prisma client does not accept
`xero_authorisation_connection_id` in the upsert types, Step 1's client
regeneration did not take effect — stop and report (do not cast around it).

### Step 4: Call DELETE /connections/{id} on disconnect (best-effort)

Add a small internal helper and call it from `disconnectXeroOAuthConnection`:

1. Add a helper `revokeXeroConnectionAtSource` that, given a decrypted
   `accessToken`, the `xeroAuthorisationConnectionId`, and an `orgKey`, calls
   `DELETE https://api.xero.com/connections/{id}` via `xeroFetch` and returns a
   boolean success. It must never throw to the caller:

```ts
async function revokeXeroConnectionAtSource(input: {
  accessToken: string;
  orgKey: string;
  xeroAuthorisationConnectionId: string;
}): Promise<boolean> {
  try {
    const response = await xeroFetch({
      init: {
        headers: { Authorization: `Bearer ${input.accessToken}` },
        method: "DELETE",
      },
      orgKey: input.orgKey,
      url: `${XERO_CONNECTIONS_URL}/${input.xeroAuthorisationConnectionId}`,
    });
    return response.ok;
  } catch {
    return false;
  }
}
```

2. In `disconnectXeroOAuthConnection`, extend the initial `findFirst` `select`
   to also read the stored access token triple and the new
   `xero_authorisation_connection_id`:
   `access_token_encrypted`, `access_token_iv`, `access_token_auth_tag`,
   `xero_authorisation_connection_id` (keep the existing `id` and
   `xero_tenant` selections).

3. Before the token-clearing transaction, attempt the remote revoke. Only try
   when there is a stored connection id AND a non-empty encrypted access token.
   Decrypt with `decryptXeroToken` and call the helper:

```ts
let remoteRevoked = false;
if (
  connection.xero_authorisation_connection_id &&
  connection.access_token_encrypted.length > 0 &&
  connection.access_token_iv &&
  connection.access_token_auth_tag
) {
  const accessToken = decryptXeroToken({
    authTag: connection.access_token_auth_tag,
    encrypted: connection.access_token_encrypted,
    iv: connection.access_token_iv,
  });
  remoteRevoked = await revokeXeroConnectionAtSource({
    accessToken,
    orgKey: orgRateLimitKey({
      clerkOrgId: input.clerkOrgId,
      organisationId: input.organisationId,
    }),
    xeroAuthorisationConnectionId: connection.xero_authorisation_connection_id,
  });
}
```

4. Run the existing local-clear transaction unchanged (it still clears tokens
   and, when destructive, purges synced data) regardless of `remoteRevoked`.

5. Change the return type to
   `Result<{ disconnected: true; remoteRevoked: boolean }, XeroOAuthError>` and
   return `{ ok: true, value: { disconnected: true, remoteRevoked } }`.

**Rationale for best-effort**: the user asked to disconnect; a Xero-side error
(expired token, network, already-removed connection) must not block the local
disconnect. The access token may be past its 30-minute life, in which case the
DELETE returns non-ok and `remoteRevoked` stays `false` — acceptable; the local
tokens are still wiped. Do not add a proactive refresh here (out of scope).

**Verify**: `bun run typecheck` → exit 0.

### Step 5: Record the revoke outcome in the disconnect audit event

In `apps/app/app/(authenticated)/settings/integrations/xero/_actions.ts`,
`disconnectXeroAction` now receives `result.value.remoteRevoked`. Add it to the
audit event `metadata`:

```ts
metadata: { mode: parsed.data.mode, remoteRevoked: result.value.remoteRevoked },
```

Do not change anything else in that action.

**Verify**: `bun run typecheck` → exit 0. `bun run check` → exit 0.

### Step 6: Tests

In `packages/xero/src/oauth/service.test.ts`, add cases:

- `fetchConnections` mapping is covered indirectly through `completeXeroOAuth`:
  extend/confirm the existing `completeXeroOAuth` happy-path test so the mocked
  `GET /connections` response includes an `id`, and assert the created session's
  `available_tenants_json.tenants[0]` carries `connectionId`. (Inspect the
  existing `completeXeroOAuth` test around lines 100-140 for how the DB create
  is asserted; assert on the `data.available_tenants_json` passed to
  `xeroOAuthSession.create`.)
- `disconnectXeroOAuthConnection`:
  - When the connection has a stored `xero_authorisation_connection_id` and a
    valid access token, and the mocked `fetch` for the DELETE returns
    `{ ok: true }`: assert `fetch` (or the xeroFetch path) was called with a URL
    ending in `/connections/<that id>` and method `DELETE`, and the result value
    is `{ disconnected: true, remoteRevoked: true }`.
  - When the DELETE mock returns `{ ok: false }` (or the fetch rejects): assert
    the local `xeroConnection.update` still ran (tokens cleared) and the result
    is `{ disconnected: true, remoteRevoked: false }`.
  - When `xero_authorisation_connection_id` is `null`: assert no DELETE fetch is
    made and `remoteRevoked` is `false`, and the local clear still ran.

  You will need to extend the hoisted `dbMock` so `xeroConnection.findFirst`,
  `$transaction`, and the models the destructive branch touches are present for
  the soft-disconnect path (use `destructive: false` in these tests to avoid
  needing the purge models). Follow the existing mocking approach; if the soft
  path still references models not on `dbMock`, add them as `vi.fn()` stubs.

**Verify**: `bunx vitest run packages/xero/src/oauth/service.test.ts` → all pass.

## Test plan

- Extend `packages/xero/src/oauth/service.test.ts` with the Step 6 cases. The
  disconnect DELETE-URL assertion and the best-effort-on-failure assertion are
  the core regression guards.
- Structural pattern: the existing tests in the same file (hoisted `dbMock`,
  `vi.stubGlobal("fetch", ...)`, `encryptXeroToken` for stored tokens).
- Verification:
  - `bunx vitest run packages/xero/src/oauth/service.test.ts` → all pass
  - `bun run typecheck` → exit 0
  - `bun run check` → exit 0
  - `bun run test` → exit 0

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -n "xero_authorisation_connection_id" packages/database/prisma/schema.prisma` returns a match on `XeroConnection`.
- [ ] Exactly one new migration directory was added under
      `packages/database/prisma/migrations/`.
- [ ] `grep -n "connectionId" packages/xero/src/oauth/service.ts` shows it in
      `ConnectionResponse`, `PendingXeroSessionTenant`, `fetchConnections`, and
      the upsert.
- [ ] `grep -n "method: \"DELETE\"" packages/xero/src/oauth/service.ts` returns
      a match (the revoke call).
- [ ] `disconnectXeroOAuthConnection` returns `remoteRevoked` and never throws
      on a Xero-side failure (best-effort).
- [ ] Disconnect audit metadata includes `remoteRevoked` in `_actions.ts`.
- [ ] `bun run typecheck`, `bun run check`, targeted service tests, and
      `bun run test` all pass.
- [ ] `git status` shows only in-scope files (plus the one generated migration)
      modified.
- [ ] `plans/README.md` status row updated to DONE.

## STOP conditions

Stop and report back (do not improvise) if:

- The live `service.ts` no longer matches the "Current state" excerpts
  (`fetchConnections`, `completeXeroOAuth`, `completeXeroTenantSelection`, or
  `disconnectXeroOAuthConnection` changed materially).
- You cannot regenerate the Prisma client so `xero_authorisation_connection_id`
  is typed on `XeroConnection` (no dev DB and no offline client generation).
  Do not cast (`as`) around the missing field or hand-edit the generated client.
- Making the DELETE call appears to require a proactive token refresh or changes
  to `ensureFreshXeroConnection` / `refreshXeroOAuthConnection` — that is out of
  scope; report it and stop.
- The Xero `GET /connections` payload field for the connection id turns out to
  be named something other than `id` in this codebase's fixtures/tests — verify
  against the existing test mocks before proceeding.
- A verification command fails twice after a reasonable fix attempt.

## Maintenance notes

For the human/agent who owns this after the change lands:

- Existing connections created before this change will have
  `xero_authorisation_connection_id = null`, so their disconnect will skip the
  remote revoke (`remoteRevoked: false`). A one-off backfill could call
  `GET /connections` per active connection to populate the id; that is a
  deferred follow-up, not part of this plan.
- The best-effort revoke uses the currently-stored access token, which lives
  only ~30 minutes. A disconnect long after the last sync may find the token
  expired and record `remoteRevoked: false`. If reliable revocation becomes a
  requirement, a future plan can add a scoped refresh-then-revoke step (kept out
  of scope here to bound risk).
- Reviewer check: confirm the local disconnect always runs regardless of the
  DELETE outcome, and that no raw Xero error payload is surfaced to the user
  (the helper returns a boolean only).
- If Xero connection handling is later extended to multiple tenants per
  connection, revisit the one-connection-id-per-`XeroConnection` assumption.
