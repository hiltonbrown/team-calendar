import "server-only";

import { withinLimit } from "@repo/auth/server";
import type { Result } from "@repo/core";
import {
  afterTenantCommit,
  assertTenantDb,
  lockPlanLimitMutations,
  resolveAccountCompanies,
  type TenantDb,
} from "@repo/database";
import type { Prisma } from "@repo/database/generated/client";
import type {
  availability_privacy_mode,
  feed_status,
} from "@repo/database/generated/enums";
import { z } from "zod";
import { invalidateFeedCache } from "./cache/feed-cache";
import {
  type FeedKind,
  feedKind,
  isFeedOwner,
  type OwnFeedKind,
  ownFeedScopeType,
} from "./scope/feed-ownership";
import {
  canViewFeed,
  createScopeRows,
  type FeedScopeData,
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
  createdByName: string | null;
  createdByUserId: string | null;
  description: string | null;
  id: string;
  includesPublicHolidays: boolean;
  isOwnedByActor: boolean;
  kind: FeedKind;
  lastFetchedAt: Date | null;
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
  createdByUserId: string | null;
  description: string | null;
  id: string;
  includesPublicHolidays: boolean;
  isOwnedByActor: boolean;
  kind: FeedKind;
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
      type: z
        .array(z.enum(["org", "team", "person", "self", "manager_team"]))
        .optional(),
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

const OwnFeedSchema = z.object({
  actingRole: RoleSchema,
  actingUserId: z.string().min(1),
  clerkOrgId: z.string().min(1),
  kind: z.enum(["personal", "team"]),
  organisationId: z.string().uuid(),
});

const OwnFeedEligibilitySchema = z.object({
  actingUserId: z.string().min(1),
  clerkOrgId: z.string().min(1),
  organisationId: z.string().uuid(),
});

export interface OwnFeedEligibility {
  hasDirectReports: boolean;
  personalFeedId: string | null;
  personId: string | null;
  teamFeedId: string | null;
}

const FeedCountsSchema = z.object({
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
  tx: TenantDb,
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
  tx: TenantDb,
  input: { clerkOrgId: string; organisationId: string }
): Promise<void> => {
  await lockPlanLimitMutations(input.clerkOrgId, tx);
  await assertWithinFeedLimit(tx, input);
};

export async function createFeed(
  input: unknown,
  db: TenantDb
): Promise<
  Result<{ feedId: string; token: TokenDisclosure }, FeedServiceError>
> {
  const parsed = CreateFeedSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error);
  }
  assertTenantDb(db, parsed.data.clerkOrgId);
  const run = async (tenantDb2: TenantDb): ReturnType<typeof createFeed> => {
    if (!isAdminOrOwner(parsed.data.actingRole)) {
      return notAuthorised();
    }

    const scopes = await validateScopes(parsed.data, tenantDb2);
    if (!scopes.ok) {
      return { error: scopes.error, ok: false };
    }

    const result = await (async (tx: TenantDb) => {
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
    })(tenantDb2);

    scheduleFeedInvalidation(tenantDb2, { feedId: result.feedId });
    return { ok: true, value: result };
  };
  try {
    return await (async () => {
      assertTenantDb(db, parsed.data.clerkOrgId);
      return await run(db);
    })();
  } catch (error) {
    if (error instanceof RollbackError) {
      // Result-bearing entry points own withTenantResult and roll back this failure.
      return { error: error.serviceError, ok: false };
    }
    throw error;
  }
}

