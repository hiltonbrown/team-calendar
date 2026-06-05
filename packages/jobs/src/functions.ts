import type { InngestFunction } from "inngest";
import { reconcileXeroApprovalStateFunction } from "./handlers/reconcile-xero-approval-state";
import { syncXeroLeaveBalancesFunction } from "./handlers/sync-xero-leave-balances";
import { syncXeroLeaveRecordsFunction } from "./handlers/sync-xero-leave-records";
import { syncXeroPeopleFunction } from "./handlers/sync-xero-people";

export const functions: InngestFunction.Any[] = [
  reconcileXeroApprovalStateFunction,
  syncXeroLeaveBalancesFunction,
  syncXeroLeaveRecordsFunction,
  syncXeroPeopleFunction,
];
