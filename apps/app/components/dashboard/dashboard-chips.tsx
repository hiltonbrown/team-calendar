import { cn } from "@repo/design-system/lib/utils";
import {
  CalendarCheckIcon,
  CheckIcon,
  ClockIcon,
  type LucideIcon,
  PencilIcon,
  RefreshCwIcon,
  XIcon,
} from "lucide-react";
import { approvalStatusLabel } from "@/components/availability/availability-status";
import { PROVENANCE_LABELS, provenanceForSourceType } from "./dashboard-format";

const CHIP =
  "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-sm px-2 py-0.5 font-medium text-label-sm ring-1";

const STATUS_STYLES: Record<string, { className: string; icon: LucideIcon }> = {
  approved: {
    className:
      "bg-secondary text-secondary-foreground ring-secondary-foreground/30",
    icon: CheckIcon,
  },
  declined: {
    className: "bg-error-container text-destructive ring-destructive/30",
    icon: XIcon,
  },
  submitted: {
    className:
      "bg-surface-container-high text-on-surface-variant ring-on-surface-variant/30",
    icon: ClockIcon,
  },
};

const PROVENANCE_STYLES = {
  leave_request: {
    className:
      "bg-accent-container text-on-accent-container ring-on-accent-container/30",
    icon: CalendarCheckIcon,
  },
  manual: {
    className:
      "bg-accent-container text-on-accent-container ring-on-accent-container/30",
    icon: PencilIcon,
  },
  xero: {
    className:
      "bg-secondary text-secondary-foreground ring-secondary-foreground/30",
    icon: RefreshCwIcon,
  },
} as const;

/** Approval status with its icon, for example "Pending" with a clock. */
export function StatusChip({ status }: { status: string }) {
  const style = STATUS_STYLES[status];
  const Icon = style?.icon;
  return (
    <span
      className={cn(
        CHIP,
        style?.className ??
          "bg-surface-container-high text-on-surface-variant ring-on-surface-variant/30"
      )}
    >
      {Icon ? <Icon aria-hidden="true" className="size-3" /> : null}
      {approvalStatusLabel(status)}
    </span>
  );
}

/** Where a record came from: Xero, a leave request or a manual entry. */
export function ProvenanceChip({ sourceType }: { sourceType: string }) {
  const provenance = provenanceForSourceType(sourceType);
  const style = PROVENANCE_STYLES[provenance];
  const Icon = style.icon;
  return (
    <span className={cn(CHIP, style.className)}>
      <Icon aria-hidden="true" className="size-3" />
      {PROVENANCE_LABELS[provenance]}
    </span>
  );
}
