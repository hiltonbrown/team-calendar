"use server";

import { auth, currentUser } from "@repo/auth/server";
import { dispatchManualSync } from "@repo/availability";
import type { Result } from "@repo/core";
import { database } from "@repo/database";
import { completeXeroTenantSelection } from "@repo/xero";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const CompleteTenantSelectionSchema = z.object({
  organisationId: z.string().uuid().optional(),
  sessionId: z.string().uuid(),
  tenantId: z.string().min(1),
});

type ActionError =
  | { code: "not_authorised"; message: string }
  | { code: "unknown_error"; message: string }
  | { code: "validation_error"; message: string };

type ActionResult<T> = Result<T, ActionError>;

export async function completeTenantSelectionAction(input: {
  organisationId?: string;
  sessionId: string;
  tenantId: string;
}): Promise<ActionResult<{ redirectTo: string }>> {
  const parsed = CompleteTenantSelectionSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error.issues[0]?.message);
  }

  const [{ orgId, orgRole }, user] = await Promise.all([auth(), currentUser()]);
  if (
    !(orgId && user) ||
    (orgRole !== "org:owner" && orgRole !== "org:admin")
  ) {
    return notAuthorised();
  }

  const existingConnection = parsed.data.organisationId
    ? await database.xeroConnection.findFirst({
        where: {
          clerk_org_id: orgId,
          organisation_id: parsed.data.organisationId,
        },
        select: { id: true, status: true },
      })
    : null;

  const result = await completeXeroTenantSelection({
    clerkOrgId: orgId,
    organisationId: parsed.data.organisationId ?? null,
    sessionId: parsed.data.sessionId,
    tenantId: parsed.data.tenantId,
  });
  if (!result.ok) {
    return {
      ok: false,
      error: {
        code: "unknown_error",
        message: result.error.message,
      },
    };
  }

  await database.auditEvent.create({
    data: {
      action: existingConnection
        ? "xero.connection_reconnected"
        : "xero.connection_connected",
      actor_display:
        [user.firstName, user.lastName].filter(Boolean).join(" ") ||
        user.emailAddresses[0]?.emailAddress ||
        user.id,
      actor_user_id: user.id,
      clerk_org_id: orgId,
      entity_id: result.value.connectionId,
      entity_type: "xero_connection",
      metadata: {
        organisationId: result.value.organisationId,
        xeroTenantId: result.value.xeroTenantId,
      },
      organisation_id: result.value.organisationId,
      resource_id: result.value.connectionId,
      resource_type: "xero_connection",
    },
  });

  // Kick off an initial people sync so the directory populates without a manual click.
  // Best effort: the connection is already persisted and scheduled syncs will catch up if
  // this enqueue does not land, so a failure here must not fail the connect.
  await dispatchManualSync({
    actingRole: orgRole === "org:owner" ? "owner" : "admin",
    actingUserId: user.id,
    clerkOrgId: orgId,
    organisationId: result.value.organisationId,
    runType: "people",
    xeroTenantId: result.value.xeroTenantId,
  });

  revalidatePath("/");
  revalidatePath("/settings/getting-started");
  revalidatePath("/settings/integrations");
  revalidatePath("/settings/integrations/xero");

  return {
    ok: true,
    value: {
      redirectTo: appendOrgQuery(
        result.value.returnTo,
        result.value.organisationId
      ),
    },
  };
}

function appendOrgQuery(path: string, organisationId: string): string {
  const url = new URL(path, "https://leavesync.local");
  url.searchParams.set("org", organisationId);
  return `${url.pathname}${url.search}`;
}

function notAuthorised(): ActionResult<never> {
  return {
    ok: false,
    error: {
      code: "not_authorised",
      message: "Only owners and admins can finish connecting Xero.",
    },
  };
}

function validationError(message?: string): ActionResult<never> {
  return {
    ok: false,
    error: {
      code: "validation_error",
      message: message ?? "Invalid Xero tenant selection.",
    },
  };
}
