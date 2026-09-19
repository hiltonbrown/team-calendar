import { beforeEach, describe, expect, it, vi } from "vitest";

const icalMocks = vi.hoisted(() => {
  const state: { events: unknown[] } = { events: [] };
  const createEvent = vi.fn((opts: unknown) => {
    state.events.push(opts);
  });
  const calendarToString = vi.fn(() => {
    let body = "BEGIN:VCALENDAR\r\n";
    for (const e of state.events as Array<{
      description?: string | null;
      id: string;
      location?: string | null;
      sequence: number;
      summary: string;
    }>) {
      body += `UID:${e.id}\r\n`;
      body += `SEQUENCE:${e.sequence}\r\n`;
      body += `SUMMARY:${e.summary}\r\n`;
      if (e.description) {
        body += `DESCRIPTION:${e.description}\r\n`;
      }
      if (e.location) {
        body += `LOCATION:${e.location}\r\n`;
      }
    }
    body += "END:VCALENDAR\r\n";
    return body;
  });
  const ctor = vi.fn(() => {
    state.events = [];
    return { createEvent, toString: calendarToString };
  });
  return {
    calendarToString,
    createEvent,
    ctor,
    state,
    toString: calendarToString,
  };
});

const mocks = vi.hoisted(() => ({
  feedTokenFindFirst: vi.fn(() =>
    Promise.resolve({ last_used_at: new Date("2026-09-19T00:00:00.000Z") })
  ),
  feedTokenFindUnique: vi.fn(),
  feedTokenUpdate: vi.fn(() => Promise.resolve({ count: 1 })),
  feedUpdate: vi.fn(() => Promise.resolve({})),
  getCachedFeedBody: vi.fn(() => Promise.resolve({ ok: true, value: null })),
  logWarn: vi.fn(),
  projectFeedEvents: vi.fn(() =>
    Promise.resolve({
      ok: true,
      value: [
        {
          allDay: true,
          contactabilityStatus: "unavailable",
          description: null,
          displayName: "Jane Smith",
          endsAt: new Date("2026-05-08T00:00:00.000Z"),
          isPublicHoliday: false,
          location: "Brisbane",
          publishedSequence: 2,
          publishedUid: "stable@ical.teamcalendar.online",
          recordType: "annual_leave",
          sourceRecordId: "10000000-0000-4000-8000-000000000001",
          startsAt: new Date("2026-05-07T00:00:00.000Z"),
          summary: "Jane Smith: Annual Leave",
        },
      ],
    })
  ),
  setCachedFeedBody: vi.fn(() =>
    Promise.resolve({ ok: true, value: undefined })
  ),
}));

vi.mock("server-only", () => ({}));
vi.mock("@repo/database", () => ({
  database: {
    feed: { update: mocks.feedUpdate },
    feedToken: {
      findFirst: mocks.feedTokenFindFirst,
      findUnique: mocks.feedTokenFindUnique,
      update: mocks.feedTokenUpdate,
      updateMany: mocks.feedTokenUpdate,
    },
  },
}));
vi.mock("@repo/observability/log", () => ({
  log: { warn: mocks.logWarn },
}));
vi.mock("../cache/feed-cache", () => ({
  feedCacheKey: () => "feed:cache:key",
  getCachedFeedBody: mocks.getCachedFeedBody,
  setCachedFeedBody: mocks.setCachedFeedBody,
}));
vi.mock("../projection/feed-projection", () => ({
  projectFeedEvents: mocks.projectFeedEvents,
}));
vi.mock("ical-generator", () => ({
  default: icalMocks.ctor,
  ICalEventTransparency: { OPAQUE: "OPAQUE" },
}));

const { cachedEtagForToken, renderFeedBody, renderFeedForToken } = await import(
  "./render-feed"
);
const { createSignedFeedToken } = await import("../tokens/token-service");

function feedTokenFixture(overrides: Record<string, unknown> = {}) {
  return {
    clerk_org_id: "org_render",
    expires_at: null,
    feed: {
      id: "20000000-0000-4000-8000-000000000001",
      name: "Team feed",
      privacy_mode: "named",
      status: "active",
      updated_at: new Date("2026-05-01T00:00:00.000Z"),
    },
    feed_id: "20000000-0000-4000-8000-000000000001",
    id: "30000000-0000-4000-8000-000000000001",
    last_used_at: null,
    organisation_id: "40000000-0000-4000-8000-000000000001",
    status: "active",
    token_hash: "ab".repeat(32),
    ...overrides,
  };
}

