import { log } from "@repo/observability/log";
import "server-only";

import { withinLimit } from "@repo/auth/server";
import type { Result } from "@repo/core";
import { database, lockPlanLimitMutations } from "@repo/database";
import type { Prisma } from "@repo/database/generated/client";
import type {
  availability_privacy_mode,
  feed_status,
} from "@repo/database/generated/enums";
import { z } from "zod";
import { invalidateFeedCache } from "./cache/feed-cache";
import {
  canViewFeed,
  createScopeRows,
  FeedScopesSchema,
  findActingPersonId,
  isAdminOrOwner,
  loadFeedScopeData,
  normaliseRole,
  type ResolvedFeedScope,
  resolveScopeRows,
  scopeSummary,
  validateScopes,
} from "./scope/feed-scope";
import { scopedFeed } from "./scope/scoped-feed";
import {
  type ActiveTokenHint,
  createInitialTokenWithClient,
  createSignedFeedToken,
  type TokenDisclosure,
  type TokenHistoryItem,
} from "./tokens/token-service";

export type FeedServiceError =
  | { code: "feed_archived"; message: string }
  | { code: "feed_not_found"; message: string }
  | { code: "invalid_scope"; message: string }
  | { code: "invalid_status_transition"; message: string }
  | { code: "not_authorised"; message: string }
  | { code: "unknown_error"; message: string }
  | { code: "validation_error"; message: string };

export interface FeedListItem {
  activeTokenHint: ActiveTokenHint | null;
  createdAt: Date;
  description: string | null;
  id: string;
  includesPublicHolidays: boolean;
  lastRenderedAt: Date | null;
  name: string;
  privacyMode: availability_privacy_mode;
  scopeCount: number;
  scopeSummary: string;
  status: feed_status;
  subscribeUrl: string | null;
}

export interface FeedDetail {
  activeTokenHint: ActiveTokenHint | null;
  archivedAt: Date | null;
  createdAt: Date;
  description: string | null;
  id: string;
  includesPublicHolidays: boolean;
  lastEtag: string | null;
  lastRenderedAt: Date | null;
  name: string;
  privacyMode: availability_privacy_mode;
  scopeSummary: string;
  scopes: ResolvedFeedScope[];
  status: feed_status;
  subscribeUrl: string | null;
  tokenHistory: TokenHistoryItem[];
  updatedAt: Date;
}

export interface DashboardFeedSummary {
  activeCount: number;
  lastRenderedAt: Date | null;
  pausedCount: number;
}

const PrivacyModeSchema = z.enum(["named", "masked", "private"]);
const RoleSchema = z.string().min(1).transform(normaliseRole);

const CreateFeedSchema = z.object({
  actingRole: RoleSchema,
  actingUserId: z.string().min(1),
  clerkOrgId: z.string().min(1),
  description: z.string().trim().max(500).optional(),
  includesPublicHolidays: z.boolean().default(false),
  name: z.string().trim().min(1).max(120),
  organisationId: z.string().uuid(),
  privacyMode: PrivacyModeSchema,
  scopes: FeedScopesSchema,
});

const DefaultCalendarFeedSchema = z.object({
  actingUserId: z.string().min(1).optional().nullable(),
  clerkOrgId: z.string().min(1),
  includesPublicHolidays: z.boolean().default(false),
  name: z.string().trim().min(1).max(120).default("All staff"),
  organisationId: z.string().uuid(),
  privacyMode: PrivacyModeSchema.default("named"),
});

const UpdateFeedSchema = z.object({
  actingRole: RoleSchema,
  actingUserId: z.string().min(1),
  clerkOrgId: z.string().min(1),
  feedId: z.string().uuid(),
  organisationId: z.string().uuid(),
  patch: z
    .object({
      description: z.string().trim().max(500).nullable().optional(),
      includesPublicHolidays: z.boolean().optional(),
      name: z.string().trim().min(1).max(120).optional(),
      privacyMode: PrivacyModeSchema.optional(),
      scopes: FeedScopesSchema.optional(),
    })
    .refine((value) => Object.keys(value).length > 0, {
      message: "Choose at least one feed change.",
    }),
});

