import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: "team@example.com" as string | undefined,
  send: vi.fn(),
}));
vi.mock("./keys", () => ({ keys: () => ({ RESEND_FROM: mocks.from }) }));
vi.mock("./client", () => ({ resend: { emails: { send: mocks.send } } }));

const { sendAuthEmail } = await import("./auth");

const input = {
  actionLabel: "Verify email",
  actionUrl:
    "https://app.example.com/api/auth/verify-email?token=one-time-token",
  body: "Verify your email to continue to Team Calendar.",
  subject: "Verify your Team Calendar email",
  to: "person@example.com",
};

describe("auth email delivery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.from = "team@example.com";
    mocks.send.mockResolvedValue({ data: { id: "message-1" }, error: null });
  });

  it("delivers the exact callback URL as text", async () => {
    await sendAuthEmail(input);
    expect(mocks.send).toHaveBeenCalledWith({
      from: "team@example.com",
      subject: input.subject,
      text: expect.stringContaining(input.actionUrl),
      to: input.to,
    });
  });

  it("fails closed when the sender is absent", async () => {
    mocks.from = undefined;
    await expect(sendAuthEmail(input)).rejects.toThrow("not configured");
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("does not silently accept a rejected send or expose its one-time link", async () => {
    mocks.send.mockResolvedValue({
      data: null,
      error: { message: `Rejected ${input.actionUrl}` },
    });
    await expect(sendAuthEmail(input)).rejects.toThrow(
      "Auth email delivery failed"
    );
  });

  it("does not silently accept an empty provider response", async () => {
    mocks.send.mockResolvedValue({ data: null, error: null });
    await expect(sendAuthEmail(input)).rejects.toThrow(
      "Auth email delivery failed"
    );
  });

  it("does not expose a callback URL from a provider exception", async () => {
    mocks.send.mockRejectedValue(new Error(input.actionUrl));
    await expect(sendAuthEmail(input)).rejects.toThrow(
      "Auth email delivery failed"
    );
  });
});
