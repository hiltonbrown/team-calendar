"use server";

import { hasPermission as can } from "@repo/auth/permissions";

import { getCurrentUser, getSession } from "@repo/auth/server";
import {
  defaultOrganisationSettingsPatch,
  type OrganisationSettingsPatch,
  updateAccountApprovalSettings,
  updateSettings,
} from "@repo/availability";
import type { Result } from "@repo/core";
import { withTenantResult } from "@repo/database";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getActiveOrgContext } from "@/lib/server/get-active-org-context";

const PatchSchema = z.object({
  organisationId: z.string().uuid(),
  patch: z
    .object({
      defaultFeedPrivacyMode: z.enum(["masked", "named", "private"]).optional(),
      defaultLeaveRequestAdvanceDays: z
        .number()
        .int()
        .min(0)
        .max(365)
        .optional(),
      defaultPrivacyMode: z.enum(["masked", "named", "private"]).optional(),
      feedsIncludePublicHolidaysDefault: z.boolean().optional(),
      notifyManagersOnStatusChange: z.boolean().optional(),
      requireDeclineReason: z.literal(true).optional(),
      showDeclinedOnApprovals: z.boolean().optional(),
      showPendingOnCalendar: z.boolean().optional(),
    })
    .strict(),
});

type ActionError =
  | { code: "not_authorised"; message: string }
  | { code: "unknown_error"; message: string }
  | { code: "validation_error"; message: string };

type ActionResult<T> = Result<T, ActionError>;

export async function updateLeaveApprovalSettingsAction(input: {
  organisationId: string;
  patch: OrganisationSettingsPatch;
}): Promise<ActionResult<{ updated: true }>> {
  const parsed = PatchSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error.issues[0]?.message);
  }

  const context = await resolveAdminContext(parsed.data.organisationId);
  if (!context.ok) {
    return context;
  }

  try {
    const result = await withTenantResult(context.value.accountId, (db) =>
      updateSettings(
        {
          accountId: context.value.accountId,
          actingRole: context.value.role,
          actingUserId: context.value.actingUserId,
          organisationId: context.value.organisationId,
          patch: parsed.data.patch,
        },
        db
      )
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

    revalidatePaths();
    return { ok: true, value: { updated: true } };
  } catch {
    return {
      error: {
        code: "unknown_error",
        message: "Failed to update leave approval settings.",
      },
      ok: false,
    };
  }
}

export async function restoreLeaveApprovalDefaultsAction(input: {
  organisationId: string;
}): Promise<ActionResult<{ updated: true }>> {
  return await updateLeaveApprovalSettingsAction({
    organisationId: input.organisationId,
    patch: defaultOrganisationSettingsPatch(),
  });
}

async function resolveAdminContext(organisationId: string): Promise<
  ActionResult<{
    actingUserId: string;
    accountId: string;
    organisationId: string;
    role: "admin" | "owner";
  }>
> {
  const [{ role: sessionRole }, user, context] = await Promise.all([
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
    getActiveOrgContext(organisationId),
  ]);

  let role: "admin" | "owner" | null = null;
  if (sessionRole === "owner") {
    role = "owner";
  } else if (sessionRole === "admin") {
    role = "admin";
  }
  if (!(user && role && context.ok)) {
    return notAuthorised();
  }

  return {
    ok: true,
    value: {
      accountId: context.value.accountId,
      actingUserId: user.id,
      organisationId: context.value.organisationId,
      role,
    },
  };
}

function revalidatePaths() {
  revalidatePath("/settings/leave-approval");
  revalidatePath("/calendar");
  revalidatePath("/leave-approvals");
  revalidatePath("/people");
  revalidatePath("/plans");
}

function notAuthorised(): ActionResult<never> {
  return {
    error: {
      code: "not_authorised",
      message: "You do not have permission to manage leave approval settings.",
    },
    ok: false,
  };
}

function validationError(message?: string): ActionResult<never> {
  return {
    error: {
      code: "validation_error",
      message: message ?? "Invalid leave approval settings request.",
    },
    ok: false,
  };
}

const AccountManagerVisibilitySchema = z
  .object({
    managerVisibilityScope: z.enum(["direct_reports_only", "all_team_leave"]),
  })
  .strict();
export async function updateAccountManagerVisibilityAction(input: {
  managerVisibilityScope: "direct_reports_only" | "all_team_leave";
}): Promise<ActionResult<{ updated: true }>> {
  const parsed = AccountManagerVisibilitySchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error.issues[0]?.message);
  }
  const {
    accountId: sessionAccountId,
    userId,
    role: sessionRole,
  } = (await getSession()) ?? {
    accountId: null,
    role: null,
    sessionId: null,
    userId: null,
  };
  if (
    !(sessionAccountId && userId && can(sessionRole, { settings: ["update"] }))
  ) {
    return notAuthorised();
  }
  try {
    const result = await withTenantResult(sessionAccountId, (db) =>
      updateAccountApprovalSettings(
        {
          accountId: sessionAccountId,
          actingRole: sessionRole === "owner" ? "owner" : "admin",
          actingUserId: userId,
          managerVisibilityScope: parsed.data.managerVisibilityScope,
        },
        db
      )
    );
    if (!result.ok) {
      return result;
    }
    revalidatePaths();
    return { ok: true, value: { updated: true } };
  } catch {
    return {
      error: {
        code: "unknown_error",
        message: "Failed to update account manager visibility.",
      },
      ok: false,
    };
  }
}
