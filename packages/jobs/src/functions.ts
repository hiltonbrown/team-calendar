import type { InngestFunction } from "inngest";
import { initialXeroSyncFunction } from "./handlers/initial-xero-sync";
import { rebuildFeedCacheFunction } from "./handlers/rebuild-feed-cache";
import { reconcileFeedPublicationsFunction } from "./handlers/reconcile-feed-publications";
import { reconcileXeroApprovalStateFunction } from "./handlers/reconcile-xero-approval-state";
import { reconcileXeroConnectionsFunction } from "./handlers/reconcile-xero-connections";
import { recountUsageFunction } from "./handlers/recount-usage";
import { scheduleXeroSyncsFunction } from "./handlers/schedule-xero-syncs";
import { sendNotificationEmailsFunction } from "./handlers/send-notification-emails";
import { syncXeroLeaveBalancesFunction } from "./handlers/sync-xero-leave-balances";
import { syncXeroLeaveRecordsFunction } from "./handlers/sync-xero-leave-records";
import { syncXeroPeopleFunction } from "./handlers/sync-xero-people";

export const functions: InngestFunction.Any[] = [
  recountUsageFunction,
  sendNotificationEmailsFunction,
  rebuildFeedCacheFunction,
  reconcileFeedPublicationsFunction,
  reconcileXeroApprovalStateFunction,
  reconcileXeroConnectionsFunction,
  syncXeroLeaveBalancesFunction,
  syncXeroLeaveRecordsFunction,
  syncXeroPeopleFunction,
  scheduleXeroSyncsFunction,
  initialXeroSyncFunction,
];
