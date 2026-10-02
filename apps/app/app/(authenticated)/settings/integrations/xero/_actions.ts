"use server";

import { auth, currentUser } from "@repo/auth/server";
import type { Result } from "@repo/core";
import { database } from "@repo/database";
import { keys as coreKeys } from "@repo/next-config/keys";
import {
  disconnectXeroOAuthConnection,
  refreshXeroOAuthConnection,
  type XeroDisconnectReceipt,
} from "@repo/xero";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { getActiveOrgContext } from "@/lib/server/get-active-org-context";
import {
  readXeroCampaignActionHeader,
  withAuthenticatedXeroCampaignAction,
} from "@/lib/server/xero-campaign-action";

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

  try {
    const campaign = await readXeroCampaignActionHeader();
    if (campaign) {
      redirectUrl.searchParams.set("campaign", JSON.stringify(campaign));
    }
  } catch {
    return {
      error: {
        code: "not_authorised",
        message: "Invalid verification authority.",
      },
      ok: false,
    };
  }

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

  return await withAuthenticatedXeroCampaignAction(
    "xero.refresh",
    {
      clerkOrgId: context.value.clerkOrgId,
      organisationId: context.value.organisationId,
      userId: context.value.actingUserId,
    },
    parsed.data,
    async () => {
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
  );
}

export async function disconnectXeroAction(input: {
  confirmationText: string;
  connectionId: string;
  mode: "destructive" | "soft";
  organisationId: string;
}): Promise<
  ActionResult<{ disconnected: true; receipt: XeroDisconnectReceipt }>
> {
  const parsed = DisconnectSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error.issues[0]?.message);
  }
  const context = await resolveAdminContext(parsed.data.organisationId);
  if (!context.ok) {
    return context;
  }

  const organisation = await database.organisation.findFirst({
    select: { name: true },
    where: {
      clerk_org_id: context.value.clerkOrgId,
      id: context.value.organisationId,
    },
  });
  if (!organisation || organisation.name !== parsed.data.confirmationText) {
    return validationError("Type the organisation name to confirm disconnect.");
  }

  return await withAuthenticatedXeroCampaignAction(
    "xero.disconnect",
    {
      clerkOrgId: context.value.clerkOrgId,
      organisationId: context.value.organisationId,
      userId: context.value.actingUserId,
    },
    parsed.data,
    async () => {
      const result = await disconnectXeroOAuthConnection({
        clerkOrgId: context.value.clerkOrgId,
        connectionId: parsed.data.connectionId,
        destructive: parsed.data.mode === "destructive",
        organisationId: context.value.organisationId,
        performedByUserId: context.value.actingUserId,
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
            remoteStatus: result.value.remoteStatus,
          },
          resource_id: parsed.data.connectionId,
          resource_type: "xero_connection",
        },
      });

      revalidate();
      return {
        ok: true,
        value: {
          disconnected: true,
          receipt: {
            cleanupRequestId: result.value.cleanupRequestId,
            dataActionStatus: result.value.dataActionStatus,
            localDisabled: true,
            remoteStatus: result.value.remoteStatus,
          },
        },
      };
    }
  );
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

  return await withAuthenticatedXeroCampaignAction(
    "xero.settings.tenant-sync-state",
    {
      clerkOrgId: context.value.clerkOrgId,
      organisationId: context.value.organisationId,
      userId: context.value.actingUserId,
    },
    { ...parsed.data, paused },
    async () => {
      const updated = await database.$transaction(async (tx) => {
        const result = await tx.xeroTenant.updateMany({
          data: { sync_paused_at: paused ? new Date() : null },
          where: {
            clerk_org_id: context.value.clerkOrgId,
            id: parsed.data.xeroTenantId,
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
            entity_id: parsed.data.xeroTenantId,
            entity_type: "xero_tenant",
            metadata: {},
            resource_id: parsed.data.xeroTenantId,
            resource_type: "xero_tenant",
          },
        });
        return true;
      });
      if (!updated) {
        return validationError(
          "Xero tenant was not found in this organisation."
        );
      }
      revalidate();
      return { ok: true, value: { paused: true } };
    }
  );
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
