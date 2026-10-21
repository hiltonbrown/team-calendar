"use server";

import { auth, currentUser } from "@repo/auth/server";
import { exportAuditLogCsv } from "@repo/availability";
import type { ClerkOrgId, OrganisationId, Result } from "@repo/core";
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

  const [{ orgId, orgRole }, user] = await Promise.all([auth(), currentUser()]);
  let role: "admin" | "owner" | null = null;
  if (orgRole === "org:owner") {
    role = "owner";
  } else if (orgRole === "org:admin") {
    role = "admin";
  }
  if (!(orgId && role && user)) {
    return notAuthorised();
  }

  const clerkOrgId = orgId as ClerkOrgId;
  try {
    return await withTenantResult(
      clerkOrgId,
      async (db): ReturnType<typeof exportAuditLogCsvAction> => {
        const company = await getOrganisationById(
          clerkOrgId,
          parsed.data.organisationId as OrganisationId,
          db
        );
        if (!company.ok) {
          return notAuthorised();
        }
        const result = await exportAuditLogCsv(
          {
            actingRole: role,
            actingUserId: user.id,
            clerkOrgId,
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
