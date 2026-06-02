import type { InngestFunction } from "inngest";
import { reconcileXeroApprovalStateFunction } from "./handlers/reconcile-xero-approval-state";
import { syncXeroPeopleFunction } from "./handlers/sync-xero-people";

export const functions: InngestFunction.Any[] = [
  reconcileXeroApprovalStateFunction,
  syncXeroPeopleFunction,
];
