import { describe, expect, it } from "vitest";
import {
  isSupportedGlobalFixtureKey,
  unsupportedGlobalFixtureKeys,
} from "./global-fixture-keys.js";

describe("release global fixture keys", () => {
  it.each([
    "plan_id:value",
    "plan_key:value",
    "stripe_event:value",
    "authorisation:value",
    "provider_app:value",
    "shared_store_namespace:value",
  ])("accepts the registered ownership kind %s", (key) => {
    expect(isSupportedGlobalFixtureKey(key)).toBe(true);
  });

  it("rejects empty and unknown ownership values", () => {
    expect(isSupportedGlobalFixtureKey("provider_app:")).toBe(false);
    expect(
      unsupportedGlobalFixtureKeys(["provider_app:owned", "unsupported:value"])
    ).toEqual(["unsupported:value"]);
  });

  it("rejects the retired fixture namespace ownership kind", () => {
    expect(isSupportedGlobalFixtureKey("fixture-namespace:obsolete")).toBe(
      false
    );
    expect(
      unsupportedGlobalFixtureKeys([
        "authorisation:owned",
        "fixture-namespace:obsolete",
      ])
    ).toEqual(["fixture-namespace:obsolete"]);
  });
});
