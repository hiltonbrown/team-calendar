import type { InngestFunction } from "inngest";
import { rebuildFeedCacheFunction } from "./handlers/rebuild-feed-cache";
import { reconcileFeedPublicationsFunction } from "./handlers/reconcile-feed-publications";
import { reconcileXeroApprovalStateFunction } from "./handlers/reconcile-xero-approval-state";
import { recountUsageFunction } from "./handlers/recount-usage";
import { syncXeroLeaveBalancesFunction } from "./handlers/sync-xero-leave-balances";
import { syncXeroLeaveRecordsFunction } from "./handlers/sync-xero-leave-records";
import { syncXeroPeopleFunction } from "./handlers/sync-xero-people";

export const functions: InngestFunction.Any[] = [
  recountUsageFunction,
  rebuildFeedCacheFunction,
  reconcileFeedPublicationsFunction,
  reconcileXeroApprovalStateFunction,
  syncXeroLeaveBalancesFunction,
  syncXeroLeaveRecordsFunction,
  syncXeroPeopleFunction,
];
