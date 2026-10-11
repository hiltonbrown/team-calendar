import { expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock("../tenant-client", () => ({
  tenantDatabase: () => ({ organisation: { findMany: mocks.findMany } }),
}));

import { resolveAccountCompanies } from "./account-companies";

test("account companies retain manual companies and exclude released or archived ones", async () => {
  mocks.findMany.mockResolvedValue([]);
  await resolveAccountCompanies("account");
  expect(mocks.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: {
        archived_at: null,
        clerk_org_id: "account",
        is_active: true,
        OR: [
          { xero_connection: null },
          { xero_connection: { released_at: null } },
        ],
      },
    })
  );
});
