import { FEATURE_KEYS, LIMIT_TYPES } from "@repo/core";
import { describe, expect, it } from "vitest";
import type { PrismaClient } from "../../generated/client";
import { PLAN_CATALOGUE, type PlanDefinition } from "./plans";
import { syncPlanCatalogue } from "./seed-plans";

interface PlanRow {
  clerk_plan_key: string;
  id: string;
  is_active: boolean;
  is_custom: boolean;
  key: string;
  name: string;
}

interface PlanLimitRow {
  id: string;
  limit_type: string;
  limit_value: number;
  plan_id: string;
}

interface PlanUpsertArgs {
  create: Omit<PlanRow, "id">;
  select: { id: true };
  update: Omit<PlanRow, "clerk_plan_key" | "id">;
  where: { clerk_plan_key: string };
}

interface LimitUpsertArgs {
  create: Omit<PlanLimitRow, "id">;
  update: { limit_value: number };
  where: { plan_id_limit_type: { limit_type: string; plan_id: string } };
}

// Minimal in-memory Prisma stand-in implementing the upsert semantics the seed
// sync relies on: plans key on clerk_plan_key, limits key on (plan_id,
// limit_type). Tracks insert counts so duplicate creation is observable.
function makeFakeDb() {
  const plans = new Map<string, PlanRow>();
  const limits = new Map<string, PlanLimitRow>();
  let planSeq = 0;
  let limitSeq = 0;

  const db = {
    plan: {
      upsert: ({ where, create, update }: PlanUpsertArgs) => {
        const existing = plans.get(where.clerk_plan_key);
        if (existing) {
          Object.assign(existing, update);
          return Promise.resolve({ id: existing.id });
        }
        planSeq += 1;
        const row: PlanRow = { id: `plan_${planSeq}`, ...create };
        plans.set(where.clerk_plan_key, row);
        return Promise.resolve({ id: row.id });
      },
    },
    planLimit: {
      upsert: ({ where, create, update }: LimitUpsertArgs) => {
        const key = `${where.plan_id_limit_type.plan_id}:${where.plan_id_limit_type.limit_type}`;
        const existing = limits.get(key);
        if (existing) {
          Object.assign(existing, update);
          return Promise.resolve(existing);
        }
        limitSeq += 1;
        const row: PlanLimitRow = { id: `limit_${limitSeq}`, ...create };
        limits.set(key, row);
        return Promise.resolve(row);
      },
    },
  };

  return { db: db as unknown as PrismaClient, limits, plans };
}

describe("PLAN_CATALOGUE", () => {
  it("declares every LimitType and FeatureKey for every plan", () => {
    for (const plan of PLAN_CATALOGUE) {
      for (const limitType of LIMIT_TYPES) {
        expect(typeof plan.limits[limitType]).toBe("number");
      }
      for (const featureKey of FEATURE_KEYS) {
        expect(typeof plan.features[featureKey]).toBe("boolean");
      }
    }
  });

  it("seeds the three catalogue plans with the specified limits", () => {
    const basic = PLAN_CATALOGUE.find((p) => p.clerk_plan_key === "basic");
    const premium = PLAN_CATALOGUE.find((p) => p.clerk_plan_key === "premium");
    expect(basic?.limits).toEqual({
      feeds: 2,
      payroll_entities: 1,
      seats: 10,
    });
    expect(premium?.limits.feeds).toBe(-1);
    expect(premium?.features.analytics).toBe(true);
    expect(basic?.features.priority_support).toBe(false);
  });
});

describe("syncPlanCatalogue", () => {
  it("upserts every plan and every limit row", async () => {
    const { db, plans, limits } = makeFakeDb();

    const summary = await syncPlanCatalogue(db);

    expect(summary.plans).toBe(PLAN_CATALOGUE.length);
    expect(summary.limits).toBe(PLAN_CATALOGUE.length * LIMIT_TYPES.length);
    expect(plans.size).toBe(PLAN_CATALOGUE.length);
    expect(limits.size).toBe(PLAN_CATALOGUE.length * LIMIT_TYPES.length);
  });

  it("is idempotent: re-running yields identical rows with no duplicates", async () => {
    const { db, plans, limits } = makeFakeDb();

    await syncPlanCatalogue(db);
    const planIds = [...plans.values()].map((p) => p.id);
    const limitIds = [...limits.values()].map((l) => l.id);

    await syncPlanCatalogue(db);

    expect([...plans.values()].map((p) => p.id)).toEqual(planIds);
    expect([...limits.values()].map((l) => l.id)).toEqual(limitIds);
    expect(plans.size).toBe(PLAN_CATALOGUE.length);
    expect(limits.size).toBe(PLAN_CATALOGUE.length * LIMIT_TYPES.length);
  });

  it("updates a changed limit in place without creating a new row", async () => {
    const { db, limits } = makeFakeDb();

    await syncPlanCatalogue(db);
    const basicFeedsKey = [...limits.entries()].find(
      ([, row]) => row.limit_type === "feeds" && row.limit_value === 2
    );
    expect(basicFeedsKey).toBeDefined();
    const originalId = basicFeedsKey?.[1].id;

    const edited: PlanDefinition[] = PLAN_CATALOGUE.map((plan) =>
      plan.clerk_plan_key === "basic"
        ? { ...plan, limits: { ...plan.limits, feeds: 5 } }
        : plan
    );
    await syncPlanCatalogue(db, edited);

    const updated = [...limits.values()].find((row) => row.id === originalId);
    expect(updated?.limit_value).toBe(5);
    expect(limits.size).toBe(PLAN_CATALOGUE.length * LIMIT_TYPES.length);
  });
});
