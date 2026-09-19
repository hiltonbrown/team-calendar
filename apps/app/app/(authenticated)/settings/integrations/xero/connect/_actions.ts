"use server";

import { createActivationEvent } from "@repo/analytics/activation-events";
import { analytics } from "@repo/analytics/server";
import { auth, currentUser } from "@repo/auth/server";
import { dispatchManualSync } from "@repo/availability";
import type { Result } from "@repo/core";
import { database } from "@repo/database";
import {
  syncXeroLeaveBalances,
  syncXeroLeaveRecords,
  syncXeroPeople,
} from "@repo/jobs";
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
        select: { id: true },
        where: {
          clerk_org_id: orgId,
          organisation_id: parsed.data.organisationId,
        },
      })
    : null;

  const result = await completeXeroTenantSelection({
    clerkOrgId: orgId,
    organisationId: parsed.data.organisationId ?? null,
    sessionId: parsed.data.sessionId,
    tenantId: parsed.data.tenantId,
    userId: user.id,
  });
  if (!result.ok) {
    return {
      error: {
        code: "unknown_error",
        message: result.error.message,
      },
      ok: false,
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
  try {
    const durableConnection = await database.xeroConnection.findFirst({
      select: { created_at: true },
      where: {
        clerk_org_id: orgId,
        id: result.value.connectionId,
        organisation_id: result.value.organisationId,
      },
    });
    if (durableConnection) {
      const connectedEvent = createActivationEvent({
        deduplicationKey: `${orgId}:${result.value.organisationId}`,
        name: "Xero Connected",
        occurredAt: durableConnection.created_at,
        subjectId: orgId,
      });
      analytics?.capture({
        distinctId: connectedEvent.distinctId,
        event: connectedEvent.event,
        properties: connectedEvent.properties,
        timestamp: connectedEvent.timestamp,
        uuid: connectedEvent.uuid,
      });
      await analytics?.flush();
    }
  } catch {
    // The connection is durable; analytics must not turn it into a user-visible failure.
  }

  // Perform immediate initial sync (people, leave-records, leave-balances).
  // Best effort: the connection is already persisted and scheduled syncs will catch up if
  // any step fails, so a sync error must not fail the connection itself.
  const syncContext = {
    clerkOrgId: orgId,
    organisationId: result.value.organisationId,
    triggeredByUserId: user.id,
    triggerType: "manual" as const,
    xeroTenantId: result.value.xeroTenantId,
  };

  try {
    await syncXeroPeople(syncContext);
    await syncXeroLeaveRecords(syncContext);
    await syncXeroLeaveBalances(syncContext);
  } catch {
    // Best-effort initial execution; scheduled runs or manual syncs will retry.
  }
  const initialRunTypes = [
    "people",
    "leave_records",
    "leave_balances",
  ] as const;
  for (const runType of initialRunTypes) {
    await dispatchManualSync({
      actingRole: orgRole === "org:owner" ? "owner" : "admin",
      actingUserId: user.id,
      clerkOrgId: orgId,
      organisationId: result.value.organisationId,
      runType,
      xeroTenantId: result.value.xeroTenantId,
    });
  }

  revalidatePath("/");
  revalidatePath("/people");
  revalidatePath("/leave-approvals");
  revalidatePath("/settings/getting-started");
  revalidatePath("/settings/integrations");
  revalidatePath("/settings/integrations/xero");
  revalidatePath("/sync");

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
  const url = new URL(path, "https://teamcalendar.local");
  url.searchParams.set("org", organisationId);
  return `${url.pathname}${url.search}`;
}

function notAuthorised(): ActionResult<never> {
  return {
    error: {
      code: "not_authorised",
      message: "Only owners and admins can finish connecting Xero.",
    },
    ok: false,
  };
}

function validationError(message?: string): ActionResult<never> {
  return {
    error: {
      code: "validation_error",
      message: message ?? "Invalid Xero tenant selection.",
    },
    ok: false,
  };
}
