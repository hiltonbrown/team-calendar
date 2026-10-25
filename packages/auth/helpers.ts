import "server-only";

import { appError, type Result } from "@repo/core";
import { readCurrentUser, readSession } from "./adapters/clerk";
import {
  type AuthRole,
  isAuthRole,
  type PermissionRequest,
  hasPermission as roleHasPermission,
} from "./permissions";
import { authContextMode, authProvider } from "./selection";
import type { AuthSession, AuthUser } from "./types";

export type { AuthSession, AuthUser } from "./types";

async function betterAuthContext(permissions?: PermissionRequest) {
  if (authContextMode() === "remote") {
    const { readRemoteAuthContext } = await import(
      "./adapters/remote-context.js"
    );
    return readRemoteAuthContext(permissions);
  }
  const { readLocalAuthContext } = await import("./adapters/better-auth.js");
  return readLocalAuthContext(permissions);
}

export async function getSession(): Promise<AuthSession | null> {
  return authProvider() === "clerk"
    ? readSession()
    : ((await betterAuthContext())?.session ?? null);
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  return authProvider() === "clerk"
    ? readCurrentUser()
    : ((await betterAuthContext())?.user ?? null);
}

export async function requireAccount(): Promise<string> {
  const accountId = await getAccountId();
  if (!accountId) {
    throw new Error("Not authenticated or no account selected");
  }
  return accountId;
}

export async function requireAccountResult(): Promise<Result<string>> {
  const accountId = await getAccountId();
  return accountId
    ? { ok: true, value: accountId }
    : {
        error: appError(
          "unauthorised",
          "Not authenticated or no account selected"
        ),
        ok: false,
      };
}

export async function getAccountId(): Promise<string | null> {
  return (await getSession())?.accountId ?? null;
}

export async function requireRole(role: AuthRole): Promise<boolean> {
  const session = await getSession();
  return Boolean(
    session?.accountId && isAuthRole(role) && session.role === role
  );
}

export async function hasPermission(
  request: PermissionRequest
): Promise<boolean> {
  if (authProvider() === "better-auth") {
    return (await betterAuthContext(request))?.allowed === true;
  }
  const session = await getSession();
  return Boolean(
    session?.accountId && roleHasPermission(session.role, request)
  );
}

export async function hasRoleResult(role: AuthRole): Promise<Result<boolean>> {
  const session = await getSession();
  if (!session?.accountId) {
    return {
      error: appError(
        "unauthorised",
        "Not authenticated or no account selected"
      ),
      ok: false,
    };
  }
  return { ok: true, value: isAuthRole(role) && session.role === role };
}
