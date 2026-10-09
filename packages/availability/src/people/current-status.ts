import "server-only";

import {
  type ClerkOrgId,
  type OrganisationId,
  startOfUtcDay,
} from "@repo/core";
import { database, scopedQuery } from "@repo/database";
import type {
  availability_approval_status,
  availability_contactability,
  availability_record_type,
  availability_source_type,
} from "@repo/database/generated/enums";
import {
  type ResolvedPublicHoliday,
  resolvePublicHolidays,
} from "../holidays/resolve-public-holidays";
import {
  isXeroLeaveType,
  type RecordType,
} from "../records/record-type-categories";

export type CurrentStatusKey =
  | "alternative_contact"
  | "another_office"
  | "available"
  | "client_site"
  | "limited_availability"
  | "offsite_meeting"
  | "on_leave"
  | "other"
  | "pending_leave"
  | "public_holiday"
  | "training"
  | "travelling"
  | "wfh";

export interface CurrentStatusRecord {
  approvalStatus: availability_approval_status;
  archivedAt: Date | null;
  contactabilityStatus: availability_contactability;
  endsAt: Date;
  id: string;
  recordType: availability_record_type;
  sourceType: availability_source_type;
  startsAt: Date;
  title: string | null;
}

export interface CurrentStatusPublicHoliday {
  date: Date;
  /** Bundled reference id or "custom:<id>". */
  id: string;
  name: string;
  source: ResolvedPublicHoliday["origin"];
  type: ResolvedPublicHoliday["kind"];
}

export interface CurrentStatus {
  activePublicHoliday: CurrentStatusPublicHoliday | null;
  activeRecord: CurrentStatusRecord | null;
  approvalStatus: availability_approval_status | null;
  contactabilityStatus: availability_contactability | null;
  label: string;
  recordType: availability_record_type | null;
  statusKey: CurrentStatusKey;
}

export interface CurrentStatusPersonInput {
  locationId: string | null;
  personId: string;
}

export interface PublicHolidayApplicability {
  locationIds: Set<string>;
  unassigned: boolean;
}

const LOCAL_PRIORITY: Array<{
  label: string;
  recordTypes: availability_record_type[];
  statusKey: CurrentStatusKey;
}> = [
  {
    label: "Travelling",
    recordTypes: ["travelling"],
    statusKey: "travelling",
  },
  {
    label: "At client site",
    recordTypes: ["client_site"],
    statusKey: "client_site",
  },
  {
    label: "At another office",
    recordTypes: ["another_office"],
    statusKey: "another_office",
  },
  {
    label: "In training",
    recordTypes: ["training"],
    statusKey: "training",
  },
  {
    label: "Offsite meeting",
    recordTypes: ["offsite_meeting"],
    statusKey: "offsite_meeting",
  },
  {
    label: "Working from home",
    recordTypes: ["wfh"],
    statusKey: "wfh",
  },
  {
    label: "Limited availability",
    recordTypes: ["contractor_unavailable", "limited_availability"],
    statusKey: "limited_availability",
  },
  {
    label: "Use alternative contact",
    recordTypes: ["alternative_contact"],
    statusKey: "alternative_contact",
  },
  {
    label: "Unavailable",
    recordTypes: ["other"],
    statusKey: "other",
  },
];

export async function computeCurrentStatusForPeople(input: {
  at: Date;
  clerkOrgId: string;
  organisationId: string;
  people: CurrentStatusPersonInput[];
}): Promise<Map<string, CurrentStatus>> {
  const clerkOrgId = input.clerkOrgId as ClerkOrgId;
  const organisationId = input.organisationId as OrganisationId;
  const personIds = input.people.map((person) => person.personId);
  if (personIds.length === 0) {
    return new Map();
  }

  const locationIds = [
    ...new Set(
      input.people
        .map((person) => person.locationId)
        .filter((locationId): locationId is string => locationId !== null)
    ),
  ];

  const [locations, organisation, activeRecords] = await Promise.all([
    locationIds.length
      ? database.location.findMany({
          select: {
            country_code: true,
            id: true,
            region_code: true,
            timezone: true,
          },
          where: {
            ...scopedQuery(clerkOrgId, organisationId),
            id: { in: locationIds },
          },
        })
      : Promise.resolve([]),
    database.organisation.findFirst({
      select: {
        country_code: true,
        timezone: true,
      },
      where: {
        archived_at: null,
        clerk_org_id: clerkOrgId,
        id: organisationId,
      },
    }),
    database.availabilityRecord.findMany({
      select: {
        approval_status: true,
        archived_at: true,
        contactability: true,
        ends_at: true,
        id: true,
        person_id: true,
        record_type: true,
        source_type: true,
        starts_at: true,
        title: true,
      },
      where: {
        ...scopedQuery(clerkOrgId, organisationId),
        approval_status: { in: ["approved", "submitted"] },
        archived_at: null,
        ends_at: { gte: input.at },
        person_id: { in: personIds },
        starts_at: { lte: input.at },
      },
    }),
  ]);

  const locationsById = new Map(
    locations.map((location) => [location.id, location])
  );
  const recordsByPersonId = new Map<string, CurrentStatusRecord[]>();
  for (const record of activeRecords) {
    const records = recordsByPersonId.get(record.person_id) ?? [];
    records.push(toStatusRecord(record));
    recordsByPersonId.set(record.person_id, records);
  }

  const localDates = input.people.map((person) => {
    const location = person.locationId
      ? (locationsById.get(person.locationId) ?? null)
      : null;
    return dateOnlyInTimeZone(
      input.at,
      location?.timezone ?? organisation?.timezone ?? "UTC"
    );
  });
  const holidays = await resolveHolidaysForDates({
    clerkOrgId,
    localDates,
    organisationId,
  });

  const statuses = new Map<string, CurrentStatus>();
  for (const person of input.people) {
    const records = recordsByPersonId.get(person.personId) ?? [];
    const leaveStatus = statusFromApprovedOrPendingLeave(records);
    if (leaveStatus) {
      statuses.set(person.personId, leaveStatus);
      continue;
    }

    const location = person.locationId
      ? (locationsById.get(person.locationId) ?? null)
      : null;
    const timezone = location?.timezone ?? organisation?.timezone ?? "UTC";
    const localDate = dateOnlyInTimeZone(input.at, timezone);
    const holiday = holidayOn(holidays, localDate, person.locationId);
    statuses.set(person.personId, statusFromHolidayOrLocal(records, holiday));
  }

  return statuses;
}

