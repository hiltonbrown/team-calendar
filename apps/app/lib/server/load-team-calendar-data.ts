import "server-only";

import type { ClerkOrgId, OrganisationId, PersonId, Result } from "@repo/core";
import { appError } from "@repo/core";
import { listAvailabilityForCalendar } from "@repo/database/src/queries/availability-records";
import { listPeopleForOrganisation } from "@repo/database/src/queries/people";

/**
 * Loads team calendar data for a date range.
 * Includes all people and their availability in the specified period.
 */
export async function loadTeamCalendarData(
  clerkOrgId: ClerkOrgId,
  organisationId: OrganisationId,
  dateRange: {
    startDate: Date;
    endDate: Date;
  },
  filters?: {
    teamId?: string;
    locationId?: string;
    recordType?: string;
    approvalStatus?: string;
  }
): Promise<
  Result<{
    people: Array<{
      id: PersonId;
      firstName: string;
      lastName: string;
      email: string;
      teamId: string | null;
      locationId: string | null;
    }>;
    availability: Array<{
      id: string;
      personId: PersonId;
      recordType: string;
      startsAt: Date;
      endsAt: Date;
      approvalStatus: string;
      privacyMode: string;
      contactability: string;
    }>;
  }>
> {
  try {
    // Load people
    const peopleResult = await listPeopleForOrganisation(
      clerkOrgId,
      organisationId,
      filters
    );

    if (!peopleResult.ok) {
      return {
        ok: false,
        error: peopleResult.error,
      };
    }

    // Build query filters
    const calendarFilters: Parameters<typeof listAvailabilityForCalendar>[3] =
      {};

    // Add person IDs filter if team or location filter applied
    if (filters?.teamId || filters?.locationId) {
      calendarFilters.personIds = peopleResult.value.map((p) => p.id);
    }

    // Add record type filter
    if (filters?.recordType) {
      calendarFilters.recordTypes = [filters.recordType];
    }

    // Add approval status filter
    if (filters?.approvalStatus) {
      calendarFilters.approvalStatus = filters.approvalStatus;
    }

    // Load availability for the date range
    const availabilityResult = await listAvailabilityForCalendar(
      clerkOrgId,
      organisationId,
      dateRange,
      Object.keys(calendarFilters).length > 0 ? calendarFilters : undefined
    );

    if (!availabilityResult.ok) {
      return {
        ok: false,
        error: availabilityResult.error,
      };
    }

    return {
      ok: true,
      value: {
        people: peopleResult.value.map((person) => ({
          id: person.id,
          firstName: person.firstName,
          lastName: person.lastName,
          email: person.email,
          teamId: person.teamId,
          locationId: person.locationId,
        })),
        availability: availabilityResult.value.map((record) => ({
          id: record.id,
          personId: record.personId,
          recordType: record.recordType,
          startsAt: record.startsAt,
          endsAt: record.endsAt,
          approvalStatus: record.approvalStatus,
          privacyMode: record.privacyMode,
          contactability: record.contactability,
        })),
      },
    };
  } catch {
    return {
      ok: false,
      error: appError("internal", "Failed to load team calendar data"),
    };
  }
}
