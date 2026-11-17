"use server";

import { analytics } from "@repo/analytics/server";
import { hasPermission as can } from "@repo/auth/permissions";
import { getCurrentUser, getSession } from "@repo/auth/server";
import type { AccountId, OrganisationId, Result } from "@repo/core";
import {
  afterTenantCommit,
  type TenantDb,
  withTenantDb,
  withTenantResult,
} from "@repo/database";
import { getOrganisationById } from "@repo/database/queries/organisations";
import { assertNoTenantTransaction } from "@repo/database/tenant-guard";
import {
  archiveFeed,
  buildFeedSubscribeUrl,
  createFeed,
  createOwnFeed,
  type FeedServiceError,
  issueToken,
  normaliseRole,
  pauseFeed,
  restoreFeed,
  resumeFeed,
  revokeToken,
  rotateToken,
  type TokenServiceError,
  updateFeed,
} from "@repo/feeds";
import { dispatchNotification } from "@repo/notifications";
import { log } from "@repo/observability/log";
import { revalidatePath } from "next/cache";
import { withOrg } from "@/lib/navigation/org-url";
import {
  type CreateFeedActionInput,
  CreateFeedActionSchema,
  type CreateOwnFeedActionInput,
  CreateOwnFeedActionSchema,
  type FeedCommandActionInput,
  FeedCommandActionSchema,
  type RevokeTokenActionInput,
  RevokeTokenActionSchema,
  type UpdateFeedActionInput,
  UpdateFeedActionSchema,
} from "./_schemas";

type FeedActionError =
  | FeedServiceError
  | TokenServiceError
  | { code: "not_authorised"; message: string }
  | { code: "validation_error"; message: string };

export type FeedActionResult<T = void> = Result<T, FeedActionError>;

export async function createFeedAction(input: CreateFeedActionInput): Promise<
  FeedActionResult<{
    feedId: string;
    subscribeUrl: string;
  }>
> {
  assertNoTenantTransaction("createFeedAction");
  const parsed = CreateFeedActionSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error.issues[0]?.message);
  }
  const context = await resolveAdminContext(parsed.data.organisationId);
  if (!context.ok) {
    return context;
  }
  const result = await runFeedWrite(
    context.value,
    createFeed,
    {
      ...parsed.data,
      accountId: context.value.accountId,
      actingRole: context.value.role,
      actingUserId: context.value.userId,
      organisationId: context.value.organisationId,
    },
    true
  );
  if (!result.ok) {
    return result;
  }
  return {
    ok: true,
    value: {
      feedId: result.value.feedId,
      subscribeUrl: buildFeedSubscribeUrl(result.value.token.plaintext),
    },
  };
}

export async function updateFeedAction(
  input: UpdateFeedActionInput
): Promise<FeedActionResult<{ feedId: string }>> {
  assertNoTenantTransaction("updateFeedAction");
  const parsed = UpdateFeedActionSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error.issues[0]?.message);
  }
  // Owners may edit their own personal or team feed; the feed service
  // enforces admin-or-owner for each change.
  const context = await resolveMemberContext(parsed.data.organisationId);
  if (!context.ok) {
    return context;
  }
  const result = await runFeedWrite(
    context.value,
    updateFeed,
    {
      ...parsed.data,
      accountId: context.value.accountId,
      actingRole: context.value.role,
      actingUserId: context.value.userId,
      organisationId: context.value.organisationId,
    },
    true
  );
  if (!result.ok) {
    return result;
  }
  return { ok: true, value: { feedId: parsed.data.feedId } };
}

export async function pauseFeedAction(
  input: FeedCommandActionInput
): Promise<FeedActionResult<{ feedId: string }>> {
  assertNoTenantTransaction("pauseFeedAction");
  return await command(input, pauseFeed, resolveMemberContext);
}

export async function resumeFeedAction(
  input: FeedCommandActionInput
): Promise<FeedActionResult<{ feedId: string }>> {
  assertNoTenantTransaction("resumeFeedAction");
  return await command(input, resumeFeed, resolveMemberContext);
}

export async function archiveFeedAction(
  input: FeedCommandActionInput
): Promise<FeedActionResult<{ feedId: string }>> {
  assertNoTenantTransaction("archiveFeedAction");
  return await command(input, archiveFeed, resolveMemberContext);
}

export async function restoreFeedAction(
  input: FeedCommandActionInput
): Promise<FeedActionResult<{ feedId: string }>> {
  assertNoTenantTransaction("restoreFeedAction");
  return await command(input, restoreFeed, resolveAdminContext);
}