export async function computePublicHolidayApplicability(input: {
  at: Date;
  clerkOrgId: string;
  locationIds: string[];
  organisationId: string;
}): Promise<PublicHolidayApplicability> {
  const clerkOrgId = input.clerkOrgId as ClerkOrgId;
  const organisationId = input.organisationId as OrganisationId;
  const [locations, organisation] = await Promise.all([
    input.locationIds.length
      ? database.location.findMany({
          select: {
            country_code: true,
            id: true,
            region_code: true,
            timezone: true,
          },
          where: {
            ...scopedQuery(clerkOrgId, organisationId),
            id: { in: input.locationIds },
          },
        })
      : Promise.resolve([]),
    database.organisation.findFirst({
      select: { country_code: true, timezone: true },
      where: {
        archived_at: null,
        clerk_org_id: clerkOrgId,
        id: organisationId,
      },
    }),
  ]);
  const subjects = [
    ...locations.map((location) => ({
      localDate: dateOnlyInTimeZone(
        input.at,
        location.timezone ?? organisation?.timezone ?? "UTC"
      ),
      locationId: location.id as string | null,
    })),
    {
      localDate: dateOnlyInTimeZone(input.at, organisation?.timezone ?? "UTC"),
      locationId: null,
    },
  ];
  const holidays = await resolveHolidaysForDates({
    clerkOrgId,
    localDates: subjects.map((subject) => subject.localDate),
    organisationId,
  });
  const applicable = new Set<string>();
  let unassigned = false;
  for (const subject of subjects) {
    const holiday = holidayOn(holidays, subject.localDate, subject.locationId);
    if (!holiday) {
      continue;
    }
    if (subject.locationId) {
      applicable.add(subject.locationId);
    } else {
      unassigned = true;
    }
  }
  return { locationIds: applicable, unassigned };
}

export async function computeCurrentStatus(input: {
  at: Date;
  clerkOrgId: string;
  locationId: string | null;
  organisationId: string;
  personId: string;
}): Promise<CurrentStatus> {
  const clerkOrgId = input.clerkOrgId as ClerkOrgId;
  const organisationId = input.organisationId as OrganisationId;
  const [location, organisation, activeRecords] = await Promise.all([
    input.locationId
      ? database.location.findFirst({
          select: {
            country_code: true,
            region_code: true,
            timezone: true,
          },
          where: {
            ...scopedQuery(clerkOrgId, organisationId),
            id: input.locationId,
          },
        })
      : Promise.resolve(null),
    database.organisation.findFirst({
      select: {
        country_code: true,
        timezone: true,
      },
      where: {
        archived_at: null,
        clerk_org_id: clerkOrgId,
        id: organisationId,
      },
    }),
    database.availabilityRecord.findMany({
      select: {
        approval_status: true,
        archived_at: true,
        contactability: true,
        ends_at: true,
        id: true,
        record_type: true,
        source_type: true,
        starts_at: true,
        title: true,
      },
      where: {
        ...scopedQuery(clerkOrgId, organisationId),
        approval_status: { in: ["approved", "submitted"] },
        archived_at: null,
        ends_at: { gte: input.at },
        person_id: input.personId,
        starts_at: { lte: input.at },
      },
    }),
  ]);

  const mappedRecords = activeRecords.map(toStatusRecord);
  const leaveStatus = statusFromApprovedOrPendingLeave(mappedRecords);
  if (leaveStatus) {
    return leaveStatus;
  }

  const timezone = location?.timezone ?? organisation?.timezone ?? "UTC";
  const localDate = dateOnlyInTimeZone(input.at, timezone);
  const holidays = await resolveHolidaysForDates({
    clerkOrgId,
    localDates: [localDate],
    organisationId,
  });
  return statusFromHolidayOrLocal(
    mappedRecords,
    holidayOn(holidays, localDate, input.locationId)
  );
}

