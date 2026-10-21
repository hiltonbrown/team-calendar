import { expect, test, vi } from "vitest";

vi.mock("./tenant-client", () => {
  throw new Error(
    "The guard-only entry point must not import the database client"
  );
});

import { assertNoTenantTransaction } from "../tenant-guard";

test("the guard-only entry point loads without constructing a database client", () => {
  expect(() => assertNoTenantTransaction("phase")).not.toThrow();
});
