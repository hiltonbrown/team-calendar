// biome-ignore-all lint/performance/useTopLevelRegex: Playwright locators run once per journey.

import { withOrg } from "../../../apps/app/lib/navigation/org-url.js";
import { releaseEnvironment } from "./environment.js";
import { expect, expectRoleDenied, test, useRole } from "./fixture.js";

const { fixtures } = releaseEnvironment();

test("admin runs a controlled people import through the live Xero connection", async ({
  browser,
}) => {
  const { context, page } = await useRole(browser, "admin");
  await page.goto(
    withOrg("/settings/integrations/xero", fixtures.organisations.primary)
  );
  await expect(
    page.getByRole("heading", { name: "Xero Payroll" })
  ).toBeVisible();
  const syncPeople = page
    .getByRole("button", { name: /Sync people( now)?/ })
    .first();
  await expect(syncPeople).toBeVisible();
  await syncPeople.click();
  await expect(page.getByRole("status")).toContainText(
    /Sync (queued|succeeded|completed)/i
  );
  await context.close();
});

test("viewer cannot approve, administer or access another tenant direct ID", async ({
  browser,
}) => {
  const { context, page } = await useRole(browser, "viewer");
  await expectRoleDenied(page, "/settings/integrations/xero");
  await expectRoleDenied(page, "/leave-approvals");
  await expectRoleDenied(page, `/people/${fixtures.people.foreign}`);
  await context.close();
});
