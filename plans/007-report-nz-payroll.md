# Spike Report: Xero NZ Payroll Integration

> **Historical research only**: Reconciliation on 2026-07-12 rejected plan 007
> as written. The report expanded beyond the write-back spike after discovering
> that inbound NZ support was absent, which should have triggered the plan's
> STOP condition. Its `file://` citations and line numbers are historical. Do
> not use this report as an executable implementation plan.

## Status
- **Planned at**: commit 8790bdb, 2026-07-02
- **Completed at**: 2026-07-05
- **Status**: COMPLETE
- **Scope**: Outlines the technical specification for New Zealand (NZ) Payroll integration (syncing employees, leave records, leave balances, and leave write-back).

---

## 1. AU Baseline (Reference Implementation)

The existing Australian (AU) Payroll reference implementation is located in `packages/xero/src/au/`. It handles both read (inbound sync) and write-back (outbound actions) against version 1.0 of the Xero Payroll AU API.

### 1.1 Outbound Write-Back Operations
All write-back operations are implemented in [write.ts](file:///home/hilton/Documents/teamcalendar/packages/xero/src/au/write.ts) and tested in [write.test.ts](file:///home/hilton/Documents/teamcalendar/packages/xero/src/au/write.test.ts).

*   **Submit Leave Application**:
    *   **Endpoint**: `POST /payroll.xro/1.0/LeaveApplications` (called in [write.ts:57](file:///home/hilton/Documents/teamcalendar/packages/xero/src/au/write.ts#L57))
    *   **Payload Shape**: The request payload formats leave application data inside a parent `LeaveApplications` array:
        ```json
        {
          "LeaveApplications": [
            {
              "EmployeeID": "employee-uuid",
              "EndDate": "YYYY-MM-DD",
              "LeavePeriods": [
                {
                  "NumberOfUnits": 16.0
                }
              ],
              "LeaveTypeID": "leave-type-uuid",
              "StartDate": "YYYY-MM-DD",
              "Title": "Leave Title"
            }
          ]
        }
        ```
    *   **Response Shape**: The response contains the created application ID:
        ```json
        {
          "LeaveApplications": [
            {
              "LeaveApplicationID": "leave-application-uuid"
            }
          ]
        }
        ```
*   **Approve Leave Application**:
    *   **Endpoint**: `POST /payroll.xro/1.0/LeaveApplications/{LeaveApplicationID}/approve` (called in [write.ts:95](file:///home/hilton/Documents/teamcalendar/packages/xero/src/au/write.ts#L95))
    *   **Payload Shape**: Empty request body.
    *   **Mapping**: Transitions the status of the leave application to "APPROVED" on the Xero side.
*   **Decline Leave Application**:
    *   **Endpoint**: `POST /payroll.xro/1.0/LeaveApplications/{LeaveApplicationID}/reject` (called in [write.ts:113](file:///home/hilton/Documents/teamcalendar/packages/xero/src/au/write.ts#L113))
    *   **Payload Shape**: `{ "Reason": "Declined by manager" }` (passed in [write.ts:109-111](file:///home/hilton/Documents/teamcalendar/packages/xero/src/au/write.ts#L109-L111))
    *   **Mapping**: Transitions status to "REJECTED".
*   **Withdraw Leave Application**:
    *   **Endpoint**: `POST /payroll.xro/1.0/LeaveApplications/{LeaveApplicationID}/reject` (called in [write.ts:131](file:///home/hilton/Documents/teamcalendar/packages/xero/src/au/write.ts#L131))
    *   **Payload Shape**: `{ "Reason": "Withdrawn by employee in Team Calendar." }` (passed in [write.ts:127-129](file:///home/hilton/Documents/teamcalendar/packages/xero/src/au/write.ts#L127-L129))
    *   **Mapping**: Transitions status to "REJECTED".

### 1.2 Inbound Read Operations
All read operations are implemented in [read.ts](file:///home/hilton/Documents/teamcalendar/packages/xero/src/au/read.ts) and tested in [read.test.ts](file:///home/hilton/Documents/teamcalendar/packages/xero/src/au/read.test.ts).

*   **Fetch Employees**:
    *   **Endpoint**: `GET /payroll.xro/1.0/Employees` (called in [read.ts:74](file:///home/hilton/Documents/teamcalendar/packages/xero/src/au/read.ts#L74))
    *   **Normalization**: Parsed using `mapXeroEmployees` in [employees.ts:35](file:///home/hilton/Documents/teamcalendar/packages/xero/src/read/employees.ts#L35) into canonical `XeroEmployee` models.
*   **Fetch Leave Records**:
    *   **Endpoint**: `GET /payroll.xro/1.0/LeaveApplications` (called in [read.ts:140](file:///home/hilton/Documents/teamcalendar/packages/xero/src/au/read.ts#L140))
    *   **Normalization**: Pulls all leave applications globally in a single call. Normalised using `mapXeroLeaveRecords` in [leave-records.ts:56](file:///home/hilton/Documents/teamcalendar/packages/xero/src/read/leave-records.ts#L56). Statuses mapped via `normaliseStatus` in [leave-records.ts:90](file:///home/hilton/Documents/teamcalendar/packages/xero/src/read/leave-records.ts#L90).
*   **Fetch Leave Balances**:
    *   **Endpoint**: `GET /payroll.xro/1.0/Employees/{EmployeeID}` (called in [read.ts:232](file:///home/hilton/Documents/teamcalendar/packages/xero/src/au/read.ts#L232))
    *   **Normalization**: Fetched individually per employee ID to obtain the nested `LeaveBalances` array. Normalised using `mapXeroLeaveBalances` in [leave-balances.ts:36](file:///home/hilton/Documents/teamcalendar/packages/xero/src/read/leave-balances.ts#L36).
*   **Fetch Single Leave Status**:
    *   **Endpoint**: `GET /payroll.xro/1.0/LeaveApplications/{LeaveApplicationID}` (called in [read.ts:314](file:///home/hilton/Documents/teamcalendar/packages/xero/src/au/read.ts#L314))
    *   **Normalization**: Normalised using `mapLeaveApplicationStatus` in [leave-application-status.ts:26](file:///home/hilton/Documents/teamcalendar/packages/xero/src/read/leave-application-status.ts#L26).

### 1.3 Error Mapping
HTTP errors are mapped to custom type `XeroWriteError` in [write.ts:219](file:///home/hilton/Documents/teamcalendar/packages/xero/src/au/write.ts#L219) and [leave-application-status.ts:73](file:///home/hilton/Documents/teamcalendar/packages/xero/src/read/leave-application-status.ts#L73):
*   `400` -> `validation_error`
*   `401` / `403` -> `auth_error`
*   `404` -> `not_found_error`
*   `409` -> `conflict_error`
*   `429` -> `rate_limit_error`
*   Others -> `unknown_error`

### 1.4 Rate Limiting & Decrypted Tokens
*   **Rate Limiting**: Managed through `xeroFetch` in [xero-fetch.ts:65](file:///home/hilton/Documents/teamcalendar/packages/xero/src/rate-limit/xero-fetch.ts#L65). Uses `orgRateLimitKey` to isolate limits per organization (clerk org ID + organisation ID) in [xero-fetch.ts:51](file:///home/hilton/Documents/teamcalendar/packages/xero/src/rate-limit/xero-fetch.ts#L51).
*   **Decrypt Tokens**: Token decryption is performed in [tokens.ts:33](file:///home/hilton/Documents/teamcalendar/packages/xero/src/crypto/tokens.ts#L33) using `decryptXeroToken`. It extracts credentials from the database connection schema via `process.env.XERO_TOKEN_ENCRYPTION_KEY`.

---

## 2. NZ Deltas (Official Documentation Mapping)

The Xero Payroll NZ API uses version 2.0 (`https://api.xero.com/payroll.xro/2.0/`) instead of 1.0. The endpoint layout, request/response casing, and leaves workflow models differ substantially from AU.

Documentation references:
*   [Xero Payroll NZ API Overview](https://developer.xero.com/documentation/api/payroll-nz/overview)
*   [Xero Payroll NZ Employee Leave Endpoint](https://developer.xero.com/documentation/api/payroll-nz/employee-leave)
*   [Xero Payroll NZ Leave Types Endpoint](https://developer.xero.com/documentation/api/payroll-nz/leave-types)
*   [Xero Payroll NZ Leave Balances Endpoint](https://developer.xero.com/documentation/api/payroll-nz/employee-leave-balances)

### 2.1 Delta Mapping Table

| Operation / Read | AU Endpoint (v1.0) | NZ Endpoint (v2.0) | Casing & Structural Deltas |
|---|---|---|---|
| **Submit Leave** | `POST /LeaveApplications` | `POST /employees/{EmployeeID}/leave` | Request is **camelCase**. Nested under the employee ID. |
| **Approve Leave** | `POST /LeaveApplications/{ID}/approve` | **Not Supported** | NZ has no programmatic approve endpoint. |
| **Decline Leave** | `POST /LeaveApplications/{ID}/reject` | **Not Supported** | NZ has no reject or decline endpoint. |
| **Withdraw Leave** | `POST /LeaveApplications/{ID}/reject` | `DELETE /employees/{EmployeeID}/leave/{LeaveID}` | Deletes the scheduled leave record in Xero. |
| **Read Employees** | `GET /Employees` | `GET /employees` | Response is **PascalCase**. Returns paginated list (max 100). |
| **Read Leave Records**| `GET /LeaveApplications` | `GET /employees/{EmployeeID}/leave` | **No global endpoint**. Fetch per-employee (N+1 queries). |
| **Read Leave Balances**| `GET /Employees/{EmployeeID}` | `GET /employees/{EmployeeID}/leaveBalances` | Separated endpoint instead of employee details nested. |
| **Read Single Status**| `GET /LeaveApplications/{ID}` | `GET /employees/{EmployeeID}/leave` | No single GET. Must retrieve list and filter locally. |

### 2.2 Submit Leave Application Request Casing
Unlike the AU API (PascalCase), the NZ API request payload is **camelCase** for properties:
```json
{
  "leaveTypeID": "2d8fc263-9620-47a4-b071-15d67c45a0ce",
  "description": "Vacation details",
  "startDate": "2026-07-06T00:00:00",
  "endDate": "2026-07-08T00:00:00"
}
```
*Note: Response payloads from GET requests remain PascalCase.*

### 2.3 Leave Model Differences
*   **Units and Accruals**: NZ leave entitlements can be configured in either **Hours** or **Days** depending on the leave type (e.g. sick leave is typically days, annual leave is typically hours/weeks).
*   **Approval States**: The NZ API does not support "Pending" or "Draft" states for leave applications. Posting to `/employees/{EmployeeID}/leave` creates leave in the "Scheduled" state (automatically approved). 
*   **Rejecting/Declining**: If a manager declines a leave request in Team Calendar, the request is simply kept in the local database as `declined` and never synced to Xero.
*   **Withdrawal**: Withdrawing synced leave uses `DELETE /employees/{EmployeeID}/leave/{LeaveID}`, which deletes the leave record entirely from Xero.

---

## 3. Prerequisites

We must resolve the local database IDs (`personId` and `recordType`) to their corresponding Xero IDs (`EmployeeID` and `LeaveTypeID`) before making write-back calls.

### 3.1 ID Resolution Analysis
*   [resolve-employee.ts](file:///home/hilton/Documents/teamcalendar/packages/xero/src/resolution/resolve-employee.ts): Resolves `personId` to `source_person_key`. Since this queries the `Person` table directly, it will work for NZ without modifications, provided the NZ employee sync populates `source_person_key` with the Xero Employee ID.
*   [resolve-leave-type.ts](file:///home/hilton/Documents/teamcalendar/packages/xero/src/resolution/resolve-leave-type.ts): Resolves `recordType` to `leave_type_xero_id` from the `LeaveBalance` table. This is also region-agnostic and will function for NZ as long as the NZ leave balance sync populates the `LeaveBalance` table first.

### 3.2 List of Prerequisites

| Prerequisite | Status | Details |
|---|---|---|
| **Employee Inbound Sync (`GET /employees`)** | Missing | Required to match Xero Employee IDs and populate `Person` records. |
| **Leave Balance Sync (`GET /leaveBalances`)** | Missing | Required to resolve Leave Type IDs (`leave_type_xero_id`) and unit types. |
| **OAuth Scopes** | Exists | Standard scopes `payroll.employees` and `payroll.settings` cover the NZ endpoints. |
| **NZ Leave Unit Mapping** | Missing | Need logic to map decimal units to either hours/days based on leave type config. |

---

## 4. Build Plan Specification

### 4.1 Proposed File List
*   `packages/xero/src/nz/read.ts` - NZ-specific implementation for fetching employees, leave records, leave balances, and leave statuses.
*   `packages/xero/src/nz/write.ts` - NZ-specific implementation for submitting and deleting leave applications.
*   `packages/xero/src/nz/read.test.ts` - Vitest unit tests for read operations.
*   `packages/xero/src/nz/write.test.ts` - Vitest unit tests for write operations.

### 4.2 Fixture and Testing Strategy
Following the project's testing conventions seen in [read.test.ts](file:///home/hilton/Documents/teamcalendar/packages/xero/src/au/read.test.ts) and [write.test.ts](file:///home/hilton/Documents/teamcalendar/packages/xero/src/au/write.test.ts), all mock HTTP responses will be declared inline using helper functions.
Unit tests will cover:
*   Mappers parsing the NZ camelCase/PascalCase JSON responses.
*   Error mapping tests verifying that HTTP statuses (400, 401, 403, 404, 409, 429) correctly map to `XeroWriteError` variants.
*   Integration dispatching checks ensuring routing works via [dispatch.ts](file:///home/hilton/Documents/teamcalendar/packages/xero/src/write/dispatch.ts) when region is `"NZ"`.

### 4.3 Open Questions & Default Recommendations

1.  **Approval / Decline state in Xero**: Since Xero NZ has no pending/draft states, how should Team Calendar handle leave applications waiting for approval?
    *   *Recommendation*: Keep the approval flow entirely in Team Calendar. Do not post the leave to Xero until the manager approves the application. Once approved, submit it to Xero (which creates it directly as "Scheduled"). If declined, mark it as declined locally and never send it to Xero.
2.  **Performance overhead of N+1 leave sync**: Since NZ does not support a global `GET /LeaveApplications` endpoint, Team Calendar must make one request per active employee to sync leave. How should we avoid hitting rate limits?
    *   *Recommendation*: Implement sequential pacing with a delay between requests (e.g. 1000ms sleep) similar to the leave balance sync loop in [read.ts:209-212](file:///home/hilton/Documents/teamcalendar/packages/xero/src/au/read.ts#L209-L212), and orchestrate this inside an Inngest background job.
3.  **Leave setup validation error**: How should we handle employees whose leave templates are not fully configured in Xero, causing write-back to fail with `400 Bad Request`?
    *   *Recommendation*: Catch this error specifically and map it to a validation error prompting the administrator to complete the employee's Leave Setup in Xero.

### 4.4 Coarse Effort Estimate
Total Estimated Effort: **Large (L)** (24 - 40 hours)
*   NZ Inbound Sync (Employees & Balances): Medium (8 hours)
*   NZ Leave Records Sync (N+1 loop logic & pacing): Large (12 - 16 hours)
*   NZ Submit & Delete Write-back: Medium (8 hours)
*   Testing & Fixtures: Medium (6 hours)