const FeedCommandSchema = z.object({
  actingRole: RoleSchema,
  actingUserId: z.string().min(1),
  clerkOrgId: z.string().min(1),
  feedId: z.string().uuid(),
  organisationId: z.string().uuid(),
});

const ListFeedsSchema = z.object({
  actingPersonId: z.string().uuid().nullable().optional(),
  actingRole: RoleSchema,
  actingUserId: z.string().min(1),
  clerkOrgId: z.string().min(1),
  filters: z
    .object({
      privacyMode: z.array(PrivacyModeSchema).optional(),
      search: z.string().trim().max(200).optional(),
      status: z
        .array(z.enum(["active", "paused", "archived"]))
        .default(["active", "paused"]),
    })
    .default({ status: ["active", "paused"] }),
  organisationId: z.string().uuid(),
  pagination: z
    .object({
      cursor: z.string().uuid().nullable().optional(),
      pageSize: z.number().int().min(1).max(100).default(50),
    })
    .default({ pageSize: 50 }),
});

const DetailSchema = z.object({
  actingPersonId: z.string().uuid().nullable().optional(),
  actingRole: RoleSchema,
  actingUserId: z.string().min(1),
  clerkOrgId: z.string().min(1),
  feedId: z.string().uuid(),
  organisationId: z.string().uuid(),
});

const DashboardSummarySchema = z.object({
  actingRole: RoleSchema,
  actingUserId: z.string().min(1),
  clerkOrgId: z.string().min(1),
  organisationId: z.string().uuid(),
});

class RollbackError extends Error {
  readonly serviceError: FeedServiceError;

  constructor(serviceError: FeedServiceError) {
    super(serviceError.message);
    this.serviceError = serviceError;
  }
}

const assertWithinFeedLimit = async (
  tx: Prisma.TransactionClient,
  input: { clerkOrgId: string; organisationId: string }
): Promise<void> => {
  const entitlement = await withinLimit(
    input.clerkOrgId,
    input.organisationId,
    "feeds",
    tx
  );
  if (!entitlement.ok) {
    throw new RollbackError({
      code: "unknown_error",
      message: entitlement.error.message,
    });
  }
  if (!entitlement.value.allowed) {
    throw new RollbackError({
      code: "validation_error",
      message: "Your current plan has reached its active feed limit.",
    });
  }
};

const enforceFeedLimit = async (
  tx: Prisma.TransactionClient,
  input: { clerkOrgId: string; organisationId: string }
): Promise<void> => {
  await lockPlanLimitMutations(tx, input.clerkOrgId);
  await assertWithinFeedLimit(tx, input);
};

export async function createFeed(
  input: unknown
): Promise<
  Result<{ feedId: string; token: TokenDisclosure }, FeedServiceError>
> {
  const parsed = CreateFeedSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error);
  }
  if (!isAdminOrOwner(parsed.data.actingRole)) {
    return notAuthorised();
  }

  const scopes = await validateScopes(parsed.data);
  if (!scopes.ok) {
    return { error: scopes.error, ok: false };
  }

  try {
    const result = await database.$transaction(async (tx) => {
      await enforceFeedLimit(tx, parsed.data);
      const slug = await makeUniqueSlug(tx, parsed.data, parsed.data.name);
      const feed = await tx.feed.create({
        data: {
          clerk_org_id: parsed.data.clerkOrgId,
          created_by_user_id: parsed.data.actingUserId,
          description: emptyToNull(parsed.data.description),
          includes_public_holidays: parsed.data.includesPublicHolidays,
          name: parsed.data.name,
          organisation_id: parsed.data.organisationId,
          privacy_mode: parsed.data.privacyMode,
          scopes: {
            create: createScopeRows({
              clerkOrgId: parsed.data.clerkOrgId,
              organisationId: parsed.data.organisationId,
              scopes: scopes.value,
            }),
          },
          slug,
          status: "active",
        },
        select: { id: true },
      });

      const token = await createInitialTokenWithClient(tx, {
        actingUserId: parsed.data.actingUserId,
        clerkOrgId: parsed.data.clerkOrgId,
        feedId: feed.id,
        organisationId: parsed.data.organisationId,
      });
      if (!token.ok) {
        throw new RollbackError(mapTokenError(token.error));
      }

      await auditFeed(tx, parsed.data, "feeds.created", feed.id, {
        actingUserId: parsed.data.actingUserId,
        feedId: feed.id,
        name: parsed.data.name,
        privacyMode: parsed.data.privacyMode,
        scopeCount: scopes.value.length,
      });

      return { feedId: feed.id, token: token.value };
    });

    await invalidateFeedCache({ feedId: result.feedId });
    return { ok: true, value: result };
  } catch (error) {
    if (error instanceof RollbackError) {
      return { error: error.serviceError, ok: false };
    }
    return unknownError("Failed to create feed.");
  }
}

