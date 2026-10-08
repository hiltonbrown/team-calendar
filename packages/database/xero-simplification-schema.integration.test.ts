import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, test } from "vitest";
import { xeroSimplificationFixture } from "./src/test-fixtures/xero-simplification-fixture";

const { database } = xeroSimplificationFixture();
afterAll(() => database.$disconnect());

describe("simplified Xero persistence", () => {
  test("has no obsolete tenant-binding trigger function", async () => {
    const functions = await database.$queryRaw<Array<{ proname: string }>>`
      SELECT proname FROM pg_proc JOIN pg_namespace ON pg_proc.pronamespace = pg_namespace.oid
      WHERE nspname = 'public' AND proname = 'prevent_xero_tenant_rebinding'`;
    expect(functions).toEqual([]);
  });
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

  test("persists write replay boundaries and whole-roster failure truth", async () => {
    const columns = await database.$queryRaw<
      Array<{ table_name: string; column_name: string }>
    >`
      SELECT table_name, column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND (
        (table_name = 'outbound_operations' AND column_name IN (
          'idempotency_key', 'request_xero_tenant_id', 'request_method', 'request_url',
          'request_body_json', 'request_reason', 'idempotency_first_dispatched_at', 'idempotency_replay_before'))
        OR (table_name = 'xero_connections' AND column_name IN (
          'balance_sweep_failed', 'leave_sweep_failed')))
      ORDER BY table_name, column_name`;
    expect(columns).toEqual([
      ...[
        "idempotency_first_dispatched_at",
        "idempotency_key",
        "idempotency_replay_before",
        "request_body_json",
        "request_method",
        "request_reason",
        "request_url",
        "request_xero_tenant_id",
      ].map((column_name) => ({
        column_name,
        table_name: "outbound_operations",
      })),
      ...["balance_sweep_failed", "leave_sweep_failed"].map((column_name) => ({
        column_name,
        table_name: "xero_connections",
      })),
    ]);
    const actions = await database.$queryRaw<Array<{ enumlabel: string }>>`
      SELECT enumlabel FROM pg_enum JOIN pg_type ON pg_enum.enumtypid = pg_type.oid
      WHERE typname = 'outbound_operation_action' ORDER BY enumlabel`;
    expect(actions.map((row) => row.enumlabel)).toEqual([
      "approve",
      "decline",
      "withdraw",
    ]);
  });

  test("does not retain the obsolete Person missing-confirmation column", async () => {
    const columns = await database.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'people'
        AND column_name = 'xero_missing_since'`;
    expect(columns).toEqual([]);
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
