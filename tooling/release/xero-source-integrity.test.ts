import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, expect, it } from "vitest";
import { assertReviewedXeroSource } from "./xero-source-integrity.js";

const directories: string[] = [];
function repository() {
  const cwd = mkdtempSync(resolve(tmpdir(), "xero-candidate-"));
  directories.push(cwd);
  execFileSync("git", ["init", "-q"], { cwd });
  mkdirSync(resolve(cwd, "tooling"));
  writeFileSync(
    resolve(cwd, "tooling/driver.ts"),
    "export const reviewed = true;\n"
  );
  writeFileSync(resolve(cwd, ".gitignore"), "tooling/private/\n");
  execFileSync("git", ["add", "."], { cwd });
  execFileSync(
    "git",
    [
      "-c",
      "user.name=Harness",
      "-c",
      "user.email=harness@example.invalid",
      "commit",
      "-qm",
      "reviewed",
    ],
    { cwd }
  );
  const sha = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd,
    encoding: "utf8",
  }).trim();
  return { cwd, sha };
}
afterEach(() => {
  for (const path of directories.splice(0)) {
    rmSync(path, { force: true, recursive: true });
  }
});
it.each(["tracked", "untracked"])(
  "rejects a %s driver change under the approved HEAD",
  (kind) => {
    const { cwd, sha } = repository();
    expect(() => assertReviewedXeroSource(sha, cwd)).not.toThrow();
    writeFileSync(
      resolve(
        cwd,
        kind === "tracked" ? "tooling/driver.ts" : "tooling/new-driver.ts"
      ),
      "changed"
    );
    expect(() => assertReviewedXeroSource(sha, cwd)).toThrow("dirty");
  }
);
it("allows ignored private evidence and rejects another candidate", () => {
  const { cwd, sha } = repository();
  mkdirSync(resolve(cwd, "tooling/private"));
  writeFileSync(resolve(cwd, "tooling/private/ledger.json"), "private");
  expect(() => assertReviewedXeroSource(sha, cwd)).not.toThrow();
  expect(() => assertReviewedXeroSource("a".repeat(40), cwd)).toThrow(
    "differs"
  );
});

it("rejects ignore-rule edits that hide an unreviewed route under the same HEAD", () => {
  const { cwd, sha } = repository();
  writeFileSync(resolve(cwd, ".gitignore"), "apps/hidden.ts\n");
  mkdirSync(resolve(cwd, "apps"));
  writeFileSync(resolve(cwd, "apps/hidden.ts"), "unreviewed");
  expect(() => assertReviewedXeroSource(sha, cwd)).toThrow("dirty");
});
