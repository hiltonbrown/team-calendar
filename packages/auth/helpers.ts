import "server-only";

import { appError, type Result } from "@repo/core";
import { readLocalAuthContext } from "./adapters/better-auth";
import { readRemoteAuthContext } from "./adapters/remote-context";
import {
  type AuthRole,
  isAuthRole,
  type PermissionRequest,
} from "./permissions";
import { authContextMode } from "./selection";
import type { AuthSession, AuthUser } from "./types";

export type { AuthSession, AuthUser } from "./types";

function authContext(permissions?: PermissionRequest) {
  return authContextMode() === "remote"
    ? readRemoteAuthContext(permissions)
    : readLocalAuthContext(permissions);
}
export async function getSession(): Promise<AuthSession | null> {
  return (await authContext())?.session ?? null;
}
export async function getCurrentUser(): Promise<AuthUser | null> {
  return (await authContext())?.user ?? null;
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
  return (await authContext(request))?.allowed === true;
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
