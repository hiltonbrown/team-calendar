import "server-only";

import type { Result } from "@repo/core";
import {
  findConnectionsNeedingTokenRotation,
  listSchedulableXeroTenants,
  type SchedulableXeroTenant,
} from "@repo/database";
import { log } from "@repo/observability/log";
import {
  ensureFreshXeroConnection,
  scrubInactiveXeroOAuthSessionCredentials,
} from "@repo/xero";
import type { InngestFunction } from "inngest";
import { inngest } from "../client";
import {
  dispatchSyncEvent,
  getScheduledSyncEventId,
  type RegisteredSyncRunType,
} from "../events";

export function isValidTimezone(tz: string | null | undefined): boolean {
  if (!tz) {
    return false;
  }
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export interface TenantLocalTimeParts {
  dateStr: string;
  day: number;
  dayOfWeek: number;
  hour: number;
  minute: number;
  month: number;
  year: number;
}

export function getTenantLocalTimeParts(
  date: Date,
  timeZone: string
): TenantLocalTimeParts | null {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
      minute: "2-digit",
      month: "2-digit",
      timeZone,
      weekday: "short",
      year: "numeric",
    });

    const parts = formatter.formatToParts(date);
    const partMap: Record<string, string> = {};
    for (const p of parts) {
      partMap[p.type] = p.value;
    }

    const year = Number.parseInt(partMap.year, 10);
    const month = Number.parseInt(partMap.month, 10);
    const day = Number.parseInt(partMap.day, 10);
    const hour = Number.parseInt(partMap.hour, 10);
    const minute = Number.parseInt(partMap.minute, 10);

    const weekdayStr = partMap.weekday;
    const weekdayMap: Record<string, number> = {
      Fri: 5,
      Mon: 1,
      Sat: 6,
      Sun: 0,
      Thu: 4,
      Tue: 2,
      Wed: 3,
    };
    const dayOfWeek = weekdayMap[weekdayStr] ?? 0;
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

    return {
      dateStr,
      day,
      dayOfWeek,
      hour,
      minute,
      month,
      year,
    };
  } catch {
    return null;
  }
}

function isInboundDue(
  lastSyncAt: Date | null,
  now: Date,
  isBusinessHours: boolean
): boolean {
  if (!lastSyncAt) {
    return true;
  }
  const fifteenMinMs = 15 * 60 * 1000;
  const sixtyMinMs = 60 * 60 * 1000;
  const interval = isBusinessHours ? fifteenMinMs : sixtyMinMs;
  return now.getTime() - new Date(lastSyncAt).getTime() >= interval;
}

function isBalanceDue(lastSyncAt: Date | null, now: Date): boolean {
  if (!lastSyncAt) {
    return true;
  }
  const sixtyMinMs = 60 * 60 * 1000;
  return now.getTime() - new Date(lastSyncAt).getTime() >= sixtyMinMs;
}

function isReconciliationDue(
  lastReconciledAt: Date | null,
  _now: Date,
  timezone: string,
  localHour: number,
  localDateStr: string
): boolean {
  if (localHour !== 1 && localHour !== 2) {
    return false;
  }
  if (!lastReconciledAt) {
    return true;
  }
  const lastReconciledLocal = getTenantLocalTimeParts(
    new Date(lastReconciledAt),
    timezone
  );
  return !lastReconciledLocal || lastReconciledLocal.dateStr !== localDateStr;
}

/**
 * Pure cadence decision function to determine which sync run types are due for a tenant.
 *
 * Rules:
 * - If timezone is missing or invalid, returns empty array (caller tracks invalid timezone count).
 * - people & leave_records: due after 15 min during business hours (Mon-Fri 07:00-18:59 local), after 60 min outside.
 * - leave_balances: due after 60 min at all times.
 * - approval_state_reconciliation: due between 01:00 and 02:59 local time, once per day.
 * - null last-success timestamp is immediately due.
 */
export function dueRunTypes(
  tenant: SchedulableXeroTenant,
  now: Date = new Date()
): RegisteredSyncRunType[] {
  if (!(tenant.timezone && isValidTimezone(tenant.timezone))) {
    return [];
  }

  const local = getTenantLocalTimeParts(now, tenant.timezone);
  if (!local) {
    return [];
  }

  const isWeekday = local.dayOfWeek >= 1 && local.dayOfWeek <= 5;
  const isBusinessHours = isWeekday && local.hour >= 7 && local.hour <= 18;

  const due: RegisteredSyncRunType[] = [];

  if (isInboundDue(tenant.lastPeopleSyncAt, now, isBusinessHours)) {
    due.push("people");
  }
  if (isInboundDue(tenant.lastLeaveRecordsSyncAt, now, isBusinessHours)) {
    due.push("leave_records");
  }
  if (isBalanceDue(tenant.lastLeaveBalancesSyncAt, now)) {
    due.push("leave_balances");
  }
  if (
    isReconciliationDue(
      tenant.lastApprovalStateReconciledAt,
      now,
      tenant.timezone,
      local.hour,
      local.dateStr
    )
  ) {
    due.push("approval_state_reconciliation");
  }

  return due;
}

export interface ScheduleXeroSyncsPageOptions {
  cursor?: string;
  now?: Date;
}

export interface ScheduleXeroSyncsPageResult {
  dispatched: number;
  invalidTimezone: number;
  nextCursor?: string;
  scanned: number;
  skipped: number;
}

export interface RotateDormantXeroConnectionsResult {
  failed: number;
  rotated: number;
  scanned: number;
}

