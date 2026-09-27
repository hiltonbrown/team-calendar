import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { XERO_SUBCASE_IDS } from "./xero-scenarios.js";

const auxiliaryPattern =
  /xero-(intent-guards|recovery-reasons|disconnect-receipts)\.spec\.ts:\d+:\d+/;
const scenarioPattern = /\bX\d{2}\./;

describe("dedicated Xero discovery inventory", () => {
  it("lists the same five runtime specs, without requiring execution authority", async () => {
    const { execFileSync } = await import("node:child_process");
    const output = execFileSync(
      "bun",
      [
        "--no-env-file",
        "./node_modules/@playwright/test/cli.js",
        "test",
        "--config",
        "tooling/release/xero-e2e.config.ts",
        "--list",
      ],
      {
        encoding: "utf8",
        env: {
          NODE_ENV: "test",
          PATH: process.env.PATH,
          TC_XERO_DISCOVERY: "1",
        },
      }
    );
    for (const file of [
      "xero-oauth",
      "xero-scenarios",
      "xero-intent-guards",
      "xero-recovery-reasons",
      "xero-disconnect-receipts",
    ]) {
      expect(output).toContain(`${file}.spec.ts`);
    }
    const subcases = [...output.matchAll(/\b(X\d{2}\.[a-z0-9-]+)\b/g)].map(
      (match) => match[1]
    );
    expect([...subcases].sort()).toEqual([...XERO_SUBCASE_IDS].sort());
    expect(subcases).toHaveLength(92);
    expect(new Set(subcases).size).toBe(92);
    expect(new Set(subcases.map((entry) => entry.split(".")[0])).size).toBe(26);
    expect(output).toContain("Total: 110 tests in 5 files");
    const auxiliary = output
      .split("\n")
      .filter((line) => auxiliaryPattern.test(line));
    expect(auxiliary).toHaveLength(18);
    expect(auxiliary.every((line) => !scenarioPattern.test(line))).toBe(true);
  });
});

it("refuses unguarded listing and validates role environment only when execution begins", () => {
  const env: NodeJS.ProcessEnv = { NODE_ENV: "test", PATH: process.env.PATH };
  const listing = spawnSync(
    "bun",
    [
      "--no-env-file",
      "./node_modules/@playwright/test/cli.js",
      "test",
      "--config",
      "tooling/release/xero-e2e.config.ts",
      "--list",
    ],
    { encoding: "utf8", env }
  );
  expect(listing.status).not.toBe(0);
  expect(listing.stderr).toContain("guarded runner context");
  const path = resolve("tooling/release/e2e/fixture.ts");
  const importing = spawnSync(
    "bun",
    ["--no-env-file", "--eval", `await import(${JSON.stringify(path)})`],
    { encoding: "utf8", env }
  );
  expect(importing.status).toBe(0);
  const executing = spawnSync(
    "bun",
    [
      "--no-env-file",
      "--eval",
      `const {useRole} = await import(${JSON.stringify(path)}); await useRole(null, "admin")`,
    ],
    { encoding: "utf8", env }
  );
  expect(executing.status).not.toBe(0);
  expect(executing.stderr).toContain("TC_RELEASE_MANIFEST");
});
