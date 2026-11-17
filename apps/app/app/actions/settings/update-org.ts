"use server";

import { updateAccount } from "@repo/auth/accounts";
import { hasPermission as can } from "@repo/auth/permissions";

import { getSession } from "@repo/auth/server";
import { withTenantResult } from "@repo/database";
import { assertNoTenantTransaction } from "@repo/database/tenant-guard";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const UpdateOrgSchema = z.object({
  fiscalYearStart: z.number().int().min(1).max(12),
  locale: z.string().min(1),
  name: z.string().min(1, "Name is required").max(128),
  organisationId: z.string().uuid(),
  reportingUnit: z.enum(["days", "hours"]).default("hours"),
  timezone: z.string().min(1),
  workingHoursPerDay: z.number().min(1).max(24).default(7.6),
});

type UpdateOrgInput = z.infer<typeof UpdateOrgSchema>;

type Result<T, E = string> = { ok: true; value: T } | { ok: false; error: E };

export const updateOrg = async (
  input: UpdateOrgInput
): Promise<Result<void>> => {
  assertNoTenantTransaction("updateOrg");
  const { accountId: sessionAccountId, role: sessionRole } =
    (await getSession()) ?? {
      accountId: null,
      role: null,
      sessionId: null,
      userId: null,
    };

  if (!sessionAccountId) {
    return { error: "No active organisation", ok: false };
  }
  if (!can(sessionRole, { settings: ["update"] })) {
    return {
      error: "You do not have permission to update organisation settings",
      ok: false,
    };
  }

  const parsed = UpdateOrgSchema.safeParse(input);
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Invalid input",
      ok: false,
    };
  }

  const {
    name,
    organisationId,
    timezone,
    locale,
    fiscalYearStart,
    reportingUnit,
    workingHoursPerDay,
  } = parsed.data;

  try {
    const result = await withTenantResult(
      sessionAccountId,
      async (db): Promise<Result<void>> => {
        const company = await db.organisation.findFirst({
          select: { id: true },
          where: { account_id: sessionAccountId, id: organisationId },
        });
        if (!company) {
          return { error: "Organisation not found", ok: false };
        }
        const updated = await db.organisation.updateMany({
          data: {
            fiscal_year_start: fiscalYearStart,
            locale,
            name,
            reporting_unit: reportingUnit,
            timezone,
            working_hours_per_day: workingHoursPerDay,
          },
          where: { account_id: sessionAccountId, id: organisationId },
        });
        return updated.count === 1
          ? { ok: true, value: undefined }
          : { error: "Organisation not found", ok: false };
      }
    );
    if (!result.ok) {
      return result;
    }

    await updateAccount(sessionAccountId, {
      name,
      publicMetadata: {
        fiscalYearStart,
        locale,
        reportingUnit,
        timezone,
        workingHoursPerDay,
      },
    });

    for (const path of ["/settings/general", "/leave-approvals"]) {
      revalidatePath(path);
    }

    return { ok: true, value: undefined };
  } catch {
    return { error: "Failed to update organisation", ok: false };
  }
};
