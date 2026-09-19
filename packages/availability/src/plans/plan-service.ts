import "server-only";

import { randomUUID } from "node:crypto";
import { getAvailabilityRecordLabel, type Result } from "@repo/core";
import {
  database,
  hasUnresolvedSubmitOperation,
  scopedTo,
} from "@repo/database";
import type { Prisma } from "@repo/database/generated/client";
import type {
  availability_approval_status,
  availability_contactability,
  availability_failed_action,
  availability_privacy_mode,
  availability_record_type,
  availability_source_type,
  leave_balance_unit,
} from "@repo/database/generated/enums";
import { materialiseAvailabilityPublication } from "@repo/feeds";
import { log } from "@repo/observability/log";
import { z } from "zod";
import {
  isLocalOnlyType,
  isXeroLeaveType,
  type RecordType,
  USER_CREATABLE_RECORD_TYPES,
} from "../records/record-type-categories";
import { managerScopePersonIds } from "../settings/manager-scope";
import { getSettings } from "../settings/organisation-settings-service";
import { deriveAvailabilityUidKey } from "../sync/availability-uid";
import { hasActiveXeroConnection } from "../xero-connection-state";
import {
  noUnresolvedSubmitOperationWhere,
  unclaimedOrExpiredXeroWriteWhere,
} from "../xero-write-claim";

export type EditableAction =
  | "archive"
  | "delete_draft"
  | "edit"
  | "restore"
  | "retry_submission"
  | "revert_to_draft"
  | "submit_for_approval"
  | "view"
  | "withdraw";

export type PlanServiceError =
  | { code: "record_not_found"; message: string }
  | { code: "not_authorised"; message: string }
  | { code: "not_editable_xero_synced"; message: string }
  | { code: "not_editable_after_submission"; message: string }
  | { code: "not_editable_terminal_state"; message: string }
  | { code: "not_editable_archived"; message: string }
  | { code: "invalid_state_for_delete"; message: string }
  | { code: "invalid_state_for_archive"; message: string }
  | { code: "validation_error"; message: string }
  | { code: "unknown_error"; message: string };

const unresolvedSubmitError = (): PlanServiceError => ({
  code: "not_editable_after_submission",
  message:
    "Xero may have received this leave request. An administrator must resolve it before this record can be changed.",
});

export interface PlanRecord {
  allDay: boolean;
  approvalNote: string | null;
  approvalStatus: availability_approval_status;
  approvedAt: Date | null;
  archivedAt: Date | null;
  clerkOrgId: string;
  contactabilityStatus: availability_contactability;
  createdAt: Date;
  createdByUserId: string | null;
  derivedSequence: number;
  derivedUidKey: string;
  editableActions: EditableAction[];
  endsAt: Date;
  failedAction: availability_failed_action | null;
  id: string;
  notesInternal: string | null;
  organisationId: string;
  person: {
    email: string;
    firstName: string;
    id: string;
    lastName: string;
    locationId: string | null;
    managerPersonId: string | null;
  };
  personId: string;
  privacyMode: availability_privacy_mode;
  recordType: availability_record_type;
  sourceRemoteId: string | null;
  sourceType: availability_source_type;
  startsAt: Date;
  submissionResolutionPending: boolean;
  submittedAt: Date | null;
  updatedAt: Date;
  xeroWriteError: string | null;
}

export interface BalanceChip {
  balanceAvailable: number | null;
  balanceUnavailableReason: "local_only" | "not_synced" | "not_xero_leave";
  currencyCode: string | null;
  leaveBalanceUpdatedAt: Date | null;
  unit: leave_balance_unit | null;
}

export interface RecordListItem extends PlanRecord {
  balanceChip: BalanceChip | null;
}
export interface PlanListPage {
  items: RecordListItem[];
  nextCursor: string | null;
  totalCount: number;
  window: { from: Date | null; to: Date | null };
}

export interface RecordDetail extends RecordListItem {
  xeroWriteErrorMessage: string | null;
}

export interface PlanFilters {
  approvalStatus?: availability_approval_status[];
  dateRange?: { from?: Date; to?: Date };
  includeArchived?: boolean;
  personId?: string[];
  recordType?: availability_record_type[];
  recordTypeCategory?: "all" | "local_only" | "xero_leave";
  sourceType?: availability_source_type[];
}

export interface RoleScopedInput {
  actingOrgRole?: string | null;
}

const RecordTypeSchema = z.enum(USER_CREATABLE_RECORD_TYPES);
const ApprovalStatusSchema = z.enum([
  "draft",
  "submitted",
  "approved",
  "declined",
  "cancelled",
  "withdrawn",
  "xero_sync_failed",
]);
const SourceTypeSchema = z.enum([
  "manual",
  "team_calendar_leave",
  "xero_leave",
  "xero",
]);
const ContactabilitySchema = z.enum([
  "contactable",
  "limited",
  "unavailable",
  "use_alternative_contact",
]);
const PrivacyModeSchema = z.enum(["named", "masked", "private"]);

const FiltersSchema = z.object({
  approvalStatus: z.array(ApprovalStatusSchema).optional(),
  dateRange: z
    .object({
      from: z.coerce.date().optional(),
      to: z.coerce.date().optional(),
    })
    .optional(),
  includeArchived: z.boolean().default(false).optional(),
  personId: z.array(z.string().uuid()).optional(),
  recordType: z.array(RecordTypeSchema).optional(),
  recordTypeCategory: z
    .enum(["all", "local_only", "xero_leave"])
    .default("all")
    .optional(),
  sourceType: z.array(SourceTypeSchema).optional(),
});

const CreateRecordSchema = z
  .object({
    allDay: z.boolean().default(true),
    clerkOrgId: z.string().min(1),
    contactabilityStatus: ContactabilitySchema.default("contactable"),
    createdByUserId: z.string().min(1),
    endsAt: z.coerce.date(),
    notesInternal: z.string().max(2000).optional(),
    organisationId: z.string().uuid(),
    personId: z.string().uuid(),
    privacyMode: PrivacyModeSchema.optional(),
    recordType: RecordTypeSchema,
    startsAt: z.coerce.date(),
  })
  .refine((value) => value.endsAt >= value.startsAt, {
    message: "End date must be after start date",
    path: ["endsAt"],
  });

