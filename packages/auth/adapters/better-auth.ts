import "server-only";

import { isAPIError } from "better-auth/api";
import { headers } from "next/headers";
import { type AuthContext, authContextSchema } from "../context-contract";
import {
  hasPermission,
  isAuthRole,
  type PermissionRequest,
} from "../permissions";
import { ensureUserAccountsReady, getBetterAuth } from "./better-auth-server";

const expectedAccountDenials = new Set([
  "MEMBER_NOT_FOUND",
  "ORGANIZATION_NOT_FOUND",
  "USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION",
  "NO_ACTIVE_ORGANIZATION",
]);

const isAccountDenial = (error: unknown) =>
  isAPIError(error) && expectedAccountDenials.has(error.body?.code ?? "");

export async function readBetterAuthContext(
  requestHeaders: Headers,
  permissions?: PermissionRequest
): Promise<{ context: AuthContext | null; responseHeaders: Headers }> {
  const auth = getBetterAuth();
  const { response: source, headers: responseHeaders } =
    await auth.api.getSession({
      headers: requestHeaders,
      query: { disableCookieCache: true },
      returnHeaders: true,
    });
  if (!source || source.session.expiresAt.getTime() <= Date.now()) {
    return { context: null, responseHeaders };
  }

  await ensureUserAccountsReady(source.user.id);
  const { accountId, role } = await readActiveAccount(
    auth,
    requestHeaders,
    source
  );
  const allowed = permissions
    ? await checkPermission(
        auth,
        requestHeaders,
        { accountId, role },
        permissions
      )
    : undefined;
  const context = authContextSchema.parse({
    ...(allowed === undefined ? {} : { allowed }),
    expiresAt: source.session.expiresAt.toISOString(),
    session: {
      accountId,
      role,
      sessionId: source.session.id,
      userId: source.user.id,
    },
    user: {
      email: source.user.email,
      emailVerified: source.user.emailVerified,
      id: source.user.id,
      image: source.user.image ?? null,
      name: source.user.name ?? null,
    },
  });
  return { context, responseHeaders };
}

type ActiveAccount = Pick<AuthContext["session"], "accountId" | "role">;

async function readActiveAccount(
  auth: ReturnType<typeof getBetterAuth>,
  requestHeaders: Headers,
  source: {
    user: { id: string; emailVerified: boolean };
    session: { activeOrganizationId?: string | null };
  }
): Promise<ActiveAccount> {
  const denied: ActiveAccount = { accountId: null, role: null };
  if (!(source.user.emailVerified && source.session.activeOrganizationId)) {
    return denied;
  }
  try {
    const member = await auth.api.getActiveMember({
      headers: requestHeaders,
    });
    const organization = await auth.api.getOrganization({
      headers: requestHeaders,
      query: { organizationId: source.session.activeOrganizationId },
    });
    if (
      organization?.id === source.session.activeOrganizationId &&
      organization.provisioningStatus === "ready" &&
      member.organizationId === organization.id &&
      member.userId === source.user.id &&
      isAuthRole(member.role)
    ) {
      return { accountId: organization.id, role: member.role };
    }
  } catch (error) {
    if (!isAccountDenial(error)) {
      throw error;
    }
  }
  return denied;
}

async function checkPermission(
  auth: ReturnType<typeof getBetterAuth>,
  requestHeaders: Headers,
  { accountId, role }: ActiveAccount,
  permissions: PermissionRequest
): Promise<boolean> {
  if (!(accountId && hasPermission(role, permissions))) {
    return false;
  }
  // The native API needs mutable arrays; copy the validated statement's values.
  const nativePermissions = Object.fromEntries(
    Object.entries(permissions).map(([resource, actions]) => [
      resource,
      [...actions],
    ])
  ) as {
    [Resource in keyof PermissionRequest]?: NonNullable<
      PermissionRequest[Resource]
    >[number][];
  };
  try {
    const result = await auth.api.hasPermission({
      body: { organizationId: accountId, permissions: nativePermissions },
      headers: requestHeaders,
    });
    return result.success === true;
  } catch (error) {
    if (!isAccountDenial(error)) {
      throw error;
    }
  }
  return false;
}

export async function readLocalAuthContext(permissions?: PermissionRequest) {
  return (await readBetterAuthContext(await headers(), permissions)).context;
}
