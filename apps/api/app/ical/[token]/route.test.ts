import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setFeedRateLimiterClientForTests } from "../../../lib/rate-limit/feed-rate-limit";

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

function requestFor(
  ifNoneMatch?: string,
  headers: Record<string, string> = {}
) {
  const reqHeaders = new Headers(headers);
  if (ifNoneMatch) {
    reqHeaders.set("If-None-Match", ifNoneMatch);
  }
  return new Request("https://api.example.com/ical/feed-token.ics", {
    headers: reqHeaders,
  });
}

function getFeed(
  token = "feed-token.ics",
  ifNoneMatch?: string,
  headers: Record<string, string> = {}
) {
  return GET(requestFor(ifNoneMatch, headers), {
    params: Promise.resolve({ token }),
  });
}

describe("GET /ical/:token.ics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setFeedRateLimiterClientForTests(null);
    mocks.renderFeedForToken.mockResolvedValue(activeFeedResult());
  });

  afterEach(() => {
    setFeedRateLimiterClientForTests(null);
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
      "private, no-cache, must-revalidate"
    );
    expect(mocks.renderFeedForToken).toHaveBeenCalledTimes(1);
    expect(mocks.renderFeedForToken).toHaveBeenCalledWith("feed-token");
  });

  it("returns 304 with an empty body when If-None-Match matches post-render ETag", async () => {
    const response = await getFeed("feed-token.ics", '"feed-hash"');

    expect(response.status).toBe(304);
    expect(await response.text()).toBe("");
    expect(response.headers.get("ETag")).toBe('"feed-hash"');
    expect(response.headers.get("Cache-Control")).toBe(
      "private, no-cache, must-revalidate"
    );
    expect(mocks.renderFeedForToken).toHaveBeenCalledTimes(1);
  });

  it("returns 304 when If-None-Match is a weak validator on post-render ETag", async () => {
    const response = await getFeed("feed-token.ics", 'W/"feed-hash"');

    expect(response.status).toBe(304);
    expect(await response.text()).toBe("");
    expect(response.headers.get("ETag")).toBe('"feed-hash"');
    expect(mocks.renderFeedForToken).toHaveBeenCalledTimes(1);
  });

  it("returns 304 when If-None-Match is a list containing the post-render feed ETag", async () => {
    const response = await getFeed("feed-token.ics", '"other", "feed-hash"');

    expect(response.status).toBe(304);
    expect(await response.text()).toBe("");
    expect(response.headers.get("ETag")).toBe('"feed-hash"');
    expect(mocks.renderFeedForToken).toHaveBeenCalledTimes(1);
  });

  it("returns the full body when If-None-Match does not match", async () => {
    const response = await getFeed("feed-token.ics", '"other"');

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n");
    expect(response.headers.get("ETag")).toBe('"feed-hash"');
    expect(mocks.renderFeedForToken).toHaveBeenCalledTimes(1);
  });

  it("returns 404 when the token cannot render a feed", async () => {
    mocks.renderFeedForToken.mockResolvedValue({
      error: { code: "not_found", message: "Feed not found" },
      ok: false,
    });

    const response = await getFeed();

    expect(response.status).toBe(404);
    expect(await response.text()).toBe("Not found");
    expect(mocks.renderFeedForToken).toHaveBeenCalledTimes(1);
  });

  it("returns 503 with Retry-After when render returns unknown_error", async () => {
    mocks.renderFeedForToken.mockResolvedValue({
      error: { code: "unknown_error", message: "Failed to render feed" },
      ok: false,
    });

    const response = await getFeed();
    const body = await response.text();

    expect(response.status).toBe(503);
    expect(body).toBe("Temporarily unavailable");
    expect(response.headers.get("Retry-After")).toBe("60");
    expect(body).not.toContain("Failed to render feed");
    expect(body).not.toContain("unknown_error");
    expect(mocks.renderFeedForToken).toHaveBeenCalledTimes(1);
  });

  it.each(["expired", "revoked"] as const)(
    "returns 410 when the token is %s",
    async (status) => {
      mocks.renderFeedForToken.mockResolvedValue({
        ok: true,
        value: { body: "", etag: "", status },
      });

      const response = await getFeed("feed-token.ics", '""');

      expect(response.status).toBe(410);
      expect(await response.text()).toBe("Gone");
      expect(mocks.renderFeedForToken).toHaveBeenCalledTimes(1);
    }
  );

  it("strips the .ics suffix before rendering the token", async () => {
    await getFeed("calendar-token.ics");

    expect(mocks.renderFeedForToken).toHaveBeenCalledTimes(1);
    expect(mocks.renderFeedForToken).toHaveBeenCalledWith("calendar-token");
  });

  it("calls renderFeedForToken exactly once on conditional requests", async () => {
    mocks.renderFeedForToken.mockResolvedValue(
      activeFeedResult({ etag: "new-etag" })
    );
    const response = await getFeed("feed-token.ics", '"old-etag"');

    expect(response.status).toBe(200);
    expect(mocks.renderFeedForToken).toHaveBeenCalledTimes(1);
    expect(mocks.renderFeedForToken).toHaveBeenCalledWith("feed-token");
  });

  it("returns 429 with Retry-After when client IP rate limit is exceeded without calling renderFeedForToken", async () => {
    setFeedRateLimiterClientForTests({
      eval: (_script, keys) => {
        const [key] = keys;
        if (key.startsWith("ratelimit:feed:ip:")) {
          return Promise.resolve([61, 35]);
        }
        return Promise.resolve([1, 60]);
      },
    });

    const response = await getFeed("feed-token.ics", undefined, {
      "x-forwarded-for": "203.0.113.50",
    });

    expect(response.status).toBe(429);
    expect(await response.text()).toBe("Too Many Requests");
    expect(response.headers.get("Retry-After")).toBe("35");
    expect(mocks.renderFeedForToken).not.toHaveBeenCalled();
  });

  it("returns 429 with Retry-After when token probe rate limit is exceeded without calling renderFeedForToken", async () => {
    setFeedRateLimiterClientForTests({
      eval: (_script, keys) => {
        const [key] = keys;
        if (key.startsWith("ratelimit:feed:token:")) {
          return Promise.resolve([121, 45]);
        }
        return Promise.resolve([1, 60]);
      },
    });

    const response = await getFeed("probed-token.ics");

    expect(response.status).toBe(429);
    expect(await response.text()).toBe("Too Many Requests");
    expect(response.headers.get("Retry-After")).toBe("45");
    expect(mocks.renderFeedForToken).not.toHaveBeenCalled();
  });

  it("fails open and renders feed normally when Redis rate limiter throws", async () => {
    setFeedRateLimiterClientForTests({
      eval: () => Promise.reject(new Error("Redis cluster unreachable")),
    });

    const response = await getFeed("feed-token.ics");

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n");
    expect(mocks.renderFeedForToken).toHaveBeenCalledTimes(1);
    expect(mocks.renderFeedForToken).toHaveBeenCalledWith("feed-token");
  });
});
