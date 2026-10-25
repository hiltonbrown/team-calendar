import { dash } from "@better-auth/infra";
import { sendAuthEmail } from "@repo/email";
import type { BetterAuthOptions } from "better-auth";
import {
  APIError,
  createAuthMiddleware,
  getSessionFromCtx,
} from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { genericOAuth, magicLink, organization } from "better-auth/plugins";
import { accessControl, organizationRoles } from "./better-auth-permissions";
import {
  coreSchemaOptions,
  organizationSchema,
  rateLimitSchemaOptions,
} from "./better-auth-schema";
import type { BetterAuthEnvironment } from "./keys";

// Lifecycle writes stay closed until admission, atomic bootstrap and retention
// are implemented and proved. Server sign-in can be rehearsed independently.
export const disabledAuthPaths = [
  "/get-access-token",
  "/refresh-token",
  "/account-info",
  "/list-sessions",
  "/revoke-session",
  "/delete-user",
  "/delete-user/callback",
  "/sign-up/email",
  "/organization/create",
  "/organization/delete",
  "/organization/update",
  "/organization/add-member",
  "/organization/remove-member",
  "/organization/update-member-role",
  "/organization/leave",
  "/organization/accept-invitation",
  "/organization/reject-invitation",
  "/organization/invite-member",
  "/organization/cancel-invitation",
];