export async function ensureDefaultCalendarFeed(
  input: unknown
): Promise<
  Result<
    { created: boolean; feedId: string; token?: TokenDisclosure },
    FeedServiceError
  >
> {
  const parsed = DefaultCalendarFeedSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error);
  }

  const actingUserId =
    parsed.data.actingUserId ?? "system:default-calendar-feed";
  try {
    const result = await database.$transaction(async (tx) => {
      await lockPlanLimitMutations(tx, parsed.data.clerkOrgId);
      const existing = await tx.feed.findFirst({
        orderBy: { created_at: "asc" },
        select: { id: true },
        where: {
          clerk_org_id: parsed.data.clerkOrgId,
          organisation_id: parsed.data.organisationId,
        },
      });
      if (existing) {
        return { created: false, feedId: existing.id };
      }

      await assertWithinFeedLimit(tx, parsed.data);
      const slug = await makeUniqueSlug(tx, parsed.data, parsed.data.name);
      const feed = await tx.feed.create({
        data: {
          clerk_org_id: parsed.data.clerkOrgId,
          created_by_user_id: parsed.data.actingUserId ?? null,
          includes_public_holidays: parsed.data.includesPublicHolidays,
          name: parsed.data.name,
          organisation_id: parsed.data.organisationId,
          privacy_mode: parsed.data.privacyMode,
          scopes: {
            create: createScopeRows({
              clerkOrgId: parsed.data.clerkOrgId,
              organisationId: parsed.data.organisationId,
              scopes: [{ scopeType: "org", scopeValue: null }],
            }),
          },
          slug,
          status: "active",
        },
        select: { id: true },
      });

      const token = await createInitialTokenWithClient(tx, {
        actingUserId,
        clerkOrgId: parsed.data.clerkOrgId,
        feedId: feed.id,
        organisationId: parsed.data.organisationId,
      });
      if (!token.ok) {
        throw new RollbackError(mapTokenError(token.error));
      }

      await auditFeed(
        tx,
        {
          actingUserId,
          clerkOrgId: parsed.data.clerkOrgId,
          organisationId: parsed.data.organisationId,
        },
        "feeds.created",
        feed.id,
        {
          defaultFeed: true,
          feedId: feed.id,
          name: parsed.data.name,
          privacyMode: parsed.data.privacyMode,
          scopeCount: 1,
        }
      );

      return { created: true, feedId: feed.id, token: token.value };
    });

    if (result.created) {
      await invalidateFeedCache({ feedId: result.feedId });
    }
    return { ok: true, value: result };
  } catch (error) {
    if (error instanceof RollbackError) {
      return { error: error.serviceError, ok: false };
    }
    return unknownError("Failed to create default feed.");
  }
}

