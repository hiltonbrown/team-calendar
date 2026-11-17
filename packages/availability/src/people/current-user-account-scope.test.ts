import type { Prisma } from "@repo/database/generated/client";
import { withTenantResult as withTestTenantResult } from "@repo/database/tenant-db";
import { tenantTestAccount } from "@repo/database/test-fixtures/tenant-scope";
import { beforeEach, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({
  create: vi.fn(),
  emailLookup: vi.fn(),
  transaction: vi.fn(),
  update: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@repo/database/tenant-client", () => ({
  referenceDatabase: { $transaction: state.transaction },
}));
vi.mock("@repo/database", async () => ({
  ...(await vi.importActual<typeof import("@repo/database/tenant-db")>(
    "@repo/database/tenant-db"
  )),
  lockPlanLimitMutations: vi.fn(),
  resolveAccountCompanies: async () => [
    { id: "company-A" },
    { id: "company-B" },
  ],
  scopedQuery: (account: string, company: string) => ({
    account_id: account,
    organisation_id: company,
  }),
}));
vi.mock("@repo/auth/server", () => ({
  withinLimit: async () => ({ ok: true, value: { allowed: true } }),
}));
vi.mock("@repo/feeds", () => ({ ensureDefaultCalendarFeed: vi.fn() }));
vi.mock("@repo/observability/log", () => ({
  log: { error: vi.fn(), warn: vi.fn() },
}));

import type { AccountId, OrganisationId } from "@repo/core";
import { withTenantDb } from "@repo/database";
import { ensureCurrentUserPerson } from "./current-user-service";

// The fake account/company ids identify fixtures; production ids come from authenticated/validated input.
const tenant = {
  accountId: "account-A" as AccountId,
  organisationId: "company-A" as OrganisationId,
};
const person = {
  account_id: "account-A",
  archived_at: null,
  avatar_url: null,
  display_name: "Blair Person",
  email: "blair@example.com",
  employment_type: "employee",
  first_name: "Blair",
  id: "staff-B",
  job_title: null,
  last_name: "Person",
  location: null,
  organisation_id: "company-B",
  person_type: "employee",
  team: null,
  user_id: null,
};
beforeEach(() => {
  vi.clearAllMocks();
  state.emailLookup.mockImplementation(
    async ({
      where,
    }: {
      where: {
        account_id: string;
        organisation_id: { in?: string[] } | string;
      };
    }) =>
      where.account_id === "account-A" &&
      typeof where.organisation_id === "object" &&
      where.organisation_id.in?.includes("company-B")
        ? [person]
        : []
  );
  state.update.mockResolvedValue({ ...person, user_id: "user-B" });
  state.create.mockRejectedValue(
    new Error("A second person must not be created")
  );
  state.transaction.mockImplementation(
    async (run: (db: Prisma.TransactionClient) => Promise<unknown>) => {
      // Selected delegates exercise the real scope while keeping this source test independent of PostgreSQL.
      const db = {
        $executeRaw: vi.fn(),
        $queryRaw: vi.fn(async () => []),
        person: {
          createMany: state.create,
          findFirst: async () => null,
          findMany: state.emailLookup,
          update: state.update,
        },
        xeroPersonMatch: { findFirst: async () => null },
      } as unknown as Prisma.TransactionClient;
      return await run(db);
    }
  );
});
test("a B-employed user opening A links the existing B profile instead of creating an A profile", async () => {
  await withTenantDb("account-A", async (db) => {
    const result = await ensureCurrentUserPerson(
      tenant,
      {
        displayName: "Blair Person",
        email: "blair@example.com",
        userId: "user-B",
      },
      db
    );
    expect(result).toMatchObject({
      ok: true,
      value: { id: "staff-B", organisationId: "company-B" },
    });
  });
  expect(state.transaction).toHaveBeenCalledTimes(1);
  expect(state.emailLookup).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({
        account_id: "account-A",
        organisation_id: { in: ["company-A", "company-B"] },
      }),
    })
  );
  expect(state.create).not.toHaveBeenCalled();
});
test("ambiguous account email matches retain the existing conflict policy without creating a profile", async () => {
  state.emailLookup.mockResolvedValue([
    person,
    { ...person, id: "staff-A", organisation_id: "company-A" },
  ]);
  const result = await withTestTenantResult(tenantTestAccount(tenant), (db) =>
    ensureCurrentUserPerson(
      tenant,
      {
        email: "blair@example.com",
        userId: "user-B",
      },
      db
    )
  );
  expect(result).toMatchObject({ error: { code: "conflict" }, ok: false });
  expect(state.update).not.toHaveBeenCalled();
  expect(state.create).not.toHaveBeenCalled();
});
