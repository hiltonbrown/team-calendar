import type {
  TimelineWeek,
  TimelineWeekEntry,
  TimelineWeekRow,
} from "@repo/availability";
import {
  addDaysToDateKey,
  dateKeyInTimeZone,
  dateKeysBetween,
  dayOfWeekOfDateKey,
  getAvailabilityRecordLabel,
} from "@repo/core";
import type {
  TeamTimelineBlock,
  TeamTimelineProps,
  TeamTimelineRowProps,
  TeamTimelineTone,
} from "@repo/design-system/components/team-timeline/team-timeline";
import { recordTypeIcon } from "@/components/availability/record-type-icons";
import { publicHolidayLabel } from "@/components/calendar/public-holiday-label";
import { withOrg } from "@/lib/navigation/org-url";
import {
  dateKeyParts,
  formatDateKeyRange,
  formatDayCount,
  PROVENANCE_LABELS,
  recordDateKeys,
} from "./dashboard-format";

export type TimelineRole = "admin" | "employee" | "manager";

export type DashboardTimelineProps = Omit<TeamTimelineProps, "renderLink">;

const DASHBOARD_PATH = "/";
const PRIVATE_LABEL = "Unavailable";

const CORNER_LABELS: Record<TimelineRole, string> = {
  admin: "All teams",
  employee: "Me",
  manager: "My team",
};

interface TimelineAdapterOptions {
  orgQueryValue: string | null;
  role: TimelineRole;
  today: Date;
}

/** Display props for the shared `TeamTimeline` from the neutral week model. */
export function toTeamTimelineProps(
  week: TimelineWeek,
  options: TimelineAdapterOptions
): DashboardTimelineProps {
  const firstDay = week.days[0]?.dateKey ?? week.weekStart;
  const lastDay = week.days.at(-1)?.dateKey ?? addDaysToDateKey(firstDay, 6);
  return {
    cornerLabel: CORNER_LABELS[options.role],
    days: week.days.map((day) => {
      const parts = dateKeyParts(day.dateKey);
      return {
        dateLabel: `${parts.day} ${parts.monthShort}`,
        dow: parts.weekdayShort,
        holidayName: day.holidayName
          ? publicHolidayLabel({ name: day.holidayName, startsAt: null })
          : null,
        isToday: day.isToday,
        key: day.dateKey,
      };
    }),
    footer: timelineFooter(week, options.role),
    isCurrentWeek: week.isCurrentWeek,
    navigation: {
      nextHref: weekHref(week.nextWeekStart, options.orgQueryValue),
      previousHref: weekHref(week.previousWeekStart, options.orgQueryValue),
      todayHref: withOrg(DASHBOARD_PATH, options.orgQueryValue),
    },
    rows: week.rows.map((row) => toRow(row, week.timezone, options.role)),
    weekLabel: formatDateKeyRange(firstDay, lastDay),
    weekSub: `${weekRelativeLabel(week, options.today)} · ${dateKeyParts(firstDay).year}`,
  };
}

function weekRelativeLabel(week: TimelineWeek, today: Date): string {
  if (week.isCurrentWeek) {
    return "This week";
  }
  const todayKey = dateKeyInTimeZone(today, week.timezone);
  const currentWeekStart = addDaysToDateKey(
    todayKey,
    -((dayOfWeekOfDateKey(todayKey) + 6) % 7)
  );
  if (week.weekStart === addDaysToDateKey(currentWeekStart, -7)) {
    return "Last week";
  }
  if (week.weekStart === addDaysToDateKey(currentWeekStart, 7)) {
    return "Next week";
  }
  const parts = dateKeyParts(week.weekStart);
  return `Week of ${parts.day} ${parts.monthShort}`;
}

function weekHref(weekStart: string, orgQueryValue: string | null): string {
  return withOrg(`${DASHBOARD_PATH}?week=${weekStart}`, orgQueryValue);
}

function timelineFooter(week: TimelineWeek, role: TimelineRole): string | null {
  const shown = week.rows.length;
  const total = week.totalPeopleInScope;
  if (role === "admin") {
    if (total === 0) {
      return "No one is away this week.";
    }
    return shown < total
      ? `Showing ${shown} of ${total} people away this week.`
      : null;
  }
  if (role === "manager" && shown < total) {
    return `Showing ${shown} of ${total} people.`;
  }
  return null;
}

function toRow(
  row: TimelineWeekRow,
  timezone: string,
  role: TimelineRole
): TeamTimelineRowProps {
  const name = `${row.firstName} ${row.lastName}`.trim();
  return {
    blocks: row.entries.map((entry) => toBlock(entry, name, timezone)),
    initials:
      `${row.firstName.charAt(0)}${row.lastName.charAt(0)}`.toUpperCase(),
    isSelf: row.isSelf,
    name,
    personId: row.personId,
    secondary: secondaryLine(row, role),
  };
}

function secondaryLine(
  row: TimelineWeekRow,
  role: TimelineRole
): string | null {
  if (role !== "admin") {
    return row.jobTitle;
  }
  const parts = [row.teamName, row.locationName].filter(
    (part): part is string => Boolean(part)
  );
  return parts.length > 0 ? parts.join(", ") : null;
}

function toBlock(
  entry: TimelineWeekEntry,
  name: string,
  timezone: string
): TeamTimelineBlock {
  const { endKey, startKey } = recordDateKeys(entry, timezone);
  const dateLabel = formatDateKeyRange(startKey, endKey);
  const label = entry.isPrivate
    ? PRIVATE_LABEL
    : getAvailabilityRecordLabel(entry.recordType);
  const provenanceLabel = entry.isPrivate
    ? "Private"
    : PROVENANCE_LABELS[entry.provenance];
  return {
    ariaLabel: `${name}: ${label}, ${dateLabel}, ${provenanceLabel}`,
    dateLabel,
    dayCount: entry.dayCount,
    durationLabel: formatDayCount(dateKeysBetween(startKey, endKey).length),
    endIndex: entry.endIndex,
    icon: entry.isPrivate
      ? "private"
      : recordTypeIcon(entry.recordType, entry.provenance),
    id: entry.id,
    label,
    note: entry.isPrivate ? null : entry.note,
    provenanceLabel,
    startIndex: entry.startIndex,
    tone: blockTone(entry),
  };
}

function blockTone(entry: TimelineWeekEntry): TeamTimelineTone {
  return entry.isPrivate ? "private" : entry.provenance;
}
