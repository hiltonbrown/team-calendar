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
  assertTenantDb(db, input.xeroConnection.clerk_org_id);
  const run = async (
    client: TenantDb
  ): Promise<Result<string, ResolutionError>> => {
    const person = await client.person.findFirst({
      select: { id: true },
      where: {
        archived_at: null,
        clerk_org_id: input.xeroConnection.clerk_org_id,
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
    const balance = await client.leaveBalance.findFirst({
      orderBy: { updated_at: "desc" },
      select: {
        leave_type_xero_id: true,
      },
      where: {
        clerk_org_id: input.xeroConnection.clerk_org_id,
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
  };
  assertTenantDb(db, input.xeroConnection.clerk_org_id);
  return await run(db);
}
