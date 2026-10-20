const tenantPoolMocks = vi.hoisted(() => ({
  organisationFindFirst: vi.fn((query: { where: { id?: string } }) =>
    Promise.resolve(
      query.where.id === "00000000-0000-4000-8000-000000000001"
        ? {
            country_code: "AU",
            id: "00000000-0000-4000-8000-000000000001",
            name: "Company A",
            timezone: "Australia/Brisbane",
          }
        : null
    )
  ),
}));
vi.mock("../../../../../../packages/database/src/tenant-client", () => ({
  referenceDatabase: {
    $transaction: (run: (client: unknown) => Promise<unknown>) =>
      run({
        $executeRaw: vi.fn(() => Promise.resolve(1)),
        $queryRaw: vi.fn(() => Promise.resolve([])),
        organisation: {
          findFirst: tenantPoolMocks.organisationFindFirst,
          findMany: vi.fn(() =>
            Promise.resolve([
              {
                country_code: "AU",
                id: "00000000-0000-4000-8000-000000000001",
                name: "Company A",
                timezone: "Australia/Brisbane",
              },
            ])
          ),
        },
        person: {
          findFirst: vi.fn(() =>
            Promise.resolve({
              id: "person-1",
              organisation_id: "00000000-0000-4000-8000-000000000001",
            })
          ),
        },
      }),
  },
}));
vi.mock("@repo/database", async () => ({
  ...(await vi.importActual<
    typeof import("../../../../../../packages/database/src/queries/account-companies")
  >("../../../../../../packages/database/src/queries/account-companies")),

  ...(await vi.importActual<
    typeof import("../../../../../../packages/database/src/tenant-db")
  >("../../../../../../packages/database/src/tenant-db")),
  ...(await vi.importActual<
    typeof import("../../../../../../packages/database/src/queries/organisations")
  >("../../../../../../packages/database/src/queries/organisations")),
}));

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  currentUser: vi.fn(),
  exportAuditLogCsv: vi.fn(),
  getActiveOrgContext: vi.fn(),
}));

vi.mock("@repo/auth/server", () => ({
  auth: mocks.auth,
  currentUser: mocks.currentUser,
}));
vi.mock("@repo/availability", () => ({
  exportAuditLogCsv: mocks.exportAuditLogCsv,
}));
vi.mock("@/lib/server/get-active-org-context", () => ({
  getActiveOrgContext: mocks.getActiveOrgContext,
}));

const { exportAuditLogCsvAction } = await import("./_actions");

const organisationId = "00000000-0000-4000-8000-000000000001";
const clerkOrgId = "org_123";
const userId = "user_456";

describe("settings audit-log server actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ orgId: "org_123", orgRole: "org:admin" });
    mocks.currentUser.mockResolvedValue({ id: userId });
    mocks.getActiveOrgContext.mockResolvedValue({
      ok: true,
      value: { clerkOrgId, organisationId },
    });
    mocks.exportAuditLogCsv.mockResolvedValue({
      ok: true,
      value: {
        csvContent: "timestamp,action\n2026-01-01,user.login",
        filename: "audit-log.csv",
      },
    });
  });

  describe("baseline authorization and scoping tests", () => {
    it("rejects unauthenticated callers", async () => {
      mocks.currentUser.mockResolvedValue(null);

      const result = await exportAuditLogCsvAction({
        filters: {},
        organisationId,
      });

      expect(result).toEqual({
        error: {
          code: "not_authorised",
          message: "You do not have permission to export the audit log.",
        },
        ok: false,
      });
      expect(mocks.exportAuditLogCsv).not.toHaveBeenCalled();
    });

    it("rejects non-admin roles (manager, viewer)", async () => {
      mocks.auth.mockResolvedValue({
        orgId: "org_123",
        orgRole: "org:manager",
      });

      const result = await exportAuditLogCsvAction({
        filters: {},
        organisationId,
      });

      expect(result).toEqual({
        error: {
          code: "not_authorised",
          message: "You do not have permission to export the audit log.",
        },
        ok: false,
      });
      expect(mocks.exportAuditLogCsv).not.toHaveBeenCalled();
    });

    it("rejects malformed inputs", async () => {
      const result = await exportAuditLogCsvAction({
        filters: {},
        organisationId: "invalid-uuid",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("validation_error");
      }
      expect(mocks.exportAuditLogCsv).not.toHaveBeenCalled();
    });

    it("scopes export call to clerkOrgId and organisationId", async () => {
      await exportAuditLogCsvAction({
        filters: {},
        organisationId,
      });

      expect(mocks.exportAuditLogCsv).toHaveBeenCalledWith(
        {
          actingRole: "admin",
          actingUserId: userId,
          clerkOrgId,
          filters: {},
          organisationId,
        },
        expect.any(Object)
      );
    });
  });

  describe("action specific functionality", () => {
    it("exports audit log CSV with provided filters", async () => {
      const filters = { actionPrefix: "xero." };
      const result = await exportAuditLogCsvAction({
        filters,
        organisationId,
      });

      expect(result.ok).toBe(true);
      expect(mocks.exportAuditLogCsv).toHaveBeenCalledWith(
        expect.objectContaining({
          filters: expect.objectContaining({ actionPrefix: "xero." }),
        }),
        expect.any(Object)
      );
    });
  });
});
