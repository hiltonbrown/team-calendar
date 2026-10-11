import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  accountInvalidate: vi.fn(),
  audit: vi.fn(),
  authorisationDelete: vi.fn(),
  availability: {
    findFirst: vi.fn(),
    findMany: vi.fn(async () => []),
    updateMany: vi.fn(),
  },
  connectionUpdate: vi.fn(),
  cursorDelete: vi.fn(),
  feed: vi.fn(),
  feedPublicationUpdate: vi.fn(),
  feedUpdate: vi.fn(),
  http: vi.fn(),
  invalidate: vi.fn(),
  leaveBalance: vi.fn(),
  lock: vi.fn(),
  organisationArchive: vi.fn(),
  person: vi.fn(),
  publicationDelete: vi.fn(),
  scoped: vi.fn(),
  scopedLock: vi.fn(),
  sessionUpdate: vi.fn(),
  syncRun: vi.fn(),
  tokenRevoke: vi.fn(),
  xeroPersonMatch: vi.fn(),
}));
vi.mock("@repo/database", () => {
  const exports = {
    database: {
      xeroConnection: {
        findFirst: vi.fn(async () => (await mocks.scoped(input)).value),
        findMany: vi.fn(async () => [
          { id: input.connectionId, organisation_id: input.organisationId },
          { id: "unavailable-connection", organisation_id: "sibling-company" },
        ]),
      },
    },
    lockScopedXeroConnection: mocks.scopedLock,
    withXeroGrantLock: mocks.lock,
  };
  return {
    ...exports,
    getScopedXeroConnection: vi.fn(async (bindingScope) => ({
      ok: true,
      value: {
        authorisation: { status: "active" },
        id: bindingScope.connectionId,
      },
    })),
    systemDatabase: exports.database,
    tenantDatabase: vi.fn(() => exports.database),
    tenantTransaction: vi.fn((_clerkOrgId, callback) =>
      "$transaction" in exports.database
        ? exports.database.$transaction(callback)
        : callback(exports.database)
    ),
  };
});
vi.mock("@repo/database/queries/xero-connections", () => ({
  getScopedXeroConnection: mocks.scoped,
}));
vi.mock("@repo/availability", () => ({
  XERO_WRITE_CLAIM_LEASE_MS: 300_000,
}));
vi.mock("@repo/feeds", () => ({
  ALL_PRIVACY_MODES: ["named", "anonymous", "hidden"],
  invalidateAccountFeedCaches: mocks.accountInvalidate,
  invalidateFeedCache: mocks.invalidate,
}));
vi.mock("../rate-limit/xero-fetch", () => ({ xeroFetch: mocks.http }));
vi.mock("../../keys", () => ({
  keys: () => ({
    XERO_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 5).toString("base64"),
  }),
}));
vi.mock("./authorisation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./authorisation")>()),
  resolveXeroAccess: mocks.access,
}));

import { encryptXeroToken } from "../crypto/tokens";
import {
  disconnectAllXeroConnections,
  disconnectXeroOAuthConnection,
  removeXeroCompany,
} from "./disconnect";

