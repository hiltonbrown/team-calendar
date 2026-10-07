import { saveXeroAuthorisation } from "@repo/database/queries/xero-authorisation";

const SCOPE_SEPARATOR = /\s+/;

import "server-only";
import type { Result } from "@repo/core";
import {
  database,
  lockXeroAuthorisation,
  withXeroGrantLock,
} from "@repo/database";
import type {
  Prisma,
  XeroAuthorisation,
} from "@repo/database/generated/client";
import { getScopedXeroConnection } from "@repo/database/queries/xero-connections";
import { keys } from "../../keys";
import { decryptXeroToken, encryptXeroToken } from "../crypto/tokens";
import type { XeroDeadline } from "../rate-limit/deadline";
import { verifyXeroAccessTokenIdentity } from "./identity";
import {
  exchangeToken,
  TOKEN_REFRESH_BUFFER_MS,
  type XeroOAuthError,
} from "./service";

export function authorisationAccessToken(grant: XeroAuthorisation): string {
  return decryptXeroToken({
    authTag: grant.access_token_auth_tag,
    encrypted: grant.access_token_encrypted,
    iv: grant.access_token_iv,
    keyVersion: grant.token_key_version,
  });
}
function encryptedTokens(accessToken: string, refreshToken: string) {
  const access = encryptXeroToken(accessToken);
  const refresh = encryptXeroToken(refreshToken);
  return {
    access_token_auth_tag: access.authTag,
    access_token_encrypted: access.encrypted,
    access_token_iv: access.iv,
    refresh_token_auth_tag: refresh.authTag,
    refresh_token_encrypted: refresh.encrypted,
    refresh_token_iv: refresh.iv,
    token_encrypted_at: access.encryptedAt,
    token_key_version: access.keyVersion,
  };
}
export async function adoptXeroAuthorisation(
  input: { accessToken: string; refreshToken: string; scopes?: string },
  tx: Prisma.TransactionClient
): Promise<Result<XeroAuthorisation, XeroOAuthError>> {
  const verified = await verifyXeroAccessTokenIdentity(input.accessToken);
  if (!verified.ok) {
    return {
      error: {
        code: "invalid_token_response",
        message: verified.error.message,
      },
      ok: false,
    };
  }
  const providerAppId = keys().XERO_CLIENT_ID ?? "";
  await lockXeroAuthorisation(tx, providerAppId, verified.value.xeroUserId);
  const data = {
    ...encryptedTokens(input.accessToken, input.refreshToken),
    access_token_expires_at: verified.value.expiresAt,
    granted_scopes:
      input.scopes?.split(SCOPE_SEPARATOR).filter(Boolean) ??
      verified.value.grantedScopes,
    last_refresh_error_at: null,
    last_refresh_error_code: null,
    last_refreshed_at: new Date(),
    status: "active" as const,
  };
  const identity = {
    provider_app_id: providerAppId,
    xero_user_id: verified.value.xeroUserId,
  };
  const authorisation = await saveXeroAuthorisation(
    { ...identity, ...data },
    tx
  );
  return { ok: true, value: authorisation };
}
export async function refreshXeroAuthorisation(input: {
  authorisationId: string;
  deadline: XeroDeadline;
  forceRefresh?: boolean;
  previousAccessToken?: string;
}): Promise<Result<XeroAuthorisation, XeroOAuthError>> {
  try {
    const initial = await database.xeroAuthorisation.findUnique({
      where: { id: input.authorisationId },
    });
    if (!initial) {
      return {
        error: { code: "connection_inactive", message: "Reconnect Xero." },
        ok: false,
      };
    }
    return await withXeroGrantLock(
      {
        deadlineAt: input.deadline.expiresAtMs,
        mode: "refresh",
        providerAppId: initial.provider_app_id,
        xeroUserId: initial.xero_user_id,
      },
      async (tx) => {
        const current = await tx.xeroAuthorisation.findUniqueOrThrow({
          where: { id: initial.id },
        });
        if (current.status !== "active") {
          return {
            error: {
              code: "refresh_token_invalid",
              message: "Reconnect Xero.",
            },
            ok: false,
          };
        }
        const replaced =
          input.previousAccessToken &&
          authorisationAccessToken(current) !== input.previousAccessToken;
        if (
          replaced ||
          (!input.forceRefresh &&
            current.access_token_expires_at.getTime() >
              Date.now() + TOKEN_REFRESH_BUFFER_MS)
        ) {
          return { ok: true, value: current };
        }
        const refreshToken = decryptXeroToken({
          authTag: current.refresh_token_auth_tag,
          encrypted: current.refresh_token_encrypted,
          iv: current.refresh_token_iv,
          keyVersion: current.token_key_version,
        });
        const rotated = await exchangeToken({
          deadline: input.deadline,
          grantType: "refresh_token",
          rateClass: { kind: "token", providerAppId: current.provider_app_id },
          refreshToken,
        });
        if (!rotated.ok) {
          await tx.xeroAuthorisation.update({
            data: {
              last_refresh_error_at: new Date(),
              last_refresh_error_code: rotated.error.code,
              ...(rotated.error.code === "refresh_token_invalid"
                ? { status: "reconnect_required" }
                : {}),
            },
            where: { id: current.id },
          });
          return rotated;
        }
        const identity = await verifyXeroAccessTokenIdentity(
          rotated.value.access_token
        );
        if (
          !identity.ok ||
          identity.value.xeroUserId !== current.xero_user_id
        ) {
          return {
            error: {
              code: "invalid_token_response",
              message: "Xero returned an invalid authorisation.",
            },
            ok: false,
          };
        }
        const updated = await tx.xeroAuthorisation.update({
          data: {
            ...encryptedTokens(
              rotated.value.access_token,
              rotated.value.refresh_token
            ),
            access_token_expires_at: identity.value.expiresAt,
            granted_scopes:
              rotated.value.scope?.split(SCOPE_SEPARATOR).filter(Boolean) ??
              identity.value.grantedScopes,
            last_refresh_error_at: null,
            last_refresh_error_code: null,
            last_refreshed_at: new Date(),
          },
          where: { id: current.id },
        });
        return { ok: true, value: updated };
      }
    );
  } catch {
    return {
      error: {
        code: "unknown_error",
        message: "Xero authorisation could not be refreshed. Try again.",
      },
      ok: false,
    };
  }
}
export interface XeroAccessError {
  code: string;
  message: string;
  retryAfterMs?: number;
}
export async function resolveXeroAccess(input: {
  clerkOrgId: string;
  organisationId: string;
  connectionId?: string;
  deadline: XeroDeadline;
  capability?: string | readonly string[];
  forceRefresh?: boolean;
  previousAccessToken?: string;
}): Promise<
  Result<
    {
      accessToken: string;
      connectionId: string;
      xeroTenantId: string;
      payrollRegion: "AU" | "NZ" | "UK";
      deadline: XeroDeadline;
    },
    XeroAccessError
  >
