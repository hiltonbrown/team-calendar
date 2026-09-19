// biome-ignore-all lint/performance/useTopLevelRegex: Playwright locators run once per admission journey.
import { setupClerkTestingToken } from "@clerk/testing/playwright";
import { releaseEnvironment } from "./environment.js";
import { expect, test, useRole } from "./fixture.js";

const environment = releaseEnvironment();

test("invite-only admission rejects uninvited direct sign-up", async ({
  page,
}) => {
  await setupClerkTestingToken({ page });
  await page.goto("/sign-up");
  await expect(page.locator(".cl-signUp-root")).toBeVisible();
  await expect(
    page.getByText(/invite|invitation|not accepting/i).first()
  ).toBeVisible();
});

for (const [state, invitationUrl] of [
  ["expired", environment.fixtures.admission.expiredInvitationUrl],
  ["revoked", environment.fixtures.admission.revokedInvitationUrl],
] as const) {
  test(`${state} invitation cannot create a session`, async ({ page }) => {
    await setupClerkTestingToken({ page });
    await page.goto(invitationUrl);
    await expect(
      page.getByText(/expired|revoked|invalid|no longer/i).first()
    ).toBeVisible();
  });
}

test("admitted new owner has owner identity and administration access", async ({
  browser,
}) => {
  const { context, page } = await useRole(browser, "owner");
  await page.goto("/settings/integrations/xero");
  await expect(
    page.getByRole("heading", { name: "Xero Payroll" })
  ).toBeVisible();
  await context.close();
});
