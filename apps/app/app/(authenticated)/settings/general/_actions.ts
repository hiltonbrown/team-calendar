"use server";

import { auth, clerkClient, currentUser } from "@repo/auth/server";
import { ensureDefaultPublicHolidaysForOrganisation } from "@repo/availability";
import type { ClerkOrgId, OrganisationId, Result } from "@repo/core";
import { database } from "@repo/database";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { getActiveOrgContext } from "@/lib/server/get-active-org-context";

const OrganisationIdSchema = z.string().uuid();

const AccountNameSchema = z.object({
  name: z.string().trim().min(1).max(128),
  organisationId: OrganisationIdSchema,
});

const OrganisationSchema = z.object({
  confirmationCountryChange: z.boolean().optional().default(false),
  countryCode: z.enum(["AU", "NZ", "UK"]).optional(),
  name: z.string().trim().min(1).max(128).optional(),
  organisationId: OrganisationIdSchema,
  regionCode: z.string().trim().max(64).nullable().optional(),
  timezone: z.string().trim().min(1).max(128).optional(),
});

type ActionError =
  | { code: "not_authorised"; message: string }
  | { code: "validation_error"; message: string }
  | { code: "unknown_error"; message: string };

type ActionResult<T> = Result<T, ActionError>;

export async function updateAccountNameAction(input: {
  name: string;
  organisationId: string;
}): Promise<ActionResult<{ name: string }>> {
  const parsed = AccountNameSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error.issues[0]?.message);
  }

  const context = await resolveAdminContext(parsed.data.organisationId);
  if (!context.ok) {
    return context;
  }

  try {
    const clerk = await clerkClient();
    const organisation = await clerk.organizations.getOrganization({
      organizationId: context.value.clerkOrgId,
    });

    await clerk.organizations.updateOrganization(context.value.clerkOrgId, {
      name: parsed.data.name,
    });

    await database.auditEvent.create({
      data: {
        action: "account.name_changed",
        actor_display: context.value.actorDisplay,
        actor_user_id: context.value.actingUserId,
        after_value: { name: parsed.data.name },
        before_value: { name: organisation.name },
        clerk_org_id: context.value.clerkOrgId,
        entity_id: context.value.organisationId,
        entity_type: "organisation",
        ip_address: context.value.ipAddress,
        metadata: { actingUserId: context.value.actingUserId },
        organisation_id: context.value.organisationId,
        resource_id: context.value.organisationId,
        resource_type: "organisation",
        user_agent: context.value.userAgent,
      },
    });

    revalidatePath("/settings/general");
    revalidatePath("/");

    return { ok: true, value: { name: parsed.data.name } };
  } catch {
    return unknownError("Failed to update account name.");
  }
}

export async function updateOrganisationAction(input: {
  confirmationCountryChange?: boolean;
  countryCode?: "AU" | "NZ" | "UK";
  name?: string;
  organisationId: string;
  regionCode?: null | string;
  timezone?: string;
}): Promise<
  ActionResult<{
    countryCode: string;
    name: string;
    regionCode: null | string;
    timezone: string | null;
  }>
