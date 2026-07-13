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
    personId: z.string().uuid(),
    recordType: RecordTypeSchema,
    title: z.string().min(1).max(200),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
    allDay: z.boolean().default(true),
    workingLocation: z.string().max(200).optional(),
    contactability: ContactabilityStatusSchema.default("contactable"),
    preferredContactMethod: z.string().max(200).optional(),
    notesInternal: z.string().max(2000).optional(),
    includeInFeed: z.boolean().default(true),
    privacyMode: PrivacyModeSchema.default("named"),
  })
  .refine((value) => value.endsAt >= value.startsAt, {
    message: "End date must be after start date",
    path: ["endsAt"],
  });

export type ManualAvailabilityInput = z.infer<
  typeof ManualAvailabilityInputSchema
>;

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
    where: {
      ...scopedQuery(tenant.clerkOrgId, tenant.organisationId),
      archived_at: null,
      ...(range?.personId ? { person_id: range.personId } : {}),
      ...(range?.startsBefore
        ? { starts_at: { lte: range.startsBefore } }
        : {}),
      ...(range?.endsAfter ? { ends_at: { gte: range.endsAfter } } : {}),
    },
    include: { person: true },
    orderBy: [{ starts_at: "asc" }, { title: "asc" }],
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
      ok: false,
      error: appError(
        "bad_request",
        parsed.error.issues[0]?.message ?? "Invalid availability record"
      ),
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
    return { ok: false, error: appError("not_found", "Person not found") };
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
    select: { id: true },
  });

  if (duplicate) {
    return {
      ok: false,
      error: appError("conflict", DUPLICATE_MANUAL_MESSAGE),
    };
  }

  const id = randomUUID();
  try {
    const record = await database.availabilityRecord.create({
      data: {
        id,
        person_id: parsed.data.personId,
        record_type: parsed.data.recordType,
        title: parsed.data.title,
        starts_at: parsed.data.startsAt,
        ends_at: parsed.data.endsAt,
        all_day: parsed.data.allDay,
        working_location: parsed.data.workingLocation,
        contactability: parsed.data.contactability,
        preferred_contact_method: parsed.data.preferredContactMethod,
        notes_internal: parsed.data.notesInternal,
        include_in_feed: parsed.data.includeInFeed,
        privacy_mode: parsed.data.privacyMode,
        approval_status: "approved",
        approved_at: new Date(),
        clerk_org_id: tenant.clerkOrgId,
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
        organisation_id: tenant.organisationId,
        source_type: "manual",
        updated_by_user_id: actor.userId,
      },
      include: { person: true },
    });

    await materialisePublication(tenant, record.id);

    return { ok: true, value: mapRecord(record) };
  } catch (error) {
    if (isUniqueConflict(error)) {
      return {
        ok: false,
        error: appError("conflict", DUPLICATE_MANUAL_MESSAGE),
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
  const parsed = ManualAvailabilityInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: appError(
        "bad_request",
        parsed.error.issues[0]?.message ?? "Invalid availability record"
      ),
    };
  }

  const existing = await database.availabilityRecord.findFirst({
    where: {
      ...scopedQuery(tenant.clerkOrgId, tenant.organisationId),
      archived_at: null,
      id: recordId,
      source_type: "manual",
    },
    select: {
      person_id: true,
      person: {
        select: {
          clerk_user_id: true,
          id: true,
          manager_person_id: true,
        },
      },
    },
  });

  if (!existing) {
    return { ok: false, error: appError("not_found", "Record not found") };
  }

  const authorisation = await authoriseManualAvailabilityActor(
    tenant,
    actor,
    existing.person
  );
  if (!authorisation.ok) {
    return authorisation;
  }

  const duplicate = await database.availabilityRecord.findFirst({
    where: {
      ...scopedQuery(tenant.clerkOrgId, tenant.organisationId),
      archived_at: null,
      ends_at: parsed.data.endsAt,
      id: { not: recordId },
      person_id: existing.person_id,
      record_type: parsed.data.recordType,
      source_remote_id: null,
      source_type: "manual",
      starts_at: parsed.data.startsAt,
    },
    select: { id: true },
  });

  if (duplicate) {
    return {
      ok: false,
      error: appError("conflict", DUPLICATE_MANUAL_MESSAGE),
    };
  }

  try {
    const derivedUidKey = deriveAvailabilityUidKey({
      clerkOrgId: tenant.clerkOrgId,
      endsAt: parsed.data.endsAt,
      organisationId: tenant.organisationId,
      personId: existing.person_id,
      recordType: parsed.data.recordType,
      sourceType: "manual",
      stableSourceKey: recordId,
      startsAt: parsed.data.startsAt,
    });
    const record = await database.availabilityRecord.update({
      where: { id: recordId },
      data: {
        record_type: parsed.data.recordType,
        title: parsed.data.title,
        starts_at: parsed.data.startsAt,
        ends_at: parsed.data.endsAt,
        all_day: parsed.data.allDay,
        working_location: parsed.data.workingLocation,
        contactability: parsed.data.contactability,
        preferred_contact_method: parsed.data.preferredContactMethod,
        notes_internal: parsed.data.notesInternal,
        include_in_feed: parsed.data.includeInFeed,
        privacy_mode: parsed.data.privacyMode,
        derived_uid_key: derivedUidKey,
        updated_by_user_id: actor.userId,
      },
      include: { person: true },
    });

    await materialisePublication(tenant, record.id);

    return { ok: true, value: mapRecord(record) };
  } catch (error) {
    if (isUniqueConflict(error)) {
      return {
        ok: false,
        error: appError("conflict", DUPLICATE_MANUAL_MESSAGE),
      };
    }
    throw error;
  }
};

