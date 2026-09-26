// AU OpenAPI defines read/write alternatives for reads, but mutations require write consent.
export const XERO_OPERATION_CAPABILITIES = {
  approveLeaveApplication: "payroll.employees",
  declineLeaveApplication: "payroll.employees",
  findLeaveApplicationCandidates: [
    "payroll.employees.read",
    "payroll.settings.read",
  ],
  resolveEmployeeId: "payroll.employees.read",
  resolveLeaveTypeId: "payroll.settings.read",
  submitLeaveApplication: "payroll.employees",
  withdrawLeaveApplication: "payroll.employees",
} as const;
