import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBetterAuthOptions } from "./better-auth-options";
import { parseBetterAuthEnvironment } from "./keys";
import { handleAuthRequest } from "./route";

const mocks = vi.hoisted(() => ({
  handler: vi.fn<(request: Request) => Promise<Response>>(),
  sendAuthEmail: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@repo/email", () => ({ sendAuthEmail: mocks.sendAuthEmail }));
vi.mock("./adapters/better-auth-server", () => ({
  getBetterAuth: () => ({ handler: mocks.handler }),
}));

const origin = "http://localhost:3000";
const email = "runtime-person@example.test";
const password = "A sufficiently long test password";
const userId = "55555555-5555-4555-8555-555555555551";
const accountId = "55555555-5555-4555-8555-555555555552";
const environment = {
  BETTER_AUTH_SECRET: "native-runtime-test-secret-at-least-32-characters",
  BETTER_AUTH_URL: origin,
  GOOGLE_CLIENT_ID: "google-id",
  GOOGLE_CLIENT_SECRET: "google-secret",
  MICROSOFT_CLIENT_ID: "microsoft-id",
  MICROSOFT_CLIENT_SECRET: "microsoft-secret",
  NEXT_PUBLIC_APP_URL: origin,
  XERO_AUTH_CLIENT_ID: "independent-xero-auth-id",
  XERO_AUTH_CLIENT_SECRET: "independent-xero-auth-secret",
};

const request = (
  path: string,
  body?: Record<string, unknown>,
  cookie?: string
) =>
  new Request(`${origin}/api/auth${path}`, {
    body: body ? JSON.stringify(body) : undefined,
    headers: {
      "content-type": "application/json",
      origin,
      "x-vercel-forwarded-for": "192.0.2.10",
      ...(cookie ? { cookie } : {}),
    },
    method: body ? "POST" : "GET",
  });

describe("pinned Better Auth native runtime", () => {
  beforeEach(() => {
    vi.stubEnv("VERCEL", "1");
    mocks.sendAuthEmail.mockReset();
    mocks.handler.mockReset();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  const createFixture = async () => {
    const outbound = vi.fn((input: RequestInfo | URL) => {
      const url = input instanceof Request ? input.url : String(input);
      if (
        url !== "https://identity.xero.com/.well-known/openid-configuration"
      ) {
        throw new Error("Unexpected outbound request in native auth test");
      }
      return Promise.resolve(
        Response.json({
          authorization_endpoint:
            "https://login.xero.com/identity/connect/authorize",
          id_token_signing_alg_values_supported: ["RS256"],
          issuer: "https://identity.xero.com",
          jwks_uri:
            "https://identity.xero.com/.well-known/openid-configuration/jwks",
          token_endpoint: "https://identity.xero.com/connect/token",
          userinfo_endpoint: "https://identity.xero.com/connect/userinfo",
        })
      );
    });
    vi.stubGlobal("fetch", outbound);
    const storage: Record<string, Record<string, unknown>[]> = {
      AuthIdentity: [],
      AuthInvitation: [],
      AuthMember: [],
      AuthOrganization: [],
      AuthRateLimit: [],
      AuthSession: [],
      AuthUser: [],
      AuthVerification: [],
    };
    const configured = createBetterAuthOptions(
      parseBetterAuthEnvironment(environment),
      memoryAdapter(storage)
    );
    const native = betterAuth(configured);
    const context = await native.$context;
    const now = new Date();
    // Fixture writes deliberately bypass the blocked admission hook. The real
    // handler still uses its native validation, cookies and mapped adapter.
    await memoryAdapter(storage)(configured).create({
      data: {
        createdAt: now,
        email,
        emailVerified: true,
        id: userId,
        name: "Runtime Person",
        updatedAt: now,
      },
      forceAllowId: true,
      model: "user",
    });
    await memoryAdapter(storage)(configured).create({
      data: {
        accountId: userId,
        createdAt: now,
        id: "55555555-5555-4555-8555-555555555553",
        password: await context.password.hash(password),
        providerId: "credential",
        updatedAt: now,
        userId,
      },
      forceAllowId: true,
      model: "account",
    });
    await memoryAdapter(storage)(configured).create({
      data: {
        countryCode: "AU",
        createdAt: now,
        id: accountId,
        name: "Runtime Account",
        provisioningStatus: "ready",
        slug: "runtime-account",
      },
      forceAllowId: true,
      model: "organization",
    });
    await memoryAdapter(storage)(configured).create({
      data: {
        createdAt: now,
        id: "55555555-5555-4555-8555-555555555554",
        organizationId: accountId,
        role: "owner",
        userId,
      },
      forceAllowId: true,
      model: "member",
    });
    mocks.handler.mockImplementation((input) => native.handler(input));
    return { context, native, outbound, storage };
  };

  it("signs in a verified fixture and projects a native cookie session without bearer values", async () => {
    const { outbound } = await createFixture();
    const signedIn = await handleAuthRequest(
      request("/sign-in/email", { email, password })
    );
    expect(signedIn.status).toBe(200);
    const body = await signedIn.json();
    expect(body).toMatchObject({
      user: { email, emailVerified: true, id: userId },
    });
    expect(body).not.toHaveProperty("token");
    const cookies = signedIn.headers.getSetCookie();
    expect(
      cookies.some(
        (cookie) =>
          cookie.includes("session_token=") && cookie.includes("HttpOnly")
      )
    ).toBe(true);
    const cookieHeader = cookies
      .map((cookie) => cookie.split(";")[0])
      .join("; ");
    const sessionResponse = await handleAuthRequest(
      request("/get-session", undefined, cookieHeader)
    );
    expect(sessionResponse.status).toBe(200);
    const sessionBody = await sessionResponse.json();
    expect(sessionBody).toMatchObject({
      session: { userId },
      user: { email, id: userId },
    });
    expect(sessionBody.session).not.toHaveProperty("token");
    expect(sessionBody.user).not.toHaveProperty("password");
    expect(outbound).toHaveBeenCalledTimes(1);
    expect(String(outbound.mock.calls[0]?.[0])).toBe(
      "https://identity.xero.com/.well-known/openid-configuration"
    );
  });

  it("rejects missing identity, bad passwords and cross-origin sign-in using native APIs", async () => {
    await createFixture();
    const anonymous = await handleAuthRequest(request("/get-session"));
    expect(anonymous.status).toBe(200);
    expect(await anonymous.json()).toBeNull();
    const wrong = await handleAuthRequest(
      request("/sign-in/email", { email, password: "wrong-password" })
    );
    expect(wrong.status).toBe(401);
    expect(await wrong.json()).toMatchObject({
      code: "INVALID_EMAIL_OR_PASSWORD",
    });
    const forbidden = request("/sign-in/email", { email, password });
    forbidden.headers.set("origin", "https://untrusted.example");
    const response = await handleAuthRequest(forbidden);
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "INVALID_ORIGIN" });
  });

  it("keeps admission and membership mutation paths closed without creating orphan users", async () => {
    const { native, context, storage } = await createFixture();
    const signup = await native.handler(
      request("/sign-up/email", {
        email: "new-person@example.test",
        name: "New Person",
        password,
      })
    );
    expect(signup.status).toBeGreaterThanOrEqual(400);
    const removed = await native.handler(
      request("/organization/remove-member", {
        memberIdOrEmail: email,
        organizationId: accountId,
      })
    );
    expect(removed.status).toBeGreaterThanOrEqual(400);
    await expect(
      context.internalAdapter.createUser(
        {
          email: "orphan@example.test",
          name: "Orphan Attempt",
        },
        { method: "email-password" }
      )
    ).rejects.toThrow();
    expect(storage.AuthUser).toHaveLength(1);
    expect(storage.AuthMember).toHaveLength(1);
  });

  it("enforces the native database-backed sign-in bucket", async () => {
    const { storage } = await createFixture();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const denied = await handleAuthRequest(
        request("/sign-in/email", { email, password: "incorrect-password" })
      );
      expect(denied.status).toBe(401);
    }
    const limited = await handleAuthRequest(
      request("/sign-in/email", { email, password })
    );
    expect(limited.status).toBe(429);
    expect(storage.AuthRateLimit.length).toBeGreaterThan(0);
    expect(storage.AuthSession).toHaveLength(0);
  });

  it("requires a verified local user before native explicit social linking", async () => {
    const { context } = await createFixture();
    const signedIn = await handleAuthRequest(
      request("/sign-in/email", { email, password })
    );
    expect(signedIn.status).toBe(200);
    const cookie = signedIn.headers
      .getSetCookie()
      .map((value) => value.split(";")[0])
      .join("; ");
    await context.adapter.update({
      model: "user",
      update: { emailVerified: false },
      where: [{ field: "id", value: userId }],
    });
    const denied = await handleAuthRequest(
      request("/link-social", { provider: "google" }, cookie)
    );
    expect(denied.status).toBe(403);
    expect(await denied.json()).toMatchObject({
      message: "A fresh verified session is required",
    });
  });

  it("rejects direct ID-token linking before provider verification or token storage", async () => {
    const { storage, outbound } = await createFixture();
    const signedIn = await handleAuthRequest(
      request("/sign-in/email", { email, password })
    );
    expect(signedIn.status).toBe(200);
    const cookie = signedIn.headers
      .getSetCookie()
      .map((value) => value.split(";")[0])
      .join("; ");
    const denied = await handleAuthRequest(
      request(
        "/link-social",
        {
          idToken: {
            accessToken: "untrusted-provider-token",
            token: "untrusted-id-token",
          },
          provider: "google",
        },
        cookie
      )
    );
    expect(denied.status).toBe(403);
    expect(storage.AuthIdentity).toHaveLength(1);
    expect(outbound).toHaveBeenCalledTimes(1);
  });
});
