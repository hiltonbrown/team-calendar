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
import { availability_record_type } from "@repo/database/generated/enums";
import { emitXeroMetric } from "../metrics";
import { resolveXeroAccess } from "../oauth/authorisation";
import { createXeroDeadline } from "../rate-limit/deadline";
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
import { toPlainLanguageMessage, type XeroWriteError } from "../write/types";
import { XERO_OPERATION_CAPABILITIES } from "./capabilities";
import { classifyXeroFailure } from "./classify-xero-failure";
import { toResolvedXeroConnection } from "./resolved-tenant";

function isAvailabilityRecordType(
  val: string
): val is availability_record_type {
  return Object.values(availability_record_type).some((v) => v === val);
}

const writeErrorCertainty = (
  error: XeroWriteError
): "definitive_failure" | "outcome_unknown" => {
  if (error.dispatchPhase === "before_dispatch") {
    return "definitive_failure";
  }
  if (error.recoveryReason === "outcome_unknown") {
    return "outcome_unknown";
  }
  if (error.recoveryReason) {
    return "definitive_failure";
  }
  return error.code === "network_error" ||
    (error.httpStatus !== undefined && error.httpStatus >= 500) ||
    (error.code === "unknown_error" && error.httpStatus === undefined)
    ? "outcome_unknown"
    : "definitive_failure";
};

async function getTenant(
  clerkOrgId: string,
  organisationId: string,
  operation: keyof typeof XERO_OPERATION_CAPABILITIES
) {
  const scope = {
    capability: XERO_OPERATION_CAPABILITIES[operation],
    clerkOrgId,
    organisationId,
  };
  const resolved = await resolveXeroAccess({
    ...scope,
    deadline: createXeroDeadline(120_000),
  });
  if (!resolved.ok) {
    const error: XeroWriteError = {
      ...classifyXeroFailure({
        dispatched: false,
        error: resolved.error,
        isMutation: false,
      }),
      dispatchPhase: "before_dispatch",
      message: resolved.error.message,
      retryAfterMs: resolved.error.retryAfterMs,
    };
    return { error: toProviderError(error), ok: false as const };
  }
  return {
    ok: true as const,
    value: toResolvedXeroConnection(scope, resolved.value),
  };
}

function toProviderError(error: XeroWriteError): ProviderWriteError {
  if (error.recoveryReason === "update_permissions") {
    emitXeroMetric("xero.binding.permission_required", 1, {
      reason: "update_permissions",
    });
  }
  return {
    ...error,
    certainty: writeErrorCertainty(error),
    userMessage: toPlainLanguageMessage(error),
  };
}

export const XeroWriteAdapter: ExternalWritePort = {
  async approveLeaveApplication(
    input: ApproveLeaveInput
  ): Promise<Result<void, ProviderWriteError>> {
    const resolution = await getTenant(
      input.clerkOrgId,
      input.organisationId,
      "approveLeaveApplication"
    );
    if (!resolution.ok) {
      return resolution;
    }
    const tenant = resolution.value;
    const res = await approveLeaveApplicationForRegion(tenant.payroll_region, {
      xeroConnection: tenant,
      xeroEmployeeId: input.employeeId,
      xeroLeaveApplicationId: input.remoteId,
    });
    if (!res.ok) {
      return {
        error: toProviderError(res.error),
        ok: false,
      };
    }
    return { ok: true, value: undefined };
  },

  async declineLeaveApplication(
    input: DeclineLeaveInput
  ): Promise<Result<void, ProviderWriteError>> {
    const resolution = await getTenant(
      input.clerkOrgId,
      input.organisationId,
      "declineLeaveApplication"
    );
    if (!resolution.ok) {
      return resolution;
    }
    const tenant = resolution.value;
    const res = await declineLeaveApplicationForRegion(tenant.payroll_region, {
      reason: input.reason,
      xeroConnection: tenant,
      xeroEmployeeId: input.employeeId,
      xeroLeaveApplicationId: input.remoteId,
    });
    if (!res.ok) {
      return {
        error: toProviderError(res.error),
        ok: false,
      };
    }
    return { ok: true, value: undefined };
  },
  async findLeaveApplicationCandidates(input) {
    const resolution = await getTenant(
      input.clerkOrgId,
      input.organisationId,
      "findLeaveApplicationCandidates"
    );
    if (!resolution.ok) {
      return resolution;
    }
    const tenant = resolution.value;
    const result =
      tenant.payroll_region === "AU"
        ? await fetchLeaveRecordsForRegion(tenant.payroll_region, {
            xeroConnection: tenant,
          })
        : await fetchLeaveForEmployeeForRegion(tenant.payroll_region, {
            xeroConnection: tenant,
            xeroEmployeeId: input.employeeId,
          });
    if (!result.ok) {
      return {
        error: toProviderError(result.error),
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
    const resolution = await getTenant(
      input.clerkOrgId,
      input.organisationId,
      "resolveEmployeeId"
    );
    if (!resolution.ok) {
      return {
        error: {
          code: "unknown_error",
          message: resolution.error.userMessage,
          recoveryReason: resolution.error.recoveryReason,
          retryAfterMs: resolution.error.retryAfterMs,
        },
        ok: false,
      };
    }
    const tenant = resolution.value;
    const res = await resolveXeroEmployeeId({
      personId: input.personId,
      xeroConnection: tenant,
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
    const resolution = await getTenant(
      input.clerkOrgId,
      input.organisationId,
      "resolveLeaveTypeId"
    );
    if (!resolution.ok) {
      return {
        error: {
          code: "unknown_error",
          message: resolution.error.userMessage,
          recoveryReason: resolution.error.recoveryReason,
          retryAfterMs: resolution.error.retryAfterMs,
        },
        ok: false,
      };
    }
    const tenant = resolution.value;
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
      xeroConnection: tenant,
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
    const resolution = await getTenant(
      input.clerkOrgId,
      input.organisationId,
      "submitLeaveApplication"
    );
    if (!resolution.ok) {
      return resolution;
    }
    const tenant = resolution.value;
    const res = await submitLeaveApplicationForRegion(tenant.payroll_region, {
      endsAt: input.endsAt,
      startsAt: input.startsAt,
      title: input.title,
      units: input.units,
      xeroConnection: tenant,
      xeroEmployeeId: input.employeeId,
      xeroLeaveTypeId: input.leaveTypeId,
    });
    if (!res.ok) {
      return {
        error: toProviderError(res.error),
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
    const resolution = await getTenant(
      input.clerkOrgId,
      input.organisationId,
      "withdrawLeaveApplication"
    );
    if (!resolution.ok) {
      return resolution;
    }
    const tenant = resolution.value;
    const res = await withdrawLeaveApplicationForRegion(tenant.payroll_region, {
      xeroConnection: tenant,
      xeroEmployeeId: input.employeeId,
      xeroLeaveApplicationId: input.remoteId,
    });
    if (!res.ok) {
      return {
        error: toProviderError(res.error),
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
