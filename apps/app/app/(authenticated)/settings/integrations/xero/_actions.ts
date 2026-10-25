"use server";

import { hasPermission } from "@repo/auth/helpers";
import { hasPermission as can } from "@repo/auth/permissions";
import { getCurrentUser, getSession } from "@repo/auth/server";
import type { Result } from "@repo/core";
import {
  afterTenantCommit,
  withTenantDb,
  withTenantResult,
} from "@repo/database";
import { assertNoTenantTransaction } from "@repo/database/tenant-guard";
import { keys as coreKeys } from "@repo/next-config/keys";
import {
  disconnectXeroOAuthConnection,
  removeXeroCompany,
  type XeroDisconnectResult,
} from "@repo/xero";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";

const ConnectSchema = z.object({
  organisationId: z.string().uuid().optional(),
  // Only known in-app destinations; the OAuth service also rejects
  // non-local paths.
  returnTo: z
    .enum(["/settings/integrations/xero", "/onboarding"])
    .default("/settings/integrations/xero"),
});
const ConnectionSchema = z.object({
  connectionId: z.string().uuid(),
  organisationId: z.string().uuid(),
});
const DisconnectSchema = ConnectionSchema.extend({
  confirmationText: z.string().trim().min(1),
  mode: z.literal("soft", {
    error:
      "Use the owner-only Remove company action to archive and release a company.",
  }),
});
const TenantSchema = z.object({
  connectionId: z.string().uuid(),
  organisationId: z.string().uuid(),
});
type ActionError =
  | {
      code: "not_authorised";
      message: string;
    }
  | {
      code: "unknown_error";
      message: string;
    }
  | {
      code: "validation_error";
      message: string;
    };
type ActionResult<T> = Result<T, ActionError>;
export async function connectXeroAction(input: {
  organisationId?: string;
  returnTo?: "/onboarding" | "/settings/integrations/xero";
}): Promise<
  ActionResult<{
    redirectUrl: string;
  }>
> {
  assertNoTenantTransaction("connectXeroAction");
  if (!(await canManageXero())) {
    return notAuthorised();
  }
  const parsed = ConnectSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error.issues[0]?.message);
  }
  const context = parsed.data.organisationId
    ? await resolveAdminContext(parsed.data.organisationId)
    : await resolveAccountContext();
  if (!context.ok) {
    return context;
  }
  const env = coreKeys();
  const baseUrl = env.NEXT_PUBLIC_API_URL ?? env.NEXT_PUBLIC_APP_URL;
  const redirectUrl = new URL("/api/xero/oauth/start", baseUrl);
  redirectUrl.searchParams.set("accountId", context.value.accountId);
  if (parsed.data.organisationId) {
    redirectUrl.searchParams.set("organisationId", parsed.data.organisationId);
  }
  redirectUrl.searchParams.set("returnTo", parsed.data.returnTo);
  redirectUrl.searchParams.set("userId", context.value.actingUserId);
  return { ok: true, value: { redirectUrl: redirectUrl.toString() } };
}
export async function disconnectXeroAction(input: {
  confirmationText: string;
  connectionId: string;
  mode: "destructive" | "soft";
  organisationId: string;
}): Promise<
  ActionResult<{
    disconnected: true;
    result: XeroDisconnectResult;
  }>
> {
  assertNoTenantTransaction("disconnectXeroAction");
  if (!(await canManageXero())) {
    return notAuthorised();
  }
  const parsed = DisconnectSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error.issues[0]?.message);
  }
  const context = await resolveAdminIdentity(parsed.data.organisationId);
  if (!context.ok) {
    return context;
  }
  const prepared = await withTenantResult(
    context.value.accountId,
    async (client): Promise<ActionResult<void>> => {
      const organisation = await client.organisation.findFirst({
        select: { name: true },
        where: {
          account_id: context.value.accountId,
          id: context.value.organisationId,
        },
      });
      if (!organisation || organisation.name !== parsed.data.confirmationText) {
        return validationError(
          "Type the organisation name to confirm disconnect."
        );
      }
      const connection = await client.xeroConnection.findFirst({
        select: { id: true },
        where: {
          account_id: context.value.accountId,
          id: parsed.data.connectionId,
          organisation_id: context.value.organisationId,
        },
      });
      if (!connection) {
        return validationError(
          "Xero connection was not found in this organisation."
        );
      }
      return { ok: true, value: undefined };
    }
  );
  if (!prepared.ok) {
    return prepared;
  }
  return await (async () => {
    const result = await disconnectXeroOAuthConnection({
      accountId: context.value.accountId,
      connectionId: parsed.data.connectionId,
      destructive: false,
      organisationId: context.value.organisationId,
      performedByUserId: context.value.actingUserId,
    });
    if (!result.ok) {
      return unknownError(result.error.message);
    }
    revalidate();
    return {
      ok: true,
      value: {
        disconnected: true,
        result: result.value,
      },
    };
  })();
}
export async function pauseTenantSyncAction(input: {
  organisationId: string;
  connectionId: string;
}): Promise<
  ActionResult<{
    paused: true;
  }>
