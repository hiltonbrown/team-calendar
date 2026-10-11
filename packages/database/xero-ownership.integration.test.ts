import { randomUUID } from "node:crypto";
import { afterAll, expect, test } from "vitest";
import { isLocalDatabase } from "./src/is-local-database";
import { resolveAccountCompanies } from "./src/queries/account-companies";
import {
  claimXeroTenant,
  isXeroTenantBindingConflict,
} from "./src/queries/xero-ownership";
import { systemDatabase } from "./src/system-client";
import { tenantTransaction } from "./src/tenant-client";
import { lockActiveScopedXeroConnection } from "./src/xero-locks";

const ownerUrl = process.env.DATABASE_URL;
if (!(ownerUrl && isLocalDatabase(ownerUrl))) {
  throw new Error(
    "Multi-company database fixtures require disposable local PostgreSQL"
  );
}

const accounts: string[] = [];
const createCompany = async (account?: string) => {
  const clerkOrgId = account ?? `ownership-${randomUUID()}`;
  if (!accounts.includes(clerkOrgId)) {
    accounts.push(clerkOrgId);
  }
  const company = await systemDatabase.organisation.create({
    data: { clerk_org_id: clerkOrgId, country_code: "AU", name: "Payroll" },
  });
  return { clerkOrgId, organisationId: company.id };
};
afterAll(async () => {
  await systemDatabase.xeroConnection.deleteMany({
    where: { clerk_org_id: { in: accounts } },
  });
  await systemDatabase.organisation.deleteMany({
    where: { clerk_org_id: { in: accounts } },
  });
});

const claimAndInsert = (
  scope: { clerkOrgId: string; organisationId: string },
  tenantId: string,
  remoteId?: string
) =>
  tenantTransaction(
    scope.clerkOrgId,
    async (tx) => {
      const ownership = await claimXeroTenant(tx, scope, tenantId);
      if (ownership.status === "unowned") {
        await tx.xeroConnection.create({
          data: {
            clerk_org_id: scope.clerkOrgId,
            organisation_id: scope.organisationId,
            payroll_region: "AU",
            remote_connection_id: remoteId ?? randomUUID(),
            xero_tenant_id: tenantId,
          },
        });
      }
      return ownership;
    },
    { maxWait: 15_000, timeout: 15_000 }
  );

test("another account cannot claim an owned tenant and conflict reveals no metadata", async () => {
  const first = await createCompany();
  const second = await createCompany();
  const tenantId = randomUUID();
  expect(await claimAndInsert(first, tenantId)).toEqual({ status: "unowned" });
  expect(await claimAndInsert(second, tenantId)).toEqual({
    status: "owned_elsewhere",
  });
});

test("concurrent account claims hold the advisory lock through insertion and leave one owner", async () => {
  const first = await createCompany();
  const second = await createCompany();
  const tenantId = randomUUID();
  const results = await Promise.all([
    claimAndInsert(first, tenantId),
    claimAndInsert(second, tenantId),
  ]);
  expect(results.map((result) => result.status).sort()).toEqual([
    "owned_elsewhere",
    "unowned",
  ]);
  expect(
    await systemDatabase.xeroConnection.count({
      where: { released_at: null, xero_tenant_id: tenantId },
    })
  ).toBe(1);
});

test("released tenant and remote connection identities can be claimed elsewhere", async () => {
  const first = await createCompany();
  const second = await createCompany();
  const tenantId = randomUUID();
  const remoteId = randomUUID();
  await claimAndInsert(first, tenantId, remoteId);
  await systemDatabase.xeroConnection.updateMany({
    data: { released_at: new Date() },
    where: { xero_tenant_id: tenantId },
  });
  expect(await claimAndInsert(second, tenantId, remoteId)).toEqual({
    status: "unowned",
  });
  expect(
    await systemDatabase.xeroConnection.count({
      where: { xero_tenant_id: tenantId },
    })
  ).toBe(2);
});

test("account resolver keeps manual companies and excludes inactive, archived, released and foreign ones", async () => {
  const manual = await createCompany();
  const released = await createCompany(manual.clerkOrgId);
  const archived = await createCompany(manual.clerkOrgId);
  const inactive = await createCompany(manual.clerkOrgId);
  await createCompany();
  await claimAndInsert(released, randomUUID());
  await systemDatabase.xeroConnection.updateMany({
    data: { released_at: new Date() },
    where: { organisation_id: released.organisationId },
  });
  await systemDatabase.organisation.update({
    data: { archived_at: new Date() },
    where: { id: archived.organisationId },
  });
  await systemDatabase.organisation.update({
    data: { is_active: false },
    where: { id: inactive.organisationId },
  });
  expect(
    (await resolveAccountCompanies(manual.clerkOrgId)).map(
      (company) => company.id
    )
  ).toEqual([manual.organisationId]);
});

test("partial unique-index violations map to the neutral tenant binding conflict", async () => {
  const first = await createCompany();
  const second = await createCompany();
  const tenantId = randomUUID();
  await claimAndInsert(first, tenantId);
  const failure = await tenantTransaction(second.clerkOrgId, (tx) =>
    tx.xeroConnection.create({
      data: {
        clerk_org_id: second.clerkOrgId,
        organisation_id: second.organisationId,
        payroll_region: "AU",
        remote_connection_id: randomUUID(),
        xero_tenant_id: tenantId,
      },
    })
  ).then(
    () => null,
    (error: unknown) => error
  );
  expect(isXeroTenantBindingConflict(failure)).toBe(true);
});

test("released bindings cannot acquire the active outbound connection fence", async () => {
  const scope = await createCompany();
  await claimAndInsert(scope, randomUUID());
  const grant = await systemDatabase.xeroAuthorisation.create({
    data: {
      access_token_auth_tag: "fixture",
      access_token_encrypted: "fixture",
      access_token_expires_at: new Date(),
      access_token_iv: "fixture",
      granted_scopes: [],
      last_refreshed_at: new Date(),
      provider_app_id: randomUUID(),
      refresh_token_auth_tag: "fixture",
      refresh_token_encrypted: "fixture",
      refresh_token_iv: "fixture",
      token_encrypted_at: new Date(),
      token_key_version: 1,
      xero_user_id: randomUUID(),
    },
  });
  try {
    await systemDatabase.xeroConnection.update({
      data: { xero_authorisation_id: grant.id },
      where: { organisation_id: scope.organisationId },
    });
    expect(
      await tenantTransaction(scope.clerkOrgId, (tx) =>
        lockActiveScopedXeroConnection(tx, scope)
      )
    ).toBe(true);
    await systemDatabase.xeroConnection.update({
      data: { released_at: new Date() },
      where: { organisation_id: scope.organisationId },
    });
    expect(
      await tenantTransaction(scope.clerkOrgId, (tx) =>
        lockActiveScopedXeroConnection(tx, scope)
      )
    ).toBe(false);
  } finally {
    await systemDatabase.xeroAuthorisation.delete({ where: { id: grant.id } });
  }
});
