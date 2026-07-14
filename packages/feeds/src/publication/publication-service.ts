import "server-only";

import { appError, type Result } from "@repo/core";
import { database } from "@repo/database";
import { Prisma } from "@repo/database/generated/client";
import type { availability_privacy_mode } from "@repo/database/generated/enums";
import { invalidateFeedCachesForPerson } from "../cache/feed-invalidation";
import {
  displayNameForPrivacy,
  labelForRecordType,
  projectSummaryLine,
} from "../projection/feed-projection";

export interface MaterialisedPublication {
  availabilityRecordId: string;
  changed: boolean;
  personId: string;
  publishedAt: Date;
  publishedDescription: string | null;
  publishedSequence: number;
  publishedSummary: string;
  publishedUid: string;
}

type PublicationClient = Pick<
  typeof database,
  "availabilityPublication" | "availabilityRecord"
>;

export async function materialiseAvailabilityPublication(input: {
  availabilityRecordId: string;
  clerkOrgId: string;
  // Invalidate the caches of feeds whose scope includes this record's person. Defaults to
  // true so single-record callers (manual edits, approval transitions) reflect changes
  // immediately. Bulk callers (inbound sync, reconcile) pass false and batch their own
  // rebuilds to avoid per-record cache churn.
  invalidateCache?: boolean;
  organisationId: string;
}): Promise<Result<MaterialisedPublication>> {
  try {
    const record = await database.availabilityRecord.findFirst({
      select: recordPublicationSelect,
      where: {
        clerk_org_id: input.clerkOrgId,
        id: input.availabilityRecordId,
        organisation_id: input.organisationId,
      },
    });
    if (!record) {
      return {
        ok: false,
        error: appError("not_found", "Availability record not found."),
      };
    }

    const { changed, publication } = await upsertPublication(database, record);

    if (input.invalidateCache !== false) {
      await invalidateRecordFeedCaches({
        clerkOrgId: input.clerkOrgId,
        organisationId: input.organisationId,
        personId: record.person_id,
      });
    }

    return {
      ok: true,
      value: toMaterialisedPublication(publication, {
        changed,
        personId: record.person_id,
      }),
    };
  } catch {
    return {
      ok: false,
      error: appError("internal", "Failed to materialise publication."),
    };
  }
}

// Cache invalidation is best-effort: the record write has already succeeded and the TTL is
// the backstop, so a failure here must never turn a successful materialisation into an error.
async function invalidateRecordFeedCaches(input: {
  clerkOrgId: string;
  organisationId: string;
  personId: string;
}): Promise<void> {
  try {
    await invalidateFeedCachesForPerson(input);
  } catch {
    // Swallow: see note above. Stale bodies expire via TTL or the next rebuild.
  }
}

async function upsertPublication(
  client: PublicationClient,
  record: RecordRow
): Promise<{ changed: boolean; publication: PublicationRow }> {
  const published = projectPublishedRecord(record);
  const publishedAt = new Date();

  let existing = record.publication;
  if (!existing) {
    try {
      const created = await client.availabilityPublication.create({
        data: {
          availability_record_id: record.id,
          clerk_org_id: record.clerk_org_id,
          organisation_id: record.organisation_id,
          privacy_mode: published.privacyMode,
          published_all_day: published.allDay,
          published_at: publishedAt,
          published_description: published.description,
          published_sequence: 0,
          published_summary: published.summary,
          published_uid: published.uid,
        },
        select: publicationSelect,
      });
      return { changed: true, publication: created };
    } catch (error) {
      if (!isUniqueConflict(error)) {
        throw error;
      }
      // A concurrent caller materialised the same record between our read and
      // this insert. Reload the winning row and fall through to the update
      // path so materialisation stays idempotent under concurrency.
      existing = await client.availabilityPublication.findUnique({
        select: existingPublicationSelect,
        where: { availability_record_id: record.id },
      });
      if (!existing) {
        throw error;
      }
    }
  }

  const materiallyChanged =
    existing.published_uid !== published.uid ||
    existing.published_summary !== published.summary ||
    existing.published_description !== published.description ||
    existing.published_all_day !== published.allDay ||
    existing.privacy_mode !== published.privacyMode;

  if (!materiallyChanged) {
    // Nothing in the published representation changed; skip the write so we do
    // not churn updated_at or add load for reconcile/materialisation jobs.
    return {
      changed: false,
      publication: {
        availability_record_id: record.id,
        published_at: existing.published_at,
        published_description: existing.published_description,
        published_sequence: existing.published_sequence,
        published_summary: existing.published_summary,
        published_uid: existing.published_uid,
      },
    };
  }

  const updated = await client.availabilityPublication.update({
    data: {
      privacy_mode: published.privacyMode,
      published_all_day: published.allDay,
      published_at: publishedAt,
      published_description: published.description,
      published_sequence: { increment: 1 },
      published_summary: published.summary,
      published_uid: published.uid,
    },
    select: publicationSelect,
    where: { id: existing.id },
  });
  return { changed: true, publication: updated };
}

// The 1:1 `availability_record_id` unique index is the atomic backstop: when two
// callers materialise the same record concurrently, the losing insert surfaces
// here as P2002 so we can reload and take the update path instead of failing.
const isUniqueConflict = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  error.code === "P2002";

function projectPublishedRecord(record: RecordRow): {
  allDay: boolean;
  description: string | null;
  privacyMode: availability_privacy_mode;
  summary: string;
  uid: string;
} {
  const personName =
    record.person.display_name ??
    `${record.person.first_name} ${record.person.last_name}`;
  const displayName = displayNameForPrivacy(record.privacy_mode, personName);
  const recordTypeLabel = labelForRecordType(record.record_type, record.title);

  return {
    allDay: record.all_day,
    description: null,
    privacyMode: record.privacy_mode,
    summary: projectSummaryLine({
      displayName,
      isPublicHoliday: false,
      privacyMode: record.privacy_mode,
      recordTypeLabel,
    }),
    uid: record.derived_uid_key,
  };
}

function toMaterialisedPublication(
  publication: PublicationRow,
  meta: { changed: boolean; personId: string }
): MaterialisedPublication {
  return {
    availabilityRecordId: publication.availability_record_id,
    changed: meta.changed,
    personId: meta.personId,
    publishedAt: publication.published_at,
    publishedDescription: publication.published_description,
    publishedSequence: publication.published_sequence,
    publishedSummary: publication.published_summary,
    publishedUid: publication.published_uid,
  };
}

const publicationSelect = {
  availability_record_id: true,
  published_at: true,
  published_description: true,
  published_sequence: true,
  published_summary: true,
  published_uid: true,
} satisfies Prisma.AvailabilityPublicationSelect;

const existingPublicationSelect = {
  id: true,
  privacy_mode: true,
  published_all_day: true,
  published_at: true,
  published_description: true,
  published_sequence: true,
  published_summary: true,
  published_uid: true,
} satisfies Prisma.AvailabilityPublicationSelect;

const recordPublicationSelect = {
  all_day: true,
  clerk_org_id: true,
  derived_uid_key: true,
  id: true,
  organisation_id: true,
  person_id: true,
  privacy_mode: true,
  record_type: true,
  title: true,
  person: {
    select: {
      display_name: true,
      first_name: true,
      last_name: true,
    },
  },
  publication: {
    select: existingPublicationSelect,
  },
} satisfies Prisma.AvailabilityRecordSelect;

type RecordRow = Prisma.AvailabilityRecordGetPayload<{
  select: typeof recordPublicationSelect;
}>;

type PublicationRow = Prisma.AvailabilityPublicationGetPayload<{
  select: typeof publicationSelect;
}>;
