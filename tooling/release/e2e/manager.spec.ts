// biome-ignore-all lint/performance/useTopLevelRegex: Playwright locators run once per serial journey.
import { releaseEnvironment, requiredFixture } from "./environment.js";
import { expect, rowForRecord, test, useRole } from "./fixture.js";

const { fixtures } = releaseEnvironment();

test.describe
  .serial("manager payroll decisions", () => {
    test("approves the controlled submitted request", async ({ browser }) => {
      const manager = await useRole(browser, "manager");
      const { page } = manager;
      const employee = requiredFixture("TC_E2E_APPROVE_EMPLOYEE_NAME");
      await page.goto("/leave-approvals");
      const row = rowForRecord(page, fixtures.records.approve).filter({
        hasText: employee,
      });
      await row.getByRole("button", { name: "Approve" }).click();
      await page.getByRole("button", { name: "Confirm and approve" }).click();
      await expect(page.getByText("Leave approved in Xero")).toBeVisible();
      await manager.context.close();
      const viewer = await useRole(browser, "viewer");
      await viewer.page.goto("/plans");
      const approved = rowForRecord(viewer.page, fixtures.records.approve);
      await approved.getByRole("button", { name: "Withdraw" }).click();
      await viewer.page
        .getByRole("button", { name: "Withdraw from Xero" })
        .click();
      await expect(
        viewer.page.getByText("Submission withdrawn.")
      ).toBeVisible();
      await viewer.context.close();
    });

    test("requires a reason and declines the controlled submitted request", async ({
      browser,
    }) => {
      const { context, page } = await useRole(browser, "manager");
      const employee = requiredFixture("TC_E2E_DECLINE_EMPLOYEE_NAME");
      await page.goto("/leave-approvals");
      const row = rowForRecord(page, fixtures.records.decline).filter({
        hasText: employee,
      });
      await row.getByRole("button", { name: "Decline" }).click();
      await expect(
        page.getByRole("button", { name: /confirm.*decline/i })
      ).toBeDisabled();
      await page.getByLabel("Reason").fill("Controlled release verification");
      await page.getByRole("button", { name: /confirm.*decline/i }).click();
      await expect(page.getByText("Leave declined in Xero")).toBeVisible();
      await context.close();
    });
  });
