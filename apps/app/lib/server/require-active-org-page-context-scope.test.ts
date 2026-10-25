import type { AccountId } from "@repo/core";
import type { Prisma } from "@repo/database/generated/client";
import { beforeEach, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({
  companies: vi.fn(),
  getSession: vi.fn(),
  organisation: vi.fn(),
  transaction: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@repo/auth/helpers", () => ({ requireAccount: state.getSession }));
vi.mock("@repo/database/tenant-client", () => ({
  referenceDatabase: { $transaction: state.transaction },
}));
vi.mock(
  "@repo/database",
  async () => await vi.importActual("@repo/database/tenant-db")
);
vi.mock("@repo/database/queries/account-companies", () => ({
  resolveAccountCompanies: state.companies,
}));
vi.mock("@repo/database/queries/organisations", () => ({
  getOrganisationById: state.organisation,
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("not found");
  },
}));

import { TenantMismatchError, withTenantDb } from "@repo/database";
import { resolveActiveOrgPageContext } from "./require-active-org-page-context";

// Fixture account models a Clerk identifier already obtained before the database phase.
const account = "account-A" as AccountId;
const companyId = "11111111-1111-4111-8111-111111111111";
beforeEach(() => {
  vi.clearAllMocks();
  state.companies.mockResolvedValue([{ id: companyId }]);
  state.organisation.mockResolvedValue({ ok: true, value: { id: companyId } });
  state.transaction.mockImplementation(
    async (fn: (db: Prisma.TransactionClient) => Promise<unknown>) => {
      // Substitute only the pool context method; query delegates are observed separately.
      return await fn({
        $queryRaw: async () => [],
      } as unknown as Prisma.TransactionClient);
    }
  );
});
test("default company selection reuses the caller's scope without Clerk calls", async () => {
  await withTenantDb(account, async (db) => {
    expect(
      await resolveActiveOrgPageContext(account, undefined, db)
    ).toMatchObject({ accountId: account, organisationId: companyId });
    expect(state.companies).toHaveBeenCalledWith(account, db);
  });
  expect(state.transaction).toHaveBeenCalledOnce();
  expect(state.getSession).not.toHaveBeenCalled();
});
test("explicit company ownership is checked with the same request client", async () => {
  await withTenantDb(account, async (db) => {
    await resolveActiveOrgPageContext(account, companyId, db);
    expect(state.organisation).toHaveBeenCalledWith(account, companyId, db);
  });
  expect(state.getSession).not.toHaveBeenCalled();
});
test("wrong-account scope fails before company lookup", async () => {
  await expect(
    withTenantDb("account-B", (db) =>
      resolveActiveOrgPageContext(account, companyId, db)
    )
  ).rejects.toBeInstanceOf(TenantMismatchError);
  expect(state.organisation).not.toHaveBeenCalled();
  expect(state.companies).not.toHaveBeenCalled();
});
test("a foreign company cannot become page context", async () => {
  state.organisation.mockResolvedValue({
    error: { code: "not_found" },
    ok: false,
  });
  await expect(
    withTenantDb(account, (db) =>
      resolveActiveOrgPageContext(account, companyId, db)
    )
  ).rejects.toThrow("not found");
});
