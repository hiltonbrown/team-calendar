import { withOrg } from "@/lib/navigation/org-url";
import type { CalendarFilterInput } from "../../app/(authenticated)/calendar/_schemas";

export function calendarDayHref(
  dateOnly: string,
  filters: CalendarFilterInput | undefined,
  orgQueryValue: string | null
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters ?? {})) {
    if (value === undefined) {
      continue;
    }
    for (const item of Array.isArray(value) ? value : [value]) {
      params.append(key, String(item));
    }
  }
  params.set("view", "day");
  params.set("anchor", dateOnly);
  return withOrg(`/calendar?${params.toString()}`, orgQueryValue);
}
