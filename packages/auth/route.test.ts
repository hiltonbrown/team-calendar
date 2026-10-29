import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleAuthRequest, projectAuthResponse } from "./route";

const handler = vi.hoisted(() => vi.fn());
vi.mock("server-only", () => ({}));
vi.mock("./adapters/better-auth-server", () => ({
  getBetterAuth: () => ({ handler }),
}));
beforeEach(() => vi.stubEnv("AUTH_CONTEXT_MODE", "local"));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
describe("native auth HTTP boundary", () => {
  it("projects Account picker data and preserves organisation errors without metadata", () => {
    const account = {
      countryCode: "AU",
      id: "account",
      members: [
        {
          id: "member",
          role: "owner",
          user: { email: "safe@example.test", id: "user", password: "hash" },
          userId: "user",
        },
      ],
      metadata: "private",
      name: "Safe",
      provisioningStatus: "ready",
      slug: "safe",
    };
    expect(projectAuthResponse("/organization/list", [account])).toEqual([
      {
        countryCode: "AU",
        id: "account",
        name: "Safe",
        provisioningStatus: "ready",
        slug: "safe",
      },
    ]);
    expect(
      projectAuthResponse("/organization/get-full-organization", account)
    ).toMatchObject({ members: [{ role: "owner", user: { id: "user" } }] });
    expect(
      JSON.stringify(
        projectAuthResponse("/organization/get-full-organization", account)
      )
    ).not.toContain("private");
    expect(
      JSON.stringify(
        projectAuthResponse("/organization/get-full-organization", account)
      )
    ).not.toContain("hash");
    expect(
      projectAuthResponse("/organization/set-active", {
        code: "MEMBER_NOT_FOUND",
        message: "Select an Account",
      })
    ).toEqual({ code: "MEMBER_NOT_FOUND", message: "Select an Account" });
  });
  it("projects sessions without session bearer or provider secrets", () => {
    const value = projectAuthResponse("/get-session", {
      session: {
        activeOrganizationId: "account",
        expiresAt: "expiry",
        id: "session",
        ipAddress: "private",
        token: "bearer",
        userId: "user",
      },
      user: {
        accessToken: "secret",
        email: "user@example.test",
        emailVerified: true,
        id: "user",
        password: "hash",
      },
    });
    expect(value).toEqual({
      session: {
        activeOrganizationId: "account",
        expiresAt: "expiry",
        id: "session",
        userId: "user",
      },
      user: { email: "user@example.test", emailVerified: true, id: "user" },
    });
  });
  it("retains status, redirects and all cookies while stripping JSON tokens", async () => {
    handler.mockResolvedValueOnce(
      Response.json(
        { token: "secret", user: { email: "user@example.test", id: "user" } },
        {
          headers: [
            ["set-cookie", "first=1; HttpOnly"],
            ["set-cookie", "second=2; Secure"],
          ],
          status: 200,
        }
      )
    );
    const response = await handleAuthRequest(
      new Request("http://localhost:3000/api/auth/sign-in/email", {
        method: "POST",
      })
    );
    expect(await response.json()).toEqual({
      user: { email: "user@example.test", id: "user" },
    });
    expect(response.headers.getSetCookie()).toHaveLength(2);
    expect(response.headers.get("cache-control")).toBe("no-store");
    handler.mockResolvedValueOnce(
      new Response(null, {
        headers: {
          location: "/calendar",
          "set-cookie": "auth=opaque; HttpOnly",
        },
        status: 302,
      })
    );
    const redirect = await handleAuthRequest(
      new Request("http://localhost:3000/api/auth/callback/google")
    );
    expect(redirect.status).toBe(302);
    expect(redirect.headers.get("location")).toBe("/calendar");
  });
  it("keeps the native server dormant on the remote API runtime", async () => {
    vi.stubEnv("AUTH_CONTEXT_MODE", "remote");
    expect(
      (
        await handleAuthRequest(
          new Request("http://localhost:3000/api/auth/get-session")
        )
      ).status
    ).toBe(404);
    expect(handler).not.toHaveBeenCalled();
  });
  it("denies unknown credential and unchecked admin paths", async () => {
    for (const path of [
      "/get-access-token",
      "/list-sessions",
      "/dash/execute-adapter",
      "/organization/remove-member",
      "/invented",
    ]) {
      expect(
        (
          await handleAuthRequest(
            new Request(`http://localhost:3000/api/auth${path}`)
          )
        ).status
      ).toBe(404);
    }
    expect(handler).not.toHaveBeenCalled();
  });
});
