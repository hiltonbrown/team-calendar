import { Prisma } from "@repo/database/generated/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  availabilityCount: vi.fn(),
  computeCurrentStatus: vi.fn(),
  managerScopePersonIds: vi.fn(),
  personFindMany: vi.fn(),
  scopedQuery: vi.fn((clerkOrgId: string, organisationId: string) => ({
    clerk_org_id: clerkOrgId,
    organisation_id: organisationId,
  })),
}));

vi.mock("server-only", () => ({}));
vi.mock("@repo/database", () => ({
  database: {
    availabilityRecord: {
      count: mocks.availabilityCount,
    },
    person: {
      findMany: mocks.personFindMany,
    },
  },
  scopedQuery: mocks.scopedQuery,
}));
vi.mock("@repo/database/generated/client", () => ({
  Prisma: {
    Decimal: class {
      readonly #value: number;
      constructor(value: number | string) {
        this.#value = Number(value);
      }
      valueOf(): number {
        return this.#value;
      }
    },
  },
}));
vi.mock("../settings/manager-scope", () => ({
  managerScopePersonIds: mocks.managerScopePersonIds,
}));
vi.mock("./current-status", () => ({
  computeCurrentStatus: mocks.computeCurrentStatus,
}));
vi.mock("../xero-connection-state", () => ({
  hasActiveXeroConnection: vi.fn(),
}));

const { listPeople, toBalanceRow } = await import("./people-service");

const managerId = "00000000-0000-4000-8000-000000000010";
const directReportId = "00000000-0000-4000-8000-000000000011";

describe("people-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.managerScopePersonIds.mockResolvedValue([managerId, directReportId]);
    mocks.personFindMany.mockResolvedValue([
      {
        archived_at: null,
        avatar_url: null,
        email: "ava@example.com",
        employment_type: "employee",
        first_name: "Ava",
        id: directReportId,
        job_title: null,
        last_name: "Nguyen",
        location: null,
        location_id: null,
        manager: null,
        person_type: "employee",
        team: null,
        xero_employee_id: null,
      },
    ]);
    mocks.computeCurrentStatus.mockResolvedValue({
      label: "Available",
      recordId: null,
      statusKey: "available",
    });
    mocks.availabilityCount.mockResolvedValue(0);
  });

  it("applies settings-aware manager visibility to the people directory", async () => {
    const result = await listPeople({
      actingPersonId: managerId,
      clerkOrgId: "org_1",
      filters: {
        includeArchived: false,
        personType: "all",
        xeroLinked: "all",
        xeroSyncFailedOnly: false,
      },
      organisationId: "00000000-0000-4000-8000-000000000001",
      pagination: { pageSize: 50 },
      role: "manager",
    });

    expect(result.ok).toBe(true);
    expect(mocks.managerScopePersonIds).toHaveBeenCalledWith({
      actingPersonId: managerId,
      clerkOrgId: "org_1",
      organisationId: "00000000-0000-4000-8000-000000000001",
    });
    expect(mocks.personFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          clerk_org_id: "org_1",
          id: { in: [managerId, directReportId] },
          organisation_id: "00000000-0000-4000-8000-000000000001",
        }),
      })
    );
  });
});

function balanceRowInput(
  overrides: Partial<Parameters<typeof toBalanceRow>[0]>
): Parameters<typeof toBalanceRow>[0] {
  return {
    balance: new Prisma.Decimal("12.5"),
    balance_unit: "hours",
    id: "00000000-0000-4000-8000-0000000000aa",
    last_fetched_at: new Date("2026-01-01T00:00:00.000Z"),
    leave_type_name: "Annual Leave",
    leave_type_xero_id: "annual-leave-id",
    record_type: "leave",
    xero_tenant_id: "00000000-0000-4000-8000-0000000000bb",
    ...overrides,
  };
}

describe("toBalanceRow", () => {
  it("keeps a missing leave type name null rather than using the Xero id", () => {
    const row = toBalanceRow(balanceRowInput({ leave_type_name: null }));

    expect(row.leaveTypeName).toBeNull();
    expect(row.leaveTypeXeroId).toBe("annual-leave-id");
    expect(row.balanceUnits).toBe(12.5);
  });

  it("preserves a stored leave type name", () => {
    const row = toBalanceRow(
      balanceRowInput({ leave_type_name: "Annual Leave" })
    );

    expect(row.leaveTypeName).toBe("Annual Leave");
  });
});
