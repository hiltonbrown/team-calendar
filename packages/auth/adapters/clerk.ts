import "server-only";

import { auth, currentUser } from "@clerk/nextjs/server";
import type { AuthSession, AuthUser } from "../types";
import { fromClerkRole } from "./clerk-roles";

export const readSession = async (): Promise<AuthSession | null> => {
  const source = await auth();
  if (!(source.isAuthenticated && source.userId)) {
    return null;
  }
  return {
    accountId: source.orgId ?? null,
    role: fromClerkRole(source.orgRole),
    sessionId: source.sessionId ?? null,
    userId: source.userId,
  };
};

export const readCurrentUser = async (): Promise<AuthUser | null> => {
  const user = await currentUser();
  if (!user) {
    return null;
  }
  return {
    email: user.primaryEmailAddress?.emailAddress ?? null,
    emailVerified:
      user.primaryEmailAddress?.verification?.status === "verified",
    id: user.id,
    image: user.imageUrl || null,
    name:
      user.fullName ||
      [user.firstName, user.lastName].filter(Boolean).join(" ") ||
      null,
  };
};

export const readSessionAuthorizationHeaders = async (): Promise<Record<
  string,
  string
> | null> => {
  const source = await auth();
  if (!source.isAuthenticated) {
    return null;
  }
  const token = await source.getToken();
  return token ? { Authorization: `Bearer ${token}` } : null;
};
