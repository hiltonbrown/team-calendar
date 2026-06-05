import "server-only";

import type { ClerkOrgId, OrganisationId, Result } from "@repo/core";
import { appError } from "@repo/core";
import { listPendingApprovalRecords } from "@repo/database/src/queries/availability-records";
import { listPeopleForOrganisation } from "@repo/database/src/queries/people";

/**
 * Loads pending approval records and people for the leave approvals page.
 * Joins person names onto each record.
 */
export async function loadPendingApprovalsData(
  clerkOrgId: ClerkOrgId,
  organisationId: OrganisationId
): Promise<
  Result<{
    pendingRecords: Array<{
      id: string;
      personId: string;
      personFirstName: string;
      personLastName: string;
      recordType: string;
      startsAt: Date;
      endsAt: Date;
      createdAt: Date;
      approvalStatus: string;
    }>;
  }>
> {
  try {
    const [pendingResult, peopleResult] = await Promise.all([
      listPendingApprovalRecords(clerkOrgId, organisationId),
      listPeopleForOrganisation(clerkOrgId, organisationId),
    ]);

    if (!pendingResult.ok) {
      return {
        ok: false,
        error: pendingResult.error,
      };
    }

    if (!peopleResult.ok) {
      return {
        ok: false,
        error: peopleResult.error,
      };
    }

    // Build a map of person IDs to names
    const personMap = new Map(
      peopleResult.value.map((p) => [
        p.id,
        {
          firstName: p.firstName,
          lastName: p.lastName,
        },
      ])
    );

    // Join names onto records
    const pendingRecords = pendingResult.value.map((record) => {
      const person = personMap.get(record.personId);
      return {
        id: record.id,
        personId: record.personId,
        personFirstName: person?.firstName ?? "Unknown",
        personLastName: person?.lastName ?? "",
        recordType: record.recordType,
        startsAt: record.startsAt,
        endsAt: record.endsAt,
        createdAt: record.createdAt,
        approvalStatus: record.approvalStatus,
      };
    });

    return {
      ok: true,
      value: {
        pendingRecords,
      },
    };
  } catch {
    return {
      ok: false,
      error: appError("internal", "Failed to load pending approvals data"),
    };
  }
}
