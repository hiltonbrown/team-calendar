import "server-only";

import {
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import type { Result } from "@repo/core";
import { database } from "@repo/database";
import type { Prisma } from "@repo/database/generated/client";
import { log } from "@repo/observability/log";
import { z } from "zod";
import { invalidateFeedCache } from "../cache/feed-cache";
import { scopedFeed } from "../scope/scoped-feed";

export type FeedActorRole =
  | "admin"
  | "manager"
  | "owner"
  | "viewer"
  | `org:${string}`;

export type TokenServiceError =
  | { code: "active_token_conflict"; message: string }
  | { code: "feed_not_found"; message: string }
  | { code: "initial_token_exists"; message: string }
  | { code: "not_authorised"; message: string }
  | { code: "token_not_found"; message: string }
  | { code: "unknown_error"; message: string }
  | { code: "validation_error"; message: string };

export interface TokenDisclosure {
  hint: string;
  plaintext: string;
  tokenId: string;
}

export interface TokenHistoryItem {
  createdAt: Date;
  id: string;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  rotatedFromTokenId: string | null;
  status: "active" | "expired" | "revoked";
}

export interface ActiveTokenHint {
  createdAt: Date;
  hint: string;
  lastUsedAt: Date | null;
  tokenId: string;
}

const BaseTokenInputSchema = z.object({
  actingUserId: z.string().min(1),
  clerkOrgId: z.string().min(1),
  feedId: z.string().uuid(),
  organisationId: z.string().uuid(),
});

const InitialTokenInputSchema = BaseTokenInputSchema;
const RotateTokenInputSchema = BaseTokenInputSchema.extend({
  actingRole: z.string().min(1),
});
const RevokeTokenInputSchema = z.object({
  actingRole: z.string().min(1),
  actingUserId: z.string().min(1),
  clerkOrgId: z.string().min(1),
  organisationId: z.string().uuid(),
  tokenId: z.string().uuid(),
});

type InitialTokenInput = z.infer<typeof InitialTokenInputSchema>;

const SIGNED_TOKEN_PREFIX = "tc1";
const SIGNED_TOKEN_CONTEXT = "team-calendar-feed-token";
const SIGNED_TOKEN_PARTS = 3;
const TokenIdSchema = z.string().uuid();

export const generateFeedTokenSecret = (): string =>
  randomBytes(30).toString("base64url");

export const hashFeedToken = (plaintext: string): string =>
  createHash("sha256").update(plaintext).digest("hex");

/**
 * Builds the bearer token shown in subscribe URLs from values already held on
 * the token row. The database still stores no plaintext bearer credential.
 * Revocation remains row-based, and legacy random tokens continue to resolve
 * through their persisted SHA-256 hash.
 */
export function createSignedFeedToken(input: {
  tokenHash: string;
  tokenId: string;
}): string {
  const signature = createHmac("sha256", Buffer.from(input.tokenHash, "hex"))
    .update(`${SIGNED_TOKEN_CONTEXT}:${input.tokenId}`)
    .digest("base64url");
  return `${SIGNED_TOKEN_PREFIX}.${input.tokenId}.${signature}`;
}

export function signedFeedTokenId(token: string): string | null {
  const [prefix, tokenId, signature, ...extra] = token.split(".");
  if (
    prefix !== SIGNED_TOKEN_PREFIX ||
    extra.length > 0 ||
    !signature ||
    !TokenIdSchema.safeParse(tokenId).success
  ) {
    return null;
  }
  return tokenId ?? null;
}

export function verifySignedFeedToken(input: {
  token: string;
  tokenHash: string;
  tokenId: string;
}): boolean {
  const parts = input.token.split(".");
  if (
    parts.length !== SIGNED_TOKEN_PARTS ||
    signedFeedTokenId(input.token) !== input.tokenId
  ) {
    return false;
  }
  const [, , provided] = parts;
  if (!provided) {
    return false;
  }
  const [, , expected] = createSignedFeedToken(input).split(".");
  if (!expected) {
    return false;
  }
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  return (
    providedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(providedBuffer, expectedBuffer)
  );
}

export async function createInitialTokenWithClient(
  tx: Prisma.TransactionClient,
  input: InitialTokenInput
): Promise<Result<TokenDisclosure, TokenServiceError>> {
  const feed = await tx.feed.findFirst({
    select: { id: true },
    where: scopedFeed(input),
  });
  if (!feed) {
    return await feedNotFound(tx, input);
  }

  const existing = await tx.feedToken.findFirst({
    select: { id: true },
    where: {
      clerk_org_id: input.clerkOrgId,
      feed_id: input.feedId,
      organisation_id: input.organisationId,
    },
  });
  if (existing) {
    return {
      error: {
        code: "initial_token_exists",
        message: "This feed already has a token.",
      },
      ok: false,
    };
  }

  const tokenId = randomUUID();
  const tokenHash = hashFeedToken(generateFeedTokenSecret());
  const plaintext = createSignedFeedToken({ tokenHash, tokenId });
  const hint = plaintext.slice(-4);
  const token = await insertActiveToken(tx, {
    clerkOrgId: input.clerkOrgId,
    feedId: input.feedId,
    hint,
    organisationId: input.organisationId,
    rotatedFromTokenId: null,
    tokenHash,
    tokenId,
  });
  if (!token) {
    return {
      error: {
        code: "initial_token_exists",
        message: "This feed already has an active token.",
      },
      ok: false,
    };
  }

  await auditToken(tx, input, "feeds.token_created", token.id, {
    actingUserId: input.actingUserId,
    feedId: input.feedId,
    hint,
    tokenId: token.id,
  });

  return { ok: true, value: { hint, plaintext, tokenId: token.id } };
}

export async function rotateToken(
  input: unknown
): Promise<
  Result<TokenDisclosure & { previousTokenId: string }, TokenServiceError>
> {
  const parsed = RotateTokenInputSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error);
  }
  if (!isAdminOrOwner(parsed.data.actingRole)) {
    return notAuthorised();
  }

  try {
    const result = await database.$transaction(async (tx) => {
      const feed = await tx.feed.findFirst({
        select: { id: true },
        where: scopedFeed(parsed.data),
      });
      if (!feed) {
        return await feedNotFound(tx, parsed.data);
      }

      const activeTokens = await tx.feedToken.findMany({
        orderBy: { created_at: "desc" },
        select: { id: true },
        where: {
          clerk_org_id: parsed.data.clerkOrgId,
          feed_id: parsed.data.feedId,
          organisation_id: parsed.data.organisationId,
          status: "active",
        },
      });
      const [previousToken] = activeTokens;
      if (!previousToken) {
        return {
          error: {
            code: "token_not_found",
            message: "This feed has no active token to rotate.",
          },
          ok: false,
        } satisfies Result<never, TokenServiceError>;
      }

      await tx.feedToken.updateMany({
        data: { revoked_at: new Date(), status: "revoked" },
        where: {
          clerk_org_id: parsed.data.clerkOrgId,
          feed_id: parsed.data.feedId,
          organisation_id: parsed.data.organisationId,
          status: "active",
        },
      });

      const tokenId = randomUUID();
      const tokenHash = hashFeedToken(generateFeedTokenSecret());
      const plaintext = createSignedFeedToken({ tokenHash, tokenId });
      const hint = plaintext.slice(-4);
      const token = await insertActiveToken(tx, {
        clerkOrgId: parsed.data.clerkOrgId,
        feedId: parsed.data.feedId,
        hint,
        organisationId: parsed.data.organisationId,
        rotatedFromTokenId: previousToken.id,
        tokenHash,
        tokenId,
      });
      if (!token) {
        return activeTokenConflict();
      }

      await auditToken(tx, parsed.data, "feeds.token_rotated", token.id, {
        actingUserId: parsed.data.actingUserId,
        feedId: parsed.data.feedId,
        newHint: hint,
        newTokenId: token.id,
        previousTokenId: previousToken.id,
      });

      return {
        ok: true,
        value: {
          hint,
          plaintext,
          previousTokenId: previousToken.id,
          tokenId: token.id,
        },
      } satisfies Result<
        TokenDisclosure & { previousTokenId: string },
        TokenServiceError
      >;
    });

    if (result.ok) {
      await invalidateFeedCache({ feedId: parsed.data.feedId });
    }
    return result;
  } catch {
    return unknownError("Failed to rotate feed token.");
  }
}

