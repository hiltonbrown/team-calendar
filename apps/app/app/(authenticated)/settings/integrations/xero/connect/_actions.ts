"use server";
import { auth, currentUser } from "@repo/auth/server";
import type { Result } from "@repo/core";
import { tenantDatabase } from "@repo/database";
import { dispatchInitialXeroSync } from "@repo/jobs";
import { completeXeroTenantSelection } from "@repo/xero";
import { captureXeroConnected } from "@repo/xero/activation";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const CompleteTenantSelectionSchema = z.object({
  organisationId: z.string().uuid().optional(),
  sessionId: z.string().uuid(),
  tenantId: z.string().min(1),
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
export async function completeTenantSelectionAction(input: {
  organisationId?: string;
  sessionId: string;
  tenantId: string;
}): Promise<
  ActionResult<{
    redirectTo: string;
  }>
> {
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
  const session = await tenantDatabase(orgId).xeroOAuthSession.findFirst({
    select: { organisation_id: true },
    where: {
      clerk_org_id: orgId,
      created_by_user_id: user.id,
      id: parsed.data.sessionId,
    },
  });
  const organisationId = parsed.data.organisationId ?? session?.organisation_id;
  const operation = async (): Promise<
    ActionResult<{
      redirectTo: string;
    }>
  > => {
    const existingConnection = organisationId
      ? await tenantDatabase(orgId).xeroConnection.findFirst({
          select: { id: true },
          where: {
            clerk_org_id: orgId,
            organisation_id: organisationId,
          },
        })
      : null;
    const result = await completeXeroTenantSelection({
      clerkOrgId: orgId,
      organisationId: organisationId ?? null,
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
    try {
      await tenantDatabase(orgId).auditEvent.create({
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
            connectionId: result.value.connectionId,
            organisationId: result.value.organisationId,
          },
          organisation_id: result.value.organisationId,
          resource_id: result.value.connectionId,
          resource_type: "xero_connection",
        },
      });
    } catch {
      // Canonical connection audit is committed; ancillary audit must not block initial sync.
    }
    await captureXeroConnected({
      clerkOrgId: orgId,
      connectionId: result.value.connectionId,
      organisationId: result.value.organisationId,
    });
    // Dispatch durable initial sync (people, leave-records, leave-balances).
    // Best effort: the connection is already persisted and scheduled recovery will catch up if
    // dispatch fails, so a dispatch error must not fail the connection itself.
    try {
      await dispatchInitialXeroSync({
        clerkOrgId: orgId,
        connectionId: result.value.connectionId,
        organisationId: result.value.organisationId,
        triggeredByUserId: user.id,
        triggerType: "manual",
      });
    } catch {
      // Best-effort initial execution; scheduled recovery will retry.
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
  };
  return await operation();
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
