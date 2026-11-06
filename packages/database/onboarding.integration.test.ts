import type { AccountId, OrganisationId } from "@repo/core";
import { afterAll, beforeEach, describe, expect, test, vi } from "vitest";
import { allocateLiveTestFixture } from "./src/live-test-fixture";
import { withTenantResult as withTestTenantResult } from "./src/tenant-db";
import { tenantTestAccount } from "./src/test-fixtures/tenant-scope";

vi.mock("server-only", () => ({}));
const fixture = allocateLiveTestFixture(
  "packages/database/onboarding.integration.test.ts"
);
const { systemDatabase: database } = await import("./index.js");
const {
  advanceOnboardingStep,
  completeOnboarding,
  completeWelcome,
  getOnboardingRecord,
  getWelcomeState,
  setXeroSetupSkipped,
} = await import("./src/queries/onboarding");

const tenantA = {
  accountId: fixture.tenants[0]?.accountId as AccountId,
  organisationId: fixture.tenants[0]?.organisationId as OrganisationId,
};
const tenantB = {
  accountId: fixture.tenants[1]?.accountId as AccountId,
  organisationId: fixture.tenants[1]?.organisationId as OrganisationId,
};
const accountIds = [tenantA.accountId, tenantB.accountId];

async function clean() {
  const scope = { account_id: { in: accountIds } };
  await database.person.deleteMany({ where: scope });
  await database.organisation.deleteMany({ where: scope });
}

async function seedTenant(tenant: typeof tenantA) {
  await database.organisation.create({
    data: {
      account_id: tenant.accountId,
      country_code: "AU",
      id: tenant.organisationId,
      name: `Onboarding ${tenant.accountId}`,
    },
  });
}

async function seedPerson(tenant: typeof tenantA, userId: string) {
  return await database.person.create({
    data: {
      account_id: tenant.accountId,
      email: `${userId}@example.test`,
      employment_type: "employee",
      first_name: "Test",
      last_name: "Person",
      organisation_id: tenant.organisationId,
      source_system: "MANUAL",
      user_id: userId,
    },
  });
}

