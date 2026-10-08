import { Pool } from "pg";
import { z } from "zod";
import { assertLiveDatabaseAuthority } from "../database-guard.js";
import { releaseEnvironment } from "./environment.js";
import { redirectObserverDiagnostics } from "./observer-output.js";
import {
  assertDisconnectDemoTarget,
  parseDisconnectFixture,
} from "./xero-disconnect-fixture.js";

redirectObserverDiagnostics();
const mode = z.enum(["before", "after"]).parse(process.argv[2]);
const environment = releaseEnvironment();
const fixture = parseDisconnectFixture(
  JSON.parse(process.env.TC_E2E_XERO_DISCONNECT_FIXTURE_JSON ?? "null"),
  {
    foreignOrganisationId: environment.fixtures.organisations.foreign,
    ownedClerkOrgIds: environment.manifest.owned.clerkOrgIds,
    ownedOrganisationIds: environment.manifest.owned.organisationIds,
    primaryOrganisationId: environment.fixtures.organisations.primary,
    providerAppId: process.env.XERO_CLIENT_ID ?? "",
    runId: environment.manifest.runId,
  }
);
const manifest = assertLiveDatabaseAuthority({
  acknowledgement: process.env.ALLOW_LIVE_DATABASE_TESTS,
  databaseUrl: process.env.DATABASE_URL,
  manifestPath: environment.manifestPath,
  runId: environment.manifest.runId,
});
if (
  process.env.TC_RELEASE_DURABLE_VERIFIED !== manifest.runId ||
  process.env.TC_RELEASE_ACTIVE_RUN_VERIFIED !== manifest.runId ||
  !process.env.KV_REST_API_URL ||
  !process.env.KV_REST_API_TOKEN ||
  !process.env.XERO_APP_TIER ||
  process.env.XERO_API_BASE_URL
) {
  throw new Error(
    "Disconnect observation requires protected ownership and actual shared provider access"
  );
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
try {
  const result = await pool.query<{
    organisation_id: string;
    status: string;
    xero_authorisation_id: string | null;
    remote_connection_id: string | null;
    xero_tenant_id: string;
    provider_app_id: string | null;
    history_count: string;
  }>(
    `SELECT xc.organisation_id, xc.status, xc.xero_authorisation_id,
            xc.remote_connection_id, xc.xero_tenant_id, xa.provider_app_id,
            (SELECT count(*)::text FROM availability_records ar
             WHERE ar.clerk_org_id = xc.clerk_org_id
               AND ar.organisation_id = xc.organisation_id
               AND ar.source_remote_id IS NOT NULL) AS history_count
     FROM xero_connections xc
     LEFT JOIN xero_authorisations xa ON xa.id = xc.xero_authorisation_id
     WHERE xc.clerk_org_id = $1 AND xc.organisation_id = ANY($2::uuid[])`,
    [
      fixture.clerkOrgId,
      [fixture.organisationId, fixture.siblingOrganisationId],
    ]
  );
  const target = result.rows.find(
    (row) => row.organisation_id === fixture.organisationId
  );
  const sibling = result.rows.find(
    (row) => row.organisation_id === fixture.siblingOrganisationId
  );
  if (
    (mode === "before" && target?.status !== "active") ||
    result.rows.length !== 2 ||
    !target ||
    !sibling ||
    target.xero_tenant_id !== fixture.xeroTenantId ||
    sibling.status !== "active" ||
    sibling.remote_connection_id !== fixture.siblingRemoteConnectionId ||
    !sibling.provider_app_id ||
    !sibling.xero_authorisation_id ||
    (target.status === "active" &&
      (target.remote_connection_id !== fixture.remoteConnectionId ||
        target.xero_authorisation_id !== sibling.xero_authorisation_id)) ||
    (target.status !== "active" && target.status !== "disconnected")
  ) {
    throw new Error(
      "Disconnect observation requires exact scoped target and shared-authorisation sibling"
    );
  }
  const [{ resolveXeroAccess }, { xeroFetch }, { keys }] = await Promise.all([
    import("../../../packages/xero/src/oauth/authorisation.js"),
    import("../../../packages/xero/src/rate-limit/xero-fetch.js"),
    import("../../../packages/xero/keys.js"),
  ]);
  if (
    keys().XERO_CLIENT_ID !== fixture.providerAppId ||
    sibling.provider_app_id !== fixture.providerAppId
  ) {
    throw new Error("Disconnect observer provider app is mismatched");
  }
  const deadline = { expiresAtMs: Date.now() + 30_000 };
  let demoVerifiedAt: string | null = null;
  if (mode === "before") {
    const targetAccess = await resolveXeroAccess({
      capability: "accounting.settings.read",
      clerkOrgId: fixture.clerkOrgId,
      deadline,
      organisationId: fixture.organisationId,
    });
    if (
      !targetAccess.ok ||
      targetAccess.value.xeroTenantId !== fixture.xeroTenantId ||
      targetAccess.value.providerConnection?.remoteConnectionId !==
        fixture.remoteConnectionId ||
      targetAccess.value.providerConnection?.authorisationId !==
        sibling.xero_authorisation_id
    ) {
      throw new Error(
        "Disconnect demo proof requires exact tenant access and accounting.settings.read"
      );
    }
    const demoResponse = await xeroFetch({
      deadline,
      init: {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${targetAccess.value.accessToken}`,
          "Xero-Tenant-Id": fixture.xeroTenantId,
        },
        method: "GET",
      },
      maxAttempts: 1,
      rateClass: {
        kind: "tenant",
        providerAppId: fixture.providerAppId,
        xeroTenantId: fixture.xeroTenantId,
      },
      url: "https://api.xero.com/api.xro/2.0/Organisation",
    });
    if (
      demoResponse.status !== 200 ||
      demoResponse.headers.has("link") ||
      demoResponse.headers.has("content-range")
    ) {
      throw new Error(
        "Disconnect provider demo proof is unavailable or incomplete"
      );
    }
    assertDisconnectDemoTarget(await demoResponse.json(), fixture.xeroTenantId);
    demoVerifiedAt = new Date().toISOString();
  }
  const access = await resolveXeroAccess({
    clerkOrgId: fixture.clerkOrgId,
    deadline,
    organisationId: fixture.siblingOrganisationId,
  });
  if (
    !access.ok ||
    access.value.xeroTenantId !== sibling.xero_tenant_id ||
    access.value.providerConnection?.remoteConnectionId !==
      fixture.siblingRemoteConnectionId ||
    access.value.providerConnection?.authorisationId !==
      sibling.xero_authorisation_id
  ) {
    throw new Error("Disconnect sibling provider access is unavailable");
  }
  const response = await xeroFetch({
    deadline,
    init: {
      headers: { Authorization: `Bearer ${access.value.accessToken}` },
      method: "GET",
    },
    maxAttempts: 1,
    rateClass: {
      kind: "user_inventory",
      providerAppId: sibling.provider_app_id,
    },
    url: "https://api.xero.com/connections",
  });
  if (
    response.status !== 200 ||
    response.headers.has("link") ||
    response.headers.has("content-range")
  ) {
    throw new Error("Disconnect observer provider inventory is incomplete");
  }
  const inventory = z
    .array(z.object({ id: z.uuid(), tenantId: z.uuid() }))
    .refine((rows) => new Set(rows.map((row) => row.id)).size === rows.length)
    .parse(await response.json());
  process.stdout.write(
    `${JSON.stringify({
      demoVerifiedAt,
      historyCount: z.coerce
        .number()
        .int()
        .nonnegative()
        .parse(target.history_count),
      siblingPresent: inventory.some(
        (row) =>
          row.id === fixture.siblingRemoteConnectionId &&
          row.tenantId === sibling.xero_tenant_id
      ),
      siblingStatus: sibling.status,
      targetPresent: inventory.some(
        (row) =>
          row.id === fixture.remoteConnectionId &&
          row.tenantId === fixture.xeroTenantId
      ),
      targetStatus: target.status,
    })}\n`
  );
} finally {
  await pool.end();
}
