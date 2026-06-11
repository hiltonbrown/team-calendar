"use server";

import { auth, currentUser } from "@repo/auth/server";
import { exportAuditLogCsv } from "@repo/availability";
import type { Result } from "@repo/core";
import { z } from "zod";
import { getActiveOrgContext } from "@/lib/server/get-active-org-context";

const ExportSchema = z.object({
  filters: z
    .object({
      action: z.array(z.string()).optional(),
      actionPrefix: z.string().optional(),
      actorUserId: z.array(z.string()).optional(),
      dateFrom: z.coerce.date().optional(),
      dateTo: z.coerce.date().optional(),
      entityType: z.array(z.string()).optional(),
      searchEntityId: z.string().optional(),
    })
    .default({}),
  organisationId: z.string().uuid(),
});

type ActionError =
  | { code: "not_authorised"; message: string }
  | { code: "unknown_error"; message: string }
  | { code: "validation_error"; message: string };

type ActionResult<T> = Result<T, ActionError>;

export async function exportAuditLogCsvAction(input: {
  filters: {
    action?: string[];
    actionPrefix?: string;
    actorUserId?: string[];
    dateFrom?: Date;
    dateTo?: Date;
    entityType?: string[];
    searchEntityId?: string;
  };
  organisationId: string;
}): Promise<ActionResult<{ csvContent: string; filename: string }>> {
  const parsed = ExportSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error.issues[0]?.message);
  }

  const [{ orgRole }, user, context] = await Promise.all([
    auth(),
    currentUser(),
    getActiveOrgContext(parsed.data.organisationId),
  ]);

  let role: "admin" | "owner" | null = null;
  if (orgRole === "org:owner") {
    role = "owner";
  } else if (orgRole === "org:admin") {
    role = "admin";
  }
  if (!(role && user && context.ok)) {
    return notAuthorised();
  }

  const result = await exportAuditLogCsv({
    actingRole: role,
    actingUserId: user.id,
    clerkOrgId: context.value.clerkOrgId,
    filters: parsed.data.filters,
    organisationId: context.value.organisationId,
  });
  if (!result.ok) {
    return {
      ok: false,
      error: {
        code:
          result.error.code === "not_authorised" ||
          result.error.code === "validation_error"
            ? result.error.code
            : "unknown_error",
        message: result.error.message,
      },
    };
  }

  return { ok: true, value: result.value };
}

function notAuthorised(): ActionResult<never> {
  return {
    ok: false,
    error: {
      code: "not_authorised",
      message: "You do not have permission to export the audit log.",
    },
  };
}

function validationError(message?: string): ActionResult<never> {
  return {
    ok: false,
    error: {
      code: "validation_error",
      message: message ?? "Invalid audit log export request.",
    },
  };
}
