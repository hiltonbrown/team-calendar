import { describe, expect, it, vi } from "vitest";
import {
  countSharedStoreFixtureKeys,
  deleteSharedStoreFixtureKeys,
  sharedStoreFixtureEpoch,
} from "./live-shared-store-fixture";

const domain = sharedStoreFixtureEpoch("owned-namespace");
const prefix = `xero:{provider-app}:${domain}:`;
const input = { globalKeys: ["shared_store_namespace:owned-namespace"] };
describe("owned quota shared-store cleanup", () => {
  it("counts only the exact allocated domain", async () => {
    const command = vi.fn().mockResolvedValue(["0", [`${prefix}sentinel`]]);
    expect(await countSharedStoreFixtureKeys(input, { command })).toBe(1);
    expect(command).toHaveBeenCalledWith(
      ["SCAN", "0", "MATCH", `xero:{*}:${domain}:*`, "COUNT", "1000"],
      expect.any(Number)
    );
  });
  it("rejects a foreign key before deleting any key", async () => {
    const command = vi
      .fn()
      .mockResolvedValue([
        "0",
        [
          `${prefix}sentinel`,
          "xero:{provider-app}:22222222222222222222222222222222:sentinel",
        ],
      ]);
    await expect(
      deleteSharedStoreFixtureKeys(input, { command })
    ).rejects.toThrow("outside manifest ownership");
    expect(command.mock.calls.every(([args]) => args[0] === "SCAN")).toBe(true);
  });
  it("deletes keys grouped by Redis hash tag and verifies no residue", async () => {
    const keys = [`${prefix}sentinel`, `${prefix}organisation:owned`];
    const command = vi
      .fn()
      .mockResolvedValueOnce(["0", keys])
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(["0", []]);
    expect(await deleteSharedStoreFixtureKeys(input, { command })).toBe(2);
    expect(
      command.mock.calls
        .filter(([args]) => args[0] === "DEL")
        .map(([args]) => args)
    ).toEqual([["DEL", ...keys]]);
  });
  it("does not contact the store for unrelated manifest fixture kinds", async () => {
    const command = vi.fn();
    expect(
      await countSharedStoreFixtureKeys(
        { globalKeys: ["authorisation:grant"] },
        { command }
      )
    ).toBe(0);
    expect(command).not.toHaveBeenCalled();
  });
});
