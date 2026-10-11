import type { Result } from "@repo/core";
import { tenantDatabase } from "@repo/database";
import type { XeroAccessContext } from "../write/types";
export type ResolutionError =
  | {
      code: "missing_mapping";
      message: string;
    }
  | {
      code: "person_not_in_tenant";
      message: string;
    }
  | {
      code: "unknown_error";
      message: string;
    };
export async function resolveXeroEmployeeId(input: {
  personId: string;
  xeroConnection: XeroAccessContext;
}): Promise<Result<string, ResolutionError>> {
  try {
    const person = await tenantDatabase(
      input.xeroConnection.clerk_org_id
    ).person.findFirst({
      select: {
        source_person_key: true,
        source_system: true,
      },
      where: {
        archived_at: null,
        clerk_org_id: input.xeroConnection.clerk_org_id,
        id: input.personId,
        organisation_id: input.xeroConnection.organisation_id,
      },
    });
    if (!person) {
      const exists = await tenantDatabase(
        input.xeroConnection.clerk_org_id
      ).person.findFirst({
        select: { id: true },
        where: {
          clerk_org_id: input.xeroConnection.clerk_org_id,
          id: input.personId,
        },
      });
      return {
        error: {
          code: exists ? "person_not_in_tenant" : "missing_mapping",
          message: exists
            ? "Person does not belong to this Xero tenant."
            : "Person has not been synced from Xero.",
        },
        ok: false,
      };
    }
    if (person.source_system !== "XERO" || !person.source_person_key) {
      return {
        error: {
          code: "missing_mapping",
          message: "Person has not been synced from Xero.",
        },
        ok: false,
      };
    }
    return { ok: true, value: person.source_person_key };
  } catch {
    return {
      error: {
        code: "unknown_error",
        message: "Failed to resolve Xero employee mapping.",
      },
      ok: false,
    };
  }
}