const UpdateRecordSchema = z.object({
  actingUserId: z.string().min(1),
  clerkOrgId: z.string().min(1),
  organisationId: z.string().uuid(),
  patch: z
    .object({
      allDay: z.boolean().optional(),
      contactabilityStatus: ContactabilitySchema.optional(),
      endsAt: z.coerce.date().optional(),
      notesInternal: z.string().max(2000).nullable().optional(),
      privacyMode: PrivacyModeSchema.optional(),
      recordType: RecordTypeSchema.optional(),
      startsAt: z.coerce.date().optional(),
    })
    .refine(
      (value) =>
        !(value.startsAt && value.endsAt) || value.endsAt >= value.startsAt,
      {
        message: "End date must be after start date",
        path: ["endsAt"],
      }
    ),
  recordId: z.string().uuid(),
});

const RecordActionSchema = z.object({
  actingUserId: z.string().min(1),
  clerkOrgId: z.string().min(1),
  organisationId: z.string().uuid(),
  recordId: z.string().uuid(),
});

export async function listMyRecords(input: {
  clerkOrgId: string;
  filters?: unknown;
  organisationId: string;
  userId: string;
}): Promise<Result<RecordListItem[], PlanServiceError>> {
  const parsedFilters = parseFilters(input.filters);
  if (!parsedFilters.ok) {
    return parsedFilters;
  }

  try {
    const person = await resolvePersonForUser(
      input.clerkOrgId,
      input.organisationId,
      input.userId
    );
    if (!person) {
      return notAuthorised();
    }

    return listRecordsForScope({
      authorisedPersonIds: [person.id],
      clerkOrgId: input.clerkOrgId,
      filters: parsedFilters.value,
      organisationId: input.organisationId,
    });
  } catch {
    return unknownError();
  }
}

export async function listTeamRecords(input: {
  actingOrgRole?: string | null;
  clerkOrgId: string;
  filters?: unknown;
  managerPersonId?: null | string;
  organisationId: string;
}): Promise<Result<RecordListItem[], PlanServiceError>> {
  const parsedFilters = parseFilters(input.filters);
  if (!parsedFilters.ok) {
    return parsedFilters;
  }

  try {
    const filters = parsedFilters.value;
    if (isAdminOrOwner(input.actingOrgRole)) {
      return listRecordsForScope({
        authorisedPersonIds: null,
        clerkOrgId: input.clerkOrgId,
        filters,
        organisationId: input.organisationId,
      });
    }
    if (!input.managerPersonId) {
      return notAuthorised();
    }

    const reportIds = await managerScopePersonIds({
      actingPersonId: input.managerPersonId,
      clerkOrgId: input.clerkOrgId,
      excludeSelf: true,
      organisationId: input.organisationId,
    });

    return listRecordsForScope({
      authorisedPersonIds: reportIds,
      clerkOrgId: input.clerkOrgId,
      filters,
      organisationId: input.organisationId,
    });
  } catch {
    return unknownError();
  }
}

export async function listMyRecordsPage(input: {
  allHistory?: boolean;
  clerkOrgId: string;
  cursor?: string | null;
  filters?: unknown;
  organisationId: string;
  pageSize?: number;
  userId: string;
}): Promise<Result<PlanListPage, PlanServiceError>> {
  const filters = parseFilters(input.filters);
  if (!filters.ok) {
    return filters;
  }
  try {
    const person = await resolvePersonForUser(
      input.clerkOrgId,
      input.organisationId,
      input.userId
    );
    if (!person) {
      return notAuthorised();
    }
    return listRecordsPageForScope({
      ...input,
      authorisedPersonIds: [person.id],
      filters: filters.value,
    });
  } catch {
    return unknownError();
  }
}
export async function listTeamRecordsPage(input: {
  actingOrgRole?: string | null;
  allHistory?: boolean;
  clerkOrgId: string;
  cursor?: string | null;
  filters?: unknown;
  managerPersonId?: null | string;
  organisationId: string;
  pageSize?: number;
}): Promise<Result<PlanListPage, PlanServiceError>> {
  const filters = parseFilters(input.filters);
  if (!filters.ok) {
    return filters;
  }
  try {
    let authorisedPersonIds: string[] | null = null;
    if (!isAdminOrOwner(input.actingOrgRole)) {
      if (!input.managerPersonId) {
        return notAuthorised();
      }
      authorisedPersonIds = await managerScopePersonIds({
        actingPersonId: input.managerPersonId,
        clerkOrgId: input.clerkOrgId,
        excludeSelf: true,
        organisationId: input.organisationId,
      });
    }
    return listRecordsPageForScope({
      ...input,
      authorisedPersonIds,
      filters: filters.value,
    });
  } catch {
    return unknownError();
  }
}

export async function getRecord(input: {
  actingOrgRole?: string | null;
  actingUserId: string;
  clerkOrgId: string;
  organisationId: string;
  recordId: string;
}): Promise<Result<RecordDetail, PlanServiceError>> {
  try {
    const [record, actingPerson] = await Promise.all([
      loadScopedRecord(input.clerkOrgId, input.organisationId, input.recordId),
      resolvePersonForUser(
        input.clerkOrgId,
        input.organisationId,
        input.actingUserId
      ),
    ]);

    if (!record) {
      return recordNotFound();
    }
    if (
      !canActOnPerson({
        actingOrgRole: input.actingOrgRole,
        actingPersonId: actingPerson?.id ?? null,
        targetPerson: record.person,
      })
    ) {
      return notAuthorised();
    }

    const hasXero = await hasActiveXeroConnection(input);
    const listItem = await toRecordListItem(record, hasXero);
    return {
      ok: true,
      value: {
        ...listItem,
        xeroWriteErrorMessage: record.xero_write_error,
      },
    };
  } catch {
    return unknownError();
  }
}

