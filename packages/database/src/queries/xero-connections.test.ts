import { describe, expect, test, vi } from "vitest";

const findFirst = vi.fn();
const updateMany = vi.fn();
vi.mock("../system-client", () => ({
  systemDatabase: {
    xeroAuthorisation: {
      findFirst: async () => ({ id: "grant" }),
      findUnique: async () => null,
    },
    xeroConnection: { updateMany },
  },
}));
vi.mock("../tenant-client", () => ({
  tenantDatabase: () => ({ xeroConnection: { findFirst, updateMany } }),
}));
const module = await import("./xero-connections").catch(() => null);
describe("canonical scoped connections", () => {
  test("does not reveal sibling account metadata", async () => {
    expect(module?.getScopedXeroConnection).toBeTypeOf("function");
    findFirst.mockResolvedValue(null);
    const result = await module?.getScopedXeroConnection({
      clerkOrgId: "account",
      connectionId: "connection",
      organisationId: "payroll",
    });
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        clerk_org_id: "account",
        id: "connection",
        organisation_id: "payroll",
        released_at: null,
      },
    });
    expect(result).toEqual({
      error: { code: "not_connected", message: "Xero is not connected." },
      ok: false,
    });
  });
});

describe("provider disconnect compare-and-set", () => {
  test("marks only the scoped captured link and grant, retaining all provider data", async () => {
    expect(module?.markScopedXeroConnectionReconnectRequired).toBeTypeOf(
      "function"
    );
    findFirst.mockResolvedValue({ id: "connection" });
    updateMany.mockResolvedValue({ count: 1 });
    const captured = {
      authorisationId: "grant",
      authorisationUpdatedAt: new Date("2026-10-07T00:00:00Z"),
      clerkOrgId: "account",
      connectionId: "connection",
      lastConnectedAt: new Date("2026-10-06T00:00:00Z"),
      organisationId: "payroll",
      remoteConnectionId: "remote",
      xeroTenantId: "tenant",
    };
    expect(
      await module?.markScopedXeroConnectionReconnectRequired(captured)
    ).toBe(true);
    expect(updateMany).toHaveBeenCalledWith({
      data: {
        last_error_code: "reauthorisation_required",
        last_error_message: "Reconnect Xero to continue.",
        status: "reconnect_required",
      },
      where: {
        authorisation: {
          status: "active",
          updated_at: captured.authorisationUpdatedAt,
        },
        clerk_org_id: "account",
        disconnected_at: null,
        id: "connection",
        last_connected_at: captured.lastConnectedAt,
        organisation_id: "payroll",
        released_at: null,
        remote_connection_id: "remote",
        status: "active",
        xero_authorisation_id: "grant",
        xero_tenant_id: "tenant",
      },
    });
  });
});
