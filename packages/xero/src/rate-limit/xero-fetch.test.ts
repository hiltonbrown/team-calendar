import { beforeEach, describe, expect, it, vi } from "vitest";

const metricLog = vi.hoisted(() => vi.fn());
vi.mock("@repo/observability/log", () => ({
  log: { error: vi.fn(), info: metricLog, warn: vi.fn() },
}));
beforeEach(() => {
  metricLog.mockReset();
});

import { mapXeroTransportError } from "../adapter/classify-xero-failure";
import { XeroRateLimiter } from "./limiter";
import { MemorySharedXeroRateStore } from "./memory-store";
import { xeroRateKeys } from "./shared-store";
import { parseRetryAfter, xeroFetch } from "./xero-fetch";

let testTime = Date.now();
const rateClass = {
  kind: "tenant" as const,
  providerAppId: "test-app",
  xeroTenantId: "org-a",
};
function permissiveLimiter(): XeroRateLimiter {
  return new XeroRateLimiter(
    {
      appCallsPerMinute: 1_000_000,
      callsPerDayPerOrg: 1_000_000,
      callsPerMinutePerOrg: 1_000_000,
      concurrentRequestsPerOrg: 1000,
      maxWaitMs: 0,
    },
    {
      now: () => testTime,
      store: new MemorySharedXeroRateStore({
        limits: {
          appCallsPerMinute: 1_000_000,
          callsPerDayPerOrg: 1_000_000,
          callsPerMinutePerOrg: 1_000_000,
          concurrentRequestsPerOrg: 1000,
        },
        now: () => testTime,
      }),
    }
  );
}
function recordingSleep() {
  const calls: number[] = [];
  return {
    calls,
    sleep: (ms: number) => {
      calls.push(ms);
      testTime += ms;
      return Promise.resolve();
    },
  };
}
describe("xeroFetch", () => {
  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects an invalid attempt count %s before provider dispatch",
    async (maxAttempts) => {
      const fetchImpl = vi.fn(async () => new Response(null, { status: 503 }));
      await expect(
        xeroFetch(
          {
            deadline: { expiresAtMs: Date.now() + 20 },
            maxAttempts,
            rateClass,
            url: "https://api.xero.com/x",
          },
          {
            fetchImpl,
            limiter: permissiveLimiter(),
            sleep: () => Promise.resolve(),
          }
        )
      ).rejects.toMatchObject({
        code: "attempts_exhausted",
        dispatched: false,
      });
      expect(fetchImpl).not.toHaveBeenCalled();
    }
  );
  it("bounds read retries to four provider requests", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 503 }));
    const response = await xeroFetch(
      { maxAttempts: 5, rateClass, url: "https://api.xero.com/x" },
      {
        fetchImpl,
        limiter: permissiveLimiter(),
        sleep: () => Promise.resolve(),
      }
    );
    expect(response.status).toBe(503);
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });
  it("honours Retry-After on a 429 then succeeds", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response("", { headers: { "Retry-After": "2" }, status: 429 })
      )
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    const { calls, sleep } = recordingSleep();
    const response = await xeroFetch(
      { rateClass, url: "https://api.xero.com/x" },
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
      { rateClass, url: "https://api.xero.com/x" },
      { fetchImpl, limiter: permissiveLimiter(), sleep }
    );
    expect(response.status).toBe(200);
    expect(calls).toEqual([500]);
  });
  it("reports local exhaustion without inventing a provider response", async () => {
    const fetchImpl = vi.fn();
    const exhausted = new XeroRateLimiter({ callsPerDayPerOrg: 0 });
    const result = await xeroFetch(
      { rateClass, url: "https://api.xero.com/x" },
      { fetchImpl, limiter: exhausted }
    ).catch((error: unknown) => mapXeroTransportError(error, true));
    expect(result).toMatchObject({
      code: "rate_limit_error",
      dispatchPhase: "before_dispatch",
      recoveryReason: "retry_later",
    });
    expect(result).not.toHaveProperty("httpStatus", 429);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it("stops retrying after exhausting the attempt budget", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response("", { status: 429 }));
    const { calls, sleep } = recordingSleep();
    const response = await xeroFetch(
      { maxAttempts: 2, rateClass, url: "https://api.xero.com/x" },
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
      { rateClass, url: "https://api.xero.com/x" },
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
        rateClass,
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
        rateClass,
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
          rateClass,
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
      { rateClass, url: "https://api.xero.com/x" },
      { fetchImpl, limiter: permissiveLimiter(), sleep }
    );
    expect(response.status).toBe(503);
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });
});
describe("external tenant identity regression", () => {
  it("shares keys for one external tenant across internal bindings", () => {
    const first = { ...rateClass, clerkOrgId: "one", organisationId: "one" };
    const second = { ...rateClass, clerkOrgId: "two", organisationId: "two" };
    expect(xeroRateKeys(first, "test")).toEqual(xeroRateKeys(second, "test"));
  });
  it("separates tenants despite identical internal bindings", () => {
    expect(xeroRateKeys(rateClass, "test")).not.toEqual(
      xeroRateKeys({ ...rateClass, xeroTenantId: "other" }, "test")
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
        rateClass,
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
      rateClass,
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
      rateClass,
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
      { maxBodyBytes: 3, rateClass, url: "https://api.xero.com/x" },
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
      { rateClass, url: "https://api.xero.com/x" },
      { fetchImpl, limiter: permissiveLimiter() }
    )
  ).rejects.toMatchObject({ code: "redirect_rejected", dispatched: true });
  expect(fetchImpl).toHaveBeenCalledTimes(1);
  expect(fetchImpl.mock.calls[0]?.[1]?.redirect).toBe("manual");
});
it("rejects foreign origins before dispatch", async () => {
  const fetchImpl = vi.fn();
  await expect(
    xeroFetch({ rateClass, url: "https://other.example/x" }, { fetchImpl })
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
      xeroFetch({ rateClass, url: "https://other.example/x" }, { fetchImpl })
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
    { rateClass, url: "https://api.xero.com/x" },
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
    { rateClass, url: "https://api.xero.com/x" },
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
        rateClass,
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
        rateClass,
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
        rateClass,
        url: "https://api.xero.com/x",
      },
      { fetchImpl, limiter: permissiveLimiter() }
    )
  ).rejects.toMatchObject({ code: "deadline_exceeded", dispatched: true });
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});
it("denies unavailable admission before dispatch", async () => {
  const fetchImpl = vi.fn();
  const limiter = new XeroRateLimiter(
    {},
    {
      store: {
        observe: async () => undefined,
        release: async () => undefined,
        reserve: async () => ({
          error: { reason: "infrastructure" },
          ok: false,
        }),
      },
    }
  );
  await expect(
    xeroFetch(
      { rateClass, url: "https://api.xero.com/x" },
      { fetchImpl, limiter }
    )
  ).rejects.toMatchObject({ code: "admission_unavailable", dispatched: false });
  expect(fetchImpl).not.toHaveBeenCalled();
});
it("preserves dispatched success when lease release fails", async () => {
  const limiter = new XeroRateLimiter(
    {},
    {
      store: {
        observe: async () => undefined,
        release: () =>
          Promise.reject(new Error("Synthetic unavailable release")),
        reserve: async (input) => ({
          ok: true,
          value: { reservationId: input.reservationId },
        }),
      },
    }
  );
  const fetchImpl = vi
    .fn()
    .mockResolvedValue(new Response("accepted", { status: 200 }));
  const response = await xeroFetch(
    {
      rateClass,
      retryOnAmbiguousFailure: false,
      url: "https://api.xero.com/x",
    },
    { fetchImpl, limiter }
  );
  expect(response.status).toBe(200);
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});
it("reports operation expiry before admission infrastructure failure", async () => {
  const { createXeroDeadline } = await import("./deadline");
  const { RedisSharedXeroRateStore } = await import("./shared-store");
  vi.useFakeTimers();
  try {
    const store = new RedisSharedXeroRateStore({
      fetchImpl: () =>
        new Promise(() => {
          /* Unresponsive transport. */
        }),
      limits: {
        appCallsPerMinute: 10,
        callsPerDayPerOrg: 10,
        callsPerMinutePerOrg: 10,
        concurrentRequestsPerOrg: 5,
      },
      namespace: "test",
      token: "test",
      url: "https://invalid.example",
    });
    const fetchImpl = vi.fn();
    const assertion = expect(
      xeroFetch(
        {
          deadline: createXeroDeadline(10),
          rateClass,
          url: "https://api.xero.com/x",
        },
        { fetchImpl, limiter: new XeroRateLimiter({}, { store }) }
      )
    ).rejects.toMatchObject({ code: "deadline_exceeded", dispatched: false });
    await vi.advanceTimersByTimeAsync(10);
    await assertion;
    expect(fetchImpl).not.toHaveBeenCalled();
  } finally {
    vi.useRealTimers();
  }
});
it.each([401, 403])(
  "preserves %i authoritative headers when its body stalls within the absolute deadline",
  async (status) => {
    vi.useFakeTimers();
    try {
      const limiter = permissiveLimiter();
      const release = vi.fn();
      const observe = vi.spyOn(limiter, "observe");
      vi.spyOn(limiter, "acquire").mockResolvedValue({ ok: true, release });
      const cancel = vi.fn();
      const stream = new ReadableStream({
        cancel,
        pull() {
          return new Promise(() => {
            /* Stalled provider body. */
          });
        },
      });
      const fetchImpl = vi.fn().mockResolvedValue(
        new Response(stream, {
          headers: { "WWW-Authenticate": 'Bearer error="insufficient_scope"' },
          status,
        })
      );
      const responsePromise = xeroFetch(
        {
          deadline: { expiresAtMs: Date.now() + 25 },
          rateClass,
          url: "https://api.xero.com/x",
        },
        { fetchImpl, limiter }
      );
      await vi.advanceTimersByTimeAsync(25);
      const response = await responsePromise;
      expect(response.status).toBe(status);
      expect(response.headers.get("WWW-Authenticate")).toBe(
        'Bearer error="insufficient_scope"'
      );
      expect(await response.text()).toBe("");
      expect(fetchImpl).toHaveBeenCalledOnce();
      expect(release).toHaveBeenCalledOnce();
      expect(cancel).toHaveBeenCalledOnce();
      expect(observe).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  }
);
it.each([401, 403])(
  "preserves %i normal raw audit body while retaining headers and release",
  async (status) => {
    const limiter = permissiveLimiter();
    const release = vi.fn();
    vi.spyOn(limiter, "acquire").mockResolvedValue({ ok: true, release });
    const response = await xeroFetch(
      { rateClass, url: "https://api.xero.com/x" },
      {
        fetchImpl: vi.fn().mockResolvedValue(
          new Response('{"Message":"audit only"}', {
            headers: { "WWW-Authenticate": "insufficent_scope" },
            status,
          })
        ),
        limiter,
      }
    );
    expect(await response.json()).toEqual({ Message: "audit only" });
    expect(response.headers.get("WWW-Authenticate")).toBe("insufficent_scope");
    expect(release).toHaveBeenCalledOnce();
  }
);
it("normalises pre-aborted signals as definite non-attempts", async () => {
  const limiter = permissiveLimiter();
  const acquire = vi.spyOn(limiter, "acquire");
  const fetchImpl = vi.fn();
  const controller = new AbortController();
  controller.abort();
  await expect(
    xeroFetch(
      {
        init: { signal: controller.signal },
        rateClass,
        url: "https://api.xero.com/x",
      },
      { fetchImpl, limiter }
    )
  ).rejects.toMatchObject({ code: "deadline_exceeded", dispatched: false });
  expect(acquire).not.toHaveBeenCalled();
  expect(fetchImpl).not.toHaveBeenCalled();
});
describe("transport lifecycle metrics", () => {
  it.each([false, true])(
    "records a definite deadline failure even when metric logging throws: %s",
    async (loggerFails) => {
      if (loggerFails) {
        metricLog.mockImplementation(() => {
          throw new Error("telemetry unavailable");
        });
      }
      const limiter = permissiveLimiter();
      const acquire = vi.spyOn(limiter, "acquire");
      const fetchImpl = vi.fn();
      await expect(
        xeroFetch(
          {
            deadline: { expiresAtMs: Date.now() - 1 },
            rateClass,
            url: "https://api.xero.com/x",
          },
          { fetchImpl, limiter }
        )
      ).rejects.toMatchObject({ code: "deadline_exceeded", dispatched: false });
      expect(acquire).not.toHaveBeenCalled();
      expect(fetchImpl).not.toHaveBeenCalled();
      expect(metricLog).toHaveBeenCalledExactlyOnceWith(
        "Xero lifecycle metric",
        { metric: "xero.fetch.deadline_exceeded", value: 1 }
      );
    }
  );
});

describe("recorded mutation replay", () => {
  function mutation() {
    const now = Date.now();
    return {
      firstDispatchedAt: new Date(now - 1000),
      idempotencyKey: "3890e6b4-47d0-40b9-ad47-c802f92c836a",
      replayBefore: new Date(now + 299_000),
      request: {
        body: "[]",
        method: "POST" as const,
        url: "https://api.xero.com/payroll.xro/1.0/LeaveApplications",
        xeroTenantId: "org-a",
      },
    };
  }
  function input(identity = mutation()) {
    return {
      init: {
        body: "[]",
        headers: {
          "Idempotency-Key": identity.idempotencyKey,
          "Xero-Tenant-Id": "org-a",
        },
        method: "POST",
      },
      mutation: identity,
      rateClass,
      url: identity.request.url,
    };
  }
  it.each(["response_lost", "provider_503"])(
    "retains %s uncertainty when the retry cannot obtain admission",
    async (firstOutcome) => {
      const limiter = permissiveLimiter();
      const acquire = vi.spyOn(limiter, "acquire");
      acquire.mockResolvedValueOnce({
        ok: true,
        release: () => Promise.resolve(),
      });
      acquire.mockResolvedValueOnce({ ok: false, reason: "infrastructure" });
      const fetchImpl = vi.fn(() => {
        if (firstOutcome === "response_lost") {
          return Promise.reject(new TypeError("response lost"));
        }
        return Promise.resolve(new Response(null, { status: 503 }));
      });
      const result = await xeroFetch(input(), {
        fetchImpl,
        limiter,
        sleep: () => Promise.resolve(),
      }).catch((error: unknown) => mapXeroTransportError(error, true));
      expect(result).toMatchObject({
        dispatchPhase: "after_dispatch",
        recoveryReason: "outcome_unknown",
      });
      expect(fetchImpl).toHaveBeenCalledOnce();
    }
  );
  it.each([400, 401, 403, 404, 409, 429])(
    "retains a lost-response outcome when a later retry returns %s",
    async (status) => {
      const fetchImpl = vi
        .fn()
        .mockRejectedValueOnce(new TypeError("response lost"))
        .mockResolvedValueOnce(
          new Response(null, {
            headers: {
              "Retry-After": "999",
              "xero-correlation-id": "retry-correlation",
            },
            status,
          })
        );
      const result = await xeroFetch(input(), {
        fetchImpl,
        limiter: permissiveLimiter(),
        sleep: () => Promise.resolve(),
      }).catch((error: unknown) => mapXeroTransportError(error, true));
      expect(result).toMatchObject({
        correlationId: "retry-correlation",
        dispatchPhase: "after_dispatch",
        httpStatus: status,
        recoveryReason: "outcome_unknown",
      });
      expect(fetchImpl).toHaveBeenCalledTimes(2);
    }
  );
  it("retains uncertainty when local admission denies a retry after dispatch", async () => {
    const limiter = permissiveLimiter();
    const acquire = vi.spyOn(limiter, "acquire");
    acquire.mockResolvedValueOnce({
      ok: true,
      release: () => Promise.resolve(),
    });
    acquire.mockResolvedValueOnce({ ok: false, reason: "minute" });
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError("response lost"));
    const result = await xeroFetch(input(), {
      fetchImpl,
      limiter,
      sleep: () => Promise.resolve(),
    }).catch((error: unknown) => mapXeroTransportError(error, true));
    expect(result).toMatchObject({
      dispatchPhase: "after_dispatch",
      recoveryReason: "outcome_unknown",
    });
    expect(result).not.toHaveProperty("httpStatus", 429);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
  it("freezes the original request across retries", async () => {
    const request = input();
    const fetchImpl = vi
      .fn()
      .mockImplementationOnce(() => {
        request.init.body = "changed";
        request.init.headers["Idempotency-Key"] = "changed";
        return Promise.reject(new TypeError("response lost"));
      })
      .mockResolvedValueOnce(new Response("{}"));
    await xeroFetch(request, {
      fetchImpl,
      limiter: permissiveLimiter(),
      sleep: () => Promise.resolve(),
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    for (const [, init] of fetchImpl.mock.calls) {
      expect(init.body).toBe("[]");
      expect(new Headers(init.headers).get("Idempotency-Key")).toBe(
        request.mutation.idempotencyKey
      );
    }
  });
  it("rejects a missing key before dispatch", async () => {
    const request = input();
    const headers = new Headers(request.init.headers);
    headers.delete("Idempotency-Key");
    const missingKeyRequest = {
      ...request,
      init: { ...request.init, headers },
    };
    const fetchImpl = vi.fn();
    await expect(
      xeroFetch(missingKeyRequest, { fetchImpl, limiter: permissiveLimiter() })
    ).rejects.toMatchObject({ dispatched: false });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it("does not sleep into an expired replay window", async () => {
    const identity = mutation();
    identity.replayBefore = new Date(Date.now() + 100);
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response("cached failure", { status: 500 }));
    const sleep = vi.fn();
    const response = await xeroFetch(input(identity), {
      fetchImpl,
      limiter: permissiveLimiter(),
      sleep,
    });
    expect(response.status).toBe(500);
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(sleep).not.toHaveBeenCalled();
  });
});

it("logs only safe endpoint diagnostics for a sensitive payroll retry", async () => {
  const fetchImpl = vi
    .fn()
    .mockResolvedValueOnce(
      new Response("sensitive payroll body", {
        headers: { "x-correlation-id": "correlation-1" },
        status: 503,
      })
    )
    .mockResolvedValueOnce(
      new Response("{}", {
        headers: { "xero-correlation-id": "correlation-2" },
      })
    );
  await xeroFetch(
    {
      init: { headers: { Authorization: "Bearer sensitive-token" } },
      rateClass,
      url: "https://api.xero.com/payroll.xro/1.0/LeaveApplications?code=sensitive-code&state=sensitive-state",
    },
    { fetchImpl, limiter: permissiveLimiter(), sleep: () => Promise.resolve() }
  );
  expect(metricLog).toHaveBeenCalledWith("xero.http.response", {
    correlationId: "correlation-1",
    endpoint: "/payroll.xro/1.0/LeaveApplications",
    method: "GET",
    retryDelayMs: 500,
    status: 503,
  });
  expect(metricLog).toHaveBeenCalledWith("xero.http.response", {
    correlationId: "correlation-2",
    endpoint: "/payroll.xro/1.0/LeaveApplications",
    method: "GET",
    retryDelayMs: 0,
    status: 200,
  });
  const logs = JSON.stringify(metricLog.mock.calls);
  for (const secret of [
    "sensitive-token",
    "sensitive-code",
    "sensitive-state",
    "sensitive payroll body",
  ]) {
    expect(logs).not.toContain(secret);
  }
});

it("never retries an ambiguous unsupported mutation without recorded identity", async () => {
  const fetchImpl = vi
    .fn()
    .mockResolvedValue(new Response("", { status: 503 }));
  const response = await xeroFetch(
    {
      init: { body: "[]", method: "POST" },
      rateClass,
      url: "https://api.xero.com/payroll.xro/1.0/LeaveApplications",
    },
    { fetchImpl, limiter: permissiveLimiter(), sleep: () => Promise.resolve() }
  );
  expect(response.status).toBe(503);
  expect(fetchImpl).toHaveBeenCalledOnce();
});
