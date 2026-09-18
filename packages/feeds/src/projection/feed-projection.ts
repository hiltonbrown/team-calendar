import "server-only";

import {
  getAvailabilityRecordLabel,
  holidayIsNonWorking,
  type Result,
} from "@repo/core";
import { database } from "@repo/database";
import type { Prisma } from "@repo/database/generated/client";
import type {
  availability_contactability,
  availability_privacy_mode,
  availability_record_type,
} from "@repo/database/generated/enums";
import { icsUidSuffix } from "@repo/seo/branding";
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

const FEED_SOURCE_TYPES = [
  "manual",
  "team_calendar_leave",
  "xero_leave",
] as const;

export async function projectFeedEvents(
  input: FeedProjectionContext
): Promise<Result<PreviewEvent[], FeedProjectionError>> {
  try {
    const feed = await database.feed.findFirst({
      select: feedProjectionSelect,
      where: {
        archived_at: null,
        clerk_org_id: input.clerkOrgId,
        id: input.feedId,
        organisation_id: input.organisationId,
      },
    });
    if (!feed) {
      return {
        error: { code: "feed_not_found", message: "Feed not found." },
        ok: false,
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
      return { error: peopleResult.error, ok: false };
    }

    const people = peopleResult.value;
    const personIds = people.map((person) => person.id);
    const personLocations = new Map(
      people.map((person) => [person.id, person.location])
    );
    const horizonStart = new Date();
    horizonStart.setUTCHours(0, 0, 0, 0);
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
              ends_at: { gte: horizonStart },
              include_in_feed: true,
              organisation_id: input.organisationId,
              person_id: { in: personIds },
              publish_status: "eligible",
              source_type: { in: [...FEED_SOURCE_TYPES] },
              starts_at: { lt: horizonEnd },
            },
          });

    const events = records.map((record) =>
      projectAvailabilityRecord(
        record,
        stricterPrivacyMode(record.privacy_mode, privacyMode)
      )
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
      error: {
        code: "unknown_error",
        message: "Failed to project feed events.",
      },
      ok: false,
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
  if (input.privacyMode === "masked") {
    return "Out of office";
  }
  if (input.privacyMode === "private") {
    return "Busy";
  }
  return `${input.displayName}: ${input.recordTypeLabel}`;
}

const PRIVACY_RANK: Record<availability_privacy_mode, number> = {
  masked: 1,
  named: 0,
  private: 2,
};

export function stricterPrivacyMode(
  recordMode: availability_privacy_mode,
  feedMode: availability_privacy_mode
): availability_privacy_mode {
  return PRIVACY_RANK[recordMode] >= PRIVACY_RANK[feedMode]
    ? recordMode
    : feedMode;
}

function exclusiveAllDayEnd(inclusiveEnd: Date): Date {
  return new Date(
    Date.UTC(
      inclusiveEnd.getUTCFullYear(),
      inclusiveEnd.getUTCMonth(),
      inclusiveEnd.getUTCDate() + 1
    )
  );
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
    description: null,
    displayName,
    endsAt: record.all_day
      ? exclusiveAllDayEnd(record.ends_at)
      : record.ends_at,
    isPublicHoliday: false,
    location:
      privacyMode === "private" ? null : (record.person.location?.name ?? null),
    publishedSequence:
      record.publication?.published_sequence ?? record.derived_sequence,
    publishedUid: record.publication?.published_uid ?? record.derived_uid_key,
    recordType: record.record_type,
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
  const holidays = await database.publicHoliday.findMany({
    orderBy: { holiday_date: "asc" },
    select: holidaySelect,
    where: {
      archived_at: null,
      clerk_org_id: input.clerkOrgId,
      holiday_date: {
        gte: input.horizonStart,
        lte: input.horizonEnd,
      },
      organisation_id: input.organisationId,
    },
  });
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
  for (const holiday of holidays) {
    const locationAssignments = holiday.assignments
      .filter((assignment) => assignment.scope_type === "location")
      .map((assignment) => ({
        archivedAt: assignment.archived_at,
        classification: assignment.day_classification,
        locationId: assignment.scope_value,
      }));

    if (
      !locations.some((location) =>
        holidayIsNonWorking({
          holiday: {
            archivedAt: null,
            countryCode: holiday.country_code,
            defaultClassification: holiday.default_classification,
            locationAssignments,
            regionCode: holiday.region_code,
          },
          subject: {
            countryCode: location.countryCode,
            locationId: location.id,
            regionCode: location.regionCode,
          },
        })
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
      publishedSequence: 0,
      publishedUid: `${holiday.id}${icsUidSuffix}`,
      recordType: "public_holiday",
      sourceRecordId: holiday.id,
      startsAt: holiday.holiday_date,
      summary,
    });
  }
  return events;
}

export function displayNameForPrivacy(
  privacyMode: availability_privacy_mode,
  personName: string
): string {
  if (privacyMode === "private") {
    return "Busy";
  }
  if (privacyMode === "masked") {
    return "Out of office";
  }
  return personName;
}

export function labelForRecordType(
  recordType: availability_record_type,
  title: string | null
): string {
  if (title?.trim()) {
    return title.trim();
  }
  return getAvailabilityRecordLabel(recordType);
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
  derived_sequence: true,
  derived_uid_key: true,
  ends_at: true,
  id: true,
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
  privacy_mode: true,
  publication: {
    select: {
      published_sequence: true,
      published_uid: true,
    },
  },
  record_type: true,
  starts_at: true,
  title: true,
} satisfies Prisma.AvailabilityRecordSelect;

type RecordRow = Prisma.AvailabilityRecordGetPayload<{
  select: typeof recordSelect;
}>;

const holidaySelect = {
  assignments: {
    select: {
      archived_at: true,
      day_classification: true,
      scope_type: true,
      scope_value: true,
    },
  },
  country_code: true,
  default_classification: true,
  holiday_date: true,
  id: true,
  name: true,
  region_code: true,
} satisfies Prisma.PublicHolidaySelect;
