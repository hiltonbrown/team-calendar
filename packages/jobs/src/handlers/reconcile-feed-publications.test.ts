import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  availabilityRecordFindMany: vi.fn(),
  createFunction: vi.fn(),
  feedIdsForPeople: vi.fn(() =>
    Promise.resolve<
      Array<{
        id: string;
        privacyMode: string;
        organisationId: string | null;
      }>
    >([])
  ),
  inngestSend: vi.fn(() => Promise.resolve({ ids: ["event_1"] })),
  materialiseAvailabilityPublication: vi.fn(),
  scopeDatabase: null as Record<string, unknown> | null,
}));
vi.mock("server-only", () => ({}));
vi.mock("../client", () => ({
  inngest: {
    createFunction: mocks.createFunction,
    send: mocks.inngestSend,
  },
}));
vi.mock("@repo/database/tenant-client", () => ({
  referenceDatabase: {
    // Real scope ownership and effects are exercised against this area's delegate fake.
    $transaction: async (run: (db: unknown) => Promise<unknown>) =>
      run({ ...mocks.scopeDatabase }),
  },
}));
vi.mock("@repo/database", async () => {
  const exports = {
    database: {
      availabilityRecord: { findMany: mocks.availabilityRecordFindMany },
    },
  };
  const mockedModule = {
    ...exports,
    assertTenantDb: vi.fn(),
    getScopedXeroConnection: vi.fn(async (bindingScope) => ({
      ok: true,
      value: {
        authorisation: { status: "active" },
        id: bindingScope.connectionId,
      },
    })),
    systemDatabase: exports.database,
    withTenantDb: vi.fn(
      async (_accountId: string, callback: (db: unknown) => unknown) =>
        callback(exports.database)
    ),
  };
  if (!("$executeRaw" in exports.database)) {
    Object.assign(exports.database, { $executeRaw: vi.fn(async () => 1) });
  }
  if (!("$queryRaw" in exports.database)) {
    Object.assign(exports.database, { $queryRaw: vi.fn(async () => []) });
  }
  mocks.scopeDatabase = exports.database;
  const core = await vi.importActual<typeof import("@repo/database/tenant-db")>(
    "@repo/database/tenant-db"
  );
  return { ...mockedModule, ...core };
});
vi.mock("@repo/feeds", () => ({
  feedIdsForPeople: mocks.feedIdsForPeople,
  materialiseAvailabilityPublication: mocks.materialiseAvailabilityPublication,
}));
vi.mock("@repo/observability/log", () => ({
  log: { error: vi.fn(), info: vi.fn() },
}));
const { reconcileFeedPublications } = await import(
  "./reconcile-feed-publications"
);
const ACCOUNT_ID = "org_reconcile";
const ORGANISATION_ID = "30000000-0000-4000-8000-000000000001";
const PERSON_ID = "10000000-0000-4000-8000-000000000001";
const RECORD_A = "40000000-0000-4000-8000-000000000001";
const RECORD_B = "40000000-0000-4000-8000-000000000002";
function input() {
  return { accountId: ACCOUNT_ID, organisationId: ORGANISATION_ID };
}
function materialised(changed: boolean) {
  return {
    ok: true,
    value: {
      availabilityRecordId: RECORD_A,
      changed,
      personId: PERSON_ID,
      publishedAt: new Date(),
      publishedDescription: null,
      publishedSequence: changed ? 1 : 0,
      publishedSummary: "Pat Taylor: Annual Leave",
      publishedUid: "stable@ical.teamcalendar.online",
    },
  };
}
const registeredHandler = mocks.createFunction.mock.calls[0]?.[1];
it("throws execution failures with valid input at the queue boundary", async () => {
  const handler = registeredHandler;
  expect(handler).toBeTypeOf("function");
  mocks.availabilityRecordFindMany.mockRejectedValueOnce(
    new Error("Database unavailable")
  );
  await expect(
    handler({
      event: { data: input() },
      step: {
        run: (_name: string, execute: () => Promise<unknown>) => execute(),
      },
    })
  ).rejects.toThrow();
  expect(mocks.availabilityRecordFindMany).toHaveBeenCalled();
});
describe("reconcileFeedPublications", () => {
  it("preserves materialised records when the rebuild send fails", async () => {
    mocks.materialiseAvailabilityPublication.mockResolvedValue(
      materialised(true)
    );
    mocks.inngestSend.mockRejectedValueOnce(new Error("Queue unavailable"));
    await expect(reconcileFeedPublications(input())).resolves.toMatchObject({
      error: { code: "unknown_error" },
      ok: false,
    });
    expect(mocks.materialiseAvailabilityPublication).toHaveBeenCalledTimes(2);
    expect(
      mocks.materialiseAvailabilityPublication.mock.invocationCallOrder.at(-1)
    ).toBeLessThan(mocks.inngestSend.mock.invocationCallOrder[0]);
  });
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.availabilityRecordFindMany.mockResolvedValue([
      { id: RECORD_A, person_id: PERSON_ID },
      { id: RECORD_B, person_id: PERSON_ID },
    ]);
    mocks.feedIdsForPeople.mockResolvedValue([
      {
        id: "20000000-0000-4000-8000-000000000001",
        organisationId: ORGANISATION_ID,
        privacyMode: "named",
      },
    ]);
  });
  it("queues account feed rebuilds using the feed's null company scope", async () => {
    mocks.feedIdsForPeople.mockResolvedValue([
      {
        id: "20000000-0000-4000-8000-000000000001",
        organisationId: null,
        privacyMode: "named",
      },
    ]);
    mocks.materialiseAvailabilityPublication.mockResolvedValue(
      materialised(true)
    );
    const result = await reconcileFeedPublications(input());
    expect(result.ok).toBe(true);
    expect(mocks.inngestSend).toHaveBeenCalledWith([
      expect.objectContaining({
        data: expect.objectContaining({ organisationId: null }),
      }),
    ]);
  });
  it("materialises every record with both scope keys and no per-record invalidation", async () => {
    mocks.materialiseAvailabilityPublication.mockResolvedValue(
      materialised(false)
    );
    const result = await reconcileFeedPublications(input());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toMatchObject({ failed: 0, scanned: 2 });
    }
    expect(mocks.availabilityRecordFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          account_id: ACCOUNT_ID,
          organisation_id: ORGANISATION_ID,
        },
      })
    );
    expect(mocks.materialiseAvailabilityPublication).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: ACCOUNT_ID,
        availabilityRecordId: RECORD_A,
        invalidateCache: false,
        organisationId: ORGANISATION_ID,
      }),
      expect.any(Object)
    );
  });
  it("is idempotent: no rebuilds enqueued when nothing materially changed", async () => {
    mocks.materialiseAvailabilityPublication.mockResolvedValue(
      materialised(false)
    );
    const result = await reconcileFeedPublications(input());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toMatchObject({ changed: 0, feedsQueued: 0 });
    }
    expect(mocks.feedIdsForPeople).not.toHaveBeenCalled();
    expect(mocks.inngestSend).not.toHaveBeenCalled();
  });
  it("enqueues one rebuild per affected feed when records change", async () => {
    mocks.materialiseAvailabilityPublication.mockResolvedValue(
      materialised(true)
    );
    const result = await reconcileFeedPublications(input());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toMatchObject({ changed: 2, feedsQueued: 1 });
    }
    expect(mocks.feedIdsForPeople).toHaveBeenCalledWith(
      {
        accountId: ACCOUNT_ID,
        organisationId: ORGANISATION_ID,
        personIds: [PERSON_ID],
      },
      expect.anything()
    );
    const { RebuildFeedCacheInputSchema } = await import(
      "./rebuild-feed-cache"
    );
    const dispatched = mocks.inngestSend.mock.calls[0]?.[0];
    expect(dispatched).toHaveLength(1);
    expect(
      RebuildFeedCacheInputSchema.safeParse(dispatched?.[0]?.data).success
    ).toBe(true);
    expect(mocks.inngestSend).toHaveBeenCalledWith([
      {
        data: {
          accountId: ACCOUNT_ID,
          feedId: "20000000-0000-4000-8000-000000000001",
          organisationId: ORGANISATION_ID,
          reason: "publication_reconciled",
        },
        name: "rebuild-feed-cache",
      },
    ]);
  });
  it("isolates record-level failures and keeps reconciling", async () => {
    mocks.materialiseAvailabilityPublication
      .mockResolvedValueOnce({
        error: { code: "internal", message: "boom" },
        ok: false,
      })
      .mockResolvedValueOnce(materialised(true));
    const result = await reconcileFeedPublications(input());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toMatchObject({
        changed: 1,
        failed: 1,
        scanned: 2,
      });
    }
    expect(mocks.materialiseAvailabilityPublication).toHaveBeenCalledTimes(2);
  });
  it("isolates record-level thrown errors during concurrent reconciliation", async () => {
    mocks.materialiseAvailabilityPublication
      .mockRejectedValueOnce(new Error("unexpected exception"))
      .mockResolvedValueOnce(materialised(true));
    const result = await reconcileFeedPublications(input());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toMatchObject({
        changed: 1,
        failed: 1,
        scanned: 2,
      });
    }
    expect(mocks.materialiseAvailabilityPublication).toHaveBeenCalledTimes(2);
  });
  it("isolates record-level failed results during concurrent reconciliation", async () => {
    mocks.materialiseAvailabilityPublication
      .mockResolvedValueOnce({
        error: { code: "internal", message: "failed to materialise" },
        ok: false,
      })
      .mockResolvedValueOnce(materialised(true));
    const result = await reconcileFeedPublications(input());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toMatchObject({
        changed: 1,
        failed: 1,
        scanned: 2,
      });
    }
    expect(mocks.materialiseAvailabilityPublication).toHaveBeenCalledTimes(2);
  });
  it("pages through records using cursor pagination when count exceeds PAGE_SIZE", async () => {
    const page1 = Array.from({ length: 500 }, (_, i) => ({
      id: `rec-1-${i.toString().padStart(4, "0")}`,
      person_id: PERSON_ID,
    }));
    const page2 = Array.from({ length: 50 }, (_, i) => ({
      id: `rec-2-${i.toString().padStart(4, "0")}`,
      person_id: PERSON_ID,
    }));
    mocks.availabilityRecordFindMany
      .mockResolvedValueOnce(page1)
      .mockResolvedValueOnce(page2);
    mocks.materialiseAvailabilityPublication.mockResolvedValue(
      materialised(false)
    );
    const result = await reconcileFeedPublications(input());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toMatchObject({ failed: 0, scanned: 550 });
    }
    expect(mocks.availabilityRecordFindMany).toHaveBeenCalledTimes(2);
    expect(mocks.availabilityRecordFindMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        cursor: undefined,
        skip: 0,
        take: 500,
      })
    );
    expect(mocks.availabilityRecordFindMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        cursor: { id: "rec-1-0499" },
        skip: 1,
        take: 500,
      })
    );
  });
  it("handles zero records cleanly without enqueuing rebuilds", async () => {
    mocks.availabilityRecordFindMany.mockResolvedValueOnce([]);
    const result = await reconcileFeedPublications(input());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toMatchObject({
        changed: 0,
        feedsQueued: 0,
        scanned: 0,
      });
    }
    expect(mocks.inngestSend).not.toHaveBeenCalled();
  });
  it("terminates when last page returns zero records", async () => {
    const fullPage = Array.from({ length: 500 }, (_, i) => ({
      id: `rec-${i.toString().padStart(4, "0")}`,
      person_id: PERSON_ID,
    }));
    mocks.availabilityRecordFindMany
      .mockResolvedValueOnce(fullPage)
      .mockResolvedValueOnce([]);
    mocks.materialiseAvailabilityPublication.mockResolvedValue(
      materialised(false)
    );
    const result = await reconcileFeedPublications(input());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toMatchObject({ scanned: 500 });
    }
    expect(mocks.availabilityRecordFindMany).toHaveBeenCalledTimes(2);
  });
  it("rejects payloads missing a scope key", async () => {
    const result = await reconcileFeedPublications({
      accountId: ACCOUNT_ID,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("validation_error");
    }
  });
});
