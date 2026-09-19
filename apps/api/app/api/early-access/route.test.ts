import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  capture: vi.fn(),
  checkAbuse: vi.fn(),
  flush: vi.fn(),
  remember: vi.fn(),
  send: vi.fn(),
  shutdown: vi.fn(),
}));
vi.mock("@/env", () => ({
  env: {
    EARLY_ACCESS_APPLICATION_HMAC_SECRET: "a".repeat(32),
    EARLY_ACCESS_APPLICATION_RECIPIENT: "admissions@example.com",
    NEXT_PUBLIC_WEB_URL: "https://www.example.com",
  },
}));
vi.mock("@/lib/rate-limit/early-access-rate-limit", () => ({
  checkEarlyAccessApplicationAbuse: mocks.checkAbuse,
  rememberEarlyAccessApplication: mocks.remember,
}));
vi.mock("@repo/email", () => ({ sendEarlyAccessApplication: mocks.send }));
vi.mock("@repo/analytics/server", () => ({
  analytics: {
    capture: mocks.capture,
    flush: mocks.flush,
    shutdown: mocks.shutdown,
  },
}));
vi.mock("@repo/observability/log", () => ({ log: { error: vi.fn() } }));

const { POST } = await import("./route");
const earlyAccessReferencePattern = /^EA-/;
const valid = {
  calendarClient: "google",
  companySize: "8-30",
  country: "AU",
  currentProcess: "We track leave in a shared spreadsheet.",
  email: "owner@example.com",
  heardFrom: "Xero community",
  usesXeroPayroll: "yes",
};
const request = (
  body: unknown = valid,
  overrides: Record<string, string> = {}
) =>
  new Request("https://api.example.com/api/early-access", {
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
      "idempotency-key": "application-1",
      origin: "https://www.example.com",
      "x-forwarded-for": "203.0.113.1",
      ...overrides,
    },
    method: "POST",
  });

describe("early access application route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.checkAbuse.mockResolvedValue({
      allowed: true,
      occurredAt: "2026-09-19T00:00:00.000Z",
    });
    mocks.send.mockResolvedValue({ ok: true, value: { id: "email_1" } });
    mocks.remember.mockResolvedValue(undefined);
    mocks.flush.mockResolvedValue(undefined);
    mocks.shutdown.mockResolvedValue(undefined);
  });

  it("accepts and privately delivers a valid AU application", async () => {
    const response = await POST(request());
    expect(response.status).toBe(202);
    expect(mocks.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: "admissions@example.com" })
    );
    expect(mocks.capture).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "Application Accepted",
        uuid: expect.any(String),
      })
    );
    expect(await response.json()).toEqual({
      reference: expect.stringMatching(earlyAccessReferencePattern),
    });
  });

  it("rejects invalid fields and attachment-shaped input", async () => {
    const response = await POST(
      request({ ...valid, attachment: "payroll.csv" })
    );
    expect(response.status).toBe(400);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("returns the stored reference for an idempotent retry", async () => {
    mocks.checkAbuse.mockResolvedValue({
      allowed: true,
      duplicateReference: "EA-EXISTING",
      occurredAt: "2026-09-19T00:00:00.000Z",
    });
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ reference: "EA-EXISTING" });
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("rate limits before delivery", async () => {
    mocks.checkAbuse.mockResolvedValue({ allowed: false, retryAfter: 120 });
    const response = await POST(request());
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("120");
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("rejects a wrong origin", async () => {
    const response = await POST(
      request(valid, { origin: "https://evil.example" })
    );
    expect(response.status).toBe(403);
    expect(mocks.checkAbuse).not.toHaveBeenCalled();
  });

  it("returns a retryable response without analytics when delivery fails", async () => {
    mocks.send.mockResolvedValue({ error: "provider failed", ok: false });
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(mocks.remember).not.toHaveBeenCalled();
    expect(mocks.capture).not.toHaveBeenCalled();
  });

  it("retries an accepted delivery with the same provider key and reference when receipt storage fails", async () => {
    mocks.remember.mockRejectedValueOnce(new Error("KV unavailable"));
    const first = await POST(request());
    const retry = await POST(request());

    expect(first.status).toBe(503);
    expect(retry.status).toBe(202);
    expect(mocks.send).toHaveBeenCalledTimes(2);
    expect(mocks.send.mock.calls[0]?.[0].idempotencyKey).toBe(
      mocks.send.mock.calls[1]?.[0].idempotencyKey
    );
    expect(mocks.send.mock.calls[0]?.[0].application.reference).toBe(
      mocks.send.mock.calls[1]?.[0].application.reference
    );
  });

  it("rejects reuse of an idempotency key with altered application data", async () => {
    mocks.checkAbuse.mockResolvedValue({ allowed: false, conflict: true });
    const response = await POST(request({ ...valid, companySize: "31-75" }));
    expect(response.status).toBe(409);
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
