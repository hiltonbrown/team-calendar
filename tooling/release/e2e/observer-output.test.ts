import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { expect, it } from "vitest";

it("keeps observer stdout parseable while real logger diagnostics reach stderr", () => {
  const helper = resolve("tooling/release/e2e/observer-output.ts");
  const logger = resolve("packages/observability/log.ts");
  const result = spawnSync(
    "bun",
    [
      "--eval",
      `
    const { redirectObserverDiagnostics } = await import(${JSON.stringify(helper)});
    redirectObserverDiagnostics();
    const { log } = await import(${JSON.stringify(logger)});
    log.info("Xero transport response", { status: 200 });
    log.debug("Xero authorisation refreshed", { outcome: "committed" });
    process.stdout.write(JSON.stringify({ targetPresent: false, siblingPresent: true }) + "\\n");
  `,
    ],
    {
      encoding: "utf8",
      env: { ...process.env, NODE_ENV: "test" },
    }
  );
  expect(result.status).toBe(0);
  expect(JSON.parse(result.stdout)).toEqual({
    siblingPresent: true,
    targetPresent: false,
  });
  expect(result.stderr).toContain("Xero transport response");
  expect(result.stderr).toContain("Xero authorisation refreshed");
});
