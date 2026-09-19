// biome-ignore-all lint/style/useFilenamingConvention: The requested test file is plan_limits.integration.test.ts.
import { afterAll, beforeEach, describe, expect, test, vi } from "vitest";
import { allocateLiveTestFixture } from "./src/live-test-fixture";

vi.mock("server-only", () => ({}));

const fixture = allocateLiveTestFixture(
  "packages/database/plan_limits.integration.test.ts"
);
const { database, plan_limit_type } = await import("./index.js");

const planId = fixture.globalKey("plan_id");
const planKey = fixture.globalKey("plan_key");

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
    data: { id: planId, key: planKey, name: "Test plan", plan_key: planKey },
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
        id: fixture.id("plan-limit", 0),
        limit_type: plan_limit_type.feeds,
        limit_value: 2,
        plan_id: planId,
      },
    });

    await expectPrismaErrorCode(
      database.planLimit.create({
        data: {
          id: fixture.id("plan-limit", 1),
          limit_type: plan_limit_type.feeds,
          limit_value: 5,
          plan_id: planId,
        },
      }),
      "P2002"
    );
  });

  test("allows distinct limit types for the same plan", async () => {
    await database.planLimit.create({
      data: {
        id: fixture.id("plan-limit", 2),
        limit_type: plan_limit_type.feeds,
        limit_value: 2,
        plan_id: planId,
      },
    });

    await expect(
      database.planLimit.create({
        data: {
          id: fixture.id("plan-limit", 3),
          limit_type: plan_limit_type.active_people,
          limit_value: 5,
          plan_id: planId,
        },
      })
    ).resolves.toMatchObject({ limit_type: plan_limit_type.active_people });
  });
});