const renderBodyInput = {
  clerkOrgId: "org_render",
  feedId: "20000000-0000-4000-8000-000000000001",
  feedName: "Team feed",
  organisationId: "40000000-0000-4000-8000-000000000001",
  privacyMode: "named" as const,
};

describe("renderFeedBody", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.projectFeedEvents.mockResolvedValue({
      ok: true,
      value: [
        {
          allDay: true,
          contactabilityStatus: "unavailable",
          description: null,
          displayName: "Jane Smith",
          endsAt: new Date("2026-05-08T00:00:00.000Z"),
          isPublicHoliday: false,
          location: "Brisbane",
          publishedSequence: 2,
          publishedUid: "stable@ical.teamcalendar.online",
          recordType: "annual_leave",
          sourceRecordId: "10000000-0000-4000-8000-000000000001",
          startsAt: new Date("2026-05-07T00:00:00.000Z"),
          summary: "Jane Smith: Annual Leave",
        },
      ],
    });
  });

  it("returns not_found when projection returns feed_not_found", async () => {
    mocks.projectFeedEvents.mockResolvedValue({
      error: { code: "feed_not_found", message: "Feed not found." },
      ok: false,
    });

    const result = await renderFeedBody(renderBodyInput);

    expect(result).toEqual({
      error: { code: "not_found", message: "Feed not found" },
      ok: false,
    });
    expect(mocks.logWarn).not.toHaveBeenCalled();
  });

  it("returns unknown_error and logs warning when projection returns unknown_error", async () => {
    mocks.projectFeedEvents.mockResolvedValue({
      error: {
        code: "unknown_error",
        message: "Failed to project feed events.",
      },
      ok: false,
    });

    const result = await renderFeedBody(renderBodyInput);

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe("unknown_error");
    expect(result.error.message).toBe("Failed to render feed");
    expect(mocks.logWarn).toHaveBeenCalledTimes(1);
    expect(mocks.logWarn).toHaveBeenCalledWith("Feed projection failed", {
      errorCode: "unknown_error",
      feedId: renderBodyInput.feedId,
    });
    expect(mocks.logWarn.mock.calls[0][0]).not.toContain("plaintext-token");
  });

  it.each([
    "invalid_scope",
    "not_authorised",
    "validation_error",
    "unknown_error",
  ] as const)(
    "maps %s to unknown_error and logs warning without token",
    async (code) => {
      mocks.projectFeedEvents.mockResolvedValue({
        error: { code, message: "boom" },
        ok: false,
      });

      const result = await renderFeedBody(renderBodyInput);

      expect(result.ok).toBe(false);
      if (result.ok) {
        return;
      }
      expect(result.error.code).toBe("unknown_error");
      expect(mocks.logWarn).toHaveBeenCalledWith("Feed projection failed", {
        errorCode: code,
        feedId: renderBodyInput.feedId,
      });
      const logged = mocks.logWarn.mock.calls
        .map((c) => String(c[0]))
        .join(" ");
      expect(logged).not.toContain("plaintext-token");
      expect(logged).not.toContain("super-secret-token");
    }
  );

  it("returns unknown_error when ical createEvent throws", async () => {
    icalMocks.createEvent.mockImplementationOnce(() => {
      throw new Error("createEvent boom");
    });

    const result = await renderFeedBody(renderBodyInput);

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe("unknown_error");
    expect(result.error.message).toBe("Failed to render feed");
    expect(mocks.logWarn).toHaveBeenCalledWith(
      "Feed ICS serialisation failed",
      {
        error: expect.any(Error),
        feedId: renderBodyInput.feedId,
      }
    );
    expect(mocks.logWarn.mock.calls[0][0]).not.toContain("plaintext-token");
  });

  it("returns unknown_error when calendar toString throws", async () => {
    icalMocks.toString.mockImplementationOnce(() => {
      throw new Error("toString boom");
    });

    const result = await renderFeedBody(renderBodyInput);

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe("unknown_error");
    expect(mocks.logWarn).toHaveBeenCalledWith(
      "Feed ICS serialisation failed",
      {
        error: expect.any(Error),
        feedId: renderBodyInput.feedId,
      }
    );
    const logged = mocks.logWarn.mock.calls.map((c) => String(c[0])).join(" ");
    expect(logged).not.toContain("plaintext-token");
  });
});

