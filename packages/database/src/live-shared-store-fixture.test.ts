import { describe, expect, it, vi } from "vitest";
import {
  countSharedStoreFixtureKeys,
  deleteSharedStoreFixtureKeys,
} from "./live-shared-store-fixture";

const domain = "11111111-1111-4111-8111-111111111111";
const prefix = `xero:e2e:runtime:v1:${domain}:`;
const input = { globalKeys: [`campaign_domain:${domain}`] };

describe("owned campaign shared-store cleanup", () => {
  it("counts only the exact allocated domain", async () => {
    const command = vi.fn().mockResolvedValue(["0", [`${prefix}sentinel`]]);
    expect(await countSharedStoreFixtureKeys(input, { command })).toBe(1);
    expect(command).toHaveBeenCalledWith(
      ["SCAN", "0", "MATCH", `${prefix}*`, "COUNT", "1000"],
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
          "xero:e2e:runtime:v1:22222222-2222-4222-8222-222222222222:sentinel",
        ],
      ]);
    await expect(
      deleteSharedStoreFixtureKeys(input, { command })
    ).rejects.toThrow("outside manifest ownership");
    expect(command.mock.calls.every(([args]) => args[0] === "SCAN")).toBe(true);
  });

  it("deletes separate untagged keys separately and verifies no residue", async () => {
    const keys = [`${prefix}sentinel`, `${prefix}organisation:owned`];
    const command = vi
      .fn()
      .mockResolvedValueOnce(["0", keys])
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(["0", []]);
    expect(await deleteSharedStoreFixtureKeys(input, { command })).toBe(2);
    expect(
      command.mock.calls
        .filter(([args]) => args[0] === "DEL")
        .map(([args]) => args)
    ).toEqual(keys.map((key) => ["DEL", key]));
  });

  it("rejects malformed domain selectors without calling the store", async () => {
    const command = vi.fn();
    await expect(
      countSharedStoreFixtureKeys(
        { globalKeys: ["campaign_domain:*"] },
        { command }
      )
    ).rejects.toThrow();
    expect(command).not.toHaveBeenCalled();
  });
});
