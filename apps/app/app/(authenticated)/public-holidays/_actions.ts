"use server";

import { hasPermission, requireAccount } from "@repo/auth/helpers";
import { getCurrentUser } from "@repo/auth/server";
import {
  addCustomHoliday,
  deleteCustomHoliday,
  hidePublicHoliday,
  restorePublicHoliday,
  setLocalHolidayEnabled,
  setPublicHolidayClassification,
} from "@repo/availability";
import type { AccountId, OrganisationId } from "@repo/core";
import { afterTenantCommit, withTenantResult } from "@repo/database";
import { getOrganisationById } from "@repo/database/queries/organisations";
import { assertNoTenantTransaction } from "@repo/database/tenant-guard";
import { revalidatePath } from "next/cache";
import { z } from "zod";

type ActionResult<T> = { ok: true; value: T } | { error: string; ok: false };

interface AdminContext {
  accountId: AccountId;
  actingUserId: string;
  organisationId: OrganisationId;
  role: "admin" | "owner";
}

async function resolveAdminContext(
  organisationId: string
): Promise<ActionResult<AdminContext>> {
  let role: "admin" | "owner" | null = null;
  if (await hasPermission({ ownership: ["manage"] })) {
    role = "owner";
  } else if (await hasPermission({ settings: ["update"] })) {
    role = "admin";
  }
  if (!role) {
    return { error: "Permission denied", ok: false };
  }
  const user = await getCurrentUser();
  if (!user) {
    return { error: "You need to sign in again.", ok: false };
  }
  // Authentication completes before the action owns its SQL scope.
  const accountId = (await requireAccount()) as AccountId;

  return {
    ok: true,
    value: {
      accountId,
      actingUserId: user.id,
      organisationId: organisationId as OrganisationId,
      role,
    },
  };
}

function revalidateHolidayPaths() {
  revalidatePath("/public-holidays");
  revalidatePath("/settings/holidays");
  revalidatePath("/calendar");
  revalidatePath("/");
}

function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Invalid input";
}

const AddCustomHolidaySchema = z.object({
  appliesToAllJurisdictions: z.boolean(),
  countryCode: z.string().nullable(),
  date: z.coerce.date(),
  name: z.string().trim().min(1, "Enter a holiday name").max(100),
  organisationId: z.string().uuid(),
  regionCode: z.string().nullable(),
});

export async function addCustomHolidayAction(
  input: z.input<typeof AddCustomHolidaySchema>
): Promise<ActionResult<{ id: string; message: string }>> {
  assertNoTenantTransaction("addCustomHolidayAction");
  const parsed = AddCustomHolidaySchema.safeParse(input);
  if (!parsed.success) {
    return { error: firstIssue(parsed.error), ok: false };
  }
  const context = await resolveAdminContext(parsed.data.organisationId);
  if (!context.ok) {
    return context;
  }
  try {
    return await withTenantResult(
      context.value.accountId,
      async (db): ReturnType<typeof addCustomHolidayAction> => {
        const company = await getOrganisationById(
          context.value.accountId,
          context.value.organisationId,
          db
        );
        if (!company.ok) {
          return { error: company.error.message, ok: false };
        }
        const result = await addCustomHoliday(
          {
            accountId: context.value.accountId,
            appliesToAllJurisdictions: parsed.data.appliesToAllJurisdictions,
            countryCode: parsed.data.countryCode,
            date: parsed.data.date,
            name: parsed.data.name,
            organisationId: context.value.organisationId,
            regionCode: parsed.data.regionCode,
            userId: context.value.actingUserId,
          },
          db
        );
        if (!result.ok) {
          return { error: result.error.message, ok: false };
        }
        afterTenantCommit(db, () => {
          revalidateHolidayPaths();

          return Promise.resolve();
        });
        return {
          ok: true,
          value: { id: result.value.id, message: `${parsed.data.name} added.` },
        };
      }
    );
  } catch {
    return { error: "Failed to update public holidays.", ok: false };
  }
}

const DeleteCustomHolidaySchema = z.object({
  holidayId: z.string().uuid(),
  name: z.string().max(200),
  organisationId: z.string().uuid(),
});

