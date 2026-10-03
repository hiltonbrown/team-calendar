"use client";

import type { NotificationSseEvent } from "@repo/notifications";
import { useNotificationEvents } from "@repo/notifications/components/provider";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

interface CalendarLiveUpdatesProps {
  organisationId: string;
}

const TERMINAL_STATUSES = new Set(["succeeded", "failed", "cancelled"]);
const RELEVANT_RUN_TYPES = new Set([
  "approval_state_reconciliation",
  "initial-xero-sync",
  "leave_balances",
  "leave_records",
  "people",
]);

function shouldRefreshOnSyncRun(
  event: NotificationSseEvent,
  targetOrganisationId: string,
  seenKeys: Set<string>
): boolean {
  if (
    event.type !== "sync.run_status_changed" ||
    event.payload.organisationId !== targetOrganisationId
  ) {
    return false;
  }
  const { runId, runType, status } = event.payload;
  if (!(TERMINAL_STATUSES.has(status) && RELEVANT_RUN_TYPES.has(runType))) {
    return false;
  }
  const key = `sync:${runId}:${status}`;
  if (seenKeys.has(key)) {
    return false;
  }
  seenKeys.add(key);
  return true;
}

function shouldRefreshOnNotification(
  event: NotificationSseEvent,
  seenKeys: Set<string>
): boolean {
  if (event.type !== "notification.created") {
    return false;
  }
  const { notificationId, type, category } = event.payload;
  const isLeaveCategory =
    category === "leave_lifecycle" || category === "approval_flow";
  if (!(isLeaveCategory || type.startsWith("leave_"))) {
    return false;
  }
  const key = `notif:${notificationId}`;
  if (seenKeys.has(key)) {
    return false;
  }
  seenKeys.add(key);
  return true;
}

export function CalendarLiveUpdates({
  organisationId,
}: CalendarLiveUpdatesProps) {
  const router = useRouter();
  const { subscribe } = useNotificationEvents();
  const seenEventKeys = useRef<Set<string>>(new Set());
  const refreshTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [liveAnnouncement, setLiveAnnouncement] = useState("");
  const lastActiveCheckRef = useRef<number>(Date.now());
  const previousOrgIdRef = useRef(organisationId);

  if (previousOrgIdRef.current !== organisationId) {
    previousOrgIdRef.current = organisationId;
    seenEventKeys.current.clear();
    lastActiveCheckRef.current = Date.now();
  }

  useEffect(() => {
    const scheduleCoalescedRefresh = (announcement: string) => {
      setLiveAnnouncement(announcement);

      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }

      refreshTimeoutRef.current = setTimeout(() => {
        const { activeElement } = document;
        const isEditing =
          activeElement instanceof HTMLInputElement ||
          activeElement instanceof HTMLTextAreaElement ||
          activeElement?.getAttribute("contenteditable") === "true";

        if (!isEditing) {
          router.refresh();
        }
      }, 300);
    };

    const unsubscribe = subscribe((event) => {
      if (
        shouldRefreshOnSyncRun(event, organisationId, seenEventKeys.current)
      ) {
        scheduleCoalescedRefresh("Calendar updated from recent sync.");
        return;
      }
      if (shouldRefreshOnNotification(event, seenEventKeys.current)) {
        scheduleCoalescedRefresh("Calendar updated from new leave activity.");
      }
    });

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        const now = Date.now();
        if (now - lastActiveCheckRef.current > 60_000) {
          lastActiveCheckRef.current = now;
          scheduleCoalescedRefresh("Refreshing calendar state.");
        }
      } else {
        lastActiveCheckRef.current = Date.now();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      unsubscribe();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }
    };
  }, [organisationId, router, subscribe]);

  return (
    <div aria-live="polite" className="sr-only" role="status">
      {liveAnnouncement}
    </div>
  );
}