> {
  const parsed = OrganisationSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error.issues[0]?.message);
  }

  const context = await resolveAdminContext(parsed.data.organisationId);
  if (!context.ok) {
    return context;
  }

  try {
    const organisation = await database.organisation.findFirst({
      where: {
        clerk_org_id: context.value.clerkOrgId,
        id: context.value.organisationId,
      },
      select: {
        country_code: true,
        name: true,
        region_code: true,
        timezone: true,
      },
    });

    if (!organisation) {
      return unknownError("Organisation not found.");
    }

    if (
      parsed.data.countryCode !== undefined &&
      parsed.data.countryCode !== "AU" &&
      parsed.data.countryCode !== organisation.country_code
    ) {
      return validationError(
        "Team Calendar currently supports Australian Xero Payroll files only."
      );
    }

    if (
      parsed.data.countryCode &&
      parsed.data.countryCode !== organisation.country_code &&
      !parsed.data.confirmationCountryChange
    ) {
      return validationError("Confirm the country change before saving.");
    }

    const updated = await database.organisation.update({
      where: { id: context.value.organisationId },
      data: {
        country_code: parsed.data.countryCode ?? organisation.country_code,
        name: parsed.data.name ?? organisation.name,
        region_code: parsed.data.regionCode ?? organisation.region_code,
        timezone: parsed.data.timezone ?? organisation.timezone,
      },
      select: {
        country_code: true,
        name: true,
        region_code: true,
        timezone: true,
      },
    });

    await database.auditEvent.create({
      data: {
        action: "organisation.updated",
        actor_display: context.value.actorDisplay,
        actor_user_id: context.value.actingUserId,
        after_value: {
          countryCode: updated.country_code,
          name: updated.name,
          regionCode: updated.region_code,
          timezone: updated.timezone,
        },
        before_value: {
          countryCode: organisation.country_code,
          name: organisation.name,
          regionCode: organisation.region_code,
          timezone: organisation.timezone,
        },
        clerk_org_id: context.value.clerkOrgId,
        entity_id: context.value.organisationId,
        entity_type: "organisation",
        ip_address: context.value.ipAddress,
        metadata: { actingUserId: context.value.actingUserId },
        organisation_id: context.value.organisationId,
        resource_id: context.value.organisationId,
        resource_type: "organisation",
        user_agent: context.value.userAgent,
      },
    });

    const holidayJurisdictionChanged =
      updated.country_code !== organisation.country_code ||
      updated.region_code !== organisation.region_code;

    if (holidayJurisdictionChanged) {
      await ensureDefaultPublicHolidaysForOrganisation({
        clerkOrgId: context.value.clerkOrgId as ClerkOrgId,
        organisationId: context.value.organisationId as OrganisationId,
        userId: context.value.actingUserId,
      });
    }

    revalidatePath("/settings/general");
    revalidatePath("/");
    revalidatePath("/public-holidays");
    revalidatePath("/settings/holidays");
    revalidatePath("/calendar");

    return {
      ok: true,
      value: {
        countryCode: updated.country_code,
        name: updated.name,
        regionCode: updated.region_code,
        timezone: updated.timezone,
      },
    };
  } catch {
    return unknownError("Failed to update organisation settings.");
  }
}

async function resolveAdminContext(organisationId: string): Promise<
  ActionResult<{
    actingUserId: string;
    actorDisplay: string;
    clerkOrgId: string;
    ipAddress: null | string;
    organisationId: string;
    userAgent: null | string;
  }>
> {
  const [{ orgRole }, user, context, requestHeaders] = await Promise.all([
    auth(),
    currentUser(),
    getActiveOrgContext(organisationId),
    headers(),
  ]);

  if (
    !(
      user &&
      (orgRole === "org:admin" || orgRole === "org:owner") &&
      context.ok
    )
  ) {
    return notAuthorised();
  }

  return {
    ok: true,
    value: {
      actingUserId: user.id,
      actorDisplay:
        [user.firstName, user.lastName].filter(Boolean).join(" ") ||
        user.emailAddresses[0]?.emailAddress ||
        "Unknown user",
      clerkOrgId: context.value.clerkOrgId,
      ipAddress: requestHeaders.get("x-forwarded-for"),
      organisationId: context.value.organisationId,
      userAgent: requestHeaders.get("user-agent"),
    },
  };
}

function notAuthorised(): ActionResult<never> {
  return {
    ok: false,
    error: {
      code: "not_authorised",
      message: "You do not have permission to manage organisation settings.",
    },
  };
}

function unknownError(message: string): ActionResult<never> {
  return {
    ok: false,
    error: {
      code: "unknown_error",
      message,
    },
  };
}

function validationError(message?: string): ActionResult<never> {
  return {
    ok: false,
    error: {
      code: "validation_error",
      message: message ?? "Invalid settings request.",
    },
  };
}
