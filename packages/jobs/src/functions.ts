import type { InngestFunction } from "inngest";
import { rebuildFeedCacheFunction } from "./handlers/rebuild-feed-cache";
import { reconcileFeedPublicationsFunction } from "./handlers/reconcile-feed-publications";
import { reconcileXeroApprovalStateFunction } from "./handlers/reconcile-xero-approval-state";
import { syncXeroLeaveBalancesFunction } from "./handlers/sync-xero-leave-balances";
import { syncXeroLeaveRecordsFunction } from "./handlers/sync-xero-leave-records";
import { syncXeroPeopleFunction } from "./handlers/sync-xero-people";

export const functions: InngestFunction.Any[] = [
  rebuildFeedCacheFunction,
  reconcileFeedPublicationsFunction,
  reconcileXeroApprovalStateFunction,
  syncXeroLeaveBalancesFunction,
  syncXeroLeaveRecordsFunction,
  syncXeroPeopleFunction,
];
