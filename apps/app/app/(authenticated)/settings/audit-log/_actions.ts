"use server";

import { getCurrentUser, getSession } from "@repo/auth/server";
import { exportAuditLogCsv } from "@repo/availability";
import type { AccountId, OrganisationId, Result } from "@repo/core";
import { withTenantResult } from "@repo/database";
import { getOrganisationById } from "@repo/database/queries/organisations";
import { assertNoTenantTransaction } from "@repo/database/tenant-guard";
import { z } from "zod";

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
  assertNoTenantTransaction("exportAuditLogCsvAction");
  const parsed = ExportSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error.issues[0]?.message);
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
  let role: "admin" | "owner" | null = null;
  if (sessionRole === "owner") {
    role = "owner";
  } else if (sessionRole === "admin") {
    role = "admin";
  }
  if (!(sessionAccountId && role && user)) {
    return notAuthorised();
  }

  const accountId = sessionAccountId as AccountId;
  try {
    return await withTenantResult(
      accountId,
      async (db): ReturnType<typeof exportAuditLogCsvAction> => {
        const company = await getOrganisationById(
          accountId,
          parsed.data.organisationId as OrganisationId,
          db
        );
        if (!company.ok) {
          return notAuthorised();
        }
        const result = await exportAuditLogCsv(
          {
            accountId,
            actingRole: role,
            actingUserId: user.id,
            filters: parsed.data.filters,
            organisationId: company.value.id,
          },
          db
        );
        if (!result.ok) {
          return {
            error: {
              code:
                result.error.code === "not_authorised" ||
                result.error.code === "validation_error"
                  ? result.error.code
                  : "unknown_error",
              message: result.error.message,
            },
            ok: false,
          };
        }

        return { ok: true, value: result.value };
      }
    );
  } catch {
    return {
      error: { code: "unknown_error", message: "Failed to export audit log." },
      ok: false,
    };
  }
}

function notAuthorised(): ActionResult<never> {
  return {
    error: {
      code: "not_authorised",
      message: "You do not have permission to export the audit log.",
    },
    ok: false,
  };
}

function validationError(message?: string): ActionResult<never> {
  return {
    error: {
      code: "validation_error",
      message: message ?? "Invalid audit log export request.",
    },
    ok: false,
  };
}