export async function createRecord(
  input: z.infer<typeof CreateRecordSchema> & RoleScopedInput
): Promise<Result<PlanRecord, PlanServiceError>> {
  const parsed = CreateRecordSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error);
  }

  try {
    const [targetPerson, actingPerson, hasXero, settingsResult] =
      await Promise.all([
        database.person.findFirst({
          select: personSelect,
          where: {
            ...scopedTo({
              clerkOrgId: parsed.data.clerkOrgId,
              organisationId: parsed.data.organisationId,
            }),
            archived_at: null,
            id: parsed.data.personId,
          },
        }),
        resolvePersonForUser(
          parsed.data.clerkOrgId,
          parsed.data.organisationId,
          parsed.data.createdByUserId
        ),
        hasActiveXeroConnection(parsed.data),
        getSettings({
          clerkOrgId: parsed.data.clerkOrgId,
          organisationId: parsed.data.organisationId,
        }),
      ]);

    if (!targetPerson) {
      return {
        error: { code: "record_not_found", message: "Person not found" },
        ok: false,
      };
    }
    if (
      !canActOnPerson({
        actingOrgRole: input.actingOrgRole,
        actingPersonId: actingPerson?.id ?? null,
        targetPerson,
      })
    ) {
      return notAuthorised();
    }

    const routing = routeRecord(parsed.data.recordType, hasXero);
    const privacyMode =
      parsed.data.privacyMode ??
      (settingsResult.ok ? settingsResult.value.defaultPrivacyMode : "named");
    const id = randomUUID();
    const derivedUidKey = deriveAvailabilityUidKey({
      clerkOrgId: parsed.data.clerkOrgId,
      endsAt: parsed.data.endsAt,
      organisationId: parsed.data.organisationId,
      personId: parsed.data.personId,
      recordType: parsed.data.recordType,
      sourceType: routing.sourceType,
      stableSourceKey: id,
      startsAt: parsed.data.startsAt,
    });

    const record = await database.$transaction(async (tx) => {
      const created = await tx.availabilityRecord.create({
        data: {
          all_day: parsed.data.allDay,
          approval_status: routing.approvalStatus,
          approved_at:
            routing.approvalStatus === "approved" ? new Date() : null,
          clerk_org_id: parsed.data.clerkOrgId,
          contactability: parsed.data.contactabilityStatus,
          created_by_user_id: parsed.data.createdByUserId,
          derived_sequence: 0,
          derived_uid_key: derivedUidKey,
          ends_at: parsed.data.endsAt,
          id,
          notes_internal: emptyToNull(parsed.data.notesInternal),
          organisation_id: parsed.data.organisationId,
          person_id: parsed.data.personId,
          privacy_mode: privacyMode,
          record_type: parsed.data.recordType,
          source_type: routing.sourceType,
          starts_at: parsed.data.startsAt,
          title: getAvailabilityRecordLabel(parsed.data.recordType),
          updated_by_user_id: parsed.data.createdByUserId,
        },
        include: recordInclude,
      });

      await tx.auditEvent.create({
        data: {
          action: "availability_records.created",
          actor_user_id: parsed.data.createdByUserId,
          clerk_org_id: parsed.data.clerkOrgId,
          organisation_id: parsed.data.organisationId,
          payload: {
            approvalStatus: routing.approvalStatus,
            hasActiveXeroConnection: hasXero,
            recordType: parsed.data.recordType,
            sourceType: routing.sourceType,
          },
          resource_id: id,
          resource_type: "availability_record",
        },
      });

      return created;
    });

    await materialisePlanPublication({
      availabilityRecordId: record.id,
      clerkOrgId: parsed.data.clerkOrgId,
      organisationId: parsed.data.organisationId,
    });

    return {
      ok: true,
      value: toPlanRecord(record, deriveActions(record, hasXero)),
    };
  } catch {
    return unknownError();
  }
}

