import {
  ActivityIcon,
  BarChart3Icon,
  BellIcon,
  CalendarDaysIcon,
  CalendarPlusIcon,
  ClipboardListIcon,
  FilePlusIcon,
  FlagIcon,
  LayoutDashboardIcon,
  LinkIcon,
  type LucideIcon,
  Settings2Icon,
  UserPlusIcon,
  UsersIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  icon: LucideIcon;
  roles?: readonly string[];
  title: string;
}

export interface NavGroup {
  items: NavItem[];
  label: string | null;
}

const ANALYTICS_NAV_ROLES = ["org:manager", "org:admin", "org:owner"] as const;
const ADMIN_ROLES = ["org:admin", "org:owner"] as const;

/**
 * Single source of truth for primary navigation. Consumed by both the sidebar
 * and the command palette so the two never drift apart.
 */
export const navGroups: NavGroup[] = [
  {
    label: null,
    items: [{ title: "Dashboard", href: "/", icon: LayoutDashboardIcon }],
  },
  {
    label: "My Work",
    items: [
      { title: "My Plans", href: "/plans", icon: ClipboardListIcon },
      { title: "Calendar", href: "/calendar", icon: CalendarDaysIcon },
      { title: "Notifications", href: "/notifications", icon: BellIcon },
    ],
  },
  {
    label: "Team",
    items: [
      { title: "People", href: "/people", icon: UsersIcon },
      { title: "Calendar Feeds", href: "/feeds", icon: LinkIcon },
      {
        title: "Leave Reports",
        href: "/analytics/leave-reports",
        icon: BarChart3Icon,
        roles: ANALYTICS_NAV_ROLES,
      },
      {
        title: "Out of Office",
        href: "/analytics/out-of-office",
        icon: BarChart3Icon,
        roles: ANALYTICS_NAV_ROLES,
      },
    ],
  },
  {
    label: "Admin",
    items: [
      {
        title: "Leave Approvals",
        href: "/leave-approvals",
        icon: ClipboardListIcon,
      },
      { title: "Public Holidays", href: "/public-holidays", icon: FlagIcon },
      { title: "Sync Health", href: "/sync", icon: ActivityIcon },
    ],
  },
];

export const settingsNavItem: NavItem = {
  title: "Settings",
  href: "/settings",
  icon: Settings2Icon,
};

export interface QuickAction {
  href: string;
  icon: LucideIcon;
  keywords?: readonly string[];
  roles?: readonly string[];
  title: string;
}

/** Create actions surfaced in the command palette's "Create" group. */
export const quickActions: QuickAction[] = [
  {
    title: "New leave request",
    href: "/availability/new",
    icon: CalendarPlusIcon,
    keywords: ["leave", "request", "time off", "annual", "sick"],
  },
  {
    title: "New plan",
    href: "/plans/new",
    icon: FilePlusIcon,
    keywords: ["plan", "availability"],
  },
  {
    title: "New calendar feed",
    href: "/feeds/new",
    icon: LinkIcon,
    keywords: ["feed", "ics", "subscribe", "calendar"],
  },
  {
    title: "Add person",
    href: "/people/new",
    icon: UserPlusIcon,
    keywords: ["person", "member", "employee", "team"],
    roles: ADMIN_ROLES,
  },
  {
    title: "Add public holiday",
    href: "/public-holidays/holidays/new",
    icon: FlagIcon,
    keywords: ["holiday", "public", "day off"],
    roles: ADMIN_ROLES,
  },
];

/**
 * A nav or quick action with a `roles` list is visible only to those roles;
 * an item without `roles` is visible to everyone.
 */
export function isNavItemVisible(
  roles: readonly string[] | undefined,
  orgRole: string | null | undefined
): boolean {
  return roles ? roles.includes(orgRole ?? "") : true;
}