export async function deleteCustomHolidayAction(
  input: z.input<typeof DeleteCustomHolidaySchema>
): Promise<ActionResult<{ message: string }>> {
  assertNoTenantTransaction("deleteCustomHolidayAction");
  const parsed = DeleteCustomHolidaySchema.safeParse(input);
  if (!parsed.success) {
    return { error: firstIssue(parsed.error), ok: false };
  }
  const context = await resolveAdminContext(parsed.data.organisationId);
  if (!context.ok) {
    return context;
  }
  try {
    return await withTenantResult(
      context.value.accountId,
      async (db): ReturnType<typeof deleteCustomHolidayAction> => {
        const company = await getOrganisationById(
          context.value.accountId,
          context.value.organisationId,
          db
        );
        if (!company.ok) {
          return { error: company.error.message, ok: false };
        }
        const result = await deleteCustomHoliday(
          context.value.accountId,
          context.value.organisationId,
          parsed.data.holidayId,
          db
        );
        if (!result.ok) {
          return { error: result.error.message, ok: false };
        }
        afterTenantCommit(db, () => {
          revalidateHolidayPaths();

          return Promise.resolve();
        });
        return { ok: true, value: { message: `${parsed.data.name} deleted.` } };
      }
    );
  } catch {
    return { error: "Failed to update public holidays.", ok: false };
  }
}

const HolidayKeySchema = z.object({
  holidayKey: z.string().min(1).max(200),
  organisationId: z.string().uuid(),
});
const ScopedKeySchema = HolidayKeySchema.extend({
  locationId: z.string().uuid().nullable(),
});
const ClassificationSchema = HolidayKeySchema.extend({
  classification: z.enum(["working", "non_working"]),
  locationId: z.string().uuid(),
});
const LocalDaySchema = HolidayKeySchema.extend({
  enabled: z.boolean(),
  locationId: z.string().uuid(),
});

function where(locationName: string | null) {
  return locationName ? `for ${locationName}` : "for all locations";
}

export async function hideHolidayAction(
  input: z.input<typeof HolidayKeySchema>
): Promise<ActionResult<{ message: string }>> {
  assertNoTenantTransaction("hideHolidayAction");
  const parsed = HolidayKeySchema.safeParse(input);
  if (!parsed.success) {
    return { error: firstIssue(parsed.error), ok: false };
  }
  const context = await resolveAdminContext(parsed.data.organisationId);
  if (!context.ok) {
    return context;
  }
  try {
    return await withTenantResult(
      context.value.accountId,
      async (db): ReturnType<typeof hideHolidayAction> => {
        const company = await getOrganisationById(
          context.value.accountId,
          context.value.organisationId,
          db
        );
        if (!company.ok) {
          return { error: company.error.message, ok: false };
        }
        const result = await hidePublicHoliday(
          {
            accountId: context.value.accountId,
            actingRole: context.value.role,
            actingUserId: context.value.actingUserId,
            holidayKey: parsed.data.holidayKey,
            locationId: null,
            organisationId: context.value.organisationId,
          },
          db
        );
        if (!result.ok) {
          return { error: result.error.message, ok: false };
        }
        afterTenantCommit(db, () => {
          revalidateHolidayPaths();

          return Promise.resolve();
        });
        return {
          ok: true,
          value: {
            message: `${result.value.holidayName} hidden. Locations with their own working-day setting keep it.`,
          },
        };
      }
    );
  } catch {
    return { error: "Failed to update public holidays.", ok: false };
  }
}

