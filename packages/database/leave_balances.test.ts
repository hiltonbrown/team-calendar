// biome-ignore-all lint/style/useFilenamingConvention: The requested test file is leave_balances.test.ts.
import { config } from "dotenv";
import { afterAll, beforeEach, describe, expect, test, vi } from "vitest";

config({ path: new URL("./.env", import.meta.url).pathname });
vi.mock("server-only", () => ({}));

const { database, employment_type, source_system } = await import("./index.js");

const tenant = {
  clerkOrgId: "org_test_leave_balances_a",
  organisationId: "40000000-0000-4000-8000-000000000001",
  teamId: "40000000-0000-4000-8000-000000000002",
  locationId: "40000000-0000-4000-8000-000000000003",
  personId: "40000000-0000-4000-8000-000000000004",
} as const;

const testClerkOrgIds = [tenant.clerkOrgId] as const;

const createTenant = async () => {
  await database.organisation.create({
    data: {
      id: tenant.organisationId,
      clerk_org_id: tenant.clerkOrgId,
      name: `Test ${tenant.clerkOrgId}`,
      country_code: "AU",
    },
  });

  await database.team.create({
    data: {
      id: tenant.teamId,
      clerk_org_id: tenant.clerkOrgId,
      organisation_id: tenant.organisationId,
      name: "Operations",
    },
  });

  await database.location.create({
    data: {
      id: tenant.locationId,
      clerk_org_id: tenant.clerkOrgId,
      organisation_id: tenant.organisationId,
      name: "Brisbane",
      region_code: "QLD",
    },
  });

  await database.person.create({
    data: {
      id: tenant.personId,
      clerk_org_id: tenant.clerkOrgId,
      organisation_id: tenant.organisationId,
      team_id: tenant.teamId,
      location_id: tenant.locationId,
      source_system: source_system.MANUAL,
      source_person_key: null,
      first_name: "Test",
      last_name: "Person",
      email: `${tenant.clerkOrgId}@example.com`,
      employment_type: employment_type.employee,
      is_active: true,
    },
  });
};

const createManualBalance = ({
  id,
  leaveTypeXeroId = "annual-leave",
}: {
  id: string;
  leaveTypeXeroId?: string;
}) =>
  database.leaveBalance.create({
    data: {
      id,
      clerk_org_id: tenant.clerkOrgId,
      organisation_id: tenant.organisationId,
      person_id: tenant.personId,
      xero_tenant_id: null,
      leave_type_xero_id: leaveTypeXeroId,
      balance: "10.0000",
    },
  });

const cleanTestData = async () => {
  const scope = { clerk_org_id: { in: [...testClerkOrgIds] } };
  await database.leaveBalance.deleteMany({ where: scope });
  await database.person.deleteMany({ where: scope });
  await database.location.deleteMany({ where: scope });
  await database.team.deleteMany({ where: scope });
  await database.organisation.deleteMany({ where: scope });
};

const expectPrismaErrorCode = async (
  operation: Promise<unknown>,
  code: string
) => {
  let error: unknown;

  try {
    await operation;
  } catch (caught) {
    error = caught;
  }

  expect(error).toMatchObject({ code });
};

beforeEach(async () => {
  await cleanTestData();
});

afterAll(async () => {
  await cleanTestData();
  await database.$disconnect();
});

describe("leave_balances", () => {
  test("exposes the manual partial unique index alongside the composite unique", async () => {
    const indexes = await database.$queryRaw<Array<{ indexname: string }>>`
      SELECT indexname::text AS indexname
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'leave_balances'
    `;
    const indexNames = indexes.map(({ indexname }) => indexname);

    expect(indexNames).toEqual(
      expect.arrayContaining([
        "leave_balances_person_id_xero_tenant_id_leave_type_xero_id_key",
        "leave_balances_person_id_leave_type_xero_id_manual_key",
      ])
    );
  });

  test("accepts a manual balance with a null xero_tenant_id", async () => {
    await createTenant();

    const balance = await createManualBalance({
      id: "41000000-0000-4000-8000-000000000001",
    });

    expect(balance).toMatchObject({
      clerk_org_id: tenant.clerkOrgId,
      person_id: tenant.personId,
      xero_tenant_id: null,
      leave_type_xero_id: "annual-leave",
    });
  });

  test("rejects duplicate manual balances for the same person and leave type", async () => {
    await createTenant();
    await createManualBalance({
      id: "41000000-0000-4000-8000-000000000002",
    });

    await expectPrismaErrorCode(
      createManualBalance({
        id: "41000000-0000-4000-8000-000000000003",
      }),
      "P2002"
    );
  });

  test("allows manual balances for distinct leave types", async () => {
    await createTenant();
    await createManualBalance({
      id: "41000000-0000-4000-8000-000000000004",
      leaveTypeXeroId: "annual-leave",
    });

    await expect(
      createManualBalance({
        id: "41000000-0000-4000-8000-000000000005",
        leaveTypeXeroId: "sick-leave",
      })
    ).resolves.toMatchObject({
      id: "41000000-0000-4000-8000-000000000005",
      leave_type_xero_id: "sick-leave",
      xero_tenant_id: null,
    });
  });
});
