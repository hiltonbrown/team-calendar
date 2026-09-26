import { describe, expect, it, vi } from "vitest";
import { executeRedisRestCommand } from "./redis-rest-transport";

describe("executeRedisRestCommand", () => {
  const defaultUrl = "https://example.kv.vercel-storage.com";
  const defaultToken = "secret-redis-token-xyz";

  it("bounds a stalled body after headers", async () => {
    const result = await Promise.race([
      executeRedisRestCommand({
        command: ["get", "key"],
        fetch: vi.fn().mockResolvedValue(
          new Response(
            new ReadableStream({
              start() {
                /* Deliberately never produce body data. */
              },
            })
          )
        ),
        timeoutMs: 50,
        token: defaultToken,
        url: defaultUrl,
      }),
      new Promise<"unsettled">((resolve) =>
        setTimeout(() => resolve("unsettled"), 500)
      ),
    ]);
    expect(result).toMatchObject({ error: { code: "timeout" }, ok: false });
    expect(JSON.stringify(result)).not.toContain(defaultToken);
  });

  it("sends proper POST headers and JSON body, returning parsed result", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ result: "OK" }), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      })
    );

    const result = await executeRedisRestCommand<string>({
      command: ["set", "foo", "bar", "ex", 60],
      fetch: mockFetch as unknown as typeof fetch,
      token: defaultToken,
      url: defaultUrl,
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith(
      defaultUrl,
      expect.objectContaining({
        body: JSON.stringify(["set", "foo", "bar", "ex", 60]),
        headers: {
          Authorization: `Bearer ${defaultToken}`,
          "Content-Type": "application/json",
        },
        method: "POST",
      })
    );

    expect(result).toEqual({ ok: true, value: "OK" });
  });

  it("handles various result types (null, 0, false, arrays, objects)", async () => {
    const testCases: unknown[] = [
      null,
      0,
      false,
      "",
      ["item1", "item2"],
      { nested: { count: 42 } },
    ];

    for (const testValue of testCases) {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ result: testValue }), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        })
      );

      const result = await executeRedisRestCommand({
        command: ["get", "test-key"],
        fetch: mockFetch as unknown as typeof fetch,
        token: defaultToken,
        url: defaultUrl,
      });

      expect(result).toEqual({ ok: true, value: testValue });
    }
  });

  it("returns http_error on non-2xx status", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "Unauthorized access" }), {
        headers: { "Content-Type": "application/json" },
        status: 401,
      })
    );

    const result = await executeRedisRestCommand({
      command: ["get", "key"],
      fetch: mockFetch as unknown as typeof fetch,
      token: defaultToken,
      url: defaultUrl,
    });

    expect(result).toEqual({
      error: {
        code: "http_error",
        message: "Unauthorized access",
        status: 401,
      },
      ok: false,
    });
  });

  it("returns redis_error when 200 response contains error field", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "ERR unknown command" }), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      })
    );

    const result = await executeRedisRestCommand({
      command: ["invalid_cmd"],
      fetch: mockFetch as unknown as typeof fetch,
      token: defaultToken,
      url: defaultUrl,
    });

    expect(result).toEqual({
      error: {
        code: "redis_error",
        message: "ERR unknown command",
        status: 200,
      },
      ok: false,
    });
  });

  it("returns invalid_response on malformed JSON", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response("<html>Bad Gateway</html>", {
        headers: { "Content-Type": "text/html" },
        status: 502,
      })
    );

    const result = await executeRedisRestCommand({
      command: ["get", "key"],
      fetch: mockFetch as unknown as typeof fetch,
      token: defaultToken,
      url: defaultUrl,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("invalid_response");
      expect(result.error.status).toBe(502);
      expect(result.error.message).toContain(
        "Failed to parse Redis REST response"
      );
    }
  });

  it("returns invalid_response when envelope is neither result nor error", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ unexpected: true }), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      })
    );

    const result = await executeRedisRestCommand({
      command: ["get", "key"],
      fetch: mockFetch as unknown as typeof fetch,
      token: defaultToken,
      url: defaultUrl,
    });

    expect(result).toEqual({
      error: {
        code: "invalid_response",
        message: "Malformed Redis REST response envelope",
        status: 200,
      },
      ok: false,
    });
  });

  it("handles timeoutMs expiring", async () => {
    const mockFetch = vi.fn().mockImplementation(
      (_url, init: { signal?: AbortSignal }) =>
        new Promise((_, reject) => {
          init.signal?.addEventListener("abort", () => {
            const err = new DOMException(
              "The operation timed out",
              "TimeoutError"
            );
            reject(err);
          });
        })
    );

    const result = await executeRedisRestCommand({
      command: ["get", "slow-key"],
      fetch: mockFetch as unknown as typeof fetch,
      timeoutMs: 10,
      token: defaultToken,
      url: defaultUrl,
    });

    expect(result).toEqual({
      error: {
        code: "timeout",
        message: "Redis REST request timed out",
      },
      ok: false,
    });
  });

  it("handles pre-aborted signal", async () => {
    const controller = new AbortController();
    controller.abort(new Error("Operation cancelled"));

    const result = await executeRedisRestCommand({
      command: ["get", "key"],
      signal: controller.signal,
      timeoutMs: 1000,
      token: defaultToken,
      url: defaultUrl,
    });

    expect(result).toEqual({
      error: {
        code: "aborted",
        message: "Operation cancelled",
      },
      ok: false,
    });
  });

  it("redacts token from network errors and URL with credentials", async () => {
    const secretToken = "super-secret-token-value-999";
    const sensitiveUrl = `https://user:${secretToken}@redis-service.internal`;

    const mockFetch = vi
      .fn()
      .mockRejectedValue(
        new Error(
          `Failed to connect to ${sensitiveUrl} using token ${secretToken}`
        )
      );

    const result = await executeRedisRestCommand({
      command: ["get", "key"],
      fetch: mockFetch as unknown as typeof fetch,
      token: secretToken,
      url: sensitiveUrl,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("network_error");
      expect(result.error.message).not.toContain(secretToken);
      expect(result.error.message).toContain("[REDACTED]");
    }
  });

  it("redacts token from error messages in response payloads", async () => {
    const secretToken = "my-secret-token-888";
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: `Invalid authorization token: ${secretToken}`,
        }),
        {
          headers: { "Content-Type": "application/json" },
          status: 403,
        }
      )
    );

    const result = await executeRedisRestCommand({
      command: ["get", "key"],
      fetch: mockFetch as unknown as typeof fetch,
      token: secretToken,
      url: defaultUrl,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).not.toContain(secretToken);
      expect(result.error.message).toContain("[REDACTED]");
    }
  });

  it("redacts URL credentials when an earlier non-credential :// exists", async () => {
    const secretToken = "token-777";
    const mockFetch = vi
      .fn()
      .mockRejectedValue(
        new Error(
          `protocol://no-creds then https://user:${secretToken}@redis.internal failed`
        )
      );

    const result = await executeRedisRestCommand({
      command: ["get", "key"],
      fetch: mockFetch as unknown as typeof fetch,
      token: secretToken,
      url: defaultUrl,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).not.toContain(secretToken);
      expect(result.error.message).toContain("https://[REDACTED]:[REDACTED]@");
    }
  });

  it("redacts credentials for multiple URLs in one message", async () => {
    const firstSecret = "token-1";
    const secondSecret = "token-2";
    const message = `Source https://alice:${firstSecret}@source.internal failed, destination https://bob:${secondSecret}@dest.internal unreachable`;
    const mockFetch = vi.fn().mockRejectedValue(new Error(message));

    const result = await executeRedisRestCommand({
      command: ["get", "key"],
      fetch: mockFetch as unknown as typeof fetch,
      token: "",
      url: defaultUrl,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain(
        "https://[REDACTED]:[REDACTED]@source.internal"
      );
      expect(result.error.message).toContain(
        "https://[REDACTED]:[REDACTED]@dest.internal"
      );
      expect(result.error.message).not.toContain(firstSecret);
      expect(result.error.message).not.toContain(secondSecret);
    }
  });
});

