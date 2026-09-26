import { randomUUID } from "node:crypto";
import { appError, type Result } from "@repo/core";
import { z } from "zod";
import type { XeroCredentialOwner } from "../../generated/client";
import { database } from "../client";
import {
  matchesXeroCredentialIdentitySnapshot,
  type XeroCredentialIdentitySnapshot,
  xeroCredentialIdentitySnapshotSchema,
} from "../xero-credential-identity-artifact";

const credentialEnvelopeSchema = z.object({
  access_token_auth_tag: z.string().min(1),
  access_token_encrypted: z.string().min(1),
  access_token_iv: z.string().min(1),
  refresh_token_auth_tag: z.string().min(1),
  refresh_token_encrypted: z.string().min(1),
  refresh_token_iv: z.string().min(1),
});

/** Credentials are system infrastructure; access is always resolved through a scoped binding. */
export async function findXeroCredentialOwnerForBinding(input: {
  clerkOrgId: string;
  organisationId: string;
}): Promise<Result<XeroCredentialOwner | null>> {
  try {
    const binding = await database.xeroTenant.findFirst({
      select: { credential_owner: true },
      where: {
        active_slot: 1,
        clerk_org_id: input.clerkOrgId,
        organisation_id: input.organisationId,
        xero_connection: {
          disconnected_at: null,
          revoked_at: null,
          status: { in: ["active", "stale"] },
        },
      },
    });
    return { ok: true, value: binding?.credential_owner ?? null };
  } catch {
    return {
      error: appError("internal", "Could not load Xero credentials"),
      ok: false,
    };
  }
}

/** System recovery enumeration returns routing IDs only, never recovery tokens. */
export async function listRecoverableXeroRefreshAttempts(input: {
  now: Date;
  limit?: number;
}): Promise<Result<{ attemptId: string; ownerId: string }[]>> {
  try {
    const attempts = await database.xeroRefreshAttempt.findMany({
      orderBy: [{ created_at: "asc" }, { id: "asc" }],
      select: { id: true, xero_credential_owner_id: true },
      take: Math.min(Math.max(input.limit ?? 100, 1), 1000),
      where: {
        OR: [
          {
            created_at: { lt: new Date(input.now.getTime() - 120_000) },
            outcome: "pending",
          },
          { outcome: "lost_response" },
        ],
      },
    });
    return {
      ok: true,
      value: attempts.map((attempt) => ({
        attemptId: attempt.id,
        ownerId: attempt.xero_credential_owner_id,
      })),
    };
  } catch {
    return {
      error: appError(
        "internal",
        "Could not list Xero refresh recovery attempts"
      ),
      ok: false,
    };
  }
}

