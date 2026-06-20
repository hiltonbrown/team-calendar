# Plan 018 NZ and UK payroll write-back and read design

Date: 2026-06-20

Status: stopped before implementation. The NZ and UK leave-application read and write payloads could not be confirmed from official Xero documentation in this session, so the payroll write path must not be implemented yet.

## Drift check

Command run first:

```bash
git diff --stat 1201404..HEAD -- packages/xero/src/nz packages/xero/src/uk packages/xero/src/au packages/xero/src/write packages/xero/src/read
```

Result: exit 0 with no output. No post-`1201404` drift was detected in the scoped Xero paths by this command.

## Local region module contract

The current region dispatchers define the contract each region module must satisfy.

Write dispatch is in `packages/xero/src/write/dispatch.ts`:

- `submitLeaveApplicationForRegion(payrollRegion, input)` returns `XeroWriteResult<{ rawResponse: unknown; xeroLeaveApplicationId: string }>`
- `approveLeaveApplicationForRegion(payrollRegion, input)` returns `XeroWriteResult<{ rawResponse: unknown }>`
- `declineLeaveApplicationForRegion(payrollRegion, input)` returns `XeroWriteResult<{ rawResponse: unknown }>`
- `withdrawLeaveApplicationForRegion(payrollRegion, input)` returns `XeroWriteResult<{ rawResponse: unknown }>`

Read dispatch is in `packages/xero/src/read/dispatch.ts`:

- `fetchEmployeesForRegion(payrollRegion, { xeroTenant })` returns `XeroWriteResult<{ rawResponse: unknown; employees: XeroEmployee[] }>`
- `fetchLeaveRecordsForRegion(payrollRegion, { xeroTenant })` returns `XeroWriteResult<{ leaveRecords: XeroLeaveRecord[]; rawResponse: unknown }>`
- `fetchLeaveBalancesForRegion(payrollRegion, { employeeIds, onProgress, xeroTenant })` returns `XeroWriteResult<{ failures: XeroLeaveBalanceFetchFailure[]; leaveBalances: XeroLeaveBalance[]; rawResponses: unknown[] }>`
- `fetchLeaveApplicationStatusForRegion(payrollRegion, input)` returns `XeroWriteResult<XeroLeaveApplicationStatusResult>`

`XeroWriteResult<T>` is the repo `Result<T, XeroWriteError>` type. Region modules must return expected failures, not throw them. `XeroWriteError` variants are `auth_error`, `conflict_error`, `network_error`, `not_found_error`, `rate_limit_error`, `unknown_error`, and `validation_error`.

The AU implementation establishes these shared behaviours:

- decrypt `xeroTenant.xero_connection.access_token_encrypted` with `decryptXeroToken`
- return `auth_error` when credentials are missing or revoked
- call Xero through `xeroFetch` with `orgRateLimitKey({ clerkOrgId, organisationId })`
- send `Accept: application/json`, `Authorization: Bearer <token>`, and `Xero-Tenant-Id`
- map HTTP 400 to `validation_error`, 401/403 to `auth_error`, 404 to `not_found_error`, 409 to `conflict_error`, 429 to `rate_limit_error`, and other statuses to `unknown_error`
- return `network_error` for transport failures
- keep raw Xero payloads available to callers for audit storage
- preserve the optional `onProgress(processed, total)` callback on balance reads

## Official documentation evidence

Official Xero Developer URLs checked:

- `https://developer.xero.com/documentation/api/payrollau/leaveapplications`
- `https://developer.xero.com/documentation/api/payrollnz/overview`
- `https://developer.xero.com/documentation/api/payrolluk/overview`
- `https://developer.xero.com/documentation/api/payrollnz/leaveapplications`
- `https://developer.xero.com/documentation/api/payrolluk/leaveapplications`
- `https://developer.xero.com/documentation/api/payroll-nz/leaveapplications`
- `https://developer.xero.com/documentation/api/payroll-uk/leaveapplications`
- `https://developer.xero.com/page-data/documentation/api/payrollnz/leaveapplications/page-data.json`
- `https://developer.xero.com/page-data/documentation/api/payrolluk/leaveapplications/page-data.json`

What could be confirmed:

