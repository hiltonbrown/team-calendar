// biome-ignore-all lint/performance/useTopLevelRegex: Playwright locators run once per journey.
import { expect, test, useRole } from "./fixture.js";

test("authentication: protected redirect preserves the requested destination", async ({
  page,
}) => {
  await page.goto("/plans/new");
  await expect(page).toHaveURL(/sign-in/);
  await expect(page.locator(".cl-signIn-root")).toBeVisible();
  const url = new URL(page.url());
  expect([...url.searchParams.values()].join(" ")).toContain("plans");
});

test("authentication: admitted viewer session excludes personal-account access", async ({
  browser,
}) => {
  const { context, page } = await useRole(browser, "viewer");
  await page.goto("/plans");
  await expect(page.getByRole("heading", { name: "Plans" })).toBeVisible();
  await expect(page).not.toHaveURL(/sign-in/);
  await context.close();
});