/** Apply only the exact credential snapshot whose authoriser JWT was verified during planning. */
export async function applyVerifiedXeroCredentialOwnerAttachment(
  input: {
    identity: XeroCredentialIdentitySnapshot;
    identityGroup: readonly XeroCredentialIdentitySnapshot[];
    providerAppId: string;
  },
  deps: { createOwnerId?: () => string } = {}
): Promise<Result<{ attached: boolean }>> {
  const parsed = xeroCredentialIdentitySnapshotSchema.safeParse(input.identity);
  const identity = parsed.success ? parsed.data : null;
  const xeroUserId = identity?.xeroUserId;
  const rejected = (): Result<never> => ({
    error: appError(
      "conflict",
      "Verified credential snapshot changed; regenerate the identity plan."
    ),
    ok: false,
  });
  if (
    !(identity && xeroUserId) ||
    identity.providerAppId !== input.providerAppId ||
    !input.identityGroup.some(
      (entry) =>
        entry.tenantId === identity.tenantId &&
        entry.credentialFingerprint === identity.credentialFingerprint
    ) ||
    input.identityGroup.some(
      (entry) =>
        !xeroCredentialIdentitySnapshotSchema.safeParse(entry).success ||
        entry.providerAppId !== input.providerAppId ||
        entry.xeroUserId !== xeroUserId
    )
  ) {
    return rejected();
  }
  try {
    return await database.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT set_config('lock_timeout', '5000ms', true)`;
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`xero-owner:${input.providerAppId}:${xeroUserId}`}, 0))::text AS acquired`;
        const existingOwner = await tx.xeroCredentialOwner.findUnique({
          where: {
            provider_app_id_xero_user_id: {
              provider_app_id: input.providerAppId,
              xero_user_id: xeroUserId,
            },
          },
        });
        const ownerId =
          existingOwner?.id ?? (deps.createOwnerId ?? randomUUID)();
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`xero-owner:${ownerId}`}, 0))::text AS acquired`;
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`xero-binding:${identity.tenantId}`}, 0))::text AS acquired`;
        const scope = {
          clerk_org_id: identity.clerkOrgId,
          organisation_id: identity.organisationId,
        };
        const binding = await tx.xeroTenant.findFirst({
          where: {
            ...scope,
            id: identity.tenantId,
            provider_app_id: input.providerAppId,
          },
        });
        if (
          binding?.active_slot !== 1 ||
          binding.retired_at ||
          binding.xero_credential_owner_id
        ) {
          return rejected();
        }
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${identity.connectionId}, 0))::text AS acquired`;
        const connection = await tx.xeroConnection.findFirst({
          where: { ...scope, id: identity.connectionId },
        });
        if (
          !(connection && ["active", "stale"].includes(connection.status)) ||
          connection.disconnected_at ||
          connection.revoked_at ||
          !matchesXeroCredentialIdentitySnapshot(identity, {
            ...binding,
            xero_connection: connection,
          })
        ) {
          return rejected();
        }
        const groupSize = await tx.xeroTenant.count({
          where: {
            active_slot: 1,
            OR: input.identityGroup.map((entry) => ({
              clerk_org_id: entry.clerkOrgId,
              id: entry.tenantId,
              organisation_id: entry.organisationId,
            })),
            provider_app_id: input.providerAppId,
          },
        });
        const envelope = credentialEnvelopeSchema.safeParse(connection);
        if (groupSize !== 1 || !envelope.success) {
          return rejected();
        }
        const owner = await tx.xeroCredentialOwner.upsert({
          create: {
            ...envelope.data,
            granted_scopes: [],
            granted_scopes_known: false,
            id: ownerId,
            identity_evidence: "legacy_access_token_jwt",
            last_verified_at: new Date(),
            provider_app_id: input.providerAppId,
            token_expires_at: connection.expires_at,
            token_key_version: connection.token_key_version,
            usability: "usable",
            xero_user_id: xeroUserId,
          },
          update: {},
          where: {
            provider_app_id_xero_user_id: {
              provider_app_id: input.providerAppId,
              xero_user_id: xeroUserId,
            },
          },
        });
        if (owner.id !== ownerId) {
          throw new Error("Credential owner changed during backfill.");
        }
        await tx.xeroTenant.update({
          data: { xero_credential_owner_id: owner.id },
          where: {
            ...scope,
            binding_generation: identity.bindingGeneration,
            id: binding.id,
            xero_credential_owner_id: null,
          },
        });
        await tx.xeroConnection.update({
          data: {
            access_token_auth_tag: owner.access_token_auth_tag,
            access_token_encrypted: owner.access_token_encrypted,
            access_token_iv: owner.access_token_iv,
            expires_at: owner.token_expires_at,
            last_refreshed_at:
              owner.last_rotated_at ?? connection.last_refreshed_at,
            refresh_token_auth_tag: owner.refresh_token_auth_tag,
            refresh_token_encrypted: owner.refresh_token_encrypted,
            refresh_token_iv: owner.refresh_token_iv,
            token_encrypted_at: new Date(),
            token_key_version: owner.token_key_version,
          },
          where: { ...scope, id: connection.id },
        });
        return { ok: true, value: { attached: true } };
      },
      { timeout: 10_000 }
    );
  } catch {
    return {
      error: appError(
        "internal",
        "Could not apply the verified credential snapshot."
      ),
      ok: false,
    };
  }
}
