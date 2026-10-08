const OAUTH_BUTTON = /^(Connect|Reconnect) Xero$/;
const CONSENT_URL =
  /^https:\/\/login\.xero\.com\/identity\/connect\/authorize\?/;

import { withOrg } from "../../../apps/app/lib/navigation/org-url.js";
import { releaseEnvironment } from "./environment.js";
import { expect, test, useRole } from "./fixture.js";

test("admin begins real Xero consent with an owned organisation", async ({
  browser,
}) => {
  const environment = releaseEnvironment();
  const { context, page } = await useRole(browser, "admin");
  try {
    await page.goto(
      withOrg(
        "/settings/integrations/xero",
        environment.fixtures.organisations.primary
      )
    );
    const card = page.locator(
      `[data-xero-organisation-id="${environment.fixtures.organisations.primary}"]`
    );
    await expect(card).toBeVisible();
    await card.getByRole("button", { name: OAUTH_BUTTON }).click();
    await expect(page).toHaveURL(CONSENT_URL);
    const consent = new URL(page.url());
    expect(consent.searchParams.get("state")).toBeTruthy();
    expect(consent.searchParams.get("response_type")).toBe("code");
    expect(consent.searchParams.get("redirect_uri")).toContain(
      "/api/xero/oauth/callback"
    );
  } finally {
    await context.close();
  }
});

test("Xero callback rejects a forged state without completing consent", async ({
  browser,
}) => {
  const { context, page } = await useRole(browser, "admin");
  try {
    const response = await page.request.get(
      "/api/xero/oauth/callback?code=invalid&state=forged",
      { maxRedirects: 0 }
    );
    expect(response.status()).toBeGreaterThanOrEqual(300);
    expect(response.headers().location ?? "").toContain("error");
  } finally {
    await context.close();
  }
});