> {
  assertNoTenantTransaction("pauseTenantSyncAction");
  return await updateTenantPauseState(input, true);
}
export async function resumeTenantSyncAction(input: {
  organisationId: string;
  connectionId: string;
}): Promise<
  ActionResult<{
    resumed: true;
  }>
> {
  assertNoTenantTransaction("resumeTenantSyncAction");
  const result = await updateTenantPauseState(input, false);
  if (!result.ok) {
    return result;
  }
  return { ok: true, value: { resumed: true } };
}
async function updateTenantPauseState(
  input: {
    organisationId: string;
    connectionId: string;
  },
  paused: boolean
): Promise<
  ActionResult<{
    paused: true;
  }>
> {
  if (!(await canManageXero())) {
    return notAuthorised();
  }
  const parsed = TenantSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error.issues[0]?.message);
  }
  const context = await resolveAdminIdentity(parsed.data.organisationId);
  if (!context.ok) {
    return context;
  }
  return withTenantResult(
    context.value.accountId,
    async (db): Promise<ActionResult<{ paused: true }>> => {
      const company = await db.organisation.findFirst({
        select: { id: true },
        where: {
          account_id: context.value.accountId,
          id: context.value.organisationId,
        },
      });
      if (!company) {
        return notAuthorised();
      }
      const updated = await db.xeroConnection.updateMany({
        data: { sync_paused_at: paused ? new Date() : null },
        where: {
          account_id: context.value.accountId,
          id: parsed.data.connectionId,
          organisation_id: context.value.organisationId,
        },
      });
      if (updated.count !== 1) {
        return validationError(
          "Xero tenant was not found in this organisation."
        );
      }
      await db.auditEvent.create({
        data: {
          ...auditBase(context.value),
          action: paused
            ? "xero.tenant_sync_paused"
            : "xero.tenant_sync_resumed",
          entity_id: parsed.data.connectionId,
          entity_type: "xero_tenant",
          metadata: {},
          resource_id: parsed.data.connectionId,
          resource_type: "xero_tenant",
        },
      });
      afterTenantCommit(db, () => {
        revalidate();

        return Promise.resolve();
      });
      return { ok: true, value: { paused: true } };
    }
  );
}

async function canManageXero(): Promise<boolean> {
  const [admin, owner] = await Promise.all([
    hasPermission({ xero: ["manage"] }),
    hasPermission({ xero: ["removeCompany"] }),
  ]);
  return admin || owner;
}
async function resolveAccountContext(): Promise<
  ActionResult<{
    accountId: string;
    actingUserId: string;
    organisationId: null;
  }>