export async function ensureDefaultCalendarFeed(
  input: unknown,
  db: TenantDb
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
  assertTenantDb(db, parsed.data.clerkOrgId);
  const run = async (
    tenantDb3: TenantDb
  ): ReturnType<typeof ensureDefaultCalendarFeed> => {
    const actingUserId =
      parsed.data.actingUserId ?? "system:default-calendar-feed";

    const result = await (async (tx: TenantDb) => {
      await lockPlanLimitMutations(parsed.data.clerkOrgId, tx);
      const defaultMarkers = await tx.auditEvent.findMany({
        select: { resource_id: true },
        where: {
          action: "feeds.created",
          clerk_org_id: parsed.data.clerkOrgId,
          payload: { equals: true, path: ["defaultFeed"] },
          resource_type: "feed",
        },
      });
      const defaultFeedIds = defaultMarkers.flatMap((marker) =>
        marker.resource_id ? [marker.resource_id] : []
      );
      const existing = await tx.feed.findFirst({
        orderBy: { created_at: "asc" },
        select: { id: true },
        where: {
          clerk_org_id: parsed.data.clerkOrgId,
          id: { in: defaultFeedIds },
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
          organisation_id: null,
          privacy_mode: parsed.data.privacyMode,
          scopes: {
            create: createScopeRows({
              clerkOrgId: parsed.data.clerkOrgId,
              organisationId: null,
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
        organisationId: null,
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
    })(tenantDb3);

    if (result.created) {
      scheduleFeedInvalidation(tenantDb3, { feedId: result.feedId });
    }
    return { ok: true, value: result };
  };
  try {
    return await (async () => {
      assertTenantDb(db, parsed.data.clerkOrgId);
      return await run(db);
    })();
  } catch (error) {
    if (error instanceof RollbackError) {
      // Result-bearing entry points own withTenantResult and roll back this failure.
      return { error: error.serviceError, ok: false };
    }
    throw error;
  }
}

export async function updateFeed(
  input: unknown,
  db: TenantDb
): Promise<Result<FeedDetail, FeedServiceError>> {
  const parsed = UpdateFeedSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error);
  }
  assertTenantDb(db, parsed.data.clerkOrgId);
  const run = async (tenantDb4: TenantDb): ReturnType<typeof updateFeed> => {
    const permission = await authoriseFeedChange(parsed.data, tenantDb4);
    if (!permission.ok) {
      return permission;
    }
    if (parsed.data.patch.scopes && !permission.value.isAdmin) {
      return notAuthorised();
    }

    const scopes = parsed.data.patch.scopes
      ? await validateScopes(
          {
            clerkOrgId: parsed.data.clerkOrgId,
            organisationId: parsed.data.organisationId,
            scopes: parsed.data.patch.scopes,
          },
          tenantDb4
        )
      : null;
    if (scopes && !scopes.ok) {
      return { error: scopes.error, ok: false };
    }

    const invalidate = Boolean(
      parsed.data.patch.privacyMode ||
        parsed.data.patch.includesPublicHolidays !== undefined ||
        parsed.data.patch.scopes
    );
    await (async (tx: TenantDb) => {
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
            organisation_id: feed.value.organisationId,
          },
        });
        await tx.feedScope.createMany({
          data: createScopeRows({
            clerkOrgId: parsed.data.clerkOrgId,
            organisationId: feed.value.organisationId,
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
    })(tenantDb4);

    if (invalidate) {
      scheduleFeedInvalidation(tenantDb4, { feedId: parsed.data.feedId });
    }
    return await getFeedDetail(parsed.data, tenantDb4);
  };
  try {
    return await (async () => {
      assertTenantDb(db, parsed.data.clerkOrgId);
      return await run(db);
    })();
  } catch (error) {
    if (error instanceof RollbackError) {
      // Result-bearing entry points own withTenantResult and roll back this failure.
      return { error: error.serviceError, ok: false };
    }
    throw error;
  }
}

export const pauseFeed = (input: unknown, db: TenantDb) =>
  transitionFeed(input, "active", "paused", "feeds.paused", db);

export const resumeFeed = (input: unknown, db: TenantDb) =>
  transitionFeed(input, "paused", "active", "feeds.resumed", db);

export async function archiveFeed(
  input: unknown,
  db: TenantDb
): Promise<Result<FeedDetail, FeedServiceError>> {
  const parsed = FeedCommandSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error);
  }
  assertTenantDb(db, parsed.data.clerkOrgId);
  const run = async (tenantDb5: TenantDb): ReturnType<typeof archiveFeed> => {
    const permission = await authoriseFeedChange(parsed.data, tenantDb5);
    if (!permission.ok) {
      return permission;
    }

    await (async (tx: TenantDb) => {
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
          organisation_id: feed.value.organisationId,
          status: "active",
        },
      });
      await auditFeed(tx, parsed.data, "feeds.archived", parsed.data.feedId, {
        actingUserId: parsed.data.actingUserId,
        feedId: parsed.data.feedId,
      });
    })(tenantDb5);
    scheduleFeedInvalidation(tenantDb5, { feedId: parsed.data.feedId });
    return await getFeedDetail(parsed.data, tenantDb5);
  };
  try {
    return await (async () => {
      assertTenantDb(db, parsed.data.clerkOrgId);
      return await run(db);
    })();
  } catch (error) {
    if (error instanceof RollbackError) {
      // Result-bearing entry points own withTenantResult and roll back this failure.
      return { error: error.serviceError, ok: false };
    }
    throw error;
  }
}

