import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface NotificationStreamEvent {
  payload: unknown;
  type: string;
}

type NotificationStreamCallback = (event: NotificationStreamEvent) => void;

const mocks = vi.hoisted(() => ({
  currentUser: vi.fn(),
  organisationFindFirst: vi.fn(),
  requireOrg: vi.fn(),
  subscribeToNotificationStream: vi.fn(),
}));

vi.mock("@repo/auth/helpers", () => ({
  currentUser: mocks.currentUser,
  requireOrg: mocks.requireOrg,
}));
vi.mock("@repo/database", () => ({
  database: {
    organisation: { findFirst: mocks.organisationFindFirst },
  },
}));
vi.mock("@repo/notifications", () => ({
  subscribeToNotificationStream: mocks.subscribeToNotificationStream,
}));

const { GET } = await import("./route");

const ORIGINAL_ENV = { ...process.env };

describe("notifications stream route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    mocks.currentUser.mockResolvedValue({ id: "user_1" });
    mocks.requireOrg.mockResolvedValue("org_1");
    mocks.organisationFindFirst.mockResolvedValue({
      id: "00000000-0000-4000-8000-000000000001",
    });
    mocks.subscribeToNotificationStream.mockReturnValue(() => undefined);
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

  it("does not throw when enqueue is attempted after the stream is cancelled", async () => {
    vi.useFakeTimers();
    let callback: NotificationStreamCallback | null = null;
    const unsubscribe = vi.fn();
    mocks.subscribeToNotificationStream.mockImplementation((_context, next) => {
      callback = next;
      return unsubscribe;
    });

    const response = await GET(
      new Request(
        "http://api.test/api/notifications/stream?organisationId=00000000-0000-4000-8000-000000000001"
      )
    );
    const reader = response.body?.getReader();

    await reader?.cancel();

    expect(() => {
      callback?.({ payload: { unreadCount: 1 }, type: "notification.updated" });
      vi.advanceTimersByTime(25_001);
    }).not.toThrow();
    expect(unsubscribe).toHaveBeenCalled();
  });
});