it("distinguishes caller cancellation during a stalled body", async () => {
  const caller = new AbortController();
  const result = executeRedisRestCommand({
    command: ["get", "key"],
    fetch: vi.fn().mockResolvedValue(
      new Response(
        new ReadableStream({
          start() {
            /* Deliberately never produce body data. */
          },
        })
      )
    ),
    signal: caller.signal,
    timeoutMs: 1000,
    token: "synthetic-bearer",
    url: "https://example.com",
  });
  setTimeout(() => caller.abort(), 10);
  expect(await result).toMatchObject({ error: { code: "aborted" }, ok: false });
  expect(JSON.stringify(await result)).not.toContain("synthetic-bearer");
});
for (const failure of [false, true]) {
  it(`removes caller listener after ${failure ? "failure" : "success"}`, async () => {
    const caller = new AbortController();
    const remove = vi.spyOn(caller.signal, "removeEventListener");
    const result = await executeRedisRestCommand({
      command: ["get", "key"],
      fetch: failure
        ? vi.fn().mockRejectedValue(new Error("synthetic-bearer"))
        : vi.fn().mockResolvedValue(new Response('{"result":1}')),
      signal: caller.signal,
      timeoutMs: 1000,
      token: "synthetic-bearer",
      url: "https://example.com",
    });
    expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
    expect(result.ok).toBe(!failure);
    expect(JSON.stringify(result)).not.toContain("synthetic-bearer");
  });
}
