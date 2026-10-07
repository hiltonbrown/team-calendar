import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  capture: vi.fn(),
  connectionFindFirst: vi.fn(),
  findFirst: vi.fn(),
  flush: vi.fn(),
  matchCount: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@repo/analytics/server", () => ({
  analytics: { capture: mocks.capture, flush: mocks.flush },
}));
vi.mock("@repo/database", () => ({
  database: {
    syncRun: { findFirst: mocks.findFirst },
    xeroConnection: { findFirst: mocks.connectionFindFirst },
    xeroPersonMatch: { count: mocks.matchCount },
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
    mocks.connectionFindFirst.mockResolvedValue(null);
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
  it("scopes queries to the current active connection and its creation time", async () => {
    const tenantCreatedAt = new Date("2026-09-19T10:00:00.000Z");
    mocks.connectionFindFirst.mockResolvedValue({
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
      clerkOrgId: "org_1",
      connectionId: "tenant_uuid_1",
      organisationId: "11111111-1111-4111-8111-111111111111",
    });
    expect(mocks.connectionFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "tenant_uuid_1",
        }),
      })
    );
    for (const [query] of mocks.findFirst.mock.calls) {
      expect(query.where.xero_connection_id).toBe("tenant_uuid_1");
      expect(query.where.started_at).toEqual({ gte: tenantCreatedAt });
    }
    expect(mocks.capture).toHaveBeenCalledWith(
      expect.objectContaining({
        timestamp: new Date("2026-09-19T10:03:00.000Z"),
      })
    );
  });
});
describe("checkXeroImportReadiness", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.connectionFindFirst.mockResolvedValue(null);
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
