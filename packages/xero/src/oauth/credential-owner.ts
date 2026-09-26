import { randomUUID } from "node:crypto";
import type { Result } from "@repo/core";
import { database } from "@repo/database";
import type {
  Prisma,
  XeroCredentialOwner,
  XeroRefreshAttempt,
} from "@repo/database/generated/client";
import { keys } from "../../keys";
import { decryptXeroToken, encryptXeroToken } from "../crypto/tokens";
import {
  createXeroDeadline,
  remainingMs,
  type XeroDeadline,
} from "../rate-limit/deadline";
import { XERO_TOKEN_OPERATION_BUDGET_MS } from "../rate-limit/limits";
import { verifyXeroAccessTokenIdentity } from "./identity";
import {
  boundXeroLocks,
  lockXeroBinding,
  lockXeroConnection,
  lockXeroOwner,
} from "./locks";
import {
  ensureFreshXeroConnection,
  exchangeToken,
  type XeroOAuthError,
} from "./service";

const SCOPE_SEPARATOR = /\s+/;

export function ownerMirror(owner: XeroCredentialOwner) {
  return {
    access_token_auth_tag: owner.access_token_auth_tag,
    access_token_encrypted: owner.access_token_encrypted,
    access_token_iv: owner.access_token_iv,
    expires_at: owner.token_expires_at,
    last_refreshed_at:
      owner.last_rotated_at ?? owner.last_adopted_at ?? owner.created_at,
    refresh_token_auth_tag: owner.refresh_token_auth_tag,
    refresh_token_encrypted: owner.refresh_token_encrypted,
    refresh_token_iv: owner.refresh_token_iv,
    token_encrypted_at:
      owner.last_rotated_at ?? owner.last_adopted_at ?? owner.created_at,
    token_key_version: owner.token_key_version,
  };
}
export async function mirrorXeroOwner(
  tx: Prisma.TransactionClient,
  owner: XeroCredentialOwner
) {
  const tenants = await tx.xeroTenant.findMany({
    orderBy: { id: "asc" },
    select: { id: true, xero_connection_id: true },
    where: { active_slot: 1, xero_credential_owner_id: owner.id },
  });
  for (const tenant of tenants) {
    await lockXeroBinding(tx, tenant.id);
  }
  const ids = tenants.map((tenant) => tenant.xero_connection_id).sort();
  for (const id of ids) {
    await lockXeroConnection(tx, id);
  }
  await tx.xeroConnection.updateMany({
    data: ownerMirror(owner),
    where: {
      disconnected_at: null,
      id: { in: ids },
      revoked_at: null,
      status: { in: ["active", "stale"] },
      xero_tenant: { active_slot: 1, xero_credential_owner_id: owner.id },
    },
  });
}
const scrub = {
  recovery_key_version: null,
  recovery_token_auth_tag: null,
  recovery_token_encrypted: null,
  recovery_token_iv: null,
};
function failure(
  code: XeroOAuthError["code"] = "unknown_error"
): Result<never, XeroOAuthError> {
  return {
    error: {
      code,
      message:
        "Xero credentials could not be refreshed. Try again or reconnect Xero.",
    },
    ok: false,
  };
}
export async function refreshXeroCredentialOwner(input: {
  ownerId: string;
  expectedTokenVersion: number;
  deadline: XeroDeadline;
  recoveryAttemptId?: string;
}): Promise<Result<XeroCredentialOwner, XeroOAuthError>> {
  const attemptId = input.recoveryAttemptId ?? randomUUID();
  try {
    if (!input.recoveryAttemptId) {
      await database.$transaction(
        async (tx) => {
          await boundXeroLocks(tx, input.deadline);
          await lockXeroOwner(tx, input.ownerId);
          const owner = await tx.xeroCredentialOwner.findUniqueOrThrow({
            where: { id: input.ownerId },
          });
          await tx.xeroRefreshAttempt.create({
            data: {
              dispatched_at: new Date(),
              expected_token_version: input.expectedTokenVersion,
              id: attemptId,
              recovery_key_version: owner.token_key_version,
              recovery_token_auth_tag: owner.refresh_token_auth_tag,
              recovery_token_encrypted: owner.refresh_token_encrypted,
              recovery_token_iv: owner.refresh_token_iv,
              xero_credential_owner_id: owner.id,
            },
          });
        },
        { timeout: Math.max(1, remainingMs(input.deadline)) }
      );
    }
    return await database.$transaction(
      async (tx) => {
        await boundXeroLocks(tx, input.deadline);
        await lockXeroOwner(tx, input.ownerId);
        const owner = await tx.xeroCredentialOwner.findUniqueOrThrow({
          where: { id: input.ownerId },
        });
        const attempt = await tx.xeroRefreshAttempt.findUniqueOrThrow({
          where: { id: attemptId },
        });
        const existing = await validateRefreshAttempt(
          tx,
          owner,
          attempt,
          input
        );
        if (existing) {
          return existing;
        }
        const token = decryptXeroToken({
          authTag:
            attempt.recovery_token_auth_tag ?? owner.refresh_token_auth_tag,
          encrypted:
            attempt.recovery_token_encrypted ?? owner.refresh_token_encrypted,
          iv: attempt.recovery_token_iv ?? owner.refresh_token_iv,
          keyVersion: attempt.recovery_key_version ?? owner.token_key_version,
        });
        const exchanged = await exchangeToken({
          deadline: input.deadline,
          grantType: "refresh_token",
          rateClass: {
            kind: "token",
            providerAppId: keys().XERO_CLIENT_ID ?? "",
          },
          refreshToken: token,
        });
        if (!exchanged.ok) {
          await recordExchangeFailure(tx, owner, attempt, exchanged.error);
          return exchanged;
        }
        const identity = await verifyXeroAccessTokenIdentity(
          exchanged.value.access_token
        );
        if (!identity.ok || identity.value.xeroUserId !== owner.xero_user_id) {
          const uncertain = attempt.uncertain_since ?? new Date();
          await tx.xeroRefreshAttempt.update({
            data: {
              outcome: "lost_response",
              recovery_deadline:
                attempt.recovery_deadline ??
                new Date(uncertain.getTime() + 30 * 60_000),
              uncertain_since: uncertain,
            },
            where: { id: attemptId },
          });
          return failure("invalid_token_response");
        }
        const access = encryptXeroToken(exchanged.value.access_token);
        const refresh = encryptXeroToken(exchanged.value.refresh_token);
        const updated = await tx.xeroCredentialOwner.update({
          data: {
            access_token_auth_tag: access.authTag,
            access_token_encrypted: access.encrypted,
            access_token_iv: access.iv,
            last_refresh_attempt_id: attemptId,
            last_rotated_at: new Date(),
            last_verified_at: new Date(),
            refresh_token_auth_tag: refresh.authTag,
            refresh_token_encrypted: refresh.encrypted,
            refresh_token_iv: refresh.iv,
            token_expires_at: identity.value.expiresAt,
            token_key_version: access.keyVersion,
            token_version: { increment: 1 },
            ...(exchanged.value.scope === undefined
              ? {}
              : {
                  granted_scopes: exchanged.value.scope
                    .split(SCOPE_SEPARATOR)
                    .filter(Boolean),
                  granted_scopes_known: true,
                }),
          },
          where: { id: owner.id },
        });
        await mirrorXeroOwner(tx, updated);
        await tx.xeroRefreshAttempt.update({
          data: { ...scrub, outcome: "committed" },
          where: { id: attemptId },
        });
        return { ok: true, value: updated };
      },
      { timeout: Math.max(1, remainingMs(input.deadline)) }
    );
  } catch {
    try {
      const reconciliationDeadline = createXeroDeadline(
        Math.min(remainingMs(input.deadline), 2000)
      );
      const recovered = await database.$transaction(
        async (tx) => {
          await boundXeroLocks(tx, reconciliationDeadline);
          await lockXeroOwner(tx, input.ownerId);
          const owner = await tx.xeroCredentialOwner.findUnique({
            where: { id: input.ownerId },
          });
          const attempt = await tx.xeroRefreshAttempt.findUnique({
            where: { id: attemptId },
          });
          if (!(owner && attempt)) {
            return null;
          }
          if (
            owner.last_refresh_attempt_id === attemptId &&
            owner.token_version === input.expectedTokenVersion + 1
          ) {
            return owner;
          }
          if (owner.token_version > input.expectedTokenVersion) {
            await tx.xeroRefreshAttempt.updateMany({
              data: { ...scrub, outcome: "superseded" },
              where: {
                id: attemptId,
                outcome: { in: ["pending", "lost_response"] },
              },
            });
            return null;
          }
          const uncertain = attempt.uncertain_since ?? new Date();
          await tx.xeroRefreshAttempt.updateMany({
            data: {
              outcome: "lost_response",
              recovery_deadline:
                attempt.recovery_deadline ??
                new Date(uncertain.getTime() + 30 * 60_000),
              uncertain_since: uncertain,
            },
            where: { id: attemptId, outcome: "pending" },
          });
          return null;
        },
        { timeout: Math.max(1, remainingMs(reconciliationDeadline)) }
      );
      if (recovered) {
        return { ok: true, value: recovered };
      }
    } catch {
      /* The durable pending attempt remains visible to recovery. */
    }
    return failure();
  }
}

