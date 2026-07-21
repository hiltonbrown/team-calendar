import type { CalendarDay, CalendarRange } from "@repo/availability";
import { ArrowUpRightIcon } from "lucide-react";
import Link from "next/link";
import {
  type AvailabilityStatusItem,
  labelForValue,
  toneForCalendarEvent,
} from "@/components/availability/availability-status";
import { withOrg } from "@/lib/navigation/org-url";

interface CalendarScanPanelProps {
  data: CalendarRange;
  orgQueryValue: string | null;
}

export function CalendarScanPanel({
  data,
  orgQueryValue,
}: CalendarScanPanelProps) {
  const day = selectScanDay(data);
  if (!day) {
    return null;
  }

  const items = scanItemsForDay(day, orgQueryValue);
  const visibleItems = items.slice(0, 3);
  const remainingCount = items.length - visibleItems.length;
  const dayHref = withOrg(
    `/calendar?view=day&anchor=${day.date.toISOString().slice(0, 10)}`,
    orgQueryValue
  );

  return (
    <aside
      aria-labelledby="today-in-view-title"
      className="rounded-2xl bg-surface-container p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-base" id="today-in-view-title">
            {scanTitle(day)}
          </h2>
          <p className="mt-1 text-muted-foreground text-sm">
            {items.length === 0
              ? "No one is unavailable"
              : `${items.length} ${items.length === 1 ? "person is" : "people are"} unavailable`}
          </p>
        </div>
        <Link
          aria-label={`Open ${scanTitle(day).toLowerCase()} in day view`}
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl text-primary hover:bg-background focus-visible:outline-2 focus-visible:outline-ring"
          href={dayHref}
        >
          <ArrowUpRightIcon className="size-4" />
        </Link>
      </div>

      {visibleItems.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {visibleItems.map((item) => (
            <li key={item.id}>
              <ScanItem item={item} />
            </li>
          ))}
        </ul>
      ) : null}

      {remainingCount > 0 ? (
        <Link
          className="mt-4 block font-medium text-primary text-sm hover:underline"
          href={dayHref}
        >
          View {remainingCount} more{" "}
          {remainingCount === 1 ? "person" : "people"}
        </Link>
      ) : null}
    </aside>
  );
}

function ScanItem({ item }: { item: AvailabilityStatusItem }) {
  const content = (
    <>
      <span
        aria-hidden="true"
        className={`mt-1.5 size-2 shrink-0 rounded-full ${toneClass(item.tone)}`}
      />
      <span className="min-w-0">
        <span className="block truncate font-medium text-sm">{item.name}</span>
        <span className="block truncate text-muted-foreground text-xs">
          {item.statusLabel}
        </span>
      </span>
    </>
  );
  const className =
    "flex min-w-0 items-start gap-2 rounded-xl px-2 py-1.5 hover:bg-background";

  return item.href ? (
    <Link className={className} href={item.href}>
      {content}
    </Link>
  ) : (
    <div className={className}>{content}</div>
  );
}

function toneClass(tone: AvailabilityStatusItem["tone"]) {
  if (tone === "failed") {
    return "bg-destructive";
  }
  if (tone === "holiday") {
    return "bg-tertiary";
  }
  if (tone === "manual") {
    return "bg-accent-container";
  }
  if (tone === "leave") {
    return "bg-secondary";
  }
  return "bg-muted-foreground";
}

function selectScanDay(data: CalendarRange): CalendarDay | null {
  return (
    data.days.find((day) => day.isToday) ??
    data.days.find((day) => day.events.length > 0) ??
    data.days[0] ??
    null
  );
}

function scanItemsForDay(
  day: CalendarDay,
  orgQueryValue: string | null
): AvailabilityStatusItem[] {
  const holidayItems: AvailabilityStatusItem[] = day.publicHolidays.map(
    (holiday) => ({
      endsAt: day.date,
      id: `holiday-${holiday.name}`,
      name: holiday.name,
      startsAt: day.date,
      statusLabel: "Public holiday",
      subtitle: holiday.appliesToAllLocationsInView
        ? "All locations"
        : holiday.locationNames.join(", "),
      tone: "holiday",
    })
  );
  const eventItems: AvailabilityStatusItem[] = day.events.map((event) => ({
    approvalStatus: event.approvalStatus,
    contactabilityStatus: event.contactabilityStatus,
    endsAt: event.endsAt,
    href: withOrg(`/people/${event.personId}`, orgQueryValue),
    id: event.id,
    name: event.displayName,
    personId: event.personId,
    startsAt: event.startsAt,
    statusLabel:
      event.renderTreatment === "failed"
        ? "Xero sync failed"
        : labelForValue(event.recordType),
    subtitle: event.allDay ? "All day" : null,
    tone: toneForCalendarEvent(event),
  }));

  return [...holidayItems, ...eventItems];
}

function scanTitle(day: CalendarDay): string {
  const formatter = new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "long",
    weekday: "short",
  });
  return day.isToday ? "Today in view" : formatter.format(day.date);
}
