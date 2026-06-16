import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  renderFeedForToken: vi.fn(),
}));

vi.mock("@repo/feeds", () => ({
  renderFeedForToken: mocks.renderFeedForToken,
}));

const { GET } = await import("./route");

function activeFeedResult(overrides: { body?: string; etag?: string } = {}) {
  return {
    ok: true,
    value: {
      body: overrides.body ?? "BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n",
      etag: overrides.etag ?? "feed-hash",
      status: "active",
    },
  };
}

function requestFor(ifNoneMatch?: string) {
  return new Request("https://api.example.com/ical/feed-token.ics", {
    headers: ifNoneMatch ? { "If-None-Match": ifNoneMatch } : undefined,
  });
}

function getFeed(token = "feed-token.ics", ifNoneMatch?: string) {
  return GET(requestFor(ifNoneMatch), {
    params: Promise.resolve({ token }),
  });
}

describe("GET /ical/:token.ics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.renderFeedForToken.mockResolvedValue(activeFeedResult());
  });

  it("returns an active feed with ETag and calendar content type", async () => {
    const response = await getFeed();

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n");
    expect(response.headers.get("ETag")).toBe('"feed-hash"');
    expect(response.headers.get("Content-Type")).toBe(
      "text/calendar;charset=utf-8"
    );
    expect(response.headers.get("Cache-Control")).toBe(
      "max-age=3600, must-revalidate"
    );
  });

  it("returns 304 with an empty body when If-None-Match matches", async () => {
    const response = await getFeed("feed-token.ics", '"feed-hash"');

    expect(response.status).toBe(304);
    expect(await response.text()).toBe("");
    expect(response.headers.get("ETag")).toBe('"feed-hash"');
    expect(response.headers.get("Cache-Control")).toBe(
      "max-age=3600, must-revalidate"
    );
  });

  it("returns 304 when If-None-Match is a weak validator", async () => {
    const response = await getFeed("feed-token.ics", 'W/"feed-hash"');

    expect(response.status).toBe(304);
    expect(await response.text()).toBe("");
  });

  it("returns 304 when If-None-Match is a list containing the feed ETag", async () => {
    const response = await getFeed("feed-token.ics", '"other", "feed-hash"');

    expect(response.status).toBe(304);
    expect(await response.text()).toBe("");
  });

  it("returns the full body when If-None-Match does not match", async () => {
    const response = await getFeed("feed-token.ics", '"other"');

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n");
    expect(response.headers.get("ETag")).toBe('"feed-hash"');
  });

  it("returns 404 when the token cannot render a feed", async () => {
    mocks.renderFeedForToken.mockResolvedValue({
      ok: false,
      error: { code: "not_found", message: "Feed not found" },
    });

    const response = await getFeed();

    expect(response.status).toBe(404);
    expect(await response.text()).toBe("Not found");
  });

  it.each([
    "expired",
    "revoked",
  ] as const)("returns 410 when the token is %s", async (status) => {
    mocks.renderFeedForToken.mockResolvedValue({
      ok: true,
      value: { body: "", etag: "", status },
    });

    const response = await getFeed("feed-token.ics", '""');

    expect(response.status).toBe(410);
    expect(await response.text()).toBe("Gone");
  });

  it("strips the .ics suffix before rendering the token", async () => {
    await getFeed("calendar-token.ics");

    expect(mocks.renderFeedForToken).toHaveBeenCalledWith("calendar-token");
  });
});
