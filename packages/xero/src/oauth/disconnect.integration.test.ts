// biome-ignore-all lint/style/useFilenamingConvention: Integration tests use the repository's .integration.test.ts convention.
import type { ExternalWritePort, ProviderWriteCertainty } from "@repo/core";
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

vi.mock("server-only", () => ({}));
vi.mock("./identity", () => ({
  verifyXeroAccessTokenIdentity: vi.fn(async () => ({
    ok: true,
    value: {
      authEventId: null,
      expiresAt: new Date(Date.now() + 1_800_000),
      grantedScopes: ["payroll.employees"],
      xeroUserId: tenantA.authorisationId,
    },
  })),
}));
const fixture = allocateLiveTestFixture(
  "packages/xero/src/oauth/disconnect.integration.test.ts"
);
function allocateTenant(index: number) {
  const slot = fixture.tenants[index];
  if (!slot) {
    throw new Error("Missing owned integration fixture slot");
  }
  return {
    ...slot,
    authorisationId: fixture.id("authorisation", index),
    availabilityRecordId: fixture.id("availability-record", index),
    candidatePersonId: fixture.id("candidate-person", index),
    connectionId: fixture.id("connection", index),
    cursorId: fixture.id("cursor", index),
    feedId: fixture.id("feed", index),
    leaveBalanceId: fixture.id("leave-balance", index),
    manualRecordId: fixture.id("manual-record", index),
    matchId: fixture.id("match", index),
    remoteId: fixture.id("remote", index),
    sessionId: fixture.id("oauth-session", index),
    syncRunId: fixture.id("sync-run", index),
    xeroPersonId: fixture.id("xero-person", index),
  };
}
const tenantA = allocateTenant(0),
  tenantB = allocateTenant(1);
