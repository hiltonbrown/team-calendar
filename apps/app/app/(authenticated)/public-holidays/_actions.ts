"use server";

import { requireRole } from "@repo/auth/helpers";
import { currentUser } from "@repo/auth/server";
import {
  addCustomHoliday,
  deleteCustomHoliday,
  importForJurisdiction,
  restoreHoliday,
  suppressHoliday,
} from "@repo/availability";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getActiveOrgContext } from "@/lib/server/get-active-org-context";

const ImportHolidaySchema = z.object({
  countryCode: z.string().length(2),
  organisationId: z.string().uuid(),
  regionCode: z.string().nullable(),
  year: z.number().int().min(2000).max(2100),
});

const canManageHolidays = async (): Promise<boolean> =>
  (await requireRole("org:admin")) || (await requireRole("org:owner"));

export async function importFromSourceAction(
  input: z.infer<typeof ImportHolidaySchema>
) {
  const parsed = ImportHolidaySchema.safeParse(input);
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Invalid input",
      ok: false as const,
    };
  }

  const hasAccess = await canManageHolidays();
  if (!hasAccess) {
    return { error: "Permission denied", ok: false as const };
  }

  const user = await currentUser();
  if (!user) {
    return { error: "You need to sign in again.", ok: false as const };
  }

  const contextResult = await getActiveOrgContext(parsed.data.organisationId);
  if (!contextResult.ok) {
    return { error: contextResult.error.message, ok: false as const };
  }

  const result = await importForJurisdiction({
    clerkOrgId: contextResult.value.clerkOrgId,
    countryCode: parsed.data.countryCode,
    organisationId: contextResult.value.organisationId,
    regionCode: parsed.data.regionCode,
    userId: user.id,
    year: parsed.data.year,
  });

  if (!result.ok) {
    return { error: result.error.message, ok: false as const };
  }

  revalidatePath("/public-holidays");
  revalidatePath("/settings/holidays");
  revalidatePath("/calendar");

  return result;
}

const AddCustomHolidaySchema = z.object({
  appliesToAllJurisdictions: z.boolean(),
  date: z.coerce.date(),
  jurisdictionId: z.string().uuid().nullable(),
  name: z.string().min(1).max(100),
  organisationId: z.string().uuid(),
  recursAnnually: z.boolean(),
});

export async function addCustomHolidayAction(
  input: z.infer<typeof AddCustomHolidaySchema>
) {
  const parsed = AddCustomHolidaySchema.safeParse(input);
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Invalid input",
      ok: false as const,
    };
  }

  const hasAccess = await canManageHolidays();
  if (!hasAccess) {
    return { error: "Permission denied", ok: false as const };
  }

  const user = await currentUser();
  if (!user) {
    return { error: "You need to sign in again.", ok: false as const };
  }

  const contextResult = await getActiveOrgContext(parsed.data.organisationId);
  if (!contextResult.ok) {
    return { error: contextResult.error.message, ok: false as const };
  }

  const result = await addCustomHoliday({
    appliesToAllJurisdictions: parsed.data.appliesToAllJurisdictions,
    clerkOrgId: contextResult.value.clerkOrgId,
    date: parsed.data.date,
    jurisdictionId: parsed.data.jurisdictionId,
    name: parsed.data.name,
    organisationId: contextResult.value.organisationId,
    recursAnnually: parsed.data.recursAnnually,
    userId: user.id,
  });

  if (!result.ok) {
    return { error: result.error.message, ok: false as const };
  }

  revalidatePath("/public-holidays");
  revalidatePath("/settings/holidays");
  revalidatePath("/calendar");

  return result;
}

const HolidayIdSchema = z.object({
  holidayId: z.string().uuid(),
  organisationId: z.string().uuid(),
});

export async function suppressHolidayAction(
  input: z.infer<typeof HolidayIdSchema>
) {
  const parsed = HolidayIdSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Invalid input", ok: false as const };
  }

  const hasAccess = await canManageHolidays();
  if (!hasAccess) {
    return { error: "Permission denied", ok: false as const };
  }

  const user = await currentUser();
  if (!user) {
    return { error: "You need to sign in again.", ok: false as const };
  }

  const contextResult = await getActiveOrgContext(parsed.data.organisationId);
  if (!contextResult.ok) {
    return { error: contextResult.error.message, ok: false as const };
  }

  const result = await suppressHoliday(
    contextResult.value.clerkOrgId,
    contextResult.value.organisationId,
    parsed.data.holidayId,
    user.id
  );

  if (!result.ok) {
    return { error: result.error.message, ok: false as const };
  }

  revalidatePath("/public-holidays");
  revalidatePath("/settings/holidays");
  revalidatePath("/calendar");

  return result;
}

export async function restoreHolidayAction(
  input: z.infer<typeof HolidayIdSchema>
) {
  const parsed = HolidayIdSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Invalid input", ok: false as const };
  }

  const hasAccess = await canManageHolidays();
  if (!hasAccess) {
    return { error: "Permission denied", ok: false as const };
  }

  const user = await currentUser();
  if (!user) {
    return { error: "You need to sign in again.", ok: false as const };
  }

  const contextResult = await getActiveOrgContext(parsed.data.organisationId);
  if (!contextResult.ok) {
    return { error: contextResult.error.message, ok: false as const };
  }

  const result = await restoreHoliday(
    contextResult.value.clerkOrgId,
    contextResult.value.organisationId,
    parsed.data.holidayId,
    user.id
  );

  if (!result.ok) {
    return { error: result.error.message, ok: false as const };
  }

  revalidatePath("/public-holidays");
  revalidatePath("/settings/holidays");
  revalidatePath("/calendar");

  return result;
}

export async function deleteCustomHolidayAction(
  input: z.infer<typeof HolidayIdSchema>
) {
  const parsed = HolidayIdSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Invalid input", ok: false as const };
  }

  const hasAccess = await canManageHolidays();
  if (!hasAccess) {
    return { error: "Permission denied", ok: false as const };
  }

  const contextResult = await getActiveOrgContext(parsed.data.organisationId);
  if (!contextResult.ok) {
    return { error: contextResult.error.message, ok: false as const };
  }

  const result = await deleteCustomHoliday(
    contextResult.value.clerkOrgId,
    contextResult.value.organisationId,
    parsed.data.holidayId
  );

  if (!result.ok) {
    return { error: result.error.message, ok: false as const };
  }

  revalidatePath("/public-holidays");
  revalidatePath("/settings/holidays");
  revalidatePath("/calendar");

  return result;
}
