// biome-ignore-all lint/performance/useTopLevelRegex: Playwright locators run once per viewport project.
import { expect, test } from "./fixture.js";

test("responsive shell reflows with keyboard names and reduced motion", async ({
  page,
}) => {
  await page.goto("/calendar");
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth
    )
  ).toBe(true);
  await expect(page.getByRole("heading", { name: /calendar/i })).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(page.locator(":focus-visible")).toBeVisible();
  expect(
    await page.evaluate(
      () => matchMedia("(prefers-reduced-motion: reduce)").matches
    )
  ).toBe(true);
});
