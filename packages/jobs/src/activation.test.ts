import { withTenantDb as withTestTenantDb } from "@repo/database/tenant-db";
import { tenantTestAccount } from "@repo/database/test-fixtures/tenant-scope";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  capture: vi.fn(),
  connection: vi.fn(),
  flush: vi.fn(),
  matches: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@repo/analytics/server", () => ({
  analytics: { capture: mocks.capture, flush: mocks.flush },
}));
const tenantTestState = vi.hoisted(() => ({ client: null as object | null }));
vi.mock("@repo/database/tenant-client", () => ({
  referenceDatabase: {
    $transaction: async (
      executeTransaction: (client: unknown) => Promise<unknown>
    ) => {
      if (!tenantTestState.client) {
        throw new Error("Missing fixture delegates");
      }
      return await executeTransaction({
        $executeRaw: vi.fn(async () => 1),
        $queryRaw: vi.fn(async () => []),
        ...tenantTestState.client,
      });
    },
  },
}));
vi.mock("@repo/database", async () => {
  const actualTenantCore = await vi.importActual<
    typeof import("@repo/database/tenant-db")
  >("@repo/database/tenant-db");

  const exports = {
    database: {
      xeroConnection: { findFirst: mocks.connection },
      xeroPersonMatch: { count: mocks.matches },
    },
  };
  tenantTestState.client = exports.database;
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

    ...actualTenantCore,
  };
});
vi.mock("@repo/observability/log", () => ({ log: { warn: vi.fn() } }));
const { captureInitialSyncCompleted, checkXeroImportReadiness } = await import(
  "./activation"
);
const scope = {
  clerkOrgId: "org_a",
  connectionId: "22222222-2222-4222-8222-222222222222",
  organisationId: "11111111-1111-4111-8111-111111111111",
};
describe("persisted complete initial import", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.matches.mockResolvedValue(0);
    mocks.connection.mockResolvedValue({ initial_sync_completed_at: null });
  });
  it("never advertises completion for a successful but partial balance sweep", async () => {
    expect(
      (
        await withTestTenantDb(tenantTestAccount(scope), (db) =>
          checkXeroImportReadiness(scope, db)
        )
      ).isInitialSyncCompleted
    ).toBe(false);
    await captureInitialSyncCompleted(scope);
    expect(mocks.capture).not.toHaveBeenCalled();
  });
  it("uses the persisted full-import boundary and keeps person matching separate", async () => {
    const completedAt = new Date("2026-10-07T12:00:00Z");
    mocks.connection.mockResolvedValue({
      initial_sync_completed_at: completedAt,
    });
    mocks.matches.mockResolvedValue(3);
    expect(
      await withTestTenantDb(tenantTestAccount(scope), (db) =>
        checkXeroImportReadiness(scope, db)
      )
    ).toEqual({
      completedAt,
      hasUnresolvedPeople: true,
      isInitialSyncCompleted: true,
      unresolvedPeopleCount: 3,
    });
    await captureInitialSyncCompleted(scope);
    expect(mocks.capture).toHaveBeenCalledWith(
      expect.objectContaining({ timestamp: completedAt })
    );
    expect(mocks.connection).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          clerk_org_id: scope.clerkOrgId,
          id: scope.connectionId,
          organisation_id: scope.organisationId,
        }),
      })
    );
  });
});
