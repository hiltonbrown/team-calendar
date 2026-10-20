import { withTenantResult as withTestTenantResult } from "@repo/database/tenant-db";
import { tenantTestAccount } from "@repo/database/test-fixtures/tenant-scope";
import { beforeEach, describe, expect, it, vi } from "vitest";

const AUDIT_FILENAME_PATTERN = /^audit-log-\d{4}-\d{2}-\d{2}-/;

const mocks = vi.hoisted(() => ({
  auditCount: vi.fn(),
  auditCreate: vi.fn(),
  auditFindFirst: vi.fn(),
  auditFindMany: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@repo/database/tenant-client", () => ({
  referenceDatabase: {
    $transaction: async (run: (db: unknown) => Promise<unknown>) =>
      run(buildTestDatabase()),
  },
}));
vi.mock("@repo/database", async () => ({
  ...(await vi.importActual<typeof import("@repo/database/tenant-db")>(
    "@repo/database/tenant-db"
  )),
}));
function buildTestDatabase() {
  // Selected delegates are fakes; scope ownership and commit effects use the real wrapper.
  return {
    $executeRaw: vi.fn(async () => 1),
    $queryRaw: vi.fn(async () => []),
    ...{
      auditEvent: {
        count: mocks.auditCount,
        create: mocks.auditCreate,
        findFirst: mocks.auditFindFirst,
        findMany: mocks.auditFindMany,
      },
    },
  };
}

const { exportCsv, getEventDetail, listEvents } = await import(
  "./audit-log-service"
);

const baseInput = {
  actingRole: "admin" as const,
  actingUserId: "user_1",
  clerkOrgId: "org_1",
  organisationId: "00000000-0000-4000-8000-000000000001",
};

const eventRow = {
  action: "organisation_settings.updated",
  actor_display: "Ava Admin",
  actor_user_id: "user_1",
  after_value: { safe: true, xero_write_error_raw: { remove: true } },
  before_value: { previous: true, xero_write_error_raw: { remove: true } },
  clerk_org_id: "org_1",
  created_at: new Date("2026-04-19T10:00:00.000Z"),
  entity_id: "00000000-0000-4000-8000-000000000001",
  entity_type: "organisation_settings",
  id: "70000000-0000-4000-8000-000000000001",
  ip_address: "203.0.113.10",
  metadata: {
    changedKeys: ["showPendingOnCalendar"],
    xero_write_error_raw: {},
  },
  organisation_id: "00000000-0000-4000-8000-000000000001",
  payload: { legacy: true },
  resource_id: "00000000-0000-4000-8000-000000000001",
  resource_type: "organisation_settings",
  user_agent: "Vitest",
};

describe("audit-log-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auditFindMany.mockResolvedValue([eventRow]);
    mocks.auditCount.mockResolvedValue(1);
    mocks.auditFindFirst.mockResolvedValue(eventRow);
  });

  it("lists events with filters and pagination", async () => {
    const result = await withTestTenantResult(
      tenantTestAccount({
        ...baseInput,
        filters: {
          actionPrefix: "organisation_settings.",
          actorUserId: ["user_1"],
          entityType: ["organisation_settings"],
        },
        pagination: { pageSize: 50 },
      }),
      (db) =>
        listEvents(
          {
            ...baseInput,
            filters: {
              actionPrefix: "organisation_settings.",
              actorUserId: ["user_1"],
              entityType: ["organisation_settings"],
            },
            pagination: { pageSize: 50 },
          },
          db
        )
    );

    expect(result).toMatchObject({
      ok: true,
      value: {
        events: [
          {
            action: "organisation_settings.updated",
            actorDisplay: "Ava Admin",
            entityType: "organisation_settings",
          },
        ],
        nextCursor: null,
        totalCount: 1,
      },
    });
    expect(mocks.auditFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          action: { startsWith: "organisation_settings." },
          actor_user_id: { in: ["user_1"] },
          entity_type: { in: ["organisation_settings"] },
        }),
      })
    );
  });

  it("loads detail and strips xero_write_error_raw", async () => {
    const result = await withTestTenantResult(
      tenantTestAccount({
        ...baseInput,
        eventId: eventRow.id,
      }),
      (db) =>
        getEventDetail(
          {
            ...baseInput,
            eventId: eventRow.id,
          },
          db
        )
    );

    expect(result).toMatchObject({
      ok: true,
      value: {
        metadata: { changedKeys: ["showPendingOnCalendar"] },
      },
    });
    if (!result.ok) {
      return;
    }
    expect(JSON.stringify(result.value.beforeValue)).not.toContain(
      "xero_write_error_raw"
    );
    expect(JSON.stringify(result.value.afterValue)).not.toContain(
      "xero_write_error_raw"
    );
  });

  it("exports CSV without before or after values", async () => {
    const result = await withTestTenantResult(
      tenantTestAccount({
        ...baseInput,
        filters: {},
      }),
      (db) =>
        exportCsv(
          {
            ...baseInput,
            filters: {},
          },
          db
        )
    );

    expect(result).toMatchObject({
      ok: true,
      value: {
        filename: expect.stringMatching(AUDIT_FILENAME_PATTERN),
      },
    });
    if (!result.ok) {
      return;
    }
    expect(result.value.csvContent).toContain("metadata_summary");
    expect(result.value.csvContent).not.toContain("before_value");
    expect(result.value.csvContent).not.toContain("after_value");
    expect(mocks.auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "audit_log.exported",
        }),
      })
    );
  });

  it("rejects non-admin and non-owner callers", async () => {
    const result = await withTestTenantResult(
      tenantTestAccount({
        ...baseInput,
        actingRole: "viewer",
        filters: {},
        pagination: { pageSize: 50 },
      }),
      (db) =>
        listEvents(
          {
            ...baseInput,
            actingRole: "viewer",
            filters: {},
            pagination: { pageSize: 50 },
          },
          db
        )
    );

    expect(result).toMatchObject({
      error: { code: "not_authorised" },
      ok: false,
    });
  });
});
