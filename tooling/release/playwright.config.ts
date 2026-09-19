// biome-ignore-all lint/performance/useTopLevelRegex: Playwright project matchers are one-time configuration.

import { resolve } from "node:path";
import { defineConfig, devices } from "@playwright/test";
import { releaseEnvironment } from "./e2e/environment.js";

const environment = releaseEnvironment();

export default defineConfig({
  expect: { timeout: 15_000 },
  forbidOnly: true,
  fullyParallel: false,
  globalTeardown: "./e2e/global.teardown.ts",
  outputDir: resolve(import.meta.dirname, "test-results"),
  projects: [
    { name: "setup", testMatch: /global\.setup\.ts/ },
    {
      dependencies: ["setup"],
      name: "chromium-core",
      testIgnore: [/global\.setup\.ts/, /shell-matrix\.spec\.ts/],
      use: { ...devices["Desktop Chrome"] },
    },
    {
      dependencies: ["setup"],
      name: "firefox-core",
      testMatch: /core-readonly\.spec\.ts/,
      use: { ...devices["Desktop Firefox"] },
    },
    {
      dependencies: ["setup"],
      name: "webkit-core",
      testMatch: /core-readonly\.spec\.ts/,
      use: { ...devices["Desktop Safari"] },
    },
    ...[390, 768, 1440].flatMap((width) =>
      (["light", "dark"] as const).map((colourScheme) => ({
        dependencies: ["setup"],
        name: `chromium-${width}-${colourScheme}`,
        testMatch: /shell-matrix\.spec\.ts/,
        use: {
          ...devices["Desktop Chrome"],
          colorScheme: colourScheme,
          reducedMotion: "reduce" as const,
          storageState: environment.authFiles.viewer,
          viewport: { height: 900, width },
        },
      }))
    ),
  ],
  reporter: [
    ["list"],
    [
      "html",
      {
        open: "never",
        outputFolder: resolve(import.meta.dirname, "playwright-report"),
      },
    ],
  ],
  retries: 0,
  testDir: "./e2e",
  timeout: 90_000,
  use: {
    baseURL: environment.appUrl,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  workers: 1,
});
