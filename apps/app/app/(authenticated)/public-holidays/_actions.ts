"use server";

import { requireRole } from "@repo/auth/helpers";
import { currentUser } from "@repo/auth/server";
import {
  addCustomHoliday,
  deleteCustomHoliday,
  hidePublicHoliday,
  restorePublicHoliday,
  setLocalHolidayEnabled,
  setPublicHolidayClassification,
} from "@repo/availability";
import type { ClerkOrgId, OrganisationId } from "@repo/core";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getActiveOrgContext } from "@/lib/server/get-active-org-context";

type ActionResult<T> = { ok: true; value: T } | { error: string; ok: false };

interface AdminContext {
  actingUserId: string;
  clerkOrgId: ClerkOrgId;
  organisationId: OrganisationId;
  role: "admin" | "owner";
}

async function resolveAdminContext(
  organisationId: string
): Promise<ActionResult<AdminContext>> {
  let role: "admin" | "owner" | null = null;
  if (await requireRole("org:owner")) {
    role = "owner";
  } else if (await requireRole("org:admin")) {
    role = "admin";
  }
  if (!role) {
    return { error: "Permission denied", ok: false };
  }
  const user = await currentUser();
  if (!user) {
    return { error: "You need to sign in again.", ok: false };
  }
  const context = await getActiveOrgContext(organisationId);
  if (!context.ok) {
    return { error: context.error.message, ok: false };
  }
  return {
    ok: true,
    value: {
      actingUserId: user.id,
      clerkOrgId: context.value.clerkOrgId as ClerkOrgId,
      organisationId: context.value.organisationId as OrganisationId,
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
  const parsed = AddCustomHolidaySchema.safeParse(input);
  if (!parsed.success) {
    return { error: firstIssue(parsed.error), ok: false };
  }
  const context = await resolveAdminContext(parsed.data.organisationId);
  if (!context.ok) {
    return context;
  }
  const result = await addCustomHoliday({
    appliesToAllJurisdictions: parsed.data.appliesToAllJurisdictions,
    clerkOrgId: context.value.clerkOrgId,
    countryCode: parsed.data.countryCode,
    date: parsed.data.date,
    name: parsed.data.name,
    organisationId: context.value.organisationId,
    regionCode: parsed.data.regionCode,
    userId: context.value.actingUserId,
  });
  if (!result.ok) {
    return { error: result.error.message, ok: false };
  }
  revalidateHolidayPaths();
  return {
    ok: true,
    value: { id: result.value.id, message: `${parsed.data.name} added.` },
  };
}

const DeleteCustomHolidaySchema = z.object({
  holidayId: z.string().uuid(),
  name: z.string().max(200),
  organisationId: z.string().uuid(),
});

export async function deleteCustomHolidayAction(
  input: z.input<typeof DeleteCustomHolidaySchema>
): Promise<ActionResult<{ message: string }>> {
  const parsed = DeleteCustomHolidaySchema.safeParse(input);
  if (!parsed.success) {
    return { error: firstIssue(parsed.error), ok: false };
  }
  const context = await resolveAdminContext(parsed.data.organisationId);
  if (!context.ok) {
    return context;
  }
  const result = await deleteCustomHoliday(
    context.value.clerkOrgId,
    context.value.organisationId,
    parsed.data.holidayId
  );
  if (!result.ok) {
    return { error: result.error.message, ok: false };
  }
  revalidateHolidayPaths();
  return { ok: true, value: { message: `${parsed.data.name} deleted.` } };
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
  const parsed = HolidayKeySchema.safeParse(input);
  if (!parsed.success) {
    return { error: firstIssue(parsed.error), ok: false };
  }
  const context = await resolveAdminContext(parsed.data.organisationId);
  if (!context.ok) {
    return context;
  }
  const result = await hidePublicHoliday({
    actingRole: context.value.role,
    actingUserId: context.value.actingUserId,
    clerkOrgId: context.value.clerkOrgId,
    holidayKey: parsed.data.holidayKey,
    locationId: null,
    organisationId: context.value.organisationId,
  });
  if (!result.ok) {
    return { error: result.error.message, ok: false };
  }
  revalidateHolidayPaths();
  return {
    ok: true,
    value: { message: `${result.value.holidayName} hidden for all locations.` },
  };
}

export async function restoreHolidayAction(
  input: z.input<typeof ScopedKeySchema>
): Promise<ActionResult<{ message: string }>> {
  const parsed = ScopedKeySchema.safeParse(input);
  if (!parsed.success) {
    return { error: firstIssue(parsed.error), ok: false };
  }
  const context = await resolveAdminContext(parsed.data.organisationId);
  if (!context.ok) {
    return context;
  }
  const result = await restorePublicHoliday({
    actingRole: context.value.role,
    actingUserId: context.value.actingUserId,
    clerkOrgId: context.value.clerkOrgId,
    holidayKey: parsed.data.holidayKey,
    locationId: parsed.data.locationId,
    organisationId: context.value.organisationId,
  });
  if (!result.ok) {
    return { error: result.error.message, ok: false };
  }
  revalidateHolidayPaths();
  return {
    ok: true,
    value: {
      message: `${result.value.holidayName} restored ${where(result.value.locationName)}.`,
    },
  };
}

export async function setHolidayClassificationAction(
  input: z.input<typeof ClassificationSchema>
): Promise<ActionResult<{ message: string }>> {
  const parsed = ClassificationSchema.safeParse(input);
  if (!parsed.success) {
    return { error: firstIssue(parsed.error), ok: false };
  }
  const context = await resolveAdminContext(parsed.data.organisationId);
  if (!context.ok) {
    return context;
  }
  const result = await setPublicHolidayClassification({
    actingRole: context.value.role,
    actingUserId: context.value.actingUserId,
    classification: parsed.data.classification,
    clerkOrgId: context.value.clerkOrgId,
    holidayKey: parsed.data.holidayKey,
    locationId: parsed.data.locationId,
    organisationId: context.value.organisationId,
  });
  if (!result.ok) {
    return { error: result.error.message, ok: false };
  }
  revalidateHolidayPaths();
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

export async function setLocalHolidayEnabledAction(
  input: z.input<typeof LocalDaySchema>
): Promise<ActionResult<{ message: string }>> {
  const parsed = LocalDaySchema.safeParse(input);
  if (!parsed.success) {
    return { error: firstIssue(parsed.error), ok: false };
  }
  const context = await resolveAdminContext(parsed.data.organisationId);
  if (!context.ok) {
    return context;
  }
  const result = await setLocalHolidayEnabled({
    actingRole: context.value.role,
    actingUserId: context.value.actingUserId,
    clerkOrgId: context.value.clerkOrgId,
    enabled: parsed.data.enabled,
    holidayKey: parsed.data.holidayKey,
    locationId: parsed.data.locationId,
    organisationId: context.value.organisationId,
  });
  if (!result.ok) {
    return { error: result.error.message, ok: false };
  }
  revalidateHolidayPaths();
  return {
    ok: true,
    value: {
      message: `${result.value.holidayName} switched ${parsed.data.enabled ? "on" : "off"} ${where(result.value.locationName)}.`,
    },
  };
}
