import type { InngestFunction } from "inngest";
import { reconcileXeroApprovalStateFunction } from "./handlers/reconcile-xero-approval-state";

export const functions: InngestFunction.Any[] = [
  reconcileXeroApprovalStateFunction,
];
