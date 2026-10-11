import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  currentUser: vi.fn(),
  logError: vi.fn(),
  logWarn: vi.fn(),
  organisationFindFirst: vi.fn(),
  pollNotificationStream: vi.fn(),
  requireOrg: vi.fn(),
}));

vi.mock("@repo/auth/helpers", () => ({
  currentUser: mocks.currentUser,
  requireOrg: mocks.requireOrg,
}));
vi.mock("@repo/database", () => ({
  tenantDatabase: vi.fn(() => ({
    organisation: { findFirst: mocks.organisationFindFirst },
  })),
}));
vi.mock("@repo/notifications", () => ({
  pollNotificationStream: mocks.pollNotificationStream,
}));
vi.mock("@repo/observability/log", () => ({
  log: {
    error: mocks.logError,
    info: vi.fn(),
    warn: mocks.logWarn,
  },
}));

const { GET } = await import("./route");

const ORIGINAL_ENV = { ...process.env };
const WALL_CLOCK_FALLBACK_PATTERN = /^\d+-0$/;

describe("notifications stream route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    mocks.currentUser.mockResolvedValue({ id: "user_1" });
    mocks.requireOrg.mockResolvedValue("org_1");
    mocks.organisationFindFirst.mockResolvedValue({
      id: "00000000-0000-4000-8000-000000000001",
    });
    mocks.pollNotificationStream.mockResolvedValue([]);
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.useRealTimers();
  });

  it("rejects missing organisation ids", async () => {
    const response = await GET(
      new Request("http://api.test/api/notifications/stream")
    );

    expect(response.status).toBe(400);
  });

  it("rejects organisations outside the Clerk org", async () => {
    mocks.organisationFindFirst.mockResolvedValue(null);

    const response = await GET(
      new Request(
        "http://api.test/api/notifications/stream?organisationId=00000000-0000-4000-8000-000000000001"
      )
    );

    expect(response.status).toBe(403);
  });

  it("opens an event stream for scoped users", async () => {
    const response = await GET(
      new Request(
        "http://api.test/api/notifications/stream?organisationId=00000000-0000-4000-8000-000000000001"
      )
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/event-stream");
    await response.body?.cancel();
  });

  it("allows the configured app origin to read the event stream", async () => {
    const response = await GET(
      new Request(
        "http://api.test/api/notifications/stream?organisationId=00000000-0000-4000-8000-000000000001",
        { headers: { Origin: "http://localhost:3000" } }
      )
    );

    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      "http://localhost:3000"
    );
    expect(response.headers.get("Access-Control-Allow-Credentials")).toBe(
      "true"
    );
    expect(response.headers.get("Vary")).toBe("Origin");
    await response.body?.cancel();
  });

  it("does not allow unconfigured origins to read the event stream", async () => {
    const response = await GET(
      new Request(
        "http://api.test/api/notifications/stream?organisationId=00000000-0000-4000-8000-000000000001",
        { headers: { Origin: "https://evil.example" } }
      )
    );

    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
    await response.body?.cancel();
  });

  it("returns an event stream without CORS headers when no origin is sent", async () => {
    const response = await GET(
      new Request(
        "http://api.test/api/notifications/stream?organisationId=00000000-0000-4000-8000-000000000001"
      )
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect(response.headers.get("Access-Control-Allow-Credentials")).toBeNull();
    await response.body?.cancel();
  });

  it("stops polling and clears timers when the stream is cancelled", async () => {
    vi.useFakeTimers();

    const response = await GET(
      new Request(
        "http://api.test/api/notifications/stream?organisationId=00000000-0000-4000-8000-000000000001"
      )
    );
    const reader = response.body?.getReader();

    await reader?.cancel();

    await vi.advanceTimersByTimeAsync(25_001);
    expect(mocks.pollNotificationStream).toHaveBeenCalledTimes(1);
  });

  it("closes the stream and logs after three consecutive poll failures", async () => {
    vi.useFakeTimers();
    mocks.pollNotificationStream.mockRejectedValue(
      new Error("Redis connection failure")
    );

    const response = await GET(
      new Request(
        "http://api.test/api/notifications/stream?organisationId=00000000-0000-4000-8000-000000000001"
      )
    );
    const reader = response.body?.getReader();

    // Flush initial poll (failure 1)
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.pollNotificationStream).toHaveBeenCalledTimes(1);
    expect(mocks.logWarn).toHaveBeenCalledTimes(1);
    expect(mocks.logWarn).toHaveBeenCalledWith(
      "Notification stream poll failed",
      expect.objectContaining({
        clerkOrgId: "org_1",
        consecutiveFailures: 1,
        organisationId: "00000000-0000-4000-8000-000000000001",
        userId: "user_1",
      })
    );

    // Second poll (failure 2)
    await vi.advanceTimersByTimeAsync(2000);
    expect(mocks.pollNotificationStream).toHaveBeenCalledTimes(2);
    expect(mocks.logWarn).toHaveBeenCalledTimes(2);

    // Third poll (failure 3 -> terminal failure)
    await vi.advanceTimersByTimeAsync(2000);
    expect(mocks.pollNotificationStream).toHaveBeenCalledTimes(3);
    expect(mocks.logWarn).toHaveBeenCalledTimes(3);
    expect(mocks.logError).toHaveBeenCalledTimes(1);
    expect(mocks.logError).toHaveBeenCalledWith(
      "Notification stream closing after consecutive poll failures",
      expect.objectContaining({
        clerkOrgId: "org_1",
        consecutiveFailures: 3,
        organisationId: "00000000-0000-4000-8000-000000000001",
        userId: "user_1",
      })
    );

    // Advancing timers further does not schedule any more polls
    await vi.advanceTimersByTimeAsync(30_000);
    expect(mocks.pollNotificationStream).toHaveBeenCalledTimes(3);

    // The reader reports the stream error
    await expect(reader?.read()).rejects.toThrow("Redis connection failure");
  });

  it("resets consecutive failure counter on a successful poll", async () => {
    vi.useFakeTimers();
    mocks.pollNotificationStream
      .mockRejectedValueOnce(new Error("Transient failure 1"))
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error("Transient failure 2"))
      .mockRejectedValueOnce(new Error("Transient failure 3"))
      .mockResolvedValueOnce([]);

    const response = await GET(
      new Request(
        "http://api.test/api/notifications/stream?organisationId=00000000-0000-4000-8000-000000000001"
      )
    );

    // Initial poll fails (consecutive = 1)
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.pollNotificationStream).toHaveBeenCalledTimes(1);

    // Second poll succeeds (consecutive reset to 0)
    await vi.advanceTimersByTimeAsync(2000);
    expect(mocks.pollNotificationStream).toHaveBeenCalledTimes(2);

    // Third poll fails (consecutive = 1)
    await vi.advanceTimersByTimeAsync(2000);
    expect(mocks.pollNotificationStream).toHaveBeenCalledTimes(3);

    // Fourth poll fails (consecutive = 2)
    await vi.advanceTimersByTimeAsync(2000);
    expect(mocks.pollNotificationStream).toHaveBeenCalledTimes(4);

    // Fifth poll succeeds (consecutive reset to 0)
    await vi.advanceTimersByTimeAsync(2000);
    expect(mocks.pollNotificationStream).toHaveBeenCalledTimes(5);

    // No terminal error was triggered
    expect(mocks.logError).not.toHaveBeenCalled();
    await response.body?.cancel();
  });

  it("backs off poll interval to 10s after sustained idleness (1 minute without events)", async () => {
    vi.useFakeTimers();
    mocks.pollNotificationStream.mockResolvedValue([]);

    const response = await GET(
      new Request(
        "http://api.test/api/notifications/stream?organisationId=00000000-0000-4000-8000-000000000001"
      )
    );

    // Initial poll at t=0
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.pollNotificationStream).toHaveBeenCalledTimes(1);

    // Advance 30 polls * 2000ms = 60,000ms (1 minute)
    for (let i = 0; i < 30; i += 1) {
      await vi.advanceTimersByTimeAsync(2000);
    }
    // Total polls so far: 1 + 30 = 31 polls
    expect(mocks.pollNotificationStream).toHaveBeenCalledTimes(31);

    // At t=60,000ms, now - lastEventAt >= 60,000ms, so the NEXT poll delay is 10,000ms.
    // Advancing 2000ms should NOT trigger another poll.
    await vi.advanceTimersByTimeAsync(2000);
    expect(mocks.pollNotificationStream).toHaveBeenCalledTimes(31);

    // Advancing the remaining 8000ms (total 10,000ms from the 31st poll) triggers poll 32.
    await vi.advanceTimersByTimeAsync(8000);
    expect(mocks.pollNotificationStream).toHaveBeenCalledTimes(32);

    // Next poll is also scheduled at 10,000ms delay
    await vi.advanceTimersByTimeAsync(5000);
    expect(mocks.pollNotificationStream).toHaveBeenCalledTimes(32);
    await vi.advanceTimersByTimeAsync(5000);
    expect(mocks.pollNotificationStream).toHaveBeenCalledTimes(33);

    await response.body?.cancel();
  });

  it("restores 2s poll interval immediately when an event is received", async () => {
    vi.useFakeTimers();
    mocks.pollNotificationStream.mockResolvedValue([]);

    const response = await GET(
      new Request(
        "http://api.test/api/notifications/stream?organisationId=00000000-0000-4000-8000-000000000001"
      )
    );

    // Initial poll
    await vi.advanceTimersByTimeAsync(0);

    // Advance 60s into idle state
    for (let i = 0; i < 30; i += 1) {
      await vi.advanceTimersByTimeAsync(2000);
    }
    expect(mocks.pollNotificationStream).toHaveBeenCalledTimes(31);

    // Now in idle mode (10s delay). Mock an event for the next poll at +10s.
    mocks.pollNotificationStream.mockResolvedValueOnce([
      {
        event: {
          payload: {
            actionUrl: null,
            body: "Leave approved",
            category: "leave",
            createdAt: new Date().toISOString(),
            notificationId: "notif_1",
            title: "Leave Approved",
            type: "leave_request_approved",
            unreadCount: 1,
          },
          type: "notification.created",
        },
        id: "1724500000000-1",
      },
    ]);

    await vi.advanceTimersByTimeAsync(10_000);
    expect(mocks.pollNotificationStream).toHaveBeenCalledTimes(32);

    // Since an event was received, the subsequent poll must be scheduled at 2000ms, not 10,000ms
    mocks.pollNotificationStream.mockResolvedValue([]);
    await vi.advanceTimersByTimeAsync(2000);
    expect(mocks.pollNotificationStream).toHaveBeenCalledTimes(33);

    await response.body?.cancel();
  });

  it("honours valid Last-Event-ID header on reconnect", async () => {
    vi.useFakeTimers();

    const response = await GET(
      new Request(
        "http://api.test/api/notifications/stream?organisationId=00000000-0000-4000-8000-000000000001",
        { headers: { "Last-Event-ID": "1724500000000-5" } }
      )
    );

    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.pollNotificationStream).toHaveBeenCalledWith(
      {
        organisationId: "00000000-0000-4000-8000-000000000001",
        userId: "user_1",
      },
      "1724500000000-5"
    );

    await response.body?.cancel();
  });

  it("falls back to wall-clock timestamp when Last-Event-ID is invalid or missing", async () => {
    vi.useFakeTimers();

    const response = await GET(
      new Request(
        "http://api.test/api/notifications/stream?organisationId=00000000-0000-4000-8000-000000000001",
        { headers: { "Last-Event-ID": "invalid-injection; DROP TABLE;" } }
      )
    );

    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.pollNotificationStream).toHaveBeenCalledWith(
      {
        organisationId: "00000000-0000-4000-8000-000000000001",
        userId: "user_1",
      },
      expect.stringMatching(WALL_CLOCK_FALLBACK_PATTERN)
    );

    await response.body?.cancel();
  });

  it("emits chunks with id, event, and data lines and advances lastId", async () => {
    vi.useFakeTimers();
    const decoder = new TextDecoder();

    mocks.pollNotificationStream.mockResolvedValueOnce([
      {
        event: {
          payload: {
            actionUrl: "/requests",
            body: "New leave request submitted",
            category: "leave",
            createdAt: "2026-08-26T10:00:00.000Z",
            notificationId: "notif_99",
            title: "Leave Requested",
            type: "leave_request_submitted",
            unreadCount: 3,
          },
          type: "notification.created",
        },
        id: "1724500000000-2",
      },
    ]);

    const response = await GET(
      new Request(
        "http://api.test/api/notifications/stream?organisationId=00000000-0000-4000-8000-000000000001"
      )
    );
    const reader = response.body?.getReader();

    // Read connected comment
    const firstChunk = await reader?.read();
    expect(decoder.decode(firstChunk?.value)).toBe(": connected\n\n");

    // Flush initial poll
    await vi.advanceTimersByTimeAsync(0);

    const eventChunk = await reader?.read();
    const decodedEvent = decoder.decode(eventChunk?.value);
    expect(decodedEvent).toContain("id: 1724500000000-2\n");
    expect(decodedEvent).toContain("event: notification.created\n");
    expect(decodedEvent).toContain('"notificationId":"notif_99"');

    // Next poll should use the advanced lastId "1724500000000-2"
    mocks.pollNotificationStream.mockResolvedValueOnce([]);
    await vi.advanceTimersByTimeAsync(2000);
    expect(mocks.pollNotificationStream).toHaveBeenLastCalledWith(
      {
        organisationId: "00000000-0000-4000-8000-000000000001",
        userId: "user_1",
      },
      "1724500000000-2"
    );

    await reader?.cancel();
  });
});
