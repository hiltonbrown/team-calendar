"use client";

import { useEffect, useRef } from "react";

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@repo/design-system/components/ui/context-menu";

// See ContextMenu.tsx for why this dispatch is needed: the Root has no
// open/defaultOpen prop, so an actual "contextmenu" event is fired at mount
// to render the content open for review.
function useOpenOnMount<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
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

export const Default = () => {
  const ref = useOpenOnMount<HTMLDivElement>();
  return (
    <ContextMenu>
      <ContextMenuTrigger
        ref={ref}
        className="flex h-28 w-52 flex-col rounded-md border p-2 text-sm"
      >
        <span className="font-medium text-foreground">21</span>
        <span className="mt-1 text-muted-foreground text-xs">
          Right-click a day to manage it
        </span>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        <ContextMenuLabel>Tuesday, 21 July</ContextMenuLabel>
        <ContextMenuSeparator />
        <ContextMenuItem>Add leave request</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
};
