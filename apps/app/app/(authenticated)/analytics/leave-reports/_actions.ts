"use server";

import { auth, currentUser } from "@repo/auth/server";
import {
  type AnalyticsRecordListItem,
  type AnalyticsRole,
  exportAnalyticsToCsv,
  listLeaveReportRecordsForDrilldown,
  resolveDateRange,
} from "@repo/availability";
import type { Result } from "@repo/core";
import { database } from "@repo/database";
import { z } from "zod";
import { getActiveOrgContext } from "@/lib/server/get-active-org-context";

const ExportSchema = z.object({
  organisationId: z.string().uuid(),
});

type ActionError =
  | { code: "not_authorised"; message: string }
  | { code: "unknown_error"; message: string }
  | { code: "validation_error"; message: string };

type ActionResult<T> = Result<T, ActionError>;

export async function exportLeaveReportsCsvAction(input: {
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

  let role: AnalyticsRole | null = null;
  if (orgRole === "org:owner") {
    role = "owner";
  } else if (orgRole === "org:admin") {
    role = "admin";
  } else if (orgRole === "org:manager") {
    role = "manager";
  }

  if (!(role && user && context.ok)) {
    return notAuthorised();
  }

  try {
    const organisation = await database.organisation.findFirst({
      select: { timezone: true },
      where: {
        archived_at: null,
        clerk_org_id: context.value.clerkOrgId,
        id: parsed.data.organisationId,
      },
    });

    if (!organisation) {
      return validationError("Organisation not found.");
    }

    const rangeResult = resolveDateRange({
      preset: "this_year",
      timezone: organisation.timezone ?? "UTC",
    });

    if (!rangeResult.ok) {
      return {
        ok: false,
        error: {
          code: "unknown_error",
          message: "Failed to resolve date range.",
        },
      };
    }

    const records: AnalyticsRecordListItem[] = [];
    let cursor: string | null | undefined;
    const maxRecords = 10_000;

    while (true) {
      const result = await listLeaveReportRecordsForDrilldown({
        actingUserId: user.id,
        clerkOrgId: context.value.clerkOrgId,
        dateRange: rangeResult.value,
        filters: {
          includeArchivedPeople: false,
          personType: "all",
        },
        includePublicHolidays: false,
        organisationId: parsed.data.organisationId,
        role,
        cursor,
        pageSize: 200,
      });

      if (!result.ok) {
        return {
          ok: false,
          error: {
            code: "unknown_error",
            message: result.error.message || "Failed to list leave records.",
          },
        };
      }

      records.push(...result.value.records);
      if (!result.value.nextCursor || records.length >= maxRecords) {
        break;
      }
      cursor = result.value.nextCursor;
    }

    const csvContent = exportAnalyticsToCsv(records);

    return {
      ok: true,
      value: {
        csvContent,
        filename: "leave-report-this-year.csv",
      },
    };
  } catch {
    return {
      ok: false,
      error: {
        code: "unknown_error",
        message: "Failed to export leave report CSV.",
      },
    };
  }
}

function notAuthorised(): ActionResult<never> {
  return {
    ok: false,
    error: {
      code: "not_authorised",
      message: "You do not have permission to export the leave report.",
    },
  };
}

function validationError(message?: string): ActionResult<never> {
  return {
    ok: false,
    error: {
      code: "validation_error",
      message: message ?? "Invalid request.",
    },
  };
}
