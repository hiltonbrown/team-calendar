import type { InngestFunction } from "inngest";
import { reconcileXeroApprovalStateFunction } from "./handlers/reconcile-xero-approval-state";
import { syncXeroLeaveRecordsFunction } from "./handlers/sync-xero-leave-records";
import { syncXeroPeopleFunction } from "./handlers/sync-xero-people";

export const functions: InngestFunction.Any[] = [
  reconcileXeroApprovalStateFunction,
  syncXeroLeaveRecordsFunction,
  syncXeroPeopleFunction,
];
