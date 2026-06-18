import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auditEventCreate: vi.fn(),
  feedFindFirst: vi.fn(),
  feedFindMany: vi.fn(),
  feedTokenCreate: vi.fn(),
  feedTokenFindFirst: vi.fn(),
  feedTokenFindMany: vi.fn(),
  feedTokenUpdate: vi.fn(),
  feedTokenUpdateMany: vi.fn(),
  invalidateFeedCache: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@repo/database", () => ({
  database: {
    $transaction: mocks.transaction,
    auditEvent: {
      create: mocks.auditEventCreate,
    },
    feed: {
      findFirst: mocks.feedFindFirst,
      findMany: mocks.feedFindMany,
    },
    feedToken: {
      create: mocks.feedTokenCreate,
      findFirst: mocks.feedTokenFindFirst,
      findMany: mocks.feedTokenFindMany,
      update: mocks.feedTokenUpdate,
      updateMany: mocks.feedTokenUpdateMany,
    },
  },
}));
vi.mock("../cache/feed-cache", () => ({
  invalidateFeedCache: mocks.invalidateFeedCache,
}));

const {
  createInitialToken,
  generateFeedTokenPlaintext,
  getActiveTokenHint,
  hashFeedToken,
  listTokens,
  revokeAllFeedTokens,
  revokeToken,
  rotateToken,
} = await import("./token-service");

const baseInput = {
  actingRole: "org:admin",
  actingUserId: "user_admin",
  clerkOrgId: "org_token_service_a",
  feedId: "71000000-0000-4000-8000-000000000001",
  organisationId: "71000000-0000-4000-8000-000000000002",
};
const TOKEN_HASH_PATTERN = /^[a-f0-9]{64}$/;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{40}$/;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.transaction.mockImplementation((callback) => callback(mockDatabase()));
  mocks.auditEventCreate.mockResolvedValue({ id: "audit_1" });
  mocks.feedFindFirst.mockResolvedValue({ id: baseInput.feedId });
  mocks.feedFindMany.mockResolvedValue([]);
  mocks.feedTokenCreate.mockResolvedValue({
    id: "71000000-0000-4000-8000-000000000003",
  });
  mocks.feedTokenFindFirst.mockResolvedValue(null);
  mocks.feedTokenFindMany.mockResolvedValue([]);
  mocks.feedTokenUpdate.mockResolvedValue({ id: "token_1" });
  mocks.feedTokenUpdateMany.mockResolvedValue({ count: 1 });
  mocks.invalidateFeedCache.mockResolvedValue({
    ok: true,
    value: { deletedCount: 0 },
  });
});

describe("feed token pure functions", () => {
  it("generates distinct base64url plaintext tokens", () => {
    const first = generateFeedTokenPlaintext();
    const second = generateFeedTokenPlaintext();

    expect(first).toMatch(TOKEN_PATTERN);
    expect(second).toMatch(TOKEN_PATTERN);
    expect(first).not.toBe(second);
  });

  it("hashes tokens deterministically as lowercase SHA-256 hex", () => {
    const first = hashFeedToken("token-plaintext");
    const second = hashFeedToken("token-plaintext");

    expect(first).toBe(second);
    expect(first).toMatch(TOKEN_HASH_PATTERN);
  });

  it("pins the token hash stability vector", () => {
    // If this test fails, every persisted token_hash in production is invalidated,
    // do not update the expectation without a migration plan.
    expect(hashFeedToken("leavesync-test-vector")).toBe(
      "b61d4e761bb66dbd3be2fc675178a07d3767b5e667ab9f755c8183dedbdf3233"
    );
  });
});

