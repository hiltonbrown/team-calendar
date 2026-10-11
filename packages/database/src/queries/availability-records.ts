import type {
  AvailabilityRecordId,
  ClerkOrgId,
  OrganisationId,
  PersonId,
  Result,
} from "@repo/core";
import { appError } from "@repo/core";

import { tenantDatabase } from "../tenant-client";
import { scopedQuery } from "../tenant-query";

export interface AvailabilityRecordData {
  approvalStatus: string;
  clerkOrgId: string;
  contactability: string;
  createdAt: Date;
  derivedUidKey: string;
  endsAt: Date;
  id: AvailabilityRecordId;
  includeInFeed: boolean;
  organisationId: OrganisationId;
  personId: PersonId;
  privacyMode: string;
  publishStatus: string;
  recordType: string;
  sourceRemoteId: string | null;
  sourceType: string;
  startsAt: Date;
  updatedAt: Date;
}

export interface ManualAvailabilityListData extends AvailabilityRecordData {
  allDay: boolean;
  archivedAt: Date | null;
  notesInternal: string | null;
  personFirstName: string;
  personLastName: string;
  title: string | null;
  workingLocation: string | null;
}

interface CalendarFilters {
  approvalStatus?: string;
  personIds?: PersonId[];
  publishStatus?: string;
  recordTypes?: string[];
  sourceTypes?: string[];
}

interface DateRange {
  endDate: Date;
  startDate: Date;
}

export async function listAvailabilityForCalendar(
  clerkOrgId: ClerkOrgId,
  organisationId: OrganisationId,
  dateRange: DateRange,
  filters?: CalendarFilters
): Promise<Result<AvailabilityRecordData[]>> {
  try {
    const whereConditions: Record<string, unknown> = {
      ...scopedQuery(clerkOrgId, organisationId),
      ends_at: {
        gte: dateRange.startDate,
      },
      starts_at: {
        lte: dateRange.endDate,
      },
    };

    if (filters?.recordTypes) {
      whereConditions.record_type = { in: filters.recordTypes };
    }
    if (filters?.sourceTypes) {
      whereConditions.source_type = { in: filters.sourceTypes };
    }
    if (filters?.publishStatus) {
      whereConditions.publish_status = filters.publishStatus;
    }
    if (filters?.approvalStatus) {
      whereConditions.approval_status = filters.approvalStatus;
    }
    if (filters?.personIds && filters.personIds.length > 0) {
      whereConditions.person_id = { in: filters.personIds };
    }

    const records = await tenantDatabase(
      clerkOrgId
    ).availabilityRecord.findMany({
      orderBy: [{ starts_at: "asc" }, { person_id: "asc" }],
      select: {
        approval_status: true,
        clerk_org_id: true,
        contactability: true,
        created_at: true,
        derived_uid_key: true,
        ends_at: true,
        id: true,
        include_in_feed: true,
        organisation_id: true,
        person_id: true,
        privacy_mode: true,
        publish_status: true,
        record_type: true,
        source_remote_id: true,
        source_type: true,
        starts_at: true,
        updated_at: true,
      },
      where: whereConditions,
    });

    return {
      ok: true,
      value: records.map(toAvailabilityRecord),
    };
  } catch {
    return {
      error: appError("internal", "Failed to list calendar availability"),
      ok: false,
    };
  }
}

export async function listAvailabilityForPerson(
  clerkOrgId: ClerkOrgId,
  organisationId: OrganisationId,
  personId: PersonId,
  dateRange: DateRange
): Promise<Result<AvailabilityRecordData[]>> {
  try {
    const records = await tenantDatabase(
      clerkOrgId
    ).availabilityRecord.findMany({
      orderBy: { starts_at: "asc" },
      select: {
        approval_status: true,
        clerk_org_id: true,
        contactability: true,
        created_at: true,
        derived_uid_key: true,
        ends_at: true,
        id: true,
        include_in_feed: true,
        organisation_id: true,
        person_id: true,
        privacy_mode: true,
        publish_status: true,
        record_type: true,
        source_remote_id: true,
        source_type: true,
        starts_at: true,
        updated_at: true,
      },
      where: {
        ...scopedQuery(clerkOrgId, organisationId),
        ends_at: {
          gte: dateRange.startDate,
        },
        person_id: personId,
        starts_at: {
          lte: dateRange.endDate,
        },
      },
    });

    return {
      ok: true,
      value: records.map(toAvailabilityRecord),
    };
  } catch {
    return {
      error: appError("internal", "Failed to list person availability"),
      ok: false,
    };
  }
}

