import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/client";
import {
  allocateLiveTestFixture,
  type LiveFixtureSuite,
  type LiveTestFixture,
} from "../live-test-fixture";

export function xeroSimplificationFixture(suite: LiveFixtureSuite) {
  const fixture = allocateLiveTestFixture(suite);
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("Xero simplification tests require DATABASE_URL");
  }
  const database = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });
  return { database, fixture };
}

export async function createXeroAuthorisationFixture(
  tx: import("../../generated/client").Prisma.TransactionClient,
  fixture: LiveTestFixture,
  index = 0
) {
  return await tx.xeroAuthorisation.create({
    data: {
      access_token_auth_tag: "tag",
      access_token_encrypted: "ciphertext",
      access_token_expires_at: new Date(Date.now() + 3_600_000),
      access_token_iv: "iv",
      granted_scopes: ["payroll.employees"],
      id: fixture.id("xero-authorisation", index),
      last_refreshed_at: new Date(),
      provider_app_id: fixture.globalKey("provider_app"),
      refresh_token_auth_tag: "tag",
      refresh_token_encrypted: "ciphertext",
      refresh_token_iv: "iv",
      token_encrypted_at: new Date(),
      token_key_version: 1,
      xero_user_id: fixture.id("xero-user", index),
    },
  });
}
export async function createXeroConnectionFixture(
  tx: import("../../generated/client").Prisma.TransactionClient,
  fixture: LiveTestFixture,
  index = 0
) {
  const tenant = fixture.tenants[index];
  if (!tenant) {
    throw new Error("Fixture tenant slot is not allocated");
  }
  const organisation = await tx.organisation.create({
    data: {
      account_id: tenant.accountId,
      country_code: "AU",
      id: tenant.organisationId,
      name: "Owned test payroll",
    },
  });
  const authorisation = await createXeroAuthorisationFixture(
    tx,
    fixture,
    index
  );
  const connection = await tx.xeroConnection.create({
    data: {
      account_id: organisation.account_id,
      id: fixture.id("xero-connection", index),
      organisation_id: organisation.id,
      payroll_region: "AU",
      remote_connection_id: fixture.id("xero-remote-connection", index),
      xero_authorisation_id: authorisation.id,
      xero_tenant_id: fixture.id("xero-tenant", index),
    },
  });
  return { authorisation, connection, organisation };
}
