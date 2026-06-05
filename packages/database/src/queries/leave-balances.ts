import type { ClerkOrgId, OrganisationId, PersonId, Result } from "@repo/core";
import { appError } from "@repo/core";
import { database } from "../client";
import { scopedQuery } from "../tenant-query";

export interface LeaveBalanceData {
  balance: number;
  clerkOrgId: string;
  createdAt: Date;
  id: string;
  leaveTypeXeroId: string;
  organisationId: OrganisationId;
  personId: PersonId;
  updatedAt: Date;
  xeroTenantId: null | string;
}

export interface LeaveBalanceSummaryData {
  balance: number;
  id: string;
  leaveTypeXeroId: string;
  personFirstName: string;
  personId: PersonId;
  personLastName: string;
  updatedAt: Date;
  xeroTenantId: null | string;
}

export async function listLeaveBalancesForPerson(
  clerkOrgId: ClerkOrgId,
  organisationId: OrganisationId,
  personId: PersonId
): Promise<Result<LeaveBalanceData[]>> {
  try {
    const balances = await database.leaveBalance.findMany({
      where: {
        ...scopedQuery(clerkOrgId, organisationId),
        person_id: personId,
      },
      select: {
        id: true,
        clerk_org_id: true,
        organisation_id: true,
        person_id: true,
        xero_tenant_id: true,
        leave_type_xero_id: true,
        balance: true,
        created_at: true,
        updated_at: true,
      },
      orderBy: { leave_type_xero_id: "asc" },
    });

    return {
      ok: true,
      value: balances.map((b) => ({
        id: b.id,
        clerkOrgId: b.clerk_org_id,
        organisationId: b.organisation_id as OrganisationId,
        personId: b.person_id as PersonId,
        xeroTenantId: b.xero_tenant_id,
        leaveTypeXeroId: b.leave_type_xero_id,
        balance: Number(b.balance),
        createdAt: b.created_at,
        updatedAt: b.updated_at,
      })),
    };
  } catch {
    return {
      ok: false,
      error: appError("internal", "Failed to list leave balances"),
    };
  }
}

export async function listLeaveBalancesForOrganisation(
  clerkOrgId: ClerkOrgId,
  organisationId: OrganisationId,
  filters?: { personId?: PersonId }
): Promise<Result<LeaveBalanceSummaryData[]>> {
  try {
    const balances = await database.leaveBalance.findMany({
      where: {
        ...scopedQuery(clerkOrgId, organisationId),
        ...(filters?.personId && { person_id: filters.personId }),
      },
      select: {
        id: true,
        person_id: true,
        xero_tenant_id: true,
        leave_type_xero_id: true,
        balance: true,
        updated_at: true,
        person: {
          select: {
            first_name: true,
            last_name: true,
          },
        },
      },
      orderBy: [
        { person: { first_name: "asc" } },
        { leave_type_xero_id: "asc" },
      ],
    });

    return {
      ok: true,
      value: balances.map((b) => ({
        id: b.id,
        personId: b.person_id as PersonId,
        personFirstName: b.person.first_name,
        personLastName: b.person.last_name,
        xeroTenantId: b.xero_tenant_id,
        leaveTypeXeroId: b.leave_type_xero_id,
        balance: Number(b.balance),
        updatedAt: b.updated_at,
      })),
    };
  } catch {
    return {
      ok: false,
      error: appError(
        "internal",
        "Failed to list leave balances for organisation"
      ),
    };
  }
}
