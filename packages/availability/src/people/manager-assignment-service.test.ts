import type { Prisma } from "@repo/database/generated/client";
import { beforeEach, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({
  audit: vi.fn(),
  people: [] as Array<{
    id: string;
    manager_person_id: string | null;
    organisation_id: string;
  }>,
  transaction: vi.fn(),
  update: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@repo/database/tenant-client", () => ({
  referenceDatabase: { $transaction: state.transaction },
}));
vi.mock("@repo/database", async () => ({
  ...(await vi.importActual("@repo/database/tenant-db")),
  resolveAccountCompanies: async () => [
    { id: "company-A" },
    { id: "company-B" },
  ],
}));

import { TenantMismatchError, withTenantResult } from "@repo/database";
import { setPersonManager } from "./manager-assignment-service";

const personId = "11111111-1111-4111-8111-111111111111";
const managerId = "22222222-2222-4222-8222-222222222222";
const input = {
  accountId: "account-A",
  actingRole: "owner" as const,
  actingUserId: "user-1",
  managerPersonId: managerId,
  personId,
};
beforeEach(() => {
  vi.clearAllMocks();
  state.people = [
    { id: personId, manager_person_id: null, organisation_id: "company-A" },
    { id: managerId, manager_person_id: null, organisation_id: "company-B" },
  ];
  state.update.mockImplementation(
    async ({
      data,
      where,
    }: {
      data: { manager_person_id: string | null };
      where: { id: string };
    }) => {
      const person = state.people.find(
        (preparedPerson) => preparedPerson.id === where.id
      );
      if (person) {
        person.manager_person_id = data.manager_person_id;
      }
      return await { count: person ? 1 : 0 };
    }
  );
  state.audit.mockResolvedValue({});
  state.transaction.mockImplementation(
    async (fn: (db: Prisma.TransactionClient) => Promise<unknown>) => {
      const snapshot = state.people.map((person) => ({ ...person }));
      // Substitute the pool with the delegates needed by manager assignment.
      try {
        return await fn({
          $queryRaw: async () => [],
          auditEvent: { create: state.audit },
          person: {
            findMany: async () => state.people.map((person) => ({ ...person })),
            updateMany: state.update,
          },
        } as unknown as Prisma.TransactionClient);
      } catch (error) {
        state.people = snapshot;
        throw error;
      }
    }
  );
});
test.each(["owner", "admin"] as const)(
  "%s can assign a manager in another owned company",
  async (actingRole) => {
    const result = await withTenantResult(input.accountId, (db) =>
      setPersonManager({ ...input, actingRole }, db)
    );
    expect(result).toMatchObject({
      ok: true,
      value: { managerPersonId: managerId },
    });
    expect(state.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          account_id: input.accountId,
          id: personId,
          organisation_id: "company-A",
        }),
      })
    );
    expect(state.audit).toHaveBeenCalledOnce();
  }
);
test.each(["manager", "viewer"] as const)(
  "%s cannot assign managers",
  async (actingRole) => {
    expect(
      await withTenantResult(input.accountId, (db) =>
        setPersonManager({ ...input, actingRole }, db)
      )
    ).toMatchObject({ error: { code: "not_authorised" }, ok: false });
    expect(state.update).not.toHaveBeenCalled();
  }
);
test("manager can be cleared", async () => {
  expect(
    await withTenantResult(input.accountId, (db) =>
      setPersonManager({ ...input, managerPersonId: null }, db)
    )
  ).toMatchObject({ ok: true, value: { managerPersonId: null } });
});
test("self management is rejected", async () => {
  expect(
    await withTenantResult(input.accountId, (db) =>
      setPersonManager({ ...input, managerPersonId: personId }, db)
    )
  ).toMatchObject({ error: { code: "validation_error" }, ok: false });
  expect(state.update).not.toHaveBeenCalled();
});
test("a longer cross-company manager cycle is rejected", async () => {
  const intermediate = "33333333-3333-4333-8333-333333333333";
  const manager = state.people.find((person) => person.id === managerId);
  if (!manager) {
    throw new Error("Manager fixture missing");
  }
  manager.manager_person_id = intermediate;
  state.people.push({
    id: intermediate,
    manager_person_id: personId,
    organisation_id: "company-B",
  });
  expect(
    await withTenantResult(input.accountId, (db) => setPersonManager(input, db))
  ).toMatchObject({ error: { code: "validation_error" }, ok: false });
  expect(state.update).not.toHaveBeenCalled();
});
test("a foreign manager is absent from the owned graph", async () => {
  state.people = state.people.slice(0, 1);
  expect(
    await withTenantResult(input.accountId, (db) => setPersonManager(input, db))
  ).toMatchObject({ error: { code: "not_found" }, ok: false });
});
test("another account's client fails before assignment", async () => {
  await expect(
    withTenantResult("account-B", (db) => setPersonManager(input, db))
  ).rejects.toBeInstanceOf(TenantMismatchError);
  expect(state.update).not.toHaveBeenCalled();
});

test("an audit failure rolls back the assigned manager", async () => {
  state.audit.mockRejectedValueOnce(new Error("Audit unavailable"));
  await expect(
    withTenantResult(input.accountId, (db) => setPersonManager(input, db))
  ).rejects.toThrow("Audit unavailable");
  expect(
    state.people.find((person) => person.id === personId)?.manager_person_id
  ).toBeNull();
});
