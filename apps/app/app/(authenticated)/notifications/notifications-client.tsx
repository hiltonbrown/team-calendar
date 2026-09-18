"use client";

import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import { toast } from "@repo/design-system/components/ui/sonner";
import { Switch } from "@repo/design-system/components/ui/switch";
import type {
  NotificationCategory,
  NotificationPreferenceRow,
  NotificationTypeConfig,
} from "@repo/notifications";
import { useNotificationEvents } from "@repo/notifications/components/provider";
import {
  AlertTriangleIcon,
  BellIcon,
  CheckCircleIcon,
  InboxIcon,
  MessageCircleIcon,
  ReplyIcon,
  XCircleIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { EmptyState } from "@/components/states/empty-state";
import {
  markAllAsReadAction,
  markAsReadAction,
  updatePreferenceAction,
} from "./_actions";

interface ClientNotification {
  actionLabel: string;
  actionUrl: string | null;
  body: string;
  category: NotificationCategory;
  createdAt: string;
  iconKey: string;
  id: string;
  isUnread: boolean;
  label: string;
  objectId: string | null;
  objectType: string | null;
  readAt: string | null;
  title: string;
  type: string;
}

interface NotificationFilters {
  category: string[];
  cursor: string | null;
  dateFrom: string | null;
  dateTo: string | null;
  focus: string | null;
  tab: "feed" | "preferences";
  type: string[];
  unreadOnly: boolean;
}

interface NotificationsClientProps {
  filters: NotificationFilters;
  nextCursor: string | null;
  notifications: ClientNotification[];
  notificationTypes: NotificationTypeConfig[];
  organisationId: string;
  orgQueryValue: string | null;
  preferences: NotificationPreferenceRow[];
  unreadCount: number;
}

const CATEGORY_ORDER: NotificationCategory[] = [
  "leave_lifecycle",
  "approval_flow",
  "sync",
  "system",
];

export function usePrefersReducedMotion(): boolean {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) {
      return;
    }
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReducedMotion(mediaQuery.matches);

    const listener = (event: MediaQueryListEvent) => {
      setPrefersReducedMotion(event.matches);
    };

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener("change", listener);
    } else {
      mediaQuery.addListener(listener);
    }

    return () => {
      if (mediaQuery.removeEventListener) {
        mediaQuery.removeEventListener("change", listener);
      } else {
        mediaQuery.removeListener(listener);
      }
    };
  }, []);

  return prefersReducedMotion;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: This route intentionally coordinates mutually exclusive feed and preference surfaces while sharing URL and SSE state.
