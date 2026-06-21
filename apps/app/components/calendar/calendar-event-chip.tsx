import type { CalendarEvent } from "@repo/availability";
import { cn } from "@repo/design-system/lib/utils";
import { AlertTriangleIcon } from "lucide-react";
import {
  statusToneClasses,
  toneForCalendarEvent,
} from "@/components/availability/availability-status";
import { CalendarEventPopover } from "./calendar-event-popover";

interface CalendarEventChipProps {
  event: CalendarEvent;
  orgQueryValue: string | null;
}

export function CalendarEventChip({
  event,
  orgQueryValue,
}: CalendarEventChipProps) {
  const style = statusToneClasses[toneForCalendarEvent(event)];
  const microLabel = treatmentLabel(event.renderTreatment);

  return (
    <CalendarEventPopover event={event} orgQueryValue={orgQueryValue}>
      <button
        className={cn(
          "flex w-full min-w-0 items-center gap-1.5 rounded-xl px-2 py-1 text-left text-xs ring-1 transition hover:brightness-95",
          style,
          event.renderTreatment === "dashed" &&
            "border border-dashed opacity-85",
          event.renderTreatment === "draft" && "opacity-65"
        )}
        onClick={(event) => event.stopPropagation()}
        type="button"
      >
        {event.renderTreatment === "failed" && (
          <AlertTriangleIcon className="size-3 shrink-0" />
        )}
        <span className="min-w-0 flex-1 truncate font-medium">
          {event.displayName}
        </span>
        {microLabel && (
          <span className="shrink-0 rounded-lg bg-background/60 px-1.5 py-0.5 font-medium">
            {microLabel}
          </span>
        )}
      </button>
    </CalendarEventPopover>
  );
}

function treatmentLabel(treatment: CalendarEvent["renderTreatment"]) {
  if (treatment === "dashed") {
    return "Pending";
  }
  if (treatment === "draft") {
    return "Draft";
  }
  if (treatment === "failed") {
    return "Sync failed";
  }
  return null;
}
