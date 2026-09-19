// biome-ignore-all lint/style/useFilenamingConvention: The requested test file is leave_balances.integration.test.ts.
import type { ClerkOrgId, OrganisationId, PersonId } from "@repo/core";
import { afterAll, beforeEach, describe, expect, test, vi } from "vitest";
import { allocateLiveTestFixture } from "./src/live-test-fixture";

vi.mock("server-only", () => ({}));

const fixture = allocateLiveTestFixture(
  "packages/database/leave_balances.integration.test.ts"
);

const { database, employment_type, source_system } = await import("./index.js");
const { listLeaveBalancesForOrganisation, listLeaveBalancesForPerson } =
  await import("./src/queries/leave-balances.js");

const tenant = {
  clerkOrgId: fixture.tenants[0]?.clerkOrgId as string,
  locationId: fixture.id("location"),
  organisationId: fixture.tenants[0]?.organisationId as string,
  personId: fixture.id("person"),
  teamId: fixture.id("team"),
} as const;

const testClerkOrgIds = [tenant.clerkOrgId] as const;

const createTenant = async () => {
  await database.organisation.create({
    data: {
      clerk_org_id: tenant.clerkOrgId,
      country_code: "AU",
      id: tenant.organisationId,
      name: `Test ${tenant.clerkOrgId}`,
    },
  });

  await database.team.create({
    data: {
      clerk_org_id: tenant.clerkOrgId,
      id: tenant.teamId,
      name: "Operations",
      organisation_id: tenant.organisationId,
    },
  });

  await database.location.create({
    data: {
      clerk_org_id: tenant.clerkOrgId,
      id: tenant.locationId,
      name: "Brisbane",
      organisation_id: tenant.organisationId,
      region_code: "QLD",
    },
  });

  await database.person.create({
    data: {
      clerk_org_id: tenant.clerkOrgId,
      email: `${tenant.clerkOrgId}@example.com`,
      employment_type: employment_type.employee,
      first_name: "Test",
      id: tenant.personId,
      is_active: true,
      last_name: "Person",
      location_id: tenant.locationId,
      organisation_id: tenant.organisationId,
      source_person_key: null,
      source_system: source_system.MANUAL,
      team_id: tenant.teamId,
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
      balance: "10.0000",
      clerk_org_id: tenant.clerkOrgId,
      id,
      leave_type_xero_id: leaveTypeXeroId,
      organisation_id: tenant.organisationId,
      person_id: tenant.personId,
      xero_tenant_id: null,
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
      leave_type_xero_id: "annual-leave",
      person_id: tenant.personId,
      xero_tenant_id: null,
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

  test("projects a null currencyCode for an hours/days balance through both list queries", async () => {
    await createTenant();
    await createManualBalance({
      id: "41000000-0000-4000-8000-000000000006",
    });

    const clerkOrgId = tenant.clerkOrgId as ClerkOrgId;
    const organisationId = tenant.organisationId as OrganisationId;
    const personId = tenant.personId as PersonId;

    const forPerson = await listLeaveBalancesForPerson(
      clerkOrgId,
      organisationId,
      personId
    );
    const forOrganisation = await listLeaveBalancesForOrganisation(
      clerkOrgId,
      organisationId
    );

    expect(forPerson.ok).toBe(true);
    expect(forOrganisation.ok).toBe(true);
    if (forPerson.ok) {
      expect(forPerson.value).toEqual([
        expect.objectContaining({
          currencyCode: null,
          id: "41000000-0000-4000-8000-000000000006",
        }),
      ]);
    }
    if (forOrganisation.ok) {
      expect(forOrganisation.value).toEqual([
        expect.objectContaining({
          currencyCode: null,
          id: "41000000-0000-4000-8000-000000000006",
        }),
      ]);
    }
  });

  test("projects a validated currencyCode for a currency balance through both list queries", async () => {
    await createTenant();
    await database.leaveBalance.create({
      data: {
        balance: "1234.5600",
        balance_unit: "currency",
        clerk_org_id: tenant.clerkOrgId,
        currency_code: "NZD",
        id: "41000000-0000-4000-8000-000000000007",
        leave_type_xero_id: "holiday-pay",
        organisation_id: tenant.organisationId,
        person_id: tenant.personId,
        source_payload_json: { CurrencyCode: "NZD", TypeOfUnits: "Dollars" },
        xero_tenant_id: null,
      },
    });

    const clerkOrgId = tenant.clerkOrgId as ClerkOrgId;
    const organisationId = tenant.organisationId as OrganisationId;
    const personId = tenant.personId as PersonId;

    const forPerson = await listLeaveBalancesForPerson(
      clerkOrgId,
      organisationId,
      personId
    );
    const forOrganisation = await listLeaveBalancesForOrganisation(
      clerkOrgId,
      organisationId
    );

    expect(forPerson.ok).toBe(true);
    expect(forOrganisation.ok).toBe(true);
    if (forPerson.ok) {
      expect(forPerson.value).toEqual([
        expect.objectContaining({
          currencyCode: "NZD",
          id: "41000000-0000-4000-8000-000000000007",
        }),
      ]);
    }
    if (forOrganisation.ok) {
      expect(forOrganisation.value).toEqual([
        expect.objectContaining({
          currencyCode: "NZD",
          id: "41000000-0000-4000-8000-000000000007",
        }),
      ]);
    }
  });
});
