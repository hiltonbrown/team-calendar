import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createBetterAuthOptions,
  disabledAuthPaths,
} from "./better-auth-options";
import { parseBetterAuthEnvironment } from "./keys";
import { collectInvitationEmails } from "./native-mutation-context";

const sendAuthEmail = vi.hoisted(() => vi.fn());
vi.mock("@repo/email", () => ({ sendAuthEmail }));
const environment = {
  BETTER_AUTH_SECRET: "test-only-secret-at-least-32-characters",
  BETTER_AUTH_URL: "http://localhost:3000",
  GOOGLE_CLIENT_ID: "google-id",
  GOOGLE_CLIENT_SECRET: "google-secret",
  MICROSOFT_CLIENT_ID: "microsoft-id",
  MICROSOFT_CLIENT_SECRET: "microsoft-secret",
  NEXT_PUBLIC_APP_URL: "http://localhost:3000",
  XERO_AUTH_CLIENT_ID: "separate-xero-auth-id",
  XERO_AUTH_CLIENT_SECRET: "separate-xero-auth-secret",
  XERO_CLIENT_ID: "payroll-id",
  XERO_CLIENT_SECRET: "payroll-secret",
};
const optionsFor = (url = environment.BETTER_AUTH_URL, extra = {}) =>
  createBetterAuthOptions(
    parseBetterAuthEnvironment({
      ...environment,
      BETTER_AUTH_URL: url,
      NEXT_PUBLIC_APP_URL: url,
      ...extra,
    }),
    undefined
  );

describe("Better Auth server policy", () => {
  it("requires the checked transaction scope for native organisation hooks", async () => {
    const plugin = optionsFor().plugins.find(
      (item) => item.id === "organization"
    );
    const hooks = plugin?.options.organizationHooks;
    for (const hook of [
      hooks?.beforeUpdateOrganization,
      hooks?.beforeRemoveMember,
      hooks?.beforeUpdateMemberRole,
      hooks?.beforeCreateInvitation,
      hooks?.beforeAcceptInvitation,
    ]) {
      expect(hook).toBeTypeOf("function");
      if (!hook) {
        throw new Error("Missing organisation guard");
      }
      expect(() => hook()).toThrow("Use the checked Account operation");
      await expect(
        collectInvitationEmails([], () => hook())
      ).resolves.toBeUndefined();
    }
  });
  beforeEach(() => {
    sendAuthEmail.mockReset();
  });
  it("configures sign-in providers and independent Xero OIDC", () => {
    const options = optionsFor();
    expect(options.socialProviders).toEqual({});
    const generic = options.plugins.find(
      (plugin) => plugin.id === "generic-oauth"
    );
    expect(generic).toBeDefined();
    expect(options.plugins.map((plugin) => plugin.id)).toEqual([
      "organization",
      "magic-link",
      "generic-oauth",
      "next-cookies",
    ]);
    expect(options.account).toMatchObject({
      accountLinking: {
        allowDifferentEmails: false,
        allowUnlinkingAll: false,
        disableImplicitLinking: true,
        enabled: true,
        trustedProviders: [],
      },
      encryptOAuthTokens: true,
      storeAccountCookie: false,
      storeStateStrategy: "database",
    });
    expect(options.emailAndPassword).toMatchObject({
      enabled: true,
      maxPasswordLength: 128,
      minPasswordLength: 12,
      requireEmailVerification: true,
      revokeSessionsOnPasswordReset: true,
    });
    expect(options.rateLimit).toMatchObject({
      enabled: true,
      fields: { lastRequest: "last_request" },
      modelName: "AuthRateLimit",
      storage: "database",
    });
    expect(options.session).toMatchObject({
      cookieCache: { enabled: false },
      expiresIn: 604_800,
      updateAge: 86_400,
    });
    expect(options.telemetry.enabled).toBe(false);
  });
  it("uses a parent cookie only on the exact controlled production host", () => {
    const prod = optionsFor("https://app.teamcalendar.online");
    expect(prod.advanced.crossSubDomainCookies).toEqual({
      domain: "teamcalendar.online",
      enabled: true,
    });
    expect(prod.trustedOrigins).toEqual([
      "https://app.teamcalendar.online",
      "https://api.teamcalendar.online",
    ]);
    expect(prod.advanced.defaultCookieAttributes).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      secure: true,
    });
    const preview = optionsFor("https://candidate-123.vercel.app");
    expect(preview.advanced.crossSubDomainCookies).toEqual({ enabled: false });
    expect(preview.trustedOrigins).toEqual([
      "https://candidate-123.vercel.app",
    ]);
    expect(preview.advanced.useSecureCookies).toBe(true);
    const local = optionsFor();
    expect(local.advanced.useSecureCookies).toBe(false);
    expect(local.advanced.cookiePrefix).not.toBe(prod.advanced.cookiePrefix);
  });
  it("omits Infrastructure completely unless explicitly enabled with its key", () => {
    expect(optionsFor().plugins.some((plugin) => plugin.id === "dash")).toBe(
      false
    );
    const enabled = optionsFor(environment.BETTER_AUTH_URL, {
      BETTER_AUTH_API_KEY: "test-only-infra-key",
      BETTER_AUTH_INFRA_ENABLED: "true",
    });
    expect(enabled.plugins.some((plugin) => plugin.id === "dash")).toBe(true);
    expect(enabled.plugins.at(-1)?.id).toBe("next-cookies");
  });
  it("passes supplied verification and reset URLs to the repository mailer", async () => {
    const options = optionsFor();
    const data = {
      url: "http://localhost:3000/api/auth/verify-email?token=exact%2Bvalue",
      user: { email: "person@example.test" },
    };
    await options.emailVerification.sendVerificationEmail(data);
    expect(sendAuthEmail).toHaveBeenLastCalledWith(
      expect.objectContaining({ actionUrl: data.url, to: data.user.email })
    );
    await options.emailAndPassword.sendResetPassword(data);
    expect(sendAuthEmail).toHaveBeenLastCalledWith(
      expect.objectContaining({ actionUrl: data.url, to: data.user.email })
    );
    sendAuthEmail.mockRejectedValue(new Error("mail unavailable"));
    await expect(
      options.emailVerification.sendVerificationEmail(data)
    ).rejects.toThrow("mail unavailable");
  });
  it("blocks credential export and uncoordinated lifecycle writes", () => {
    expect(disabledAuthPaths).toEqual(
      expect.arrayContaining([
        "/get-access-token",
        "/account-info",
        "/list-sessions",
        "/delete-user",
      ])
    );
    expect(optionsFor().emailAndPassword.disableSignUp).toBe(false);
  });
});