describe("renderFeedForToken", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.feedTokenFindUnique.mockResolvedValue(feedTokenFixture());
    mocks.feedTokenUpdate.mockResolvedValue({});
    mocks.feedUpdate.mockResolvedValue({});
    mocks.getCachedFeedBody.mockResolvedValue({ ok: true, value: null });
    mocks.projectFeedEvents.mockResolvedValue({
      ok: true,
      value: [
        {
          allDay: true,
          contactabilityStatus: "unavailable",
          description: null,
          displayName: "Jane Smith",
          endsAt: new Date("2026-05-08T00:00:00.000Z"),
          isPublicHoliday: false,
          location: "Brisbane",
          publishedSequence: 2,
          publishedUid: "stable@ical.teamcalendar.online",
          recordType: "annual_leave",
          sourceRecordId: "10000000-0000-4000-8000-000000000001",
          startsAt: new Date("2026-05-07T00:00:00.000Z"),
          summary: "Jane Smith: Annual Leave",
        },
      ],
    });
    mocks.setCachedFeedBody.mockResolvedValue({ ok: true, value: undefined });
  });

  it("serialises ICS with publication UID and SEQUENCE", async () => {
    const result = await renderFeedForToken("plaintext-token");

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.status).toBe("active");
    expect(result.value.body).toContain("UID:stable@ical.teamcalendar.online");
    expect(result.value.body).toContain("SEQUENCE:2");
    expect(result.value.body).toContain("SUMMARY:Jane Smith: Annual Leave");
    expect(result.value.body).not.toContain("DESCRIPTION");
    expect(result.value.body).not.toContain(
      "UID:10000000-0000-4000-8000-000000000001"
    );
  });

  it("returns revoked tokens without projecting events", async () => {
    mocks.feedTokenFindUnique.mockResolvedValue(
      feedTokenFixture({ status: "revoked" })
    );

    const result = await renderFeedForToken("revoked-token");

    expect(result).toMatchObject({
      ok: true,
      value: { body: "", etag: "", status: "revoked" },
    });
    expect(mocks.projectFeedEvents).not.toHaveBeenCalled();
  });

  it("marks active expired tokens as expired", async () => {
    mocks.feedTokenFindUnique.mockResolvedValue(
      feedTokenFixture({
        expires_at: new Date("2026-01-01T00:00:00.000Z"),
        status: "active",
      })
    );

    const result = await renderFeedForToken("expired-token");

    expect(result).toMatchObject({
      ok: true,
      value: { body: "", etag: "", status: "expired" },
    });
    expect(mocks.feedTokenUpdate).toHaveBeenCalledWith({
      data: { status: "expired" },
      where: { id: "30000000-0000-4000-8000-000000000001" },
    });
    expect(mocks.projectFeedEvents).not.toHaveBeenCalled();
  });

  it("returns the rendered feed when the cache write fails", async () => {
    mocks.setCachedFeedBody.mockRejectedValue(new Error("KV unavailable"));

    const result = await renderFeedForToken("plaintext-token");

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.status).toBe("active");
    expect(result.value.body).toContain("BEGIN:VCALENDAR");
    expect(result.value.body).toContain("SUMMARY:Jane Smith: Annual Leave");
    expect(mocks.feedTokenUpdate).toHaveBeenCalled();
    expect(mocks.feedUpdate).toHaveBeenCalled();
    expect(mocks.logWarn).toHaveBeenCalledWith("Feed cache write failed", {
      error: expect.any(Error),
      feedId: "20000000-0000-4000-8000-000000000001",
    });
  });

  it("skips writing last_used_at on a cache hit when last_used_at was 5 minutes ago", async () => {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    mocks.feedTokenFindUnique.mockResolvedValue(
      feedTokenFixture({ last_used_at: fiveMinutesAgo })
    );
    mocks.getCachedFeedBody.mockResolvedValue({
      ok: true,
      value: { body: "cached-ics", etag: "cached-etag" },
    });

    const result = await renderFeedForToken("plaintext-token");

    expect(result).toEqual({
      ok: true,
      value: { body: "cached-ics", etag: "cached-etag", status: "active" },
    });
    expect(mocks.feedTokenUpdate).not.toHaveBeenCalled();
  });

  it("preserves the durable first-use timestamp on later cache hits", async () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    mocks.feedTokenFindUnique.mockResolvedValue(
      feedTokenFixture({ last_used_at: twoHoursAgo })
    );
    mocks.getCachedFeedBody.mockResolvedValue({
      ok: true,
      value: { body: "cached-ics", etag: "cached-etag" },
    });

    const result = await renderFeedForToken("plaintext-token");

    expect(result.ok).toBe(true);
    expect(mocks.feedTokenUpdate).not.toHaveBeenCalled();
  });

  it("writes last_used_at on a cache hit when last_used_at is null", async () => {
    mocks.feedTokenFindUnique.mockResolvedValue(
      feedTokenFixture({ last_used_at: null })
    );
    mocks.getCachedFeedBody.mockResolvedValue({
      ok: true,
      value: { body: "cached-ics", etag: "cached-etag" },
    });

    const result = await renderFeedForToken("plaintext-token");

    expect(result.ok).toBe(true);
    expect(mocks.feedTokenUpdate).toHaveBeenCalledTimes(1);
  });

  it("returns ok when the telemetry write rejects on a cache hit and logs a warning", async () => {
    mocks.feedTokenFindUnique.mockResolvedValue(
      feedTokenFixture({ last_used_at: null })
    );
    mocks.getCachedFeedBody.mockResolvedValue({
      ok: true,
      value: { body: "cached-ics", etag: "cached-etag" },
    });
    mocks.feedTokenUpdate.mockRejectedValue(new Error("DB timeout"));

    const result = await renderFeedForToken("plaintext-token");

    expect(result).toEqual({
      ok: true,
      value: { body: "cached-ics", etag: "cached-etag", status: "active" },
    });
    await new Promise((r) => setTimeout(r, 10));
    expect(mocks.logWarn).toHaveBeenCalledWith("Feed token use write failed", {
      error: expect.any(Error),
      feedId: "20000000-0000-4000-8000-000000000001",
    });
  });

  it("returns not_found when projection returns feed_not_found", async () => {
    mocks.projectFeedEvents.mockResolvedValue({
      error: { code: "feed_not_found", message: "Feed not found." },
      ok: false,
    });

    const result = await renderFeedForToken("any-token");

    expect(result).toEqual({
      error: { code: "not_found", message: "Feed not found" },
      ok: false,
    });
    expect(mocks.logWarn).not.toHaveBeenCalled();
  });

  it.each([
    "unknown_error",
    "invalid_scope",
    "not_authorised",
    "validation_error",
  ] as const)(
    "maps %s from projection to unknown_error and logs without token",
    async (code) => {
      mocks.projectFeedEvents.mockResolvedValue({
        error: { code, message: "boom" },
        ok: false,
      });

      const result = await renderFeedForToken("super-secret-token-xyz");

      expect(result.ok).toBe(false);
      if (result.ok) {
        return;
      }
      expect(result.error.code).toBe("unknown_error");
      expect(mocks.logWarn).toHaveBeenCalledWith("Feed projection failed", {
        errorCode: code,
        feedId: renderBodyInput.feedId,
      });
      const logged = mocks.logWarn.mock.calls
        .map((c) => String(c[0]))
        .join(" ");
      expect(logged).not.toContain("super-secret-token-xyz");
    }
  );

  it("preserves unknown_error from renderFeedBody instead of rewriting to not_found", async () => {
    mocks.projectFeedEvents.mockResolvedValue({
      error: {
        code: "unknown_error",
        message: "Failed to project feed events.",
      },
      ok: false,
    });

    const result = await renderFeedForToken("super-secret-token-xyz");

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe("unknown_error");
    expect(result.error.code).not.toBe("not_found");
    expect(mocks.logWarn).toHaveBeenCalled();
    const logged = mocks.logWarn.mock.calls.map((c) => String(c[0])).join(" ");
    expect(logged).not.toContain("super-secret-token-xyz");
  });

  it("returns unknown_error when ical serialisation throws", async () => {
    icalMocks.toString.mockImplementationOnce(() => {
      throw new Error("ical toString boom");
    });

    const result = await renderFeedForToken("super-secret-token-xyz");

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe("unknown_error");
    expect(mocks.logWarn).toHaveBeenCalledWith(
      "Feed ICS serialisation failed",
      {
        error: expect.any(Error),
        feedId: renderBodyInput.feedId,
      }
    );
    const logged = mocks.logWarn.mock.calls.map((c) => String(c[0])).join(" ");
    expect(logged).not.toContain("super-secret-token-xyz");
  });
});

