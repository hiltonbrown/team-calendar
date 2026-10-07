import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  connection: { findFirst: vi.fn() },
  due: vi.fn(),
  grant: {
    findUnique: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    update: vi.fn(),
    upsert: vi.fn(),
  },
  http: vi.fn(),
  lock: vi.fn(),
  scoped: vi.fn(),
  verify: vi.fn(),
}));
vi.mock("@repo/database", () => ({
  database: {
    xeroAuthorisation: mocks.grant,
    xeroConnection: mocks.connection,
  },
  lockXeroAuthorisation: vi.fn(),
  withXeroGrantLock: mocks.lock,
}));
vi.mock("@repo/database/queries/xero-connections", () => ({
  getScopedXeroConnection: mocks.scoped,
}));
vi.mock("@repo/database/queries/xero-authorisation", () => ({
  listDueXeroAuthorisations: mocks.due,
  saveXeroAuthorisation: mocks.grant.upsert,
}));
vi.mock("@repo/availability", () => ({}));
vi.mock("@repo/feeds", () => ({}));
vi.mock("./identity", () => ({ verifyXeroAccessTokenIdentity: mocks.verify }));
vi.mock("../rate-limit/xero-fetch", () => ({
  parseRetryAfter: () => undefined,
  XeroFetchError: class extends Error {},
  xeroFetch: mocks.http,
}));
vi.mock("../../keys", () => ({
  keys: () => ({
    XERO_CLIENT_ID: "app",
    XERO_CLIENT_SECRET: "secret",
    XERO_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32).toString("base64"),
  }),
}));

import { decryptXeroToken, encryptXeroToken } from "../crypto/tokens";
import {
  refreshDormantXeroAuthorisations,
  resolveXeroAccess,
} from "./authorisation";