export async function restoreFeed(
  input: unknown,
  db: TenantDb
): Promise<Result<FeedDetail, FeedServiceError>> {
  const parsed = FeedCommandSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error);
  }
  assertTenantDb(db, parsed.data.clerkOrgId);
  const run = async (tenantDb6: TenantDb): ReturnType<typeof restoreFeed> => {
    if (!isAdminOrOwner(parsed.data.actingRole)) {
      return notAuthorised();
    }

    const existing = await tenantDb6.feed.findFirst({
      select: { status: true },
      where: scopedFeed(parsed.data),
    });
    if (!existing) {
      return feedNotFound();
    }
    if (existing.status !== "archived") {
      return invalidTransition();
    }
    await (async (tx: TenantDb) => {
      await tx.feed.update({
        data: { archived_at: null, status: "paused" },
        where: { id: parsed.data.feedId },
      });
      await auditFeed(tx, parsed.data, "feeds.restored", parsed.data.feedId, {
        actingUserId: parsed.data.actingUserId,
        feedId: parsed.data.feedId,
      });
    })(tenantDb6);
    scheduleFeedInvalidation(tenantDb6, { feedId: parsed.data.feedId });
    return await getFeedDetail(parsed.data, tenantDb6);
  };
  return await (async () => {
    assertTenantDb(db, parsed.data.clerkOrgId);
    return await run(db);
  })();
}

export async function listFeeds(
  input: unknown,
  db: TenantDb
): Promise<Result<FeedListItem[], FeedServiceError>> {
  const parsed = ListFeedsSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error);
  }
  assertTenantDb(db, parsed.data.clerkOrgId);
  const run = async (tenantDb7: TenantDb): ReturnType<typeof listFeeds> => {
    const role = parsed.data.actingRole;
    const actingPersonId =
      parsed.data.actingPersonId ??
      (await findActingPersonId(
        {
          clerkOrgId: parsed.data.clerkOrgId,
          organisationId: parsed.data.organisationId,
          userId: parsed.data.actingUserId,
        },
        tenantDb7
      ));
    const statuses = isAdminOrOwner(role)
      ? parsed.data.filters.status
      : parsed.data.filters.status.filter((status) => status !== "archived");
    const feeds = await findFeedListRows(parsed.data, statuses, tenantDb7);

    const scopeData =
      feeds.length > 0
        ? await loadFeedScopeData(
            {
              clerkOrgId: parsed.data.clerkOrgId,
              organisationId: parsed.data.organisationId,
            },
            tenantDb7
          )
        : null;
    if (scopeData && !scopeData.ok) {
      return { error: scopeData.error, ok: false };
    }
    const preloadedScopeData = scopeData ? scopeData.value : undefined;
    const creatorNames = creatorNamesByUserId(preloadedScopeData?.people ?? []);

    const visibleItems: FeedListItem[] = [];
    for (const feed of feeds) {
      const scopes = feed.scopes.map((scope) => ({
        scopeType: scope.scope_type,
        scopeValue: scope.scope_value,
      }));
      const visible = await canViewFeed(
        {
          actingPersonId,
          clerkOrgId: parsed.data.clerkOrgId,
          createdByUserId: feed.created_by_user_id,
          organisationId: feed.organisation_id,
          preloaded: preloadedForFeed(feed.organisation_id, preloadedScopeData),
          role,
          scopes,
        },
        tenantDb7
      );
      if (!(visible.ok && visible.value)) {
        continue;
      }
      const labels = await resolveScopeRows(
        {
          clerkOrgId: parsed.data.clerkOrgId,
          organisationId: feed.organisation_id,
          preloaded: preloadedForFeed(feed.organisation_id, preloadedScopeData),
          scopes: feed.scopes,
        },
        tenantDb7
      );
      visibleItems.push(
        toFeedListItem({
          actingUserId: parsed.data.actingUserId,
          creatorNames,
          feed,
          labels: labels.ok ? labels.value : undefined,
        })
      );
    }
    return { ok: true, value: visibleItems };
  };
  return await (async () => {
    assertTenantDb(db, parsed.data.clerkOrgId);
    return await run(db);
  })();
}

