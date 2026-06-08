import "server-only";

import type { Result } from "@repo/core";
import { database } from "@repo/database";
import type { Prisma } from "@repo/database/generated/client";
import type {
  availability_contactability,
  availability_privacy_mode,
  availability_record_type,
} from "@repo/database/generated/enums";
import { type FeedRole, resolvePeopleForFeed } from "../scope/feed-scope";

export type FeedProjectionError =
  | { code: "feed_not_found"; message: string }
  | { code: "invalid_scope"; message: string }
  | { code: "not_authorised"; message: string }
  | { code: "unknown_error"; message: string }
  | { code: "validation_error"; message: string };

export interface PreviewEvent {
  allDay: boolean;
  contactabilityStatus: availability_contactability | null;
  description: string | null;
  displayName: string;
  endsAt: Date;
  isPublicHoliday: boolean;
  location: string | null;
  publishedSequence: number;
  publishedUid: string;
  recordType: availability_record_type | "public_holiday";
  sourceRecordId: string;
  startsAt: Date;
  summary: string;
}

export interface FeedProjectionContext {
  actingPersonId?: string | null;
  actingRole: FeedRole;
  clerkOrgId: string;
  feedId: string;
  horizonDays: number;
  organisationId: string;
  privacyMode?: availability_privacy_mode;
}

const FEED_SOURCE_TYPES = ["manual", "leavesync_leave", "xero_leave"] as const;

export async function projectFeedEvents(
  input: FeedProjectionContext
): Promise<Result<PreviewEvent[], FeedProjectionError>> {
  try {
    const feed = await database.feed.findFirst({
      where: {
        archived_at: null,
        clerk_org_id: input.clerkOrgId,
        id: input.feedId,
        organisation_id: input.organisationId,
      },
      select: feedProjectionSelect,
    });
    if (!feed) {
      return {
        ok: false,
        error: { code: "feed_not_found", message: "Feed not found." },
      };
    }

    const privacyMode = input.privacyMode ?? feed.privacy_mode;
    const peopleResult = await resolvePeopleForFeed({
      actingPersonId: input.actingPersonId ?? null,
      clerkOrgId: input.clerkOrgId,
      createdByUserId: feed.created_by_user_id,
      organisationId: input.organisationId,
      scopes: feed.scopes.map((scope) => ({
        scopeType: scope.scope_type,
        scopeValue: scope.scope_value,
      })),
    });
    if (!peopleResult.ok) {
      return { ok: false, error: peopleResult.error };
    }

    const people = peopleResult.value;
    const personIds = people.map((person) => person.id);
    const personLocations = new Map(
      people.map((person) => [person.id, person.location])
    );
    const horizonStart = new Date();
    const horizonEnd = new Date(horizonStart);
    horizonEnd.setUTCDate(horizonEnd.getUTCDate() + input.horizonDays);

    const records =
      personIds.length === 0
        ? []
        : await database.availabilityRecord.findMany({
            orderBy: [{ starts_at: "asc" }, { id: "asc" }],
            select: recordSelect,
            where: {
              approval_status: "approved",
              archived_at: null,
              clerk_org_id: input.clerkOrgId,
              ends_at: { gt: horizonStart },
              include_in_feed: true,
              organisation_id: input.organisationId,
              person_id: { in: personIds },
              publish_status: "eligible",
              source_type: { in: [...FEED_SOURCE_TYPES] },
              starts_at: { lt: horizonEnd },
            },
          });

    const events = records.map((record) =>
      projectAvailabilityRecord(record, privacyMode)
    );

    if (feed.includes_public_holidays) {
      events.push(
        ...(await projectPublicHolidays({
          clerkOrgId: input.clerkOrgId,
          horizonEnd,
          horizonStart,
          organisationId: input.organisationId,
          personLocations,
          privacyMode,
        }))
      );
    }

    return {
      ok: true,
      value: events.sort(
        (first, second) =>
          first.startsAt.getTime() - second.startsAt.getTime() ||
          first.summary.localeCompare(second.summary)
      ),
    };
  } catch {
    return {
      ok: false,
      error: {
        code: "unknown_error",
        message: "Failed to project feed events.",
      },
    };
  }
}

export function projectSummaryLine(input: {
  displayName: string;
  isPublicHoliday: boolean;
  privacyMode: availability_privacy_mode;
  recordTypeLabel: string;
}): string {
  if (input.isPublicHoliday) {
    if (input.privacyMode === "private") {
      return "Public holiday";
    }
    return `Public holiday: ${input.recordTypeLabel}`;
  }
  if (input.privacyMode === "private") {
    return "Unavailable";
  }
  return `${input.displayName}: ${input.recordTypeLabel}`;
}

function projectAvailabilityRecord(
  record: RecordRow,
  privacyMode: availability_privacy_mode
): PreviewEvent {
  const personName =
    record.person.display_name ??
    `${record.person.first_name} ${record.person.last_name}`;
  const recordTypeLabel = labelForRecordType(record.record_type, record.title);
  const displayName = displayNameForPrivacy(privacyMode, personName);
  return {
    allDay: record.all_day,
    contactabilityStatus: record.contactability,
    description: privacyMode === "named" ? record.notes_internal : null,
    displayName,
    endsAt: record.ends_at,
    isPublicHoliday: false,
    location:
      privacyMode === "private" ? null : (record.person.location?.name ?? null),
    recordType: record.record_type,
    publishedSequence:
      record.publication?.published_sequence ?? record.derived_sequence,
    publishedUid: record.publication?.published_uid ?? record.derived_uid_key,
    sourceRecordId: record.id,
    startsAt: record.starts_at,
    summary: projectSummaryLine({
      displayName,
      isPublicHoliday: false,
      privacyMode,
      recordTypeLabel,
    }),
  };
}

