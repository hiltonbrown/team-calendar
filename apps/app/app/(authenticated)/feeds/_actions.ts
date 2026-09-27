"use server";

import { auth, currentUser } from "@repo/auth/server";
import type { Result } from "@repo/core";
import { database } from "@repo/database";
import {
  archiveFeed,
  buildFeedSubscribeUrl,
  createFeed,
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
import { getActiveOrgContext } from "@/lib/server/get-active-org-context";
import {
  type CreateFeedActionInput,
  CreateFeedActionSchema,
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
  const parsed = CreateFeedActionSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error.issues[0]?.message);
  }
  const context = await resolveAdminContext(parsed.data.organisationId);
  if (!context.ok) {
    return context;
  }
  const result = await createFeed({
    ...parsed.data,
    actingRole: context.value.role,
    actingUserId: context.value.userId,
    clerkOrgId: context.value.clerkOrgId,
    organisationId: context.value.organisationId,
  });
  if (!result.ok) {
    return result;
  }
  revalidateFeedPaths(result.value.feedId, { includeSettings: true });
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
  const parsed = UpdateFeedActionSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error.issues[0]?.message);
  }
  const context = await resolveAdminContext(parsed.data.organisationId);
  if (!context.ok) {
    return context;
  }
  const result = await updateFeed({
    ...parsed.data,
    actingRole: context.value.role,
    actingUserId: context.value.userId,
    clerkOrgId: context.value.clerkOrgId,
    organisationId: context.value.organisationId,
  });
  if (!result.ok) {
    return result;
  }
  revalidateFeedPaths(parsed.data.feedId, { includeSettings: true });
  return { ok: true, value: { feedId: parsed.data.feedId } };
}

export async function pauseFeedAction(
  input: FeedCommandActionInput
): Promise<FeedActionResult<{ feedId: string }>> {
  return await command(input, pauseFeed);
}

export async function resumeFeedAction(
  input: FeedCommandActionInput
): Promise<FeedActionResult<{ feedId: string }>> {
  return await command(input, resumeFeed);
}

export async function archiveFeedAction(
  input: FeedCommandActionInput
): Promise<FeedActionResult<{ feedId: string }>> {
  return await command(input, archiveFeed);
}

export async function restoreFeedAction(
  input: FeedCommandActionInput
): Promise<FeedActionResult<{ feedId: string }>> {
  return await command(input, restoreFeed);
}

export async function issueTokenAction(
  input: FeedCommandActionInput
): Promise<FeedActionResult<{ subscribeUrl: string; tokenId: string }>> {
  const parsed = FeedCommandActionSchema.safeParse(input);
  if (!parsed.success) {
    return validationError("Invalid feed");
  }
  const context = await resolveAdminContext(parsed.data.organisationId);
  if (!context.ok) {
    return context;
  }
  const result = await issueToken({
    ...parsed.data,
    actingRole: context.value.role,
    actingUserId: context.value.userId,
    clerkOrgId: context.value.clerkOrgId,
    organisationId: context.value.organisationId,
  });
  if (!result.ok) {
    return result;
  }
  revalidateFeedPaths(parsed.data.feedId);
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
  const parsed = FeedCommandActionSchema.safeParse(input);
  if (!parsed.success) {
    return validationError("Invalid feed");
  }
  const context = await resolveAdminContext(parsed.data.organisationId);
  if (!context.ok) {
    return context;
  }
  const result = await rotateToken({
    ...parsed.data,
    actingRole: context.value.role,
    actingUserId: context.value.userId,
    clerkOrgId: context.value.clerkOrgId,
    organisationId: context.value.organisationId,
  });
  if (!result.ok) {
    return result;
  }
  revalidateFeedPaths(parsed.data.feedId);

  // Fetch feed name cheaply to include in notification body
  let feedName: string | null = null;
  try {
    const feed = await database.feed.findFirst({
      select: { name: true },
      where: {
        // Both tenant keys: one Clerk Organisation can own several Organisation
        // rows (one per Xero file), so clerk_org_id alone spans payroll entities.
        clerk_org_id: context.value.clerkOrgId,
        id: parsed.data.feedId,
        organisation_id: context.value.organisationId,
      },
    });
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
    const dispatchResult = await dispatchNotification({
      actionUrl,
      actorUserId: context.value.userId,
      body,
      clerkOrgId: context.value.clerkOrgId,
      objectId: parsed.data.feedId,
      objectType: "feed",
      organisationId: context.value.organisationId,
      recipientPersonId: null,
      recipientUserId: context.value.userId,
      title: "Feed token rotated",
      type: "feed_token_rotated",
    });

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
  const parsed = RevokeTokenActionSchema.safeParse(input);
  if (!parsed.success) {
    return validationError("Invalid token");
  }
  const context = await resolveAdminContext(parsed.data.organisationId);
  if (!context.ok) {
    return context;
  }
  const result = await revokeToken({
    ...parsed.data,
    actingRole: context.value.role,
    actingUserId: context.value.userId,
    clerkOrgId: context.value.clerkOrgId,
    organisationId: context.value.organisationId,
  });
  if (!result.ok) {
    return result;
  }
  revalidateFeedPaths(result.value.feedId);
  return { ok: true, value: { feedId: result.value.feedId } };
}

async function command(
  input: FeedCommandActionInput,
  service: (input: unknown) => Promise<Result<unknown, FeedServiceError>>
): Promise<FeedActionResult<{ feedId: string }>> {
  const parsed = FeedCommandActionSchema.safeParse(input);
  if (!parsed.success) {
    return validationError("Invalid feed");
  }
  const context = await resolveAdminContext(parsed.data.organisationId);
  if (!context.ok) {
    return context;
  }
  const result = await service({
    ...parsed.data,
    actingRole: context.value.role,
    actingUserId: context.value.userId,
    clerkOrgId: context.value.clerkOrgId,
    organisationId: context.value.organisationId,
  });
  if (!result.ok) {
    return result;
  }
  revalidateFeedPaths(parsed.data.feedId, { includeSettings: true });
  return { ok: true, value: { feedId: parsed.data.feedId } };
}

async function resolveAdminContext(organisationId: string): Promise<
  FeedActionResult<{
    clerkOrgId: string;
    organisationId: string;
    role: string;
    userId: string;
  }>
> {
  const [{ orgRole }, user, context] = await Promise.all([
    auth(),
    currentUser(),
    getActiveOrgContext(organisationId),
  ]);
  const role = normaliseRole(orgRole);
  if (
    !(
      user &&
      (role === "admin" ||
        role === "owner" ||
        role === "org:admin" ||
        role === "org:owner")
    )
  ) {
    return {
      error: {
        code: "not_authorised",
        message: "You do not have permission to manage feeds.",
      },
      ok: false,
    };
  }
  if (!context.ok) {
    return {
      error: { code: "not_authorised", message: context.error.message },
      ok: false,
    };
  }
  return {
    ok: true,
    value: {
      clerkOrgId: context.value.clerkOrgId,
      organisationId: context.value.organisationId,
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