export async function restoreHolidayAction(
  input: z.input<typeof ScopedKeySchema>
): Promise<ActionResult<{ message: string }>> {
  assertNoTenantTransaction("restoreHolidayAction");
  const parsed = ScopedKeySchema.safeParse(input);
  if (!parsed.success) {
    return { error: firstIssue(parsed.error), ok: false };
  }
  const context = await resolveAdminContext(parsed.data.organisationId);
  if (!context.ok) {
    return context;
  }
  try {
    return await withTenantResult(
      context.value.accountId,
      async (db): ReturnType<typeof restoreHolidayAction> => {
        const company = await getOrganisationById(
          context.value.accountId,
          context.value.organisationId,
          db
        );
        if (!company.ok) {
          return { error: company.error.message, ok: false };
        }
        const result = await restorePublicHoliday(
          {
            accountId: context.value.accountId,
            actingRole: context.value.role,
            actingUserId: context.value.actingUserId,
            holidayKey: parsed.data.holidayKey,
            locationId: parsed.data.locationId,
            organisationId: context.value.organisationId,
          },
          db
        );
        if (!result.ok) {
          return { error: result.error.message, ok: false };
        }
        afterTenantCommit(db, () => {
          revalidateHolidayPaths();

          return Promise.resolve();
        });
        return {
          ok: true,
          value: {
            message: `${result.value.holidayName} restored ${where(result.value.locationName)}.`,
          },
        };
      }
    );
  } catch {
    return { error: "Failed to update public holidays.", ok: false };
  }
}

export async function setHolidayClassificationAction(
  input: z.input<typeof ClassificationSchema>
): Promise<ActionResult<{ message: string }>> {
  assertNoTenantTransaction("setHolidayClassificationAction");
  const parsed = ClassificationSchema.safeParse(input);
  if (!parsed.success) {
    return { error: firstIssue(parsed.error), ok: false };
  }
  const context = await resolveAdminContext(parsed.data.organisationId);
  if (!context.ok) {
    return context;
  }
  try {
    return await withTenantResult(
      context.value.accountId,
      async (db): ReturnType<typeof setHolidayClassificationAction> => {
        const company = await getOrganisationById(
          context.value.accountId,
          context.value.organisationId,
          db
        );
        if (!company.ok) {
          return { error: company.error.message, ok: false };
        }
        const result = await setPublicHolidayClassification(
          {
            accountId: context.value.accountId,
            actingRole: context.value.role,
            actingUserId: context.value.actingUserId,
            classification: parsed.data.classification,
            holidayKey: parsed.data.holidayKey,
            locationId: parsed.data.locationId,
            organisationId: context.value.organisationId,
          },
          db
        );
        if (!result.ok) {
          return { error: result.error.message, ok: false };
        }
        afterTenantCommit(db, () => {
          revalidateHolidayPaths();

          return Promise.resolve();
        });
        const kind =
          parsed.data.classification === "working"
            ? "a working day"
            : "a non-working day";
        return {
          ok: true,
          value: {
            message: `${result.value.holidayName} is now ${kind} ${where(result.value.locationName)}.`,
          },
        };
      }
    );
  } catch {
    return { error: "Failed to update public holidays.", ok: false };
  }
}

export async function setLocalHolidayEnabledAction(
  input: z.input<typeof LocalDaySchema>
): Promise<ActionResult<{ message: string }>> {
  assertNoTenantTransaction("setLocalHolidayEnabledAction");
  const parsed = LocalDaySchema.safeParse(input);
  if (!parsed.success) {
    return { error: firstIssue(parsed.error), ok: false };
  }
  const context = await resolveAdminContext(parsed.data.organisationId);
  if (!context.ok) {
    return context;
  }
  try {
    return await withTenantResult(
      context.value.accountId,
      async (db): ReturnType<typeof setLocalHolidayEnabledAction> => {
        const company = await getOrganisationById(
          context.value.accountId,
          context.value.organisationId,
          db
        );
        if (!company.ok) {
          return { error: company.error.message, ok: false };
        }
        const result = await setLocalHolidayEnabled(
          {
            accountId: context.value.accountId,
            actingRole: context.value.role,
            actingUserId: context.value.actingUserId,
            enabled: parsed.data.enabled,
            holidayKey: parsed.data.holidayKey,
            locationId: parsed.data.locationId,
            organisationId: context.value.organisationId,
          },
          db
        );
        if (!result.ok) {
          return { error: result.error.message, ok: false };
        }
        afterTenantCommit(db, () => {
          revalidateHolidayPaths();

          return Promise.resolve();
        });
        return {
          ok: true,
          value: {
            message: `${result.value.holidayName} switched ${parsed.data.enabled ? "on" : "off"} ${where(result.value.locationName)}.`,
          },
        };
      }
    );
  } catch {
    return { error: "Failed to update public holidays.", ok: false };
  }
}