export async function updateRecord(
  input: z.infer<typeof UpdateRecordSchema> & RoleScopedInput
): Promise<Result<PlanRecord, PlanServiceError>> {
  const parsed = UpdateRecordSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error);
  }

  try {
    const [existing, actingPerson, hasXero] = await Promise.all([
      loadScopedRecord(
        parsed.data.clerkOrgId,
        parsed.data.organisationId,
        parsed.data.recordId
      ),
      resolvePersonForUser(
        parsed.data.clerkOrgId,
        parsed.data.organisationId,
        parsed.data.actingUserId
      ),
      hasActiveXeroConnection(parsed.data),
    ]);

    if (!existing) {
      return recordNotFound();
    }
    if (
      await hasUnresolvedSubmitOperation({
        availabilityRecordId: existing.id,
        clerkOrgId: parsed.data.clerkOrgId,
        organisationId: parsed.data.organisationId,
      })
    ) {
      return { error: unresolvedSubmitError(), ok: false };
    }
    if (
      !canActOnPerson({
        actingOrgRole: input.actingOrgRole,
        actingPersonId: actingPerson?.id ?? null,
        targetPerson: existing.person,
      })
    ) {
      return notAuthorised();
    }

    const editable = canEdit(existing, hasXero);
    if (!editable.ok) {
      return editable;
    }

    const { patch } = parsed.data;
    const nextStartsAt = patch.startsAt ?? existing.starts_at;
    const nextEndsAt = patch.endsAt ?? existing.ends_at;
    if (nextEndsAt < nextStartsAt) {
      return {
        error: {
          code: "validation_error",
          message: "End date must be after start date",
        },
        ok: false,
      };
    }
    const nextRecordType = patch.recordType ?? existing.record_type;
    const routing =
      patch.recordType &&
      categoryChanged(existing.record_type, patch.recordType)
        ? routeRecord(patch.recordType, hasXero)
        : {
            approvalStatus: existing.approval_status,
            sourceType: existing.source_type,
          };
    const materialChange = hasMaterialChange(existing, patch, routing);
    const derivedUidKey = deriveAvailabilityUidKey({
      clerkOrgId: parsed.data.clerkOrgId,
      endsAt: nextEndsAt,
      organisationId: parsed.data.organisationId,
      personId: existing.person_id,
      recordType: nextRecordType,
      sourceType: routing.sourceType,
      stableSourceKey: existing.id,
      startsAt: nextStartsAt,
    });

    await database.$transaction(async (tx) => {
      const updated = await tx.availabilityRecord.updateMany({
        data: {
          ...(patch.allDay !== undefined && { all_day: patch.allDay }),
          ...(patch.contactabilityStatus && {
            contactability: patch.contactabilityStatus,
          }),
          ...(patch.endsAt && { ends_at: patch.endsAt }),
          ...(patch.notesInternal !== undefined && {
            notes_internal: emptyToNull(patch.notesInternal ?? undefined),
          }),
          ...(patch.privacyMode && { privacy_mode: patch.privacyMode }),
          ...(patch.startsAt && { starts_at: patch.startsAt }),
          approval_status: routing.approvalStatus,
          approved_at:
            routing.approvalStatus === "approved" &&
            existing.approval_status !== "approved"
              ? new Date()
              : existing.approved_at,
          derived_sequence: materialChange
            ? { increment: 1 }
            : existing.derived_sequence,
          derived_uid_key: derivedUidKey,
          record_type: nextRecordType,
          source_type: routing.sourceType,
          title: getAvailabilityRecordLabel(nextRecordType),
          updated_by_user_id: parsed.data.actingUserId,
        },
        where: {
          ...scopedTo({
            clerkOrgId: parsed.data.clerkOrgId,
            organisationId: parsed.data.organisationId,
          }),
          archived_at: existing.archived_at,
          derived_sequence: existing.derived_sequence,
          id: parsed.data.recordId,
          ...unclaimedOrExpiredXeroWriteWhere(),
          ...noUnresolvedSubmitOperationWhere(),
        },
      });
      if (updated.count !== 1) {
        throw new ActiveXeroWriteConflictError();
      }

      await tx.auditEvent.create({
        data: {
          action: "availability_records.updated",
          actor_user_id: parsed.data.actingUserId,
          clerk_org_id: parsed.data.clerkOrgId,
          organisation_id: parsed.data.organisationId,
          payload: {
            materialChange,
            nextApprovalStatus: routing.approvalStatus,
            nextRecordType,
            nextSourceType: routing.sourceType,
            previousApprovalStatus: existing.approval_status,
            previousRecordType: existing.record_type,
            previousSourceType: existing.source_type,
          },
          resource_id: parsed.data.recordId,
          resource_type: "availability_record",
        },
      });
    });

    const updated = await loadScopedRecord(
      parsed.data.clerkOrgId,
      parsed.data.organisationId,
      parsed.data.recordId
    );
    if (!updated) {
      return recordNotFound();
    }
    await materialisePlanPublication({
      availabilityRecordId: updated.id,
      clerkOrgId: parsed.data.clerkOrgId,
      organisationId: parsed.data.organisationId,
    });

    return {
      ok: true,
      value: toPlanRecord(updated, deriveActions(updated, hasXero)),
    };
  } catch (error) {
    if (error instanceof ActiveXeroWriteConflictError) {
      return {
        error: {
          code: "not_editable_after_submission",
          message: "This record is being updated in Xero and cannot be edited.",
        },
        ok: false,
      };
    }
    return unknownError();
  }
}

export async function deleteDraftRecord(
  input: z.infer<typeof RecordActionSchema> & RoleScopedInput
): Promise<Result<void, PlanServiceError>> {
  const parsed = RecordActionSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error);
  }

  try {
    const existing = await loadAndAuthorise(parsed.data, input.actingOrgRole);
    if (!existing.ok) {
      return existing;
    }
    if (
      await hasUnresolvedSubmitOperation({
        availabilityRecordId: existing.value.id,
        clerkOrgId: parsed.data.clerkOrgId,
        organisationId: parsed.data.organisationId,
      })
    ) {
      return { error: unresolvedSubmitError(), ok: false };
    }
    if (
      existing.value.source_type !== "team_calendar_leave" ||
      existing.value.approval_status !== "draft"
    ) {
      return {
        error: {
          code: "invalid_state_for_delete",
          message: "Only draft leave records can be deleted",
        },
        ok: false,
      };
    }

    await database.$transaction(async (tx) => {
      const deleted = await tx.availabilityRecord.deleteMany({
        where: {
          ...scopedTo({
            clerkOrgId: parsed.data.clerkOrgId,
            organisationId: parsed.data.organisationId,
          }),
          approval_status: existing.value.approval_status,
          derived_sequence: existing.value.derived_sequence,
          id: parsed.data.recordId,
          ...unclaimedOrExpiredXeroWriteWhere(),
          ...noUnresolvedSubmitOperationWhere(),
        },
      });
      if (deleted.count !== 1) {
        throw new ActiveXeroWriteConflictError();
      }
      await tx.auditEvent.create({
        data: auditData(parsed.data, "availability_records.draft_deleted"),
      });
    });

    return { ok: true, value: undefined };
  } catch (error) {
    if (error instanceof ActiveXeroWriteConflictError) {
      return {
        error: {
          code: "invalid_state_for_delete",
          message:
            "This record is being updated in Xero and cannot be deleted.",
        },
        ok: false,
      };
    }
    return unknownError();
  }
}

