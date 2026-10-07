import { z } from "zod";
import { withOrg } from "../../../apps/app/lib/navigation/org-url.js";
import { releaseEnvironment } from "./environment.js";
import { expect, test, useRole } from "./fixture.js";

// Written for Plan 160, NOT_VERIFIED. Controlled fixtures must seed these scenarios
// in manifest-owned organisations and use only fake Xero responses. This spec
// reads rendered recovery states and never triggers a provider operation.
const messages = [
  ["update_permissions", "Update Xero permissions to continue."],
  ["reauthorise", "Xero access needs to be renewed."],
  [
    "access_denied",
    "Xero declined this request. Check that the person who connected Xero still has payroll access.",
  ],
  ["retry_later", "Xero is temporarily unavailable. Try again after"],
  [
    "outcome_unknown",
    "We could not confirm whether Xero received this change. Check Xero before trying again.",
  ],
  [
    "operational_incident",
    "We cannot reach Xero right now. Try again later or contact support.",
  ],
  [
    "unavailable",
    "We cannot reach Xero right now. Try again later or contact support.",
  ],
  ["reauthorisation_required", "Xero access needs to be renewed."],
  ["not_connected", "Xero is not connected."],
] as const;
const FixtureSchema = z.object({
  organisationId: z.uuid(),
  reason: z.enum(messages.map(([reason]) => reason)),
  surface: z.enum(["plans", "calendar", "settings/integrations/xero"]),
});

for (const [reason, message] of messages) {
  test(`Xero recovery remains distinct: ${reason}`, async ({ browser }) => {
    const environment = releaseEnvironment();
    const fixtures = z
      .array(FixtureSchema)
      .length(messages.length)
      .parse(
        JSON.parse(process.env.TC_E2E_XERO_RECOVERY_FIXTURES_JSON ?? "null")
      );
    if (
      new Set(fixtures.map((candidate) => candidate.reason)).size !==
        messages.length ||
      fixtures.some(
        (candidate) =>
          !environment.manifest.owned.organisationIds.includes(
            candidate.organisationId
          )
      )
    ) {
      throw new Error(
        "Plan 160 requires every Xero recovery scenario in manifest-owned organisations"
      );
    }
    const fixture = fixtures.find((candidate) => candidate.reason === reason);
    if (!fixture) {
      throw new Error("Required Xero recovery scenario fixture is absent");
    }
    const { context, page } = await useRole(browser, "admin");
    try {
      await page.goto(withOrg(`/${fixture.surface}`, fixture.organisationId));
      const surface =
        fixture.surface === "settings/integrations/xero"
          ? page.locator(
              `[data-xero-organisation-id="${fixture.organisationId}"]`
            )
          : page;
      await expect(
        surface
          .getByText(message, {
            exact: reason !== "retry_later" && reason !== "not_connected",
          })
          .first()
      ).toBeVisible();
      await expect(
        page.getByText("Our team has been notified", { exact: false })
      ).toHaveCount(0);
    } finally {
      await context.close();
    }
  });
}
