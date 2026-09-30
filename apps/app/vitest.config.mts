import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      {
        find: "@repo/database/xero-campaign-access",
        replacement: path.resolve(
          import.meta.dirname,
          "../../packages/database/src/xero-campaign-access.ts"
        ),
      },
      {
        find: "@repo/database/xero-campaign-contract",
        replacement: path.resolve(
          import.meta.dirname,
          "../../packages/database/src/xero-campaign-contract.ts"
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
  },
});
