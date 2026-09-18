import "server-only";

import { randomUUID } from "node:crypto";
import { type AppError, appError, type Result } from "@repo/core";
import { database, scopedQuery } from "@repo/database";
import { Prisma } from "@repo/database/generated/client";
import { materialiseAvailabilityPublication } from "@repo/feeds";
import { log } from "@repo/observability/log";
import { z } from "zod";
import type { TenantContext } from "../people/current-user-service";
import { deriveAvailabilityUidKey } from "../sync/availability-uid";

const RecordTypeSchema = z.enum([
  "leave",
  "wfh",
  "travel",
  "training",
  "client_site",
]);

const PrivacyModeSchema = z.enum(["named", "masked", "private"]);
const ContactabilityStatusSchema = z.enum([
  "contactable",
  "limited",
  "unavailable",
]);

export const ManualAvailabilityInputSchema = z
  .object({
    allDay: z.boolean().default(true),
    contactability: ContactabilityStatusSchema.default("contactable"),
    endsAt: z.coerce.date(),
    includeInFeed: z.boolean().default(true),
    notesInternal: z.string().max(2000).nullable().optional(),
    personId: z.string().uuid(),
    preferredContactMethod: z.string().max(200).nullable().optional(),
    privacyMode: PrivacyModeSchema.default("named"),
    recordType: RecordTypeSchema,
    startsAt: z.coerce.date(),
    title: z.string().min(1).max(200),
    workingLocation: z.string().max(200).nullable().optional(),
  })
  .refine((value) => value.endsAt >= value.startsAt, {
    message: "End date must be after start date",
    path: ["endsAt"],
  });

export type ManualAvailabilityInput = z.infer<
  typeof ManualAvailabilityInputSchema
>;

const ManualAvailabilityPatchSchema = z
  .object({
    allDay: z.boolean().optional(),
    contactability: ContactabilityStatusSchema.optional(),
    endsAt: z.coerce.date().optional(),
    includeInFeed: z.boolean().optional(),
    notesInternal: z.string().max(2000).nullable().optional(),
    personId: z.string().uuid().optional(),
    preferredContactMethod: z.string().max(200).nullable().optional(),
    privacyMode: PrivacyModeSchema.optional(),
    recordType: RecordTypeSchema.optional(),
    startsAt: z.coerce.date().optional(),
    title: z.string().min(1).max(200).optional(),
    workingLocation: z.string().max(200).nullable().optional(),
  })
  .strict();

const ManualAvailabilityEditableStateSchema = z
  .object({
    allDay: z.boolean(),
    contactability: ContactabilityStatusSchema,
    endsAt: z.coerce.date(),
    includeInFeed: z.boolean(),
    notesInternal: z.string().max(2000).nullable(),
    preferredContactMethod: z.string().max(200).nullable(),
    privacyMode: PrivacyModeSchema,
    recordType: RecordTypeSchema,
    startsAt: z.coerce.date(),
    title: z.string().min(1).max(200),
    workingLocation: z.string().max(200).nullable(),
  })
  .refine((value) => value.endsAt >= value.startsAt, {
    message: "End date must be after start date",
    path: ["endsAt"],
  });

type ManualAvailabilityPatch = z.infer<typeof ManualAvailabilityPatchSchema>;

function mergeManualAvailabilityPatch(
  existing: {
    all_day: boolean;
    contactability: string;
    ends_at: Date;
    include_in_feed: boolean;
    notes_internal: string | null;
    preferred_contact_method: string | null;
    privacy_mode: string;
    record_type: string;
    starts_at: Date;
    title: string | null;
    working_location: string | null;
  },
  patch: ManualAvailabilityPatch
) {
  return ManualAvailabilityEditableStateSchema.safeParse({
    allDay: patch.allDay ?? existing.all_day,
    contactability: patch.contactability ?? existing.contactability,
    endsAt: patch.endsAt ?? existing.ends_at,
    includeInFeed: patch.includeInFeed ?? existing.include_in_feed,
    notesInternal:
      patch.notesInternal === undefined
        ? existing.notes_internal
        : patch.notesInternal,
    preferredContactMethod:
      patch.preferredContactMethod === undefined
        ? existing.preferred_contact_method
        : patch.preferredContactMethod,
    privacyMode: patch.privacyMode ?? existing.privacy_mode,
    recordType: patch.recordType ?? existing.record_type,
    startsAt: patch.startsAt ?? existing.starts_at,
    title: patch.title ?? existing.title,
    workingLocation:
      patch.workingLocation === undefined
        ? existing.working_location
        : patch.workingLocation,
  });
}

