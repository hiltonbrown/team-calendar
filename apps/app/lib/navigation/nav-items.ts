import {
  ActivityIcon,
  BarChart3Icon,
  BellIcon,
  CalendarDaysIcon,
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
    items: [{ href: "/", icon: LayoutDashboardIcon, title: "Dashboard" }],
    label: null,
  },
  {
    items: [
      { href: "/plans", icon: ClipboardListIcon, title: "My Plans" },
      { href: "/calendar", icon: CalendarDaysIcon, title: "Calendar" },
      { href: "/notifications", icon: BellIcon, title: "Notifications" },
    ],
    label: "My Work",
  },
  {
    items: [
      { href: "/people", icon: UsersIcon, title: "People" },
      { href: "/feeds", icon: LinkIcon, title: "Calendar Feeds" },
      {
        href: "/analytics/leave-reports",
        icon: BarChart3Icon,
        roles: ANALYTICS_NAV_ROLES,
        title: "Leave Reports",
      },
      {
        href: "/analytics/out-of-office",
        icon: BarChart3Icon,
        roles: ANALYTICS_NAV_ROLES,
        title: "Out of Office",
      },
    ],
    label: "Team",
  },
  {
    items: [
      {
        href: "/leave-approvals",
        icon: ClipboardListIcon,
        title: "Leave Approvals",
      },
      { href: "/public-holidays", icon: FlagIcon, title: "Public Holidays" },
      {
        href: "/sync",
        icon: ActivityIcon,
        roles: ADMIN_ROLES,
        title: "Sync Health",
      },
    ],
    label: "Admin",
  },
];

export const settingsNavItem: NavItem = {
  href: "/settings",
  icon: Settings2Icon,
  title: "Settings",
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
    href: "/plans/new",
    icon: FilePlusIcon,
    keywords: [
      "plan",
      "availability",
      "leave",
      "request",
      "time off",
      "annual",
      "sick",
    ],
    title: "New plan",
  },
  {
    href: "/feeds/new",
    icon: LinkIcon,
    keywords: ["feed", "ics", "subscribe", "calendar"],
    title: "New calendar feed",
  },
  {
    href: "/people/new",
    icon: UserPlusIcon,
    keywords: ["person", "member", "employee", "team"],
    roles: ADMIN_ROLES,
    title: "Add person",
  },
  {
    href: "/public-holidays/holidays/new",
    icon: FlagIcon,
    keywords: ["holiday", "public", "day off"],
    roles: ADMIN_ROLES,
    title: "Add public holiday",
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