export async function getFeedDetail(
  input: unknown,
  db: TenantDb
): Promise<Result<FeedDetail, FeedServiceError>> {
  const parsed = DetailSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error);
  }
  assertTenantDb(db, parsed.data.clerkOrgId);
  const run = async (tenantDb8: TenantDb): ReturnType<typeof getFeedDetail> => {
    const role = parsed.data.actingRole;
    const actingPersonId =
      parsed.data.actingPersonId ??
      (await findActingPersonId(
        {
          clerkOrgId: parsed.data.clerkOrgId,
          organisationId: parsed.data.organisationId,
          userId: parsed.data.actingUserId,
        },
        tenantDb8
      ));
    const feed = await tenantDb8.feed.findFirst({
      select: feedDetailSelect,
      where: scopedFeed(parsed.data),
    });
    if (!feed) {
      return feedNotFound();
    }

    const scopes = feed.scopes.map((scope) => ({
      scopeType: scope.scope_type,
      scopeValue: scope.scope_value,
    }));
    const visible = await canViewFeed(
      {
        actingPersonId,
        clerkOrgId: parsed.data.clerkOrgId,
        createdByUserId: feed.created_by_user_id,
        organisationId: feed.organisation_id,
        role,
        scopes,
      },
      tenantDb8
    );
    if (!visible.ok) {
      return { error: visible.error, ok: false };
    }
    if (!visible.value) {
      return notAuthorised();
    }

    const resolvedScopes = await resolveScopeRows(
      {
        clerkOrgId: parsed.data.clerkOrgId,
        organisationId: feed.organisation_id,
        scopes: feed.scopes,
      },
      tenantDb8
    );
    if (!resolvedScopes.ok) {
      return { error: resolvedScopes.error, ok: false };
    }

    return {
      ok: true,
      value: {
        activeTokenHint: activeToken(feed.tokens),
        archivedAt: feed.archived_at,
        createdAt: feed.created_at,
        createdByUserId: feed.created_by_user_id,
        description: feed.description,
        id: feed.id,
        includesPublicHolidays: feed.includes_public_holidays,
        isOwnedByActor: isFeedOwner(
          { createdByUserId: feed.created_by_user_id, scopes },
          parsed.data.actingUserId
        ),
        kind: feedKind(scopes),
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
  };
  return await (async () => {
    assertTenantDb(db, parsed.data.clerkOrgId);
    return await run(db);
  })();
}

export async function getOwnFeedEligibility(
  input: unknown,
  db: TenantDb
): Promise<Result<OwnFeedEligibility, FeedServiceError>> {
  const parsed = OwnFeedEligibilitySchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error);
  }
  assertTenantDb(db, parsed.data.clerkOrgId);
  const run = async (
    tenantDb9: TenantDb
  ): ReturnType<typeof getOwnFeedEligibility> => {
    const value = await ((tx: TenantDb) => loadOwnFeedState(tx, parsed.data))(
      tenantDb9
    );
    return {
      ok: true,
      value: {
        hasDirectReports: value.hasDirectReports,
        personalFeedId: value.personalFeedId,
        personId: value.person?.id ?? null,
        teamFeedId: value.teamFeedId,
      },
    };
  };
  return await (async () => {
    assertTenantDb(db, parsed.data.clerkOrgId);
    return await run(db);
  })();
}

