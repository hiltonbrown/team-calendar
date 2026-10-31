import type { TenantDb } from "@repo/database";
import type { Prisma } from "@repo/database/generated/client";
import { withTenantResult as withTestTenantResult } from "@repo/database/tenant-db";
import { tenantTestAccount } from "@repo/database/test-fixtures/tenant-scope";
import { beforeEach, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({
  feeds: [] as Array<{
    id: string;
    organisation_id: null;
    privacy_mode: string;
    scopes: [];
    created_by_user_id: null;
  }>,
  inside: false,
  invalidate: vi.fn(),
  query: vi.fn(),
  transaction: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@repo/database/tenant-client", () => ({
  referenceDatabase: { $transaction: state.transaction },
}));
vi.mock("@repo/database", async () => ({
  ...(await vi.importActual("@repo/database/tenant-db")),
  resolveAccountCompanies: async (_account: string, db: TenantDb) =>
    db.organisation.findMany(),
}));
vi.mock("./cache/feed-cache", () => ({
  ALL_PRIVACY_MODES: ["named", "masked", "private"],
  invalidateFeedCache: state.invalidate,
}));
vi.mock("@repo/observability/log", () => ({
  log: { error: vi.fn(), warn: vi.fn() },
}));
vi.mock("@repo/observability/error", () => ({ parseError: vi.fn() }));

import {
  TenantMismatchError,
  withTenantDb,
  withTenantResult,
} from "@repo/database";
import {
  feedIdsForPeople,
  invalidateAccountFeedCaches,
  invalidateFeedCachesForPerson,
} from "./cache/feed-invalidation";
import { previewFeed } from "./preview/preview-service";
import { projectFeedEvents } from "./projection/feed-projection";
import { materialiseAvailabilityPublication } from "./publication/publication-service";
import {
  canViewFeed,
  findActingPersonId,
  loadFeedScopeData,
  resolvePeopleForFeed,
  resolveScopeRows,
  validateScopes,
} from "./scope/feed-scope";

const scope = {
  accountId: "account-A",
  organisationId: "11111111-1111-4111-8111-111111111111",
};
const personId = "22222222-2222-4222-8222-222222222222";
const feedId = "33333333-3333-4333-8333-333333333333";
const scopes = [{ scopeType: "org" as const }];
const cases: Array<{ name: string; run: (db: TenantDb) => Promise<unknown> }> =
  [
    {
      name: "scope validation",
      run: (db) => validateScopes({ ...scope, scopes }, db),
    },
    {
      name: "people resolution",
      run: (db) => resolvePeopleForFeed({ ...scope, scopes }, db),
    },
    { name: "scope preload", run: (db) => loadFeedScopeData(scope, db) },
    {
      name: "scope labels",
      run: (db) => resolveScopeRows({ ...scope, scopes: [] }, db),
    },
    {
      name: "admin visibility shortcut",
      run: (db) => canViewFeed({ ...scope, role: "owner", scopes }, db),
    },
    {
      name: "acting person",
      run: (db) => findActingPersonId({ ...scope, userId: "user-1" }, db),
    },
    {
      name: "affected feeds",
      run: (db) => feedIdsForPeople({ ...scope, personIds: [personId] }, db),
    },
    {
      name: "empty affected feeds",
      run: (db) => feedIdsForPeople({ ...scope, personIds: [] }, db),
    },
    {
      name: "person invalidation",
      run: (db) => invalidateFeedCachesForPerson({ ...scope, personId }, db),
    },
    {
      name: "account invalidation",
      run: (db) => invalidateAccountFeedCaches(scope, db),
    },
    {
      name: "projection",
      run: (db) =>
        projectFeedEvents(
          { ...scope, actingRole: "owner", feedId, horizonDays: 30 },
          db
        ),
    },
    {
      name: "preview",
      run: (db) =>
        previewFeed(
          { ...scope, actingRole: "owner", actingUserId: "user-1", feedId },
          db
        ),
    },
    {
      name: "materialisation",
      run: (db) =>
        materialiseAvailabilityPublication(
          { ...scope, availabilityRecordId: personId },
          db
        ),
    },
  ];

beforeEach(() => {
  vi.clearAllMocks();
  state.feeds = [];
  state.inside = false;
  state.invalidate.mockImplementation(async () => {
    expect(state.inside).toBe(false);
    return await { ok: true, value: undefined };
  });
  state.transaction.mockImplementation(
    async (callback: (db: Prisma.TransactionClient) => Promise<unknown>) => {
      const model = {
        findFirst: vi.fn(async () => {
          state.query();
          return await null;
        }),
        findMany: vi.fn(async () => {
          state.query();
          return await [];
        }),
      };
      const client = {
        $queryRaw: vi.fn(async () => []),
        availabilityRecord: model,
        feed: {
          ...model,
          findMany: vi.fn(async () => {
            state.query();
            return await state.feeds;
          }),
        },
        organisation: model,
        person: model,
        team: model,
      };
      state.inside = true;
      try {
        // Substitute only the pool methods reached by this ownership/effect harness.
        return await callback(client as unknown as Prisma.TransactionClient);
      } finally {
        state.inside = false;
      }
    }
  );
});

test.each(cases)(
  "$name runs within an explicit owned scope",
  async ({ run }) => {
    await withTenantDb(scope.accountId, (db) => run(db));
    expect(state.transaction).toHaveBeenCalledTimes(1);
  }
);
test.each(cases)("$name reuses its caller's scope", async ({ run }) => {
  await withTenantDb(scope.accountId, async (db) => {
    await run(db);
  });
  expect(state.transaction).toHaveBeenCalledTimes(1);
});
test.each(cases)(
  "$name rejects another account before querying",
  async ({ run }) => {
    await expect(
      withTenantDb("account-B", async (db) => {
        await run(db);
      })
    ).rejects.toBeInstanceOf(TenantMismatchError);
    expect(state.query).not.toHaveBeenCalled();
    expect(state.invalidate).not.toHaveBeenCalled();
  }
);
test("cache invalidation waits for the parent commit", async () => {
  state.feeds = [
    {
      created_by_user_id: null,
      id: feedId,
      organisation_id: null,
      privacy_mode: "named",
      scopes: [],
    },
  ];
  await withTenantDb(scope.accountId, async (db) => {
    await invalidateAccountFeedCaches(scope, db);
    expect(state.invalidate).not.toHaveBeenCalled();
  });
  expect(state.invalidate).toHaveBeenCalledTimes(1);
});
test("a failed parent result discards cache invalidation", async () => {
  state.feeds = [
    {
      created_by_user_id: null,
      id: feedId,
      organisation_id: null,
      privacy_mode: "named",
      scopes: [],
    },
  ];
  await withTenantResult(scope.accountId, async (db) => {
    await invalidateAccountFeedCaches(scope, db);
    return { error: "denied", ok: false };
  });
  expect(state.invalidate).not.toHaveBeenCalled();
});
test("a failed KV result triggers the post-commit retry", async () => {
  state.feeds = [
    {
      created_by_user_id: null,
      id: feedId,
      organisation_id: null,
      privacy_mode: "named",
      scopes: [],
    },
  ];
  state.invalidate.mockResolvedValueOnce({
    error: { message: "Unavailable" },
    ok: false,
  });
  await withTestTenantResult(tenantTestAccount(scope), (db) =>
    invalidateAccountFeedCaches(scope, db)
  );
  expect(state.invalidate).toHaveBeenCalledTimes(2);
});
