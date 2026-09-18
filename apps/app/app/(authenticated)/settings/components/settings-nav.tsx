"use client";

import { Button } from "@repo/design-system/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@repo/design-system/components/ui/sheet";
import {
  CalendarCheckIcon,
  ClipboardListIcon,
  CreditCardIcon,
  ListChecksIcon,
  type LucideIcon,
  MenuIcon,
  PlugIcon,
  RssIcon,
  ScrollTextIcon,
  Settings2Icon,
  UsersIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { withOrg } from "@/lib/navigation/org-url";

interface NavItem {
  href: string;
  icon: LucideIcon;
  label: string;
}

const NAV_GROUPS: Array<{ items: NavItem[]; label: string }> = [
  {
    items: [
      { href: "/settings/general", icon: Settings2Icon, label: "General" },
      {
        href: "/settings/getting-started",
        icon: ListChecksIcon,
        label: "Getting started",
      },
      {
        href: "/settings/leave-approval",
        icon: ClipboardListIcon,
        label: "Leave approval",
      },
      { href: "/settings/members", icon: UsersIcon, label: "Members" },
      { href: "/settings/billing", icon: CreditCardIcon, label: "Billing" },
    ],
    label: "Organisation",
  },
  {
    items: [
      {
        href: "/settings/integrations",
        icon: PlugIcon,
        label: "Integrations",
      },
      {
        href: "/settings/feeds",
        icon: RssIcon,
        label: "Feeds and publishing",
      },
      {
        href: "/settings/holidays",
        icon: CalendarCheckIcon,
        label: "Holidays",
      },
    ],
    label: "Publishing",
  },
  {
    items: [
      {
        href: "/settings/audit-log",
        icon: ScrollTextIcon,
        label: "Audit log",
      },
    ],
    label: "Operations",
  },
];

interface SettingsNavProps {
  orgQueryValue: string;
}

export const SettingsNav = ({ orgQueryValue }: SettingsNavProps) => {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const orgParam = searchParams.get("org")?.trim();
  const activeOrgQueryValue = orgParam || orgQueryValue;
  const activeItem = NAV_GROUPS.flatMap((group) => group.items).find((item) =>
    isActivePath(pathname, item.href)
  );

  return (
    <>
      <div className="px-4 pb-4 sm:px-6 lg:hidden">
        <Sheet>
          <SheetTrigger asChild>
            <Button
              aria-label="Open Settings navigation"
              className="min-h-11 w-full justify-between rounded-xl bg-muted"
              variant="ghost"
            >
              <span className="flex min-w-0 items-center gap-2">
                <MenuIcon className="size-4 shrink-0" />
                <span className="truncate">
                  {activeItem?.label ?? "Settings sections"}
                </span>
              </span>
              <span className="text-muted-foreground text-xs">Change</span>
            </Button>
          </SheetTrigger>
          <SheetContent
            className="w-[min(22rem,90vw)] bg-background"
            side="left"
          >
            <SheetHeader>
              <SheetTitle>Settings</SheetTitle>
              <SheetDescription>
                Choose a section for this payroll organisation.
              </SheetDescription>
            </SheetHeader>
            <SettingsNavigation
              closeOnSelect
              orgQueryValue={activeOrgQueryValue}
              pathname={pathname}
            />
          </SheetContent>
        </Sheet>
      </div>

      <aside className="hidden w-60 shrink-0 bg-muted/40 p-4 lg:block">
        <SettingsNavigation
          orgQueryValue={activeOrgQueryValue}
          pathname={pathname}
        />
      </aside>
    </>
  );
};

function SettingsNavigation({
  closeOnSelect = false,
  orgQueryValue,
  pathname,
}: {
  closeOnSelect?: boolean;
  orgQueryValue: string;
  pathname: string;
}) {
  return (
    <nav aria-label="Settings sections" className="space-y-6 px-4 pb-6">
      {NAV_GROUPS.map((group) => (
        <div className="space-y-2" key={group.label}>
          <p className="px-3 font-medium text-muted-foreground text-xs uppercase tracking-wide">
            {group.label}
          </p>
          <ul className="space-y-1">
            {group.items.map((item) => {
              const Icon = item.icon;
              const active = isActivePath(pathname, item.href);
              const link = (
                <Link
                  aria-current={active ? "page" : undefined}
                  className={
                    active
                      ? "flex min-h-11 items-center gap-3 rounded-xl bg-background px-3 font-medium text-foreground text-sm"
                      : "flex min-h-11 items-center gap-3 rounded-xl px-3 text-muted-foreground text-sm hover:bg-background/70 hover:text-foreground"
                  }
                  href={withOrg(item.href, orgQueryValue)}
                >
                  <Icon className="size-4 shrink-0" strokeWidth={1.75} />
                  <span>{item.label}</span>
                </Link>
              );
              return (
                <li key={item.href}>
                  {closeOnSelect ? (
                    <SheetClose asChild>{link}</SheetClose>
                  ) : (
                    link
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function isActivePath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}
