"use client";

import {
  magicLinkClient,
  organizationClient,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { accessControl, organizationRoles } from "../better-auth-permissions";
import { organizationSchema } from "../better-auth-schema";
import { isAuthRole } from "../permissions";
import { safeAuthReturnTo } from "../redirects";
import type { AuthSession, AuthUser } from "../types";

const client = createAuthClient({
  plugins: [
    organizationClient({
      ac: accessControl,
      roles: organizationRoles,
      schema: {
        organization: {
          additionalFields: organizationSchema.organization.additionalFields,
        },
      },
      teams: { enabled: false },
    }),
    magicLinkClient(),
  ],
});

export interface AuthClientError {
  code?: string;
  message: string;
}
export interface AuthClientResult<T> {
  data: T | null;
  error: AuthClientError | null;
}
export interface AccountSummary {
  countryCode: string | null;
  id: string;
  image: string | null;
  name: string;
  provisioningStatus: string | null;
  slug: string;
}
export interface AuthActionData {
  redirect?: boolean;
  status?: boolean;
  url?: string;
  user?: AuthUser;
}
export type AuthActionResult = AuthClientResult<AuthActionData>;
export type AuthSocialProvider = "google" | "microsoft" | "xero-auth";

const record = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));
const clientError = (error: unknown): AuthClientError | null => {
  if (!error) {
    return null;
  }
  return {
    ...(record(error) && typeof error.code === "string"
      ? { code: error.code }
      : {}),
    message:
      record(error) && typeof error.message === "string"
        ? error.message
        : "The request could not be completed. Try again.",
  };
};
function projectUser(value: unknown): AuthUser | null {
  if (!record(value) || typeof value.id !== "string") {
    return null;
  }
  return {
    email: typeof value.email === "string" ? value.email : null,
    emailVerified: value.emailVerified === true,
    id: value.id,
    image: typeof value.image === "string" ? value.image : null,
    name: typeof value.name === "string" ? value.name : null,
  };
}
function projectAccount(value: unknown): AccountSummary | null {
  if (
    !record(value) ||
    typeof value.id !== "string" ||
    typeof value.name !== "string" ||
    typeof value.slug !== "string"
  ) {
    return null;
  }
  return {
    countryCode:
      typeof value.countryCode === "string" ? value.countryCode : null,
    id: value.id,
    image: typeof value.logo === "string" ? value.logo : null,
    name: value.name,
    provisioningStatus:
      typeof value.provisioningStatus === "string"
        ? value.provisioningStatus
        : null,
    slug: value.slug,
  };
}
function projectAction(value: {
  data: unknown;
  error: unknown;
}): AuthActionResult {
  const error = clientError(value.error);
  if (error || !record(value.data)) {
    return { data: null, error };
  }
  const user = projectUser(value.data.user);
  return {
    data: {
      ...(typeof value.data.redirect === "boolean"
        ? { redirect: value.data.redirect }
        : {}),
      ...(typeof value.data.status === "boolean"
        ? { status: value.data.status }
        : {}),
      ...(typeof value.data.url === "string" ? { url: value.data.url } : {}),
      ...(user ? { user } : {}),
    },
    error: null,
  };
}
const networkError = (): AuthClientError => ({
  code: "NETWORK_ERROR",
  message: "Could not connect. Check your connection and try again.",
});
async function action(
  run: () => Promise<{ data: unknown; error: unknown }>
): Promise<AuthActionResult> {
  try {
    return projectAction(await run());
  } catch {
    return { data: null, error: networkError() };
  }
}

export function useSession(): {
  error: AuthClientError | null;
  isLoaded: boolean;
  session: AuthSession | null;
  user: AuthUser | null;
} {
  const source = client.useSession();
  const member = client.useActiveMember();
  const user = projectUser(source.data?.user);
  const activeId = source.data?.session.activeOrganizationId;
  const needsMember = Boolean(user?.emailVerified && activeId);
  const isLoaded = !(source.isPending || (needsMember && member.isPending));
  const membership = member.data;
  const membershipRole = membership?.role;
  const validMember = Boolean(
    needsMember &&
      membership &&
      membership.organizationId === activeId &&
      membership.userId === user?.id &&
      isAuthRole(membershipRole)
  );
  return {
    error: clientError(source.error ?? (needsMember ? member.error : null)),
    isLoaded,
    session:
      isLoaded && source.data && user
        ? {
            accountId: validMember ? (activeId ?? null) : null,
            role:
              validMember && isAuthRole(membershipRole) ? membershipRole : null,
            sessionId: source.data.session.id,
            userId: user.id,
          }
        : null,
    user: isLoaded ? user : null,
  };
}