export async function rotateDormantXeroConnections(
  now: Date = new Date()
): Promise<Result<RotateDormantXeroConnectionsResult>> {
  const connectionsResult = await findConnectionsNeedingTokenRotation({
    now,
  });
  if (!connectionsResult.ok) {
    return connectionsResult;
  }

  let failed = 0;
  let rotated = 0;
  for (const connection of connectionsResult.value) {
    const refreshResult = await ensureFreshXeroConnection({
      clerkOrgId: connection.clerkOrgId,
      connectionId: connection.connectionId,
      now,
      organisationId: connection.organisationId,
    });
    if (refreshResult.ok) {
      if (refreshResult.value.refreshed) {
        rotated += 1;
      }
      continue;
    }

    failed += 1;
    log.error("Failed to rotate dormant Xero refresh token", {
      clerkOrgId: connection.clerkOrgId,
      connectionId: connection.connectionId,
      error: refreshResult.error,
      organisationId: connection.organisationId,
    });
  }

  return {
    ok: true,
    value: {
      failed,
      rotated,
      scanned: connectionsResult.value.length,
    },
  };
}

export async function scheduleXeroSyncsPage(
  options: ScheduleXeroSyncsPageOptions = {}
): Promise<Result<ScheduleXeroSyncsPageResult>> {
  const now = options.now ?? new Date();
  const listResult = await listSchedulableXeroTenants({
    cursor: options.cursor,
    limit: 100,
  });

  if (!listResult.ok) {
    log.error(
      "Failed to list schedulable Xero tenants in scheduleXeroSyncsPage",
      {
        error: listResult.error,
      }
    );
    return {
      error: listResult.error,
      ok: false,
    };
  }

  const { tenants, nextCursor } = listResult.value;
  const scanned = tenants.length;
  let dispatched = 0;
  let skipped = 0;
  let invalidTimezone = 0;

  for (const tenant of tenants) {
    if (!(tenant.timezone && isValidTimezone(tenant.timezone))) {
      invalidTimezone += 1;
      log.warn("Skipping Xero tenant with invalid timezone", {
        clerkOrgId: tenant.clerkOrgId,
        organisationId: tenant.organisationId,
        xeroTenantId: tenant.databaseTenantId,
      });
      continue;
    }

    const due = dueRunTypes(tenant, now);
    if (due.length === 0) {
      skipped += 1;
      continue;
    }

    for (const runType of due) {
      const eventId = getScheduledSyncEventId(
        tenant.databaseTenantId,
        runType,
        now
      );
      const dispatchRes = await dispatchSyncEvent(
        {
          clerkOrgId: tenant.clerkOrgId,
          organisationId: tenant.organisationId,
          runType,
          triggerType: "scheduled",
          xeroTenantId: tenant.databaseTenantId,
        },
        { eventId }
      );

      if (dispatchRes.ok) {
        dispatched += 1;
      } else {
        log.error("Failed to dispatch scheduled sync event", {
          clerkOrgId: tenant.clerkOrgId,
          error: dispatchRes.error,
          organisationId: tenant.organisationId,
          runType,
          xeroTenantId: tenant.databaseTenantId,
        });
      }
    }
  }

  return {
    ok: true,
    value: {
      dispatched,
      invalidTimezone,
      nextCursor,
      scanned,
      skipped,
    },
  };
}

export const scheduleXeroSyncsFunction: InngestFunction.Any =
  inngest.createFunction(
    {
      concurrency: {
        limit: 1,
      },
      id: "schedule-xero-syncs",
      triggers: { cron: "*/15 * * * *" },
    },
    async ({ step }) => {
      let cursor: string | undefined;
      let pageIndex = 0;
      let totalScanned = 0;
      let totalDispatched = 0;
      let totalSkipped = 0;
      let totalInvalidTimezone = 0;
      let hasMorePages = true;

      const cleanupResult = await step.run(
        "cleanup-xero-oauth-sessions",
        async () => scrubInactiveXeroOAuthSessionCredentials()
      );
      if (!cleanupResult.ok) {
        log.error("Failed to clean up inactive Xero OAuth sessions", {
          error: cleanupResult.error,
        });
      }

      const rotationResult = await step.run(
        "rotate-dormant-connections",
        async () => rotateDormantXeroConnections()
      );
      if (rotationResult.ok) {
        log.info("Completed dormant Xero token rotation pass", {
          failed: rotationResult.value.failed,
          rotated: rotationResult.value.rotated,
          scanned: rotationResult.value.scanned,
        });
      } else {
        log.error(
          "Failed to find dormant Xero connections for token rotation",
          {
            error: rotationResult.error,
          }
        );
      }

      while (hasMorePages) {
        const pageResult = await step.run(
          `process-page-${pageIndex}`,
          async () => scheduleXeroSyncsPage({ cursor })
        );

        if (!pageResult.ok) {
          log.error("Failed to fetch schedulable Xero tenants page", {
            error: pageResult.error,
            pageIndex,
          });
          break;
        }

        totalScanned += pageResult.value.scanned;
        totalDispatched += pageResult.value.dispatched;
        totalSkipped += pageResult.value.skipped;
        totalInvalidTimezone += pageResult.value.invalidTimezone;

        if (pageResult.value.nextCursor) {
          cursor = pageResult.value.nextCursor;
          pageIndex += 1;
        } else {
          hasMorePages = false;
        }
      }

      log.info("Completed scheduled Xero syncs coordinator run", {
        dispatched: totalDispatched,
        invalidTimezone: totalInvalidTimezone,
        scanned: totalScanned,
        skipped: totalSkipped,
      });

      return {
        dispatched: totalDispatched,
        invalidTimezone: totalInvalidTimezone,
        scanned: totalScanned,
        skipped: totalSkipped,
      };
    }
  );
