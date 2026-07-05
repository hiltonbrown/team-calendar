import { describe, expect, it, vi } from "vitest";

vi.mock("@repo/feeds", () => ({
  renderFeedForToken: vi.fn(),
}));

const { renderFeedForToken } = await import("@repo/feeds");
const { GET } = await import("../app/ical/[token]/route");

const createRenderResult = (overrides = {}) => ({
  ok: true as const,
  value: {
    body: "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR",
    etag: "abc",
    status: "active" as const,
    ...overrides,
  },
});

describe("GET /ical/[token]", () => {
  it("strips .ics suffix from the token parameter and calls renderFeedForToken", async () => {
    vi.mocked(renderFeedForToken).mockResolvedValue(createRenderResult());

    const response = await GET(
      new Request("http://localhost/ical/tok123.ics"),
      {
        params: Promise.resolve({ token: "tok123.ics" }),
      }
    );

    expect(renderFeedForToken).toHaveBeenCalledWith("tok123");
    expect(response.status).toBe(200);
    expect(await response.text()).toBe(
      "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR"
    );
  });

  it("returns 404 when the feed render fails", async () => {
    vi.mocked(renderFeedForToken).mockResolvedValue({
      ok: false,
      error: { code: "not_found", message: "Feed not found" } as any,
    });

    const response = await GET(
      new Request("http://localhost/ical/tok123.ics"),
      {
        params: Promise.resolve({ token: "tok123.ics" }),
      }
    );

    expect(response.status).toBe(404);
    expect(await response.text()).toBe("Not found");
  });

  it("returns 410 when status is expired", async () => {
    vi.mocked(renderFeedForToken).mockResolvedValue(
      createRenderResult({ status: "expired" })
    );

    const response = await GET(
      new Request("http://localhost/ical/tok123.ics"),
      {
        params: Promise.resolve({ token: "tok123.ics" }),
      }
    );

    expect(response.status).toBe(410);
    expect(await response.text()).toBe("Gone");
  });

  it("returns 410 when status is revoked", async () => {
    vi.mocked(renderFeedForToken).mockResolvedValue(
      createRenderResult({ status: "revoked" })
    );

    const response = await GET(
      new Request("http://localhost/ical/tok123.ics"),
      {
        params: Promise.resolve({ token: "tok123.ics" }),
      }
    );

    expect(response.status).toBe(410);
    expect(await response.text()).toBe("Gone");
  });

  it("returns 200 with the active feed body, headers, and etag when successful", async () => {
    vi.mocked(renderFeedForToken).mockResolvedValue(createRenderResult());

    const response = await GET(
      new Request("http://localhost/ical/tok123.ics"),
      {
        params: Promise.resolve({ token: "tok123.ics" }),
      }
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe(
      "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR"
    );
    expect(response.headers.get("Content-Type")).toBe(
      "text/calendar;charset=utf-8"
    );
    expect(response.headers.get("Cache-Control")).toBe(
      "max-age=3600, must-revalidate"
    );
    expect(response.headers.get("ETag")).toBe('"abc"');
  });

  it("returns 304 when If-None-Match matches the etag", async () => {
    vi.mocked(renderFeedForToken).mockResolvedValue(createRenderResult());

    const response = await GET(
      new Request("http://localhost/ical/tok123.ics", {
        headers: { "If-None-Match": '"abc"' },
      }),
      {
        params: Promise.resolve({ token: "tok123.ics" }),
      }
    );

    expect(response.status).toBe(304);
    expect(await response.text()).toBe("");
    expect(response.headers.get("ETag")).toBe('"abc"');
    expect(response.headers.get("Cache-Control")).toBe(
      "max-age=3600, must-revalidate"
    );
  });

  it("returns 304 when If-None-Match has a weak validator prefix matching the etag", async () => {
    vi.mocked(renderFeedForToken).mockResolvedValue(createRenderResult());

    const response = await GET(
      new Request("http://localhost/ical/tok123.ics", {
        headers: { "If-None-Match": 'W/"abc"' },
      }),
      {
        params: Promise.resolve({ token: "tok123.ics" }),
      }
    );

    expect(response.status).toBe(304);
    expect(await response.text()).toBe("");
    expect(response.headers.get("ETag")).toBe('"abc"');
  });

  it("returns 304 when If-None-Match contains a matching etag in a list", async () => {
    vi.mocked(renderFeedForToken).mockResolvedValue(createRenderResult());

    const response = await GET(
      new Request("http://localhost/ical/tok123.ics", {
        headers: { "If-None-Match": '"xyz", "abc"' },
      }),
      {
        params: Promise.resolve({ token: "tok123.ics" }),
      }
    );

    expect(response.status).toBe(304);
    expect(await response.text()).toBe("");
  });

  it("returns 200 when If-None-Match does not match the etag", async () => {
    vi.mocked(renderFeedForToken).mockResolvedValue(createRenderResult());

    const response = await GET(
      new Request("http://localhost/ical/tok123.ics", {
        headers: { "If-None-Match": '"xyz"' },
      }),
      {
        params: Promise.resolve({ token: "tok123.ics" }),
      }
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe(
      "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR"
    );
  });
});
