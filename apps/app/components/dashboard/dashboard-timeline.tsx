"use client";

import {
  TeamTimeline,
  type TeamTimelineLinkProps,
} from "@repo/design-system/components/team-timeline/team-timeline";
import Link from "next/link";
import type { DashboardTimelineProps } from "./timeline-adapter";

function renderLink({ children, ...props }: TeamTimelineLinkProps) {
  return <Link {...props}>{children}</Link>;
}

/** Client boundary that gives the shared timeline Next.js links. */
export function DashboardTimeline(props: DashboardTimelineProps) {
  return <TeamTimeline {...props} renderLink={renderLink} />;
}
