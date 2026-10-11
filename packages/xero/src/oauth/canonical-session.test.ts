vi.mock("server-only", () => ({}));

import { beforeEach, describe, expect, test, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  create: vi.fn(),
  findFirst: vi.fn(),
  findMany: vi.fn(),
  updateMany: vi.fn(),
}));
vi.mock("@repo/database", () => {
  const exports = {
    database: {
      organisation: { findMany: mocked.findMany },
      xeroOAuthSession: {
        create: mocked.create,
        findFirst: mocked.findFirst,
        updateMany: mocked.updateMany,
      },
    },
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
vi.mock("@repo/availability", () => ({}));
vi.mock("@repo/database/queries/xero-ownership", () => ({
  listXeroTenantOwnership: vi.fn(async () => new Map()),
}));
vi.mock("@repo/database/queries/payroll-entitlements", () => ({
  checkPayrollEntityEntitlement: vi.fn(async () => ({
    ok: true,
    value: { allowed: true, current: 0, limit: 5 },
  })),
}));
vi.mock("@repo/feeds", () => ({}));
vi.mock("@repo/observability/log", () => ({ log: { error: vi.fn() } }));
vi.mock("../../keys", () => ({
  keys: () => ({
    XERO_CLIENT_ID: "test-client",
    XERO_CLIENT_SECRET: "test-secret",
    XERO_REDIRECT_URI: "http://localhost:3002/oauth/callback",
  }),
}));
const { getPendingXeroOAuthSession } = await import("./service");
beforeEach(() => vi.clearAllMocks());
describe("canonical OAuth sessions", () => {
  test("selection uses canonical authorisation reference without session tokens", async () => {
    mocked.findFirst.mockResolvedValue({
      available_tenants_json: {
        tenants: [
          {
            connectionId: "remote-link",
            isCurrentConsent: true,
            tenantId: "external-file",
            tenantName: "Payroll",
          },
        ],
      },
      clerk_org_id: "account",
      created_by_user_id: "user",
      expires_at: new Date(Date.now() + 60_000),
      id: "session",
      organisation_id: "payroll",
      return_to: "/settings/integrations/xero",
      xero_authorisation_id: "grant",
    });
    mocked.findMany.mockResolvedValue([
      { country_code: "AU", id: "payroll", name: "Payroll" },
    ]);
    const result = await getPendingXeroOAuthSession({
      clerkOrgId: "account",
      sessionId: "session",
      userId: "user",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.tenants).toEqual([
        {
          connectionId: "remote-link",
          isCurrentConsent: true,
          state: "available",
          tenantId: "external-file",
          tenantName: "Payroll",
        },
      ]);
    }
    expect(mocked.findFirst.mock.calls[0]?.[0].where.status).toBe("selecting");
    expect(mocked.findFirst.mock.calls[0]?.[0]).not.toHaveProperty(
      "select.access_token_encrypted"
    );
  });
});
