import type { ClerkOrgId, OrganisationId } from "@repo/core";
import { afterAll, beforeEach, describe, expect, test, vi } from "vitest";
import { allocateLiveTestFixture } from "./src/live-test-fixture";

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
  clerkOrgId: fixture.tenants[0]?.clerkOrgId as ClerkOrgId,
  organisationId: fixture.tenants[0]?.organisationId as OrganisationId,
};
const tenantB = {
  clerkOrgId: fixture.tenants[1]?.clerkOrgId as ClerkOrgId,
  organisationId: fixture.tenants[1]?.organisationId as OrganisationId,
};
const clerkOrgIds = [tenantA.clerkOrgId, tenantB.clerkOrgId];

async function clean() {
  const scope = { clerk_org_id: { in: clerkOrgIds } };
  await database.person.deleteMany({ where: scope });
  await database.organisation.deleteMany({ where: scope });
}

async function seedTenant(tenant: typeof tenantA) {
  await database.organisation.create({
    data: {
      clerk_org_id: tenant.clerkOrgId,
      country_code: "AU",
      id: tenant.organisationId,
      name: `Onboarding ${tenant.clerkOrgId}`,
    },
  });
}

async function seedPerson(tenant: typeof tenantA, clerkUserId: string) {
  return await database.person.create({
    data: {
      clerk_org_id: tenant.clerkOrgId,
      clerk_user_id: clerkUserId,
      email: `${clerkUserId}@example.test`,
      employment_type: "employee",
      first_name: "Test",
      last_name: "Person",
      organisation_id: tenant.organisationId,
      source_system: "MANUAL",
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
      getOnboardingRecord(tenantA.clerkOrgId, tenantA.organisationId)
    ).resolves.toEqual({
      ok: true,
      value: { completedAt: null, step: "details", xeroSkippedAt: null },
    });
  });

  test("advances only from the stored step", async () => {
    await expect(
      advanceOnboardingStep(
        tenantA.clerkOrgId,
        tenantA.organisationId,
        "details",
        "xero"
      )
    ).resolves.toEqual({ ok: true, value: { advanced: true } });
    await expect(
      advanceOnboardingStep(
        tenantA.clerkOrgId,
        tenantA.organisationId,
        "details",
        "xero"
      )
    ).resolves.toEqual({ ok: true, value: { advanced: false } });
    const record = await getOnboardingRecord(
      tenantA.clerkOrgId,
      tenantA.organisationId
    );
    expect(record.ok && record.value.step).toBe("xero");
  });

  test("keeps the first completion time", async () => {
    const first = await completeOnboarding(
      tenantA.clerkOrgId,
      tenantA.organisationId
    );
    const second = await completeOnboarding(
      tenantA.clerkOrgId,
      tenantA.organisationId
    );
    expect(first.ok && second.ok).toBe(true);
    expect(second.ok && second.value.completedAt).toEqual(
      first.ok && first.value.completedAt
    );
  });

  test("sets and clears the Xero skip", async () => {
    await setXeroSetupSkipped(tenantA.clerkOrgId, tenantA.organisationId, true);
    let record = await getOnboardingRecord(
      tenantA.clerkOrgId,
      tenantA.organisationId
    );
    expect(record.ok && record.value.xeroSkippedAt).toBeInstanceOf(Date);
    await setXeroSetupSkipped(
      tenantA.clerkOrgId,
      tenantA.organisationId,
      false
    );
    record = await getOnboardingRecord(
      tenantA.clerkOrgId,
      tenantA.organisationId
    );
    expect(record.ok && record.value.xeroSkippedAt).toBeNull();
  });

  test("isolates tenants", async () => {
    await advanceOnboardingStep(
      tenantA.clerkOrgId,
      tenantB.organisationId,
      "details",
      "xero"
    );
    await completeOnboarding(tenantA.clerkOrgId, tenantB.organisationId);
    const other = await getOnboardingRecord(
      tenantB.clerkOrgId,
      tenantB.organisationId
    );
    expect(other).toEqual({
      ok: true,
      value: { completedAt: null, step: "details", xeroSkippedAt: null },
    });
    await expect(
      getOnboardingRecord(tenantA.clerkOrgId, tenantB.organisationId)
    ).resolves.toMatchObject({ error: { code: "not_found" }, ok: false });
  });

  test("tracks the member welcome for the person's own user only", async () => {
    const person = await seedPerson(tenantA, "user_member");
    await expect(
      getWelcomeState(tenantA.clerkOrgId, tenantA.organisationId, "user_member")
    ).resolves.toEqual({
      ok: true,
      value: { completedAt: null, personId: person.id },
    });
    await expect(
      getWelcomeState(tenantA.clerkOrgId, tenantA.organisationId, "user_none")
    ).resolves.toEqual({ ok: true, value: null });
    await expect(
      completeWelcome(
        tenantA.clerkOrgId,
        tenantA.organisationId,
        person.id,
        "user_intruder"
      )
    ).resolves.toMatchObject({ error: { code: "not_found" }, ok: false });
    await expect(
      completeWelcome(
        tenantA.clerkOrgId,
        tenantA.organisationId,
        person.id,
        "user_member"
      )
    ).resolves.toEqual({ ok: true, value: undefined });
    const state = await getWelcomeState(
      tenantA.clerkOrgId,
      tenantA.organisationId,
      "user_member"
    );
    expect(state.ok && state.value?.completedAt).toBeInstanceOf(Date);
  });
});
