// biome-ignore-all lint/performance/useTopLevelRegex: Playwright locators run once per journey.
import { releaseEnvironment } from "./environment.js";
import { expect, test, useRole } from "./fixture.js";

const environment = releaseEnvironment();

test("public and authenticated candidate shells are healthy", async ({
  browser,
  page,
}) => {
  await page.goto(environment.webUrl);
  await expect(page.locator("body")).toContainText(/Team Calendar/i);
  const authenticated = await useRole(browser, "viewer");
  await authenticated.page.goto("/calendar");
  await expect(
    authenticated.page.getByRole("heading", { name: /calendar/i })
  ).toBeVisible();
  await authenticated.context.close();
});
