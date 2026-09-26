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

  it("does not retry a 5xx when retryOnAmbiguousFailure is false", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response("", { status: 500 }));
    const { sleep } = recordingSleep();

    const response = await xeroFetch(
      {
        orgKey: "org-a",
        retryOnAmbiguousFailure: false,
        url: "https://api.xero.com/x",
      },
      { fetchImpl, limiter: permissiveLimiter(), sleep }
    );

    expect(response.status).toBe(500);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("still retries a 429 when retryOnAmbiguousFailure is false", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 429 }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    const { sleep } = recordingSleep();

    const response = await xeroFetch(
      {
        orgKey: "org-a",
        retryOnAmbiguousFailure: false,
        url: "https://api.xero.com/x",
      },
      { fetchImpl, limiter: permissiveLimiter(), sleep }
    );

    expect(response.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("propagates a thrown network error after one attempt when retryOnAmbiguousFailure is false", async () => {
    const networkError = new Error("socket reset");
    const fetchImpl = vi.fn().mockRejectedValue(networkError);
    const { sleep } = recordingSleep();

    await expect(
      xeroFetch(
        {
          orgKey: "org-a",
          retryOnAmbiguousFailure: false,
          url: "https://api.xero.com/x",
        },
        { fetchImpl, limiter: permissiveLimiter(), sleep }
      )
    ).rejects.toBe(networkError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("still retries a 5xx up to the default budget when the flag is omitted", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response("", { status: 503 }));
    const { sleep } = recordingSleep();

    const response = await xeroFetch(
      { orgKey: "org-a", url: "https://api.xero.com/x" },
      { fetchImpl, limiter: permissiveLimiter(), sleep }
    );

    expect(response.status).toBe(503);
    expect(fetchImpl).toHaveBeenCalledTimes(4);
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

it("holds and releases permit through a stalled body deadline", async () => {
  const limiter = permissiveLimiter();
  const release = vi.fn();
  vi.spyOn(limiter, "acquire").mockResolvedValue({ ok: true, release });
  const cancel = vi.fn();
  const fetchImpl = vi.fn().mockResolvedValue(
    new Response(
      new ReadableStream({
        cancel,
        start() {
          /* Deliberately never produce body data. */
        },
      })
    )
  );
  await expect(
    xeroFetch(
      {
        deadline: { expiresAtMs: Date.now() + 30 },
        orgKey: "org",
        url: "https://api.xero.com/x",
      },
      { fetchImpl, limiter }
    )
  ).rejects.toMatchObject({ code: "deadline_exceeded", dispatched: true });
  expect(release).toHaveBeenCalledTimes(1);
  expect(cancel).toHaveBeenCalledTimes(1);
});
it("retains the last 429 when backoff exceeds remaining budget", async () => {
  const fetchImpl = vi
    .fn()
    .mockResolvedValue(
      new Response("{}", { headers: { "Retry-After": "5" }, status: 429 })
    );
  const response = await xeroFetch(
    {
      deadline: { expiresAtMs: Date.now() + 1000 },
      orgKey: "org",
      url: "https://api.xero.com/x",
    },
    { fetchImpl, limiter: permissiveLimiter() }
  );
  expect(response.status).toBe(429);
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});
it("bounds admission by remaining deadline", async () => {
  const limiter = permissiveLimiter();
  const acquire = vi.spyOn(limiter, "acquire");
  await xeroFetch(
    {
      deadline: { expiresAtMs: Date.now() + 1000 },
      orgKey: "org",
      url: "https://api.xero.com/x",
    },
    { fetchImpl: vi.fn().mockResolvedValue(new Response("{}")), limiter }
  );
  const wait = acquire.mock.calls[0]?.[1]?.maxWaitMs;
  expect(wait).toBeGreaterThan(0);
  expect(wait).toBeLessThanOrEqual(1000);
});
it("rejects oversized content with a safe error", async () => {
  const secret = "synthetic-private-response";
  await expect(
    xeroFetch(
      { maxBodyBytes: 3, orgKey: "org", url: "https://api.xero.com/x" },
      {
        fetchImpl: vi.fn().mockResolvedValue(new Response(secret)),
        limiter: permissiveLimiter(),
      }
    )
  ).rejects.toMatchObject({
    code: "body_too_large",
    dispatched: true,
    message: "Xero transport failed: body_too_large",
  });
});
it("rejects redirects without forwarding credentials", async () => {
  const fetchImpl = vi
    .fn()
    .mockResolvedValue(Response.redirect("https://other.example", 302));
  await expect(
    xeroFetch(
      { orgKey: "org", url: "https://api.xero.com/x" },
      { fetchImpl, limiter: permissiveLimiter() }
    )
  ).rejects.toMatchObject({ code: "redirect_rejected", dispatched: true });
  expect(fetchImpl).toHaveBeenCalledTimes(1);
  expect(fetchImpl.mock.calls[0]?.[1]?.redirect).toBe("manual");
});
it("rejects foreign origins before dispatch", async () => {
  const fetchImpl = vi.fn();
  await expect(
    xeroFetch({ orgKey: "org", url: "https://other.example/x" }, { fetchImpl })
  ).rejects.toMatchObject({ code: "origin_rejected", dispatched: false });
  expect(fetchImpl).not.toHaveBeenCalled();
});
it("rejects configured foreign API origin in production", async () => {
  const previous = process.env.NODE_ENV;
  const override = process.env.XERO_API_BASE_URL;
  process.env.NODE_ENV = "production";
  process.env.XERO_API_BASE_URL = "https://other.example";
  const fetchImpl = vi.fn();
  try {
    await expect(
      xeroFetch(
        { orgKey: "org", url: "https://other.example/x" },
        { fetchImpl }
      )
    ).rejects.toMatchObject({ code: "origin_rejected", dispatched: false });
  } finally {
    process.env.NODE_ENV = previous;
    if (override === undefined) {
      delete process.env.XERO_API_BASE_URL;
    } else {
      process.env.XERO_API_BASE_URL = override;
    }
  }
  expect(fetchImpl).not.toHaveBeenCalled();
});
it("buffers successful JSON before releasing permit", async () => {
  const limiter = permissiveLimiter();
  const release = vi.fn();
  vi.spyOn(limiter, "acquire").mockResolvedValue({ ok: true, release });
  const response = await xeroFetch(
    { orgKey: "org", url: "https://api.xero.com/x" },
    {
      fetchImpl: vi.fn().mockResolvedValue(new Response('{"ok":true}')),
      limiter,
    }
  );
  expect(release).toHaveBeenCalledTimes(1);
  expect(await response.json()).toEqual({ ok: true });
});
it("preserves bodyless 204", async () => {
  const response = await xeroFetch(
    { orgKey: "org", url: "https://api.xero.com/x" },
    {
      fetchImpl: vi.fn().mockResolvedValue(new Response(null, { status: 204 })),
      limiter: permissiveLimiter(),
    }
  );
  expect(response.status).toBe(204);
  expect(response.body).toBeNull();
});

it("rejects an expired operation without admission or dispatch", async () => {
  const limiter = permissiveLimiter();
  const acquire = vi.spyOn(limiter, "acquire");
  const fetchImpl = vi.fn();
  await expect(
    xeroFetch(
      {
        deadline: { expiresAtMs: Date.now() - 1 },
        orgKey: "org",
        url: "https://api.xero.com/x",
      },
      { fetchImpl, limiter }
    )
  ).rejects.toMatchObject({ code: "deadline_exceeded", dispatched: false });
  expect(acquire).not.toHaveBeenCalled();
  expect(fetchImpl).not.toHaveBeenCalled();
});
it("bounds an unresponsive fetch and releases its permit", async () => {
  const limiter = permissiveLimiter();
  const release = vi.fn();
  vi.spyOn(limiter, "acquire").mockResolvedValue({ ok: true, release });
  const fetchImpl = vi.fn().mockImplementation(
    () =>
      new Promise(() => {
        /* Never return headers. */
      })
  );
  await expect(
    xeroFetch(
      {
        deadline: { expiresAtMs: Date.now() + 30 },
        orgKey: "org",
        url: "https://api.xero.com/x",
      },
      { fetchImpl, limiter }
    )
  ).rejects.toMatchObject({ code: "deadline_exceeded", dispatched: true });
  expect(release).toHaveBeenCalledTimes(1);
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});
it("does not retry caller cancellation", async () => {
  const caller = new AbortController();
  const fetchImpl = vi.fn().mockImplementation(() => {
    caller.abort();
    return Promise.reject(caller.signal.reason);
  });
  await expect(
    xeroFetch(
      {
        init: { signal: caller.signal },
        orgKey: "org",
        url: "https://api.xero.com/x",
      },
      { fetchImpl, limiter: permissiveLimiter() }
    )
  ).rejects.toMatchObject({ name: "AbortError" });
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});
