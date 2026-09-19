import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const baseFlag = process.argv.indexOf("--base");
const base = baseFlag >= 0 ? process.argv[baseFlag + 1] : undefined;
if (!(base && /^[0-9a-f]{7,40}$/.test(base))) {
  throw new Error("Usage: migration-check.ts --base <trusted-commit>");
}
const root = resolve(import.meta.dirname, "../..");
const migrationRoot = "packages/database/prisma/migrations";
const runGit = (args: string[]) => {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(result.stderr || "Git migration check failed");
  }
  return result.stdout.trim();
};

const baseFiles = runGit([
  "ls-tree",
  "-r",
  "--name-only",
  base,
  "--",
  migrationRoot,
])
  .split("\n")
  .filter(Boolean);
const immutable = spawnSync(
  "git",
  ["diff", "--no-renames", "--exit-code", base, "--", ...baseFiles],
  { cwd: root, encoding: "utf8" }
);
if (immutable.status !== 0) {
  throw new Error("Existing migration bytes differ from the trusted base");
}
const baseDirectories = baseFiles
  .filter((path) => path.endsWith("/migration.sql"))
  .map((path) => path.split("/").at(-2))
  .filter((value): value is string => Boolean(value));
const newestBase = [...baseDirectories].sort().at(-1) ?? "";
const currentDirectories = readdirSync(resolve(root, migrationRoot), {
  withFileTypes: true,
})
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
const baseDirectorySet = new Set(baseDirectories);
for (const directory of baseDirectorySet) {
  if (!currentDirectories.includes(directory)) {
    throw new Error(
      `Trusted migration ${directory} is missing from the candidate`
    );
  }
}
const addedDirectories = currentDirectories.filter(
  (directory) => !baseDirectorySet.has(directory)
);
for (const directory of addedDirectories) {
  if (directory <= newestBase) {
    throw new Error(
      `New migration ${directory} is not ordered after ${newestBase}`
    );
  }
  if (!existsSync(resolve(root, migrationRoot, directory, "migration.sql"))) {
    throw new Error(`New migration ${directory} has no migration.sql`);
  }
}
console.log(
  JSON.stringify({
    addedMigrations: addedDirectories,
    base,
    immutableMigrations: new Set(baseDirectories).size,
  })
);
