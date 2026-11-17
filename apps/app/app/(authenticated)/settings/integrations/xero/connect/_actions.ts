"use server";

import { hasPermission } from "@repo/auth/helpers";
import { hasPermission as can } from "@repo/auth/permissions";
import { getCurrentUser, getSession } from "@repo/auth/server";
import type { Result } from "@repo/core";
import { withTenantDb } from "@repo/database";
import { assertNoTenantTransaction } from "@repo/database/tenant-guard";
import { dispatchInitialXeroSync } from "@repo/jobs";
import {
  completeXeroTenantSelection,
  type XeroTenantSelectionOutcome,
} from "@repo/xero";
import { captureXeroConnected } from "@repo/xero/activation";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const CompleteTenantSelectionSchema = z.object({
  organisationId: z.string().uuid().optional(),
  sessionId: z.string().uuid(),
  tenantIds: z.array(z.string().min(1)).min(1).max(100),
  timezone: z
    .string()
    .trim()
    .min(1)
    .max(128)
    .refine(isIanaTimezone, "Your browser time zone could not be read."),
});
function isIanaTimezone(value: string): boolean {
  try {
    return Boolean(
      new Intl.DateTimeFormat("en-AU", { timeZone: value }).resolvedOptions()
        .timeZone
    );
  } catch {
    return false;
  }
}
interface ActionError {
  code: "not_authorised" | "unknown_error" | "validation_error";
  message: string;
}
type SelectionOutcome =
  | { tenantId: string; ok: true }
  | { tenantId: string; ok: false; message: string };
export async function completeTenantSelectionAction(input: {
  organisationId?: string;
  sessionId: string;
  tenantIds: string[];
  timezone: string;
}): Promise<
  Result<{ redirectTo: string; outcomes: SelectionOutcome[] }, ActionError>
> {
  assertNoTenantTransaction("completeTenantSelectionAction");
  const [admin, owner] = await Promise.all([
    hasPermission({ xero: ["connect"] }),
    hasPermission({ ownership: ["manage"] }),
  ]);
  if (!(admin || owner)) {
    return notAuthorised();
  }
  const parsed = CompleteTenantSelectionSchema.safeParse(input);
  if (!parsed.success) {
    return {
      error: {
        code: "validation_error",
        message:
          parsed.error.issues[0]?.message ?? "Select a Xero organisation.",
      },
      ok: false,
    };
  }
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
  const session = await withTenantDb(sessionAccountId, (db) =>
    db.xeroOAuthSession.findFirst({
      select: { organisation_id: true },
      where: {
        account_id: sessionAccountId,
        created_by_user_id: user.id,
        id: parsed.data.sessionId,
      },
    })
  );
  if (!session) {
    return {
      error: {
        code: "validation_error",
        message:
          "This connection session has expired. Start connecting Xero again.",
      },
      ok: false,
    };
  }
  if (
    parsed.data.organisationId &&
    parsed.data.organisationId !== session.organisation_id
  ) {
    return {
      error: {
        code: "validation_error",
        message: "The selected company does not match this connection session.",
      },
      ok: false,
    };
  }
  const result = await completeXeroTenantSelection({
    accountId: sessionAccountId,
    organisationId: session.organisation_id,
    sessionId: parsed.data.sessionId,
    tenantIds: [...new Set(parsed.data.tenantIds)],
    timezone: parsed.data.timezone,
    userId: user.id,
  });
  if (!result.ok) {
    return {
      error: {
        code: "unknown_error",
        message: "Xero could not be connected. Start again or try later.",
      },
      ok: false,
    };
  }
  const successes = result.value.outcomes.filter((outcome) => outcome.ok);
  for (const outcome of successes) {
    await recordSelectedConnection(sessionAccountId, user, outcome);
  }
  for (const path of [
    "/",
    "/calendar",
    "/people",
    "/leave-approvals",
    "/settings/getting-started",
    "/settings/integrations",
    "/settings/integrations/xero",
    "/sync",
  ]) {
    revalidatePath(path);
  }
  const redirect = new URL(result.value.returnTo, "https://teamcalendar.local");
  if (successes.length === 1 && successes[0]?.ok) {
    redirect.searchParams.set("org", successes[0].organisationId);
  }
  return {
    ok: true,
    value: {
      outcomes: result.value.outcomes.map((outcome) =>
        outcome.ok
          ? { ok: true, tenantId: outcome.tenantId }
          : {
              message: selectionErrorMessage(outcome.error.code),
              ok: false,
              tenantId: outcome.tenantId,
            }
      ),
      redirectTo: `${redirect.pathname}${redirect.search}`,
    },
  };
}
function selectionErrorMessage(code: string): string {
  if (code === "tenant_binding_conflict") {
    return "This Xero organisation is connected to another Team Calendar account. Ask its administrator to remove it there first.";
  }
  if (code === "plan_limit_reached" || code === "plan_limit_exceeded") {
    return "Your plan has reached its Xero file allowance. Upgrade your plan or remove a company before adding another.";
  }
  if (code === "invalid_country") {
    return "This Xero organisation does not support Australian Payroll.";
  }
  return "This Xero organisation could not be connected. Try connecting it again.";
}
function notAuthorised(): Result<never, ActionError> {
  return {
    error: {
      code: "not_authorised",
      message: "Only owners and admins can finish connecting Xero.",
    },
    ok: false,
  };
}

async function recordSelectedConnection(
  sessionAccountId: string,
  user: { id: string; name: string | null },
  outcome: Extract<XeroTenantSelectionOutcome, { ok: true }>
): Promise<void> {
  try {
    await withTenantDb(sessionAccountId, (db) =>
      db.auditEvent.create({
        data: {
          account_id: sessionAccountId,
          action:
            outcome.action === "reconnected"
              ? "xero.connection_reconnected"
              : "xero.connection_connected",
          actor_display: user.name || user.id,
          actor_user_id: user.id,
          entity_id: outcome.connectionId,
          entity_type: "xero_connection",
          metadata: {
            connectionId: outcome.connectionId,
            organisationId: outcome.organisationId,
          },
          organisation_id: outcome.organisationId,
          resource_id: outcome.connectionId,
          resource_type: "xero_connection",
        },
      })
    );
  } catch {
    /* Canonical connection audit is committed. */
  }
  await captureXeroConnected({
    accountId: sessionAccountId,
    connectionId: outcome.connectionId,
    organisationId: outcome.organisationId,
  });
  try {
    await dispatchInitialXeroSync({
      accountId: sessionAccountId,
      connectionId: outcome.connectionId,
      organisationId: outcome.organisationId,
      triggeredByUserId: user.id,
      triggerType: "manual",
    });
  } catch {
    /* Scheduled recovery retries committed imports. */
  }
}
