import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  providerImports,
  repositoryProviderImports,
} from "./provider-imports.js";

describe("auth provider import boundary", () => {
  it.each([
    'import { auth } from "@clerk/nextjs/server";',
    'export * from "@clerk/nextjs";',
    'import type { User } from "@clerk/types";',
    'type User = import("@clerk/types").User;',
    'const auth = await import("better-auth");',
    'const auth = require("better-auth/client");',
    'import auth = require("@clerk/backend");',
    'vi.mock("@clerk/nextjs/server");',
    'await vi.importActual("@clerk/nextjs");',
    'jest.doMock("@better-auth/infra");',
    'vi.mock("@repo/auth/node_modules/@clerk/nextjs/server");',
    String.raw`import { auth } from "@cl\u0065rk/nextjs";`,
    String.raw`import { auth } from "@cl\
erk/nextjs";`,
  ])("rejects provider loading: %s", (source) => {
    expect(providerImports("apps/example.ts", source)).toHaveLength(1);
  });

  it("allows the facade and ordinary provider documentation strings", () => {
    expect(
      providerImports(
        "apps/example.ts",
        'import { getSession } from "@repo/auth/server"; const note = "better-auth"; // import("@clerk/nextjs")'
      )
    ).toEqual([]);
  });

  it("keeps every provider import inside packages/auth", () => {
    const root = fileURLToPath(new URL("../../", import.meta.url));
    expect(repositoryProviderImports(root)).toEqual([]);
  });
});
