import { randomUUID } from "node:crypto";
import { afterAll, expect, test } from "vitest";
import { allocateLiveTestFixture } from "./src/live-test-fixture";
import { resolveAccountCompanies } from "./src/queries/account-companies";
import {
  claimXeroTenant,
  isXeroTenantBindingConflict,
} from "./src/queries/xero-ownership";
import { systemDatabase } from "./src/system-client";
import {
  withTenantDb,
  withTenantDb as withTestTenantDb,
} from "./src/tenant-db";
import { tenantTestAccount } from "./src/test-fixtures/tenant-scope";
import { lockActiveScopedXeroConnection } from "./src/xero-locks";

const fixture = allocateLiveTestFixture(
  "packages/database/xero-ownership.integration.test.ts"
);
const accounts: string[] = [];
let companyIndex = 0;
const createCompany = async (account?: string) => {
  const tenant = fixture.tenants[companyIndex];
  companyIndex += 1;
  if (!tenant) {
    throw new Error("Fixture tenant slot is not allocated");
  }
  const accountId = account ?? tenant.accountId;
  if (!fixture.tenants.some((owned) => owned.accountId === accountId)) {
    throw new Error("Fixture account is not allocated");
  }
  if (!accounts.includes(accountId)) {
    accounts.push(accountId);
  }
  const company = await systemDatabase.organisation.create({
    data: {
      account_id: accountId,
      country_code: "AU",
      id: tenant.organisationId,
      name: "Payroll",
    },
  });
  return { accountId, organisationId: company.id };
};
afterAll(async () => {
  await systemDatabase.xeroConnection.deleteMany({
    where: { account_id: { in: accounts } },
  });
  await systemDatabase.organisation.deleteMany({
    where: { account_id: { in: accounts } },
  });
});

const claimAndInsert = (
  scope: { accountId: string; organisationId: string },
  tenantId: string,
  remoteId?: string
) =>
  withTenantDb(
    scope.accountId,
    async (tx) => {
      const ownership = await claimXeroTenant(tx, scope, tenantId);
      if (ownership.status === "unowned") {
        await tx.xeroConnection.create({
          data: {
            account_id: scope.accountId,
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

const errorField = (value: unknown, key: string): unknown =>
  typeof value === "object" && value !== null
    ? Reflect.get(value, key)
    : undefined;

const bindingFailureDiagnostic = (failure: unknown): string => {
  const meta = errorField(failure, "meta");
  const adapter = errorField(meta, "driverAdapterError");
  const cause = errorField(adapter, "cause");
  const originalMessage = errorField(cause, "originalMessage");
  const ownershipIndexes = [
    "xero_connections_owned_tenant_key",
    "xero_connections_owned_remote_connection_key",
  ].filter(
    (index) =>
      typeof originalMessage === "string" && originalMessage.includes(index)
  );
  return JSON.stringify({
    code: errorField(failure, "code"),
    constraint: errorField(cause, "constraint"),
    kind: errorField(cause, "kind"),
    modelName: errorField(meta, "modelName"),
    originalCode: errorField(cause, "originalCode"),
    ownershipIndexes,
    target: errorField(meta, "target"),
  });
};

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
  const released = await createCompany(manual.accountId);
  const archived = await createCompany(manual.accountId);
  const inactive = await createCompany(manual.accountId);
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
    (
      await withTestTenantDb(tenantTestAccount(manual.accountId), (db) =>
        resolveAccountCompanies(manual.accountId, db)
      )
    ).map((company) => company.id)
  ).toEqual([manual.organisationId]);
});

test("partial unique-index violations map to the neutral tenant binding conflict", async () => {
  const first = await createCompany();
  const second = await createCompany();
  const tenantId = randomUUID();
  await claimAndInsert(first, tenantId);
  const failure = await withTenantDb(second.accountId, (tx) =>
    tx.xeroConnection.create({
      data: {
        account_id: second.accountId,
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
  expect(
    isXeroTenantBindingConflict(failure),
    bindingFailureDiagnostic(failure)
  ).toBe(true);
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
      id: fixture.id("ownership-authorisation"),
      last_refreshed_at: new Date(),
      provider_app_id: fixture.globalKey("provider_app"),
      refresh_token_auth_tag: "fixture",
      refresh_token_encrypted: "fixture",
      refresh_token_iv: "fixture",
      token_encrypted_at: new Date(),
      token_key_version: 1,
      xero_user_id: fixture.id("ownership-user"),
    },
  });
  try {
    await systemDatabase.xeroConnection.update({
      data: { xero_authorisation_id: grant.id },
      where: { organisation_id: scope.organisationId },
    });
    expect(
      await withTenantDb(scope.accountId, (tx) =>
        lockActiveScopedXeroConnection(scope, tx)
      )
    ).toBe(true);
    await systemDatabase.xeroConnection.update({
      data: { released_at: new Date() },
      where: { organisation_id: scope.organisationId },
    });
    expect(
      await withTenantDb(scope.accountId, (tx) =>
        lockActiveScopedXeroConnection(scope, tx)
      )
    ).toBe(false);
  } finally {
    await systemDatabase.xeroAuthorisation.delete({ where: { id: grant.id } });
  }
});