export async function updateFeed(
  input: unknown
): Promise<Result<FeedDetail, FeedServiceError>> {
  const parsed = UpdateFeedSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error);
  }
  if (!isAdminOrOwner(parsed.data.actingRole)) {
    return notAuthorised();
  }

  const scopes = parsed.data.patch.scopes
    ? await validateScopes({
        clerkOrgId: parsed.data.clerkOrgId,
        organisationId: parsed.data.organisationId,
        scopes: parsed.data.patch.scopes,
      })
    : null;
  if (scopes && !scopes.ok) {
    return { error: scopes.error, ok: false };
  }

  try {
    const invalidate = Boolean(
      parsed.data.patch.privacyMode ||
        parsed.data.patch.includesPublicHolidays !== undefined ||
        parsed.data.patch.scopes
    );
    await database.$transaction(async (tx) => {
      const feed = await loadFeedForUpdate(tx, parsed.data);
      if (!feed.ok) {
        throw new RollbackError(feed.error);
      }

      const updateData: Prisma.FeedUpdateInput = {};
      const changedFields: Record<string, string | number | boolean | null> =
        {};
      if (parsed.data.patch.name !== undefined) {
        updateData.name = parsed.data.patch.name;
        changedFields.name = parsed.data.patch.name;
      }
      if (parsed.data.patch.description !== undefined) {
        updateData.description = emptyToNull(parsed.data.patch.description);
        changedFields.description = emptyToNull(parsed.data.patch.description);
      }
      if (parsed.data.patch.privacyMode !== undefined) {
        updateData.privacy_mode = parsed.data.patch.privacyMode;
        changedFields.privacyMode = parsed.data.patch.privacyMode;
      }
      if (parsed.data.patch.includesPublicHolidays !== undefined) {
        updateData.includes_public_holidays =
          parsed.data.patch.includesPublicHolidays;
        changedFields.includesPublicHolidays =
          parsed.data.patch.includesPublicHolidays;
      }
      await tx.feed.update({
        data: updateData,
        where: { id: parsed.data.feedId },
      });
      if (scopes?.ok) {
        await tx.feedScope.deleteMany({
          where: {
            clerk_org_id: parsed.data.clerkOrgId,
            feed_id: parsed.data.feedId,
            organisation_id: parsed.data.organisationId,
          },
        });
        await tx.feedScope.createMany({
          data: createScopeRows({
            clerkOrgId: parsed.data.clerkOrgId,
            organisationId: parsed.data.organisationId,
            scopes: scopes.value,
          }).map((scope) => ({ ...scope, feed_id: parsed.data.feedId })),
        });
        changedFields.scopeCount = scopes.value.length;
      }
      await auditFeed(tx, parsed.data, "feeds.updated", parsed.data.feedId, {
        actingUserId: parsed.data.actingUserId,
        feedId: parsed.data.feedId,
        ...changedFields,
      });
    });

    if (invalidate) {
      await invalidateFeedCache({ feedId: parsed.data.feedId });
    }
    return await getFeedDetail(parsed.data);
  } catch (error) {
    if (error instanceof RollbackError) {
      return { error: error.serviceError, ok: false };
    }
    return unknownError("Failed to update feed.");
  }
}

export const pauseFeed = (input: unknown) =>
  transitionFeed(input, "active", "paused", "feeds.paused");

export const resumeFeed = (input: unknown) =>
  transitionFeed(input, "paused", "active", "feeds.resumed");

export async function archiveFeed(
  input: unknown
): Promise<Result<FeedDetail, FeedServiceError>> {
  const parsed = FeedCommandSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error);
  }
  if (!isAdminOrOwner(parsed.data.actingRole)) {
    return notAuthorised();
  }

  try {
    await database.$transaction(async (tx) => {
      const feed = await loadFeedForUpdate(tx, parsed.data);
      if (!feed.ok) {
        throw new RollbackError(feed.error);
      }
      await tx.feed.update({
        data: { archived_at: new Date(), status: "archived" },
        where: { id: parsed.data.feedId },
      });
      await tx.feedToken.updateMany({
        data: { revoked_at: new Date(), status: "revoked" },
        where: {
          clerk_org_id: parsed.data.clerkOrgId,
          feed_id: parsed.data.feedId,
          organisation_id: parsed.data.organisationId,
          status: "active",
        },
      });
      await auditFeed(tx, parsed.data, "feeds.archived", parsed.data.feedId, {
        actingUserId: parsed.data.actingUserId,
        feedId: parsed.data.feedId,
      });
    });
    await invalidateFeedCache({ feedId: parsed.data.feedId });
    return await getFeedDetail(parsed.data);
  } catch (error) {
    if (error instanceof RollbackError) {
      return { error: error.serviceError, ok: false };
    }
    return unknownError("Failed to archive feed.");
  }
}

