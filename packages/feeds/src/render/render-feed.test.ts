import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  feedTokenFindUnique: vi.fn(),
  feedTokenUpdate: vi.fn(() => Promise.resolve({})),
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
          description: "Internal note",
          displayName: "Jane Smith",
          endsAt: new Date("2026-05-08T00:00:00.000Z"),
          isPublicHoliday: false,
          location: "Brisbane",
          publishedSequence: 2,
          publishedUid: "stable@ical.leavesync.app",
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
      findUnique: mocks.feedTokenFindUnique,
      update: mocks.feedTokenUpdate,
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

const { renderFeedForToken } = await import("./render-feed");

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
    organisation_id: "40000000-0000-4000-8000-000000000001",
    status: "active",
    ...overrides,
  };
}

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
          description: "Internal note",
          displayName: "Jane Smith",
          endsAt: new Date("2026-05-08T00:00:00.000Z"),
          isPublicHoliday: false,
          location: "Brisbane",
          publishedSequence: 2,
          publishedUid: "stable@ical.leavesync.app",
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
    expect(result.value.body).toContain("UID:stable@ical.leavesync.app");
    expect(result.value.body).toContain("SEQUENCE:2");
    expect(result.value.body).toContain("SUMMARY:Jane Smith: Annual Leave");
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
    expect(mocks.logWarn).toHaveBeenCalledWith(
      "Feed cache write failed for feed 20000000-0000-4000-8000-000000000001: Error: KV unavailable"
    );
  });
});
