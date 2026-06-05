import "server-only";

import type { ClerkOrgId, OrganisationId, PersonId, Result } from "@repo/core";
import { appError } from "@repo/core";
import {
  listLeaveBalancesForOrganisation,
  listPeopleForOrganisation,
} from "@repo/database/src/queries";

/**
 * Loads leave balances and people for the leave balances page.
 */
export async function loadLeaveBalancesPageData(
  clerkOrgId: ClerkOrgId,
  organisationId: OrganisationId,
  filters?: {
    personId?: string;
  }
): Promise<
  Result<{
    balances: Array<{
      id: string;
      personId: string;
      personFirstName: string;
      personLastName: string;
      xeroTenantId: null | string;
      leaveTypeXeroId: string;
      balance: number;
      updatedAt: Date;
    }>;
    people: Array<{
      id: string;
      firstName: string;
      lastName: string;
      email: string;
      employmentType: string;
      isActive: boolean;
    }>;
  }>
> {
  try {
    const [balancesResult, peopleResult] = await Promise.all([
      listLeaveBalancesForOrganisation(
        clerkOrgId,
        organisationId,
        filters?.personId
          ? { personId: filters.personId as PersonId }
          : undefined
      ),
      listPeopleForOrganisation(clerkOrgId, organisationId),
    ]);

    if (!balancesResult.ok) {
      return {
        ok: false,
        error: balancesResult.error,
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
        balances: balancesResult.value.map((balance) => ({
          id: balance.id,
          personId: balance.personId,
          personFirstName: balance.personFirstName,
          personLastName: balance.personLastName,
          xeroTenantId: balance.xeroTenantId,
          leaveTypeXeroId: balance.leaveTypeXeroId,
          balance: balance.balance,
          updatedAt: balance.updatedAt,
        })),
        people: peopleResult.value.map((person) => ({
          id: person.id,
          firstName: person.firstName,
          lastName: person.lastName,
          email: person.email,
          employmentType: person.employmentType,
          isActive: person.isActive,
        })),
      },
    };
  } catch {
    return {
      ok: false,
      error: appError("internal", "Failed to load leave balances page data"),
    };
  }
}