const input = {
  clerkOrgId: "clerk-account",
  connectionId: "local-connection",
  destructive: false,
  organisationId: "local-payroll",
  performedByUserId: "clerk-admin-b",
};
function makeGrant() {
  const access = encryptXeroToken("synthetic-access-secret");
  const refresh = encryptXeroToken("synthetic-refresh-secret");
  return {
    access_token_auth_tag: access.authTag,
    access_token_encrypted: access.encrypted,
    access_token_iv: access.iv,
    id: "canonical-grant",
    provider_app_id: "provider-app",
    refresh_token_auth_tag: refresh.authTag,
    refresh_token_encrypted: refresh.encrypted,
    refresh_token_iv: refresh.iv,
    status: "active",
    token_key_version: access.keyVersion,
    xero_user_id: "provider-principal",
  };
}
let grant: ReturnType<typeof makeGrant>;
let connection: Record<string, unknown>;
let hasSibling: boolean;
let hasLiveSelection: boolean;
let grantPresent: boolean;
let busy: boolean;
let auditEvents: Record<string, unknown>[];
const tx = {
  $executeRaw: mocks.feedPublicationUpdate,
  auditEvent: { create: mocks.audit },
  availabilityPublication: { deleteMany: mocks.publicationDelete },
  availabilityRecord: mocks.availability,
  feed: { findMany: mocks.feed, updateMany: mocks.feedUpdate },
  feedToken: { updateMany: mocks.tokenRevoke },
  leaveBalance: { deleteMany: mocks.leaveBalance },
  organisation: { updateMany: mocks.organisationArchive },
  person: { updateMany: mocks.person },
  syncRun: { deleteMany: mocks.syncRun },
  xeroAuthorisation: { deleteMany: mocks.authorisationDelete },
  xeroConnection: { updateMany: mocks.connectionUpdate },
  xeroOAuthSession: { updateMany: mocks.sessionUpdate },
  xeroPersonMatch: { deleteMany: mocks.xeroPersonMatch },
  xeroSyncCursor: { deleteMany: mocks.cursorDelete },
};
beforeEach(() => {
  vi.resetAllMocks();
  grant = makeGrant();
  hasSibling = false;
  hasLiveSelection = false;
  grantPresent = true;
  busy = false;
  auditEvents = [];
  connection = {
    authorisation: grant,
    clerk_org_id: input.clerkOrgId,
    id: input.connectionId,
    last_connected_at: new Date("2026-10-08T00:00:00Z"),
    organisation_id: input.organisationId,
    payroll_region: "AU",
    remote_connection_id: "stored-remote/link",
    status: "active",
    xero_authorisation_id: grant.id,
    xero_tenant_id: "external-payroll-tenant",
  };
  mocks.scoped.mockImplementation((scope: typeof input) =>
    Promise.resolve(
      scope.clerkOrgId === connection.clerk_org_id &&
        scope.organisationId === connection.organisation_id &&
        scope.connectionId === connection.id
        ? { ok: true, value: { ...connection, authorisation: { ...grant } } }
        : { error: { code: "not_connected" }, ok: false }
    )
  );
  mocks.access.mockResolvedValue({
    ok: true,
    value: { accessToken: "synthetic-access-secret" },
  });
  mocks.lock.mockImplementation((_scope, work) => work(tx));
  mocks.availability.findFirst.mockImplementation(() =>
    Promise.resolve(busy ? { id: "pending-payroll-write" } : null)
  );
  mocks.connectionUpdate.mockImplementation(({ data }) => {
    connection = { ...connection, ...data };
    return Promise.resolve({ count: 1 });
  });
  mocks.audit.mockImplementation(({ data }) => {
    auditEvents.push(data);
    return Promise.resolve(data);
  });
  mocks.authorisationDelete.mockImplementation(({ where }) => {
    const retainsSibling = hasSibling && where.connections?.none;
    const retainsSelection =
      hasLiveSelection && where.sessions?.none?.status === "selecting";
    if (!(retainsSibling || retainsSelection)) {
      grantPresent = false;
    }
    return Promise.resolve({ count: grantPresent ? 0 : 1 });
  });
  mocks.availability.findMany.mockResolvedValue([]);
  mocks.http.mockResolvedValue(new Response(null, { status: 204 }));
});
function expectUnchanged(
  originalConnection: typeof connection,
  originalGrant: typeof grant
) {
  expect(connection).toEqual(originalConnection);
  expect(grant).toEqual(originalGrant);
  expect(grantPresent).toBe(true);
  expect(auditEvents).toEqual([]);
  expect(mocks.connectionUpdate).not.toHaveBeenCalled();
  expect(mocks.cursorDelete).not.toHaveBeenCalled();
  expect(mocks.sessionUpdate).not.toHaveBeenCalled();
  expect(mocks.authorisationDelete).not.toHaveBeenCalled();
}
function expectNoBusinessDataPurge() {
  for (const mutation of [
    mocks.leaveBalance,
    mocks.syncRun,
    mocks.person,
    mocks.xeroPersonMatch,
    mocks.availability.updateMany,
  ]) {
    expect(mutation).not.toHaveBeenCalled();
  }
  expect(mocks.feed).not.toHaveBeenCalled();
  expect(mocks.invalidate).not.toHaveBeenCalled();
}