const testClerkOrgIds = [tenantA.clerkOrgId, tenantB.clerkOrgId];
let database: typeof import("@repo/database")["systemDatabase"];
let disconnectXeroOAuthConnection: typeof import("./disconnect")["disconnectXeroOAuthConnection"];
let encryptXeroToken: typeof import("../crypto/tokens")["encryptXeroToken"];
let decryptXeroToken: typeof import("../crypto/tokens")["decryptXeroToken"];
const originalEnv = { ...process.env };
beforeAll(async () => {
  process.env.XERO_CLIENT_ID = "test-xero-client-id";
  process.env.XERO_CLIENT_SECRET = "test-xero-client-secret";
  process.env.XERO_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString(
    "base64"
  );
  ({ systemDatabase: database } = await import("@repo/database"));
  ({ disconnectXeroOAuthConnection } = await import("./disconnect"));
  ({ encryptXeroToken, decryptXeroToken } = await import("../crypto/tokens"));
});
beforeEach(async () => {
  await cleanTestData();
  process.env.XERO_CLIENT_ID = `disconnect-${tenantA.clerkOrgId}-${Date.now()}`;
  process.env.XERO_APP_TIER = "starter";
  await createTenantFixture(tenantA);
  await createTenantFixture(tenantB);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(null, { status: 204 }))
  );
});
afterEach(() => vi.unstubAllGlobals());
afterAll(async () => {
  await cleanTestData();
  await database.$disconnect();
  process.env = { ...originalEnv };
});
async function cleanTestData() {
  if (!database) {
    return;
  }
  const where = { clerk_org_id: { in: testClerkOrgIds } };
  await database.notificationEmailQueue.deleteMany({ where });
  await database.notification.deleteMany({ where });
  await database.notificationPreference.deleteMany({ where });
  await database.organisationSettings.deleteMany({ where });
  await database.outboundOperation.deleteMany({ where });
  await database.xeroOAuthSession.deleteMany({ where });
  await database.auditEvent.deleteMany({ where });
  await database.xeroSyncCursor.deleteMany({ where });
  await database.syncRun.deleteMany({ where });
  await database.leaveBalance.deleteMany({ where });
  await database.xeroPersonMatch.deleteMany({ where });
  await database.feedEventPublication.deleteMany({ where });
  await database.feedScope.deleteMany({ where });
  await database.feedToken.deleteMany({ where });
  await database.feed.deleteMany({ where });
  await database.availabilityPublication.deleteMany({ where });
  await database.availabilityRecord.deleteMany({ where });
  await database.person.deleteMany({ where });
  await database.xeroConnection.deleteMany({ where });
  await database.organisation.deleteMany({ where });
  await database.xeroAuthorisation.deleteMany({
    where: { id: { in: [tenantA.authorisationId, tenantB.authorisationId] } },
  });
}
function disconnect(destructive = false) {
  return disconnectXeroOAuthConnection({
    clerkOrgId: tenantA.clerkOrgId,
    connectionId: tenantA.connectionId,
    destructive,
    organisationId: tenantA.organisationId,
    performedByUserId: "admin_1",
  });
}
function providerPort(
  certainty: ProviderWriteCertainty = "definitive_failure"
): ExternalWritePort {
  const fail = async () => ({
    error: {
      certainty,
      code: "network_error",
      message: "Provider fixture failure",
      userMessage: "Try again.",
    },
    ok: false as const,
  });
  return {
    approveLeaveApplication: vi.fn(fail),
    declineLeaveApplication: vi.fn(fail),
    prepareLeaveMutation: vi.fn(async (input) => ({
      ok: true as const,
      value: {
        body:
          input.action === "create"
            ? JSON.stringify([
                {
                  EmployeeID: input.employeeId,
                  EndDate: input.endsAt?.toISOString().slice(0, 10),
                  LeaveTypeID: input.leaveTypeId,
                  StartDate: input.startsAt?.toISOString().slice(0, 10),
                  Title: input.title,
                },
              ])
            : null,
        method: "POST" as const,
        url:
          input.action === "create"
            ? "https://api.xero.com/payroll.xro/1.0/LeaveApplications"
            : `https://api.xero.com/payroll.xro/1.0/LeaveApplications/${input.remoteId}/${input.action === "approve" ? "approve" : "reject"}`,
        xeroTenantId: `xero-${input.clerkOrgId}`,
      },
    })),
    resolveEmployeeId: vi.fn(async () => ({
      ok: true as const,
      value: "employee",
    })),
    resolveLeaveTypeId: vi.fn(async () => ({
      ok: true as const,
      value: "annual",
    })),
    submitLeaveApplication: vi.fn(fail),
    withdrawLeaveApplication: vi.fn(fail),
  };
}
describe("canonical disconnect isolation", () => {
  it.each([403, 500])(
    "keeps a removed company's ownership on uncertain remote response %s",
    async (status) => {
      const { removeXeroCompany } = await import("./disconnect");
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => new Response(null, { status }))
      );
      expect(
        await removeXeroCompany({
          clerkOrgId: tenantA.clerkOrgId,
          connectionId: tenantA.connectionId,
          organisationId: tenantA.organisationId,
          role: "owner",
        })
      ).toMatchObject({ ok: false });
      expect(
        await database.xeroConnection.findUnique({
          where: { id: tenantA.connectionId },
        })
      ).toMatchObject({ released_at: null, status: "active" });
      expect(
        await database.organisation.findUnique({
          where: { id: tenantA.organisationId },
        })
      ).toMatchObject({ archived_at: null, is_active: true });
    }
  );
  it("removes a previously confirmed soft disconnect without another provider request", async () => {
    expect(await disconnect()).toMatchObject({ ok: true });
    const { removeXeroCompany } = await import("./disconnect");
    expect(
      await removeXeroCompany({
        clerkOrgId: tenantA.clerkOrgId,
        connectionId: tenantA.connectionId,
        organisationId: tenantA.organisationId,
        role: "owner",
      })
    ).toMatchObject({ ok: true, value: { state: "removed" } });
    expect(
      await database.xeroConnection.findUnique({
        where: { id: tenantA.connectionId },
      })
    ).toMatchObject({ released_at: expect.any(Date), status: "disconnected" });
    expect(
      await database.organisation.findUnique({
        where: { id: tenantA.organisationId },
      })
    ).toMatchObject({ archived_at: expect.any(Date), is_active: false });
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
  });
  it.each(["connection", "grant"] as const)(
    "removes a company whose %s needs reconnecting without a provider request",
    async (unusable) => {
      const binding = await database.xeroConnection.findUniqueOrThrow({
        where: { id: tenantA.connectionId },
      });
      if (unusable === "connection") {
        await database.xeroConnection.update({
          data: { status: "reconnect_required" },
          where: { id: tenantA.connectionId },
        });
      } else {
        await database.xeroAuthorisation.update({
          data: { status: "reconnect_required" },
          where: { id: binding.xero_authorisation_id ?? "" },
        });
      }
      const { removeXeroCompany } = await import("./disconnect");
      expect(
        await removeXeroCompany({
          clerkOrgId: tenantA.clerkOrgId,
          connectionId: tenantA.connectionId,
          organisationId: tenantA.organisationId,
          role: "owner",
        })
      ).toMatchObject({ ok: true, value: { state: "removed" } });
      expect(
        await database.xeroConnection.findUnique({
          where: { id: tenantA.connectionId },
        })
      ).toMatchObject({
        released_at: expect.any(Date),
        remote_connection_id: null,
        status: "disconnected",
        xero_authorisation_id: null,
      });
      expect(
        await database.organisation.findUnique({
          where: { id: tenantA.organisationId },
        })
      ).toMatchObject({ archived_at: expect.any(Date), is_active: false });
      expect(
        await database.auditEvent.findFirst({
          where: {
            action: "company_removed",
            clerk_org_id: tenantA.clerkOrgId,
            resource_id: tenantA.connectionId,
          },
        })
      ).toMatchObject({ metadata: { remote_delete: "unreachable" } });
      expect(vi.mocked(fetch)).not.toHaveBeenCalled();
    }
  );
  it("does not remove an unreachable company during an active record write claim", async () => {
    await database.xeroConnection.update({
      data: { status: "reconnect_required" },
      where: { id: tenantA.connectionId },
    });
    await database.availabilityRecord.update({
      data: { xero_write_claimed_at: new Date() },
      where: { id: tenantA.availabilityRecordId },
    });
    const { removeXeroCompany } = await import("./disconnect");
    expect(
      await removeXeroCompany({
        clerkOrgId: tenantA.clerkOrgId,
        connectionId: tenantA.connectionId,
        organisationId: tenantA.organisationId,
        role: "owner",
      })
    ).toMatchObject({ error: { code: "write_in_progress" }, ok: false });
    expect(
      await database.xeroConnection.findUnique({
        where: { id: tenantA.connectionId },
      })
    ).toMatchObject({ released_at: null, status: "reconnect_required" });
  });
  it("does not release a disconnected binding without confirmed disconnect audit evidence", async () => {
    await database.xeroConnection.update({
      data: {
        disconnected_at: new Date(),
        remote_connection_id: null,
        status: "disconnected",
        xero_authorisation_id: null,
      },
      where: { id: tenantA.connectionId },
    });
    const { removeXeroCompany } = await import("./disconnect");
    expect(
      await removeXeroCompany({
        clerkOrgId: tenantA.clerkOrgId,
        connectionId: tenantA.connectionId,
        organisationId: tenantA.organisationId,
        role: "owner",
      })
    ).toMatchObject({ ok: false });
    expect(
      await database.xeroConnection.findUnique({
        where: { id: tenantA.connectionId },
      })
    ).toMatchObject({ released_at: null });
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });
  it("removes once, archives Xero state, preserves a live Add grant and sibling connection", async () => {
    const { removeXeroCompany } = await import("./disconnect");
    await database.xeroOAuthSession.create({
      data: {
        clerk_org_id: tenantA.clerkOrgId,
        expires_at: new Date(Date.now() + 60_000),
        id: tenantA.sessionId,
        organisation_id: null,
        return_to: "/settings",
        status: "selecting",
        xero_authorisation_id: tenantA.authorisationId,
      },
    });
    const companyFeed = await database.feed.create({
      data: {
        clerk_org_id: tenantA.clerkOrgId,
        name: "Manual company calendar",
        organisation_id: tenantA.organisationId,
        slug: `remove-${tenantA.connectionId}`,
      },
    });
    const companyToken = await database.feedToken.create({
      data: {
        clerk_org_id: tenantA.clerkOrgId,
        feed_id: companyFeed.id,
        organisation_id: tenantA.organisationId,
        token_hash: `synthetic-${companyFeed.id}`,
        token_hint: "synthetic",
      },
    });
    const accountFeed = await database.feed.create({
      data: {
        clerk_org_id: tenantA.clerkOrgId,
        name: "Account",
        organisation_id: null,
        slug: `account-${tenantA.connectionId}`,
      },
    });
    const holidayPublication = await database.feedEventPublication.create({
      data: {
        clerk_org_id: tenantA.clerkOrgId,
        feed_id: accountFeed.id,
        organisation_id: null,
        published_at: new Date(),
        published_uid: `synthetic-${accountFeed.id}`,
        representation_hash: "synthetic",
        source_key: `holiday:${tenantA.organisationId}:synthetic-holiday`,
      },
    });
    const sibling = await database.xeroConnection.findUniqueOrThrow({
      where: { id: tenantB.connectionId },
    });
    const input = {
      clerkOrgId: tenantA.clerkOrgId,
      connectionId: tenantA.connectionId,
      organisationId: tenantA.organisationId,
      role: "owner" as const,
    };
    expect(await removeXeroCompany(input)).toMatchObject({
      ok: true,
      value: { state: "removed" },
    });
    expect(
      await database.xeroConnection.findUnique({
        where: { id: tenantA.connectionId },
      })
    ).toMatchObject({ released_at: expect.any(Date), status: "disconnected" });
    expect(
      await database.organisation.findUnique({
        where: { id: tenantA.organisationId },
      })
    ).toMatchObject({ archived_at: expect.any(Date), is_active: false });
    expect(
      await database.person.findUnique({ where: { id: tenantA.xeroPersonId } })
    ).toMatchObject({ archived_at: expect.any(Date), is_active: false });
    expect(
      await database.availabilityRecord.findUnique({
        where: { id: tenantA.availabilityRecordId },
      })
    ).toMatchObject({
      archived_at: expect.any(Date),
      publish_status: "archived",
    });
    expect(
      await database.xeroAuthorisation.findUnique({
        where: { id: tenantA.authorisationId },
      })
    ).not.toBeNull();
    expect(
      await database.xeroConnection.findUnique({
        where: { id: tenantB.connectionId },
      })
    ).toEqual(sibling);
    expect(
      await database.feed.findUnique({ where: { id: companyFeed.id } })
    ).toMatchObject({ archived_at: expect.any(Date), status: "archived" });
    expect(
      await database.feedToken.findUnique({ where: { id: companyToken.id } })
    ).toMatchObject({ revoked_at: expect.any(Date), status: "revoked" });
    expect(
      await database.feed.findUnique({ where: { id: accountFeed.id } })
    ).toMatchObject({ archived_at: null, status: "active" });
    expect(
      await database.feedEventPublication.findUnique({
        where: { id: holidayPublication.id },
      })
    ).toMatchObject({ present: false });
    expect(await removeXeroCompany(input)).toMatchObject({ ok: true });
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
    expect(
      await database.auditEvent.count({
        where: { action: "company_removed", clerk_org_id: tenantA.clerkOrgId },
      })
    ).toBe(1);
    expect(
      await database.syncRun.findUnique({ where: { id: tenantA.syncRunId } })
    ).not.toBeNull();
  });
  it("keeps the closing session reference for a normal scheduler retry after prune failure", async () => {
    await database.xeroOAuthSession.create({
      data: {
        clerk_org_id: tenantA.clerkOrgId,
        expires_at: new Date(Date.now() + 60_000),
        id: tenantA.sessionId,
        organisation_id: tenantA.organisationId,
        return_to: "/settings",
        status: "selecting",
        xero_authorisation_id: tenantA.authorisationId,
      },
    });
    expect(await disconnect()).toMatchObject({ ok: true });
    await database.xeroOAuthSession.update({
      data: { expires_at: new Date(0) },
      where: { id: tenantA.sessionId },
    });
    const { purgeClosedXeroOAuthSessions } = await import("./service");
    const functionName = `disconnect_prune_${tenantA.connectionId.replaceAll("-", "")}`;
    await database.$executeRawUnsafe(
      `CREATE FUNCTION ${functionName}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF OLD.id = '${tenantA.authorisationId}'::uuid THEN RAISE EXCEPTION 'owned prune failure'; END IF; RETURN OLD; END $$`
    );
    await database.$executeRawUnsafe(
      `CREATE TRIGGER ${functionName} BEFORE DELETE ON xero_authorisations FOR EACH ROW EXECUTE FUNCTION ${functionName}()`
    );
    try {
      await expect(purgeClosedXeroOAuthSessions()).rejects.toThrow();
      expect(
        await database.xeroOAuthSession.findUnique({
          where: { id: tenantA.sessionId },
        })
      ).toMatchObject({ xero_authorisation_id: tenantA.authorisationId });
    } finally {
      await database.$executeRawUnsafe(
        `DROP TRIGGER IF EXISTS ${functionName} ON xero_authorisations`
      );
      await database.$executeRawUnsafe(
        `DROP FUNCTION IF EXISTS ${functionName}()`
      );
    }
    await purgeClosedXeroOAuthSessions();
    expect(
      await database.xeroAuthorisation.findUnique({
        where: { id: tenantA.authorisationId },
      })
    ).toBeNull();
    expect(
      await database.xeroOAuthSession.findUnique({
        where: { id: tenantA.sessionId },
      })
    ).toBeNull();
  });

  it("prunes a session-protected unused grant when its final selecting session expires", async () => {
    await database.xeroOAuthSession.create({
      data: {
        clerk_org_id: tenantA.clerkOrgId,
        expires_at: new Date(Date.now() + 60_000),
        id: tenantA.sessionId,
        organisation_id: tenantA.organisationId,
        return_to: "/settings",
        status: "selecting",
        xero_authorisation_id: tenantA.authorisationId,
      },
    });
    expect(await disconnect()).toMatchObject({ ok: true });
    const { purgeClosedXeroOAuthSessions } = await import("./service");
    await purgeClosedXeroOAuthSessions();
    expect(
      await database.xeroAuthorisation.findUnique({
        where: { id: tenantA.authorisationId },
      })
    ).not.toBeNull();
    await database.xeroOAuthSession.update({
      data: { expires_at: new Date(0) },
      where: { id: tenantA.sessionId },
    });
    await purgeClosedXeroOAuthSessions();
    expect(
      await database.xeroAuthorisation.findUnique({
        where: { id: tenantA.authorisationId },
      })
    ).toBeNull();
    await expectConnectionActive(tenantB);
  });

  it.each(["disconnected", "reconnect_required"] as const)(
    "allows local decline and withdrawal while the connection is %s",
    async (status) => {
      await database.person.update({
        data: { clerk_user_id: null },
        where: { id: tenantA.xeroPersonId },
      });
      await database.availabilityRecord.update({
        data: {
          approval_status: "submitted",
          source_remote_id: null,
          source_type: "team_calendar_leave",
        },
        where: { id: tenantA.availabilityRecordId },
      });
      await database.xeroConnection.update({
        data: { status },
        where: { id: tenantA.connectionId },
      });
      const { decline } = await import("@repo/availability");
      const { withdrawSubmission } = await import("@repo/availability");
      const port = providerPort();
      const command = {
        actingPersonId: null,
        actingUserId: "admin_1",
        clerkOrgId: tenantA.clerkOrgId,
        organisationId: tenantA.organisationId,
        reason: "Local decision",
        recordId: tenantA.availabilityRecordId,
        role: "admin" as const,
      };
      expect(await decline(command, port)).toMatchObject({ ok: true });
      await database.availabilityRecord.update({
        data: { approval_status: "submitted" },
        where: { id: tenantA.availabilityRecordId },
      });
      expect(
        await withdrawSubmission(
          { ...command, actingOrgRole: "org:admin" },
          port
        )
      ).toMatchObject({ ok: true });
      expect(port.approveLeaveApplication).not.toHaveBeenCalled();
      expect(port.declineLeaveApplication).not.toHaveBeenCalled();
      expect(port.withdrawLeaveApplication).not.toHaveBeenCalled();
      expect(port.resolveEmployeeId).not.toHaveBeenCalled();
      expect(
        await database.availabilityRecord.findUnique({
          where: { id: tenantA.availabilityRecordId },
        })
      ).toMatchObject({
        approval_status: "withdrawn",
        xero_write_claimed_at: null,
      });
    }
  );
  it.each([
    ["approve", "outcome_unknown"],
    ["decline", "outcome_unknown"],
    ["withdraw", "outcome_unknown"],
    ["approve", "definitive_failure"],
    ["decline", "definitive_failure"],
    ["withdraw", "definitive_failure"],
  ] as const)(
    "persists %s failure certainty %s and permits disconnect only for definitive failure",
    async (action, certainty) => {
      await database.person.update({
        data: { clerk_user_id: null },
        where: { id: tenantA.xeroPersonId },
      });
      await database.availabilityRecord.update({
        data: {
          approval_status: action === "withdraw" ? "approved" : "submitted",
          source_type:
            action === "withdraw" ? "team_calendar_leave" : "xero_leave",
        },
        where: { id: tenantA.availabilityRecordId },
      });
      const { approve, decline } = await import("@repo/availability");
      const { withdrawSubmission } = await import("@repo/availability");
      const port = providerPort(certainty);
      const command = {
        actingPersonId: null,
        actingUserId: "admin_1",
        clerkOrgId: tenantA.clerkOrgId,
        organisationId: tenantA.organisationId,
        reason: "Provider decision",
        recordId: tenantA.availabilityRecordId,
        role: "admin" as const,
      };
      const mutations = {
        approve: () => approve(command, port),
        decline: () => decline(command, port),
        withdraw: () =>
          withdrawSubmission({ ...command, actingOrgRole: "org:admin" }, port),
      };
      const failed = await mutations[action]();
      expect(failed).toMatchObject({ ok: true });
      expect(
        await database.availabilityRecord.findUnique({
          where: { id: tenantA.availabilityRecordId },
        })
      ).toMatchObject({
        approval_status:
          action === "withdraw" && certainty === "definitive_failure"
            ? "approved"
            : "xero_sync_failed",
        failed_action: action,
        xero_write_claimed_at: null,
        xero_write_error_raw: { certainty },
      });
      expect(await disconnect()).toMatchObject({
        ok: certainty === "definitive_failure",
      });
      if (certainty === "outcome_unknown") {
        expect(fetch).not.toHaveBeenCalled();
        await expectConnectionActive(tenantA);
      }
    }
  );

  it("rejects a same-grant same-link reconnect that commits during token resolution", async () => {
    await database.xeroAuthorisation.update({
      data: { access_token_expires_at: new Date(0) },
      where: { id: tenantA.authorisationId },
    });
    const provider = vi.fn(async (url: string | URL | Request) => {
      if (String(url).includes("connect/token")) {
        await database.xeroConnection.update({
          data: { last_connected_at: new Date() },
          where: { id: tenantA.connectionId },
        });
        return Response.json({
          access_token: "rotated-token",
          expires_in: 1800,
          refresh_token: "rotated-refresh",
        });
      }
      return new Response(null, { status: 204 });
    });
    vi.stubGlobal("fetch", provider);
    expect(await disconnect()).toMatchObject({
      error: { code: "connection_changed" },
      ok: false,
    });
    expect(
      provider.mock.calls.some(([url]) =>
        String(url).includes(`/connections/${tenantA.remoteId}`)
      )
    ).toBe(false);
    expect(
      await database.xeroConnection.findUnique({
        where: { id: tenantA.connectionId },
      })
    ).toMatchObject({
      remote_connection_id: tenantA.remoteId,
      status: "active",
    });
  });
  it("rolls back local teardown after an audit failure and succeeds on an owned 404 retry", async () => {
    const functionName = `disconnect_audit_${tenantA.connectionId.replaceAll("-", "")}`;
    const provider = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", provider);
    await database.$executeRawUnsafe(
      `CREATE FUNCTION ${functionName}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.clerk_org_id = '${tenantA.clerkOrgId}' AND NEW.action LIKE 'xero.connection_disconnected_%' THEN RAISE EXCEPTION 'owned disconnect audit failure'; END IF; RETURN NEW; END $$`
    );
    await database.$executeRawUnsafe(
      `CREATE TRIGGER ${functionName} BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION ${functionName}()`
    );
    try {
      expect(await disconnect(true)).toMatchObject({ ok: false });
      expect(provider).toHaveBeenCalledTimes(1);
      await expectConnectionActive(tenantA);
      await expectTenantDataPresent(tenantA);
      expect(
        await database.auditEvent.count({
          where: { clerk_org_id: tenantA.clerkOrgId },
        })
      ).toBe(0);
    } finally {
      await database.$executeRawUnsafe(
        `DROP TRIGGER IF EXISTS ${functionName} ON audit_events`
      );
      await database.$executeRawUnsafe(
        `DROP FUNCTION IF EXISTS ${functionName}()`
      );
    }
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 404 }))
    );
    expect(await disconnect(true)).toMatchObject({ ok: true });
    await expectConnectionDisconnected(tenantA, "admin_1");
    await expectTargetTenantDestroyed(tenantA);
  });
  it("rejects a foreign payroll organisation and malformed target before DELETE", async () => {
    const provider = vi.fn();
    vi.stubGlobal("fetch", provider);
    for (const target of [
      {
        connectionId: tenantA.connectionId,
        organisationId: tenantB.organisationId,
      },
      { connectionId: "invalid", organisationId: tenantA.organisationId },
    ]) {
      expect(
        await disconnectXeroOAuthConnection({
          clerkOrgId: tenantA.clerkOrgId,
          ...target,
          destructive: false,
        })
      ).toMatchObject({ ok: false });
    }
    expect(provider).not.toHaveBeenCalled();
    await expectConnectionActive(tenantA);
  });

  it("allows teardown after an abandoned record claim has expired without an uncertain operation", async () => {
    await database.availabilityRecord.update({
      data: { xero_write_claimed_at: new Date(Date.now() - 10 * 60 * 1000) },
      where: { id: tenantA.availabilityRecordId },
    });
    expect(await disconnect()).toMatchObject({ ok: true });
    await expectConnectionDisconnected(tenantA, "admin_1");
  });

  it("purges imported leave without removing manual entries from the same person's feed", async () => {
    const scope = {
      clerk_org_id: tenantA.clerkOrgId,
      organisation_id: tenantA.organisationId,
    };
    await database.feed.create({
      data: {
        ...scope,
        id: tenantA.feedId,
        name: "Fixture",
        scopes: { create: { ...scope, scope_type: "org" } },
        slug: "fixture",
      },
    });
    const record = await database.availabilityRecord.findUniqueOrThrow({
      where: { id: tenantA.availabilityRecordId },
    });
    await database.availabilityRecord.update({
      data: {
        ends_at: new Date(Date.now() + 172_800_000),
        starts_at: new Date(Date.now() + 86_400_000),
      },
      where: { id: record.id },
    });
    await database.availabilityRecord.create({
      data: {
        ...scope,
        all_day: true,
        approval_status: "approved",
        contactability: "unavailable",
        derived_uid_key: `manual-${tenantA.clerkOrgId}`,
        ends_at: new Date(Date.now() + 172_800_000),
        id: tenantA.manualRecordId,
        person_id: tenantA.xeroPersonId,
        privacy_mode: "named",
        publish_status: "eligible",
        record_type: "wfh",
        source_type: "manual",
        starts_at: new Date(Date.now() + 86_400_000),
        title: "Manual WFH",
      },
    });
    const { establishFeedRepresentation } = await import("@repo/feeds");
    const feedScope = {
      clerkOrgId: tenantA.clerkOrgId,
      feedId: tenantA.feedId,
      organisationId: tenantA.organisationId,
    };
    const before = await establishFeedRepresentation(feedScope);
    expect(
      before.ok && before.value.events.map((event) => event.sourceRecordId)
    ).toEqual(
      expect.arrayContaining([
        tenantA.availabilityRecordId,
        tenantA.manualRecordId,
      ])
    );
    expect(await disconnect(true)).toMatchObject({ ok: true });
    const after = await establishFeedRepresentation(feedScope);
    expect(
      after.ok && after.value.events.map((event) => event.sourceRecordId)
    ).toEqual([tenantA.manualRecordId]);
    expect(
      await database.feed.findUnique({ where: { id: tenantA.feedId } })
    ).toMatchObject({ status: "active" });
    expect(
      await database.availabilityRecord.findUnique({
        where: { id: tenantA.manualRecordId },
      })
    ).toMatchObject({
      archived_at: null,
      person_id: tenantA.xeroPersonId,
      publish_status: "eligible",
    });
  });
  it("retains credentials still referenced by another payroll connection", async () => {
    await database.xeroConnection.update({
      data: { xero_authorisation_id: tenantA.authorisationId },
      where: { id: tenantB.connectionId },
    });
    expect(await disconnect()).toMatchObject({ ok: true });
    expect(
      await database.xeroAuthorisation.findUnique({
        where: { id: tenantA.authorisationId },
      })
    ).not.toBeNull();
    expect(
      await database.xeroConnection.findUnique({
        where: { id: tenantB.connectionId },
      })
    ).toMatchObject({
      status: "active",
      xero_authorisation_id: tenantA.authorisationId,
    });
  });
  it.each(["live", "expired", "completed"] as const)(
    "protects only a real live selecting OAuth session (%s)",
    async (kind) => {
      await database.xeroOAuthSession.create({
        data: {
          clerk_org_id: tenantA.clerkOrgId,
          expires_at: new Date(
            Date.now() + (kind === "expired" ? -10_000 : 60_000)
          ),
          id: tenantA.sessionId,
          organisation_id: tenantA.organisationId,
          return_to: "/settings",
          status: kind === "completed" ? "completed" : "selecting",
          xero_authorisation_id: tenantA.authorisationId,
        },
      });
      expect(await disconnect()).toMatchObject({ ok: true });
      const grant = await database.xeroAuthorisation.findUnique({
        where: { id: tenantA.authorisationId },
      });
      if (kind === "live") {
        expect(grant).not.toBeNull();
      } else {
        expect(grant).toBeNull();
        expect(
          await database.xeroOAuthSession.findUnique({
            where: { id: tenantA.sessionId },
          })
        ).toMatchObject({ xero_authorisation_id: null });
      }
    }
  );
  it.each([401, 429, 500, 503])(
    "preserves local state and credentials after provider status %i",
    async (status) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(
          async () =>
            new Response(null, { headers: { "Retry-After": "3600" }, status })
        )
      );
      expect(await disconnect()).toMatchObject({ ok: false });
      await expectConnectionActive(tenantA);
      await expectTenantDataPresent(tenantA);
      expect(
        await database.auditEvent.count({
          where: { clerk_org_id: tenantA.clerkOrgId },
        })
      ).toBe(0);
    }
  );

  it("does not let a write claim waiting on disconnect start after teardown", async () => {
    let entered!: () => void;
    let resume!: () => void;
    const deleting = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const released = new Promise<void>((resolve) => {
      resume = resolve;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        entered();
        await released;
        return new Response(null, { status: 204 });
      })
    );
    const stopping = disconnect();
    await deleting;
    const { acquireXeroWriteClaim } = await import("@repo/availability");
    const claiming = acquireXeroWriteClaim({
      clerkOrgId: tenantA.clerkOrgId,
      expectedSequence: 0,
      expectedStatus: "approved",
      organisationId: tenantA.organisationId,
      recordId: tenantA.availabilityRecordId,
    });
    resume();
    expect(await stopping).toMatchObject({ ok: true });
    expect(await claiming).toBeNull();
    expect(
      (
        await database.availabilityRecord.findUniqueOrThrow({
          where: { id: tenantA.availabilityRecordId },
        })
      ).xero_write_claimed_at
    ).toBeNull();
  });

  it("does not prepare a payroll operation after a competing disconnect commits", async () => {
    await database.availabilityRecord.update({
      data: { approval_status: "submitted", source_remote_id: null },
      where: { id: tenantA.availabilityRecordId },
    });
    let entered!: () => void;
    let resume!: () => void;
    const deleting = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const released = new Promise<void>((resolve) => {
      resume = resolve;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        entered();
        await released;
        return new Response(null, { status: 204 });
      })
    );
    const stopping = disconnect();
    await deleting;
    const { prepareAndClaimSubmitOperation } = await import("@repo/database");
    const preparing = prepareAndClaimSubmitOperation({
      action: "approve",
      actorUserId: "admin_1",
      availabilityRecordId: tenantA.availabilityRecordId,
      claimableBefore: new Date(0),
      clerkOrgId: tenantA.clerkOrgId,
      expectedFailedAction: null,
      expectedSequence: 0,
      expectedStatus: "submitted",
      organisationId: tenantA.organisationId,
      request: {
        body: "[]",
        method: "POST",
        url: "https://api.xero.com/payroll.xro/1.0/LeaveApplications",
        xeroTenantId: `xero-${tenantA.clerkOrgId}`,
      },
      requestEmployeeId: "employee",
      requestEndsAt: new Date(),
      requestFingerprint: "race",
      requestLeaveTypeId: "annual",
      requestStartsAt: new Date(),
      requestTitle: "Leave",
      requestUnits: 0,
    });
    resume();
    expect(await stopping).toMatchObject({ ok: true });
    expect(await preparing).toBeNull();
    expect(
      await database.outboundOperation.count({
        where: { clerk_org_id: tenantA.clerkOrgId },
      })
    ).toBe(0);
  });
  it("prunes unused canonical credentials and records the disconnect atomically", async () => {
    expect(await disconnect()).toMatchObject({ ok: true });
    expect(
      await database.xeroAuthorisation.findUnique({
        where: { id: tenantA.authorisationId },
      })
    ).toBeNull();
    expect(
      await database.auditEvent.findFirst({
        where: {
          action: "xero.connection_disconnected_soft",
          clerk_org_id: tenantA.clerkOrgId,
          organisation_id: tenantA.organisationId,
        },
      })
    ).toMatchObject({
      actor_user_id: "admin_1",
      resource_id: tenantA.connectionId,
    });
  });
  it.each(["prepared", "outcome_unknown", "provider_accepted"] as const)(
    "blocks teardown for a %s payroll operation before DELETE",
    async (status) => {
      await database.outboundOperation.create({
        data: {
          action: "approve",
          actor_user_id: "admin_1",
          availability_record_id: tenantA.availabilityRecordId,
          clerk_org_id: tenantA.clerkOrgId,
          organisation_id: tenantA.organisationId,
          request_fingerprint: "owned-operation",
          status,
        },
      });
      expect(await disconnect()).toMatchObject({
        error: { code: "write_in_progress" },
        ok: false,
      });
      expect(fetch).not.toHaveBeenCalled();
      await expectConnectionActive(tenantA);
      await expectTenantDataPresent(tenantA);
    }
  );
  it("blocks teardown for an active record write claim", async () => {
    await database.availabilityRecord.update({
      data: { xero_write_claimed_at: new Date() },
      where: { id: tenantA.availabilityRecordId },
    });
    expect(await disconnect()).toMatchObject({
      error: { code: "write_in_progress" },
      ok: false,
    });
    expect(fetch).not.toHaveBeenCalled();
    await expectConnectionActive(tenantA);
  });

  it("deletes the exact remote connection and retains target payroll data on ordinary disconnect", async () => {
    const provider = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", provider);
    expect(await disconnect()).toEqual({
      ok: true,
      value: { connectionId: tenantA.connectionId, state: "disconnected" },
    });
    expect(provider).toHaveBeenCalledTimes(1);
    expect(provider.mock.calls[0]?.[0]).toBe(
      `https://api.xero.com/connections/${tenantA.remoteId}`
    );
    expect(provider.mock.calls[0]?.[1]).toMatchObject({ method: "DELETE" });
    expect(
      new Headers(provider.mock.calls[0]?.[1].headers).get("xero-tenant-id")
    ).toBeNull();
    expect(
      new Headers(provider.mock.calls[0]?.[1].headers).get("Authorization")
    ).toBe("Bearer access-token");
    await expectConnectionDisconnected(tenantA, "admin_1");
    await expectConnectionActive(tenantB);
    await expectTenantDataPresent(tenantA, true);
    await expectTenantDataPresent(tenantB);
  });
  it("destructive disconnect clears only target-scoped Xero source data", async () => {
    expect(await disconnect(true)).toEqual({
      ok: true,
      value: { connectionId: tenantA.connectionId, state: "disconnected" },
    });
    await expectConnectionDisconnected(tenantA, "admin_1");
    await expectTargetTenantDestroyed(tenantA);
    await expectConnectionActive(tenantB);
    await expectTenantDataPresent(tenantB);
  });
  it("does not tear down local state when remote DELETE is refused", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 403 }))
    );
    expect(await disconnect()).toMatchObject({ ok: false });
    await expectConnectionActive(tenantA);
    await expectTenantDataPresent(tenantA);
    await expectConnectionActive(tenantB);
  });
  it("does not tear down local state after a dropped remote response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network down"))
    );
    expect(await disconnect()).toMatchObject({ ok: false });
    await expectConnectionActive(tenantA);
    await expectTenantDataPresent(tenantA);
  });
  it("rejects a foreign Clerk account before provider DELETE", async () => {
    const provider = vi.fn();
    vi.stubGlobal("fetch", provider);
    expect(
      await disconnectXeroOAuthConnection({
        clerkOrgId: tenantB.clerkOrgId,
        connectionId: tenantA.connectionId,
        destructive: false,
        organisationId: tenantA.organisationId,
      })
    ).toMatchObject({ ok: false });
    expect(provider).not.toHaveBeenCalled();
    await expectConnectionActive(tenantA);
  });
  it("accepts remote 404 as confirmed absence", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 404 }))
    );
    expect(await disconnect()).toMatchObject({ ok: true });
    await expectConnectionDisconnected(tenantA, "admin_1");
    await expectConnectionActive(tenantB);
  });
});
async function createTenantFixture(tenant: typeof tenantA) {
  await database.organisation.create({
    data: {
      clerk_org_id: tenant.clerkOrgId,
      country_code: "AU",
      id: tenant.organisationId,
      name: `Disconnect fixture ${tenant.clerkOrgId}`,
    },
  });
  const a = encryptXeroToken("access-token"),
    r = encryptXeroToken("refresh-token");
  await database.xeroAuthorisation.create({
    data: {
      access_token_auth_tag: a.authTag,
      access_token_encrypted: a.encrypted,
      access_token_expires_at: new Date(Date.now() + 1_800_000),
      access_token_iv: a.iv,
      granted_scopes: ["payroll.employees"],
      id: tenant.authorisationId,
      last_refreshed_at: new Date(),
      provider_app_id: process.env.XERO_CLIENT_ID ?? "test-xero-client-id",
      refresh_token_auth_tag: r.authTag,
      refresh_token_encrypted: r.encrypted,
      refresh_token_iv: r.iv,
      token_encrypted_at: a.encryptedAt,
      token_key_version: a.keyVersion,
      xero_user_id: tenant.authorisationId,
    },
  });
  await database.xeroConnection.create({
    data: {
      clerk_org_id: tenant.clerkOrgId,
      id: tenant.connectionId,
      organisation_id: tenant.organisationId,
      payroll_region: "AU",
      remote_connection_id: tenant.remoteId,
      status: "active",
      tenant_name: "Payroll",
      xero_authorisation_id: tenant.authorisationId,
      xero_tenant_id: `xero-${tenant.clerkOrgId}`,
    },
  });
  await database.person.createMany({
    data: [
      {
        clerk_org_id: tenant.clerkOrgId,
        clerk_user_id: `user_${tenant.clerkOrgId}`,
        email: `${tenant.clerkOrgId}.xero@example.com`,
        employment_type: "employee",
        first_name: "Xero",
        id: tenant.xeroPersonId,
        is_active: true,
        last_name: "Person",
        organisation_id: tenant.organisationId,
        source_person_key: `employee-${tenant.clerkOrgId}`,
        source_system: "XERO",
        xero_employee_id: `employee-${tenant.clerkOrgId}`,
      },
      {
        clerk_org_id: tenant.clerkOrgId,
        email: `${tenant.clerkOrgId}.candidate@example.com`,
        employment_type: "employee",
        first_name: "Candidate",
        id: tenant.candidatePersonId,
        is_active: true,
        last_name: "Person",
        organisation_id: tenant.organisationId,
        source_person_key: null,
        source_system: "MANUAL",
        xero_employee_id: null,
      },
    ],
  });
  await database.leaveBalance.create({
    data: {
      balance: 76,
      balance_unit: "hours",
      clerk_org_id: tenant.clerkOrgId,
      id: tenant.leaveBalanceId,
      leave_type_name: "Annual Leave",
      leave_type_xero_id: `annual-${tenant.clerkOrgId}`,
      organisation_id: tenant.organisationId,
      person_id: tenant.xeroPersonId,
      record_type: "annual_leave",
      xero_connection_id: tenant.connectionId,
    },
  });
  await database.xeroPersonMatch.create({
    data: {
      candidate_person_id: tenant.candidatePersonId,
      clerk_org_id: tenant.clerkOrgId,
      detected_reason: "email_match",
      id: tenant.matchId,
      organisation_id: tenant.organisationId,
      status: "pending",
      xero_person_id: tenant.xeroPersonId,
    },
  });
  await database.availabilityRecord.create({
    data: {
      all_day: true,
      approval_status: "approved",
      clerk_org_id: tenant.clerkOrgId,
      contactability: "unavailable",
      derived_uid_key: `uid-${tenant.clerkOrgId}`,
      ends_at: new Date("2026-06-05T00:00:00.000Z"),
      id: tenant.availabilityRecordId,
      organisation_id: tenant.organisationId,
      person_id: tenant.xeroPersonId,
      privacy_mode: "named",
      publish_status: "eligible",
      record_type: "annual_leave",
      source_remote_id: `leave-${tenant.clerkOrgId}`,
      source_type: "xero_leave",
      starts_at: new Date("2026-06-04T00:00:00.000Z"),
      title: "Annual leave",
    },
  });
  await database.syncRun.create({
    data: {
      clerk_org_id: tenant.clerkOrgId,
      id: tenant.syncRunId,
      organisation_id: tenant.organisationId,
      run_type: "leave_records",
      started_at: new Date("2026-06-01T00:00:00.000Z"),
      status: "succeeded",
      trigger_type: "manual",
      xero_connection_id: tenant.connectionId,
    },
  });
  await database.xeroSyncCursor.create({
    data: {
      clerk_org_id: tenant.clerkOrgId,
      entity_type: "leave_records",
      id: tenant.cursorId,
      modified_since: new Date(),
      organisation_id: tenant.organisationId,
      xero_connection_id: tenant.connectionId,
    },
  });
}

