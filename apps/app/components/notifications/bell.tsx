"use client";

import { Button } from "@repo/design-system/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@repo/design-system/components/ui/popover";
import { useNotificationEvents } from "@repo/notifications/components/provider";
import {
  AlertTriangleIcon,
  BellIcon,
  CheckCircleIcon,
  InboxIcon,
  KeyRoundIcon,
  MessageCircleIcon,
  RefreshCwIcon,
  ReplyIcon,
  ShieldAlertIcon,
  UserPlusIcon,
  XCircleIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import {
  listRecentUnreadAction,
  markAllAsReadAction,
  markAsReadAction,
  refreshUnreadCountAction,
} from "@/app/(authenticated)/notifications/_actions";
import { withOrg } from "@/lib/navigation/org-url";

export interface BellNotificationItem {
  actionUrl: string | null;
  body: string;
  createdAt: string;
  iconKey: string;
  id: string;
  title: string;
}

interface NotificationsBellProps {
  initialRecent: BellNotificationItem[];
  initialUnreadCount: number;
  organisationId: string;
}

export function NotificationsBell({
  initialRecent,
  initialUnreadCount,
  organisationId,
}: NotificationsBellProps) {
  const router = useRouter();
  const { connectionVersion, status, subscribe } = useNotificationEvents();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [recent, setRecent] = useState(initialRecent);
  const [message, setMessage] = useState<{
    text: string;
    tone: "error" | "status";
  } | null>(null);

  useEffect(
    () =>
      subscribe((event) => {
        if (event.type === "notification.created") {
          setUnreadCount(event.payload.unreadCount);
          setRecent((items) =>
            [
              {
                actionUrl: event.payload.actionUrl,
                body: event.payload.body,
                createdAt: event.payload.createdAt,
                iconKey: iconForType(event.payload.type),
                id: event.payload.notificationId,
                title: event.payload.title,
              },
              ...items,
            ].slice(0, 3)
          );
        }
        if (event.type === "notification.read") {
          setUnreadCount(event.payload.unreadCount);
          setRecent((items) =>
            items.filter((item) => item.id !== event.payload.notificationId)
          );
        }
        if (event.type === "notification.all_read") {
          setUnreadCount(0);
          setRecent([]);
        }
      }),
    [subscribe]
  );

  useEffect(() => {
    if (connectionVersion === 0) {
      return;
    }
    startTransition(async () => {
      const [countResult, recentResult] = await Promise.all([
        refreshUnreadCountAction({ organisationId }),
        listRecentUnreadAction({ organisationId }),
      ]);
      if (countResult.ok) {
        setUnreadCount(countResult.value);
      }
      if (recentResult.ok) {
        setRecent(
          recentResult.value.map((item) => ({
            actionUrl: item.actionUrl,
            body: item.body,
            createdAt: item.createdAt.toISOString(),
            iconKey: item.iconKey,
            id: item.id,
            title: item.title,
          }))
        );
      }
      if (!(countResult.ok && recentResult.ok)) {
        setMessage({
          text: "Notifications could not be refreshed. Try again shortly.",
          tone: "error",
        });
      }
    });
  }, [connectionVersion, organisationId]);

  const badge = useMemo(() => formatBadge(unreadCount), [unreadCount]);

  const markAll = () => {
    startTransition(async () => {
      const result = await markAllAsReadAction({ organisationId });
      if (result.ok) {
        setUnreadCount(0);
        setRecent([]);
        setMessage({
          text: "All notifications marked as read.",
          tone: "status",
        });
      } else {
        setMessage({ text: result.error.message, tone: "error" });
      }
    });
  };

  const openNotification = (item: BellNotificationItem) => {
    startTransition(async () => {
      const result = await markAsReadAction({
        notificationId: item.id,
        organisationId,
      });
      if (result.ok) {
        setUnreadCount(result.value.unreadCount);
        setRecent((items) => items.filter((current) => current.id !== item.id));
        if (item.actionUrl) {
          router.push(withOrg(item.actionUrl, organisationId));
        }
      } else {
        setMessage({ text: result.error.message, tone: "error" });
      }
    });
  };

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild>
        <Button
          aria-label={`Notifications, ${unreadCount} unread`}
          className="relative size-11 rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground"
          size="icon"
          type="button"
          variant="ghost"
        >
          <BellIcon className="size-4" />
          {badge && (
            <span className="absolute top-0.5 right-0.5 min-w-5 rounded-full bg-destructive px-1.5 py-0.5 text-center font-semibold text-destructive-foreground text-label-md">
              {badge}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 rounded-2xl p-0">
        <div className="border-border border-b p-4">
          <p className="font-semibold text-body-sm">Notifications</p>
          <p className="text-label-md text-muted-foreground">
            {unreadCount > 0 ? `${unreadCount} unread` : "No new notifications"}
          </p>
          {status === "connecting" ? (
            <p
              className="mt-2 text-label-md text-muted-foreground"
              role="status"
            >
              Connecting to live notifications…
            </p>
          ) : null}
          {status === "closed" ? (
            <p
              className="mt-2 text-label-md text-muted-foreground"
              role="status"
            >
              Live notifications are unavailable. Updates may be delayed.
            </p>
          ) : null}
          {message ? (
            <p
              aria-live={message.tone === "error" ? "assertive" : "polite"}
              className="mt-2 text-label-md"
              role={message.tone === "error" ? "alert" : "status"}
            >
              {message.text}
            </p>
          ) : null}
        </div>
        {recent.length === 0 ? (
          <div className="p-4 text-label-lg text-muted-foreground">
            No new notifications
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {recent.map((item) => (
              <li key={item.id}>
                <button
                  className="flex w-full items-start gap-3 p-4 text-left transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  disabled={isPending}
                  onClick={() => openNotification(item)}
                  type="button"
                >
                  <NotificationIcon iconKey={item.iconKey} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-label-lg">
                      {item.title}
                    </span>
                    <span className="block truncate text-label-md text-muted-foreground">
                      {item.body}
                    </span>
                    <span className="mt-1 block text-label-md text-muted-foreground">
                      {relativeTime(item.createdAt)}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex items-center justify-between border-border border-t p-3">
          <Button
            disabled={isPending || unreadCount === 0}
            onClick={markAll}
            size="sm"
            variant="ghost"
          >
            Mark all as read
          </Button>
          <Button asChild size="sm" variant="ghost">
            <Link href={withOrg("/notifications", organisationId)}>
              View all
            </Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function NotificationIcon({ iconKey }: { iconKey: string }) {
  const Icon = iconComponent(iconKey);
  return (
    <span className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-xl bg-muted text-primary">
      <Icon className="size-4" />
    </span>
  );
}

function iconComponent(iconKey: string) {
  switch (iconKey) {
    case "check-circle":
      return CheckCircleIcon;
    case "x-circle":
      return XCircleIcon;
    case "inbox-in":
      return InboxIcon;
    case "message-circle":
      return MessageCircleIcon;
    case "reply":
      return ReplyIcon;
    case "refresh-check":
      return RefreshCwIcon;
    case "alert-triangle":
      return AlertTriangleIcon;
    case "key-round":
      return KeyRoundIcon;
    case "shield-alert":
      return ShieldAlertIcon;
    case "user-plus":
      return UserPlusIcon;
    default:
      return BellIcon;
  }
}

function iconForType(type: string): string {
  switch (type) {
    case "leave_approved":
      return "check-circle";
    case "leave_declined":
      return "x-circle";
    case "leave_submitted":
      return "inbox-in";
    case "leave_info_requested":
      return "message-circle";
    case "leave_withdrawn":
      return "reply";
    case "feed_token_rotated":
      return "key-round";
    case "privacy_conflict":
      return "shield-alert";
    case "missing_alternative_contact":
      return "user-plus";
    case "sync_reconciliation_complete":
      return "refresh-check";
    default:
      return "alert-triangle";
  }
}

function formatBadge(count: number): string | null {
  if (count <= 0) {
    return null;
  }
  return count > 99 ? "99+" : String(count);
}

function relativeTime(iso: string): string {
  const deltaSeconds = Math.max(
    0,
    Math.floor((Date.now() - Date.parse(iso)) / 1000)
  );
  if (deltaSeconds < 60) {
    return "Just now";
  }
  const deltaMinutes = Math.floor(deltaSeconds / 60);
  if (deltaMinutes < 60) {
    return `${deltaMinutes} min ago`;
  }
  const deltaHours = Math.floor(deltaMinutes / 60);
  if (deltaHours < 24) {
    return `${deltaHours} hr ago`;
  }
  const deltaDays = Math.floor(deltaHours / 24);
  return `${deltaDays} d ago`;
}