describe("disconnect all outcomes", () => {
  it("continues after a sibling disconnect fails", async () => {
    expect(
      await disconnectAllXeroConnections({ clerkOrgId: input.clerkOrgId })
    ).toMatchObject({
      ok: true,
      value: {
        outcomes: [
          { connectionId: input.connectionId, ok: true },
          { connectionId: "unavailable-connection", ok: false },
        ],
      },
    });
    expect(mocks.http).toHaveBeenCalledTimes(1);
  });
});
describe("remote-first Xero disconnect", () => {
  it.each([204, 404])(
    "clears the scoped binding and audits only after provider confirmation %s",
    async (status) => {
      mocks.http.mockImplementation(() => {
        expect(connection.status).toBe("active");
        expect(connection.xero_authorisation_id).toBe(grant.id);
        expect(auditEvents).toEqual([]);
        return Promise.resolve(new Response(null, { status }));
      });
      expect(await disconnectXeroOAuthConnection(input)).toEqual({
        ok: true,
        value: { connectionId: input.connectionId, state: "disconnected" },
      });
      expect(mocks.http).toHaveBeenCalledTimes(1);
      expect(mocks.http.mock.calls[0]?.[0]).toMatchObject({
        init: {
          headers: { Authorization: "Bearer synthetic-access-secret" },
          method: "DELETE",
        },
        url: "https://api.xero.com/connections/stored-remote%2Flink",
      });
      expect(connection).toMatchObject({
        clerk_org_id: input.clerkOrgId,
        disconnected_at: expect.any(Date),
        disconnected_by_user_id: input.performedByUserId,
        id: input.connectionId,
        organisation_id: input.organisationId,
        remote_connection_id: null,
        status: "disconnected",
        sync_paused_at: expect.any(Date),
        xero_authorisation_id: null,
        xero_tenant_id: "external-payroll-tenant",
      });
      expect(grantPresent).toBe(false);
      expect(auditEvents).toMatchObject([
        {
          action: "xero.connection_disconnected_soft",
          actor_user_id: input.performedByUserId,
          clerk_org_id: input.clerkOrgId,
          organisation_id: input.organisationId,
          resource_id: input.connectionId,
        },
      ]);
      expect(mocks.connectionUpdate.mock.calls[0]?.[0].where).toEqual({
        clerk_org_id: input.clerkOrgId,
        id: input.connectionId,
        organisation_id: input.organisationId,
      });
      expectNoBusinessDataPurge();
    }
  );
  it.each([
    { clerkOrgId: "different-clerk" },
    { organisationId: "sibling-payroll" },
    { connectionId: "sibling-connection" },
  ])(
    "denies a mismatched scope before provider access: %s",
    async (mismatch) => {
      const originalConnection = { ...connection };
      const originalGrant = { ...grant };
      expect(
        await disconnectXeroOAuthConnection({ ...input, ...mismatch })
      ).toMatchObject({ error: { code: "connection_inactive" }, ok: false });
      expect(mocks.access).not.toHaveBeenCalled();
      expect(mocks.http).not.toHaveBeenCalled();
      expectUnchanged(originalConnection, originalGrant);
    }
  );
  it.each([401, 429, 500, 503])(
    "preserves local state and credentials after unconfirmed provider response %s",
    async (status) => {
      const originalConnection = { ...connection };
      const originalGrant = { ...grant };
      mocks.http.mockResolvedValue(
        new Response("synthetic-access-secret synthetic-refresh-secret", {
          status,
        })
      );
      const result = await disconnectXeroOAuthConnection(input);
      expect(result).toEqual({
        error: {
          code: "unknown_error",
          message: "Xero could not be disconnected. Try again.",
        },
        ok: false,
      });
      expect(mocks.http).toHaveBeenCalledTimes(1);
      expectUnchanged(originalConnection, originalGrant);
      expectNoBusinessDataPurge();
    }
  );
  it("preserves local state after an ambiguous network failure without exposing token details", async () => {
    const originalConnection = { ...connection };
    const originalGrant = { ...grant };
    mocks.http.mockRejectedValue(
      new Error(
        "DELETE response lost: synthetic-access-secret synthetic-refresh-secret"
      )
    );
    const result = await disconnectXeroOAuthConnection(input);
    expect(result).toEqual({
      error: {
        code: "unknown_error",
        message: "Xero could not be disconnected. Try again.",
      },
      ok: false,
    });
    expect(mocks.http).toHaveBeenCalledTimes(1);
    expectUnchanged(originalConnection, originalGrant);
    expectNoBusinessDataPurge();
  });
  it.each(["sibling-connection", "live-selection"])(
    "retains the canonical grant referenced by %s through the no-reference deletion predicate",
    async (reference) => {
      hasSibling = reference === "sibling-connection";
      hasLiveSelection = reference === "live-selection";
      const originalGrant = { ...grant };
      expect(await disconnectXeroOAuthConnection(input)).toMatchObject({
        ok: true,
      });
      expect(connection.xero_authorisation_id).toBeNull();
      expect(grant).toEqual(originalGrant);
      expect(grantPresent).toBe(true);
      expect(mocks.authorisationDelete.mock.calls[0]?.[0]).toEqual({
        where: {
          connections: { none: {} },
          id: grant.id,
          sessions: {
            none: { expires_at: { gt: expect.any(Date) }, status: "selecting" },
          },
        },
      });
    }
  );
  it("stops before DELETE if reconnect changed the binding while waiting for the lock", async () => {
    mocks.scopedLock.mockImplementation(() => {
      connection = { ...connection, remote_connection_id: "new-remote-link" };
    });
    expect(await disconnectXeroOAuthConnection(input)).toMatchObject({
      error: { code: "connection_changed" },
      ok: false,
    });
    expect(connection.remote_connection_id).toBe("new-remote-link");
    expect(mocks.http).not.toHaveBeenCalled();
    expectUnchanged({ ...connection }, { ...grant });
  });
  it("stops before DELETE when payroll writes are still busy", async () => {
    busy = true;
    const originalConnection = { ...connection };
    const originalGrant = { ...grant };
    expect(await disconnectXeroOAuthConnection(input)).toMatchObject({
      error: { code: "write_in_progress" },
      ok: false,
    });
    expect(mocks.http).not.toHaveBeenCalled();
    expectUnchanged(originalConnection, originalGrant);
  });
});

