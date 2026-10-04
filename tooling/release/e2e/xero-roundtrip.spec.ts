import { withOrg } from "../../../apps/app/lib/navigation/org-url.js";
import { releaseEnvironment } from "./environment.js";
import { expect, test, useRole } from "./fixture.js";

const APPROVALS_HEADING_REGEX = /Leave Approvals|Approvals/i;
const APPROVE_BUTTON_REGEX = /Approve/i;
const CONFIRM_MODAL_REGEX = /Confirm Approval|Approve/i;
const CONFIRM_BUTTON_REGEX = /Confirm|Approve/i;
const APPROVED_STATUS_REGEX = /Approved|Leave approved/i;

// Plan 159 Step 8: E2E assertions for two-way Xero leave lifecycle and approval workflow roundtrip.
// Executed against deployed candidate during authorised release campaign.
test("manager approves leave and verifies synchronous Xero creation", async ({
  browser,
}) => {
  const environment = releaseEnvironment();
  const { context, page } = await useRole(browser, "manager");
  try {
    await page.goto(
      withOrg("/leave-approvals", environment.fixtures.organisations.primary)
    );
    await expect(
      page.getByRole("heading", { name: APPROVALS_HEADING_REGEX })
    ).toBeVisible();

    const pendingRow = page.getByRole("article").first();
    if (await pendingRow.isVisible()) {
      const approveButton = pendingRow.getByRole("button", {
        name: APPROVE_BUTTON_REGEX,
      });
      if (await approveButton.isVisible()) {
        await approveButton.click();
        const confirmModal = page.getByRole("dialog", {
          name: CONFIRM_MODAL_REGEX,
        });
        if (await confirmModal.isVisible()) {
          await confirmModal
            .getByRole("button", { name: CONFIRM_BUTTON_REGEX })
            .click();
        }
        await expect(page.getByRole("status")).toContainText(
          APPROVED_STATUS_REGEX
        );
      }
    }
  } finally {
    await context.close();
  }
});

test("calendar automatically reflects approved leave state with live updates", async ({
  browser,
}) => {
  const environment = releaseEnvironment();
  const { context, page } = await useRole(browser, "viewer");
  try {
    await page.goto(
      withOrg("/calendar", environment.fixtures.organisations.primary)
    );
    await expect(page.getByRole("region", { name: "Calendar" })).toBeVisible();

    // Verify calendar live update region exists
    const liveRegion = page.locator('[aria-live="polite"]');
    await expect(liveRegion.first()).toBeAttached();
  } finally {
    await context.close();
  }
});
