import type {
  ApproveLeaveInput,
  DeclineLeaveInput,
  ExternalWritePort,
  ProviderResolutionError,
  ProviderWriteError,
  Result,
  SubmitLeaveInput,
  WithdrawLeaveInput,
} from "@repo/core";
import { database } from "@repo/database";
import { availability_record_type } from "@repo/database/generated/enums";
import { ensureFreshXeroConnection } from "../oauth/service";
import { resolveXeroEmployeeId } from "../resolution/resolve-employee";
import { resolveXeroLeaveTypeId } from "../resolution/resolve-leave-type";
import {
  approveLeaveApplicationForRegion,
  declineLeaveApplicationForRegion,
  submitLeaveApplicationForRegion,
  withdrawLeaveApplicationForRegion,
} from "../write/dispatch";
import { toPlainLanguageMessage } from "../write/types";

function isAvailabilityRecordType(
  val: string
): val is availability_record_type {
  return Object.values(availability_record_type).some((v) => v === val);
}

function loadTenant(clerkOrgId: string, organisationId: string) {
  return database.xeroTenant.findFirst({
    include: {
      xero_connection: {
        select: {
          access_token_auth_tag: true,
          access_token_encrypted: true,
          access_token_iv: true,
          revoked_at: true,
        },
      },
    },
    where: {
      clerk_org_id: clerkOrgId,
      organisation_id: organisationId,
    },
  });
}

// Resolve the tenant for a synchronous, user-triggered write, refreshing the access token
// proactively first so a write does not fail on a token that lapsed since the last sync.
// Returns null when the tenant is missing or the connection cannot be made usable; callers
// surface this as "Xero is not connected".
async function getTenant(clerkOrgId: string, organisationId: string) {
  const tenant = await loadTenant(clerkOrgId, organisationId);
  if (!tenant) {
    return null;
  }
  const freshness = await ensureFreshXeroConnection({
    clerkOrgId,
    connectionId: tenant.xero_connection_id,
    organisationId,
  });
  if (!freshness.ok) {
    return null;
  }
  if (!freshness.value.refreshed) {
    return tenant;
  }
  return await loadTenant(clerkOrgId, organisationId);
}