export const updateAvailabilityApprovalStatus = async (
  tenant: TenantContext,
  recordId: string,
  approvalStatus: "approved" | "declined",
  userId: string
): Promise<Result<void>> => {
  const existing = await database.availabilityRecord.findFirst({
    where: {
      ...scopedQuery(tenant.clerkOrgId, tenant.organisationId),
      archived_at: null,
      approval_status: "submitted",
      id: recordId,
    },
  });

  if (!existing) {
    return {
      ok: false,
      error: appError("not_found", "Pending availability record not found"),
    };
  }

  await database.availabilityRecord.update({
    where: { id: recordId },
    data: {
      approval_status: approvalStatus,
      approved_at: approvalStatus === "approved" ? new Date() : null,
      publish_status:
        approvalStatus === "approved" ? existing.publish_status : "suppressed",
      updated_by_user_id: userId,
    },
  });

  await materialisePublication(tenant, recordId);

  return { ok: true, value: undefined };
};

export const archiveManualAvailability = async (
  tenant: TenantContext,
  recordId: string,
  actor: ManualAvailabilityActor
): Promise<Result<void, ManualAvailabilityServiceError>> => {
  const existing = await database.availabilityRecord.findFirst({
    where: {
      ...scopedQuery(tenant.clerkOrgId, tenant.organisationId),
      archived_at: null,
      id: recordId,
      source_type: "manual",
    },
    select: {
      person: {
        select: {
          clerk_user_id: true,
          id: true,
          manager_person_id: true,
        },
      },
    },
  });

  if (!existing) {
    return { ok: false, error: appError("not_found", "Record not found") };
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
    where: { id: recordId },
    data: {
      archived_at: new Date(),
      publish_status: "archived",
      updated_by_user_id: actor.userId,
    },
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
    where: {
      ...scopedQuery(tenant.clerkOrgId, tenant.organisationId),
      archived_at: null,
      clerk_user_id: actor.userId,
    },
    select: { id: true },
  });

  const isOwner = targetPerson.clerk_user_id === actor.userId;
  const isDirectManager = targetPerson.manager_person_id === actingPerson?.id;

  if (isOwner || isDirectManager) {
    return { ok: true, value: undefined };
  }

  return {
    ok: false,
    error: {
      code: "not_authorised",
      message: "You do not have permission to manage this availability record.",
    },
  };
}

function isAdminOrOwner(role?: string | null): boolean {
  return role === "org:admin" || role === "org:owner";
}
