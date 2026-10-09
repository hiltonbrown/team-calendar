import type { DashboardSection, TimelineWeek } from "@repo/availability";
import { Button } from "@repo/design-system/components/ui/button";
import Link from "next/link";
import { withOrg } from "@/lib/navigation/org-url";
import { DashboardCardError, DashboardCardShell } from "./dashboard-card-shell";
import { DashboardTimeline } from "./dashboard-timeline";
import { type TimelineRole, toTeamTimelineProps } from "./timeline-adapter";

const HEADING = "Who is in this week";

const CALENDAR_SCOPES: Record<TimelineRole, string> = {
  admin: "all_teams",
  employee: "my_self",
  manager: "my_team",
};

interface TimelineSectionProps {
  now: Date;
  orgQueryValue: string | null;
  state: DashboardSection<TimelineWeek>;
  viewerRole: TimelineRole;
}

/** "Who is in this week" heading, calendar link and the shared timeline. */
export function TimelineSection({
  now,
  orgQueryValue,
  state,
  viewerRole,
}: TimelineSectionProps) {
  if (state.status === "error") {
    return (
      <DashboardCardShell orgQueryValue={orgQueryValue} title={HEADING}>
        <DashboardCardError entityName="team timeline" />
      </DashboardCardShell>
    );
  }
  const headingId = "dashboard-timeline-heading";
  return (
    <section aria-labelledby={headingId} className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2
          className="font-semibold text-on-surface text-title-lg"
          id={headingId}
        >
          {HEADING}
        </h2>
        <Button asChild size="sm" variant="ghost">
          <Link
            href={withOrg(
              `/calendar?scopeType=${CALENDAR_SCOPES[viewerRole]}&view=week`,
              orgQueryValue
            )}
          >
            Open calendar
          </Link>
        </Button>
      </div>
      <DashboardTimeline
        {...toTeamTimelineProps(state.data, {
          orgQueryValue,
          role: viewerRole,
          today: now,
        })}
      />
    </section>
  );
}
