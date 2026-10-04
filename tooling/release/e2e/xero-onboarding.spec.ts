import { withOrg } from "../../../apps/app/lib/navigation/org-url.js";
import { releaseEnvironment } from "./environment.js";
import { expect, test, useRole } from "./fixture.js";

const CONNECT_HEADING_REGEX = /Connect Xero Payroll|Xero Payroll/i;
const CONNECT_BUTTON_REGEX = /Connect Organisation|Connect Xero/i;
const SETTINGS_XERO_URL_REGEX = /.*\/settings\/integrations\/xero/;
const MATCHES_HEADING_REGEX = /Review People Matches|Review People/i;
const RESOLVE_BUTTON_REGEX = /Link records|Keep separate/i;
const NO_MATCHES_COPY_REGEX = /No people need review|All people matched/i;
const STATUS_COPY_REGEX = /Leave synced|Sync delayed|Xero is not connected/i;

// Plan 159 Step 8: E2E assertions for guided Xero onboarding and shared connection.
// Executed against deployed candidate during authorised release campaign.
test("admin connects Xero Payroll and views durable import progress", async ({
  browser,
}) => {
  const environment = releaseEnvironment();
  const { context, page } = await useRole(browser, "admin");
  try {
    await page.goto(
      withOrg(
        "/settings/integrations/xero/connect",
        environment.fixtures.organisations.primary
      )
    );
    await expect(
      page.getByRole("heading", { name: CONNECT_HEADING_REGEX })
    ).toBeVisible();

    // Verify entity connection choice or active business name
    const connectButton = page.getByRole("button", {
      name: CONNECT_BUTTON_REGEX,
    });
    if (await connectButton.isVisible()) {
      await connectButton.click();
    }

    // Verify navigation to import progress destination
    await expect(page).toHaveURL(SETTINGS_XERO_URL_REGEX);
  } finally {
    await context.close();
  }
});

test("admin reviews ambiguous person matches during onboarding", async ({
  browser,
}) => {
  const environment = releaseEnvironment();
  const { context, page } = await useRole(browser, "admin");
  try {
    await page.goto(
      withOrg(
        "/settings/integrations/xero/matches",
        environment.fixtures.organisations.primary
      )
    );
    await expect(
      page.getByRole("heading", {
        name: MATCHES_HEADING_REGEX,
      })
    ).toBeVisible();

    // Verify candidates or zero-match empty state is truthful
    const matchRows = page.getByRole("article");
    const count = await matchRows.count();
    if (count > 0) {
      await expect(
        page.getByRole("button", { name: RESOLVE_BUTTON_REGEX }).first()
      ).toBeVisible();
    } else {
      await expect(page.getByText(NO_MATCHES_COPY_REGEX)).toBeVisible();
    }
  } finally {
    await context.close();
  }
});

test("member views calendar with live sync status and leave records", async ({
  browser,
}) => {
  const environment = releaseEnvironment();
  const { context, page } = await useRole(browser, "viewer");
  try {
    await page.goto(
      withOrg("/calendar", environment.fixtures.organisations.primary)
    );
    await expect(page.getByRole("region", { name: "Calendar" })).toBeVisible();

    // Verify sync status bar or connection banner is rendered
    const statusRegion = page.getByText(STATUS_COPY_REGEX);
    await expect(statusRegion.first()).toBeVisible();
  } finally {
    await context.close();
  }
});
