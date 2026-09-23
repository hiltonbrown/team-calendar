import "./setup-env";
import { allocateLiveTestFixture } from "@repo/database/live-test-fixture";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getScheduledSyncEventId,
  type RegisteredSyncRunType,
  syncEventNames,
} from "../events";

vi.mock("server-only", () => ({}));

const sentEvents: Array<{ name: string; data: any; id?: string }> = [];

vi.mock("../client", () => ({
  inngest: {
    createFunction: vi.fn((opts: any, trigger: any, fn: any) => ({
      fn,
      opts,
      trigger,
    })),
    send: vi.fn((payload: any) => {
      sentEvents.push(payload);
      return { ids: [payload.id ?? "evt_mock_id"] };
    }),
  },
}));

const fixture = allocateLiveTestFixture(
  "packages/jobs/src/handlers/schedule-xero-syncs.integration.test.ts"
);
const { database } = await import("@repo/database");
const { scheduleXeroSyncsPage } = await import("./schedule-xero-syncs");

const tenantA = {
  clerkOrgId: fixture.tenants[0]?.clerkOrgId as string,
  databaseTenantId: fixture.id("tenant", 0),
  organisationId: fixture.tenants[0]?.organisationId as string,
  providerTenantId: fixture.id("provider-tenant", 0),
  xeroConnectionId: fixture.id("connection", 0),
} as const;

const tenantB = {
  clerkOrgId: fixture.tenants[1]?.clerkOrgId as string,
  databaseTenantId: fixture.id("tenant", 1),
  organisationId: fixture.tenants[1]?.organisationId as string,
  providerTenantId: fixture.id("provider-tenant", 1),
  xeroConnectionId: fixture.id("connection", 1),
} as const;

const testClerkOrgIds = [tenantA.clerkOrgId, tenantB.clerkOrgId] as const;

async function setupTenant(tenant: typeof tenantA, timezone: string) {
  if (!database) {
    return;
  }
  await database.organisation.create({
    data: {
      clerk_org_id: tenant.clerkOrgId,
      country_code: "AU",
      id: tenant.organisationId,
      is_active: true,
      name: `Schedule Test Org ${tenant.clerkOrgId}`,
      timezone,
    },
  });

  await database.xeroConnection.create({
    data: {
      access_token_encrypted: "encrypted-token",
      clerk_org_id: tenant.clerkOrgId,
      expires_at: new Date(Date.now() + 3_600_000),
      id: tenant.xeroConnectionId,
      organisation_id: tenant.organisationId,
      status: "active",
    },
  });

  await database.xeroTenant.create({
    data: {
      clerk_org_id: tenant.clerkOrgId,
      id: tenant.databaseTenantId,
      organisation_id: tenant.organisationId,
      payroll_region: "AU",
      provider_app_id: process.env.XERO_CLIENT_ID ?? "test-xero-client-id",
      xero_connection_id: tenant.xeroConnectionId,
      xero_tenant_id: tenant.providerTenantId,
    },
  });
}

async function cleanupTestFixtures() {
  if (!database) {
    return;
  }
  await database.xeroTenant.deleteMany({
    where: { clerk_org_id: { in: testClerkOrgIds as unknown as string[] } },
  });
  await database.xeroConnection.deleteMany({
    where: { clerk_org_id: { in: testClerkOrgIds as unknown as string[] } },
  });
  await database.organisation.deleteMany({
    where: { clerk_org_id: { in: testClerkOrgIds as unknown as string[] } },
  });
}

describe("scheduleXeroSyncs Integration", () => {
  beforeEach(async () => {
    sentEvents.length = 0;
    await cleanupTestFixtures();
  });

  afterAll(async () => {
    await cleanupTestFixtures();
    if (database) {
      await database.$disconnect();
    }
  });

  it("scans database tenants and emits tenant-scoped events carrying matching Clerk Org and Organisation IDs", async () => {
    await setupTenant(tenantA, "Australia/Sydney");
    await setupTenant(tenantB, "Australia/Melbourne");

    const now = new Date("2026-08-11T15:30:00.000Z"); // Wed 01:30 AM local
    const result = await scheduleXeroSyncsPage({ now });

    if (!result.ok) {
      expect(result).toMatchObject({ ok: true });
    }
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value.scanned).toBeGreaterThanOrEqual(2);
    expect(result.value.dispatched).toBeGreaterThanOrEqual(8); // 4 per tenant

    // Filter sent events for our test tenants
    const tenantAEvents = sentEvents.filter(
      (e) => e.data.clerkOrgId === tenantA.clerkOrgId
    );
    const tenantBEvents = sentEvents.filter(
      (e) => e.data.clerkOrgId === tenantB.clerkOrgId
    );

    const expectedRunTypes = [
      "people",
      "leave_records",
      "leave_balances",
      "approval_state_reconciliation",
    ] satisfies RegisteredSyncRunType[];

    const expectedEventNames = expectedRunTypes.map(
      (runType) => syncEventNames[runType]
    );
    expect(tenantAEvents.map((event) => event.name)).toEqual(
      expectedEventNames
    );
    expect(tenantBEvents.map((event) => event.name)).toEqual(
      expectedEventNames
    );

    for (const evt of tenantAEvents) {
      expect(evt.data.clerkOrgId).toBe(tenantA.clerkOrgId);
      expect(evt.data.organisationId).toBe(tenantA.organisationId);
      expect(evt.data.xeroTenantId).toBe(tenantA.databaseTenantId);
      expect(evt.data.xeroTenantId).not.toBe(tenantA.providerTenantId);
      expect(evt.data.triggerType).toBe("scheduled");
    }
    for (const runType of expectedRunTypes) {
      const event = tenantAEvents.find(
        (candidate) => candidate.name === syncEventNames[runType]
      );
      expect(event?.id).toBe(
        getScheduledSyncEventId(tenantA.databaseTenantId, runType, now)
      );
    }

    for (const evt of tenantBEvents) {
      expect(evt.data.clerkOrgId).toBe(tenantB.clerkOrgId);
      expect(evt.data.organisationId).toBe(tenantB.organisationId);
      expect(evt.data.xeroTenantId).toBe(tenantB.databaseTenantId);
      expect(evt.data.xeroTenantId).not.toBe(tenantB.providerTenantId);
      expect(evt.data.triggerType).toBe("scheduled");
    }
    for (const runType of expectedRunTypes) {
      const event = tenantBEvents.find(
        (candidate) => candidate.name === syncEventNames[runType]
      );
      expect(event?.id).toBe(
        getScheduledSyncEventId(tenantB.databaseTenantId, runType, now)
      );
    }
  });
});
