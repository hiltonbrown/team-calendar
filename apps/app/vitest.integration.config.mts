import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: [
      {
        find: "@repo/database/live-test-fixture",
        replacement: path.resolve(
          import.meta.dirname,
          "../../packages/database/src/live-test-fixture.ts"
        ),
      },
      {
        find: "@repo",
        replacement: path.resolve(import.meta.dirname, "../../packages"),
      },
      {
        find: "@",
        replacement: path.resolve(import.meta.dirname, "./"),
      },
      {
        find: "server-only",
        replacement: path.resolve(
          import.meta.dirname,
          "../../node_modules/.bun/server-only@0.0.1/node_modules/server-only/empty.js"
        ),
      },
    ],
    conditions: ["react-server", "node"],
  },
  test: {
    environment: "node",
    passWithNoTests: false,
    testTimeout: 30_000,
  },
});