export async function listPendingApprovalRecords(
  clerkOrgId: ClerkOrgId,
  organisationId: OrganisationId,
  filters?: {
    personIds?: PersonId[];
    recordTypes?: string[];
  }
): Promise<Result<AvailabilityRecordData[]>> {
  try {
    const whereConditions: Record<string, unknown> = {
      ...scopedQuery(clerkOrgId, organisationId),
      approval_status: "submitted",
    };

    if (filters?.personIds && filters.personIds.length > 0) {
      whereConditions.person_id = { in: filters.personIds };
    }
    if (filters?.recordTypes) {
      whereConditions.record_type = { in: filters.recordTypes };
    }

    const records = await tenantDatabase(
      clerkOrgId
    ).availabilityRecord.findMany({
      orderBy: { created_at: "asc" },
      select: {
        approval_status: true,
        clerk_org_id: true,
        contactability: true,
        created_at: true,
        derived_uid_key: true,
        ends_at: true,
        id: true,
        include_in_feed: true,
        organisation_id: true,
        person_id: true,
        privacy_mode: true,
        publish_status: true,
        record_type: true,
        source_remote_id: true,
        source_type: true,
        starts_at: true,
        updated_at: true,
      },
      where: whereConditions,
    });

    return {
      ok: true,
      value: records.map(toAvailabilityRecord),
    };
  } catch {
    return {
      error: appError("internal", "Failed to list pending approval records"),
      ok: false,
    };
  }
}

function toAvailabilityRecord(r: {
  id: string;
  clerk_org_id: string;
  organisation_id: string;
  person_id: string;
  record_type: string;
  source_type: string;
  source_remote_id: string | null;
  starts_at: Date;
  ends_at: Date;
  approval_status: string;
  privacy_mode: string;
  contactability: string;
  include_in_feed: boolean;
  publish_status: string;
  derived_uid_key: string;
  created_at: Date;
  updated_at: Date;
}): AvailabilityRecordData {
  return {
    approvalStatus: r.approval_status,
    clerkOrgId: r.clerk_org_id,
    contactability: r.contactability,
    createdAt: r.created_at,
    derivedUidKey: r.derived_uid_key,
    endsAt: r.ends_at,
    id: r.id as AvailabilityRecordId,
    includeInFeed: r.include_in_feed,
    organisationId: r.organisation_id as OrganisationId,
    personId: r.person_id as PersonId,
    privacyMode: r.privacy_mode,
    publishStatus: r.publish_status,
    recordType: r.record_type,
    sourceRemoteId: r.source_remote_id,
    sourceType: r.source_type,
    startsAt: r.starts_at,
    updatedAt: r.updated_at,
  };
}

