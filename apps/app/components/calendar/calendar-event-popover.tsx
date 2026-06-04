"use client";

import type { CalendarEvent } from "@repo/availability";
import { Button } from "@repo/design-system/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@repo/design-system/components/ui/popover";
import { AlertTriangleIcon, XIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { withOrg } from "@/lib/navigation/org-url";

interface CalendarEventPopoverProps {
  children: ReactNode;
  event: CalendarEvent;
  orgQueryValue: string | null;
}

export function CalendarEventPopover({
  children,
  event,
  orgQueryValue,
}: CalendarEventPopoverProps) {
  const recordTypeLabel =
    event.recordType === "private"
      ? "Private"
      : labelForValue(event.recordType);

  return (
    <Popover>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align="start" className="w-80 rounded-2xl p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-semibold text-foreground">{event.displayName}</p>
            <p className="text-muted-foreground text-sm">{recordTypeLabel}</p>
          </div>
          {event.renderTreatment === "failed" && (
            <AlertTriangleIcon className="size-4 text-amber-700" />
          )}
        </div>

        <dl className="mt-4 grid gap-3 text-sm">
          <Detail label="Status" value={statusLabel(event.approvalStatus)} />
          <Detail label="When" value={formatEventDateRange(event)} />
          {event.contactabilityStatus && (
            <Detail
              label="Contactability"
              value={labelForValue(event.contactabilityStatus)}
            />
          )}
          {event.notesInternal && (
            <Detail label="Notes" value={event.notesInternal} />
          )}
        </dl>

        {event.xeroWriteError && (
          <div className="mt-4 rounded-2xl bg-amber-100 p-3 text-amber-950 text-sm dark:bg-amber-950 dark:text-amber-100">
            {event.xeroWriteError}
          </div>
        )}

        <div className="mt-4 flex justify-end">
          {event.isEditableByActor ? (
            <Button asChild size="sm" variant="secondary">
              <Link href={withOrg(`/plans/${event.id}/edit`, orgQueryValue)}>
                View plan
              </Link>
            </Button>
          ) : (
            <span className="inline-flex items-center gap-2 rounded-xl bg-muted px-3 py-2 text-muted-foreground text-sm">
              <XIcon className="size-3" />
              View-only access
            </span>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
        {label}
      </dt>
      <dd className="mt-0.5 text-foreground">{value}</dd>
    </div>
  );
}

function formatEventDateRange(event: CalendarEvent): string {
  const formatter = new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const timeFormatter = new Intl.DateTimeFormat("en-AU", {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
  });
  const start = formatter.format(new Date(event.startsAt));
  const end = formatter.format(new Date(event.endsAt));
  if (!event.allDay) {
    return `${start}, ${timeFormatter.format(new Date(event.startsAt))} to ${timeFormatter.format(new Date(event.endsAt))}`;
  }
  if (start === end) {
    return start;
  }
  return `${start} to ${end}`;
}

function labelForValue(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    approved: "Approved",
    draft: "Draft",
    submitted: "Pending",
    xero_sync_failed: "Xero sync failed",
  };
  return labels[status] ?? labelForValue(status);
}
