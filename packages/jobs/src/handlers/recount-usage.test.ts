import { withTenantDb as withTestTenantDb } from "@repo/database/tenant-db";
import { tenantTestAccount } from "@repo/database/test-fixtures/tenant-scope";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  executeRaw: vi.fn((_query: TemplateStringsArray) => Promise.resolve(1)),
  feedCount: vi.fn(),
  organisationCount: vi.fn(),
  personCount: vi.fn(),
  scopeDatabase: null as Record<string, unknown> | null,
}));

vi.mock("../client", () => ({
  inngest: {
    createFunction: vi.fn(() => ({ id: "recount-usage" })),
    send: vi.fn(),
  },
}));
vi.mock("@repo/database/tenant-client", () => ({
  referenceDatabase: {
    // Real scope ownership and effects are exercised against this area's delegate fake.
    $transaction: async (run: (db: unknown) => Promise<unknown>) =>
      run({ ...mocks.scopeDatabase }),
  },
}));
vi.mock("@repo/database", async () => {
  const exports = {
    database: {
      $executeRaw: mocks.executeRaw,
      feed: { count: mocks.feedCount },
      organisation: { count: mocks.organisationCount },
      person: { count: mocks.personCount },
    },
  };
  const mockedModule = {
    ...exports,
    getScopedXeroConnection: vi.fn(async (bindingScope) => ({
      ok: true,
      value: {
        authorisation: { status: "active" },
        id: bindingScope.connectionId,
      },
    })),
    systemDatabase: exports.database,
  };
  if (!("$executeRaw" in exports.database)) {
    Object.assign(exports.database, { $executeRaw: vi.fn(async () => 1) });
  }
  if (!("$queryRaw" in exports.database)) {
    Object.assign(exports.database, { $queryRaw: vi.fn(async () => []) });
  }
  mocks.scopeDatabase = exports.database;
  const core = await vi.importActual<typeof import("@repo/database/tenant-db")>(
    "@repo/database/tenant-db"
  );
  return { ...mockedModule, ...core };
});

const { recountUsage } = await import("./recount-usage");

const ACCOUNT_ID = "org_recount";
const ORGANISATION_ID = "30000000-0000-4000-8000-000000000001";

function input(overrides: Record<string, unknown> = {}) {
  return {
    accountId: ACCOUNT_ID,
    organisationId: ORGANISATION_ID,
    ...overrides,
  };
}

describe("recountUsage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.personCount.mockResolvedValue(7);
    mocks.organisationCount.mockResolvedValue(2);
    mocks.feedCount.mockResolvedValue(3);
    mocks.executeRaw.mockResolvedValue(1);
  });

  it("counts active seats, payroll entities and active feeds scoped to the org", async () => {
    const result = await withTestTenantDb(tenantTestAccount(input()), (db) =>
      recountUsage(input(), db)
    );

    expect(result).toEqual({ feeds: 3, payrollEntities: 2, seats: 7 });
    expect(mocks.personCount).toHaveBeenCalledWith({
      where: {
        account_id: ACCOUNT_ID,
        archived_at: null,
        is_active: true,
      },
    });
    expect(mocks.organisationCount).toHaveBeenCalledWith({
      where: {
        account_id: ACCOUNT_ID,
        archived_at: null,
        is_active: true,
      },
    });
    expect(mocks.feedCount).toHaveBeenCalledWith({
      where: {
        account_id: ACCOUNT_ID,
        archived_at: null,
        status: "active",
      },
    });
  });

  it("upserts one usage counter per metric", async () => {
    await withTestTenantDb(tenantTestAccount(input()), (db) =>
      recountUsage(input(), db)
    );

    expect(
      mocks.executeRaw.mock.calls.filter(([query]) =>
        query.join("").includes("INSERT INTO usage_counters")
      )
    ).toHaveLength(3);
  });

  it("rejects input with a missing accountId", async () => {
    await expect(
      withTestTenantDb(tenantTestAccount(input({ accountId: "" })), (db) =>
        recountUsage(input({ accountId: "" }), db)
      )
    ).rejects.toThrow();
    expect(mocks.executeRaw).not.toHaveBeenCalled();
  });

  it("rejects input with a non-uuid organisationId", async () => {
    await expect(
      withTestTenantDb(
        tenantTestAccount(input({ organisationId: "not-a-uuid" })),
        (db) => recountUsage(input({ organisationId: "not-a-uuid" }), db)
      )
    ).rejects.toThrow();
    expect(mocks.executeRaw).not.toHaveBeenCalled();
  });
});
