// biome-ignore-all lint/performance/useTopLevelRegex: Playwright locators run once per serial journey.
import { findCreatedRecordId } from "./created-record.js";
import { releaseEnvironment } from "./environment.js";
import { expect, rowForRecord, test, useRole } from "./fixture.js";
import {
  persistReturnedId,
  reconcileCreate,
  recordIntendedCreate,
} from "./journey-ledger.js";

const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
const afterTomorrow = new Date(Date.now() + 172_800_000)
  .toISOString()
  .slice(0, 10);
const runId = process.env.TC_RELEASE_RUN_ID;
const { fixtures } = releaseEnvironment();

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
      const note = `T1 manual ${runId} ${correlationId}`;
      await page.getByLabel("Notes").fill(note);
      await page.getByRole("button", { name: "Save" }).click();
      await expect(page).toHaveURL(/\/plans/);
      const recordId = await findCreatedRecordId({
        notes: note,
        personId: fixtures.people.viewer,
      });
      persistReturnedId(correlationId, recordId);
      const row = rowForRecord(page, recordId);
      await expect(row).toBeVisible();
      const edit = row.getByRole("link", { name: /edit/i });
      await edit.click();
      await page
        .getByLabel("Notes")
        .fill(`T1 manual edited ${process.env.TC_RELEASE_RUN_ID}`);
      await page.getByRole("button", { name: "Save changes" }).click();
      await expect(page.getByText(/T1 manual edited/)).toBeVisible();
      await row.getByRole("button", { name: /archive/i }).click();
      await expect(row).toHaveCount(0);
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
      const note = `T1 payroll ${runId} ${correlationId}`;
      await page.getByLabel("Notes").fill(note);
      await page.getByRole("button", { name: "Save draft" }).click();
      await expect(page).toHaveURL(/\/plans/);
      const recordId = await findCreatedRecordId({
        notes: note,
        personId: fixtures.people.viewer,
      });
      persistReturnedId(correlationId, recordId);
      const row = rowForRecord(page, recordId);
      await expect(row).toBeVisible();
      await row.getByRole("button", { name: /submit/i }).click();
      await page
        .getByRole("button", { name: /confirm|submit/i })
        .last()
        .click();
      await expect(row).toContainText("Submitted");
      await row.getByRole("button", { name: "Withdraw" }).click();
      await page.getByRole("button", { name: "Withdraw from Xero" }).click();
      await expect(row).toContainText("Withdrawn");
      reconcileCreate(correlationId);
      await context.close();
    });
  });
