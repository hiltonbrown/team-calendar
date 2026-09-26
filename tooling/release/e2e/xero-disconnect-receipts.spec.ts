import { z } from "zod";
import { withOrg } from "../../../apps/app/lib/navigation/org-url.js";
import { releaseEnvironment } from "./environment.js";
import { expect, test, useRole } from "./fixture.js";

// Plan 160 must seed three already-disconnected, manifest-owned organisations
// under the authenticated admin's Clerk Org, with the stated persisted receipts.
// Disconnect is then an idempotent receipt read; no provider DELETE is issued.
// Missing scenario fixtures fail explicitly. This spec has not been executed.
const environment = releaseEnvironment();
const cases = [
  {
    message:
      "Sync stopped. Team Calendar no longer uses this Xero connection. To remove it from Xero as well, open Connected apps in Xero.",
    remoteStatus: "left_in_place",
  },
  {
    message: "Sync stopped. Xero disconnection is pending.",
    remoteStatus: "pending",
  },
  {
    message:
      "Sync stopped. We could not confirm the Xero disconnection. Contact support for help.",
    remoteStatus: "unknown",
  },
];
for (const scenario of cases) {
  test(`disconnect receipt remains truthful: ${scenario.remoteStatus}`, async ({
    browser,
  }) => {
    const fixtures = z
      .array(
        z.object({
          organisationId: z.uuid(),
          organisationName: z.string().min(1),
          remoteStatus: z.enum(["left_in_place", "pending", "unknown"]),
        })
      )
      .length(3)
      .parse(
        JSON.parse(process.env.TC_E2E_XERO_RECEIPT_FIXTURES_JSON ?? "null")
      );
    if (
      new Set(fixtures.map((row) => row.organisationId)).size !== 3 ||
      new Set(fixtures.map((row) => row.remoteStatus)).size !== 3 ||
      fixtures.some(
        (row) =>
          !environment.manifest.owned.organisationIds.includes(
            row.organisationId
          )
      )
    ) {
      throw new Error(
        "Plan 160 requires three distinct owned Xero receipt scenario fixtures"
      );
    }
    const fixture = fixtures.find(
      (row) => row.remoteStatus === scenario.remoteStatus
    );
    if (!fixture) {
      throw new Error("Required Xero receipt scenario fixture is absent");
    }
    const { context, page } = await useRole(browser, "admin");
    try {
      await page.goto(
        withOrg("/settings/integrations/xero", fixture.organisationId)
      );
      const organisation = page.locator('[data-slot="card"]').filter({
        has: page.getByText(fixture.organisationName, { exact: true }),
      });
      await expect(organisation).toBeVisible();
      await organisation
        .getByText("Connection controls", { exact: true })
        .click();
      await organisation
        .getByRole("button", { exact: true, name: "Disconnect Xero" })
        .click();
      const dialog = page.getByRole("alertdialog", {
        name: "Disconnect Xero?",
      });
      await dialog
        .getByLabel(`Type ${fixture.organisationName} to confirm`)
        .fill(fixture.organisationName);
      await dialog
        .getByRole("button", { exact: true, name: "Disconnect Xero" })
        .click();
      await expect(
        page.getByRole("status").filter({ hasText: scenario.message })
      ).toBeVisible();
    } finally {
      await context.close();
    }
  });
}
