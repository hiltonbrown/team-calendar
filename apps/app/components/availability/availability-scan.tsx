import { Badge } from "@repo/design-system/components/ui/badge";
import { cn } from "@repo/design-system/lib/utils";
import { AlertTriangleIcon, CalendarDaysIcon, ClockIcon } from "lucide-react";
import Link from "next/link";
import {
  type AvailabilityStatusItem,
  approvalStatusLabel,
  contactabilityLabel,
  statusToneClasses,
} from "./availability-status";

interface AvailabilityScanProps {
  actionHref?: string;
  actionLabel?: string;
  emptyDescription: string;
  emptyTitle: string;
  items: AvailabilityStatusItem[];
  title: string;
}

export function AvailabilityScan({
  actionHref,
  actionLabel,
  emptyDescription,
  emptyTitle,
  items,
  title,
}: AvailabilityScanProps) {
  return (
    <section className="rounded-2xl bg-muted p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-base">{title}</h2>
          <p className="mt-1 text-muted-foreground text-sm">
            {items.length > 0
              ? `${items.length} people need attention`
              : emptyTitle}
          </p>
        </div>
        {actionHref && actionLabel ? (
          <Link
            className="rounded-xl px-3 py-2 font-medium text-primary text-sm hover:bg-background"
            href={actionHref}
          >
            {actionLabel}
          </Link>
        ) : null}
      </div>

      {items.length === 0 ? (
        <div className="mt-4 rounded-2xl bg-background p-4 text-muted-foreground text-sm">
          {emptyDescription}
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          {items.map((item) => (
            <AvailabilityScanRow item={item} key={item.id} />
          ))}
        </div>
      )}
    </section>
  );
}

function AvailabilityScanRow({ item }: { item: AvailabilityStatusItem }) {
  const approval = approvalStatusLabel(item.approvalStatus);
  const contactability = contactabilityLabel(item.contactabilityStatus);
  const row = (
    <div className="flex min-w-0 flex-1 items-start gap-3">
      <span
        aria-hidden="true"
        className={cn(
          "mt-1 inline-flex size-2.5 shrink-0 rounded-full ring-2",
          item.tone === "failed" ? "bg-destructive" : "bg-current",
          statusToneClasses[item.tone]
        )}
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate font-medium text-sm">{item.name}</p>
          <Badge
            className={cn(
              "rounded-xl border-0 ring-1",
              statusToneClasses[item.tone]
            )}
            variant="secondary"
          >
            {item.tone === "failed" ? (
              <AlertTriangleIcon className="size-3" />
            ) : null}
            {item.statusLabel}
          </Badge>
        </div>
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground text-xs">
          {item.startsAt || item.endsAt ? (
            <span className="inline-flex items-center gap-1">
              <CalendarDaysIcon className="size-3" />
              {formatRange(item.startsAt, item.endsAt)}
            </span>
          ) : null}
          {approval ? (
            <span className="inline-flex items-center gap-1">
              <ClockIcon className="size-3" />
              {approval}
            </span>
          ) : null}
          {contactability ? <span>{contactability}</span> : null}
          {item.subtitle ? <span>{item.subtitle}</span> : null}
        </div>
      </div>
    </div>
  );

  const className =
    "flex min-w-0 items-start justify-between gap-3 rounded-2xl bg-background p-3 text-left";

  if (item.href) {
    return (
      <Link className={className} href={item.href}>
        {row}
      </Link>
    );
  }

  return <div className={className}>{row}</div>;
}

function formatRange(
  startsAt: Date | string | null | undefined,
  endsAt: Date | string | null | undefined
): string {
  const start = startsAt ? new Date(startsAt) : null;
  const end = endsAt ? new Date(endsAt) : null;
  const formatter = new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "short",
  });
  if (start && end) {
    const formattedStart = formatter.format(start);
    const formattedEnd = formatter.format(end);
    return formattedStart === formattedEnd
      ? formattedStart
      : `${formattedStart} to ${formattedEnd}`;
  }
  if (start) {
    return formatter.format(start);
  }
  if (end) {
    return formatter.format(end);
  }
  return "Today";
}
