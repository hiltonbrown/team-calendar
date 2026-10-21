import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NotificationSseEvent } from "./broker";
import { setNotificationSseStreamClientForTests } from "./redis-stream";

const ORIGINAL_ENV = { ...process.env };

const sampleEvent: NotificationSseEvent = {
  payload: {
    actionUrl: null,
    body: "Leave was approved",
    category: "leave_lifecycle",
    createdAt: "2026-08-28T00:00:00.000Z",
    notificationId: "notif-123",
    organisationId: "company-A",
    organisationName: "Company A",
    title: "Approved",
    type: "leave_approved",
    unreadCount: 1,
  },
  type: "notification.created",
};

describe("redis-stream client", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
    setNotificationSseStreamClientForTests(null);
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    setNotificationSseStreamClientForTests(null);
  });

  it("returns null when no KV env variables are configured", async () => {
    const { getNotificationSseStreamClient: getClient } = await import(
      "./redis-stream"
    );
    const client = getClient();
    expect(client).toBeNull();
  });

  it("throws when only URL is set", async () => {
    process.env.KV_REST_API_URL = "https://example.kv.vercel-storage.com";

    const { getNotificationSseStreamClient: getClient } = await import(
      "./redis-stream"
    );
    expect(() => getClient()).toThrowError(
      "KV_REST_API_URL and KV_REST_API_TOKEN must both be set or both omitted"
    );
  });

  it("appends events and reads stream entries using Redis REST transport", async () => {
    process.env.KV_REST_API_URL = "https://example.kv.vercel-storage.com";
    process.env.KV_REST_API_TOKEN = "valid-token";

    const fetchMock = vi.fn();
    // Mock xadd and expire responses
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ result: "1000-1" }), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      })
    );
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ result: 1 }), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      })
    );

    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchMock;

    try {
      const { getNotificationSseStreamClient: getClient } = await import(
        "./redis-stream"
      );
      const client = getClient();
      expect(client).not.toBeNull();

      if (client) {
        await client.append("sse:user-1:org-1", sampleEvent);

        expect(fetchMock).toHaveBeenCalledTimes(2);
        // First call: xadd
        expect(fetchMock).toHaveBeenNthCalledWith(
          1,
          "https://example.kv.vercel-storage.com",
          expect.objectContaining({
            body: JSON.stringify([
              "xadd",
              "sse:user-1:org-1",
              "maxlen",
              "~",
              "100",
              "*",
              "event",
              JSON.stringify(sampleEvent),
            ]),
          })
        );
        // Second call: expire
        expect(fetchMock).toHaveBeenNthCalledWith(
          2,
          "https://example.kv.vercel-storage.com",
          expect.objectContaining({
            body: JSON.stringify(["expire", "sse:user-1:org-1", "300"]),
          })
        );

        // Test readSince
        fetchMock.mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              result: [
                ["1000-1", ["event", JSON.stringify(sampleEvent)]],
                ["1000-2", ["corrupted", "data"]],
                ["1000-3", ["event", "invalid-json"]],
                "invalid-row",
              ],
            }),
            {
              headers: { "Content-Type": "application/json" },
              status: 200,
            }
          )
        );

        const entries = await client.readSince("sse:user-1:org-1", "0-0");
        expect(entries).toEqual([{ event: sampleEvent, id: "1000-1" }]);
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("propagates failure when Redis REST command returns error", async () => {
    process.env.KV_REST_API_URL = "https://example.kv.vercel-storage.com";
    process.env.KV_REST_API_TOKEN = "valid-token";

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "ERR command not allowed" }), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      })
    );

    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchMock;

    try {
      const { getNotificationSseStreamClient: getClient } = await import(
        "./redis-stream"
      );
      const client = getClient();
      expect(client).not.toBeNull();

      if (client) {
        await expect(
          client.append("sse:user-1:org-1", sampleEvent)
        ).rejects.toThrow("Notification SSE stream command failed");
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
