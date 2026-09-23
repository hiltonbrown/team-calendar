import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertExpectedIntegrationInventory,
  discoverIntegrationTests,
  EXPECTED_INTEGRATION_TESTS,
} from "./integration-inventory.js";

describe("live integration inventory", () => {
  it("fails when a database-backed suite is added or silently removed", () => {
    const inventory = discoverIntegrationTests(
      resolve(import.meta.dirname, "../..")
    );
    expect(inventory).toEqual(EXPECTED_INTEGRATION_TESTS);
    expect(() => assertExpectedIntegrationInventory(inventory)).not.toThrow();
    expect(() =>
      assertExpectedIntegrationInventory(inventory.slice(1))
    ).toThrow("22-suite allowlist");
  });
});