function grant(expiry = Date.now() + 3_600_000) {
  const access = encryptXeroToken("old-access"),
    refresh = encryptXeroToken("old-refresh");
  return {
    access_token_auth_tag: access.authTag,
    access_token_encrypted: access.encrypted,
    access_token_expires_at: new Date(expiry),
    access_token_iv: access.iv,
    granted_scopes: ["payroll.employees", "payroll.settings.read"],
    id: "grant",
    last_refreshed_at: new Date(),
    provider_app_id: "app",
    refresh_token_auth_tag: refresh.authTag,
    refresh_token_encrypted: refresh.encrypted,
    refresh_token_iv: refresh.iv,
    status: "active",
    token_encrypted_at: access.encryptedAt,
    token_key_version: access.keyVersion,
    updated_at: new Date("2026-10-07T00:00:00Z"),
    xero_user_id: "user",
  };
}
let current: ReturnType<typeof grant>;
const input = () => ({
  capability: "payroll.employees.read",
  clerkOrgId: "account",
  connectionId: "connection",
  deadline: { expiresAtMs: Date.now() + 120_000 },
  organisationId: "payroll",
});
beforeEach(() => {
  vi.resetAllMocks();
  current = grant();
  mocks.scoped.mockImplementation(async () => ({
    ok: true,
    value: {
      authorisation: current,
      id: "connection",
      last_connected_at: new Date("2026-10-06T00:00:00Z"),
      payroll_region: "AU",
      remote_connection_id: "remote",
      status: "active",
      xero_authorisation_id: "grant",
      xero_tenant_id: "external",
    },
  }));
  mocks.grant.findUnique.mockImplementation(async () => current);
  mocks.grant.findUniqueOrThrow.mockImplementation(async () => current);
  mocks.grant.update.mockImplementation(({ data }) => {
    current = { ...current, ...data };
    return current;
  });
  mocks.lock.mockImplementation(async (_input, work) =>
    work({ xeroAuthorisation: mocks.grant, xeroConnection: mocks.connection })
  );
  mocks.verify.mockResolvedValue({
    ok: true,
    value: {
      authEventId: null,
      expiresAt: new Date(Date.now() + 1_800_000),
      grantedScopes: ["payroll.employees"],
      xeroUserId: "user",
    },
  });
  mocks.connection.findFirst.mockResolvedValue({ id: "connection" });
  mocks.due.mockResolvedValue({ ok: true, value: [] });
  mocks.http.mockResolvedValue(
    Response.json({
      access_token: "new-access",
      expires_in: 1800,
      refresh_token: "new-refresh",
    })
  );
});
describe("one scoped canonical access resolver", () => {
  it("captures the selected link and canonical freshness for provider failure verification", async () => {
    expect(await resolveXeroAccess(input())).toMatchObject({
      ok: true,
      value: {
        providerConnection: {
          authorisationId: "grant",
          authorisationUpdatedAt: current.updated_at,
          lastConnectedAt: new Date("2026-10-06T00:00:00Z"),
          remoteConnectionId: "remote",
        },
      },
    });
  });
  it("stops repeated provider refresh after shared invalid_grant", async () => {
    current = grant(Date.now() - 1000);
    mocks.http.mockResolvedValueOnce(
      Response.json({ error: "invalid_grant" }, { status: 400 })
    );
    expect(await resolveXeroAccess(input())).toMatchObject({ ok: false });
    expect(await resolveXeroAccess(input())).toMatchObject({
      error: { code: "reauthorisation_required" },
      ok: false,
    });
    expect(mocks.http).toHaveBeenCalledTimes(1);
  });

  it("uses a valid token without taking a refresh lock", async () => {
    const result = await resolveXeroAccess(input());
    expect(result).toMatchObject({
      ok: true,
      value: { accessToken: "old-access", connectionId: "connection" },
    });
    expect(mocks.lock).not.toHaveBeenCalled();
    expect(mocks.http).not.toHaveBeenCalled();
    if (result.ok) {
      expect(Object.isFrozen(result.value)).toBe(true);
    }
  });
  it("requires all capabilities before any refresh", async () => {
    current = {
      ...grant(Date.now() - 1000),
      granted_scopes: ["payroll.employees"],
    };
    expect(
      await resolveXeroAccess({
        ...input(),
        capability: ["payroll.employees.read", "payroll.settings.read"],
      })
    ).toMatchObject({ error: { code: "capability_missing" }, ok: false });
    expect(mocks.http).not.toHaveBeenCalled();
    expect(mocks.lock).not.toHaveBeenCalled();
  });
  it("does not refresh three minutes before expiry", async () => {
    current = grant(Date.now() + 180_000);
    expect(await resolveXeroAccess(input())).toMatchObject({ ok: true });
    expect(mocks.http).not.toHaveBeenCalled();
  });
  it("refreshes within two minutes, preserves omitted scopes and clips token deadline", async () => {
    current = grant(Date.now() + 60_000);
    const began = Date.now();
    expect(await resolveXeroAccess(input())).toMatchObject({
      ok: true,
      value: { accessToken: "new-access" },
    });
    expect(current.granted_scopes).toEqual([
      "payroll.employees",
      "payroll.settings.read",
    ]);
    const call = mocks.http.mock.calls[0]?.[0];
    expect(call.maxAttempts).toBe(1);
    expect(call.deadline.expiresAtMs).toBeLessThanOrEqual(began + 10_050);
    expect(mocks.lock.mock.calls[0]?.[0].deadlineAt).toBeLessThanOrEqual(
      began + 10_050
    );
  });
  it("honours narrower actual scopes supplied by the verified refreshed JWT", async () => {
    current = grant(Date.now() - 1000);
    mocks.verify.mockResolvedValueOnce({
      ok: true,
      value: {
        authEventId: null,
        expiresAt: new Date(Date.now() + 1_800_000),
        grantedScopes: ["payroll.employees"],
        scopeProvided: true,
        xeroUserId: "user",
      },
    });
    expect(
      await resolveXeroAccess({
        ...input(),
        capability: ["payroll.employees.read", "payroll.settings.read"],
      })
    ).toMatchObject({ error: { code: "capability_missing" }, ok: false });
    expect(current.granted_scopes).toEqual(["payroll.employees"]);
  });
  it("reuses another worker's rotated token for a definite rejected token", async () => {
    expect(
      await resolveXeroAccess({
        ...input(),
        previousAccessToken: "older-access",
      })
    ).toMatchObject({ ok: true, value: { accessToken: "old-access" } });
    expect(mocks.http).not.toHaveBeenCalled();
  });
  it("recovers a lost refresh response on the next normal attempt with the stored old token", async () => {
    current = grant(Date.now() - 1000);
    mocks.http.mockRejectedValueOnce(new Error("lost response"));
    expect(await resolveXeroAccess(input())).toMatchObject({
      error: { code: "network_error" },
      ok: false,
    });
    expect(mocks.http).toHaveBeenCalledTimes(1);
    expect(current.status).toBe("active");
    expect(await resolveXeroAccess(input())).toMatchObject({
      ok: true,
      value: { accessToken: "new-access" },
    });
    expect(mocks.http).toHaveBeenCalledTimes(2);
    for (const [call] of mocks.http.mock.calls) {
      expect(new URLSearchParams(call.init.body).get("refresh_token")).toBe(
        "old-refresh"
      );
    }
    expect(
      decryptXeroToken({
        authTag: current.refresh_token_auth_tag,
        encrypted: current.refresh_token_encrypted,
        iv: current.refresh_token_iv,
        keyVersion: current.token_key_version,
      })
    ).toBe("new-refresh");
  });
  it.each(["invalid_client", "temporary"])(
    "keeps %s retryable without destroying canonical credentials",
    async (error) => {
      current = grant(Date.now() - 1000);
      const encrypted = current.refresh_token_encrypted;
      mocks.http.mockResolvedValueOnce(
        Response.json(
          { error },
          { status: error === "invalid_client" ? 401 : 503 }
        )
      );
      expect(await resolveXeroAccess(input())).toMatchObject({ ok: false });
      expect(current.status).toBe("active");
      expect(current.refresh_token_encrypted).toBe(encrypted);
    }
  );
  it("describes refresh failure as a user action without credential mechanics", async () => {
    current = grant(Date.now() - 1000);
    mocks.http.mockResolvedValueOnce(
      Response.json({ error: "invalid_grant" }, { status: 400 })
    );
    expect(await resolveXeroAccess(input())).toMatchObject({
      error: { message: "Reconnect Xero to continue." },
      ok: false,
    });
  });
  it("marks late invalid_grant on the shared authorisation", async () => {
    current = grant(Date.now() - 1000);
    mocks.http.mockResolvedValueOnce(
      Response.json({ error: "invalid_grant" }, { status: 400 })
    );
    expect(await resolveXeroAccess(input())).toMatchObject({
      error: { code: "refresh_token_invalid" },
      ok: false,
    });
    expect(current.status).toBe("reconnect_required");
  });
});

describe("canonical dormant maintenance", () => {
  it("exposes only safe maintenance counters", async () => {
    expect(refreshDormantXeroAuthorisations).toBeTypeOf("function");
    const result = await refreshDormantXeroAuthorisations(new Date());
    expect(result).toEqual({
      ok: true,
      value: { failed: 0, refreshed: 0, scanned: 0, skipped: 0 },
    });
  });
  it("rereads shared due grants and skips a concurrent rotation", async () => {
    expect(refreshDormantXeroAuthorisations).toBeTypeOf("function");
    mocks.due.mockResolvedValue({
      ok: true,
      value: [
        {
          id: "grant",
          last_refreshed_at: new Date(0),
          provider_app_id: "app",
          xero_user_id: "user",
        },
      ],
    });
    expect(await refreshDormantXeroAuthorisations(new Date())).toEqual({
      ok: true,
      value: { failed: 0, refreshed: 0, scanned: 1, skipped: 1 },
    });
    expect(mocks.http).not.toHaveBeenCalled();
  });
});
