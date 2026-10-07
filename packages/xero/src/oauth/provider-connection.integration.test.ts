// biome-ignore-all lint/style/useFilenamingConvention: Repository integration-test convention.
import { allocateLiveTestFixture } from "@repo/database/live-test-fixture";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { XeroAccessContext } from "../write/types";

vi.mock("server-only", () => ({}));
vi.mock("./identity", () => ({
  verifyXeroAccessTokenIdentity: async () => ({
    ok: true,
    value: {
      expiresAt: new Date(Date.now() + 3_600_000),
      grantedScopes: ["payroll.employees"],
      scopeProvided: true,
      xeroUserId: providerUserId,
    },
  }),
}));
const fixture = allocateLiveTestFixture(
  "packages/xero/src/oauth/provider-connection.integration.test.ts"
);
const tenants = fixture.tenants.map((slot, index) => ({
  ...slot,
  connectionId: fixture.id("connection", index),
  cursorId: fixture.id("cursor", index),
  personId: fixture.id("person", index),
  recordId: fixture.id("record", index),
  remoteId: fixture.id("remote", index),
  tenantId: fixture.id("tenant", index),
}));
function ownedTenant(index: number) {
  const tenant = tenants[index];
  if (!tenant) {
    throw new Error("Missing owned provider integration fixture slot");
  }
  return tenant;
}
const target = ownedTenant(0),
  sibling = ownedTenant(1);
