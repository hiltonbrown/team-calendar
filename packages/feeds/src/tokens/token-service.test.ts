import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auditEventCreate: vi.fn(),
  feedFindFirst: vi.fn(),
  feedFindMany: vi.fn(),
  feedTokenFindFirst: vi.fn(),
  feedTokenFindMany: vi.fn(),
  feedTokenUpdate: vi.fn(),
  feedTokenUpdateMany: vi.fn(),
  invalidateFeedCache: vi.fn(),
  logError: vi.fn(),
  queryRaw: vi.fn(),
  scopedTo: vi.fn((input: { clerkOrgId: string; organisationId: string }) => ({
    clerk_org_id: input.clerkOrgId,
    organisation_id: input.organisationId,
  })),
  transaction: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@repo/observability/log", () => ({
  log: { error: mocks.logError, info: vi.fn(), warn: vi.fn() },
}));
vi.mock("@repo/database", () => ({
  database: {
    $queryRaw: mocks.queryRaw,
    $transaction: mocks.transaction,
    auditEvent: {
      create: mocks.auditEventCreate,
    },
    feed: {
      findFirst: mocks.feedFindFirst,
      findMany: mocks.feedFindMany,
    },
    feedToken: {
      findFirst: mocks.feedTokenFindFirst,
      findMany: mocks.feedTokenFindMany,
      update: mocks.feedTokenUpdate,
      updateMany: mocks.feedTokenUpdateMany,
    },
  },
  scopedTo: mocks.scopedTo,
}));
vi.mock("../cache/feed-cache", () => ({
  invalidateFeedCache: mocks.invalidateFeedCache,
}));

const {
  createSignedFeedToken,
  createInitialTokenWithClient,
  generateFeedTokenSecret,
  hashFeedToken,
  revokeAllFeedTokens,
  revokeToken,
  rotateToken,
  signedFeedTokenId,
  verifySignedFeedToken,
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
const SIGNED_TOKEN_PATTERN = /^tc1\.[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}$/;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.transaction.mockImplementation((callback) => callback(mockDatabase()));
  mocks.auditEventCreate.mockResolvedValue({ id: "audit_1" });
  mocks.feedFindFirst.mockResolvedValue({ id: baseInput.feedId });
  mocks.feedFindMany.mockResolvedValue([]);
  mocks.queryRaw.mockImplementation(
    (_strings: TemplateStringsArray, tokenId: string) =>
      Promise.resolve([{ id: tokenId }])
  );
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
  it("generates distinct base64url token secrets", () => {
    const first = generateFeedTokenSecret();
    const second = generateFeedTokenSecret();

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
    expect(hashFeedToken("team-calendar-test-vector")).toBe(
      "674691f5c86301ca2ebf20072f56f06cf5e72347db4f643a309f7f7596c5e18c"
    );
  });

  it("creates and verifies a recoverable signed token", () => {
    const tokenId = "71000000-0000-4000-8000-000000000003";
    const tokenHash = "ab".repeat(32);
    const token = createSignedFeedToken({ tokenHash, tokenId });

    expect(token).toMatch(SIGNED_TOKEN_PATTERN);
    expect(signedFeedTokenId(token)).toBe(tokenId);
    expect(verifySignedFeedToken({ token, tokenHash, tokenId })).toBe(true);
    expect(
      verifySignedFeedToken({
        token: `${token.slice(0, -1)}x`,
        tokenHash,
        tokenId,
      })
    ).toBe(false);
    expect(signedFeedTokenId("legacy-random-token")).toBeNull();
  });
});

