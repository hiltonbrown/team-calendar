import type { Prisma } from "@repo/database/generated/client";
import { beforeEach, expect, test, vi } from "vitest";
import { withTenantResult as withTestTenantResult } from "../../../database/src/tenant-db";
import { tenantTestAccount } from "../../../database/src/test-fixtures/tenant-scope";

const state = vi.hoisted(() => ({
  audit: vi.fn(),
  failAudit: false,
  scope: "direct_reports_only",
  transaction: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("../../../database/src/tenant-client", () => ({
  referenceDatabase: { $transaction: state.transaction },
}));
vi.mock("@repo/database", async () => ({
  ...(await vi.importActual("../../../database/src/tenant-db")),
  ...(await vi.importActual("../../../database/src/queries/account-settings")),
  resolveAccountCompanies: async () => [{ id: "company-A" }],
}));

import { TenantMismatchError, withTenantDb } from "@repo/database";
import {
  getAccountApprovalSettings,
  updateAccountApprovalSettings,
} from "./account-approval-settings-service";

const input = {
  actingRole: "owner" as const,
  actingUserId: "user-1",
  clerkOrgId: "account-A",
  managerVisibilityScope: "all_team_leave" as const,
};
beforeEach(() => {
  vi.clearAllMocks();
  state.failAudit = false;
  state.scope = "direct_reports_only";
  state.audit.mockImplementation(async () => {
    if (state.failAudit) {
      throw new Error("Audit failed");
    }
    return await {};
  });
  state.transaction.mockImplementation(
    async (fn: (db: Prisma.TransactionClient) => Promise<unknown>) => {
      const previous = state.scope;
      const row = () => ({
        clerk_org_id: input.clerkOrgId,
        created_at: new Date(),
        id: "settings-A",
        manager_visibility_scope: state.scope,
        updated_at: new Date(),
      });
      const client = {
        $queryRaw: async () => [],
        accountSettings: {
          findFirst: async () => row(),
          findFirstOrThrow: async () => row(),
          updateMany: async ({
            data,
          }: {
            data: { manager_visibility_scope: string };
          }) => {
            state.scope = data.manager_visibility_scope;
            return await { count: 1 };
          },
        },
        auditEvent: { create: state.audit },
      };
      // Substitute the pool with the stateful delegates used by this rollback test.
      try {
        return await fn(client as unknown as Prisma.TransactionClient);
      } catch (error) {
        state.scope = previous;
        throw error;
      }
    }
  );
});
test.each(["manager", "viewer"] as const)(
  "%s cannot update account visibility",
  async (actingRole) => {
    expect(
      await withTestTenantResult(
        tenantTestAccount({ ...input, actingRole }),
        (db) => updateAccountApprovalSettings({ ...input, actingRole }, db)
      )
    ).toMatchObject({ error: { code: "not_authorised" }, ok: false });
    expect(state.audit).not.toHaveBeenCalled();
    expect(state.scope).toBe("direct_reports_only");
  }
);
test.each(["owner", "admin"] as const)(
  "%s updates the account setting with an audit",
  async (actingRole) => {
    expect(
      await withTestTenantResult(
        tenantTestAccount({ ...input, actingRole }),
        (db) => updateAccountApprovalSettings({ ...input, actingRole }, db)
      )
    ).toMatchObject({
      ok: true,
      value: { managerVisibilityScope: "all_team_leave" },
    });
    expect(state.transaction).toHaveBeenCalledOnce();
    expect(state.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          clerk_org_id: input.clerkOrgId,
          entity_type: "account_settings",
          organisation_id: "company-A",
        }),
      })
    );
  }
);
test("audit failure rolls back the visibility change", async () => {
  state.failAudit = true;
  await expect(
    withTestTenantResult(tenantTestAccount(input), (db) =>
      updateAccountApprovalSettings(input, db)
    )
  ).rejects.toThrow("Audit failed");
  expect(state.scope).toBe("direct_reports_only");
});
test("reads and updates share a supplied scope", async () => {
  await withTenantDb(input.clerkOrgId, async (db) => {
    await getAccountApprovalSettings(input, db);
    await updateAccountApprovalSettings(input, db);
  });
  expect(state.transaction).toHaveBeenCalledOnce();
});
test("ownership mismatch escapes before any write", async () => {
  await expect(
    withTenantDb("account-B", (db) => updateAccountApprovalSettings(input, db))
  ).rejects.toBeInstanceOf(TenantMismatchError);
  expect(state.audit).not.toHaveBeenCalled();
});
