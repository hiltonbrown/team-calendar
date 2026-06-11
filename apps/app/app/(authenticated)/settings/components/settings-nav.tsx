"use client";

import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@repo/design-system/components/ui/sidebar";
import {
  CalendarCheckIcon,
  ClipboardListIcon,
  CreditCardIcon,
  ListChecksIcon,
  PlugIcon,
  RssIcon,
  Settings2Icon,
  UsersIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { label: "General", href: "/settings/general", icon: Settings2Icon },
  {
    label: "Getting Started",
    href: "/settings/getting-started",
    icon: ListChecksIcon,
  },
  {
    label: "Leave Approval",
    href: "/settings/leave-approval",
    icon: ClipboardListIcon,
  },
  { label: "Members", href: "/settings/members", icon: UsersIcon },
  {
    label: "Integrations",
    href: "/settings/integrations",
    icon: PlugIcon,
  },
  {
    label: "Feeds & Publishing",
    href: "/settings/feeds",
    icon: RssIcon,
  },
  { label: "Billing", href: "/settings/billing", icon: CreditCardIcon },
  {
    // "Holidays" (not "Public Holidays") distinguishes this admin-config surface
    // (S-23) from the main-sidebar member view "Public Holidays" (S-11).
    label: "Holidays",
    href: "/settings/holidays",
    icon: CalendarCheckIcon,
  },
] as const;

export const SettingsNav = () => {
  const pathname = usePathname();

  return (
    <aside className="w-52 shrink-0 border-border/40 border-r py-6">
      <SidebarMenu className="px-3">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = pathname.startsWith(item.href);
          return (
            <SidebarMenuItem key={item.href}>
              <SidebarMenuButton
                asChild
                className="h-9 gap-3"
                isActive={isActive}
                tooltip={item.label}
              >
                <Link href={item.href}>
                  <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
                  <span className="font-medium text-[0.8125rem]">
                    {item.label}
                  </span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          );
        })}
      </SidebarMenu>
    </aside>
  );
};
