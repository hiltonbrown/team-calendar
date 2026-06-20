import { Prisma } from "@repo/database/generated/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  availabilityCount: vi.fn(),
  availabilityGroupBy: vi.fn(),
  computeCurrentStatus: vi.fn(),
  computeCurrentStatusForPeople: vi.fn(),
  managerScopePersonIds: vi.fn(),
  personCount: vi.fn(),
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
      groupBy: mocks.availabilityGroupBy,
    },
    person: {
      count: mocks.personCount,
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
  computeCurrentStatusForPeople: mocks.computeCurrentStatusForPeople,
}));
vi.mock("../xero-connection-state", () => ({
  hasActiveXeroConnection: vi.fn(),
}));

const { listPeople, toBalanceRow } = await import("./people-service");

const managerId = "00000000-0000-4000-8000-000000000010";
const directReportId = "00000000-0000-4000-8000-000000000011";
const organisationId = "00000000-0000-4000-8000-000000000001";

describe("people-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.managerScopePersonIds.mockResolvedValue([managerId, directReportId]);
    mocks.personFindMany.mockResolvedValue([personRow(directReportId)]);
    mocks.personCount.mockResolvedValue(1);
    mocks.availabilityGroupBy.mockResolvedValue([]);
    mocks.computeCurrentStatus.mockResolvedValue(currentStatus());
    mocks.computeCurrentStatusForPeople.mockImplementation(
      async (input: {
        people: Array<{ locationId: string | null; personId: string }>;
      }) =>
        new Map(
          input.people.map((person) => [person.personId, currentStatus()])
        )
    );
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
      organisationId,
      pagination: { pageSize: 50 },
      role: "manager",
    });

    expect(result.ok).toBe(true);
    expect(mocks.managerScopePersonIds).toHaveBeenCalledWith({
      actingPersonId: managerId,
      clerkOrgId: "org_1",
      organisationId,
    });
    expect(mocks.personFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          clerk_org_id: "org_1",
          id: { in: [managerId, directReportId] },
          organisation_id: organisationId,
        }),
      })
    );
  });

  it("batches xero sync failed counts instead of counting per person", async () => {
    const people = Array.from({ length: 5 }, (_, index) =>
      personRow(`00000000-0000-4000-8000-00000000010${index}`)
    );
    mocks.personFindMany.mockResolvedValue(people);
    mocks.personCount.mockResolvedValue(5);
    mocks.availabilityGroupBy.mockResolvedValue([
      { _count: { _all: 2 }, person_id: people[0]?.id },
      { _count: { _all: 1 }, person_id: people[3]?.id },
    ]);

    const result = await listPeople({
      clerkOrgId: "org_1",
      organisationId,
      pagination: { pageSize: 50 },
    });

    expect(result.ok).toBe(true);
    expect(mocks.availabilityCount).not.toHaveBeenCalled();
    expect(mocks.availabilityGroupBy).toHaveBeenCalledOnce();
    expect(mocks.availabilityGroupBy).toHaveBeenCalledWith({
      by: ["person_id"],
      _count: { _all: true },
      where: {
        approval_status: "xero_sync_failed",
        clerk_org_id: "org_1",
        organisation_id: organisationId,
        person_id: { in: people.map((person) => person.id) },
      },
    });
    expect(result.value.people[0]?.xeroSyncFailedCount).toBe(2);
    expect(result.value.people[3]?.xeroSyncFailedCount).toBe(1);
    expect(result.value.people[1]?.xeroSyncFailedCount).toBe(0);
  });

  it("batches current status lookups for the people directory", async () => {
    const people = Array.from({ length: 4 }, (_, index) =>
      personRow(`00000000-0000-4000-8000-00000000020${index}`, {
        location_id: `00000000-0000-4000-8000-00000000030${index}`,
      })
    );
    mocks.personFindMany.mockResolvedValue(people);
    mocks.personCount.mockResolvedValue(4);

    const result = await listPeople({
      clerkOrgId: "org_1",
      organisationId,
      pagination: { pageSize: 50 },
    });

    expect(result.ok).toBe(true);
    expect(mocks.computeCurrentStatusForPeople).toHaveBeenCalledOnce();
    expect(mocks.computeCurrentStatusForPeople).toHaveBeenCalledWith({
      at: expect.any(Date),
      clerkOrgId: "org_1",
      organisationId,
      people: people.map((person) => ({
        locationId: person.location_id,
        personId: person.id,
      })),
    });
    expect(mocks.computeCurrentStatus).not.toHaveBeenCalled();
  });

  it("pushes xero sync failed only filtering into the person query", async () => {
    await listPeople({
      clerkOrgId: "org_1",
      filters: { xeroSyncFailedOnly: true },
      organisationId,
      pagination: { pageSize: 50 },
    });

    expect(mocks.personFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          availability_records: {
            some: {
              approval_status: "xero_sync_failed",
              clerk_org_id: "org_1",
              organisation_id: organisationId,
            },
          },
        }),
      })
    );
  });

  it("uses database pagination and full count when no in-memory filters apply", async () => {
    const people = [
      personRow("00000000-0000-4000-8000-000000000101", {
        first_name: "Ava",
        last_name: "Brown",
      }),
      personRow("00000000-0000-4000-8000-000000000102", {
        first_name: "Ben",
        last_name: "Brown",
      }),
      personRow("00000000-0000-4000-8000-000000000103", {
        first_name: "Cara",
        last_name: "Brown",
      }),
    ];
    mocks.personFindMany.mockResolvedValue(people);
    mocks.personCount.mockResolvedValue(7);

    const result = await listPeople({
      clerkOrgId: "org_1",
      organisationId,
      pagination: { pageSize: 2 },
    });

    expect(result.ok).toBe(true);
    expect(mocks.personFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 3 })
    );
    expect(mocks.personCount).toHaveBeenCalledWith({
      where: expect.objectContaining({
        clerk_org_id: "org_1",
        organisation_id: organisationId,
      }),
    });
    expect(result.value.people).toHaveLength(2);
    expect(result.value.nextCursor).toEqual(expect.any(String));
    expect(result.value.totalCount).toBe(7);
  });

  it("does not set a next cursor on the fast path without an extra row", async () => {
    mocks.personFindMany.mockResolvedValue([
      personRow("00000000-0000-4000-8000-000000000101"),
      personRow("00000000-0000-4000-8000-000000000102"),
    ]);
    mocks.personCount.mockResolvedValue(2);

    const result = await listPeople({
      clerkOrgId: "org_1",
      organisationId,
      pagination: { pageSize: 2 },
    });

    expect(result.ok).toBe(true);
    expect(result.value.people).toHaveLength(2);
    expect(result.value.nextCursor).toBeNull();
    expect(result.value.totalCount).toBe(2);
  });

  it("keeps filtered path pagination in memory when status filters apply", async () => {
    mocks.personFindMany.mockResolvedValue([
      personRow("00000000-0000-4000-8000-000000000101"),
      personRow("00000000-0000-4000-8000-000000000102"),
      personRow("00000000-0000-4000-8000-000000000103"),
    ]);

    const result = await listPeople({
      clerkOrgId: "org_1",
      filters: { status: ["available"] },
      organisationId,
      pagination: { pageSize: 2 },
    });

    expect(result.ok).toBe(true);
    expect(mocks.personFindMany).toHaveBeenCalledWith(
      expect.not.objectContaining({ take: expect.any(Number) })
    );
    expect(mocks.personCount).not.toHaveBeenCalled();
    expect(result.value.people).toHaveLength(2);
    expect(result.value.nextCursor).toEqual(expect.any(String));
    expect(result.value.totalCount).toBe(3);
  });
});

function personRow(
  id: string,
  overrides: Partial<{
    first_name: string;
    last_name: string;
    location_id: string | null;
  }> = {}
) {
  return {
    archived_at: null,
    avatar_url: null,
    email: `${id}@example.com`,
    employment_type: "employee",
    first_name: "Ava",
    id,
    job_title: null,
    last_name: "Nguyen",
    location: null,
    location_id: null,
    manager: null,
    person_type: "employee",
    team: null,
    xero_employee_id: null,
    ...overrides,
  };
}

function currentStatus() {
  return {
    activePublicHoliday: null,
    activeRecord: null,
    approvalStatus: null,
    contactabilityStatus: null,
    label: "Available",
    recordType: null,
    statusKey: "available",
  };
}

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
