import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  capture: vi.fn(),
  findFirst: vi.fn(),
  flush: vi.fn(),
  matchCount: vi.fn(),
  tenantFindFirst: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@repo/analytics/server", () => ({
  analytics: { capture: mocks.capture, flush: mocks.flush },
}));
vi.mock("@repo/database", () => ({
  database: {
    syncRun: { findFirst: mocks.findFirst },
    xeroPersonMatch: { count: mocks.matchCount },
    xeroTenant: { findFirst: mocks.tenantFindFirst },
  },
}));
vi.mock("@repo/observability/log", () => ({
  log: { warn: vi.fn() },
}));

const { captureInitialSyncCompleted, checkXeroImportReadiness } = await import(
  "./activation"
);

describe("captureInitialSyncCompleted", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.flush.mockResolvedValue(undefined);
    mocks.tenantFindFirst.mockResolvedValue(null);
  });

  it("uses three bounded first-success queries and the final milestone time", async () => {
    mocks.findFirst
      .mockResolvedValueOnce({
        completed_at: new Date("2026-09-19T00:00:00.000Z"),
      })
      .mockResolvedValueOnce({
        completed_at: new Date("2026-09-19T00:02:00.000Z"),
      })
      .mockResolvedValueOnce({
        completed_at: new Date("2026-09-19T00:01:00.000Z"),
      });

    await captureInitialSyncCompleted({
      clerkOrgId: "org_1",
      organisationId: "11111111-1111-4111-8111-111111111111",
    });

    expect(mocks.findFirst).toHaveBeenCalledTimes(3);
    expect(
      mocks.findFirst.mock.calls.map(([query]) => query.where.run_type)
    ).toEqual(["people", "leave_records", "leave_balances"]);
    expect(mocks.capture).toHaveBeenCalledWith(
      expect.objectContaining({
        timestamp: new Date("2026-09-19T00:02:00.000Z"),
      })
    );
    expect(mocks.flush).toHaveBeenCalledTimes(1);
  });

  it("does not capture until every required successful run exists", async () => {
    mocks.findFirst
      .mockResolvedValueOnce({ completed_at: new Date() })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ completed_at: new Date() });

    await captureInitialSyncCompleted({
      clerkOrgId: "org_1",
      organisationId: "11111111-1111-4111-8111-111111111111",
    });

    expect(mocks.capture).not.toHaveBeenCalled();
  });

  it("scopes queries to the current active tenant and its binding generation", async () => {
    const tenantCreatedAt = new Date("2026-09-19T10:00:00.000Z");
    mocks.tenantFindFirst.mockResolvedValue({
      binding_generation: 2,
      created_at: tenantCreatedAt,
      id: "tenant_uuid_1",
    });

    mocks.findFirst
      .mockResolvedValueOnce({
        completed_at: new Date("2026-09-19T10:01:00.000Z"),
      })
      .mockResolvedValueOnce({
        completed_at: new Date("2026-09-19T10:02:00.000Z"),
      })
      .mockResolvedValueOnce({
        completed_at: new Date("2026-09-19T10:03:00.000Z"),
      });

    await captureInitialSyncCompleted({
      bindingGeneration: 2,
      clerkOrgId: "org_1",
      organisationId: "11111111-1111-4111-8111-111111111111",
      xeroTenantId: "tenant_uuid_1",
    });

    expect(mocks.tenantFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "tenant_uuid_1",
        }),
      })
    );

    for (const [query] of mocks.findFirst.mock.calls) {
      expect(query.where.xero_tenant_id).toBe("tenant_uuid_1");
      expect(query.where.started_at).toEqual({ gte: tenantCreatedAt });
    }

    expect(mocks.capture).toHaveBeenCalledWith(
      expect.objectContaining({
        timestamp: new Date("2026-09-19T10:03:00.000Z"),
      })
    );
  });

  it("skips activation capture when binding generation has changed", async () => {
    mocks.tenantFindFirst.mockResolvedValue({
      binding_generation: 3,
      created_at: new Date(),
      id: "tenant_uuid_1",
    });

    await captureInitialSyncCompleted({
      bindingGeneration: 2,
      clerkOrgId: "org_1",
      organisationId: "11111111-1111-4111-8111-111111111111",
      xeroTenantId: "tenant_uuid_1",
    });

    expect(mocks.findFirst).not.toHaveBeenCalled();
    expect(mocks.capture).not.toHaveBeenCalled();
  });
});

describe("checkXeroImportReadiness", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.tenantFindFirst.mockResolvedValue(null);
    mocks.matchCount.mockResolvedValue(0);
  });

  it("reports ready with zero pending matches when all runs succeeded", async () => {
    mocks.findFirst
      .mockResolvedValueOnce({
        completed_at: new Date("2026-09-19T00:00:00.000Z"),
      })
      .mockResolvedValueOnce({
        completed_at: new Date("2026-09-19T00:02:00.000Z"),
      })
      .mockResolvedValueOnce({
        completed_at: new Date("2026-09-19T00:01:00.000Z"),
      });

    const readiness = await checkXeroImportReadiness({
      clerkOrgId: "org_1",
      organisationId: "11111111-1111-4111-8111-111111111111",
    });

    expect(readiness.isInitialSyncCompleted).toBe(true);
    expect(readiness.hasUnresolvedPeople).toBe(false);
    expect(readiness.unresolvedPeopleCount).toBe(0);
    expect(readiness.completedAt).toEqual(new Date("2026-09-19T00:02:00.000Z"));
  });

  it("reports pending people matches separately from sync completion", async () => {
    mocks.findFirst
      .mockResolvedValueOnce({
        completed_at: new Date("2026-09-19T00:00:00.000Z"),
      })
      .mockResolvedValueOnce({
        completed_at: new Date("2026-09-19T00:02:00.000Z"),
      })
      .mockResolvedValueOnce({
        completed_at: new Date("2026-09-19T00:01:00.000Z"),
      });
    mocks.matchCount.mockResolvedValue(3);

    const readiness = await checkXeroImportReadiness({
      clerkOrgId: "org_1",
      organisationId: "11111111-1111-4111-8111-111111111111",
    });

    expect(readiness.isInitialSyncCompleted).toBe(true);
    expect(readiness.hasUnresolvedPeople).toBe(true);
    expect(readiness.unresolvedPeopleCount).toBe(3);
  });
});