> {
  const scoped = await getScopedXeroConnection(input);
  if (!scoped.ok) {
    return scoped;
  }
  const connection = scoped.value;
  if (connection.status === "disconnected" || !connection.authorisation) {
    return {
      error: { code: "disconnected", message: "Reconnect Xero." },
      ok: false,
    };
  }
  if (
    connection.status !== "active" ||
    connection.authorisation.status !== "active"
  ) {
    return {
      error: { code: "reauthorisation_required", message: "Reconnect Xero." },
      ok: false,
    };
  }
  const grant = await refreshXeroAuthorisation({
    authorisationId: connection.authorisation.id,
    deadline: input.deadline,
    forceRefresh: input.forceRefresh,
    previousAccessToken: input.previousAccessToken,
  });
  if (!grant.ok) {
    return grant;
  }
  const required =
    typeof input.capability === "string"
      ? [input.capability]
      : (input.capability ?? []);
  if (
    required.length &&
    !required.some((scope) => grant.value.granted_scopes.includes(scope))
  ) {
    return {
      error: {
        code: "permissions_required",
        message: "Update Xero permissions.",
      },
      ok: false,
    };
  }
  const current = await getScopedXeroConnection(input);
  if (
    !current.ok ||
    current.value.id !== connection.id ||
    current.value.status !== "active" ||
    current.value.xero_authorisation_id !== grant.value.id
  ) {
    return {
      error: {
        code: "connection_changed",
        message: "The Xero connection changed. Try again.",
      },
      ok: false,
    };
  }
  return {
    ok: true,
    value: {
      accessToken: authorisationAccessToken(grant.value),
      connectionId: connection.id,
      deadline: input.deadline,
      payrollRegion: connection.payroll_region,
      xeroTenantId: connection.xero_tenant_id,
    },
  };
}
