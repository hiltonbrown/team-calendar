import { expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { tenantDatabase } from "./tenant-client";

test("tenant clients reject absent context before accessing the pool", () => {
  expect(() => tenantDatabase("")).toThrow("Clerk organisation");
  expect(() => tenantDatabase("   ")).toThrow("Clerk organisation");
});
