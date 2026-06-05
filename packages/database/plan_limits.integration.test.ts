// biome-ignore-all lint/style/useFilenamingConvention: The requested test file is plan_limits.integration.test.ts.
import { config } from "dotenv";
import { afterAll, beforeEach, describe, expect, test, vi } from "vitest";

config({ path: new URL("./.env", import.meta.url).pathname });
vi.mock("server-only", () => ({}));

const { database, plan_limit_type } = await import("./index.js");

const planId = "50000000-0000-4000-8000-000000000001";
const planKey = "test_plan_limits";

const cleanTestData = async () => {
  await database.planLimit.deleteMany({ where: { plan_id: planId } });
  await database.plan.deleteMany({ where: { key: planKey } });
};

const expectPrismaErrorCode = async (
  operation: Promise<unknown>,
  code: string
) => {
  let error: unknown;

  try {
    await operation;
  } catch (caught) {
    error = caught;
  }

  expect(error).toMatchObject({ code });
};

beforeEach(async () => {
  await cleanTestData();
  await database.plan.create({
    data: { id: planId, key: planKey, name: "Test plan" },
  });
});

afterAll(async () => {
  await cleanTestData();
  await database.$disconnect();
});

describe("plan_limits", () => {
  test("rejects duplicate (plan_id, limit_type) pairs", async () => {
    await database.planLimit.create({
      data: {
        id: "51000000-0000-4000-8000-000000000001",
        plan_id: planId,
        limit_type: plan_limit_type.feeds,
        limit_value: 2,
      },
    });

    await expectPrismaErrorCode(
      database.planLimit.create({
        data: {
          id: "51000000-0000-4000-8000-000000000002",
          plan_id: planId,
          limit_type: plan_limit_type.feeds,
          limit_value: 5,
        },
      }),
      "P2002"
    );
  });

  test("allows distinct limit types for the same plan", async () => {
    await database.planLimit.create({
      data: {
        id: "51000000-0000-4000-8000-000000000003",
        plan_id: planId,
        limit_type: plan_limit_type.feeds,
        limit_value: 2,
      },
    });

    await expect(
      database.planLimit.create({
        data: {
          id: "51000000-0000-4000-8000-000000000004",
          plan_id: planId,
          limit_type: plan_limit_type.active_people,
          limit_value: 5,
        },
      })
    ).resolves.toMatchObject({ limit_type: plan_limit_type.active_people });
  });
});