describe("feed token lifecycle with a mocked database", () => {
  it("creates the initial token with a stored hash and one-time plaintext disclosure", async () => {
    const result = await createInitialToken(baseInput);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.plaintext).toMatch(TOKEN_PATTERN);
    expect(result.value.hint).toBe(result.value.plaintext.slice(-4));
    expect(mocks.feedFindFirst).toHaveBeenCalledWith({
      select: { id: true },
      where: scopedFeed(),
    });
    expect(mocks.feedTokenFindFirst).toHaveBeenCalledWith({
      select: { id: true },
      where: scopedTokenByFeed(),
    });
    expect(mocks.feedTokenCreate).toHaveBeenCalledWith({
      data: {
        ...scopedTokenByFeed(),
        token_hash: hashFeedToken(result.value.plaintext),
        token_hint: result.value.hint,
      },
      select: { id: true },
    });
    expect(databaseCallsAsText()).not.toContain(result.value.plaintext);
  });

  it("rotates the active token with scoped queries and a rotation link", async () => {
    mocks.feedTokenFindMany.mockResolvedValue([
      { id: "71000000-0000-4000-8000-000000000010" },
    ]);
    mocks.feedTokenCreate.mockResolvedValue({
      id: "71000000-0000-4000-8000-000000000011",
    });

    const result = await rotateToken(baseInput);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.previousTokenId).toBe(
      "71000000-0000-4000-8000-000000000010"
    );
    expect(mocks.feedFindFirst).toHaveBeenCalledWith({
      select: { id: true },
      where: scopedFeed(),
    });
    expect(mocks.feedTokenFindMany).toHaveBeenCalledWith({
      orderBy: { created_at: "desc" },
      select: { id: true },
      where: { ...scopedTokenByFeed(), status: "active" },
    });
    expect(mocks.feedTokenUpdateMany).toHaveBeenCalledWith({
      data: { revoked_at: expect.any(Date), status: "revoked" },
      where: { ...scopedTokenByFeed(), status: "active" },
    });
    expect(mocks.feedTokenCreate).toHaveBeenCalledWith({
      data: {
        ...scopedTokenByFeed(),
        rotated_from_token_id: "71000000-0000-4000-8000-000000000010",
        token_hash: hashFeedToken(result.value.plaintext),
        token_hint: result.value.hint,
      },
      select: { id: true },
    });
    expect(mocks.invalidateFeedCache).toHaveBeenCalledWith({
      feedId: baseInput.feedId,
    });
  });

  it("revokes a token only after a scoped lookup", async () => {
    mocks.feedTokenFindFirst.mockResolvedValue({
      feed_id: baseInput.feedId,
      id: "71000000-0000-4000-8000-000000000020",
      status: "active",
      token_hint: "AbCd",
    });

    const result = await revokeToken({
      actingRole: baseInput.actingRole,
      actingUserId: baseInput.actingUserId,
      clerkOrgId: baseInput.clerkOrgId,
      organisationId: baseInput.organisationId,
      tokenId: "71000000-0000-4000-8000-000000000020",
    });

    expect(result).toMatchObject({
      ok: true,
      value: {
        feedId: baseInput.feedId,
        tokenId: "71000000-0000-4000-8000-000000000020",
      },
    });
    expect(mocks.feedTokenFindFirst).toHaveBeenCalledWith({
      select: { feed_id: true, id: true, status: true, token_hint: true },
      where: {
        clerk_org_id: baseInput.clerkOrgId,
        id: "71000000-0000-4000-8000-000000000020",
        organisation_id: baseInput.organisationId,
      },
    });
    expect(mocks.feedTokenUpdate).toHaveBeenCalledWith({
      data: { revoked_at: expect.any(Date), status: "revoked" },
      where: { id: "71000000-0000-4000-8000-000000000020" },
    });
  });

  it("returns cross_org_leak when revoke finds a token outside the tenant", async () => {
    mocks.feedTokenFindFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({
      clerk_org_id: "org_other",
      organisation_id: "72000000-0000-4000-8000-000000000002",
    });

    const result = await revokeToken({
      actingRole: baseInput.actingRole,
      actingUserId: baseInput.actingUserId,
      clerkOrgId: baseInput.clerkOrgId,
      organisationId: baseInput.organisationId,
      tokenId: "71000000-0000-4000-8000-000000000020",
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "cross_org_leak" },
    });
    expect(mocks.feedTokenUpdate).not.toHaveBeenCalled();
  });

  it("lists token history and scopes the feed and token queries", async () => {
    const createdAt = new Date("2026-06-12T09:00:00.000Z");
    const lastUsedAt = new Date("2026-06-12T10:00:00.000Z");
    const revokedAt = new Date("2026-06-12T11:00:00.000Z");
    mocks.feedTokenFindMany.mockResolvedValue([
      {
        created_at: createdAt,
        id: "71000000-0000-4000-8000-000000000030",
        last_used_at: lastUsedAt,
        revoked_at: revokedAt,
        rotated_from_token_id: "71000000-0000-4000-8000-000000000029",
        status: "revoked",
      },
    ]);

    const result = await listTokens({
      clerkOrgId: baseInput.clerkOrgId,
      feedId: baseInput.feedId,
      includeRevoked: true,
      organisationId: baseInput.organisationId,
    });

    expect(result).toEqual({
      ok: true,
      value: [
        {
          createdAt,
          id: "71000000-0000-4000-8000-000000000030",
          lastUsedAt,
          revokedAt,
          rotatedFromTokenId: "71000000-0000-4000-8000-000000000029",
          status: "revoked",
        },
      ],
    });
    expect(mocks.feedFindFirst).toHaveBeenCalledWith({
      select: { id: true },
      where: scopedFeed(),
    });
    expect(mocks.feedTokenFindMany).toHaveBeenCalledWith({
      orderBy: { created_at: "desc" },
      select: expect.any(Object),
      where: scopedTokenByFeed(),
    });
  });

  it("returns the active token hint with scoped queries", async () => {
    const createdAt = new Date("2026-06-12T09:00:00.000Z");
    const lastUsedAt = new Date("2026-06-12T10:00:00.000Z");
    mocks.feedTokenFindFirst.mockResolvedValue({
      created_at: createdAt,
      id: "71000000-0000-4000-8000-000000000040",
      last_used_at: lastUsedAt,
      token_hint: "Wxyz",
    });

    const result = await getActiveTokenHint({
      clerkOrgId: baseInput.clerkOrgId,
      feedId: baseInput.feedId,
      organisationId: baseInput.organisationId,
    });

    expect(result).toEqual({
      ok: true,
      value: {
        createdAt,
        hint: "Wxyz",
        lastUsedAt,
        tokenId: "71000000-0000-4000-8000-000000000040",
      },
    });
    expect(mocks.feedFindFirst).toHaveBeenCalledWith({
      select: { id: true },
      where: scopedFeed(),
    });
    expect(mocks.feedTokenFindFirst).toHaveBeenCalledWith({
      orderBy: { created_at: "desc" },
      select: {
        created_at: true,
        id: true,
        last_used_at: true,
        token_hint: true,
      },
      where: { ...scopedTokenByFeed(), status: "active" },
    });
  });

  it("revokes all active tokens with both tenant identifiers", async () => {
    mocks.feedTokenUpdateMany.mockResolvedValue({ count: 3 });
    mocks.feedFindMany.mockResolvedValue([
      { id: baseInput.feedId },
      { id: "71000000-0000-4000-8000-000000000050" },
    ]);

    const result = await revokeAllFeedTokens({
      clerkOrgId: baseInput.clerkOrgId,
      organisationId: baseInput.organisationId,
    });

    expect(result).toEqual({ ok: true, value: { revokedCount: 3 } });
    expect(mocks.feedTokenUpdateMany).toHaveBeenCalledWith({
      data: { revoked_at: expect.any(Date), status: "revoked" },
      where: {
        clerk_org_id: baseInput.clerkOrgId,
        organisation_id: baseInput.organisationId,
        status: "active",
      },
    });
    expect(mocks.feedFindMany).toHaveBeenCalledWith({
      select: { id: true },
      where: {
        clerk_org_id: baseInput.clerkOrgId,
        organisation_id: baseInput.organisationId,
      },
    });
    expect(mocks.invalidateFeedCache).toHaveBeenCalledTimes(2);
  });
});

