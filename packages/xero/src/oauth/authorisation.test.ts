vi.mock("server-only", () => ({}));

import { expect, test, vi } from "vitest";

const grant = {
  access_token_auth_tag: "tag",
  access_token_encrypted: "canonical-cipher",
  access_token_expires_at: new Date(Date.now() + 3_600_000),
  access_token_iv: "iv",
  granted_scopes: ["payroll.employees"],
  id: "grant",
  provider_app_id: "app",
  status: "active",
  token_key_version: 1,
  xero_user_id: "verified-user",
};
const db = vi.hoisted(() => ({
  findUnique: vi.fn(),
  findUniqueOrThrow: vi.fn(),
  update: vi.fn(),
}));
vi.mock("@repo/database", () => ({
  database: { xeroAuthorisation: db },
  withXeroGrantLock: async (_: unknown, work: (tx: unknown) => unknown) =>
    work({ xeroAuthorisation: db }),
}));
vi.mock("@repo/database/queries/xero-connections", () => ({
  getScopedXeroConnection: async () => ({
    ok: true,
    value: {
      authorisation: grant,
      id: "connection",
      payroll_region: "AU",
      status: "active",
      xero_authorisation_id: "grant",
      xero_tenant_id: "external-file",
    },
  }),
}));
vi.mock("../crypto/tokens", () => ({
  decryptXeroToken: ({ encrypted }: { encrypted: string }) =>
    encrypted === "canonical-cipher" ? "canonical-access" : "refresh",
  encryptXeroToken: vi.fn(),
}));
vi.mock("../../keys", () => ({ keys: () => ({ XERO_CLIENT_ID: "app" }) }));
vi.mock("./service", () => ({ TOKEN_REFRESH_BUFFER_MS: 300_000 }));
const canonical = await import("./authorisation");
test("access reads only canonical authorisation tokens for a scoped connection", async () => {
  expect(canonical.resolveXeroAccess).toBeTypeOf("function");
  db.findUnique.mockResolvedValue(grant);
  db.findUniqueOrThrow.mockResolvedValue(grant);
  const result = await canonical.resolveXeroAccess({
    capability: "payroll.employees",
    clerkOrgId: "account",
    deadline: { expiresAtMs: Date.now() + 15_000 },
    organisationId: "payroll",
  });
  expect(result).toEqual({
    ok: true,
    value: {
      accessToken: "canonical-access",
      connectionId: "connection",
      deadline: expect.any(Object),
      payrollRegion: "AU",
      xeroTenantId: "external-file",
    },
  });
  expect(db.update).not.toHaveBeenCalled();
});