export function createBetterAuthOptions(
  env: BetterAuthEnvironment,
  database: BetterAuthOptions["database"]
) {
  const { origin } = new URL(env.BETTER_AUTH_URL);
  const trustedOrigins = [origin];
  if (origin === "https://app.teamcalendar.online") {
    trustedOrigins.push("https://api.teamcalendar.online");
  } else if (origin === "http://localhost:3000") {
    trustedOrigins.push("http://localhost:3002");
  }
  const secure = origin.startsWith("https:");
  const production = origin === "https://app.teamcalendar.online";
  return {
    ...coreSchemaOptions,
    account: {
      ...coreSchemaOptions.account,
      accountLinking: {
        allowDifferentEmails: false,
        allowUnlinkingAll: false,
        disableImplicitLinking: true,
        enabled: true,
        trustedProviders: [],
      },
      encryptOAuthTokens: true,
      storeAccountCookie: false,
      storeStateStrategy: "database" as const,
    },
    advanced: {
      cookiePrefix: secure ? "team-calendar-auth" : "team-calendar-dev-auth",
      crossSubDomainCookies: production
        ? { domain: "teamcalendar.online", enabled: true }
        : { enabled: false },
      database: { generateId: "uuid" as const },
      defaultCookieAttributes: {
        httpOnly: true,
        path: "/",
        sameSite: "lax" as const,
        secure,
      },
      disableCSRFCheck: false,
      disableOriginCheck: false,
      // Only Vercel's overwritten header is trusted in deployed environments.
      ipAddress: {
        ipAddressHeaders: process.env.VERCEL ? ["x-vercel-forwarded-for"] : [],
      },
      useSecureCookies: secure,
    },
    appName: "Team Calendar",
    basePath: "/api/auth",
    baseURL: origin,
    database,
    databaseHooks: {
      user: {
        create: {
          before: () => {
            throw new APIError("FORBIDDEN", {
              message: "Account admission is not available yet",
            });
          },
        },
      },
    },
    disabledPaths: disabledAuthPaths,
    emailAndPassword: {
      disableSignUp: true,
      enabled: true,
      maxPasswordLength: 128,
      minPasswordLength: 12,
      requireEmailVerification: true,
      resetPasswordTokenExpiresIn: 3600,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({
        user,
        url,
      }: {
        user: { email: string };
        url: string;
      }) => {
        await sendAuthEmail({
          actionLabel: "Reset password",
          actionUrl: url,
          body: "Use this link to reset your password. It expires in one hour.",
          subject: "Reset your Team Calendar password",
          to: user.email,
        });
      },
    },
    emailVerification: {
      autoSignInAfterVerification: false,
      expiresIn: 3600,
      sendOnSignIn: true,
      sendOnSignUp: true,
      sendVerificationEmail: async ({
        user,
        url,
      }: {
        user: { email: string };
        url: string;
      }) => {
        await sendAuthEmail({
          actionLabel: "Verify email",
          actionUrl: url,
          body: "Verify your email address using this link. It expires in one hour.",
          subject: "Verify your Team Calendar email",
          to: user.email,
        });
      },
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (disabledAuthPaths.includes(ctx.path)) {
          throw new APIError("FORBIDDEN", {
            message: "This account operation is not available yet",
          });
        }
        if (ctx.path === "/link-social") {
          if (ctx.body?.idToken) {
            // The pinned provider-token relink branch returns before checking
            // incoming mailbox verification. Only the validated redirect flow
            // is admitted at this boundary.
            throw new APIError("FORBIDDEN", {
              code: "LINKING_REQUIRES_REDIRECT",
              message: "Use the provider redirect to link an account",
            });
          }
          const session = await getSessionFromCtx(ctx, {
            disableCookieCache: true,
          });
          if (
            !session?.user.emailVerified ||
            Date.now() - session.session.createdAt.getTime() > 86_400 * 1000
          ) {
            throw new APIError("FORBIDDEN", {
              message: "A fresh verified session is required",
            });
          }
        }
        if (ctx.path === "/change-password" && ctx.body) {
          ctx.body.revokeOtherSessions = true;
        }
      }),
    },
    plugins: [
      organization({
        ac: accessControl,
        allowUserToCreateOrganization: false,
        creatorRole: "owner",
        dynamicAccessControl: { enabled: false },
        roles: organizationRoles,
        schema: organizationSchema,
        sendInvitationEmail: async (data) => {
          await sendAuthEmail({
            actionLabel: "View invitation",
            actionUrl: new URL(
              `/accept-invitation/${encodeURIComponent(data.id)}`,
              origin
            ).href,
            body: `You have been invited to join ${data.organization.name}.`,
            subject: `Invitation to ${data.organization.name} on Team Calendar`,
            to: data.email,
          });
        },
        teams: { enabled: false },
      }),
      magicLink({
        disableSignUp: true,
        expiresIn: 300,
        sendMagicLink: async ({ email, url }) => {
          await sendAuthEmail({
            actionLabel: "Sign in",
            actionUrl: url,
            body: "Use this link to sign in. It expires in five minutes and can be used once.",
            subject: "Sign in to Team Calendar",
            to: email,
          });
        },
        storeToken: "hashed",
      }),
      genericOAuth({
        config: [
          {
            clientId: env.XERO_AUTH_CLIENT_ID,
            clientSecret: env.XERO_AUTH_CLIENT_SECRET,
            disableProviderLogout: true,
            disableSignUp: true,
            discoveryUrl:
              "https://identity.xero.com/.well-known/openid-configuration",
            pkce: true,
            providerId: "xero-auth",
            requireIdTokenVerification: true,
            scopes: ["openid", "profile", "email"],
            tokenEndpointAuth: { method: "client_secret_basic" },
          },
        ],
      }),
      ...(env.BETTER_AUTH_INFRA_ENABLED
        ? [
            dash({
              activityTracking: { enabled: false },
              apiKey: env.BETTER_AUTH_API_KEY,
              managedDirectorySync: { enabled: false },
            }),
          ]
        : []),
      nextCookies(),
    ],
    rateLimit: {
      ...rateLimitSchemaOptions,
      customRules: {
        "/magic-link/verify": { max: 5, window: 60 },
        "/request-password-reset": { max: 3, window: 60 },
        "/send-verification-email": { max: 3, window: 60 },
        "/sign-in/email": { max: 5, window: 60 },
        "/sign-in/magic-link": { max: 5, window: 60 },
      },
      enabled: true,
      max: 100,
      storage: "database" as const,
      window: 60,
    },
    secret: env.BETTER_AUTH_SECRET,
    session: {
      ...coreSchemaOptions.session,
      cookieCache: { enabled: false },
      expiresIn: 7 * 24 * 60 * 60,
      freshAge: 24 * 60 * 60,
      updateAge: 24 * 60 * 60,
    },
    socialProviders: {
      google: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        disableSignUp: true,
      },
      microsoft: {
        clientId: env.MICROSOFT_CLIENT_ID,
        clientSecret: env.MICROSOFT_CLIENT_SECRET,
        disableSignUp: true,
        tenantId: env.MICROSOFT_TENANT_ID,
      },
    },
    telemetry: { enabled: false },
    trustedOrigins,
    user: {
      ...coreSchemaOptions.user,
      validateUserInfo: async ({ user, source }, context) => {
        if (source.action !== "link-account") {
          return;
        }
        // Validate both identities again at callback, rather than trusting the
        // local mailbox/session state captured when linking began.
        const session = await getSessionFromCtx(context, {
          disableCookieCache: true,
        });
        if (
          !session?.user.emailVerified ||
          user.emailVerified !== true ||
          user.id !== session.user.id ||
          user.email?.toLowerCase() !== session.user.email.toLowerCase() ||
          Date.now() - session.session.createdAt.getTime() > 86_400_000
        ) {
          return { error: "verified_link_required" };
        }
      },
    },
  } satisfies BetterAuthOptions;
}
