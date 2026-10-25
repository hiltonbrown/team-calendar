import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const resolveModule = createRequire(import.meta.url).resolve;

describe("auth package public exports", () => {
  it("resolves the release testing wrapper to its TypeScript source", () => {
    expect(resolveModule("@repo/auth/testing/playwright")).toBe(
      fileURLToPath(new URL("./testing/playwright.ts", import.meta.url))
    );
  });

  it("preserves the public runtime and component subpaths", () => {
    for (const subpath of [
      "accounts",
      "client",
      "helpers",
      "keys",
      "permissions",
      "provider",
      "proxy",
      "server",
      "testing",
      "transport",
      "components/auth-form-frame",
      "components/choose-organization-task",
      "components/embedded-auth-appearance",
      "components/sign-in",
      "components/sign-up",
    ]) {
      expect(existsSync(resolveModule(`@repo/auth/${subpath}`))).toBe(true);
    }
  });

  it("does not export provider adapters", () => {
    expect(() => resolveModule("@repo/auth/adapters/clerk.ts")).toThrow();
  });
});
