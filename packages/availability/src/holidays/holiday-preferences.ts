import type { Result } from "@repo/core";
import { database, scopedQuery } from "@repo/database";
import { z } from "zod";
import { findReferenceHoliday } from "./reference/reference-holidays";
import {
  CUSTOM_HOLIDAY_KEY_PREFIX,
  type HolidayPreferenceSetting,
} from "./resolve-public-holidays";

export type HolidayPreferenceError =
  | { code: "not_authorised"; message: string }
  | { code: "unknown_error"; message: string }
  | { code: "validation_error"; message: string };

export interface HolidayPreferenceReceipt {
  holidayName: string;
  locationName: string | null;
}

const BaseSchema = z.object({
  actingRole: z.string(),
  actingUserId: z.string().min(1),
  clerkOrgId: z.string().min(1),
  holidayKey: z.string().min(1).max(200),
  organisationId: z.string().uuid(),
});

const ScopeSchema = BaseSchema.extend({
  locationId: z.string().uuid().nullable(),
});
const LocationSchema = BaseSchema.extend({ locationId: z.string().uuid() });
const ClassificationSchema = LocationSchema.extend({
  classification: z.enum(["working", "non_working"]),
});
const LocalDaySchema = LocationSchema.extend({ enabled: z.boolean() });

type Base = z.infer<typeof BaseSchema>;
type Transaction = Parameters<Parameters<typeof database.$transaction>[0]>[0];

const failure = (
  code: HolidayPreferenceError["code"],
  message: string
): { ok: false; error: HolidayPreferenceError } => ({
  error: { code, message },
  ok: false,
});

async function resolveHoliday(
  input: Base
): Promise<{ kind: string; name: string } | null> {
  if (input.holidayKey.startsWith(CUSTOM_HOLIDAY_KEY_PREFIX)) {
    const id = input.holidayKey.slice(CUSTOM_HOLIDAY_KEY_PREFIX.length);
    if (!z.string().uuid().safeParse(id).success) {
      return null;
    }
    const custom = await database.publicHoliday.findFirst({
      select: { name: true },
      where: {
        ...scopedQuery(input.clerkOrgId, input.organisationId),
        id,
        source: "manual",
      },
    });
    return custom ? { kind: "custom", name: custom.name } : null;
  }
  const reference = findReferenceHoliday(input.holidayKey);
  return reference ? { kind: reference.kind, name: reference.name } : null;
}

async function resolveLocationName(
  input: Base,
  locationId: string | null
): Promise<{ ok: true; name: string | null } | { ok: false }> {
  if (locationId === null) {
    return { name: null, ok: true };
  }
  const location = await database.location.findFirst({
    select: { id: true, name: true },
    where: {
      ...scopedQuery(input.clerkOrgId, input.organisationId),
      id: locationId,
    },
  });
  return location ? { name: location.name, ok: true } : { ok: false };
}

async function writeAudit(
  tx: Transaction,
  input: Base,
  action: string,
  details: {
    after: HolidayPreferenceSetting | null;
    before: HolidayPreferenceSetting | null;
    locationId: string | null;
  }
) {
  await tx.auditEvent.create({
    data: {
      action,
      actor_user_id: input.actingUserId,
      after_value: { locationId: details.locationId, setting: details.after },
      before_value: { locationId: details.locationId, setting: details.before },
      clerk_org_id: input.clerkOrgId,
      entity_id: input.holidayKey,
      entity_type: "public_holiday",
      metadata: {
        actingUserId: input.actingUserId,
        locationId: details.locationId,
      },
      organisation_id: input.organisationId,
      payload: { holidayKey: input.holidayKey, locationId: details.locationId },
      resource_id: input.holidayKey,
      resource_type: "public_holiday",
    },
  });
}

/**
 * Validates role, holiday and location, then applies one preference change and
 * its audit event in a single transaction. A null setting removes the row.
 */
