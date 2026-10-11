import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from "@repo/design-system";
import { useEffect, useRef } from "react";

// ContextMenu has no controlled `open` prop, so the preview opens it once on
// mount by dispatching a right-click at a fixed point inside the trigger.
function useOpenOnMount(x: number, y: number) {
  const ref = useRef<HTMLDivElement>(null);
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
        clientX: rect.left + x,
        clientY: rect.top + y,
      })
    );
  }, [x, y]);
  return ref;
}

export const CalendarDay = () => {
  const ref = useOpenOnMount(120, 70);
  return (
    <ContextMenu modal={false}>
      <ContextMenuTrigger asChild>
        <div
          className="text-muted-foreground flex items-start rounded-xl p-4 text-sm"
          ref={ref}
          style={{ border: "2px dashed var(--outline-variant)", height: 360, width: 520 }}
        >
          Thursday 17 October. Right-click a day to add availability.
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-64">
        <ContextMenuLabel>Thu 17 Oct</ContextMenuLabel>
        <ContextMenuItem>
          Request leave
          <ContextMenuShortcut>L</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem>Working from home</ContextMenuItem>
        <ContextMenuItem>Travelling</ContextMenuItem>
        <ContextMenuItem>Training</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive">Clear entry</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
};

export const TriggerArea = () => (
  <ContextMenu>
    <ContextMenuTrigger asChild>
      <div
        className="text-muted-foreground flex items-center justify-center rounded-xl text-sm"
        style={{ border: "2px dashed var(--outline-variant)", height: 200, width: 420 }}
      >
        Right-click a calendar entry for quick actions
      </div>
    </ContextMenuTrigger>
    <ContextMenuContent className="w-56">
      <ContextMenuItem>Open entry</ContextMenuItem>
      <ContextMenuItem>Copy dates</ContextMenuItem>
    </ContextMenuContent>
  </ContextMenu>
);