export async function adoptXeroCredential(input: {
  accessToken: string;
  refreshToken: string;
  scopes?: string;
  deadline: XeroDeadline;
}): Promise<Result<XeroCredentialOwner, XeroOAuthError>> {
  const identity = await verifyXeroAccessTokenIdentity(input.accessToken);
  if (!identity.ok) {
    return failure("invalid_token_response");
  }
  const providerAppId = keys().XERO_CLIENT_ID;
  if (!providerAppId) {
    return failure("oauth_not_configured");
  }
  const access = encryptXeroToken(input.accessToken);
  const refresh = encryptXeroToken(input.refreshToken);
  const data = {
    access_token_auth_tag: access.authTag,
    access_token_encrypted: access.encrypted,
    access_token_iv: access.iv,
    last_adopted_at: new Date(),
    last_verified_at: new Date(),
    refresh_token_auth_tag: refresh.authTag,
    refresh_token_encrypted: refresh.encrypted,
    refresh_token_iv: refresh.iv,
    token_expires_at: identity.value.expiresAt,
    token_key_version: access.keyVersion,
    usability: "usable" as const,
    ...(input.scopes === undefined
      ? {}
      : {
          granted_scopes: input.scopes.split(SCOPE_SEPARATOR).filter(Boolean),
          granted_scopes_known: true,
        }),
  };
  return database.$transaction(
    async (tx) => {
      await boundXeroLocks(tx, input.deadline);
      // The natural identity lock also serialises first creation before an owner UUID exists.
      await lockXeroOwner(tx, `${providerAppId}:${identity.value.xeroUserId}`);
      let owner = await tx.xeroCredentialOwner.findUnique({
        where: {
          provider_app_id_xero_user_id: {
            provider_app_id: providerAppId,
            xero_user_id: identity.value.xeroUserId,
          },
        },
      });
      if (owner) {
        await lockXeroOwner(tx, owner.id);
        owner = await tx.xeroCredentialOwner.findUniqueOrThrow({
          where: { id: owner.id },
        });
        if (
          owner.usability !== "usable" ||
          identity.value.expiresAt > owner.token_expires_at
        ) {
          owner = await tx.xeroCredentialOwner.update({
            data: {
              ...data,
              last_refresh_attempt_id: null,
              token_version: { increment: 1 },
            },
            where: { id: owner.id },
          });
          await mirrorXeroOwner(tx, owner);
        }
      } else {
        owner = await tx.xeroCredentialOwner.create({
          data: {
            ...data,
            granted_scopes:
              input.scopes?.split(SCOPE_SEPARATOR).filter(Boolean) ?? [],
            granted_scopes_known: input.scopes !== undefined,
            identity_evidence: "access_token_jwt",
            provider_app_id: providerAppId,
            xero_user_id: identity.value.xeroUserId,
          },
        });
      }
      return { ok: true, value: owner };
    },
    { timeout: Math.max(1, remainingMs(input.deadline)) }
  );
}

