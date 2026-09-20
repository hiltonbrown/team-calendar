import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "server-only": path.resolve(
        import.meta.dirname,
        "../../node_modules/.bun/server-only@0.0.1/node_modules/server-only/empty.js"
      ),
    },
    conditions: ["react-server", "node"],
  },
  test: {
    environment: "node",
    testTimeout: 30_000,
  },
});