function toStatusRecord(record: {
  approval_status: availability_approval_status;
  archived_at: Date | null;
  contactability: availability_contactability;
  ends_at: Date;
  id: string;
  record_type: availability_record_type;
  source_type: availability_source_type;
  starts_at: Date;
  title: string | null;
}): CurrentStatusRecord {
  return {
    approvalStatus: record.approval_status,
    archivedAt: record.archived_at,
    contactabilityStatus: record.contactability,
    endsAt: record.ends_at,
    id: record.id,
    recordType: record.record_type,
    sourceType: record.source_type,
    startsAt: record.starts_at,
    title: record.title,
  };
}

function statusFromRecord(
  statusKey: CurrentStatusKey,
  label: string,
  record: CurrentStatusRecord
): CurrentStatus {
  return {
    activePublicHoliday: null,
    activeRecord: record,
    approvalStatus: record.approvalStatus,
    contactabilityStatus: record.contactabilityStatus,
    label,
    recordType: record.recordType,
    statusKey,
  };
}

function statusFromApprovedOrPendingLeave(
  records: CurrentStatusRecord[]
): CurrentStatus | null {
  const approvedLeave = records.find(
    (record) =>
      record.approvalStatus === "approved" &&
      isXeroLeaveType(record.recordType as RecordType)
  );
  if (approvedLeave) {
    return statusFromRecord(
      "on_leave",
      `On ${leaveTypeLabel(approvedLeave.recordType)}`,
      approvedLeave
    );
  }

  const pendingLeave = records.find(
    (record) =>
      record.approvalStatus === "submitted" &&
      isXeroLeaveType(record.recordType as RecordType)
  );
  if (pendingLeave) {
    return statusFromRecord(
      "pending_leave",
      "Leave pending approval",
      pendingLeave
    );
  }

  return null;
}

function statusFromHolidayOrLocal(
  records: CurrentStatusRecord[],
  holiday: ResolvedPublicHoliday | null
): CurrentStatus {
  if (holiday) {
    return {
      activePublicHoliday: {
        date: startOfUtcDay(holiday.date),
        id: holiday.key,
        name: holiday.name,
        source: holiday.origin,
        type: holiday.kind,
      },
      activeRecord: null,
      approvalStatus: null,
      contactabilityStatus: null,
      label: "Public holiday",
      recordType: null,
      statusKey: "public_holiday",
    };
  }

  for (const rung of LOCAL_PRIORITY) {
    const match = records.find((record) =>
      rung.recordTypes.includes(record.recordType)
    );
    if (match) {
      return statusFromRecord(rung.statusKey, rung.label, match);
    }
  }

  return {
    activePublicHoliday: null,
    activeRecord: null,
    approvalStatus: null,
    contactabilityStatus: null,
    label: "Available",
    recordType: null,
    statusKey: "available",
  };
}

/** Resolves holidays covering every local date the lookups need, in one call. */
async function resolveHolidaysForDates(input: {
  clerkOrgId: ClerkOrgId;
  localDates: string[];
  organisationId: OrganisationId;
}): Promise<ResolvedPublicHoliday[]> {
  const sorted = [...input.localDates].sort();
  const [from] = sorted;
  const to = sorted.at(-1);
  if (!(from && to)) {
    return [];
  }
  const result = await resolvePublicHolidays({
    clerkOrgId: input.clerkOrgId,
    from,
    organisationId: input.organisationId,
    to,
  });
  if (result.ok) {
    return result.value;
  }
  // An unknown organisation has no holidays; any other failure must surface
  // rather than reporting a public holiday as an ordinary day.
  if (result.error.code === "not_found") {
    return [];
  }
  throw new Error(result.error.message);
}

/** The non-working holiday on a local date for a location (null: organisation level). */
function holidayOn(
  holidays: readonly ResolvedPublicHoliday[],
  localDate: string,
  locationId: string | null
): ResolvedPublicHoliday | null {
  return (
    holidays.find(
      (holiday) =>
        holiday.date === localDate &&
        holiday.locationId === locationId &&
        holiday.classification === "non_working"
    ) ?? null
  );
}

export function dateOnlyInTimeZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).formatToParts(date);
  const partValue = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${partValue("year")}-${partValue("month")}-${partValue("day")}`;
}

function leaveTypeLabel(recordType: availability_record_type): string {
  const labels: Partial<Record<availability_record_type, string>> = {
    annual_leave: "annual leave",
    holiday: "holiday",
    long_service_leave: "long service leave",
    personal_leave: "personal leave",
    sick_leave: "sick leave",
    unpaid_leave: "unpaid leave",
  };
  return labels[recordType] ?? "leave";
}
