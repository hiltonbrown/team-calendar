"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { Kbd, KbdGroup } from "@repo/design-system/components/ui/kbd";
import { SearchIcon } from "lucide-react";
import { openCommandMenu } from "@/lib/command-menu/command-menu-events";

/**
 * Header affordance that opens the global command palette, keeping the Cmd/Ctrl+K
 * shortcut discoverable rather than hidden. On narrow screens it collapses to an
 * icon-only button.
 */
export function CommandMenuTrigger() {
  return (
    <Button
      aria-label="Open command menu"
      className="text-muted-foreground sm:w-56 sm:justify-start sm:px-3"
      onClick={() => openCommandMenu()}
      size="sm"
      variant="outline"
    >
      <SearchIcon className="size-4 shrink-0" />
      <span className="hidden sm:inline">Search...</span>
      <KbdGroup className="ml-auto hidden sm:flex">
        <Kbd>⌘</Kbd>
        <Kbd>K</Kbd>
      </KbdGroup>
    </Button>
  );
}