// Self-service creation for a person's own calendar or their direct reports.
// Scopes are fixed here rather than accepted from the caller, so a non-admin
// can never publish anything wider than their own team.
export async function createOwnFeed(
  input: unknown,
  db: TenantDb
): Promise<Result<{ created: boolean; feedId: string }, FeedServiceError>> {
  const parsed = OwnFeedSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error);
  }
  assertTenantDb(db, parsed.data.clerkOrgId);
  const run = async (
    tenantDb10: TenantDb
  ): ReturnType<typeof createOwnFeed> => {
    const kind: OwnFeedKind = parsed.data.kind;

    const result = await (async (tx: TenantDb) => {
      // Serialises concurrent self-service requests for the Clerk org, so a
      // double submit returns the feed the first request created.
      await lockPlanLimitMutations(parsed.data.clerkOrgId, tx);
      const state = await loadOwnFeedState(tx, parsed.data);
      if (!state.person) {
        throw new RollbackError({
          code: "validation_error",
          message:
            "Your account is not linked to a person yet. Ask an administrator to link it.",
        });
      }
      const existingId =
        kind === "personal" ? state.personalFeedId : state.teamFeedId;
      if (existingId) {
        return { created: false, feedId: existingId };
      }
      if (kind === "team" && !state.hasDirectReports) {
        throw new RollbackError({
          code: "not_authorised",
          message: "A team feed needs at least one direct report.",
        });
      }

      await assertWithinFeedLimit(tx, parsed.data);
      const settings = await tx.organisationSettings.findFirst({
        select: {
          default_feed_privacy_mode: true,
          feeds_include_public_holidays_default: true,
        },
        where: {
          clerk_org_id: parsed.data.clerkOrgId,
          organisation_id: parsed.data.organisationId,
        },
      });
      const privacyMode = settings?.default_feed_privacy_mode ?? "named";
      const name = ownFeedName(kind, state.person.firstName);
      const slug = await makeUniqueSlug(tx, parsed.data, name);
      const scopeType = ownFeedScopeType(kind);
      const feed = await tx.feed.create({
        data: {
          clerk_org_id: parsed.data.clerkOrgId,
          created_by_user_id: parsed.data.actingUserId,
          includes_public_holidays:
            settings?.feeds_include_public_holidays_default ?? false,
          name,
          organisation_id: null,
          privacy_mode: privacyMode,
          scopes: {
            create: createScopeRows({
              clerkOrgId: parsed.data.clerkOrgId,
              organisationId: null,
              scopes: [{ scopeType, scopeValue: null }],
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
        organisationId: null,
      });
      if (!token.ok) {
        throw new RollbackError(mapTokenError(token.error));
      }

      await auditFeed(tx, parsed.data, "feeds.created", feed.id, {
        actingUserId: parsed.data.actingUserId,
        feedId: feed.id,
        name,
        ownFeedKind: kind,
        privacyMode,
        scopeCount: 1,
      });
      return { created: true, feedId: feed.id };
    })(tenantDb10);

    if (result.created) {
      scheduleFeedInvalidation(tenantDb10, { feedId: result.feedId });
    }
    return { ok: true, value: result };
  };
  try {
    return await (async () => {
      assertTenantDb(db, parsed.data.clerkOrgId);
      return await run(db);
    })();
  } catch (error) {
    if (error instanceof RollbackError) {
      // Result-bearing entry points own withTenantResult and roll back this failure.
      return { error: error.serviceError, ok: false };
    }
    throw error;
  }
}

export async function getFeedOversightCounts(
  input: unknown,
  db: TenantDb
): Promise<Result<{ personal: number; total: number }, FeedServiceError>> {
  const parsed = FeedCountsSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error);
  }
  assertTenantDb(db, parsed.data.clerkOrgId);
  const run = async (
    tenantDb: TenantDb
  ): ReturnType<typeof getFeedOversightCounts> => {
    if (!isAdminOrOwner(parsed.data.actingRole)) {
      return notAuthorised();
    }
    const where = {
      archived_at: null,
      clerk_org_id: parsed.data.clerkOrgId,
      OR: [
        { organisation_id: parsed.data.organisationId },
        { organisation_id: null },
      ],
      status: { in: ["active", "paused"] satisfies feed_status[] },
    };

    const [total, personal] = [
      await tenantDb.feed.count({ where }),
      await tenantDb.feed.count({
        where: {
          ...where,
          scopes: { every: { scope_type: "self" }, some: {} },
        },
      }),
    ];
    return { ok: true, value: { personal, total } };
  };
  return await (async () => {
    assertTenantDb(db, parsed.data.clerkOrgId);
    return await run(db);
  })();
}

async function transitionFeed(
  input: unknown,
  fromStatus: feed_status,
  toStatus: feed_status,
  auditAction: string,
  db: TenantDb
): Promise<Result<FeedDetail, FeedServiceError>> {
  const parsed = FeedCommandSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error);
  }
  assertTenantDb(db, parsed.data.clerkOrgId);
  const run = async (
    tenantDb11: TenantDb
  ): ReturnType<typeof transitionFeed> => {
    const permission = await authoriseFeedChange(parsed.data, tenantDb11);
    if (!permission.ok) {
      return permission;
    }

    const existing = await tenantDb11.feed.findFirst({
      select: { archived_at: true, status: true },
      where: scopedFeed(parsed.data),
    });
    if (!existing) {
      return feedNotFound();
    }
    if (existing.status === "archived" || existing.archived_at) {
      return feedArchived();
    }
    if (existing.status !== fromStatus) {
      return invalidTransition();
    }
    await (async (tx: TenantDb) => {
      await tx.feed.update({
        data: { status: toStatus },
        where: { id: parsed.data.feedId },
      });
      await auditFeed(tx, parsed.data, auditAction, parsed.data.feedId, {
        actingUserId: parsed.data.actingUserId,
        feedId: parsed.data.feedId,
      });
    })(tenantDb11);
    scheduleFeedInvalidation(tenantDb11, { feedId: parsed.data.feedId });
    return await getFeedDetail(parsed.data, tenantDb11);
  };
  return await (async () => {
    assertTenantDb(db, parsed.data.clerkOrgId);
    return await run(db);
  })();
}

