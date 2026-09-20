import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  capture: vi.fn(),
  check: vi.fn(),
  flush: vi.fn(),
  remember: vi.fn(),
  send: vi.fn(),
}));
vi.mock("@/env", () => ({
  env: {
    EARLY_ACCESS_APPLICATION_HMAC_SECRET: "a".repeat(32),
    EARLY_ACCESS_APPLICATION_RECIPIENT: "private@example.com",
    NEXT_PUBLIC_WEB_URL: "https://www.example.com",
  },
}));
vi.mock("@/lib/rate-limit/early-access-rate-limit", () => ({
  checkEarlyAccessApplicationAbuse: mocks.check,
  rememberEarlyAccessApplication: mocks.remember,
}));
vi.mock("@repo/analytics/server", () => ({
  analytics: { capture: mocks.capture, flush: mocks.flush },
}));
vi.mock("@repo/email", () => ({ sendContactEmail: mocks.send }));
vi.mock("@repo/observability/log", () => ({ log: { error: vi.fn() } }));
const { POST, OPTIONS } = await import("./route");
const message = {
  email: "visitor@example.com",
  message: "I would like to learn more about Team Calendar.",
  name: "Test Visitor",
  sendConfirmation: false,
  type: "enquiry",
};
const request = (
  body: unknown = message,
  headers: Record<string, string> = {}
) =>
  new Request("https://api.example.com/api/contact", {
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
      "idempotency-key": "contact-1",
      origin: "https://www.example.com",
      ...headers,
    },
    method: "POST",
  });

describe("contact delivery", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.check.mockResolvedValue({
      allowed: true,
      occurredAt: "2026-09-20T00:00:00.000Z",
    });
    mocks.remember.mockResolvedValue(undefined);
    mocks.send.mockResolvedValue({ ok: true, value: { id: "email_1" } });
  });
  it.each(["enquiry", "support", "bug"])(
    "privately delivers a %s without an unsolicited confirmation",
    async (type) => {
      const response = await POST(request({ ...message, type }));
      expect(response.status).toBe(202);
      const result = await response.json();
      expect(result).toEqual({
        confirmation: "not-requested",
        reference: expect.any(String),
      });
      expect(JSON.stringify(result)).not.toContain("private@example.com");
      expect(mocks.send).toHaveBeenCalledTimes(1);
      expect(mocks.send).toHaveBeenCalledWith(
        expect.objectContaining({ to: "private@example.com" })
      );
    }
  );
  it("validates AU early access eligibility before delivery", async () => {
    const application = {
      ...message,
      calendarClient: "google",
      companySize: "8-30",
      country: "AU",
      heardFrom: "Xero",
      type: "early-access",
      usesXeroPayroll: "yes",
    };
    expect(
      (await POST(request({ ...application, country: "NZ" }))).status
    ).toBe(400);
    expect((await POST(request(application))).status).toBe(202);
    expect(mocks.capture).toHaveBeenCalledWith(
      expect.objectContaining({ event: "Application Accepted" })
    );
  });
  it("sends a separately deduplicated optional confirmation", async () => {
    const response = await POST(
      request({ ...message, sendConfirmation: true })
    );
    expect((await response.json()).confirmation).toBe("sent");
    expect(mocks.send).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        confirmation: true,
        idempotencyKey: "contact:contact-1:confirmation",
        to: message.email,
      })
    );
  });
  it.each(["returned", "thrown"])(
    "reports successful submission when confirmation fails (%s)",
    async (mode) => {
      mocks.send.mockResolvedValueOnce({ ok: true, value: { id: "email_1" } });
      if (mode === "thrown") {
        mocks.send.mockRejectedValueOnce(new Error("network"));
      } else {
        mocks.send.mockResolvedValueOnce({ error: "failed", ok: false });
      }
      const response = await POST(
        request({ ...message, sendConfirmation: true })
      );
      expect(response.status).toBe(202);
      expect((await response.json()).confirmation).toBe("failed");
    }
  );
  it("retries only the confirmation for an already delivered message", async () => {
    mocks.check.mockResolvedValue({
      allowed: true,
      duplicateReference: "TC-EXISTING",
      occurredAt: "2026-09-20T00:00:00.000Z",
    });
    const response = await POST(
      request({ ...message, sendConfirmation: true })
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      confirmation: "sent",
      reference: "TC-EXISTING",
    });
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(mocks.send).toHaveBeenCalledWith(
      expect.objectContaining({ confirmation: true })
    );
    expect(mocks.remember).not.toHaveBeenCalled();
  });
  it("preserves provider key and reference after receipt persistence fails", async () => {
    mocks.remember.mockRejectedValueOnce(new Error("KV"));
    expect((await POST(request())).status).toBe(503);
    expect((await POST(request())).status).toBe(202);
    expect(mocks.send.mock.calls[0]).toEqual(mocks.send.mock.calls[1]);
  });
  it("handles provider exceptions without sending a confirmation", async () => {
    mocks.send.mockRejectedValue(new Error("network"));
    expect(
      (await POST(request({ ...message, sendConfirmation: true }))).status
    ).toBe(503);
    expect(mocks.remember).not.toHaveBeenCalled();
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });
  it("rejects conflicting idempotency keys and rate limited submissions", async () => {
    mocks.check.mockResolvedValueOnce({ allowed: false, conflict: true });
    expect((await POST(request())).status).toBe(409);
    mocks.check.mockResolvedValueOnce({ allowed: false, retryAfter: 120 });
    const response = await POST(request());
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("120");
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("rejects untrusted origins, attachment-shaped fields and invalid bug URLs", async () => {
    expect(
      (await POST(request(message, { origin: "https://evil.example" }))).status
    ).toBe(403);
    expect(
      (await POST(request({ ...message, attachment: "file" }))).status
    ).toBe(400);
    expect(
      (
        await POST(
          request({ ...message, pageUrl: "javascript:alert(1)", type: "bug" })
        )
      ).status
    ).toBe(400);
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("permits the configured preflight origin only", () => {
    expect(
      OPTIONS(
        new Request("https://api.example.com/api/contact", {
          headers: { origin: "https://www.example.com" },
        })
      ).status
    ).toBe(204);
    expect(
      OPTIONS(new Request("https://api.example.com/api/contact")).status
    ).toBe(403);
  });
});