const grantId = fixture.id("authorisation");
const providerAppId = fixture.id("provider-app");
const providerUserId = fixture.id("xero-user");
let database: typeof import("@repo/database")["database"];
let resolve: typeof import("./authorisation")["resolveXeroAccess"];
let verify: typeof import("./provider-connection")["verifyXeroProviderConnection"];
let recover: typeof import("../adapter/auth-recovery")["executeWithXeroAuthRecovery"];
let schedulable: typeof import("@repo/database/queries/schedulable-xero-connections")["listSchedulableXeroConnections"];
let toContext: typeof import("../adapter/resolved-tenant")["toResolvedXeroConnection"];
let encrypt: typeof import("../crypto/tokens")["encryptXeroToken"];
const originalEnv = { ...process.env };
const scope = (tenant = target) => ({
  clerkOrgId: tenant.clerkOrgId,
  connectionId: tenant.connectionId,
  organisationId: tenant.organisationId,
});
const rejection = {
  error: {
    code: "auth_error" as const,
    dispatchPhase: "after_dispatch" as const,
    httpStatus: 401,
    message: "Rejected",
    recoveryReason: "reauthorise" as const,
  },
  ok: false as const,
};
function inventoryRow(tenant = sibling) {
  return {
    id: tenant.remoteId,
    tenantId: tenant.tenantId,
    tenantName: "Payroll",
    tenantType: "ORGANISATION",
  };
}
async function context(): Promise<XeroAccessContext> {
  const result = await resolve(scope());
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error("Owned fixture failed to resolve");
  }
  return toContext(scope(), result.value);
}
beforeAll(async () => {
  process.env.XERO_CLIENT_ID = providerAppId;
  process.env.XERO_CLIENT_SECRET = "local-secret";
  process.env.XERO_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString(
    "base64"
  );
  ({ database } = await import("@repo/database"));
  ({ resolveXeroAccess: resolve } = await import("./authorisation"));
  ({ verifyXeroProviderConnection: verify } = await import(
    "./provider-connection"
  ));
  ({ executeWithXeroAuthRecovery: recover } = await import(
    "../adapter/auth-recovery"
  ));
  ({ listSchedulableXeroConnections: schedulable } = await import(
    "@repo/database/queries/schedulable-xero-connections"
  ));
  ({ toResolvedXeroConnection: toContext } = await import(
    "../adapter/resolved-tenant"
  ));
  ({ encryptXeroToken: encrypt } = await import("../crypto/tokens"));
});
async function cleanup() {
  if (!database) {
    return;
  }
  const where = {
    clerk_org_id: { in: tenants.map((tenant) => tenant.clerkOrgId) },
  };
  await database.xeroSyncCursor.deleteMany({ where });
  await database.availabilityRecord.deleteMany({ where });
  await database.person.deleteMany({ where });
  await database.xeroConnection.deleteMany({ where });
  await database.organisation.deleteMany({ where });
  await database.xeroAuthorisation.deleteMany({ where: { id: grantId } });
}
beforeEach(async () => {
  await cleanup();
  const access = encrypt("old-access"),
    refresh = encrypt("old-refresh");
  await database.xeroAuthorisation.create({
    data: {
      access_token_auth_tag: access.authTag,
      access_token_encrypted: access.encrypted,
      access_token_expires_at: new Date(Date.now() + 3_600_000),
      access_token_iv: access.iv,
      granted_scopes: ["payroll.employees"],
      id: grantId,
      last_refreshed_at: new Date(),
      provider_app_id: providerAppId,
      refresh_token_auth_tag: refresh.authTag,
      refresh_token_encrypted: refresh.encrypted,
      refresh_token_iv: refresh.iv,
      token_encrypted_at: access.encryptedAt,
      token_key_version: access.keyVersion,
      xero_user_id: providerUserId,
    },
  });
  for (const tenant of tenants) {
    await database.organisation.create({
      data: {
        clerk_org_id: tenant.clerkOrgId,
        country_code: "AU",
        id: tenant.organisationId,
        name: "Owned provider status fixture",
      },
    });
    await database.xeroConnection.create({
      data: {
        clerk_org_id: tenant.clerkOrgId,
        id: tenant.connectionId,
        last_connected_at: new Date("2026-10-06T00:00:00Z"),
        organisation_id: tenant.organisationId,
        payroll_region: "AU",
        remote_connection_id: tenant.remoteId,
        xero_authorisation_id: grantId,
        xero_tenant_id: tenant.tenantId,
      },
    });
    await database.person.create({
      data: {
        clerk_org_id: tenant.clerkOrgId,
        email: `${tenant.clerkOrgId}@example.test`,
        employment_type: "employee",
        first_name: "Provider",
        id: tenant.personId,
        last_name: "Person",
        organisation_id: tenant.organisationId,
        source_person_key: tenant.personId,
        source_system: "XERO",
        xero_employee_id: tenant.personId,
      },
    });
    await database.availabilityRecord.create({
      data: {
        all_day: true,
        approval_status: "approved",
        clerk_org_id: tenant.clerkOrgId,
        contactability: "unavailable",
        derived_uid_key: tenant.recordId,
        ends_at: new Date("2026-10-10T00:00:00Z"),
        id: tenant.recordId,
        organisation_id: tenant.organisationId,
        person_id: tenant.personId,
        privacy_mode: "named",
        publish_status: "eligible",
        record_type: "annual_leave",
        source_remote_id: tenant.recordId,
        source_type: "xero_leave",
        starts_at: new Date("2026-10-09T00:00:00Z"),
      },
    });
    await database.xeroSyncCursor.create({
      data: {
        clerk_org_id: tenant.clerkOrgId,
        entity_type: "leave_records",
        id: tenant.cursorId,
        modified_since: new Date("2026-10-06T00:00:00Z"),
        organisation_id: tenant.organisationId,
        xero_connection_id: tenant.connectionId,
      },
    });
  }
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url) =>
      String(url).includes("/connect/token")
        ? Response.json({
            access_token: "new-access",
            expires_in: 3600,
            refresh_token: "new-refresh",
          })
        : Response.json([inventoryRow()])
    )
  );
});
afterEach(() => vi.unstubAllGlobals());
afterAll(async () => {
  await cleanup();
  await database.$disconnect();
  process.env = { ...originalEnv };
});
async function expectPreserved() {
  expect(
    await database.xeroAuthorisation.findUnique({ where: { id: grantId } })
  ).toMatchObject({ status: "active" });
  for (const tenant of tenants) {
    expect(
      await database.person.findUnique({ where: { id: tenant.personId } })
    ).not.toBeNull();
    expect(
      await database.availabilityRecord.findUnique({
        where: { id: tenant.recordId },
      })
    ).not.toBeNull();
    expect(
      await database.xeroSyncCursor.findUnique({
        where: { id: tenant.cursorId },
      })
    ).not.toBeNull();
    expect(
      await database.xeroConnection.findUnique({
        where: { id: tenant.connectionId },
      })
    ).toMatchObject({
      disconnected_at: null,
      remote_connection_id: tenant.remoteId,
      xero_authorisation_id: grantId,
    });
  }
}
describe("confirmed external disconnect with PostgreSQL scope and race guards", () => {
  it("stops target scheduling and queued access after one refresh/replay, preserving the shared sibling and payroll data", async () => {
    const operation = vi.fn().mockResolvedValue(rejection);
    expect(await recover(await context(), operation)).toMatchObject({
      error: { message: "Reconnect Xero to continue." },
      ok: false,
    });
    expect(operation).toHaveBeenCalledTimes(2);
    expect(
      await database.xeroConnection.findUnique({
        where: { id: target.connectionId },
      })
    ).toMatchObject({ status: "reconnect_required" });
    expect(
      await database.xeroConnection.findUnique({
        where: { id: sibling.connectionId },
      })
    ).toMatchObject({ status: "active" });
    const schedule = await schedulable();
    expect(schedule.ok).toBe(true);
    if (schedule.ok) {
      expect(
        schedule.value.connections.map((row) => row.connectionId)
      ).not.toContain(target.connectionId);
      expect(
        schedule.value.connections.map((row) => row.connectionId)
      ).toContain(sibling.connectionId);
    }
    expect(await resolve(scope())).toMatchObject({
      error: { code: "reauthorisation_required" },
      ok: false,
    });
    expect(await resolve(scope(sibling))).toMatchObject({ ok: true });
    expect(fetch).toHaveBeenCalledTimes(2);
    await expectPreserved();
  });
  it("successful complete unfiltered inventory absence marks only the recorded selected link", async () => {
    expect(await verify(await context())).toBe("reconnect_required");
    await expectPreserved();
  });
  it.each(["malformed", "partial", "timeout", "429", "503"])(
    "preserves local state on %s inventory",
    async (kind) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(() => {
          if (kind === "timeout") {
            return Promise.reject(new Error("Local simulated timeout"));
          }
          if (kind === "malformed") {
            return Promise.resolve(Response.json([inventoryRow(), {}]));
          }
          return Promise.resolve(
            Response.json([], {
              status: kind === "partial" ? 206 : Number(kind),
            })
          );
        })
      );
      expect(await verify(await context(), true)).toBe("inconclusive");
      expect(
        await database.xeroConnection.findUnique({
          where: { id: target.connectionId },
        })
      ).toMatchObject({ status: "active" });
      await expectPreserved();
    }
  );
  it("does not refresh or mark a provider permission failure", async () => {
    expect(
      await recover(await context(), async () => ({
        error: {
          code: "permission_error",
          httpStatus: 403,
          message: "Denied",
          recoveryReason: "access_denied",
        },
        ok: false,
      }))
    ).toMatchObject({ ok: false });
    expect(fetch).not.toHaveBeenCalled();
    expect(
      await database.xeroConnection.findUnique({
        where: { id: target.connectionId },
      })
    ).toMatchObject({ status: "active" });
  });
  it.each(["clerk", "organisation", "connection"])(
    "changes zero rows for a forged %s scope",
    async (key) => {
      const captured = await context();
      const overrides = {
        clerk: { clerk_org_id: sibling.clerkOrgId },
        connection: { id: sibling.connectionId },
        organisation: { organisation_id: sibling.organisationId },
      };
      const forged = {
        ...captured,
        ...overrides[key as keyof typeof overrides],
      };
      expect(await verify(forged, true)).toBe("connection_changed");
      expect(fetch).not.toHaveBeenCalled();
      expect(
        await database.xeroConnection.findUnique({
          where: { id: target.connectionId },
        })
      ).toMatchObject({ status: "active" });
    }
  );
  it("an old probe cannot mark a same-file reconnect that completes during inventory I/O", async () => {
    const captured = await context();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        await database.xeroConnection.update({
          data: { last_connected_at: new Date() },
          where: { id: target.connectionId },
        });
        return Response.json([]);
      })
    );
    expect(await verify(captured)).toBe("connection_changed");
    expect(
      await database.xeroConnection.findUnique({
        where: { id: target.connectionId },
      })
    ).toMatchObject({ status: "active" });
    await expectPreserved();
  });
  it("an old probe cannot mark a replaced canonical grant during inventory I/O", async () => {
    const captured = await context();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        await database.xeroAuthorisation.update({
          data: { last_refreshed_at: new Date() },
          where: { id: grantId },
        });
        return Response.json([]);
      })
    );
    expect(await verify(captured)).toBe("connection_changed");
    expect(
      await database.xeroConnection.findUnique({
        where: { id: target.connectionId },
      })
    ).toMatchObject({ status: "active" });
  });
});