describe("cachedEtagForToken", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.feedTokenFindUnique.mockResolvedValue(feedTokenFixture());
    mocks.getCachedFeedBody.mockResolvedValue({ ok: true, value: null });
  });

  it("returns null for a missing token", async () => {
    mocks.feedTokenFindUnique.mockResolvedValue(null);
    expect(await cachedEtagForToken("unknown")).toBeNull();
  });

  it("returns null for a revoked token", async () => {
    mocks.feedTokenFindUnique.mockResolvedValue(
      feedTokenFixture({ status: "revoked" })
    );
    expect(await cachedEtagForToken("revoked")).toBeNull();
  });

  it("returns null for an expired token", async () => {
    mocks.feedTokenFindUnique.mockResolvedValue(
      feedTokenFixture({
        expires_at: new Date("2026-01-01T00:00:00.000Z"),
        status: "active",
      })
    );
    expect(await cachedEtagForToken("expired")).toBeNull();
  });

  it("returns null for an inactive feed", async () => {
    mocks.feedTokenFindUnique.mockResolvedValue(
      feedTokenFixture({
        feed: { id: "feed_1", privacy_mode: "named", status: "inactive" },
      })
    );
    expect(await cachedEtagForToken("token")).toBeNull();
  });

  it("returns null on a cache miss", async () => {
    mocks.getCachedFeedBody.mockResolvedValue({ ok: true, value: null });
    expect(await cachedEtagForToken("token")).toBeNull();
  });

  it("returns the cached ETag on a cache hit", async () => {
    mocks.getCachedFeedBody.mockResolvedValue({
      ok: true,
      value: { body: "cached-body", etag: "hash123" },
    });
    expect(await cachedEtagForToken("token")).toBe("hash123");
  });

  it("documents previous double lookup pattern when cachedEtagForToken and renderFeedForToken are called in succession", async () => {
    mocks.feedTokenFindUnique.mockResolvedValue(feedTokenFixture());
    mocks.getCachedFeedBody.mockResolvedValue({ ok: true, value: null });

    const cachedEtag = await cachedEtagForToken("plaintext-token");
    expect(cachedEtag).toBeNull();
    const result = await renderFeedForToken("plaintext-token");
    expect(result.ok).toBe(true);

    expect(mocks.feedTokenFindUnique).toHaveBeenCalledTimes(2);
    expect(mocks.getCachedFeedBody).toHaveBeenCalledTimes(2);
  });

  it("performs exactly one feed-token lookup and one KV read on a cache miss", async () => {
    mocks.feedTokenFindUnique.mockResolvedValue(feedTokenFixture());
    mocks.getCachedFeedBody.mockResolvedValue({ ok: true, value: null });

    const result = await renderFeedForToken("plaintext-token");

    expect(result.ok).toBe(true);
    expect(mocks.feedTokenFindUnique).toHaveBeenCalledTimes(1);
    expect(mocks.getCachedFeedBody).toHaveBeenCalledTimes(1);
  });

  it("performs exactly one feed-token lookup and one KV read on a cache hit", async () => {
    mocks.feedTokenFindUnique.mockResolvedValue(feedTokenFixture());
    mocks.getCachedFeedBody.mockResolvedValue({
      ok: true,
      value: { body: "cached-ics", etag: "cached-etag" },
    });

    const result = await renderFeedForToken("plaintext-token");

    expect(result.ok).toBe(true);
    expect(mocks.feedTokenFindUnique).toHaveBeenCalledTimes(1);
    expect(mocks.getCachedFeedBody).toHaveBeenCalledTimes(1);
    expect(mocks.projectFeedEvents).not.toHaveBeenCalled();
  });

  it("resolves a valid signed token by id and rejects a tampered signature", async () => {
    const fixture = feedTokenFixture();
    mocks.feedTokenFindUnique.mockResolvedValue(fixture);
    const token = createSignedFeedToken({
      tokenHash: fixture.token_hash,
      tokenId: fixture.id,
    });

    const valid = await renderFeedForToken(token);
    const tampered = await renderFeedForToken(`${token.slice(0, -1)}x`);

    expect(valid.ok).toBe(true);
    expect(tampered).toEqual({
      error: { code: "not_found", message: "Feed not found" },
      ok: false,
    });
    expect(mocks.feedTokenFindUnique).toHaveBeenNthCalledWith(1, {
      select: expect.objectContaining({ token_hash: true }),
      where: { id: fixture.id },
    });
  });

  it("queries feedToken using narrowed select instead of include feed true", async () => {
    mocks.feedTokenFindUnique.mockResolvedValue(feedTokenFixture());
    mocks.getCachedFeedBody.mockResolvedValue({ ok: true, value: null });

    await renderFeedForToken("plaintext-token");

    expect(mocks.feedTokenFindUnique).toHaveBeenCalledWith({
      select: {
        clerk_org_id: true,
        expires_at: true,
        feed: {
          select: {
            id: true,
            name: true,
            privacy_mode: true,
            status: true,
          },
        },
        feed_id: true,
        id: true,
        last_used_at: true,
        organisation_id: true,
        status: true,
        token_hash: true,
      },
      where: { token_hash: expect.any(String) },
    });
  });
});
