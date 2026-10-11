import { expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findFirst: vi.fn(), queryRaw: vi.fn() }));
vi.mock("../system-client", () => ({
  systemDatabase: { xeroConnection: { findFirst: mocks.findFirst } },
}));

import { claimXeroTenant, isXeroTenantBindingConflict } from "./xero-ownership";

test("unowned tenant acquires the transaction lock before resolving its owner", async () => {
  mocks.findFirst.mockResolvedValue(null);
  await expect(
    claimXeroTenant(
      { $queryRaw: mocks.queryRaw },
      { clerkOrgId: "account" },
      "tenant"
    )
  ).resolves.toEqual({ status: "unowned" });
  expect(mocks.queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.findFirst.mock.invocationCallOrder[0]
  );
});

test.each([
  "xero_connections_owned_tenant_key",
  "xero_connections_owned_remote_connection_key",
])(
  "maps adapter ownership index %s without treating other unique indexes as conflicts",
  (index) => {
    expect(
      isXeroTenantBindingConflict({
        code: "P2002",
        meta: { driverAdapterError: { cause: { constraint: { index } } } },
      })
    ).toBe(true);
    expect(
      isXeroTenantBindingConflict({
        code: "P2002",
        meta: {
          driverAdapterError: {
            cause: {
              constraint: { index: "xero_connections_organisation_id_key" },
            },
          },
        },
      })
    ).toBe(false);
  }
);
