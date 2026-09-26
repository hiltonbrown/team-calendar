import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createXeroDeadline } from "../rate-limit/deadline";
import { XeroRateLimiter } from "../rate-limit/limiter";
import { MemorySharedXeroRateStore } from "../rate-limit/memory-store";
import { XeroFetchError } from "../rate-limit/xero-fetch";
import {
  deleteXeroConnection,
  getXeroManagementToken,
  type XeroManagementAccessToken,
} from "./management-client";

vi.mock("server-only", () => ({}));
afterEach(() => vi.unstubAllEnvs());
function setup() {
  const providerAppId = randomUUID();
  vi.stubEnv("XERO_CLIENT_ID", providerAppId);
  vi.stubEnv("XERO_CLIENT_SECRET", "synthetic-management-secret");
  const limiter = new XeroRateLimiter(
    {},
    {
      store: new MemorySharedXeroRateStore({
        limits: {
          appCallsPerMinute: 1000,
          callsPerDayPerOrg: 1000,
          callsPerMinutePerOrg: 1000,
          concurrentRequestsPerOrg: 10,
        },
      }),
    }
  );
  return {
    input: {
      deadline: createXeroDeadline(5000),
      expectedProviderAppId: providerAppId,
      remoteConnectionId: randomUUID(),
    },
    limiter,
  };
}
function tokenResponse() {
  return Response.json({
    access_token: "synthetic-management-token",
    expires_in: 3600,
    token_type: "Bearer",
  });
}
describe("app management client", () => {
  it("requests singular app.connections scope without a refresh grant and caches the token", async () => {
    const { input, limiter } = setup();
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(tokenResponse());
    const result = await getXeroManagementToken(input, { fetchImpl, limiter });
    expect(result.ok).toBe(true);
    expect(await getXeroManagementToken(input, { fetchImpl, limiter })).toEqual(
      result
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0]?.[1]?.body).toBe(
      "grant_type=client_credentials&scope=app.connections"
    );
    const customerToken = z
      .string()
      .brand<"XeroCustomerAccessToken">()
      .parse("synthetic-customer-token");
    // @ts-expect-error Customer grant tokens cannot be passed as management tokens.
    const managementToken: XeroManagementAccessToken = customerToken;
    expect(managementToken).toBe(customerToken);
  });
  it.each([
    [204, "deleted"],
    [404, "absent"],
    [401, "auth_failed"],
    [403, "auth_failed"],
    [500, "server_error"],
    [400, "unknown"],
  ])("maps targeted DELETE status %s to %s", async (status, kind) => {
    const { input, limiter } = setup();
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(new Response(null, { status: Number(status) }));
    expect(await deleteXeroConnection(input, { fetchImpl, limiter })).toEqual({
      kind,
    });
    expect(fetchImpl.mock.calls[1]?.[0]).toBe(
      `https://api.xero.com/connections/${input.remoteConnectionId}`
    );
    expect(fetchImpl.mock.calls[1]?.[1]?.method).toBe("DELETE");
  });
  it("retains a bounded Retry-After on rejected DELETE", async () => {
    const { input, limiter } = setup();
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(
        new Response(null, { headers: { "Retry-After": "60" }, status: 429 })
      );
    expect(await deleteXeroConnection(input, { fetchImpl, limiter })).toEqual({
      kind: "rate_limited",
      retryAfterMs: 60_000,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
  it.each([401, 403, 500])(
    "never DELETEs after management-token status %s",
    async (status) => {
      const { input, limiter } = setup();
      const fetchImpl = vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response(null, { status }));
      expect(await deleteXeroConnection(input, { fetchImpl, limiter })).toEqual(
        { kind: status === 500 ? "not_sent" : "auth_failed" }
      );
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    }
  );
  it("rejects wrong app identity and invalid frozen UUID before any request", async () => {
    const { input, limiter } = setup();
    const fetchImpl = vi.fn<typeof fetch>();
    expect(
      await deleteXeroConnection(
        { ...input, expectedProviderAppId: "another-app" },
        { fetchImpl, limiter }
      )
    ).toEqual({ kind: "not_sent" });
    expect(
      await deleteXeroConnection(
        { ...input, remoteConnectionId: "a-tenant-id" },
        { fetchImpl, limiter }
      )
    ).toEqual({ kind: "not_sent" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it("scopes token caching to credential configuration", async () => {
    const { input, limiter } = setup();
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => tokenResponse());
    await getXeroManagementToken(input, { fetchImpl, limiter });
    vi.stubEnv("XERO_CLIENT_SECRET", "rotated-synthetic-secret");
    await getXeroManagementToken(input, { fetchImpl, limiter });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
  it("shares one token miss while bounding each waiter's own deadline", async () => {
    const { input, limiter } = setup();
    let respond: (value: Response) => void = () => {
      /* Assigned by the fake fetch. */
    };
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(
      () =>
        new Promise((resolve) => {
          respond = resolve;
        })
    );
    const first = getXeroManagementToken(input, { fetchImpl, limiter });
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));
    const short = getXeroManagementToken(
      { ...input, deadline: createXeroDeadline(5) },
      { fetchImpl, limiter }
    );
    expect(await short).toEqual({ error: { kind: "not_sent" }, ok: false });
    respond(tokenResponse());
    expect((await first).ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
  it("bounds the first hung token request and sends no DELETE", async () => {
    const { input, limiter } = setup();
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(
      () =>
        new Promise(() => {
          /* Simulate a hung token request. */
        })
    );
    expect(
      await deleteXeroConnection(
        { ...input, deadline: createXeroDeadline(10) },
        { fetchImpl, limiter }
      )
    ).toEqual({ kind: "not_sent" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
  it("marks an uncertain DELETE unknown and never retries", async () => {
    const { input, limiter } = setup();
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(tokenResponse())
      .mockRejectedValueOnce(new Error("synthetic network loss"));
    expect(await deleteXeroConnection(input, { fetchImpl, limiter })).toEqual({
      kind: "unknown",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
  it("keeps definitely-unsent DELETE failures retryable", async () => {
    const { input, limiter } = setup();
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(tokenResponse())
      .mockRejectedValueOnce(
        new XeroFetchError("admission_unavailable", false)
      );
    expect(await deleteXeroConnection(input, { fetchImpl, limiter })).toEqual({
      kind: "not_sent",
    });
  });
  it("rejects malformed or refresh-grant token responses before DELETE", async () => {
    const { input, limiter } = setup();
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        access_token: "synthetic",
        expires_in: 3600,
        refresh_token: "not-management",
        token_type: "Bearer",
      })
    );
    expect(await deleteXeroConnection(input, { fetchImpl, limiter })).toEqual({
      kind: "not_sent",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
