import type { Result } from "../../index";

export interface ProviderResolutionError {
  code: "missing_mapping" | "person_not_in_tenant" | "unknown_error";
  message: string;
}

export interface ProviderWriteError {
  code: string;
  correlationId?: string | null;
  httpStatus?: number | null;
  message: string;
  rawPayload?: unknown;
  userMessage: string;
}

export interface SubmitLeaveInput {
  clerkOrgId: string;
  employeeId: string;
  endsAt: Date;
  leaveTypeId: string;
  organisationId: string;
  startsAt: Date;
  title?: string;
  units: number;
}

export interface WithdrawLeaveInput {
  clerkOrgId: string;
  employeeId: string;
  organisationId: string;
  remoteId: string;
}

export interface ApproveLeaveInput {
  clerkOrgId: string;
  employeeId: string;
  organisationId: string;
  remoteId: string;
}

export interface DeclineLeaveInput {
  clerkOrgId: string;
  employeeId: string;
  organisationId: string;
  reason: string;
  remoteId: string;
}

export interface ExternalWritePort {
  approveLeaveApplication(
    input: ApproveLeaveInput
  ): Promise<Result<void, ProviderWriteError>>;

  declineLeaveApplication(
    input: DeclineLeaveInput
  ): Promise<Result<void, ProviderWriteError>>;
  resolveEmployeeId(input: {
    personId: string;
    clerkOrgId: string;
    organisationId: string;
  }): Promise<Result<string, ProviderResolutionError>>;

  resolveLeaveTypeId(input: {
    personId: string;
    recordType: string;
    clerkOrgId: string;
    organisationId: string;
  }): Promise<Result<string, ProviderResolutionError>>;

  submitLeaveApplication(
    input: SubmitLeaveInput
  ): Promise<
    Result<{ remoteId: string; rawResponse: unknown }, ProviderWriteError>
  >;

  withdrawLeaveApplication(
    input: WithdrawLeaveInput
  ): Promise<Result<void, ProviderWriteError>>;
}
