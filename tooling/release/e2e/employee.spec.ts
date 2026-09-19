// biome-ignore-all lint/performance/useTopLevelRegex: Playwright locators run once per serial journey.
import { expect, test, useRole } from "./fixture.js";
import {
  persistReturnedId,
  reconcileCreate,
  recordIntendedCreate,
} from "./journey-ledger.js";

const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
const afterTomorrow = new Date(Date.now() + 172_800_000)
  .toISOString()
  .slice(0, 10);

test.describe
  .serial("employee leave and manual availability", () => {
    test("creates, edits and archives a manual availability record", async ({
      browser,
    }) => {
      const { context, page } = await useRole(browser, "viewer");
      const correlationId = crypto.randomUUID();
      recordIntendedCreate("manual_availability", correlationId);
      await page.goto("/plans/new");
      await page.getByLabel("Record type").click();
      await page.getByRole("option", { name: /Training:/ }).click();
      await page.getByLabel("Starts").fill(tomorrow);
      await page.getByLabel("Ends").fill(afterTomorrow);
      await page
        .getByLabel("Notes")
        .fill(`T1 manual ${process.env.TC_RELEASE_RUN_ID}`);
      await page.getByRole("button", { name: "Save" }).click();
      await expect(page).toHaveURL(/\/plans/);
      const row = page.getByRole("row").filter({ hasText: "Training" }).first();
      await expect(row).toBeVisible();
      const edit = row.getByRole("link", { name: /edit/i });
      const recordId = planIdFromHref(await edit.getAttribute("href"));
      persistReturnedId(correlationId, recordId);
      await edit.click();
      await page
        .getByLabel("Notes")
        .fill(`T1 manual edited ${process.env.TC_RELEASE_RUN_ID}`);
      await page.getByRole("button", { name: "Save changes" }).click();
      await expect(page.getByText(/T1 manual edited/)).toBeVisible();
      await row.getByRole("button", { name: /archive/i }).click();
      reconcileCreate(correlationId);
      await context.close();
    });

    test("drafts and submits controlled payroll leave", async ({ browser }) => {
      const { context, page } = await useRole(browser, "viewer");
      const correlationId = crypto.randomUUID();
      recordIntendedCreate("payroll_leave", correlationId);
      await page.goto("/plans/new");
      await page.getByLabel("Record type").click();
      await page.getByRole("option", { name: /Annual leave:/ }).click();
      await page.getByLabel("Starts").fill(tomorrow);
      await page.getByLabel("Ends").fill(afterTomorrow);
      await page.getByRole("button", { name: "Save draft" }).click();
      const row = page
        .getByRole("row")
        .filter({ hasText: "Annual leave" })
        .first();
      const recordId = planIdFromHref(
        await row.getByRole("link", { name: /edit/i }).getAttribute("href")
      );
      persistReturnedId(correlationId, recordId);
      await row.getByRole("button", { name: /submit/i }).click();
      await page
        .getByRole("button", { name: /confirm|submit/i })
        .last()
        .click();
      await expect(row).toContainText(/Submitted|Resolution required/);
      reconcileCreate(correlationId);
      await context.close();
    });
  });

function planIdFromHref(href: string | null): string {
  const match = href?.match(/\/plans\/([0-9a-f-]{36})/i);
  if (!match?.[1]) {
    throw new Error("Created plan did not expose its returned ID");
  }
  return match[1];
}