function mockDatabase() {
  return {
    auditEvent: {
      create: mocks.auditEventCreate,
    },
    feed: {
      findFirst: mocks.feedFindFirst,
      findMany: mocks.feedFindMany,
    },
    feedToken: {
      create: mocks.feedTokenCreate,
      findFirst: mocks.feedTokenFindFirst,
      findMany: mocks.feedTokenFindMany,
      update: mocks.feedTokenUpdate,
      updateMany: mocks.feedTokenUpdateMany,
    },
  };
}

function scopedFeed() {
  return {
    clerk_org_id: baseInput.clerkOrgId,
    id: baseInput.feedId,
    organisation_id: baseInput.organisationId,
  };
}

function scopedTokenByFeed() {
  return {
    clerk_org_id: baseInput.clerkOrgId,
    feed_id: baseInput.feedId,
    organisation_id: baseInput.organisationId,
  };
}

function databaseCallsAsText() {
  return JSON.stringify({
    audit: mocks.auditEventCreate.mock.calls,
    create: mocks.feedTokenCreate.mock.calls,
    findFirst: mocks.feedTokenFindFirst.mock.calls,
    findMany: mocks.feedTokenFindMany.mock.calls,
    update: mocks.feedTokenUpdate.mock.calls,
    updateMany: mocks.feedTokenUpdateMany.mock.calls,
  });
}
