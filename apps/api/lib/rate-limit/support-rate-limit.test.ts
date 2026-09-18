import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  checkSupportRateLimit,
  hashSupportRateLimitIdentifier,
  SUPPORT_RATE_LIMITS,
  setSupportRateLimiterClientForTests,
} from "./support-rate-limit";

const mocks = vi.hoisted(() => ({
  logWarn: vi.fn(),
}));

vi.mock("@repo/observability/log", () => ({
  log: {
    warn: mocks.logWarn,
  },
}));

describe("checkSupportRateLimit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setSupportRateLimiterClientForTests(null);
  });

  afterEach(() => {
    setSupportRateLimiterClientForTests(null);
  });

  it("allows attempts at both fixed-window boundaries with hashed keys", async () => {
    const evalCall = vi
      .fn()
      .mockResolvedValue([
        SUPPORT_RATE_LIMITS.USER.limit,
        120,
        SUPPORT_RATE_LIMITS.ORGANISATION.limit,
        600,
      ]);
    setSupportRateLimiterClientForTests({ eval: evalCall });

    const result = await checkSupportRateLimit({
      clerkOrgId: "org_clerk_123",
      userId: "user_123",
    });

    expect(result).toEqual({ allowed: true });
    expect(evalCall).toHaveBeenCalledWith(
      expect.any(String),
      [
        `ratelimit:support:user:${hashSupportRateLimitIdentifier("user_123")}`,
        `ratelimit:support:organisation:${hashSupportRateLimitIdentifier("org_clerk_123")}`,
      ],
      [
        SUPPORT_RATE_LIMITS.USER.windowSeconds,
        SUPPORT_RATE_LIMITS.ORGANISATION.windowSeconds,
      ]
    );

    const keys = evalCall.mock.calls[0]?.[1] as string[];
    expect(keys.join(":")).not.toContain("user_123");
    expect(keys.join(":")).not.toContain("org_clerk_123");
  });

  it("rejects the sixth user attempt for the remaining user window", async () => {
    setSupportRateLimiterClientForTests({
      eval: () => Promise.resolve([6, 75, 6, 1200]),
    });

    await expect(
      checkSupportRateLimit({
        clerkOrgId: "org_clerk_123",
        userId: "user_123",
      })
    ).resolves.toEqual({ allowed: false, retryAfter: 75 });
  });

  it("rejects the twenty-first organisation attempt for the remaining organisation window", async () => {
    setSupportRateLimiterClientForTests({
      eval: () => Promise.resolve([2, 100, 21, 900]),
    });

    await expect(
      checkSupportRateLimit({
        clerkOrgId: "org_clerk_123",
        userId: "user_123",
      })
    ).resolves.toEqual({ allowed: false, retryAfter: 900 });
  });

  it("uses the longer retry interval when both limits are exceeded", async () => {
    setSupportRateLimiterClientForTests({
      eval: () => Promise.resolve([7, 60, 22, 800]),
    });

    await expect(
      checkSupportRateLimit({
        clerkOrgId: "org_clerk_123",
        userId: "user_123",
      })
    ).resolves.toEqual({ allowed: false, retryAfter: 800 });
  });

  it("fails open with safe warning metadata when Redis is unavailable", async () => {
    setSupportRateLimiterClientForTests({
      eval: () => Promise.reject(new Error("org_clerk_123 user_123")),
    });

    await expect(
      checkSupportRateLimit({
        clerkOrgId: "org_clerk_123",
        userId: "user_123",
      })
    ).resolves.toEqual({ allowed: true });
    expect(mocks.logWarn).toHaveBeenCalledWith(
      "Support rate limit check failed, failing open",
      { errorType: "Error" }
    );
    expect(JSON.stringify(mocks.logWarn.mock.calls)).not.toContain(
      "org_clerk_123"
    );
    expect(JSON.stringify(mocks.logWarn.mock.calls)).not.toContain("user_123");
  });
});
