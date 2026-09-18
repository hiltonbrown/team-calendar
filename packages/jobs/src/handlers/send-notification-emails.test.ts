import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createFunction: vi.fn(() => ({ id: "send-notification-emails" })),
  sendQueuedNotificationEmails: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("../client", () => ({
  inngest: { createFunction: mocks.createFunction },
}));
vi.mock("@repo/notifications", () => ({
  sendQueuedNotificationEmails: mocks.sendQueuedNotificationEmails,
}));

const { drainNotificationEmailQueue } = await import(
  "./send-notification-emails"
);

describe("drainNotificationEmailQueue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the drain summary when the queue succeeds", async () => {
    mocks.sendQueuedNotificationEmails.mockResolvedValue({
      ok: true,
      value: { failed: 0, processed: 2, sent: 2 },
    });

    await expect(drainNotificationEmailQueue()).resolves.toEqual({
      failed: 0,
      processed: 2,
      sent: 2,
    });
  });

  it("rejects the Inngest step with the sanitised service failure", async () => {
    mocks.sendQueuedNotificationEmails.mockResolvedValue({
      error: {
        code: "configuration_error",
        message: "Notification email transport is not configured.",
      },
      ok: false,
    });

    await expect(drainNotificationEmailQueue()).rejects.toThrow(
      "Notification email transport is not configured."
    );
  });
});
