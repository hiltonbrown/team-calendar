import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("./keys", () => ({
  keys: () => ({ RESEND_FROM: "team@example.com", RESEND_TOKEN: "re_test" }),
}));
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: mocks.send };
  },
}));
const { sendContactEmail } = await import("./contact");
const input = {
  idempotencyKey: "contact-123",
  message: {
    email: "visitor@example.com",
    message: "Untrusted content https://unsafe.example",
    name: "Untrusted visitor",
    type: "enquiry" as const,
  },
  reference: "TC-123",
  to: "private@example.com",
};
describe("Resend contact transport", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.send.mockResolvedValue({ data: { id: "email_1" }, error: null });
  });
  it("delivers text with reply-to and provider idempotency", async () => {
    expect(await sendContactEmail(input)).toEqual({
      ok: true,
      value: { id: "email_1" },
    });
    expect(mocks.send).toHaveBeenCalledWith(
      expect.objectContaining({
        replyTo: input.message.email,
        text: expect.stringContaining(input.message.message),
        to: input.to,
      }),
      { idempotencyKey: input.idempotencyKey }
    );
  });
  it("never reflects user-supplied content or internal recipient into confirmations", async () => {
    await sendContactEmail({
      ...input,
      confirmation: true,
      to: input.message.email,
    });
    const body = mocks.send.mock.calls[0]?.[0];
    expect(body.replyTo).toBeUndefined();
    expect(body.text).toContain(input.reference);
    expect(JSON.stringify(body)).not.toContain(input.message.message);
    expect(JSON.stringify(body)).not.toContain(input.message.name);
    expect(JSON.stringify(body)).not.toContain(input.to);
  });
  it("converts provider errors and exceptions to failure results", async () => {
    mocks.send.mockResolvedValueOnce({
      data: null,
      error: { message: "rejected" },
    });
    expect((await sendContactEmail(input)).ok).toBe(false);
    mocks.send.mockRejectedValueOnce(new Error("network"));
    expect((await sendContactEmail(input)).ok).toBe(false);
  });
});
