import { expect, test } from "vitest";
import { allocateLiveTestFixture } from "./src/live-test-fixture";
import { syncPlansFromCatalogue } from "./src/seed/plan-sync";
import { getPlanDefinition } from "./src/seed/plans";
import { systemDatabase } from "./src/system-client";

const fixture = allocateLiveTestFixture(
  "packages/database/plan-sync-multi-company.integration.test.ts"
);

test("Premium projection updates an existing one-company limit to five idempotently", async () => {
  const key = fixture.globalKey("plan_key");
  const plan = await systemDatabase.plan.create({
    data: {
      id: fixture.globalKey("plan_id"),
      key,
      name: "Owned Premium projection",
      plan_key: key,
    },
  });
  try {
    await systemDatabase.planLimit.create({
      data: {
        limit_type: "payroll_entities",
        limit_value: 1,
        plan_id: plan.id,
      },
    });
    const definition = { ...getPlanDefinition("premium"), plan_key: key };
    await syncPlansFromCatalogue(systemDatabase, [definition]);
    const after = await systemDatabase.planLimit.findMany({
      orderBy: { limit_type: "asc" },
      where: { plan_id: plan.id },
    });
    expect(
      after.find((limit) => limit.limit_type === "payroll_entities")
        ?.limit_value
    ).toBe(5);
    expect(getPlanDefinition("basic").limits.payroll_entities).toBe(1);
    await syncPlansFromCatalogue(systemDatabase, [definition]);
    const repeated = await systemDatabase.planLimit.findMany({
      orderBy: { limit_type: "asc" },
      where: { plan_id: plan.id },
    });
    expect(
      repeated.map(({ id, limit_type, limit_value }) => ({
        id,
        limit_type,
        limit_value,
      }))
    ).toEqual(
      after.map(({ id, limit_type, limit_value }) => ({
        id,
        limit_type,
        limit_value,
      }))
    );
  } finally {
    await systemDatabase.planLimit.deleteMany({ where: { plan_id: plan.id } });
    await systemDatabase.plan.delete({ where: { id: plan.id } });
  }
});
