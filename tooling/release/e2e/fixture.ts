// biome-ignore-all lint/performance/useTopLevelRegex: Shared Playwright assertions run once per journey.

import {
  type Browser,
  test as base,
  type Page,
  expect as playwrightExpect,
} from "@playwright/test";
import { readBrowserAuthIdentity } from "@repo/auth/testing/playwright";
import { validateReleaseFixtureOwnership } from "./created-record.js";
import {
  type ReleaseRole,
  releaseEnvironment,
  roleEmail,
} from "./environment.js";

const browserErrors = new WeakMap<Browser, string[]>();

export const test = base.extend<{ errors: string[] }>({
  errors: [
    async ({ browser, page }, use) => {
      const errors: string[] = [];
      browserErrors.set(browser, errors);
      attachErrorCapture(page, errors);
      await use(errors);
      playwrightExpect(
        errors,
        "unexpected browser console or page errors"
      ).toEqual([]);
      browserErrors.delete(browser);
    },
    { auto: true },
  ],
});

export { expect } from "@playwright/test";

export async function useRole(browser: Browser, role: ReleaseRole) {
  const environment = releaseEnvironment();
  const errors = browserErrors.get(browser);
  if (!errors) {
    throw new Error("Role pages require the automatic browser error fixture");
  }
  const context = await browser.newContext({
    baseURL: environment.appUrl,
    storageState: environment.authFiles[role],
  });
  context.on("page", (rolePage) => attachErrorCapture(rolePage, errors));
  const page = await context.newPage();
  await page.goto("/");
  const identity = await readBrowserAuthIdentity(page);
  const fixtureIdentity = await validateReleaseFixtureOwnership();
  playwrightExpect(identity.email).toBe(roleEmail(role));
  playwrightExpect(identity.accountId).toBe(fixtureIdentity.primaryAccountId);
  playwrightExpect(identity.role).toBe(role);
  if (role === "viewer") {
    playwrightExpect(identity.userId).toBe(fixtureIdentity.viewerUserId);
  }
  return { context, page };
}

function attachErrorCapture(page: Page, errors: string[]) {
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(`console: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => errors.push(`page: ${error.message}`));
}

export async function expectRoleDenied(page: Page, path: string) {
  const response = await page.goto(path);
  playwrightExpect(response?.status()).toBeLessThan(500);
  await playwrightExpect(
    page.getByText(/not authorised|permission|not found/i).first()
  ).toBeVisible();
}

export function rowForRecord(page: Page, recordId: string) {
  return page
    .getByRole("row")
    .filter({ has: page.locator(`a[href*="/plans/${recordId}"]`) });
}
