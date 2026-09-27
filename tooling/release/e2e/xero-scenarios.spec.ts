import { test } from "@playwright/test";
import { XERO_SCENARIOS } from "../xero-scenarios.js";
import {
  executeXeroBrowserSubcase,
  xeroBrowserFixture,
} from "./xero-browser-case.js";

for (const scenario of XERO_SCENARIOS.filter(
  (entry) => !["X01", "X02"].includes(entry.id)
)) {
  for (const suffix of scenario.subcases) {
    const id = `${scenario.id}.${suffix}`;
    test(`${id}: ${scenario.name}`, async ({ browser }) => {
      test.skip(
        id.startsWith("X26."),
        "Terminal cleanup is collected by the runner after child closure and owned drain"
      );
      test.skip(
        id.startsWith("X08."),
        "Fresh scheduled worker observer requires actual enforced tenant/run/generation fencing and registered workers"
      );
      const fixture = xeroBrowserFixture(id);
      test.skip(
        fixture === null,
        "Owned scenario fixture and independent observations are unavailable"
      );
      if (!fixture) {
        return;
      }
      await executeXeroBrowserSubcase(browser, fixture);
    });
  }
}