export async function listManualAvailability(
  clerkOrgId: ClerkOrgId,
  organisationId: OrganisationId,
  filters?: {
    personId?: PersonId;
    approvalStatus?: string;
    includeArchived?: boolean;
    dateRange?: { startDate: Date; endDate: Date };
  }
): Promise<Result<ManualAvailabilityListData[]>> {
  try {
    const whereConditions: Record<string, unknown> = {
      ...scopedQuery(clerkOrgId, organisationId),
      source_type: "manual",
    };

    if (filters?.personId) {
      whereConditions.person_id = filters.personId;
    }
    if (filters?.approvalStatus) {
      whereConditions.approval_status = filters.approvalStatus;
    }
    if (!filters?.includeArchived) {
      whereConditions.archived_at = null;
    }
    if (filters?.dateRange) {
      whereConditions.starts_at = { lte: filters.dateRange.endDate };
      whereConditions.ends_at = { gte: filters.dateRange.startDate };
    }

    const records = await tenantDatabase(
      clerkOrgId
    ).availabilityRecord.findMany({
      orderBy: { starts_at: "asc" },
      select: {
        all_day: true,
        approval_status: true,
        archived_at: true,
        clerk_org_id: true,
        contactability: true,
        created_at: true,
        derived_uid_key: true,
        ends_at: true,
        id: true,
        include_in_feed: true,
        notes_internal: true,
        organisation_id: true,
        person: { select: { first_name: true, last_name: true } },
        person_id: true,
        privacy_mode: true,
        publish_status: true,
        record_type: true,
        source_remote_id: true,
        source_type: true,
        starts_at: true,
        title: true,
        updated_at: true,
        working_location: true,
      },
      where: whereConditions,
    });

    return {
      ok: true,
      value: records.map((r) => ({
        allDay: r.all_day,
        approvalStatus: r.approval_status,
        archivedAt: r.archived_at,
        clerkOrgId: r.clerk_org_id,
        contactability: r.contactability,
        createdAt: r.created_at,
        derivedUidKey: r.derived_uid_key,
        endsAt: r.ends_at,
        id: r.id as AvailabilityRecordId,
        includeInFeed: r.include_in_feed,
        notesInternal: r.notes_internal,
        organisationId: r.organisation_id as OrganisationId,
        personFirstName: r.person.first_name,
        personId: r.person_id as PersonId,
        personLastName: r.person.last_name,
        privacyMode: r.privacy_mode,
        publishStatus: r.publish_status,
        recordType: r.record_type,
        sourceRemoteId: r.source_remote_id,
        sourceType: r.source_type,
        startsAt: r.starts_at,
        title: r.title,
        updatedAt: r.updated_at,
        workingLocation: r.working_location,
      })),
    };
  } catch {
    return {
      error: appError("internal", "Failed to list manual availability"),
      ok: false,
    };
  }
}

export async function getAvailabilityRecordById(
  clerkOrgId: ClerkOrgId,
  organisationId: OrganisationId,
  recordId: AvailabilityRecordId
): Promise<Result<ManualAvailabilityListData>> {
  try {
    const record = await tenantDatabase(
      clerkOrgId
    ).availabilityRecord.findFirst({
      select: {
        all_day: true,
        approval_status: true,
        archived_at: true,
        clerk_org_id: true,
        contactability: true,
        created_at: true,
        derived_uid_key: true,
        ends_at: true,
        id: true,
        include_in_feed: true,
        notes_internal: true,
        organisation_id: true,
        person: { select: { first_name: true, last_name: true } },
        person_id: true,
        privacy_mode: true,
        publish_status: true,
        record_type: true,
        source_remote_id: true,
        source_type: true,
        starts_at: true,
        title: true,
        updated_at: true,
        working_location: true,
      },
      where: {
        ...scopedQuery(clerkOrgId, organisationId),
        id: recordId,
      },
    });

    if (!record) {
      return {
        error: appError("not_found", "Availability record not found"),
        ok: false,
      };
    }

    return {
      ok: true,
      value: {
        allDay: record.all_day,
        approvalStatus: record.approval_status,
        archivedAt: record.archived_at,
        clerkOrgId: record.clerk_org_id,
        contactability: record.contactability,
        createdAt: record.created_at,
        derivedUidKey: record.derived_uid_key,
        endsAt: record.ends_at,
        id: record.id as AvailabilityRecordId,
        includeInFeed: record.include_in_feed,
        notesInternal: record.notes_internal,
        organisationId: record.organisation_id as OrganisationId,
        personFirstName: record.person.first_name,
        personId: record.person_id as PersonId,
        personLastName: record.person.last_name,
        privacyMode: record.privacy_mode,
        publishStatus: record.publish_status,
        recordType: record.record_type,
        sourceRemoteId: record.source_remote_id,
        sourceType: record.source_type,
        startsAt: record.starts_at,
        title: record.title,
        updatedAt: record.updated_at,
        workingLocation: record.working_location,
      },
    };
  } catch {
    return {
      error: appError("internal", "Failed to get availability record"),
      ok: false,
    };
  }
}
