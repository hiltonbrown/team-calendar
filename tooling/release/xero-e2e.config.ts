import { resolve } from "node:path";
import { defineConfig, devices } from "@playwright/test";
import { requireXeroRunnerContext } from "./xero-execution-guard.js";

const discovery =
  process.argv.includes("--list") && process.env.TC_XERO_DISCOVERY === "1";
const context = discovery ? null : requireXeroRunnerContext();

export default defineConfig({
  expect: { timeout: 15_000 },
  forbidOnly: true,
  fullyParallel: false,
  outputDir:
    context?.output ?? resolve("tooling/release/test-results/discovery"),
  projects: [
    {
      name: "xero-oauth",
      testMatch: /xero-oauth\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        screenshot: "off" as const,
        trace: "off" as const,
        video: "off" as const,
      },
    },
    {
      name: "xero-scenarios",
      testMatch: /xero-scenarios\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        screenshot: "only-on-failure",
        trace: "retain-on-failure",
        video: "retain-on-failure",
      },
    },
    {
      name: "xero-controlled-browser",
      testMatch:
        /xero-(intent-guards|recovery-reasons|disconnect-receipts)\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        screenshot: "off" as const,
        trace: "off" as const,
        video: "off" as const,
      },
    },
  ],
  reporter: [["list"]],
  retries: 0,
  testDir: "./e2e",
  timeout: 15 * 60_000,
  use: { baseURL: context?.appUrl },
  workers: 1,
});
