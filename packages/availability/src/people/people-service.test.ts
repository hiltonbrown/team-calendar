import { Prisma } from "@repo/database/generated/client";
import {
  withTenantDb as withTestTenantDb,
  withTenantResult as withTestTenantResult,
} from "@repo/database/tenant-db";
import { tenantTestAccount } from "@repo/database/test-fixtures/tenant-scope";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  availabilityCount: vi.fn(),
  availabilityGroupBy: vi.fn(),
  computeCurrentStatus: vi.fn(),
  computeCurrentStatusForPeople: vi.fn(),
  computePublicHolidayApplicability: vi.fn(),
  locationFindMany: vi.fn(),
  managerScopePersonIds: vi.fn(),
  personCount: vi.fn(),
  personFindMany: vi.fn(),
  scopedQuery: vi.fn((accountId: string, scopedOrganisationId: string) => ({
    account_id: accountId,
    organisation_id: scopedOrganisationId,
  })),
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
  resolveAccountCompanies: async () => [
    {
      country_code: "AU",
      id: "00000000-0000-4000-8000-000000000001",
      name: "Acme Org",
      timezone: "Australia/Brisbane",
    },
  ],
  scopedQuery: mocks.scopedQuery,
}));
function buildTestDatabase() {
  // Only the delegates consumed by this area are implemented; transaction ownership is real.
  return {
    $executeRaw: vi.fn(async () => 1),
    $queryRaw: vi.fn(async () => []),
    ...{
      availabilityRecord: {
        count: mocks.availabilityCount,
        groupBy: mocks.availabilityGroupBy,
      },
      location: { findMany: mocks.locationFindMany },
      person: {
        count: mocks.personCount,
        findMany: mocks.personFindMany,
      },
    },
  };
}
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
  computePublicHolidayApplicability: mocks.computePublicHolidayApplicability,
}));
vi.mock("../xero-connection-state", () => ({
  getXeroConnectionStateForScope: vi.fn(),
}));

const { canAccessPerson, listPeople, toBalanceRow } = await import(
  "./people-service"
);

const managerId = "00000000-0000-4000-8000-000000000010";
const directReportId = "00000000-0000-4000-8000-000000000011";
const organisationId = "00000000-0000-4000-8000-000000000001";