export interface ManualAvailabilityActor {
  orgRole?: string | null;
  userId: string;
}

export type ManualAvailabilityServiceError =
  | AppError
  | { code: "not_authorised"; message: string };

export interface AvailabilityRecordView {
  allDay: boolean;
  contactability: string;
  endsAt: Date;
  id: string;
  includeInFeed: boolean;
  notesInternal: string | null;
  personEmail: string | null;
  personId: string;
  personName: string;
  privacyMode: string;
  recordType: string;
  startsAt: Date;
  title: string;
  workingLocation: string | null;
}

const mapRecord = (record: {
  all_day: boolean;
  contactability: string | null;
  ends_at: Date;
  id: string;
  include_in_feed: boolean;
  notes_internal: string | null;
  person: {
    display_name: string | null;
    email: string | null;
    first_name: string;
    id: string;
    last_name: string;
  };
  privacy_mode: string | null;
  record_type: string;
  starts_at: Date;
  title: string | null;
  working_location: string | null;
}): AvailabilityRecordView => ({
  allDay: record.all_day,
  contactability: record.contactability ?? "contactable",
  endsAt: record.ends_at,
  id: record.id,
  includeInFeed: record.include_in_feed,
  notesInternal: record.notes_internal,
  personEmail: record.person.email,
  personId: record.person.id,
  personName:
    record.person.display_name ??
    `${record.person.first_name} ${record.person.last_name}`,
  privacyMode: record.privacy_mode ?? "named",
  recordType: record.record_type,
  startsAt: record.starts_at,
  title: record.title ?? "",
  workingLocation: record.working_location,
});

export const listAvailabilityRecords = async (
  tenant: TenantContext,
  range?: { startsBefore?: Date; endsAfter?: Date; personId?: string }
): Promise<AvailabilityRecordView[]> => {
  const records = await database.availabilityRecord.findMany({
    include: { person: true },
    orderBy: [{ starts_at: "asc" }, { title: "asc" }],
    where: {
      ...scopedQuery(tenant.clerkOrgId, tenant.organisationId),
      archived_at: null,
      ...(range?.personId ? { person_id: range.personId } : {}),
      ...(range?.startsBefore
        ? { starts_at: { lte: range.startsBefore } }
        : {}),
      ...(range?.endsAfter ? { ends_at: { gte: range.endsAfter } } : {}),
    },
  });

  return records.map(mapRecord);
};

const DUPLICATE_MANUAL_MESSAGE =
  "A matching manual availability record already exists.";

// The partial unique index `availability_records_manual_identity_key` (see the
// migration of the same name) is the atomic backstop for the pre-insert checks
// below; a concurrent insert that races past them surfaces here as P2002.
const isUniqueConflict = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  error.code === "P2002";

