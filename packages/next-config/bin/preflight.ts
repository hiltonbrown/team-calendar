#!/usr/bin/env bun
import type { LaunchMode } from "../launch-mode";
import { type AppName, runProductionPreflight } from "../preflight";

const args = process.argv.slice(2);
const appNameArg = args[0] as AppName;
const [, launchModeValue] = args;
const launchModeArg = ["early_access", "paid"].includes(launchModeValue ?? "")
  ? (launchModeValue as LaunchMode)
  : undefined;

if (!["app", "api", "web"].includes(appNameArg)) {
  console.error("Usage: bun run preflight <app|api|web> [early_access|paid]");
  process.exit(1);
}

if (launchModeValue && !launchModeArg) {
  console.error('Launch mode assertion must be "early_access" or "paid".');
  process.exit(1);
}

try {
  const result = runProductionPreflight({
    appName: appNameArg,
    launchMode: launchModeArg,
  });
  console.log(
    `✅ Production preflight PASSED for app "${result.appName}" in launch mode "${result.launchMode}". Checked ${result.checkedVars.length} variables.`
  );
  process.exit(0);
} catch (error) {
  console.error((error as Error).message);
  process.exit(1);
}