describe("onboarding queries", () => {
  beforeEach(async () => {
    await clean();
    await seedTenant(tenantA);
    await seedTenant(tenantB);
  });

  afterAll(async () => {
    await clean();
    await database.$disconnect();
  });

  test("starts at details with no completion or skip", async () => {
    await expect(
      withTestTenantResult(tenantTestAccount(tenantA.accountId), (db) =>
        getOnboardingRecord(tenantA.accountId, tenantA.organisationId, db)
      )
    ).resolves.toEqual({
      ok: true,
      value: { completedAt: null, step: "details", xeroSkippedAt: null },
    });
  });

  test("advances only from the stored step", async () => {
    await expect(
      withTestTenantResult(tenantTestAccount(tenantA.accountId), (db) =>
        advanceOnboardingStep(
          tenantA.accountId,
          tenantA.organisationId,
          "details",
          "xero",
          db
        )
      )
    ).resolves.toEqual({ ok: true, value: { advanced: true } });
    await expect(
      withTestTenantResult(tenantTestAccount(tenantA.accountId), (db) =>
        advanceOnboardingStep(
          tenantA.accountId,
          tenantA.organisationId,
          "details",
          "xero",
          db
        )
      )
    ).resolves.toEqual({ ok: true, value: { advanced: false } });
    const record = await withTestTenantResult(
      tenantTestAccount(tenantA.accountId),
      (db) => getOnboardingRecord(tenantA.accountId, tenantA.organisationId, db)
    );
    expect(record.ok && record.value.step).toBe("xero");
  });

  test("keeps the first completion time", async () => {
    const first = await withTestTenantResult(
      tenantTestAccount(tenantA.accountId),
      (db) => completeOnboarding(tenantA.accountId, tenantA.organisationId, db)
    );
    const second = await withTestTenantResult(
      tenantTestAccount(tenantA.accountId),
      (db) => completeOnboarding(tenantA.accountId, tenantA.organisationId, db)
    );
    expect(first.ok && second.ok).toBe(true);
    expect(second.ok && second.value.completedAt).toEqual(
      first.ok && first.value.completedAt
    );
  });

  test("sets and clears the Xero skip", async () => {
    await withTestTenantResult(tenantTestAccount(tenantA.accountId), (db) =>
      setXeroSetupSkipped(tenantA.accountId, tenantA.organisationId, true, db)
    );
    let record = await withTestTenantResult(
      tenantTestAccount(tenantA.accountId),
      (db) => getOnboardingRecord(tenantA.accountId, tenantA.organisationId, db)
    );
    expect(record.ok && record.value.xeroSkippedAt).toBeInstanceOf(Date);
    await withTestTenantResult(tenantTestAccount(tenantA.accountId), (db) =>
      setXeroSetupSkipped(tenantA.accountId, tenantA.organisationId, false, db)
    );
    record = await withTestTenantResult(
      tenantTestAccount(tenantA.accountId),
      (db) => getOnboardingRecord(tenantA.accountId, tenantA.organisationId, db)
    );
    expect(record.ok && record.value.xeroSkippedAt).toBeNull();
  });

  test("isolates tenants", async () => {
    await withTestTenantResult(tenantTestAccount(tenantA.accountId), (db) =>
      advanceOnboardingStep(
        tenantA.accountId,
        tenantB.organisationId,
        "details",
        "xero",
        db
      )
    );
    await withTestTenantResult(tenantTestAccount(tenantA.accountId), (db) =>
      completeOnboarding(tenantA.accountId, tenantB.organisationId, db)
    );
    const other = await withTestTenantResult(
      tenantTestAccount(tenantB.accountId),
      (db) => getOnboardingRecord(tenantB.accountId, tenantB.organisationId, db)
    );
    expect(other).toEqual({
      ok: true,
      value: { completedAt: null, step: "details", xeroSkippedAt: null },
    });
    await expect(
      withTestTenantResult(tenantTestAccount(tenantA.accountId), (db) =>
        getOnboardingRecord(tenantA.accountId, tenantB.organisationId, db)
      )
    ).resolves.toMatchObject({ error: { code: "not_found" }, ok: false });
  });

  test("tracks the member welcome for the person's own user only", async () => {
    const person = await seedPerson(tenantA, "user_member");
    await expect(
      withTestTenantResult(tenantTestAccount(tenantA.accountId), (db) =>
        getWelcomeState(
          tenantA.accountId,
          tenantA.organisationId,
          "user_member",
          db
        )
      )
    ).resolves.toEqual({
      ok: true,
      value: { completedAt: null, personId: person.id },
    });
    await expect(
      withTestTenantResult(tenantTestAccount(tenantA.accountId), (db) =>
        getWelcomeState(
          tenantA.accountId,
          tenantA.organisationId,
          "user_none",
          db
        )
      )
    ).resolves.toEqual({ ok: true, value: null });
    await expect(
      withTestTenantResult(tenantTestAccount(tenantA.accountId), (db) =>
        completeWelcome(
          tenantA.accountId,
          tenantA.organisationId,
          person.id,
          "user_intruder",
          db
        )
      )
    ).resolves.toMatchObject({ error: { code: "not_found" }, ok: false });
    await expect(
      withTestTenantResult(tenantTestAccount(tenantA.accountId), (db) =>
        completeWelcome(
          tenantA.accountId,
          tenantA.organisationId,
          person.id,
          "user_member",
          db
        )
      )
    ).resolves.toEqual({ ok: true, value: undefined });
    const state = await withTestTenantResult(
      tenantTestAccount(tenantA.accountId),
      (db) =>
        getWelcomeState(
          tenantA.accountId,
          tenantA.organisationId,
          "user_member",
          db
        )
    );
    expect(state.ok && state.value?.completedAt).toBeInstanceOf(Date);
  });
});
