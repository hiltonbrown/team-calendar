import { test } from "@playwright/test";
import {
  executeXeroBrowserSubcase,
  xeroBrowserFixture,
} from "./xero-browser-case.js";

for (const id of ["X01.primary", "X02.primary"]) {
  test(`${id}: actual browser consent and callback`, async ({ browser }) => {
    const fixture = xeroBrowserFixture(id);
    test.skip(
      fixture === null,
      "Sanctioned consent fixture and assisted role context are unavailable"
    );
    if (!fixture) {
      return;
    }
    await executeXeroBrowserSubcase(browser, fixture);
  });
}
