import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, test } from "vitest";
import { xeroSimplificationFixture } from "./src/test-fixtures/xero-simplification-fixture";

const { database } = xeroSimplificationFixture();
afterAll(() => database.$disconnect());

describe("simplified Xero persistence", () => {
  test("has exactly four lifecycle models", async () => {
    const rows = await database.$queryRaw<Array<{ tablename: string }>>`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public'
      AND tablename IN ('xero_authorisations', 'xero_connections', 'xero_oauth_sessions',
      'xero_sync_cursors', 'xero_credential_owners', 'xero_refresh_attempts',
      'xero_provider_connections', 'xero_tenants', 'xero_cleanup_requests',
      'xero_cleanup_attempts', 'xero_inactivity_classifications') ORDER BY tablename`;
    expect(rows.map((row) => row.tablename)).toEqual([
      "xero_authorisations",
      "xero_connections",
      "xero_oauth_sessions",
      "xero_sync_cursors",
    ]);
  });

  test("stores one grant for two scoped connections", async () => {
    await database
      .$transaction(async (tx) => {
        const grantId = randomUUID();
        const app = randomUUID();
        await tx.$executeRaw`INSERT INTO xero_authorisations
        (id, provider_app_id, xero_user_id, access_token_encrypted, access_token_iv,
        access_token_auth_tag, refresh_token_encrypted, refresh_token_iv, refresh_token_auth_tag,
        token_key_version, token_encrypted_at, access_token_expires_at, granted_scopes,
        last_refreshed_at, updated_at)
        VALUES (${grantId}::uuid, ${app}, 'verified-user', 'cipher', 'iv', 'tag', 'cipher',
        'iv', 'tag', 1, now(), now() + interval '30 minutes', ARRAY['payroll.employees'], now(), now())`;
        for (let i = 0; i < 2; i += 1) {
          const organisationId = randomUUID();
          const clerkOrgId = randomUUID();
          await tx.organisation.create({
            data: {
              clerk_org_id: clerkOrgId,
              country_code: "AU",
              id: organisationId,
              name: "Owned test payroll",
            },
          });
          await tx.$executeRaw`INSERT INTO xero_connections (id, clerk_org_id, organisation_id,
          xero_authorisation_id, xero_tenant_id, remote_connection_id, payroll_region, updated_at)
          VALUES (${randomUUID()}::uuid, ${clerkOrgId}, ${organisationId}::uuid,
          ${grantId}::uuid, ${randomUUID()}, ${randomUUID()}, 'AU', now())`;
        }
        const rows = await tx.$queryRaw<
          Array<{ count: bigint }>
        >`SELECT count(*) AS count
        FROM xero_connections WHERE xero_authorisation_id = ${grantId}::uuid`;
        expect(Number(rows[0]?.count)).toBe(2);
        // Roll back every owned row, including successful assertions.
        throw new Error("fixture rollback");
      })
      .catch((error: unknown) => {
        if (!(error instanceof Error) || error.message !== "fixture rollback") {
          throw error;
        }
      });
  });
});