export const createManualAvailability = async (
  tenant: TenantContext,
  input: unknown,
  actor: ManualAvailabilityActor
): Promise<Result<AvailabilityRecordView, ManualAvailabilityServiceError>> => {
  const parsed = ManualAvailabilityInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      error: appError(
        "bad_request",
        parsed.error.issues[0]?.message ?? "Invalid availability record"
      ),
      ok: false,
    };
  }

  const person = await database.person.findFirst({
    where: {
      ...scopedQuery(tenant.clerkOrgId, tenant.organisationId),
      archived_at: null,
      id: parsed.data.personId,
    },
  });

  if (!person) {
    return { error: appError("not_found", "Person not found"), ok: false };
  }

  const authorisation = await authoriseManualAvailabilityActor(
    tenant,
    actor,
    person
  );
  if (!authorisation.ok) {
    return authorisation;
  }

  const duplicate = await database.availabilityRecord.findFirst({
    select: { id: true },
    where: {
      ...scopedQuery(tenant.clerkOrgId, tenant.organisationId),
      archived_at: null,
      ends_at: parsed.data.endsAt,
      person_id: parsed.data.personId,
      record_type: parsed.data.recordType,
      source_remote_id: null,
      source_type: "manual",
      starts_at: parsed.data.startsAt,
    },
  });

  if (duplicate) {
    return {
      error: appError("conflict", DUPLICATE_MANUAL_MESSAGE),
      ok: false,
    };
  }

  const id = randomUUID();
  try {
    const record = await database.availabilityRecord.create({
      data: {
        all_day: parsed.data.allDay,
        approval_status: "approved",
        approved_at: new Date(),
        clerk_org_id: tenant.clerkOrgId,
        contactability: parsed.data.contactability,
        created_by_user_id: actor.userId,
        derived_uid_key: deriveAvailabilityUidKey({
          clerkOrgId: tenant.clerkOrgId,
          endsAt: parsed.data.endsAt,
          organisationId: tenant.organisationId,
          personId: parsed.data.personId,
          recordType: parsed.data.recordType,
          sourceType: "manual",
          stableSourceKey: id,
          startsAt: parsed.data.startsAt,
        }),
        ends_at: parsed.data.endsAt,
        id,
        include_in_feed: parsed.data.includeInFeed,
        notes_internal: parsed.data.notesInternal,
        organisation_id: tenant.organisationId,
        person_id: parsed.data.personId,
        preferred_contact_method: parsed.data.preferredContactMethod,
        privacy_mode: parsed.data.privacyMode,
        record_type: parsed.data.recordType,
        source_type: "manual",
        starts_at: parsed.data.startsAt,
        title: parsed.data.title,
        updated_by_user_id: actor.userId,
        working_location: parsed.data.workingLocation,
      },
      include: { person: true },
    });

    await materialisePublication(tenant, record.id);

    return { ok: true, value: mapRecord(record) };
  } catch (error) {
    if (isUniqueConflict(error)) {
      return {
        error: appError("conflict", DUPLICATE_MANUAL_MESSAGE),
        ok: false,
      };
    }
    throw error;
  }
};

export const updateManualAvailability = async (
  tenant: TenantContext,
  recordId: string,
  input: unknown,
  actor: ManualAvailabilityActor
): Promise<Result<AvailabilityRecordView, ManualAvailabilityServiceError>> => {
  const parsed = ManualAvailabilityPatchSchema.safeParse(input);
  if (!parsed.success) {
    return {
      error: appError(
        "bad_request",
        parsed.error.issues[0]?.message ?? "Invalid availability record"
      ),
      ok: false,
    };
  }

  const existing = await database.availabilityRecord.findFirst({
    select: {
      all_day: true,
      contactability: true,
      ends_at: true,
      include_in_feed: true,
      notes_internal: true,
      person: {
        select: {
          clerk_user_id: true,
          id: true,
          manager_person_id: true,
        },
      },
      person_id: true,
      preferred_contact_method: true,
      privacy_mode: true,
      record_type: true,
      starts_at: true,
      title: true,
      working_location: true,
    },
    where: {
      ...scopedQuery(tenant.clerkOrgId, tenant.organisationId),
      archived_at: null,
      id: recordId,
      source_type: "manual",
    },
  });

  if (!existing) {
    return { error: appError("not_found", "Record not found"), ok: false };
  }

  const authorisation = await authoriseManualAvailabilityActor(
    tenant,
    actor,
    existing.person
  );
  if (!authorisation.ok) {
    return authorisation;
  }

  if (parsed.data.personId && parsed.data.personId !== existing.person_id) {
    return {
      error: appError(
        "bad_request",
        "An availability record cannot be reassigned to another person."
      ),
      ok: false,
    };
  }

  const merged = mergeManualAvailabilityPatch(existing, parsed.data);
  if (!merged.success) {
    return {
      error: appError(
        "bad_request",
        merged.error.issues[0]?.message ?? "Invalid availability record"
      ),
      ok: false,
    };
  }

  const duplicate = await database.availabilityRecord.findFirst({
    select: { id: true },
    where: {
      ...scopedQuery(tenant.clerkOrgId, tenant.organisationId),
      archived_at: null,
      ends_at: merged.data.endsAt,
      id: { not: recordId },
      person_id: existing.person_id,
      record_type: merged.data.recordType,
      source_remote_id: null,
      source_type: "manual",
      starts_at: merged.data.startsAt,
    },
  });

  if (duplicate) {
    return {
      error: appError("conflict", DUPLICATE_MANUAL_MESSAGE),
      ok: false,
    };
  }

  try {
    const derivedUidKey = deriveAvailabilityUidKey({
      clerkOrgId: tenant.clerkOrgId,
      endsAt: merged.data.endsAt,
      organisationId: tenant.organisationId,
      personId: existing.person_id,
      recordType: merged.data.recordType,
      sourceType: "manual",
      stableSourceKey: recordId,
      startsAt: merged.data.startsAt,
    });
    const record = await database.availabilityRecord.update({
      data: {
        all_day: merged.data.allDay,
        contactability: merged.data.contactability,
        derived_uid_key: derivedUidKey,
        ends_at: merged.data.endsAt,
        include_in_feed: merged.data.includeInFeed,
        notes_internal: merged.data.notesInternal,
        preferred_contact_method: merged.data.preferredContactMethod,
        privacy_mode: merged.data.privacyMode,
        record_type: merged.data.recordType,
        starts_at: merged.data.startsAt,
        title: merged.data.title,
        updated_by_user_id: actor.userId,
        working_location: merged.data.workingLocation,
      },
      include: { person: true },
      where: {
        ...scopedQuery(tenant.clerkOrgId, tenant.organisationId),
        archived_at: null,
        id: recordId,
        source_type: "manual",
      },
    });

    await materialisePublication(tenant, record.id);

    return { ok: true, value: mapRecord(record) };
  } catch (error) {
    if (isUniqueConflict(error)) {
      return {
        error: appError("conflict", DUPLICATE_MANUAL_MESSAGE),
        ok: false,
      };
    }
    throw error;
  }
};