export async function archiveRecord(
  input: z.infer<typeof RecordActionSchema> & RoleScopedInput
): Promise<Result<void, PlanServiceError>> {
  const parsed = RecordActionSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error);
  }

  try {
    const existing = await loadAndAuthorise(parsed.data, input.actingOrgRole);
    if (!existing.ok) {
      return existing;
    }
    if (
      await hasUnresolvedSubmitOperation({
        availabilityRecordId: existing.value.id,
        clerkOrgId: parsed.data.clerkOrgId,
        organisationId: parsed.data.organisationId,
      })
    ) {
      return { error: unresolvedSubmitError(), ok: false };
    }
    if (
      existing.value.source_type === "xero_leave" ||
      existing.value.source_type === "xero"
    ) {
      return {
        error: {
          code: "invalid_state_for_archive",
          message: "Xero-synced records cannot be archived here",
        },
        ok: false,
      };
    }
    if (
      !["approved", "declined", "withdrawn"].includes(
        existing.value.approval_status
      )
    ) {
      return {
        error: {
          code: "invalid_state_for_archive",
          message: "This record cannot be archived in its current state",
        },
        ok: false,
      };
    }

    await database.$transaction(async (tx) => {
      const archived = await tx.availabilityRecord.updateMany({
        data: {
          archived_at: new Date(),
          publish_status: "archived",
          updated_by_user_id: parsed.data.actingUserId,
        },
        where: {
          ...scopedTo({
            clerkOrgId: parsed.data.clerkOrgId,
            organisationId: parsed.data.organisationId,
          }),
          approval_status: existing.value.approval_status,
          derived_sequence: existing.value.derived_sequence,
          id: parsed.data.recordId,
          ...unclaimedOrExpiredXeroWriteWhere(),
          ...noUnresolvedSubmitOperationWhere(),
        },
      });
      if (archived.count !== 1) {
        throw new ActiveXeroWriteConflictError();
      }
      await tx.auditEvent.create({
        data: auditData(parsed.data, "availability_records.archived"),
      });
    });

    await materialisePlanPublication({
      availabilityRecordId: parsed.data.recordId,
      clerkOrgId: parsed.data.clerkOrgId,
      organisationId: parsed.data.organisationId,
    });

    return { ok: true, value: undefined };
  } catch (error) {
    if (error instanceof ActiveXeroWriteConflictError) {
      return {
        error: {
          code: "invalid_state_for_archive",
          message:
            "This record is being updated in Xero and cannot be archived.",
        },
        ok: false,
      };
    }
    return unknownError();
  }
}

export async function restoreRecord(
  input: z.infer<typeof RecordActionSchema> & RoleScopedInput
): Promise<Result<void, PlanServiceError>> {
  const parsed = RecordActionSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error);
  }

  try {
    const existing = await loadAndAuthorise(parsed.data, input.actingOrgRole);
    if (!existing.ok) {
      return existing;
    }
    if (
      existing.value.source_type !== "manual" ||
      !existing.value.archived_at
    ) {
      return {
        error: {
          code: "invalid_state_for_archive",
          message: "Only archived manual records can be restored",
        },
        ok: false,
      };
    }

    await database.$transaction(async (tx) => {
      const restored = await tx.availabilityRecord.updateMany({
        data: {
          archived_at: null,
          publish_status: "eligible",
          updated_by_user_id: parsed.data.actingUserId,
        },
        where: {
          ...scopedTo({
            clerkOrgId: parsed.data.clerkOrgId,
            organisationId: parsed.data.organisationId,
          }),
          derived_sequence: existing.value.derived_sequence,
          id: parsed.data.recordId,
          ...unclaimedOrExpiredXeroWriteWhere(),
          ...noUnresolvedSubmitOperationWhere(),
        },
      });
      if (restored.count !== 1) {
        throw new ActiveXeroWriteConflictError();
      }
      await tx.auditEvent.create({
        data: auditData(parsed.data, "availability_records.restored"),
      });
    });

    await materialisePlanPublication({
      availabilityRecordId: parsed.data.recordId,
      clerkOrgId: parsed.data.clerkOrgId,
      organisationId: parsed.data.organisationId,
    });

    return { ok: true, value: undefined };
  } catch (error) {
    if (error instanceof ActiveXeroWriteConflictError) {
      return {
        error: {
          code: "invalid_state_for_archive",
          message:
            "This record is being updated in Xero and cannot be restored.",
        },
        ok: false,
      };
    }
    return unknownError();
  }
}

const personSelect = {
  email: true,
  first_name: true,
  id: true,
  last_name: true,
  location_id: true,
  manager_person_id: true,
} as const;

const recordInclude = {
  outbound_operations: {
    select: { status: true },
    where: {
      action: "submit",
      status: { in: ["prepared", "outcome_unknown", "provider_accepted"] },
    },
  },
  person: {
    select: personSelect,
  },
} satisfies Prisma.AvailabilityRecordInclude;

