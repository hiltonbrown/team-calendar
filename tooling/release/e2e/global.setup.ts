// biome-ignore-all lint/performance/useTopLevelRegex: Playwright URL assertions run once during setup.
import { mkdirSync } from "node:fs";
import { clerk, clerkSetup } from "@clerk/testing/playwright";
import { expect, test as setup } from "@playwright/test";
import { releaseEnvironment, roleEmail, roles } from "./environment.js";

setup.describe.configure({ mode: "serial" });
const environment = releaseEnvironment();

setup("validate candidate health and initialise Clerk", async ({ request }) => {
  await clerkSetup();
  await expect
    .poll(async () =>
      (await request.get(`${environment.apiUrl}/health`)).status()
    )
    .toBe(200);
  await expect
    .poll(async () => (await request.get(environment.webUrl)).status())
    .toBeLessThan(500);
});

for (const role of roles) {
  setup(`authenticate ${role} storage state`, async ({ page }) => {
    mkdirSync("tooling/release/.auth", { mode: 0o700, recursive: true });
    await page.goto("/sign-in");
    await clerk.signIn({ emailAddress: roleEmail(role), page });
    await page.goto("/");
    await expect(page).not.toHaveURL(/sign-in/);
    await page.context().storageState({ path: environment.authFiles[role] });
  });
}
