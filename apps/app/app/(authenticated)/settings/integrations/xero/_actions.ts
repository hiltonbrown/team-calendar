"use server";

import { auth, currentUser } from "@repo/auth/server";
import type { Result } from "@repo/core";
import { database } from "@repo/database";
import { keys as coreKeys } from "@repo/next-config/keys";
import {
  disconnectXeroOAuthConnection,
  refreshXeroOAuthConnection,
} from "@repo/xero";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { getActiveOrgContext } from "@/lib/server/get-active-org-context";

const ConnectSchema = z.object({
  organisationId: z.string().uuid(),
});

const ConnectionSchema = z.object({
  connectionId: z.string().uuid(),
  organisationId: z.string().uuid(),
});

const DisconnectSchema = ConnectionSchema.extend({
  confirmationText: z.string().trim().min(1),
  mode: z.enum(["destructive", "soft"]),
});

const TenantSchema = z.object({
  organisationId: z.string().uuid(),
  xeroTenantId: z.string().uuid(),
});

type ActionError =
  | { code: "not_authorised"; message: string }
  | { code: "unknown_error"; message: string }
  | { code: "validation_error"; message: string };

type ActionResult<T> = Result<T, ActionError>;

export async function connectXeroAction(input: {
  organisationId: string;
}): Promise<ActionResult<{ redirectUrl: string }>> {
  const parsed = ConnectSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error.issues[0]?.message);
  }

  const context = await resolveAdminContext(parsed.data.organisationId);
  if (!context.ok) {
    return context;
  }

  const env = coreKeys();
  const baseUrl = env.NEXT_PUBLIC_API_URL ?? env.NEXT_PUBLIC_APP_URL;
  const redirectUrl = new URL("/api/xero/oauth/start", baseUrl);
  redirectUrl.searchParams.set("clerkOrgId", context.value.clerkOrgId);
  redirectUrl.searchParams.set("organisationId", context.value.organisationId);
  redirectUrl.searchParams.set("returnTo", "/settings/integrations/xero");
  redirectUrl.searchParams.set("userId", context.value.actingUserId);

  return { ok: true, value: { redirectUrl: redirectUrl.toString() } };
}

export async function refreshXeroConnectionAction(input: {
  connectionId: string;
  organisationId: string;
}): Promise<ActionResult<{ refreshed: true }>> {
  const parsed = ConnectionSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error.issues[0]?.message);
  }
  const context = await resolveAdminContext(parsed.data.organisationId);
  if (!context.ok) {
    return context;
  }

  const result = await refreshXeroOAuthConnection({
    clerkOrgId: context.value.clerkOrgId,
    connectionId: parsed.data.connectionId,
    organisationId: context.value.organisationId,
  });
  if (!result.ok) {
    return unknownError(result.error.message);
  }

  await database.auditEvent.create({
    data: {
      ...auditBase(context.value),
      action: "xero.connection_refreshed",
      entity_id: parsed.data.connectionId,
      entity_type: "xero_connection",
      metadata: { refreshedAt: result.value.refreshedAt.toISOString() },
      resource_id: parsed.data.connectionId,
      resource_type: "xero_connection",
    },
  });

  revalidate();
  return { ok: true, value: { refreshed: true } };
}

export async function disconnectXeroAction(input: {
  confirmationText: string;
  connectionId: string;
  mode: "destructive" | "soft";
  organisationId: string;
}): Promise<ActionResult<{ disconnected: true }>> {
  const parsed = DisconnectSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error.issues[0]?.message);
  }
  const context = await resolveAdminContext(parsed.data.organisationId);
  if (!context.ok) {
    return context;
  }

  const organisation = await database.organisation.findFirst({
    where: {
      clerk_org_id: context.value.clerkOrgId,
      id: context.value.organisationId,
    },
    select: { name: true },
  });
  if (!organisation || organisation.name !== parsed.data.confirmationText) {
    return validationError("Type the organisation name to confirm disconnect.");
  }

  const result = await disconnectXeroOAuthConnection({
    clerkOrgId: context.value.clerkOrgId,
    connectionId: parsed.data.connectionId,
    destructive: parsed.data.mode === "destructive",
    organisationId: context.value.organisationId,
  });
  if (!result.ok) {
    return unknownError(result.error.message);
  }

  await database.auditEvent.create({
    data: {
      ...auditBase(context.value),
      action:
        parsed.data.mode === "destructive"
          ? "xero.connection_disconnected_destructive"
          : "xero.connection_disconnected_soft",
      entity_id: parsed.data.connectionId,
      entity_type: "xero_connection",
      metadata: {
        mode: parsed.data.mode,
        remoteRevoked: result.value.remoteRevoked,
      },
      resource_id: parsed.data.connectionId,
      resource_type: "xero_connection",
    },
  });

  revalidate();
  return { ok: true, value: { disconnected: true } };
}

export async function pauseTenantSyncAction(input: {
  organisationId: string;
  xeroTenantId: string;
}): Promise<ActionResult<{ paused: true }>> {
  return await updateTenantPauseState(input, true);
}

export async function resumeTenantSyncAction(input: {
  organisationId: string;
  xeroTenantId: string;
}): Promise<ActionResult<{ resumed: true }>> {
  const result = await updateTenantPauseState(input, false);
  if (!result.ok) {
    return result;
  }
  return { ok: true, value: { resumed: true } };
}

async function updateTenantPauseState(
  input: { organisationId: string; xeroTenantId: string },
  paused: boolean
): Promise<ActionResult<{ paused: true }>> {
  const parsed = TenantSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error.issues[0]?.message);
  }
  const context = await resolveAdminContext(parsed.data.organisationId);
  if (!context.ok) {
    return context;
  }

  await database.xeroTenant.updateMany({
    where: {
      clerk_org_id: context.value.clerkOrgId,
      id: parsed.data.xeroTenantId,
      organisation_id: context.value.organisationId,
    },
    data: {
      sync_paused_at: paused ? new Date() : null,
    },
  });

  await database.auditEvent.create({
    data: {
      ...auditBase(context.value),
      action: paused ? "xero.tenant_sync_paused" : "xero.tenant_sync_resumed",
      entity_id: parsed.data.xeroTenantId,
      entity_type: "xero_tenant",
      metadata: {},
      resource_id: parsed.data.xeroTenantId,
      resource_type: "xero_tenant",
    },
  });

  revalidate();
  return { ok: true, value: { paused: true } };
}

async function resolveAdminContext(organisationId: string): Promise<
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
      (orgRole === "org:admin" || orgRole === "org:owner") &&
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
    ok: false,
    error: {
      code: "not_authorised",
      message: "Only admins and owners can manage Xero settings.",
    },
  };
}

function unknownError(message: string): ActionResult<never> {
  return {
    ok: false,
    error: {
      code: "unknown_error",
      message,
    },
  };
}

function validationError(message?: string): ActionResult<never> {
  return {
    ok: false,
    error: {
      code: "validation_error",
      message: message ?? "Invalid Xero settings request.",
    },
  };
}
