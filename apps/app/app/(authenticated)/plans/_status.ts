import { approvalStatusLabel } from "@/components/availability/availability-status";

export type PlanStatusTone =
  | "approved"
  | "archived"
  | "declined"
  | "draft"
  | "pending"
  | "withdrawn"
  | "xero_sync_failed";

export interface PlanStatusView {
  badgeClassName: string;
  dotClassName: string;
  label: string;
  rowClassName: string;
  tone: PlanStatusTone;
}

const planStatusStyles: Record<
  PlanStatusTone,
  Omit<PlanStatusView, "label" | "tone">
> = {
  approved: {
    badgeClassName:
      "border-transparent bg-secondary text-secondary-foreground ring-1 ring-secondary/60",
    dotClassName: "bg-primary",
    rowClassName: "hover:bg-secondary/30",
  },
  archived: {
    badgeClassName:
      "border-transparent bg-surface-container-high text-on-surface-variant ring-1 ring-outline/20",
    dotClassName: "bg-outline",
    rowClassName: "opacity-80 hover:bg-surface-container-high/60",
  },
  declined: {
    badgeClassName:
      "border-transparent bg-error-container text-on-error-container ring-1 ring-destructive/25",
    dotClassName: "bg-destructive",
    rowClassName: "bg-error-container/35 hover:bg-error-container/55",
  },
  draft: {
    badgeClassName:
      "border-transparent bg-muted text-muted-foreground ring-1 ring-muted-foreground/15",
    dotClassName: "bg-muted-foreground",
    rowClassName: "hover:bg-muted/70",
  },
  pending: {
    badgeClassName:
      "border-transparent bg-accent-container text-on-accent-container ring-1 ring-on-accent-container/15",
    dotClassName: "bg-on-accent-container",
    rowClassName: "bg-accent-container/35 hover:bg-accent-container/55",
  },
  withdrawn: {
    badgeClassName:
      "border-transparent bg-surface-container-high text-on-surface-variant ring-1 ring-outline/20",
    dotClassName: "bg-outline",
    rowClassName: "hover:bg-surface-container-high/60",
  },
  xero_sync_failed: {
    badgeClassName:
      "border-transparent bg-error-container text-on-error-container ring-1 ring-destructive/30",
    dotClassName: "bg-destructive",
    rowClassName: "bg-error-container/45 hover:bg-error-container/65",
  },
};

export function planStatusForRecord(input: {
  approvalStatus: string;
  archivedAt: string | null;
}): PlanStatusView {
  const tone = planStatusToneForRecord(input);
  return {
    ...planStatusStyles[tone],
    label: planStatusLabel(input.approvalStatus, tone),
    tone,
  };
}

export function planStatusToneForRecord(input: {
  approvalStatus: string;
  archivedAt: string | null;
}): PlanStatusTone {
  if (input.archivedAt !== null) {
    return "archived";
  }
  switch (input.approvalStatus) {
    case "approved":
      return "approved";
    case "declined":
      return "declined";
    case "submitted":
      return "pending";
    case "withdrawn":
      return "withdrawn";
    case "xero_sync_failed":
      return "xero_sync_failed";
    default:
      return "draft";
  }
}

export function planStatusLabel(
  approvalStatus: string,
  tone: PlanStatusTone
): string {
  if (tone === "archived") {
    return "Archived";
  }
  return approvalStatusLabel(approvalStatus) ?? "Draft";
}

export const planStatusLegend: Array<{
  description: string;
  label: string;
  tone: PlanStatusTone;
}> = [
  {
    description: "Needs review or approval",
    label: "Pending",
    tone: "pending",
  },
  {
    description: "Ready for calendars and feeds",
    label: "Approved",
    tone: "approved",
  },
  {
    description: "Needs correction or retry",
    label: "Failed or declined",
    tone: "xero_sync_failed",
  },
  {
    description: "Not currently active",
    label: "Draft or archived",
    tone: "draft",
  },
];

export function planStatusStyle(tone: PlanStatusTone) {
  return planStatusStyles[tone];
}