export function useActiveOrganization() {
  const source = client.useActiveOrganization();
  return {
    error: clientError(source.error),
    isLoaded: !source.isPending,
    organization: projectAccount(source.data),
    refetch: () => source.refetch(),
  };
}
export function useListAccounts() {
  const source = client.useListOrganizations();
  return {
    accounts: (source.data ?? []).flatMap((value) => {
      const account = projectAccount(value);
      return account ? [account] : [];
    }),
    error: clientError(source.error),
    isLoaded: !source.isPending,
    refetch: () => source.refetch(),
  };
}

async function prepareSignupContext(
  invitationId?: string
): Promise<AuthClientError | null> {
  try {
    const response = await fetch("/api/auth/bootstrap-context", {
      body: JSON.stringify({
        countryCode: "AU",
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        ...(invitationId ? { invitationId } : {}),
      }),
      cache: "no-store",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      method: "POST",
      redirect: "error",
    });
    return response.ok
      ? null
      : {
          code: "SIGNUP_CONTEXT_FAILED",
          message:
            "Could not prepare your account. Refresh the page and try again.",
        };
  } catch {
    return networkError();
  }
}

export const signInEmail = (input: {
  callbackURL?: string;
  email: string;
  password: string;
}): Promise<AuthActionResult> =>
  action(() =>
    client.signIn.email({
      ...input,
      callbackURL: safeAuthReturnTo(input.callbackURL, "/select-account"),
    })
  );
export async function signUpEmail({
  invitationId,
  ...input
}: {
  callbackURL?: string;
  email: string;
  invitationId?: string;
  name: string;
  password: string;
}): Promise<AuthActionResult> {
  const error = await prepareSignupContext(invitationId);
  return error
    ? { data: null, error }
    : action(() =>
        client.signUp.email({
          ...input,
          callbackURL: safeAuthReturnTo(input.callbackURL, "/select-account"),
        })
      );
}
export const sendVerificationEmail = (input: {
  callbackURL?: string;
  email: string;
}): Promise<AuthActionResult> =>
  action(() =>
    client.sendVerificationEmail({
      ...input,
      callbackURL: safeAuthReturnTo(input.callbackURL, "/select-account"),
    })
  );
export const requestPasswordReset = (input: {
  email: string;
  redirectTo?: string;
}): Promise<AuthActionResult> =>
  action(() =>
    client.requestPasswordReset({
      ...input,
      redirectTo: safeAuthReturnTo(input.redirectTo, "/reset-password"),
    })
  );
export const resetPassword = (input: {
  newPassword: string;
  token: string;
}): Promise<AuthActionResult> => action(() => client.resetPassword(input));
export async function signInMagicLink({
  invitationId,
  ...input
}: {
  callbackURL?: string;
  email: string;
  invitationId?: string;
}): Promise<AuthActionResult> {
  const error = await prepareSignupContext(invitationId);
  return error
    ? { data: null, error }
    : action(() =>
        client.signIn.magicLink({
          ...input,
          callbackURL: safeAuthReturnTo(input.callbackURL, "/select-account"),
        })
      );
}
export async function signInSocial({
  invitationId,
  ...input
}: {
  callbackURL?: string;
  errorCallbackURL?: string;
  invitationId?: string;
  provider: AuthSocialProvider;
}): Promise<AuthActionResult> {
  const error = await prepareSignupContext(invitationId);
  return error
    ? { data: null, error }
    : action(() =>
        client.signIn.social({
          ...input,
          callbackURL: safeAuthReturnTo(input.callbackURL, "/select-account"),
          errorCallbackURL: safeAuthReturnTo(
            input.errorCallbackURL,
            "/sign-in"
          ),
        })
      );
}
export const signOut = (): Promise<AuthActionResult> =>
  action(() => client.signOut());
export async function listAccounts(): Promise<
  AuthClientResult<AccountSummary[]>
> {
  try {
    const result = await client.organization.list();
    const error = clientError(result.error);
    return {
      data: error
        ? null
        : (result.data ?? []).flatMap((value) => {
            const account = projectAccount(value);
            return account ? [account] : [];
          }),
      error,
    };
  } catch {
    return { data: null, error: networkError() };
  }
}
export async function setActiveAccount(
  accountId: string
): Promise<AuthClientResult<AccountSummary>> {
  try {
    const result = await client.organization.setActive({
      organizationId: accountId,
    });
    const error = clientError(result.error);
    if (error) {
      return { data: null, error };
    }
    const account = projectAccount(result.data);
    return account?.id === accountId
      ? { data: account, error: null }
      : {
          data: null,
          error: {
            code: "ACCOUNT_SWITCH_FAILED",
            message:
              "Could not confirm the selected account. Refresh the list and try again.",
          },
        };
  } catch {
    return { data: null, error: networkError() };
  }
}
