import "server-only";

import { createHash } from "node:crypto";
import type { Result } from "@repo/core";
import { tenantTransaction } from "@repo/database";
import { Prisma } from "@repo/database/generated/client";
import {
  type PreviewEvent,
  projectFeedEvents,
} from "../projection/feed-projection";

export interface FeedRepresentation {
  cacheEtag: string | null;
  events: PreviewEvent[];
  feedName: string;
  fingerprint: string;
  generation: number;
}

export interface RepresentationScope {
  clerkOrgId: string;
  feedId: string;
  organisationId: string;
}

interface RepresentationError {
  code: "not_found" | "unknown_error";
  message: string;
}

export async function establishFeedRepresentation(
  input: RepresentationScope
): Promise<Result<FeedRepresentation, RepresentationError>> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await tenantTransaction(
        input.clerkOrgId,
        async (tx) => reconcileRepresentation(tx, input),
        {
          isolationLevel: "Serializable",
          maxWait: 10_000,
          timeout: 30_000,
        }
      );
    } catch (error) {
      if (!isRetryableConflict(error) || attempt === 2) {
        return {
          error: {
            code: "unknown_error",
            message: "Failed to establish current feed publication.",
          },
          ok: false,
        };
      }
    }
  }
  return {
    error: {
      code: "unknown_error",
      message: "Feed publication changed concurrently. Please retry.",
    },
    ok: false,
  };
}

async function reconcileRepresentation(
  tx: Prisma.TransactionClient,
  input: RepresentationScope
): Promise<Result<FeedRepresentation, RepresentationError>> {
  const scope = {
    clerk_org_id: input.clerkOrgId,
    organisation_id: input.organisationId,
  };
  const feed = await tx.feed.findFirst({
    select: {
      last_etag: true,
      name: true,
      representation_generation: true,
      representation_hash: true,
    },
    where: { ...scope, archived_at: null, id: input.feedId, status: "active" },
  });
  if (!feed) {
    return {
      error: { code: "not_found", message: "Active feed not found." },
      ok: false,
    };
  }
  const projected = await projectFeedEvents({
    ...input,
    actingRole: "viewer",
    client: tx,
    horizonDays: 366,
  });
  if (!projected.ok) {
    // Aborting avoids committing a partly reconciled ledger or using a mixed read.
    throw new Error(projected.error.message);
  }
  const ledger = await tx.feedEventPublication.findMany({
    where: { ...scope, feed_id: input.feedId },
  });
  const existingBySource = new Map(ledger.map((row) => [row.source_key, row]));
  const seen = new Set<string>();
  const events: PreviewEvent[] = [];
  const now = new Date();
  for (const event of projected.value) {
    const sourceKey = `${event.isPublicHoliday ? "holiday" : "availability"}:${event.sourceRecordId}`;
    seen.add(sourceKey);
    const existing = existingBySource.get(sourceKey);
    const uid = existing?.published_uid ?? event.publishedUid;
    const representationHash = hashEventRepresentation({
      ...event,
      publishedUid: uid,
    });
    let sequence =
      existing?.published_sequence ??
      (event.hasPublication ? event.publishedSequence + 1 : 0);
    let publishedAt = existing?.published_at ?? now;
    if (!existing) {
      await tx.feedEventPublication.create({
        data: {
          ...scope,
          feed_id: input.feedId,
          present: true,
          published_at: publishedAt,
          published_sequence: sequence,
          published_uid: uid,
          representation_hash: representationHash,
          source_key: sourceKey,
        },
      });
    } else if (
      !existing.present ||
      existing.representation_hash !== representationHash
    ) {
      sequence += 1;
      publishedAt = now;
      await tx.feedEventPublication.updateMany({
        data: {
          present: true,
          published_at: publishedAt,
          published_sequence: sequence,
          representation_hash: representationHash,
        },
        where: { ...scope, feed_id: input.feedId, id: existing.id },
      });
    }
    events.push({
      ...event,
      publishedAt,
      publishedSequence: sequence,
      publishedUid: uid,
    });
  }
  await markRemovedEvents(tx, input, ledger, seen, now);
  events.sort(
    (a, b) =>
      a.startsAt.getTime() - b.startsAt.getTime() ||
      a.publishedUid.localeCompare(b.publishedUid)
  );
  const fingerprint = digest(
    JSON.stringify({
      events: events.map((event) => ({
        representation: serialisedEventFields(event),
        sequence: event.publishedSequence,
        stamp: event.publishedAt?.toISOString(),
      })),
      name: feed.name,
    })
  );
  const generation =
    feed.representation_generation +
    (feed.representation_hash === fingerprint ? 0 : 1);
  if (feed.representation_hash !== fingerprint) {
    await tx.feed.updateMany({
      data: {
        last_etag: null,
        representation_generation: generation,
        representation_hash: fingerprint,
      },
      where: { ...scope, id: input.feedId },
    });
  }
  return {
    ok: true,
    value: {
      cacheEtag:
        feed.representation_hash === fingerprint ? feed.last_etag : null,
      events,
      feedName: feed.name,
      fingerprint,
      generation,
    },
  };
}

async function markRemovedEvents(
  tx: Prisma.TransactionClient,
  input: RepresentationScope,
  ledger: Array<{ id: string; present: boolean; source_key: string }>,
  seen: Set<string>,
  now: Date
): Promise<void> {
  for (const row of ledger) {
    if (row.present && !seen.has(row.source_key)) {
      await tx.feedEventPublication.updateMany({
        data: {
          present: false,
          published_at: now,
          published_sequence: { increment: 1 },
        },
        where: {
          clerk_org_id: input.clerkOrgId,
          feed_id: input.feedId,
          id: row.id,
          organisation_id: input.organisationId,
        },
      });
    }
  }
}

export function hashEventRepresentation(event: PreviewEvent): string {
  return digest(JSON.stringify(serialisedEventFields(event)));
}

function serialisedEventFields(event: PreviewEvent) {
  return {
    allDay: event.allDay,
    class: event.eventClass ?? "PUBLIC",
    description: event.description,
    endsAt: event.endsAt.toISOString(),
    location: event.location,
    startsAt: event.startsAt.toISOString(),
    summary: event.summary,
    transparency: "OPAQUE",
    uid: event.publishedUid,
  };
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function isRetryableConflict(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2034" || error.code === "P2002")
  );
}
