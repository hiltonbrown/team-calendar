import { getCurrentAdapter } from "@better-auth/core/context";
import { dash } from "@better-auth/infra";
import { sendAuthEmail } from "@repo/email";
import type { BetterAuthOptions } from "better-auth";
import {
  APIError,
  addOAuthServerContext,
  createAuthMiddleware,
  getSessionFromCtx,
} from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { genericOAuth, magicLink, organization } from "better-auth/plugins";
import { withAccountProvisioning } from "./account-provisioning-adapter";
import { accessControl, organizationRoles } from "./better-auth-permissions";
import {
  coreSchemaOptions,
  organizationSchema,
  rateLimitSchemaOptions,
} from "./better-auth-schema";
import { bootstrapFromCookie, sealBootstrap } from "./bootstrap-proof";
import { sendAccountInvitationEmail } from "./invitation-email";
import type { BetterAuthEnvironment } from "./keys";
import { isControlledAccountMutation } from "./native-mutation-context";

// Unsafe lifecycle and credential-export routes stay closed. Organisation
// mutations are available only through checked server helpers, never HTTP.
export const disabledAuthPaths = [
  "/get-access-token",
  "/refresh-token",
  "/account-info",
  "/list-sessions",
  "/revoke-session",
  "/delete-user",
  "/delete-user/callback",
  "/organization/create",
  "/organization/delete",
  "/organization/add-member",
  "/organization/reject-invitation",
  "/organization/cancel-invitation",
];

function readAdmissionCookie(
  headers: Headers | undefined,
  origin: string,
  secret: string
) {
  try {
    return bootstrapFromCookie(headers ?? new Headers(), origin, secret);
  } catch (cause) {
    throw new APIError("FORBIDDEN", {
      cause,
      message: "Start account setup again",
    });
  }
}

function requireControlledAccountMutation(): Promise<void> {
  if (!isControlledAccountMutation()) {
    throw new APIError("FORBIDDEN", {
      message: "Use the checked Account operation",
    });
  }
  return Promise.resolve();
}

export function createBetterAuthOptions(
  env: BetterAuthEnvironment,
  database: BetterAuthOptions["database"],
  lifecycle: {
    afterUserCreated?: (userId: string) => Promise<void>;
    afterUserUpdated?: (userId: string) => Promise<void>;
  } = {}
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
    database:
      typeof database === "function"
        ? withAccountProvisioning(database, origin, env.BETTER_AUTH_SECRET)
        : database,
    databaseHooks: {
      session: {
        create: {
          before: async (session, context) => {
            if (!context?.context.adapter) {
              throw new APIError("FORBIDDEN", {
                message: "No Account is available for this user",
              });
            }
            const adapter = await getCurrentAdapter(context.context.adapter);
            const memberships = await adapter.findMany<{
              organizationId: string;
              role: string;
            }>({
              limit: 2,
              model: "member",
              where: [{ field: "userId", value: session.userId }],
            });
            if (memberships.length === 0) {
              throw new APIError("FORBIDDEN", {
                message: "No Account is available for this user",
              });
            }
            return {
              data: {
                ...session,
                activeOrganizationId:
                  memberships.length === 1
                    ? memberships[0].organizationId
                    : null,
              },
            };
          },
        },
      },
      user: {
        create: {
          after: async (user) => {
            await lifecycle.afterUserCreated?.(user.id);
          },
        },
        update: {
          after: async (user) => {
            await lifecycle.afterUserUpdated?.(user.id);
          },
        },
      },
    },
    disabledPaths: disabledAuthPaths,
    emailAndPassword: {
      disableSignUp: false,
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
        if (ctx.path === "/sign-up/email") {
          readAdmissionCookie(ctx.headers, origin, env.BETTER_AUTH_SECRET);
        }
        if (ctx.path === "/sign-in/social") {
          const proof = bootstrapFromCookie(
            ctx.headers ?? new Headers(),
            origin,
            env.BETTER_AUTH_SECRET
          );
          await addOAuthServerContext({ accountBootstrap: proof });
        }

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
        organizationHooks: {
          beforeAcceptInvitation: requireControlledAccountMutation,
          beforeCreateInvitation: requireControlledAccountMutation,
          beforeRemoveMember: requireControlledAccountMutation,
          beforeUpdateMemberRole: requireControlledAccountMutation,
          beforeUpdateOrganization: requireControlledAccountMutation,
        },
        roles: organizationRoles,
        schema: organizationSchema,
        sendInvitationEmail: (data) =>
          sendAccountInvitationEmail(
            {
              accountName: data.organization.name,
              email: data.email,
              id: data.id,
            },
            origin
          ),
        teams: { enabled: false },
      }),
      magicLink({
        disableSignUp: false,
        expiresIn: 300,
        sendMagicLink: async ({ email, url }, context) => {
          const proof = bootstrapFromCookie(
            context?.headers ?? new Headers(),
            origin,
            env.BETTER_AUTH_SECRET
          );
          const link = new URL(url);
          link.searchParams.set(
            "admission",
            sealBootstrap({ ...proof, email }, env.BETTER_AUTH_SECRET)
          );
          await sendAuthEmail({
            actionLabel: "Sign in",
            actionUrl: link.toString(),
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
            disableSignUp: false,
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
    socialProviders: {},
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
