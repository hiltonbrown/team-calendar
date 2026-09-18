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
import {
  fetchLeaveForEmployeeForRegion,
  fetchLeaveRecordsForRegion,
} from "../read/dispatch";
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

const writeErrorCertainty = (error: {
  code: string;
  httpStatus?: number;
}): "definitive_failure" | "outcome_unknown" => {
  if (
    error.code === "network_error" ||
    (error.httpStatus !== undefined && error.httpStatus >= 500) ||
    (error.code === "unknown_error" && error.httpStatus === undefined)
  ) {
    return "outcome_unknown";
  }
  return "definitive_failure";
};

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
  async approveLeaveApplication(
    input: ApproveLeaveInput
  ): Promise<Result<void, ProviderWriteError>> {
    const tenant = await getTenant(input.clerkOrgId, input.organisationId);
    if (!tenant) {
      return {
        error: {
          code: "auth_error",
          message: "Xero is not connected.",
          userMessage: "Xero is not connected.",
        },
        ok: false,
      };
    }
    const res = await approveLeaveApplicationForRegion(tenant.payroll_region, {
      xeroEmployeeId: input.employeeId,
      xeroLeaveApplicationId: input.remoteId,
      xeroTenant: tenant,
    });
    if (!res.ok) {
      return {
        error: {
          certainty: writeErrorCertainty(res.error),
          code: res.error.code,
          correlationId: res.error.correlationId,
          httpStatus: res.error.httpStatus,
          message: res.error.message,
          rawPayload: res.error.rawPayload,
          userMessage: toPlainLanguageMessage(res.error),
        },
        ok: false,
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
        error: {
          code: "auth_error",
          message: "Xero is not connected.",
          userMessage: "Xero is not connected.",
        },
        ok: false,
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
        error: {
          certainty: writeErrorCertainty(res.error),
          code: res.error.code,
          correlationId: res.error.correlationId,
          httpStatus: res.error.httpStatus,
          message: res.error.message,
          rawPayload: res.error.rawPayload,
          userMessage: toPlainLanguageMessage(res.error),
        },
        ok: false,
      };
    }
    return { ok: true, value: undefined };
  },
  async findLeaveApplicationCandidates(input) {
    const tenant = await getTenant(input.clerkOrgId, input.organisationId);
    if (!tenant) {
      return {
        error: {
          certainty: "definitive_failure",
          code: "auth_error",
          message: "Xero is not connected.",
          userMessage: "Xero is not connected.",
        },
        ok: false,
      };
    }
    const result =
      tenant.payroll_region === "AU"
        ? await fetchLeaveRecordsForRegion(tenant.payroll_region, {
            xeroTenant: tenant,
          })
        : await fetchLeaveForEmployeeForRegion(tenant.payroll_region, {
            xeroEmployeeId: input.employeeId,
            xeroTenant: tenant,
          });
    if (!result.ok) {
      return {
        error: {
          certainty: writeErrorCertainty(result.error),
          code: result.error.code,
          correlationId: result.error.correlationId,
          httpStatus: result.error.httpStatus,
          message: result.error.message,
          rawPayload: result.error.rawPayload,
          userMessage: toPlainLanguageMessage(result.error),
        },
        ok: false,
      };
    }
    return {
      ok: true,
      value: {
        candidates: result.value.leaveRecords
          .filter((record) => record.employeeId === input.employeeId)
          .map((record) => ({
            approvalStatus: providerApprovalStatus(record.status),
            employeeId: record.employeeId,
            endsAt: record.endDate,
            leaveTypeId: record.leaveTypeId,
            rawResponse: record.rawPayload,
            remoteId: record.leaveApplicationId,
            startsAt: record.startDate,
            title: record.title,
            units: record.units,
          })),
        complete: result.value.complete,
      },
    };
  },
  async resolveEmployeeId(input: {
    personId: string;
    clerkOrgId: string;
    organisationId: string;
  }): Promise<Result<string, ProviderResolutionError>> {
    const tenant = await getTenant(input.clerkOrgId, input.organisationId);
    if (!tenant) {
      return {
        error: { code: "unknown_error", message: "Xero tenant not found." },
        ok: false,
      };
    }
    const res = await resolveXeroEmployeeId({
      personId: input.personId,
      xeroTenant: tenant,
    });
    if (!res.ok) {
      return {
        error: { code: res.error.code, message: res.error.message },
        ok: false,
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
        error: { code: "unknown_error", message: "Xero tenant not found." },
        ok: false,
      };
    }
    if (!isAvailabilityRecordType(input.recordType)) {
      return {
        error: {
          code: "unknown_error",
          message: `Invalid record type: ${input.recordType}`,
        },
        ok: false,
      };
    }
    const res = await resolveXeroLeaveTypeId({
      personId: input.personId,
      recordType: input.recordType,
      xeroTenant: tenant,
    });
    if (!res.ok) {
      return {
        error: { code: res.error.code, message: res.error.message },
        ok: false,
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
        error: {
          code: "auth_error",
          message: "Xero is not connected.",
          userMessage: "Xero is not connected.",
        },
        ok: false,
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
        error: {
          certainty: writeErrorCertainty(res.error),
          code: res.error.code,
          correlationId: res.error.correlationId,
          httpStatus: res.error.httpStatus,
          message: res.error.message,
          rawPayload: res.error.rawPayload,
          userMessage: toPlainLanguageMessage(res.error),
        },
        ok: false,
      };
    }
    return {
      ok: true,
      value: {
        rawResponse: res.value.rawResponse,
        remoteId: res.value.xeroLeaveApplicationId,
      },
    };
  },

  async withdrawLeaveApplication(
    input: WithdrawLeaveInput
  ): Promise<Result<void, ProviderWriteError>> {
    const tenant = await getTenant(input.clerkOrgId, input.organisationId);
    if (!tenant) {
      return {
        error: {
          code: "auth_error",
          message: "Xero is not connected.",
          userMessage: "Xero is not connected.",
        },
        ok: false,
      };
    }
    const res = await withdrawLeaveApplicationForRegion(tenant.payroll_region, {
      xeroEmployeeId: input.employeeId,
      xeroLeaveApplicationId: input.remoteId,
      xeroTenant: tenant,
    });
    if (!res.ok) {
      return {
        error: {
          certainty: writeErrorCertainty(res.error),
          code: res.error.code,
          correlationId: res.error.correlationId,
          httpStatus: res.error.httpStatus,
          message: res.error.message,
          rawPayload: res.error.rawPayload,
          userMessage: toPlainLanguageMessage(res.error),
        },
        ok: false,
      };
    }
    return { ok: true, value: undefined };
  },
};

function providerApprovalStatus(
  status:
    | "APPROVED"
    | "DELETED"
    | "REJECTED"
    | "SUBMITTED"
    | "UNKNOWN"
    | "WITHDRAWN"
): "approved" | "cancelled" | "declined" | "submitted" | "withdrawn" {
  switch (status) {
    case "APPROVED":
      return "approved";
    case "DELETED":
      return "cancelled";
    case "REJECTED":
      return "declined";
    case "WITHDRAWN":
      return "withdrawn";
    default:
      return "submitted";
  }
}
