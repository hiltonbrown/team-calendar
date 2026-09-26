import { executeWithXeroAuthRecovery } from "../adapter/auth-recovery";
import {
  approveLeaveApplication as approveAuLeaveApplication,
  declineLeaveApplication as declineAuLeaveApplication,
  submitLeaveApplication as submitAuLeaveApplication,
  withdrawLeaveApplication as withdrawAuLeaveApplication,
} from "../au/write";
import {
  approveLeaveApplication as approveNzLeaveApplication,
  declineLeaveApplication as declineNzLeaveApplication,
  submitLeaveApplication as submitNzLeaveApplication,
  withdrawLeaveApplication as withdrawNzLeaveApplication,
} from "../nz/write";
import {
  approveLeaveApplication as approveUkLeaveApplication,
  declineLeaveApplication as declineUkLeaveApplication,
  submitLeaveApplication as submitUkLeaveApplication,
  withdrawLeaveApplication as withdrawUkLeaveApplication,
} from "../uk/write";
import type {
  ApproveLeaveApplicationInput,
  DeclineLeaveApplicationInput,
  PayrollRegion,
  SubmitLeaveApplicationInput,
  WithdrawLeaveApplicationInput,
  XeroWriteResult,
} from "./types";

export async function submitLeaveApplicationForRegion(
  payrollRegion: PayrollRegion | string,
  input: SubmitLeaveApplicationInput
): Promise<
  XeroWriteResult<{ rawResponse: unknown; xeroLeaveApplicationId: string }>
> {
  return await executeWithXeroAuthRecovery(
    input.xeroTenant,
    async (xeroTenant) => {
      const nextInput = { ...input, xeroTenant };
      switch (payrollRegion) {
        case "AU":
          return await submitAuLeaveApplication(nextInput);
        case "NZ":
          return await submitNzLeaveApplication(nextInput);
        case "UK":
          return await submitUkLeaveApplication(nextInput);
        default:
          return unsupportedRegion();
      }
    },
    true
  );
}

export async function approveLeaveApplicationForRegion(
  payrollRegion: PayrollRegion | string,
  input: ApproveLeaveApplicationInput
): Promise<XeroWriteResult<{ rawResponse: unknown }>> {
  return await executeWithXeroAuthRecovery(
    input.xeroTenant,
    async (xeroTenant) => {
      const nextInput = { ...input, xeroTenant };
      switch (payrollRegion) {
        case "AU":
          return await approveAuLeaveApplication(nextInput);
        case "NZ":
          return await approveNzLeaveApplication(nextInput);
        case "UK":
          return await approveUkLeaveApplication(nextInput);
        default:
          return unsupportedRegion();
      }
    },
    true
  );
}

export async function declineLeaveApplicationForRegion(
  payrollRegion: PayrollRegion | string,
  input: DeclineLeaveApplicationInput
): Promise<XeroWriteResult<{ rawResponse: unknown }>> {
  return await executeWithXeroAuthRecovery(
    input.xeroTenant,
    async (xeroTenant) => {
      const nextInput = { ...input, xeroTenant };
      switch (payrollRegion) {
        case "AU":
          return await declineAuLeaveApplication(nextInput);
        case "NZ":
          return await declineNzLeaveApplication(nextInput);
        case "UK":
          return await declineUkLeaveApplication(nextInput);
        default:
          return unsupportedRegion();
      }
    },
    true
  );
}

export async function withdrawLeaveApplicationForRegion(
  payrollRegion: PayrollRegion | string,
  input: WithdrawLeaveApplicationInput
): Promise<XeroWriteResult<{ rawResponse: unknown }>> {
  return await executeWithXeroAuthRecovery(
    input.xeroTenant,
    async (xeroTenant) => {
      const nextInput = { ...input, xeroTenant };
      switch (payrollRegion) {
        case "AU":
          return await withdrawAuLeaveApplication(nextInput);
        case "NZ":
          return await withdrawNzLeaveApplication(nextInput);
        case "UK":
          return await withdrawUkLeaveApplication(nextInput);
        default:
          return unsupportedRegion();
      }
    },
    true
  );
}

function unsupportedRegion(): XeroWriteResult<never> {
  return {
    error: {
      code: "region_not_supported_error",
      message: "Unsupported payroll region.",
    },
    ok: false,
  };
}
