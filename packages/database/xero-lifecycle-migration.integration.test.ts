// biome-ignore-all lint/style/useFilenamingConvention: Integration tests use the repository convention.
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { database, payroll_region } from "./index.js";
import { allocateLiveTestFixture } from "./src/live-test-fixture";

vi.mock("server-only", () => ({}));

const fixture = allocateLiveTestFixture(
  "packages/database/xero-lifecycle-migration.integration.test.ts"
);
const providerAppId = fixture.globalKey("provider_app");
const tenantId = fixture.id("provider-tenant");
const tenantScopes = fixture.tenants.map((tenant) => tenant.clerkOrgId);
const ACTIVE_SLOT_CHECK = /xero_tenants_active_slot_check/;
const sqlPool = new Pool({
  connectionString:
    process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL,
  max: 2,
});

const constraintName = (error: unknown): string | null => {
  if (
    typeof error === "object" &&
    error !== null &&
    "constraint" in error &&
    typeof error.constraint === "string"
  ) {
    return error.constraint;
  }
  return null;
};

const captureError = async (operation: Promise<unknown>): Promise<unknown> => {
  try {
    await operation;
  } catch (error) {
    return error;
  }
  throw new Error("Expected database operation to fail");
};

async function cleanTestData() {
  const where = { clerk_org_id: { in: tenantScopes } };
  await database.xeroTenant.deleteMany({ where });
  await database.xeroConnection.deleteMany({ where });
  await database.organisation.deleteMany({ where });
}

async function createSlot(index: number) {
  const tenant = fixture.tenants[index];
  if (!tenant) {
    throw new Error("Fixture tenant slot is missing");
  }
  await database.organisation.create({
    data: {
      clerk_org_id: tenant.clerkOrgId,
      country_code: "AU",
      id: tenant.organisationId,
      name: `Binding fixture ${index}`,
    },
  });
  const connection = await database.xeroConnection.create({
    data: {
      clerk_org_id: tenant.clerkOrgId,
      expires_at: new Date(Date.now() + 60_000),
      id: fixture.id("connection", index),
      organisation_id: tenant.organisationId,
    },
  });
  return { connection, tenant };
}

async function createBinding(
  index: number,
  input: { activeSlot: 1 | null; providerAppId?: string; tenantId?: string }
) {
  const slot = await createSlot(index);
  return database.xeroTenant.create({
    data: {
      active_slot: input.activeSlot,
      clerk_org_id: slot.tenant.clerkOrgId,
      id: fixture.id("binding", index),
      organisation_id: slot.tenant.organisationId,
      payroll_region: payroll_region.AU,
      provider_app_id: input.providerAppId ?? providerAppId,
      xero_connection_id: slot.connection.id,
      xero_tenant_id: input.tenantId ?? tenantId,
    },
  });
}

beforeEach(cleanTestData);
afterAll(async () => {
  await cleanTestData();
  await database.$disconnect();
  await sqlPool.end();
});

