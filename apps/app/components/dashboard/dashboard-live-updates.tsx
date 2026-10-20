"use client";

import { toast } from "@repo/design-system/components/ui/sonner";
import { useNotificationEvents } from "@repo/notifications/components/provider";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

interface DashboardLiveUpdatesProps {
  organisationIds: readonly string[];
}

export function DashboardLiveUpdates({
  organisationIds,
}: DashboardLiveUpdatesProps) {
  const router = useRouter();
  const { subscribe } = useNotificationEvents();
  const shownToast = useRef<string | null>(null);
  const [liveText, setLiveText] = useState("");

  useEffect(
    () =>
      subscribe((event) => {
        if (
          event.type === "notification.created" &&
          (event.payload.type === "leave_submitted" ||
            event.payload.type === "leave_xero_sync_failed")
        ) {
          if (shownToast.current === event.payload.notificationId) {
            return;
          }
          shownToast.current = event.payload.notificationId;
          toast.message("New activity on the dashboard.", {
            action: {
              label: "Refresh",
              onClick: () => router.refresh(),
            },
          });
          setLiveText("New activity on the dashboard. Refresh available.");
        }

        if (
          event.type === "sync.run_status_changed" &&
          organisationIds.includes(event.payload.organisationId)
        ) {
          const toastKey = `${event.payload.runId}:${event.payload.status}`;
          if (shownToast.current === toastKey) {
            return;
          }
          shownToast.current = toastKey;
          toast.message("Sync activity updated.", {
            action: {
              label: "Refresh",
              onClick: () => router.refresh(),
            },
          });
          setLiveText("Sync activity updated. Refresh available.");
        }
      }),
    [organisationIds, router, subscribe]
  );

  return (
    <div aria-live="polite" className="sr-only" role="status">
      {liveText}
    </div>
  );
}
