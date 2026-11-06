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
      "account-audit",
      "accounts",
      "client",
      "helpers",
      "keys",
      "permissions",
      "provider",
      "proxy",
      "server",
      "route",
      "context",
      "bootstrap-context",
      "transport",
      "components/auth-form-frame",
      "components/account-picker",
      "redirects",
      "invitation-route",
    ]) {
      expect(existsSync(resolveModule(`@repo/auth/${subpath}`))).toBe(true);
    }
  });

  it("keeps adapters and the removed provider testing entry private", () => {
    for (const subpath of [
      "adapters/clerk.ts",
      "adapters/better-auth",
      "adapters/better-auth-accounts",
      "testing",
    ]) {
      expect(() => resolveModule(`@repo/auth/${subpath}`)).toThrow();
    }
  });
});
