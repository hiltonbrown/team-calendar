// biome-ignore-all lint/style/useFilenamingConvention: Co-located integration test convention.
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
const clerk = vi.hoisted(() => ({ auth: vi.fn(), currentUser: vi.fn() }));
const providerIdentity = vi.hoisted(() => ({ verify: vi.fn() }));
vi.mock(
  "@repo/auth/node_modules/@clerk/nextjs/dist/esm/server/index.js",
  async (importOriginal) => ({
    ...(await importOriginal<typeof import("@repo/auth/server")>()),
    auth: clerk.auth,
    currentUser: clerk.currentUser,
  })
);
vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(new Headers()),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@repo/xero/src/oauth/identity", () => ({
  verifyXeroAccessTokenIdentity: providerIdentity.verify,
}));
vi.mock("@repo/xero/src/rate-limit/shared-store", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@repo/xero/src/rate-limit/shared-store")
  >()),
  getSharedXeroRateStore: () => ({
    observe: () => Promise.resolve(),
    release: () => Promise.resolve(),
    reserve: ({ reservationId }: { reservationId: string }) =>
      Promise.resolve({ ok: true, value: { reservationId } }),
  }),
}));

const allocation = allocateLiveTestFixture(
  "apps/app/app/(authenticated)/settings/integrations/xero/shared-connection.integration.test.ts"
);
function tenancy(index: number) {
  const owned = allocation.tenants[index];
  if (!owned) {
    throw new Error("Missing owned shared-connection tenancy");
  }
  return owned;
}
const tenancyA = tenancy(0),
  tenancyB = tenancy(1);
const scopes = {
  clerk_org_id: { in: allocation.tenants.map((owned) => owned.clerkOrgId) },
};
const adminA = allocation.key("admin-a"),
  adminB = allocation.key("admin-b"),
  memberA = allocation.key("member-a"),
  userB = allocation.key("user-b");
const xeroX = allocation.globalKey("authorisation", 0),
  xeroY = allocation.globalKey("authorisation", 1);
const tenantX = allocation.id("xero-tenant", 0),
  tenantY = allocation.id("xero-tenant", 1);
const remoteX = allocation.id("remote", 0);
const remoteY = allocation.id("remote", 1);
let selectedTenant = tenantX;
let selectedRemote = remoteX;
const originalEnv = { ...process.env };
let database: typeof import("@repo/database")["database"];
let actions: typeof import("./_actions");
let xero: typeof import("@repo/xero");
let crypto: typeof import("@repo/xero/src/crypto/tokens");
let readContext: typeof import("@/lib/server/get-active-org-context")["getActiveOrgContext"];
const removedMembers = new Set<string>();
let activeActor = adminA;
let activeClerkOrg = tenancyA.clerkOrgId;
let activeRole = "org:admin";
let authoriser = xeroX;
let accessToken = "access-x";
let refreshToken = "refresh-x";
let rotationCount = 0;
let provider: ReturnType<typeof vi.fn<typeof fetch>>;