export async function createOwnFeedAction(
  input: CreateOwnFeedActionInput
): Promise<FeedActionResult<{ created: boolean; feedId: string }>> {
  assertNoTenantTransaction("createOwnFeedAction");
  const parsed = CreateOwnFeedActionSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error.issues[0]?.message);
  }
  const context = await resolveMemberContext(parsed.data.organisationId);
  if (!context.ok) {
    return context;
  }
  const result = await runFeedWrite(
    context.value,
    createOwnFeed,
    {
      accountId: context.value.accountId,
      actingRole: context.value.role,
      actingUserId: context.value.userId,
      kind: parsed.data.kind,
      organisationId: context.value.organisationId,
    },
    true
  );
  if (!result.ok) {
    return result;
  }
  if (result.value.created) {
    try {
      analytics?.capture({
        distinctId: context.value.userId,
        event: "Personal Feed Created",
        properties: { kind: parsed.data.kind },
      });
      await analytics?.flush();
    } catch (error) {
      log.warn("Personal feed analytics capture failed", { error });
    }
  }
  return { ok: true, value: result.value };
}

export async function issueTokenAction(
  input: FeedCommandActionInput
): Promise<FeedActionResult<{ subscribeUrl: string; tokenId: string }>> {
  assertNoTenantTransaction("issueTokenAction");
  const parsed = FeedCommandActionSchema.safeParse(input);
  if (!parsed.success) {
    return validationError("Invalid feed");
  }
  const context = await resolveAdminContext(parsed.data.organisationId);
  if (!context.ok) {
    return context;
  }
  const result = await runFeedWrite(context.value, issueToken, {
    ...parsed.data,
    accountId: context.value.accountId,
    actingRole: context.value.role,
    actingUserId: context.value.userId,
    organisationId: context.value.organisationId,
  });
  if (!result.ok) {
    return result;
  }
  return {
    ok: true,
    value: {
      subscribeUrl: buildFeedSubscribeUrl(result.value.plaintext),
      tokenId: result.value.tokenId,
    },
  };
}

export async function rotateTokenAction(
  input: FeedCommandActionInput
): Promise<FeedActionResult<{ subscribeUrl: string; tokenId: string }>> {
  assertNoTenantTransaction("rotateTokenAction");
  const parsed = FeedCommandActionSchema.safeParse(input);
  if (!parsed.success) {
    return validationError("Invalid feed");
  }
  const context = await resolveMemberContext(parsed.data.organisationId);
  if (!context.ok) {
    return context;
  }
  const result = await runFeedWrite(context.value, rotateToken, {
    ...parsed.data,
    accountId: context.value.accountId,
    actingRole: context.value.role,
    actingUserId: context.value.userId,
    organisationId: context.value.organisationId,
  });
  if (!result.ok) {
    return result;
  }

  // Fetch feed name cheaply to include in notification body
  let feedName: string | null = null;
  try {
    const feed = await withTenantDb(context.value.accountId, (db) =>
      db.feed.findFirst({
        select: { name: true },
        where: {
          // Both tenant keys: one Account can own several Organisation
          // rows (one per Xero file), so account_id alone spans payroll entities.
          account_id: context.value.accountId,
          id: parsed.data.feedId,
          organisation_id: context.value.organisationId,
        },
      })
    );
    if (feed) {
      feedName = feed.name;
    }
  } catch (err) {
    log.error("Failed to fetch feed name for token rotation notification", {
      error: err,
      feedId: parsed.data.feedId,
    });
  }

  const actionUrl = withOrg(
    `/feeds/${parsed.data.feedId}`,
    context.value.organisationId
  );
  const body = feedName
    ? `The token for calendar feed "${feedName}" has been rotated.`
    : "A calendar feed token has been rotated.";

  try {
    const phaseInput1 = {
      accountId: context.value.accountId,
      actionUrl,
      actorUserId: context.value.userId,
      body,
      objectId: parsed.data.feedId,
      objectType: "feed",
      organisationId: context.value.organisationId,
      recipientPersonId: null,
      recipientUserId: context.value.userId,
      title: "Feed token rotated",
      type: "feed_token_rotated",
    } satisfies Parameters<typeof dispatchNotification>[0];
    const dispatchResult = await withTenantResult(phaseInput1.accountId, (db) =>
      dispatchNotification(phaseInput1, undefined, db)
    );

    if (!dispatchResult.ok) {
      log.error("Failed to dispatch feed token rotation notification", {
        error: dispatchResult.error,
        feedId: parsed.data.feedId,
      });
    }
  } catch (err) {
    log.error(
      "Failed to dispatch feed token rotation notification (unhandled exception)",
      {
        error: err,
        feedId: parsed.data.feedId,
      }
    );
  }

  return {
    ok: true,
    value: {
      subscribeUrl: buildFeedSubscribeUrl(result.value.plaintext),
      tokenId: result.value.tokenId,
    },
  };
}

