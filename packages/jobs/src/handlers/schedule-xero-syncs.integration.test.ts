import { encryptXeroToken } from "@repo/xero/src/crypto/tokens";
import "./setup-env";
import { allocateLiveTestFixture } from "@repo/database/live-test-fixture";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getScheduledSyncEventId,
  type RegisteredSyncRunType,
  syncEventNames,
} from "../events";

vi.mock("server-only", () => ({}));
const sentEvents: Array<{
  name: string;
  data: {
    clerkOrgId: string;
    organisationId: string;
    connectionId: string;
    mode?: "full" | "incremental";
    triggerType: string;
  };
  id?: string;
}> = [];
vi.mock("../client", () => ({
  inngest: {
    createFunction: vi.fn((opts: unknown, trigger: unknown, fn: unknown) => ({
      fn,
      opts,
      trigger,
    })),
    send: vi.fn((payload: (typeof sentEvents)[number]) => {
      sentEvents.push(payload);
      return { ids: [payload.id ?? "evt_mock_id"] };
    }),
  },
}));
describe("local persistence integration", async () => {
  const fixture = allocateLiveTestFixture(
    "packages/jobs/src/handlers/schedule-xero-syncs.integration.test.ts"
  );
  const { systemDatabase: database } = await import("@repo/database");
  const { scheduleXeroSyncsPage } = await import("./schedule-xero-syncs");
  const tenantA = {
    authorisationId: fixture.id("authorisation", 0),
    clerkOrgId: fixture.tenants[0]?.clerkOrgId as string,
    connectionId: fixture.id("connection", 0),
    organisationId: fixture.tenants[0]?.organisationId as string,
    providerTenantId: fixture.id("provider-tenant", 0),
  } as const;
  const tenantB = {
    authorisationId: fixture.id("authorisation", 1),
    clerkOrgId: fixture.tenants[1]?.clerkOrgId as string,
    connectionId: fixture.id("connection", 1),
    organisationId: fixture.tenants[1]?.organisationId as string,
    providerTenantId: fixture.id("provider-tenant", 1),
  } as const;
  const testClerkOrgIds = [tenantA.clerkOrgId, tenantB.clerkOrgId] as const;
  const testAuthorisationIds = [
    tenantA.authorisationId,
    tenantB.authorisationId,
  ];
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
    const access = encryptXeroToken("synthetic-access");
    const refresh = encryptXeroToken("synthetic-refresh");
    const now = new Date();
    const grant = {
      access_token_auth_tag: access.authTag,
      access_token_encrypted: access.encrypted,
      access_token_expires_at: new Date(now.getTime() + 3_600_000),
      access_token_iv: access.iv,
      granted_scopes: [
        "payroll.employees.read",
        "payroll.employees",
        "payroll.settings.read",
        "payroll.settings",
      ],
      last_refreshed_at: now,
      provider_app_id: process.env.XERO_CLIENT_ID ?? "test-xero-client-id",
      refresh_token_auth_tag: refresh.authTag,
      refresh_token_encrypted: refresh.encrypted,
      refresh_token_iv: refresh.iv,
      status: "active" as const,
      token_encrypted_at: now,
      token_key_version: access.keyVersion,
      xero_user_id: tenant.authorisationId,
    };
    await database.xeroAuthorisation.upsert({
      create: { id: tenant.authorisationId, ...grant },
      update: grant,
      where: { id: tenant.authorisationId },
    });
    const connection = {
      clerk_org_id: tenant.clerkOrgId,
      initial_sync_completed_at: now,
      organisation_id: tenant.organisationId,
      payroll_region: "AU" as const,
      remote_connection_id: `remote-${tenant.connectionId}`,
      status: "active" as const,
      tenant_name: "Xero Tenant",
      xero_authorisation_id: tenant.authorisationId,
      xero_tenant_id: tenant.providerTenantId,
    };
    await database.xeroConnection.upsert({
      create: { id: tenant.connectionId, ...connection },
      update: connection,
      where: { id: tenant.connectionId },
    });
  }
  async function cleanupTestFixtures() {
    if (!database) {
      return;
    }
    await database.xeroConnection.deleteMany({
      where: { clerk_org_id: { in: testClerkOrgIds as unknown as string[] } },
    });
    await database.xeroAuthorisation.deleteMany({
      where: { xero_user_id: { in: testAuthorisationIds } },
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
    it("holds cadence dispatch until the initial import completion boundary exists", async () => {
      await setupTenant(tenantA, "Australia/Sydney");
      await setupTenant(tenantB, "Australia/Melbourne");
      await database.xeroConnection.updateMany({
        data: { initial_sync_completed_at: null },
        where: {
          clerk_org_id: tenantA.clerkOrgId,
          id: tenantA.connectionId,
          organisation_id: tenantA.organisationId,
        },
      });
      const result = await scheduleXeroSyncsPage({
        now: new Date("2026-08-11T15:30:00Z"),
      });
      expect(result.ok).toBe(true);
      expect(
        sentEvents.filter(
          (event) => event.data.connectionId === tenantA.connectionId
        )
      ).toHaveLength(0);
      expect(
        sentEvents.filter(
          (event) => event.data.connectionId === tenantB.connectionId
        )
      ).toHaveLength(4);
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
        expect(evt.data.connectionId).toBe(tenantA.connectionId);
        expect(evt.data.connectionId).not.toBe(tenantA.providerTenantId);
        expect(evt.data.triggerType).toBe("scheduled");
      }
      for (const runType of expectedRunTypes) {
        const event = tenantAEvents.find(
          (candidate) => candidate.name === syncEventNames[runType]
        );
        expect(event?.id).toBe(
          getScheduledSyncEventId(tenantA.connectionId, runType, now) +
            (runType === "people" || runType === "leave_records" ? ":full" : "")
        );
      }
      for (const evt of tenantBEvents) {
        expect(evt.data.clerkOrgId).toBe(tenantB.clerkOrgId);
        expect(evt.data.organisationId).toBe(tenantB.organisationId);
        expect(evt.data.connectionId).toBe(tenantB.connectionId);
        expect(evt.data.connectionId).not.toBe(tenantB.providerTenantId);
        expect(evt.data.triggerType).toBe("scheduled");
      }
      for (const runType of expectedRunTypes) {
        const event = tenantBEvents.find(
          (candidate) => candidate.name === syncEventNames[runType]
        );
        expect(event?.id).toBe(
          getScheduledSyncEventId(tenantB.connectionId, runType, now) +
            (runType === "people" || runType === "leave_records" ? ":full" : "")
        );
      }
    });
  });
});