function authenticate(
  actor = adminA,
  org = tenancyA.clerkOrgId,
  role = "org:admin"
) {
  activeActor = actor;
  activeClerkOrg = org;
  activeRole = role;
}
function currentIdentity() {
  return Promise.resolve({
    ok: true,
    value: {
      authEventId: null,
      expiresAt: new Date(Date.now() + 1_800_000),
      grantedScopes: xero.XERO_SCOPES.split(" "),
      xeroUserId: authoriser,
    },
  });
}
async function cleanup() {
  if (!database) {
    return;
  }
  await database.auditEvent.deleteMany({ where: scopes });
  await database.xeroOAuthSession.deleteMany({ where: scopes });
  await database.xeroSyncCursor.deleteMany({ where: scopes });
  await database.xeroConnection.deleteMany({ where: scopes });
  await database.person.deleteMany({ where: scopes });
  await database.organisation.deleteMany({ where: scopes });
  await database.xeroAuthorisation.deleteMany({
    where: { provider_app_id: allocation.globalKey("provider_app") },
  });
}
beforeAll(async () => {
  process.env.XERO_CLIENT_ID = allocation.globalKey("provider_app");
  process.env.XERO_CLIENT_SECRET = "shared-connection-fixture-secret";
  process.env.XERO_REDIRECT_URI =
    "http://localhost:3002/api/xero/oauth/callback";
  process.env.NEXT_PUBLIC_API_URL = "http://localhost:3002";
  process.env.XERO_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 11).toString(
    "base64"
  );
  process.env.XERO_TOKEN_ENCRYPTION_ACTIVE_VERSION = "1";
  delete process.env.XERO_TOKEN_ENCRYPTION_KEYS_JSON;
  delete process.env.VERCEL_ENV;
  ({ database } = await import("@repo/database"));
  xero = await import("@repo/xero");
  crypto = await import("@repo/xero/src/crypto/tokens");
  actions = await import("./_actions");
  ({ getActiveOrgContext: readContext } = await import(
    "@/lib/server/get-active-org-context"
  ));
});
beforeEach(async () => {
  await cleanup();
  vi.clearAllMocks();
  authenticate();
  removedMembers.clear();
  authoriser = xeroX;
  accessToken = "access-x";
  refreshToken = "refresh-x";
  rotationCount = 0;
  selectedTenant = tenantX;
  selectedRemote = remoteX;
  clerk.auth.mockImplementation(() => {
    const roleSnapshot = activeRole;
    if (removedMembers.has(activeActor)) {
      return Promise.resolve({
        has: () => false,
        isAuthenticated: true,
        orgId: null,
        orgRole: null,
        userId: activeActor,
      });
    }
    return Promise.resolve({
      has: ({ role }: { role: string }) => role === roleSnapshot,
      isAuthenticated: true,
      orgId: activeClerkOrg,
      orgRole: activeRole,
      userId: activeActor,
    });
  });
  clerk.currentUser.mockImplementation(() =>
    Promise.resolve({
      emailAddresses: [{ emailAddress: `${activeActor}@example.test` }],
      firstName: "Fixture",
      id: activeActor,
      lastName: "User",
    })
  );
  providerIdentity.verify.mockImplementation(currentIdentity);
  await database.organisation.createMany({
    data: [tenancyA, tenancyB].map((owned, index) => ({
      clerk_org_id: owned.clerkOrgId,
      country_code: "AU",
      id: owned.organisationId,
      name: index === 0 ? "Shared Org A" : "Foreign Org B",
    })),
  });
  await database.person.createMany({
    data: [adminA, adminB, memberA, userB].map((actor, index) => ({
      clerk_org_id: index === 3 ? tenancyB.clerkOrgId : tenancyA.clerkOrgId,
      clerk_user_id: actor,
      email: `${actor}@example.test`,
      employment_type: "employee",
      first_name: "Fixture",
      id: allocation.id("person", index),
      last_name: "Person",
      organisation_id:
        index === 3 ? tenancyB.organisationId : tenancyA.organisationId,
      source_system: "MANUAL",
    })),
  });
  provider = vi.fn<typeof fetch>((url, init) => {
    const endpoint = String(url);
    if (endpoint.includes("/connect/token")) {
      const body = new URLSearchParams(init?.body as URLSearchParams);
      if (body.get("grant_type") === "refresh_token") {
        rotationCount += 1;
        expect(body.get("refresh_token")).toBe(refreshToken);
        accessToken = `rotated-access-${rotationCount}`;
        refreshToken = `rotated-refresh-${rotationCount}`;
      }
      return Promise.resolve(
        Response.json({
          access_token: accessToken,
          expires_in: 1800,
          refresh_token: refreshToken,
          scope: xero.XERO_SCOPES,
        })
      );
    }
    const requestHeaders = new Headers(init?.headers);
    const requestTenant = requestHeaders.get("Xero-Tenant-Id");
    expect(requestHeaders.get("Authorization")).toBe(
      requestTenant === tenantX && selectedTenant === tenantY
        ? "Bearer access-x"
        : `Bearer ${accessToken}`
    );
    if (init?.method === "DELETE") {
      expect(endpoint).toBe(
        `https://api.xero.com/connections/${selectedRemote}`
      );
      return Promise.resolve(new Response(null, { status: 204 }));
    }
    if (endpoint.endsWith("/connections")) {
      return Promise.resolve(
        Response.json([
          {
            id: selectedRemote,
            tenantId: selectedTenant,
            tenantName: "Shared Xero payroll",
            tenantType: "ORGANISATION",
          },
        ])
      );
    }
    expect([tenantX, tenantY]).toContain(requestTenant);
    if (endpoint.endsWith("/Organisation")) {
      return Promise.resolve(
        Response.json({ Organisations: [{ CountryCode: "AU" }] })
      );
    }
    if (endpoint.includes("/Employees")) {
      return Promise.resolve(
        Response.json({
          Employees: [
            {
              EmployeeID: allocation.id("employee"),
              FirstName: "Shared",
              LastName: "Payroll",
            },
          ],
        })
      );
    }
    throw new Error("Unexpected shared-connection provider request");
  });
  vi.stubGlobal("fetch", provider);
});
afterEach(() => vi.unstubAllGlobals());
afterAll(async () => {
  await cleanup();
  if (database) {
    await database.$disconnect();
  }
  process.env = { ...originalEnv };
});