describe("feed token lifecycle with a mocked database", () => {
  it("creates the initial token with a stored secret hash and signed disclosure", async () => {
    const tx = mockDatabase() as unknown as Parameters<
      typeof createInitialTokenWithClient
    >[0];
    const result = await createInitialTokenWithClient(tx, baseInput);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.plaintext).toMatch(SIGNED_TOKEN_PATTERN);
    expect(result.value.hint).toBe(result.value.plaintext.slice(-4));
    expect(mocks.feedFindFirst).toHaveBeenCalledWith({
      select: { id: true },
      where: scopedFeed(),
    });
    expect(mocks.feedTokenFindFirst).toHaveBeenCalledWith({
      select: { id: true },
      where: scopedTokenByFeed(),
    });
    const [insertCall] = mocks.queryRaw.mock.calls;
    const tokenHash = insertCall?.[5];
    expect(insertCall).toEqual(
      expect.arrayContaining([
        result.value.tokenId,
        baseInput.clerkOrgId,
        baseInput.organisationId,
        baseInput.feedId,
        expect.stringMatching(TOKEN_HASH_PATTERN),
        result.value.hint,
      ])
    );
    expect(
      createSignedFeedToken({
        tokenHash,
        tokenId: result.value.tokenId,
      })
    ).toBe(result.value.plaintext);
    expect(databaseCallsAsText()).not.toContain(result.value.plaintext);
  });

  it("rotates the active token with scoped queries and a rotation link", async () => {
    mocks.feedTokenFindMany.mockResolvedValue([
      { id: "71000000-0000-4000-8000-000000000010" },
    ]);
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
    expect(mocks.queryRaw.mock.calls[0]).toEqual(
      expect.arrayContaining([
        result.value.tokenId,
        baseInput.clerkOrgId,
        baseInput.organisationId,
        baseInput.feedId,
        expect.stringMatching(TOKEN_HASH_PATTERN),
        result.value.hint,
        "71000000-0000-4000-8000-000000000010",
      ])
    );
    expect(mocks.invalidateFeedCache).toHaveBeenCalledWith({
      feedId: baseInput.feedId,
    });
  });

  it("returns a stable conflict when concurrent initialisation loses", async () => {
    mocks.queryRaw.mockResolvedValue([]);
    const tx = mockDatabase() as unknown as Parameters<
      typeof createInitialTokenWithClient
    >[0];

    await expect(createInitialTokenWithClient(tx, baseInput)).resolves.toEqual({
      error: {
        code: "initial_token_exists",
        message: "This feed already has an active token.",
      },
      ok: false,
    });
    expect(mocks.auditEventCreate).not.toHaveBeenCalled();
  });

  it("returns a stable conflict when concurrent rotation loses", async () => {
    mocks.feedTokenFindMany.mockResolvedValue([
      { id: "71000000-0000-4000-8000-000000000010" },
    ]);
    mocks.queryRaw.mockResolvedValue([]);

    await expect(rotateToken(baseInput)).resolves.toEqual({
      error: {
        code: "active_token_conflict",
        message:
          "The feed token changed during rotation. Refresh and try again.",
      },
      ok: false,
    });
    expect(mocks.auditEventCreate).not.toHaveBeenCalled();
    expect(mocks.invalidateFeedCache).not.toHaveBeenCalled();
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

  it("returns token_not_found and logs when revoke finds a token outside the tenant", async () => {
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
      error: { code: "token_not_found" },
      ok: false,
    });
    expect(mocks.logError).toHaveBeenCalledWith(
      "Cross-tenant resource access attempt",
      {
        actingClerkOrgId: baseInput.clerkOrgId,
        actingOrganisationId: baseInput.organisationId,
        resourceId: "71000000-0000-4000-8000-000000000020",
        resourceType: "feed_token",
      }
    );
    expect(mocks.feedTokenUpdate).not.toHaveBeenCalled();
  });

  it("returns identical error for other-tenant token and non-existent token", async () => {
    mocks.feedTokenFindFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        clerk_org_id: "org_other",
        organisation_id: "72000000-0000-4000-8000-000000000002",
      })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);

    const otherTenant = await revokeToken({
      actingRole: baseInput.actingRole,
      actingUserId: baseInput.actingUserId,
      clerkOrgId: baseInput.clerkOrgId,
      organisationId: baseInput.organisationId,
      tokenId: "71000000-0000-4000-8000-000000000020",
    });
    const nonExistent = await revokeToken({
      actingRole: baseInput.actingRole,
      actingUserId: baseInput.actingUserId,
      clerkOrgId: baseInput.clerkOrgId,
      organisationId: baseInput.organisationId,
      tokenId: "71000000-0000-4000-8000-000000000099",
    });

    expect(otherTenant).toEqual(nonExistent);
  });

  it("does not log error when token is genuinely not found", async () => {
    mocks.logError.mockClear();
    mocks.feedTokenFindFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);

    await revokeToken({
      actingRole: baseInput.actingRole,
      actingUserId: baseInput.actingUserId,
      clerkOrgId: baseInput.clerkOrgId,
      organisationId: baseInput.organisationId,
      tokenId: "71000000-0000-4000-8000-000000000099",
    });

    expect(mocks.logError).not.toHaveBeenCalled();
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
    $queryRaw: mocks.queryRaw,
    auditEvent: {
      create: mocks.auditEventCreate,
    },
    feed: {
      findFirst: mocks.feedFindFirst,
      findMany: mocks.feedFindMany,
    },
    feedToken: {
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
    findFirst: mocks.feedTokenFindFirst.mock.calls,
    findMany: mocks.feedTokenFindMany.mock.calls,
    insert: mocks.queryRaw.mock.calls,
    update: mocks.feedTokenUpdate.mock.calls,
    updateMany: mocks.feedTokenUpdateMany.mock.calls,
  });
}
