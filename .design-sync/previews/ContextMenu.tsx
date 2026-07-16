"use client";

import {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@repo/design-system/components/ui/context-menu";
import { useEffect, useRef } from "react";

// ContextMenu only opens in response to a genuine contextmenu (right-click)
// event and exposes no `open`/`defaultOpen` prop on its Root. To preview the
// open state without user interaction, dispatch a real "contextmenu" DOM
// event at the trigger node on mount — this drives the exact same code path
// Radix uses for an actual right-click, it does not fake the rendered output.
function useOpenOnMount<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node) {
      return;
    }
    const rect = node.getBoundingClientRect();
    node.dispatchEvent(
      new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
      })
    );
  }, []);
  return ref;
}

export const CalendarDayActions = () => {
  const ref = useOpenOnMount<HTMLDivElement>();
  return (
    <ContextMenu>
      <ContextMenuTrigger
        className="flex h-32 w-48 flex-col rounded-md border p-2 text-sm"
        ref={ref}
      >
        <span className="font-medium text-foreground">14</span>
        <span className="mt-1 text-muted-foreground text-xs">
          Right-click a day to manage it
        </span>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        <ContextMenuItem>Add leave request</ContextMenuItem>
        <ContextMenuItem>Mark as public holiday</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem>Copy date</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
};

export const WithViewOptionsAndSubmenu = () => {
  const ref = useOpenOnMount<HTMLDivElement>();
  return (
    <ContextMenu>
      <ContextMenuTrigger
        className="flex h-32 w-56 flex-col rounded-md border p-2 text-sm"
        ref={ref}
      >
        <span className="font-medium text-foreground">Team calendar</span>
        <span className="mt-1 text-muted-foreground text-xs">
          Right-click for calendar options
        </span>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        <ContextMenuLabel>Calendar options</ContextMenuLabel>
        <ContextMenuSeparator />
        <ContextMenuCheckboxItem checked>
          Show public holidays
        </ContextMenuCheckboxItem>
        <ContextMenuCheckboxItem>Show weekends</ContextMenuCheckboxItem>
        <ContextMenuSeparator />
        <ContextMenuSub defaultOpen>
          <ContextMenuSubTrigger>Assign leave to</ContextMenuSubTrigger>
          <ContextMenuSubContent>
            <ContextMenuItem>Priya Nair</ContextMenuItem>
            <ContextMenuItem>Jordan Lee</ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>
      </ContextMenuContent>
    </ContextMenu>
  );
};
