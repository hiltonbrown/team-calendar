import type { Prisma } from "@repo/database/generated/client";
import { beforeEach, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({
  committed: [] as string[],
  transaction: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("../client", () => ({
  inngest: { createFunction: vi.fn(() => ({})), send: vi.fn() },
}));
vi.mock("../../../database/src/tenant-client", () => ({
  referenceDatabase: { $transaction: state.transaction },
}));
vi.mock("@repo/database", async () => ({
  ...(await vi.importActual<typeof import("../../../database/src/tenant-db")>(
    "../../../database/src/tenant-db"
  )),
}));
vi.mock("@repo/feeds", async () => {
  const { assertTenantDb, isTenantScopeActive } = await import(
    "@repo/database"
  );
  return {
    feedIdsForPeople: async () => [],
    // Publication is a separate persistence phase. The worker must call it after its candidate read closes.
    materialiseAvailabilityPublication: async (
      input: { clerkOrgId: string; availabilityRecordId: string },
      db: import("@repo/database").TenantDb
    ) => {
      assertTenantDb(db, input.clerkOrgId);
      expect(isTenantScopeActive()).toBe(true);
      await db.availabilityRecord.updateMany({
        data: { derived_sequence: { increment: 1 } },
        where: {
          clerk_org_id: input.clerkOrgId,
          id: input.availabilityRecordId,
        },
      });
      if (input.availabilityRecordId === "record-2") {
        throw new Error("second publication failed");
      }
      return { ok: true, value: { changed: true } };
    },
  };
});
vi.mock("@repo/observability/log", () => ({
  log: { error: vi.fn(), info: vi.fn() },
}));

import { reconcileFeedPublications } from "./reconcile-feed-publications";

beforeEach(() => {
  vi.clearAllMocks();
  state.committed = [];
  state.transaction.mockImplementation(
    async (run: (db: Prisma.TransactionClient) => Promise<unknown>) => {
      const pending: string[] = [];
      // Each root owns its pending writes. A thrown phase never commits them.
      const db = {
        $executeRaw: vi.fn(),
        $queryRaw: vi.fn(async () => []),
        availabilityRecord: {
          findMany: async () =>
            [1, 2, 3].map((index) => ({
              id: `record-${index}`,
              person_id: `person-${index}`,
            })),
          updateMany: async ({ where }: { where: { id: string } }) => {
            pending.push(where.id);
            return await { count: 1 };
          },
        },
      } as unknown as Prisma.TransactionClient;
      const value = await run(db);
      state.committed.push(...pending);
      return value;
    }
  );
});

test("a publication failure leaves earlier and later records committed in independent phases", async () => {
  const result = await reconcileFeedPublications({
    clerkOrgId: "account-A",
    organisationId: "11111111-1111-4111-8111-111111111111",
  });
  expect(result).toMatchObject({
    ok: true,
    value: { changed: 2, failed: 1, feedsQueued: 0, scanned: 3 },
  });
  expect(state.committed.sort()).toEqual(["record-1", "record-3"]);
});
