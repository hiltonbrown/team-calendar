import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // The Next.js tsconfig preserves JSX, so tests compile it here instead.
  oxc: {
    jsx: { runtime: "automatic" },
  },
  resolve: {
    alias: [
      {
        find: "@repo/design-system",
        replacement: path.resolve(import.meta.dirname, "./"),
      },
      {
        find: "@repo",
        replacement: path.resolve(import.meta.dirname, "../"),
      },
    ],
  },
  test: {
    environment: "jsdom",
  },
});