describe("people-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.managerScopePersonIds.mockResolvedValue([managerId, directReportId]);
    mocks.personFindMany.mockResolvedValue([personRow(directReportId)]);
    mocks.personCount.mockResolvedValue(1);
    mocks.locationFindMany.mockResolvedValue([]);
    mocks.availabilityGroupBy.mockResolvedValue([]);
    mocks.computeCurrentStatus.mockResolvedValue(currentStatus());
    mocks.computePublicHolidayApplicability.mockResolvedValue({
      locationIds: new Set(),
      unassigned: false,
    });
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

  it.each([
    ["owner", null, directReportId, true],
    ["admin", null, directReportId, true],
    ["viewer", managerId, managerId, true],
    ["viewer", managerId, directReportId, false],
    ["viewer", null, directReportId, false],
  ] as const)(
    "applies %s direct-person access for actor %s and target %s",
    async (role, actingPersonId, personId, expected) => {
      await expect(
        withTestTenantDb(
          tenantTestAccount({
            accountId: "org_1",
            actingPersonId,
            organisationId,
            personId,
            role,
          }),
          (db) =>
            canAccessPerson(
              {
                accountId: "org_1",
                actingPersonId,
                organisationId,
                personId,
                role,
              },
              db
            )
        )
      ).resolves.toBe(expected);
    }
  );

  it("limits a manager to the central visibility scope", async () => {
    await expect(
      withTestTenantDb(
        tenantTestAccount({
          accountId: "org_1",
          actingPersonId: managerId,
          organisationId,
          personId: directReportId,
          role: "manager",
        }),
        (db) =>
          canAccessPerson(
            {
              accountId: "org_1",
              actingPersonId: managerId,
              organisationId,
              personId: directReportId,
              role: "manager",
            },
            db
          )
      )
    ).resolves.toBe(true);
    await expect(
      withTestTenantDb(
        tenantTestAccount({
          accountId: "org_1",
          actingPersonId: managerId,
          organisationId,
          personId: "00000000-0000-4000-8000-000000000099",
          role: "manager",
        }),
        (db) =>
          canAccessPerson(
            {
              accountId: "org_1",
              actingPersonId: managerId,
              organisationId,
              personId: "00000000-0000-4000-8000-000000000099",
              role: "manager",
            },
            db
          )
      )
    ).resolves.toBe(false);
  });

  it("applies settings-aware manager visibility to the people directory", async () => {
    const result = await withTestTenantResult(
      tenantTestAccount({
        accountId: "org_1",
        actingPersonId: managerId,
        filters: {
          includeArchived: false,
          personType: "all",
          xeroLinked: "all",
          xeroSyncFailedOnly: false,
        },
        organisationId,
        pagination: { pageSize: 50 },
        role: "manager",
      }),
      (db) =>
        listPeople(
          {
            accountId: "org_1",
            actingPersonId: managerId,
            filters: {
              includeArchived: false,
              personType: "all",
              xeroLinked: "all",
              xeroSyncFailedOnly: false,
            },
            organisationId,
            pagination: { pageSize: 50 },
            role: "manager",
          },
          db
        )
    );

    expect(result.ok).toBe(true);
    expect(mocks.managerScopePersonIds).toHaveBeenCalledWith(
      {
        accountId: "org_1",
        actingPersonId: managerId,
      },
      expect.any(Object)
    );
    expect(mocks.personFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          account_id: "org_1",
          id: { in: [managerId, directReportId] },
          organisation_id: { in: [organisationId] },
        }),
      })
    );
  });

  it("denies a manager without a linked acting person before querying people", async () => {
    const result = await withTestTenantResult(
      tenantTestAccount({
        accountId: "org_1",
        actingPersonId: null,
        organisationId,
        role: "manager",
      }),
      (db) =>
        listPeople(
          {
            accountId: "org_1",
            actingPersonId: null,
            organisationId,
            role: "manager",
          },
          db
        )
    );

    expect(result).toMatchObject({
      error: { code: "not_authorised" },
      ok: false,
    });
    expect(mocks.personFindMany).not.toHaveBeenCalled();
  });

  it("returns an empty page without querying for an empty manager scope", async () => {
    mocks.managerScopePersonIds.mockResolvedValue([]);

    const result = await withTestTenantResult(
      tenantTestAccount({
        accountId: "org_1",
        actingPersonId: managerId,
        organisationId,
        role: "manager",
      }),
      (db) =>
        listPeople(
          {
            accountId: "org_1",
            actingPersonId: managerId,
            organisationId,
            role: "manager",
          },
          db
        )
    );

    expect(result).toEqual({
      ok: true,
      value: { nextCursor: null, people: [], totalCount: 0 },
    });
    expect(mocks.personFindMany).not.toHaveBeenCalled();
    expect(mocks.personCount).not.toHaveBeenCalled();
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

    const result = await withTestTenantResult(
      tenantTestAccount({
        accountId: "org_1",
        organisationId,
        pagination: { pageSize: 50 },
        role: "admin",
      }),
      (db) =>
        listPeople(
          {
            accountId: "org_1",
            organisationId,
            pagination: { pageSize: 50 },
            role: "admin",
          },
          db
        )
    );

    expect(result.ok).toBe(true);
    expect(mocks.availabilityCount).not.toHaveBeenCalled();
    expect(mocks.availabilityGroupBy).toHaveBeenCalledOnce();
    expect(mocks.availabilityGroupBy).toHaveBeenCalledWith({
      _count: { _all: true },
      by: ["person_id"],
      where: {
        account_id: "org_1",
        approval_status: "xero_sync_failed",
        organisation_id: { in: [organisationId] },
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

    const result = await withTestTenantResult(
      tenantTestAccount({
        accountId: "org_1",
        organisationId,
        pagination: { pageSize: 50 },
        role: "admin",
      }),
      (db) =>
        listPeople(
          {
            accountId: "org_1",
            organisationId,
            pagination: { pageSize: 50 },
            role: "admin",
          },
          db
        )
    );

    expect(result.ok).toBe(true);
    expect(mocks.computeCurrentStatusForPeople).toHaveBeenCalledOnce();
    expect(mocks.computeCurrentStatusForPeople).toHaveBeenCalledWith(
      {
        accountId: "org_1",
        at: expect.any(Date),
        organisationId,
        people: people.map((person) => ({
          locationId: person.location_id,
          personId: person.id,
        })),
      },
      expect.any(Object)
    );
    expect(mocks.computeCurrentStatus).not.toHaveBeenCalled();
  });

  it("pushes xero sync failed only filtering into the person query", async () => {
    await withTestTenantResult(
      tenantTestAccount({
        accountId: "org_1",
        filters: { xeroSyncFailedOnly: true },
        organisationId,
        pagination: { pageSize: 50 },
        role: "admin",
      }),
      (db) =>
        listPeople(
          {
            accountId: "org_1",
            filters: { xeroSyncFailedOnly: true },
            organisationId,
            pagination: { pageSize: 50 },
            role: "admin",
          },
          db
        )
    );

    expect(mocks.personFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          availability_records: {
            some: {
              account_id: "org_1",
              approval_status: "xero_sync_failed",
              organisation_id: { in: [organisationId] },
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

    const result = await withTestTenantResult(
      tenantTestAccount({
        accountId: "org_1",
        organisationId,
        pagination: { pageSize: 2 },
        role: "admin",
      }),
      (db) =>
        listPeople(
          {
            accountId: "org_1",
            organisationId,
            pagination: { pageSize: 2 },
            role: "admin",
          },
          db
        )
    );

    expect(result.ok).toBe(true);
    expect(mocks.personFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 3 })
    );
    expect(mocks.personCount).toHaveBeenCalledWith({
      where: expect.objectContaining({
        account_id: "org_1",
        organisation_id: { in: [organisationId] },
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

    const result = await withTestTenantResult(
      tenantTestAccount({
        accountId: "org_1",
        organisationId,
        pagination: { pageSize: 2 },
        role: "admin",
      }),
      (db) =>
        listPeople(
          {
            accountId: "org_1",
            organisationId,
            pagination: { pageSize: 2 },
            role: "admin",
          },
          db
        )
    );

    expect(result.ok).toBe(true);
    expect(result.value.people).toHaveLength(2);
    expect(result.value.nextCursor).toBeNull();
    expect(result.value.totalCount).toBe(2);
  });

  it("pages and counts status filters in the database", async () => {
    mocks.personFindMany.mockResolvedValue([
      personRow("00000000-0000-4000-8000-000000000101"),
      personRow("00000000-0000-4000-8000-000000000102"),
      personRow("00000000-0000-4000-8000-000000000103"),
    ]);
    mocks.personCount.mockResolvedValue(3);

    const result = await withTestTenantResult(
      tenantTestAccount({
        accountId: "org_1",
        filters: { status: ["available"] },
        organisationId,
        pagination: { pageSize: 2 },
        role: "admin",
      }),
      (db) =>
        listPeople(
          {
            accountId: "org_1",
            filters: { status: ["available"] },
            organisationId,
            pagination: { pageSize: 2 },
            role: "admin",
          },
          db
        )
    );

    expect(result.ok).toBe(true);
    expect(mocks.personFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 3 })
    );
    expect(mocks.personCount).toHaveBeenCalledOnce();
    expect(result.value.people).toHaveLength(2);
    expect(result.value.nextCursor).toEqual(expect.any(String));
    expect(result.value.totalCount).toBe(3);
  });

  it("uses an impossible holiday predicate when no holiday applies", async () => {
    mocks.personFindMany.mockResolvedValue([]);
    mocks.personCount.mockResolvedValue(0);

    const result = await withTestTenantResult(
      tenantTestAccount({
        accountId: "org_1",
        filters: { status: ["public_holiday"] },
        organisationId,
        pagination: { pageSize: 50 },
        role: "admin",
      }),
      (db) =>
        listPeople(
          {
            accountId: "org_1",
            filters: { status: ["public_holiday"] },
            organisationId,
            pagination: { pageSize: 50 },
            role: "admin",
          },
          db
        )
    );

    expect(result.ok).toBe(true);
    const query = mocks.personFindMany.mock.calls[0]?.[0];
    expect(query.where.AND[0]).toMatchObject({
      account_id: "org_1",
      organisation_id: { in: [organisationId] },
    });
    expect(query.where.AND[1]).toMatchObject({
      OR: [
        {
          AND: [
            { organisation_id: organisationId },
            {
              OR: [
                expect.objectContaining({
                  AND: expect.arrayContaining([{ id: { in: [] } }]),
                }),
              ],
            },
          ],
        },
      ],
    });
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
    organisation: { id: organisationId, name: "Acme Org" },
    organisation_id: organisationId,
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
    currency_code: null,
    id: "00000000-0000-4000-8000-0000000000aa",
    last_fetched_at: new Date("2026-01-01T00:00:00.000Z"),
    leave_type_name: "Annual Leave",
    leave_type_xero_id: "annual-leave-id",
    record_type: "leave",
    xero_connection_id: "00000000-0000-4000-8000-0000000000bb",
    ...overrides,
  };
}

describe("toBalanceRow", () => {
  it("keeps a missing leave type name null rather than using the Xero id", () => {
    const row = toBalanceRow(balanceRowInput({ leave_type_name: null }));

    expect(row.leaveTypeName).toBeNull();
    expect(row.leaveTypeXeroId).toBe("annual-leave-id");
    expect(row.balanceUnits).toBe(12.5);
    expect(row.currencyCode).toBeNull();
  });

  it("preserves a stored leave type name and currency code", () => {
    const row = toBalanceRow(
      balanceRowInput({
        balance_unit: "currency",
        currency_code: "NZD",
        leave_type_name: "Holiday Pay",
      })
    );

    expect(row.leaveTypeName).toBe("Holiday Pay");
    expect(row.unitType).toBe("currency");
    expect(row.currencyCode).toBe("NZD");
  });
});
