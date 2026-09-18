import type { MDXContent } from "mdx/types";
import IcsFeedsExplained, {
  metadata as icsFeedsExplainedMetadata,
} from "./ics-feeds-explained.mdx";
import IntroducingTeamCalendar, {
  metadata as introducingTeamCalendarMetadata,
} from "./introducing-teamcalendar.mdx";

export interface BlogRegistryEntry {
  readonly Component: MDXContent;
  readonly metadata: unknown;
  readonly slug: string;
}

export const blogPostRegistry: readonly BlogRegistryEntry[] = [
  {
    Component: IcsFeedsExplained,
    metadata: icsFeedsExplainedMetadata,
    slug: "ics-feeds-explained",
  },
  {
    Component: IntroducingTeamCalendar,
    metadata: introducingTeamCalendarMetadata,
    slug: "introducing-teamcalendar",
  },
];
