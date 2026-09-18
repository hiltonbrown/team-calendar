import { describe, expect, it } from "vitest";
import {
  getPublicPlanDefinition,
  PUBLIC_PLAN_CATALOGUE,
} from "./plan-catalogue";

describe("public plan catalogue", () => {
  it("preserves stable internal keys and unique public names", () => {
    expect(PUBLIC_PLAN_CATALOGUE.map(({ plan_key }) => plan_key)).toEqual([
      "basic",
      "premium",
      "enterprise",
    ]);
    expect(PUBLIC_PLAN_CATALOGUE.map(({ name }) => name)).toEqual([
      "Starter",
      "Premium",
      "Enterprise",
    ]);
  });

  it("encodes the approved limits and feature flags", () => {
    expect(getPublicPlanDefinition("basic")).toMatchObject({
      features: { analytics: false, priority_support: false },
      limits: { feeds: 2, payroll_entities: 1, seats: 9 },
      name: "Starter",
    });
    expect(getPublicPlanDefinition("premium")).toMatchObject({
      features: { analytics: true, priority_support: true },
      limits: { feeds: -1, payroll_entities: 1, seats: 50 },
    });
    expect(getPublicPlanDefinition("enterprise")).toMatchObject({
      limits: { feeds: -1, payroll_entities: -1, seats: -1 },
    });
  });
});
