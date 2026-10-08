import type { Result } from "../../index";

export interface ProviderResolutionError {
  code: "missing_mapping" | "person_not_in_tenant" | "unknown_error";
  message: string;
  recoveryReason?: ProviderWriteError["recoveryReason"];
  retryAfterMs?: number;
}

export interface ProviderWriteError {
  certainty?: ProviderWriteCertainty;
  code: string;
  correlationId?: string | null;
  // Before dispatch is a definite non-attempt (admission, configuration, decryption,
  // expired deadline or origin). After dispatch is an unknown outcome (lost response,
  // 5xx, timeout or body failure).
  dispatchPhase?: "before_dispatch" | "after_dispatch";
  httpStatus?: number | null;
  message: string;
  rawPayload?: unknown;
  recoveryReason?:
    | "update_permissions"
    | "reauthorise"
    | "access_denied"
    | "operational_incident"
    | "retry_later"
    | "outcome_unknown"
    | "not_connected";
  retryAfterMs?: number;
  userMessage: string;
}

export type ProviderWriteCertainty = "definitive_failure" | "outcome_unknown";

export interface ProviderMutationRequest {
  body: string | null;
  method: "POST" | "PUT" | "PATCH";
  url: string;
  xeroTenantId: string;
}

export interface XeroMutationIdentity {
  firstDispatchedAt: Date;
  idempotencyKey: string;
  replayBefore: Date;
  request: ProviderMutationRequest;
}

export interface PrepareLeaveMutationInput {
  action: "create" | "approve" | "decline" | "withdraw";
  clerkOrgId: string;
  employeeId: string;
  endsAt?: Date;
  leaveTypeId?: string;
  organisationId: string;
  reason?: string;
  remoteId?: string;
  startsAt?: Date;
  title?: string;
  units?: number;
}

export interface SubmitLeaveInput {
  clerkOrgId: string;
  employeeId: string;
  endsAt: Date;
  leaveTypeId: string;
  mutation?: XeroMutationIdentity;
  organisationId: string;
  startsAt: Date;
  title?: string;
  units: number;
}

export interface ProviderLeaveCandidate {
  approvalStatus:
    | "approved"
    | "cancelled"
    | "declined"
    | "submitted"
    | "withdrawn";
  employeeId: string;
  endsAt: string;
  leaveTypeId: string;
  rawResponse: unknown;
  remoteId: string;
  startsAt: string;
  title: string | null;
  units: number;
}

export interface WithdrawLeaveInput {
  clerkOrgId: string;
  employeeId: string;
  mutation?: XeroMutationIdentity;
  organisationId: string;
  remoteId: string;
}

export interface ApproveLeaveInput {
  clerkOrgId: string;
  employeeId: string;
  mutation?: XeroMutationIdentity;
  organisationId: string;
  remoteId: string;
}

export interface DeclineLeaveInput {
  clerkOrgId: string;
  employeeId: string;
  mutation?: XeroMutationIdentity;
  organisationId: string;
  reason: string;
  remoteId: string;
}

export interface ExternalWritePort {
  approveLeaveApplication: (
    input: ApproveLeaveInput
  ) => Promise<Result<void, ProviderWriteError>>;

  declineLeaveApplication: (
    input: DeclineLeaveInput
  ) => Promise<Result<void, ProviderWriteError>>;
  findLeaveApplicationCandidates?: (input: {
    clerkOrgId: string;
    employeeId: string;
    expectedXeroTenantId?: string;
    organisationId: string;
  }) => Promise<
    Result<
      { candidates: ProviderLeaveCandidate[]; complete: boolean },
      ProviderWriteError
    >
  >;
  prepareLeaveMutation: (
    input: PrepareLeaveMutationInput
  ) => Promise<Result<ProviderMutationRequest, ProviderWriteError>>;
  resolveEmployeeId: (input: {
    personId: string;
    clerkOrgId: string;
    organisationId: string;
  }) => Promise<Result<string, ProviderResolutionError>>;

  resolveLeaveTypeId: (input: {
    personId: string;
    recordType: string;
    clerkOrgId: string;
    organisationId: string;
  }) => Promise<Result<string, ProviderResolutionError>>;

  submitLeaveApplication: (
    input: SubmitLeaveInput
  ) => Promise<
    Result<{ remoteId: string; rawResponse: unknown }, ProviderWriteError>
  >;

  withdrawLeaveApplication: (
    input: WithdrawLeaveInput
  ) => Promise<Result<void, ProviderWriteError>>;
}
