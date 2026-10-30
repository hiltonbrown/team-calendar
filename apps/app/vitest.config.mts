import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
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
      { find: "@", replacement: path.resolve(import.meta.dirname, "./") },
    ],
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
  },
});
