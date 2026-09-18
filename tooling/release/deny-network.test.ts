import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("source-gate network denial", () => {
  it("blocks outbound fetch before a connection is opened", () => {
    const preload = resolve(import.meta.dirname, "deny-network.mjs");
    const result = spawnSync(
      process.execPath,
      ["--import", preload, "--eval", "await fetch('https://example.com')"],
      { encoding: "utf8" }
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      "Network access is disabled during source-only release gates"
    );
  });
});