export const XeroWriteAdapter: ExternalWritePort = {
  async resolveEmployeeId(input: {
    personId: string;
    clerkOrgId: string;
    organisationId: string;
  }): Promise<Result<string, ProviderResolutionError>> {
    const tenant = await getTenant(input.clerkOrgId, input.organisationId);
    if (!tenant) {
      return {
        ok: false,
        error: { code: "unknown_error", message: "Xero tenant not found." },
      };
    }
    const res = await resolveXeroEmployeeId({
      personId: input.personId,
      xeroTenant: tenant,
    });
    if (!res.ok) {
      return {
        ok: false,
        error: { code: res.error.code, message: res.error.message },
      };
    }
    return { ok: true, value: res.value };
  },

  async resolveLeaveTypeId(input: {
    personId: string;
    recordType: string;
    clerkOrgId: string;
    organisationId: string;
  }): Promise<Result<string, ProviderResolutionError>> {
    const tenant = await getTenant(input.clerkOrgId, input.organisationId);
    if (!tenant) {
      return {
        ok: false,
        error: { code: "unknown_error", message: "Xero tenant not found." },
      };
    }
    if (!isAvailabilityRecordType(input.recordType)) {
      return {
        ok: false,
        error: {
          code: "unknown_error",
          message: `Invalid record type: ${input.recordType}`,
        },
      };
    }
    const res = await resolveXeroLeaveTypeId({
      personId: input.personId,
      recordType: input.recordType,
      xeroTenant: tenant,
    });
    if (!res.ok) {
      return {
        ok: false,
        error: { code: res.error.code, message: res.error.message },
      };
    }
    return { ok: true, value: res.value };
  },

  async submitLeaveApplication(
    input: SubmitLeaveInput
  ): Promise<
    Result<{ remoteId: string; rawResponse: unknown }, ProviderWriteError>
  > {
    const tenant = await getTenant(input.clerkOrgId, input.organisationId);
    if (!tenant) {
      return {
        ok: false,
        error: {
          code: "auth_error",
          message: "Xero is not connected.",
          userMessage: "Xero is not connected.",
        },
      };
    }
    const res = await submitLeaveApplicationForRegion(tenant.payroll_region, {
      endsAt: input.endsAt,
      startsAt: input.startsAt,
      title: input.title,
      units: input.units,
      xeroEmployeeId: input.employeeId,
      xeroLeaveTypeId: input.leaveTypeId,
      xeroTenant: tenant,
    });
    if (!res.ok) {
      return {
        ok: false,
        error: {
          code: res.error.code,
          message: res.error.message,
          userMessage: toPlainLanguageMessage(res.error),
          correlationId: res.error.correlationId,
          httpStatus: res.error.httpStatus,
          rawPayload: res.error.rawPayload,
        },
      };
    }
    return {
      ok: true,
      value: {
        remoteId: res.value.xeroLeaveApplicationId,
        rawResponse: res.value.rawResponse,
      },
    };
  },

  async withdrawLeaveApplication(
    input: WithdrawLeaveInput
  ): Promise<Result<void, ProviderWriteError>> {
    const tenant = await getTenant(input.clerkOrgId, input.organisationId);
    if (!tenant) {
      return {
        ok: false,
        error: {
          code: "auth_error",
          message: "Xero is not connected.",
          userMessage: "Xero is not connected.",
        },
      };
    }
    const res = await withdrawLeaveApplicationForRegion(tenant.payroll_region, {
      xeroEmployeeId: input.employeeId,
      xeroLeaveApplicationId: input.remoteId,
      xeroTenant: tenant,
    });
    if (!res.ok) {
      return {
        ok: false,
        error: {
          code: res.error.code,
          message: res.error.message,
          userMessage: toPlainLanguageMessage(res.error),
          correlationId: res.error.correlationId,
          httpStatus: res.error.httpStatus,
          rawPayload: res.error.rawPayload,
        },
      };
    }
    return { ok: true, value: undefined };
  },

  async approveLeaveApplication(
    input: ApproveLeaveInput
  ): Promise<Result<void, ProviderWriteError>> {
    const tenant = await getTenant(input.clerkOrgId, input.organisationId);
    if (!tenant) {
      return {
        ok: false,
        error: {
          code: "auth_error",
          message: "Xero is not connected.",
          userMessage: "Xero is not connected.",
        },
      };
    }
    const res = await approveLeaveApplicationForRegion(tenant.payroll_region, {
      xeroEmployeeId: input.employeeId,
      xeroLeaveApplicationId: input.remoteId,
      xeroTenant: tenant,
    });
    if (!res.ok) {
      return {
        ok: false,
        error: {
          code: res.error.code,
          message: res.error.message,
          userMessage: toPlainLanguageMessage(res.error),
          correlationId: res.error.correlationId,
          httpStatus: res.error.httpStatus,
          rawPayload: res.error.rawPayload,
        },
      };
    }
    return { ok: true, value: undefined };
  },

  async declineLeaveApplication(
    input: DeclineLeaveInput
  ): Promise<Result<void, ProviderWriteError>> {
    const tenant = await getTenant(input.clerkOrgId, input.organisationId);
    if (!tenant) {
      return {
        ok: false,
        error: {
          code: "auth_error",
          message: "Xero is not connected.",
          userMessage: "Xero is not connected.",
        },
      };
    }
    const res = await declineLeaveApplicationForRegion(tenant.payroll_region, {
      reason: input.reason,
      xeroEmployeeId: input.employeeId,
      xeroLeaveApplicationId: input.remoteId,
      xeroTenant: tenant,
    });
    if (!res.ok) {
      return {
        ok: false,
        error: {
          code: res.error.code,
          message: res.error.message,
          userMessage: toPlainLanguageMessage(res.error),
          correlationId: res.error.correlationId,
          httpStatus: res.error.httpStatus,
          rawPayload: res.error.rawPayload,
        },
      };
    }
    return { ok: true, value: undefined };
  },
};
