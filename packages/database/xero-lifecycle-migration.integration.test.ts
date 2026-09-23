// biome-ignore-all lint/style/useFilenamingConvention: Integration tests use the repository convention.
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
const RESERVED_BINDING_KEY = /xero_tenants_reserved_binding_key/;

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
});

describe("Xero tenant binding reservation constraints", () => {
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
    await expect(createBinding(1, { activeSlot: 1 })).rejects.toThrow(
      RESERVED_BINDING_KEY
    );
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
    const slots = [first, second];
    let ready = 0;
    let releaseBarrier: (() => void) | undefined;
    const barrier = new Promise<void>((resolve) => {
      releaseBarrier = resolve;
    });
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const boundedBarrier = Promise.race([
      barrier,
      new Promise<void>((_, reject) => {
        timeoutHandle = setTimeout(
          () => reject(new Error("Concurrent reservation barrier timed out")),
          10_000
        );
      }),
    ]);
    const attempts = slots.map((slot, index) =>
      database.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(${index + 161_000})`;
        ready += 1;
        if (ready === 2) {
          releaseBarrier?.();
        }
        await boundedBarrier;
        return tx.xeroTenant.create({
          data: {
            active_slot: 1,
            clerk_org_id: slot.tenant.clerkOrgId,
            id: fixture.id("binding", index),
            organisation_id: slot.tenant.organisationId,
            payroll_region: payroll_region.AU,
            provider_app_id: providerAppId,
            xero_connection_id: slot.connection.id,
            xero_tenant_id: tenantId,
          },
        });
      })
    );
    const outcomes = await Promise.allSettled(attempts);
    clearTimeout(timeoutHandle);
    expect(
      outcomes.filter((outcome) => outcome.status === "fulfilled")
    ).toHaveLength(1);
    expect(
      outcomes.filter((outcome) => outcome.status === "rejected")
    ).toHaveLength(1);
  });
});
