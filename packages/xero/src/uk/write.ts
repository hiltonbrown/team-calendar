import type {
  ApproveLeaveApplicationInput,
  DeclineLeaveApplicationInput,
  SubmitLeaveApplicationInput,
  WithdrawLeaveApplicationInput,
  XeroWriteResult,
} from "../write/types";

const writeBackNotAvailableError = {
  code: "region_not_supported_error" as const,
  message: "UK payroll write-back is not yet available.",
};

const approvalNotAvailableError = {
  code: "region_not_supported_error" as const,
  message: "UK payroll approval is not yet available.",
};

export function submitLeaveApplication(
  _input: SubmitLeaveApplicationInput
): Promise<
  XeroWriteResult<{ rawResponse: unknown; xeroLeaveApplicationId: string }>
> {
  // TODO(uk-payroll): implement UK payroll leave write-back.
  return Promise.resolve({ ok: false, error: writeBackNotAvailableError });
}

export function approveLeaveApplication(
  _input: ApproveLeaveApplicationInput
): Promise<XeroWriteResult<{ rawResponse: unknown }>> {
  // TODO(uk-payroll): implement UK payroll leave write-back.
  return Promise.resolve({ ok: false, error: approvalNotAvailableError });
}

export function declineLeaveApplication(
  _input: DeclineLeaveApplicationInput
): Promise<XeroWriteResult<{ rawResponse: unknown }>> {
  // TODO(uk-payroll): implement UK payroll leave write-back.
  return Promise.resolve({ ok: false, error: approvalNotAvailableError });
}

export function withdrawLeaveApplication(
  _input: WithdrawLeaveApplicationInput
): Promise<XeroWriteResult<{ rawResponse: unknown }>> {
  // TODO(uk-payroll): implement UK payroll leave write-back.
  return Promise.resolve({ ok: false, error: writeBackNotAvailableError });
}
