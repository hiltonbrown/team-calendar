import type { CalendarEvent } from "@repo/availability";
import type {
  availability_approval_status,
  availability_contactability,
} from "@repo/database/generated/enums";

export type AvailabilityStatusTone =
  | "available"
  | "failed"
  | "holiday"
  | "leave"
  | "manual"
  | "private";

export interface AvailabilityStatusItem {
  approvalStatus?: availability_approval_status | null;
  contactabilityStatus?: availability_contactability | null;
  endsAt?: Date | string | null;
  href?: string | null;
  id: string;
  name: string;
  personId?: string | null;
  startsAt?: Date | string | null;
  statusLabel: string;
  subtitle?: string | null;
  tone: AvailabilityStatusTone;
}

export const statusToneClasses: Record<AvailabilityStatusTone, string> = {
  available: "bg-muted text-muted-foreground ring-muted-foreground/15",
  failed: "bg-error-container text-destructive ring-destructive/30",
  holiday:
    "bg-accent-container text-on-accent-container ring-accent-container/60",
  leave: "bg-secondary text-secondary-foreground ring-secondary/60",
  manual:
    "bg-accent-container text-on-accent-container ring-accent-container/60",
  private: "bg-muted text-muted-foreground ring-muted-foreground/15",
};

export function toneForCalendarEvent(
  event: CalendarEvent
): AvailabilityStatusTone {
  if (event.renderTreatment === "failed") {
    return "failed";
  }
  if (event.recordType === "private") {
    return "private";
  }
  return event.recordTypeCategory === "xero_leave" ? "leave" : "manual";
}

export function toneForStatusKey(input: {
  statusKey: string;
  xeroSyncFailedCount?: number;
}): AvailabilityStatusTone {
  if ((input.xeroSyncFailedCount ?? 0) > 0) {
    return "failed";
  }
  if (input.statusKey === "available") {
    return "available";
  }
  if (input.statusKey === "on_leave" || input.statusKey === "pending_leave") {
    return "leave";
  }
  if (input.statusKey === "public_holiday") {
    return "holiday";
  }
  return "manual";
}

export function approvalStatusLabel(
  status: string | null | undefined
): string | null {
  if (!status) {
    return null;
  }
  const labels: Record<string, string> = {
    approved: "Approved",
    cancelled: "Cancelled",
    declined: "Declined",
    draft: "Draft",
    submitted: "Pending",
    withdrawn: "Withdrawn",
    xero_sync_failed: "Xero sync failed",
  };
  return labels[status] ?? labelForValue(status);
}

export function contactabilityLabel(
  status: availability_contactability | null | undefined
): string | null {
  if (!status) {
    return null;
  }
  const labels: Record<availability_contactability, string> = {
    contactable: "Contactable",
    limited: "Limited contactability",
    unavailable: "Not contactable",
    use_alternative_contact: "Use alternative contact",
  };
  return labels[status] ?? labelForValue(status);
}

export function labelForValue(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
