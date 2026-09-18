import { employment_type, source_system } from "@repo/database/generated/enums";
import { afterAll, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  getActiveOrgContext: vi.fn(),
  redirect: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@repo/auth/server", async (importOriginal) => {
  const original = await importOriginal<typeof import("@repo/auth/server")>();
  return { ...original, auth: mocks.auth };
});
vi.mock("@/lib/server/get-active-org-context", () => ({
  getActiveOrgContext: mocks.getActiveOrgContext,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

let createManualPersonAction: typeof import("./_actions")["createManualPersonAction"];
let database: typeof import("@repo/database")["database"];

const describeWithDatabase = process.env.DATABASE_URL
  ? describe
  : describe.skip;
const clerkOrgId = "org_test_manual_person_limit";
const organisationId = "b1000000-0000-4000-8000-000000000001";

if (process.env.DATABASE_URL) {
  ({ createManualPersonAction } = await import("./_actions"));
  ({ database } = await import("@repo/database"));
}

describeWithDatabase("manual person plan-limit enforcement", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ orgRole: "org:admin" });
    mocks.getActiveOrgContext.mockResolvedValue({
      ok: true,
      value: { clerkOrgId, organisationId },
    });
    await cleanTestData();
    await database.organisation.create({
      data: {
        clerk_org_id: clerkOrgId,
        country_code: "AU",
        id: organisationId,
        name: "Manual person limit test",
      },
    });
  });

  afterAll(async () => {
    await cleanTestData();
    await database.$disconnect();
  });

  test("rejects at the exact limit even when the reporting counter is stale", async () => {
    await createPeople(9);
    await database.usageCounter.create({
      data: {
        clerk_org_id: clerkOrgId,
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
      clerk_org_id: clerkOrgId,
      email: `existing-${index}@example.com`,
      employment_type: employment_type.employee,
      first_name: "Existing",
      last_name: `${index}`,
      organisation_id: organisationId,
      source_system: source_system.MANUAL,
    })),
  });
}

function activePersonCount() {
  return database.person.count({
    where: {
      archived_at: null,
      clerk_org_id: clerkOrgId,
      is_active: true,
    },
  });
}

async function cleanTestData() {
  await database.clerkOrgSubscription.deleteMany({
    where: { clerk_org_id: clerkOrgId },
  });
  await database.usageCounter.deleteMany({
    where: { clerk_org_id: clerkOrgId },
  });
  await database.person.deleteMany({ where: { clerk_org_id: clerkOrgId } });
  await database.organisation.deleteMany({
    where: { clerk_org_id: clerkOrgId },
  });
}
