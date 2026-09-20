"use client";

import { cn } from "@repo/design-system/lib/utils";
import { Plus } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { withOrg } from "@/lib/navigation/org-url";

interface CalendarCreateLauncherProps {
  children?: ReactNode;
  className?: string;
  date?: Date;
  personId: string | null;
  startsAt: string;
}

const TIME_PART_PATTERN = /T(\d{2}):(\d{2})/;

function formatAccessibleStart(startsAt: string, date?: Date): string {
  const dateLabel = date
    ? new Intl.DateTimeFormat("en-AU", {
        day: "numeric",
        month: "long",
        timeZone: "UTC",
        year: "numeric",
      }).format(date)
    : formatDatePart(startsAt);
  const timeMatch = TIME_PART_PATTERN.exec(startsAt);
  // biome-ignore lint/suspicious/noUnnecessaryConditions: RegExp.exec returns null when startsAt has no time component; Biome 2.5.14 incorrectly narrows this match as non-null here.
  return timeMatch
    ? `${dateLabel} at ${timeMatch[1]}:${timeMatch[2]}`
    : dateLabel;
}

function formatDatePart(startsAt: string): string {
  const [datePart = ""] = startsAt.split("T");
  const parts = datePart.split("-");
  if (parts.length !== 3) {
    return startsAt;
  }
  const year = Number.parseInt(parts[0] ?? "0", 10);
  const month = Number.parseInt(parts[1] ?? "1", 10) - 1;
  const day = Number.parseInt(parts[2] ?? "1", 10);
  const parsedDate = new Date(Date.UTC(year, month, day));
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
    year: "numeric",
  }).format(parsedDate);
}

export function CalendarCreateLauncher({
  children,
  className,
  date,
  personId,
  startsAt,
}: CalendarCreateLauncherProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const org = searchParams.get("org");

  const navigate = () => {
    const params = new URLSearchParams({ startsAt });
    if (personId) {
      params.set("personId", personId);
    }
    router.push(withOrg(`/plans/new?${params.toString()}`, org));
  };

  const formattedStart = formatAccessibleStart(startsAt, date);
  const accessibleLabel = `Add availability for ${formattedStart}`;

  return (
    <button
      aria-label={accessibleLabel}
      className={cn(
        "inline-flex pointer-coarse:min-h-11 items-center justify-center gap-1 rounded-lg border border-border border-dashed px-2 py-1 font-medium text-label-md text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring",
        className
      )}
      onClick={navigate}
      type="button"
    >
      {children ?? (
        <>
          <Plus className="size-3.5" />
          <span>Add</span>
        </>
      )}
    </button>
  );
}
