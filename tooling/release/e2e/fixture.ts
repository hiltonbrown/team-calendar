// biome-ignore-all lint/performance/useTopLevelRegex: Shared Playwright assertions run once per journey.
import {
  type Browser,
  test as base,
  type Page,
  expect as playwrightExpect,
} from "@playwright/test";
import {
  type ReleaseRole,
  releaseEnvironment,
  roleEmail,
} from "./environment.js";

const environment = releaseEnvironment();

export const test = base.extend<{ errors: string[] }>({
  errors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on("console", (message) => {
        if (message.type() === "error") {
          errors.push(`console: ${message.text()}`);
        }
      });
      page.on("pageerror", (error) => errors.push(`page: ${error.message}`));
      await use(errors);
      playwrightExpect(
        errors,
        "unexpected browser console or page errors"
      ).toEqual([]);
    },
    { auto: true },
  ],
});

export { expect } from "@playwright/test";

export async function useRole(browser: Browser, role: ReleaseRole) {
  const context = await browser.newContext({
    storageState: environment.authFiles[role],
  });
  const page = await context.newPage();
  await page.goto("/");
  await page.waitForFunction(() => Boolean(window.Clerk?.user));
  const identity = await page.evaluate(() => ({
    email: window.Clerk?.user?.primaryEmailAddress?.emailAddress,
    role: window.Clerk?.user?.organizationMemberships.find(
      (membership) =>
        membership.organization.id === window.Clerk?.organization?.id
    )?.role,
  }));
  playwrightExpect(identity.email).toBe(roleEmail(role));
  playwrightExpect(identity.role).toBe(`org:${role}`);
  return { context, page };
}

export async function expectRoleDenied(page: Page, path: string) {
  const response = await page.goto(path);
  playwrightExpect(response?.status()).toBeLessThan(500);
  await playwrightExpect(
    page.getByText(/not authorised|permission|not found/i).first()
  ).toBeVisible();
}