async function projectPublicHolidays(input: {
  clerkOrgId: string;
  horizonEnd: Date;
  horizonStart: Date;
  organisationId: string;
  personLocations: Map<
    string,
    {
      countryCode: string | null;
      id: string;
      name: string;
      regionCode: string | null;
      timezone: string | null;
    } | null
  >;
  privacyMode: availability_privacy_mode;
}): Promise<PreviewEvent[]> {
  const years = new Set([
    input.horizonStart.getUTCFullYear(),
    input.horizonEnd.getUTCFullYear(),
  ]);
  const holidayResults = await Promise.all(
    [...years].map((year) =>
      database.publicHoliday.findMany({
        include: { assignments: true, jurisdiction: true },
        orderBy: { holiday_date: "asc" },
        where: {
          clerk_org_id: input.clerkOrgId,
          holiday_date: {
            gte: new Date(Date.UTC(year, 0, 1)),
            lt: new Date(Date.UTC(year + 1, 0, 1)),
          },
          organisation_id: input.organisationId,
        },
      })
    )
  );
  const locations = [...input.personLocations.values()].filter(
    (
      location
    ): location is {
      countryCode: string | null;
      id: string;
      name: string;
      regionCode: string | null;
      timezone: string | null;
    } => Boolean(location)
  );
  const events: PreviewEvent[] = [];
  const seen = new Set<string>();
  for (const result of holidayResults) {
    for (const holiday of result) {
      if (
        holiday.archived_at ||
        holiday.holiday_date < input.horizonStart ||
        holiday.holiday_date > input.horizonEnd ||
        !locations.some((location) =>
          holidayAppliesToLocation(holiday, location)
        )
      ) {
        continue;
      }
      const key = `${holiday.id}:${holiday.holiday_date.toISOString()}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      const summary = projectSummaryLine({
        displayName: "Public holiday",
        isPublicHoliday: true,
        privacyMode: input.privacyMode,
        recordTypeLabel: holiday.name,
      });
      const endsAt = new Date(holiday.holiday_date);
      endsAt.setUTCDate(endsAt.getUTCDate() + 1);
      events.push({
        allDay: true,
        contactabilityStatus: null,
        description: null,
        displayName:
          input.privacyMode === "private"
            ? "Public holiday"
            : `Public holiday: ${holiday.name}`,
        endsAt,
        isPublicHoliday: true,
        location: null,
        recordType: "public_holiday",
        publishedSequence: 0,
        publishedUid: `${holiday.id}@ical.leavesync.app`,
        sourceRecordId: holiday.id,
        startsAt: holiday.holiday_date,
        summary,
      });
    }
  }
  return events;
}

function holidayAppliesToLocation(
  holiday: HolidayRow,
  location: {
    countryCode: string | null;
    id: string;
    regionCode: string | null;
  }
): boolean {
  const locationAssignment = holiday.assignments.find(
    (assignment) =>
      assignment.archived_at === null &&
      assignment.scope_type === "location" &&
      assignment.scope_value === location.id
  );
  if (locationAssignment) {
    return locationAssignment.day_classification === "non_working";
  }
  if (holiday.default_classification !== "non_working") {
    return false;
  }
  if (
    holiday.country_code !== "CUSTOM" &&
    location.countryCode !== holiday.country_code
  ) {
    return false;
  }
  if (holiday.region_code && holiday.region_code !== location.regionCode) {
    return false;
  }
  return true;
}

function displayNameForPrivacy(
  privacyMode: availability_privacy_mode,
  personName: string
): string {
  if (privacyMode === "private") {
    return "Unavailable";
  }
  if (privacyMode === "masked") {
    return "Team member";
  }
  return personName;
}

function labelForRecordType(
  recordType: availability_record_type,
  title: string | null
): string {
  if (title?.trim()) {
    return title.trim();
  }
  return recordType
    .split("_")
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}

const feedProjectionSelect = {
  created_by_user_id: true,
  includes_public_holidays: true,
  privacy_mode: true,
  scopes: {
    select: {
      scope_type: true,
      scope_value: true,
    },
  },
} satisfies Prisma.FeedSelect;

const recordSelect = {
  all_day: true,
  contactability: true,
  ends_at: true,
  derived_sequence: true,
  derived_uid_key: true,
  id: true,
  notes_internal: true,
  record_type: true,
  starts_at: true,
  title: true,
  publication: {
    select: {
      published_sequence: true,
      published_uid: true,
    },
  },
  person: {
    select: {
      display_name: true,
      first_name: true,
      last_name: true,
      location: {
        select: {
          name: true,
        },
      },
    },
  },
} satisfies Prisma.AvailabilityRecordSelect;

type RecordRow = Prisma.AvailabilityRecordGetPayload<{
  select: typeof recordSelect;
}>;

type HolidayRow = Prisma.PublicHolidayGetPayload<{
  include: { assignments: true; jurisdiction: true };
}>;