type FeedReadClient = TenantDb;

async function loadOwnFeedState(
  client: FeedReadClient,
  input: { actingUserId: string; clerkOrgId: string; organisationId: string }
): Promise<{
  hasDirectReports: boolean;
  person: { firstName: string; id: string } | null;
  personalFeedId: string | null;
  teamFeedId: string | null;
}> {
  const companyIds = (
    await resolveAccountCompanies(input.clerkOrgId, client)
  ).map((company) => company.id);
  const scope = {
    clerk_org_id: input.clerkOrgId,
    organisation_id: { in: companyIds },
  };
  const person = await client.person.findFirst({
    select: { first_name: true, id: true },
    where: {
      ...scope,
      archived_at: null,
      clerk_user_id: input.actingUserId,
      // Feed scope resolution skips inactive people, so their own feed
      // would publish nobody.
      is_active: true,
    },
  });
  const ownFeed = (scopeType: "manager_team" | "self") =>
    client.feed.findFirst({
      orderBy: { created_at: "asc" },
      select: { id: true },
      where: {
        archived_at: null,
        clerk_org_id: input.clerkOrgId,
        created_by_user_id: input.actingUserId,
        OR: [
          { organisation_id: null },
          { organisation_id: input.organisationId },
        ],
        scopes: { every: { scope_type: scopeType }, some: {} },
        status: { in: ["active", "paused"] },
      },
    });
  const [personalFeed, teamFeed, directReport] = [
    await ownFeed("self"),
    await ownFeed("manager_team"),
    await (person
      ? client.person.findFirst({
          select: { id: true },
          where: {
            ...scope,
            archived_at: null,
            is_active: true,
            manager: {
              archived_at: null,
              clerk_org_id: input.clerkOrgId,
              clerk_user_id: input.actingUserId,
              is_active: true,
            },
          },
        })
      : Promise.resolve(null)),
  ];
  return {
    hasDirectReports: Boolean(directReport),
    person: person ? { firstName: person.first_name, id: person.id } : null,
    personalFeedId: personalFeed?.id ?? null,
    teamFeedId: teamFeed?.id ?? null,
  };
}

function ownFeedName(kind: OwnFeedKind, firstName: string): string {
  const trimmed = firstName.trim();
  if (kind === "personal") {
    return trimmed ? `${trimmed}'s calendar` : "My calendar";
  }
  return trimmed ? `${trimmed}'s team` : "My team";
}

// Admins and owners manage every feed; anyone else may change only a
// personal or team feed they created.
async function authoriseFeedChange(
  input: {
    actingRole: string;
    actingUserId: string;
    clerkOrgId: string;
    feedId: string;
    organisationId: string;
  },
  db: TenantDb
): Promise<Result<{ isAdmin: boolean }, FeedServiceError>> {
  assertTenantDb(db, input.clerkOrgId);
  if (isAdminOrOwner(normaliseRole(input.actingRole))) {
    return { ok: true, value: { isAdmin: true } };
  }
  try {
    const feed = await db.feed.findFirst({
      select: {
        created_by_user_id: true,
        scopes: { select: { scope_type: true } },
      },
      where: scopedFeed(input),
    });
    if (!feed) {
      return feedNotFound();
    }
    const owned = isFeedOwner(
      {
        createdByUserId: feed.created_by_user_id,
        scopes: feed.scopes.map((scope) => ({ scopeType: scope.scope_type })),
      },
      input.actingUserId
    );
    return owned ? { ok: true, value: { isAdmin: false } } : notAuthorised();
  } catch {
    return unknownError("Failed to check feed permissions.");
  }
}

