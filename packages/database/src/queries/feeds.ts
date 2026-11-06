import type { AccountId, FeedId, OrganisationId, Result } from "@repo/core";
import { appError } from "@repo/core";
import { assertTenantDb, type TenantDb } from "../tenant-db";
import { scopedQuery } from "../tenant-query";

export interface FeedData {
  accountId: string;
  activeTokenHint: string | null;
  createdAt: Date;
  id: FeedId;
  name: string;
  organisationId: OrganisationId;
  privacyDefault: string;
  scopeType: string;
  slug: string;
  status: string;
  updatedAt: Date;
}

export interface FeedDetailData extends FeedData {
  scopes: Array<{
    id: string;
    ruleType: string;
    ruleValue: string | null;
  }>;
  tokens: Array<{
    id: string;
    status: string;
    tokenHint: string;
    expiresAt: Date | null;
    revokedAt: Date | null;
    createdAt: Date;
  }>;
}

export interface FeedPublicationData {
  availabilityRecordId: string;
  id: string;
  privacyMode: string;
  publishedAt: Date;
  publishedDescription: string | null;
  publishedSequence: number;
  publishedSummary: string;
  publishedUid: string;
}

export async function listFeedsForOrganisation(
  accountId: AccountId,
  organisationId: OrganisationId,
  db: TenantDb
): Promise<Result<FeedData[]>> {
  {
    assertTenantDb(db, accountId);
    const tenantDb2 = db;

    try {
      const feeds = await tenantDb2.feed.findMany({
        orderBy: { slug: "asc" },
        select: {
          account_id: true,
          created_at: true,
          id: true,
          name: true,
          organisation_id: true,
          privacy_mode: true,
          scopes: {
            select: {
              scope_type: true,
            },
            take: 1,
          },
          slug: true,
          status: true,
          tokens: {
            orderBy: { created_at: "desc" },
            select: { status: true, token_hint: true },
            take: 1,
          },
          updated_at: true,
        },
        where: {
          ...scopedQuery(accountId, organisationId),
        },
      });

      return {
        ok: true,
        value: feeds.map((f) => ({
          accountId: f.account_id,
          activeTokenHint:
            f.tokens.find((token) => token.status === "active")?.token_hint ??
            null,
          createdAt: f.created_at,
          id: f.id as FeedId,
          name: f.name,
          organisationId: f.organisation_id as OrganisationId,
          privacyDefault: f.privacy_mode,
          scopeType: f.scopes[0]?.scope_type ?? "org",
          slug: f.slug,
          status: f.status,
          updatedAt: f.updated_at,
        })),
      };
    } catch (error) {
      if (tenantDb2) {
        throw error;
      }
      return {
        error: appError("internal", "Failed to list feeds"),
        ok: false,
      };
    }
  }
}

export async function getFeedDetail(
  accountId: AccountId,
  organisationId: OrganisationId,
  feedId: FeedId,
  db: TenantDb
): Promise<Result<FeedDetailData>> {
  {
    assertTenantDb(db, accountId);
    const tenantDb3 = db;

    try {
      const feed = await tenantDb3.feed.findFirst({
        select: {
          account_id: true,
          created_at: true,
          id: true,
          name: true,
          organisation_id: true,
          privacy_mode: true,
          scopes: {
            select: {
              id: true,
              scope_type: true,
              scope_value: true,
            },
          },
          slug: true,
          status: true,
          tokens: {
            orderBy: { created_at: "desc" },
            select: {
              created_at: true,
              expires_at: true,
              id: true,
              revoked_at: true,
              status: true,
              token_hint: true,
            },
          },
          updated_at: true,
        },
        where: {
          ...scopedQuery(accountId, organisationId),
          id: feedId,
        },
      });

      if (!feed) {
        return {
          error: appError("not_found", "Feed not found"),
          ok: false,
        };
      }

      return {
        ok: true,
        value: {
          accountId: feed.account_id,
          activeTokenHint:
            feed.tokens.find((token) => token.status === "active")
              ?.token_hint ?? null,
          createdAt: feed.created_at,
          id: feed.id as FeedId,
          name: feed.name,
          organisationId: feed.organisation_id as OrganisationId,
          privacyDefault: feed.privacy_mode,
          scopes: feed.scopes.map((s) => ({
            id: s.id,
            ruleType: s.scope_type,
            ruleValue: s.scope_value,
          })),
          scopeType: feed.scopes[0]?.scope_type ?? "org",
          slug: feed.slug,
          status: feed.status,
          tokens: feed.tokens.map((t) => ({
            createdAt: t.created_at,
            expiresAt: t.expires_at,
            id: t.id,
            revokedAt: t.revoked_at,
            status: t.status,
            tokenHint: t.token_hint,
          })),
          updatedAt: feed.updated_at,
        },
      };
    } catch (error) {
      if (tenantDb3) {
        throw error;
      }
      return {
        error: appError("internal", "Failed to get feed detail"),
        ok: false,
      };
    }
  }
}

export async function listFeedPublications(
  accountId: AccountId,
  organisationId: OrganisationId,
  filters:
    | { dateRange?: { startDate: Date; endDate: Date }; limit?: number }
    | undefined,
  db: TenantDb
): Promise<Result<FeedPublicationData[]>> {
  {
    assertTenantDb(db, accountId);
    const tenantDb = db;

    try {
      const publications = await tenantDb.availabilityPublication.findMany({
        orderBy: { published_at: "desc" },
        select: {
          availability_record_id: true,
          id: true,
          privacy_mode: true,
          published_at: true,
          published_description: true,
          published_sequence: true,
          published_summary: true,
          published_uid: true,
        },
        take: filters?.limit ?? 50,
        where: {
          ...scopedQuery(accountId, organisationId),
          ...(filters?.dateRange && {
            published_at: {
              gte: filters.dateRange.startDate,
              lte: filters.dateRange.endDate,
            },
          }),
        },
      });

      return {
        ok: true,
        value: publications.map((p) => ({
          availabilityRecordId: p.availability_record_id,
          id: p.id,
          privacyMode: p.privacy_mode,
          publishedAt: p.published_at,
          publishedDescription: p.published_description,
          publishedSequence: p.published_sequence,
          publishedSummary: p.published_summary,
          publishedUid: p.published_uid,
        })),
      };
    } catch (error) {
      if (tenantDb) {
        throw error;
      }
      return {
        error: appError("internal", "Failed to list feed publications"),
        ok: false,
      };
    }
  }
}
