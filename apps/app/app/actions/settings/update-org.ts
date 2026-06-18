"use server";

import { auth, clerkClient } from "@repo/auth/server";
import { database } from "@repo/database";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getActiveOrgContext } from "@/lib/server/get-active-org-context";

const UpdateOrgSchema = z.object({
  organisationId: z.string().uuid(),
  name: z.string().min(1, "Name is required").max(128),
  timezone: z.string().min(1),
  locale: z.string().min(1),
  fiscalYearStart: z.number().int().min(1).max(12),
  reportingUnit: z.enum(["days", "hours"]).default("hours"),
  workingHoursPerDay: z.number().min(1).max(24).default(7.6),
});

type UpdateOrgInput = z.infer<typeof UpdateOrgSchema>;

type Result<T, E = string> = { ok: true; value: T } | { ok: false; error: E };

export const updateOrg = async (
  input: UpdateOrgInput
): Promise<Result<void>> => {
  const { orgId, orgRole } = await auth();

  if (!orgId) {
    return { ok: false, error: "No active organisation" };
  }
  if (orgRole !== "org:owner" && orgRole !== "org:admin") {
    return {
      ok: false,
      error: "You do not have permission to update organisation settings",
    };
  }

  const parsed = UpdateOrgSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
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
      return { ok: false, error: contextResult.error.message };
    }

    await database.organisation.updateMany({
      where: { clerk_org_id: orgId, id: organisationId },
      data: {
        fiscal_year_start: fiscalYearStart,
        locale,
        name,
        reporting_unit: reportingUnit,
        timezone,
        working_hours_per_day: workingHoursPerDay,
      },
    });

    const clerk = await clerkClient();
    await clerk.organizations.updateOrganization(orgId, {
      name,
      publicMetadata: {
        timezone,
        locale,
        fiscalYearStart,
        reportingUnit,
        workingHoursPerDay,
      },
    });

    for (const path of ["/settings/general", "/leave-approvals"]) {
      revalidatePath(path);
    }

    return { ok: true, value: undefined };
  } catch {
    return { ok: false, error: "Failed to update organisation" };
  }
};
