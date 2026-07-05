# Plan 007 Report: NZ Payroll Read and Write-Back Spike

This report provides the technical investigation, delta mappings, and build specifications for implementing New Zealand (NZ) Payroll read-side sync and write-back functionality in the Team Calendar platform.

---

## 1. AU Baseline

The current AU Payroll implementation acts as the platform reference model. All file and line citations are mapped below.

### 1.1 Write-Back Operations
AU write operations are defined in [packages/xero/src/au/write.ts](file:///home/hilton/.gemini/antigravity-cli/brain/d0f4af20-e5ed-4f8a-a268-63a352ea09f6/.system_generated/worktrees/subagent-Plan-007-Executor-self-36c77a82/packages/xero/src/au/write.ts) and map directly to Xero AU Payroll endpoints:

*   **Submit Leave Application**: [write.ts:L32-L88](file:///home/hilton/.gemini/antigravity-cli/brain/d0f4af20-e5ed-4f8a-a268-63a352ea09f6/.system_generated/worktrees/subagent-Plan-007-Executor-self-36c77a82/packages/xero/src/au/write.ts#L32-L88)
    *   **Endpoint & Method**: `POST /payroll.xro/1.0/LeaveApplications` (line 57).
    *   **Payload Shape**: An array of `LeaveApplications` containing the nested employee ID, start/end dates, number of units, and the title.
    *   **Response Shape**: An object containing `LeaveApplications` array returning the created `LeaveApplicationID` or `LeaveApplicationId` (lines 64-68).
*   **Approve Leave Application**: [write.ts:L90-L103](file:///home/hilton/.gemini/antigravity-cli/brain/d0f4af20-e5ed-4f8a-a268-63a352ea09f6/.system_generated/worktrees/subagent-Plan-007-Executor-self-36c77a82/packages/xero/src/au/write.ts#L90-L103)
    *   **Endpoint & Method**: `POST /payroll.xro/1.0/LeaveApplications/{LeaveApplicationID}/approve` (lines 95-97). No payload required.
*   **Decline Leave Application**: [write.ts:L105-L121](file:///home/hilton/.gemini/antigravity-cli/brain/d0f4af20-e5ed-4f8a-a268-63a352ea09f6/.system_generated/worktrees/subagent-Plan-007-Executor-self-36c77a82/packages/xero/src/au/write.ts#L105-L121)
    *   **Endpoint & Method**: `POST /payroll.xro/1.0/LeaveApplications/{LeaveApplicationID}/reject` (lines 113-115).
    *   **Payload Shape**: JSON object with `{ Reason: string }`.
*   **Withdraw Leave Application**: [write.ts:L123-L139](file:///home/hilton/.gemini/antigravity-cli/brain/d0f4af20-e5ed-4f8a-a268-63a352ea09f6/.system_generated/worktrees/subagent-Plan-007-Executor-self-36c77a82/packages/xero/src/au/write.ts#L123-L139)
    *   **Endpoint & Method**: `POST /payroll.xro/1.0/LeaveApplications/{LeaveApplicationID}/reject` (lines 131-133).
    *   **Payload Shape**: JSON object with hardcoded `{ Reason: "Withdrawn by employee in Team Calendar." }`.

### 1.2 Read-Side Sync Operations
AU read operations are defined in [packages/xero/src/au/read.ts](file:///home/hilton/.gemini/antigravity-cli/brain/d0f4af20-e5ed-4f8a-a268-63a352ea09f6/.system_generated/worktrees/subagent-Plan-007-Executor-self-36c77a82/packages/xero/src/au/read.ts):

*   **Fetch Employees**: [read.ts:L38-L102](file:///home/hilton/.gemini/antigravity-cli/brain/d0f4af20-e5ed-4f8a-a268-63a352ea09f6/.system_generated/worktrees/subagent-Plan-007-Executor-self-36c77a82/packages/xero/src/au/read.ts#L38-L102)
    *   **Endpoint & Method**: `GET /payroll.xro/1.0/Employees` (line 74).
    *   **Mapping**: Normalised into canonical `XeroEmployee[]` using `mapXeroEmployees` in [packages/xero/src/read/employees.ts:L35-L66](file:///home/hilton/.gemini/antigravity-cli/brain/d0f4af20-e5ed-4f8a-a268-63a352ea09f6/.system_generated/worktrees/subagent-Plan-007-Executor-self-36c77a82/packages/xero/src/read/employees.ts#L35-L66).
*   **Fetch Leave Records**: [read.ts:L104-L168](file:///home/hilton/.gemini/antigravity-cli/brain/d0f4af20-e5ed-4f8a-a268-63a352ea09f6/.system_generated/worktrees/subagent-Plan-007-Executor-self-36c77a82/packages/xero/src/au/read.ts#L104-L168)
    *   **Endpoint & Method**: `GET /payroll.xro/1.0/LeaveApplications` (line 140).
    *   **Mapping**: Normalised into canonical `XeroLeaveRecord[]` using `mapXeroLeaveRecords` in [packages/xero/src/read/leave-records.ts:L56-L79](file:///home/hilton/.gemini/antigravity-cli/brain/d0f4af20-e5ed-4f8a-a268-63a352ea09f6/.system_generated/worktrees/subagent-Plan-007-Executor-self-36c77a82/packages/xero/src/read/leave-records.ts#L56-L79).
*   **Fetch Leave Balances**: [read.ts:L170-L278](file:///home/hilton/.gemini/antigravity-cli/brain/d0f4af20-e5ed-4f8a-a268-63a352ea09f6/.system_generated/worktrees/subagent-Plan-007-Executor-self-36c77a82/packages/xero/src/au/read.ts#L170-L278)
    *   **Endpoint & Method**: Loop-driven pacing querying `GET /payroll.xro/1.0/Employees/{EmployeeID}` (line 232).
    *   **Mapping**: Extracts `LeaveBalances` array per employee, mapping to `XeroLeaveBalance[]` using `mapXeroLeaveBalances` in [packages/xero/src/read/leave-balances.ts:L36-L53](file:///home/hilton/.gemini/antigravity-cli/brain/d0f4af20-e5ed-4f8a-a268-63a352ea09f6/.system_generated/worktrees/subagent-Plan-007-Executor-self-36c77a82/packages/xero/src/read/leave-balances.ts#L36-L53).
*   **Fetch Leave Application Status**: [read.ts:L280-L338](file:///home/hilton/.gemini/antigravity-cli/brain/d0f4af20-e5ed-4f8a-a268-63a352ea09f6/.system_generated/worktrees/subagent-Plan-007-Executor-self-36c77a82/packages/xero/src/au/read.ts#L280-L338)
    *   **Endpoint & Method**: `GET /payroll.xro/1.0/LeaveApplications/{LeaveApplicationID}` (lines 314-316).
    *   **Mapping**: Maps to `XeroLeaveApplicationStatusResult` using `mapLeaveApplicationStatus` in [packages/xero/src/read/leave-application-status.ts:L34-L43](file:///home/hilton/.gemini/antigravity-cli/brain/d0f4af20-e5ed-4f8a-a268-63a352ea09f6/.system_generated/worktrees/subagent-Plan-007-Executor-self-36c77a82/packages/xero/src/read/leave-application-status.ts#L34-L43).

### 1.3 Shared Infrastructure & Error Mapping
*   **Rate Limiting**: Applied via `xeroFetch` in [packages/xero/src/rate-limit/xero-fetch.ts:L65-L111](file:///home/hilton/.gemini/antigravity-cli/brain/d0f4af20-e5ed-4f8a-a268-63a352ea09f6/.system_generated/worktrees/subagent-Plan-007-Executor-self-36c77a82/packages/rate-limit/xero-fetch.ts#L65-L111). Quota limits of 60 calls/minute per org, 5,000 calls/day per org, and 5 concurrent requests are defined in [packages/xero/src/rate-limit/limits.ts:L4-L7](file:///home/hilton/.gemini/antigravity-cli/brain/d0f4af20-e5ed-4f8a-a268-63a352ea09f6/.system_generated/worktrees/subagent-Plan-007-Executor-self-36c77a82/packages/xero/src/rate-limit/limits.ts#L4-L7). Buckets are keyed by `${clerkOrgId}:${organisationId}` via `orgRateLimitKey` (lines 51-58).
*   **Token Decryption**: Connection tokens are decrypted via AES-256-GCM using `decryptXeroToken` defined in [packages/xero/src/crypto/tokens.ts:L33-L59](file:///home/hilton/.gemini/antigravity-cli/brain/d0f4af20-e5ed-4f8a-a268-63a352ea09f6/.system_generated/worktrees/subagent-Plan-007-Executor-self-36c77a82/packages/xero/src/crypto/tokens.ts#L33-L59). The decryption key is loaded from `XERO_TOKEN_ENCRYPTION_KEY` env var (lines 61-68).
*   **Error Mapping**: Handled via `mapHttpError` at [write.ts:L219-L243](file:///home/hilton/.gemini/antigravity-cli/brain/d0f4af20-e5ed-4f8a-a268-63a352ea09f6/.system_generated/worktrees/subagent-Plan-007-Executor-self-36c77a82/packages/xero/src/au/write.ts#L219-L243). Status mappings: `400` -> `validation_error`, `401/403` -> `auth_error`, `404` -> `not_found_error`, `409` -> `conflict_error`, `429` -> `rate_limit_error`, other statuses -> `unknown_error`.

---

## 2. NZ Deltas

New Zealand Payroll is handled by a completely distinct API product with its own path structure, constraints, and payload shapes.

### 2.1 Write-Path Mappings

*   **Endpoint Base Path**: All endpoints use `/payroll.xro/2.0/` instead of `/payroll.xro/1.0/`.
*   **Submit Leave Application**:
    *   **Endpoint & Method**: `POST /payroll.xro/2.0/employees/{EmployeeID}/leave` (nested per-employee).
    *   **Payload Shape**: Flat JSON object (instead of AU\s wrapped array of applications):
        ```json
        {
          "LeaveTypeID": "00000000-0000-0000-0000-000000000000",
          "Description": "Leave Description",
          "StartDate": "2026-08-01",
          "EndDate": "2026-08-05",
          "Periods": [
            {
              "PeriodStartDate": "2026-08-01",
              "PeriodEndDate": "2026-08-05",
              "NumberOfUnits": 40.0,
              "TypeOfUnits": "Hours"
            }
          ]
        }
        ```
    *   **Response Shape**: Returns the single created leave object containing `LeaveID` (cased as `LeaveID` instead of AU\s `LeaveApplicationID`).
    *   **Reference**: [Xero Developer - Payroll NZ - Leave](https://developer.xero.com/docs/api/payroll-nz/leave)
*   **Approve Leave Application**:
    *   **NOT SUPPORTED**. Leave applications created via the NZ Payroll API are treated as immediately scheduled/approved. There is no approval endpoint or approval status change mechanism exposed in the API.
    *   **Reference**: [Xero Developer Community/UserVoice](https://developer.xero.com/docs/api/payroll-nz/)
*   **Decline Leave Application**:
    *   **NOT SUPPORTED**. Since leave applications are automatically approved upon submission, programmatic rejection/decline is not supported. Rejection workflows must be handled in the client application before writing to Xero, or managed manually by a payroll admin in the Xero dashboard.
    *   **Reference**: [Xero Developer Community/UserVoice](https://developer.xero.com/docs/api/payroll-nz/)
*   **Withdraw Leave Application**:
    *   **Endpoint & Method**: `DELETE /payroll.xro/2.0/employees/{EmployeeID}/leave/{LeaveID}`.
    *   **Behavior**: The API documentation lists `DELETE` as a supported method for leave retraction. However, it is restricted or blocked in practice (e.g. if the leave is in a posted pay run). If a `DELETE` request fails with `405 Method Not Allowed` or `403 Forbidden`, the cancellation must be handled manually in the Xero UI.
    *   **Reference**: [Xero Developer - Payroll NZ - Leave](https://developer.xero.com/docs/api/payroll-nz/leave)

### 2.2 Read-Path Mappings

*   **Fetch Employees**:
    *   **Endpoint**: `GET /payroll.xro/2.0/employees`
    *   **Deltas**: Returns active employees by default. Property casing is mixed (e.g. `EmployeeID`, `FirstName`, `LastName` are PascalCase, but `engagementType` is camelCase). `JobTitle` is not returned or supported. `EngagementType` (under the employment resource `/employees/{EmployeeID}/employment`) is used instead of `EmploymentType`.
    *   **Reference**: [Xero Developer - Payroll NZ - Employees](https://developer.xero.com/docs/api/payroll-nz/employees)
*   **Fetch Leave Records**:
    *   **Endpoint**: **No global endpoint**. Leave records must be retrieved individually per employee via `GET /payroll.xro/2.0/employees/{EmployeeID}/leave`.
    *   **Deltas**: The unique identifier is `LeaveID` instead of `LeaveApplicationID`. The leave status is not global, but rather represented as `PeriodStatus` on each period inside the `Periods` array. Valid values are `Approved`, `Completed`, or `Estimated` (affected by the Holidays Act 2003).
    *   **Reference**: [Xero Developer - Payroll NZ - Leave](https://developer.xero.com/docs/api/payroll-nz/leave)
*   **Fetch Leave Balances**:
    *   **Endpoint**: **Not nested under Employees**. To retrieve balances, we must call the dedicated endpoint `GET /payroll.xro/2.0/employees/{EmployeeID}/leaveBalances`.
    *   **Deltas**: Returns a camelCase array structure containing `name`, `leaveTypeID`, `balance`, and `typeOfUnits` nested under `leaveBalances` (unlike AU where PascalCase balances are nested inside the Employee detail response).
    *   **Reference**: [Xero Developer - Payroll NZ - Employees - LeaveBalances](https://developer.xero.com/docs/api/payroll-nz/employees)

---

## 3. Resolution and Data Prerequisites

### 3.1 ID Resolution Status

*   **Employee ID Resolution (`resolveXeroEmployeeId`)**:
    *   **Status**: **Exists / Ready**. The resolution code at [resolve-employee.ts:L10-L64](file:///home/hilton/.gemini/antigravity-cli/brain/d0f4af20-e5ed-4f8a-a268-63a352ea09f6/.system_generated/worktrees/subagent-Plan-007-Executor-self-36c77a82/packages/xero/src/resolution/resolve-employee.ts#L10-L64) resolves mappings using the `person` table filtered by `clerk_org_id` and `organisation_id`. Because the tenancy model passes these values uniformly, this file is fully region-agnostic and will resolve NZ employee mapping out of the box.
*   **Leave Type ID Resolution (`resolveXeroLeaveTypeId`)**:
    *   **Status**: **Ready (Prerequisite-dependent)**. The resolution code at [resolve-leave-type.ts:L7-L67](file:///home/hilton/.gemini/antigravity-cli/brain/d0f4af20-e5ed-4f8a-a268-63a352ea09f6/.system_generated/worktrees/subagent-Plan-007-Executor-self-36c77a82/packages/xero/src/resolution/resolve-leave-type.ts#L7-L67) resolves leave types from synced balances. This will work once the NZ inbound leave balance sync is implemented and active.

### 3.2 Required Prerequisites for the Future Build

1.  **NZ Inbound Employee Sync**: Needed to populate the `person` table with `source_person_key` (Xero Employee ID) mappings. (*Missing*)
2.  **NZ Inbound Leave Balance Sync**: Needed to populate the `leaveBalance` table with `leave_type_xero_id` mappings. (*Missing*)
3.  **NZ Leave Type Mapping Seeds**: Configuration maps NZ leave type IDs to the canonical `availability_record_type` enum values defined in [schema.prisma:L111-L132](file:///home/hilton/.gemini/antigravity-cli/brain/d0f4af20-e5ed-4f8a-a268-63a352ea09f6/.system_generated/worktrees/subagent-Plan-007-Executor-self-36c77a82/packages/database/prisma/schema.prisma#L111-L132). (*Missing*)
4.  **Holidays Act 2003 Compliance / Unit Mapper**: NZ tracks leave balances and units in `Hours` or `Days` or `Dollars`. The sync layer must map these to canonical float `units` in `availability_records`. (*Missing*)
5.  **Employee Leave Setup Verification**: Xero NZ requires that employee leave setup is completed via `/employees/{EmployeeID}/leaveSetup` before leave applications can be written. (*Missing / External*)

---

## 4. Build Skeleton and Open Questions

### 4.1 Proposed Build File List
The NZ build will mirror the AU package structure:
*   `packages/xero/src/nz/read.ts`: Core fetchers (`fetchEmployees`, `fetchLeaveRecords`, `fetchLeaveBalances`).
*   `packages/xero/src/nz/write.ts`: Write-back operations (`submitLeaveApplication`, `withdrawLeaveApplication` as `DELETE`, stubs for `approve`/`decline`).
*   `packages/xero/src/nz/read.test.ts`: Read path and mapper unit tests.
*   `packages/xero/src/nz/write.test.ts`: Write path unit tests.

### 4.2 Effort Estimate
Total Estimated Effort: **~7 days (Large)**

*   **NZ Read Sync Layer (3.5 days)**:
    *   `fetchEmployees` & Zod mapping (mixed-casing): 1.0 day
    *   `fetchLeaveRecords` (requires looping per-employee due to lack of a global API endpoint): 1.5 days
    *   `fetchLeaveBalances` & mapping: 1.0 day
*   **NZ Write-Back Layer (2.5 days)**:
    *   `submitLeaveApplication` (flat payload): 1.0 day
    *   `withdrawLeaveApplication` (handling HTTP `DELETE` method and checking transient response errors): 1.0 day
    *   `approve` and `decline` stubs (returning structured `region_not_supported_error` messages): 0.5 day
*   **Unit Tests & Mock Fixtures (1.0 day)**:
    *   Co-locating mock payload fixtures and verifying dispatch routing tests.

---

## 5. Fixtures and Tests

### 5.1 Fixture Strategy
In alignment with AU tests (e.g. [packages/xero/src/read/leave-records.test.ts](file:///home/hilton/.gemini/antigravity-cli/brain/d0f4af20-e5ed-4f8a-a268-63a352ea09f6/.system_generated/worktrees/subagent-Plan-007-Executor-self-36c77a82/packages/xero/src/read/leave-records.test.ts)), mock JSON payloads will be co-located directly within their respective test files (`packages/xero/src/nz/read.test.ts` and `packages/xero/src/nz/write.test.ts`) as inline structures, rather than external file fixtures. This maintains the repository convention.

### 5.2 Test List
*   **Mapper Unit Tests**:
    *   `mapNzEmployees`: Verifies parsing of mixed Pascal/camelCase fields from employee responses.
    *   `mapNzLeaveRecords`: Verifies parsing of employee-nested leave objects, mapping the `LeaveID` and reducing/normalising the `PeriodStatus` and units.
    *   `mapNzLeaveBalances`: Verifies parsing of camelCase `leaveBalances` arrays.
*   **Write-Back Tests**:
    *   `submitLeaveApplication`: Mocks `POST /employees/{EmployeeID}/leave` and asserts payload shape and extraction of `LeaveID`.
    *   `withdrawLeaveApplication`: Mocks `DELETE /employees/{EmployeeID}/leave/{LeaveID}` and verifies success (200 OK) or fallback handling.
*   **Dispatch Tests**:
    *   Verifies that `write/dispatch.ts` and `read/dispatch.ts` correctly route NZ tenants to the new functions.

### 5.3 Sandbox / Testing Prerequisites
*   **OAuth App Scopes**: App credentials must be configured with `payroll.employees` (read/write) and `payroll.leave` (read/write) scopes.
*   **Demo Organisation**: Requires a Xero NZ demo organization with simulated employees (fully set up with opening leave balances via `/leaveSetup`).

---

## 6. Open Questions

We request the maintainer\s guidance on the following options (recommended defaults highlighted):

1.  **Approval / Decline Flow Handling**:
    *   *Option A (Recommended)*: **Return `region_not_supported_error` on write-back attempt**. Decline and Approve actions are blocked in the UI with a descriptive message explaining that they are not supported by the Xero NZ API and must be managed in Xero or pre-approved in Team Calendar.
    *   *Option B*: Treat Approve as a successful no-op (since submitting leave automatically schedules it as approved in Xero NZ).
2.  **Withdrawal API Deletion Risks**:
    *   *Option A (Recommended)*: **Proceed with `DELETE /employees/{EmployeeID}/leave/{LeaveID}` and gracefully map 405/403/400 errors** to `validation_error` or `region_not_supported_error` with a message instructing the user to delete it manually in Xero Me.
    *   *Option B*: Treat withdrawal as fully unsupported and return a `region_not_supported_error` immediately without hitting the Xero API.
3.  **Leave Records Sync Loop Scale**:
    *   *Option A (Recommended)*: **Fetch leave per-employee sequentially with pacing**. Since NZ lacks a global `LeaveApplications` endpoint, sync must iterate through active employees. We can reuse the `LEAVE_BALANCE_READ_INTERVAL_MS` pacing (1 second delay) to stay under the 60 calls/minute API limit.
    *   *Option B*: Fetch leave records concurrently using promise pooling, running the risk of hitting rate limits (429) if the organisation has more than 5-10 employees.
