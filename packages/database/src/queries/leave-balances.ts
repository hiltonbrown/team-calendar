import type { AccountId, OrganisationId, PersonId, Result } from "@repo/core";
import { appError } from "@repo/core";
import { assertTenantDb, type TenantDb } from "../tenant-db";
import { scopedQuery } from "../tenant-query";
export interface LeaveBalanceData {
  accountId: string;
  balance: number;
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
  accountId: AccountId,
  organisationId: OrganisationId,
  personId: PersonId,
  db: TenantDb
): Promise<Result<LeaveBalanceData[]>> {
  {
    assertTenantDb(db, accountId);
    const tenantDb = db;

    try {
      const balances = await tenantDb.leaveBalance.findMany({
        orderBy: { leave_type_xero_id: "asc" },
        select: {
          account_id: true,
          balance: true,
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
          ...scopedQuery(accountId, organisationId),
          person_id: personId,
        },
      });
      return {
        ok: true,
        value: balances.map((b) => ({
          accountId: b.account_id,
          balance: Number(b.balance),
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
    } catch (error) {
      if (tenantDb) {
        throw error;
      }
      return {
        error: appError("internal", "Failed to list leave balances"),
        ok: false,
      };
    }
  }
}
export async function listLeaveBalancesForOrganisation(
  accountId: AccountId,
  organisationId: OrganisationId,
  filters:
    | {
        personId?: PersonId;
      }
    | undefined,
  db: TenantDb
): Promise<Result<LeaveBalanceSummaryData[]>> {
  {
    assertTenantDb(db, accountId);
    const tenantDb2 = db;

    try {
      const balances = await tenantDb2.leaveBalance.findMany({
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
          ...scopedQuery(accountId, organisationId),
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
    } catch (error) {
      if (tenantDb2) {
        throw error;
      }
      return {
        error: appError(
          "internal",
          "Failed to list leave balances for organisation"
        ),
        ok: false,
      };
    }
  }
}
