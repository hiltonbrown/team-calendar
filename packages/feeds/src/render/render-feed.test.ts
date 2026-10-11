import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  audit: vi.fn(() => Promise.resolve({ count: 1 })),
  auditFind: vi.fn(() => Promise.resolve(null)),
  cached: vi.fn(() => Promise.resolve({ ok: true, value: null })),
  establish: vi.fn(),
  stored: vi.fn(() => Promise.resolve({ ok: true })),
  token: vi.fn(),
  update: vi.fn(() => Promise.resolve({ count: 1 })),
  used: vi.fn(() => Promise.resolve({ count: 1 })),
  warn: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@repo/database", () => {
  const client = {
    auditEvent: { createMany: mocks.audit, findUnique: mocks.auditFind },
    feed: { updateMany: mocks.update },
    feedToken: { findUnique: mocks.token, updateMany: mocks.used },
  };
  return {
    systemDatabase: client,
    tenantDatabase: vi.fn(() => client),
    tenantTransaction: vi.fn((_clerkOrgId, callback) => callback(client)),
  };
});
vi.mock("@repo/observability/log", () => ({ log: { warn: mocks.warn } }));
vi.mock("../publication/feed-representation", () => ({
  establishFeedRepresentation: mocks.establish,
}));
vi.mock("../cache/feed-cache", () => ({
  feedCacheKey: ({ feedId, etag }: { feedId: string; etag: string }) =>
    `feed:${feedId}:${etag}`,
  getCachedFeedBody: mocks.cached,
  setCachedFeedBody: mocks.stored,
}));
const { renderFeedBody, renderFeedForToken, cachedEtagForToken } = await import(
  "./render-feed"
);
const { createSignedFeedToken } = await import("../tokens/token-service");
const input = {
  clerkOrgId: "org_render",
  feedId: "10000000-0000-4000-8000-000000000002",
  feedName: "Old name",
  organisationId: "10000000-0000-4000-8000-000000000001",
  privacyMode: "named" as const,
};
function event() {
  return {
    allDay: true,
    contactabilityStatus: null,
    description: null,
    displayName: "Jane",
    endsAt: new Date("2026-05-08T00:00:00Z"),
    eventClass: "PUBLIC",
    isPublicHoliday: false,
    location: "Brisbane",
    publishedAt: new Date("2026-05-01T02:03:04Z"),
    publishedSequence: 2,
    publishedUid: "stable@ical.teamcalendar.online",
    recordType: "annual_leave",
    sourceRecordId: "record",
    startsAt: new Date("2026-05-07T00:00:00Z"),
    summary: "Jane: Annual Leave",
  };
}
function snapshot(overrides: Record<string, unknown> = {}) {
  return {
    ok: true,
    value: {
      cacheEtag: null,
      events: [event()],
      feedName: "Current feed",
      fingerprint: "current",
      generation: 2,
      ...overrides,
    },
  };
}
function token(overrides: Record<string, unknown> = {}) {
  return {
    clerk_org_id: input.clerkOrgId,
    expires_at: null,
    feed: {
      id: input.feedId,
      name: "Current feed",
      privacy_mode: "named",
      status: "active",
    },
    feed_id: input.feedId,
    id: "10000000-0000-4000-8000-000000000003",
    last_used_at: null,
    organisation_id: input.organisationId,
    status: "active",
    token_hash: "ab".repeat(32),
    ...overrides,
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
  mocks.establish.mockResolvedValue(snapshot());
  mocks.token.mockResolvedValue(token());
  mocks.cached.mockResolvedValue({ ok: true, value: null });
  mocks.stored.mockResolvedValue({ ok: true });
});
describe("real ICS serialization", () => {
  it("emits durable UID, sequence, stamp, CLASS and exclusive all-day end", async () => {
    const result = await renderFeedBody(input);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.body).toContain(
      "UID:stable@ical.teamcalendar.online\r\n"
    );
    expect(result.value.body).toContain("SEQUENCE:2\r\n");
    expect(result.value.body).toContain("DTSTAMP:20260501T020304Z\r\n");
    expect(result.value.body).toContain("CLASS:PUBLIC\r\n");
    expect(result.value.body).toContain("DTSTART;VALUE=DATE:20260507\r\n");
    expect(result.value.body).toContain("DTEND;VALUE=DATE:20260508\r\n");
    expect(result.value.body).toContain("X-WR-CALNAME:Current feed");
  });
  it("keeps bytes and ETag unchanged across clocks", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01"));
    const first = await renderFeedBody(input);
    expect(first.ok).toBe(true);
    vi.setSystemTime(new Date("2027-01-01"));
    const second = await renderFeedBody(input);
    expect(second.ok).toBe(true);
    expect(second).toEqual(first);
  });
  it("emits PRIVATE classification with current masked output", async () => {
    mocks.establish.mockResolvedValue(
      snapshot({
        events: [
          {
            ...event(),
            eventClass: "PRIVATE",
            location: null,
            summary: "Out of office",
          },
        ],
      })
    );
    const result = await renderFeedBody(input);
    expect(result.ok && result.value.body).toContain("CLASS:PRIVATE\r\n");
    expect(result.ok && result.value.body).not.toContain("Jane");
  });
  it("retries a late render using a new authoritative snapshot", async () => {
    mocks.establish.mockResolvedValueOnce(snapshot()).mockResolvedValue(
      snapshot({
        events: [{ ...event(), eventClass: "PRIVATE", summary: "Busy" }],
        fingerprint: "new",
        generation: 3,
      })
    );
    const result = await renderFeedBody(input);
    expect(result.ok && result.value.body).toContain("SUMMARY:Busy\r\n");
    expect(result.ok && result.value.body).not.toContain("Annual Leave");
  });
  it("fails safely when every snapshot changes", async () => {
    let generation = 0;
    mocks.establish.mockImplementation(() => {
      generation += 1;
      return Promise.resolve(
        snapshot({ fingerprint: String(generation), generation })
      );
    });
    expect(await renderFeedBody(input)).toMatchObject({ ok: false });
  });
  it("cannot render when authoritative projection fails", async () => {
    mocks.establish.mockResolvedValue({
      error: { code: "unknown_error", message: "Unavailable" },
      ok: false,
    });
    expect(await renderFeedBody(input)).toMatchObject({ ok: false });
  });
});
describe("current token and cache visibility", () => {
  it.each(["revoked", "expired"])(
    "rejects %s tokens before cache lookup",
    async (status) => {
      mocks.token.mockResolvedValue(token({ status }));
      expect(await renderFeedForToken("legacy")).toMatchObject({
        ok: true,
        value: { status },
      });
      expect(mocks.cached).not.toHaveBeenCalled();
      expect(mocks.establish).not.toHaveBeenCalled();
    }
  );
  it("rejects archived and time-expired tokens", async () => {
    mocks.token.mockResolvedValue(
      token({ expires_at: new Date("2000-01-01") })
    );
    expect(await cachedEtagForToken("legacy")).toBeNull();
    mocks.token.mockResolvedValue(
      token({ feed: { ...token().feed, status: "archived" } })
    );
    expect(await renderFeedForToken("legacy")).toMatchObject({
      value: { status: "revoked" },
    });
  });
  it("rejects revocation during a cache read even with an old cached validator", async () => {
    mocks.establish.mockResolvedValue(snapshot({ cacheEtag: "old" }));
    mocks.cached.mockImplementationOnce(() => {
      mocks.token.mockResolvedValue(token({ status: "revoked" }));
      return Promise.resolve({ ok: true, value: { body: "OLD", etag: "old" } });
    });
    expect(await renderFeedForToken("legacy")).toMatchObject({
      value: { body: "", etag: "", status: "revoked" },
    });
    expect(mocks.cached).toHaveBeenCalledWith(`feed:${input.feedId}:old`);
  });
  it("never serves an obsolete body and keys new content by its ETag", async () => {
    mocks.establish.mockResolvedValue(snapshot({ cacheEtag: "current-cache" }));
    mocks.cached.mockResolvedValue({
      ok: true,
      value: { body: "PRIVATE LEAK", etag: "old" },
    });
    const result = await renderFeedForToken("legacy");
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.body).not.toContain("PRIVATE LEAK");
    expect(mocks.stored).toHaveBeenCalledWith(
      expect.objectContaining({
        key: `feed:${input.feedId}:${result.value.etag}`,
      })
    );
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          clerk_org_id: input.clerkOrgId,
          organisation_id: input.organisationId,
          representation_generation: 2,
        }),
      })
    );
  });
  it("reuses the immutable cached body after an authoritative snapshot", async () => {
    mocks.establish.mockResolvedValue(snapshot({ cacheEtag: "cached-etag" }));
    mocks.cached.mockResolvedValue({
      ok: true,
      value: { body: "AUTHORITATIVE CACHED ICS", etag: "cached-etag" },
    });
    const result = await renderFeedBody(input);
    expect(result).toMatchObject({
      ok: true,
      value: { body: "AUTHORITATIVE CACHED ICS", etag: "cached-etag" },
    });
    expect(mocks.cached).toHaveBeenCalledWith(
      `feed:${input.feedId}:cached-etag`
    );
    expect(mocks.establish).toHaveBeenCalledTimes(2);
  });
  it("persists time expiry without overriding a concurrent revocation", async () => {
    mocks.token.mockResolvedValue(
      token({ expires_at: new Date("2000-01-01") })
    );
    expect(await renderFeedForToken("legacy")).toMatchObject({
      value: { status: "expired" },
    });
    expect(mocks.used).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: "expired" },
        where: expect.objectContaining({
          clerk_org_id: input.clerkOrgId,
          expires_at: expect.anything(),
          organisation_id: input.organisationId,
          status: "active",
        }),
      })
    );
  });
  it("throttles activity to hourly without losing the durable activation milestone", async () => {
    mocks.token.mockResolvedValue(token({ last_used_at: new Date() }));
    const recent = await renderFeedForToken("legacy");
    expect(recent.ok).toBe(true);
    if (recent.ok) {
      await recent.value.activation;
    }
    expect(mocks.used).not.toHaveBeenCalled();
    mocks.audit.mockClear();
    mocks.token.mockResolvedValue(
      token({ last_used_at: new Date(Date.now() - 7_200_000) })
    );
    const old = await renderFeedForToken("legacy");
    expect(old.ok).toBe(true);
    if (old.ok) {
      await old.value.activation;
    }
    expect(mocks.used).toHaveBeenCalledOnce();
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({ skipDuplicates: true })
    );
    expect(mocks.auditFind).toHaveBeenCalled();
  });
  it("keeps valid content available if activity telemetry fails", async () => {
    mocks.used.mockRejectedValueOnce(new Error("activity unavailable"));
    const result = await renderFeedForToken("legacy");
    expect(result.ok).toBe(true);
    if (result.ok) {
      await result.value.activation;
    }
    expect(mocks.warn).toHaveBeenCalledWith(
      "Feed token use write failed",
      expect.objectContaining({ feedId: input.feedId })
    );
  });
  it("keeps current publication available during cache transport failure", async () => {
    mocks.stored.mockRejectedValueOnce(new Error("KV unavailable"));
    expect(await renderFeedForToken("legacy")).toMatchObject({
      ok: true,
      value: { status: "active" },
    });
    expect(mocks.warn).toHaveBeenCalled();
  });
  it("verifies signed token credentials", async () => {
    const signed = createSignedFeedToken({
      tokenHash: token().token_hash,
      tokenId: token().id,
    });
    expect(await renderFeedForToken(signed)).toMatchObject({ ok: true });
    expect(await renderFeedForToken(`${signed}invalid`)).toMatchObject({
      ok: false,
    });
  });
});