> {
  const [{ accountId: sessionAccountId, role: sessionRole }, user] =
    await Promise.all([
      getSession().then(
        (currentSession) =>
          currentSession ?? {
            accountId: null,
            role: null,
            sessionId: null,
            userId: null,
          }
      ),
      getCurrentUser(),
    ]);
  if (!(sessionAccountId && user && can(sessionRole, { xero: ["manage"] }))) {
    return notAuthorised();
  }
  return {
    ok: true,
    value: {
      accountId: sessionAccountId,
      actingUserId: user.id,
      organisationId: null,
    },
  };
}
export async function removeCompanyAction(input: {
  organisationId: string;
  connectionId: string;
  confirmationText: string;
}): Promise<ActionResult<{ removed: true }>> {
  assertNoTenantTransaction("removeCompanyAction");
  if (!(await hasPermission({ xero: ["removeCompany"] }))) {
    return notAuthorised();
  }
  const parsed = DisconnectSchema.omit({ mode: true }).safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error.issues[0]?.message);
  }
  const context = await resolveAdminIdentity(parsed.data.organisationId, true);
  if (!context.ok) {
    return context;
  }
  const company = await withTenantDb(context.value.accountId, (db) =>
    db.organisation.findFirst({
      select: { name: true },
      where: {
        account_id: context.value.accountId,
        archived_at: null,
        id: context.value.organisationId,
      },
    })
  );
  if (!company || company.name !== parsed.data.confirmationText) {
    return validationError("Type the company name to confirm removal.");
  }
  const result = await removeXeroCompany({
    accountId: context.value.accountId,
    connectionId: parsed.data.connectionId,
    organisationId: context.value.organisationId,
    performedByUserId: context.value.actingUserId,
    role: "owner",
  });
  if (!result.ok) {
    return unknownError(
      "The company could not be removed. Its connection and ownership remain available to retry."
    );
  }
  revalidate();
  revalidatePath("/calendar");
  revalidatePath("/feeds");
  revalidatePath("/people");
  return { ok: true, value: { removed: true } };
}
async function resolveAdminIdentity(
  organisationId: string,
  ownerOnly = false
): Promise<
  ActionResult<{
    actingUserId: string;
    actorDisplay: string;
    accountId: string;
    ipAddress: null | string;
    organisationId: string;
    userAgent: null | string;
  }>
> {
  const [
    { accountId: sessionAccountId, role: sessionRole },
    user,
    requestHeaders,
  ] = await Promise.all([
    getSession().then(
      (currentSession) =>
        currentSession ?? {
          accountId: null,
          role: null,
          sessionId: null,
          userId: null,
        }
    ),
    getCurrentUser(),
    headers(),
  ]);
  if (
    !(
      (sessionRole === "owner" || (!ownerOnly && sessionRole === "admin")) &&
      user &&
      sessionAccountId
    )
  ) {
    return notAuthorised();
  }
  return {
    ok: true,
    value: {
      accountId: sessionAccountId,
      actingUserId: user.id,
      actorDisplay: user.name || user.email || "Unknown user",
      ipAddress: requestHeaders.get("x-forwarded-for"),
      organisationId,
      userAgent: requestHeaders.get("user-agent"),
    },
  };
}
async function resolveAdminContext(
  organisationId: string,
  ownerOnly = false
): ReturnType<typeof resolveAdminIdentity> {
  const identity = await resolveAdminIdentity(organisationId, ownerOnly);
  if (!identity.ok) {
    return identity;
  }
  const company = await withTenantDb(identity.value.accountId, (db) =>
    db.organisation.findFirst({
      select: { id: true },
      where: { account_id: identity.value.accountId, id: organisationId },
    })
  );
  return company ? identity : notAuthorised();
}

function auditBase(input: {
  actingUserId: string;
  actorDisplay: string;
  accountId: string;
  ipAddress: null | string;
  organisationId: string;
  userAgent: null | string;
}) {
  return {
    account_id: input.accountId,
    actor_display: input.actorDisplay,
    actor_user_id: input.actingUserId,
    ip_address: input.ipAddress,
    organisation_id: input.organisationId,
    user_agent: input.userAgent,
  };
}
function revalidate() {
  revalidatePath("/settings/integrations");
  revalidatePath("/settings/integrations/xero");
  revalidatePath("/sync");
  revalidatePath("/");
}
function notAuthorised(): ActionResult<never> {
  return {
    error: {
      code: "not_authorised",
      message: "Only admins and owners can manage Xero settings.",
    },
    ok: false,
  };
}
function unknownError(message: string): ActionResult<never> {
  return {
    error: {
      code: "unknown_error",
      message,
    },
    ok: false,
  };
}
function validationError(message?: string): ActionResult<never> {
  return {
    error: {
      code: "validation_error",
      message: message ?? "Invalid Xero settings request.",
    },
    ok: false,
  };
}
