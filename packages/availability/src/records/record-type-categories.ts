import type {
  availability_record_type,
  availability_source_type,
} from "@repo/database/generated/enums";

export type RecordType = availability_record_type;
export type RecordTypeCategory = "all" | "local_only" | "xero_leave";

const recordTypes = <const T extends readonly RecordType[]>(values: T) =>
  values;

export const XERO_LEAVE_TYPES = recordTypes([
  "annual_leave",
  "personal_leave",
  "sick_leave",
  "long_service_leave",
  "unpaid_leave",
  "holiday",
]);

export const LOCAL_ONLY_TYPES = recordTypes([
  "wfh",
  "travelling",
  "client_site",
  "another_office",
  "training",
  "offsite_meeting",
  "contractor_unavailable",
  "limited_availability",
  "alternative_contact",
  "other",
]);

export const SYSTEM_RECORD_TYPES = recordTypes(["public_holiday"]);

export const LEGACY_RECORD_TYPES = recordTypes([
  "leave",
  "travel",
  "leave_request",
]);

const XERO_LEAVE_TYPE_SET = new Set<RecordType>(XERO_LEAVE_TYPES);
const LOCAL_ONLY_TYPE_SET = new Set<RecordType>(LOCAL_ONLY_TYPES);
const ALL_KNOWN_RECORD_TYPES = [
  ...XERO_LEAVE_TYPES,
  ...LOCAL_ONLY_TYPES,
  ...SYSTEM_RECORD_TYPES,
  ...LEGACY_RECORD_TYPES,
] as const;

export const USER_CREATABLE_RECORD_TYPES = [
  ...XERO_LEAVE_TYPES,
  ...LOCAL_ONLY_TYPES,
] as const;

export const sourceTypesForCategory = (
  category: RecordTypeCategory
): availability_source_type[] => {
  if (category === "xero_leave") {
    return ["xero_leave", "team_calendar_leave"];
  }
  if (category === "local_only") {
    return ["manual"];
  }
  return ["xero_leave", "team_calendar_leave", "manual"];
};

type KnownRecordType = (typeof ALL_KNOWN_RECORD_TYPES)[number];
type UnclassifiedRecordType = Exclude<RecordType, KnownRecordType>;

export const isXeroLeaveType = (recordType: RecordType): boolean =>
  XERO_LEAVE_TYPE_SET.has(recordType);

export const isLocalOnlyType = (recordType: RecordType): boolean =>
  LOCAL_ONLY_TYPE_SET.has(recordType);

export const isLegacyRecordType = (recordType: RecordType): boolean =>
  (LEGACY_RECORD_TYPES as readonly RecordType[]).includes(recordType);

export const isSystemRecordType = (recordType: RecordType): boolean =>
  (SYSTEM_RECORD_TYPES as readonly RecordType[]).includes(recordType);

export const isUserCreatableRecordType = (recordType: RecordType): boolean =>
  isXeroLeaveType(recordType) || isLocalOnlyType(recordType);

export const assertUserCreatableRecordType = (
  recordType: RecordType
): RecordType => {
  if (!isUserCreatableRecordType(recordType)) {
    throw new Error(`Record type ${recordType} is not user creatable`);
  }
  return recordType;
};

export const exhaustiveRecordTypeCheck = {} satisfies Record<
  UnclassifiedRecordType,
  never
>;
