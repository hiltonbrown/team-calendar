import "server-only";

import type {
  AvailabilityRecordId,
  ClerkOrgId,
  OrganisationId,
  Result,
} from "@repo/core";
import { appError } from "@repo/core";
import { getAvailabilityRecordById } from "@repo/database/src/queries/availability-records";

/**
 * Loads a single availability record by ID for the detail page.
 * Returns error if record is not found or is Xero-sourced (read-only).
 */
export async function loadAvailabilityRecordDetailData(
  clerkOrgId: ClerkOrgId,
  organisationId: OrganisationId,
  recordId: string
): Promise<
  Result<{
    record: {
      id: string;
      personId: string;
      title: string | null;
      recordType: string;
      startsAt: Date;
      endsAt: Date;
      allDay: boolean;
      contactability: string;
      includeInFeed: boolean;
      notesInternal: string | null;
      privacyMode: string;
      workingLocation: string | null;
      sourceType: string;
      approvalStatus: string;
    };
  }>
> {
  try {
    const recordResult = await getAvailabilityRecordById(
      clerkOrgId,
      organisationId,
      recordId as AvailabilityRecordId
    );

    if (!recordResult.ok) {
      return {
        ok: false,
        error: recordResult.error,
      };
    }

    const record = recordResult.value;

    // If the record is Xero-sourced, it's read-only
    if (record.sourceType !== "manual") {
      return {
        ok: false,
        error: appError(
          "forbidden",
          "Xero-sourced records cannot be edited. Please contact your Xero administrator."
        ),
      };
    }

    return {
      ok: true,
      value: {
        record: {
          id: record.id,
          personId: record.personId,
          title: record.title,
          recordType: record.recordType,
          startsAt: record.startsAt,
          endsAt: record.endsAt,
          allDay: record.allDay,
          contactability: record.contactability,
          includeInFeed: record.includeInFeed,
          notesInternal: record.notesInternal,
          privacyMode: record.privacyMode,
          workingLocation: record.workingLocation,
          sourceType: record.sourceType,
          approvalStatus: record.approvalStatus,
        },
      },
    };
  } catch {
    return {
      ok: false,
      error: appError("internal", "Failed to load availability record detail"),
    };
  }
}
