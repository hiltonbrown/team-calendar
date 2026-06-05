import "server-only";

import type { ClerkOrgId, OrganisationId, PersonId, Result } from "@repo/core";
import { appError } from "@repo/core";
import { listAvailabilityForPerson } from "@repo/database/src/queries/availability-records";
import { listLeaveBalancesForPerson } from "@repo/database/src/queries/leave-balances";
import { getPersonProfile } from "@repo/database/src/queries/people";

/**
 * Loads complete person profile data including profile, availability, and leave balances.
 */
export async function loadPersonProfileData(
  clerkOrgId: ClerkOrgId,
  organisationId: OrganisationId,
  personId: PersonId,
  dateRange: {
    startDate: Date;
    endDate: Date;
  }
): Promise<
  Result<{
    profile: {
      id: PersonId;
      firstName: string;
      lastName: string;
      email: string;
      employmentType: string;
      isActive: boolean;
      sourceSystem: string;
      team: { id: string; name: string } | null;
      location: { id: string; name: string } | null;
    };
    availability: Array<{
      id: string;
      recordType: string;
      sourceType: string;
      startsAt: Date;
      endsAt: Date;
      approvalStatus: string;
      privacyMode: string;
    }>;
    leaveBalances: Array<{
      leaveTypeXeroId: string;
      balance: number;
    }>;
  }>
> {
  try {
    // Load person profile
    const profileResult = await getPersonProfile(
      clerkOrgId,
      organisationId,
      personId
    );

    if (!profileResult.ok) {
      return {
        ok: false,
        error: profileResult.error,
      };
    }

    // Load availability for the date range
    const availabilityResult = await listAvailabilityForPerson(
      clerkOrgId,
      organisationId,
      personId,
      dateRange
    );

    if (!availabilityResult.ok) {
      return {
        ok: false,
        error: availabilityResult.error,
      };
    }

    // Load leave balances
    const balancesResult = await listLeaveBalancesForPerson(
      clerkOrgId,
      organisationId,
      personId
    );

    if (!balancesResult.ok) {
      return {
        ok: false,
        error: balancesResult.error,
      };
    }

    return {
      ok: true,
      value: {
        profile: {
          id: profileResult.value.id,
          firstName: profileResult.value.firstName,
          lastName: profileResult.value.lastName,
          email: profileResult.value.email,
          employmentType: profileResult.value.employmentType,
          isActive: profileResult.value.isActive,
          sourceSystem: profileResult.value.sourceSystem,
          team: profileResult.value.team,
          location: profileResult.value.location,
        },
        availability: availabilityResult.value.map((record) => ({
          id: record.id,
          recordType: record.recordType,
          sourceType: record.sourceType,
          startsAt: record.startsAt,
          endsAt: record.endsAt,
          approvalStatus: record.approvalStatus,
          privacyMode: record.privacyMode,
        })),
        leaveBalances: balancesResult.value.map((balance) => ({
          leaveTypeXeroId: balance.leaveTypeXeroId,
          balance: balance.balance,
        })),
      },
    };
  } catch {
    return {
      ok: false,
      error: appError("internal", "Failed to load person profile data"),
    };
  }
}