type ScopedRecord = NonNullable<Awaited<ReturnType<typeof loadScopedRecord>>>;
type SelectedPerson = ScopedRecord["person"];

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Page scope, filters, window and cursor must form one identical count/page predicate.
async function listRecordsPageForScope(input: {
  allHistory?: boolean;
  authorisedPersonIds: null | string[];
  clerkOrgId: string;
  cursor?: string | null;
  filters: PlanFilters;
  organisationId: string;
  pageSize?: number;
}): Promise<Result<PlanListPage, PlanServiceError>> {
  const requested = input.filters.personId;
  let personIds = requested;
  if (input.authorisedPersonIds !== null) {
    personIds = requested
      ? requested.filter((id) => input.authorisedPersonIds?.includes(id))
      : input.authorisedPersonIds;
  }
  const now = new Date();
  const from = new Date(now);
  from.setUTCDate(from.getUTCDate() - 90);
  const to = new Date(now);
  to.setUTCDate(to.getUTCDate() + 365);
  const window = input.allHistory
    ? {
        from: input.filters.dateRange?.from ?? null,
        to: input.filters.dateRange?.to ?? null,
      }
    : {
        from: input.filters.dateRange?.from ?? from,
        to: input.filters.dateRange?.to ?? to,
      };
  if (personIds?.length === 0) {
    return {
      ok: true,
      value: { items: [], nextCursor: null, totalCount: 0, window },
    };
  }
  const where: Prisma.AvailabilityRecordWhereInput = {
    ...scopedTo(input),
    source_type: {
      in: input.filters.sourceType?.length
        ? [...input.filters.sourceType]
        : ["manual", "team_calendar_leave"],
    },
    ...(input.filters.includeArchived ? {} : { archived_at: null }),
    ...(input.filters.approvalStatus?.length
      ? { approval_status: { in: input.filters.approvalStatus } }
      : {}),
    ...(personIds?.length ? { person_id: { in: personIds } } : {}),
    ...(input.filters.recordType?.length
      ? { record_type: { in: [...input.filters.recordType] } }
      : recordTypeCategoryFilter(input.filters.recordTypeCategory)),
    ...(window.from ? { ends_at: { gte: window.from } } : {}),
    ...(window.to ? { starts_at: { lte: window.to } } : {}),
  };
  const cursor = decodePlanCursor(input.cursor ?? null);
  const pageSize = Math.min(Math.max(input.pageSize ?? 50, 1), 200);
  const [rows, totalCount, hasXero] = await Promise.all([
    database.availabilityRecord.findMany({
      include: recordInclude,
      orderBy: [{ starts_at: "asc" }, { created_at: "asc" }, { id: "asc" }],
      take: pageSize + 1,
      where: cursor
        ? {
            AND: [
              where,
              {
                OR: [
                  { starts_at: { gt: cursor.startsAt } },
                  {
                    created_at: { gt: cursor.createdAt },
                    starts_at: cursor.startsAt,
                  },
                  {
                    created_at: cursor.createdAt,
                    id: { gt: cursor.id },
                    starts_at: cursor.startsAt,
                  },
                ],
              },
            ],
          }
        : where,
    }),
    database.availabilityRecord.count({ where }),
    hasActiveXeroConnection({
      clerkOrgId: input.clerkOrgId,
      organisationId: input.organisationId,
    }),
  ]);
  const page = rows.slice(0, pageSize);
  const balances = page.length
    ? await database.leaveBalance.findMany({
        orderBy: { updated_at: "desc" },
        where: {
          ...scopedTo(input),
          person_id: { in: [...new Set(page.map((r) => r.person_id))] },
          record_type: { in: [...new Set(page.map((r) => r.record_type))] },
        },
      })
    : [];
  const byPair = new Map<string, (typeof balances)[number]>();
  for (const balance of balances) {
    const key = `${balance.person_id}:${balance.record_type}`;
    if (!byPair.has(key)) {
      byPair.set(key, balance);
    }
  }
  const items = page.map((record) => ({
    ...toPlanRecord(record, deriveActions(record, hasXero)),
    balanceChip: balanceChipFromRow(
      record,
      byPair.get(`${record.person_id}:${record.record_type}`)
    ),
  }));
  return {
    ok: true,
    value: {
      items,
      nextCursor: rows.length > pageSize ? encodePlanCursor(page.at(-1)) : null,
      totalCount,
      window,
    },
  };
}

