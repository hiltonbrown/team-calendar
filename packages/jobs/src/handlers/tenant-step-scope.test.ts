import type { Prisma } from "@repo/database/generated/client";
import { withTenantDb as withTestTenantDb } from "@repo/database/tenant-db";
import { tenantTestAccount } from "@repo/database/test-fixtures/tenant-scope";
import { beforeEach, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({
  committed: [] as string[],
  failCounter: false,
  transaction: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("../client", () => ({
  inngest: { createFunction: vi.fn(() => ({})) },
}));
vi.mock("@repo/database/tenant-client", () => ({
  referenceDatabase: { $transaction: state.transaction },
}));
vi.mock("@repo/database", async () => ({
  ...(await vi.importActual<typeof import("@repo/database/tenant-db")>(
    "@repo/database/tenant-db"
  )),
  getScopedXeroConnection: async () => ({
    ok: true,
    value: {
      authorisation: { status: "active" },
      id: "connection",
      xero_authorisation_id: "grant",
    },
  }),
}));
vi.mock("@repo/xero", () => ({
  classifyXeroFailure: vi.fn(),
  resolveXeroAccess: vi.fn(),
  toResolvedXeroConnection: vi.fn(),
}));
vi.mock("@repo/observability/log", () => ({
  log: { error: vi.fn(), warn: vi.fn() },
}));

import {
  isTenantScopeActive,
  TenantMismatchError,
  withTenantDb,
} from "@repo/database";
import { recountUsage } from "./recount-usage";
import { withXeroBinding } from "./xero-sync-access";

const input = {
  clerkOrgId: "account-A",
  organisationId: "11111111-1111-4111-8111-111111111111",
};
beforeEach(() => {
  vi.clearAllMocks();
  state.committed = [];
  state.failCounter = false;
  state.transaction.mockImplementation(
    async (run: (db: Prisma.TransactionClient) => Promise<unknown>) => {
      const pending: string[] = [];
      // Buffer writes until the real tenant callback resolves, modelling commit/rollback.
      const db = {
        $executeRaw: async (
          query: TemplateStringsArray,
          ...values: unknown[]
        ) => {
          if (query.join("").includes("usage_counters")) {
            const metric = String(values[1]);
            if (state.failCounter && metric === "seats") {
              throw new Error("counter persistence failed");
            }
            pending.push(metric);
          }
          return await 1;
        },
        $queryRaw: async () => [],
        feed: { count: async () => 4 },
        organisation: { count: async () => 2 },
        person: {
          count: async () => 3,
          create: async ({ data }: { data: { id: string } }) => {
            pending.push(data.id);
            return await data;
          },
        },
        xeroConnection: {
          findFirst: async () => ({
            id: "connection",
            xero_authorisation_id: "grant",
          }),
        },
      } as unknown as Prisma.TransactionClient;
      const result = await run(db);
      state.committed.push(...pending);
      return result;
    }
  );
});

test("recount commits all metrics in one owned scope", async () => {
  expect(
    await withTestTenantDb(tenantTestAccount(input), (db) =>
      recountUsage(input, db)
    )
  ).toEqual({
    feeds: 4,
    payrollEntities: 2,
    seats: 3,
  });
  expect(state.transaction).toHaveBeenCalledTimes(1);
  expect(state.committed).toEqual(["feeds", "payroll_entities", "seats"]);
});
test("the last counter failure rolls back earlier counter writes", async () => {
  state.failCounter = true;
  await expect(
    withTestTenantDb(tenantTestAccount(input), (db) => recountUsage(input, db))
  ).rejects.toThrow("counter persistence failed");
  expect(state.committed).toEqual([]);
});
test("recount reuses the active request and rejects a foreign client", async () => {
  await withTenantDb("account-A", (db) => recountUsage(input, db));
  expect(state.transaction).toHaveBeenCalledTimes(1);
  await withTenantDb("account-B", async (db) => {
    await expect(recountUsage(input, db)).rejects.toBeInstanceOf(
      TenantMismatchError
    );
  });
});
test("a third Xero persistence phase failing leaves the first two committed and permits the next", async () => {
  const scope = { ...input, connectionId: "connection" };
  for (let batch = 1; batch <= 4; batch += 1) {
    // Provider work happens before opening the next persistence phase.
    expect(isTenantScopeActive()).toBe(false);
    const remoteId = `batch-${batch}`;
    try {
      await withXeroBinding(scope, async (db) => {
        expect(isTenantScopeActive()).toBe(true);
        await db.person.create({
          data: {
            clerk_org_id: input.clerkOrgId,
            display_name: remoteId,
            email: `${remoteId}@example.com`,
            employment_type: "employee",
            first_name: remoteId,
            id: remoteId,
            last_name: "Person",
            organisation_id: input.organisationId,
            source_system: "MANUAL",
          },
        });
        if (batch === 3) {
          throw new Error("third batch failed");
        }
      });
    } catch (error) {
      expect(batch).toBe(3);
      expect(error).toEqual(new Error("third batch failed"));
    }
  }
  expect(state.committed).toEqual(["batch-1", "batch-2", "batch-4"]);
  expect(state.transaction).toHaveBeenCalledTimes(4);
});
