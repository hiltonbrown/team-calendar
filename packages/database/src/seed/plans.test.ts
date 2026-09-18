import { PUBLIC_PLAN_CATALOGUE } from "@repo/core";
import { describe, expect, it, vi } from "vitest";

describe("database plan projection", () => {
  it("adds only persistence configuration to the public catalogue", async () => {
    vi.stubEnv("STRIPE_PRICE_BASIC", "price_starter");
    vi.stubEnv("STRIPE_PRICE_PREMIUM", "price_premium");
    vi.resetModules();
    const { PLAN_CATALOGUE } = await import("./plans");

    expect(
      PLAN_CATALOGUE.map(
        ({ is_custom, priceId, ...publicDefinition }) => publicDefinition
      )
    ).toEqual(PUBLIC_PLAN_CATALOGUE);
    expect(
      PLAN_CATALOGUE.map(({ is_custom, priceId }) => ({ is_custom, priceId }))
    ).toEqual([
      { is_custom: false, priceId: "price_starter" },
      { is_custom: false, priceId: "price_premium" },
      { is_custom: true, priceId: null },
    ]);
    vi.unstubAllEnvs();
  });
});
