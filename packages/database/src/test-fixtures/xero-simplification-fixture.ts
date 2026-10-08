import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/client";
import { isLocalDatabase } from "../is-local-database";
import { assertTestDatabaseConnectionAllowed } from "../live-test-guard";

export function xeroSimplificationFixture() {
  assertTestDatabaseConnectionAllowed();
  const connectionString = process.env.DATABASE_URL;
  if (!(connectionString && isLocalDatabase(connectionString))) {
    throw new Error(
      "Xero simplification tests require disposable local PostgreSQL"
    );
  }
  const database = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });
  const clerkOrgId = `xero-schema-${randomUUID()}`;
  const organisationId = randomUUID();
  return { clerkOrgId, database, organisationId };
}

export async function createXeroAuthorisationFixture(
  tx: import("../../generated/client").Prisma.TransactionClient
) {
  return await tx.xeroAuthorisation.create({
    data: {
      access_token_auth_tag: "tag",
      access_token_encrypted: "ciphertext",
      access_token_expires_at: new Date(Date.now() + 3_600_000),
      access_token_iv: "iv",
      granted_scopes: ["payroll.employees"],
      last_refreshed_at: new Date(),
      provider_app_id: randomUUID(),
      refresh_token_auth_tag: "tag",
      refresh_token_encrypted: "ciphertext",
      refresh_token_iv: "iv",
      token_encrypted_at: new Date(),
      token_key_version: 1,
      xero_user_id: randomUUID(),
    },
  });
}
export async function createXeroConnectionFixture(
  tx: import("../../generated/client").Prisma.TransactionClient
) {
  const organisation = await tx.organisation.create({
    data: {
      clerk_org_id: `xero-fixture-${randomUUID()}`,
      country_code: "AU",
      name: "Owned test payroll",
    },
  });
  const authorisation = await createXeroAuthorisationFixture(tx);
  const connection = await tx.xeroConnection.create({
    data: {
      clerk_org_id: organisation.clerk_org_id,
      organisation_id: organisation.id,
      payroll_region: "AU",
      remote_connection_id: randomUUID(),
      xero_authorisation_id: authorisation.id,
      xero_tenant_id: randomUUID(),
    },
  });
  return { authorisation, connection, organisation };
}
