import "server-only";

import type { Result } from "@repo/core";
import { resolveAccountCompanies, tenantTransaction } from "@repo/database";
import { z } from "zod";
import {
  type PreviewEvent,
  projectFeedEvents,
} from "../projection/feed-projection";
import { isFeedOwner } from "../scope/feed-ownership";
import {
  canViewFeed,
  isAdminOrOwner,
  normaliseRole,
} from "../scope/feed-scope";
import { scopedFeed } from "../scope/scoped-feed";

export type PreviewServiceError =
  | { code: "feed_not_found"; message: string }
  | { code: "invalid_scope"; message: string }
  | { code: "not_authorised"; message: string }
  | { code: "unknown_error"; message: string }
  | { code: "validation_error"; message: string };

const PreviewFeedSchema = z.object({
  actingPersonId: z.string().uuid().nullable().optional(),
  actingRole: z.string().min(1),
  actingUserId: z.string().min(1),
  clerkOrgId: z.string().min(1),
  feedId: z.string().uuid(),
  horizonDays: z.number().int().min(1).max(90).default(30),
  organisationId: z.string().uuid().nullable(),
  privacyMode: z.enum(["named", "masked", "private"]).optional(),
});

export async function previewFeed(
  input: unknown
): Promise<Result<PreviewEvent[], PreviewServiceError>> {
  const parsed = PreviewFeedSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error);
  }

  try {
    return await tenantTransaction(parsed.data.clerkOrgId, async (client) => {
      const role = normaliseRole(parsed.data.actingRole);
      const feed = await client.feed.findFirst({
        select: {
          created_by_user_id: true,
          organisation_id: true,
          privacy_mode: true,
          scopes: {
            select: {
              scope_type: true,
              scope_value: true,
            },
          },
        },
        where: scopedFeed(parsed.data),
      });
      if (!feed) {
        return feedNotFound();
      }

      const actingPerson = await client.person.findFirst({
        select: { id: true },
        where: {
          archived_at: null,
          clerk_org_id: parsed.data.clerkOrgId,
          clerk_user_id: parsed.data.actingUserId,
          is_active: true,
          organisation_id: parsed.data.organisationId ?? {
            in: (
              await resolveAccountCompanies(parsed.data.clerkOrgId, client)
            ).map((company) => company.id),
          },
        },
      });
      const actingPersonId = actingPerson?.id ?? null;

      const requestedPrivacy = parsed.data.privacyMode ?? feed.privacy_mode;
      const ownsFeed = isFeedOwner(
        {
          createdByUserId: feed.created_by_user_id,
          scopes: feed.scopes.map((scope) => ({ scopeType: scope.scope_type })),
        },
        parsed.data.actingUserId
      );
      if (
        !(isAdminOrOwner(role) || ownsFeed) &&
        requestedPrivacy !== feed.privacy_mode
      ) {
        return notAuthorised();
      }

      const visible = await canViewFeed({
        actingPersonId,
        clerkOrgId: parsed.data.clerkOrgId,
        client,
        createdByUserId: feed.created_by_user_id,
        organisationId: feed.organisation_id,
        role,
        scopes: feed.scopes.map((scope) => ({
          scopeType: scope.scope_type,
          scopeValue: scope.scope_value,
        })),
      });
      if (!visible.ok) {
        return { error: visible.error, ok: false };
      }
      if (!visible.value) {
        return notAuthorised();
      }

      const result = await projectFeedEvents({
        actingPersonId,
        actingRole: role,
        clerkOrgId: parsed.data.clerkOrgId,
        client,
        feedId: parsed.data.feedId,
        horizonDays: parsed.data.horizonDays,
        organisationId: feed.organisation_id,
        privacyMode: requestedPrivacy,
      });
      if (!result.ok) {
        return { error: result.error, ok: false };
      }
      return result;
    });
  } catch {
    return {
      error: {
        code: "unknown_error",
        message: "Failed to load feed preview.",
      },
      ok: false,
    };
  }
}

function feedNotFound(): Result<never, PreviewServiceError> {
  return {
    error: { code: "feed_not_found", message: "Feed not found." },
    ok: false,
  };
}

function notAuthorised(): Result<never, PreviewServiceError> {
  return {
    error: {
      code: "not_authorised",
      message: "You do not have permission to preview this feed.",
    },
    ok: false,
  };
}

function validationError(
  error: z.ZodError
): Result<never, PreviewServiceError> {
  return {
    error: {
      code: "validation_error",
      message: error.issues[0]?.message ?? "Invalid preview request.",
    },
    ok: false,
  };
}