export interface XeroAccessError {
  code:
    | "not_connected"
    | "disconnected"
    | "generation_changed"
    | "reauthorisation_required"
    | "capability_missing"
    | "configuration_error";
  message: string;
}
export async function resolveXeroAccess(input: {
  clerkOrgId: string;
  organisationId: string;
  expectedBindingGeneration?: number;
  capability?: string;
  deadline: XeroDeadline;
}): Promise<
  Result<
    {
      accessToken: string;
      xeroTenantId: string;
      payrollRegion: "AU" | "NZ" | "UK";
      bindingGeneration: number;
      tokenVersion: number | null;
    },
    XeroAccessError
  >
> {
  const error = (
    code: XeroAccessError["code"]
  ): Result<never, XeroAccessError> => ({
    error: {
      code,
      message: "Xero access is unavailable for this payroll entity.",
    },
    ok: false,
  });
  try {
    const tenant = await database.xeroTenant.findFirst({
      include: { credential_owner: true, xero_connection: true },
      where: {
        clerk_org_id: input.clerkOrgId,
        organisation_id: input.organisationId,
      },
    });
    if (!tenant) {
      return error("not_connected");
    }
    const connection = tenant.xero_connection;
    if (
      tenant.retired_at ||
      tenant.active_slot !== 1 ||
      connection.disconnected_at ||
      connection.revoked_at ||
      !["active", "stale"].includes(connection.status)
    ) {
      return error("disconnected");
    }
    if (
      input.expectedBindingGeneration !== undefined &&
      input.expectedBindingGeneration !== tenant.binding_generation
    ) {
      return error("generation_changed");
    }
    let owner = tenant.credential_owner;
    let accessToken: string;
    if (owner) {
      const resolved = await resolveOwnerToken(owner, input);
      if (!resolved.ok) {
        return resolved;
      }
      ({ owner, accessToken } = resolved.value);
    } else {
      const fresh = await ensureFreshXeroConnection({
        clerkOrgId: input.clerkOrgId,
        connectionId: connection.id,
        deadline: input.deadline,
        organisationId: input.organisationId,
      });
      if (!fresh.ok) {
        return error("reauthorisation_required");
      }
      const current = await database.xeroConnection.findUniqueOrThrow({
        where: { id: connection.id },
      });
      accessToken = decryptXeroToken({
        authTag: current.access_token_auth_tag,
        encrypted: current.access_token_encrypted,
        iv: current.access_token_iv,
        keyVersion: current.token_key_version,
      });
    }
    // Re-check the binding after refresh, including disconnects racing the owner operation.
    const live = await database.xeroTenant.findFirst({
      where: {
        active_slot: 1,
        binding_generation: tenant.binding_generation,
        clerk_org_id: input.clerkOrgId,
        id: tenant.id,
        organisation_id: input.organisationId,
        retired_at: null,
        xero_connection: {
          disconnected_at: null,
          revoked_at: null,
          status: { in: ["active", "stale"] },
        },
      },
    });
    if (!live) {
      return error("generation_changed");
    }
    return {
      ok: true,
      value: {
        accessToken,
        bindingGeneration: tenant.binding_generation,
        payrollRegion: tenant.payroll_region,
        tokenVersion: owner?.token_version ?? null,
        xeroTenantId: tenant.xero_tenant_id,
      },
    };
  } catch {
    return error("configuration_error");
  }
}

