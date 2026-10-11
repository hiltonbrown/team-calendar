import "server-only";

import {
  type ClerkOrgId,
  getAvailabilityRecordLabel,
  type OrganisationId,
  PUBLIC_HOLIDAY_DATA_VERSION,
  type Result,
  resolvePublicHolidaysFromData,
  startOfUtcDay,
  toDateOnly,
} from "@repo/core";
import { loadHolidayResolutionData, tenantTransaction } from "@repo/database";
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
  eventClass?: "PUBLIC" | "PRIVATE";
  hasPublication?: boolean;
  isPublicHoliday: boolean;
  location: string | null;
  publishedAt?: Date;
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
  client?: Prisma.TransactionClient;
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
    if (!input.client) {
      return await tenantTransaction(input.clerkOrgId, (tx) =>
        projectFeedEvents({ ...input, client: tx })
      );
    }
    const { client } = input;
    const feed = await client.feed.findFirst({
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
      client: input.client,
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
        : await client.availabilityRecord.findMany({
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
        stricterPrivacyMode(record.privacy_mode, privacyMode),
        feed.last_rendered_at
      )
    );

    if (feed.includes_public_holidays) {
      events.push(
        ...(await projectPublicHolidays({
          clerkOrgId: input.clerkOrgId,
          client: input.client,
          horizonEnd,
          horizonStart,
          lastRenderedAt: feed.last_rendered_at,
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
  } catch (error) {
    if (input.client) {
      throw error;
    }
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
  privacyMode: availability_privacy_mode,
  lastRenderedAt: Date | null
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
    eventClass: privacyMode === "named" ? "PUBLIC" : "PRIVATE",
    hasPublication: Boolean(
      lastRenderedAt && record.created_at <= lastRenderedAt
    ),
    isPublicHoliday: false,
    location:
      privacyMode === "private" ? null : (record.person.location?.name ?? null),
    publishedAt: record.publication?.published_at ?? record.updated_at,
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
  lastRenderedAt: Date | null;
  client: Prisma.TransactionClient;
  clerkOrgId: string;
  horizonEnd: Date;
  horizonStart: Date;
  organisationId: string;
  personLocations: Map<string, { id: string } | null>;
  privacyMode: availability_privacy_mode;
}): Promise<PreviewEvent[]> {
  const data = await loadHolidayResolutionData(
    {
      clerkOrgId: input.clerkOrgId as ClerkOrgId,
      from: toDateOnly(input.horizonStart),
      organisationId: input.organisationId as OrganisationId,
      to: toDateOnly(input.horizonEnd),
    },
    input.client
  );
  if (!data) {
    return [];
  }
  // The feed covers its people's locations, plus the organisation level for
  // people without a location.
  const subjects = new Set<string | null>(
    [...input.personLocations.values()].map((location) => location?.id ?? null)
  );
  const customHolidays = new Map(
    data.customHolidays.map((holiday) => [`custom:${holiday.id}`, holiday])
  );
  const dataVersionAt = startOfUtcDay(PUBLIC_HOLIDAY_DATA_VERSION);
  const events: PreviewEvent[] = [];
  const seen = new Set<string>();
  for (const holiday of resolvePublicHolidaysFromData(data)) {
    const visible =
      holiday.classification === "non_working" || holiday.kind === "part_day";
    if (
      !(visible && subjects.has(holiday.locationId)) ||
      seen.has(holiday.key)
    ) {
      continue;
    }
    seen.add(holiday.key);
    const summary = projectSummaryLine({
      displayName: "Public holiday",
      isPublicHoliday: true,
      privacyMode: input.privacyMode,
      recordTypeLabel: holiday.name,
    });
    // Part days keep the start time in front of the usual holiday summary.
    const title = holiday.startsAt
      ? summary.replace(
          "Public holiday",
          `Public holiday from ${holiday.startsAt}`
        )
      : summary;
    const startsAt = startOfUtcDay(holiday.date);
    const endsAt = new Date(startsAt);
    endsAt.setUTCDate(endsAt.getUTCDate() + 1);
    const custom = customHolidays.get(holiday.key);
    const publishedAt = custom?.updatedAt ?? dataVersionAt;
    const firstPublishableAt = custom?.createdAt ?? publishedAt;
    // Custom holidays keep the identity they had before bundled holidays, so
    // subscribed calendars update them in place instead of re-adding them.
    const sourceRecordId = custom ? custom.id : holiday.key;
    const publishedUid = custom
      ? `${custom.id}${icsUidSuffix}`
      : `${input.organisationId}-${holiday.key}${icsUidSuffix}`;
    events.push({
      allDay: true,
      contactabilityStatus: null,
      description: null,
      displayName: title,
      endsAt,
      eventClass: input.privacyMode === "named" ? "PUBLIC" : "PRIVATE",
      hasPublication: Boolean(
        input.lastRenderedAt && firstPublishableAt <= input.lastRenderedAt
      ),
      isPublicHoliday: true,
      location: null,
      publishedAt,
      publishedSequence: 0,
      publishedUid,
      recordType: "public_holiday",
      sourceRecordId,
      startsAt,
      summary: title,
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
  last_rendered_at: true,
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
  created_at: true,
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
      published_at: true,
      published_sequence: true,
      published_uid: true,
    },
  },
  record_type: true,
  starts_at: true,
  title: true,
  updated_at: true,
} satisfies Prisma.AvailabilityRecordSelect;

type RecordRow = Prisma.AvailabilityRecordGetPayload<{
  select: typeof recordSelect;
}>;
