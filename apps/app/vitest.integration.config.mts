import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: [
      {
        find: "@repo/database/system",
        replacement: path.resolve(
          import.meta.dirname,
          "../../packages/database/src/system-client"
        ),
      },
      {
        find: "@repo/database/live-test-fixture",
        replacement: path.resolve(
          import.meta.dirname,
          "../../packages/database/src/live-test-fixture.ts"
        ),
      },
      {
        // Subpath exports that map into src/ must resolve before the
        // directory alias below.
        find: /^@repo\/database\/(tenant-db|tenant-client|test-fixtures\/tenant-scope|is-local-database|runtime-role)$/,
        replacement: path.resolve(
          import.meta.dirname,
          "../../packages/database/src/$1"
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
    // Suite hooks import the full server action graph; under turbo's
    // concurrent integration run that can exceed the 10s default.
    hookTimeout: 30_000,
    passWithNoTests: false,
    testTimeout: 30_000,
  },
});