describe("Xero tenant binding reservation constraints", () => {
  it("rejects direct rebinding while accepting a same-file update", async () => {
    const binding = await createBinding(0, { activeSlot: 1 });
    const error = await captureError(
      sqlPool.query(
        "UPDATE xero_tenants SET xero_tenant_id = $1 WHERE id = $2",
        [fixture.id("unreserved-provider-tenant"), binding.id]
      )
    );
    expect(constraintName(error)).toBe("xero_tenants_xero_tenant_id_immutable");

    const persisted = await database.xeroTenant.findUniqueOrThrow({
      where: { id: binding.id },
    });
    expect(persisted.id).toBe(binding.id);
    expect(persisted.xero_tenant_id).toBe(tenantId);

    const sameFile = await sqlPool.query(
      "UPDATE xero_tenants SET xero_tenant_id = $1 WHERE id = $2 RETURNING id, xero_tenant_id",
      [tenantId, binding.id]
    );
    expect(sameFile.rows[0]).toEqual({
      id: binding.id,
      xero_tenant_id: tenantId,
    });
  });

  it.each([0, 2, -1])("rejects active_slot %i", async (activeSlot) => {
    const binding = await createBinding(0, { activeSlot: null });
    await expect(
      database.xeroTenant.update({
        data: { active_slot: activeSlot },
        where: { id: binding.id },
      })
    ).rejects.toThrow(ACTIVE_SLOT_CHECK);
  });

  it("accepts active_slot 1 and NULL", async () => {
    const binding = await createBinding(0, { activeSlot: 1 });
    const retired = await database.xeroTenant.update({
      data: { active_slot: null },
      where: { id: binding.id },
    });
    expect(retired.active_slot).toBeNull();
  });

  it("rejects two reserved rows for one provider app and Xero file", async () => {
    await createBinding(0, { activeSlot: 1 });
    const slot = await createSlot(1);
    const error = await captureError(
      sqlPool.query(
        `INSERT INTO xero_tenants
          (id, clerk_org_id, organisation_id, xero_connection_id, xero_tenant_id, payroll_region, provider_app_id, active_slot)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 1)`,
        [
          fixture.id("binding", 1),
          slot.tenant.clerkOrgId,
          slot.tenant.organisationId,
          slot.connection.id,
          tenantId,
          payroll_region.AU,
          providerAppId,
        ]
      )
    );
    expect(constraintName(error)).toBe("xero_tenants_reserved_binding_key");
  });

  it("allows two retired rows alongside one reserved row", async () => {
    await createBinding(0, { activeSlot: null });
    await createBinding(1, { activeSlot: null });
    await createBinding(2, { activeSlot: 1 });
    expect(
      await database.xeroTenant.count({
        where: { provider_app_id: providerAppId, xero_tenant_id: tenantId },
      })
    ).toBe(3);
  });

  it("allows the same Xero file under another provider app", async () => {
    await createBinding(0, { activeSlot: 1 });
    await createBinding(1, {
      activeSlot: 1,
      providerAppId: fixture.globalKey("provider_app", 1),
    });
    expect(
      await database.xeroTenant.count({ where: { xero_tenant_id: tenantId } })
    ).toBe(2);
  });

  it("allows exactly one of two concurrent reservations", async () => {
    const [first, second] = await Promise.all([createSlot(0), createSlot(1)]);
    const clients = await Promise.all([sqlPool.connect(), sqlPool.connect()]);
    const reserve = async (
      client: PoolClient,
      slot: Awaited<ReturnType<typeof createSlot>>,
      index: number
    ) => {
      await client.query("BEGIN");
      try {
        await client.query(
          "SELECT id FROM organisations WHERE id = $1 FOR UPDATE",
          [first.tenant.organisationId]
        );
        const result = await client.query(
          `INSERT INTO xero_tenants
            (id, clerk_org_id, organisation_id, xero_connection_id, xero_tenant_id, payroll_region, provider_app_id, active_slot)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 1)
           RETURNING id`,
          [
            fixture.id("binding", index),
            slot.tenant.clerkOrgId,
            slot.tenant.organisationId,
            slot.connection.id,
            tenantId,
            payroll_region.AU,
            providerAppId,
          ]
        );
        await client.query("COMMIT");
        return result.rows[0];
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    };

    let outcomes: PromiseSettledResult<unknown>[];
    try {
      outcomes = await Promise.allSettled([
        reserve(clients[0], first, 0),
        reserve(clients[1], second, 1),
      ]);
    } finally {
      for (const client of clients) {
        client.release();
      }
    }
    expect(
      outcomes.filter((outcome) => outcome.status === "fulfilled")
    ).toHaveLength(1);
    const rejected = outcomes.filter(
      (outcome) => outcome.status === "rejected"
    );
    expect(rejected).toHaveLength(1);
    expect(constraintName(rejected[0]?.reason)).toBe(
      "xero_tenants_reserved_binding_key"
    );
  });
});