async function expectConnectionDisconnected(
  tenant: typeof tenantA,
  disconnectedByUserId: string
) {
  const connection = await database.xeroConnection.findUniqueOrThrow({
    where: { id: tenant.connectionId },
  });

  expect(connection).toMatchObject({
    disconnected_by_user_id: disconnectedByUserId,
    remote_connection_id: null,
    status: "disconnected",
    xero_authorisation_id: null,
  });
  expect(connection.disconnected_at).toBeInstanceOf(Date);
}

async function expectConnectionActive(tenant: typeof tenantA) {
  const connection = await database.xeroConnection.findUniqueOrThrow({
    where: { id: tenant.connectionId },
  });

  expect(connection.status).toBe("active");
  expect(connection.xero_authorisation_id).toBe(tenant.authorisationId);
  const grant = await database.xeroAuthorisation.findUniqueOrThrow({
    where: { id: tenant.authorisationId },
  });
  expect(
    decryptXeroToken({
      authTag: grant.access_token_auth_tag,
      encrypted: grant.access_token_encrypted,
      iv: grant.access_token_iv,
      keyVersion: grant.token_key_version,
    })
  ).toBe("access-token");
  expect(connection.disconnected_at).toBeNull();
}

async function expectTenantDataPresent(
  tenant: typeof tenantA,
  disconnected = false
) {
  await expect(
    database.leaveBalance.count({
      where: { clerk_org_id: tenant.clerkOrgId },
    })
  ).resolves.toBe(1);
  await expect(
    database.xeroPersonMatch.count({
      where: { clerk_org_id: tenant.clerkOrgId },
    })
  ).resolves.toBe(1);
  await expect(
    database.syncRun.count({
      where: { clerk_org_id: tenant.clerkOrgId },
    })
  ).resolves.toBe(1);
  await expect(
    database.xeroSyncCursor.count({
      where: { clerk_org_id: tenant.clerkOrgId },
    })
  ).resolves.toBe(disconnected ? 0 : 1);

  const person = await database.person.findUniqueOrThrow({
    where: { id: tenant.xeroPersonId },
  });
  expect(person.archived_at).toBeNull();
  expect(person.clerk_user_id).toBe(`user_${tenant.clerkOrgId}`);
  expect(person.xero_employee_id).toBe(`employee-${tenant.clerkOrgId}`);

  const record = await database.availabilityRecord.findUniqueOrThrow({
    where: { id: tenant.availabilityRecordId },
  });
  expect(record.archived_at).toBeNull();
  expect(record.publish_status).toBe("eligible");
}

async function expectTargetTenantDestroyed(tenant: typeof tenantA) {
  await expect(
    database.leaveBalance.count({
      where: { clerk_org_id: tenant.clerkOrgId },
    })
  ).resolves.toBe(0);
  await expect(
    database.xeroPersonMatch.count({
      where: { clerk_org_id: tenant.clerkOrgId },
    })
  ).resolves.toBe(0);
  await expect(
    database.syncRun.count({
      where: { clerk_org_id: tenant.clerkOrgId },
    })
  ).resolves.toBe(0);
  await expect(
    database.xeroSyncCursor.count({
      where: { clerk_org_id: tenant.clerkOrgId },
    })
  ).resolves.toBe(0);

  const person = await database.person.findUniqueOrThrow({
    where: { id: tenant.xeroPersonId },
  });
  expect(person.archived_at).toBeInstanceOf(Date);
  expect(person.clerk_user_id).toBeNull();
  expect(person.xero_employee_id).toBeNull();

  const record = await database.availabilityRecord.findUniqueOrThrow({
    where: { id: tenant.availabilityRecordId },
  });
  expect(record.archived_at).toBeInstanceOf(Date);
  expect(record.publish_status).toBe("archived");
}