export async function restoreFeed(
  input: unknown
): Promise<Result<FeedDetail, FeedServiceError>> {
  const parsed = FeedCommandSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error);
  }
  if (!isAdminOrOwner(parsed.data.actingRole)) {
    return notAuthorised();
  }

  try {
    const existing = await database.feed.findFirst({
      select: { status: true },
      where: scopedFeed(parsed.data),
    });
    if (!existing) {
      return await feedNotFound(parsed.data);
    }
    if (existing.status !== "archived") {
      return invalidTransition();
    }
    await database.$transaction(async (tx) => {
      await tx.feed.update({
        data: { archived_at: null, status: "paused" },
        where: { id: parsed.data.feedId },
      });
      await auditFeed(tx, parsed.data, "feeds.restored", parsed.data.feedId, {
        actingUserId: parsed.data.actingUserId,
        feedId: parsed.data.feedId,
      });
    });
    await invalidateFeedCache({ feedId: parsed.data.feedId });
    return await getFeedDetail(parsed.data);
  } catch {
    return unknownError("Failed to restore feed.");
  }
}

export async function listFeeds(
  input: unknown
): Promise<Result<FeedListItem[], FeedServiceError>> {
  const parsed = ListFeedsSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error);
  }

  try {
    const role = parsed.data.actingRole;
    const actingPersonId =
      parsed.data.actingPersonId ??
      (await findActingPersonId({
        clerkOrgId: parsed.data.clerkOrgId,
        organisationId: parsed.data.organisationId,
        userId: parsed.data.actingUserId,
      }));
    const statuses = isAdminOrOwner(role)
      ? parsed.data.filters.status
      : parsed.data.filters.status.filter((status) => status !== "archived");
    const feeds = await database.feed.findMany({
      cursor: parsed.data.pagination.cursor
        ? { id: parsed.data.pagination.cursor }
        : undefined,
      orderBy: [{ created_at: "desc" }, { id: "asc" }],
      select: feedListSelect,
      skip: parsed.data.pagination.cursor ? 1 : 0,
      take: parsed.data.pagination.pageSize,
      where: {
        clerk_org_id: parsed.data.clerkOrgId,
        name: parsed.data.filters.search
          ? { contains: parsed.data.filters.search, mode: "insensitive" }
          : undefined,
        organisation_id: parsed.data.organisationId,
        privacy_mode: parsed.data.filters.privacyMode?.length
          ? { in: parsed.data.filters.privacyMode }
          : undefined,
        status: { in: statuses },
      },
    });

    const scopeData =
      feeds.length > 0
        ? await loadFeedScopeData({
            clerkOrgId: parsed.data.clerkOrgId,
            organisationId: parsed.data.organisationId,
          })
        : null;
    if (scopeData && !scopeData.ok) {
      return { error: scopeData.error, ok: false };
    }
    const preloadedScopeData = scopeData ? scopeData.value : undefined;

    const visibleItems: FeedListItem[] = [];
    for (const feed of feeds) {
      const scopes = feed.scopes.map((scope) => ({
        scopeType: scope.scope_type,
        scopeValue: scope.scope_value,
      }));
      const visible = await canViewFeed({
        actingPersonId,
        clerkOrgId: parsed.data.clerkOrgId,
        createdByUserId: feed.created_by_user_id,
        organisationId: parsed.data.organisationId,
        preloaded: preloadedScopeData,
        role,
        scopes,
      });
      if (!(visible.ok && visible.value)) {
        continue;
      }
      const labels = await resolveScopeRows({
        clerkOrgId: parsed.data.clerkOrgId,
        organisationId: parsed.data.organisationId,
        preloaded: preloadedScopeData,
        scopes: feed.scopes,
      });
      visibleItems.push({
        activeTokenHint: activeToken(feed.tokens),
        createdAt: feed.created_at,
        description: truncate(feed.description),
        id: feed.id,
        includesPublicHolidays: feed.includes_public_holidays,
        lastRenderedAt: feed.last_rendered_at,
        name: feed.name,
        privacyMode: feed.privacy_mode,
        scopeCount: feed.scopes.length,
        scopeSummary: scopeSummary(
          scopes,
          labels.ok ? labels.value : undefined
        ),
        status: feed.status,
        subscribeUrl: activeSubscribeUrl(feed.tokens),
      });
    }
    return { ok: true, value: visibleItems };
  } catch {
    return unknownError("Failed to list feeds.");
  }
}

