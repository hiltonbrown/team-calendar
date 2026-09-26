// biome-ignore-all lint/style/useFilenamingConvention: Co-located integration suite naming.
import { allocateLiveTestFixture } from "@repo/database/live-test-fixture";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

vi.mock("server-only", () => ({}));
const originalEnv = { ...process.env };
const fixture = allocateLiveTestFixture(
  "packages/xero/src/oauth/connection-cleanup.integration.test.ts"
);
let database: typeof import("@repo/database")["database"];
let service: typeof import("./service");
const appId = fixture.globalKey("provider_app");
const slots = fixture.tenants.map((t, i) => ({
  ...t,
  connectionId: fixture.id("connection", i),
  externalTenantId: fixture.id("external-tenant", i),
  remoteId: fixture.globalKey("provider_connection", i),
  tenantId: fixture.id("tenant", i),
}));
function slot(i: number) {
  const value = slots[i];
  if (!value) {
    throw new Error("Missing owned fixture slot");
  }
  return value;
}
const scope = (i = 0) => ({
  clerkOrgId: slot(i).clerkOrgId,
  organisationId: slot(i).organisationId,
});
const requestSlot = 0;
let attemptSlot = 0;
async function cleanup() {
  if (!database) {
    return;
  }
  const where = {
    clerk_org_id: { in: slots.map((s) => s.clerkOrgId) },
    organisation_id: { in: slots.map((s) => s.organisationId) },
  };
  await database.xeroCleanupAttempt.deleteMany({ where });
  await database.xeroCleanupRequest.deleteMany({ where });
  await database.xeroOAuthSession.deleteMany({
    where: { clerk_org_id: { in: slots.map((s) => s.clerkOrgId) } },
  });
  await database.xeroTenant.deleteMany({ where });
  await database.xeroConnection.deleteMany({ where });
  await database.organisation.deleteMany({
    where: { clerk_org_id: where.clerk_org_id, id: where.organisation_id },
  });
}
async function seed() {
  for (const s of slots) {
    await database.organisation.create({
      data: {
        clerk_org_id: s.clerkOrgId,
        country_code: "AU",
        id: s.organisationId,
        name: "Cleanup fixture",
      },
    });
    await database.xeroConnection.create({
      data: {
        access_token_encrypted: "synthetic",
        clerk_org_id: s.clerkOrgId,
        expires_at: new Date(Date.now() + 3_600_000),
        id: s.connectionId,
        organisation_id: s.organisationId,
        refresh_token_encrypted: "synthetic",
        status: "active",
        xero_authorisation_connection_id: s.remoteId,
      },
    });
    await database.xeroTenant.create({
      data: {
        active_slot: 1,
        clerk_org_id: s.clerkOrgId,
        id: s.tenantId,
        organisation_id: s.organisationId,
        payroll_region: "AU",
        provider_app_id: appId,
        tenant_name: "Cleanup",
        xero_connection_id: s.connectionId,
        xero_tenant_id: s.externalTenantId,
      },
    });
  }
}
function disconnect(destructive = false) {
  return service.disconnectXeroOAuthConnection({
    ...scope(),
    connectionId: slot(0).connectionId,
    destructive,
    performedByUserId: "fixture-operator",
  });
}
describe("local cleanup transaction", () => {
  beforeAll(async () => {
    process.env.XERO_CLIENT_ID = appId;
    process.env.XERO_CLIENT_SECRET = "synthetic";
    process.env.XERO_REDIRECT_URI = "https://fixture.example/oauth";
    process.env.VERCEL_ENV = "test";
    ({ database } = await import("@repo/database"));
    service = await import("./service");
    const nextAttemptId = () => {
      const id = fixture.globalKey("cleanup_attempt", attemptSlot);
      attemptSlot += 1;
      return id;
    };
    const create = database.xeroCleanupRequest.create.bind(
      database.xeroCleanupRequest
    );
    vi.spyOn(database.xeroCleanupRequest, "create").mockImplementation(
      (args) => {
        const nested = args.data.attempts?.create;
        if (!Array.isArray(nested)) {
          throw new Error("Expected frozen attempt array.");
        }
        return create({
          ...args,
          data: {
            ...args.data,
            attempts: {
              create: nested.map((a) => ({
                ...a,
                id: nextAttemptId(),
              })),
            },
            id: fixture.globalKey("cleanup_request", requestSlot),
          },
        });
      }
    );
  });
  beforeEach(async () => {
    process.env.XERO_REMOTE_CLEANUP_MODE = "enabled";
    await cleanup();
    await seed();
  });
  afterAll(async () => {
    await cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    process.env = originalEnv;
    await database.$disconnect();
  });
  it("commits disabled state and pending frozen target with zero HTTP", async () => {
    const fetchSpy = vi
      .fn()
      .mockRejectedValue(new Error("No provider requests authorised"));
    vi.stubGlobal("fetch", fetchSpy);
    const result = await disconnect();
    expect(result).toMatchObject({
      ok: true,
      value: { localDisabled: true, remoteStatus: "pending" },
    });
    expect(await disconnect()).toEqual(result);
    expect(
      await database.xeroCleanupRequest.count({
        where: {
          clerk_org_id: scope().clerkOrgId,
          organisation_id: scope().organisationId,
        },
      })
    ).toBe(1);
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
    expect(
      await database.xeroTenant.findFirst({
        where: {
          ...{
            clerk_org_id: scope().clerkOrgId,
            organisation_id: scope().organisationId,
          },
          id: slot(0).tenantId,
        },
      })
    ).toMatchObject({ active_slot: 1, binding_generation: 2 });
    expect(
      await database.xeroConnection.findFirst({
        where: {
          clerk_org_id: scope(1).clerkOrgId,
          id: slot(1).connectionId,
          organisation_id: scope(1).organisationId,
        },
      })
    ).toMatchObject({ status: "active" });
  });
  it("reports current cleanup pending but ignores a superseded generation", async () => {
    const { getXeroConnectionState } = await import(
      "@repo/database/queries/xero-connection-state"
    );
    expect(await disconnect()).toMatchObject({ ok: true });
    expect(await getXeroConnectionState(scope())).toEqual({
      ok: true,
      value: { bindingGeneration: 2, state: "disconnect_pending" },
    });
    await database.$transaction(async (tx) => {
      await tx.xeroConnection.updateMany({
        data: { disconnected_at: null, revoked_at: null, status: "active" },
        where: {
          clerk_org_id: scope().clerkOrgId,
          id: slot(0).connectionId,
          organisation_id: scope().organisationId,
        },
      });
      await tx.xeroTenant.updateMany({
        data: { active_slot: 1, binding_generation: 3, retired_at: null },
        where: {
          clerk_org_id: scope().clerkOrgId,
          id: slot(0).tenantId,
          organisation_id: scope().organisationId,
        },
      });
    });
    expect(await getXeroConnectionState(scope())).toEqual({
      ok: true,
      value: { bindingGeneration: 3, state: "connected" },
    });
    expect(
      await database.xeroCleanupAttempt.findFirst({
        where: {
          clerk_org_id: scope().clerkOrgId,
          expected_binding_generation: 2,
          organisation_id: scope().organisationId,
        },
      })
    ).toMatchObject({ state: "pending" });
  });

  it("retires a binding immediately when no remote target was recorded", async () => {
    await database.xeroConnection.updateMany({
      data: { xero_authorisation_connection_id: null },
      where: {
        clerk_org_id: scope().clerkOrgId,
        id: slot(0).connectionId,
        organisation_id: scope().organisationId,
      },
    });
    expect(await disconnect()).toMatchObject({
      ok: true,
      value: { remoteStatus: "not_applicable" },
    });
    expect(
      await database.xeroTenant.findFirst({
        where: {
          clerk_org_id: scope().clerkOrgId,
          id: slot(0).tenantId,
          organisation_id: scope().organisationId,
        },
      })
    ).toMatchObject({ active_slot: null, retirement_reason: "disconnected" });
  });
  it("records destructive completion while preserving the neighbouring connection", async () => {
    expect(await disconnect(true)).toMatchObject({
      ok: true,
      value: { dataActionStatus: "completed", remoteStatus: "pending" },
    });
    expect(
      await database.xeroConnection.findFirst({
        where: {
          clerk_org_id: scope(1).clerkOrgId,
          id: slot(1).connectionId,
          organisation_id: scope(1).organisationId,
        },
      })
    ).toMatchObject({ status: "active" });
  });
  it("report-only cancellations retain a truthful receipt and release reservation", async () => {
    delete process.env.XERO_REMOTE_CLEANUP_MODE;
    expect(await disconnect()).toMatchObject({
      ok: true,
      value: { remoteStatus: "left_in_place" },
    });
    expect(
      await database.xeroCleanupAttempt.findFirst({
        where: {
          clerk_org_id: scope().clerkOrgId,
          organisation_id: scope().organisationId,
        },
      })
    ).toMatchObject({ outcome_reason: "report_only", state: "cancelled" });
  });
  async function reconnectSession(
    index = 0,
    externalTenantId = slot(0).externalTenantId
  ) {
    const { encryptXeroToken } = await import("../crypto/tokens");
    const access = encryptXeroToken("selection-access-token");
    const refresh = encryptXeroToken("selection-refresh-token");
    const sessionId = fixture.id("cleanup-reconnect-session", index);
    await database.xeroOAuthSession.create({
      data: {
        access_token_auth_tag: access.authTag,
        access_token_encrypted: access.encrypted,
        access_token_iv: access.iv,
        available_tenants_json: {
          tenants: [
            {
              connectionId: slot(0).remoteId,
              tenantId: externalTenantId,
              tenantName: "Cleanup",
            },
          ],
        },
        clerk_org_id: scope(index).clerkOrgId,
        created_by_user_id: "fixture-operator",
        expected_binding_generation: index === 0 ? 2 : null,
        expires_at: new Date(Date.now() + 600_000),
        id: sessionId,
        organisation_id: scope(index).organisationId,
        refresh_token_auth_tag: refresh.authTag,
        refresh_token_encrypted: refresh.encrypted,
        refresh_token_iv: refresh.iv,
        return_to: "/settings/integrations/xero",
        status: "pending",
        token_expires_at: new Date(Date.now() + 3_600_000),
      },
    });
    return {
      ...scope(index),
      sessionId,
      tenantId: externalTenantId,
      userId: "fixture-operator",
    };
  }
  function stubRegion() {
    const fetch = vi.fn(async () =>
      Response.json({ Organisations: [{ CountryCode: "AU", Name: "Cleanup" }] })
    );
    vi.stubGlobal("fetch", fetch);
    return fetch;
  }
  async function changeAttempt(
    state: "claimed" | "unknown" | "dispatching",
    leaseExpiresAt: Date | null = null
  ) {
    const receipt = await disconnect();
    expect(receipt.ok).toBe(true);
    await database.xeroCleanupAttempt.updateMany({
      data: {
        lease_expires_at: leaseExpiresAt,
        lease_owner: state === "unknown" ? null : "fixture-worker",
        state,
      },
      where: {
        clerk_org_id: scope().clerkOrgId,
        organisation_id: scope().organisationId,
      },
    });
  }
  it.each(["unknown", "claimed"] as const)(
    "actual reconnect rejects %s cleanup under the binding lock",
    async (state) => {
      await changeAttempt(
        state,
        state === "claimed" ? new Date(Date.now() + 120_000) : null
      );
      const input = await reconnectSession();
      stubRegion();
      try {
        expect(await service.completeXeroTenantSelection(input)).toMatchObject({
          error: { code: "cleanup_unresolved" },
          ok: false,
        });
      } finally {
        vi.unstubAllGlobals();
      }
      expect(
        await database.xeroConnection.findFirst({
          where: {
            clerk_org_id: scope().clerkOrgId,
            id: slot(0).connectionId,
            organisation_id: scope().organisationId,
          },
        })
      ).toMatchObject({ status: "disconnected" });
    }
  );
  it("expired dispatched cleanup still fences reconnect and worker records unknown without another DELETE", async () => {
    await changeAttempt("dispatching", new Date(Date.now() - 1000));
    const input = await reconnectSession();
    stubRegion();
    try {
      expect(await service.completeXeroTenantSelection(input)).toMatchObject({
        error: { code: "cleanup_unresolved" },
        ok: false,
      });
    } finally {
      vi.unstubAllGlobals();
    }
    const where = {
      clerk_org_id: scope().clerkOrgId,
      organisation_id: scope().organisationId,
    };
    const attempt = await database.xeroCleanupAttempt.findFirstOrThrow({
      where,
    });
    expect(attempt.state).toBe("dispatching");
    const { processXeroCleanupAttempt } = await import("./connection-cleanup");
    const deleteImpl = vi.fn(async () => ({ kind: "absent" as const }));
    await processXeroCleanupAttempt(
      { ...scope(), attemptId: attempt.id },
      { deleteImpl }
    );
    expect(deleteImpl).not.toHaveBeenCalled();
    expect(
      await database.xeroCleanupAttempt.findFirstOrThrow({ where })
    ).toMatchObject({ outcome_reason: "lease_expired", state: "unknown" });
    expect(
      await database.xeroTenant.findFirstOrThrow({
        where: { ...where, id: slot(0).tenantId },
      })
    ).toMatchObject({ active_slot: 1, binding_generation: 2 });
  });
  it("expired unsent claim reconnects, cancels the attempt and cannot dispatch later", async () => {
    await changeAttempt("claimed", new Date(Date.now() - 1000));
    const input = await reconnectSession();
    stubRegion();
    try {
      expect(await service.completeXeroTenantSelection(input)).toMatchObject({
        ok: true,
      });
    } finally {
      vi.unstubAllGlobals();
    }
    const attempt = await database.xeroCleanupAttempt.findFirstOrThrow({
      where: {
        clerk_org_id: scope().clerkOrgId,
        organisation_id: scope().organisationId,
      },
    });
    expect(attempt).toMatchObject({
      outcome_reason: "superseded",
      state: "cancelled",
    });
    const { processXeroCleanupAttempt } = await import("./connection-cleanup");
    const deleteImpl = vi.fn(async () => ({ kind: "absent" as const }));
    await processXeroCleanupAttempt(
      { ...scope(), attemptId: attempt.id },
      { deleteImpl }
    );
    expect(deleteImpl).not.toHaveBeenCalled();
    expect(
      await database.xeroTenant.findFirst({
        where: {
          clerk_org_id: scope().clerkOrgId,
          id: slot(0).tenantId,
          organisation_id: scope().organisationId,
        },
      })
    ).toMatchObject({ binding_generation: 3 });
  });
  it("another Organisation cannot claim the same external file while unknown cleanup reserves it", async () => {
    await changeAttempt("unknown");
    await database.xeroTenant.deleteMany({
      where: {
        clerk_org_id: scope(1).clerkOrgId,
        id: slot(1).tenantId,
        organisation_id: scope(1).organisationId,
      },
    });
    const input = await reconnectSession(1);
    stubRegion();
    try {
      expect(await service.completeXeroTenantSelection(input)).toMatchObject({
        error: { code: "tenant_binding_conflict" },
        ok: false,
      });
    } finally {
      vi.unstubAllGlobals();
    }
    expect(
      await database.xeroTenant.findFirst({
        where: {
          clerk_org_id: scope().clerkOrgId,
          id: slot(0).tenantId,
          organisation_id: scope().organisationId,
        },
      })
    ).toMatchObject({ active_slot: 1, binding_generation: 2 });
  });
});
