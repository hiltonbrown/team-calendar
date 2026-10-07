import type { ClerkOrgId, OrganisationId, PersonId, Result } from "@repo/core";
import { appError } from "@repo/core";
import { database } from "../client";
import { scopedQuery } from "../tenant-query";
export interface LeaveBalanceData {
  balance: number;
  clerkOrgId: string;
  createdAt: Date;
  currencyCode: null | string;
  id: string;
  leaveTypeXeroId: string;
  organisationId: OrganisationId;
  personId: PersonId;
  updatedAt: Date;
  xeroConnectionId: null | string;
}
export interface LeaveBalanceSummaryData {
  balance: number;
  currencyCode: null | string;
  id: string;
  leaveTypeXeroId: string;
  personFirstName: string;
  personId: PersonId;
  personLastName: string;
  updatedAt: Date;
  xeroConnectionId: null | string;
}
export async function listLeaveBalancesForPerson(
  clerkOrgId: ClerkOrgId,
  organisationId: OrganisationId,
  personId: PersonId
): Promise<Result<LeaveBalanceData[]>> {
  try {
    const balances = await database.leaveBalance.findMany({
      orderBy: { leave_type_xero_id: "asc" },
      select: {
        balance: true,
        clerk_org_id: true,
        created_at: true,
        currency_code: true,
        id: true,
        leave_type_xero_id: true,
        organisation_id: true,
        person_id: true,
        updated_at: true,
        xero_connection_id: true,
      },
      where: {
        ...scopedQuery(clerkOrgId, organisationId),
        person_id: personId,
      },
    });
    return {
      ok: true,
      value: balances.map((b) => ({
        balance: Number(b.balance),
        clerkOrgId: b.clerk_org_id,
        createdAt: b.created_at,
        currencyCode: b.currency_code,
        id: b.id,
        leaveTypeXeroId: b.leave_type_xero_id,
        organisationId: b.organisation_id as OrganisationId,
        personId: b.person_id as PersonId,
        updatedAt: b.updated_at,
        xeroConnectionId: b.xero_connection_id,
      })),
    };
  } catch {
    return {
      error: appError("internal", "Failed to list leave balances"),
      ok: false,
    };
  }
}
export async function listLeaveBalancesForOrganisation(
  clerkOrgId: ClerkOrgId,
  organisationId: OrganisationId,
  filters?: {
    personId?: PersonId;
  }
): Promise<Result<LeaveBalanceSummaryData[]>> {
  try {
    const balances = await database.leaveBalance.findMany({
      orderBy: [
        { person: { first_name: "asc" } },
        { leave_type_xero_id: "asc" },
      ],
      select: {
        balance: true,
        currency_code: true,
        id: true,
        leave_type_xero_id: true,
        person: {
          select: {
            first_name: true,
            last_name: true,
          },
        },
        person_id: true,
        updated_at: true,
        xero_connection_id: true,
      },
      where: {
        ...scopedQuery(clerkOrgId, organisationId),
        ...(filters?.personId && { person_id: filters.personId }),
      },
    });
    return {
      ok: true,
      value: balances.map((b) => ({
        balance: Number(b.balance),
        currencyCode: b.currency_code,
        id: b.id,
        leaveTypeXeroId: b.leave_type_xero_id,
        personFirstName: b.person.first_name,
        personId: b.person_id as PersonId,
        personLastName: b.person.last_name,
        updatedAt: b.updated_at,
        xeroConnectionId: b.xero_connection_id,
      })),
    };
  } catch {
    return {
      error: appError(
        "internal",
        "Failed to list leave balances for organisation"
      ),
      ok: false,
    };
  }
}