async function connect(actor = adminA, principal = xeroX, owned = tenancyA) {
  authenticate(actor, owned.clerkOrgId);
  selectedTenant = owned === tenancyA ? tenantX : tenantY;
  selectedRemote = owned === tenancyA ? remoteX : remoteY;
  authoriser = principal;
  accessToken = principal === xeroX ? "access-x" : "access-y";
  refreshToken = principal === xeroX ? "refresh-x" : "refresh-y";
  const action = await actions.connectXeroAction({
    organisationId: owned.organisationId,
  });
  if (!action.ok) {
    throw new Error("Expected admin connect action");
  }
  const startRequest = new URL(action.value.redirectUrl);
  expect(startRequest.searchParams.get("clerkOrgId")).toBe(owned.clerkOrgId);
  const started = await xero.buildXeroOAuthStartUrl({
    clerkOrgId: startRequest.searchParams.get("clerkOrgId") ?? "",
    organisationId: startRequest.searchParams.get("organisationId"),
    returnTo: startRequest.searchParams.get("returnTo") ?? undefined,
    userId: actor,
  });
  if (!started.ok) {
    throw new Error(`Expected scope-bound OAuth start: ${started.error.code}`);
  }
  const callback = {
    authenticatedClerkOrgId: owned.clerkOrgId,
    authenticatedUserId: actor,
    code: "fixture-code",
    nonce: started.value.nonce,
    state: new URL(started.value.redirectUrl).searchParams.get("state") ?? "",
  };
  const callsBeforeCallback = provider.mock.calls.length;
  expect(
    await xero.completeXeroOAuth({ ...callback, authenticatedUserId: memberA })
  ).toMatchObject({ error: { code: "invalid_state" }, ok: false });
  expect(
    await xero.completeXeroOAuth({
      ...callback,
      authenticatedClerkOrgId:
        owned === tenancyA ? tenancyB.clerkOrgId : tenancyA.clerkOrgId,
    })
  ).toMatchObject({ error: { code: "invalid_state" }, ok: false });
  expect(provider.mock.calls).toHaveLength(callsBeforeCallback);
  const connected = await xero.completeXeroOAuth(callback);
  if (!(connected.ok && connected.value.connected)) {
    throw new Error(
      `Expected automatic shared connection: ${JSON.stringify(connected)}`
    );
  }
  return { callback, connectionId: connected.value.connected.connectionId };
}
async function readAs(
  actor: string,
  organisationId = tenancyA.organisationId,
  clerkOrgId = tenancyA.clerkOrgId
) {
  authenticate(
    actor,
    clerkOrgId,
    actor === memberA || actor === userB ? "org:member" : "org:admin"
  );
  const context = await readContext(organisationId);
  if (!context.ok) {
    return context;
  }
  const scope = { ...context.value, capability: "payroll.employees.read" };
  const access = await xero.resolveXeroAccess(scope);
  if (!access.ok) {
    return access;
  }
  return xero.fetchEmployeesForRegion("AU", {
    xeroConnection: xero.toResolvedXeroConnection(scope, access.value),
  });
}
function savedConnection() {
  return database.xeroConnection.findFirstOrThrow({
    where: {
      clerk_org_id: tenancyA.clerkOrgId,
      organisation_id: tenancyA.organisationId,
    },
  });
}
async function savedGrant() {
  const connection = await savedConnection();
  return database.xeroAuthorisation.findUniqueOrThrow({
    where: { id: connection.xero_authorisation_id ?? "" },
  });
}