function creatorNamesByUserId(
  people: {
    clerk_user_id: string | null;
    first_name: string;
    last_name: string;
  }[]
): Map<string, string> {
  return new Map(
    people.flatMap((person) =>
      person.clerk_user_id
        ? [
            [
              person.clerk_user_id,
              [person.first_name, person.last_name].filter(Boolean).join(" "),
            ] as const,
          ]
        : []
    )
  );
}

function toFeedListItem(input: {
  actingUserId: string;
  creatorNames: Map<string, string>;
  feed: FeedListRow;
  labels: ResolvedFeedScope[] | undefined;
}): FeedListItem {
  const { feed } = input;
  const scopes = feed.scopes.map((scope) => ({
    scopeType: scope.scope_type,
    scopeValue: scope.scope_value,
  }));
  return {
    activeTokenHint: activeToken(feed.tokens),
    createdAt: feed.created_at,
    createdByName: feed.created_by_user_id
      ? (input.creatorNames.get(feed.created_by_user_id) ?? null)
      : null,
    createdByUserId: feed.created_by_user_id,
    description: truncate(feed.description),
    id: feed.id,
    includesPublicHolidays: feed.includes_public_holidays,
    isOwnedByActor: isFeedOwner(
      { createdByUserId: feed.created_by_user_id, scopes },
      input.actingUserId
    ),
    kind: feedKind(scopes),
    lastFetchedAt: lastFetchedAt(feed.tokens),
    lastRenderedAt: feed.last_rendered_at,
    name: feed.name,
    privacyMode: feed.privacy_mode,
    scopeCount: feed.scopes.length,
    scopeSummary: scopeSummary(scopes, input.labels),
    status: feed.status,
    subscribeUrl: activeSubscribeUrl(feed.tokens),
  };
}

function lastFetchedAt(tokens: TokenRow[]): Date | null {
  let latest: Date | null = null;
  for (const token of tokens) {
    if (
      token.status === "active" &&
      token.last_used_at &&
      (!latest || token.last_used_at > latest)
    ) {
      latest = token.last_used_at;
    }
  }
  return latest;
}

async function loadFeedForUpdate(
  tx: TenantDb,
  input: { clerkOrgId: string; feedId: string; organisationId: string }
): Promise<
  Result<{ id: string; organisationId: string | null }, FeedServiceError>
> {
  const feed = await tx.feed.findFirst({
    select: {
      archived_at: true,
      id: true,
      organisation_id: true,
      status: true,
    },
    where: scopedFeed(input),
  });
  if (!feed) {
    return feedNotFound();
  }
  if (feed.status === "archived" || feed.archived_at) {
    return feedArchived();
  }
  return {
    ok: true,
    value: { id: feed.id, organisationId: feed.organisation_id },
  };
}

async function makeUniqueSlug(
  tx: TenantDb,
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
  tx: TenantDb,
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

function feedNotFound(): Result<never, FeedServiceError> {
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
  organisation_id: true,
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
  organisation_id: true,
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
type FeedListRow = Prisma.FeedGetPayload<{ select: typeof feedListSelect }>;

function preloadedForFeed(
  organisationId: string | null,
  data: FeedScopeData | undefined
) {
  return organisationId === null ? undefined : data;
}

function scheduleFeedInvalidation(
  db: TenantDb,
  input: Parameters<typeof invalidateFeedCache>[0]
): void {
  afterTenantCommit(db, async () => {
    const outcome = await invalidateFeedCache(input);
    if (!outcome.ok) {
      throw new Error(outcome.error.message);
    }
  });
}

function findFeedListRows(
  input: z.infer<typeof ListFeedsSchema>,
  statuses: z.infer<typeof ListFeedsSchema>["filters"]["status"],
  db: TenantDb
) {
  return db.feed.findMany({
    cursor: input.pagination.cursor
      ? { id: input.pagination.cursor }
      : undefined,
    orderBy: [{ created_at: "desc" }, { id: "asc" }],
    select: feedListSelect,
    skip: input.pagination.cursor ? 1 : 0,
    take: input.pagination.pageSize,
    where: {
      clerk_org_id: input.clerkOrgId,
      name: input.filters.search
        ? { contains: input.filters.search, mode: "insensitive" }
        : undefined,
      OR: [
        { organisation_id: input.organisationId },
        { organisation_id: null },
      ],
      privacy_mode: input.filters.privacyMode?.length
        ? { in: input.filters.privacyMode }
        : undefined,
      scopes: input.filters.type?.length
        ? { some: { scope_type: { in: input.filters.type } } }
        : undefined,
      status: { in: statuses },
    },
  });
}