export async function revokeTokenAction(
  input: RevokeTokenActionInput
): Promise<FeedActionResult<{ feedId: string }>> {
  assertNoTenantTransaction("revokeTokenAction");
  const parsed = RevokeTokenActionSchema.safeParse(input);
  if (!parsed.success) {
    return validationError("Invalid token");
  }
  const context = await resolveAdminContext(parsed.data.organisationId);
  if (!context.ok) {
    return context;
  }
  const result = await runFeedWrite(context.value, revokeToken, {
    ...parsed.data,
    accountId: context.value.accountId,
    actingRole: context.value.role,
    actingUserId: context.value.userId,
    organisationId: context.value.organisationId,
  });
  if (!result.ok) {
    return result;
  }
  return { ok: true, value: { feedId: result.value.feedId } };
}

async function command(
  input: FeedCommandActionInput,
  service: (
    input: unknown,
    db: TenantDb
  ) => Promise<Result<unknown, FeedServiceError>>,
  resolveContext: typeof resolveAdminContext
): Promise<FeedActionResult<{ feedId: string }>> {
  const parsed = FeedCommandActionSchema.safeParse(input);
  if (!parsed.success) {
    return validationError("Invalid feed");
  }
  const context = await resolveContext(parsed.data.organisationId);
  if (!context.ok) {
    return context;
  }
  const result = await runFeedWrite(
    context.value,
    service,
    {
      ...parsed.data,
      accountId: context.value.accountId,
      actingRole: context.value.role,
      actingUserId: context.value.userId,
      organisationId: context.value.organisationId,
    },
    true
  );
  if (!result.ok) {
    return result;
  }
  return { ok: true, value: { feedId: parsed.data.feedId } };
}

type ActorContext = FeedActionResult<{
  accountId: string;
  organisationId: string;
  role: string;
  userId: string;
}>;

function resolveAdminContext(organisationId: string): Promise<ActorContext> {
  return resolveActorContext(organisationId, { requireAdmin: true });
}

// Any signed-in member of the organisation. Services decide what they may do.
function resolveMemberContext(organisationId: string): Promise<ActorContext> {
  return resolveActorContext(organisationId, { requireAdmin: false });
}

async function resolveActorContext(
  organisationId: string,
  options: { requireAdmin: boolean }
): Promise<ActorContext> {
  const [{ role: sessionRole, accountId: sessionAccountId }, user] =
    await Promise.all([
      getSession().then(
        (currentSession) =>
          currentSession ?? {
            accountId: null,
            role: null,
            sessionId: null,
            userId: null,
          }
      ),
      getCurrentUser(),
    ]);
  const role = normaliseRole(sessionRole);
  const isAdmin = can(role, { feeds: ["manageAll"] });
  if (
    !(user && role && sessionAccountId && (isAdmin || !options.requireAdmin))
  ) {
    return {
      error: {
        code: "not_authorised",
        message: "You do not have permission to manage feeds.",
      },
      ok: false,
    };
  }
  return {
    ok: true,
    value: {
      accountId: sessionAccountId,
      organisationId,
      role,
      userId: user.id,
    },
  };
}

function revalidateFeedPaths(
  feedId?: string,
  options: { includeSettings?: boolean } = {}
): void {
  revalidatePath("/feeds");
  if (feedId) {
    revalidatePath(`/feeds/${feedId}`);
  }
  if (options.includeSettings) {
    revalidatePath("/settings/feeds");
  }
}

function validationError(message?: string): FeedActionResult<never> {
  return {
    error: {
      code: "validation_error",
      message: message ?? "Invalid feed request.",
    },
    ok: false,
  };
}

async function runFeedWrite<T>(
  actor: {
    accountId: string;
    organisationId: string;
    role: string;
    userId: string;
  },
  service: (input: unknown, db: TenantDb) => Promise<FeedActionResult<T>>,
  input: unknown,
  includeSettings = false
): Promise<FeedActionResult<T>> {
  try {
    return await withTenantResult(
      actor.accountId,
      async (db): Promise<FeedActionResult<T>> => {
        // The IDs come from getSession and validated action schemas; query ownership is checked in this scope.
        const company = await getOrganisationById(
          actor.accountId as AccountId,
          actor.organisationId as OrganisationId,
          db
        );
        if (!company.ok) {
          return {
            error: {
              code: "not_authorised",
              message: "This company is not available in your account.",
            },
            ok: false,
          };
        }
        const result = await service(input, db);
        if (result.ok) {
          const inputFeedId =
            typeof input === "object" &&
            input !== null &&
            "feedId" in input &&
            typeof input.feedId === "string"
              ? input.feedId
              : undefined;
          const resultFeedId =
            typeof result.value === "object" &&
            result.value !== null &&
            "feedId" in result.value &&
            typeof result.value.feedId === "string"
              ? result.value.feedId
              : undefined;
          const feedId = resultFeedId ?? inputFeedId;
          afterTenantCommit(db, async () =>
            revalidateFeedPaths(feedId, { includeSettings })
          );
        }
        return result;
      }
    );
  } catch {
    return {
      error: {
        code: "unknown_error",
        message: "Failed to update calendar feeds.",
      },
      ok: false,
    };
  }
}