export async function getFeedDetail(
  input: unknown
): Promise<Result<FeedDetail, FeedServiceError>> {
  const parsed = DetailSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error);
  }

  try {
    const role = parsed.data.actingRole;
    const actingPersonId =
      parsed.data.actingPersonId ??
      (await findActingPersonId({
        clerkOrgId: parsed.data.clerkOrgId,
        organisationId: parsed.data.organisationId,
        userId: parsed.data.actingUserId,
      }));
    const feed = await database.feed.findFirst({
      select: feedDetailSelect,
      where: scopedFeed(parsed.data),
    });
    if (!feed) {
      return await feedNotFound(parsed.data);
    }

    const scopes = feed.scopes.map((scope) => ({
      scopeType: scope.scope_type,
      scopeValue: scope.scope_value,
    }));
    const visible = await canViewFeed({
      actingPersonId,
      clerkOrgId: parsed.data.clerkOrgId,
      createdByUserId: feed.created_by_user_id,
      organisationId: parsed.data.organisationId,
      role,
      scopes,
    });
    if (!visible.ok) {
      return { error: visible.error, ok: false };
    }
    if (!visible.value) {
      return notAuthorised();
    }

    const resolvedScopes = await resolveScopeRows({
      clerkOrgId: parsed.data.clerkOrgId,
      organisationId: parsed.data.organisationId,
      scopes: feed.scopes,
    });
    if (!resolvedScopes.ok) {
      return { error: resolvedScopes.error, ok: false };
    }

    return {
      ok: true,
      value: {
        activeTokenHint: activeToken(feed.tokens),
        archivedAt: feed.archived_at,
        createdAt: feed.created_at,
        description: feed.description,
        id: feed.id,
        includesPublicHolidays: feed.includes_public_holidays,
        lastEtag: feed.last_etag,
        lastRenderedAt: feed.last_rendered_at,
        name: feed.name,
        privacyMode: feed.privacy_mode,
        scopeSummary: scopeSummary(scopes, resolvedScopes.value),
        scopes: resolvedScopes.value,
        status: feed.status,
        subscribeUrl: activeSubscribeUrl(feed.tokens),
        tokenHistory: feed.tokens.slice(0, 5).map(toTokenHistoryItem),
        updatedAt: feed.updated_at,
      },
    };
  } catch {
    return unknownError("Failed to load feed detail.");
  }
}

export async function getFeedSummaryForDashboard(
  input: unknown
): Promise<Result<DashboardFeedSummary, FeedServiceError>> {
  const parsed = DashboardSummarySchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error);
  }
  if (!isAdminOrOwner(parsed.data.actingRole)) {
    return notAuthorised();
  }

  try {
    const [activeFeeds, pausedCount] = await Promise.all([
      database.feed.findMany({
        orderBy: [{ last_rendered_at: "desc" }, { id: "asc" }],
        select: { id: true, last_rendered_at: true },
        where: {
          clerk_org_id: parsed.data.clerkOrgId,
          organisation_id: parsed.data.organisationId,
          status: "active",
        },
      }),
      database.feed.count({
        where: {
          clerk_org_id: parsed.data.clerkOrgId,
          organisation_id: parsed.data.organisationId,
          status: "paused",
        },
      }),
    ]);

    return {
      ok: true,
      value: {
        activeCount: activeFeeds.length,
        lastRenderedAt: activeFeeds[0]?.last_rendered_at ?? null,
        pausedCount,
      },
    };
  } catch {
    return unknownError("Failed to load feed dashboard summary.");
  }
}

