import type { Result } from "@repo/core";
import { assertTenantDb, type TenantDb } from "@repo/database";
import type { availability_record_type } from "@repo/database/generated/enums";
import type { XeroAccessContext } from "../write/types";
import type { ResolutionError } from "./resolve-employee";
export async function resolveXeroLeaveTypeId(
  input: {
    personId: string;
    recordType: availability_record_type;
    xeroConnection: XeroAccessContext;
  },
  db: TenantDb
): Promise<Result<string, ResolutionError>> {
  assertTenantDb(db, input.xeroConnection.account_id);
  const person = await db.person.findFirst({
    select: { id: true },
    where: {
      account_id: input.xeroConnection.account_id,
      archived_at: null,
      id: input.personId,
      organisation_id: input.xeroConnection.organisation_id,
    },
  });
  if (!person) {
    return {
      error: {
        code: "person_not_in_tenant",
        message: "Person does not belong to this Xero tenant.",
      },
      ok: false,
    };
  }
  const balance = await db.leaveBalance.findFirst({
    orderBy: { updated_at: "desc" },
    select: {
      leave_type_xero_id: true,
    },
    where: {
      account_id: input.xeroConnection.account_id,
      organisation_id: input.xeroConnection.organisation_id,
      person_id: input.personId,
      record_type: input.recordType,
      xero_connection_id: input.xeroConnection.id,
    },
  });
  if (!balance) {
    return {
      error: {
        code: "missing_mapping",
        message: "Leave type is not mapped for this employee in Xero.",
      },
      ok: false,
    };
  }
  return { ok: true, value: balance.leave_type_xero_id };
}