- The AU leave-application page exists and its metadata names `GET LeaveApplications`, `GET LeaveApplication`, `POST LeaveApplications`, `POST LeaveApplication`, `POST Approve LeaveApplication`, and `POST Reject LeaveApplication`.
- The NZ overview page exists and identifies an official `Payroll NZ API Overview`, but the public response inspected here did not expose leave-application payload details.
- The UK overview page exists and identifies an official `Payroll UK API Overview`, but the public response inspected here did not expose leave-application payload details.

What could not be confirmed:

- NZ leave-application list/read endpoint path and response payload.
- NZ leave-application create/update/approve/reject endpoint paths and request payloads.
- NZ leave-period unit semantics for write-back.
- UK leave-application list/read endpoint path and response payload.
- UK leave-application create/update/approve/reject endpoint paths and request payloads.
- UK leave-period unit semantics for write-back.

The direct NZ and UK leave-application URLs returned either `Not Authorized` or a developer portal 404 response. Because this is a payroll write path, the implementation must stop here rather than copying AU payloads into NZ/UK.

## Region mapping design

The canonical LeaveSync layer should continue to depend only on the narrow mapper outputs, not on raw Xero region payloads.

Required region mapper outputs:

- employees map to `XeroEmployee`
- leave records map to `XeroLeaveRecord`
- leave balances map to `XeroLeaveBalance`
- approval state maps to `XeroLeaveApplicationStatusResult`

Open mapping questions before implementation:

- Does NZ identify leave type by `LeaveTypeID`, another ID field, or a code/name pair?
- Does UK identify leave type by `LeaveTypeID`, another ID field, or a code/name pair?
- Do NZ and UK represent leave quantities as days, hours, earnings lines, or per-period units?
- Are partial-day leave periods represented as a single period, daily periods, or nested schedule entries?
- Are statuses aligned to AU values (`APPROVED`, `SCHEDULED`, `DECLINED`, `PENDING`) or region-specific values?
- Are employee identifiers and leave application identifiers stable UUIDs across NZ/UK payroll APIs?

Until those answers are confirmed from official Xero documentation or sandbox responses approved by a maintainer, mappers must not be added.

## Safety and enablement gate

Current safe state:

- AU dispatch remains unchanged.
- NZ write functions still return `NZ payroll write-back is not yet available.`
- UK write functions still return `UK payroll write-back is not yet available.`
- NZ and UK read functions are not expanded beyond the existing unsupported state in this stopped plan.

Recommended future gate:

- Keep the dispatch-level NZ and UK write path disabled by default.
- Add an explicit per-region gate, for example `XERO_ENABLE_NZ_PAYROLL_WRITES`, only after sandbox validation.
- Validate against a real NZ sandbox Xero file before enabling NZ writes.
- Validate against a real UK sandbox Xero file before enabling UK writes.
- Record the Xero tenant ID, sandbox file type, tested endpoint names, request fixtures, response fixtures, and rollback instructions in this plan before removing the gate.

The one-line enablement change after sandbox validation should be a guarded dispatch change, not a region-wide default. For example, the NZ dispatch case should continue returning the existing unsupported error unless the explicit NZ write flag is enabled.

## Implementation recommendation once documentation is confirmed

1. Add NZ-only mapper fixtures for employees, leave records, leave balances, leave-application status, submit response, approval response, decline response, and withdraw response.
2. Implement `packages/xero/src/nz/read.ts` using the AU structure, region-specific paths, `readXeroPayload`, `mapXeroReadHttpError`, and the existing rate-limit key.
3. Implement `packages/xero/src/nz/write.ts` behind an explicit disabled-by-default gate.
4. Wire NZ reads in `packages/xero/src/read/dispatch.ts` without changing the dispatch function signatures.
5. Keep AU files untouched and run AU tests to prove existing behaviour remains stable.

## Maintainer open questions

- Can maintainers provide authenticated official Xero Payroll NZ and UK leave-application docs, or approve a specific official SDK/OpenAPI source as authoritative?
- Which Xero sandbox files should be used for NZ and UK payroll write validation?
- What env flag name should own live NZ write enablement?
- Should read paths be enabled before write paths if official read payloads are confirmed first?
- Should UK remain fully stubbed until NZ has completed sandbox validation?
