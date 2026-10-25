import "server-only";

import { appError, type Result } from "@repo/core";
import { assertTenantDb, type TenantDb } from "@repo/database";
import type { Prisma } from "@repo/database/generated/client";
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
  Prisma.TransactionClient,
  "availabilityPublication" | "availabilityRecord"
>;

export async function materialiseAvailabilityPublication(
  input: {
    availabilityRecordId: string;
    accountId: string;
    // Invalidate the caches of feeds whose scope includes this record's person. Defaults to
    // true so single-record callers (manual edits, approval transitions) reflect changes
    // immediately. Bulk callers (inbound sync, reconcile) pass false and batch their own
    // rebuilds to avoid per-record cache churn.
    invalidateCache?: boolean;
    organisationId: string;
  },
  db: TenantDb
): Promise<Result<MaterialisedPublication>> {
  assertTenantDb(db, input.accountId);
  const result: Result<MaterialisedPublication> = await (async () => {
    assertTenantDb(db, input.accountId);
    const tx = db;

    const record = await tx.availabilityRecord.findFirst({
      select: recordPublicationSelect,
      where: {
        account_id: input.accountId,
        id: input.availabilityRecordId,
        organisation_id: input.organisationId,
      },
    });
    if (!record) {
      return {
        error: appError("not_found", "Availability record not found."),
        ok: false,
      };
    }

    const { changed, publication } = await upsertPublication(tx, record);

    if (input.invalidateCache !== false) {
      await invalidateFeedCachesForPerson(
        {
          accountId: input.accountId,
          organisationId: input.organisationId,
          personId: record.person_id,
        },
        tx
      );
    }
    return {
      ok: true,
      value: toMaterialisedPublication(publication, {
        changed,
        personId: record.person_id,
      }),
    };
  })();
  return result;
}

async function upsertPublication(
  client: PublicationClient,
  record: RecordRow
): Promise<{ changed: boolean; publication: PublicationRow }> {
  const published = projectPublishedRecord(record);
  const publishedAt = new Date();

  let existing = record.publication;
  if (!existing) {
    // The 1:1 `availability_record_id` unique index is the atomic backstop: a
    // concurrent losing insert is skipped, reloaded and takes the update path.
    const inserted = await client.availabilityPublication.createMany({
      data: {
        account_id: record.account_id,
        availability_record_id: record.id,
        organisation_id: record.organisation_id,
        privacy_mode: published.privacyMode,
        published_all_day: published.allDay,
        published_at: publishedAt,
        published_description: published.description,
        published_ends_at: published.endsAt,
        published_sequence: 0,
        published_starts_at: published.startsAt,
        published_summary: published.summary,
        published_uid: published.uid,
      },
      skipDuplicates: true,
    });
    existing = await client.availabilityPublication.findFirst({
      select: existingPublicationSelect,
      where: {
        account_id: record.account_id,
        availability_record_id: record.id,
        organisation_id: record.organisation_id,
      },
    });
    if (!existing) {
      throw new Error("Publication was not materialised.");
    }
    if (inserted.count === 1) {
      return { changed: true, publication: existing };
    }
  }

  const materiallyChanged =
    existing.published_uid !== published.uid ||
    existing.published_summary !== published.summary ||
    existing.published_description !== published.description ||
    existing.published_all_day !== published.allDay ||
    existing.privacy_mode !== published.privacyMode ||
    existing.published_starts_at?.getTime() !== published.startsAt.getTime() ||
    existing.published_ends_at?.getTime() !== published.endsAt.getTime();

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
      published_ends_at: published.endsAt,
      published_sequence: { increment: 1 },
      published_starts_at: published.startsAt,
      published_summary: published.summary,
      published_uid: published.uid,
    },
    select: publicationSelect,
    where: {
      account_id: record.account_id,
      id: existing.id,
      organisation_id: record.organisation_id,
    },
  });
  return { changed: true, publication: updated };
}

function projectPublishedRecord(record: RecordRow): {
  allDay: boolean;
  description: string | null;
  privacyMode: availability_privacy_mode;
  summary: string;
  uid: string;
  startsAt: Date;
  endsAt: Date;
} {
  const personName =
    record.person.display_name ??
    `${record.person.first_name} ${record.person.last_name}`;
  const displayName = displayNameForPrivacy(record.privacy_mode, personName);
  const recordTypeLabel = labelForRecordType(record.record_type, record.title);

  return {
    allDay: record.all_day,
    description: null,
    endsAt: record.ends_at,
    privacyMode: record.privacy_mode,
    startsAt: record.starts_at,
    summary: projectSummaryLine({
      displayName,
      isPublicHoliday: false,
      privacyMode: record.privacy_mode,
      recordTypeLabel,
    }),
    uid: record.publication?.published_uid ?? record.derived_uid_key,
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
  availability_record_id: true,
  id: true,
  privacy_mode: true,
  published_all_day: true,
  published_at: true,
  published_description: true,
  published_ends_at: true,
  published_sequence: true,
  published_starts_at: true,
  published_summary: true,
  published_uid: true,
} satisfies Prisma.AvailabilityPublicationSelect;

const recordPublicationSelect = {
  account_id: true,
  all_day: true,
  derived_uid_key: true,
  ends_at: true,
  id: true,
  organisation_id: true,
  person: {
    select: {
      display_name: true,
      first_name: true,
      last_name: true,
    },
  },
  person_id: true,
  privacy_mode: true,
  publication: {
    select: existingPublicationSelect,
  },
  record_type: true,
  starts_at: true,
  title: true,
} satisfies Prisma.AvailabilityRecordSelect;

type RecordRow = Prisma.AvailabilityRecordGetPayload<{
  select: typeof recordPublicationSelect;
}>;

type PublicationRow = Prisma.AvailabilityPublicationGetPayload<{
  select: typeof publicationSelect;
}>;
