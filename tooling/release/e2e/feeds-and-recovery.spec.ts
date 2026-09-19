// biome-ignore-all lint/performance/useTopLevelRegex: Playwright locators run once per journey.
import { releaseEnvironment, requiredFixture } from "./environment.js";
import { expect, test, useRole } from "./fixture.js";

const { fixtures } = releaseEnvironment();

test("calendar feed displays and copies the exact active URL", async ({
  browser,
}) => {
  const { context, page } = await useRole(browser, "admin");
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto(`/feeds/${fixtures.feeds.primary}`);
  const field = page.getByLabel(/Subscribe URL for/);
  const displayed = await field.inputValue();
  expect(displayed).toMatch(/^https:\/\/.+\/ical\/.+\.ics$/);
  await page.getByRole("button", { name: "Copy URL" }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    displayed
  );
  await expect(page.getByRole("status")).toHaveText("Subscribe URL copied.");
  await context.close();
});

test("an ambiguous submission exposes recovery without issuing another create", async ({
  browser,
}) => {
  const { context, page } = await useRole(browser, "admin");
  await page.goto(`/plans?personId=${fixtures.people.recovery}`);
  const row = page.locator(`tr:has(a[href*="${fixtures.records.recovery}"])`);
  await expect(row).toBeVisible();
  await expect(
    row
      .getByRole("button", { name: /find|attach|not created|recover/i })
      .first()
  ).toBeVisible();
  await expect(
    row.getByRole("button", { name: "Retry submission" })
  ).toHaveCount(0);
  await page.reload();
  await expect(
    page.locator(`tr:has(a[href*="${fixtures.records.recovery}"])`)
  ).toHaveCount(1);
  await context.close();
});

test("a definitive failed submission can be retried to a known state", async ({
  browser,
}) => {
  const { context, page } = await useRole(browser, "viewer");
  await page.goto(`/plans?personId=${fixtures.people.retry}`);
  const row = page.locator(`tr:has(a[href*="${fixtures.records.retry}"])`);
  await expect(row).toContainText(/Submit failed|Xero sync failed/);
  await row.getByRole("button", { name: "Retry submission" }).click();
  await page
    .getByRole("button", { name: /confirm|retry/i })
    .last()
    .click();
  await expect(row).toContainText("Submitted");
  await context.close();
});

test("calendar shows the controlled published record", async ({ browser }) => {
  const { context, page } = await useRole(browser, "viewer");
  await page.goto("/calendar");
  await expect(
    page.getByText(requiredFixture("TC_E2E_CALENDAR_EVENT_LABEL")).first()
  ).toBeVisible();
  await context.close();
});
