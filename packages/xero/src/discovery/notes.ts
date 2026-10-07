/**
 * Discovery notes rechecked against official Xero sources on 8 October 2026.
 *
 * Sources:
 * - https://developer.xero.com/documentation/api/payrollau/leaveapplications
 * - https://developer.xero.com/documentation/api/payrollnz/employeeleaveperiods
 * - https://developer.xero.com/documentation/api/payrolluk/employeeleave
 * - https://developer.xero.com/documentation/api/payrolluk/employeeleavebalances
 * - https://developer.xero.com/changelog
 * - https://xeroapi.github.io/xero-node/payroll-au/index.html
 * - https://xeroapi.github.io/xero-node/payroll-nz/index.html
 * - https://xeroapi.github.io/xero-node/payroll-uk/index.html
 *
 * - https://github.com/XeroAPI/Xero-OpenAPI/blob/master/xero-payroll-au.yaml
 * - https://developer.xero.com/documentation/guides/idempotent-requests/idempotency/
 * - https://developer.xero.com/faq/oauth2
 * - https://developer.xero.com/documentation/guides/oauth2/tenants/
 *
 * Confirmed implementation notes:
 * - AU full leave retrieval uses /LeaveApplications/v2, which includes requested
 *   leave. AU employee and V2 leave list requests support If-Modified-Since.
 * - Supported mutations reuse a persisted app-wide UUID Idempotency-Key with
 *   the exact method, URL and body. Xero retains keys for six minutes; the
 *   application stops automatic replay after five minutes.
 * - Access tokens last 30 minutes; unused refresh tokens expire after 60 days.
 *   A lost rotation response can recover with the old token within 30 minutes.
 * - Connections inventory optionally filters the current authentication event.
 *   User-authorised DELETE /connections/{id} removes only that connection.
 * - AU supports leave applications at /LeaveApplications with approve/reject
 *   routes on /LeaveApplications/{LeaveApplicationID}/approve and /reject.
 * - NZ leave reads are employee-scoped. Official SDK docs expose
 *   /Employees/{EmployeeID}/Leave and /Employees/{EmployeeID}/LeavePeriods.
 * - UK leave reads are employee-scoped. Official SDK docs expose
 *   /Employees/{EmployeeID}/Leave/{LeaveID}, /LeavePeriods, and /LeaveBalances.
 * - Xero's 7 April 2026 changelog notes ongoing Payroll AU 2.0 convergence for
 *   timesheets only. Leave flows still need region-specific dispatch.
 * - Xero's 10 November 2025 changelog notes NZ Holidays Act migration changes
 *   that affect POST and PUT employee leave behaviour. Leave writes must stay
 *   synchronous and surface validation failures directly.
 * - Xero's 5 February 2025 and 7 April 2025 changelog items note UK leave and
 *   statutory leave balance changes. UK balance mapping must preserve unit and
 *   statutory categories without local recalculation.
 */

export const XERO_REGION_DISCOVERY_DATE = "2026-10-08";
