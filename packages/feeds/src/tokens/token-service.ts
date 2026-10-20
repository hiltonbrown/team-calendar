import "server-only";

import {
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import type { Result } from "@repo/core";
import {
  afterTenantCommit,
  assertTenantDb,
  resolveAccountCompanies,
  type TenantDb,
} from "@repo/database";
import { z } from "zod";
import { invalidateFeedCache } from "../cache/feed-cache";
import { isFeedOwner } from "../scope/feed-ownership";
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
  organisationId: z.string().uuid().nullable(),
});

const InitialTokenInputSchema = BaseTokenInputSchema;
const RotateTokenInputSchema = BaseTokenInputSchema.extend({
  actingRole: z.string().min(1),
});
const RevokeTokenInputSchema = z.object({
  actingRole: z.string().min(1),
  actingUserId: z.string().min(1),
  clerkOrgId: z.string().min(1),
  organisationId: z.string().uuid().nullable(),
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
  tx: TenantDb,
  input: InitialTokenInput
): Promise<Result<TokenDisclosure, TokenServiceError>> {
  assertTenantDb(tx, input.clerkOrgId);
  const feed = await tx.feed.findFirst({
    select: { id: true, organisation_id: true },
    where: scopedFeed(input),
  });
  if (!feed) {
    return feedNotFound();
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
        message: "This feed already has an active token.",
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
    organisationId: feed.organisation_id,
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

export async function issueToken(
  input: unknown,
  db: TenantDb
): Promise<Result<TokenDisclosure, TokenServiceError>> {
  const parsed = RotateTokenInputSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error);
  }
  assertTenantDb(db, parsed.data.clerkOrgId);
  if (!isAdminOrOwner(parsed.data.actingRole)) {
    return notAuthorised();
  }
  const run = async (tenantDb4: TenantDb): ReturnType<typeof issueToken> =>
    await (async (tx: TenantDb) => {
      await lockFeedForTokenChange(tx, parsed.data);
      const feed = await tx.feed.findFirst({
        select: { id: true, organisation_id: true },
        where: {
          ...scopedFeed(parsed.data),
          archived_at: null,
          status: { in: ["active", "paused"] },
        },
      });
      if (!feed) {
        return feedNotFound();
      }
      const tokenId = randomUUID();
      const tokenHash = hashFeedToken(generateFeedTokenSecret());
      const plaintext = createSignedFeedToken({ tokenHash, tokenId });
      const hint = plaintext.slice(-4);
      const token = await insertActiveToken(tx, {
        clerkOrgId: parsed.data.clerkOrgId,
        feedId: parsed.data.feedId,
        hint,
        organisationId: feed.organisation_id,
        rotatedFromTokenId: null,
        tokenHash,
        tokenId,
      });
      if (!token) {
        return activeTokenConflict();
      }
      await auditToken(tx, parsed.data, "feeds.token_created", token.id, {
        actingUserId: parsed.data.actingUserId,
        feedId: parsed.data.feedId,
        hint,
        tokenId: token.id,
      });
      return { ok: true, value: { hint, plaintext, tokenId: token.id } };
    })(tenantDb4);
  return await (async () => {
    assertTenantDb(db, parsed.data.clerkOrgId);
    return await run(db);
  })();
}

class FeedTokenRotationConflict extends Error {}

export async function rotateToken(
  input: unknown,
  db: TenantDb
): Promise<
  Result<TokenDisclosure & { previousTokenId: string }, TokenServiceError>
> {
  const parsed = RotateTokenInputSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error);
  }
  assertTenantDb(db, parsed.data.clerkOrgId);
  const run = async (tenantDb2: TenantDb): ReturnType<typeof rotateToken> => {
    const isAdmin = isAdminOrOwner(parsed.data.actingRole);

    const result = await (async (tx: TenantDb) => {
      await lockFeedForTokenChange(tx, parsed.data);
      const feed = await tx.feed.findFirst({
        select: {
          created_by_user_id: true,
          id: true,
          organisation_id: true,
          scopes: { select: { scope_type: true } },
        },
        where: {
          ...scopedFeed(parsed.data),
          archived_at: null,
          status: { in: ["active", "paused"] },
        },
      });
      if (!feed) {
        return feedNotFound();
      }
      // Owners of a personal or team feed may rotate its URL themselves.
      if (
        !(
          isAdmin ||
          isFeedOwner(
            {
              createdByUserId: feed.created_by_user_id,
              scopes: feed.scopes.map((scope) => ({
                scopeType: scope.scope_type,
              })),
            },
            parsed.data.actingUserId
          )
        )
      ) {
        return notAuthorised();
      }

      const activeTokens = await tx.feedToken.findMany({
        orderBy: { created_at: "desc" },
        select: { id: true },
        where: {
          clerk_org_id: parsed.data.clerkOrgId,
          feed_id: parsed.data.feedId,
          ...(parsed.data.organisationId === null
            ? { organisation_id: null }
            : {
                OR: [
                  { organisation_id: parsed.data.organisationId },
                  { organisation_id: null },
                ],
              }),
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
          ...(parsed.data.organisationId === null
            ? { organisation_id: null }
            : {
                OR: [
                  { organisation_id: parsed.data.organisationId },
                  { organisation_id: null },
                ],
              }),
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
        organisationId: feed.organisation_id,
        rotatedFromTokenId: previousToken.id,
        tokenHash,
        tokenId,
      });
      if (!token) {
        // Roll back revocations as well as the unsuccessful replacement.
        throw new FeedTokenRotationConflict();
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
    })(tenantDb2);

    if (result.ok) {
      scheduleFeedInvalidation(tenantDb2, { feedId: parsed.data.feedId });
    }
    return result;
  };
  try {
    return await (async () => {
      assertTenantDb(db, parsed.data.clerkOrgId);
      return await run(db);
    })();
  } catch (error) {
    if (error instanceof FeedTokenRotationConflict) {
      // The owning withTenantResult rolls back the revocations before returning this Result.
      return activeTokenConflict();
    }
    throw error;
  }
}

async function lockFeedForTokenChange(
  tx: TenantDb,
  input: InitialTokenInput
): Promise<void> {
  // Lifecycle writes also lock this row, so archive cannot finish before a delayed issuance.
  await tx.$queryRaw`
    SELECT "id" FROM "feeds"
    WHERE "id" = ${input.feedId}::uuid
      AND "clerk_org_id" = ${input.clerkOrgId}
      AND ("organisation_id" IS NOT DISTINCT FROM ${input.organisationId}::uuid OR "organisation_id" IS NULL)
    FOR UPDATE
  `;
}

async function insertActiveToken(
  tx: TenantDb,
  input: {
    clerkOrgId: string;
    feedId: string;
    hint: string;
    organisationId: string | null;
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
  input: unknown,
  db: TenantDb
): Promise<Result<{ feedId: string; tokenId: string }, TokenServiceError>> {
  const parsed = RevokeTokenInputSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error);
  }
  assertTenantDb(db, parsed.data.clerkOrgId);
  const run = async (tenantDb3: TenantDb): ReturnType<typeof revokeToken> => {
    if (!isAdminOrOwner(parsed.data.actingRole)) {
      return notAuthorised();
    }

    const result = await (async (tx: TenantDb) => {
      const token = await tx.feedToken.findFirst({
        select: { feed_id: true, id: true, status: true, token_hint: true },
        where: {
          clerk_org_id: parsed.data.clerkOrgId,
          id: parsed.data.tokenId,
          ...(parsed.data.organisationId === null
            ? { organisation_id: null }
            : {
                OR: [
                  { organisation_id: parsed.data.organisationId },
                  { organisation_id: null },
                ],
              }),
        },
      });
      if (!token) {
        return tokenNotFound();
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
    })(tenantDb3);

    if (result.ok) {
      scheduleFeedInvalidation(tenantDb3, { feedId: result.value.feedId });
    }
    return result;
  };
  return await (async () => {
    assertTenantDb(db, parsed.data.clerkOrgId);
    return await run(db);
  })();
}

export async function revokeAllFeedTokens(
  input: {
    clerkOrgId: string;
    organisationId: string | null;
  },
  db: TenantDb
): Promise<Result<{ revokedCount: number }, TokenServiceError>> {
  assertTenantDb(db, input.clerkOrgId);
  const run = async (
    tenantDb: TenantDb
  ): ReturnType<typeof revokeAllFeedTokens> => {
    const result = await tenantDb.feedToken.updateMany({
      data: { revoked_at: new Date(), status: "revoked" },
      where: {
        clerk_org_id: input.clerkOrgId,
        organisation_id: input.organisationId,
        status: "active",
      },
    });
    const feeds = await tenantDb.feed.findMany({
      select: { id: true },
      where: {
        clerk_org_id: input.clerkOrgId,
        organisation_id: input.organisationId,
      },
    });
    for (const feed of feeds) {
      scheduleFeedInvalidation(tenantDb, { feedId: feed.id });
    }
    return { ok: true, value: { revokedCount: result.count } };
  };
  return await (async () => {
    assertTenantDb(db, input.clerkOrgId);
    return await run(db);
  })();
}

function feedNotFound(): Result<never, TokenServiceError> {
  return {
    error: { code: "feed_not_found", message: "Feed not found." },
    ok: false,
  };
}

function tokenNotFound(): Result<never, TokenServiceError> {
  return {
    error: { code: "token_not_found", message: "Token not found." },
    ok: false,
  };
}

async function auditToken(
  tx: TenantDb,
  input: {
    actingUserId: string;
    clerkOrgId: string;
    organisationId: string | null;
  },
  action: string,
  tokenId: string,
  payload: Record<string, string | number | boolean | null>
) {
  const organisationId =
    input.organisationId ??
    (await resolveAccountCompanies(input.clerkOrgId, tx))[0]?.id;
  if (!organisationId) {
    throw new Error("Feed audit requires an active owned company.");
  }
  return tx.auditEvent.create({
    data: {
      action,
      actor_user_id: input.actingUserId,
      clerk_org_id: input.clerkOrgId,
      organisation_id: organisationId,
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
