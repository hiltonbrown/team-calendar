import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const UNRESTRICTED_IMPORT =
  /import\s*\{[^}]*\bdatabase\b[^}]*\}\s*from\s*["']@repo\/database["']/s;
const SYSTEM_IMPORT =
  /import\s*\{[^}]*\bsystemDatabase\b[^}]*\}\s*from\s*["']@repo\/database["']/s;

function sources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return sources(path);
    }
    return entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")
      ? [path]
      : [];
  });
}

describe("tenant database boundary", () => {
  it("does not expose the owner database to jobs or Xero tenant code", () => {
    const paths = [
      ...sources(new URL(".", import.meta.url).pathname),
      ...sources(new URL("../../xero/src", import.meta.url).pathname),
    ];
    const unrestricted = paths.filter((path) =>
      UNRESTRICTED_IMPORT.test(readFileSync(path, "utf8"))
    );
    expect(unrestricted).toEqual([]);
  });
  it("limits system access to credential handling and named account fan-outs", () => {
    const allowed = new Set([
      "handlers/recover-xero-import-dispatch.ts",
      "handlers/send-notification-emails.ts",
      "oauth/authorisation.ts",
      "oauth/reencrypt-tokens.ts",
      "oauth/service.ts",
    ]);
    const roots = [
      new URL(".", import.meta.url).pathname,
      new URL("../../xero/src", import.meta.url).pathname,
    ];
    const unexpected = roots.flatMap((root) =>
      sources(root).filter(
        (path) =>
          SYSTEM_IMPORT.test(readFileSync(path, "utf8")) &&
          !allowed.has(relative(root, path))
      )
    );
    expect(unexpected).toEqual([]);
  });
});
