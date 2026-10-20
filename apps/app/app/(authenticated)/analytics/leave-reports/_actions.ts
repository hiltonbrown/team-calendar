"use server";

import { auth, currentUser } from "@repo/auth/server";
import {
  type AnalyticsRecordListItem,
  type AnalyticsRole,
  exportAnalyticsToCsv,
  listLeaveReportRecordsForDrilldown,
  resolveDateRange,
} from "@repo/availability";
import type { ClerkOrgId, OrganisationId, Result } from "@repo/core";
import { withTenantResult } from "@repo/database";
import { getOrganisationById } from "@repo/database/queries/organisations";
import { assertNoTenantTransaction } from "@repo/database/tenant-guard";
import { z } from "zod";

const ExportSchema = z.object({
  from: z.string().optional(),
  organisationId: z.string().uuid(),
  preset: z.enum([
    "this_month",
    "last_month",
    "this_quarter",
    "last_quarter",
    "this_year",
    "last_year",
    "last_12_months",
    "custom",
  ]),
  to: z.string().optional(),
});

type ActionError =
  | { code: "not_authorised"; message: string }
  | { code: "unknown_error"; message: string }
  | { code: "validation_error"; message: string };

type ActionResult<T> = Result<T, ActionError>;

export async function exportLeaveReportsCsvAction(input: {
  from?: string;
  organisationId: string;
  preset: z.infer<typeof ExportSchema>["preset"];
  to?: string;
}): Promise<ActionResult<{ csvContent: string; filename: string }>> {
  assertNoTenantTransaction("exportLeaveReportsCsvAction");
  const parsed = ExportSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error.issues[0]?.message);
  }

  const [{ orgId, orgRole }, user] = await Promise.all([auth(), currentUser()]);
  let role: AnalyticsRole | null = null;
  if (orgRole === "org:owner") {
    role = "owner";
  } else if (orgRole === "org:admin") {
    role = "admin";
  } else if (orgRole === "org:manager") {
    role = "manager";
  }

  if (!(orgId && role && user)) {
    return notAuthorised();
  }

  const clerkOrgId = orgId as ClerkOrgId;
  try {
    return await withTenantResult(
      clerkOrgId,
      async (db): ReturnType<typeof exportLeaveReportsCsvAction> => {
        const company = await getOrganisationById(
          clerkOrgId,
          parsed.data.organisationId as OrganisationId,
          db
        );
        if (!company.ok) {
          return notAuthorised();
        }

        const organisation = await db.organisation.findFirst({
          select: { timezone: true },
          where: {
            archived_at: null,
            clerk_org_id: clerkOrgId,
            id: parsed.data.organisationId,
          },
        });

        if (!organisation) {
          return validationError("Organisation not found.");
        }

        const rangeResult = resolveDateRange({
          customEnd: parsed.data.to,
          customStart: parsed.data.from,
          preset: parsed.data.preset,
          timezone: organisation.timezone ?? "UTC",
        });

        if (!rangeResult.ok) {
          return {
            error: {
              code: "unknown_error",
              message: "Failed to resolve date range.",
            },
            ok: false,
          };
        }

        const records: AnalyticsRecordListItem[] = [];
        let cursor: string | null | undefined;
        const maxRecords = 10_000;

        for (;;) {
          const result = await listLeaveReportRecordsForDrilldown(
            {
              actingUserId: user.id,
              clerkOrgId,
              cursor,
              dateRange: rangeResult.value,
              filters: {
                includeArchivedPeople: false,
                personType: "all",
              },
              includePublicHolidays: false,
              organisationId: parsed.data.organisationId,
              pageSize: 200,
              role,
            },
            db
          );

          if (!result.ok) {
            return {
              error: {
                code: "unknown_error",
                message:
                  result.error.message || "Failed to list leave records.",
              },
              ok: false,
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
            filename: `leave-report-${dateOnly(rangeResult.value.start, organisation.timezone ?? "UTC")}-to-${dateOnly(new Date(rangeResult.value.end.getTime() - 1), organisation.timezone ?? "UTC")}.csv`,
          },
        };
      }
    );
  } catch {
    return {
      error: {
        code: "unknown_error",
        message: "Failed to export leave report CSV.",
      },
      ok: false,
    };
  }
}

function dateOnly(value: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: timezone,
    year: "numeric",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function notAuthorised(): ActionResult<never> {
  return {
    error: {
      code: "not_authorised",
      message: "You do not have permission to export the leave report.",
    },
    ok: false,
  };
}

function validationError(message?: string): ActionResult<never> {
  return {
    error: {
      code: "validation_error",
      message: message ?? "Invalid request.",
    },
    ok: false,
  };
}
