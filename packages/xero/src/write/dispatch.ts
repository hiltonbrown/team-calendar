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
  switch (payrollRegion) {
    case "AU":
      return await submitAuLeaveApplication(input);
    case "NZ":
      return await submitNzLeaveApplication(input);
    case "UK":
      return await submitUkLeaveApplication(input);
    default:
      return unsupportedRegion();
  }
}

export async function approveLeaveApplicationForRegion(
  payrollRegion: PayrollRegion | string,
  input: ApproveLeaveApplicationInput
): Promise<XeroWriteResult<{ rawResponse: unknown }>> {
  switch (payrollRegion) {
    case "AU":
      return await approveAuLeaveApplication(input);
    case "NZ":
      return await approveNzLeaveApplication(input);
    case "UK":
      return await approveUkLeaveApplication(input);
    default:
      return unsupportedRegion();
  }
}

export async function declineLeaveApplicationForRegion(
  payrollRegion: PayrollRegion | string,
  input: DeclineLeaveApplicationInput
): Promise<XeroWriteResult<{ rawResponse: unknown }>> {
  switch (payrollRegion) {
    case "AU":
      return await declineAuLeaveApplication(input);
    case "NZ":
      return await declineNzLeaveApplication(input);
    case "UK":
      return await declineUkLeaveApplication(input);
    default:
      return unsupportedRegion();
  }
}

export async function withdrawLeaveApplicationForRegion(
  payrollRegion: PayrollRegion | string,
  input: WithdrawLeaveApplicationInput
): Promise<XeroWriteResult<{ rawResponse: unknown }>> {
  switch (payrollRegion) {
    case "AU":
      return await withdrawAuLeaveApplication(input);
    case "NZ":
      return await withdrawNzLeaveApplication(input);
    case "UK":
      return await withdrawUkLeaveApplication(input);
    default:
      return unsupportedRegion();
  }
}

function unsupportedRegion(): XeroWriteResult<never> {
  return {
    ok: false,
    error: {
      code: "region_not_supported_error",
      message: "Unsupported payroll region.",
    },
  };
}