describe("Remove company", () => {
  it("refuses administrators before reading credentials", async () => {
    expect(await removeXeroCompany({ ...input, role: "admin" })).toMatchObject({
      error: { code: "forbidden" },
      ok: false,
    });
    expect(mocks.scoped).not.toHaveBeenCalled();
    expect(mocks.http).not.toHaveBeenCalled();
  });
  it.each([403, 500])(
    "keeps ownership and company state when DELETE is uncertain %s",
    async (status) => {
      mocks.http.mockResolvedValue(new Response(null, { status }));
      const before = { ...connection };
      expect(
        await removeXeroCompany({ ...input, role: "owner" })
      ).toMatchObject({ ok: false });
      expectUnchanged(before, grant);
    }
  );
  it("releases only after remote confirmation, preserves a live selecting grant, and is idempotent", async () => {
    hasLiveSelection = true;
    mocks.feed.mockResolvedValue([{ id: "account-feed" }]);
    expect(await removeXeroCompany({ ...input, role: "owner" })).toMatchObject({
      ok: true,
      value: { state: "removed" },
    });
    expect(connection.released_at).toBeInstanceOf(Date);
    expect(grantPresent).toBe(true);
    expect(auditEvents.map((event) => event.action)).toContain(
      "company_removed"
    );
    expect(await removeXeroCompany({ ...input, role: "owner" })).toMatchObject({
      ok: true,
      value: { state: "removed" },
    });
    expect(mocks.http).toHaveBeenCalledTimes(1);
    expect(mocks.syncRun).not.toHaveBeenCalled();
  });
});
