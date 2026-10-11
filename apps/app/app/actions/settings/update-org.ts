"use server";

import { auth, clerkClient } from "@repo/auth/server";
import { tenantDatabase } from "@repo/database";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getActiveOrgContext } from "@/lib/server/get-active-org-context";

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
  const { orgId, orgRole } = await auth();

  if (!orgId) {
    return { error: "No active organisation", ok: false };
  }
  if (orgRole !== "org:owner" && orgRole !== "org:admin") {
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
    const contextResult = await getActiveOrgContext(organisationId);
    if (!contextResult.ok) {
      return { error: contextResult.error.message, ok: false };
    }

    const updateResult = await tenantDatabase(orgId).organisation.updateMany({
      data: {
        fiscal_year_start: fiscalYearStart,
        locale,
        name,
        reporting_unit: reportingUnit,
        timezone,
        working_hours_per_day: workingHoursPerDay,
      },
      where: { clerk_org_id: orgId, id: organisationId },
    });

    if (updateResult.count !== 1) {
      return { error: "Organisation not found", ok: false };
    }

    const clerk = await clerkClient();
    await clerk.organizations.updateOrganization(orgId, {
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