async function applyPreference(
  input: Base & { locationId: string | null },
  setting: HolidayPreferenceSetting | null,
  action: string,
  check?: (holiday: { kind: string }) => string | null
): Promise<Result<HolidayPreferenceReceipt, HolidayPreferenceError>> {
  if (!(input.actingRole === "owner" || input.actingRole === "admin")) {
    return failure(
      "not_authorised",
      "Only owners and admins can change public holidays."
    );
  }
  try {
    const holiday = await resolveHoliday(input);
    if (!holiday) {
      return failure("validation_error", "That public holiday was not found.");
    }
    const problem = check?.(holiday);
    if (problem) {
      return failure("validation_error", problem);
    }
    const location = await resolveLocationName(input, input.locationId);
    if (!location.ok) {
      return failure(
        "validation_error",
        "Choose a location from this organisation."
      );
    }

    const where = {
      ...scopedQuery(input.clerkOrgId, input.organisationId),
      holiday_key: input.holidayKey,
      location_id: input.locationId,
    };
    await database.$transaction(async (tx) => {
      const existing = await tx.publicHolidayPreference.findFirst({
        select: { id: true, setting: true },
        where,
      });
      if (setting === null) {
        await tx.publicHolidayPreference.deleteMany({ where });
      } else if (existing) {
        await tx.publicHolidayPreference.update({
          data: { setting, updated_by_user_id: input.actingUserId },
          where: { id: existing.id },
        });
      } else {
        await tx.publicHolidayPreference.create({
          data: {
            clerk_org_id: input.clerkOrgId,
            created_by_user_id: input.actingUserId,
            holiday_key: input.holidayKey,
            location_id: input.locationId,
            organisation_id: input.organisationId,
            setting,
            updated_by_user_id: input.actingUserId,
          },
        });
      }
      await writeAudit(tx, input, action, {
        after: setting,
        before: existing?.setting ?? null,
        locationId: input.locationId,
      });
    });

    return {
      ok: true,
      value: { holidayName: holiday.name, locationName: location.name },
    };
  } catch {
    return failure("unknown_error", "Failed to update the public holiday.");
  }
}

function parsed<T extends z.ZodType>(
  schema: T,
  input: unknown
):
  | { ok: true; value: z.infer<T> }
  | { ok: false; error: HolidayPreferenceError } {
  const result = schema.safeParse(input);
  return result.success
    ? { ok: true, value: result.data }
    : failure(
        "validation_error",
        result.error.issues[0]?.message ?? "Invalid input."
      );
}

/** Hides a holiday for one location, or for every location when locationId is null. */
export function hidePublicHoliday(input: z.input<typeof ScopeSchema>) {
  const value = parsed(ScopeSchema, input);
  return value.ok
    ? applyPreference(value.value, "hidden", "public_holidays.hidden")
    : Promise.resolve(value);
}

/** Removes the preference at that scope, returning the holiday to its default. */
export function restorePublicHoliday(input: z.input<typeof ScopeSchema>) {
  const value = parsed(ScopeSchema, input);
  return value.ok
    ? applyPreference(value.value, null, "public_holidays.restored")
    : Promise.resolve(value);
}

export function setPublicHolidayClassification(
  input: z.input<typeof ClassificationSchema>
) {
  const value = parsed(ClassificationSchema, input);
  return value.ok
    ? applyPreference(
        value.value,
        value.value.classification,
        "public_holidays.classification_changed"
      )
    : Promise.resolve(value);
}

export function setLocalHolidayEnabled(input: z.input<typeof LocalDaySchema>) {
  const value = parsed(LocalDaySchema, input);
  if (!value.ok) {
    return Promise.resolve(value);
  }
  const onlyLocal = (holiday: { kind: string }) =>
    holiday.kind === "local"
      ? null
      : "Only local holidays can be switched on for a location.";
  return value.value.enabled
    ? applyPreference(
        value.value,
        "non_working",
        "public_holidays.local_day_enabled",
        onlyLocal
      )
    : applyPreference(
        value.value,
        null,
        "public_holidays.local_day_disabled",
        onlyLocal
      );
}