function balanceChipFromRow(
  record: ScopedRecord,
  balance:
    | {
        balance: Prisma.Decimal;
        balance_unit: leave_balance_unit | null;
        currency_code: string | null;
        updated_at: Date;
      }
    | undefined
): BalanceChip | null {
  if (isLocalOnlyType(record.record_type)) {
    return null;
  }
  if (!isXeroLeaveType(record.record_type)) {
    return {
      balanceAvailable: null,
      balanceUnavailableReason: "not_xero_leave",
      currencyCode: null,
      leaveBalanceUpdatedAt: null,
      unit: null,
    };
  }
  return balance
    ? {
        balanceAvailable: Number(balance.balance),
        balanceUnavailableReason: "not_synced",
        currencyCode: balance.currency_code,
        leaveBalanceUpdatedAt: balance.updated_at,
        unit: balance.balance_unit,
      }
    : {
        balanceAvailable: null,
        balanceUnavailableReason: "not_synced",
        currencyCode: null,
        leaveBalanceUpdatedAt: null,
        unit: null,
      };
}
function encodePlanCursor(record: ScopedRecord | undefined): string | null {
  return record
    ? Buffer.from(
        JSON.stringify({
          createdAt: record.created_at.toISOString(),
          id: record.id,
          startsAt: record.starts_at.toISOString(),
        })
      ).toString("base64url")
    : null;
}
function decodePlanCursor(
  value: string | null
): { createdAt: Date; id: string; startsAt: Date } | null {
  if (!value) {
    return null;
  }
  try {
    const result = z
      .object({
        createdAt: z.coerce.date(),
        id: z.string().uuid(),
        startsAt: z.coerce.date(),
      })
      .safeParse(JSON.parse(Buffer.from(value, "base64url").toString("utf8")));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

async function listRecordsForScope({
  authorisedPersonIds,
  clerkOrgId,
  filters,
  organisationId,
}: {
  authorisedPersonIds: null | string[];
  clerkOrgId: string;
  filters: PlanFilters;
  organisationId: string;
}): Promise<Result<RecordListItem[], PlanServiceError>> {
  const requestedPersonIds = filters.personId;
  let personIds = requestedPersonIds;
  if (authorisedPersonIds !== null) {
    personIds = requestedPersonIds
      ? requestedPersonIds.filter((personId) =>
          authorisedPersonIds.includes(personId)
        )
      : authorisedPersonIds;
  }

  if (personIds?.length === 0) {
    return { ok: true, value: [] };
  }

  const hasXero = await hasActiveXeroConnection({ clerkOrgId, organisationId });
  const records = await database.availabilityRecord.findMany({
    orderBy: [{ starts_at: "asc" }, { created_at: "asc" }],
    select: { id: true },
    where: {
      ...scopedTo({ clerkOrgId, organisationId }),
      source_type: { in: ["manual", "team_calendar_leave"] },
      ...(filters.includeArchived ? {} : { archived_at: null }),
      ...(filters.approvalStatus?.length
        ? { approval_status: { in: filters.approvalStatus } }
        : {}),
      ...(personIds?.length ? { person_id: { in: personIds } } : {}),
      ...(filters.recordType?.length
        ? { record_type: { in: [...filters.recordType] } }
        : recordTypeCategoryFilter(filters.recordTypeCategory)),
      ...(filters.sourceType?.length
        ? {
            source_type: {
              in: filters.sourceType.filter(
                (sourceType) =>
                  sourceType === "manual" ||
                  sourceType === "team_calendar_leave"
              ),
            },
          }
        : {}),
      ...(filters.dateRange?.from
        ? { ends_at: { gte: filters.dateRange.from } }
        : {}),
      ...(filters.dateRange?.to
        ? { starts_at: { lte: filters.dateRange.to } }
        : {}),
    },
  });

  const loadedRecords = await Promise.all(
    records.map((record) =>
      loadScopedRecord(clerkOrgId, organisationId, record.id)
    )
  );
  const items = await Promise.all(
    loadedRecords
      .filter((record): record is ScopedRecord => record !== null)
      .map((record) => toRecordListItem(record, hasXero))
  );

  return { ok: true, value: items };
}

async function toRecordListItem(
  record: ScopedRecord,
  hasXero: boolean
): Promise<RecordListItem> {
  return {
    ...toPlanRecord(record, deriveActions(record, hasXero)),
    balanceChip: await balanceChipForRecord(record),
  };
}

async function balanceChipForRecord(
  record: ScopedRecord
): Promise<BalanceChip | null> {
  if (isLocalOnlyType(record.record_type)) {
    return null;
  }
  if (!isXeroLeaveType(record.record_type)) {
    return {
      balanceAvailable: null,
      balanceUnavailableReason: "not_xero_leave",
      currencyCode: null,
      leaveBalanceUpdatedAt: null,
      unit: null,
    };
  }

  const balance = await database.leaveBalance.findFirst({
    orderBy: { updated_at: "desc" },
    select: {
      balance: true,
      balance_unit: true,
      currency_code: true,
      updated_at: true,
    },
    where: {
      ...scopedTo({
        clerkOrgId: record.clerk_org_id,
        organisationId: record.organisation_id,
      }),
      person_id: record.person_id,
      record_type: record.record_type,
    },
  });

  if (!balance) {
    return {
      balanceAvailable: null,
      balanceUnavailableReason: "not_synced",
      currencyCode: null,
      leaveBalanceUpdatedAt: null,
      unit: null,
    };
  }

  return {
    balanceAvailable: Number(balance.balance),
    balanceUnavailableReason: "not_synced",
    currencyCode: balance.currency_code,
    leaveBalanceUpdatedAt: balance.updated_at,
    unit: balance.balance_unit,
  };
}

function loadScopedRecord(
  clerkOrgId: string,
  organisationId: string,
  recordId: string
) {
  return database.availabilityRecord.findFirst({
    include: recordInclude,
    where: {
      ...scopedTo({ clerkOrgId, organisationId }),
      id: recordId,
    },
  });
}

async function loadAndAuthorise(
  input: z.infer<typeof RecordActionSchema>,
  actingOrgRole: string | null | undefined
): Promise<Result<ScopedRecord, PlanServiceError>> {
  const [record, actingPerson] = await Promise.all([
    loadScopedRecord(input.clerkOrgId, input.organisationId, input.recordId),
    resolvePersonForUser(
      input.clerkOrgId,
      input.organisationId,
      input.actingUserId
    ),
  ]);

  if (!record) {
    return recordNotFound();
  }
  if (
    !canActOnPerson({
      actingOrgRole,
      actingPersonId: actingPerson?.id ?? null,
      targetPerson: record.person,
    })
  ) {
    return notAuthorised();
  }

  return { ok: true, value: record };
}

function resolvePersonForUser(
  clerkOrgId: string,
  organisationId: string,
  userId: string
) {
  return database.person.findFirst({
    select: personSelect,
    where: {
      ...scopedTo({ clerkOrgId, organisationId }),
      archived_at: null,
      clerk_user_id: userId,
    },
  });
}

function toPlanRecord(
  record: ScopedRecord,
  editableActions: EditableAction[]
): PlanRecord {
  return {
    allDay: record.all_day,
    approvalNote: record.approval_note,
    approvalStatus: record.approval_status,
    approvedAt: record.approved_at,
    archivedAt: record.archived_at,
    clerkOrgId: record.clerk_org_id,
    contactabilityStatus: record.contactability,
    createdAt: record.created_at,
    createdByUserId: record.created_by_user_id,
    derivedSequence: record.derived_sequence,
    derivedUidKey: record.derived_uid_key,
    editableActions,
    endsAt: record.ends_at,
    failedAction: record.failed_action,
    id: record.id,
    notesInternal: record.notes_internal,
    organisationId: record.organisation_id,
    person: {
      email: record.person.email,
      firstName: record.person.first_name,
      id: record.person.id,
      lastName: record.person.last_name,
      locationId: record.person.location_id,
      managerPersonId: record.person.manager_person_id,
    },
    personId: record.person_id,
    privacyMode: record.privacy_mode,
    recordType: record.record_type,
    sourceRemoteId: record.source_remote_id,
    sourceType: record.source_type,
    startsAt: record.starts_at,
    submissionResolutionPending: record.outbound_operations?.length > 0,
    submittedAt: record.submitted_at,
    updatedAt: record.updated_at,
    xeroWriteError: record.xero_write_error,
  };
}

function deriveActions(
  record: ScopedRecord,
  hasXero: boolean
): EditableAction[] {
  if (record.outbound_operations?.length > 0) {
    return ["view"];
  }
  if (record.archived_at && record.source_type === "manual") {
    return ["view", "restore"];
  }

  if (
    record.source_type === "manual" &&
    record.approval_status === "approved"
  ) {
    return ["edit", "archive"];
  }

  if (record.source_type !== "team_calendar_leave") {
    return ["view"];
  }

  switch (record.approval_status) {
    case "draft":
      return ["edit", "delete_draft", "submit_for_approval"];
    case "submitted":
      return ["view", "withdraw"];
    case "approved":
      return hasXero ? ["view", "archive"] : ["edit", "archive"];
    case "declined":
    case "withdrawn":
      return ["view", "archive"];
    case "xero_sync_failed":
      return ["edit", "retry_submission", "revert_to_draft"];
    case "cancelled":
      return ["view"];
    default:
      return ["view"];
  }
}

function canEdit(
  record: ScopedRecord,
  hasXero: boolean
): Result<void, PlanServiceError> {
  if (record.source_type === "xero_leave" || record.source_type === "xero") {
    return {
      error: {
        code: "not_editable_xero_synced",
        message: "Xero-synced records cannot be edited here",
      },
      ok: false,
    };
  }

  if (record.source_type === "manual") {
    if (record.archived_at) {
      return {
        error: {
          code: "not_editable_archived",
          message: "Archived records cannot be edited",
        },
        ok: false,
      };
    }
    return { ok: true, value: undefined };
  }

  if (
    record.approval_status === "draft" ||
    record.approval_status === "xero_sync_failed" ||
    (record.approval_status === "approved" && !hasXero)
  ) {
    return { ok: true, value: undefined };
  }

  if (
    record.approval_status === "submitted" ||
    (record.approval_status === "approved" && hasXero)
  ) {
    return {
      error: {
        code: "not_editable_after_submission",
        message: "Submitted records cannot be edited here",
      },
      ok: false,
    };
  }

  return {
    error: {
      code: "not_editable_terminal_state",
      message: "This record cannot be edited in its current state",
    },
    ok: false,
  };
}

function routeRecord(
  recordType: RecordType,
  hasXero: boolean
): {
  approvalStatus: "approved" | "draft";
  sourceType: "team_calendar_leave" | "manual";
} {
  if (isLocalOnlyType(recordType)) {
    return { approvalStatus: "approved", sourceType: "manual" };
  }
  if (isXeroLeaveType(recordType) && hasXero) {
    return { approvalStatus: "draft", sourceType: "team_calendar_leave" };
  }
  return { approvalStatus: "approved", sourceType: "team_calendar_leave" };
}

async function materialisePlanPublication(input: {
  availabilityRecordId: string;
  clerkOrgId: string;
  organisationId: string;
}): Promise<void> {
  const result = await materialiseAvailabilityPublication(input);
  if (!result.ok) {
    // Best-effort: the record is already persisted. Log the failed feed
    // projection rather than failing the write; it is corrected on the next
    // successful materialisation for the record.
    log.error("Failed to materialise availability publication", {
      availabilityRecordId: input.availabilityRecordId,
      clerkOrgId: input.clerkOrgId,
      error: result.error.message,
      organisationId: input.organisationId,
    });
  }
}

function hasMaterialChange(
  existing: ScopedRecord,
  patch: z.infer<typeof UpdateRecordSchema>["patch"],
  routing: { approvalStatus: string; sourceType: string }
): boolean {
  return Boolean(
    (patch.allDay !== undefined && patch.allDay !== existing.all_day) ||
      (patch.contactabilityStatus &&
        patch.contactabilityStatus !== existing.contactability) ||
      (patch.endsAt && patch.endsAt.getTime() !== existing.ends_at.getTime()) ||
      patch.notesInternal !== undefined ||
      (patch.privacyMode && patch.privacyMode !== existing.privacy_mode) ||
      (patch.recordType && patch.recordType !== existing.record_type) ||
      (patch.startsAt &&
        patch.startsAt.getTime() !== existing.starts_at.getTime()) ||
      routing.approvalStatus !== existing.approval_status ||
      routing.sourceType !== existing.source_type
  );
}

function categoryChanged(first: RecordType, second: RecordType): boolean {
  return (
    (isLocalOnlyType(first) && isXeroLeaveType(second)) ||
    (isXeroLeaveType(first) && isLocalOnlyType(second))
  );
}

function recordTypeCategoryFilter(
  category: PlanFilters["recordTypeCategory"]
): { record_type?: { in: RecordType[] } } {
  if (category === "local_only") {
    return {
      record_type: { in: USER_CREATABLE_RECORD_TYPES.filter(isLocalOnlyType) },
    };
  }
  if (category === "xero_leave") {
    return {
      record_type: { in: USER_CREATABLE_RECORD_TYPES.filter(isXeroLeaveType) },
    };
  }
  return {};
}

function parseFilters(filters: unknown): Result<PlanFilters, PlanServiceError> {
  const parsed = FiltersSchema.safeParse(filters ?? {});
  if (!parsed.success) {
    return validationError(parsed.error);
  }
  return { ok: true, value: parsed.data };
}

function canActOnPerson({
  actingOrgRole,
  actingPersonId,
  targetPerson,
}: {
  actingOrgRole?: string | null;
  actingPersonId: string | null;
  targetPerson: SelectedPerson;
}): boolean {
  return (
    isAdminOrOwner(actingOrgRole) ||
    targetPerson.id === actingPersonId ||
    (Boolean(actingPersonId) &&
      targetPerson.manager_person_id === actingPersonId)
  );
}

function isAdminOrOwner(role?: string | null): boolean {
  return role === "org:admin" || role === "org:owner";
}

function auditData(input: z.infer<typeof RecordActionSchema>, action: string) {
  return {
    action,
    actor_user_id: input.actingUserId,
    clerk_org_id: input.clerkOrgId,
    organisation_id: input.organisationId,
    payload: { recordId: input.recordId },
    resource_id: input.recordId,
    resource_type: "availability_record",
  };
}

function recordNotFound(): Result<never, PlanServiceError> {
  return {
    error: {
      code: "record_not_found",
      message: "Availability record not found",
    },
    ok: false,
  };
}

function notAuthorised(): Result<never, PlanServiceError> {
  return {
    error: {
      code: "not_authorised",
      message: "You do not have permission to manage this record",
    },
    ok: false,
  };
}

function validationError(error: z.ZodError): Result<never, PlanServiceError> {
  return {
    error: {
      code: "validation_error",
      message: error.issues[0]?.message ?? "Invalid plan record",
    },
    ok: false,
  };
}

function unknownError(): Result<never, PlanServiceError> {
  return {
    error: {
      code: "unknown_error",
      message: "Something went wrong while managing this record",
    },
    ok: false,
  };
}

function emptyToNull(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

class ActiveXeroWriteConflictError extends Error {}
