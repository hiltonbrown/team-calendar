"use server";
import { requireRole } from "@repo/auth/helpers";
import { auth, currentUser } from "@repo/auth/server";
import type { Result } from "@repo/core";
import { tenantDatabase, tenantTransaction } from "@repo/database";
import { keys as coreKeys } from "@repo/next-config/keys";
import {
  disconnectXeroOAuthConnection,
  removeXeroCompany,
  type XeroDisconnectResult,
} from "@repo/xero";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { getActiveOrgContext } from "@/lib/server/get-active-org-context";

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
  redirectUrl.searchParams.set("clerkOrgId", context.value.clerkOrgId);
  if (context.value.organisationId) {
    redirectUrl.searchParams.set(
      "organisationId",
      context.value.organisationId
    );
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
  if (!(await canManageXero())) {
    return notAuthorised();
  }
  const parsed = DisconnectSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error.issues[0]?.message);
  }
  const context = await resolveAdminContext(parsed.data.organisationId);
  if (!context.ok) {
    return context;
  }
  const organisation = await tenantDatabase(
    context.value.clerkOrgId
  ).organisation.findFirst({
    select: { name: true },
    where: {
      clerk_org_id: context.value.clerkOrgId,
      id: context.value.organisationId,
    },
  });
  if (!organisation || organisation.name !== parsed.data.confirmationText) {
    return validationError("Type the organisation name to confirm disconnect.");
  }
  const connection = await tenantDatabase(
    context.value.clerkOrgId
  ).xeroConnection.findFirst({
    select: { id: true },
    where: {
      clerk_org_id: context.value.clerkOrgId,
      id: parsed.data.connectionId,
      organisation_id: context.value.organisationId,
    },
  });
  if (!connection) {
    return validationError(
      "Xero connection was not found in this organisation."
    );
  }
  return await (async () => {
    const result = await disconnectXeroOAuthConnection({
      clerkOrgId: context.value.clerkOrgId,
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
  const context = await resolveAdminContext(parsed.data.organisationId);
  if (!context.ok) {
    return context;
  }
  return await (async () => {
    const updated = await tenantTransaction(
      context.value.clerkOrgId,
      async (tx) => {
        const result = await tx.xeroConnection.updateMany({
          data: { sync_paused_at: paused ? new Date() : null },
          where: {
            clerk_org_id: context.value.clerkOrgId,
            id: parsed.data.connectionId,
            organisation_id: context.value.organisationId,
          },
        });
        if (result.count === 0) {
          return false;
        }
        await tx.auditEvent.create({
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
        return true;
      }
    );
    if (!updated) {
      return validationError("Xero tenant was not found in this organisation.");
    }
    revalidate();
    return { ok: true, value: { paused: true } };
  })();
}
async function canManageXero(): Promise<boolean> {
  const [admin, owner] = await Promise.all([
    requireRole("org:admin"),
    requireRole("org:owner"),
  ]);
  return admin || owner;
}
async function resolveAccountContext(): Promise<
  ActionResult<{
    clerkOrgId: string;
    actingUserId: string;
    organisationId: null;
  }>
> {
  const [{ orgId, orgRole }, user] = await Promise.all([auth(), currentUser()]);
  if (
    !(orgId && user) ||
    (orgRole !== "org:admin" && orgRole !== "org:owner")
  ) {
    return notAuthorised();
  }
  return {
    ok: true,
    value: { actingUserId: user.id, clerkOrgId: orgId, organisationId: null },
  };
}
export async function removeCompanyAction(input: {
  organisationId: string;
  connectionId: string;
  confirmationText: string;
}): Promise<ActionResult<{ removed: true }>> {
  if (!(await requireRole("org:owner"))) {
    return notAuthorised();
  }
  const parsed = DisconnectSchema.omit({ mode: true }).safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error.issues[0]?.message);
  }
  const context = await resolveAdminContext(parsed.data.organisationId, true);
  if (!context.ok) {
    return context;
  }
  const company = await tenantDatabase(
    context.value.clerkOrgId
  ).organisation.findFirst({
    select: { name: true },
    where: {
      archived_at: null,
      clerk_org_id: context.value.clerkOrgId,
      id: context.value.organisationId,
    },
  });
  if (!company || company.name !== parsed.data.confirmationText) {
    return validationError("Type the company name to confirm removal.");
  }
  const result = await removeXeroCompany({
    clerkOrgId: context.value.clerkOrgId,
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
async function resolveAdminContext(
  organisationId: string,
  ownerOnly = false
): Promise<
  ActionResult<{
    actingUserId: string;
    actorDisplay: string;
    clerkOrgId: string;
    ipAddress: null | string;
    organisationId: string;
    userAgent: null | string;
  }>
> {
  const [{ orgRole }, user, context, requestHeaders] = await Promise.all([
    auth(),
    currentUser(),
    getActiveOrgContext(organisationId),
    headers(),
  ]);
  if (
    !(
      (orgRole === "org:owner" || (!ownerOnly && orgRole === "org:admin")) &&
      user &&
      context.ok
    )
  ) {
    return notAuthorised();
  }
  return {
    ok: true,
    value: {
      actingUserId: user.id,
      actorDisplay:
        [user.firstName, user.lastName].filter(Boolean).join(" ") ||
        user.emailAddresses[0]?.emailAddress ||
        "Unknown user",
      clerkOrgId: context.value.clerkOrgId,
      ipAddress: requestHeaders.get("x-forwarded-for"),
      organisationId: context.value.organisationId,
      userAgent: requestHeaders.get("user-agent"),
    },
  };
}
function auditBase(input: {
  actingUserId: string;
  actorDisplay: string;
  clerkOrgId: string;
  ipAddress: null | string;
  organisationId: string;
  userAgent: null | string;
}) {
  return {
    actor_display: input.actorDisplay,
    actor_user_id: input.actingUserId,
    clerk_org_id: input.clerkOrgId,
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
