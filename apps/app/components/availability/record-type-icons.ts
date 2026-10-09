import type { TimelineProvenance } from "@repo/availability";
import type { availability_record_type } from "@repo/database/generated/enums";
import type { TeamTimelineIcon } from "@repo/design-system/components/team-timeline/team-timeline";

/** "leave" resolves to the record's provenance icon. */
const RECORD_TYPE_ICONS: Record<
  availability_record_type | "private",
  TeamTimelineIcon | "leave"
> = {
  alternative_contact: "other",
  annual_leave: "leave",
  another_office: "client",
  client_site: "client",
  contractor_unavailable: "other",
  holiday: "leave",
  leave: "leave",
  leave_request: "leave",
  limited_availability: "other",
  long_service_leave: "leave",
  offsite_meeting: "client",
  other: "other",
  personal_leave: "leave",
  private: "private",
  public_holiday: "leave",
  sick_leave: "leave",
  training: "training",
  travel: "travel",
  travelling: "travel",
  unpaid_leave: "leave",
  wfh: "home",
};

const LEAVE_ICONS: Record<TimelineProvenance, TeamTimelineIcon> = {
  leave_request: "leave_request",
  manual: "other",
  xero: "xero",
};

function isKnownRecordType(
  recordType: string
): recordType is keyof typeof RECORD_TYPE_ICONS {
  return Object.hasOwn(RECORD_TYPE_ICONS, recordType);
}

/** Timeline icon for a record type, using provenance for leave types. */
export function recordTypeIcon(
  recordType: string,
  provenance: TimelineProvenance
): TeamTimelineIcon {
  const icon = isKnownRecordType(recordType)
    ? RECORD_TYPE_ICONS[recordType]
    : "other";
  return icon === "leave" ? LEAVE_ICONS[provenance] : icon;
}