describe("shared Organisation Xero authorisation across Clerk members", () => {
  it("connects through the real admin action and OAuth lifecycle, stores encrypted canonical credentials and shares actual payroll reads", async () => {
    const connected = await connect();
    const connection = await savedConnection(),
      grant = await savedGrant();
    expect(connection).toMatchObject({
      id: connected.connectionId,
      organisation_id: tenancyA.organisationId,
      xero_authorisation_id: grant.id,
      xero_tenant_id: tenantX,
    });
    expect(grant).toMatchObject({
      provider_app_id: allocation.globalKey("provider_app"),
      xero_user_id: xeroX,
    });
    expect(grant.access_token_encrypted).not.toBe(accessToken);
    expect(grant.refresh_token_encrypted).not.toBe(refreshToken);
    expect(
      crypto.decryptXeroToken({
        authTag: grant.access_token_auth_tag,
        encrypted: grant.access_token_encrypted,
        iv: grant.access_token_iv,
        keyVersion: grant.token_key_version,
      })
    ).toBe(accessToken);
    const people = await database.person.findMany({ where: scopes });
    expect(people).toHaveLength(4);
    expect(await database.organisation.count({ where: scopes })).toBe(2);
    for (const actor of [adminA, adminB, memberA]) {
      expect(await readAs(actor)).toMatchObject({
        ok: true,
        value: {
          complete: true,
          employees: [{ employeeId: allocation.id("employee") }],
        },
      });
    }
    expect(
      await database.xeroAuthorisation.count({
        where: { provider_app_id: allocation.globalKey("provider_app") },
      })
    ).toBe(1);
    expect(
      await database.xeroOAuthSession.count({
        where: { ...scopes, created_by_user_id: { in: [memberA, adminB] } },
      })
    ).toBe(0);
    provider.mockClear();
    expect(await xero.completeXeroOAuth(connected.callback)).toMatchObject({
      error: { code: "invalid_state" },
      ok: false,
    });
    expect(provider).not.toHaveBeenCalled();
  });

  it("denies a member initiating OAuth or disconnecting at the real action permission boundary", async () => {
    authenticate(memberA, tenancyA.clerkOrgId, "org:member");
    expect(
      await actions.connectXeroAction({
        organisationId: tenancyA.organisationId,
      })
    ).toMatchObject({ error: { code: "not_authorised" }, ok: false });
    expect(await database.xeroOAuthSession.count({ where: scopes })).toBe(0);
    expect(provider).not.toHaveBeenCalled();
    const connected = await connect();
    provider.mockClear();
    authenticate(memberA, tenancyA.clerkOrgId, "org:member");
    expect(
      await actions.disconnectXeroAction({
        confirmationText: "Shared Org A",
        connectionId: connected.connectionId,
        mode: "soft",
        organisationId: tenancyA.organisationId,
      })
    ).toMatchObject({ error: { code: "not_authorised" }, ok: false });
    expect(provider).not.toHaveBeenCalled();
    expect((await savedConnection()).status).toBe("active");
  });

  it("allows a different admin to reconnect and change Xero authoriser without depending on the original Person", async () => {
    const original = await connect();
    const firstGrant = await savedGrant();
    removedMembers.add(adminA);
    await database.person.deleteMany({
      where: { clerk_org_id: tenancyA.clerkOrgId, clerk_user_id: adminA },
    });
    expect(await readAs(adminA)).toMatchObject({ ok: false });
    expect(await savedConnection()).toMatchObject({
      clerk_org_id: tenancyA.clerkOrgId,
      id: original.connectionId,
      organisation_id: tenancyA.organisationId,
      status: "active",
      xero_authorisation_id: firstGrant.id,
    });
    expect(await readAs(memberA)).toMatchObject({ ok: true });
    expect((await connect(adminB)).connectionId).toBe(original.connectionId);
    expect((await savedGrant()).id).toBe(firstGrant.id);
    expect((await connect(adminB, xeroY)).connectionId).toBe(
      original.connectionId
    );
    const replacement = await savedGrant();
    expect(replacement.id).not.toBe(firstGrant.id);
    expect(replacement.xero_user_id).toBe(xeroY);
    expect(await savedConnection()).toMatchObject({
      clerk_org_id: tenancyA.clerkOrgId,
      id: original.connectionId,
      organisation_id: tenancyA.organisationId,
      status: "active",
      xero_tenant_id: tenantX,
    });
    expect(await readAs(memberA)).toMatchObject({ ok: true });
    expect(await database.xeroConnection.count({ where: scopes })).toBe(1);
    await xero.purgeClosedXeroOAuthSessions();
    expect(
      await database.xeroAuthorisation.count({
        where: { provider_app_id: allocation.globalKey("provider_app") },
      })
    ).toBe(1);
  });

  it("rejects foreign tenancy, Organisation, connection and provider tenant substitutions before an HTTP dispatch", async () => {
    const connected = await connect();
    provider.mockClear();
    authenticate(userB, tenancyB.clerkOrgId);
    expect(
      await actions.connectXeroAction({
        organisationId: tenancyA.organisationId,
      })
    ).toMatchObject({ ok: false });
    expect(
      await readAs(userB, tenancyA.organisationId, tenancyB.clerkOrgId)
    ).toMatchObject({ ok: false });
    expect(
      await xero.resolveXeroAccess({
        clerkOrgId: tenancyB.clerkOrgId,
        connectionId: connected.connectionId,
        organisationId: tenancyB.organisationId,
      })
    ).toMatchObject({ ok: false });
    expect(
      await xero.resolveXeroAccess({
        clerkOrgId: tenancyA.clerkOrgId,
        connectionId: connected.connectionId,
        organisationId: tenancyB.organisationId,
      })
    ).toMatchObject({ ok: false });
    expect(
      await xero.buildXeroOAuthStartUrl({
        clerkOrgId: tenancyA.clerkOrgId,
        organisationId: tenancyB.organisationId,
        userId: adminB,
      })
    ).toMatchObject({ ok: false });
    const scope = {
      capability: "payroll.employees.read",
      clerkOrgId: tenancyA.clerkOrgId,
      organisationId: tenancyA.organisationId,
    };
    const access = await xero.resolveXeroAccess(scope);
    if (!access.ok) {
      throw new Error("Expected own canonical access");
    }
    const context = xero.toResolvedXeroConnection(scope, access.value);
    expect(
      await xero.fetchEmployeesForRegion("AU", {
        xeroConnection: { ...context, xero_tenant_id: tenantY },
      })
    ).toMatchObject({ ok: false });
    expect(provider).not.toHaveBeenCalled();
    await database.xeroOAuthSession.create({
      data: {
        available_tenants_json: {
          tenants: [
            { connectionId: remoteX, tenantId: tenantX, tenantName: "Payroll" },
          ],
        },
        clerk_org_id: tenancyA.clerkOrgId,
        created_by_user_id: adminB,
        expires_at: new Date(Date.now() + 600_000),
        id: allocation.id("forgery-session"),
        organisation_id: tenancyA.organisationId,
        return_to: "/settings/integrations/xero",
        status: "selecting",
        xero_authorisation_id: access.value.providerConnection?.authorisationId,
      },
    });
    expect(
      await xero.completeXeroTenantSelection({
        clerkOrgId: tenancyA.clerkOrgId,
        organisationId: tenancyA.organisationId,
        sessionId: allocation.id("forgery-session"),
        tenantId: tenantY,
        userId: adminB,
      })
    ).toMatchObject({ error: { code: "tenant_not_found" }, ok: false });
    expect(provider).not.toHaveBeenCalled();
    expect(await database.xeroConnection.count({ where: scopes })).toBe(1);
  });

  it("cannot borrow another connected Organisation's credentials even when its connection and tenant IDs are known", async () => {
    await connect();
    const foreign = await connect(userB, xeroY, tenancyB);
    const foreignConnection = await database.xeroConnection.findFirstOrThrow({
      where: {
        clerk_org_id: tenancyB.clerkOrgId,
        organisation_id: tenancyB.organisationId,
      },
    });
    const foreignGrant = await database.xeroAuthorisation.findUniqueOrThrow({
      where: { id: foreignConnection.xero_authorisation_id ?? "" },
    });
    expect(foreignConnection).toMatchObject({
      id: foreign.connectionId,
      status: "active",
      xero_tenant_id: tenantY,
    });
    expect(foreignGrant.xero_user_id).toBe(xeroY);
    expect(
      await readAs(userB, tenancyB.organisationId, tenancyB.clerkOrgId)
    ).toMatchObject({ ok: true });
    provider.mockClear();
    expect(
      await xero.resolveXeroAccess({
        clerkOrgId: tenancyA.clerkOrgId,
        connectionId: foreign.connectionId,
        organisationId: tenancyA.organisationId,
      })
    ).toMatchObject({ ok: false });
    expect(await readAs(memberA, tenancyB.organisationId)).toMatchObject({
      ok: false,
    });
    expect(provider).not.toHaveBeenCalled();
    expect(await readAs(memberA)).toMatchObject({ ok: true });
    const [, request] = provider.mock.calls.at(-1) ?? [];
    expect(new Headers(request?.headers).get("Authorization")).toBe(
      "Bearer access-x"
    );
    expect(new Headers(request?.headers).get("Xero-Tenant-Id")).toBe(tenantX);
    expect(await database.xeroConnection.count({ where: scopes })).toBe(2);
    expect(
      await database.xeroAuthorisation.count({
        where: { provider_app_id: allocation.globalKey("provider_app") },
      })
    ).toBe(2);
  });

  it("serialises concurrent member reads into one canonical rotation and dispatches every read with the new bearer", async () => {
    await connect();
    const grant = await savedGrant();
    await database.xeroAuthorisation.update({
      data: { access_token_expires_at: new Date(Date.now() - 60_000) },
      where: { id: grant.id },
    });
    provider.mockClear();
    let releaseRefresh: () => void = () => {
      throw new Error("Refresh barrier not initialised");
    };
    let markRefreshEntered: () => void = () => {
      throw new Error("Refresh barrier not initialised");
    };
    const refreshEntered = new Promise<void>((resolve) => {
      markRefreshEntered = resolve;
    });
    const refreshReleased = new Promise<void>((resolve) => {
      releaseRefresh = resolve;
    });
    const respond = provider.getMockImplementation();
    if (!respond) {
      throw new Error("Missing provider fixture");
    }
    provider.mockImplementation(async (url, init) => {
      if (String(url).includes("/connect/token")) {
        markRefreshEntered();
        await refreshReleased;
      }
      return respond(url, init);
    });
    let settled = false;
    const reads = Promise.all(
      [adminA, adminB, memberA].map((actor) => readAs(actor))
    ).finally(() => {
      settled = true;
    });
    try {
      await refreshEntered;
      await new Promise<void>((resolve) => setTimeout(resolve, 100));
      expect(settled).toBe(false);
      expect(
        provider.mock.calls.filter(([url]) =>
          String(url).includes("/connect/token")
        )
      ).toHaveLength(1);
      expect(
        provider.mock.calls.filter(([url]) =>
          String(url).includes("/Employees")
        )
      ).toHaveLength(0);
    } finally {
      releaseRefresh();
    }
    const results = await reads;
    expect(results.every((result) => result.ok)).toBe(true);
    expect(rotationCount).toBe(1);
    const payrollCalls = provider.mock.calls.filter(([url]) =>
      String(url).includes("/Employees")
    );
    expect(payrollCalls).toHaveLength(3);
    for (const [, init] of payrollCalls) {
      expect(new Headers(init?.headers).get("Authorization")).toBe(
        "Bearer rotated-access-1"
      );
    }
    const updated = await savedGrant();
    expect(updated.id).toBe(grant.id);
    expect(
      await database.xeroAuthorisation.count({
        where: { provider_app_id: allocation.globalKey("provider_app") },
      })
    ).toBe(1);
    expect(
      crypto.decryptXeroToken({
        authTag: updated.refresh_token_auth_tag,
        encrypted: updated.refresh_token_encrypted,
        iv: updated.refresh_token_iv,
        keyVersion: updated.token_key_version,
      })
    ).toBe("rotated-refresh-1");
    expect(updated.access_token_expires_at.getTime()).toBeGreaterThan(
      Date.now()
    );
  });

  it.each(["org:admin", "org:owner"])(
    "lets %s disconnect the shared link, denies disconnected access and reconnects without duplicate rows",
    async (role) => {
      const connected = await connect();
      authenticate(adminB, tenancyA.clerkOrgId, role);
      expect(
        await actions.disconnectXeroAction({
          confirmationText: "Shared Org A",
          connectionId: connected.connectionId,
          mode: "soft",
          organisationId: tenancyA.organisationId,
        })
      ).toMatchObject({ ok: true, value: { disconnected: true } });
      expect(await savedConnection()).toMatchObject({
        remote_connection_id: null,
        status: "disconnected",
        xero_authorisation_id: null,
      });
      provider.mockClear();
      expect(await readAs(memberA)).toMatchObject({ ok: false });
      expect(provider).not.toHaveBeenCalled();
      expect((await connect(adminB)).connectionId).toBe(connected.connectionId);
      expect(await readAs(memberA)).toMatchObject({ ok: true });
      expect(await database.xeroConnection.count({ where: scopes })).toBe(1);
      expect(await database.organisation.count({ where: scopes })).toBe(2);
    }
  );
});
