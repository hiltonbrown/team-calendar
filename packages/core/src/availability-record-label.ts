export const AVAILABILITY_RECORD_TYPES = [
  "leave",
  "annual_leave",
  "personal_leave",
  "holiday",
  "sick_leave",
  "long_service_leave",
  "unpaid_leave",
  "public_holiday",
  "wfh",
  "travel",
  "travelling",
  "training",
  "client_site",
  "another_office",
  "offsite_meeting",
  "contractor_unavailable",
  "limited_availability",
  "alternative_contact",
  "other",
  "leave_request",
] as const;

export type AvailabilityRecordType = (typeof AVAILABILITY_RECORD_TYPES)[number];

export const AVAILABILITY_RECORD_TYPE_LABELS: Record<
  AvailabilityRecordType,
  string
> = {
  alternative_contact: "Alternative contact",
  annual_leave: "Annual leave",
  another_office: "Another office",
  client_site: "Client site",
  contractor_unavailable: "Contractor unavailable",
  holiday: "Holiday",
  leave: "Leave",
  leave_request: "Leave request",
  limited_availability: "Limited availability",
  long_service_leave: "Long service leave",
  offsite_meeting: "Offsite meeting",
  other: "Other",
  personal_leave: "Personal leave",
  public_holiday: "Public holiday",
  sick_leave: "Sick leave",
  training: "Training",
  travel: "Travel",
  travelling: "Travelling",
  unpaid_leave: "Unpaid leave",
  wfh: "Working from home",
} as const;

export const formatAvailabilityRecordType = (
  recordType: AvailabilityRecordType
): string => AVAILABILITY_RECORD_TYPE_LABELS[recordType];

export const getAvailabilityRecordLabel = (
  recordType: AvailabilityRecordType | (string & {})
): string => {
  if (recordType in AVAILABILITY_RECORD_TYPE_LABELS) {
    return AVAILABILITY_RECORD_TYPE_LABELS[
      recordType as AvailabilityRecordType
    ];
  }
  const words = recordType.split("_").join(" ");
  return `${words.charAt(0).toUpperCase()}${words.slice(1)}`;
};