async function transitionFeed(
  input: unknown,
  fromStatus: feed_status,
  toStatus: feed_status,
  auditAction: string
): Promise<Result<FeedDetail, FeedServiceError>> {
  const parsed = FeedCommandSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error);
  }
  if (!isAdminOrOwner(parsed.data.actingRole)) {
    return notAuthorised();
  }

  try {
    const existing = await database.feed.findFirst({
      select: { archived_at: true, status: true },
      where: scopedFeed(parsed.data),
    });
    if (!existing) {
      return await feedNotFound(parsed.data);
    }
    if (existing.status === "archived" || existing.archived_at) {
      return feedArchived();
    }
    if (existing.status !== fromStatus) {
      return invalidTransition();
    }
    await database.$transaction(async (tx) => {
      await tx.feed.update({
        data: { status: toStatus },
        where: { id: parsed.data.feedId },
      });
      await auditFeed(tx, parsed.data, auditAction, parsed.data.feedId, {
        actingUserId: parsed.data.actingUserId,
        feedId: parsed.data.feedId,
      });
    });
    await invalidateFeedCache({ feedId: parsed.data.feedId });
    return await getFeedDetail(parsed.data);
  } catch {
    return unknownError("Failed to update feed status.");
  }
}

async function loadFeedForUpdate(
  tx: Prisma.TransactionClient,
  input: { clerkOrgId: string; feedId: string; organisationId: string }
): Promise<Result<{ id: string }, FeedServiceError>> {
  const feed = await tx.feed.findFirst({
    select: { archived_at: true, id: true, status: true },
    where: scopedFeed(input),
  });
  if (!feed) {
    return await feedNotFound(input);
  }
  if (feed.status === "archived" || feed.archived_at) {
    return feedArchived();
  }
  return { ok: true, value: { id: feed.id } };
}

async function makeUniqueSlug(
  tx: Prisma.TransactionClient,
  input: { clerkOrgId: string; organisationId: string },
  name: string
): Promise<string> {
  const base = slugify(name);
  let slug = base;
  let suffix = 2;
  while (
    await tx.feed.findFirst({
      select: { id: true },
      where: {
        clerk_org_id: input.clerkOrgId,
        slug,
      },
    })
  ) {
    slug = `${base}-${suffix}`;
    suffix += 1;
  }
  return slug;
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.length > 0 ? slug : "feed";
}

function auditFeed(
  tx: Prisma.TransactionClient,
  input: { actingUserId: string; clerkOrgId: string; organisationId: string },
  action: string,
  feedId: string,
  payload: Record<string, string | number | boolean | null>
) {
  return tx.auditEvent.create({
    data: {
      action,
      actor_user_id: input.actingUserId,
      clerk_org_id: input.clerkOrgId,
      organisation_id: input.organisationId,
      payload,
      resource_id: feedId,
      resource_type: "feed",
    },
  });
}

function activeToken(tokens: TokenRow[]): ActiveTokenHint | null {
  const token = tokens.find((candidate) => candidate.status === "active");
  return token
    ? {
        createdAt: token.created_at,
        hint: token.token_hint,
        lastUsedAt: token.last_used_at,
        tokenId: token.id,
      }
    : null;
}

function toTokenHistoryItem(token: TokenRow): TokenHistoryItem {
  return {
    createdAt: token.created_at,
    id: token.id,
    lastUsedAt: token.last_used_at,
    revokedAt: token.revoked_at,
    rotatedFromTokenId: token.rotated_from_token_id,
    status: token.status,
  };
}

async function feedNotFound(input: {
  clerkOrgId: string;
  feedId: string;
  organisationId: string;
}): Promise<Result<never, FeedServiceError>> {
  const exists = await database.feed.findFirst({
    select: { clerk_org_id: true, organisation_id: true },
    where: { id: input.feedId },
  });
  if (
    exists &&
    (exists.clerk_org_id !== input.clerkOrgId ||
      exists.organisation_id !== input.organisationId)
  ) {
    log.error("Cross-tenant resource access attempt", {
      actingClerkOrgId: input.clerkOrgId,
      actingOrganisationId: input.organisationId,
      resourceId: input.feedId,
      resourceType: "feed",
    });
  }
  return {
    error: { code: "feed_not_found", message: "Feed not found." },
    ok: false,
  };
}