export const archiveManualAvailability = async (
  tenant: TenantContext,
  recordId: string,
  actor: ManualAvailabilityActor
): Promise<Result<void, ManualAvailabilityServiceError>> => {
  const existing = await database.availabilityRecord.findFirst({
    select: {
      person: {
        select: {
          clerk_user_id: true,
          id: true,
          manager_person_id: true,
        },
      },
    },
    where: {
      ...scopedQuery(tenant.clerkOrgId, tenant.organisationId),
      archived_at: null,
      id: recordId,
      source_type: "manual",
    },
  });

  if (!existing) {
    return { error: appError("not_found", "Record not found"), ok: false };
  }

  const authorisation = await authoriseManualAvailabilityActor(
    tenant,
    actor,
    existing.person
  );
  if (!authorisation.ok) {
    return authorisation;
  }

  await database.availabilityRecord.update({
    data: {
      archived_at: new Date(),
      publish_status: "archived",
      updated_by_user_id: actor.userId,
    },
    where: { id: recordId },
  });

  await materialisePublication(tenant, recordId);

  return { ok: true, value: undefined };
};

async function materialisePublication(
  tenant: TenantContext,
  availabilityRecordId: string
): Promise<void> {
  const result = await materialiseAvailabilityPublication({
    availabilityRecordId,
    clerkOrgId: tenant.clerkOrgId,
    organisationId: tenant.organisationId,
  });
  if (!result.ok) {
    // Best-effort: the availability record is already persisted. Log the failed
    // feed projection rather than failing the write; it is corrected on the next
    // successful materialisation for the record.
    log.error("Failed to materialise availability publication", {
      availabilityRecordId,
      clerkOrgId: tenant.clerkOrgId,
      error: result.error.message,
      organisationId: tenant.organisationId,
    });
  }
}

async function authoriseManualAvailabilityActor(
  tenant: TenantContext,
  actor: ManualAvailabilityActor,
  targetPerson: {
    clerk_user_id: string | null;
    id: string;
    manager_person_id: string | null;
  }
): Promise<Result<void, ManualAvailabilityServiceError>> {
  if (isAdminOrOwner(actor.orgRole)) {
    return { ok: true, value: undefined };
  }

  const actingPerson = await database.person.findFirst({
    select: { id: true },
    where: {
      ...scopedQuery(tenant.clerkOrgId, tenant.organisationId),
      archived_at: null,
      clerk_user_id: actor.userId,
    },
  });

  const isOwner = targetPerson.clerk_user_id === actor.userId;
  const isDirectManager = targetPerson.manager_person_id === actingPerson?.id;

  if (isOwner || isDirectManager) {
    return { ok: true, value: undefined };
  }

  return {
    error: {
      code: "not_authorised",
      message: "You do not have permission to manage this availability record.",
    },
    ok: false,
  };
}

function isAdminOrOwner(role?: string | null): boolean {
  return role === "org:admin" || role === "org:owner";
}
