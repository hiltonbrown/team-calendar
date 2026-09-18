import type { CalendarEvent } from "@repo/availability";
import { getAvailabilityRecordLabel } from "@repo/core";
import { cn } from "@repo/design-system/lib/utils";
import { AlertTriangleIcon, LeafIcon, PencilIcon } from "lucide-react";
import {
  statusToneClasses,
  toneForCalendarEvent,
} from "@/components/availability/availability-status";
import { CalendarEventPopover } from "./calendar-event-popover";
import {
  calendarEventSourceLabel,
  isManualCalendarEvent,
} from "./calendar-event-provenance";

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
  const isManual = isManualCalendarEvent(event);
  const ProvenanceIcon = isManual ? PencilIcon : LeafIcon;
  const accessibleLabel = calendarEventAccessibleLabel(event);

  return (
    <CalendarEventPopover event={event} orgQueryValue={orgQueryValue}>
      <button
        aria-label={accessibleLabel}
        className={cn(
          "flex pointer-coarse:min-h-11 w-full min-w-0 items-center gap-1.5 rounded-xl px-2 py-1 text-left text-xs ring-1 transition hover:brightness-95",
          style,
          event.renderTreatment === "dashed" &&
            "border border-dashed opacity-85",
          event.renderTreatment === "draft" && "opacity-65"
        )}
        onClick={(clickEvent) => clickEvent.stopPropagation()}
        type="button"
      >
        {event.renderTreatment === "failed" && (
          <AlertTriangleIcon aria-hidden="true" className="size-3 shrink-0" />
        )}
        <ProvenanceIcon aria-hidden="true" className="size-3 shrink-0" />
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

export function calendarEventAccessibleLabel(event: CalendarEvent): string {
  const recordType =
    event.recordType === "private"
      ? "Private"
      : getAvailabilityRecordLabel(event.recordType);
  const status =
    treatmentLabel(event.renderTreatment) ?? statusLabel(event.approvalStatus);
  return `${event.displayName}, ${recordType}. Source: ${calendarEventSourceLabel(event)}. Status: ${status}.`;
}

function statusLabel(status: CalendarEvent["approvalStatus"]): string {
  if (status === "xero_sync_failed") {
    return "Xero sync failed";
  }
  return status.charAt(0).toUpperCase() + status.slice(1);
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
