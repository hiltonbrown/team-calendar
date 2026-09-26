import { describe, expect, it, vi } from "vitest";
import {
  countSharedStoreFixtureKeys,
  deleteSharedStoreFixtureKeys,
  sharedStoreFixtureEpoch,
} from "../../packages/database/src/live-shared-store-fixture.js";

const SAFE_EPOCH = /^[a-f0-9]{32}$/;
const namespace = "release_shared_store_a_run_marker_01";
const epoch = sharedStoreFixtureEpoch(namespace);
const input = { globalKeys: [`shared_store_namespace:${namespace}`] };
const key = (app = "fixture-app") => `xero:{${app}}:${epoch}:tenant:day`;

describe("shared-store fixture namespace", () => {
  it("derives a deterministic production-safe epoch from the exact allocated value", () => {
    expect(epoch).toMatch(SAFE_EPOCH);
    expect(sharedStoreFixtureEpoch(namespace)).toBe(epoch);
    expect(sharedStoreFixtureEpoch(`${namespace}_other`)).not.toBe(epoch);
    expect(sharedStoreFixtureEpoch(`${namespace} `)).not.toBe(epoch);
    expect(
      new Set(
        Array.from({ length: 1000 }, (_, i) =>
          sharedStoreFixtureEpoch(`release_fixture_${i}`)
        )
      ).size
    ).toBe(1000);
    expect(() => sharedStoreFixtureEpoch("")).toThrow("manifest-owned");
  });
});

describe("manifest-owned shared-store cleanup", () => {
  it("does not contact KV when the manifest owns no shared-store namespace", async () => {
    const command = vi.fn();
    expect(
      await countSharedStoreFixtureKeys(
        { globalKeys: ["provider_app:app"] },
        { command }
      )
    ).toBe(0);
    expect(
      await deleteSharedStoreFixtureKeys({ globalKeys: [] }, { command })
    ).toBe(0);
    expect(command).not.toHaveBeenCalled();
  });
  it("counts unique owned keys across bounded SCAN pages and app identities", async () => {
    const command = vi
      .fn()
      .mockResolvedValueOnce(["12", [key(), key()]])
      .mockResolvedValueOnce(["0", [key("second-app")]]);
    expect(await countSharedStoreFixtureKeys(input, { command })).toBe(2);
    expect(command.mock.calls.map((call) => call[0])).toEqual([
      ["SCAN", "0", "MATCH", `xero:{*}:${epoch}:*`, "COUNT", "1000"],
      ["SCAN", "12", "MATCH", `xero:{*}:${epoch}:*`, "COUNT", "1000"],
    ]);
  });
  it("deletes only validated names and verifies the owned namespace is empty", async () => {
    const command = vi
      .fn()
      .mockResolvedValueOnce(["0", [key()]])
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(["0", []]);
    expect(await deleteSharedStoreFixtureKeys(input, { command })).toBe(1);
    expect(command.mock.calls[1][0]).toEqual(["DEL", key()]);
    expect(
      command.mock.calls.some((call) =>
        ["FLUSHDB", "FLUSHALL"].includes(call[0][0])
      )
    ).toBe(false);
  });
  it("groups deletion by app hash tag and verifies residue across both apps", async () => {
    const firstAppKeys = Array.from({ length: 201 }, (_, i) => `${key()}:${i}`);
    const secondAppKeys = [key("second-app"), `${key("second-app")}:lease`];
    const command = vi
      .fn()
      .mockResolvedValueOnce([
        "0",
        [secondAppKeys[0], ...firstAppKeys, secondAppKeys[1]],
      ])
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(200)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(["0", []]);
    expect(await deleteSharedStoreFixtureKeys(input, { command })).toBe(203);
    const deletes = command.mock.calls
      .map((call) => call[0])
      .filter((call) => call[0] === "DEL");
    expect(deletes.map((call) => call.length - 1)).toEqual([2, 200, 1]);
    for (const batch of deletes) {
      expect(
        new Set(
          batch
            .slice(1)
            .map((entry: string) => entry.slice(0, entry.indexOf("}") + 1))
        ).size
      ).toBe(1);
    }
    expect(new Set(deletes.flatMap((batch) => batch.slice(1)))).toEqual(
      new Set([...firstAppKeys, ...secondAppKeys])
    );
    expect(command.mock.calls.at(-1)?.[0]).toEqual([
      "SCAN",
      "0",
      "MATCH",
      `xero:{*}:${epoch}:*`,
      "COUNT",
      "1000",
    ]);
  });
  it("validates every page before deleting, refusing returned unowned keys", async () => {
    const command = vi
      .fn()
      .mockResolvedValueOnce(["1", [key()]])
      .mockResolvedValueOnce(["0", ["xero:{app}:production:day"]]);
    await expect(
      deleteSharedStoreFixtureKeys(input, { command })
    ).rejects.toThrow("outside manifest ownership");
    expect(command.mock.calls.every((call) => call[0][0] === "SCAN")).toBe(
      true
    );
  });
  it.each([["bad", []], [0, []], ["0", [5]], ["0"], { result: ["0", []] }])(
    "refuses malformed scan responses %j",
    async (result) => {
      const command = vi.fn().mockResolvedValue(result);
      await expect(
        deleteSharedStoreFixtureKeys(input, { command })
      ).rejects.toThrow("invalid scan");
      expect(command).toHaveBeenCalledTimes(1);
    }
  );
  it("refuses repeating cursors rather than scanning indefinitely", async () => {
    const command = vi.fn().mockResolvedValue(["1", []]);
    await expect(
      countSharedStoreFixtureKeys(input, { command })
    ).rejects.toThrow("did not terminate");
    expect(command).toHaveBeenCalledTimes(2);
  });
  it("rejects an empty ownership allocation before any request", async () => {
    const command = vi.fn();
    await expect(
      deleteSharedStoreFixtureKeys(
        { globalKeys: ["shared_store_namespace:"] },
        { command }
      )
    ).rejects.toThrow("manifest-owned");
    expect(command).not.toHaveBeenCalled();
  });
  it.each(["OK", -1, 2, null])(
    "refuses invalid delete acknowledgements %j",
    async (result) => {
      const command = vi
        .fn()
        .mockResolvedValueOnce(["0", [key()]])
        .mockResolvedValueOnce(result);
      await expect(
        deleteSharedStoreFixtureKeys(input, { command })
      ).rejects.toThrow("invalid delete");
    }
  );
  it("fails cleanup on remaining keys after a failed removal", async () => {
    const command = vi
      .fn()
      .mockResolvedValueOnce(["0", [key()]])
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(["0", [key()]]);
    await expect(
      deleteSharedStoreFixtureKeys(input, { command })
    ).rejects.toThrow("residue remains");
  });
  it("bounds the complete cleanup operation and does not send expired requests", async () => {
    const now = vi.fn().mockReturnValueOnce(0).mockReturnValue(60_001);
    const command = vi.fn();
    await expect(
      countSharedStoreFixtureKeys(input, { command, now })
    ).rejects.toThrow("deadline exceeded");
    expect(command).not.toHaveBeenCalled();
  });
});