async function insertActiveToken(
  tx: Prisma.TransactionClient,
  input: {
    clerkOrgId: string;
    feedId: string;
    hint: string;
    organisationId: string;
    rotatedFromTokenId: string | null;
    tokenHash: string;
    tokenId: string;
  }
): Promise<{ id: string } | null> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    INSERT INTO "feed_tokens" (
      "id",
      "clerk_org_id",
      "organisation_id",
      "feed_id",
      "token_hash",
      "token_hint",
      "status",
      "rotated_from_token_id",
      "created_at",
      "updated_at"
    )
    VALUES (
      ${input.tokenId}::uuid,
      ${input.clerkOrgId},
      ${input.organisationId}::uuid,
      ${input.feedId}::uuid,
      ${input.tokenHash},
      ${input.hint},
      'active'::feed_token_status,
      ${input.rotatedFromTokenId}::uuid,
      NOW(),
      NOW()
    )
    ON CONFLICT ("feed_id") WHERE "status" = 'active'
    DO NOTHING
    RETURNING "id"
  `;
  return rows[0] ?? null;
}

function activeTokenConflict(): Result<never, TokenServiceError> {
  return {
    error: {
      code: "active_token_conflict",
      message: "The feed token changed during rotation. Refresh and try again.",
    },
    ok: false,
  };
}

export async function revokeToken(
  input: unknown
): Promise<Result<{ feedId: string; tokenId: string }, TokenServiceError>> {
  const parsed = RevokeTokenInputSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error);
  }
  if (!isAdminOrOwner(parsed.data.actingRole)) {
    return notAuthorised();
  }

  try {
    const result = await database.$transaction(async (tx) => {
      const token = await tx.feedToken.findFirst({
        select: { feed_id: true, id: true, status: true, token_hint: true },
        where: {
          clerk_org_id: parsed.data.clerkOrgId,
          id: parsed.data.tokenId,
          organisation_id: parsed.data.organisationId,
        },
      });
      if (!token) {
        return await tokenNotFound(tx, parsed.data);
      }

      if (token.status !== "revoked") {
        await tx.feedToken.update({
          data: { revoked_at: new Date(), status: "revoked" },
          where: { id: token.id },
        });
      }

      await auditToken(tx, parsed.data, "feeds.token_revoked", token.id, {
        actingUserId: parsed.data.actingUserId,
        feedId: token.feed_id,
        hint: token.token_hint,
        tokenId: token.id,
      });

      return {
        ok: true,
        value: { feedId: token.feed_id, tokenId: token.id },
      } satisfies Result<
        { feedId: string; tokenId: string },
        TokenServiceError
      >;
    });

    if (result.ok) {
      await invalidateFeedCache({ feedId: result.value.feedId });
    }
    return result;
  } catch {
    return unknownError("Failed to revoke feed token.");
  }
}

export async function revokeAllFeedTokens(input: {
  clerkOrgId: string;
  organisationId: string;
}): Promise<Result<{ revokedCount: number }, TokenServiceError>> {
  try {
    const result = await database.feedToken.updateMany({
      data: { revoked_at: new Date(), status: "revoked" },
      where: {
        clerk_org_id: input.clerkOrgId,
        organisation_id: input.organisationId,
        status: "active",
      },
    });
    const feeds = await database.feed.findMany({
      select: { id: true },
      where: {
        clerk_org_id: input.clerkOrgId,
        organisation_id: input.organisationId,
      },
    });
    await Promise.all(
      feeds.map((feed) => invalidateFeedCache({ feedId: feed.id }))
    );
    return { ok: true, value: { revokedCount: result.count } };
  } catch {
    return unknownError("Failed to revoke feed tokens.");
  }
}

async function feedNotFound(
  client: Prisma.TransactionClient,
  input: { clerkOrgId: string; feedId: string; organisationId: string }
): Promise<Result<never, TokenServiceError>> {
  const exists = await client.feed.findFirst({
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

async function tokenNotFound(
  tx: Prisma.TransactionClient,
  input: { clerkOrgId: string; organisationId: string; tokenId: string }
): Promise<Result<never, TokenServiceError>> {
  const exists = await tx.feedToken.findFirst({
    select: { clerk_org_id: true, organisation_id: true },
    where: { id: input.tokenId },
  });
  if (
    exists &&
    (exists.clerk_org_id !== input.clerkOrgId ||
      exists.organisation_id !== input.organisationId)
  ) {
    log.error("Cross-tenant resource access attempt", {
      actingClerkOrgId: input.clerkOrgId,
      actingOrganisationId: input.organisationId,
      resourceId: input.tokenId,
      resourceType: "feed_token",
    });
  }
  return {
    error: { code: "token_not_found", message: "Token not found." },
    ok: false,
  };
}

function auditToken(
  tx: Prisma.TransactionClient,
  input: { actingUserId: string; clerkOrgId: string; organisationId: string },
  action: string,
  tokenId: string,
  payload: Record<string, string | number | boolean | null>
) {
  return tx.auditEvent.create({
    data: {
      action,
      actor_user_id: input.actingUserId,
      clerk_org_id: input.clerkOrgId,
      organisation_id: input.organisationId,
      payload,
      resource_id: tokenId,
      resource_type: "feed_token",
    },
  });
}

function isAdminOrOwner(role: string): boolean {
  return (
    role === "admin" ||
    role === "owner" ||
    role === "org:admin" ||
    role === "org:owner"
  );
}

function notAuthorised(): Result<never, TokenServiceError> {
  return {
    error: {
      code: "not_authorised",
      message: "You do not have permission to manage feed tokens.",
    },
    ok: false,
  };
}

function validationError(error: z.ZodError): Result<never, TokenServiceError> {
  return {
    error: {
      code: "validation_error",
      message: error.issues[0]?.message ?? "Invalid token request.",
    },
    ok: false,
  };
}

function unknownError(message: string): Result<never, TokenServiceError> {
  return { error: { code: "unknown_error", message }, ok: false };
}
