import type { CalendarDay, CalendarRange } from "@repo/availability";
import { AvailabilityScan } from "@/components/availability/availability-scan";
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

  return (
    <AvailabilityScan
      actionHref={withOrg(
        `/calendar?view=day&anchor=${day.date.toISOString().slice(0, 10)}`,
        orgQueryValue
      )}
      actionLabel="Open day"
      emptyDescription="No leave, manual availability, or public holidays are visible for this day."
      emptyTitle={
        day.isToday ? "No one needs attention today" : "No one needs attention"
      }
      items={scanItemsForDay(day, orgQueryValue)}
      title={scanTitle(day)}
    />
  );
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
