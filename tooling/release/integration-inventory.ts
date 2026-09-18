import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

export const INTEGRATION_WORKSPACES = [
  "apps/app",
  "packages/availability",
  "packages/database",
  "packages/feeds",
  "packages/jobs",
  "packages/xero",
] as const;

const walk = (directory: string): string[] =>
  readdirSync(directory).flatMap((name) => {
    if (["node_modules", ".next", "generated"].includes(name)) {
      return [];
    }
    const path = join(directory, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });

export const discoverIntegrationTests = (root: string): string[] =>
  INTEGRATION_WORKSPACES.flatMap((workspace) =>
    walk(join(root, workspace))
      .filter((path) => path.endsWith(".integration.test.ts"))
      .map((path) => relative(root, path))
  ).sort();
