import { employment_type, source_system } from "@repo/database/generated/enums";
import { allocateLiveTestFixture } from "@repo/database/live-test-fixture";
import { afterAll, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  redirect: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@repo/auth/server", async (importOriginal) => {
  const original = await importOriginal<typeof import("@repo/auth/server")>();
  return { ...original, getSession: mocks.getSession };
});
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

const fixture = allocateLiveTestFixture(
  "apps/app/app/(authenticated)/people/new/_actions.integration.test.ts"
);
const [tenant] = fixture.tenants;
if (!tenant) {
  throw new Error("App live fixture tenant was not allocated");
}
const { accountId, organisationId } = tenant;
const { createManualPersonAction } = await import("./_actions");
const { systemDatabase: database } = await import("@repo/database");

describe("manual person plan-limit enforcement", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ accountId, role: "admin" });
    await cleanTestData();
    await database.organisation.create({
      data: {
        account_id: accountId,
        country_code: "AU",
        id: organisationId,
        name: "Manual person limit test",
      },
    });
  });

  afterAll(async () => {
    await cleanTestData();
    await expect(
      database.organisation.count({ where: { account_id: accountId } })
    ).resolves.toBe(0);
    await database.$disconnect();
  });

  test("rejects at the exact limit even when the reporting counter is stale", async () => {
    await createPeople(9);
    await database.usageCounter.create({
      data: {
        account_id: accountId,
        counter_type: "seats",
        current_value: 0,
        metric_key: "seats",
        period_end: new Date("9999-12-31T23:59:59.999Z"),
        period_start: new Date("1970-01-01T00:00:00.000Z"),
      },
    });

    const result = await createPerson("blocked@example.com");

    expect(result).toEqual({
      error: {
        code: "validation_error",
        message: "Your current plan has reached its active people limit.",
      },
      ok: false,
    });
    await expect(activePersonCount()).resolves.toBe(9);
  });

  test("serialises concurrent creates so only one final seat is consumed", async () => {
    await createPeople(8);

    const results = await Promise.all([
      createPerson("first-concurrent@example.com"),
      createPerson("second-concurrent@example.com"),
    ]);

    expect(results.filter((result) => result === undefined)).toHaveLength(1);
    expect(results).toContainEqual({
      error: {
        code: "validation_error",
        message: "Your current plan has reached its active people limit.",
      },
      ok: false,
    });
    await expect(activePersonCount()).resolves.toBe(9);
  }, 20_000);
});

function createPerson(email: string) {
  return createManualPersonAction({
    email,
    employmentType: "employee",
    firstName: "Limit",
    lastName: "Test",
    organisationId,
  });
}

async function createPeople(count: number) {
  await database.person.createMany({
    data: Array.from({ length: count }, (_, index) => ({
      account_id: accountId,
      email: `existing-${index}@example.com`,
      employment_type: employment_type.employee,
      first_name: "Existing",
      id: fixture.id("person", index),
      last_name: `${index}`,
      organisation_id: organisationId,
      source_system: source_system.MANUAL,
    })),
  });
}

function activePersonCount() {
  return database.person.count({
    where: {
      account_id: accountId,
      archived_at: null,
      is_active: true,
    },
  });
}

async function cleanTestData() {
  await database.accountSubscription.deleteMany({
    where: { account_id: accountId },
  });
  await database.usageCounter.deleteMany({
    where: { account_id: accountId },
  });
  await database.person.deleteMany({ where: { account_id: accountId } });
  await database.organisation.deleteMany({
    where: { account_id: accountId },
  });
}
