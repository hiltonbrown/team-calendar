import type { CalendarEvent } from "@repo/availability";
import { cn } from "@repo/design-system/lib/utils";
import { AlertTriangleIcon } from "lucide-react";
import { CalendarEventPopover } from "./calendar-event-popover";

interface CalendarEventChipProps {
  event: CalendarEvent;
  orgQueryValue: string | null;
}

const categoryStyles = {
  // Provenance-based: Xero-synced leave uses sage (secondary), manual entries use lavender (accent-container).
  local_only:
    "bg-accent-container text-on-accent-container ring-accent-container/50",
  private: "bg-muted text-muted-foreground ring-muted-foreground/15",
  xero_leave: "bg-secondary text-secondary-foreground ring-secondary/50",
};

export function CalendarEventChip({
  event,
  orgQueryValue,
}: CalendarEventChipProps) {
  const isPrivate = event.recordType === "private";
  const style = isPrivate
    ? categoryStyles.private
    : categoryStyles[event.recordTypeCategory];
  const microLabel = treatmentLabel(event.renderTreatment);

  return (
    <CalendarEventPopover event={event} orgQueryValue={orgQueryValue}>
      <button
        className={cn(
          "flex w-full min-w-0 items-center gap-1.5 rounded-xl px-2 py-1 text-left text-xs ring-1 transition hover:brightness-95",
          style,
          event.renderTreatment === "dashed" &&
            "border border-dashed opacity-85",
          event.renderTreatment === "draft" && "opacity-65",
          event.renderTreatment === "failed" &&
            "bg-error-container text-destructive ring-destructive/30"
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
