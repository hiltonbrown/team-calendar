// biome-ignore-all lint/style/useFilenamingConvention: Integration test co-located beside other database integration suites.
import { afterAll, beforeEach, describe, expect, test, vi } from "vitest";
import { allocateLiveTestFixture } from "./src/live-test-fixture";

vi.mock("server-only", () => ({}));

const fixture = allocateLiveTestFixture(
  "packages/database/xero-tenancy.integration.test.ts"
);

const { database, payroll_region } = await import("./index.js");

const testClerkOrgId = fixture.tenants[0]?.clerkOrgId as string;
const testClerkOrgIds = [testClerkOrgId] as const;

const org1 = {
  connectionId: fixture.id("connection", 0),
  duplicateConnectionId: fixture.id("connection", 1),
  duplicateTenantId: fixture.id("tenant", 1),
  id: fixture.tenants[0]?.organisationId as string,
  name: "Acme Payroll Entity A",
  tenantId: fixture.id("tenant", 0),
  xeroTenantGuid: fixture.id("provider-tenant", 0),
} as const;

const org2 = {
  connectionId: fixture.id("connection", 2),
  id: fixture.tenants[1]?.organisationId as string,
  name: "Acme Payroll Entity B",
  tenantId: fixture.id("tenant", 2),
  xeroTenantGuid: fixture.id("provider-tenant", 1),
} as const;

const cleanTestData = async () => {
  const scope = { clerk_org_id: { in: [...testClerkOrgIds] } };
  await database.xeroTenant.deleteMany({ where: scope });
  await database.xeroConnection.deleteMany({ where: scope });
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
  await database.organisation.create({
    data: {
      clerk_org_id: testClerkOrgId,
      country_code: "AU",
      id: org1.id,
      name: org1.name,
    },
  });
  await database.organisation.create({
    data: {
      clerk_org_id: testClerkOrgId,
      country_code: "AU",
      id: org2.id,
      name: org2.name,
    },
  });
});

afterAll(async () => {
  await cleanTestData();
  await database.$disconnect();
});

describe("xero tenancy uniqueness invariants", () => {
  test("rejects a second XeroConnection for the same organisation_id with P2002", async () => {
    await database.xeroConnection.create({
      data: {
        clerk_org_id: testClerkOrgId,
        expires_at: new Date(Date.now() + 1800 * 1000),
        id: org1.connectionId,
        organisation_id: org1.id,
      },
    });

    await expectPrismaErrorCode(
      database.xeroConnection.create({
        data: {
          clerk_org_id: testClerkOrgId,
          expires_at: new Date(Date.now() + 1800 * 1000),
          id: org1.duplicateConnectionId,
          organisation_id: org1.id,
        },
      }),
      "P2002"
    );
  });

  test("rejects a second XeroTenant for the same xero_connection_id with P2002", async () => {
    await database.xeroConnection.create({
      data: {
        clerk_org_id: testClerkOrgId,
        expires_at: new Date(Date.now() + 1800 * 1000),
        id: org1.connectionId,
        organisation_id: org1.id,
      },
    });

    await database.xeroTenant.create({
      data: {
        clerk_org_id: testClerkOrgId,
        id: org1.tenantId,
        organisation_id: org1.id,
        payroll_region: payroll_region.AU,
        provider_app_id: process.env.XERO_CLIENT_ID ?? "test-xero-client-id",
        xero_connection_id: org1.connectionId,
        xero_tenant_id: org1.xeroTenantGuid,
      },
    });

    await expectPrismaErrorCode(
      database.xeroTenant.create({
        data: {
          clerk_org_id: testClerkOrgId,
          id: org1.duplicateTenantId,
          organisation_id: org1.id,
          payroll_region: payroll_region.AU,
          provider_app_id: process.env.XERO_CLIENT_ID ?? "test-xero-client-id",
          xero_connection_id: org1.connectionId,
          xero_tenant_id: org1.xeroTenantGuid,
        },
      }),
      "P2002"
    );
  });

  test("allows distinct Organisations within the same Clerk Org to each have their own XeroConnection and XeroTenant", async () => {
    const connection1 = await database.xeroConnection.create({
      data: {
        clerk_org_id: testClerkOrgId,
        expires_at: new Date(Date.now() + 1800 * 1000),
        id: org1.connectionId,
        organisation_id: org1.id,
      },
    });

    const tenant1 = await database.xeroTenant.create({
      data: {
        clerk_org_id: testClerkOrgId,
        id: org1.tenantId,
        organisation_id: org1.id,
        payroll_region: payroll_region.AU,
        provider_app_id: process.env.XERO_CLIENT_ID ?? "test-xero-client-id",
        xero_connection_id: org1.connectionId,
        xero_tenant_id: org1.xeroTenantGuid,
      },
    });

    const connection2 = await database.xeroConnection.create({
      data: {
        clerk_org_id: testClerkOrgId,
        expires_at: new Date(Date.now() + 1800 * 1000),
        id: org2.connectionId,
        organisation_id: org2.id,
      },
    });

    const tenant2 = await database.xeroTenant.create({
      data: {
        clerk_org_id: testClerkOrgId,
        id: org2.tenantId,
        organisation_id: org2.id,
        payroll_region: payroll_region.AU,
        provider_app_id: process.env.XERO_CLIENT_ID ?? "test-xero-client-id",
        xero_connection_id: org2.connectionId,
        xero_tenant_id: org2.xeroTenantGuid,
      },
    });

    expect(connection1.organisation_id).toBe(org1.id);
    expect(connection2.organisation_id).toBe(org2.id);
    expect(tenant1.xero_connection_id).toBe(org1.connectionId);
    expect(tenant2.xero_connection_id).toBe(org2.connectionId);
  });
});
