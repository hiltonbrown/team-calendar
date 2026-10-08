import { afterEach, beforeEach, expect, it, vi } from "vitest";

const originalInfo = console.info;
const originalDebug = console.debug;
const state = vi.hoisted(() => {
  const fixture = {
    clerkOrgId: "owned-account",
    deleteAcknowledgement: "I_ACKNOWLEDGE_XERO_DEMO_CONNECTION_DELETE",
    organisationId: "33333333-3333-4333-8333-333333333333",
    organisationName: "Disposable demo",
    providerAppId: "fixture-app",
    remoteConnectionId: "44444444-4444-4444-8444-444444444444",
    runId: "88888888-8888-4888-8888-888888888888",
    siblingOrganisationId: "11111111-1111-4111-8111-111111111111",
    siblingRemoteConnectionId: "55555555-5555-4555-8555-555555555555",
    xeroTenantId: "66666666-6666-4666-8666-666666666666",
  };
  return {
    access: vi.fn(),
    end: vi.fn(),
    fetch: vi.fn(),
    fixture,
    query: vi.fn(),
  };
});
vi.mock("pg", () => ({
  Pool: class {
    query = state.query;
    end = state.end;
  },
}));
vi.mock("./environment.js", () => ({
  releaseEnvironment: () => ({
    fixtures: {
      organisations: {
        foreign: "22222222-2222-4222-8222-222222222222",
        primary: state.fixture.siblingOrganisationId,
      },
    },
    manifest: {
      owned: {
        clerkOrgIds: [state.fixture.clerkOrgId],
        organisationIds: [
          state.fixture.organisationId,
          state.fixture.siblingOrganisationId,
        ],
      },
      runId: state.fixture.runId,
    },
    manifestPath: "unit-manifest",
  }),
}));
vi.mock("../database-guard.js", () => ({
  assertLiveDatabaseAuthority: () => ({ runId: state.fixture.runId }),
}));
vi.mock("../../../packages/xero/src/oauth/authorisation.js", () => ({
  resolveXeroAccess: state.access,
}));
vi.mock("../../../packages/xero/src/rate-limit/xero-fetch.js", () => ({
  xeroFetch: state.fetch,
}));
vi.mock("../../../packages/xero/keys.js", () => ({
  keys: () => ({ XERO_CLIENT_ID: state.fixture.providerAppId }),
}));

beforeEach(() => {
  vi.resetModules();
  state.access.mockReset();
  state.fetch.mockReset();
  state.query.mockReset();
  state.end.mockReset();
  vi.stubEnv(
    "TC_E2E_XERO_DISCONNECT_FIXTURE_JSON",
    JSON.stringify(state.fixture)
  );
  vi.stubEnv("XERO_CLIENT_ID", state.fixture.providerAppId);
  vi.stubEnv("TC_RELEASE_DURABLE_VERIFIED", state.fixture.runId);
  vi.stubEnv("TC_RELEASE_ACTIVE_RUN_VERIFIED", state.fixture.runId);
  vi.stubEnv("KV_REST_API_URL", "unit-only-no-network");
  vi.stubEnv("KV_REST_API_TOKEN", "unit-only-no-network");
  vi.stubEnv("XERO_APP_TIER", "starter");
  vi.stubEnv("XERO_API_BASE_URL", "");
  vi.stubEnv("DATABASE_URL", "unit-only-no-database");
  vi.spyOn(process, "argv", "get").mockReturnValue([
    "bun",
    "observer.ts",
    "before",
  ]);
  vi.spyOn(process.stdout, "write").mockReturnValue(true);
  state.query.mockResolvedValue({
    rows: [
      {
        history_count: "1",
        organisation_id: state.fixture.organisationId,
        provider_app_id: state.fixture.providerAppId,
        remote_connection_id: state.fixture.remoteConnectionId,
        status: "active",
        xero_authorisation_id: "same-grant",
        xero_tenant_id: state.fixture.xeroTenantId,
      },
      {
        history_count: "1",
        organisation_id: state.fixture.siblingOrganisationId,
        provider_app_id: state.fixture.providerAppId,
        remote_connection_id: state.fixture.siblingRemoteConnectionId,
        status: "active",
        xero_authorisation_id: "same-grant",
        xero_tenant_id: "77777777-7777-4777-8777-777777777777",
      },
    ],
  });
  state.access.mockResolvedValue({
    ok: true,
    value: {
      accessToken: "unit-only-token",
      providerConnection: {
        authorisationId: "same-grant",
        remoteConnectionId: state.fixture.remoteConnectionId,
      },
      xeroTenantId: state.fixture.xeroTenantId,
    },
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  console.info = originalInfo;
  console.debug = originalDebug;
});

it("refuses absent DELETE authority before database or provider access", async () => {
  const { deleteAcknowledgement: _, ...withoutAuthority } = state.fixture;
  vi.stubEnv(
    "TC_E2E_XERO_DISCONNECT_FIXTURE_JSON",
    JSON.stringify(withoutAuthority)
  );
  await expect(import("./xero-disconnect-observer-cli.js")).rejects.toThrow();
  expect(state.query).not.toHaveBeenCalled();
  expect(state.fetch).not.toHaveBeenCalled();
  expect(process.stdout.write).not.toHaveBeenCalled();
});

it("refuses a production company from the actual observer demo-check path", async () => {
  state.fetch.mockResolvedValue(
    new Response(
      JSON.stringify({
        Organisations: [
          {
            CountryCode: "AU",
            IsDemoCompany: false,
            OrganisationID: state.fixture.xeroTenantId,
          },
        ],
      }),
      { status: 200 }
    )
  );
  await expect(import("./xero-disconnect-observer-cli.js")).rejects.toThrow();
  expect(state.access).toHaveBeenCalledWith(
    expect.objectContaining({
      capability: "accounting.settings.read",
      clerkOrgId: state.fixture.clerkOrgId,
      organisationId: state.fixture.organisationId,
    })
  );
  expect(state.fetch).toHaveBeenCalledOnce();
  expect(state.fetch).toHaveBeenCalledWith(
    expect.objectContaining({
      init: expect.objectContaining({
        headers: expect.objectContaining({
          "Xero-Tenant-Id": state.fixture.xeroTenantId,
        }),
        method: "GET",
      }),
      rateClass: {
        kind: "tenant",
        providerAppId: state.fixture.providerAppId,
        xeroTenantId: state.fixture.xeroTenantId,
      },
      url: "https://api.xero.com/api.xro/2.0/Organisation",
    })
  );
  expect(process.stdout.write).not.toHaveBeenCalled();
  expect(state.end).toHaveBeenCalledOnce();
});

it("refuses a replaced remote connection captured by ordinary access", async () => {
  state.access.mockResolvedValue({
    ok: true,
    value: {
      accessToken: "unit-only-token",
      providerConnection: {
        authorisationId: "same-grant",
        remoteConnectionId: state.fixture.siblingRemoteConnectionId,
      },
      xeroTenantId: state.fixture.xeroTenantId,
    },
  });
  await expect(import("./xero-disconnect-observer-cli.js")).rejects.toThrow(
    "exact tenant access"
  );
  expect(state.fetch).not.toHaveBeenCalled();
  expect(process.stdout.write).not.toHaveBeenCalled();
});
