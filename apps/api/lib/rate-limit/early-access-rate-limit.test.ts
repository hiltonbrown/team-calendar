import { beforeEach, describe, expect, it, vi } from "vitest";

const hashedEmailKeyPattern = /early-access:email:[0-9a-f]{64}/;

const mocks = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock("@repo/core", () => ({ executeRedisRestCommand: mocks.execute }));
vi.mock("@repo/feeds/keys", () => ({
  keys: () => ({
    KV_REST_API_TOKEN: "token",
    KV_REST_API_URL: "https://kv.example.com",
  }),
}));
const { checkEarlyAccessApplicationAbuse } = await import(
  "./early-access-rate-limit"
);

describe("early access abuse controls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.execute.mockResolvedValue({ ok: true, value: [0, 0, ""] });
  });

  it("uses bounded HMAC keys without raw email or IP", async () => {
    await checkEarlyAccessApplicationAbuse({
      email: "owner@example.com",
      fingerprint: "f".repeat(64),
      hmacSecret: "a".repeat(32),
      idempotencyKey: "request-1",
      ip: "203.0.113.5",
      occurredAt: "2026-09-19T00:00:00.000Z",
    });
    const command = mocks.execute.mock.calls[0]?.[0].command.join(
      " "
    ) as string;
    expect(command).not.toContain("owner@example.com");
    expect(command).not.toContain("203.0.113.5");
    expect(command).toMatch(hashedEmailKeyPattern);
  });

  it("fails closed when Redis is unavailable", async () => {
    mocks.execute.mockResolvedValue({
      error: { code: "network_error" },
      ok: false,
    });
    await expect(
      checkEarlyAccessApplicationAbuse({
        email: "owner@example.com",
        fingerprint: "f".repeat(64),
        hmacSecret: "a".repeat(32),
        idempotencyKey: "request-1",
        ip: "203.0.113.5",
        occurredAt: "2026-09-19T00:00:00.000Z",
      })
    ).rejects.toThrow("unavailable");
  });

  it("fails closed on a malformed Redis tuple", async () => {
    mocks.execute.mockResolvedValue({ ok: true, value: [] });
    await expect(
      checkEarlyAccessApplicationAbuse({
        email: "owner@example.com",
        fingerprint: "f".repeat(64),
        hmacSecret: "a".repeat(32),
        idempotencyKey: "request-1",
        ip: "203.0.113.5",
        occurredAt: "2026-09-19T00:00:00.000Z",
      })
    ).rejects.toThrow("unavailable");
  });

  it("fails closed on an unknown Redis status", async () => {
    mocks.execute.mockResolvedValue({ ok: true, value: [3, 0, ""] });
    await expect(
      checkEarlyAccessApplicationAbuse({
        email: "owner@example.com",
        fingerprint: "f".repeat(64),
        hmacSecret: "a".repeat(32),
        idempotencyKey: "request-1",
        ip: "203.0.113.5",
        occurredAt: "2026-09-19T00:00:00.000Z",
      })
    ).rejects.toThrow("unavailable");
  });
});
