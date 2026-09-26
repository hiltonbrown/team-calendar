import { execFileSync } from "node:child_process";

const sourceRoots = ["apps/", "packages/", "tooling/", "scripts/", ".github/"];
const rootSources = new Set([
  ".gitignore",
  "package.json",
  "bun.lock",
  "bun.lockb",
  "turbo.json",
  "tsconfig.json",
  "biome.jsonc",
]);
function isSource(path: string) {
  return (
    rootSources.has(path) || sourceRoots.some((root) => path.startsWith(root))
  );
}
export function assertReviewedXeroSource(
  candidateSha: string,
  cwd = process.cwd()
) {
  const actual = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd,
    encoding: "utf8",
  }).trim();
  if (actual !== candidateSha) {
    throw new Error("Reviewed Xero candidate differs");
  }
  const records = execFileSync(
    "git",
    ["status", "--porcelain=v1", "-z", "--untracked-files=all"],
    { cwd, encoding: "utf8" }
  ).split("\0");
  const iterator = records[Symbol.iterator]();
  for (const record of iterator) {
    if (!record) {
      continue;
    }
    if (isSource(record.slice(3))) {
      throw new Error("Reviewed Xero source is dirty");
    }
    if (
      (record.slice(0, 2).includes("R") || record.slice(0, 2).includes("C")) &&
      isSource(iterator.next().value ?? "")
    ) {
      throw new Error("Reviewed Xero source is dirty");
    }
  }
}