export function NotificationsClient({
  filters,
  nextCursor,
  notificationTypes,
  notifications: initialNotifications,
  organisationId,
  orgQueryValue,
  preferences,
  unreadCount: initialUnreadCount,
}: NotificationsClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { status, subscribe } = useNotificationEvents();
  const [isPending, startTransition] = useTransition();
  const [notifications, setNotifications] = useState(initialNotifications);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const { preferenceRows, preferenceStatus, updatePreference } =
    usePreferenceUpdates(preferences, organisationId);

  useEffect(
    () =>
      subscribe((event) => {
        if (event.type === "notification.created") {
          setUnreadCount(event.payload.unreadCount);
          setNotifications((items) => [
            {
              actionLabel: "View",
              actionUrl: event.payload.actionUrl,
              body: event.payload.body,
              category: event.payload.category,
              createdAt: event.payload.createdAt,
              iconKey: iconForType(event.payload.type),
              id: event.payload.notificationId,
              isUnread: true,
              label: event.payload.type.replaceAll("_", " "),
              objectId: null,
              objectType: null,
              readAt: null,
              title: event.payload.title,
              type: event.payload.type,
            },
            ...items,
          ]);
        }
        if (event.type === "notification.read") {
          setUnreadCount(event.payload.unreadCount);
          setNotifications((items) =>
            items.map((item) =>
              item.id === event.payload.notificationId
                ? { ...item, isUnread: false, readAt: event.payload.readAt }
                : item
            )
          );
        }
        if (event.type === "notification.all_read") {
          setUnreadCount(0);
          setNotifications((items) =>
            items.map((item) => ({
              ...item,
              isUnread: false,
              readAt: item.readAt ?? new Date().toISOString(),
            }))
          );
        }
      }),
    [subscribe]
  );

  const prefersReducedMotion = usePrefersReducedMotion();
  const { focusAnnouncement, setFocusRef } = useDeepLinkFocus(
    filters.focus,
    prefersReducedMotion
  );

  const groupedTypes = useMemo(
    () =>
      CATEGORY_ORDER.map((category) => ({
        category,
        items: notificationTypes.filter(
          (type) => type.userFacingCategory === category
        ),
      })).filter((group) => group.items.length > 0),
    [notificationTypes]
  );

  const markAll = () => {
    startTransition(async () => {
      const result = await markAllAsReadAction({ organisationId });
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      setUnreadCount(0);
      setNotifications((items) =>
        items.map((item) => ({
          ...item,
          isUnread: false,
          readAt: item.readAt ?? new Date().toISOString(),
        }))
      );
    });
  };

  const markOne = (item: ClientNotification, navigate: boolean) => {
    startTransition(async () => {
      if (item.isUnread) {
        const result = await markAsReadAction({
          notificationId: item.id,
          organisationId,
        });
        if (!result.ok) {
          toast.error(result.error.message);
          return;
        }
        setUnreadCount(result.value.unreadCount);
        setNotifications((items) =>
          items.map((current) =>
            current.id === item.id
              ? {
                  ...current,
                  isUnread: false,
                  readAt:
                    result.value.notification.readAt?.toISOString() ?? null,
                }
              : current
          )
        );
      }
      if (navigate && item.actionUrl) {
        router.push(item.actionUrl);
      }
    });
  };

  const hasFilters =
    filters.unreadOnly ||
    filters.type.length > 0 ||
    filters.category.length > 0;
  let subtitle = "You are up to date.";
  if (filters.tab === "preferences") {
    subtitle =
      "Choose how you receive notifications. At least one channel must stay enabled.";
  } else if (unreadCount > 0) {
    subtitle = `${unreadCount} unread`;
  }

  return (
    <div className="flex flex-col gap-6">
      {focusAnnouncement ? (
        <p className="sr-only" role="status">
          {focusAnnouncement}
        </p>
      ) : null}
      <section className="flex flex-col justify-between gap-4 rounded-2xl bg-muted p-6 lg:flex-row lg:items-end">
        <div>
          <p className="font-medium text-muted-foreground text-xs uppercase tracking-widest">
            Inbox
          </p>
          <h1 className="mt-1 font-semibold text-foreground text-headline-md">
            {filters.tab === "feed"
              ? "Notifications"
              : "Notification preferences"}
          </h1>
          <p className="mt-2 text-muted-foreground text-sm">{subtitle}</p>
          {status === "connecting" ? (
            <p className="mt-2 text-muted-foreground text-xs" role="status">
              Connecting to live notifications…
            </p>
          ) : null}
          {status === "closed" ? (
            <p className="mt-2 text-muted-foreground text-xs" role="status">
              Live notifications are unavailable. Updates may be delayed.
            </p>
          ) : null}
        </div>
        <nav aria-label="Notification page" className="flex gap-2">
          <TabLink
            active={filters.tab === "feed"}
            href={hrefFor({ tab: "feed" })}
          >
            Notifications
          </TabLink>
          <TabLink
            active={filters.tab === "preferences"}
            href={hrefFor({ tab: "preferences" })}
          >
            Preferences
          </TabLink>
        </nav>
      </section>

      {filters.tab === "feed" ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-muted p-4">
            <fieldset className="flex flex-wrap gap-2">
              <legend className="sr-only">Notification filters</legend>
              <Button
                onClick={() => pushFilters({ unreadOnly: !filters.unreadOnly })}
                size="sm"
                variant={filters.unreadOnly ? "default" : "secondary"}
              >
                Unread only
              </Button>
              {CATEGORY_ORDER.map((category) => (
                <Button
                  key={category}
                  onClick={() => toggleCategory(category)}
                  size="sm"
                  variant={
                    filters.category.includes(category)
                      ? "default"
                      : "secondary"
                  }
                >
                  {categoryLabel(category)}
                </Button>
              ))}
              {hasFilters ? (
                <Button onClick={clearFilters} size="sm" variant="ghost">
                  Clear filters
                </Button>
              ) : null}
            </fieldset>
            <Button
              disabled={isPending || unreadCount === 0}
              onClick={markAll}
              size="sm"
              variant="ghost"
            >
              Mark all as read
            </Button>
          </div>

          <details className="rounded-2xl bg-muted px-4 py-3">
            <summary className="cursor-pointer font-medium text-sm focus-visible:outline-[3px] focus-visible:outline-ring">
              Filter by event type
            </summary>
            <div className="mt-3 flex flex-wrap gap-2">
              {notificationTypes.map((type) => (
                <Button
                  key={type.type}
                  onClick={() => toggleType(type.type)}
                  size="sm"
                  variant={
                    filters.type.includes(type.type) ? "default" : "secondary"
                  }
                >
                  {type.shortLabel}
                </Button>
              ))}
            </div>
          </details>

          {notifications.length === 0 ? (
            <EmptyState
              description={
                hasFilters
                  ? "No notifications match these filters."
                  : "No notifications yet. You'll see updates here when leave is submitted, approved or needs attention."
              }
              title={hasFilters ? "No matches" : "No notifications yet"}
            />
          ) : (
            <div className="space-y-3">
              {notifications.map((item) => (
                <article
                  className={`flex flex-col gap-4 rounded-2xl p-4 sm:flex-row ${
                    item.isUnread ? "bg-primary/10" : "bg-muted"
                  }`}
                  key={item.id}
                  ref={(node) => setFocusRef(item.id, node)}
                  tabIndex={-1}
                >
                  <div className="flex min-w-0 flex-1 gap-4">
                    <NotificationIcon iconKey={item.iconKey} />
                    <button
                      aria-label={`${item.title}${item.actionUrl ? ", open notification" : ""}`}
                      className="min-w-0 flex-1 rounded-xl text-left focus-visible:outline-[3px] focus-visible:outline-ring"
                      onClick={() => markOne(item, true)}
                      type="button"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-sm">{item.title}</p>
                        {item.isUnread ? <Badge>Unread</Badge> : null}
                      </div>
                      <p className="mt-1 line-clamp-2 text-muted-foreground text-sm">
                        {item.body}
                      </p>
                      <p
                        className="mt-2 text-muted-foreground text-xs"
                        title={formatFullDate(item.createdAt)}
                      >
                        {relativeTime(item.createdAt)}
                      </p>
                    </button>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 sm:items-end">
                    {item.isUnread ? (
                      <Button
                        disabled={isPending}
                        onClick={() => markOne(item, false)}
                        size="sm"
                        variant="ghost"
                      >
                        Mark read
                      </Button>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          )}
          {nextCursor ? (
            <Button asChild className="self-center" variant="secondary">
              <Link href={hrefFor({ cursor: nextCursor })}>Load more</Link>
            </Button>
          ) : null}
        </>
      ) : (
        <div className="space-y-6">
          {groupedTypes.map((group) => (
            <section className="space-y-3" key={group.category}>
              <h2 className="font-semibold text-base">
                {categoryLabel(group.category)}
              </h2>
              {group.items.map((type) => {
                const row = preferenceRows.find(
                  (item) => item.type === type.type
                );
                if (!row) {
                  return null;
                }
                const inAppIsLast = row.inAppEnabled && !row.emailEnabled;
                const emailIsLast = row.emailEnabled && !row.inAppEnabled;
                return (
                  <div
                    className={`flex flex-col gap-4 rounded-2xl bg-muted p-4 lg:flex-row lg:items-center lg:justify-between ${
                      filters.focus === row.type ? "ring-2 ring-primary" : ""
                    }`}
                    key={row.type}
                    ref={(node) => setFocusRef(row.type, node)}
                    tabIndex={-1}
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-sm">{row.label}</p>
                        {row.isDefault ? (
                          <span className="text-muted-foreground text-xs">
                            Using default
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-muted-foreground text-sm">
                        {row.description}
                      </p>
                    </div>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-5">
                      <Toggle
                        checked={row.inAppEnabled}
                        descriptionId={`${row.type}-in-app-description`}
                        disabled={inAppIsLast}
                        id={`${row.type}-in-app`}
                        label="In-app"
                        onChange={(checked) =>
                          updatePreference(row, "in_app", checked)
                        }
                      />
                      <Toggle
                        checked={row.emailEnabled}
                        descriptionId={`${row.type}-email-description`}
                        disabled={emailIsLast}
                        id={`${row.type}-email`}
                        label="Email"
                        onChange={(checked) =>
                          updatePreference(row, "email", checked)
                        }
                      />
                      <PreferenceReceipt status={preferenceStatus[row.type]} />
                    </div>
                  </div>
                );
              })}
            </section>
          ))}
        </div>
      )}
    </div>
  );

  function pushFilters(next: Partial<NotificationFilters>) {
    const params = new URLSearchParams();
    if (orgQueryValue) {
      params.set("org", orgQueryValue);
    }
    const merged = { ...filters, ...next, cursor: null };
    params.set("tab", merged.tab);
    if (merged.unreadOnly) {
      params.set("unreadOnly", "true");
    }
    for (const type of merged.type) {
      params.append("type", type);
    }
    for (const category of merged.category) {
      params.append("category", category);
    }
    if (merged.focus) {
      params.set("focus", merged.focus);
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  function hrefFor(next: Partial<NotificationFilters>): string {
    const params = new URLSearchParams();
    if (orgQueryValue) {
      params.set("org", orgQueryValue);
    }
    const merged = { ...filters, ...next };
    params.set("tab", merged.tab);
    if (merged.unreadOnly) {
      params.set("unreadOnly", "true");
    }
    for (const type of merged.type) {
      params.append("type", type);
    }
    for (const category of merged.category) {
      params.append("category", category);
    }
    if (merged.cursor) {
      params.set("cursor", merged.cursor);
    }
    return `${pathname}?${params.toString()}`;
  }

  function toggleType(type: string) {
    pushFilters({
      type: filters.type.includes(type)
        ? filters.type.filter((item) => item !== type)
        : [...filters.type, type],
    });
  }

  function toggleCategory(category: NotificationCategory) {
    pushFilters({
      category: filters.category.includes(category)
        ? filters.category.filter((item) => item !== category)
        : [...filters.category, category],
    });
  }

  function clearFilters() {
    pushFilters({ category: [], type: [], unreadOnly: false });
  }
}

function useDeepLinkFocus(focus: string | null, prefersReducedMotion: boolean) {
  const [focusAnnouncement, setFocusAnnouncement] = useState<string | null>(
    null
  );
  const focusRefs = useRef(new Map<string, HTMLElement>());

  useEffect(() => {
    if (!focus) {
      return;
    }
    const target = focusRefs.current.get(focus);
    if (!target) {
      return;
    }
    target.scrollIntoView({
      behavior: prefersReducedMotion ? "instant" : "smooth",
      block: "center",
    });
    target.focus({ preventScroll: true });
    setFocusAnnouncement("Focused the linked notification setting.");
  }, [focus, prefersReducedMotion]);

  return {
    focusAnnouncement,
    setFocusRef: (key: string, node: HTMLElement | null) => {
      if (node) {
        focusRefs.current.set(key, node);
      } else {
        focusRefs.current.delete(key);
      }
    },
  };
}

function usePreferenceUpdates(
  initialRows: NotificationPreferenceRow[],
  organisationId: string
) {
  const [preferenceRows, setPreferenceRows] = useState(initialRows);
  const [preferenceStatus, setPreferenceStatus] = useState<
    Record<string, "error" | "saved" | "saving">
  >({});
  const [, startPreferenceTransition] = useTransition();

  const updatePreference = (
    row: NotificationPreferenceRow,
    channel: "email" | "in_app",
    enabled: boolean
  ) => {
    const next = {
      ...row,
      emailEnabled: channel === "email" ? enabled : row.emailEnabled,
      inAppEnabled: channel === "in_app" ? enabled : row.inAppEnabled,
      isDefault: false,
    };
    if (!(next.inAppEnabled || next.emailEnabled)) {
      return;
    }
    setPreferenceRows((rows) =>
      rows.map((item) => (item.type === row.type ? next : item))
    );
    setPreferenceStatus((statuses) => ({
      ...statuses,
      [row.type]: "saving",
    }));
    startPreferenceTransition(async () => {
      const result = await updatePreferenceAction({
        emailEnabled: next.emailEnabled,
        inAppEnabled: next.inAppEnabled,
        notificationType: row.type,
        organisationId,
      });
      if (!result.ok) {
        toast.error(result.error.message);
        setPreferenceRows((rows) =>
          rows.map((item) => (item.type === row.type ? row : item))
        );
        setPreferenceStatus((statuses) => ({
          ...statuses,
          [row.type]: "error",
        }));
        return;
      }
      setPreferenceStatus((statuses) => ({
        ...statuses,
        [row.type]: "saved",
      }));
    });
  };

  return { preferenceRows, preferenceStatus, updatePreference };
}

function TabLink({
  active,
  children,
  href,
}: {
  active: boolean;
  children: ReactNode;
  href: string;
}) {
  return (
    <Button asChild size="sm" variant={active ? "default" : "secondary"}>
      <Link aria-current={active ? "page" : undefined} href={href}>
        {children}
      </Link>
    </Button>
  );
}

function Toggle({
  checked,
  descriptionId,
  disabled,
  id,
  label,
  onChange,
}: {
  checked: boolean;
  descriptionId: string;
  disabled: boolean;
  id: string;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  const disabledReason = "At least one delivery channel must stay enabled.";
  return (
    <div className="text-sm">
      <div className="flex items-center gap-2">
        <Switch
          aria-describedby={disabled ? descriptionId : undefined}
          checked={checked}
          disabled={disabled}
          id={id}
          onCheckedChange={onChange}
        />
        <label htmlFor={id}>{label}</label>
      </div>
      {disabled ? (
        <p
          className="mt-1 max-w-52 text-muted-foreground text-xs"
          id={descriptionId}
        >
          {disabledReason}
        </p>
      ) : null}
    </div>
  );
}

function PreferenceReceipt({
  status,
}: {
  status: "error" | "saved" | "saving" | undefined;
}) {
  if (!status) {
    return null;
  }
  const copy = {
    error: "Could not save. Previous setting restored.",
    saved: "Saved",
    saving: "Saving…",
  }[status];
  return (
    <p
      aria-live="polite"
      className={
        status === "error"
          ? "text-destructive text-xs"
          : "text-muted-foreground text-xs"
      }
      role={status === "error" ? "alert" : "status"}
    >
      {copy}
    </p>
  );
}

function NotificationIcon({ iconKey }: { iconKey: string }) {
  const Icon = iconComponent(iconKey);
  return (
    <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-background text-primary">
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
    case "alert-triangle":
      return AlertTriangleIcon;
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
    default:
      return "alert-triangle";
  }
}

function categoryLabel(category: NotificationCategory): string {
  switch (category) {
    case "leave_lifecycle":
      return "Leave lifecycle";
    case "approval_flow":
      return "Approval flow";
    case "sync":
      return "Sync";
    case "system":
      return "System";
    default:
      return "System";
  }
}

function relativeTime(iso: string): string {
  const deltaSeconds = Math.max(
    0,
    Math.floor((Date.now() - Date.parse(iso)) / 1000)
  );
  if (deltaSeconds < 60) {
    return "Just now";
  }
  const minutes = Math.floor(deltaSeconds / 60);
  if (minutes < 60) {
    return `${minutes} min ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours} hr ago`;
  }
  return `${Math.floor(hours / 24)} d ago`;
}

function formatFullDate(iso: string): string {
  return new Intl.DateTimeFormat("en-AU", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}
