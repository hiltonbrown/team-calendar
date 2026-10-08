import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { z } from "zod";
import { withOrg } from "../../../apps/app/lib/navigation/org-url.js";
import { releaseEnvironment } from "./environment.js";
import { expect, test, useRole } from "./fixture.js";
import { parseDisconnectFixture } from "./xero-disconnect-fixture.js";

const observationSchema = z.strictObject({
  demoVerifiedAt: z.iso.datetime().nullable(),
  historyCount: z.number().int().nonnegative(),
  siblingPresent: z.boolean(),
  siblingStatus: z.string(),
  targetPresent: z.boolean(),
  targetStatus: z.string(),
});
function observeDisconnect(mode: "before" | "after") {
  return observationSchema.parse(
    JSON.parse(
      execFileSync(
        "bun",
        [
          "--preload",
          resolve("tooling/release/e2e/server-only-preload.mjs"),
          resolve("tooling/release/e2e/xero-disconnect-observer-cli.ts"),
          mode,
        ],
        { encoding: "utf8", env: { ...process.env, NODE_ENV: "test" } }
      )
    )
  );
}

// This performs a real DELETE only against the explicitly selected disposable
// owned AU demo link after fresh provider proof and explicit run-bound authority.
// The read observer uses ordinary scoped access and the retained sibling grant.
test("admin confirms remote-first disconnect while preserving history and sibling access", async ({
  browser,
}) => {
  test.skip(
    !process.env.TC_E2E_XERO_DISCONNECT_FIXTURE_JSON,
    "NOT VERIFIED: requires explicit current run/app/tenant/connection DELETE acknowledgement, a dedicated disposable owned AU demo link with fresh provider proof, shared-grant sibling, imported history and admin session"
  );
  const environment = releaseEnvironment();
  const fixture = parseDisconnectFixture(
    JSON.parse(process.env.TC_E2E_XERO_DISCONNECT_FIXTURE_JSON ?? "null"),
    {
      foreignOrganisationId: environment.fixtures.organisations.foreign,
      ownedClerkOrgIds: environment.manifest.owned.clerkOrgIds,
      ownedOrganisationIds: environment.manifest.owned.organisationIds,
      primaryOrganisationId: environment.fixtures.organisations.primary,
      providerAppId: process.env.XERO_CLIENT_ID ?? "",
      runId: environment.manifest.runId,
    }
  );
  const { context, page } = await useRole(browser, "admin");
  try {
    await page.goto(
      withOrg("/settings/integrations/xero", fixture.organisationId)
    );
    const card = page.locator(
      `[data-xero-organisation-id="${fixture.organisationId}"]`
    );
    await expect(
      card.getByText(fixture.organisationName, { exact: true })
    ).toBeVisible();
    await card.getByText("Connection controls", { exact: true }).click();
    await card
      .getByRole("button", { exact: true, name: "Disconnect Xero" })
      .click();
    const dialog = page.getByRole("alertdialog", {
      exact: true,
      name: "Disconnect Xero?",
    });
    const confirm = dialog.getByRole("button", {
      exact: true,
      name: "Disconnect Xero",
    });
    await expect(confirm).toBeDisabled();
    await dialog.getByRole("textbox").fill(fixture.organisationName);
    const before = observeDisconnect("before");
    expect(before.targetStatus).toBe("active");
    expect(before.targetPresent).toBe(true);
    expect(before.siblingPresent).toBe(true);
    expect(before.historyCount).toBeGreaterThan(0);
    expect(before.demoVerifiedAt).not.toBeNull();
    const demoAgeMs = Date.now() - Date.parse(before.demoVerifiedAt ?? "");
    expect(demoAgeMs).toBeGreaterThanOrEqual(0);
    expect(demoAgeMs).toBeLessThanOrEqual(60_000);
    await confirm.click();
    await expect(
      page
        .getByRole("status")
        .filter({ hasText: "Disconnected from Xero." })
        .first()
    ).toBeVisible();
    await expect(
      card.getByRole("button", { exact: true, name: "Reconnect Xero" })
    ).toBeVisible();
    const after = observeDisconnect("after");
    expect(after.targetStatus).toBe("disconnected");
    expect(after.targetPresent).toBe(false);
    expect(after.siblingStatus).toBe("active");
    expect(after.siblingPresent).toBe(true);
    expect(after.historyCount).toBe(before.historyCount);
  } finally {
    await context.close();
  }
});
