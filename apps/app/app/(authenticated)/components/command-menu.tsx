"use client";

import { useAuth } from "@repo/auth/client";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@repo/design-system/components/ui/command";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { COMMAND_MENU_OPEN_EVENT } from "@/lib/command-menu/command-menu-events";
import {
  isNavItemVisible,
  navGroups,
  quickActions,
  settingsNavItem,
} from "@/lib/navigation/nav-items";
import { getOrgFromSearchParams, withOrg } from "@/lib/navigation/org-url";

/**
 * Global command palette (Cmd/Ctrl+K). Reuses the shared nav registry so its
 * destinations always match the sidebar, and preserves the active org query
 * param on every jump.
 */
export function CommandMenu() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const orgId = getOrgFromSearchParams(searchParams);
  const { orgRole } = useAuth();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((previous) => !previous);
      }
    };
    const onOpen = () => setOpen(true);

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener(COMMAND_MENU_OPEN_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener(COMMAND_MENU_OPEN_EVENT, onOpen);
    };
  }, []);

  const go = useCallback(
    (href: string) => {
      setOpen(false);
      router.push(withOrg(href, orgId));
    },
    [orgId, router]
  );

  const visibleQuickActions = quickActions.filter((action) =>
    isNavItemVisible(action.roles, orgRole)
  );

  return (
    <CommandDialog
      description="Jump to a page or start something new"
      onOpenChange={setOpen}
      open={open}
      title="Command menu"
    >
      <CommandInput placeholder="Search pages and actions..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        {visibleQuickActions.length > 0 ? (
          <>
            <CommandGroup heading="Create">
              {visibleQuickActions.map((action) => (
                <CommandItem
                  key={action.href}
                  keywords={action.keywords ? [...action.keywords] : undefined}
                  onSelect={() => go(action.href)}
                  value={action.title}
                >
                  <action.icon strokeWidth={1.75} />
                  {action.title}
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        ) : null}

        {navGroups.map((group) => {
          const items = group.items.filter((item) =>
            isNavItemVisible(item.roles, orgRole)
          );
          if (items.length === 0) {
            return null;
          }
          return (
            <CommandGroup heading={group.label ?? "Navigate"} key={group.label}>
              {items.map((item) => (
                <CommandItem
                  key={item.href}
                  onSelect={() => go(item.href)}
                  value={`${group.label ?? "Navigate"} ${item.title}`}
                >
                  <item.icon strokeWidth={1.75} />
                  {item.title}
                </CommandItem>
              ))}
            </CommandGroup>
          );
        })}

        <CommandGroup heading="Settings">
          <CommandItem
            onSelect={() => go(settingsNavItem.href)}
            value={settingsNavItem.title}
          >
            <settingsNavItem.icon strokeWidth={1.75} />
            {settingsNavItem.title}
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