export async function recoverXeroRefreshAttempts(input: { now: Date }) {
  const attempts = await database.xeroRefreshAttempt.findMany({
    orderBy: { id: "asc" },
    take: 100,
    where: {
      OR: [
        {
          created_at: { lt: new Date(input.now.getTime() - 2 * 60_000) },
          outcome: "pending",
        },
        { outcome: "lost_response" },
      ],
    },
  });
  for (const attempt of attempts) {
    const deadline = createXeroDeadline(XERO_TOKEN_OPERATION_BUDGET_MS);
    const retry = await database.$transaction(
      async (tx) => {
        await boundXeroLocks(tx, deadline);
        await lockXeroOwner(tx, attempt.xero_credential_owner_id);
        const current = await tx.xeroRefreshAttempt.findUniqueOrThrow({
          where: { id: attempt.id },
        });
        const owner = await tx.xeroCredentialOwner.findUniqueOrThrow({
          where: { id: attempt.xero_credential_owner_id },
        });
        if (!["pending", "lost_response"].includes(current.outcome)) {
          return false;
        }
        if (owner.token_version > attempt.expected_token_version) {
          await tx.xeroRefreshAttempt.update({
            data: {
              ...scrub,
              outcome:
                owner.last_refresh_attempt_id === attempt.id &&
                owner.token_version === attempt.expected_token_version + 1
                  ? "committed"
                  : "superseded",
            },
            where: { id: attempt.id },
          });
          return false;
        }
        const since =
          current.uncertain_since ??
          current.dispatched_at ??
          current.created_at;
        const until =
          current.recovery_deadline ?? new Date(since.getTime() + 30 * 60_000);
        if (until <= input.now) {
          await tx.xeroRefreshAttempt.update({
            data: { ...scrub, outcome: "failed" },
            where: { id: attempt.id },
          });
          await tx.xeroCredentialOwner.updateMany({
            data: { usability: "reauthorisation_required" },
            where: {
              id: owner.id,
              token_version: attempt.expected_token_version,
            },
          });
          return false;
        }
        await tx.xeroRefreshAttempt.update({
          data: {
            outcome: "lost_response",
            recovery_deadline: until,
            uncertain_since: since,
          },
          where: { id: attempt.id },
        });
        return true;
      },
      { timeout: Math.max(1, remainingMs(deadline)) }
    );
    if (retry) {
      await refreshXeroCredentialOwner({
        deadline,
        expectedTokenVersion: attempt.expected_token_version,
        ownerId: attempt.xero_credential_owner_id,
        recoveryAttemptId: attempt.id,
      });
    }
  }
  return { recovered: attempts.length };
}