const TRAILING_SLASH_PATTERN = /\/$/;

function activeSubscribeUrl(tokens: TokenRow[]): string | null {
  const token = tokens.find((candidate) => candidate.status === "active");
  if (!token) {
    return null;
  }
  return buildFeedSubscribeUrl(
    createSignedFeedToken({ tokenHash: token.token_hash, tokenId: token.id })
  );
}

export function buildFeedSubscribeUrl(token: string): string {
  // The URL must reflect the API origin that serves /ical/:token.ics.
  // There is no safe hardcoded default, so require the origin to be
  // configured rather than surfacing a wrong or stale host.
  const origin =
    process.env.NEXT_PUBLIC_API_URL ?? process.env.NEXT_PUBLIC_APP_URL;
  if (!origin) {
    throw new Error(
      "NEXT_PUBLIC_API_URL must be configured to build feed subscribe URLs."
    );
  }
  return `${origin.replace(TRAILING_SLASH_PATTERN, "")}/ical/${token}.ics`;
}

function emptyToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function truncate(value: string | null): string | null {
  if (!value || value.length <= 140) {
    return value;
  }
  return `${value.slice(0, 137)}...`;
}

function mapTokenError(error: {
  code: string;
  message: string;
}): FeedServiceError {
  if (error.code === "feed_not_found") {
    return { code: "feed_not_found", message: error.message };
  }
  if (error.code === "not_authorised") {
    return { code: "not_authorised", message: error.message };
  }
  return { code: "unknown_error", message: error.message };
}

function notAuthorised(): Result<never, FeedServiceError> {
  return {
    error: {
      code: "not_authorised",
      message: "You do not have permission to manage feeds.",
    },
    ok: false,
  };
}

function feedArchived(): Result<never, FeedServiceError> {
  return {
    error: {
      code: "feed_archived",
      message: "Archived feeds cannot be changed.",
    },
    ok: false,
  };
}

function invalidTransition(): Result<never, FeedServiceError> {
  return {
    error: {
      code: "invalid_status_transition",
      message: "Feed status cannot move that way.",
    },
    ok: false,
  };
}

function validationError(error: z.ZodError): Result<never, FeedServiceError> {
  return {
    error: {
      code: "validation_error",
      message: error.issues[0]?.message ?? "Invalid feed request.",
    },
    ok: false,
  };
}

function unknownError(message: string): Result<never, FeedServiceError> {
  return { error: { code: "unknown_error", message }, ok: false };
}

const tokenSelect = {
  created_at: true,
  id: true,
  last_used_at: true,
  revoked_at: true,
  rotated_from_token_id: true,
  status: true,
  token_hash: true,
  token_hint: true,
} satisfies Prisma.FeedTokenSelect;

const feedListSelect = {
  created_at: true,
  created_by_user_id: true,
  description: true,
  id: true,
  includes_public_holidays: true,
  last_rendered_at: true,
  name: true,
  privacy_mode: true,
  scopes: {
    select: {
      id: true,
      scope_type: true,
      scope_value: true,
    },
  },
  status: true,
  tokens: {
    orderBy: { created_at: "desc" },
    select: tokenSelect,
  },
} satisfies Prisma.FeedSelect;

const feedDetailSelect = {
  archived_at: true,
  created_at: true,
  created_by_user_id: true,
  description: true,
  id: true,
  includes_public_holidays: true,
  last_etag: true,
  last_rendered_at: true,
  name: true,
  privacy_mode: true,
  scopes: {
    select: {
      id: true,
      scope_type: true,
      scope_value: true,
    },
  },
  status: true,
  tokens: {
    orderBy: { created_at: "desc" },
    select: tokenSelect,
    take: 5,
  },
  updated_at: true,
} satisfies Prisma.FeedSelect;

type TokenRow = Prisma.FeedTokenGetPayload<{ select: typeof tokenSelect }>;
