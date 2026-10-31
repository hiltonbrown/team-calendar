"use server";

import { getAccount, updateAccount } from "@repo/auth/accounts";
import { hasPermission as can } from "@repo/auth/permissions";

import { getCurrentUser, getSession } from "@repo/auth/server";
import {
  type AccountId,
  normaliseRegionCode,
  type OrganisationId,
  type Result,
} from "@repo/core";
import {
  afterTenantCommit,
  withTenantDb,
  withTenantResult,
} from "@repo/database";
import { getOrganisationById } from "@repo/database/queries/organisations";
import { assertNoTenantTransaction } from "@repo/database/tenant-guard";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";

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
  assertNoTenantTransaction("updateAccountNameAction");
  const parsed = AccountNameSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error.issues[0]?.message);
  }

  const context = await resolveAdminContext(parsed.data.organisationId);
  if (!context.ok) {
    return context;
  }

  try {
    const organisation = await getAccount(context.value.accountId);

    await updateAccount(context.value.accountId, {
      name: parsed.data.name,
    });

    await withTenantDb(context.value.accountId, (db) =>
      db.auditEvent.create({
        data: {
          account_id: context.value.accountId,
          action: "account.name_changed",
          actor_display: context.value.actorDisplay,
          actor_user_id: context.value.actingUserId,
          after_value: { name: parsed.data.name },
          before_value: { name: organisation.name },
          entity_id: context.value.organisationId,
          entity_type: "organisation",
          ip_address: context.value.ipAddress,
          metadata: { actingUserId: context.value.actingUserId },
          organisation_id: context.value.organisationId,
          resource_id: context.value.organisationId,
          resource_type: "organisation",
          user_agent: context.value.userAgent,
        },
      })
    );

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
  assertNoTenantTransaction("updateOrganisationAction");
  const parsed = OrganisationSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error.issues[0]?.message);
  }

  const context = await resolveAdminIdentity(parsed.data.organisationId);
  if (!context.ok) {
    return context;
  }

  try {
    return await withTenantResult(
      context.value.accountId,
      async (db): ReturnType<typeof updateOrganisationAction> => {
        const owned = await getOrganisationById(
          context.value.accountId as AccountId,
          context.value.organisationId as OrganisationId,
          db
        );
        if (!owned.ok) {
          return notAuthorised();
        }

        const organisation = await db.organisation.findFirst({
          select: {
            country_code: true,
            name: true,
            region_code: true,
            timezone: true,
          },
          where: {
            account_id: context.value.accountId,
            id: context.value.organisationId,
          },
        });

        if (!organisation) {
          return unknownError("Organisation not found.");
        }

        const patch = prepareCompanyRegionPatch(parsed.data, organisation);
        if (!patch.ok) {
          return patch;
        }
        const { countryCode, regionCode } = patch.value;

        const updated = await db.organisation.update({
          data: {
            country_code: countryCode,
            name: parsed.data.name ?? organisation.name,
            region_code: regionCode,
            timezone: parsed.data.timezone ?? organisation.timezone,
          },
          select: {
            country_code: true,
            name: true,
            region_code: true,
            timezone: true,
          },
          where: { id: context.value.organisationId },
        });

        await db.auditEvent.create({
          data: {
            account_id: context.value.accountId,
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

        afterTenantCommit(db, () => {
          revalidatePath("/settings/general");

          return Promise.resolve();
        });
        afterTenantCommit(db, () => {
          revalidatePath("/");

          return Promise.resolve();
        });
        afterTenantCommit(db, () => {
          revalidatePath("/public-holidays");

          return Promise.resolve();
        });
        afterTenantCommit(db, () => {
          revalidatePath("/settings/holidays");

          return Promise.resolve();
        });
        afterTenantCommit(db, () => {
          revalidatePath("/calendar");

          return Promise.resolve();
        });

        return {
          ok: true,
          value: {
            countryCode: updated.country_code,
            name: updated.name,
            regionCode: updated.region_code,
            timezone: updated.timezone,
          },
        };
      }
    );
  } catch {
    return unknownError("Failed to update organisation settings.");
  }
}

async function resolveAdminIdentity(organisationId: string): Promise<
  ActionResult<{
    actingUserId: string;
    actorDisplay: string;
    accountId: string;
    ipAddress: null | string;
    organisationId: string;
    userAgent: null | string;
  }>
> {
  const [
    { accountId: sessionAccountId, role: sessionRole },
    user,
    requestHeaders,
  ] = await Promise.all([
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
    headers(),
  ]);

  if (
    !(user && can(sessionRole, { settings: ["update"] }) && sessionAccountId)
  ) {
    return notAuthorised();
  }

  return {
    ok: true,
    value: {
      accountId: sessionAccountId,
      actingUserId: user.id,
      actorDisplay: user.name || user.email || "Unknown user",
      ipAddress: requestHeaders.get("x-forwarded-for"),
      organisationId,
      userAgent: requestHeaders.get("user-agent"),
    },
  };
}

function notAuthorised(): ActionResult<never> {
  return {
    error: {
      code: "not_authorised",
      message: "You do not have permission to manage organisation settings.",
    },
    ok: false,
  };
}

function unknownError(message: string): ActionResult<never> {
  return {
    error: {
      code: "unknown_error",
      message,
    },
    ok: false,
  };
}

function validationError(message?: string): ActionResult<never> {
  return {
    error: {
      code: "validation_error",
      message: message ?? "Invalid settings request.",
    },
    ok: false,
  };
}

async function resolveAdminContext(
  organisationId: string
): ReturnType<typeof resolveAdminIdentity> {
  const actor = await resolveAdminIdentity(organisationId);
  if (!actor.ok) {
    return actor;
  }
  const company = await withTenantDb(actor.value.accountId, (db) =>
    getOrganisationById(
      actor.value.accountId as AccountId,
      organisationId as OrganisationId,
      db
    )
  );
  return company.ok ? actor : notAuthorised();
}

function prepareCompanyRegionPatch(
  input: z.infer<typeof OrganisationSchema>,
  organisation: { country_code: string; region_code: string | null }
) {
  if (
    input.countryCode !== undefined &&
    input.countryCode !== "AU" &&
    input.countryCode !== organisation.country_code
  ) {
    return validationError(
      "Team Calendar currently supports Australian Xero Payroll files only."
    );
  }

  if (
    input.countryCode &&
    input.countryCode !== organisation.country_code &&
    !input.confirmationCountryChange
  ) {
    return validationError("Confirm the country change before saving.");
  }

  const countryCode = input.countryCode ?? organisation.country_code;
  let regionCode = organisation.region_code
    ? normaliseRegionCode(countryCode, organisation.region_code)
    : null;
  if (input.regionCode !== undefined) {
    regionCode = input.regionCode
      ? normaliseRegionCode(countryCode, input.regionCode)
      : null;
    if (input.regionCode && !regionCode) {
      return validationError("Choose a state or region in that country.");
    }
  }

  return { ok: true as const, value: { countryCode, regionCode } };
}
