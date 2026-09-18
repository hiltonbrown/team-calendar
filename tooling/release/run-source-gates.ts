import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const commands = [
  ["bun", ["run", "--cwd", "packages/database", "build"]],
  ["bun", ["run", "check"]],
  ["bun", ["run", "build"]],
  ["bun", ["run", "typecheck"]],
  ["bun", ["run", "boundaries"]],
  ["bun", ["run", "test"]],
  ["bun", ["run", "test:release-tools"]],
  ["bun", ["run", "typecheck:release-tools"]],
] as const;

const environment = { ...process.env };
for (const key of Object.keys(environment)) {
  if (
    key.includes("DATABASE") ||
    key.includes("NEON") ||
    key === "ALLOW_LIVE_DATABASE_TESTS" ||
    key.startsWith("TC_RELEASE_")
  ) {
    delete environment[key];
  }
}
environment.NODE_ENV = "test";
environment.TC_SOURCE_GATES = "1";
environment.NODE_OPTIONS = [
  environment.NODE_OPTIONS,
  `--import=${resolve(import.meta.dirname, "deny-network.mjs")}`,
]
  .filter(Boolean)
  .join(" ");
environment.XERO_TOKEN_ENCRYPTION_KEY =
  "WE552bw0+Wd6mi3TXcaj5P72E2x7gA7UPna73SevrmE=";

for (const [command, args] of commands) {
  const result = spawnSync(command, [...args], {
    cwd: root,
    env: environment,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
