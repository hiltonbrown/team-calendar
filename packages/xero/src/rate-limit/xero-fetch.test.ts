import { describe, expect, it, vi } from "vitest";
import { XeroRateLimiter } from "./limiter";
import { orgRateLimitKey, parseRetryAfter, xeroFetch } from "./xero-fetch";

function permissiveLimiter(): XeroRateLimiter {
  return new XeroRateLimiter({
    appCallsPerMinute: 1_000_000,
    callsPerDayPerOrg: 1_000_000,
    callsPerMinutePerOrg: 1_000_000,
    concurrentRequestsPerOrg: 1000,
    maxWaitMs: 0,
  });
}

function recordingSleep() {
  const calls: number[] = [];
  return {
    calls,
    sleep: (ms: number) => {
      calls.push(ms);
      return Promise.resolve();
    },
  };
}

describe("xeroFetch", () => {
  it("honours Retry-After on a 429 then succeeds", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response("", { headers: { "Retry-After": "2" }, status: 429 })
      )
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    const { calls, sleep } = recordingSleep();

    const response = await xeroFetch(
      { orgKey: "org-a", url: "https://api.xero.com/x" },
      { fetchImpl, limiter: permissiveLimiter(), sleep }
    );

    expect(response.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    // Retry-After "2" seconds is honoured rather than the backoff schedule.
    expect(calls).toEqual([2000]);
  });

  it("applies exponential backoff to a transient 5xx then succeeds", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 503 }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    const { calls, sleep } = recordingSleep();

    const response = await xeroFetch(
      { orgKey: "org-a", url: "https://api.xero.com/x" },
      { fetchImpl, limiter: permissiveLimiter(), sleep }
    );

    expect(response.status).toBe(200);
    expect(calls).toEqual([500]);
  });

  it("returns a synthetic 429 when the budget is exhausted", async () => {
    const fetchImpl = vi.fn();
    const exhausted = new XeroRateLimiter({ callsPerDayPerOrg: 0 });

    const response = await xeroFetch(
      { orgKey: "org-a", url: "https://api.xero.com/x" },
      { fetchImpl, limiter: exhausted }
    );

    expect(response.status).toBe(429);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("stops retrying after exhausting the attempt budget", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response("", { status: 429 }));
    const { calls, sleep } = recordingSleep();

    const response = await xeroFetch(
      { maxAttempts: 2, orgKey: "org-a", url: "https://api.xero.com/x" },
      { fetchImpl, limiter: permissiveLimiter(), sleep }
    );

    expect(response.status).toBe(429);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(calls).toHaveLength(1);
  });

  it("does not retry a non-transient 400", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response("", { status: 400 }));
    const { calls, sleep } = recordingSleep();

    const response = await xeroFetch(
      { orgKey: "org-a", url: "https://api.xero.com/x" },
      { fetchImpl, limiter: permissiveLimiter(), sleep }
    );

    expect(response.status).toBe(400);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(calls).toEqual([]);
  });
});

describe("orgRateLimitKey", () => {
  it("combines clerk org and organisation ids", () => {
    expect(
      orgRateLimitKey({ clerkOrgId: "org_1", organisationId: "payroll_1" })
    ).toBe("org_1:payroll_1");
  });

  it("falls back to the clerk org id when no organisation is set", () => {
    expect(orgRateLimitKey({ clerkOrgId: "org_1", organisationId: null })).toBe(
      "org_1"
    );
  });
});

describe("parseRetryAfter", () => {
  it("parses delta-seconds", () => {
    expect(parseRetryAfter("5")).toBe(5000);
  });

  it("parses an HTTP date relative to now", () => {
    const future = new Date(Date.now() + 4000).toUTCString();
    const parsed = parseRetryAfter(future);
    expect(parsed).not.toBeNull();
    expect(parsed ?? 0).toBeGreaterThan(0);
  });

  it("returns null for an absent or unparseable header", () => {
    expect(parseRetryAfter(null)).toBeNull();
    expect(parseRetryAfter("not-a-date")).toBeNull();
  });
});