async function recordExchangeFailure(
  tx: Prisma.TransactionClient,
  owner: XeroCredentialOwner,
  attempt: XeroRefreshAttempt,
  error: XeroOAuthError
) {
  if (error.code === "refresh_token_invalid") {
    await tx.xeroCredentialOwner.update({
      data: { usability: "reauthorisation_required" },
      where: { id: owner.id },
    });
  }
  const uncertain = attempt.uncertain_since ?? new Date();
  const ambiguous = error.dispatched || error.code === "invalid_token_response";
  await tx.xeroRefreshAttempt.update({
    data: ambiguous
      ? {
          outcome: "lost_response",
          recovery_deadline:
            attempt.recovery_deadline ??
            new Date(uncertain.getTime() + 30 * 60_000),
          uncertain_since: uncertain,
        }
      : { ...scrub, outcome: "failed" },
    where: { id: attempt.id },
  });
}

async function resolveOwnerToken(
  initialOwner: XeroCredentialOwner,
  input: { capability?: string; deadline: XeroDeadline }
): Promise<
  Result<{ owner: XeroCredentialOwner; accessToken: string }, XeroAccessError>
> {
  let owner = initialOwner;
  const error = (
    code: XeroAccessError["code"]
  ): Result<never, XeroAccessError> => ({
    error: {
      code,
      message: "Xero access is unavailable for this payroll entity.",
    },
    ok: false,
  });

  if (owner.usability !== "usable") {
    return error("reauthorisation_required");
  }
  if (owner.token_expires_at.getTime() <= Date.now() + 5 * 60_000) {
    const refreshed = await refreshXeroCredentialOwner({
      deadline: input.deadline,
      expectedTokenVersion: owner.token_version,
      ownerId: owner.id,
    });
    if (!refreshed.ok) {
      return error(
        refreshed.error.code === "refresh_token_invalid"
          ? "reauthorisation_required"
          : "configuration_error"
      );
    }
    owner = refreshed.value;
  }
  if (
    input.capability &&
    owner.granted_scopes_known &&
    !owner.granted_scopes.includes(input.capability)
  ) {
    return error("capability_missing");
  }
  const accessToken = decryptXeroToken({
    authTag: owner.access_token_auth_tag,
    encrypted: owner.access_token_encrypted,
    iv: owner.access_token_iv,
    keyVersion: owner.token_key_version,
  });
  return { ok: true, value: { accessToken, owner } };
}

async function validateRefreshAttempt(
  tx: Prisma.TransactionClient,
  owner: XeroCredentialOwner,
  attempt: XeroRefreshAttempt,
  input: { expectedTokenVersion: number; recoveryAttemptId?: string }
): Promise<Result<XeroCredentialOwner, XeroOAuthError> | null> {
  if (
    attempt.xero_credential_owner_id !== owner.id ||
    attempt.expected_token_version !== input.expectedTokenVersion
  ) {
    return failure();
  }
  if (owner.token_version > input.expectedTokenVersion) {
    await tx.xeroRefreshAttempt.update({
      data: {
        ...scrub,
        outcome:
          owner.last_refresh_attempt_id === attempt.id &&
          owner.token_version === input.expectedTokenVersion + 1
            ? "committed"
            : "superseded",
      },
      where: { id: attempt.id },
    });
    return { ok: true, value: owner };
  }
  if (
    owner.token_version !== input.expectedTokenVersion ||
    owner.usability !== "usable"
  ) {
    return failure("refresh_token_invalid");
  }
  if (
    input.recoveryAttemptId &&
    (attempt.outcome !== "lost_response" ||
      !attempt.recovery_deadline ||
      attempt.recovery_deadline <= new Date())
  ) {
    return failure();
  }

  return null;
}
