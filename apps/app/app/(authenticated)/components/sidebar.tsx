"use client";

import { useAuth } from "@repo/auth/client";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@repo/design-system/components/ui/sidebar";
import { cn } from "@repo/design-system/lib/utils";
import {
  ActivityIcon,
  BarChart3Icon,
  BellIcon,
  CalendarDaysIcon,
  ClipboardListIcon,
  FlagIcon,
  LayoutDashboardIcon,
  LinkIcon,
  type LucideIcon,
  Settings2Icon,
  UsersIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { getOrgFromSearchParams, withOrg } from "@/lib/navigation/org-url";

interface GlobalSidebarProperties {
  readonly children: ReactNode;
}

interface NavItem {
  href: string;
  icon: LucideIcon;
  roles?: readonly string[];
  title: string;
}

interface NavGroup {
  items: NavItem[];
  label: string | null;
}

const ANALYTICS_NAV_ROLES = ["org:manager", "org:admin", "org:owner"];

const navGroups: NavGroup[] = [
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
        title: "Analytics",
        href: "/analytics/leave-reports",
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

export const GlobalSidebar = ({ children }: GlobalSidebarProperties) => {
  const sidebar = useSidebar();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const orgId = getOrgFromSearchParams(searchParams);
  const { orgRole } = useAuth();

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <>
      <Sidebar collapsible="icon" variant="inset">
        <SidebarHeader className="pb-2">
          <SidebarMenu>
            <SidebarMenuItem>
              <div
                className={cn(
                  "mb-1 flex items-center gap-2.5 px-1 py-1.5",
                  !sidebar.open && "justify-center"
                )}
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center">
                  <svg
                    aria-hidden="true"
                    className="h-9 w-9"
                    focusable="false"
                    viewBox="0 0 48 48"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <rect
                      fill="#57624F"
                      height="9"
                      rx="4.5"
                      width="28"
                      x="8"
                      y="8"
                    />
                    <rect
                      fill="#CAE8BC"
                      height="9"
                      rx="4.5"
                      width="28"
                      x="14"
                      y="20"
                    />
                    <rect
                      fill="#6DA671"
                      height="9"
                      rx="4.5"
                      width="25"
                      x="6"
                      y="32"
                    />
                  </svg>
                </div>
                {sidebar.open && (
                  <span className="font-semibold text-[0.9375rem] tracking-[-0.01em]">
                    LeaveSync
                  </span>
                )}
              </div>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>

        <SidebarContent>
          {navGroups.map((group) => (
            <SidebarGroup key={group.label ?? "__home"}>
              {group.label && (
                <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
              )}
              <SidebarGroupContent>
                <SidebarMenu>
                  {group.items
                    .filter((item) => isNavItemVisible(item.roles, orgRole))
                    .map((item) => (
                      <SidebarMenuItem key={item.title}>
                        <SidebarMenuButton
                          asChild
                          className="h-9 gap-3"
                          isActive={isActive(item.href)}
                          tooltip={item.title}
                        >
                          <Link href={withOrg(item.href, orgId)}>
                            <item.icon
                              className="h-4 w-4 shrink-0"
                              strokeWidth={1.75}
                            />
                            <span className="font-medium text-[0.8125rem]">
                              {item.title}
                            </span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
        </SidebarContent>

        <SidebarFooter className="gap-0 pt-0">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                className="h-9 gap-3"
                isActive={pathname.startsWith("/settings")}
                tooltip="Settings"
              >
                <Link href={withOrg("/settings", orgId)}>
                  <Settings2Icon
                    className="h-4 w-4 shrink-0"
                    strokeWidth={1.75}
                  />
                  <span className="font-medium text-[0.8125rem]">Settings</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>

        <SidebarRail />
      </Sidebar>

      {children}
    </>
  );
};

function isNavItemVisible(
  roles: readonly string[] | undefined,
  orgRole: string | null | undefined
): boolean {
  return roles ? roles.includes(orgRole ?? "") : true;
}
