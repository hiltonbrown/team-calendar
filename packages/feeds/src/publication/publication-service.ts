import "server-only";

import { appError, type Result } from "@repo/core";
import { database } from "@repo/database";
import type { Prisma } from "@repo/database/generated/client";
import type {
  availability_privacy_mode,
  availability_record_type,
} from "@repo/database/generated/enums";
import { projectSummaryLine } from "../projection/feed-projection";

export interface MaterialisedPublication {
  availabilityRecordId: string;
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

    const publication = await upsertPublication(database, record);
    return { ok: true, value: toMaterialisedPublication(publication) };
  } catch {
    return {
      ok: false,
      error: appError("internal", "Failed to materialise publication."),
    };
  }
}

async function upsertPublication(client: PublicationClient, record: RecordRow) {
  const published = projectPublishedRecord(record);
  const existing = record.publication;
  const publishedAt = new Date();

  if (!existing) {
    return await client.availabilityPublication.create({
      data: {
        availability_record_id: record.id,
        clerk_org_id: record.clerk_org_id,
        organisation_id: record.organisation_id,
        privacy_mode: published.privacyMode,
        published_at: publishedAt,
        published_description: published.description,
        published_sequence: 0,
        published_summary: published.summary,
        published_uid: published.uid,
      },
      select: publicationSelect,
    });
  }

  const materiallyChanged =
    existing.published_uid !== published.uid ||
    existing.published_summary !== published.summary ||
    existing.published_description !== published.description ||
    existing.privacy_mode !== published.privacyMode;

  return await client.availabilityPublication.update({
    data: {
      privacy_mode: published.privacyMode,
      published_at: materiallyChanged ? publishedAt : existing.published_at,
      published_description: published.description,
      published_sequence: materiallyChanged
        ? { increment: 1 }
        : existing.published_sequence,
      published_summary: published.summary,
      published_uid: published.uid,
    },
    select: publicationSelect,
    where: { id: existing.id },
  });
}

function projectPublishedRecord(record: RecordRow): {
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
    description: record.privacy_mode === "named" ? record.notes_internal : null,
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

function toMaterialisedPublication(
  publication: PublicationRow
): MaterialisedPublication {
  return {
    availabilityRecordId: publication.availability_record_id,
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

const recordPublicationSelect = {
  clerk_org_id: true,
  derived_uid_key: true,
  id: true,
  notes_internal: true,
  organisation_id: true,
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
    select: {
      id: true,
      privacy_mode: true,
      published_at: true,
      published_description: true,
      published_sequence: true,
      published_summary: true,
      published_uid: true,
    },
  },
} satisfies Prisma.AvailabilityRecordSelect;

type RecordRow = Prisma.AvailabilityRecordGetPayload<{
  select: typeof recordPublicationSelect;
}>;

type PublicationRow = Prisma.AvailabilityPublicationGetPayload<{
  select: typeof publicationSelect;
}>;
