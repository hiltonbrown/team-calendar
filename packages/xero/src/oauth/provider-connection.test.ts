import { beforeEach, describe, expect, it, vi } from "vitest";
import type { XeroAccessContext } from "../write/types";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  http: vi.fn(),
  mark: vi.fn(),
  scoped: vi.fn(),
}));
vi.mock("@repo/database/queries/xero-connections", () => ({
  getScopedXeroConnection: mocks.scoped,
  markScopedXeroConnectionReconnectRequired: mocks.mark,
}));
vi.mock("../rate-limit/xero-fetch", () => ({ xeroFetch: mocks.http }));

import { verifyXeroProviderConnection } from "./provider-connection";

const remoteId = "00000000-0000-4000-8000-000000000001";
const tenantId = "00000000-0000-4000-8000-000000000002";
function context(): XeroAccessContext {
  return {
    accessToken: "server-access",
    clerk_org_id: "account",
    deadline: { expiresAtMs: 1_791_405_200_000 },
    id: "connection",
    organisation_id: "payroll",
    payroll_region: "AU",
    providerConnection: {
      authorisationId: "grant",
      authorisationUpdatedAt: new Date("2026-10-07T00:00:00Z"),
      lastConnectedAt: new Date("2026-10-06T00:00:00Z"),
      remoteConnectionId: remoteId,
    },
    xero_tenant_id: tenantId,
  };
}
function row(id = remoteId, tenant = tenantId) {
  return {
    id,
    tenantId: tenant,
    tenantName: "Payroll",
    tenantType: "ORGANISATION",
  };
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.mark.mockResolvedValue(true);
  mocks.scoped.mockResolvedValue({
    ok: true,
    value: {
      authorisation: {
        provider_app_id: "app",
        status: "active",
        updated_at: context().providerConnection?.authorisationUpdatedAt,
      },
      disconnected_at: null,
      id: "connection",
      last_connected_at: context().providerConnection?.lastConnectedAt,
      remote_connection_id: remoteId,
      status: "active",
      xero_authorisation_id: "grant",
      xero_tenant_id: tenantId,
    },
  });
  mocks.http.mockResolvedValue(Response.json([]));
});
function verify(definiteTenantAuthFailure = false) {
  return verifyXeroProviderConnection(context(), definiteTenantAuthFailure);
}
describe("confirmed selected provider connection", () => {
  it("marks successful complete inventory absence with the scoped captured link", async () => {
    expect(await verify()).toBe("reconnect_required");
    expect(mocks.mark).toHaveBeenCalledWith({
      ...context().providerConnection,
      clerkOrgId: "account",
      connectionId: "connection",
      organisationId: "payroll",
      xeroTenantId: tenantId,
    });
    expect(mocks.http).toHaveBeenCalledOnce();
    const call = mocks.http.mock.calls[0]?.[0];
    expect(call).toMatchObject({
      deadline: context().deadline,
      maxAttempts: 1,
      rateClass: { kind: "user_inventory", providerAppId: "app" },
      url: "https://api.xero.com/connections",
    });
    expect(new Headers(call.init.headers).get("Authorization")).toBe(
      "Bearer server-access"
    );
    expect(new Headers(call.init.headers).get("xero-tenant-id")).toBeNull();
  });
  it("retains a present exact remote and tenant pair", async () => {
    mocks.http.mockResolvedValue(Response.json([row()]));
    expect(await verify()).toBe("present");
    expect(mocks.mark).not.toHaveBeenCalled();
  });
  it("requires both the remote connection ID and tenant ID to match", async () => {
    mocks.http.mockResolvedValue(
      Response.json([row(remoteId, "00000000-0000-4000-8000-000000000099")])
    );
    expect(await verify()).toBe("reconnect_required");
  });
  it("requires reconnect for definite tenant auth failure after a readable inventory check", async () => {
    mocks.http.mockResolvedValue(Response.json([row()]));
    expect(await verify(true)).toBe("reconnect_required");
  });
  it.each(
    [
      {},
      { connections: [] },
      null,
      [row(), {}],
      [{ id: remoteId, tenantId }],
      [row(), row()],
    ].map((payload) => ({ payload }))
  )(
    "does not infer absence from malformed inventory %j",
    async ({ payload }) => {
      mocks.http.mockResolvedValue(Response.json(payload));
      expect(await verify(true)).toBe("inconclusive");
      expect(mocks.mark).not.toHaveBeenCalled();
    }
  );
  it.each([206, 401, 403, 429, 500, 503])(
    "does not revoke on inventory status %i",
    async (status) => {
      mocks.http.mockResolvedValue(Response.json([], { status }));
      expect(await verify(true)).toBe("inconclusive");
      expect(mocks.mark).not.toHaveBeenCalled();
    }
  );
  it.each([
    { "content-range": "items 0-0/2" },
    { link: '<https://api.xero.com/connections?page=2>; rel="next"' },
  ])("does not accept explicitly partial inventory %j", async (headers) => {
    mocks.http.mockResolvedValue(Response.json([], { headers }));
    expect(await verify(true)).toBe("inconclusive");
    expect(mocks.mark).not.toHaveBeenCalled();
  });
  it("retains state after a timeout or unreadable body", async () => {
    mocks.http.mockRejectedValueOnce(new Error("timeout"));
    expect(await verify(true)).toBe("inconclusive");
    mocks.http.mockResolvedValue(
      new Response("truncated json", { status: 200 })
    );
    expect(await verify(true)).toBe("inconclusive");
    expect(mocks.mark).not.toHaveBeenCalled();
  });
  it("does no provider work after a scoped ownership miss", async () => {
    mocks.scoped.mockResolvedValue({
      error: { code: "not_connected", message: "Missing" },
      ok: false,
    });
    expect(await verify(true)).toBe("connection_changed");
    expect(mocks.http).not.toHaveBeenCalled();
    expect(mocks.mark).not.toHaveBeenCalled();
  });
  it("does not probe a replacement remote link", async () => {
    const scoped = await mocks.scoped();
    mocks.scoped.mockResolvedValue({
      ...scoped,
      value: { ...scoped.value, remote_connection_id: "replacement" },
    });
    expect(await verify(true)).toBe("connection_changed");
    expect(mocks.http).not.toHaveBeenCalled();
  });
  it("returns connection_changed if a reconnect wins the compare-and-set race", async () => {
    mocks.mark.mockResolvedValue(false);
    expect(await verify()).toBe("connection_changed");
  });
});
