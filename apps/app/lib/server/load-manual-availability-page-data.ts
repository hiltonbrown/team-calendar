import "server-only";

import type { ClerkOrgId, OrganisationId, PersonId, Result } from "@repo/core";
import { appError } from "@repo/core";
import { listManualAvailability } from "@repo/database/src/queries/availability-records";
import { listPeopleForOrganisation } from "@repo/database/src/queries/people";

/**
 * Loads manual availability records and people for the manual availability list page.
 */
export async function loadManualAvailabilityPageData(
  clerkOrgId: ClerkOrgId,
  organisationId: OrganisationId,
  filters?: {
    personId?: string;
    approvalStatus?: string;
    includeArchived?: boolean;
  }
): Promise<
  Result<{
    records: Array<{
      id: string;
      personId: string;
      personFirstName: string;
      personLastName: string;
      title: string | null;
      recordType: string;
      startsAt: Date;
      endsAt: Date;
      allDay: boolean;
      notesInternal: string | null;
      workingLocation: string | null;
      archivedAt: Date | null;
      approvalStatus: string;
      contactability: string;
      includeInFeed: boolean;
      privacyMode: string;
      createdAt: Date;
    }>;
    people: Array<{
      id: string;
      firstName: string;
      lastName: string;
      email: string;
    }>;
  }>
> {
  try {
    const [recordsResult, peopleResult] = await Promise.all([
      listManualAvailability(
        clerkOrgId,
        organisationId,
        filters
          ? {
              personId: filters.personId
                ? (filters.personId as PersonId)
                : undefined,
              approvalStatus: filters.approvalStatus,
              includeArchived: filters.includeArchived,
            }
          : undefined
      ),
      listPeopleForOrganisation(clerkOrgId, organisationId),
    ]);

    if (!recordsResult.ok) {
      return {
        ok: false,
        error: recordsResult.error,
      };
    }

    if (!peopleResult.ok) {
      return {
        ok: false,
        error: peopleResult.error,
      };
    }

    return {
      ok: true,
      value: {
        records: recordsResult.value.map((record) => ({
          id: record.id,
          personId: record.personId,
          personFirstName: record.personFirstName,
          personLastName: record.personLastName,
          title: record.title,
          recordType: record.recordType,
          startsAt: record.startsAt,
          endsAt: record.endsAt,
          allDay: record.allDay,
          notesInternal: record.notesInternal,
          workingLocation: record.workingLocation,
          archivedAt: record.archivedAt,
          approvalStatus: record.approvalStatus,
          contactability: record.contactability,
          includeInFeed: record.includeInFeed,
          privacyMode: record.privacyMode,
          createdAt: record.createdAt,
        })),
        people: peopleResult.value.map((person) => ({
          id: person.id,
          firstName: person.firstName,
          lastName: person.lastName,
          email: person.email,
        })),
      },
    };
  } catch {
    return {
      ok: false,
      error: appError(
        "internal",
        "Failed to load manual availability page data"
      ),
    };
  }
}
