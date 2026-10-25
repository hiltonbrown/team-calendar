import { APIError } from "better-auth/api";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./invitation-route";

const mocks = vi.hoisted(() => ({ accept: vi.fn(), limit: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("./adapters/better-auth-server", () => ({
  consumeAuthContextRateLimit: mocks.limit,
}));
vi.mock("./adapters/better-auth-accounts", () => ({
  AccountDirectoryError: class extends Error {},
  acceptAccountInvitation: mocks.accept,
}));
const origin = "http://localhost:3000";
const invitationId = "88a9b00c-a931-4d6b-88ea-113ea8c6d54f";
const context = { params: Promise.resolve({ invitationId }) };
const request = (requestOrigin: string = origin) =>
  new Request(`${origin}/api/auth/account-invitations/${invitationId}/accept`, {
    headers: { cookie: "session=fixture", origin: requestOrigin },
    method: "POST",
  });

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("AUTH_PROVIDER", "better-auth");
  vi.stubEnv("AUTH_CONTEXT_MODE", "local");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", origin);
  vi.stubEnv("NEXT_PUBLIC_API_URL", "http://localhost:3002");
  mocks.limit.mockResolvedValue(true);
});
afterEach(() => vi.unstubAllEnvs());

describe("controlled invitation acceptance endpoint", () => {
  it("forwards only the resulting Account ID and refreshed cookies", async () => {
    const responseHeaders = new Headers({
      "set-cookie": "session=refreshed; HttpOnly; SameSite=Lax",
    });
    mocks.accept.mockResolvedValue({
      accountId: "account-id",
      responseHeaders,
    });
    const response = await POST(request(), context);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ accountId: "account-id" });
    expect(response.headers.get("cache-control")).toBe("no-store, private");
    expect(response.headers.getSetCookie()).toEqual(
      responseHeaders.getSetCookie()
    );
    expect(mocks.accept).toHaveBeenCalledWith(
      invitationId,
      expect.any(Headers)
    );
  });
  it("is unavailable for the retained provider or API host", async () => {
    vi.stubEnv("AUTH_PROVIDER", "clerk");
    expect((await POST(request(), context)).status).toBe(404);
    vi.stubEnv("AUTH_PROVIDER", "better-auth");
    vi.stubEnv("AUTH_CONTEXT_MODE", "remote");
    expect((await POST(request(), context)).status).toBe(404);
    expect(mocks.accept).not.toHaveBeenCalled();
  });
  it("rejects foreign or missing origins before auth work", async () => {
    expect(
      (await POST(request("https://untrusted.example"), context)).status
    ).toBe(403);
    const missing = request();
    missing.headers.delete("origin");
    expect((await POST(missing, context)).status).toBe(403);
    expect(mocks.limit).not.toHaveBeenCalled();
    expect(mocks.accept).not.toHaveBeenCalled();
  });
  it("honours the database-backed admission budget", async () => {
    mocks.limit.mockResolvedValue(false);
    const response = await POST(request(), context);
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("60");
    expect(mocks.accept).not.toHaveBeenCalled();
  });
  it("validates invitation IDs before the directory mutation", async () => {
    expect(
      (
        await POST(request(), {
          params: Promise.resolve({ invitationId: "not-an-id" }),
        })
      ).status
    ).toBe(400);
    expect(mocks.accept).not.toHaveBeenCalled();
  });
  it("maps native denials without returning provider diagnostics", async () => {
    mocks.accept.mockRejectedValue(
      new APIError("FORBIDDEN", { message: "secret diagnostics" })
    );
    const response = await POST(request(), context);
    expect(response.status).toBe(403);
    expect(await response.text()).not.toContain("secret diagnostics");
  });
  it("returns an operational failure without exposing private errors", async () => {
    mocks.accept.mockRejectedValue(new Error("private connection string"));
    const response = await POST(request(), context);
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("private connection string");
  });
});
