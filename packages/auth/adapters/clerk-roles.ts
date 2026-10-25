import { type AuthRole, isAuthRole } from "../permissions";

export const fromClerkRole = (role: unknown): AuthRole | null => {
  if (typeof role !== "string" || !role.startsWith("org:")) {
    return null;
  }
  const name = role.slice(4);
  return isAuthRole(name) ? name : null;
};

export const toClerkRole = (role: AuthRole): string => `org:${role}`;
